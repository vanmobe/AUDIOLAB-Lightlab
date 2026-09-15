using System.Net;
using System.Net.Sockets;
using Lightflow.Runtime;

var builder = WebApplication.CreateBuilder(args);
var configuredPort = Environment.GetEnvironmentVariable("LIGHTLAB_RUNTIME_PORT");
var runtimePort = 5188;
if (configuredPort is not null && (!int.TryParse(configuredPort, out runtimePort) || runtimePort is < 1024 or > 65535))
    throw new InvalidOperationException("LIGHTLAB_RUNTIME_PORT moet een poortnummer tussen 1024 en 65535 zijn.");
const string RuntimeVersion = "0.1.0";
const string AiContractVersion = "2026-09-15.2";
builder.WebHost.UseUrls($"http://127.0.0.1:{runtimePort}");
builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy
    .WithOrigins(LocalRequestPolicy.BrowserOrigins)
    .AllowAnyHeader().AllowAnyMethod()));
var app = builder.Build();
app.Use(async (context, next) =>
{
    if (HttpMethods.IsGet(context.Request.Method) && context.Request.Path.StartsWithSegments("/playback"))
        context.Response.Headers.CacheControl = "no-store";
    var origin = context.Request.Headers.Origin;
    if (origin.Count > 1 || !LocalRequestPolicy.Allows(context.Request.Host.Host, origin.Count == 0 ? null : origin.ToString()))
    {
        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        return;
    }
    await next(context);
});
app.UseCors();
app.MapWingEndpoints();
var outputOwnership = new OutputOwnership();
var state = new OutputSession(outputOwnership);
var workerPath = Environment.GetEnvironmentVariable("LIGHTLAB_WORKER_PATH")
    ?? Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../runtime-worker/dist/engine.mjs"));
var playback = new PlaybackSession(() => new NodeShowEvaluator(workerPath), output: new PlaybackOutput(outputOwnership));
app.Lifetime.ApplicationStopping.Register(() => playback.DisposeAsync().AsTask().GetAwaiter().GetResult());
var apiKey = Environment.GetEnvironmentVariable("LIGHTFLOW_OPENAI_API_KEY");
var aiProvider = Environment.GetEnvironmentVariable("LIGHTFLOW_AI_PROVIDER") ?? "offline-templates";
var aiUnavailable = aiProvider == "openai" && string.IsNullOrWhiteSpace(apiKey);
var aiModel = aiProvider == "ollama" ? Environment.GetEnvironmentVariable("LIGHTFLOW_OLLAMA_MODEL") ?? "gpt-oss:20b" : aiProvider == "openai" ? Environment.GetEnvironmentVariable("LIGHTFLOW_OPENAI_MODEL") ?? "gpt-4.1-mini" : null;
var ollamaProvider = new OllamaShowDesignProvider(new HttpClient(new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = Timeout.InfiniteTimeSpan }, Environment.GetEnvironmentVariable("LIGHTFLOW_OLLAMA_MODEL") ?? "gpt-oss:20b");
var copilotProvider = new CopilotShowDesignProvider(new CopilotSdkTransport());
IShowDesignProvider ai = aiProvider switch
{
    "ollama" => ollamaProvider,
    "copilot" => copilotProvider,
    "openai" when !aiUnavailable => new OpenAiShowDesignProvider(new HttpClient(), apiKey!, aiModel!),
    "openai" or "offline-templates" or "local-rules" => new LocalShowDesignProvider(),
    _ => throw new InvalidOperationException("Onbekende LIGHTFLOW_AI_PROVIDER. Kies ollama, copilot, openai of offline-templates.")
};
IShowDesignProvider ResolveAi(string? requested) => requested switch
{
    null => ai,
    "copilot" => copilotProvider,
    "ollama" => ollamaProvider,
    "offline-templates" => new LocalShowDesignProvider(),
    "openai" when ai.Id == "openai" => ai,
    _ => throw new ArgumentException("Deze AI-provider is niet geconfigureerd in de runtime.")
};

app.MapGet("/health", () => Results.Ok(new { status = "ready", armed = state.Armed || playback.OutputStatus.State == "armed", output = "disabled-by-default", runtimeVersion = RuntimeVersion, aiContractVersion = AiContractVersion }));
app.MapGet("/playback/status", () => Results.Ok(playback.Status));
app.MapGet("/playback/audio", (string? sessionId) => sessionId is not null && playback.Status.SessionId == sessionId
    ? Results.Ok(playback.AudioStatus) : Results.StatusCode(409));
