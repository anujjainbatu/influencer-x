import { env, requireServer } from "@/lib/env";
import { decryptString, encryptString } from "@/lib/crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

// drive.file gives us per-file scope: we can read/write only files the user
// picks via our app, plus files our app created. Good least-privilege default.
export const DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "openid",
  "email",
];

export function buildGoogleAuthUrl({
  state,
  redirectUri,
}: {
  state: string;
  redirectUri: string;
}): string {
  const params = new URLSearchParams({
    client_id: requireServer("GOOGLE_CLIENT_ID"),
    redirect_uri: redirectUri,
    response_type: "code",
    scope: DRIVE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
    include_granted_scopes: "true",
  });
  return `${AUTH_URL}?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  token_type: string;
  id_token?: string;
}

export async function exchangeCodeForTokens({
  code,
  redirectUri,
}: {
  code: string;
  redirectUri: string;
}): Promise<TokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: requireServer("GOOGLE_CLIENT_ID"),
    client_secret: requireServer("GOOGLE_CLIENT_SECRET"),
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) throw new Error(`Google token exchange failed: ${r.status} ${await r.text()}`);
  return r.json();
}

async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    client_id: requireServer("GOOGLE_CLIENT_ID"),
    client_secret: requireServer("GOOGLE_CLIENT_SECRET"),
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) throw new Error(`Google token refresh failed: ${r.status} ${await r.text()}`);
  return r.json();
}

export function decodeIdTokenEmail(idToken: string | undefined): string | null {
  if (!idToken) return null;
  try {
    const parts = idToken.split(".");
    if (parts.length < 2) return null;
    const payload = JSON.parse(
      Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8")
    );
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}

// Returns a fresh access token for the given Supabase user, refreshing & persisting if needed.
export async function getValidAccessTokenForUser(userId: string): Promise<{
  accessToken: string;
  fileScopeOk: boolean;
}> {
  const admin = createSupabaseAdminClient();
  const { data: conn, error } = await admin
    .from("drive_connections")
    .select("id, refresh_token_encrypted, access_token_encrypted, access_token_expires_at")
    .eq("user_id", userId)
    .eq("provider", "google")
    .maybeSingle();

  if (error) throw error;
  if (!conn) throw new Error("No Google Drive connection for this user");

  const now = Date.now();
  const exp = conn.access_token_expires_at ? new Date(conn.access_token_expires_at).getTime() : 0;
  // refresh 60s early to be safe
  if (conn.access_token_encrypted && exp - 60_000 > now) {
    return { accessToken: await decryptString(conn.access_token_encrypted), fileScopeOk: true };
  }

  const refreshToken = await decryptString(conn.refresh_token_encrypted);
  const fresh = await refreshAccessToken(refreshToken);
  const newAccessEnc = await encryptString(fresh.access_token);
  const newExpiresAt = new Date(Date.now() + fresh.expires_in * 1000).toISOString();

  await admin
    .from("drive_connections")
    .update({
      access_token_encrypted: newAccessEnc,
      access_token_expires_at: newExpiresAt,
    })
    .eq("id", conn.id);

  return { accessToken: fresh.access_token, fileScopeOk: true };
}

// ---------------------------------------------------------------------------
// Drive REST API helpers (work in both Node and Edge runtimes).
// ---------------------------------------------------------------------------

export async function listDriveVideos(accessToken: string, opts: { pageSize?: number } = {}) {
  const params = new URLSearchParams({
    q: "mimeType contains 'video/' and trashed = false",
    fields: "files(id,name,mimeType,size,createdTime,thumbnailLink,iconLink),nextPageToken",
    pageSize: String(opts.pageSize ?? 50),
    orderBy: "createdTime desc",
    spaces: "drive",
  });
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) throw new Error(`Drive list failed: ${r.status} ${await r.text()}`);
  return r.json() as Promise<{
    files: Array<{ id: string; name: string; mimeType: string; size?: string; createdTime: string }>;
    nextPageToken?: string;
  }>;
}

export async function getDriveFileMetadata(accessToken: string, fileId: string) {
  const params = new URLSearchParams({ fields: "id,name,mimeType,size" });
  const r = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!r.ok) throw new Error(`Drive get failed: ${r.status} ${await r.text()}`);
  return r.json() as Promise<{ id: string; name: string; mimeType: string; size?: string }>;
}

// Fetch file bytes with optional Range header. Returns the raw upstream Response
// so the caller can pipe body + propagate Content-Range/Content-Length/206/200.
export async function fetchDriveFileBytes(
  accessToken: string,
  fileId: string,
  range?: string | null
): Promise<Response> {
  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
  if (range) headers["Range"] = range;
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;
  return fetch(url, { headers });
}

// One-shot multipart upload (good for MVP; under ~5 MB. For larger files we
// switch to resumable below.)
export async function uploadFileToDrive({
  accessToken,
  name,
  mimeType,
  body,
}: {
  accessToken: string;
  name: string;
  mimeType: string;
  body: Blob | ArrayBuffer | ReadableStream;
}): Promise<{ id: string; name: string; mimeType: string; size?: string }> {
  // Initiate resumable upload session
  const init = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "content-type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": mimeType,
      },
      body: JSON.stringify({ name, mimeType }),
    }
  );
  if (!init.ok) {
    throw new Error(`Drive resumable init failed: ${init.status} ${await init.text()}`);
  }
  const sessionUrl = init.headers.get("Location");
  if (!sessionUrl) throw new Error("Drive resumable: missing Location header");

  // Upload the bytes
  const put = await fetch(sessionUrl, {
    method: "PUT",
    headers: { "content-type": mimeType },
    body: body as BodyInit,
  });
  if (!put.ok) {
    throw new Error(`Drive upload failed: ${put.status} ${await put.text()}`);
  }
  return put.json();
}

// Used by API routes to derive the proper redirect URI based on env / request host.
export function getGoogleRedirectUri(origin: string): string {
  return `${origin || env.APP_URL}/api/drive/google/callback`;
}
