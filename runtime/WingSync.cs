using System.Net;
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace Lightflow.Runtime;

public record WingDevice(string Name, string Model, string Firmware);
public record WingProbeRequest(int Version, string Address);
public record WingBinding(int Bank, string Kind, int Index, string Label);
public record WingPlanRequest(int Version, string Address, string ProfileId, int[] Banks, WingBinding[] Bindings);
public record WingApplyRequest(int Version, string PlanId, bool Confirm);
public record WingSlotChange(int Bank, string Kind, int Index, string Label, Dictionary<string, object> Before, Dictionary<string, object> After);
public record WingPlan(int Version, string PlanId, string Address, WingDevice Device, DateTimeOffset ExpiresAt, WingSlotChange[] Changes, string[] Warnings);
public record WingApplyResult(int Version, string State, int VerifiedSlots, int TotalSlots, string? Error, WingSlotChange[] Backup);
public sealed class WingConflictException(string message) : Exception(message);

public sealed class WingSync(Func<IPAddress, IWingTransport>? transportFactory = null, Func<DateTimeOffset>? clock = null)
{
    readonly Func<IPAddress, IWingTransport> connect = transportFactory ?? (address => new WingUdpTransport(address));
    readonly Func<DateTimeOffset> now = clock ?? (() => DateTimeOffset.UtcNow);
    readonly SemaphoreSlim gate = new(1);
    WingPlan? pending;
    string? pendingIdentity;
    public static IPAddress ValidateAddress(string address) {
        if (address is null || address.Length > 15 || !Regex.IsMatch(address, @"^\d{1,3}(\.\d{1,3}){3}$") || !IPAddress.TryParse(address, out var ip) || ip.ToString() != address) throw new ArgumentException("Geef een geldig privé IPv4-adres op zonder voorloopnullen.");
        var b = ip.GetAddressBytes();
        if (b.Length != 4 || !(b[0] == 10 || b[0] == 172 && b[1] is >= 16 and <= 31 || b[0] == 192 && b[1] == 168) || b[3] is 0 or 255)
            throw new ArgumentException("Gebruik een privé unicast IPv4-adres; geen netwerk- of broadcastadres.");
        return ip;
    }
    public static string SlotPath(int bank, string kind, int index) => $"/$ctl/user/{bank}/{(kind == "rotary" ? index : (index - 1) % 4 + 1)}/{(kind == "rotary" ? "enc" : index <= 4 ? "bu" : "bd")}";
    public static Dictionary<string, object> Desired(WingBinding binding) {
        var result = new Dictionary<string, object> {
        ["mode"] = binding.Kind == "button" ? "MIDINP" : "MIDICC",
        ["name"] = NormalizeLabel(binding.Label), ["ch"] = binding.Bank,
        [binding.Kind == "button" ? "note" : "cc"] = binding.Index - 1,
        };
        if (binding.Kind == "button") result["val"] = 127;
        return result;
    }
    static string NormalizeLabel(string label) {
        var ascii = new string(label.Normalize(NormalizationForm.FormD).Where(c => c is >= ' ' and <= '~' && c is not ('|' or '*')).ToArray()).Trim();
        return ascii.Length > 16 ? ascii[..16] : ascii.Length == 0 ? "Lightlab" : ascii;
    }
    static async Task<(WingDevice Device, string Raw)> Identity(IWingTransport transport, CancellationToken ct) {
        var values = await transport.ReadAsync("/?", ct);
        if (values.Length != 1 || values[0] is not string text || text.Length > 512) throw new IOException("Onbekende WING-identiteit.");
        var fields = text.Split(',');
        if (fields.Length < 6 || fields[0] != "WING") throw new IOException("Het apparaat antwoordt niet als WING.");
        return (new(fields[2], fields[3], fields[5]), text);
    }
    static object Scalar(object[] values, string? field = null, string? mode = null) {
        // Our MIDI modes' /ch is displayed and SET as 1-based, but its sfi GET index is
        // 0-based: the real desk returns ["12", 0.73333335f, 11]. Only this
        // channel field is converted; note, cc and val retain their 0..127 range.
        if (field == "ch" && mode is "MIDINP" or "MIDICC" && values.Length == 3 && values[0] is string display && values[1] is float && values[2] is int index) {
            if (!int.TryParse(display, NumberStyles.None, CultureInfo.InvariantCulture, out var channel)
                || channel is < 1 or > 16 || index != channel - 1)
                throw new IOException("Ongeldige WING-kanaalwaarde.");
            return channel;
        }
        // WING numeric leaves may include display string, normalized float and native integer (sfi).
        if (values.Length == 3 && values[0] is string && values[1] is float && values[2] is int) return values[2];
        if (values.Length == 3 && values[0] is string && values[1] is float && values[2] is float) return values[2];
        if (values.Length == 2 && values[0] is string && values[1] is float) return values[1];
        if (values.Length == 1 && values[0] is string or int or float) return values[0];
        throw new IOException("Onbekende WING-bankwaarde.");
    }
    static async Task<Dictionary<string, object>> ReadSlot(IWingTransport transport, string path, CancellationToken ct) {
        var children = await transport.ReadAsync(path, ct);
        if (children.Length is < 2 or > 24 || children.Any(c => c is not string)) throw new IOException("Onbekende WING-bankstructuur.");
        if (!children.Contains("mode")) throw new IOException("WING-bank mist modus.");
        var mode = Scalar(await transport.ReadAsync(path + "/mode", ct)) as string
            ?? throw new IOException("WING-bank mist modus.");
        if (mode.Length > 256) throw new IOException("Onbekende WING-bankwaarde.");
        var result = new Dictionary<string, object>();
        foreach (var child in children.Cast<string>()) {
            if (child.StartsWith('$')) continue;
            if (!Regex.IsMatch(child, "^[a-zA-Z][a-zA-Z0-9]{0,15}$") || result.ContainsKey(child)) throw new IOException("Onbekend WING-bankveld.");
            if (child == "mode") { result.Add(child, mode); continue; }
            var values = await transport.ReadAsync(path + "/" + child, ct);
            var value = Scalar(values, child, mode);
            if (value is string text && text.Length > 256) throw new IOException("Onbekende WING-bankwaarde.");
            result.Add(child, value);
        }
        if (!result.TryGetValue("name", out var name) || name is not string) throw new IOException("WING-bank mist modus of naam.");
        return result;
    }
    static bool Equal(Dictionary<string, object> left, Dictionary<string, object> right) => left.Count == right.Count && left.All(pair => right.TryGetValue(pair.Key, out var value) && Equals(pair.Value, value));
    async Task<T> Exclusive<T>(Func<CancellationToken, Task<T>> action, CancellationToken ct) {
        if (!await gate.WaitAsync(0, ct)) throw new WingConflictException("Er is al een WING-opdracht bezig.");
        try { using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct); timeout.CancelAfter(TimeSpan.FromSeconds(90)); if (pending?.ExpiresAt <= now()) { pending = null; pendingIdentity = null; } return await action(timeout.Token); }
        finally { gate.Release(); }
    }
    public Task<object> ProbeAsync(WingProbeRequest request, CancellationToken ct) => Exclusive<object>(async token => {
        if (request.Version != 1) throw new ArgumentException("Ongeldige WING-aanvraagversie.");
        using var transport = connect(ValidateAddress(request.Address));
        return new { version = 1, address = request.Address, device = (await Identity(transport, token)).Device };
    }, ct);
    public Task<WingPlan> PlanAsync(WingPlanRequest request, CancellationToken ct) => Exclusive(async token => {
        // A failed replacement preview must not leave an older confirmation usable.
        pending = null; pendingIdentity = null;
        if (request.Version != 1 || request.ProfileId is not ("wing-full" or "wing-rack") || request.Banks is not { Length: > 0 and <= 16 } || request.Banks.Any(b => b is < 1 or > 16) || request.Banks.Distinct().Count() != request.Banks.Length || request.Bindings is not { Length: > 0 and <= 192 }) throw new ArgumentException("Kies WING Full/Rack, geldige banken en minstens één toewijzing.");
        var keys = new HashSet<string>();
        foreach (var b in request.Bindings) {
            if (b is null || !request.Banks.Contains(b.Bank) || b.Kind is not ("button" or "rotary") || b.Index < 1 || b.Index > (b.Kind == "button" ? 8 : 4) || b.Label is null || b.Label.Length is < 1 or > 1024 || !keys.Add($"{b.Bank}:{b.Kind}:{b.Index}")) throw new ArgumentException("Ongeldige of dubbele WING-toewijzing.");
        }
        using var transport = connect(ValidateAddress(request.Address));
        var identity = await Identity(transport, token);
        var device = identity.Device;
        if (!Regex.IsMatch(device.Firmware, @"^3\.1(?:[.-]|$)")) throw new WingConflictException("Banksynchronisatie is alleen geverifieerd voor de WING 3.1-protocolversie. Deze firmware wordt nog niet ondersteund.");
        if (!(request.ProfileId == "wing-full" ? device.Model is "ngc-full" or "wing-fullsize" : device.Model is "ngc-rack" or "wing-rack")) throw new WingConflictException("Het gevonden WING-model komt niet overeen met het gekozen Full/Rack-profiel.");
        var changes = new List<WingSlotChange>();
        var warnings = new List<string> { "Alleen toegewezen knoppen/rotaries worden vervangen. Lege plaatsen, overige banken en MIDI-routering blijven behouden. MIDI-ontvangst in Lightlab is een aparte koppeling." };
        foreach (var binding in request.Bindings) {
            var before = await ReadSlot(transport, SlotPath(binding.Bank, binding.Kind, binding.Index), token);
            var after = Desired(binding);
            if (after.All(pair => before.TryGetValue(pair.Key, out var value) && Equals(value, pair.Value))) continue;
            if ((string)after["name"] != binding.Label) warnings.Add($"Bank {binding.Bank}, {binding.Kind} {binding.Index}: naam aangepast naar ‘{after["name"]}’ (ASCII, maximaal 16 tekens).");
            changes.Add(new(binding.Bank, binding.Kind, binding.Index, binding.Label, before, after));
        }
        warnings.Add("Bestaande audiofuncties op de geselecteerde plaatsen worden vervangen. Rotary-waarden, gedeelde LED-kleuren en globale MIDI-routering worden niet geschreven.");
        pendingIdentity = identity.Raw;
        pending = new(1, Guid.NewGuid().ToString("N"), request.Address, device, now().AddMinutes(5), changes.ToArray(), warnings.ToArray());
        return pending;
    }, ct);
    public Task<WingApplyResult> ApplyAsync(WingApplyRequest request, CancellationToken ct) => Exclusive(async token => {
        if (request.Version != 1 || !request.Confirm || pending is null || request.PlanId != pending.PlanId) throw new WingConflictException("Maak een nieuw WING-voorstel en bevestig het expliciet.");
        var plan = pending; var expectedIdentity = pendingIdentity; pending = null; pendingIdentity = null; // Single-use, even after a preflight failure; never replay physical writes.
        using var transport = connect(ValidateAddress(plan.Address));
        if ((await Identity(transport, token)).Raw != expectedIdentity) throw new WingConflictException("De WING-identiteit is gewijzigd. Lees opnieuw uit.");
        foreach (var slot in plan.Changes) {
            if (!Equal(await ReadSlot(transport, SlotPath(slot.Bank, slot.Kind, slot.Index), token), slot.Before)) throw new WingConflictException("De WING-bank is intussen gewijzigd. Er is niets verstuurd; lees opnieuw uit.");
        }
        var verified = 0;
        WingSlotChange? current = null;
        var step = "configuratie";
        try {
            foreach (var slot in plan.Changes) {
                current = slot;
                var path = SlotPath(slot.Bank, slot.Kind, slot.Index);
                // Mode changes alter available children. Disable before configuring; never replay saved audio commands.
                foreach (var mode in new[] { "OFF", (string)slot.After["mode"] }) {
                    step = "modus";
                    await transport.WriteAsync(path + "/mode", mode, token);
                    var actual = await transport.ReadAsync(path + "/mode", token);
                    if (!Equals(Scalar(actual), mode)) throw new IOException("WING-modus niet bevestigd.");
                }
                var active = await ReadSlot(transport, path, token);
                if (!slot.After.Keys.All(active.ContainsKey)) throw new IOException("Deze firmware ondersteunt niet alle MIDI-velden.");
                foreach (var field in slot.After.Where(pair => pair.Key != "mode")) {
                    step = field.Key;
                    await transport.WriteAsync(path + "/" + field.Key, field.Value, token);
                    var actual = await transport.ReadAsync(path + "/" + field.Key, token);
                    if (!Equals(Scalar(actual, field.Key, (string)slot.After["mode"]), field.Value)) throw new IOException("WING-veld niet bevestigd.");
                }
                step = "eindcontrole";
                var final = await ReadSlot(transport, path, token);
                if (!slot.After.All(pair => final.TryGetValue(pair.Key, out var value) && Equals(value, pair.Value))) throw new IOException("WING-eindcontrole mislukt.");
                verified++;
            }
            return new WingApplyResult(1, "applied", verified, plan.Changes.Length, null, plan.Changes);
        } catch (Exception error) when (error is IOException or System.Net.Sockets.SocketException or OperationCanceledException) {
            var position = current is null ? "" : $"Bank {current.Bank}, {(current.Kind == "button" ? "knop" : "draaiknop")} {current.Index}, veld {step}: ";
            return new WingApplyResult(1, "partial", verified, plan.Changes.Length, position + "versturen of teruglezen is niet bevestigd. Deze plaats kan gedeeltelijk gewijzigd zijn. Lees de WING opnieuw uit; er volgt geen automatische herhaling of herstel.", plan.Changes);
        }
    }, ct);
}
