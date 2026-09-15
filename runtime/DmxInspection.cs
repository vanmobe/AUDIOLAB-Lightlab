using System.Text.Json;
using System.Text.Json.Serialization;

namespace Lightflow.Runtime;

public sealed record InspectionRequest(int Version, string RequestId, InspectionPatch Patch, InspectionFrame Frame);
public sealed record InspectionPatch(InspectionFixture[] Fixtures, InspectionRoute[] Routes);
public sealed record InspectionFixture(string Id, string ProfileId, string ModeId, InspectionAddress? Patch);
public sealed record InspectionAddress(int Universe, int Address);
public sealed record InspectionRoute(string Id, int Universe, string Protocol, string Host, bool Enabled);
public sealed record InspectionFrame(double AtBeats, string Mode, InspectionFrameFixture[] Fixtures);
public sealed record InspectionFrameFixture(string FixtureId, double Intensity, string Color, double Haze, InspectionSegment[]? Segments = null);
public sealed record InspectionSegment(double Intensity, string Color);
public sealed record InspectionIssue(string Severity, string Code, string Message, string? FixtureId = null);
public sealed record InspectionFixtureResult(string FixtureId, int Address, int[] Channels, string[] ChannelLabels);
public sealed record InspectionUniverse(int Universe, string? Protocol, bool RouteEnabled, int[] Channels, InspectionFixtureResult[] Fixtures);
public sealed record InspectionResult(int Version, string RequestId, string CatalogVersion, bool DryRun, bool OutputSent,
    InspectionIssue[] Issues, InspectionUniverse[] Universes, bool IssuesTruncated);

