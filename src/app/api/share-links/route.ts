import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateShareToken } from "@/lib/share-token";

const CreateSchema = z.object({
  video_id: z.string().uuid(),
  expires_at: z.string().datetime().nullable().optional(),
});

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // Verify the video belongs to this user
  const { data: video, error: videoErr } = await supabase
    .from("videos")
    .select("id")
    .eq("id", parsed.data.video_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (videoErr) return NextResponse.json({ error: videoErr.message }, { status: 500 });
  if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });

  const token = generateShareToken();
  const { data, error } = await supabase
    .from("share_links")
    .insert({
      video_id: video.id,
      user_id: user.id,
      token,
      expires_at: parsed.data.expires_at ?? null,
    })
    .select("id, token, expires_at, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

const RevokeSchema = z.object({ id: z.string().uuid() });

export async function DELETE(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = RevokeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { error } = await supabase
    .from("share_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", parsed.data.id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
