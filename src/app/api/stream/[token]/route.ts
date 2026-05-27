import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { decryptString, encryptString } from "@/lib/crypto";
import { requireServer } from "@/lib/env";

// Use Edge runtime so we get long streaming responses on Vercel Hobby
// (Node Serverless on Hobby caps at 10 seconds, which would break long Range chunks).
export const runtime = "edge";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

async function refreshGoogleAccessToken(refreshToken: string) {
  const body = new URLSearchParams({
    client_id: requireServer("GOOGLE_CLIENT_ID"),
    client_secret: requireServer("GOOGLE_CLIENT_SECRET"),
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const r = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) throw new Error(`Google refresh failed: ${r.status}`);
  return (await r.json()) as { access_token: string; expires_in: number };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const admin = createSupabaseAdminClient();

  // 1. Validate token, get the linked video + drive connection.
  const { data: link, error: linkErr } = await admin
    .from("share_links")
    .select("id, video_id, user_id, expires_at, revoked_at")
    .eq("token", token)
    .maybeSingle();
  if (linkErr || !link) {
    return new Response("Not found", { status: 404 });
  }
  if (link.revoked_at) {
    return new Response("Link revoked", { status: 410 });
  }
  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
    return new Response("Link expired", { status: 410 });
  }

  const { data: video } = await admin
    .from("videos")
    .select("provider_file_id, mime_type")
    .eq("id", link.video_id)
    .maybeSingle();
  if (!video) return new Response("Video missing", { status: 404 });

  const { data: conn } = await admin
    .from("drive_connections")
    .select("id, refresh_token_encrypted, access_token_encrypted, access_token_expires_at")
    .eq("user_id", link.user_id)
    .eq("provider", "google")
    .maybeSingle();
  if (!conn) return new Response("Drive not connected", { status: 500 });

  // 2. Get a valid access token (refresh if needed).
  let accessToken: string;
  const exp = conn.access_token_expires_at ? new Date(conn.access_token_expires_at).getTime() : 0;
  if (conn.access_token_encrypted && exp - 60_000 > Date.now()) {
    accessToken = await decryptString(conn.access_token_encrypted);
  } else {
    const refreshToken = await decryptString(conn.refresh_token_encrypted);
    const fresh = await refreshGoogleAccessToken(refreshToken);
    accessToken = fresh.access_token;
    // Persist refreshed token (fire-and-forget — we don't need to block the stream).
    encryptString(fresh.access_token)
      .then((enc) =>
        admin
          .from("drive_connections")
          .update({
            access_token_encrypted: enc,
            access_token_expires_at: new Date(Date.now() + fresh.expires_in * 1000).toISOString(),
          })
          .eq("id", conn.id)
      )
      .catch(() => {});
  }

  // 3. Pipe through with Range support.
  const range = request.headers.get("range");
  const upstream = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(video.provider_file_id)}?alt=media`,
    {
      headers: range
        ? { Authorization: `Bearer ${accessToken}`, Range: range }
        : { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!upstream.ok && upstream.status !== 206) {
    return new Response(`Upstream error: ${upstream.status}`, { status: 502 });
  }

  // 4. Build the response — forward upstream body and the headers a video element cares about.
  const headers = new Headers();
  const passthrough = [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "etag",
    "last-modified",
  ];
  for (const h of passthrough) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  if (!headers.has("accept-ranges")) headers.set("accept-ranges", "bytes");
  if (!headers.has("content-type") && video.mime_type) headers.set("content-type", video.mime_type);
  headers.set("cache-control", "no-store, private");
  headers.set("x-content-type-options", "nosniff");

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}
