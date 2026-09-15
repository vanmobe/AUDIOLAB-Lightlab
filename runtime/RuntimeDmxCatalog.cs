namespace Lightflow.Runtime;

/// <summary>Manual-backed dry-run personalities; none is physically verified for live output.</summary>
public static class RuntimeDmxCatalog {
    // Source editions/pages and unsupported legacy personalities: docs/FIXTURE_CHANNEL_SOURCES.md.
    public const string Version = "manuals-2026-09-14-v1";
    public sealed record Personality(string Kind, string[] Labels, int Heads = 1);
    static readonly Dictionary<string, Personality> Modes = new() {
        ["adj-mega-tripar-profile-plus/4ch"] = new("rgbuv", ["Red", "Green", "Blue", "UV (off)"]),
        ["adj-mega-tripar-profile-plus/6ch"] = new("rgbuv-master", ["Red", "Green", "Blue", "UV (off)", "Shutter (steady)", "Master"]),
        ["stairville-stage-tri/3ch"] = new("rgb", ["Red", "Green", "Blue"]),
        ["stairville-stage-tri/14ch"] = new("bar", ["Head 1 red", "Head 1 green", "Head 1 blue", "Head 2 red", "Head 2 green", "Head 2 blue", "Head 3 red", "Head 3 green", "Head 3 blue", "Head 4 red", "Head 4 green", "Head 4 blue", "Strobe (off)", "Master"], 4),
        ["varytec-theater-spot-100/2ch"] = new("white", ["Dimmer", "Strobe (off)"]),
        ["stairville-hz-200/2ch"] = new("haze", ["Fog", "Fan (off)"]),
    };
    public static Personality? Find(string profile, string mode) => Modes.GetValueOrDefault(profile + "/" + mode);
    static int Level(double value) => (int)Math.Round(value * 255, MidpointRounding.AwayFromZero);
    static int[] Rgb(string color, double intensity) => Enumerable.Range(0, 3)
        .Select(i => (int)Math.Round(Convert.ToInt32(color.Substring(1 + i * 2, 2), 16) * intensity, MidpointRounding.AwayFromZero)).ToArray();
    public static int[] Encode(Personality mode, InspectionFrameFixture fixture, bool blackout) {
        var channels = new int[mode.Labels.Length];
        if (blackout) return channels;
        // The evaluator also emits one segment for ordinary fixtures; explicit head output wins over its aggregate.
        var single = mode.Heads == 1 && mode.Kind != "haze" ? fixture.Segments?[0] : null;
        var intensity = single?.Intensity ?? fixture.Intensity;
        var color = single?.Color ?? fixture.Color;
        switch (mode.Kind) {
            case "rgb": case "rgbuv": Rgb(color, intensity).CopyTo(channels, 0); break;
            case "rgbuv-master":
                Rgb(color, 1).CopyTo(channels, 0);
                // ADJ channel5:0..31 closes shutter;32..63 is steady illumination, not strobe.
                channels[4] = 32; channels[5] = Level(intensity); break;
            case "bar":
                for (var i = 0; i < 4; i++) {
                    var head = fixture.Segments?[i];
                    Rgb(head?.Color ?? fixture.Color, head?.Intensity ?? fixture.Intensity).CopyTo(channels, i * 3);
                }
                // Per-head RGB includes its intensity; applying the aggregate master would double-dim it.
                channels[13] = 255; break;
            case "white": channels[0] = Level(intensity); break;
            case "haze": channels[0] = Level(fixture.Haze); break;
        }
        return channels;
    }
}