app.MapPost("/playback/audio", async (HttpContext context, CancellationToken cancellationToken) =>
{
    try
    {
        var command = await ReadPlaybackRequest<PlaybackAudioCommand>(context.Request, cancellationToken, 512 * 1024);
        return Results.Ok(await playback.AudioCommandAsync(command, cancellationToken));
    }
    catch (PlaybackConflictException) { return Results.Json(new { error = "Audio hoort niet bij deze sessie, is al gekoppeld of vereist opnieuw koppelen met uitvoer uit." }, statusCode: 409); }
    catch (BadHttpRequestException error) { return Results.Json(new { error = "Ongeldige of te grote audio-opdracht." }, statusCode: error.StatusCode); }
    catch (System.Text.Json.JsonException) { return Results.BadRequest(new { error = "Audio-opdracht heeft ongeldige, onbekende of ontbrekende velden." }); }
    catch (ArgumentException error) { return Results.BadRequest(new { error = error.Message }); }
    catch (Exception) { return Results.Json(new { error = "Audio kon niet veilig gekoppeld worden; controleer de runtime." }, statusCode: 503); }
});
app.MapGet("/playback/output", (string? sessionId) =>
{
    var output = playback.OutputStatus;
    return sessionId is not null && output.SessionId == sessionId && playback.Status.SessionId == sessionId
        ? Results.Ok(output) : Results.StatusCode(StatusCodes.Status409Conflict);
});
app.MapPost("/playback/output", async (HttpContext context, CancellationToken cancellationToken) =>
{
    try
    {
        var command = await ReadPlaybackRequest<PlaybackOutputCommand>(context.Request, cancellationToken, 4096);
        return Results.Ok(await playback.OutputCommandAsync(command, cancellationToken));
    }
    catch (PlaybackConflictException) { return Results.Json(new { error = "Deze uitvoeropdracht hoort niet bij de huidige runtime-sessie." }, statusCode: 409); }
    catch (OutputOwnershipConflictException) { return Results.Json(new { error = "De losse DMX-testuitvoer is actief. Schakel die eerst uit." }, statusCode: 409); }
    catch (BadHttpRequestException error) { return Results.Json(new { error = "Ongeldige of te grote uitvoeropdracht." }, statusCode: error.StatusCode); }
    catch (System.Text.Json.JsonException) { return Results.BadRequest(new { error = "Uitvoeropdracht heeft ongeldige, onbekende of ontbrekende velden." }); }
    catch (ArgumentException error) { return Results.BadRequest(new { error = error.Message }); }
    catch (OperationCanceledException) { return Results.Json(new { error = "Netwerkbestemming opzoeken is geannuleerd of verlopen; uitvoer is niet ingeschakeld." }, statusCode: 504); }
    catch (Exception) { return Results.Json(new { error = "Uitvoer kon niet worden ingeschakeld. Controleer de netwerkbestemmingen en poorten." }, statusCode: 503); }
});
app.MapGet("/playback/show", (string? sessionId) =>
{
    var show = playback.LoadedShow;
    var current = playback.Status;
    return show is not null && show.SessionId == sessionId && current.SessionId == sessionId && current.Status == "running" ? Results.Ok(show) : Results.StatusCode(StatusCodes.Status409Conflict);
});
app.MapGet("/playback/preview", (string? sessionId) =>
{
    var preview = playback.Preview;
    return preview is not null && preview.SessionId == sessionId && preview.Status.Status == "running" ? Results.Ok(preview) : Results.StatusCode(StatusCodes.Status409Conflict);
});
app.MapGet("/playback/frame", (string? sessionId) =>
{
    var frame = playback.Snapshot;
    return frame is not null && frame.SessionId == sessionId ? Results.Ok(frame) : Results.StatusCode(StatusCodes.Status409Conflict);
});
app.MapPost("/playback/start", async (HttpContext context, CancellationToken cancellationToken) =>
{
    try
    {
        var request = await ReadPlaybackRequest<PlaybackStart>(context.Request, cancellationToken);
        return Results.Ok(await playback.StartAsync(request, cancellationToken));
    }
    catch (PlaybackConflictException) { return Results.Json(new { error = "Er is al een actieve runtime-sessie. Stop die eerst." }, statusCode: 409); }
    catch (BadHttpRequestException error) { return Results.Json(new { error = "Ongeldige of te grote runtime-aanvraag." }, statusCode: error.StatusCode); }
    catch (System.Text.Json.JsonException) { return Results.BadRequest(new { error = "Runtime-aanvraag heeft ongeldige of ontbrekende velden." }); }
    catch (ArgumentException) { return Results.BadRequest(new { error = "Kies een geldige show, Look en BPM tussen 30 en 240." }); }
    catch (Exception) { return Results.Json(new { error = "Runtime kon niet starten. Controleer de workerinstallatie en de DMX-inspectie." }, statusCode: 503); }
});
app.MapPost("/playback/command", async (HttpContext context, CancellationToken cancellationToken) =>
{
    try
    {
        var command = await ReadPlaybackRequest<PlaybackCommand>(context.Request, cancellationToken, 1024 * 1024);
        return Results.Ok(await playback.CommandAsync(command, cancellationToken));
    }
    catch (PlaybackConflictException) { return Results.Json(new { error = "Deze opdracht hoort niet bij een actieve runtime-sessie." }, statusCode: 409); }
    catch (BadHttpRequestException error) { return Results.Json(new { error = "Ongeldige of te grote runtime-opdracht." }, statusCode: error.StatusCode); }
    catch (System.Text.Json.JsonException) { return Results.BadRequest(new { error = "Runtime-opdracht heeft ongeldige of ontbrekende velden." }); }
    catch (ArgumentException) { return Results.BadRequest(new { error = "Ongeldige runtime-opdracht of keuze." }); }
    catch (Exception) { return Results.Json(new { error = "Runtime-sessie is gestopt door een evaluatorfout." }, statusCode: 503); }
});
app.MapPost("/output/inspect", async (HttpContext context, CancellationToken cancellationToken) =>
{
    if (context.Request.ContentLength > DmxInspection.MaximumBodyBytes) return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);
    if (!context.Request.HasJsonContentType()) return Results.StatusCode(StatusCodes.Status415UnsupportedMediaType);
    // Enforce the cap while reading too: chunked requests have no Content-Length.
    using var body = new MemoryStream();
    var buffer = new byte[16384];
    int read;
    while ((read = await context.Request.Body.ReadAsync(buffer, cancellationToken)) > 0)
    {
        if (body.Length + read > DmxInspection.MaximumBodyBytes) return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);
        body.Write(buffer, 0, read);
    }
    try
    {
        var request = System.Text.Json.JsonSerializer.Deserialize<InspectionRequest>(body.GetBuffer().AsSpan(0, (int)body.Length), DmxInspection.JsonOptions);
        if (request is null) return Results.BadRequest(new { error = "Inspectieaanvraag ontbreekt." });
        return Results.Ok(DmxInspection.Inspect(request));
    }
    catch (System.Text.Json.JsonException)
    {
        return Results.BadRequest(new { error = "Inspectieaanvraag heeft ontbrekende, onbekende of ongeldige velden." });
    }
});
app.MapGet("/devices/audio", async () =>
{
    if (!OperatingSystem.IsMacOS()) return Results.Ok(new { platform = Environment.OSVersion.Platform.ToString(), devices = Array.Empty<string>() });
    var start = new System.Diagnostics.ProcessStartInfo("system_profiler", "SPAudioDataType") { RedirectStandardOutput = true, UseShellExecute = false };
    using var process = System.Diagnostics.Process.Start(start)!;
    var output = await process.StandardOutput.ReadToEndAsync(); await process.WaitForExitAsync();
    var devices = output.Split('\n').Where(line => line.StartsWith("        ") && line.TrimEnd().EndsWith(':')).Select(line => line.Trim().TrimEnd(':')).ToArray();
    return Results.Ok(new { platform = "macOS", devices });
});
app.MapPost("/output/arm", async (ArmRequest request, CancellationToken cancellationToken) =>
{
    if (!request.Confirmed || !OutputRoute.IsValid(request.Host, request.Universe, request.Protocol))
        return Results.BadRequest(new { error = "Explicit confirmation, host and valid universe are required." });
    try { await state.ArmAsync(new OutputRoute(request.Host, request.Universe, request.Protocol), cancellationToken); }
    catch (OutputOwnershipConflictException) { return Results.Json(new { error = "Continuous show output is active. Disarm it first." }, statusCode: 409); }
    return Results.Ok(new { armed = true, request.Host, request.Universe, request.Protocol });
});
app.MapPost("/output/disarm", async () => { await state.DisarmAsync(); return Results.Ok(new { armed = false }); });
app.MapPost("/fixture-test/plan", (FixtureTestRequest request) =>
{
    if (string.IsNullOrWhiteSpace(request.FixtureName) || string.IsNullOrWhiteSpace(request.Mode) || request.Capabilities is null)
        return Results.BadRequest(new { error = "Fixture name, mode and capabilities are required." });
    var steps = request.Capabilities.Contains("rgb", StringComparer.OrdinalIgnoreCase)
        ? new[] { "Rood", "Groen", "Blauw", "Wit", "Dimmer 50%", "Bevestigen" }
        : request.Capabilities.Contains("dimmer", StringComparer.OrdinalIgnoreCase)
            ? new[] { "Dimmer 50%", "Dimmer 100%", "Bevestigen" }
            : new[] { "Identificeer fixture", "Bevestigen" };
    return Results.Ok(new { fixture = request.FixtureName, mode = request.Mode, steps, output = "plan-only" });
});
app.MapPost("/output/frame", async (FrameRequest frame, CancellationToken cancellationToken) =>
{
    if (!state.Armed) return Results.StatusCode(StatusCodes.Status423Locked);
    if (frame.Dmx is null || frame.Dmx.Length > 512) return Results.BadRequest(new { error = "DMX must contain at most 512 values." });
    using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
    deadline.CancelAfter(TimeSpan.FromSeconds(5));
    try
    {
        var sent = await state.SendAsync(frame.Dmx, async (packet, route, token) =>
        {
            using var udp = new UdpClient();
            await udp.SendAsync(packet, route.Host, route.Port, token);
        }, deadline.Token);
        return sent ? Results.Ok(new { sent = 512 }) : Results.StatusCode(StatusCodes.Status423Locked);
    }
    catch (SocketException) { return Results.Json(new { error = "UDP output failed. Check the configured destination." }, statusCode: 502); }
    catch (OperationCanceledException) { return Results.Json(new { error = "Output send cancelled or timed out." }, statusCode: 504); }
});
app.MapGet("/ai/status", (HttpContext context) =>
{
    context.Response.Headers.CacheControl = "no-store";
    return Results.Ok(new { provider = aiUnavailable ? "openai-unavailable" : ai.Id, model = aiModel, aiConfigured = !aiUnavailable && ai.Id != "offline-templates", providers = new[] { aiUnavailable ? "openai" : ai.Id, "ollama", "copilot" }.Distinct().ToArray(), runtimeVersion = RuntimeVersion, aiContractVersion = AiContractVersion });
});
app.MapGet("/ai/copilot/status", async (HttpContext context, CancellationToken cancellationToken) =>
{
    context.Response.Headers.CacheControl = "no-store";
    try { var status = await copilotProvider.StatusAsync(cancellationToken); return Results.Ok(new { provider = "copilot", available = status.Available, authenticated = status.Authenticated }); }
    catch (HttpRequestException error) { return Results.Json(new { error = error.Message }, statusCode: 502); }
    catch (OperationCanceledException) { return Results.Json(new { error = "Copilot-status ophalen is geannuleerd of verlopen." }, statusCode: 504); }
});
app.MapGet("/ai/models", async (HttpContext context, string? provider, CancellationToken cancellationToken) =>
{
    context.Response.Headers.CacheControl = "no-store";
    try
    {
        var selected = ResolveAi(provider);
        var models = selected is OllamaShowDesignProvider ollama ? await ollama.ListModelsAsync(cancellationToken) : selected is CopilotShowDesignProvider copilot ? await copilot.ListModelsAsync(cancellationToken) : Array.Empty<string>();
        return Results.Ok(new { provider = selected.Id, defaultModel = selected is OllamaShowDesignProvider local ? local.Model : selected.Id == ai.Id ? aiModel : null, models });
    }
    catch (ArgumentException error) { return Results.BadRequest(new { error = error.Message }); }
    catch (HttpRequestException error) { return Results.Json(new { error = error.Message }, statusCode: 502); }
    catch (System.Text.Json.JsonException) { return Results.Json(new { error = "Ollama gaf geen geldige modellenlijst terug." }, statusCode: 502); }
    catch (InvalidOperationException) { return Results.Json(new { error = "Ollama gaf geen geldige modellenlijst terug." }, statusCode: 502); }
    catch (OperationCanceledException) { return Results.Json(new { error = "Modellen ophalen is geannuleerd of verlopen." }, statusCode: 504); }
});
app.MapPost("/ai/propose", async (HttpContext context, CancellationToken cancellationToken) =>
{
    context.Response.Headers.CacheControl = "no-store";
    ShowDesignRequest request;
    try { request = await ReadPlaybackRequest<ShowDesignRequest>(context.Request, cancellationToken, parse: AiRequestInput.Read); }
    catch (AiRequestInputException error) { return Results.BadRequest(new { error = error.Message, code = "invalid_ai_request", stage = "request" }); }
    catch (BadHttpRequestException error) { return Results.Json(new { error = "Ontwerpaanvraag is ongeldig of te groot." }, statusCode: error.StatusCode); }
    catch (System.Text.Json.JsonException) { return Results.BadRequest(new { error = "Ontwerpaanvraag heeft ongeldige of ontbrekende velden." }); }
    if (aiUnavailable && (request.Provider is null or "openai")) return Results.Json(new { error = "OpenAI is geselecteerd maar LIGHTFLOW_OPENAI_API_KEY ontbreekt in de runtime." }, statusCode: 503);
    IShowDesignProvider selected;
    try { selected = ResolveAi(request.Provider); }
    catch (ArgumentException error) { return Results.BadRequest(new { error = error.Message }); }
    if (context.Request.GetTypedHeaders().Accept?.Any(value => value.MediaType.Equals("application/x-ndjson", StringComparison.OrdinalIgnoreCase) && value.Quality != 0) == true)
        return new AiStreamingResult(selected, request, apiKey);
    try
    {
        var proposal = await selected.ProposeAsync(request, cancellationToken);
        return Results.Ok(proposal);
    }
    catch (AiTraceException error)
    {
        var cause = error.InnerException;
        var message = cause is HttpRequestException or AiBusyException ? cause.Message : cause is OperationCanceledException ? "Ontwerpaanvraag geannuleerd of verlopen." : cause is ArgumentException ? "Ongeldige ontwerpaanvraag. Controleer aantallen en showcontext." : "Provider gaf geen geldig ontwerp terug.";
        if (!string.IsNullOrEmpty(apiKey)) message = message.Replace(apiKey, "[REDACTED_API_KEY]", StringComparison.Ordinal);
        return Results.Json(new { error = message, trace = error.Trace }, statusCode: cause is AiBusyException ? 429 : cause is ArgumentException ? 400 : cause is OperationCanceledException ? 504 : 502);
    }
    catch (BadHttpRequestException error) { return Results.Json(new { error = "Ontwerpaanvraag is ongeldig of te groot." }, statusCode: error.StatusCode); }
    catch (ArgumentException error) { return Results.BadRequest(new { error = error.Message }); }
    catch (AiBusyException error) { return Results.Json(new { error = error.Message }, statusCode: 429); }
    catch (HttpRequestException error) { return Results.Json(new { error = error.Message }, statusCode: 502); }
    catch (System.Text.Json.JsonException) { return Results.Json(new { error = "Provider gaf geen geldig ontwerp terug." }, statusCode: 502); }
    catch (InvalidOperationException) { return Results.Json(new { error = "Provider gaf geen geldig ontwerp terug." }, statusCode: 502); }
    catch (KeyNotFoundException) { return Results.Json(new { error = "Providerantwoord ontbreekt of is onvolledig." }, statusCode: 502); }
    catch (OperationCanceledException) { return Results.Json(new { error = "Ontwerpaanvraag geannuleerd of verlopen. Probeer opnieuw." }, statusCode: 504); }
});
app.Run();

static async Task<T> ReadPlaybackRequest<T>(HttpRequest request, CancellationToken cancellationToken, int maximum = 2 * 1024 * 1024, Func<ReadOnlyMemory<byte>, T>? parse = null)
{
    if (request.ContentLength > maximum) throw new BadHttpRequestException("Body limit", 413);
    if (!request.HasJsonContentType()) throw new BadHttpRequestException("JSON required", 415);
    using var body = new MemoryStream(); var buffer = new byte[16384]; int read;
    while ((read = await request.Body.ReadAsync(buffer, cancellationToken)) > 0)
    {
        if (body.Length + read > maximum) throw new BadHttpRequestException("Body limit", 413);
        body.Write(buffer, 0, read);
    }
    if (parse is not null) return parse(body.GetBuffer().AsMemory(0, (int)body.Length));
    return System.Text.Json.JsonSerializer.Deserialize<T>(body.GetBuffer().AsSpan(0, (int)body.Length), DmxInspection.JsonOptions)
        ?? throw new System.Text.Json.JsonException();
}

record ArmRequest(bool Confirmed, string Host, int Universe, string Protocol);
record FrameRequest(int[] Dmx);
record FixtureTestRequest(string FixtureName, string Mode, string[] Capabilities);
