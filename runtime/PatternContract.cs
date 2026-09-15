using System.Text.Json;
using System.Text.Json.Nodes;

namespace Lightflow.Runtime;

/// <summary>Bounded declarative patterns only: no executable model output enters the engine.</summary>
public static class PatternContract {
    public static readonly string[] Selections = ["all", "alternate", "moving", "random"];
    public static readonly string[] Directions = ["forward", "reverse", "bounce", "inward", "outward"];
    public static readonly string[] Envelopes = ["hold", "fade-in", "fade-out", "pulse"];
    static object Obj(Dictionary<string, object> fields) => new { type = "object", properties = fields, required = fields.Keys.ToArray(), additionalProperties = false };
    public static object Schema() => Obj(new() {
        ["version"] = new { type = "integer", @enum = new[] { 1 } },
        ["floor"] = new { type = "number", minimum = 0, maximum = 1 },
        ["steps"] = new { type = "array", minItems = 1, maxItems = 16, items = Obj(new() {
            ["selection"] = new { type = "string", @enum = Selections },
            ["direction"] = new { type = "string", @enum = Directions },
            ["envelope"] = new { type = "string", @enum = Envelopes },
            ["width"] = new { type = "integer", minimum = 1, maximum = 8 },
            ["trail"] = new { type = "number", minimum = 0, maximum = 1 },
            ["level"] = new { type = "number", minimum = 0, maximum = 1 },
            ["weight"] = new { type = "integer", minimum = 1, maximum = 8 }
        }) }
    });

    static JsonObject ExactObject(JsonNode? node, params string[] fields) {
        if (node is not JsonObject obj || obj.Count != fields.Length || fields.Any(f => !obj.ContainsKey(f))) throw new JsonException("Patroon bevat ontbrekende of onbekende velden; alleen de declaratieve patroonvelden zijn toegestaan.");
        return obj;
    }
    static double Number(JsonNode? node, double min, double max, bool integer = false) {
        // Read JSON numeric syntax, not strings or coerced booleans; reject non-finite in-memory values too.
        double value;
        try {
            if (node is not JsonValue || !double.TryParse(node.ToJsonString(), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out value)
                || !double.IsFinite(value) || value < min || value > max || (integer && value != Math.Truncate(value))) throw new JsonException("Patroon bevat een ongeldige numerieke waarde.");
        } catch (ArgumentException e) { throw new JsonException("Patroon bevat een ongeldige numerieke waarde.", e); }
        return value;
    }
    static string Choice(JsonNode? node, string[] choices) {
        if (node is not JsonValue value || !value.TryGetValue<string>(out var text) || !choices.Contains(text)) throw new JsonException("Patroon bevat een onbekende selectie, richting of envelop.");
        return text;
    }
    static int Gcd(int a, int b) { while (b != 0) (a, b) = (b, a % b); return a; }
    public static string Signature(JsonNode program, bool requirePattern = false) {
        if (program["pattern"] is null) {
            if (requirePattern || program.AsObject().ContainsKey("pattern")) throw new JsonException("Elke nieuwe animatie moet een declaratief patroon bevatten.");
            return "effect:" + program["effect"]?.GetValue<string>();
        }
        var pattern = ExactObject(program["pattern"], "version", "floor", "steps");
        Number(pattern["version"], 1, 1, true);
        var floor = Number(pattern["floor"], 0, 1);
        if (pattern["steps"] is not JsonArray steps || steps.Count is < 1 or > 16) throw new JsonException("Een patroon heeft 1 tot 16 stappen.");
        var normalized = new JsonArray();
        var divisor = 0;
        foreach (var item in steps) {
            var step = ExactObject(item, "selection", "direction", "envelope", "width", "trail", "level", "weight");
            var selection = Choice(step["selection"], Selections);
            var direction = Choice(step["direction"], Directions);
            var envelope = Choice(step["envelope"], Envelopes);
            var width = (int)Number(step["width"], 1, 8, true);
            var trail = Number(step["trail"], 0, 1);
            var level = Number(step["level"], 0, 1);
            var weight = (int)Number(step["weight"], 1, 8, true);
            divisor = Gcd(divisor, weight);
            if (selection != "moving") { direction = "forward"; trail = 0; }
            if (selection is "all" or "alternate") width = 1;
            normalized.Add(new JsonObject { ["selection"] = selection, ["direction"] = direction, ["envelope"] = envelope, ["width"] = width, ["trail"] = trail, ["level"] = level, ["weight"] = weight });
        }
        // Mirror the browser: collapse only rig-independent, wholly constant recipes.
        var constants = normalized.Select(step => {
            var level = step!["level"]!.GetValue<double>();
            return level <= floor ? (double?)floor : step["selection"]!.GetValue<string>() == "all" && step["envelope"]!.GetValue<string>() == "hold" ? level : null;
        }).ToArray();
        if (constants[0] is double constant && constants.All(value => value == constant)) {
            floor = constant;
            normalized = new JsonArray(new JsonObject { ["selection"] = "all", ["direction"] = "forward", ["envelope"] = "hold", ["width"] = 1, ["trail"] = 0, ["level"] = constant, ["weight"] = 1 });
        } else foreach (var step in normalized) step!["weight"] = step["weight"]!.GetValue<int>() / divisor;
        return "recipe:" + new JsonObject { ["version"] = 1, ["floor"] = floor, ["steps"] = normalized }.ToJsonString();
    }

    public static JsonObject Template(int index) {
        // These are honest bounded offline recipes, not claims of model creativity.
        var selection = Selections[index % Selections.Length];
        var direction = Directions[(index / 4) % Directions.Length];
        var envelope = Envelopes[(index / 20) % Envelopes.Length];
        var width = 1 + (index / 80) % 4;
        var step = new JsonObject { ["selection"] = selection, ["direction"] = direction, ["envelope"] = envelope, ["width"] = width, ["trail"] = 0.5, ["level"] = 1.0, ["weight"] = 1 };
        var steps = new JsonArray(step);
        // A second contrasting state gives alternating sequences a real compositional difference.
        if (index % 5 > 0) steps.Add(new JsonObject { ["selection"] = "all", ["direction"] = "forward", ["envelope"] = Envelopes[(index % 5 - 1) % 4], ["width"] = 1, ["trail"] = 0.0, ["level"] = 0.5, ["weight"] = 1 + index % 3 });
        return new JsonObject { ["version"] = 1, ["floor"] = 0.2, ["steps"] = steps };
    }

    public static string TemplateName(JsonObject pattern) {
        string StepName(JsonNode step) {
            var selection = step["selection"]!.GetValue<string>();
            var subject = selection switch {
                "all" => "Heel veld", "alternate" => "Even en oneven", "random" => "Losse vonken",
                _ => step["direction"]!.GetValue<string>() switch { "reverse" => "Teruglopende staart", "bounce" => "Heen en weer", "inward" => "Spiegel naar binnen", "outward" => "Spiegel naar buiten", _ => "Voorwaartse staart" }
            };
            var envelope = step["envelope"]!.GetValue<string>() switch { "fade-in" => "opbouw", "fade-out" => "uitdovend", "pulse" => "ademend", _ => "vast" };
            return $"{subject} {envelope}";
        }
        var steps = pattern["steps"]!.AsArray();
        return steps.Count == 1 ? StepName(steps[0]!) : $"{StepName(steps[0]!)} → {StepName(steps[1]!)}";
    }
}
