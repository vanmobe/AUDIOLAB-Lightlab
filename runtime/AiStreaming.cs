using System.Diagnostics;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Lightflow.Runtime;

public sealed class AiStreamException(string message) : HttpRequestException(message);

public record AiProgress(string Phase, int Attempt, string? Thinking = null, string? Content = null, bool Clipped = false)
{
    public string Type => "progress";
}
public interface IStreamingShowDesignProvider
{
    Task<ShowProposal> ProposeStreamingAsync(ShowDesignRequest request, Func<AiProgress, CancellationToken, Task> report, CancellationToken token);
}

/// <summary>Bounded request-local preview; text is untrusted provider output, never an instruction.</summary>
public sealed class AiProgressReporter(Func<AiProgress, CancellationToken, Task> report)
{
    public const int PreviewLimit = 32 * 1024;
    readonly StringBuilder thinking = new(), content = new();
    readonly Stopwatch timer = Stopwatch.StartNew();
    int retained; bool clipped, clippingSent; string? phase;
    public async Task PhaseAsync(string next, int attempt, CancellationToken token)
    {
        await FlushAsync(attempt, token);
        phase = next;
        await report(new(next, attempt), token);
    }
    public async Task DeltaAsync(string? thought, string? output, int attempt, CancellationToken token)
    {
        void Append(StringBuilder target, string? value)
        {
            if (string.IsNullOrEmpty(value)) return;
            var take = Math.Min(value.Length, PreviewLimit - retained);
            // Do not clip through a UTF-16 surrogate pair.
            if (take > 0 && take < value.Length && char.IsHighSurrogate(value[take - 1])) take--;
            target.Append(value.AsSpan(0, take)); retained += take;
            clipped |= take < value.Length;
        }
        var next = !string.IsNullOrEmpty(output) ? "generating" : !string.IsNullOrEmpty(thought) ? "thinking" : phase;
        if (next is not null && next != phase) await PhaseAsync(next, attempt, token);
        Append(thinking, thought); Append(content, output);
        if (timer.ElapsedMilliseconds >= 100) await FlushAsync(attempt, token);
        // Clipping ends text retention, not model activity. Keep truthful activity alive at 1Hz.
        if (clipped && clippingSent && timer.ElapsedMilliseconds >= 1000)
        {
            await report(new(phase ?? "waiting", attempt, Clipped: true), token);
            timer.Restart();
        }
    }
    public async Task FlushAsync(int attempt, CancellationToken token)
    {
        if (thinking.Length == 0 && content.Length == 0 && (!clipped || clippingSent)) return;
        await report(new(phase ?? "waiting", attempt, thinking.Length == 0 ? null : thinking.ToString(), content.Length == 0 ? null : content.ToString(), clipped), token);
        thinking.Clear(); content.Clear(); clippingSent |= clipped; timer.Restart();
    }
}

public static class OllamaStreamReader
{
    public const int LineLimit = 128 * 1024;
    public const int WireLimit = 16 * 1024 * 1024;
    const int TracePrefixBytes = 512 * 1024;
    public static async Task<string> ReadAsync(HttpResponseMessage response, CancellationToken token, Action<string, bool>? capture, Func<string?, string?, Task> delta)
    {
        if (!response.IsSuccessStatusCode) return await AiTraceCapture.ReadBodyAsync(response, token, capture);
        using var stream = await response.Content.ReadAsStreamAsync(token);
        using var raw = new MemoryStream();
        using var line = new MemoryStream();
        var buffer = new byte[8192]; var utf8 = new UTF8Encoding(false, true);
        var content = new StringBuilder(); bool done = false, complete = false; string? reason = null;
        int wireBytes = 0, contentBytes = 0;
        async Task ParseLine()
        {
            if (line.Length == 0) return;
            if (done) throw new JsonException("Ollama stuurde gegevens na het afsluitsignaal.");
            var text = utf8.GetString(line.GetBuffer(), 0, (int)line.Length); line.SetLength(0);
            if (string.IsNullOrWhiteSpace(text)) return;
            var item = JsonNode.Parse(text)?.AsObject() ?? throw new JsonException("Ongeldige Ollama-stream.");
            if (item["error"] is not null) throw new AiStreamException("Ollama meldde een fout tijdens het genereren. Probeer minder items tegelijk.");
            if (item["done"] is not JsonValue finished || !finished.TryGetValue<bool>(out done)) throw new JsonException("Ollama-stream mist de afsluitstatus.");
            var thought = item["message"]?["thinking"]?.GetValue<string>();
            var output = item["message"]?["content"]?.GetValue<string>();
            contentBytes += Encoding.UTF8.GetByteCount(output ?? "");
            if (contentBytes > AiTraceCapture.BodyLimit) throw new AiBodyLimitException("Het samengestelde Ollama-ontwerp is te groot. Vraag minder items tegelijk.");
            content.Append(output);
            await delta(thought, output);
            if (done) reason = item["done_reason"]?.GetValue<string>();
        }
        try
        {
            int read;
            while ((read = await stream.ReadAsync(buffer, token)) > 0)
            {
                wireBytes += read;
                var keep = Math.Min(read, TracePrefixBytes - (int)raw.Length);
                raw.Write(buffer, 0, keep);
                if (wireBytes > WireLimit) throw new AiBodyLimitException("Ollama-stream is te groot. Vraag minder items tegelijk.");
                for (int i = 0; i < read; i++)
                {
                    if (buffer[i] == '\n') await ParseLine();
                    else
                    {
                        if (line.Length >= LineLimit) throw new AiBodyLimitException("Een Ollama-streamregel is te groot. Vraag minder items tegelijk.");
                        line.WriteByte(buffer[i]);
                    }
                }
            }
            if (line.Length > 0) await ParseLine();
            if (!done) throw new AiStreamException("De verbinding met Ollama stopte voordat het ontwerp klaar was. Probeer opnieuw of vraag minder items tegelijk.");
            complete = true;
            return new JsonObject { ["done"] = true, ["done_reason"] = reason, ["message"] = new JsonObject { ["content"] = content.ToString() } }.ToJsonString();
        }
        finally
        {
            // Capture the actual NDJSON exchange, not the assembled proposal envelope.
            capture?.Invoke(Encoding.UTF8.GetString(raw.GetBuffer(), 0, (int)raw.Length), !complete || wireBytes > raw.Length);
        }
    }
}
