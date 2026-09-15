using System.Net;
using System.Text;
using System.Text.Json.Nodes;
using Lightflow.Runtime;

await OutputChecks.Run();
await WingChecks.Run();
InspectionChecks.Run();
await PlaybackChecks.Run();
await PlaybackAudioChecks.Run();
await PlaybackOutputChecks.Run();
AiRequestInputChecks.Run();
await AiStreamingChecks.Run();
await AiStreamingEndpointChecks.Run();
await CopilotChecks.Run();
await IdeaContextChecks.Run();

void Check(bool ok, string message) { if (!ok) throw new Exception(message); }
var show = JsonNode.Parse("""{"groups":[{"id":"wash","name":"Wash"}],"colorProfiles":[{"id":"existing"}],"programs":[{"id":"existing"}],"looks":[],"routes":[{"host":"private-device"}]}""")!.AsObject();
var request = new ShowDesignRequest("Warm kleuren", new DesignOptions("all", 8, 8, 16, false), show);
var local = await new LocalShowDesignProvider().ProposeAsync(request, default);
Check(local.ColorProfiles.Count == 8 && local.Programs.Count == 8 && local.Looks.Count == 16, "Local counts");
Check(local.Provider == "offline-templates", "Honest offline label");
Check(local.Programs.Select(p => PatternContract.Signature(p!)).Distinct().Count() == 8, "Offline templates produce distinct declarative recipes");
var onlyProgramsRequest = request with { Options = new DesignOptions("all", 0, 2, 0, false) };
var onlyPrograms = await new LocalShowDesignProvider().ProposeAsync(onlyProgramsRequest, default);
Check(onlyPrograms.ColorProfiles.Count == 0 && onlyPrograms.Programs.Count == 2 && onlyPrograms.Looks.Count == 0, "Complete requests may generate only selected nonzero collections");
var paletteIdeasRequest = request with { Options = new DesignOptions("colorProfiles", 32, 0, 0, false) };
DesignContract.ValidateRequest(paletteIdeasRequest);
Check(DesignContract.SchemaForRequest(paletteIdeasRequest)["properties"]!["colorProfiles"]!["maxItems"]!.GetValue<int>() == 32, "Palette proposals are idea slots, not limited by occupied storage");
var scopedPaletteReplace = await new LocalShowDesignProvider().ProposeAsync(paletteIdeasRequest with { Options = paletteIdeasRequest.Options with { Replace = true } }, default);
Check(scopedPaletteReplace.ColorProfiles.Count == 32 && scopedPaletteReplace.Programs.Count == 0 && scopedPaletteReplace.Looks.Count == 0, "Scoped replacement requests return only the selected collection");
var scopedLookReplaceSchema = DesignContract.SchemaForRequest(request with { Options = new DesignOptions("looks", 0, 0, 1, false, true) })["properties"]!;
Check(Allowed(scopedLookReplaceSchema["looks"]!["items"]!["properties"]!["colorProfileId"]!).Contains("existing")
    && Allowed(scopedLookReplaceSchema["looks"]!["items"]!["properties"]!["programId"]!).Contains("existing"), "Scoped Look replacement can reuse unchanged collections");
