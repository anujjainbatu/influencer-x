import { NextResponse } from "next/server";
import { getValidAccessTokenForUser, listDriveVideos } from "@/lib/google-drive";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { accessToken } = await getValidAccessTokenForUser(user.id);
    const result = await listDriveVideos(accessToken);
    return NextResponse.json({ files: result.files });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    if (message.includes("No Google Drive connection")) {
      return NextResponse.json({ error: "not_connected" }, { status: 412 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
