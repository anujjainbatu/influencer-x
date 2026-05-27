// Next.js inlines NEXT_PUBLIC_* env vars in the browser bundle ONLY when
// written as literal property access: `process.env.NEXT_PUBLIC_FOO`.
// Dynamic access `process.env[variable]` is NOT replaced by the bundler,
// so client components would see undefined. Write each var explicitly below.

export const env = {
  // ---- Public (safe for browser) ----
  get SUPABASE_URL(): string {
    const v = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!v) throw new Error("Missing env var: NEXT_PUBLIC_SUPABASE_URL");
    return v;
  },
  get SUPABASE_ANON_KEY(): string {
    const v = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!v) throw new Error("Missing env var: NEXT_PUBLIC_SUPABASE_ANON_KEY");
    return v;
  },
  get APP_URL(): string {
    return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  },

  // ---- Server-only (these are empty strings in the browser — that is fine) ----
  get SUPABASE_SERVICE_ROLE_KEY(): string {
    return process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  },
  get GOOGLE_CLIENT_ID(): string {
    return process.env.GOOGLE_CLIENT_ID ?? "";
  },
  get GOOGLE_CLIENT_SECRET(): string {
    return process.env.GOOGLE_CLIENT_SECRET ?? "";
  },
  get AES_KEY(): string {
    return process.env.AES_KEY ?? "";
  },
  get TOKEN_SIGNING_SECRET(): string {
    return process.env.TOKEN_SIGNING_SECRET ?? "";
  },
};

// Call at runtime inside server-only code (route handlers, server actions).
// Throws fast with a clear message if the var is missing at runtime.
export function requireServer(key: keyof typeof env): string {
  const v = env[key];
  if (!v) throw new Error(`Missing required server env var: ${String(key)}`);
  return v;
}
