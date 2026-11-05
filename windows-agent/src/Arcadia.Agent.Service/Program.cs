using System.Security.Cryptography;
using System.Text;
using Arcadia.Agent.Core;
using Arcadia.Agent.Link;
using Arcadia.Agent.Service;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

// `Arcadia.Agent.Service.exe pair --server https://host:7421 --ca-fingerprint HEX --code 123456 --station GUID`
// Run once, elevated, by a technician. Needs the hall pairing code and the CA fingerprint shown in the dashboard.
if (args.Length > 0 && args[0] == "pair") return await PairCommand.RunAsync(args);

// `Arcadia.Agent.Service.exe hash-pin <pin>` prints the PBKDF2 hash to store as Agent:TechnicianPinHash.
if (args.Length == 2 && args[0] == "hash-pin")
{
    if (args[1].Length < 4) { Console.Error.WriteLine("Use at least 4 characters."); return 2; }
    Console.WriteLine(PinVerifier.Hash(args[1]));
    return 0;
}

var builder = Host.CreateApplicationBuilder(args);
builder.Services.AddWindowsService(o => o.ServiceName = "ArcadiaAgent");
builder.Services.Configure<AgentOptions>(builder.Configuration.GetSection(AgentOptions.Section));
builder.Services.AddSingleton(sp => sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<AgentOptions>>().Value);
builder.Services.AddSingleton<IAgentClock, WindowsBootClock>();
builder.Services.AddSingleton<ICredentialStore, DpapiCredentialStore>();
builder.Services.AddSingleton<UiHost>();
builder.Services.AddSingleton<UiLauncher>();
builder.Services.AddSingleton<AgentWorker>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<AgentWorker>());
builder.Services.AddHostedService<HallLinkService>();
builder.Services.AddHostedService<DevFileCommandSource>();

await builder.Build().RunAsync();
return 0;

internal static class PairCommand
{
    public static async Task<int> RunAsync(string[] args)
    {
        string? Arg(string n) { var i = Array.IndexOf(args, n); return i >= 0 && i + 1 < args.Length ? args[i + 1] : null; }
        var server = Arg("--server");
        var fp = Arg("--ca-fingerprint");
        var code = Arg("--code");
        var station = Arg("--station");
        if (server is null || fp is null || code is null || !Guid.TryParse(station, out var stationId))
        {
            Console.Error.WriteLine("Usage: pair --server https://host:7421 --ca-fingerprint <SHA-256 hex> --code <code> --station <device guid>");
            return 2;
        }

        var cfg = new ConfigurationBuilder().SetBasePath(AppContext.BaseDirectory).AddJsonFile("appsettings.json", optional: true).Build();
        var opt = cfg.GetSection(AgentOptions.Section).Get<AgentOptions>() ?? new AgentOptions();
        var store = new DpapiCredentialStore(opt);
        var machineFp = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(Environment.MachineName + Environment.UserDomainName)));
        try
        {
            var c = await HallPairing.PairAsync(server, fp, code, stationId, machineFp, store);
            Console.WriteLine($"Paired. Agent {c.AgentId}, station {c.StationId}. Restart the ArcadiaAgent service.");
            return 0;
        }
        catch (PairingException e) { Console.Error.WriteLine(e.Message); return 1; }
        catch (HttpRequestException e) { Console.Error.WriteLine($"Could not reach the Hall Server: {e.Message}"); return 1; }
    }
}
