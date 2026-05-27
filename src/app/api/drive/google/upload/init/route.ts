import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getValidAccessTokenForUser } from "@/lib/google-drive";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { encryptString } from "@/lib/crypto";

export const runtime = "edge";

const Body = z.object({
  name: z.string().min(1).max(200),
  mimeType: z.string().min(1).max(100),
  size: z.number().int().positive(),
});

// Step 1 of chunked upload: open a Google resumable session and hand back an
// AES-encrypted session URL. The client sends this token with every chunk so
// the server can forward to the right Google session — no DB state needed.
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    const { accessToken } = await getValidAccessTokenForUser(user.id);
    const { name, mimeType, size } = parsed.data;

    const initRes = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": mimeType,
          "X-Upload-Content-Length": String(size),
        },
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

    // Encrypt the session URL so the client can pass it back with each chunk
    // without us storing state anywhere.
    const sessionToken = await encryptString(JSON.stringify({ sessionUrl, userId: user.id }));
    return NextResponse.json({ sessionToken });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