try { DesignContract.ValidateRequest(request with { Options = new DesignOptions("all", 0, 0, 0, false) }); throw new Exception("Empty request accepted"); }
catch (ArgumentException) { }
var fullIdeaSet = await new LocalShowDesignProvider().ProposeAsync(request with { Options = request.Options with { ProfileCount = 32 } }, default);
Check(fullIdeaSet.ColorProfiles.Count == 32, "Idea generation is not capped by occupied palette slots");
// Missing replace preserves the existing append contract for saved and older clients.
var legacyOptions = System.Text.Json.JsonSerializer.Deserialize<DesignOptions>("""{"scope":"all","profileCount":1,"programCount":1,"lookCount":1,"revision":false}""", new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web))!;
Check(!legacyOptions.Replace, "Legacy requests remain additive");
var replacementRequest = request with { Options = new DesignOptions("all", 32, 32, 32, false, true) };
var replacement = await new LocalShowDesignProvider().ProposeAsync(replacementRequest, default);
Check(replacement.ColorProfiles.Count == 32 && replacement.Programs.Count == 32 && replacement.Looks.Count == 32, "32 requested recipes can generate 32 unique patterns");
Check(replacement.Programs.Select(p => PatternContract.Signature(p!)).Distinct().Count() == 32 && replacement.Programs.All(p => p!["pattern"] is JsonObject && p["rateBeats"]!.GetValue<double>() == 1), "32 real recipes retain timing only as fixed compatibility field");
var newColorIds = replacement.ColorProfiles.Select(i => i!["id"]!.GetValue<string>()).ToHashSet();
var newProgramIds = replacement.Programs.Select(i => i!["id"]!.GetValue<string>()).ToHashSet();
Check(!newColorIds.Contains("existing") && !newProgramIds.Contains("existing"), "Replacement uses new IDs");
Check(replacement.Programs.All(i => newColorIds.Contains(i!["defaultColorProfileId"]!.GetValue<string>())) && replacement.Looks.All(i => newColorIds.Contains(i!["colorProfileId"]!.GetValue<string>()) && newProgramIds.Contains(i["programId"]!.GetValue<string>())), "Replacement template references only its new set");
foreach (var invalid in new[] {
    replacementRequest.Options with { Revision = true },
    replacementRequest.Options with { ProfileCount = 0 },
    replacementRequest.Options with { ProgramCount = 33 }
}) {
    try { DesignContract.ValidateRequest(replacementRequest with { Options = invalid }); throw new Exception("Invalid replacement accepted"); }
    catch (ArgumentException) { }
}
var replacementSchema = OllamaShowDesignProvider.CreateSchema(replacementRequest)["properties"]!;
string[] Allowed(JsonNode property) => property["enum"]!.AsArray().Select(i => i!.GetValue<string>()).ToArray();
var schemaColorIds = Allowed(replacementSchema["colorProfiles"]!["items"]!["properties"]!["id"]!);
var schemaProgramIds = Allowed(replacementSchema["programs"]!["items"]!["properties"]!["id"]!);
Check(schemaColorIds.Length == 32 && !schemaColorIds.Contains("existing"), "Replacement schema has only new IDs");
Check(Allowed(replacementSchema["programs"]!["items"]!["properties"]!["defaultColorProfileId"]!).SequenceEqual(schemaColorIds), "Replacement schema forbids old program palette references");
Check(Allowed(replacementSchema["looks"]!["items"]!["properties"]!["colorProfileId"]!).SequenceEqual(schemaColorIds) && Allowed(replacementSchema["looks"]!["items"]!["properties"]!["programId"]!).SequenceEqual(schemaProgramIds), "Replacement schema forbids old Look references");
var additiveSchema = OllamaShowDesignProvider.CreateSchema(request)["properties"]!;
Check(Allowed(additiveSchema["programs"]!["items"]!["properties"]!["defaultColorProfileId"]!).Contains("existing"), "Additive schema still allows existing references");
Console.WriteLine("Replacement checks passed: legacy defaults, capacity 32, new IDs, new references only, invalid combinations, additive compatibility.");
var handler = new FakeHandler();
var provider = new OpenAiShowDesignProvider(new HttpClient(handler), "test-only", "test-model");
handler.Response = new JsonObject { ["output"] = new JsonArray(new JsonObject { ["content"] = new JsonArray(new JsonObject { ["type"] = "output_text", ["text"] = new JsonObject { ["summary"] = "Test", ["colorProfiles"] = local.ColorProfiles.DeepClone(), ["programs"] = local.Programs.DeepClone(), ["looks"] = local.Looks.DeepClone() }.ToJsonString() }) }) }.ToJsonString();
var result = await provider.ProposeAsync(request, default);
Check(result.Provider == "openai" && result.Summary == "Test", "Structured response parsing");
Check(handler.Body!.Contains("json_schema") && handler.Body.Contains("lighting_design"), "Strict schema request");
Check(!handler.Body.Contains("private-device"), "Physical routing leaked to provider");
handler.Response = """{"output":[{"type":"message","content":[{"type":"refusal","refusal":"no"}]}]}""";
try { await provider.ProposeAsync(request, default); throw new Exception("Refusal accepted"); }
catch (System.Text.Json.JsonException) { }
Console.WriteLine("AI contract checks passed: counts, limits, structured response, schema, context minimization, refusal.");
var ollamaRequest = request with { Options = new DesignOptions("colorProfiles", 1, 0, 0, false) };
var ollamaHandler = new FakeHandler { Response = new JsonObject { ["done"] = true, ["done_reason"] = "stop", ["message"] = new JsonObject { ["content"] = new JsonObject { ["summary"] = "Warm", ["colorProfiles"] = new JsonArray(new JsonObject { ["id"] = "new", ["name"] = "Warm", ["primary"] = "#ff0000", ["secondary"] = "#ffff00", ["accent"] = "#ffffff", ["white"] = "#ffffff", ["intensityLimit"] = 1 }), ["programs"] = new JsonArray(), ["looks"] = new JsonArray() }.ToJsonString() } }.ToJsonString() };
var ollama = new OllamaShowDesignProvider(new HttpClient(ollamaHandler), "gpt-oss:20b");
var ollamaResult = await ollama.ProposeAsync(ollamaRequest, default);
Check(ollamaResult.ColorProfiles.Count == 1 && ollamaResult.Provider == "ollama", "Ollama parsed result");
var body = JsonNode.Parse(ollamaHandler.Body!)!;
Check(body["stream"]!.GetValue<bool>() == false && body["format"]!["properties"]!["colorProfiles"]!["minItems"]!.GetValue<int>() == 1, "Ollama exact schema and nonstream");
Check(body["format"]!["properties"]!["programs"]!["items"]!["properties"]!["rateBeats"]!["enum"]![0]!.GetValue<int>() == 1, "Pattern timing is a fixed compatibility field");
Check(!ollamaHandler.Body!.Contains("private-device"), "Ollama minimized context");
Check(Allowed(body["format"]!["properties"]!["programs"]!["items"]!["properties"]!["effect"]!).SequenceEqual(DesignContract.Effects) && DesignContract.Effects.Length == 8, "Eight effect schema shared by providers");
Check(ollamaResult.Model == "gpt-oss:20b", "Default model provenance");
var models = await ollama.ListModelsAsync(default);
Check(models.SequenceEqual(new[] { "gpt-oss:20b", "llama3.2:3b" }), "Installed models sorted, unique, cloud names excluded");
var selected = await ollama.ProposeAsync(ollamaRequest with { Model = "llama3.2:3b" }, default);
Check(selected.Model == "llama3.2:3b" && JsonNode.Parse(ollamaHandler.Body!)!["model"]!.GetValue<string>() == selected.Model && ollama.Model == "gpt-oss:20b", "Selection captured per request without changing default");
var concurrent = await Task.WhenAll(ollama.ProposeAsync(ollamaRequest with { Model = "llama3.2:3b" }, default), ollama.ProposeAsync(ollamaRequest, default));
Check(concurrent[0].Model == "llama3.2:3b" && concurrent[1].Model == "gpt-oss:20b", "Requests retain separate model provenance");
foreach (var invalidModel in new[] { "absent:7b", "gpt-oss:120b-cloud", "", new string('x', 201) }) {
    var before = ollamaHandler.ChatCalls;
    try { await ollama.ProposeAsync(ollamaRequest with { Model = invalidModel }, default); throw new Exception("Invalid model accepted"); } catch (ArgumentException) { }
    Check(ollamaHandler.ChatCalls == before, "Invalid selection never reaches generation");
}
ollamaHandler.TagsResponse = "{\"models\":[]}";
Check((await ollama.ListModelsAsync(default)).Length == 0, "Empty local library is valid");
ollamaHandler.TagsResponse = "{}";
try { await ollama.ListModelsAsync(default); throw new Exception("Malformed model list accepted"); } catch (System.Text.Json.JsonException) { }
ollamaHandler.TagsResponse = FakeHandler.Installed;
ollamaHandler.TagsStatus = HttpStatusCode.ServiceUnavailable;
try { await ollama.ListModelsAsync(default); throw new Exception("Unavailable model list accepted"); } catch (HttpRequestException) { }
ollamaHandler.TagsStatus = HttpStatusCode.OK;
ollamaHandler.Status = HttpStatusCode.NotFound;
try { await ollama.ProposeAsync(ollamaRequest, default); throw new Exception("Missing model accepted"); } catch (HttpRequestException e) { Check(e.Message.Contains("niet lokaal"), "Missing model message"); }
ollamaHandler.Status = HttpStatusCode.OK; ollamaHandler.Response = """{"done":true,"done_reason":"length","message":{"content":""}}""";
try { await ollama.ProposeAsync(ollamaRequest, default); throw new Exception("Truncation accepted"); } catch (HttpRequestException e) { Check(e.Message.Contains("voortijdig"), "Truncation message"); }
try { await new OllamaShowDesignProvider(new HttpClient(ollamaHandler), "gpt-oss:120b-cloud").ProposeAsync(ollamaRequest, default); throw new Exception("Cloud model accepted"); } catch (ArgumentException) { }
Console.WriteLine("Ollama checks passed: structured response, exact count schema, local context, missing model, truncation, cloud rejection.");

