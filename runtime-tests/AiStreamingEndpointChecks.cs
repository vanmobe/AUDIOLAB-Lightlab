using System.Text;
using System.Text.Json.Nodes;
using Lightflow.Runtime;
using Microsoft.AspNetCore.Http;

static class AiStreamingEndpointChecks
{
    static void Check(bool condition, string name) { if (!condition) throw new Exception(name); }
    public static async Task Run()
    {
        var request = new ShowDesignRequest("Test", new("colorProfiles", 1, 0, 0, false), new());
        var context = new DefaultHttpContext(); context.Response.Body = new MemoryStream();
        await new AiStreamingResult(new SlowProvider(), request, null).ExecuteAsync(context);
        var text = Encoding.UTF8.GetString(((MemoryStream)context.Response.Body).ToArray());
        var events = text.Split('\n', StringSplitOptions.RemoveEmptyEntries).Select(line => JsonNode.Parse(line)!).ToArray();
        Check(context.Response.ContentType == "application/x-ndjson; charset=utf-8" && context.Response.Headers.CacheControl == "no-store", "NDJSON endpoint has explicit no-store content type");
        Check(events.Any(item => item["type"]!.GetValue<string>() == "heartbeat") && events.Last()["type"]!.GetValue<string>() == "result", "Heartbeat is serialized and cannot follow terminal result");
        Check(events.Where(item => item["type"]!.GetValue<string>() == "progress").Select(item => item["phase"]!.GetValue<string>()).SequenceEqual(new[] { "waiting", "validating" }), "Non-stream providers get truthful generic phases without exposed reasoning");
        var failed = new DefaultHttpContext(); failed.Response.Body = new MemoryStream();
        await new AiStreamingResult(new SlowProvider(true), request, null).ExecuteAsync(failed);
        var error = JsonNode.Parse(Encoding.UTF8.GetString(((MemoryStream)failed.Response.Body).ToArray()).Split('\n', StringSplitOptions.RemoveEmptyEntries).Last())!;
        Check(error["type"]!.GetValue<string>() == "error" && error["code"]!.GetValue<string>() == "ai_busy", "Streaming failure is a terminal typed error, not invalid mixed JSON");
        using var cancellation = new CancellationTokenSource();
        var aborted = new DefaultHttpContext(); aborted.Response.Body = new MemoryStream(); aborted.RequestAborted = cancellation.Token;
        cancellation.CancelAfter(25);
        try { await new AiStreamingResult(new SlowProvider(), request, null).ExecuteAsync(aborted); throw new Exception("Aborted client kept generation alive"); } catch (OperationCanceledException) { }
        Check(!Encoding.UTF8.GetString(((MemoryStream)aborted.Response.Body).ToArray()).Contains("\"type\":\"result\""), "Aborted client receives no late proposal and heartbeat stops");
        Console.WriteLine("AI endpoint checks passed: NDJSON/no-store, serialized heartbeat/result ordering, generic non-Ollama progress and typed busy error.");
    }
    sealed class SlowProvider(bool busy = false) : IShowDesignProvider
    {
        public string Id => "fake";
        public async Task<ShowProposal> ProposeAsync(ShowDesignRequest request, CancellationToken token)
        {
            if (busy) throw new AiBusyException();
            await Task.Delay(5100, token);
            return new("fake", "Test", [], [], []);
        }
    }
}
