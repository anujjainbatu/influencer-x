// AES-GCM encryption helpers backed by Web Crypto (works in Node 18+ and Edge runtime).
// Used to protect Google refresh tokens stored in Postgres.
//
// AES_KEY env var must be 32 raw bytes, base64-encoded. Generate one with:
//   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

import { requireServer } from "@/lib/env";

let cachedKey: CryptoKey | null = null;

async function getKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const b64 = requireServer("AES_KEY");
  const raw = fromB64(b64);
  if (raw.byteLength !== 32) {
    throw new Error("AES_KEY must decode to exactly 32 bytes (256-bit AES-GCM)");
  }
  cachedKey = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
  return cachedKey;
}

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

// Always returns a Uint8Array whose underlying buffer is a concrete ArrayBuffer
// (not SharedArrayBuffer), satisfying the BufferSource constraints used by
// crypto.subtle.* under TypeScript 5.7+.
function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const buf = new ArrayBuffer(bin.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
  return view;
}

function encodeUtf8(s: string): Uint8Array<ArrayBuffer> {
  const text = new TextEncoder().encode(s);
  // Copy into a freshly-owned ArrayBuffer so the type system knows it's not shared.
  const buf = new ArrayBuffer(text.byteLength);
  new Uint8Array(buf).set(text);
  return new Uint8Array(buf);
}

export async function encryptString(plaintext: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encodeUtf8(plaintext)
  );
  return `${toB64(iv)}.${toB64(new Uint8Array(ct))}`;
}

export async function decryptString(payload: string): Promise<string> {
  const [ivB64, ctB64] = payload.split(".");
  if (!ivB64 || !ctB64) throw new Error("Invalid encrypted payload");
  const key = await getKey();
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(ivB64) },
    key,
    fromB64(ctB64)
  );
  return new TextDecoder().decode(pt);
}
