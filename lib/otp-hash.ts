const encoder = new TextEncoder();

async function getHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function hashOtp(otp: string, secret: string): Promise<string> {
  const key = await getHmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(otp));
  return Buffer.from(signature).toString("hex");
}

export async function verifyOtp(
  otp: string,
  hash: string,
  secret: string
): Promise<boolean> {
  const expected = await hashOtp(otp, secret);
  const a = encoder.encode(expected);
  const b = encoder.encode(hash);
  if (a.length !== b.length) return false;
  return crypto.subtle.verify("HMAC", await getHmacKey(secret), Buffer.from(hash, "hex"), encoder.encode(otp));
}