// Physical context is deliberately explicit: fixed-white fronts and haze must not inherit a sparse RGB chase.
var layeredShow = show.DeepClone().AsObject();
layeredShow["groups"] = JsonNode.Parse("""[{"id":"wash","name":"Wash","intensity":0.9},{"id":"front","name":"Front","intensity":0.8},{"id":"haze","name":"Haze","intensity":0.2}]""");
layeredShow["fixtures"] = JsonNode.Parse("""[{"id":"rgb","profileId":"stairville-stage-tri","modeId":"14ch","groupId":"wash","position":[0,3,0],"aim":[0,0,2],"patch":{"universe":7,"address":20},"secret":"hidden-fixture-secret"},{"id":"white","profileId":"varytec-theater-spot-100","modeId":"2ch","groupId":"front","position":[0,3,3]},{"id":"smoke","profileId":"stairville-hz-200","modeId":"1ch","groupId":"haze"}]""");
layeredShow["bandMembers"] = JsonNode.Parse("""[{"id":"singer","name":"Zang","position":[0,0,0]}]""");
var layeredRequest = request with { Show = layeredShow, Options = new DesignOptions("all", 1, 1, 1, false, true) };
var layered = await new LocalShowDesignProvider().ProposeAsync(layeredRequest, default);
var layers = layered.Looks[0]!["layers"]!.AsArray();
Check(layers.Count == 3 && layers.Select(l => l!["groupId"]!.GetValue<string>()).Distinct().Count() == 3, "Every new Look covers each group exactly once");
Check(layers[0]!["mode"]!.GetValue<string>() == "animation" && layers[0]!["programId"] is not null, "RGB layer animates");
Check(layers[1]!["mode"]!.GetValue<string>() == "static" && layers[1]!["programId"] is null, "Fixed-white front is steady independent of animation");
Check(layers[2]!["mode"]!.GetValue<string>() == "static" && layers[2]!["intensity"]!.GetValue<double>() <= 0.15, "Haze stays cautious and steady");
Check(layers.All(l => l!.AsObject().ContainsKey("colorProfileId") && l["colorProfileId"] is null), "Default layers explicitly follow Look palette");
var context = DesignContract.Context(layeredShow);
Check(context["fixtures"]![0]!["capabilities"]!.GetValue<string>().Contains("independently") && context["fixtures"]![1]!["capabilities"]!.GetValue<string>().Contains("no RGB"), "Actual known rig capabilities included");
Check(context["groups"]![0]!["intensity"]!.GetValue<double>() == 0.9 && context["bandMembers"]!.AsArray().Count == 1, "Group levels and people included");
Check(!context.ToJsonString().Contains("private-device") && !context.ToJsonString().Contains("hidden-fixture-secret") && !context["fixtures"]![0]!.AsObject().ContainsKey("patch"), "Routing/patch and unknown fixture fields excluded");
var layerSchema = OllamaShowDesignProvider.CreateSchema(layeredRequest)["properties"]!["looks"]!["items"]!["properties"]!["layers"]!;
Check(layerSchema["minItems"]!.GetValue<int>() == 3 && layerSchema["maxItems"]!.GetValue<int>() == 3, "Request schema requires complete layer count");
var layerFields = layerSchema["items"]!["properties"]!;
Check(Allowed(layerFields["groupId"]!).SequenceEqual(new[] { "wash", "front", "haze" }), "Schema layer references only actual groups");
Check(layerFields["programId"]!["enum"]!.AsArray().Any(x => x is null) && !layerFields["programId"]!["enum"]!.AsArray().Any(x => x?.GetValue<string>() == "existing"), "Replacement layer program enums allow null/new IDs, not stale IDs");
Check(layerFields["colorProfileId"]!["enum"]!.AsArray().Any(x => x is null), "Layer palette inheritance nullable in strict schema");
void RejectLayer(Action<JsonArray> mutate) {
    var altered = layered.Looks.DeepClone().AsArray(); mutate(altered);
    try { DesignContract.ValidateLayers(layeredRequest, layered.ColorProfiles, layered.Programs, altered); throw new Exception("Malformed layers accepted"); }
    catch (System.Text.Json.JsonException) { }
}
RejectLayer(l => l[0]!.AsObject().Remove("layers"));
RejectLayer(l => l[0]!["layers"]!.AsArray().RemoveAt(0));
RejectLayer(l => l[0]!["layers"]![1]!["groupId"] = "wash");
RejectLayer(l => l[0]!["layers"]![1]!["groupId"] = "unknown");
RejectLayer(l => l[0]!["layers"]![0]!["programId"] = null);
RejectLayer(l => l[0]!["layers"]![0]!["programId"] = "existing");
RejectLayer(l => l[0]!["layers"]![1]!["programId"] = layered.Programs[0]!["id"]!.GetValue<string>());
RejectLayer(l => l[0]!["layers"]![0]!["colorProfileId"] = "missing");
RejectLayer(l => l[0]!["layers"]![0]!["intensity"] = 1.01);
var explicitOff = layered.Looks.DeepClone().AsArray();
explicitOff[0]!["layers"]![0]!["mode"] = "off"; explicitOff[0]!["layers"]![0]!["programId"] = null;
DesignContract.ValidateLayers(layeredRequest, layered.ColorProfiles, layered.Programs, explicitOff);
var lookOnly = layeredRequest with { Options = new DesignOptions("looks", 0, 0, 1, false) };
var proposalData = new JsonObject { ["summary"] = "Laagtest", ["colorProfiles"] = new JsonArray(), ["programs"] = new JsonArray(), ["looks"] = layered.Looks.DeepClone() };
proposalData["looks"]![0]!["programId"] = "existing"; proposalData["looks"]![0]!["colorProfileId"] = "existing";
proposalData["looks"]![0]!["layers"]![0]!["programId"] = "existing";
var layerHandler = new FakeHandler { Response = new JsonObject { ["done"] = true, ["message"] = new JsonObject { ["content"] = proposalData.ToJsonString() } }.ToJsonString() };
await new OllamaShowDesignProvider(new HttpClient(layerHandler), "gpt-oss:20b").ProposeAsync(lookOnly, default);
var sent = JsonNode.Parse(layerHandler.Body!)!;
var sentContext = JsonNode.Parse(sent["messages"]![1]!["content"]!.GetValue<string>())!["context"]!;
Check(sentContext["fixtures"]!.AsArray().Count == 3 && !layerHandler.Body!.Contains("private-device"), "Ollama sends minimized physical setup");
proposalData["looks"]![0]!.AsObject().Remove("layers");
layerHandler.Response = new JsonObject { ["done"] = true, ["message"] = new JsonObject { ["content"] = proposalData.ToJsonString() } }.ToJsonString();
try { await new OllamaShowDesignProvider(new HttpClient(layerHandler), "gpt-oss:20b").ProposeAsync(lookOnly, default); throw new Exception("Legacy new model Look accepted"); } catch (HttpRequestException error) { Check(error.Message == "Voorstel afgewezen: Elke nieuwe Look moet één laag per groep bevatten.", "Locally authored contract reason reaches operator without raw model output"); }
Check(!DesignContract.CreativeGuidance.Contains("Do not promise independent") && DesignContract.CreativeGuidance.Contains("EVERY current group"), "Guidance permits complete layered scene design");
Console.WriteLine("Layer checks passed: complete coverage, steady fronts, cautious haze, setup allowlist, nullable refs, strict replacement enums, malformed output rejection.");

// New AI output must carry group timing; stored context remains backward compatible.
var requiredLayerFields = layerSchema["items"]!["required"]!.AsArray().Select(x => x!.GetValue<string>()).ToArray();
Check(requiredLayerFields.Contains("rateBeats") && requiredLayerFields.Contains("offsetBeats"), "Generated layer schema requires explicit timing fields");
Check(layerFields["rateBeats"]!["type"]!.GetValue<string>() == "number", "Generated layer duration is always explicit");
Check(layerFields["rateBeats"]!["minimum"]!.GetValue<double>() == 0.125 && layerFields["rateBeats"]!["maximum"]!.GetValue<double>() == 64, "Layer duration schema bounds");
Check(layerFields["offsetBeats"]!["type"]!.GetValue<string>() == "number" && layerFields["offsetBeats"]!["minimum"]!.GetValue<int>() == -64 && layerFields["offsetBeats"]!["maximum"]!.GetValue<int>() == 64, "Layer phase schema finite signed bounds");
Check(layers.All(l => l!["rateBeats"]!.GetValue<double>() == 1 && l["offsetBeats"]!.GetValue<double>() == 0), "Offline groups have explicit one-beat duration and no phase shift");
var oldTiming = layered.Looks.DeepClone().AsArray();
foreach (var layer in oldTiming[0]!["layers"]!.AsArray()) { layer!.AsObject().Remove("rateBeats"); layer.AsObject().Remove("offsetBeats"); }
try { DesignContract.ValidateLayers(layeredRequest, layered.ColorProfiles, layered.Programs, oldTiming); throw new Exception("New generation omitted timing"); } catch (System.Text.Json.JsonException) { }
RejectLayer(l => l[0]!["layers"]![0]!["rateBeats"] = null);
foreach (var duration in new[] { 0.125, 64.0 }) foreach (var offset in new[] { -64.0, 0.0, 64.0 }) {
    var timed = layered.Looks.DeepClone().AsArray();
    timed[0]!["layers"]![0]!["rateBeats"] = duration; timed[0]!["layers"]![0]!["offsetBeats"] = offset;
    DesignContract.ValidateLayers(layeredRequest, layered.ColorProfiles, layered.Programs, timed);
}
foreach (var invalidRate in new[] { 0.0, 0.124, 64.001, double.NaN, double.PositiveInfinity }) RejectLayer(l => l[0]!["layers"]![0]!["rateBeats"] = invalidRate);
foreach (var invalidOffset in new[] { -64.001, 64.001, double.NaN, double.NegativeInfinity }) RejectLayer(l => l[0]!["layers"]![0]!["offsetBeats"] = invalidOffset);
RejectLayer(l => l[0]!["layers"]![0]!["rateBeats"] = "8");
RejectLayer(l => l[0]!["layers"]![0]!["rateBeats"] = new JsonObject());
RejectLayer(l => l[0]!["layers"]![0]!["offsetBeats"] = null);
RejectLayer(l => l[0]!["layers"]![0]!["offsetBeats"] = "2");
RejectLayer(l => l[0]!["layers"]![0]!["offsetBeats"] = true);
var timedShow = layeredShow.DeepClone().AsObject();
timedShow["looks"] = layered.Looks.DeepClone();
timedShow["looks"]![0]!["layers"]![0]!["rateBeats"] = 16;
timedShow["looks"]![0]!["layers"]![0]!["offsetBeats"] = -2;
var timedContext = JsonNode.Parse(DesignContract.Context(timedShow).ToJsonString())!;
Check(timedContext["looks"]![0]!["layers"]![0]!["rateBeats"]!.GetValue<double>() == 16 && timedContext["looks"]![0]!["layers"]![0]!["offsetBeats"]!.GetValue<double>() == -2, "Context serialization preserves existing independent group timing");
Check(DesignContract.CreativeGuidance.Contains("(beat-offsetBeats)/effectiveRateBeats") && DesignContract.CreativeGuidance.Contains("NOT a startup delay") && DesignContract.CreativeGuidance.Contains("Timing fields do not animate static/off"), "Prompt precisely defines signed phase and steady/off behavior");
Console.WriteLine("Layer timing checks passed: explicit generation fields, omission/null rejection, finite bounds/types, offline defaults and legacy context roundtrip.");

