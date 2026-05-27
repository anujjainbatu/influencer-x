import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "edge";

const Body = z.object({ brand_label: z.string().min(1).max(120) });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const json = await request.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: link } = await admin
    .from("share_links")
    .select("id, expires_at, revoked_at")
    .eq("token", token)
    .maybeSingle();
  if (!link) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (link.revoked_at) return NextResponse.json({ error: "revoked" }, { status: 410 });
  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "expired" }, { status: 410 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const ua = request.headers.get("user-agent")?.slice(0, 500) ?? "";
  const ipHash = await sha256Short(ip);

  await admin.from("view_events").insert({
    share_link_id: link.id,
    brand_label: parsed.data.brand_label,
    ip_hash: ipHash,
    user_agent: ua,
  });

  return NextResponse.json({ ok: true });
}

async function sha256Short(input: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  const u8 = new Uint8Array(buf);
  let hex = "";
  for (const b of u8) hex += b.toString(16).padStart(2, "0");
  return hex.slice(0, 16);
}
