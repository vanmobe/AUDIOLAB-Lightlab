using GitHub.Copilot;
using GitHub.Copilot.Rpc;
using System.Text;
using System.Threading.Channels;

namespace Lightflow.Runtime;

/// <summary>Local single-user SDK bridge; CLI OAuth remains in its own credential store.</summary>
public sealed class CopilotSdkTransport : ICopilotTransport
{
#pragma warning disable GHCP001 // Pinned SDK 1.0.13: deny-only permission and disabled MCP capability.
    public static SessionConfig SafeSession(string model, string system, string directory) => new()
    {
        Model = model,
        ClientName = "Lightlab",
        WorkingDirectory = directory,
        ConfigDirectory = directory,
        SystemMessage = new() { Mode = SystemMessageMode.Replace, Content = system },
        AvailableTools = [],
        Tools = [],
        McpServers = new Dictionary<string, McpServerConfig>(),
        OnPermissionRequest = (_, _) => Task.FromResult(PermissionDecision.Reject("Lightlab heeft geen tooltoegang.")),
        EnableConfigDiscovery = false,
        EnableOnDemandInstructionDiscovery = false,
        EnableFileHooks = false,
        EnableHostGitOperations = false,
        EnableSessionStore = false,
        EnableSkills = false,
        EnableSessionTelemetry = false,
        EnableExperimentalMode = false,
        EnableMcpApps = false,
        EnableFileChangeTracking = false,
        SkipCustomInstructions = true,
        CustomAgentsLocalOnly = true,
        CoauthorEnabled = false,
        ManageScheduleEnabled = false,
        SkipEmbeddingRetrieval = true,
        EmbeddingCacheStorage = EmbeddingCacheStorageMode.InMemory,
        McpOAuthTokenStorage = McpOAuthTokenStorageMode.InMemory,
        Memory = new() { Enabled = false },
        InfiniteSessions = new() { Enabled = false },
        SkillDirectories = [],
        PluginDirectories = [],
        InstructionDirectories = [],
        IncludedBuiltinSkills = [],
        CustomAgents = [],
        AdditionalDirectories = [],
        Streaming = true,
        IncludeSubAgentStreamingEvents = false
    };
#pragma warning restore GHCP001