// New recipes are bounded data, not executable code. Identity ignores metadata and normalizes inert fields.
Check(replacementSchema["programs"]!["minItems"]!.GetValue<int>() == 1 && replacementSchema["programs"]!["maxItems"]!.GetValue<int>() == 32 && schemaProgramIds.Length == 32, "Replacement allows up to 32 recipes");
var recipeSchema = replacementSchema["programs"]!["items"]!["properties"]!["pattern"]!;
Check(recipeSchema["additionalProperties"]!.GetValue<bool>() == false && recipeSchema["properties"]!["steps"]!["maxItems"]!.GetValue<int>() == 16, "Recipe schema rejects unknown fields and bounds steps");
Check(recipeSchema["properties"]!["steps"]!["items"]!["additionalProperties"]!.GetValue<bool>() == false, "Step schema is closed");
Check(replacementSchema["programs"]!["items"]!["required"]!.AsArray().Any(x => x!.GetValue<string>() == "pattern"), "New programs require recipes");
var completePatterns = show.DeepClone().AsObject(); completePatterns["programs"] = replacement.Programs.DeepClone();
var exhaustedRequest = request with { Show = completePatterns, Options = new DesignOptions("programs", 0, 32, 0, false) };
var exhausted = await new LocalShowDesignProvider().ProposeAsync(exhaustedRequest, default);
Check(exhausted.Programs.Count == 0 && exhausted.Summary.Contains("0 unieke patronen"), "Full collection returns no additions");
Check(!DesignContract.PatternSummary(exhaustedRequest, 0, "Vier patronen toegevoegd").Contains("Vier patronen toegevoegd"), "Zero-result summary cannot repeat invented additions");
var partialPatterns = show.DeepClone().AsObject(); partialPatterns["programs"] = new JsonArray(replacement.Programs[0]!.DeepClone(), replacement.Programs[1]!.DeepClone());
var partialRequest = exhaustedRequest with { Show = partialPatterns };
var partial = await new LocalShowDesignProvider().ProposeAsync(partialRequest, default);
Check(partial.Programs.Count == 30 && partial.Programs.All(p => !partialPatterns["programs"]!.AsArray().Any(old => PatternContract.Signature(old!) == PatternContract.Signature(p!))), "Additions produce new recipes up to remaining capacity");
void RejectPatterns(ShowDesignRequest r, JsonArray patterns) {
    try { DesignContract.ValidateProposal(r, new JsonArray(), patterns, new JsonArray()); throw new Exception("Invalid generated pattern accepted"); } catch (System.Text.Json.JsonException) { }
}
RejectPatterns(partialRequest, new JsonArray());
var onePattern = new JsonArray(partial.Programs[0]!.DeepClone());
var duplicate = onePattern[0]!.DeepClone(); duplicate["id"] = "another-id"; duplicate["name"] = "Another title"; duplicate["effect"] = "pulse";
onePattern.Add(duplicate); RejectPatterns(partialRequest, onePattern);
var existingDuplicate = replacement.Programs[0]!.DeepClone(); existingDuplicate["id"] = "new-id";
RejectPatterns(partialRequest, new JsonArray(existingDuplicate));
var changedRate = new JsonArray(partial.Programs[0]!.DeepClone()); changedRate[0]!["rateBeats"] = 8; RejectPatterns(partialRequest, changedRate);
var sameFallback = new JsonArray(partial.Programs[0]!.DeepClone(), partial.Programs[1]!.DeepClone());
DesignContract.ValidateProposal(partialRequest, new JsonArray(), sameFallback, new JsonArray());
Check(sameFallback[0]!["effect"]!.GetValue<string>() == sameFallback[1]!["effect"]!.GetValue<string>(), "Distinct recipes may share a fallback effect");
var sourceRecipe = new JsonObject { ["effect"] = "pulse", ["pattern"] = JsonNode.Parse("""{"version":1,"floor":0.2,"steps":[{"selection":"all","direction":"forward","envelope":"pulse","width":1,"trail":0,"level":1,"weight":1},{"selection":"random","direction":"forward","envelope":"fade-out","width":2,"trail":0,"level":0.5,"weight":2}]}""") };
var equivalentRecipe = new JsonObject { ["effect"] = "chase", ["pattern"] = JsonNode.Parse("""{"steps":[{"weight":2,"level":1,"trail":1,"width":8,"envelope":"pulse","direction":"outward","selection":"all"},{"weight":4,"level":0.5,"trail":0.8,"width":2,"envelope":"fade-out","direction":"reverse","selection":"random"}],"floor":0.2,"version":1}""") };
Check(PatternContract.Signature(sourceRecipe) == PatternContract.Signature(equivalentRecipe), "Signature ignores JSON key order, metadata, inert fields and proportional weights");
var alternateRecipe = sourceRecipe.DeepClone(); alternateRecipe["pattern"]!["steps"]![0]!["selection"] = "alternate";
var alternateOther = alternateRecipe.DeepClone(); alternateOther["pattern"]!["steps"]![0]!["width"] = 8; alternateOther["pattern"]!["steps"]![0]!["direction"] = "inward"; alternateOther["pattern"]!["steps"]![0]!["trail"] = 1;
Check(PatternContract.Signature(alternateRecipe) == PatternContract.Signature(alternateOther), "Alternate has no direction, width or trail semantics");
foreach (var constant in new[] { 0.0, 0.4, 1.0 }) {
    var masked = sourceRecipe.DeepClone(); masked["pattern"]!["floor"] = constant;
    foreach (var step in masked["pattern"]!["steps"]!.AsArray()) { step!["selection"] = "moving"; step["envelope"] = "pulse"; step["level"] = constant; }
    var steady = sourceRecipe.DeepClone(); steady["pattern"]!["floor"] = 0.0;
    foreach (var step in steady["pattern"]!["steps"]!.AsArray()) { step!["selection"] = "all"; step["envelope"] = "hold"; step["level"] = constant; }
    Check(PatternContract.Signature(masked) == PatternContract.Signature(steady), "Floor-masked motion and equal steady steps have one constant identity");
    steady["pattern"]!["steps"]![0]!["level"] = constant == 1 ? 0.5 : 1;
    Check(PatternContract.Signature(masked) != PatternContract.Signature(steady), "Unequal step levels still produce distinct recipes");
}
void RejectRecipe(Action<JsonObject> mutate) {
    var program = partial.Programs[0]!.DeepClone().AsObject(); mutate(program);
    RejectPatterns(partialRequest, new JsonArray(program));
}
RejectRecipe(p => p.Remove("pattern"));
RejectRecipe(p => p["pattern"] = null);
RejectRecipe(p => p["script"] = "alert(1)");
RejectRecipe(p => p["pattern"]!["script"] = "eval");
RejectRecipe(p => p["pattern"]!["steps"]![0]!["code"] = "run()");
RejectRecipe(p => p["pattern"]!["version"] = 2);
RejectRecipe(p => p["pattern"]!["floor"] = 1.01);
RejectRecipe(p => p["pattern"]!["floor"] = double.NaN);
RejectRecipe(p => p["pattern"]!["steps"] = new JsonArray());
RejectRecipe(p => p["pattern"]!["steps"] = new JsonArray(Enumerable.Range(0, 17).Select(_ => p["pattern"]!["steps"]![0]!.DeepClone()).ToArray()));
RejectRecipe(p => p["pattern"]!["steps"]![0]!["selection"] = "javascript");
RejectRecipe(p => p["pattern"]!["steps"]![0]!["direction"] = "spin");
RejectRecipe(p => p["pattern"]!["steps"]![0]!["envelope"] = "execute");
RejectRecipe(p => p["pattern"]!["steps"]![0]!["width"] = 1.5);
RejectRecipe(p => p["pattern"]!["steps"]![0]!["width"] = 9);
RejectRecipe(p => p["pattern"]!["steps"]![0]!["weight"] = 0);
RejectRecipe(p => p["pattern"]!["steps"]![0]!["trail"] = "0.5");
RejectRecipe(p => p["pattern"]!["steps"]![0]!["level"] = double.PositiveInfinity);
Check(PatternContract.Signature(new JsonObject { ["effect"] = "pulse" }) == "effect:pulse", "Legacy stored programs remain valid context");
var recipeContext = DesignContract.Context(completePatterns);
Check(recipeContext["programs"]![0]!["pattern"]!.ToJsonString() == completePatterns["programs"]![0]!["pattern"]!.ToJsonString(), "Physical model context includes stored recipes without mutation");
var revisionRequest = exhaustedRequest with { Options = exhaustedRequest.Options with { Revision = true } };
var revised = await new LocalShowDesignProvider().ProposeAsync(revisionRequest, default);
Check(revised.Programs.Count == 32 && revised.Programs.Select(p => PatternContract.Signature(p!)).Distinct().Count() == 32, "Revisions preserve unique recipe set");
var conflictingRevision = new JsonArray(revised.Programs[0]!.DeepClone()); conflictingRevision[0]!["pattern"] = completePatterns["programs"]![1]!["pattern"]!.DeepClone();
RejectPatterns(revisionRequest, conflictingRevision);
var emptyHandler = new FakeHandler { Response = new JsonObject { ["done"] = true, ["message"] = new JsonObject { ["content"] = new JsonObject { ["summary"] = "Alles bestaat al.", ["colorProfiles"] = new JsonArray(), ["programs"] = new JsonArray(), ["looks"] = new JsonArray() }.ToJsonString() } }.ToJsonString() };
var noNew = await new OllamaShowDesignProvider(new HttpClient(emptyHandler), "gpt-oss:20b").ProposeAsync(exhaustedRequest, default);
Check(noNew.Programs.Count == 0 && noNew.Summary.Contains("0 unieke patronen"), "Ollama accepts zero additions only when collection is full");
Console.WriteLine("Recipe checks passed: 32 unique templates, closed bounded DSL, metadata-independent canonical identity, GCD weights, existing/revision duplicate rejection, legacy context and same-effect variants.");
// Band preferences affect constrained new design only; old shows and existing timings remain valid.
JsonObject Band(string genres, string character, string color, string energy, string complexity, string motion) => new() {
    ["name"] = "Onze band", ["genres"] = genres, ["character"] = character, ["colorMood"] = color,
    ["energy"] = energy, ["complexity"] = complexity, ["motion"] = motion, ["preferredColors"] = new JsonArray()
};
var calmBandShow = layeredShow.DeepClone().AsObject();
calmBandShow["bandProfile"] = Band("Akoestische folk", "Intiem, warm, verhalen vertellen", "warm", "calm", "simple", "slow");
var boldBandShow = layeredShow.DeepClone().AsObject();
boldBandShow["bandProfile"] = Band("Elektronische rock", "Contrastrijk en speels", "cool", "high", "rich", "fast");
var calmRequest = layeredRequest with { Show = calmBandShow };
var boldRequest = layeredRequest with { Show = boldBandShow };
var calmProposal = await new LocalShowDesignProvider().ProposeAsync(calmRequest, default);
var boldProposal = await new LocalShowDesignProvider().ProposeAsync(boldRequest, default);
Check(calmProposal.ColorProfiles[0]!["primary"]!.GetValue<string>() == "#ff7a28" && boldProposal.ColorProfiles[0]!["primary"]!.GetValue<string>() == "#3478f6", "Offline honors explicit palette mood without claiming genre interpretation");
Check(calmProposal.Looks[0]!["layers"]![0]!["rateBeats"]!.GetValue<double>() == 16 && boldProposal.Looks[0]!["layers"]![0]!["rateBeats"]!.GetValue<double>() == 1, "Explicit motion changes group duration, not program duration");
Check(calmProposal.Programs[0]!["rateBeats"]!.GetValue<double>() == 1 && boldProposal.Programs[0]!["rateBeats"]!.GetValue<double>() == 1, "Band speed never re-enters pattern metadata");
var calmSchema = DesignContract.SchemaForRequest(calmRequest)["properties"]!;
var boldSchema = DesignContract.SchemaForRequest(boldRequest)["properties"]!;
Check(calmSchema["programs"]!["items"]!["properties"]!["pattern"]!["properties"]!["steps"]!["maxItems"]!.GetValue<int>() == 2 && boldSchema["programs"]!["items"]!["properties"]!["pattern"]!["properties"]!["steps"]!["maxItems"]!.GetValue<int>() == 8, "Band complexity caps new recipe step counts");
Check(calmSchema["looks"]!["items"]!["properties"]!["layers"]!["items"]!["properties"]!["rateBeats"]!["minimum"]!.GetValue<double>() == 8 && boldSchema["looks"]!["items"]!["properties"]!["layers"]!["items"]!["properties"]!["rateBeats"]!["minimum"]!.GetValue<double>() == 0.25, "Structured schemas carry contrasting motion ranges");
void RejectBand(Action<JsonObject> mutate) {
    var changed = calmBandShow.DeepClone().AsObject(); mutate(changed);
    try { DesignContract.ValidateRequest(calmRequest with { Show = changed }); throw new Exception("Invalid band profile accepted"); } catch (ArgumentException) { }
}
RejectBand(s => s["bandProfile"] = null);
RejectBand(s => s["bandProfile"]!["name"] = new string('a', 121));
RejectBand(s => s["bandProfile"]!["genres"] = new string('a', 241));
RejectBand(s => s["bandProfile"]!["character"] = new string('a', 1201));
RejectBand(s => s["bandProfile"]!["script"] = "execute");
RejectBand(s => s["bandProfile"]!.AsObject().Remove("energy"));
RejectBand(s => s["bandProfile"]!["motion"] = "ultrafast");
RejectBand(s => s["bandProfile"]!["complexity"] = "unbounded");
RejectBand(s => s["bandProfile"]!["preferredColors"] = new JsonArray("#000000", "#111111", "#222222", "#333333", "#444444"));
RejectBand(s => s["bandProfile"]!["preferredColors"] = new JsonArray("red"));
var emptyBandShow = show.DeepClone().AsObject(); emptyBandShow["bandProfile"] = Band("", "", "auto", "auto", "auto", "auto"); emptyBandShow["bandProfile"]!["name"] = "";
DesignContract.ValidateRequest(request with { Show = emptyBandShow });
Check(BandDesignContract.MaximumSteps(emptyBandShow) == 16 && BandDesignContract.Motion(emptyBandShow).Min == 0.125, "Empty/auto profile keeps unrestricted legacy bounds");
void RejectBandOutput(JsonArray programs, JsonArray looks) {
    try { DesignContract.ValidateProposal(calmRequest, calmProposal.ColorProfiles, programs, looks); throw new Exception("Band output limits ignored"); } catch (System.Text.Json.JsonException) { }
}
var tooComplex = calmProposal.Programs.DeepClone().AsArray();
tooComplex[0]!["pattern"]!["steps"] = new JsonArray(Enumerable.Range(0, 3).Select(_ => tooComplex[0]!["pattern"]!["steps"]![0]!.DeepClone()).ToArray());
RejectBandOutput(tooComplex, calmProposal.Looks);
var tooFast = calmProposal.Looks.DeepClone().AsArray(); tooFast[0]!["layers"]![0]!["rateBeats"] = 1;
RejectBandOutput(calmProposal.Programs, tooFast);
var steadyTiming = calmProposal.Looks.DeepClone().AsArray(); steadyTiming[0]!["layers"]![1]!["rateBeats"] = 1;
DesignContract.ValidateProposal(calmRequest, calmProposal.ColorProfiles, calmProposal.Programs, steadyTiming);
Check(DesignContract.Context(calmBandShow)["bandProfile"]!["genres"]!.GetValue<string>() == "Akoestische folk" && DesignContract.Context(boldBandShow)["bandDesignGuidance"]!["maximumRecipeSteps"]!.GetValue<int>() == 8, "Validated band data and derived guidance enter minimized context");
Check(DesignContract.Context(calmBandShow)["bandDesignGuidance"]!["instruction"]!.GetValue<string>().Contains("Do not infer facts") && !DesignContract.Context(calmBandShow).ToJsonString().Contains("private-device"), "No famous-band assumptions or physical routing in context");
var preferredShow = calmBandShow.DeepClone().AsObject(); preferredShow["bandProfile"]!["preferredColors"] = new JsonArray("#112233", "#aabbcc");
var preferred = await new LocalShowDesignProvider().ProposeAsync(calmRequest with { Show = preferredShow }, default);
Check(preferred.ColorProfiles[0]!["primary"]!.GetValue<string>() == "#112233" && preferred.ColorProfiles[0]!["accent"]!.GetValue<string>() == "#aabbcc", "Offline preferred colors use primary/accent, not four simultaneous colors");
var patternsOnly = calmRequest with { Options = new DesignOptions("programs", 0, 1, 0, false) };
var patternsOnlyResult = await new LocalShowDesignProvider().ProposeAsync(patternsOnly, default);
Check(patternsOnlyResult.Looks.Count == 0 && patternsOnlyResult.Summary.Contains("timing blijven ongewijzigd") && patternsOnlyResult.Summary.Contains("kleurprofielen blijven ongewijzigd"), "Scoped generation honestly states untouched timing and colors");
foreach (var pair in new[] { (calmRequest, calmProposal), (boldRequest, boldProposal) }) {
    var payload = new JsonObject { ["summary"] = "Passend ontwerp", ["colorProfiles"] = pair.Item2.ColorProfiles.DeepClone(), ["programs"] = pair.Item2.Programs.DeepClone(), ["looks"] = pair.Item2.Looks.DeepClone() };
    var bandHandler = new FakeHandler { Response = new JsonObject { ["done"] = true, ["message"] = new JsonObject { ["content"] = payload.ToJsonString() } }.ToJsonString() };
    await new OllamaShowDesignProvider(new HttpClient(bandHandler), "gpt-oss:20b").ProposeAsync(pair.Item1, default);
    var sentBand = JsonNode.Parse(JsonNode.Parse(bandHandler.Body!)!["messages"]![1]!["content"]!.GetValue<string>())!["context"]!["bandProfile"]!;
    Check(sentBand.ToJsonString() == pair.Item1.Show["bandProfile"]!.ToJsonString(), "Ollama receives each request's exact validated band preferences");
    bandHandler.Response = new JsonObject { ["output"] = new JsonArray(new JsonObject { ["content"] = new JsonArray(new JsonObject { ["type"] = "output_text", ["text"] = payload.ToJsonString() }) }) }.ToJsonString();
    await new OpenAiShowDesignProvider(new HttpClient(bandHandler), "test-only", "test-model").ProposeAsync(pair.Item1, default);
    var sentOpenAi = JsonNode.Parse(JsonNode.Parse(bandHandler.Body!)!["input"]!.GetValue<string>())!["context"]!["bandProfile"]!;
    Check(sentOpenAi.ToJsonString() == pair.Item1.Show["bandProfile"]!.ToJsonString(), "OpenAI receives the same validated band context without external requests");
}
Console.WriteLine("Band checks passed: bounded profile, contrasting schemas/context, group-only speed, step limits, scoped summaries, preferred palettes and mocked provider parity.");

