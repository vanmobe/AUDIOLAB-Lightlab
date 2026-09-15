namespace Lightflow.Runtime;

public sealed record OutputRoute(string Host, int Universe, string Protocol)
{
    public int Port => Protocol == "artnet" ? 6454 : 5568;
    public static bool IsValid(string? host, int universe, string? protocol) =>
        !string.IsNullOrWhiteSpace(host) && host.Length <= 253 && Uri.CheckHostName(host) != UriHostNameType.Unknown
        && universe >= 1 && (protocol == "artnet" ? universe <= 32768 : protocol == "sacn" && universe <= 63999);
}

/// <summary>Serializes route changes with frame sends: disarm completion means no pending send remains.</summary>
public sealed class OutputSession(OutputOwnership? ownership = null)
{
    readonly OutputOwnership ownership = ownership ?? new();
    readonly SemaphoreSlim gate = new(1, 1);
    readonly Guid sourceCid = Guid.NewGuid();
    readonly byte[] sequences = new byte[64000];
    OutputRoute? route;
    public bool Armed => Volatile.Read(ref route) is not null;
    public async Task ArmAsync(OutputRoute next, CancellationToken cancellationToken = default)
    {
        if (!OutputRoute.IsValid(next.Host, next.Universe, next.Protocol)) throw new ArgumentException("Invalid output route.");
        await gate.WaitAsync(cancellationToken);
        try
        {
            if (!ownership.TryAcquire(this)) throw new OutputOwnershipConflictException();
            Volatile.Write(ref route, next);
        }
        finally { gate.Release(); }
    }
    public async Task DisarmAsync()
    {
        await gate.WaitAsync();
        try { Volatile.Write(ref route, null); ownership.Release(this); } finally { gate.Release(); }
    }
    public async Task<bool> SendAsync(int[] values, Func<byte[], OutputRoute, CancellationToken, Task> send, CancellationToken cancellationToken)
    {
        await gate.WaitAsync(cancellationToken);
        try
        {
            var current = route;
            if (current is null) return false;
            // Keep legacy short-frame padding/clamping, but reject oversized/null data at the API boundary.
            var payload = new byte[512];
            for (var i = 0; i < Math.Min(values.Length, 512); i++) payload[i] = (byte)Math.Clamp(values[i], 0, 255);
            var packet = current.Protocol == "artnet" ? DmxPackets.ArtNet(current.Universe, payload)
                : DmxPackets.Sacn(current.Universe, payload, sourceCid, sequences[current.Universe]++);
            await send(packet, current, cancellationToken);
            return true;
        }
        finally { gate.Release(); }
    }
}
