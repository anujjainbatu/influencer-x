import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDriveFileMetadata, getValidAccessTokenForUser } from "@/lib/google-drive";

const RegisterSchema = z.object({
  provider: z.literal("google"),
  provider_file_id: z.string().min(1),
  display_name: z.string().min(1).max(200).optional(),
});

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", issues: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const { accessToken } = await getValidAccessTokenForUser(user.id);
    const meta = await getDriveFileMetadata(accessToken, parsed.data.provider_file_id);

    const { data, error } = await supabase
      .from("videos")
      .insert({
        user_id: user.id,
        provider: "google",
        provider_file_id: meta.id,
        display_name: parsed.data.display_name ?? meta.name,
        mime_type: meta.mimeType,
        size_bytes: meta.size ? Number(meta.size) : null,
      })
      .select("id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ id: data.id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("videos")
    .select("id, display_name, mime_type, size_bytes, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ videos: data });
}
