using System.Buffers.Binary;
using System.Net;
using System.Net.Sockets;
using System.Text;

namespace Lightflow.Runtime;

public record WingOscMessage(string Path, object[] Values);

public static class WingOsc
{
    static readonly UTF8Encoding Utf8 = new(false, true);
    public static byte[] Encode(string path, params object[] values)
    {
        using var output = new MemoryStream();
        void Text(string value) {
            if (value.Contains('\0')) throw new ArgumentException("Ongeldige OSC-tekst.");
            var bytes = Utf8.GetBytes(value); output.Write(bytes); output.WriteByte(0);
            while (output.Length % 4 != 0) output.WriteByte(0);
        }
        Text(path);
        // WING explicitly supports address-only queries; avoid treating an empty string as a write.
        if (values.Length != 0) {
            Text("," + string.Concat(values.Select(value => value switch { string => "s", int => "i", float => "f", _ => throw new ArgumentException("Ongeldig OSC-type.") })));
            foreach (var value in values) {
                if (value is string text) Text(text);
                else { var bytes = new byte[4]; BinaryPrimitives.WriteInt32BigEndian(bytes, value is int number ? number : BitConverter.SingleToInt32Bits((float)value)); output.Write(bytes); }
            }
        }
        if (output.Length > 4096) throw new ArgumentException("OSC-pakket te groot.");
        return output.ToArray();
    }
    public static WingOscMessage Decode(byte[] bytes)
    {
        if (bytes.Length is < 4 or > 4096 || bytes.Length % 4 != 0) throw new IOException("Ongeldig WING-antwoord.");
        var offset = 0;
        string Text() {
            var end = Array.IndexOf(bytes, (byte)0, offset);
            if (end < 0) throw new IOException("Ongeldig WING-antwoord.");
            string result;
            try { result = Utf8.GetString(bytes, offset, end - offset); } catch (DecoderFallbackException) { throw new IOException("Ongeldig WING-antwoord."); }
            var next = (end + 4) & ~3;
            if (next > bytes.Length || bytes.AsSpan(end, next - end).ContainsAnyExcept((byte)0)) throw new IOException("Ongeldige OSC-padding.");
            offset = next; return result;
        }
        var path = Text();
        if (!path.StartsWith('/') || offset == bytes.Length) throw new IOException("Ongeldig WING-antwoord.");
        var types = Text();
        if (!types.StartsWith(',') || types.Length > 33) throw new IOException("Ongeldige OSC-types.");
        var values = new List<object>();
        foreach (var type in types.Skip(1)) {
            if (type == 's') values.Add(Text());
            else if (type is 'i' or 'f' && offset + 4 <= bytes.Length) {
                var value = BinaryPrimitives.ReadInt32BigEndian(bytes.AsSpan(offset, 4)); offset += 4;
                if (type == 'i') values.Add(value);
                else { var number = BitConverter.Int32BitsToSingle(value); if (!float.IsFinite(number)) throw new IOException("Ongeldig OSC-getal."); values.Add(number); }
            } else throw new IOException("Niet ondersteund OSC-antwoord.");
        }
        if (offset != bytes.Length) throw new IOException("Onverwachte OSC-data.");
        return new(path, values.ToArray());
    }
}

public interface IWingTransport : IDisposable
{
    Task<object[]> ReadAsync(string path, CancellationToken cancellationToken);
    Task WriteAsync(string path, object value, CancellationToken cancellationToken);
}

public sealed class WingUdpTransport : IWingTransport
{
    readonly UdpClient client = new(AddressFamily.InterNetwork);
    public WingUdpTransport(IPAddress address) { client.Connect(new IPEndPoint(address, 2223)); }
    public async Task<object[]> ReadAsync(string path, CancellationToken cancellationToken)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(2));
        // A connected UDP socket filters responses to the exact configured peer IP and port.
        await client.SendAsync(WingOsc.Encode(path), timeout.Token);
        for (var count = 0; count < 64; count++) {
            var packet = await client.ReceiveAsync(timeout.Token);
            var message = WingOsc.Decode(packet.Buffer);
            if (message.Path == path || path == "/?" && message.Path == "/*") return message.Values;
        }
        throw new IOException("Te veel onverwachte WING-antwoorden.");
    }
    public async Task WriteAsync(string path, object value, CancellationToken cancellationToken) {
        await client.SendAsync(WingOsc.Encode(path, value), cancellationToken);
        await Task.Delay(10, cancellationToken);
    }
    public void Dispose() => client.Dispose();
}
