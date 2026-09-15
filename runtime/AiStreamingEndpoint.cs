using System.Text.Json;
using Microsoft.AspNetCore.Http;

namespace Lightflow.Runtime;

/// <summary>Serialized, awaited writes bound memory and propagate browser backpressure to Ollama.</summary>
public sealed class AiStreamingResult(IShowDesignProvider provider, ShowDesignRequest request, string? apiKey) : IResult {
    public async Task ExecuteAsync(HttpContext context) {
        context.Response.ContentType = "application/x-ndjson; charset=utf-8";
        context.Response.Headers.CacheControl = "no-store";
        context.Response.Headers["X-Accel-Buffering"] = "no";
        using var lifetime = CancellationTokenSource.CreateLinkedTokenSource(context.RequestAborted);
        // Includes blocked browser writes as well as inference; model lookup retains its own 10s limit.
        lifetime.CancelAfter(TimeSpan.FromMinutes(request.OllamaTimeoutMinutes) + TimeSpan.FromSeconds(10));
        using var heartbeatStop = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token);
        using var writes = new SemaphoreSlim(1, 1);
        var json = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        async Task Write(object item, CancellationToken token) {
            await writes.WaitAsync(token);
            try {
                await context.Response.WriteAsync(JsonSerializer.Serialize(item, json) + "\n", token);
                await context.Response.Body.FlushAsync(token);
            } finally { writes.Release(); }
        }
        async Task Heartbeats() {
            try {
                using var timer = new PeriodicTimer(TimeSpan.FromSeconds(5));
                while (await timer.WaitForNextTickAsync(heartbeatStop.Token))
                    await Write(new { type = "heartbeat" }, heartbeatStop.Token);
            } catch (OperationCanceledException) when (heartbeatStop.IsCancellationRequested) { }
            catch { lifetime.Cancel(); throw; }
        }
        var heartbeat = Heartbeats();
        async Task StopHeartbeat() {
            heartbeatStop.Cancel();
            try { await heartbeat; } catch (OperationCanceledException) { }
        }
        try {
            ShowProposal result;
            if (provider is IStreamingShowDesignProvider streaming)
                result = await streaming.ProposeStreamingAsync(request, (eventData, token) => Write(eventData, token), lifetime.Token);
            else {
                await Write(new AiProgress("waiting", 1), lifetime.Token);
                result = await provider.ProposeAsync(request, lifetime.Token);
                await Write(new AiProgress("validating", 1), lifetime.Token);
            }
            await StopHeartbeat();
            await Write(new { type = "result", result }, lifetime.Token);
        } catch (Exception error) when (!context.RequestAborted.IsCancellationRequested && !lifetime.IsCancellationRequested) {
            await StopHeartbeat();
            var cause = error is AiTraceException traceError ? traceError.InnerException! : error;
            var message = cause switch {
                AiBusyException => cause.Message,
                HttpRequestException => cause.Message,
                ArgumentException => "Ongeldige ontwerpaanvraag. Controleer aantallen en showcontext.",
                OperationCanceledException => "Ontwerpaanvraag geannuleerd of verlopen. Probeer opnieuw.",
                _ => "Provider gaf geen geldig ontwerp terug. Bekijk de diagnose of vraag minder items tegelijk."
            };
            if (!string.IsNullOrEmpty(apiKey)) message = message.Replace(apiKey, "[REDACTED_API_KEY]", StringComparison.Ordinal);
            await Write(new { type = "error", error = message, trace = (error as AiTraceException)?.Trace, code = cause is AiBusyException ? "ai_busy" : "ai_generation_failed" }, lifetime.Token);
        } finally { await StopHeartbeat(); }
    }
}
