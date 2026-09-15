using Lightflow.Runtime;
using System.Text;
using System.Text.Json;

static class WingChecks
{
    static void Check(bool ok, string message) { if (!ok) throw new Exception("WING: " + message); }
    static async Task Reject<T>(Func<Task> action) where T : Exception { try { await action(); } catch (T) { return; } throw new Exception("WING expected " + typeof(T).Name); }
    public static async Task Run()
    {
        await IndexedChannelReadback();
        var roundtrip = WingOsc.Decode(WingOsc.Encode("/test", "abc", 127, .5f));
        Check(roundtrip.Values.SequenceEqual(new object[] { "abc", 127, .5f }), "OSC strings/int/float round trip");
        foreach (var bytes in new[] { new byte[5], Encoding.UTF8.GetBytes("/abc"), new byte[4100] }) await Reject<IOException>(() => Task.Run(() => WingOsc.Decode(bytes)));
        var badPadding = WingOsc.Encode("/a", "x"); badPadding[3] = 1;
        await Reject<IOException>(() => Task.Run(() => WingOsc.Decode(badPadding)));
        foreach (var address in new[] { "localhost", "127.0.0.1", "10.0.0.255", "8.8.8.8", "224.0.0.1", "::1", "10.1", "10.0.0.0", "010.0.0.10", "10.0.0.010" }) await Reject<ArgumentException>(() => Task.Run(() => WingSync.ValidateAddress(address)));
        Check(WingSync.ValidateAddress("10.0.0.10").ToString() == "10.0.0.10", "private address");
        Check(WingSync.SlotPath(16, "button", 8) == "/$ctl/user/16/4/bd" && WingSync.SlotPath(1, "button", 4) == "/$ctl/user/1/4/bu", "button mapping boundaries");
        Check(WingSync.SlotPath(16, "rotary", 4) == "/$ctl/user/16/4/enc", "rotary mapping");
        var desired = WingSync.Desired(new(16, "rotary", 4, "*|Éléphant grand long"));
        Check(!desired.ContainsKey("val") && (int)desired["cc"] == 3 && (int)desired["ch"] == 16 && (string)desired["name"] == "Elephant grand l", "no rotary event write / label normalization");
        foreach (var json in new[] { "{}", "{\"version\":1,\"address\":\"10.0.0.10\",\"path\":\"/ch/1\"}", "{\"version\":1,\"version\":1,\"address\":\"10.0.0.10\"}", "{\"version\":1,\"address\":null}" }) await Reject<JsonException>(() => Task.Run(() => WingEndpoints.Parse<WingProbeRequest>(Encoding.UTF8.GetBytes(json))));
        var fake = new FakeWing();
        var time = DateTimeOffset.UtcNow;
        var sync = new WingSync(_ => fake, () => time);
        var request = new WingPlanRequest(1, "10.0.0.10", "wing-full", [1], [new(1, "button", 1, "Look 1"), new(1, "rotary", 1, "Wash")]);
        var plan = await sync.PlanAsync(request, default);
        Check(fake.Writes.Count == 0 && plan.Changes.Length == 2 && (int)plan.Changes[0].Before["mgrp"] == 2, "read only plan captures prior audio function");
        fake.Slots["/$ctl/user/1/1/enc"]["name"] = "Changed";
        await Reject<WingConflictException>(() => sync.ApplyAsync(new(1, plan.PlanId, true), default));
        Check(fake.Writes.Count == 0, "any slot drift prevents all writes");
        plan = await sync.PlanAsync(request, default);
        await Reject<ArgumentException>(() => sync.PlanAsync(request with { Banks = [1, 1] }, default));
        await Reject<WingConflictException>(() => sync.ApplyAsync(new(1, plan.PlanId, true), default));
        Check(fake.Writes.Count == 0, "failed replacement invalidates old confirmation");
        plan = await sync.PlanAsync(request, default);
        var applied = await sync.ApplyAsync(new(1, plan.PlanId, true), default);
        Check(applied.State == "applied" && applied.VerifiedSlots == 2, "all slots readback verified");
        Check(fake.Writes.All(w => !w.Path.EndsWith("enc/val") && !w.Path.Contains("/led") && !w.Path.Contains("/col")), "no rotary value or shared LED writes");
        await Reject<WingConflictException>(() => sync.ApplyAsync(new(1, plan.PlanId, true), default));
        plan = await sync.PlanAsync(request, default);
        Check(plan.Changes.Length == 0, "already matching assignments are no-op");
        fake.Slots["/$ctl/user/1/1/bu"]["name"] = "Old";
        plan = await sync.PlanAsync(request, default);
        fake.FailWrites = true;
        applied = await sync.ApplyAsync(new(1, plan.PlanId, true), default);
        Check(applied.State == "partial" && applied.VerifiedSlots == 0 && applied.Backup.Length == 1, "failed write reports uncertain partial, with backup");
        Check(applied.Error?.Contains("Bank 1, knop 1, veld modus") == true, "partial failure identifies the affected position and step");
        fake.FailWrites = false;
        plan = await sync.PlanAsync(request, default);
        time = time.AddMinutes(6);
        await Reject<WingConflictException>(() => sync.ApplyAsync(new(1, plan.PlanId, true), default));
        plan = await sync.PlanAsync(request, default);
        fake.Serial = "different";
        await Reject<WingConflictException>(() => sync.ApplyAsync(new(1, plan.PlanId, true), default));
        await Reject<ArgumentException>(() => sync.PlanAsync(request with { Banks = [1, 1] }, default));
        await Reject<ArgumentException>(() => sync.PlanAsync(request with { ProfileId = "wing-compact" }, default));
        fake.Firmware = "3.2";
        await sync.ProbeAsync(new(1, "10.0.0.10"), default);
        var writesBefore = fake.Writes.Count;
        await Reject<WingConflictException>(() => sync.PlanAsync(request, default));
        Check(fake.Writes.Count == writesBefore, "unknown firmware remains probe only");
        Console.WriteLine("WING OSC, strict input, dry run, drift, expiry, single-use, mapping and partial-write checks passed.");
    }
    static async Task IndexedChannelReadback()
    {
        // Captured from the user's first partially configured control: channel 12
        // returns ,sfi ["12", 0.73333335, 11], unlike note/value's zero-based range.
        var fake = new FakeWing();
        fake.Slots.Clear();
        var bindings = new List<WingBinding>();
        foreach (var bank in new[] { 12, 1, 16 })
        {
            foreach (var kind in new[] { "button", "rotary" })
            {
                for (var index = 1; index <= (kind == "button" ? 8 : 4); index++)
                {
                    var binding = new WingBinding(bank, kind, index, $"Bank {bank} {index}");
                    bindings.Add(binding);
                    fake.Slots[WingSync.SlotPath(bank, kind, index)] = new() { ["mode"] = "OFF", ["name"] = "" };
                }
            }
        }
        fake.Slots["/$ctl/user/12/1/bu"] = new()
        {
            ["mode"] = "MIDINP",
            ["name"] = "Openingsvuur",
            ["ch"] = 12,
            ["note"] = 0,
            ["val"] = 0,
        };
        fake.Slots["/$ctl/user/16/1/bu"] = new() { ["mode"] = "SOF", ["name"] = "MON1", ["ch"] = 59 };
        fake.Slots["/$ctl/user/16/2/bu"] = new() { ["mode"] = "MUTE", ["name"] = "Legacy", ["ch"] = 0 };
        fake.Slots["/$ctl/user/16/3/bu"] = new() { ["mode"] = "CHPAGE", ["name"] = "Selection", ["ch"] = "SEL" };
        var sync = new WingSync(_ => fake);
        var request = new WingPlanRequest(1, "10.0.0.10", "wing-full", [12, 1, 16], bindings.ToArray());
        var plan = await sync.PlanAsync(request, default);
        Check((int)plan.Changes[0].Before["ch"] == 12 && (int)plan.Changes[0].Before["val"] == 0,
            "captured partially configured button keeps display channel 12 and unchanged zero velocity");
        var otherModes = plan.Changes.Where(c => c.Bank == 16 && c.Kind == "button").ToArray();
        Check((int)otherModes[0].Before["ch"] == 58 && (int)otherModes[1].Before["ch"] == -1 && (string)otherModes[2].Before["ch"] == "SEL",
            "MIDI-only normalization preserves existing non-MIDI channel scalar semantics");
        var result = await sync.ApplyAsync(new(1, plan.PlanId, true), default);
        Check(result.State == "applied" && result.VerifiedSlots == 36,
            $"indexed MIDI channel readback must continue beyond the first button: {result.State}, verified {result.VerifiedSlots}/36");
        Check((int)fake.Slots["/$ctl/user/12/1/bu"]["ch"] == 12 && (int)fake.Slots["/$ctl/user/12/1/bu"]["val"] == 127,
            "display channel 12 and velocity 127 are configured without subtracting from writes");
        plan = await sync.PlanAsync(request, default);
        Check(plan.Changes.Length == 0, "indexed channel readback also makes matching assignments no-op");

        fake.Slots["/$ctl/user/12/1/bu"]["name"] = "Old";
        plan = await sync.PlanAsync(request, default);
        fake.IgnoreChannelWrites = true;
        result = await sync.ApplyAsync(new(1, plan.PlanId, true), default);
        Check(result.State == "partial" && result.VerifiedSlots == 0 && result.Error?.Contains("Bank 12, knop 1, veld ch") == true,
            "normalization must still reject a genuinely wrong MIDI channel and identify that field");
    }
    sealed class FakeWing : IWingTransport
    {
        public string Serial = "test";
        public string Firmware = "3.1";
        public bool FailWrites;
        public bool IgnoreChannelWrites;
        public List<(string Path, object Value)> Writes = [];
        public Dictionary<string, Dictionary<string, object>> Slots = new()
        {
            ["/$ctl/user/1/1/bu"] = new() { ["mode"] = "MGRP", ["name"] = "Mute", ["mgrp"] = 2 },
            ["/$ctl/user/1/1/enc"] = new() { ["mode"] = "DCA", ["name"] = "Audio", ["dca"] = 1 },
        };
        public Task<object[]> ReadAsync(string path, CancellationToken ct)
        {
            ct.ThrowIfCancellationRequested();
            if (path == "/?") return Task.FromResult<object[]>([$"WING,10.0.0.10,Desk,wing-fullsize,{Serial},{Firmware}"]);
            if (Slots.TryGetValue(path, out var slot)) return Task.FromResult(slot.Keys.Reverse().Cast<object>().Append("$fname").ToArray());
            var split = path.LastIndexOf('/'); var value = Slots[path[..split]][path[(split + 1)..]];
            if (path.EndsWith("/ch") && value is int channel)
                return Task.FromResult<object[]>([channel.ToString(), (channel - 1) / 15f, channel - 1]);
            return Task.FromResult<object[]>(value is int n ? [n.ToString(), 0f, n] : [value]);
        }
        public Task WriteAsync(string path, object value, CancellationToken ct)
        {
            ct.ThrowIfCancellationRequested(); Writes.Add((path, value));
            if (FailWrites) throw new IOException("injected");
            var split = path.LastIndexOf('/'); var slotPath = path[..split]; var key = path[(split + 1)..];
            if (key == "ch" && IgnoreChannelWrites) return Task.CompletedTask;
            if (key == "mode")
            {
                var priorName = Slots[slotPath]["name"];
                Slots[slotPath] = new() { ["mode"] = value, ["name"] = priorName };
                if ((string)value != "OFF") { Slots[slotPath]["ch"] = 1; Slots[slotPath][(string)value == "MIDICC" ? "cc" : "note"] = 0; Slots[slotPath]["val"] = 0; }
            }
            else Slots[slotPath][key] = value;
            return Task.CompletedTask;
        }
        public void Dispose() { }
    }
}