    public static IReadOnlyDictionary<string, string> SafeEnvironment()
    {
        var safe = new Dictionary<string, string>();
        foreach (var name in new[] { "PATH", "HOME", "USER", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "SystemRoot", "WINDIR", "TEMP", "TMP", "TMPDIR" })
            if (Environment.GetEnvironmentVariable(name) is string value) safe[name] = value;
        return safe;
    }
    static CopilotClient CreateClient(string directory) => new(new CopilotClientOptions
    {
        // Empty mode disables keychain OAuth. This local single-user integration instead explicitly
        // disables every ambient session feature while retaining the user's official CLI login.
        Mode = CopilotClientMode.CopilotCli,
        Connection = RuntimeConnection.ForStdio("copilot", ["--disable-builtin-mcps", "--no-custom-instructions"]),
        Environment = SafeEnvironment(),
        WorkingDirectory = directory,
        UseLoggedInUser = true,
        LogLevel = CopilotLogLevel.None,
        EnableRemoteSessions = false,
        BuiltinPluginDirectories = []
    });
    public Task<CopilotStatus> StatusAsync(CancellationToken token) => WithClient(async (client, _, ct) =>
    {
        var status = await client.GetAuthStatusAsync(ct);
        return new CopilotStatus(true, status.IsAuthenticated);
    }, token);
    public Task<string[]> ListModelsAsync(CancellationToken token) => WithClient(async (client, _, ct) =>
    {
        if (!(await client.GetAuthStatusAsync(ct)).IsAuthenticated) throw new CopilotLoginException();
        var models = await client.ListModelsAsync(ct);
        return SelectModels(models);
    }, token);
    public static string[] SelectModels(IEnumerable<ModelInfo> models) => models
        .Where(model => model.Policy is null || string.IsNullOrEmpty(model.Policy.State) || model.Policy.State == "enabled")
        .Select(model => model.Id)
        .Where(id => !string.IsNullOrWhiteSpace(id) && id != "auto" && id.Length <= 200 && !id.Any(char.IsControl))
        .Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal).Take(256).ToArray();

    public Task<string> GenerateAsync(string model, string system, string prompt, Func<string, CancellationToken, Task> delta, CancellationToken token) => WithClient(async (client, directory, _) =>
    {
        using var stop = CancellationTokenSource.CreateLinkedTokenSource(token);
        // SDK callbacks are synchronous. A bounded queue rejects overload instead of allocating an
        // unbounded task chain; the async reader awaits browser backpressure.
        var chunks = Channel.CreateBounded<string>(new BoundedChannelOptions(64) { SingleReader = true, FullMode = BoundedChannelFullMode.Wait });
        var failure = new TaskCompletionSource<Exception>(TaskCreationOptions.RunContinuationsAsynchronously);
        long received = 0;
        void Fail(Exception error) { failure.TrySetResult(error); stop.Cancel(); }
        var config = SafeSession(model, system, directory);
        config.OnEvent = evt =>
        {
            if (evt is AssistantMessageDeltaEvent part)
            {
                var text = part.Data.DeltaContent;
                if (Interlocked.Add(ref received, Encoding.UTF8.GetByteCount(text)) > AiTraceCapture.BodyLimit)
                    Fail(new AiBodyLimitException("Copilot gaf een te groot antwoord. Vraag minder items tegelijk."));
                else if (!chunks.Writer.TryWrite(text)) Fail(new AiStreamException("Copilot-uitvoer kon niet veilig worden bijgehouden. Probeer opnieuw."));
            }
            else if (evt is SessionErrorEvent) Fail(new HttpRequestException("GitHub Copilot meldde een fout. Controleer je modeltoegang, quota en verbinding."));
            else if (evt is ToolExecutionStartEvent) Fail(new HttpRequestException("Copilot vroeg onverwacht toolgebruik. De aanvraag is gestopt."));
            else if (evt is SessionModelChangeEvent changed && !string.Equals(changed.Data.NewModel, model, StringComparison.Ordinal))
                Fail(new AiStreamException("Copilot wilde een ander model gebruiken dan je selectie. De aanvraag is gestopt; kies expliciet een beschikbaar model."));
        };
        await using var session = await client.CreateSessionAsync(config, stop.Token);
        async Task Pump()
        {
            try { await foreach (var text in chunks.Reader.ReadAllAsync(stop.Token)) await delta(text, stop.Token); }
            catch { stop.Cancel(); throw; }
        }
        var pump = Pump();
        try
        {
            var answer = await session.SendAndWaitAsync(new MessageOptions { Prompt = prompt }, TimeSpan.FromHours(1), stop.Token);
            chunks.Writer.TryComplete();
            await pump;
            if (failure.Task.IsCompletedSuccessfully) throw failure.Task.Result;
            var content = answer?.Data.Content;
            if (string.IsNullOrWhiteSpace(content)) throw new HttpRequestException("Copilot gaf geen volledig ontwerp terug.");
            if (Encoding.UTF8.GetByteCount(content) > AiTraceCapture.BodyLimit) throw new AiBodyLimitException("Copilot gaf een te groot ontwerp. Vraag minder items tegelijk.");
            return content;
        }
        catch
        {
            if (failure.Task.IsCompletedSuccessfully) throw failure.Task.Result;
            throw;
        }
        finally
        {
            stop.Cancel(); chunks.Writer.TryComplete();
            try { await pump; } catch { /* Observed; primary failure is reported above. */ }
            using var cleanup = new CancellationTokenSource(TimeSpan.FromSeconds(5));
            try { await session.AbortAsync(cleanup.Token); } catch { }
            // Dispose alone preserves SDK sessions; explicitly delete this request's session.
            try { await client.DeleteSessionAsync(session.SessionId, cleanup.Token); } catch { }
        }
    }, token, generation: true);

    static async Task<T> WithClient<T>(Func<CopilotClient, string, CancellationToken, Task<T>> action, CancellationToken token, bool generation = false)
    {
        var directory = Directory.CreateTempSubdirectory("lightlab-copilot-");
        using var startup = CancellationTokenSource.CreateLinkedTokenSource(token);
        startup.CancelAfter(TimeSpan.FromSeconds(20));
        try
        {
            await using var client = CreateClient(directory.FullName);
            await client.StartAsync(startup.Token);
            return await action(client, directory.FullName, generation ? token : startup.Token);
        }
        catch (CopilotLoginException) { throw new HttpRequestException("Meld je eerst aan via 'copilot login' in een terminal en vernieuw daarna de modellenlijst. Een actief GitHub Copilot-abonnement is vereist."); }
        catch (OperationCanceledException) when (token.IsCancellationRequested) { throw; }
        catch (AiBodyLimitException) { throw; }
        catch (AiStreamException) { throw; }
        catch (Exception) { throw new HttpRequestException("GitHub Copilot is niet beschikbaar. Controleer of de Copilot CLI is geïnstalleerd, je bent aangemeld en je account dit model mag gebruiken; controleer ook je quota en verbinding."); }
        finally
        {
            // Only a freshly generated, owned scratch directory; never a user repo or CLI home.
            try { directory.Delete(true); } catch (IOException) { } catch (UnauthorizedAccessException) { }
        }
    }
    sealed class CopilotLoginException : Exception;
}
