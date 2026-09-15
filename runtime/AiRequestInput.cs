using System.Text.Json;

namespace Lightflow.Runtime;

public sealed class AiRequestInputException(string message) : ArgumentException(message);

public static class AiRequestInput
{
    static AiRequestInputException Invalid(string message) => new(message + " De aanvraag is niet naar het AI-model verstuurd.");
    public static ShowDesignRequest Read(ReadOnlyMemory<byte> body)
    {
        // Only authored field labels escape this boundary, never parser messages or private JSON paths/values.
        if (body.Length > 2 * 1024 * 1024) throw Invalid("De ontwerpaanvraag is te groot (maximaal 2 MiB).");
        try
        {
            using var document = JsonDocument.Parse(body, new JsonDocumentOptions { MaxDepth = DmxInspection.JsonOptions.MaxDepth });
            var root = document.RootElement;
            CheckObject(root, "Ontwerpaanvraag", ["intent", "options", "show", "model", "includeTrace", "ollamaTimeoutMinutes", "provider"]);
            Check(root, "provider", "AI-provider", value => value.ValueKind == JsonValueKind.Null || value.ValueKind == JsonValueKind.String && new[] { "copilot", "ollama", "openai", "offline-templates" }.Contains(value.GetString()), "kies een ondersteunde provider", optional: true);
            Check(root, "intent", "Ontwerpvraag", value => value.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(value.GetString()) && value.GetString()!.Length <= 8000, "vul een tekst in van 1 tot 8000 tekens");
            Check(root, "show", "Showgegevens", value => value.ValueKind == JsonValueKind.Object, "de show ontbreekt of heeft een ongeldige structuur; open je show opnieuw");
            Check(root, "options", "Ontwerpinstellingen", value => value.ValueKind == JsonValueKind.Object, "kies wat je wilt maken en de aantallen");
            Check(root, "model", "AI-model", value => value.ValueKind is JsonValueKind.String or JsonValueKind.Null, "kies een beschikbaar model", optional: true);
            Check(root, "includeTrace", "AI-diagnose", Boolean, "verwacht aan of uit", optional: true);
            Check(root, "ollamaTimeoutMinutes", "Ollama-tijdslimiet", value => Integer(value, 1, 60), "kies een geheel aantal minuten van 1 tot 60", optional: true);
            var options = root.GetProperty("options");
            CheckObject(options, "Ontwerpinstellingen", ["scope", "profileCount", "programCount", "lookCount", "revision", "replace"]);
            Check(options, "scope", "Wat maken we?", value => value.ValueKind == JsonValueKind.String && new[] { "all", "colorProfiles", "programs", "looks" }.Contains(value.GetString()), "kies een complete collectie, kleurprofielen, animaties of Looks");
            var scope = options.GetProperty("scope").GetString();
            foreach (var (field, collection, label) in new[] { ("profileCount", "colorProfiles", "Aantal kleurprofielen"), ("programCount", "programs", "Aantal animaties"), ("lookCount", "looks", "Aantal Looks") })
            {
                var minimum = scope == "all" || scope == collection ? 1 : 0;
                Check(options, field, label, value => Integer(value, minimum, 32), $"kies een geheel getal van {minimum} tot 32");
            }
            Check(options, "revision", "Werkwijze", Boolean, "kies toevoegen, verfijnen of vervangen");
            Check(options, "replace", "Volledige reeks vervangen", Boolean, "verwacht aan of uit", optional: true);
            return JsonSerializer.Deserialize<ShowDesignRequest>(body.Span, DmxInspection.JsonOptions)!;
        }
        catch (Exception error) when (error is JsonException || error is ArgumentException and not AiRequestInputException)
        {
            throw Invalid("De aanvraagstructuur is ongeldig, bevat dubbele velden of is te diep genest. Herlaad de webapp; blijft dit gebeuren, exporteer je show voor controle.");
        }
    }
    static bool Boolean(JsonElement value) => value.ValueKind is JsonValueKind.True or JsonValueKind.False;
    static bool Integer(JsonElement value, int min, int max) => value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var number) && number >= min && number <= max;
    static void Check(JsonElement parent, string field, string label, Func<JsonElement, bool> valid, string hint, bool optional = false)
    {
        if (!parent.TryGetProperty(field, out var value)) { if (optional) return; throw Invalid($"{label} ontbreekt: {hint}."); }
        if (!valid(value)) throw Invalid($"{label} is ongeldig: {hint}.");
    }
    static void CheckObject(JsonElement value, string label, string[] allowed)
    {
        if (value.ValueKind != JsonValueKind.Object) throw Invalid($"{label} moet een geldig object zijn.");
        var seen = new HashSet<string>();
        foreach (var property in value.EnumerateObject())
        {
            if (!seen.Add(property.Name)) throw Invalid($"{label} bevat dubbele velden. Herlaad de webapp.");
            if (!allowed.Contains(property.Name)) throw Invalid($"{label} bevat niet-ondersteunde velden. Controleer of webapp en runtime dezelfde versie gebruiken en herstart de runtime.");
        }
    }
}
