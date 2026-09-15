using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Lightflow.Runtime;

static class AiStreamingChecks
{
    static void Check(bool condition, string name) { if (!condition) throw new Exception(name); }
    static string Chunk(string content = "", string thinking = "", bool done = false, string reason = "stop") => JsonSerializer.Serialize(new { message = new { content, thinking }, done, done_reason = done ? reason : null }) + "\n";
    public static async Task Run()
    {
        var raw = Chunk(thinking: "Kleuren overwegen 🌈") + Chunk("{\"summary\":\"één 🌈\"}") + Chunk(done: true);
        var deltas = new List<(string?, string?)>(); string? captured = null; bool truncated = true;
        using var response = new HttpResponseMessage(HttpStatusCode.OK) { Content = new StreamContent(new TinyReads(Encoding.UTF8.GetBytes(raw))) };
        var assembled = await OllamaStreamReader.ReadAsync(response, default, (body, cut) => { captured = body; truncated = cut; }, (thought, output) => { deltas.Add((thought, output)); return Task.CompletedTask; });
        Check(captured == raw && !truncated, "Stream trace is byte-equivalent decoded NDJSON, not assembled envelope");
        Check(JsonNode.Parse(assembled)!["message"]!["content"]!.GetValue<string>() == "{\"summary\":\"één 🌈\"}" && deltas[0].Item1 == "Kleuren overwegen 🌈", "Split UTF8 and thinking/content survive transport");
        foreach (var invalid in new[] { Chunk("{}"), "not-json\n", Chunk(done: true) + Chunk("{}"), "{\"done\":1}\n", "{\"error\":\"private model internals\"}\n" })
        {
            using var bad = new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(invalid) };
            try { await OllamaStreamReader.ReadAsync(bad, default, null, (_, _) => Task.CompletedTask); throw new Exception("Invalid stream accepted"); }
            catch (Exception e) when (e is JsonException or AiStreamException or InvalidOperationException) { Check(!e.Message.Contains("private model internals"), "Raw provider error is not exposed as authored error"); }
        }
        using var huge = new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(new string('x', OllamaStreamReader.LineLimit + 1)) };
        try { await OllamaStreamReader.ReadAsync(huge, default, null, (_, _) => Task.CompletedTask); throw new Exception("Huge line accepted"); } catch (AiBodyLimitException) { }
        var largeWire = string.Concat(Enumerable.Repeat(Chunk(thinking: new string('x', 100_000)), 24)) + Chunk("{}") + Chunk(done: true);
        using var largeResponse = new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(largeWire) };
        bool traceClipped = false;
        await OllamaStreamReader.ReadAsync(largeResponse, default, (_, cut) => traceClipped = cut, (_, _) => Task.CompletedTask);
        Check(traceClipped, "NDJSON framing/thinking may exceed two MiB while retained trace stays bounded");
        foreach (var excessive in new[] {
            string.Concat(Enumerable.Repeat(Chunk(content: new string('x', 100_000)), 22)),
            string.Concat(Enumerable.Repeat(Chunk(thinking: new string('x', 100_000)), 169))
        })
        {
            using var excessiveResponse = new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(excessive) };
            try { await OllamaStreamReader.ReadAsync(excessiveResponse, default, null, (_, _) => Task.CompletedTask); throw new Exception("Stream total limit bypassed"); } catch (AiBodyLimitException) { }
        }
        using var cancellation = new CancellationTokenSource(); cancellation.Cancel();
        using var cancelled = new HttpResponseMessage(HttpStatusCode.OK) { Content = new StreamContent(new TinyReads(Encoding.UTF8.GetBytes(raw))) };
        try { await OllamaStreamReader.ReadAsync(cancelled, cancellation.Token, null, (_, _) => Task.CompletedTask); throw new Exception("Canceled stream accepted"); } catch (OperationCanceledException) { }
        var updates = new List<AiProgress>();
        var reporter = new AiProgressReporter((progress, _) => { updates.Add(progress); return Task.CompletedTask; });
        await reporter.PhaseAsync("waiting", 1, default);
        await reporter.DeltaAsync(new string('x', AiProgressReporter.PreviewLimit + 100), "ignored", 1, default);
        await reporter.PhaseAsync("validating", 1, default);
        Check(updates.Sum(e => (e.Thinking?.Length ?? 0) + (e.Content?.Length ?? 0)) == AiProgressReporter.PreviewLimit && updates.Any(e => e.Clipped), "Preview shared budget clips explicitly without affecting phases");
        await reporter.PhaseAsync("thinking", 2, default);
        var updateCount = updates.Count;
        await Task.Delay(1050);
        await reporter.DeltaAsync("more tokens", null, 2, default);
        Check(updates.Count == updateCount + 1 && updates.Last() is { Clipped: true, Thinking: null, Content: null, Phase: "thinking", Attempt: 2 }, "Incoming model activity stays visible after preview clipping without retaining more text");
        Console.WriteLine("AI streaming checks passed: UTF8 chunks, exact raw trace, malformed/truncated streams, line/cancellation bounds and shared preview clipping.");
    }
    sealed class TinyReads(byte[] bytes) : MemoryStream(bytes)
    {
        public override ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken token = default) => base.ReadAsync(buffer[..Math.Min(buffer.Length, 3)], token);
    }
}
