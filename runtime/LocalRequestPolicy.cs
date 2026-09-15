namespace Lightflow.Runtime;

public static class LocalRequestPolicy {
    public static readonly string[] BrowserOrigins = ["http://127.0.0.1:5173", "http://localhost:5173"];
    // CORS controls response visibility, not whether a simple cross-site POST executes.
    // A strict Host check also prevents a rebinding domain from posing as this loopback service.
    public static bool Allows(string host, string? origin) =>
        (host.Equals("localhost", StringComparison.OrdinalIgnoreCase) || host == "127.0.0.1")
        && (origin is null || BrowserOrigins.Contains(origin, StringComparer.Ordinal));
}
