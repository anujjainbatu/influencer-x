// Random URL-safe share-link tokens. No signing — we look up share_links by
// token and check expires_at / revoked_at in the DB. Tokens are 22 chars of
// crypto-random base64url, which is ~131 bits of entropy. Unguessable in
// practice and we'd see brute-force attempts in our logs long before they hit.

function toB64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function generateShareToken(): string {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return toB64Url(buf);
}
