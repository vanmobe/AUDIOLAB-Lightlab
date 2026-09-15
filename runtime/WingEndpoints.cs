using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace Lightflow.Runtime;

public static class WingEndpoints
{
    static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
        RespectRequiredConstructorParameters = true,
        RespectNullableAnnotations = true,
        MaxDepth = 12,
    };
    public static T Parse<T>(byte[] bytes)
    {
        using var doc = JsonDocument.Parse(bytes, new JsonDocumentOptions { MaxDepth = 12 });
        void Unique(JsonElement element)
        {
            if (element.ValueKind == JsonValueKind.Object)
            {
                var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                foreach (var property in element.EnumerateObject()) { if (!names.Add(property.Name)) throw new JsonException(); Unique(property.Value); }
            }
            else if (element.ValueKind == JsonValueKind.Array) foreach (var item in element.EnumerateArray()) Unique(item);
        }
        Unique(doc.RootElement);
        return JsonSerializer.Deserialize<T>(bytes, JsonOptions) ?? throw new JsonException();
    }
    public static void MapWingEndpoints(this IEndpointRouteBuilder app)
    {
        var sync = new WingSync();
        app.MapPost("/controllers/wing/probe", (HttpContext context, CancellationToken ct) => Handle<WingProbeRequest>(context, async (request, token) => await sync.ProbeAsync(request, token), ct));
        app.MapPost("/controllers/wing/plan", (HttpContext context, CancellationToken ct) => Handle<WingPlanRequest>(context, async (request, token) => await sync.PlanAsync(request, token), ct));
        app.MapPost("/controllers/wing/apply", (HttpContext context, CancellationToken ct) => Handle<WingApplyRequest>(context, async (request, token) => await sync.ApplyAsync(request, token), ct));
    }
    static async Task<IResult> Handle<T>(HttpContext context, Func<T, CancellationToken, Task<object>> action, CancellationToken ct)
    {
        context.Response.Headers.CacheControl = "no-store";
        try
        {
            if (context.Request.ContentLength > 262144) return Results.StatusCode(413);
            using var buffer = new MemoryStream();
            var chunk = new byte[8192];
            using var readTimeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            readTimeout.CancelAfter(TimeSpan.FromSeconds(5));
            int read;
            while ((read = await context.Request.Body.ReadAsync(chunk, readTimeout.Token)) != 0)
            {
                if (buffer.Length + read > 262144) return Results.StatusCode(413);
                buffer.Write(chunk, 0, read);
            }
            return Results.Ok(await action(Parse<T>(buffer.ToArray()), ct));
        }
        catch (WingConflictException error) { return Results.Json(new { error = error.Message }, statusCode: 409); }
        catch (ArgumentException error) { return Results.BadRequest(new { error = error.Message }); }
        catch (JsonException) { return Results.BadRequest(new { error = "Ongeldige, onbekende of ontbrekende WING-aanvraagvelden." }); }
        catch (OperationCanceledException) { return Results.Json(new { error = "De WING-opdracht is verlopen of geannuleerd. Lees de instellingen opnieuw uit." }, statusCode: 504); }
        catch (Exception error) when (error is IOException or System.Net.Sockets.SocketException) { return Results.Json(new { error = "Geen geldig WING-antwoord. Controleer het IP-adres, netwerk en OSC-toegang." }, statusCode: 503); }
    }
}
