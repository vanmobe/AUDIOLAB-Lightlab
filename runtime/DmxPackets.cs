namespace Lightflow.Runtime;

public static class DmxPackets
{
    public static byte[] ArtNet(int universe, byte[] dmx, byte sequence = 0)
    {
        if (universe is < 1 or > 32768 || dmx is null || dmx.Length != 512) throw new ArgumentException("Invalid ArtDmx universe or payload.");
        var packet = new byte[530]; "Art-Net\0"u8.CopyTo(packet); packet[9] = 0x50; packet[11] = 14;
        packet[12] = sequence;
        packet[14] = (byte)(universe - 1); packet[15] = (byte)((universe - 1) >> 8); packet[16] = 2;
        dmx.CopyTo(packet, 18); return packet;
    }
    public static byte[] Sacn(int universe, byte[] dmx, Guid sourceCid, byte sequence, bool terminated = false)
    {
        if (universe is < 1 or > 63999 || dmx is null || dmx.Length != 512) throw new ArgumentException("Invalid sACN universe or payload.");
        var packet = new byte[638]; packet[1] = 0x10;
        "ASC-E1.17\0\0\0"u8.CopyTo(packet.AsSpan(4));
        packet[16] = 0x72; packet[17] = 0x6e; packet[21] = 4;
        sourceCid.TryWriteBytes(packet.AsSpan(22, 16), bigEndian: true, out _);
        packet[38] = 0x72; packet[39] = 0x58; packet[43] = 2;
        System.Text.Encoding.ASCII.GetBytes("Lightlab Runtime").CopyTo(packet, 44);
        packet[108] = 100; packet[111] = sequence;
        // Stream_Terminated is bit 6; callers send three terminal packets per universe.
        packet[112] = terminated ? (byte)0x40 : (byte)0;
        packet[113] = (byte)(universe >> 8); packet[114] = (byte)universe;
        packet[115] = 0x72; packet[116] = 0x0b; packet[117] = 2; packet[118] = 0xa1;
        // E1.31: address increment at121, property count at123, start code125, slots126.
        packet[122] = 1; packet[123] = 2; packet[124] = 1;
        dmx.CopyTo(packet, 126); return packet;
    }
}