// Contract diagnostics may expose only local messages; parser diagnostics must not be promoted to public HTTP errors.
var invalidBandPrograms = calmProposal.Programs.DeepClone().AsArray(); invalidBandPrograms[0]!["pattern"]!["steps"]![0]!["direction"] = "private-model-content-marker";
try { DesignContract.ValidateProviderProposal(calmRequest, calmProposal.ColorProfiles, invalidBandPrograms, calmProposal.Looks); throw new Exception("Invalid recipe accepted"); }
catch (HttpRequestException error) { Check(error.Message.StartsWith("Voorstel afgewezen:") && !error.Message.Contains("private-model-content-marker"), "Contract explanation never includes raw invalid value"); }
var malformedHandler = new FakeHandler { Response = new JsonObject { ["done"] = true, ["message"] = new JsonObject { ["content"] = "private-model-content-marker {broken json" } }.ToJsonString() };
try { await new OllamaShowDesignProvider(new HttpClient(malformedHandler), "gpt-oss:20b").ProposeAsync(calmRequest, default); throw new Exception("Malformed response accepted"); }
catch (System.Text.Json.JsonException) { }
Console.WriteLine("Diagnostic checks passed: safe authored contract reason, no raw-value exposure, parser errors remain generic API path.");

// Exercise the real transport/validation seam: local models can repeat a recipe despite a valid JSON schema.
string OllamaEnvelope(JsonArray programs) => new JsonObject { ["done"] = true, ["message"] = new JsonObject { ["content"] = new JsonObject {
    ["summary"] = "Hersteld", ["colorProfiles"] = new JsonArray(), ["programs"] = programs.DeepClone(), ["looks"] = new JsonArray()
}.ToJsonString() } }.ToJsonString();
var recoveryHandler = new FakeHandler { Response = OllamaEnvelope(sameFallback) };
recoveryHandler.Responses.Enqueue(OllamaEnvelope(onePattern));
var recoveryProvider = new OllamaShowDesignProvider(new HttpClient(recoveryHandler), "gpt-oss:20b");
var recovered = await recoveryProvider.ProposeAsync(partialRequest, default);
Check(recoveryHandler.ChatCalls == 2 && recovered.Programs.Count == 2, "Duplicate recipe is repaired once instead of blocking the entire proposal");
var repairBody = JsonNode.Parse(recoveryHandler.Body!)!;
Check(repairBody["messages"]!.AsArray().Count == 4 && repairBody["messages"]![2]!["role"]!.GetValue<string>() == "assistant"
    && repairBody["messages"]![3]!["content"]!.GetValue<string>().Contains("COMPLETE JSON"), "Correction includes the rejected response and explicit full-proposal instructions");
