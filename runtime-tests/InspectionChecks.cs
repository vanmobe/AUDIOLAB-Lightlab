using System.Text.Json;
using System.Text.Json.Nodes;
using Lightflow.Runtime;

static class InspectionChecks {
    public static void Run() {
        static void Check(bool value, string message) { if (!value) throw new Exception(message); }
        static InspectionFixture Fixture(string id, string profile, string mode, int address, int universe = 1) => new(id, profile, mode, new(universe, address));
        static InspectionFrameFixture Frame(string id, double intensity = .5, string color = "#ff8040", double haze = 0, InspectionSegment[]? segments = null) => new(id, intensity, color, haze, segments);
        var request = new InspectionRequest(1, "test-request", new([
            Fixture("adj4", "adj-mega-tripar-profile-plus", "4ch", 1),
            Fixture("adj6", "adj-mega-tripar-profile-plus", "6ch", 5),
            Fixture("tri3", "stairville-stage-tri", "3ch", 11),
            Fixture("tri14", "stairville-stage-tri", "14ch", 14),
            Fixture("front", "varytec-theater-spot-100", "2ch", 511, 2),
            Fixture("haze", "stairville-hz-200", "2ch", 1, 2)
        ], [new("route", 1, "artnet", "botex.local", true)]), new(12, "automation", [
            Frame("adj4"), Frame("adj6"), Frame("tri3"),
            Frame("tri14", .4, segments: [new(1, "#ff0000"), new(.5, "#00ff00"), new(.25, "#0000ff"), new(0, "#ffffff")]),
            Frame("front", .5, "#ff0000"), Frame("haze", .9, haze: .2)
        ]));
        var result = DmxInspection.Inspect(request);
        Check(result.DryRun && !result.OutputSent && result.RequestId == request.RequestId && result.Universes.Length == 2, "Stateless inspection returns two universes without sending");
        Check(result.Universes.All(u => u.Channels.Length == 512 && u.Channels.All(v => v is >= 0 and <= 255)), "Every output universe contains exactly 512 bounded integers");
        Check(result.Universes[0].RouteEnabled && result.Universes[0].Protocol == "artnet" && !result.Universes[1].RouteEnabled && result.Universes[1].Protocol is null, "Route status is configuration only; missing route permits dry-run");
        var rows = result.Universes.SelectMany(u => u.Fixtures).ToDictionary(f => f.FixtureId);
        Check(rows["adj4"].Channels.SequenceEqual(new[] { 128, 64, 32, 0 }), "ADJ4 RGB scales intensity and UV stays off");
        Check(rows["adj6"].Channels.SequenceEqual(new[] { 255, 128, 64, 0, 32, 128 }), "ADJ6 uses steady shutter32 and master without double dimming");
        Check(rows["tri3"].Channels.SequenceEqual(new[] { 128, 64, 32 }), "TRI3 scales shared RGB");
        Check(rows["tri14"].Channels.SequenceEqual(new[] { 255, 0, 0, 0, 128, 0, 0, 0, 64, 0, 0, 0, 0, 255 }), "TRI14 preserves independent heads, strobe off and full master");
        Check(rows["front"].Channels.SequenceEqual(new[] { 128, 0 }) && result.Universes[1].Channels[510] == 128 && result.Universes[1].Channels[511] == 0, "Warm-white ignores requested red; address512 boundary fits");
        Check(rows["haze"].Channels.SequenceEqual(new[] { 51, 0 }), "Haze follows evaluated haze, not lamp intensity; fan stays off");
        Check(rows.Values.All(r => r.Channels.Length == r.ChannelLabels.Length), "Every inspected channel has its trusted label");
        // Recipes produce a one-head segment even for ordinary PARs/fronts/grouped bars.
        // Deliberately conflicting aggregate values prove that the explicit head is not silently ignored.
        var singleHeads = DmxInspection.Inspect(request with { Frame = request.Frame with {
            Fixtures = request.Frame.Fixtures.Select(f => f.FixtureId is "adj4" or "adj6" or "tri3" or "front"
                ? f with { Intensity = .9, Color = "#ff0000", Segments = [new(.25, "#00ff00")] } : f).ToArray()
        } });
        var singleRows = singleHeads.Universes.SelectMany(u => u.Fixtures).ToDictionary(f => f.FixtureId);
        Check(singleRows["adj4"].Channels.SequenceEqual(new[] { 0, 64, 0, 0 }) && singleRows["tri3"].Channels.SequenceEqual(new[] { 0, 64, 0 }), "Single-head recipe uses explicit segment intensity and color");
        Check(singleRows["adj6"].Channels.SequenceEqual(new[] { 0, 255, 0, 0, 32, 64 }) && singleRows["front"].Channels.SequenceEqual(new[] { 64, 0 }), "Master-dimmer and fixed-white recipes use single segment intensity");
        Check(result.Issues.Count(i => i.Code == "unverified-personality") == 6 && result.Issues.Any(i => i.Code == "haze-fan-off"), "Manual-based mappings never claim physical verification");
        var blackout = DmxInspection.Inspect(request with { Frame = request.Frame with { Mode = "blackout" } });
        Check(blackout.Universes.All(u => u.Channels.All(v => v == 0)), "Blackout overrides inconsistent nonzero browser levels and shutter constants");
        Check(DmxInspection.Inspect(request).Universes[0].Channels.SequenceEqual(result.Universes[0].Channels), "Blackout cannot mutate later inspection or its input");

        void Reject(InspectionRequest invalid, string code) {
            var bad = DmxInspection.Inspect(invalid);
            Check(bad.Universes.Length == 0 && bad.Issues.Any(i => i.Severity == "error" && i.Code == code), "Invalid request fails atomically: " + code);
        }
        InspectionRequest WithFixture(InspectionFixture fixture) => request with { Patch = request.Patch with { Fixtures = [fixture, .. request.Patch.Fixtures.Skip(1)] } };
        Reject(WithFixture(request.Patch.Fixtures[0] with { Patch = new(1, 5) }), "patch-overlap");
        Reject(WithFixture(request.Patch.Fixtures[0] with { Patch = new(1, int.MaxValue) }), "patch-range");
        Reject(WithFixture(request.Patch.Fixtures[0] with { Patch = new(0, 1) }), "patch-range");
        Reject(WithFixture(request.Patch.Fixtures[0] with { ModeId = "unknown" }), "unsupported-mode");
        Reject(WithFixture(request.Patch.Fixtures[0] with { ProfileId = "stairville-hz-200", ModeId = "1ch" }), "unsupported-mode");
        Reject(request with { Patch = request.Patch with { Fixtures = [request.Patch.Fixtures[0], request.Patch.Fixtures[0]] } }, "invalid-fixture");
        Reject(request with { Frame = request.Frame with { Fixtures = request.Frame.Fixtures.Skip(1).ToArray() } }, "missing-frame-fixture");
        Reject(request with { Frame = request.Frame with { Fixtures = [.. request.Frame.Fixtures, Frame("unknown")] } }, "unknown-frame-fixture");
        Reject(request with { Frame = request.Frame with { Fixtures = [.. request.Frame.Fixtures, Frame("adj4")] } }, "invalid-frame-id");
        foreach (var level in new[] { double.NaN, double.PositiveInfinity, -.1, 1.1 })
            Reject(request with { Frame = request.Frame with { Fixtures = [Frame("adj4", level), .. request.Frame.Fixtures.Skip(1)] } }, "invalid-level");
        Reject(request with { Frame = request.Frame with { Fixtures = [Frame("adj4", color: "red"), .. request.Frame.Fixtures.Skip(1)] } }, "invalid-level");
        Reject(request with { Frame = request.Frame with { Fixtures = [Frame("adj4", segments: [new(1, "#ffffff"), new(1, "#ffffff"), new(1, "#ffffff"), new(1, "#ffffff")]), .. request.Frame.Fixtures.Skip(1)] } }, "head-count");
        Reject(request with { Frame = request.Frame with { Fixtures = request.Frame.Fixtures.Select(f => f.FixtureId == "haze" ? f with { Segments = [new(1, "#ffffff")] } : f).ToArray() } }, "head-count");
        Reject(request with { Frame = request.Frame with { AtBeats = -1 } }, "invalid-frame");
        Reject(request with { Frame = request.Frame with { AtBeats = 1e9 + 1 } }, "invalid-frame");
        Reject(request with { Frame = request.Frame with { Mode = "unknown" } }, "invalid-frame");
        Reject(request with { Version = 2 }, "invalid-request");
        Reject(request with { RequestId = new string('x', 121) }, "invalid-request");
        Reject(request with { Patch = request.Patch with { Routes = [new("a", 1, "artnet", "host", true), new("b", 1, "sacn", "host", true)] } }, "duplicate-route");
        Reject(request with { Patch = request.Patch with { Routes = [new("a", 32769, "artnet", "host", true)] } }, "invalid-route");
        Reject(request with { Patch = request.Patch with { Fixtures = Enumerable.Repeat(request.Patch.Fixtures[0], 1025).ToArray() } }, "capacity");
        Reject(request with { Patch = request.Patch with { Routes = Enumerable.Repeat(request.Patch.Routes[0], 257).ToArray() } }, "capacity");
        var disabled = DmxInspection.Inspect(request with { Patch = request.Patch with { Routes = [request.Patch.Routes[0] with { Enabled = false }] } });
        Check(disabled.Universes.Length == 2 && disabled.Universes.All(u => !u.RouteEnabled), "Disabled routes remain inspectable without activating them");
        var blankRoute = DmxInspection.Inspect(request with { Patch = request.Patch with { Routes = [request.Patch.Routes[0] with { Enabled = false, Host = "" }] } });
        Check(blankRoute.Universes.Length == 2 && blankRoute.Universes[0].Protocol == "artnet" && !blankRoute.Universes[0].RouteEnabled, "New disabled route with blank host is valid inspectable configuration");
        var unpatched = DmxInspection.Inspect(WithFixture(request.Patch.Fixtures[0] with { Patch = null }));
        Check(unpatched.Universes[0].Channels.Take(4).All(v => v == 0) && unpatched.Issues.Any(i => i.Code == "unpatched"), "Unpatched fixture skips encoding with explicit issue");
        var many = Enumerable.Range(0, 257).Select(i => Fixture("id" + i, "varytec-theater-spot-100", "2ch", 1, i + 1)).ToArray();
        Reject(request with { Patch = new(many, []), Frame = new(0, "static", many.Select(f => Frame(f.Id)).ToArray()) }, "universe-capacity");
        // Warnings must not hide atomic failure once the public issue list is full.
        var crowded = many.Select(f => f with { Patch = new(1, 1) }).ToArray();
        var capped = DmxInspection.Inspect(request with { Patch = new(crowded, []), Frame = new(0, "static", crowded.Select(f => Frame(f.Id)).ToArray()) });
        Check(capped.IssuesTruncated && capped.Issues.Length == 256 && capped.Universes.Length == 0, "Capped issues never hide an internal error or return partial frames");

        var json = JsonSerializer.Serialize(request, DmxInspection.JsonOptions);
        Check(JsonSerializer.Deserialize<InspectionRequest>(json, DmxInspection.JsonOptions)?.RequestId == request.RequestId, "Strict request roundtrip");
        void RejectJson(string malformed) {
            try { JsonSerializer.Deserialize<InspectionRequest>(malformed, DmxInspection.JsonOptions); throw new Exception("Malformed contract accepted"); } catch (JsonException) { }
        }
        var spoof = JsonNode.Parse(json)!; spoof["patch"]!["fixtures"]![0]!["verifiedForLiveOutput"] = true;
        RejectJson(spoof.ToJsonString());
        var missing = JsonNode.Parse(json)!; missing["frame"]!.AsObject().Remove("mode"); RejectJson(missing.ToJsonString());
        RejectJson(json.Replace("\"version\":1", "\"version\":1,\"version\":1"));
        RejectJson(json.Replace("\"address\":1", "\"address\":1.5"));
        RejectJson(json.Replace("\"universe\":1", "\"universe\":\"1\""));
        RejectJson(json.Replace("\"intensity\":0.5", "\"intensity\":\"0.5\""));
        RejectJson(json.Replace("\"routes\":[", "\"routes\":null,\"extra\":["));
        Console.WriteLine("Inspection checks passed: all manual channel maps, independent heads, fixed white, haze, shutter/strobe, blackout, atomic errors, bounds, strict metadata and missing/disabled routes; no network.");
    }
}
