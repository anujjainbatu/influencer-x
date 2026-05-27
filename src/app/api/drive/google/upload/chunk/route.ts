import { type NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { decryptString } from "@/lib/crypto";

export const runtime = "edge";

// Step 2 of chunked upload. Client sends one chunk at a time (≤ 4 MB to stay
// under Vercel Edge body limit). We decrypt the session URL and forward the
// chunk to Google with the proper Content-Range header.
//
// Google returns:
//   308 Resume Incomplete → chunk accepted, more chunks to come
//   200 / 201            → all chunks received, returns Drive file metadata
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sessionToken = request.headers.get("x-session-token");
  const rangeStart = request.headers.get("x-range-start");
  const rangeTotal = request.headers.get("x-range-total");
  const mimeType = request.headers.get("content-type") ?? "video/mp4";

  if (!sessionToken || rangeStart === null || !rangeTotal) {
    return NextResponse.json(
      { error: "Missing x-session-token, x-range-start, or x-range-total" },
      { status: 400 }
    );
  }

  let sessionUrl: string;
  try {
    const payload = JSON.parse(await decryptString(sessionToken)) as {
      sessionUrl: string;
      userId: string;
    };
    // Bind the token to the calling user so a leaked token can't be used by others.
    if (payload.userId !== user.id) {
      return NextResponse.json({ error: "Token mismatch" }, { status: 403 });
    }
    sessionUrl = payload.sessionUrl;
  } catch {
    return NextResponse.json({ error: "Invalid session token" }, { status: 400 });
  }

  // Read chunk body to calculate the byte count (needed for Content-Range end).
  const chunkBytes = await request.arrayBuffer();
  const start = Number(rangeStart);
  const total = Number(rangeTotal);
  const end = start + chunkBytes.byteLength - 1;
  const contentRange = `bytes ${start}-${end}/${total}`;

  const putRes = await fetch(sessionUrl, {
    method: "PUT",
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(chunkBytes.byteLength),
      "Content-Range": contentRange,
    },
    body: chunkBytes,
  });

  // 308 = chunk received, upload incomplete — tell the client to send the next chunk.
  if (putRes.status === 308) {
    return NextResponse.json({ done: false });
  }

  // 200 / 201 = upload complete — return Drive file metadata to the client.
  if (putRes.status === 200 || putRes.status === 201) {
    const file = await putRes.json();
    return NextResponse.json({ done: true, file });
  }

  const text = await putRes.text();
  return NextResponse.json(
    { error: `Drive chunk upload failed: ${putRes.status} ${text}` },
    { status: 500 }
  );
}
