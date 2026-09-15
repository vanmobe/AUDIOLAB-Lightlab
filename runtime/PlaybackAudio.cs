using System.Text.Json;

namespace Lightflow.Runtime;

public sealed record PlaybackKick(double Time, double Strength);
public sealed record PlaybackAudioAnalysis(double Duration, PlaybackKick[] Kicks, double? Bpm, double Confidence);
public sealed record PlaybackAudioPosition(double Seconds, bool Playing, string Mode, double Bpm, Dictionary<string, string> Reactions, double DecayMs, double Floor);
public sealed record PlaybackAudioCommand(int Version, string SessionId, string AudioId, string Command,
    long? Sequence = null, PlaybackAudioAnalysis? Analysis = null, PlaybackAudioPosition? Position = null);
public sealed record PlaybackAudioStatus(int Version, string? SessionId, string? AudioId, string State, long Sequence, string? Error);

public sealed partial class PlaybackSession {
    PlaybackAudioStatus audioStatus = new(1, null, null, "detached", 0, null);
    PlaybackAudioPosition? audioPosition;
    double audioDuration;
    long audioAnchor;
    public PlaybackAudioStatus AudioStatus => Volatile.Read(ref audioStatus);
    void ResetAudio(string? sessionId) {
        audioPosition = null; audioDuration = 0;
        Volatile.Write(ref audioStatus, new(1, sessionId, null, "detached", 0, null));
    }
    static bool Between(double value, double min, double max) => double.IsFinite(value) && value >= min && value <= max;
    static void ValidateAnalysis(PlaybackAudioAnalysis analysis) {
        if (!Between(analysis.Duration, .001, 600) || analysis.Kicks is null || analysis.Kicks.Length > 7500
            || !Between(analysis.Confidence, 0, 1) || (analysis.Bpm is double bpm && !Between(bpm, 1, 1000)))
            throw new ArgumentException("Ongeldige audioanalyse: maximaal tien minuten en 7500 kicks.");
        double previous = -1;
        foreach (var kick in analysis.Kicks) {
            if (kick is null || !Between(kick.Time, 0, analysis.Duration) || kick.Time <= previous || !Between(kick.Strength, 0, 1))
                throw new ArgumentException("Ongeldige of ongeordende kickdetecties.");
            previous = kick.Time;
        }
    }
    void ValidatePosition(PlaybackAudioPosition position, double duration) {
        if (!Between(position.Seconds, 0, duration) || position.Mode is not ("tempo" or "kicks") || !BpmValid(position.Bpm)
            || !Between(position.DecayMs, 100, 1000) || !Between(position.Floor, 0, 1) || position.Reactions is null)
            throw new ArgumentException("Ongeldige audio-afspeelinstellingen.");
        var groups = loadedShow!.Show.GetProperty("groups").EnumerateArray().Select(g => g.GetProperty("id").GetString()!).ToHashSet();
        if (position.Reactions.Count > groups.Count || position.Reactions.Any(pair => !groups.Contains(pair.Key) || pair.Value is not ("look" or "pulse" or "step" or "static")))
            throw new ArgumentException("Audioreacties verwijzen naar onbekende groepen of effecten.");
    }
    PlaybackAudioPosition? CurrentAudioPosition() => audioPosition is null ? null : audioPosition with {
        Seconds = Math.Min(audioDuration, audioPosition.Seconds + (audioPosition.Playing ? time.GetElapsedTime(audioAnchor).TotalSeconds : 0))
    };
    async Task CheckAudioDeadlineAsync() {
        if (audioStatus.State != "following" || time.GetElapsedTime(audioAnchor).TotalSeconds <= 1) return;
        await StopAudioAsync("lost", "Audioverbinding verloren. Uitvoer is uitgeschakeld; koppel audio opnieuw en bevestig uitvoer expliciet.");
    }
    async Task StopAudioAsync(string nextState, string? error) {
        await output.DisarmAsync();
        audioPosition = null; audioDuration = 0;
        await evaluator!.ConfigureAudioAsync(null, lifetime.Token);
        // Loss never silently falls back to the unrelated free-running clock with lit fixtures.
        Publish(status with { Mode = "blackout", OutputSent = false });
        Volatile.Write(ref audioStatus, audioStatus with { State = nextState, AudioId = nextState == "detached" ? null : audioStatus.AudioId, Error = error });
    }
    public async Task<PlaybackAudioStatus> AudioCommandAsync(PlaybackAudioCommand command, CancellationToken cancellationToken) {
        await gate.WaitAsync(cancellationToken);
        try {
            if (command.Version != 1 || command.AudioId is null || command.AudioId.Length != 32 || command.AudioId.Any(c => !char.IsAsciiHexDigit(c)))
                throw new ArgumentException("Ongeldige audio-opdracht of bronidentificatie.");
            if (status.Status != "running" || command.SessionId != status.SessionId) throw new PlaybackConflictException();
            await CheckAudioDeadlineAsync();
            switch (command.Command) {
                case "attach":
                    if (command.Sequence != 0 || command.Analysis is null || command.Position is null) throw new ArgumentException("Koppelen vereist analyse, positie en volgnummer nul.");
                    if (audioStatus.State == "following" || output.Status.State == "armed") throw new PlaybackConflictException();
                    ValidateAnalysis(command.Analysis); ValidatePosition(command.Position, command.Analysis.Duration);
                    await evaluator!.ConfigureAudioAsync(command.Analysis, lifetime.Token);
                    audioDuration = command.Analysis.Duration;
                    break;
                case "sync":
                    if (command.Analysis is not null || command.Position is null || command.Sequence is null or <= 0 or > 9007199254740991)
                        throw new ArgumentException("Synchronisatie vereist alleen een positie en oplopend volgnummer.");
                    if (audioStatus.State != "following" || audioStatus.AudioId != command.AudioId || command.Sequence <= audioStatus.Sequence) throw new PlaybackConflictException();
                    ValidatePosition(command.Position, audioDuration);
                    break;
                case "detach":
                    if (command.Sequence is not null || command.Analysis is not null || command.Position is not null) throw new ArgumentException("Ontkoppelen heeft geen extra instellingen.");
                    if (audioStatus.AudioId != command.AudioId) throw new PlaybackConflictException();
                    await StopAudioAsync("detached", null);
                    await SampleAsync(lifetime.Token);
                    return audioStatus;
                default: throw new ArgumentException("Onbekende audio-opdracht.");
            }
            // Clone mutable caller data; only one bounded anchor and analysis exist per session.
            audioPosition = command.Position! with { Reactions = new(command.Position!.Reactions) };
            audioAnchor = time.GetTimestamp();
            Volatile.Write(ref audioStatus, new(1, status.SessionId, command.AudioId, "following", command.Sequence!.Value, null));
            await SampleAsync(lifetime.Token);
            return audioStatus;
        } catch (Exception error) when (error is not (ArgumentException or PlaybackConflictException)) {
            await FaultAsync("Audio kon niet veilig geëvalueerd worden. Uitvoer is uitgeschakeld."); throw;
        } finally { gate.Release(); }
    }
}
