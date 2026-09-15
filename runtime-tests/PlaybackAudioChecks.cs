using System.Text.Json;
using Lightflow.Runtime;

static class PlaybackAudioChecks
{
    public static async Task Run()
    {
        static void Check(bool condition, string message) { if (!condition) throw new Exception(message); }
        using var show = JsonDocument.Parse("""{"groups":[{"id":"front","intensity":1}],"fixtures":[{"id":"a","profileId":"varytec-theater-spot-100","modeId":"2ch","patch":{"universe":1,"address":1}},{"id":"b","profileId":"varytec-theater-spot-100","modeId":"2ch","patch":{"universe":1,"address":3}}],"routes":[{"id":"r","universe":1,"protocol":"sacn","host":"test.local","enabled":true}],"looks":[{"id":"look-a"}]}""");
        var clock = new PlaybackTestTime(); var worker = new PlaybackFakeEvaluator();
        var sender = new RecordedDmxSender();
        var delayResolution = false;
        var output = new PlaybackOutput(createSender: () => sender, timeProvider: clock, resolveHost: (_, _) =>
        {
            if (delayResolution) clock.Advance(1.1);
            return Task.FromResult(new[] { System.Net.IPAddress.Loopback });
        });
        await using var session = new PlaybackSession(() => worker, clock, output);
        var started = await session.StartAsync(new(1, show.RootElement, 120, "look-a"), default);
        var analysis = new PlaybackAudioAnalysis(10, [new(1, 1), new(2, .5)], 60, .9);
        var position = new PlaybackAudioPosition(1, true, "kicks", 60, new() { ["front"] = "pulse" }, 300, .1);
        var attach = new PlaybackAudioCommand(1, started.SessionId!, new string('a', 32), "attach", 0, analysis, position);
        var wire = JsonSerializer.Serialize(attach, DmxInspection.JsonOptions);
        Check(JsonSerializer.Deserialize<PlaybackAudioCommand>(wire, DmxInspection.JsonOptions)!.Position!.Playing, "Audio wire roundtrip retains required boolean");
        foreach (var invalidWire in new[] { wire.Replace("\"playing\":true,", ""), wire.Replace("\"seconds\":1", "\"seconds\":1,\"seconds\":2"),
            wire.Replace("\"floor\":0.1", "\"floor\":0.1,\"script\":true"), wire.Replace("\"time\":1", "\"time\":\"1\""), wire.Replace("\"bpm\":60,\"confidence\"", "\"confidence\"") })
        {
            try { JsonSerializer.Deserialize<PlaybackAudioCommand>(invalidWire, DmxInspection.JsonOptions); throw new Exception("Invalid audio wire accepted"); } catch (JsonException) { }
        }
        foreach (var invalid in new[] { attach with { Version = 2 }, attach with { AudioId = "x" }, attach with { Sequence = 1 },
            attach with { Analysis = analysis with { Duration = 601 } }, attach with { Analysis = analysis with { Kicks = [new(2, 1), new(1, 1)] } },
            attach with { Position = position with { Seconds = 11 } }, attach with { Position = position with { Reactions = new() { ["unknown"] = "pulse" } } } })
        {
            try { await session.AudioCommandAsync(invalid, default); throw new Exception("Invalid audio accepted"); } catch (ArgumentException) { }
        }
        await session.AudioCommandAsync(attach, default);
        Check(session.AudioStatus.State == "following" && session.Status.AtBeats == 1 && session.OutputStatus.State == "disarmed", "Attach anchors media without arming output");
        await session.OutputCommandAsync(new(1, started.SessionId!, "arm", true), default);
        Check(session.OutputStatus.State == "armed" && sender.Packets.Any(p => p.Packet[126] > 0), "Explicit arm sends followed frame via ordinary DMX encoder");
        try { await session.AudioCommandAsync(attach with { AudioId = new string('b', 32) }, default); throw new Exception("Audio stolen"); } catch (PlaybackConflictException) { }
        clock.Advance(.25);
        await session.CommandAsync(new(1, started.SessionId!, "mode", Mode: "automation"), default);
        Check(session.Status.AtBeats == 1.25, "Monotonic runtime advances between browser anchors");
        var sync = attach with { Command = "sync", Analysis = null, Sequence = 1, Position = position with { Seconds = 2, Playing = false } };
        await session.AudioCommandAsync(sync, default);
        clock.Advance(.25);
        await session.CommandAsync(new(1, started.SessionId!, "mode", Mode: "automation"), default);
        Check(session.Status.AtBeats == 2, "Paused source remains on its media frame");
        try { await session.AudioCommandAsync(sync, default); throw new Exception("Stale sequence accepted"); } catch (PlaybackConflictException) { }
        try { await session.AudioCommandAsync(sync with { Sequence = 2, SessionId = "stale" }, default); throw new Exception("Stale session accepted"); } catch (PlaybackConflictException) { }
        clock.Advance(1.1);
        await session.CommandAsync(new(1, started.SessionId!, "mode", Mode: "automation"), default);
        Check(session.AudioStatus.State == "lost" && session.Status.Mode == "blackout" && session.OutputStatus.State == "disarmed"
            && session.Snapshot!.Inspection.Universes.All(u => u.Channels.All(c => c == 0)), "Missing heartbeat blacks out and disarms even while source paused");
        Check(sender.Packets.TakeLast(6).All(p => p.Packet.AsSpan(126).ToArray().All(c => c == 0)) && sender.Packets.TakeLast(3).All(p => p.Packet[112] == 0x40), "Watchdog attempts black DMX and sACN termination before releasing sender");
        try { await session.AudioCommandAsync(sync with { Sequence = 2 }, default); throw new Exception("Sync recovered lost output"); } catch (PlaybackConflictException) { }
        try { await session.OutputCommandAsync(new(1, started.SessionId!, "arm", true), default); throw new Exception("Lost source armed"); } catch (PlaybackConflictException) { }
        await session.AudioCommandAsync(attach, default);
        Check(session.AudioStatus.State == "following" && session.Status.Mode == "blackout", "Explicit reattach preserves blackout and never arms");
        await session.CommandAsync(new(1, started.SessionId!, "look", LookId: "look-a"), default);
        var packetCount = sender.Packets.Count; delayResolution = true;
        try { await session.OutputCommandAsync(new(1, started.SessionId!, "arm", true), default); throw new Exception("Expired audio armed after DNS"); } catch (PlaybackConflictException) { }
        Check(session.AudioStatus.State == "lost" && sender.Packets.Skip(packetCount).All(p => p.Packet.AsSpan(126).ToArray().All(c => c == 0)), "Route resolution cannot flash expired audio frame");
        delayResolution = false;
        await session.AudioCommandAsync(attach, default);
        await session.AudioCommandAsync(attach with { Command = "detach", Sequence = null, Analysis = null, Position = null }, default);
        Check(session.AudioStatus.State == "detached" && session.AudioStatus.AudioId is null && session.Status.Mode == "blackout", "Detach clears owner and blacks out");
        await session.CommandAsync(new(1, started.SessionId!, "stop"), default);
        Check(session.AudioStatus.State == "detached" && session.AudioStatus.AudioId is null, "Stop releases all source state");
        Console.WriteLine("Playback audio checks passed: validation, media clock, pause, stale session/sequence, ownership, watchdog blackout/disarm, explicit recovery and detach.");
    }
}
