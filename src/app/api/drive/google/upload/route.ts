import { type NextRequest, NextResponse } from "next/server";
import { getValidAccessTokenForUser } from "@/lib/google-drive";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Edge runtime so the request body streams through without buffering to memory.
// Google Drive's resumable upload session URLs do NOT support CORS from browser
// JavaScript (the upload works server-side but Google blocks the browser from
// reading the response). Proxying here fixes that with zero CORS overhead.
export const runtime = "edge";

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Metadata comes in as headers so we can stream the body without parsing JSON first.
  const name = decodeURIComponent(request.headers.get("x-file-name") ?? "upload.mp4");
  const mimeType = request.headers.get("content-type") ?? "video/mp4";
  const contentLength = request.headers.get("content-length");

  if (!name || !mimeType) {
    return NextResponse.json({ error: "Missing x-file-name or content-type" }, { status: 400 });
  }

  try {
    const { accessToken } = await getValidAccessTokenForUser(user.id);

    // 1. Initiate a resumable session with Google.
    const initHeaders: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": mimeType,
    };
    if (contentLength) initHeaders["X-Upload-Content-Length"] = contentLength;

    const initRes = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable",
      {
        method: "POST",
        headers: initHeaders,
        body: JSON.stringify({ name, mimeType }),
      }
    );
    if (!initRes.ok) {
      const text = await initRes.text();
      return NextResponse.json(
        { error: `Drive session init failed: ${initRes.status} ${text}` },
        { status: 500 }
      );
    }
    const sessionUrl = initRes.headers.get("Location");
    if (!sessionUrl) {
      return NextResponse.json({ error: "Drive returned no session URL" }, { status: 500 });
    }

    // 2. Pipe the browser's request body directly to Google's session URL.
    //    Edge runtime passes body as a ReadableStream — no full-file buffering.
    const putHeaders: Record<string, string> = { "Content-Type": mimeType };
    if (contentLength) putHeaders["Content-Length"] = contentLength;

    const putRes = await fetch(sessionUrl, {
      method: "PUT",
      headers: putHeaders,
      // @ts-expect-error — duplex is required for streaming bodies in the fetch spec
      duplex: "half",
      body: request.body,
    });

    if (!putRes.ok) {
      const text = await putRes.text();
      return NextResponse.json(
        { error: `Drive upload failed: ${putRes.status} ${text}` },
        { status: 500 }
      );
    }

    // 3. Return the Drive file metadata to the browser.
    const file = await putRes.json();
    return NextResponse.json(file);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
