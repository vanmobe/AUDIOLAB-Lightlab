using System.Text;
using System.Text.Json.Nodes;
using Lightflow.Runtime;

static class AiRequestInputChecks {
    public static void Run() {
        const string valid = """{"intent":"Test","options":{"scope":"all","profileCount":1,"programCount":1,"lookCount":1,"revision":false},"show":{}}""";
        void Reject(Action<JsonObject> change, string expected) {
            var body = JsonNode.Parse(valid)!.AsObject(); change(body);
            try { AiRequestInput.Read(Encoding.UTF8.GetBytes(body.ToJsonString())); throw new Exception("Invalid request accepted"); }
            catch (Exception error) {
                if (!error.Message.Contains(expected) || !error.Message.Contains("niet naar het AI-model"))
                    throw new Exception($"Expected safe actionable diagnostic for {expected}, got {error.GetType().Name}");
                if (error.Message.Contains("PRIVATE_VALUE") || error.Message.Contains("PRIVATE_KEY")) throw new Exception("Private input leaked");
            }
        }
        // The actual transport parser must explain a malformed count before any provider is invoked.
        Reject(body => body["options"]!["profileCount"] = 1.5, "Aantal kleurprofielen");
        Reject(body => body["options"]!.AsObject().Remove("programCount"), "Aantal animaties");
        Reject(body => body["ollamaTimeoutMinutes"] = 0, "Ollama-tijdslimiet");
        Reject(body => body["show"] = null, "Showgegevens");
        Reject(body => body["options"]!["revision"] = "PRIVATE_VALUE", "Werkwijze");
        Reject(body => body["PRIVATE_KEY"] = "PRIVATE_VALUE", "webapp en runtime");
        Reject(body => body["options"]!["PRIVATE_KEY"] = "PRIVATE_VALUE", "webapp en runtime");
        var legacy = AiRequestInput.Read(Encoding.UTF8.GetBytes(valid));
        if (legacy.OllamaTimeoutMinutes != 15 || legacy.Options.Replace) throw new Exception("Optional legacy defaults changed");
        var current = JsonNode.Parse(valid)!.AsObject(); current["ollamaTimeoutMinutes"] = 60; current["includeTrace"] = true; current["model"] = "local-test";
        if (AiRequestInput.Read(Encoding.UTF8.GetBytes(current.ToJsonString())).OllamaTimeoutMinutes != 60) throw new Exception("Current UI deadline rejected");
        current["ollamaTimeoutMinutes"] = 1; current["options"]!["scope"] = "programs"; current["options"]!["profileCount"] = 0; current["options"]!["lookCount"] = 0;
        if (AiRequestInput.Read(Encoding.UTF8.GetBytes(current.ToJsonString())).Options.ProfileCount != 0) throw new Exception("Inactive count normalization rejected");
        foreach (var malformed in new[] { "{", valid.Replace("\"intent\":\"Test\"", "\"intent\":\"Test\",\"intent\":\"PRIVATE_VALUE\""), valid.Replace("\"revision\":false", "\"revision\":false,\"revision\":true"), valid.Replace("\"show\":{}", "\"show\":{\"id\":\"PRIVATE_VALUE\",\"id\":\"duplicate\"}"), new string('[', 20) + "0" + new string(']', 20), new string(' ', 2 * 1024 * 1024 + 1) }) {
            try { AiRequestInput.Read(Encoding.UTF8.GetBytes(malformed)); throw new Exception("Malformed structure accepted"); }
            catch (ArgumentException error) { if (!error.Message.Contains("niet naar het AI-model") || error.Message.Contains("PRIVATE_VALUE")) throw; }
        }
        Console.WriteLine("AI input checks passed: field labels, strict envelope, safe diagnostics and optional defaults.");
    }
}
