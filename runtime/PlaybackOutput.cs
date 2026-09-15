using System.Net;
using System.Net.Sockets;

namespace Lightflow.Runtime;

public sealed record PlaybackOutputCommand(int Version, string SessionId, string Command, bool Confirmed = false);
public sealed record PlaybackOutputRoute(int Universe, string Protocol, string Host);
public sealed record PlaybackOutputStatus(int Version, string? SessionId, string State, PlaybackOutputRoute[] Routes, long FramesSent, string? LastError, string? ArmError);
public sealed class OutputOwnershipConflictException : Exception;

/// <summary>A lease is retained until all sends and shutdown attempts have finished, including legacy raw output.</summary>
public sealed class OutputOwnership
{
    object? owner;
    public bool TryAcquire(object candidate)
    {
        var current = Interlocked.CompareExchange(ref owner, candidate, null);
        return current is null || ReferenceEquals(current, candidate);
    }
    public void Release(object candidate) => Interlocked.CompareExchange(ref owner, null, candidate);
}

public interface IDmxDatagramSender : IDisposable
{
    Task SendAsync(byte[] packet, IPEndPoint endpoint, CancellationToken cancellationToken);
}

public sealed class UdpDmxDatagramSender(IPAddress? bindAddress = null) : IDmxDatagramSender
{
    UdpClient? artnet;
    UdpClient? sacn;
    public async Task SendAsync(byte[] packet, IPEndPoint endpoint, CancellationToken cancellationToken)
    {
        var udp = endpoint.Port == 6454 ? artnet ??= new(new IPEndPoint(bindAddress ?? IPAddress.Any, 6454))
            : sacn ??= new(new IPEndPoint(bindAddress ?? IPAddress.Any, 0));
        await udp.SendAsync(packet, endpoint, cancellationToken);
    }
    public void Dispose() { artnet?.Dispose(); sacn?.Dispose(); }
}

