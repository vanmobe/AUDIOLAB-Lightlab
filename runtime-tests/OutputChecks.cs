using Lightflow.Runtime;

static class OutputChecks {
    public static async Task Run() {
        static void Check(bool value, string message) { if (!value) throw new Exception(message); }
        // Boundary slots catch a shifted DMP header without opening any network socket.
        var slots = new byte[512]; slots[0] = 17; slots[511] = 231;
        var cid = Guid.Parse("00112233-4455-6677-8899-aabbccddeeff");
        var packet = DmxPackets.Sacn(63999, slots, cid, 255);
        Check(packet.Length == 638 && packet[125] == 0 && packet[126] == 17 && packet[637] == 231, "sACN start code and all 512 slots fit");
        Check(packet[121] == 0 && packet[122] == 1 && packet[123] == 2 && packet[124] == 1, "sACN address increment and property value count");
        Check(packet[111] == 255 && packet[113] == 249 && packet[114] == 255, "sACN sequence and universe are encoded");
        Check(packet.AsSpan(22, 16).SequenceEqual(Convert.FromHexString("00112233445566778899AABBCCDDEEFF")), "CID uses UUID network byte order");
        Check(packet[16] == 0x72 && packet[17] == 0x6e && packet[38] == 0x72 && packet[39] == 0x58 && packet[115] == 0x72 && packet[116] == 0x0b, "PDU lengths describe entire packet");
        var artnet = DmxPackets.ArtNet(32768, slots);
        Check(artnet.Length == 530 && artnet[14] == 255 && artnet[15] == 127 && artnet[18] == 17 && artnet[529] == 231, "Art-Net retains 1-based application universe mapping");
        Check(DmxPackets.ArtNet(1, slots, 255)[12] == 255 && DmxPackets.ArtNet(1, slots)[12] == 0, "ArtDmx explicit sequence and legacy no-sequence remain distinct");
        var terminal = DmxPackets.Sacn(1, new byte[512], cid, 2, terminated: true);
        Check(terminal[112] == 0x40 && packet[112] == 0 && terminal[111] == 2, "sACN terminal bit does not enable preview or sync options");
        Check(System.Text.Encoding.ASCII.GetString(terminal, 44, 16) == "Lightlab Runtime" && terminal[60] == 0, "Source name is bounded and zero terminated");
        foreach (var invalidUniverse in new[] { 0, 32769 }) {
            try { DmxPackets.ArtNet(invalidUniverse, slots); throw new Exception("ArtDmx invalid universe accepted"); } catch (ArgumentException) { }
        }
        foreach (var invalidUniverse in new[] { 0, 64000 }) {
            try { DmxPackets.Sacn(invalidUniverse, slots, cid, 0); throw new Exception("sACN invalid universe accepted"); } catch (ArgumentException) { }
        }
        foreach (var invalidSlots in new[] { new byte[511], new byte[513] }) {
            try { DmxPackets.ArtNet(1, invalidSlots); throw new Exception("ArtDmx invalid payload accepted"); } catch (ArgumentException) { }
            try { DmxPackets.Sacn(1, invalidSlots, cid, 0); throw new Exception("sACN invalid payload accepted"); } catch (ArgumentException) { }
        }
        foreach (var protocol in new[] { "artnet", "sacn" }) {
            var max = protocol == "artnet" ? 32768 : 63999;
            Check(OutputRoute.IsValid("192.168.1.10", 1, protocol) && OutputRoute.IsValid("botex.local", max, protocol), "Route boundary universes accepted");
            Check(!OutputRoute.IsValid("127.0.0.1", 0, protocol) && !OutputRoute.IsValid("127.0.0.1", max + 1, protocol), "Route overflow rejected before packet truncation");
        }
        Check(!OutputRoute.IsValid("http://device/path", 1, "artnet") && !OutputRoute.IsValid(null, 1, "sacn") && !OutputRoute.IsValid("device", 1, "unknown"), "Invalid routing rejected");
        Check(LocalRequestPolicy.Allows("127.0.0.1", null) && LocalRequestPolicy.Allows("localhost", "http://127.0.0.1:5173"), "Native loopback and existing UI origins allowed");
        foreach (var origin in new[] { "https://evil.example", "null", "", "http://localhost:5173.evil.example", "http://localhost:5173/" })
            Check(!LocalRequestPolicy.Allows("localhost", origin), "Cross-site simple posts rejected independently of CORS");
        Check(!LocalRequestPolicy.Allows("evil.example", null) && !LocalRequestPolicy.Allows("127.0.0.1.evil.example", null), "Rebinding Host rejected");
        var session = new OutputSession();
        var sent = new List<byte[]>();
        Task Record(byte[] bytes, OutputRoute route, CancellationToken token) { sent.Add(bytes); return Task.CompletedTask; }
        Check(!await session.SendAsync([], Record, default) && sent.Count == 0, "Disabled by default invokes no sender");
        await session.ArmAsync(new OutputRoute("botex.local", 1, "sacn"));
        try { await session.ArmAsync(new OutputRoute("botex.local", 64000, "sacn")); throw new Exception("Invalid route accepted"); } catch (ArgumentException) { }
        for (var i = 0; i < 257; i++) await session.SendAsync([-1, 256], Record, default);
        Check(sent[0][111] == 0 && sent[255][111] == 255 && sent[256][111] == 0, "sACN sequence advances and wraps");
        Check(sent[0][126] == 0 && sent[0][127] == 255 && sent[0][637] == 0, "Short frames retain clamping and zero padding");
        // A blocked fake transport establishes ordering without timers or any UDP socket.
        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var inFlight = session.SendAsync([], async (_, route, _) => { Check(route.Universe == 1, "Send owns immutable route"); entered.SetResult(); await release.Task; }, default);
        await entered.Task;
        var disarm = session.DisarmAsync();
        Check(!disarm.IsCompleted, "Disarm waits for the already-started send");
        release.SetResult(); await inFlight; await disarm;
        Check(!session.Armed && !await session.SendAsync([], Record, default), "No sender can run after disarm completion");
        await session.ArmAsync(new OutputRoute("other.local", 2, "sacn"));
        await session.SendAsync([], Record, default);
        Check(sent[^1][111] == 0 && sent[^1][114] == 2, "Each universe owns its sequence");
        try { await session.SendAsync([], (_, _, _) => throw new System.Net.Sockets.SocketException(), default); } catch (System.Net.Sockets.SocketException) { }
        await session.DisarmAsync();
        Check(!session.Armed, "Transport failure releases the session gate");
        await session.ArmAsync(new OutputRoute("old.local", 1, "artnet"));
        var routeEntered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var routeRelease = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var oldSend = session.SendAsync([], async (bytes, route, _) => {
            Check(route.Host == "old.local" && route.Port == 6454 && bytes.Length == 530, "Packet and destination use the same route snapshot");
            routeEntered.SetResult(); await routeRelease.Task;
        }, default);
        await routeEntered.Task;
        var rearm = session.ArmAsync(new OutputRoute("new.local", 3, "sacn"));
        Check(!rearm.IsCompleted, "Rearm cannot mix route fields during a send");
        routeRelease.SetResult(); await oldSend; await rearm;
        await session.SendAsync([], (bytes, route, _) => {
            Check(route.Host == "new.local" && route.Port == 5568 && bytes.Length == 638 && bytes[114] == 3, "New route applied wholly after old send");
            return Task.CompletedTask;
        }, default);
        Console.WriteLine("Output checks passed: sACN packet regression, CID, sequence/wrap, routing bounds, Origin/Host policy, atomic send/disarm; fake transport only.");
    }
}
