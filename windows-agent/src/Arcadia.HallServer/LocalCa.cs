using System.Net;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;

namespace Arcadia.HallServer;

/// <summary>Wraps secret storage so tests can avoid DPAPI scope issues.</summary>
public interface ISecretProtector
{
    byte[] Protect(byte[] data);
    byte[] Unprotect(byte[] data);
}

/// <summary>DPAPI LocalMachine: the CA key password is readable only on this machine (security doc section 2).</summary>
public sealed class DpapiSecretProtector : ISecretProtector
{
    public byte[] Protect(byte[] data) => ProtectedData.Protect(data, null, DataProtectionScope.LocalMachine);
    public byte[] Unprotect(byte[] data) => ProtectedData.Unprotect(data, null, DataProtectionScope.LocalMachine);
}

/// <summary>
/// The Hall Server's private CA (security doc section 3). Agents pin this CA at pairing; the server certificate and
/// every agent client certificate are issued by it. mDNS discovery is only a hint: identity is this pinned CA.
/// </summary>
public sealed class LocalCa
{
    private readonly X509Certificate2 _ca; // with private key

    private LocalCa(X509Certificate2 ca) => _ca = ca;

    public string CaPem => _ca.ExportCertificatePem();

    /// <summary>SHA-256 of the CA certificate, shown to the technician to confirm during first pairing.</summary>
    public string Fingerprint => Convert.ToHexString(_ca.GetCertHash(HashAlgorithmName.SHA256));

    public static LocalCa LoadOrCreate(string dir, ISecretProtector protector)
    {
        Directory.CreateDirectory(dir);
        var pfxPath = Path.Combine(dir, "ca.pfx");
        var pwPath = Path.Combine(dir, "ca.pw");

        if (File.Exists(pfxPath) && File.Exists(pwPath))
        {
            var pw = Encoding.UTF8.GetString(protector.Unprotect(File.ReadAllBytes(pwPath)));
            return new LocalCa(X509CertificateLoader.LoadPkcs12FromFile(pfxPath, pw, X509KeyStorageFlags.Exportable));
        }

        using var key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var req = new CertificateRequest("CN=Arcadia Hall CA", key, HashAlgorithmName.SHA256);
        req.CertificateExtensions.Add(new X509BasicConstraintsExtension(true, false, 0, true));
        req.CertificateExtensions.Add(new X509KeyUsageExtension(X509KeyUsageFlags.KeyCertSign | X509KeyUsageFlags.CrlSign, true));
        req.CertificateExtensions.Add(new X509SubjectKeyIdentifierExtension(req.PublicKey, false));
        var now = DateTimeOffset.UtcNow;
        using var created = req.CreateSelfSigned(now.AddDays(-1), now.AddYears(5));

        var password = Convert.ToBase64String(RandomNumberGenerator.GetBytes(24));
        File.WriteAllBytes(pfxPath, created.Export(X509ContentType.Pfx, password));
        File.WriteAllBytes(pwPath, protector.Protect(Encoding.UTF8.GetBytes(password)));
        return new LocalCa(X509CertificateLoader.LoadPkcs12FromFile(pfxPath, password, X509KeyStorageFlags.Exportable));
    }

    /// <summary>Server certificate for the Kestrel listener (SAN must cover every name or IP agents use).</summary>
    public X509Certificate2 IssueServerCert(IEnumerable<string> dnsNames, IEnumerable<IPAddress> ips)
    {
        using var key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var req = new CertificateRequest("CN=Arcadia Hall Server", key, HashAlgorithmName.SHA256);
        var san = new SubjectAlternativeNameBuilder();
        foreach (var d in dnsNames) san.AddDnsName(d);
        foreach (var ip in ips) san.AddIpAddress(ip);
        req.CertificateExtensions.Add(san.Build());
        req.CertificateExtensions.Add(new X509KeyUsageExtension(X509KeyUsageFlags.DigitalSignature, true));
        req.CertificateExtensions.Add(new X509EnhancedKeyUsageExtension([new Oid("1.3.6.1.5.5.7.3.1")], false)); // serverAuth
        var now = DateTimeOffset.UtcNow;
        using var signed = req.Create(_ca, now.AddDays(-1), now.AddYears(1), RandomNumberGenerator.GetBytes(16));
        using var withKey = signed.CopyWithPrivateKey(key);
        // Round-trip through PFX so the key is persisted in a form SChannel can use.
        return X509CertificateLoader.LoadPkcs12(withKey.Export(X509ContentType.Pfx), null, X509KeyStorageFlags.Exportable);
    }

    /// <summary>Signs an agent's CSR. The subject is set by the server (never trusted from the CSR).</summary>
    public X509Certificate2 IssueClientCert(string csrPem, Guid agentId)
    {
        var csr = CertificateRequest.LoadSigningRequestPem(csrPem, HashAlgorithmName.SHA256,
            CertificateRequestLoadOptions.Default, RSASignaturePadding.Pkcs1);
        var req = new CertificateRequest(new X500DistinguishedName($"CN=agent:{agentId}"), csr.PublicKey, HashAlgorithmName.SHA256);
        req.CertificateExtensions.Add(new X509KeyUsageExtension(X509KeyUsageFlags.DigitalSignature, true));
        req.CertificateExtensions.Add(new X509EnhancedKeyUsageExtension([new Oid("1.3.6.1.5.5.7.3.2")], false)); // clientAuth
        var now = DateTimeOffset.UtcNow;
        return req.Create(_ca, now.AddDays(-1), now.AddYears(1), RandomNumberGenerator.GetBytes(16));
    }

    /// <summary>True if the certificate chains to this CA (custom root trust, no system store, no revocation lookup).</summary>
    public bool ChainsToCa(X509Certificate2 cert)
    {
        using var root = X509CertificateLoader.LoadCertificate(_ca.RawData);
        using var chain = new X509Chain();
        chain.ChainPolicy.TrustMode = X509ChainTrustMode.CustomRootTrust;
        chain.ChainPolicy.CustomTrustStore.Add(root);
        chain.ChainPolicy.RevocationMode = X509RevocationMode.NoCheck;
        return chain.Build(cert);
    }
}
