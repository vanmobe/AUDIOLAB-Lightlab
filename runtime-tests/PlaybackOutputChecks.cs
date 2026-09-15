using System.Collections.Concurrent;
using System.Net;
using System.Net.Sockets;
using System.Text.Json;
using Lightflow.Runtime;

static class PlaybackOutputChecks {
    static void Check(bool ok, string message) { if (!ok) throw new Exception(message); }
    static InspectionPatch Patch(InspectionRoute[]? routes = null) => new([
        new("a", "varytec-theater-spot-100", "2ch", new(1, 1)),
        new("b", "varytec-theater-spot-100", "2ch", new(2, 511))
    ], routes ?? [new("r1", 1, "artnet", "127.0.0.1", true), new("r2", 2, "sacn", "127.0.0.1", true)]);
    static InspectionUniverse[] Frame() {
        var first = new int[512]; first[0] = 123;
        var second = new int[512]; second[511] = 234;
        return [new(1, "artnet", true, first, []), new(2, "sacn", true, second, [])];
    }
    public static async Task Run() {
        var transport = new RecordedDmxSender();
        var ownership = new OutputOwnership();
        var raw = new OutputSession(ownership);
        var output = new PlaybackOutput(ownership, () => transport);
        await output.ResetAsync("test", Patch());
        Check(output.Status.Routes.Length == 2 && output.Status.ArmError is null, "Unarmed status previews exact snapshot destinations");
        Check(!await output.SendAsync(Frame()) && transport.Packets.IsEmpty, "Show output is network-free by default");
        await raw.ArmAsync(new("127.0.0.1", 1, "artnet"));
        try { await output.ArmAsync("test", Patch(), default); throw new Exception("Concurrent raw/show arm allowed"); } catch (OutputOwnershipConflictException) { }
        await raw.DisarmAsync();
        await output.ArmAsync("test", Patch(), default);
        try { await raw.ArmAsync(new("127.0.0.1", 1, "artnet")); throw new Exception("Concurrent show/raw arm allowed"); } catch (OutputOwnershipConflictException) { }
        await output.SendAsync(Frame());
        var initial = transport.Packets.ToArray();
        Check(initial.Length == 2 && initial[0].Packet[18] == 123 && initial[1].Packet[637] == 234,
            "Both independently compiled universe payloads reach their selected protocols");
        Check(initial[0].Endpoint.Port == 6454 && initial[1].Endpoint.Port == 5568 && initial[0].Packet[12] == 1 && initial[1].Packet[111] == 0,
            "Destinations and initial protocol sequence numbers are correct");
        for (var i = 0; i < 10; i++) await output.SendAsync(Frame());
        Check(transport.Packets.Count == 2, "Rapid commands cannot burst duplicate network frames beyond 40Hz");
        await Task.Delay(30); await output.SendAsync(Frame());
        var next = transport.Packets.ToArray();
        Check(next[2].Packet[12] == 2 && next[3].Packet[111] == 1, "Per-universe sequences advance without repeating Art-Net one");
        await output.DisarmAsync();
        var shutdown = transport.Packets.ToArray().Skip(4).ToArray();
        Check(shutdown.Length == 9 && shutdown.Take(6).All(p => p.Packet.AsSpan(p.Endpoint.Port == 6454 ? 18 : 126).ToArray().All(v => v == 0)),
            "Disarm attempts three full blackout frames for both universes");
        Check(shutdown.Skip(6).All(p => p.Endpoint.Port == 5568 && p.Packet[112] == 0x40), "sACN shutdown adds exactly three stream-terminated frames");
        var stoppedCount = transport.Packets.Count;
        Check(!await output.SendAsync(Frame()) && transport.Packets.Count == stoppedCount && transport.Disposed, "Disarm closes transport and never retains/replays last live frame");
        await raw.ArmAsync(new("127.0.0.1", 1, "sacn")); await raw.DisarmAsync();

        foreach (var badRoutes in new InspectionRoute[][] { [], [new("r", 1, "artnet", "127.0.0.1", false)],
            [new("r1", 1, "artnet", "127.0.0.1", true), new("r2", 2, "sacn", "bad/path", true)] }) {
            var bad = Patch(badRoutes);
            await output.ResetAsync("bad", bad);
            Check(output.Status.ArmError is not null, "Missing/disabled/invalid routes are explained before arming");
            try { await output.ArmAsync("bad", bad, default); throw new Exception("Invalid route armed"); } catch (ArgumentException) { }
            Check(output.Status.State == "disarmed", "Rejected arm has no physical side effects");
        }
        var resolverCalls = 0;
        var resolvedSender = new RecordedDmxSender();
        var resolved = new PlaybackOutput(createSender: () => resolvedSender, resolveHost: (_, _) => {
            resolverCalls++; return Task.FromResult(new[] { IPAddress.Loopback });
        });
        var namedPatch = Patch([new("r1", 1, "artnet", "test.local", true), new("r2", 2, "sacn", "test.local", true)]);
        await resolved.ResetAsync("resolve", namedPatch); await resolved.ArmAsync("resolve", namedPatch, default);
        await resolved.SendAsync(Frame()); await Task.Delay(30); await resolved.SendAsync(Frame());
        Check(resolverCalls == 2, "DNS runs only at arm, never in the frame pump");
        await resolved.DisarmAsync();

        var dnsFailure = new PlaybackOutput(ownership, resolveHost: (_, _) => throw new SocketException());
        await dnsFailure.ResetAsync("dns", namedPatch);
        try { await dnsFailure.ArmAsync("dns", namedPatch, default); throw new Exception("DNS failure accepted"); } catch (SocketException) { }
        Check(dnsFailure.Status.State == "faulted" && dnsFailure.Status.LastError is not null, "Failed arm publishes persistent authored diagnostic status");
        await raw.ArmAsync(new("127.0.0.1", 1, "sacn")); await raw.DisarmAsync();

        var sequenceClock = new PlaybackTestTime();
        var sequenceSender = new RecordedDmxSender();
        var wrapping = new PlaybackOutput(createSender: () => sequenceSender, timeProvider: sequenceClock);
        await wrapping.ResetAsync("wrapping", Patch()); await wrapping.ArmAsync("wrapping", Patch(), default);
        for (var i = 0; i < 257; i++) { await wrapping.SendAsync(Frame()); sequenceClock.Advance(.03); }
        var wrapped = sequenceSender.Packets.ToArray();
        Check(wrapped[508].Packet[12] == 255 && wrapped[510].Packet[12] == 1 && wrapped[512].Packet[12] == 2
            && wrapped[511].Packet[111] == 255 && wrapped[513].Packet[111] == 0, "Continuous sender wraps Art-Net through one and sACN through zero independently");
        await wrapping.DisarmAsync();

        var brokenSender = new RecordedDmxSender { Fail = true };
        var failing = new PlaybackOutput(ownership, () => brokenSender);
        await failing.ResetAsync("failure", Patch()); await failing.ArmAsync("failure", Patch(), default);
        Check(!await failing.SendAsync(Frame()) && failing.Status.State == "faulted" && failing.Status.LastError is not null && brokenSender.Disposed,
            "Socket failure disarms with authored diagnostics and releases resources");
        brokenSender.Fail = false;
        Check(!await failing.SendAsync(Frame()), "Recovery does not auto-rearm");
        await raw.ArmAsync(new("127.0.0.1", 1, "sacn")); await raw.DisarmAsync();

        // A stalled fake makes cancellation/lease ordering observable without touching hardware.
        var blocked = new RecordedDmxSender { Block = true };
        var bounded = new PlaybackOutput(ownership, () => blocked);
        await bounded.ResetAsync("bounded", Patch()); await bounded.ArmAsync("bounded", Patch(), default);
        var watch = System.Diagnostics.Stopwatch.StartNew();
        var sending = bounded.SendAsync(Frame()); await blocked.Entered.Task;
        var stopping = bounded.DisarmAsync();
        Check(!stopping.IsCompleted, "Disarm waits for active frame ownership");
        try { await raw.ArmAsync(new("127.0.0.1", 1, "sacn")); throw new Exception("Lease released before send cleanup"); } catch (OutputOwnershipConflictException) { }
        await sending; await stopping;
        Check(watch.Elapsed.TotalSeconds < 3 && bounded.Status.State == "faulted" && blocked.Disposed, "Frame deadline plus shutdown deadline bound stalled output");
        await raw.ArmAsync(new("127.0.0.1", 1, "sacn")); await raw.DisarmAsync();

        await SessionLifecycle();
        await Loopback();
        await ArtNetLoopback();
        Console.WriteLine("Continuous output checks passed: explicit arm, snapshot routes, two universes/protocols, cadence, sequence, blackout/termination, mutual exclusion, deadline/fault recovery, autonomous lifecycle and real sACN loopback; no physical hardware.");
    }