Check(repairBody["model"]!.GetValue<string>() == "gpt-oss:20b" && recoveryHandler.Bodies.Select(x => JsonNode.Parse(x)!["format"]!.ToJsonString()).Distinct().Count() == 1, "Repair retains request-local model and exact original schema/IDs");
DesignContract.ValidateProposal(partialRequest, recovered.ColorProfiles, recovered.Programs, recovered.Looks);
var repeatedHandler = new FakeHandler { Response = OllamaEnvelope(onePattern) };
try { await new OllamaShowDesignProvider(new HttpClient(repeatedHandler), "gpt-oss:20b").ProposeAsync(partialRequest, default); throw new Exception("Repeated duplicate accepted"); }
catch (HttpRequestException error) { Check(error.Message.Contains("Dubbel animatierecept"), "Final duplicate failure stays actionable for the UI"); }
Check(repeatedHandler.ChatCalls == 2, "Repeated duplicate stops after exactly one repair");
var malformedRepair = sameFallback.DeepClone().AsArray(); malformedRepair[0]!["rateBeats"] = 8;
var invalidRepairHandler = new FakeHandler { Response = OllamaEnvelope(malformedRepair) };
invalidRepairHandler.Responses.Enqueue(OllamaEnvelope(onePattern));
try { await new OllamaShowDesignProvider(new HttpClient(invalidRepairHandler), "gpt-oss:20b").ProposeAsync(partialRequest, default); throw new Exception("Invalid corrected program accepted"); }
catch (HttpRequestException error) { Check(error.Message.Contains("rateBeats"), "Corrective response still passes strict full validation"); }
Check(invalidRepairHandler.ChatCalls == 2, "Invalid correction cannot trigger another retry");
var invalidFirstHandler = new FakeHandler { Response = OllamaEnvelope(malformedRepair) };
try { await new OllamaShowDesignProvider(new HttpClient(invalidFirstHandler), "gpt-oss:20b").ProposeAsync(partialRequest, default); throw new Exception("Invalid first program accepted"); }
catch (HttpRequestException) { }
Check(invalidFirstHandler.ChatCalls == 1, "Other validation errors never start automatic repair");
using var canceledRepair = new CancellationTokenSource();
var cancelHandler = new FakeHandler { Response = OllamaEnvelope(onePattern), AfterChat = () => canceledRepair.Cancel() };
try { await new OllamaShowDesignProvider(new HttpClient(cancelHandler), "gpt-oss:20b").ProposeAsync(partialRequest, canceledRepair.Token); throw new Exception("Cancellation ignored"); }
catch (OperationCanceledException) { }
Check(cancelHandler.ChatCalls == 1, "Cancellation prevents a repair request");
var revisionBeforeRepair = revisionRequest.Show.ToJsonString();
var revisionRepairHandler = new FakeHandler { Response = OllamaEnvelope(new JsonArray(revised.Programs[0]!.DeepClone())) };
revisionRepairHandler.Responses.Enqueue(OllamaEnvelope(conflictingRevision));
var repairedRevision = await new OllamaShowDesignProvider(new HttpClient(revisionRepairHandler), "gpt-oss:20b").ProposeAsync(revisionRequest, default);
Check(repairedRevision.Programs.Count == 1 && repairedRevision.Programs[0]!["id"]!.GetValue<string>() == revised.Programs[0]!["id"]!.GetValue<string>()
    && revisionRequest.Show.ToJsonString() == revisionBeforeRepair, "Revision repair preserves the retained ID and never mutates existing stored programs");
