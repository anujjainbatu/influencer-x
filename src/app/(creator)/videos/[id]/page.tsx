import { notFound, redirect } from "next/navigation";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { VideoShareControls } from "./share-controls";

export default async function VideoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: video } = await supabase
    .from("videos")
    .select("id, display_name, mime_type, size_bytes, created_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!video) notFound();

  const { data: links } = await supabase
    .from("share_links")
    .select("id, token, expires_at, revoked_at, created_at")
    .eq("video_id", video.id)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{video.display_name}</h1>
        <p className="text-sm text-foreground/60 mt-1">
          {video.mime_type ?? "video"} · added {new Date(video.created_at).toLocaleString()}
        </p>
      </div>

      <Card>
        <CardTitle>Share with a brand</CardTitle>
        <CardDescription className="mt-1 mb-4">
          Generate a watermarked preview link. The brand types their name on arrival;
          you can revoke or expire the link any time.
        </CardDescription>
        <VideoShareControls videoId={video.id} initialLinks={links ?? []} />
      </Card>
    </div>
  );
}