    static async Task SessionLifecycle() {
        using var show = JsonDocument.Parse("""{"groups":[{"id":"front","intensity":0.7},{"id":"wash","intensity":0.8}],"fixtures":[{"id":"a","profileId":"varytec-theater-spot-100","modeId":"2ch","patch":{"universe":1,"address":1}},{"id":"b","profileId":"varytec-theater-spot-100","modeId":"2ch","patch":{"universe":2,"address":511}}],"routes":[{"id":"r1","universe":1,"protocol":"artnet","host":"127.0.0.1","enabled":true},{"id":"r2","universe":2,"protocol":"sacn","host":"127.0.0.1","enabled":true}],"looks":[{"id":"look-a"},{"id":"look-b"}]}""");
        var transports = new List<RecordedDmxSender>();
        var evaluator = new PlaybackFakeEvaluator();
        var output = new PlaybackOutput(createSender: () => { var sender = new RecordedDmxSender(); transports.Add(sender); return sender; });
        await using var session = new PlaybackSession(() => evaluator, output: output);
        var started = await session.StartAsync(new(1, show.RootElement, 120, "look-a"), default);
        var id = started.SessionId!;
        Check(transports.Count == 0 && !session.Status.OutputSent, "Starting playback never creates a network transport");
        try { await session.OutputCommandAsync(new(1, id, "arm"), default); throw new Exception("Unconfirmed arm accepted"); } catch (ArgumentException) { }
        try { await session.OutputCommandAsync(new(1, "stale", "arm", true), default); throw new Exception("Stale arm accepted"); } catch (PlaybackConflictException) { }
        await session.OutputCommandAsync(new(1, id, "arm", true), default);
        var sender = transports[^1];
        Check(session.Status.OutputSent && output.Status.FramesSent == 1, "Explicit arm immediately sends the compiled snapshot");
        await Task.Delay(100);
        Check(output.Status.FramesSent > 1, "Armed session keeps sending without HTTP/browser calls");
        await session.CommandAsync(new(1, id, "mode", Mode: "blackout"), default); await Task.Delay(60);
        Check(sender.Packets.ToArray().TakeLast(2).All(p => p.Packet.AsSpan(p.Endpoint.Port == 6454 ? 18 : 126).ToArray().All(v => v == 0))
            && output.Status.State == "armed", "Blackout remains an armed, continuously refreshed zero stream");
        evaluator.Fail = true;
        try { await session.CommandAsync(new(1, id, "mode", Mode: "automation"), default); } catch (Exception) { }
        Check(session.Status.Status == "faulted" && !session.Status.OutputSent && output.Status.State == "disarmed" && sender.Disposed,
            "Evaluator failure stops physical output before clearing playback");
        evaluator.Fail = false;
        var next = await session.StartAsync(new(1, show.RootElement, 120, "look-a"), default);
        Check(output.Status.State == "disarmed" && output.Status.FramesSent == 0, "New session never inherits armed state or old counters");
        try { await session.OutputCommandAsync(new(1, id, "disarm"), default); throw new Exception("Stale disarm accepted"); } catch (PlaybackConflictException) { }
        await session.OutputCommandAsync(new(1, next.SessionId!, "arm", true), default);
        transports[^1].Fail = true;
        await Task.Delay(200);
        Check(session.Status.Status == "running" && !session.Status.OutputSent && output.Status.State == "faulted",
            "Network failure leaves memory playback running but requires explicit output recovery");
        await session.OutputCommandAsync(new(1, next.SessionId!, "arm", true), default);
        await session.CommandAsync(new(1, next.SessionId!, "stop"), default);
        Check(transports[^1].Disposed && !session.Status.OutputSent && output.Status.State == "disarmed", "Explicit Stop closes physical transport");
        var shutdownSender = new RecordedDmxSender();
        var shutdownOutput = new PlaybackOutput(createSender: () => shutdownSender);
        await using (var shutdown = new PlaybackSession(() => new PlaybackFakeEvaluator(), output: shutdownOutput)) {
            var final = await shutdown.StartAsync(new(1, show.RootElement, 120, "look-a"), default);
            await shutdown.OutputCommandAsync(new(1, final.SessionId!, "arm", true), default);
        }
        Check(shutdownSender.Disposed && shutdownOutput.Status.State == "disarmed", "Companion disposal shuts down armed output");
    }

