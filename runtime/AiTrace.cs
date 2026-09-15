using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Lightflow.Runtime;

public sealed record AiTraceAttempt(string RequestBody, string? ResponseBody, int? ResponseStatus, bool RequestTruncated, bool ResponseTruncated, bool Redacted = false);
public sealed record AiTrace(int Version, string Provider, string? Model, AiTraceAttempt[] Attempts, bool Truncated);
public sealed class AiTraceException(Exception inner, AiTrace trace) : Exception("AI-aanvraag mislukt.", inner) { public AiTrace Trace { get; } = trace; }
public sealed class AiBodyLimitException(string message) : HttpRequestException(message);

/// <summary>Request-local wire-body capture only: no headers, credentials, shared history or disk writes.</summary>
public sealed class AiTraceCapture(bool enabled, string provider, string? model)
{
    public const int BodyLimit = 2 * 1024 * 1024;
    const int TextLimit = 128 * 1024;
    readonly List<AiTraceAttempt> attempts = [];
    string? secret;
    string Redact(string text)
    {
        if (string.IsNullOrEmpty(secret)) return text;
        var safe = text.Replace(secret, "[REDACTED_API_KEY]", StringComparison.Ordinal);
        var decoded = safe;
        // Provider envelopes can JSON-escape a credential inside an escaped JSON string.
        // Detection never rewrites clean wire text; encoded matches withhold the whole body.
        for (var depth = 0; depth < 16; depth++)
        {
            var next = Regex.Replace(decoded, @"\\(?:u([0-9a-fA-F]{4})|([\\/""bfnrt]))", match =>
                match.Groups[1].Success ? ((char)Convert.ToInt32(match.Groups[1].Value, 16)).ToString()
                : match.Groups[2].Value switch { "b" => "\b", "f" => "\f", "n" => "\n", "r" => "\r", "t" => "\t", var other => other });
            if (next.Contains(secret, StringComparison.Ordinal)) return "[REDACTED_API_KEY: encoded credential; body withheld]";
            if (next == decoded) return safe;
            decoded = next;
        }
        return "[REDACTED_API_KEY: escape depth exceeded; body withheld]";
    }
    public AiTrace? Export() => enabled ? new(1, provider, model, attempts.ToArray(), attempts.Any(a => a.RequestTruncated || a.ResponseTruncated)) : null;
    public async Task<(int Status, string Body)> SendAsync(HttpClient http, string url, object payload, CancellationToken token, string? apiKey = null, Func<HttpResponseMessage, CancellationToken, Action<string, bool>?, Task<string>>? readBody = null)
    {
        var body = JsonSerializer.Serialize(payload, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        // Reject before redaction/escape decoding as well as before network I/O.
        if (Encoding.UTF8.GetByteCount(body) > BodyLimit) throw new AiBodyLimitException("De provider-aanvraag is te groot. Vraag minder items tegelijk.");
        secret = apiKey;
        var index = attempts.Count;
        if (enabled && index < 2) { var safe = Redact(body); attempts.Add(new(safe[..Math.Min(safe.Length, TextLimit)], null, null, safe.Length > TextLimit, false, safe != body)); }
        using var request = new HttpRequestMessage(HttpMethod.Post, url) { Content = new StringContent(body, Encoding.UTF8, "application/json") };
        if (apiKey is not null) request.Headers.Authorization = new("Bearer", apiKey);
        using var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, token);
        if (enabled && index < 2) attempts[index] = attempts[index] with { ResponseStatus = (int)response.StatusCode };
        var text = await (readBody ?? ReadBodyAsync)(response, token, enabled && index < 2 ? (prefix, clipped) =>
        {
            var safe = Redact(prefix);
            // A canceled/oversized stream can end halfway through a credential echo.
            if (clipped && !string.IsNullOrEmpty(secret)) safe = "[REDACTED_API_KEY: incomplete body withheld]";
            attempts[index] = attempts[index] with { ResponseBody = safe[..Math.Min(safe.Length, TextLimit)], ResponseTruncated = clipped || safe.Length > TextLimit, Redacted = attempts[index].Redacted || safe != prefix };
        }
        : null);
        return ((int)response.StatusCode, text);
    }
    public static async Task<string> ReadBodyAsync(HttpResponseMessage response, CancellationToken token, Action<string, bool>? capture = null)
    {
        using var stream = await response.Content.ReadAsStreamAsync(token);
        using var bytes = new MemoryStream(); var buffer = new byte[16384]; var complete = false;
        try
        {
            int read;
            while ((read = await stream.ReadAsync(buffer, token)) > 0)
            {
                var keep = Math.Min(read, BodyLimit - (int)bytes.Length);
                bytes.Write(buffer, 0, keep);
                if (keep < read) throw new AiBodyLimitException("Providerantwoord is te groot. Vraag minder items tegelijk.");
            }
            complete = true;
            return Encoding.UTF8.GetString(bytes.GetBuffer(), 0, (int)bytes.Length);
        }
        finally
        {
            if (capture is not null)
            {
                var text = Encoding.UTF8.GetString(bytes.GetBuffer(), 0, (int)bytes.Length);
                capture(text, !complete);
            }
        }
    }
}
