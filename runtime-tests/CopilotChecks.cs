using Lightflow.Runtime;
using System.Text.Json;
using System.Text.Json.Nodes;

static class CopilotChecks {
    static void Check(bool ok, string message) { if (!ok) throw new Exception(message); }
    public static async Task Run() {
        var show = JsonNode.Parse("""{"groups":[{"id":"wash","name":"Wash"}],"fixtures":[],"colorProfiles":[],"programs":[],"looks":[]}""")!.AsObject();
        var request = new ShowDesignRequest("Warm licht", new("colorProfiles", 1, 0, 0, false), show, "test-model", true, Provider: "copilot");
        var fake = new Fake(); var provider = new CopilotShowDesignProvider(fake);
        var progress = new List<AiProgress>();
        var result = await provider.ProposeStreamingAsync(request, (value, _) => { progress.Add(value); return Task.CompletedTask; }, default);
        Check(result.Provider == "copilot" && result.Model == "test-model" && result.ColorProfiles.Count == 1, "Copilot validated result/model provenance");
        Check(progress.Select(p => p.Phase).Contains("generating") && progress.Last().Phase == "validating" && progress.All(p => p.Thinking is null), "Copilot public content and real phase signals only");
        Check(result.Trace!.Attempts.Single().RequestBody.Contains("application SDK input, not raw provider HTTP") && result.Trace.Attempts[0].ResponseStatus is null, "SDK trace is not falsely called HTTP");
        Check(result.Trace.Attempts[0].RequestBody.Contains("collectionGuidance") && result.Trace.Attempts[0].RequestBody.Contains("Act as an idea generator"), "Copilot receives shared collection novelty and operator-selection guidance");
        Check((await provider.ProposeAsync(request with { IncludeTrace = false }, default)).Trace is null, "Copilot trace optional");
        foreach (var model in new[] { "unavailable", "", "bad\nmodel" }) {
            var count = fake.Calls;
            try { await provider.ProposeAsync(request with { Model = model, IncludeTrace = false }, default); throw new Exception("Invalid Copilot model accepted"); } catch (ArgumentException) { }
            Check(fake.Calls == count, "Invalid models never generated");
        }
        fake.Answer = "{}";
        try { await provider.ProposeAsync(request with { IncludeTrace = false }, default); throw new Exception("Bad Copilot answer accepted"); } catch (JsonException) { }
        fake.Answer = null;
        foreach (var opening in new[] { "```json\n", "```\n" }) {
            fake.Wrap = value => opening + value + "\n```";
            var fenced = await provider.ProposeAsync(request, default);
            Check(fenced.ColorProfiles.Count == 1 && fenced.Trace!.Attempts[0].ResponseBody!.StartsWith(opening), "Whole JSON fences accepted without changing raw trace");
        }
        foreach (var wrap in new Func<string, string>[] {
            value => "Here is your proposal:\n```json\n" + value + "\n```",
            value => "```json\n" + value + "\n```\nDone",
            value => "```json\n" + value + "\n```\n```json\n{}\n```",
            value => "```json\n" + value,
            value => "```javascript\n" + value + "\n```"
        }) {
            fake.Wrap = wrap;
            try { await provider.ProposeAsync(request with { IncludeTrace = false }, default); throw new Exception("Non-whole or invalid JSON fence accepted"); } catch (JsonException) { }
        }
        fake.Wrap = value => value;
        fake.Answer = null; fake.Block = true;
        using var cancel = new CancellationTokenSource();
        var pending = provider.ProposeAsync(request with { IncludeTrace = false }, cancel.Token);
        await fake.Entered.Task;
        try { await provider.ProposeAsync(request with { IncludeTrace = false }, default); throw new Exception("Concurrent Copilot request accepted"); } catch (AiBusyException) { }
        cancel.Cancel();
        try { await pending; throw new Exception("Copilot cancellation ignored"); } catch (OperationCanceledException) { }
        fake.Block = false;
        await provider.ProposeAsync(request, default);
        fake.Authenticated = false;
        try { await provider.ProposeAsync(request with { IncludeTrace = false }, default); throw new Exception("Unauthenticated request accepted"); } catch (HttpRequestException) { }
        var config = CopilotSdkTransport.SafeSession("model", "system", "/test/scratch");
        Check(CopilotSdkTransport.SelectModels([
            new() { Id = "auto" }, new() { Id = "allowed", Policy = new() { State = "enabled" } },
            new() { Id = "blocked", Policy = new() { State = "disabled" } }, new() { Id = "bad\nmodel" }
        ]).SequenceEqual(new[] { "allowed" }), "Auto routing and policy-disabled models excluded");
        Check(config.AvailableTools is { Count: 0 } && config.Tools is { Count: 0 } && config.McpServers is { Count: 0 }, "No SDK tools or MCP servers");
        Check(config.EnableConfigDiscovery == false && config.EnableSkills == false && config.EnableFileHooks == false && config.EnableHostGitOperations == false && config.EnableSessionStore == false && config.SkipCustomInstructions == true && config.Memory?.Enabled == false && config.InfiniteSessions?.Enabled == false, "No ambient instructions, filesystem hooks, memory or shared store");
        Check(config.SystemMessage?.Mode == GitHub.Copilot.SystemMessageMode.Replace && config.PluginDirectories is { Count: 0 }, "No appended coding-agent context");
        Check(CopilotSdkTransport.SafeEnvironment().Keys.All(key => !key.Contains("TOKEN") && !key.StartsWith("OTEL") && key != "NODE_OPTIONS"), "No inherited auth/telemetry/node overrides");
        foreach (var name in new[] { "GH_TOKEN", "GITHUB_TOKEN", "COPILOT_GITHUB_TOKEN", "COPILOT_SDK_AUTH_TOKEN", "NODE_OPTIONS", "OTEL_EXPORTER_OTLP_HEADERS" }) {
            var previous = Environment.GetEnvironmentVariable(name);
            try { Environment.SetEnvironmentVariable(name, "SENTINEL"); Check(!CopilotSdkTransport.SafeEnvironment().ContainsKey(name), "Injected credential/telemetry overrides excluded"); }
            finally { Environment.SetEnvironmentVariable(name, previous); }
        }
        var encoded = JsonSerializer.SerializeToUtf8Bytes(request, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        Check(AiRequestInput.Read(encoded).Provider == "copilot", "Optional provider passes strict envelope");
        var contaminated = JsonNode.Parse("""{"groups":[{"id":"wash","name":"Wash","secret":"SENTINEL"}],"fixtures":[{"id":"f","position":{"x":1,"y":2,"z":3,"secret":"SENTINEL"}}],"bandMembers":[{"id":"b","position":{"x":0,"secret":"SENTINEL"}}],"colorProfiles":[{"id":"c","secret":"SENTINEL"}],"programs":[{"id":"p","secret":"SENTINEL","pattern":{"version":1,"floor":0,"secret":"SENTINEL","steps":[{"selection":"all","secret":"SENTINEL"}]}}],"looks":[{"id":"l","secret":"SENTINEL","layers":[{"groupId":"wash","secret":"SENTINEL"}]}]}""")!.AsObject();
        Check(!DesignContract.Context(contaminated).ToJsonString().Contains("SENTINEL"), "Nested creative context strips extension secrets");
        Console.WriteLine("Copilot checks passed: model/auth guards, declarative validation, progress/trace, cancellation/single-flight, SDK safety settings and private-context projection.");
    }
    sealed class Fake : ICopilotTransport {
        public int Calls; public string? Answer; public bool Block, Authenticated = true;
        public Func<string, string> Wrap = value => value;
        public TaskCompletionSource Entered = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public Task<CopilotStatus> StatusAsync(CancellationToken token) => Task.FromResult(new CopilotStatus(true, Authenticated));
        public Task<string[]> ListModelsAsync(CancellationToken token) => Authenticated ? Task.FromResult(new[] { "test-model" }) : throw new HttpRequestException("Sign in required");
        public async Task<string> GenerateAsync(string model, string system, string prompt, Func<string, CancellationToken, Task> delta, CancellationToken token) {
            Calls++;
            if (Block) { Entered.TrySetResult(); await Task.Delay(Timeout.InfiniteTimeSpan, token); }
            var schema = JsonNode.Parse(prompt)!["schema"]!;
            var id = schema["properties"]!["colorProfiles"]!["items"]!["properties"]!["id"]!["enum"]![0]!.GetValue<string>();
            var answer = Answer ?? $$"""{"summary":"Warm","colorProfiles":[{"id":"{{id}}","name":"Amber","primary":"#ff7700","secondary":"#ffaa00","accent":"#ffeeaa","white":"#ffffff","intensityLimit":1}],"programs":[],"looks":[]}""";
            answer = Wrap(answer);
            await delta(answer, token); return answer;
        }
    }
}
