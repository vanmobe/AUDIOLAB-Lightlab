using System.Text.Json;

namespace Lightflow.Runtime;

public sealed record PlaybackStart(int Version, JsonElement Show, double Bpm, string LookId);
public sealed record PlaybackCommand(int Version, string SessionId, string Command, string? LookId = null, double? Bpm = null, string? Mode = null,
    long? ExpectedRevision = null, JsonElement Controls = default, JsonElement GroupIntensities = default, JsonElement ColorLockId = default);
public sealed record PlaybackStatus(int Version, string? SessionId, string Status, string Mode, string? LookId, double Bpm, double AtBeats, long FrameCount, int UniverseCount, bool OutputSent, string? Error);
public sealed record PlaybackSnapshot(int Version, string SessionId, InspectionFrame Frame, InspectionResult Inspection);
public sealed record PlaybackLoadedShow(int Version, string SessionId, JsonElement Show);
public sealed record PlaybackPreview(int Version, string SessionId, PlaybackStatus Status, InspectionFrame Frame,
    JsonElement Controls, JsonElement GroupIntensities, string? ColorLockId, long Revision, PlaybackTransition? Transition = null);
public sealed class PlaybackConflictException : Exception;

/// <summary>Runtime-owned clock and compiler; physical output remains a separate explicit session-fenced opt-in.</summary>
public sealed partial class PlaybackSession(Func<IShowEvaluator> createEvaluator, TimeProvider? timeProvider = null, PlaybackOutput? output = null) : IAsyncDisposable {
    readonly PlaybackOutput output = output ?? new();
    readonly TimeProvider time = timeProvider ?? TimeProvider.System;
    readonly SemaphoreSlim gate = new(1, 1);
    readonly CancellationTokenSource lifetime = new();
    IShowEvaluator? evaluator;
    InspectionPatch? patch;
    HashSet<string> looks = [];
    PlaybackStatus status = new(1, null, "idle", "automation", null, 120, 0, 0, 0, false, null);
    PlaybackSnapshot? snapshot;
    PlaybackLoadedShow? loadedShow;
    PlaybackPreview? preview;
    JsonElement live;
    long revision;
    long anchor;
    double anchorBeat;
    double? heldBeat;
    Task? pump;
    public PlaybackStatus Status => Volatile.Read(ref status);
    public PlaybackSnapshot? Snapshot => Volatile.Read(ref snapshot);
    public PlaybackLoadedShow? LoadedShow => Volatile.Read(ref loadedShow);
    public PlaybackPreview? Preview => Volatile.Read(ref preview);
    public PlaybackOutputStatus OutputStatus => output.Status;
    static bool BpmValid(double value) => double.IsFinite(value) && value is >= 30 and <= 240;
    double Beat() => anchorBeat + time.GetElapsedTime(anchor).TotalSeconds * status.Bpm / 60;
    void Publish(PlaybackStatus next) => Volatile.Write(ref status, next);
    public async Task<PlaybackStatus> StartAsync(PlaybackStart request, CancellationToken cancellationToken) {
        await gate.WaitAsync(cancellationToken);
        try {
            if (status.Status is "running" or "starting") throw new PlaybackConflictException();
            if (request.Version != 1 || !BpmValid(request.Bpm) || string.IsNullOrWhiteSpace(request.LookId) || request.LookId.Length > 1024 || request.Show.ValueKind != JsonValueKind.Object)
                throw new ArgumentException("Kies een geldige show, Look en BPM tussen 30 en 240.");
            await ReleaseEvaluator();
            var sessionId = Guid.NewGuid().ToString("N");
            Publish(new(1, sessionId, "starting", "automation", request.LookId, request.Bpm, 0, 0, 0, false, null));
            Volatile.Write(ref snapshot, null);
            Volatile.Write(ref preview, null); Volatile.Write(ref loadedShow, null);
            try {
                var show = request.Show.Clone();
                // Project only physical identifiers/addresses. Never accept caller-supplied channel metadata.
                var fixtureArray = show.GetProperty("fixtures");
                if (fixtureArray.GetArrayLength() > 256) throw new ArgumentException("Maximum 256 lampen per runtime-sessie.");
                var fixtures = fixtureArray.EnumerateArray().Select(f => new InspectionFixture(
                    f.GetProperty("id").GetString()!, f.GetProperty("profileId").GetString()!, f.GetProperty("modeId").GetString()!,
                    f.TryGetProperty("patch", out var p) && p.ValueKind != JsonValueKind.Null ? p.Deserialize<InspectionAddress>(DmxInspection.JsonOptions) : null)).ToArray();
                patch = new(fixtures, show.GetProperty("routes").Deserialize<InspectionRoute[]>(DmxInspection.JsonOptions)!);
                var preflight = DmxInspection.Inspect(new(1, sessionId, patch, new(0, "blackout", fixtures.Select(f => new InspectionFrameFixture(f.Id, 0, "#000000", 0)).ToArray())));
                if (preflight.Issues.Any(i => i.Severity == "error")) throw new ArgumentException("De fysieke patch is niet geldig voor runtime-inspectie.");
                await output.ResetAsync(sessionId, patch);
                ResetAudio(sessionId);
                looks = show.GetProperty("looks").EnumerateArray().Select(l => l.GetProperty("id").GetString()!).ToHashSet();
                if (!looks.Contains(request.LookId)) throw new ArgumentException("De gekozen Look ontbreekt in de show.");
                evaluator = createEvaluator();
                await evaluator.LoadAsync(show, cancellationToken);
                live = JsonSerializer.SerializeToElement(new {
                    controls = new { overrides = new Dictionary<string, object>(), links = Array.Empty<string[]>() },
                    groupIntensities = show.GetProperty("groups").EnumerateArray().ToDictionary(g => g.GetProperty("id").GetString()!, g => g.GetProperty("intensity").GetDouble()),
                    colorLockId = (string?)null
                });
                revision = 0;
                Volatile.Write(ref loadedShow, new(1, sessionId, show));
                anchor = time.GetTimestamp(); anchorBeat = 0; heldBeat = null;
                await SampleAsync(cancellationToken);
                cancellationToken.ThrowIfCancellationRequested();
                Publish(status with { Status = "running" });
                Volatile.Write(ref preview, preview! with { Status = status });
                pump = Task.Run(() => PumpAsync(sessionId));
            } catch (Exception) {
                await FaultAsync("De runtime kon deze show niet laden of coderen. Controleer de patch, Look en evaluatorinstallatie.");
                throw;
            }
            return status;
        } finally { gate.Release(); }
    }
    public async Task<PlaybackStatus> CommandAsync(PlaybackCommand command, CancellationToken cancellationToken) {
        await gate.WaitAsync(cancellationToken);
        try {
            if (command.Version != 1) throw new ArgumentException("Ongeldige opdrachtversie.");
            if (command.SessionId != status.SessionId || status.SessionId is null) throw new PlaybackConflictException();
            var liveFields = command.ExpectedRevision is not null || command.Controls.ValueKind != JsonValueKind.Undefined
                || command.GroupIntensities.ValueKind != JsonValueKind.Undefined || command.ColorLockId.ValueKind != JsonValueKind.Undefined;
            if (command.Command != "live" && liveFields) throw new ArgumentException("Live-instellingen horen bij een live-opdracht.");
            if (command.Command == "stop") {
                if (command.LookId is not null || command.Bpm is not null || command.Mode is not null) throw new ArgumentException("Stop heeft geen extra instellingen.");
                await output.DisarmAsync();
                await ReleaseEvaluator(); Volatile.Write(ref snapshot, null); patch = null; looks.Clear();
                ClearLive(); revision++;
                Publish(status with { Status = "stopped", UniverseCount = 0, OutputSent = false, Error = null }); return status;
            }
            if (status.Status != "running") throw new PlaybackConflictException();
            var beat = Beat();
            switch (command.Command) {
                case "look" when command.LookId is not null && looks.Contains(command.LookId) && command.Bpm is null && command.Mode is null:
                    heldBeat = null;
                    live = JsonSerializer.SerializeToElement(new {
                        controls = new { overrides = new Dictionary<string, object>(), links = live.GetProperty("controls").GetProperty("links") },
                        groupIntensities = live.GetProperty("groupIntensities"), colorLockId = (string?)null
                    });
                    Publish(status with { LookId = command.LookId, Mode = "automation" }); break;
                case "bpm" when command.Bpm is double bpm && BpmValid(bpm) && command.LookId is null && command.Mode is null:
                    anchorBeat = beat; anchor = time.GetTimestamp(); Publish(status with { Bpm = bpm }); break;
                case "mode" when command.Mode is "automation" or "static" or "safety" or "blackout" && command.LookId is null && command.Bpm is null:
                    if (command.Mode == "static" && status.Mode != "static") heldBeat = beat;
                    Publish(status with { Mode = command.Mode }); break;
                case "live" when command.LookId is null && command.Bpm is null && command.Mode is null:
                    if (command.ExpectedRevision is null or < 0 || command.Controls.ValueKind != JsonValueKind.Object || command.GroupIntensities.ValueKind != JsonValueKind.Object || command.ColorLockId.ValueKind is not (JsonValueKind.Null or JsonValueKind.String))
                        throw new ArgumentException("Live-opdracht mist verplichte instellingen.");
                    if (command.ExpectedRevision != revision) throw new PlaybackConflictException();
                    var candidate = JsonSerializer.SerializeToElement(new { controls = command.Controls, groupIntensities = command.GroupIntensities, colorLockId = command.ColorLockId });
                    bool valid;
                    try { valid = await evaluator!.ValidateLiveAsync(candidate, lifetime.Token); }
                    catch (Exception) { await FaultAsync("Live-instellingen konden niet door de evaluator worden gecontroleerd."); throw; }
                    if (!valid) throw new ArgumentException("Ongeldige live-instellingen of onbekende verwijzingen.");
                    live = candidate;
                    break;
                default: throw new ArgumentException("Ongeldige runtime-opdracht of ontbrekende keuze.");
            }
            revision++;
            // An accepted command belongs to the runtime: closing its HTTP connection must not stop playback.
            try { await SampleAsync(lifetime.Token); }
            catch (Exception) { await FaultAsync("De evaluator is gestopt of gaf geen geldig frame. Start de runtime opnieuw."); throw; }
            return status;
        } finally { gate.Release(); }
    }
    public async Task<PlaybackOutputStatus> OutputCommandAsync(PlaybackOutputCommand command, CancellationToken cancellationToken) {
        await gate.WaitAsync(cancellationToken);
        try {
            if (command.Version != 1 || command.Command is not ("arm" or "disarm") || (command.Command == "arm" && !command.Confirmed)
                || (command.Command == "disarm" && command.Confirmed)) throw new ArgumentException("Bevestig fysieke uitvoer expliciet; uitschakelen vereist geen bevestiging.");
            if (command.SessionId != status.SessionId || status.SessionId is null) throw new PlaybackConflictException();
            if (command.Command == "arm") {
                await CheckAudioDeadlineAsync();
                if (audioStatus.State == "lost") throw new PlaybackConflictException();
                if (status.Status != "running" || patch is null || snapshot is null) throw new PlaybackConflictException();
                await output.ArmAsync(command.SessionId, patch, cancellationToken);
                // Resolving routes holds the session gate; never flash a stale audio frame afterwards.
                await CheckAudioDeadlineAsync();
                if (audioStatus.State == "lost") throw new PlaybackConflictException();
                // After arming is accepted it belongs to the runtime, not the HTTP request lifetime.
                var sent = await output.SendAsync(snapshot.Inspection.Universes);
                Publish(status with { OutputSent = sent });
            } else {
                await output.DisarmAsync();
                Publish(status with { OutputSent = false });
            }
            if (preview is not null) Volatile.Write(ref preview, preview with { Status = status });
            return output.Status;
        } finally { gate.Release(); }
    }
    async Task SampleAsync(CancellationToken cancellationToken) {
        await CheckAudioDeadlineAsync();
        var audio = CurrentAudioPosition();
        var beat = audio is null ? Beat() : audio.Seconds * audio.Bpm / 60;
        var frame = audio is null
            ? await evaluator!.EvaluateAsync(beat, new(status.Mode, status.LookId!, heldBeat), cancellationToken, live)
            : await evaluator!.EvaluateAudioAsync(beat, new(status.Mode, status.LookId!, heldBeat), audio, cancellationToken, live);
        if (frame.Mode != status.Mode || frame.AtBeats != beat) throw new InvalidOperationException("Evaluator gaf een verkeerde modus of tijdreferentie.");
        var inspection = DmxInspection.Inspect(new(1, status.SessionId!, patch!, frame));
        if (inspection.Issues.Any(i => i.Severity == "error")) throw new InvalidOperationException("Framecodering afgewezen.");
        Volatile.Write(ref snapshot, new(1, status.SessionId!, frame, inspection));
        var sent = await output.SendAsync(inspection.Universes);
        Publish(status with { AtBeats = beat, FrameCount = status.FrameCount + 1, UniverseCount = inspection.Universes.Length, OutputSent = sent });
        Volatile.Write(ref preview, new(1, status.SessionId!, status, frame, live.GetProperty("controls"), live.GetProperty("groupIntensities"),
            live.GetProperty("colorLockId").ValueKind == JsonValueKind.Null ? null : live.GetProperty("colorLockId").GetString(), revision, evaluator.Transition));
    }
    async Task PumpAsync(string id) {
        // Delay after each sample avoids accumulated ticks when evaluation is slower than 40Hz.
        while (!lifetime.IsCancellationRequested) {
            try {
                await Task.Delay(TimeSpan.FromMilliseconds(25), time, lifetime.Token);
                await gate.WaitAsync(lifetime.Token);
                try {
                    if (status.SessionId != id || status.Status != "running") return;
                    try { await SampleAsync(lifetime.Token); }
                    catch (Exception) { await FaultAsync("De evaluator is gestopt of gaf geen geldig frame. Start de runtime opnieuw."); return; }
                } finally { gate.Release(); }
            } catch (OperationCanceledException) { return; }
        }
    }
    async Task ReleaseEvaluator() {
        var old = evaluator; evaluator = null;
        // Cleanup failures must not prevent fault/stop from discarding the last playable memory frame.
        if (old is not null) { try { await old.DisposeAsync(); } catch (Exception) { } }
    }
    async Task FaultAsync(string message) {
        await output.DisarmAsync();
        await ReleaseEvaluator(); Volatile.Write(ref snapshot, null); patch = null; looks.Clear();
        ClearLive();
        Publish(status with { Status = "faulted", UniverseCount = 0, OutputSent = false, Error = message });
    }
    void ClearLive() { Volatile.Write(ref preview, null); Volatile.Write(ref loadedShow, null); live = default; ResetAudio(status.SessionId); }
    public async ValueTask DisposeAsync() {
        lifetime.Cancel();
        await gate.WaitAsync();
        try { await output.DisarmAsync(); await ReleaseEvaluator(); Volatile.Write(ref snapshot, null); ClearLive(); patch = null; looks.Clear(); Publish(status with { Status = "stopped", UniverseCount = 0, OutputSent = false }); }
        finally { gate.Release(); }
        if (pump is not null) await pump;
        lifetime.Dispose();
    }
}