/// <summary>Owns one explicitly armed immutable route set, never a queue or a retained lighting frame.</summary>
public sealed class PlaybackOutput(OutputOwnership? ownership = null, Func<IDmxDatagramSender>? createSender = null,
    Func<string, CancellationToken, Task<IPAddress[]>>? resolveHost = null, TimeProvider? timeProvider = null)
{
    readonly OutputOwnership ownership = ownership ?? new();
    readonly Func<IDmxDatagramSender> createSender = createSender ?? (() => new UdpDmxDatagramSender());
    readonly Func<string, CancellationToken, Task<IPAddress[]>> resolveHost = resolveHost ?? ((host, token) => Dns.GetHostAddressesAsync(host, token));
    readonly TimeProvider time = timeProvider ?? TimeProvider.System;
    readonly SemaphoreSlim gate = new(1, 1);
    readonly Guid sourceCid = Guid.NewGuid();
    readonly Dictionary<(string Protocol, int Universe), byte> sequences = [];
    record Destination(PlaybackOutputRoute Route, IPEndPoint Endpoint);
    Destination[] destinations = [];
    IDmxDatagramSender? sender;
    PlaybackOutputStatus status = new(1, null, "disarmed", [], 0, null, null);
    long? lastSend;
    public PlaybackOutputStatus Status => Volatile.Read(ref status);
    void Publish(PlaybackOutputStatus next) => Volatile.Write(ref status, next);

    static PlaybackOutputRoute[] Routes(InspectionPatch patch)
    {
        var universes = patch.Fixtures.Where(f => f.Patch is not null).Select(f => f.Patch!.Universe).Distinct().Order().ToArray();
        return patch.Routes.Where(r => universes.Contains(r.Universe) && r.Enabled).OrderBy(r => r.Universe)
            .Select(r => new PlaybackOutputRoute(r.Universe, r.Protocol, r.Host)).ToArray();
    }
    static string? RouteError(InspectionPatch patch, PlaybackOutputRoute[] routes)
    {
        var universes = patch.Fixtures.Where(f => f.Patch is not null).Select(f => f.Patch!.Universe).Distinct().ToArray();
        if (universes.Length == 0) return "Patch minstens één lamp voordat je fysieke uitvoer inschakelt.";
        foreach (var universe in universes)
        {
            var matches = routes.Where(r => r.Universe == universe).ToArray();
            if (matches.Length != 1 || !OutputRoute.IsValid(matches[0].Host, universe, matches[0].Protocol))
                return $"Universe {universe} heeft geen unieke geldige ingeschakelde netwerkroute.";
        }
        return null;
    }
    public async Task ResetAsync(string sessionId, InspectionPatch patch)
    {
        await gate.WaitAsync();
        try
        {
            await CloseAsync(false);
            // Keep per-universe sequence continuity for this process's stable sACN CID, including a restarted show.
            lastSend = null;
            var routes = Routes(patch);
            Publish(new(1, sessionId, "disarmed", routes, 0, null, RouteError(patch, routes)));
        }
        finally { gate.Release(); }
    }

    public async Task ArmAsync(string sessionId, InspectionPatch patch, CancellationToken cancellationToken)
    {
        await gate.WaitAsync(cancellationToken);
        try
        {
            if (status.SessionId != sessionId) throw new PlaybackConflictException();
            if (status.State == "armed") return;
            var routes = Routes(patch);
            if (RouteError(patch, routes) is string error) throw new ArgumentException(error);
            if (!ownership.TryAcquire(this)) throw new OutputOwnershipConflictException();
            try
            {
                using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                deadline.CancelAfter(TimeSpan.FromSeconds(5));
                var resolved = new List<Destination>();
                foreach (var route in routes)
                {
                    var addresses = IPAddress.TryParse(route.Host, out var literal) ? [literal] : await resolveHost(route.Host, deadline.Token).WaitAsync(deadline.Token);
                    var address = addresses.FirstOrDefault(a => a.AddressFamily == AddressFamily.InterNetwork);
                    if (address is null || address.Equals(IPAddress.Any) || address.Equals(IPAddress.Broadcast)
                        || (route.Protocol == "artnet" && address.GetAddressBytes()[0] is >= 224 and <= 239))
                        throw new ArgumentException($"Universe {route.Universe} vereist een geldige IPv4-bestemming; Art-Net vereist unicast.");
                    resolved.Add(new(route, new(address, route.Protocol == "artnet" ? 6454 : 5568)));
                }
                deadline.Token.ThrowIfCancellationRequested();
                sender = createSender(); destinations = resolved.ToArray();
                lastSend = null;
                Publish(status with { State = "armed", Routes = routes, LastError = null });
            }
            catch
            {
                try { sender?.Dispose(); } catch (Exception) { }
                sender = null; destinations = []; ownership.Release(this);
                Publish(status with { State = "faulted", LastError = "Uitvoer niet ingeschakeld: bestemming kon niet worden opgezocht of transport kon niet starten. Controleer netwerk en poorten; probeer bewust opnieuw." });
                throw;
            }
        }
        finally { gate.Release(); }
    }

    public async Task<bool> SendAsync(InspectionUniverse[] universes)
    {
        await gate.WaitAsync();
        try
        {
            if (status.State != "armed") return false;
            if (lastSend is long sentAt && time.GetElapsedTime(sentAt).TotalMilliseconds < 25) return status.FramesSent > 0;
            try
            {
                // One budget for the whole multi-universe frame. No retries and no catch-up queue.
                using var deadline = new CancellationTokenSource(TimeSpan.FromMilliseconds(500));
                if (universes.Length != destinations.Length || universes.Select(u => u.Universe).Distinct().Count() != universes.Length)
                    throw new InvalidOperationException();
                var channels = destinations.Select(d => universes.Single(u => u.Universe == d.Route.Universe).Channels).ToArray();
                if (channels.Any(c => c.Length != 512 || c.Any(v => v is < 0 or > 255))) throw new InvalidOperationException();
                lastSend = time.GetTimestamp();
                for (var index = 0; index < destinations.Length; index++)
                {
                    await SendPacketAsync(destinations[index], Array.ConvertAll(channels[index], v => (byte)v), false, deadline.Token);
                }
                Publish(status with { FramesSent = status.FramesSent + 1 });
                return true;
            }
            catch (Exception)
            {
                await CloseAsync(true);
                return false;
            }
        }
        finally { gate.Release(); }
    }

    public async Task DisarmAsync()
    {
        await gate.WaitAsync();
        try { await CloseAsync(false); } finally { gate.Release(); }
    }

    async Task SendPacketAsync(Destination destination, byte[] values, bool terminated, CancellationToken token)
    {
        var route = destination.Route;
        var key = (route.Protocol, route.Universe);
        var sequence = sequences.GetValueOrDefault(key, route.Protocol == "artnet" ? (byte)1 : (byte)0);
        // Art-Net reserves zero for disabled sequencing; sACN wraps through zero.
        sequences[key] = route.Protocol == "artnet" ? (byte)(sequence == 255 ? 1 : sequence + 1) : unchecked((byte)(sequence + 1));
        var packet = route.Protocol == "artnet" ? DmxPackets.ArtNet(route.Universe, values, sequence)
            : DmxPackets.Sacn(route.Universe, values, sourceCid, sequence, terminated);
        await sender!.SendAsync(packet, destination.Endpoint, token).WaitAsync(token);
    }

    async Task CloseAsync(bool faulted)
    {
        if (sender is null) return;
        var cleanupFailed = false;
        // UDP is best-effort: bounded three blackout frames, then three E1.31 termination frames.
        // Keep the lease throughout cleanup so another producer cannot interleave live values.
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(1));
        var zero = new byte[512];
        for (var pass = 0; pass < 6 && !deadline.IsCancellationRequested; pass++)
        {
            if (pass > 0)
            {
                try { await Task.Delay(25, deadline.Token); }
                catch (OperationCanceledException) { cleanupFailed = true; break; }
            }
            foreach (var destination in destinations)
            {
                if (pass >= 3 && destination.Route.Protocol != "sacn") continue;
                try { await SendPacketAsync(destination, zero, pass >= 3, deadline.Token); }
                catch (Exception) { cleanupFailed = true; }
                if (deadline.IsCancellationRequested) break;
            }
        }
        try { sender.Dispose(); } catch (Exception) { cleanupFailed = true; }
        sender = null;
        destinations = []; ownership.Release(this);
        Publish(status with
        {
            State = faulted || cleanupFailed ? "faulted" : "disarmed",
            LastError = faulted ? "Netwerkuitvoer mislukt of verlopen; uitvoer is uitgeschakeld. Controleer de verbinding en schakel bewust opnieuw in. Blackout is niet gegarandeerd."
                : cleanupFailed ? "Uitvoer uitgeschakeld, maar de laatste blackout/stop-pakketten konden niet volledig worden verstuurd. Controleer de lampen." : null
        });
    }
}
