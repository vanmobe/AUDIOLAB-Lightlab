using System.Diagnostics;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Lightflow.Runtime;

public sealed record PlaybackEngineState(string Mode, string ActiveLookId, double? HeldAtBeats = null);
public sealed record PlaybackTransition(string Phase, string FromLookId, string ToLookId, double StartAtBeats, double EndAtBeats, double Progress);
public interface IShowEvaluator : IAsyncDisposable
{
    PlaybackTransition? Transition => null;
    Task LoadAsync(JsonElement show, CancellationToken cancellationToken);
    Task<InspectionFrame> EvaluateAsync(double beat, PlaybackEngineState state, CancellationToken cancellationToken, JsonElement? live = null);
    Task<bool> ValidateLiveAsync(JsonElement live, CancellationToken cancellationToken);
    Task ConfigureAudioAsync(PlaybackAudioAnalysis? analysis, CancellationToken cancellationToken) => throw new NotSupportedException("Evaluator ondersteunt geen audio.");
    Task<InspectionFrame> EvaluateAudioAsync(double beat, PlaybackEngineState state, PlaybackAudioPosition audio, CancellationToken cancellationToken, JsonElement? live = null)
        => throw new NotSupportedException("Evaluator ondersteunt geen audio.");
}

/// <summary>One supervised evaluator process, with bounded, sequential NDJSON exchanges.</summary>
public sealed class NodeShowEvaluator : IShowEvaluator
{
    public PlaybackTransition? Transition { get; private set; }
    readonly HashSet<string> lookIds = [];
    const int MaximumLine = 2 * 1024 * 1024;
    static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web) { DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull };
    readonly Process process;
    readonly Task stderr;
    int sequence;
    public NodeShowEvaluator(string workerPath)
    {
        var start = new ProcessStartInfo(Environment.GetEnvironmentVariable("LIGHTLAB_NODE_PATH") ?? "node")
        {
            UseShellExecute = false,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true
        };
        start.ArgumentList.Add(Path.GetFullPath(workerPath));
        process = Process.Start(start) ?? throw new InvalidOperationException("Evaluator kon niet starten.");
        // Drain diagnostics without retaining or exposing child/user content.
        stderr = Task.Run(async () => { var buffer = new char[4096]; try { while (await process.StandardError.ReadAsync(buffer) > 0) { } } catch (Exception) { } });
    }
    async Task<JsonElement> ExchangeAsync(object message, string requestId, CancellationToken cancellationToken, bool allowRejection = false)
    {
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        deadline.CancelAfter(TimeSpan.FromSeconds(2));
        var token = deadline.Token;
        var input = JsonSerializer.Serialize(message, Options);
        if (Encoding.UTF8.GetByteCount(input) > MaximumLine) throw new InvalidOperationException("Evaluatoraanvraag is te groot.");
        await process.StandardInput.WriteLineAsync(input.AsMemory(), token); await process.StandardInput.FlushAsync(token);
        using var output = new MemoryStream(); var buffer = new byte[16384];
        while (true)
        {
            var count = await process.StandardOutput.BaseStream.ReadAsync(buffer, token);
            if (count == 0) throw new InvalidOperationException("Evaluator is gestopt.");
            var end = Array.IndexOf(buffer, (byte)'\n', 0, count);
            var length = end < 0 ? count : end;
            if (output.Length + length > MaximumLine || (end >= 0 && end != count - 1)) throw new InvalidOperationException("Ongeldig evaluatorantwoord.");
            output.Write(buffer, 0, length);
            if (end < 0) continue;
            using var document = JsonDocument.Parse(output.GetBuffer().AsMemory(0, (int)output.Length));
            var response = document.RootElement;
            if (response.GetProperty("version").GetInt32() != 1 || response.GetProperty("requestId").GetString() != requestId || (!response.GetProperty("ok").GetBoolean() && !allowRejection))
                throw new InvalidOperationException("Evaluator heeft de aanvraag afgewezen.");
            return response.Clone();
        }
    }
    public async Task LoadAsync(JsonElement show, CancellationToken cancellationToken)
    {
        var id = (++sequence).ToString();
        await ExchangeAsync(new { version = 1, requestId = id, op = "load", show }, id, cancellationToken);
        lookIds.Clear();
        foreach (var look in show.GetProperty("looks").EnumerateArray()) lookIds.Add(look.GetProperty("id").GetString()!);
        Transition = null;
    }
    public async Task<InspectionFrame> EvaluateAsync(double beat, PlaybackEngineState state, CancellationToken cancellationToken, JsonElement? live = null)
    {
        return await EvaluateCoreAsync(beat, state, null, cancellationToken, live);
    }
    public async Task ConfigureAudioAsync(PlaybackAudioAnalysis? analysis, CancellationToken cancellationToken)
    {
        var id = (++sequence).ToString();
        // The null is explicit despite the general serializer's null omission policy.
        await ExchangeAsync(new Dictionary<string, object?> { ["version"] = 1, ["requestId"] = id, ["op"] = "audio", ["analysis"] = analysis }, id, cancellationToken);
        Transition = null;
    }
    public Task<InspectionFrame> EvaluateAudioAsync(double beat, PlaybackEngineState state, PlaybackAudioPosition audio, CancellationToken cancellationToken, JsonElement? live = null)
        => EvaluateCoreAsync(beat, state, audio, cancellationToken, live);
    async Task<InspectionFrame> EvaluateCoreAsync(double beat, PlaybackEngineState state, PlaybackAudioPosition? audio, CancellationToken cancellationToken, JsonElement? live)
    {
        var id = (++sequence).ToString();
        var reply = await ExchangeAsync(new { version = 1, requestId = id, op = "evaluate", atBeats = beat, state, live, audio }, id, cancellationToken);
        Transition = reply.TryGetProperty("transition", out var transition) ? ReadTransition(transition, state, beat, lookIds) : null;
        return reply.GetProperty("frame").Deserialize<InspectionFrame>(DmxInspection.JsonOptions) ?? throw new InvalidOperationException("Evaluatorframe ontbreekt.");
    }
    public static PlaybackTransition ReadTransition(JsonElement value, PlaybackEngineState state, double beat, IReadOnlySet<string> lookIds)
    {
        var transition = value.Deserialize<PlaybackTransition>(DmxInspection.JsonOptions) ?? throw new InvalidOperationException("Ongeldige overgangsstatus.");
        if (state.Mode != "automation" || transition.ToLookId != state.ActiveLookId || !lookIds.Contains(transition.FromLookId) || !lookIds.Contains(transition.ToLookId)
            || !double.IsFinite(transition.StartAtBeats) || transition.StartAtBeats < 0 || transition.StartAtBeats > 1e9 + 8
            || !double.IsFinite(transition.EndAtBeats) || transition.EndAtBeats < transition.StartAtBeats || transition.EndAtBeats > transition.StartAtBeats + 32
            || !double.IsFinite(transition.Progress) || transition.Progress < 0 || transition.Progress > 1
            || !(transition.Phase == "queued" && beat < transition.StartAtBeats && transition.Progress == 0
                || transition.Phase == "fading" && beat >= transition.StartAtBeats && beat < transition.EndAtBeats
                    && Math.Abs(transition.Progress - (beat - transition.StartAtBeats) / (transition.EndAtBeats - transition.StartAtBeats)) <= 1e-9))
            throw new InvalidOperationException("Ongeldige overgangsstatus.");
        return transition;
    }
    public async Task<bool> ValidateLiveAsync(JsonElement live, CancellationToken cancellationToken)
    {
        var id = (++sequence).ToString();
        var reply = await ExchangeAsync(new { version = 1, requestId = id, op = "validate-live", live }, id, cancellationToken, allowRejection: true);
        return reply.GetProperty("ok").GetBoolean();
    }
    public async ValueTask DisposeAsync()
    {
        try
        {
            try { process.StandardInput.Close(); } catch (Exception) { }
            try { if (!process.HasExited) process.Kill(entireProcessTree: true); }
            catch (Exception error) when (error is InvalidOperationException or System.ComponentModel.Win32Exception or NotSupportedException) { }
            try { await process.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(2)); } catch (Exception) { }
            try { await stderr.WaitAsync(TimeSpan.FromSeconds(1)); } catch (Exception) { }
        }
        finally { process.Dispose(); }
    }
}