string FullEnvelope(ShowProposal proposal) => new JsonObject { ["done"] = true, ["message"] = new JsonObject { ["content"] = new JsonObject {
    ["summary"] = proposal.Summary, ["colorProfiles"] = proposal.ColorProfiles.DeepClone(), ["programs"] = proposal.Programs.DeepClone(), ["looks"] = proposal.Looks.DeepClone()
}.ToJsonString() } }.ToJsonString();
var replacementDuplicates = replacement.Programs.DeepClone().AsArray(); replacementDuplicates[1]!["pattern"] = replacementDuplicates[0]!["pattern"]!.DeepClone();
var replacementRepairHandler = new FakeHandler { Response = FullEnvelope(replacement) };
replacementRepairHandler.Responses.Enqueue(FullEnvelope(replacement with { Programs = replacementDuplicates }));
var repairedReplacement = await new OllamaShowDesignProvider(new HttpClient(replacementRepairHandler), "gpt-oss:20b").ProposeAsync(replacementRequest, default);
Check(repairedReplacement.ColorProfiles.ToJsonString() == replacement.ColorProfiles.ToJsonString()
    && repairedReplacement.Looks.ToJsonString() == replacement.Looks.ToJsonString(), "Complete replacement repair retains full profiles, Look layers, palettes and group timing from validated model response");
Console.WriteLine("Recovery checks passed: real duplicate response repaired once, same local model/schema, full validation, bounded failure, no retry for other errors, cancellation.");

var tracedRepairHandler = new FakeHandler { Response = OllamaEnvelope(sameFallback) };
tracedRepairHandler.Responses.Enqueue(OllamaEnvelope(onePattern));
var tracedRepair = await new OllamaShowDesignProvider(new HttpClient(tracedRepairHandler), "gpt-oss:20b").ProposeAsync(partialRequest with { IncludeTrace = true }, default);
Check(tracedRepair.Trace is { Attempts.Length: 2, Truncated: false }, "Trace retains both corrective attempts");
Check(tracedRepair.Trace!.Attempts.Select(a => a.RequestBody).SequenceEqual(tracedRepairHandler.Bodies), "Trace request strings exactly match serialized provider bodies");
Check(tracedRepair.Trace.Attempts[0].ResponseBody == OllamaEnvelope(onePattern) && tracedRepair.Trace.Attempts[1].ResponseBody == OllamaEnvelope(sameFallback), "Trace keeps both raw provider envelopes before validation");
Check(repairedReplacement.Trace is null, "Trace remains opt-in for existing consumers");
var refusalHandler = new FakeHandler { Status = HttpStatusCode.BadRequest, Response = "RAW FAILURE" };
try { await new OllamaShowDesignProvider(new HttpClient(refusalHandler), "gpt-oss:20b").ProposeAsync(partialRequest with { IncludeTrace = true }, default); throw new Exception("Failure expected"); }
catch (AiTraceException failure) { Check(failure.Trace.Attempts.Length == 1 && failure.Trace.Attempts[0].ResponseBody == "RAW FAILURE" && failure.Trace.Attempts[0].ResponseStatus == 400, "Failed provider response remains inspectable, isolated from earlier requests"); }
var captureHandler = new FakeHandler { Response = new string('x', 131065) + "SECRET_KEY_123456" };
var capture = new AiTraceCapture(true, "test", "test");
await capture.SendAsync(new HttpClient(captureHandler), "http://localhost/test", new { message = "SECRET_KEY_123456" }, default, "SECRET_KEY_123456");
Check(capture.Export()!.Attempts[0] is { Redacted: true, ResponseTruncated: true } && !capture.Export()!.Attempts[0].RequestBody.Contains("SECRET_KEY") && !capture.Export()!.Attempts[0].ResponseBody!.Contains("SECRET_KEY"), "Secret echo is redacted before retention clipping, no credential header captured");
var hugeCapture = new AiTraceCapture(true, "test", null);
foreach (var escaped in new[] { @"\u0053ECRET_KEY_123456", @"\\u0053ECRET_KEY_123456", @"\u0053\u0045\u0043\u0052\u0045\u0054_KEY_123456" }) {
    var escapedCapture = new AiTraceCapture(true, "test", null);
    await escapedCapture.SendAsync(new HttpClient(new FakeHandler { Response = escaped }), "http://localhost/test", new { text = "safe" }, default, "SECRET_KEY_123456");
    Check(escapedCapture.Export()!.Attempts[0].Redacted && escapedCapture.Export()!.Attempts[0].ResponseBody!.Contains("body withheld"), "Unicode and nested escaped credential echoes are withheld");
}
try { await hugeCapture.SendAsync(new HttpClient(new FakeHandler { Response = new string('x', AiTraceCapture.BodyLimit + 1) }), "http://localhost/test", new { }, default); throw new Exception("Oversized response accepted"); }
catch (HttpRequestException) { Check(hugeCapture.Export() is { Truncated: true } && hugeCapture.Export()!.Attempts[0].ResponseBody!.Length == 131072, "Response hard bound keeps explicitly clipped diagnostic prefix"); }
var hugeRequestHandler = new FakeHandler();
try { await new AiTraceCapture(true, "test", null).SendAsync(new HttpClient(hugeRequestHandler), "http://localhost/test", new { text = new string('x', AiTraceCapture.BodyLimit) }, default); throw new Exception("Oversized request sent"); }
catch (HttpRequestException) { Check(hugeRequestHandler.ChatCalls == 0, "Oversized provider request rejected before send"); }
Console.WriteLine("AI trace checks passed: exact wire bodies, corrective attempt, refusal, opt-in isolation, key redaction, bounded request/response.");
var regieShow = partialRequest.Show.DeepClone().AsObject();
regieShow["regie"] = JsonNode.Parse("""{"minimumCoverage":{"percent":80,"threshold":0.1,"secret":"omit"},"colorRoles":["primary","accent","secondary"],"safetyGroupIds":[],"secret":"omit"}""");
var regieContext = DesignContract.Context(regieShow);
Check(regieContext["regie"]!["minimumCoverage"]!["percent"]!.GetValue<double>() == 80 && regieContext["regie"]!["colorRoles"]!.AsArray().Count == 3 && !regieContext["regie"]!.ToJsonString().Contains("secret"), "AI regie context preserves coverage/roles with nested allowlist and no unrelated fields");