    static async Task Loopback() {
        // Only loopback is used. A conflict on this local protocol port fails the test rather than contacting a real node.
        using var receiver = new UdpClient(new IPEndPoint(IPAddress.Loopback, 5568));
        var patch = Patch([new("r1", 1, "sacn", "127.0.0.1", true), new("r2", 2, "sacn", "127.0.0.1", true)]);
        var output = new PlaybackOutput();
        await output.ResetAsync("loopback", patch); await output.ArmAsync("loopback", patch, default);
        try {
            await output.SendAsync(Frame());
            using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(2));
            var first = await receiver.ReceiveAsync(deadline.Token); var second = await receiver.ReceiveAsync(deadline.Token);
            Check(first.Buffer[114] == 1 && first.Buffer[126] == 123 && second.Buffer[114] == 2 && second.Buffer[637] == 234,
                "Real UDP loopback receives independently addressed universe data with correct boundary slots");
            await output.DisarmAsync();
            var shutdown = new List<byte[]>();
            for (var i = 0; i < 12; i++) shutdown.Add((await receiver.ReceiveAsync(deadline.Token)).Buffer);
            Check(shutdown.Count(p => p[112] == 0x40) == 6 && shutdown.All(p => p.AsSpan(126).ToArray().All(v => v == 0)),
                "Actual UDP receiver observes full blackout then three terminations for each sACN universe");
        } finally { await output.DisarmAsync(); }
    }

    static async Task ArtNetLoopback() {
        UdpClient receiver;
        try { receiver = new(new IPEndPoint(IPAddress.Parse("127.0.0.2"), 6454)); }
        catch (SocketException error) when (error.SocketErrorCode == SocketError.AddressNotAvailable) {
            Console.WriteLine("Art-Net real UDP check skipped: OS has no 127.0.0.2 loopback address; no network aliases were changed. ArtDmx packets/transport selection are covered by deterministic tests.");
            return;
        }
        using (receiver) {
            using var sender = new UdpDmxDatagramSender(IPAddress.Loopback);
            var values = new byte[512]; values[0] = 42; values[511] = 211;
            using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(2));
            await sender.SendAsync(DmxPackets.ArtNet(2, values, 1), new(IPAddress.Parse("127.0.0.2"), 6454), deadline.Token);
            var datagram = await receiver.ReceiveAsync(deadline.Token);
            Check(datagram.RemoteEndPoint.Port == 6454 && datagram.Buffer[14] == 1 && datagram.Buffer[18] == 42 && datagram.Buffer[529] == 211,
                "Actual Art-Net transport uses source/destination6454 and correct mapped universe/payload");
        }
    }
}

sealed class RecordedDmxSender : IDmxDatagramSender {
    public ConcurrentQueue<(byte[] Packet, IPEndPoint Endpoint)> Packets { get; } = new();
    public bool Fail, Block, Disposed;
    public TaskCompletionSource Entered { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
    public async Task SendAsync(byte[] packet, IPEndPoint endpoint, CancellationToken token) {
        if (Fail) throw new SocketException();
        if (Block) { Entered.TrySetResult(); await Task.Delay(Timeout.Infinite, token); }
        token.ThrowIfCancellationRequested();
        if (Disposed) throw new ObjectDisposedException(nameof(RecordedDmxSender));
        Packets.Enqueue((packet, endpoint));
    }
    public void Dispose() => Disposed = true;
}