/// <summary>Stateless compiler. It has no output session, sender, device discovery or retained patch.</summary>
public static class DmxInspection
{
    public const int MaximumBodyBytes = 1024 * 1024;
    public static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
        RespectRequiredConstructorParameters = true,
        RespectNullableAnnotations = true,
        AllowDuplicateProperties = false,
        NumberHandling = JsonNumberHandling.Strict,
        PropertyNameCaseInsensitive = false,
        MaxDepth = 16
    };
    static bool Text(string? value, int maximum = 1024) => !string.IsNullOrWhiteSpace(value) && value.Length <= maximum;
    static bool Level(double value) => double.IsFinite(value) && value is >= 0 and <= 1;
    static bool Color(string? value) => value is { Length: 7 } && value[0] == '#' && value.AsSpan(1).ContainsAnyExcept("0123456789abcdefABCDEF") == false;

    public static InspectionResult Inspect(InspectionRequest request)
    {
        var issues = new List<InspectionIssue>(); var failed = false; var truncated = false;
        void Issue(string severity, string code, string message, string? id = null)
        {
            failed |= severity == "error";
            if (issues.Count < 256) issues.Add(new(severity, code, message, id));
            else
            {
                truncated = true;
                // Late validation failures must stay visible even after many unverified-fixture warnings.
                var warning = issues.FindLastIndex(issue => issue.Severity == "warning");
                if (severity == "error" && warning >= 0) { issues.RemoveAt(warning); issues.Add(new(severity, code, message, id)); }
            }
        }
        void Error(string code, string message, string? id = null) => Issue("error", code, message, id);
        InspectionResult Result(InspectionUniverse[]? universes = null) => new(1, Text(request.RequestId, 120) ? request.RequestId : "", RuntimeDmxCatalog.Version, true, false, issues.ToArray(), failed ? [] : universes ?? [], truncated);
        if (request.Version != 1 || !Text(request.RequestId, 120) || request.Patch?.Fixtures is null || request.Patch.Routes is null || request.Frame?.Fixtures is null)
        {
            Error("invalid-request", "Ongeldige inspectieaanvraag of ontbrekende collecties."); return Result();
        }
        var fixtures = request.Patch.Fixtures; var frames = request.Frame.Fixtures; var routes = request.Patch.Routes;
        if (fixtures.Length > 1024 || frames.Length > 1024 || routes.Length > 256) { Error("capacity", "Maximum 1024 lampen en 256 routes per inspectie."); return Result(); }
        if (!double.IsFinite(request.Frame.AtBeats) || request.Frame.AtBeats is < 0 or > 1e9 || request.Frame.Mode is not ("automation" or "static" or "safety" or "blackout"))
            Error("invalid-frame", "Ongeldig tijdstip of weergavemodus.");
        var routeIds = new HashSet<string>(); var enabled = new Dictionary<int, InspectionRoute>();
        foreach (var route in routes)
        {
            if (route is null || !Text(route.Id) || !routeIds.Add(route.Id)
                || !OutputRoute.IsValid("localhost", route.Universe, route.Protocol) || route.Host is null || route.Host.Length > 253
                || (route.Enabled && !OutputRoute.IsValid(route.Host, route.Universe, route.Protocol)))
            {
                Error("invalid-route", "Route bevat een ongeldige of dubbele identificatie, bestemming, universe of protocol."); continue;
            }
            if (route.Enabled && !enabled.TryAdd(route.Universe, route)) Error("duplicate-route", "Een universe heeft meer dan één ingeschakelde route.");
        }
        var byId = new Dictionary<string, InspectionFrameFixture>();
        foreach (var frame in frames)
        {
            if (frame is null || !Text(frame.FixtureId) || !byId.TryAdd(frame.FixtureId, frame)) { Error("invalid-frame-id", "Frame bevat een ontbrekende of dubbele lampidentificatie."); continue; }
            if (!Level(frame.Intensity) || !Level(frame.Haze) || !Color(frame.Color) || frame.Segments is { Length: not (1 or 4) }
                || frame.Segments?.Any(s => s is null || !Level(s.Intensity) || !Color(s.Color)) == true)
                Error("invalid-level", "Frame bevat een ongeldige kleur, intensiteit of headindeling.", frame.FixtureId);
        }
        var seen = new HashSet<string>();
        var patched = new Dictionary<int, List<(InspectionFixture Fixture, RuntimeDmxCatalog.Personality Mode)>>();
        foreach (var fixture in fixtures)
        {
            if (fixture is null || !Text(fixture.Id) || !seen.Add(fixture.Id) || !Text(fixture.ProfileId) || !Text(fixture.ModeId)) { Error("invalid-fixture", "Patch bevat een ontbrekende of dubbele lampidentificatie of modus."); continue; }
            if (!byId.TryGetValue(fixture.Id, out var frame)) Error("missing-frame-fixture", "De lamp ontbreekt in deze framemomentopname.", fixture.Id);
            var mode = RuntimeDmxCatalog.Find(fixture.ProfileId, fixture.ModeId);
            if (mode is null)
            {
                Error("unsupported-mode", fixture.ProfileId == "stairville-hz-200" && fixture.ModeId == "1ch"
                    ? "De Hz-200 gebruikt 2 DMX-kanalen. Kies eerst de 2ch-modus en controleer de patch."
                    : "Deze lampmodus heeft geen vertrouwde kanaaltoewijzing voor inspectie.", fixture.Id); continue;
            }
            if (frame?.Segments is not null && (mode.Kind == "haze" || frame.Segments.Length != mode.Heads)) Error("head-count", "Het aantal heads komt niet overeen met de DMX-modus; hazers hebben geen lichtheads.", fixture.Id);
            if (fixture.Patch is null) { Issue("warning", "unpatched", "Lamp heeft geen DMX-adres en wordt niet gecodeerd.", fixture.Id); continue; }
            var patch = fixture.Patch;
            if (patch.Universe is < 1 or > 63999 || patch.Address is < 1 or > 512 || patch.Address + mode.Labels.Length - 1 > 512)
            {
                Error("patch-range", "DMX-adres of universe valt buiten het toegestane bereik.", fixture.Id); continue;
            }
            if (!patched.TryGetValue(patch.Universe, out var list)) patched[patch.Universe] = list = [];
            list.Add((fixture, mode));
            Issue("warning", "unverified-personality", "Kanaaltabel is gebaseerd op de handleiding, niet fysiek geverifieerd.", fixture.Id);
            if (mode.Kind == "haze") Issue("warning", "haze-fan-off", "Hazerfan blijft uit in deze dry-run; operationele fanregeling is nog niet beschikbaar.", fixture.Id);
        }
        if (byId.Keys.Any(id => !seen.Contains(id))) Error("unknown-frame-fixture", "Frame verwijst naar een lamp buiten deze patch.");
        if (patched.Count > 256) Error("universe-capacity", "Maximum 256 gepatchte universes per inspectie.");
        foreach (var (_, list) in patched)
        {
            var occupied = new bool[512];
            foreach (var (fixture, mode) in list)
            {
                var start = fixture.Patch!.Address - 1;
                if (occupied.AsSpan(start, mode.Labels.Length).Contains(true)) Error("patch-overlap", "DMX-kanalen overlappen met een andere lamp.", fixture.Id);
                occupied.AsSpan(start, mode.Labels.Length).Fill(true);
            }
        }
        if (failed) return Result();
        var output = new List<InspectionUniverse>();
        foreach (var (universe, list) in patched.OrderBy(p => p.Key))
        {
            var route = enabled.GetValueOrDefault(universe);
            var disabledRoutes = routes.Where(r => !r.Enabled && r.Universe == universe).ToArray();
            var protocol = route?.Protocol ?? (disabledRoutes.Length == 1 ? disabledRoutes[0].Protocol : null);
            if (route is null) Issue("warning", "route-disabled", "Universe heeft geen ingeschakelde route; alleen kanaalinspectie is beschikbaar.");
            var channels = new int[512]; var rows = new List<InspectionFixtureResult>();
            foreach (var (fixture, mode) in list)
            {
                var values = RuntimeDmxCatalog.Encode(mode, byId[fixture.Id], request.Frame.Mode == "blackout");
                values.CopyTo(channels, fixture.Patch!.Address - 1);
                rows.Add(new(fixture.Id, fixture.Patch.Address, values, mode.Labels.ToArray()));
            }
            output.Add(new(universe, protocol, route is not null, channels, rows.ToArray()));
        }
        return Result(output.ToArray());
    }
}