Check(ollamaRequest.OllamaTimeoutMinutes == 15, "Local timeout defaults to fifteen minutes");
foreach (var minutes in new[] { 0, 61 }) { try { DesignContract.ValidateRequest(ollamaRequest with { OllamaTimeoutMinutes = minutes }); throw new Exception("Invalid timeout accepted"); } catch (ArgumentException) { } }
Check(OllamaShowDesignProvider.PredictionBudget(ollamaRequest) == 4096 && OllamaShowDesignProvider.PredictionBudget(replacementRequest) > 4096, "Output budget scales to requested scope without reducing rich recipe headroom");
Check(!body["messages"]![0]!["content"]!.GetValue<string>().Contains("Schema:"), "Schema is supplied exactly once via native format, not duplicated as system prose");
var enteredGeneration = new TaskCompletionSource();
using var cancelGeneration = new CancellationTokenSource();
var blockingHandler = new FakeHandler { Response = FullEnvelope(ollamaResult), WaitBeforeResponse = async token => { enteredGeneration.TrySetResult(); await Task.Delay(Timeout.Infinite, token); } };
var limitedProvider = new OllamaShowDesignProvider(new HttpClient(blockingHandler), "gpt-oss:20b");
var runningGeneration = limitedProvider.ProposeAsync(ollamaRequest, cancelGeneration.Token);
await enteredGeneration.Task;
try { await limitedProvider.ProposeAsync(ollamaRequest, default); throw new Exception("Concurrent generation queued"); } catch (AiBusyException) { }
Check(blockingHandler.ChatCalls == 1, "Concurrent local generation fails immediately without a second model request");
cancelGeneration.Cancel();
try { await runningGeneration; throw new Exception("Cancel ignored"); } catch (OperationCanceledException) { }
blockingHandler.WaitBeforeResponse = null;
await limitedProvider.ProposeAsync(ollamaRequest, default);
Check(blockingHandler.ChatCalls == 2, "Cancellation releases local generation admission");
foreach (var mutation in new Action<JsonArray>[] { c => c[0]!["primary"] = "red", c => c[0]!["intensityLimit"] = 1.1, c => c[0]!["id"] = "existing", c => c[0]!["name"] = "", c => c[0]!["extra"] = "unknown" }) {
    var changed = ollamaResult.ColorProfiles.DeepClone().AsArray(); mutation(changed);
    try { DesignContract.ValidateProposal(ollamaRequest, changed, [], []); throw new Exception("Invalid palette accepted"); } catch (System.Text.Json.JsonException) { }
}
Console.WriteLine("AI capacity checks passed: timeout defaults/bounds, single-flight cancellation/release, scoped budgets, no duplicated schema, strict palette identity and values.");

string StreamEnvelope(string envelope, string thinking = "") {
    var parsed = JsonNode.Parse(envelope)!;
    var content = parsed["message"]!["content"]!.GetValue<string>();
    return System.Text.Json.JsonSerializer.Serialize(new { done = false, message = new { thinking, content = "" } }) + "\n"
        + System.Text.Json.JsonSerializer.Serialize(new { done = false, message = new { content } }) + "\n"
        + System.Text.Json.JsonSerializer.Serialize(new { done = true, done_reason = parsed["done_reason"]?.GetValue<string>() ?? "stop", message = new { content = "" } }) + "\n";
}
var streamBody = StreamEnvelope(FullEnvelope(ollamaResult), "Ik vergelijk kleurcombinaties.");
var streamHandler = new FakeHandler { Response = streamBody };
var streamEvents = new List<AiProgress>();
Task Report(AiProgress update, CancellationToken token) { token.ThrowIfCancellationRequested(); streamEvents.Add(update); return Task.CompletedTask; }
var streamed = await new OllamaShowDesignProvider(new HttpClient(streamHandler), "gpt-oss:20b").ProposeStreamingAsync(ollamaRequest with { IncludeTrace = true }, Report, default);
Check(streamed.ColorProfiles.Count == 1 && JsonNode.Parse(streamHandler.Body!)!["stream"]!.GetValue<bool>(), "Opt-in provider uses native stream:true and validates assembled proposal");
Check(streamed.Trace!.Attempts[0].ResponseBody == streamBody && streamEvents.Any(e => e.Phase == "thinking") && streamEvents.Any(e => e.Phase == "generating") && streamEvents.Last().Phase == "validating", "Actual NDJSON trace and truthful ordered activity phases");
var streamRepair = new FakeHandler { Response = StreamEnvelope(OllamaEnvelope(sameFallback)) };
streamRepair.Responses.Enqueue(StreamEnvelope(OllamaEnvelope(onePattern)));
streamEvents.Clear();
var streamRepaired = await new OllamaShowDesignProvider(new HttpClient(streamRepair), "gpt-oss:20b").ProposeStreamingAsync(partialRequest with { IncludeTrace = true }, Report, default);
Check(streamRepaired.Trace!.Attempts.Length == 2 && streamEvents.Any(e => e.Phase == "correcting" && e.Attempt == 2) && streamEvents.Last().Attempt == 2, "Streaming correction stays bounded to two traced and labelled attempts");
var lengthStream = new FakeHandler { Response = streamBody.Replace("\"stop\"", "\"length\"") };
try { await new OllamaShowDesignProvider(new HttpClient(lengthStream), "gpt-oss:20b").ProposeStreamingAsync(ollamaRequest, Report, default); throw new Exception("Length-truncated streamed proposal accepted"); } catch (HttpRequestException e) { Check(e.Message.Contains("voortijdig"), "Explicit length truncation remains actionable"); }
using var streamCancellation = new CancellationTokenSource();
var cancelStreamProvider = new OllamaShowDesignProvider(new HttpClient(streamHandler), "gpt-oss:20b");
try { await cancelStreamProvider.ProposeStreamingAsync(ollamaRequest, (update, token) => { if (update.Phase == "thinking") streamCancellation.Cancel(); token.ThrowIfCancellationRequested(); return Task.CompletedTask; }, streamCancellation.Token); throw new Exception("Streaming cancellation ignored"); } catch (OperationCanceledException) { }
await cancelStreamProvider.ProposeStreamingAsync(ollamaRequest, Report, default);
Console.WriteLine("Streaming provider checks passed: opt-in native transport, ordered phases, exact NDJSON trace, corrective retry, length rejection and cancellation releases admission.");

sealed class FakeHandler : HttpMessageHandler {
    public Func<CancellationToken, Task>? WaitBeforeResponse;
    public const string Installed = "{\"models\":[{\"name\":\"llama3.2:3b\"},{\"name\":\"gpt-oss:20b\"},{\"name\":\"gpt-oss:20b\"},{\"name\":\"gpt-oss:120b-cloud\"}]}";
    public string TagsResponse = Installed;
    public HttpStatusCode TagsStatus = HttpStatusCode.OK;
    public int ChatCalls;
    public HttpStatusCode Status = HttpStatusCode.OK;
    public string? Body;
    public List<string> Bodies = new();
    public Action? AfterChat;
    public Queue<string> Responses = new();
    public string Response = """{"output":[{"type":"reasoning"},{"type":"message","content":[{"type":"output_text","text":"{\"summary\":\"Test\",\"colorProfiles\":[],\"programs\":[],\"looks\":[]}"}]}]}""";
    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) {
        if (request.RequestUri!.AbsolutePath == "/api/tags") return new HttpResponseMessage(TagsStatus) { Content = new StringContent(TagsResponse, Encoding.UTF8, "application/json") };
        ChatCalls++;
        Body = await request.Content!.ReadAsStringAsync(cancellationToken);
        Bodies.Add(Body);
        AfterChat?.Invoke();
        if (WaitBeforeResponse is not null) await WaitBeforeResponse(cancellationToken);
        return new HttpResponseMessage(Status) { Content = new StringContent(Responses.TryDequeue(out var queued) ? queued : Response, Encoding.UTF8, "application/json") };
    }
}
