using System.Text.Json;
using Lightflow.Runtime;

static class PlaybackChecks
{
    public static async Task Run()
    {
        static void Check(bool ok, string message) { if (!ok) throw new Exception(message); }
        var transitionLooks = new HashSet<string> { "look-a", "look-b" };
        var transitionState = new PlaybackEngineState("automation", "look-b");
        var validTransition = new PlaybackTransition("queued", "look-a", "look-b", 4, 8, 0);
        Check(NodeShowEvaluator.ReadTransition(JsonSerializer.SerializeToElement(validTransition, DmxInspection.JsonOptions), transitionState, 1, transitionLooks) == validTransition, "Typed transition diagnostics preserve a valid queue");
        foreach (var invalid in new[] { validTransition with { Phase = "unknown" }, validTransition with { ToLookId = "missing" }, validTransition with { Progress = .2 }, validTransition with { EndAtBeats = 40 }, validTransition with { StartAtBeats = -1 } })
        {
            var rejected = false;
            try { NodeShowEvaluator.ReadTransition(JsonSerializer.SerializeToElement(invalid, DmxInspection.JsonOptions), transitionState, 1, transitionLooks); } catch (InvalidOperationException) { rejected = true; }
            Check(rejected, "Invalid transition diagnostics rejected before publication");
        }
        using var show = JsonDocument.Parse("""{"groups":[{"id":"front","intensity":0.7},{"id":"wash","intensity":0.8}],"fixtures":[{"id":"a","profileId":"varytec-theater-spot-100","modeId":"2ch","patch":{"universe":1,"address":1}},{"id":"b","profileId":"varytec-theater-spot-100","modeId":"2ch","patch":{"universe":2,"address":511}}],"routes":[],"looks":[{"id":"look-a"},{"id":"look-b"}]}""");
        var clock = new PlaybackTestTime(); var workers = new List<PlaybackFakeEvaluator>();
        await using var session = new PlaybackSession(() => { var worker = new PlaybackFakeEvaluator(); workers.Add(worker); return worker; }, clock);
        var started = await session.StartAsync(new(1, show.RootElement, 120, "look-a"), default);
        Check(started.Status == "running" && started.UniverseCount == 2 && !started.OutputSent && session.Snapshot is not null, "Start validates and compiles multiple universes before running");
        var id = started.SessionId!;
        Check(session.LoadedShow!.Show.GetRawText() == show.RootElement.GetRawText() && session.Preview!.Revision == 0, "Loaded show remains an immutable reconnect snapshot");
        var liveControls = JsonSerializer.SerializeToElement(new { overrides = new { front = new { mode = "off", intensity = .1 } }, links = new[] { new[] { "front", "wash" } } });
        var liveMasters = JsonSerializer.SerializeToElement(new { front = .3, wash = .4 });
        var liveCommand = new PlaybackCommand(1, id, "live", ExpectedRevision: 0, Controls: liveControls, GroupIntensities: liveMasters, ColorLockId: JsonSerializer.SerializeToElement("palette"));
        await session.CommandAsync(liveCommand, default);
        Check(session.Preview!.Revision == 1 && session.Preview.ColorLockId == "palette" && session.Preview.GroupIntensities.GetProperty("front").GetDouble() == .3, "Live state is published with its own atomic revision");
        Check(session.Preview.Status.AtBeats == session.Preview.Frame.AtBeats && session.Preview.Status.Mode == session.Preview.Frame.Mode, "Preview status and frame share the same sample");
        try { await session.CommandAsync(liveCommand, default); throw new Exception("Stale live revision accepted"); } catch (PlaybackConflictException) { }
        var invalidControls = JsonSerializer.SerializeToElement(new { overrides = new { invalid = new { intensity = .2 } }, links = Array.Empty<string[]>() });
        try { await session.CommandAsync(liveCommand with { ExpectedRevision = 1, Controls = invalidControls }, default); throw new Exception("Invalid live data accepted"); } catch (ArgumentException) { }
        Check(session.Status.Status == "running" && session.Preview.Revision == 1 && session.Preview.ColorLockId == "palette", "Rejected live data does not fault or mutate playback");
        try { await session.StartAsync(new(1, show.RootElement, 120, "look-a"), default); throw new Exception("Implicit replacement accepted"); } catch (PlaybackConflictException) { }
        try { await session.CommandAsync(new(1, "stale", "stop"), default); throw new Exception("Stale command accepted"); } catch (PlaybackConflictException) { }
        clock.Advance(1);
        var bpm = await session.CommandAsync(new(1, id, "bpm", Bpm: 60), default);
        Check(Math.Abs(bpm.AtBeats - 2) < .00001, "BPM change preserves phase at elapsed boundary");
        clock.Advance(1);
        var held = await session.CommandAsync(new(1, id, "mode", Mode: "static"), default);
        Check(Math.Abs(held.AtBeats - 3) < .00001 && workers[0].State?.HeldAtBeats == 3, "Static captures runtime beat, not browser time");
        clock.Advance(2);
        await session.CommandAsync(new(1, id, "bpm", Bpm: 90), default);
        Check(workers[0].State?.HeldAtBeats == 3, "Tempo updates preserve static hold");
        var black = await session.CommandAsync(new(1, id, "mode", Mode: "blackout"), default);
        Check(black.Mode == "blackout" && session.Snapshot!.Inspection.Universes.All(u => u.Channels.All(v => v == 0)), "Runtime compiler enforces blackout even with inconsistent evaluator levels");
        var selected = await session.CommandAsync(new(1, id, "look", LookId: "look-b"), default);
        Check(selected.LookId == "look-b" && selected.Mode == "automation" && workers[0].State!.HeldAtBeats is null, "Look command resets creative mode/hold");
        Check(session.Preview!.Controls.GetProperty("overrides").EnumerateObject().Count() == 0 && session.Preview.ColorLockId is null
            && session.Preview.Controls.GetProperty("links").GetArrayLength() == 1 && session.Preview.GroupIntensities.GetProperty("front").GetDouble() == .3,
            "Look clears overrides and lock while preserving links and session masters");
        Check(session.Preview.Revision == 6, "All accepted live/BPM/mode/Look commands advance revision, not pump frames");
        try { await session.CommandAsync(liveCommand with { ExpectedRevision = 5 }, default); throw new Exception("Old tab restored pre-Look controls"); } catch (PlaybackConflictException) { }
        var initialCount = session.Status.FrameCount;
        await Task.Delay(100);
        Check(session.Status.FrameCount > initialCount, "Pump runs autonomously without browser requests");
        await session.CommandAsync(new(1, id, "stop"), default);
        await session.CommandAsync(new(1, id, "stop"), default);
        Check(workers[0].Disposed && session.Snapshot is null && session.Status.Status == "stopped" && session.Preview is null && session.LoadedShow is null, "Stop is idempotent and releases worker/buffers/show/live state");
        var restart = await session.StartAsync(new(1, show.RootElement, 120, "look-a"), default);
        Check(restart.SessionId != id, "Restart creates a new session fence");
        Check(session.Preview!.Revision == 0 && session.Preview.ColorLockId is null && session.Preview.GroupIntensities.GetProperty("front").GetDouble() == .7, "New session restores loaded masters and empty transient state");
        try { await session.CommandAsync(new(1, id, "stop"), default); throw new Exception("Old stop affected new session"); } catch (PlaybackConflictException) { }
        workers[^1].Fail = true;
        try { await session.CommandAsync(new(1, restart.SessionId!, "bpm", Bpm: 60), default); throw new Exception("Evaluator failure hidden"); } catch (InvalidOperationException) { }
        Check(session.Status.Status == "faulted" && session.Snapshot is null && workers[^1].Disposed, "Evaluator failure clears stale memory and releases process");
        foreach (var wrong in new[] { "beat", "mode", "fixtures" })
        {
            var next = await session.StartAsync(new(1, show.RootElement, 120, "look-a"), default);
            workers[^1].Wrong = wrong;
            try { await session.CommandAsync(new(1, next.SessionId!, "bpm", Bpm: 60), default); throw new Exception("Bad evaluator data accepted"); } catch (InvalidOperationException) { }
            Check(session.Status.Status == "faulted" && session.Snapshot is null, "Mismatched evaluator " + wrong + " faults instead of retaining stale channels");
        }
        var continued = await session.StartAsync(new(1, show.RootElement, 120, "look-a"), default);
        using var disconnect = new CancellationTokenSource();
        workers[^1].DuringEvaluate = () => disconnect.Cancel();
        await session.CommandAsync(new(1, continued.SessionId!, "bpm", Bpm: 70), disconnect.Token);
        Check(session.Status.Status == "running" && session.Status.Bpm == 70, "HTTP disconnect after accepted command does not cancel autonomous evaluator");
        workers[^1].DuringEvaluate = null;
        workers[^1].DisposeFails = true; workers[^1].Fail = true;
        try { await session.CommandAsync(new(1, continued.SessionId!, "mode", Mode: "static"), default); throw new Exception("Evaluator fault hidden"); } catch (InvalidOperationException) { }
        Check(session.Status.Status == "faulted" && session.Snapshot is null, "Platform cleanup failure still discards memory and faults the session");
        Console.WriteLine("Playback checks passed: autonomous pump, two universes, monotonic BPM continuity, static hold, blackout, session fencing, stop and fault cleanup; fake evaluator only.");
    }
}
sealed class PlaybackTestTime : TimeProvider
{
    long ticks;
    public override long TimestampFrequency => TimeSpan.TicksPerSecond;
    public override long GetTimestamp() => Interlocked.Read(ref ticks);
    public void Advance(double seconds) => Interlocked.Add(ref ticks, (long)(seconds * TimeSpan.TicksPerSecond));
}
sealed class PlaybackFakeEvaluator : IShowEvaluator
{
    public bool Disposed, Fail, DisposeFails;
    public string? Wrong;
    public Action? DuringEvaluate;
    public PlaybackEngineState? State;
    public Task LoadAsync(JsonElement show, CancellationToken cancellationToken) => Task.CompletedTask;
    public Task ConfigureAudioAsync(PlaybackAudioAnalysis? analysis, CancellationToken cancellationToken) => Task.CompletedTask;
    public Task<InspectionFrame> EvaluateAudioAsync(double beat, PlaybackEngineState state, PlaybackAudioPosition audio, CancellationToken cancellationToken, JsonElement? live = null)
        => EvaluateAsync(beat, state, cancellationToken, live);
    public Task<bool> ValidateLiveAsync(JsonElement live, CancellationToken cancellationToken) => Task.FromResult(!live.GetProperty("controls").GetProperty("overrides").TryGetProperty("invalid", out _));
    public Task<InspectionFrame> EvaluateAsync(double beat, PlaybackEngineState state, CancellationToken cancellationToken, JsonElement? live = null)
    {
        if (Fail) throw new InvalidOperationException("Test failure");
        State = state;
        DuringEvaluate?.Invoke(); cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(new InspectionFrame(Wrong == "beat" ? beat + 1 : beat, Wrong == "mode" ? "safety" : state.Mode,
            Wrong == "fixtures" ? [] : [new("a", .7, "#ffffff", 0), new("b", .3, "#ffffff", 0)]));
    }
    public ValueTask DisposeAsync() { Disposed = true; if (DisposeFails) throw new System.ComponentModel.Win32Exception("Test cleanup failure"); return ValueTask.CompletedTask; }
}
