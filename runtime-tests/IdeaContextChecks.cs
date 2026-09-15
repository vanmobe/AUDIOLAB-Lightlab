using System.Text.Json.Nodes;
using Lightflow.Runtime;

static class IdeaContextChecks {
    static void Check(bool ok, string message) { if (!ok) throw new Exception(message); }
    public static async Task Run() {
        var show = JsonNode.Parse("""
        {
          "groups":[{"id":"wash","name":"Wash"}],
          "colorProfiles":[{"id":"old-color","name":"Warm","primary":"#ff8800","accent":"#aa3300","secondary":"#ffaa22","white":"#fff4dd","intensityLimit":0.9}],
          "programs":[{"id":"old-pattern","name":"Spiegel","effect":"chase","rateBeats":1,"defaultColorProfileId":"old-color","targetGroupIds":["wash"],"pattern":{"version":1,"floor":0.3,"steps":[{"selection":"moving","direction":"inward","envelope":"fade-out","width":2,"trail":0.6,"level":1,"weight":1}]}}],
          "looks":[{"id":"old-look","name":"Rustige spiegel","programId":"old-pattern","colorProfileId":"old-color","layers":[{"groupId":"wash","mode":"animation","programId":"old-pattern","colorProfileId":null,"intensity":0.8,"rateBeats":8,"offsetBeats":2}]}],
          "routes":[{"host":"PRIVATE-CONTEXT-SENTINEL"}]
        }
        """)!.AsObject();
        var before = show.ToJsonString();
        var context = DesignContract.Context(show);
        foreach (var key in DesignContract.Collections)
            Check(JsonNode.DeepEquals(context[key], show[key]), "Complete existing creative contents reach idea-generation context: " + key);
        Check(context["collectionGuidance"]!.GetValue<string>() == DesignContract.IdeaGenerationGuidance, "Authored collection guidance accompanies actual library");
        Check(show.ToJsonString() == before && !context.ToJsonString().Contains("PRIVATE-CONTEXT-SENTINEL"), "Projection preserves show and omits routing");

        var request = new ShowDesignRequest("Een nieuw koel kleuridee", new("colorProfiles", 1, 0, 0, false), show);
        var answer = JsonNode.Parse("""
        {"summary":"Een koel contrast met de bestaande warme collectie.","colorProfiles":[{"id":"new-color","name":"Koel","primary":"#2288ff","accent":"#22ffcc","secondary":"#112266","white":"#ffffff","intensityLimit":1}],"programs":[],"looks":[]}
        """)!;
        var handler = new FakeHandler { Response = new JsonObject { ["done"] = true, ["message"] = new JsonObject { ["content"] = answer.ToJsonString() } }.ToJsonString() };
        await new OllamaShowDesignProvider(new HttpClient(handler), "gpt-oss:20b").ProposeAsync(request, default);
        var ollamaContext = JsonNode.Parse(JsonNode.Parse(handler.Body!)!["messages"]![1]!["content"]!.GetValue<string>())!["context"];
        Check(JsonNode.DeepEquals(context, ollamaContext), "Ollama receives complete library even for palette-only generation");

        handler.Response = new JsonObject { ["output"] = new JsonArray(new JsonObject { ["content"] = new JsonArray(new JsonObject { ["type"] = "output_text", ["text"] = answer.ToJsonString() }) }) }.ToJsonString();
        await new OpenAiShowDesignProvider(new HttpClient(handler), "test-only", "test-model").ProposeAsync(request, default);
        var openAiContext = JsonNode.Parse(JsonNode.Parse(handler.Body!)!["input"]!.GetValue<string>())!["context"];
        Check(JsonNode.DeepEquals(context, openAiContext), "OpenAI receives identical existing-library context and idea guidance");
        Console.WriteLine("Idea context checks passed: complete palettes/recipes/Looks across scopes, shared provider guidance, immutable allowlisted projection.");
    }
}
