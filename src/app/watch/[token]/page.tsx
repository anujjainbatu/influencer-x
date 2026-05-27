import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { WatchClient } from "./watch-client";

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function WatchPage({ params }: PageProps) {
  const { token } = await params;
  const admin = createSupabaseAdminClient();

  const { data: link } = await admin
    .from("share_links")
    .select("id, token, video_id, user_id, expires_at, revoked_at")
    .eq("token", token)
    .maybeSingle();

  if (!link) return <WatchError title="Link not found" message="This share link doesn't exist." />;
  if (link.revoked_at) return <WatchError title="Link revoked" message="This share link has been revoked by the creator." />;
  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now())
    return <WatchError title="Link expired" message="This share link is no longer active." />;

  const { data: video } = await admin
    .from("videos")
    .select("display_name, mime_type")
    .eq("id", link.video_id)
    .maybeSingle();

  // Pull the creator's email to derive a short handle (everything before '@').
  const { data: userRow } = await admin.auth.admin.getUserById(link.user_id);
  const creatorEmail = userRow?.user?.email ?? "";
  const creatorHandle = creatorEmail ? creatorEmail.split("@")[0] : "creator";

  return (
    <WatchClient
      token={token}
      videoName={video?.display_name ?? "Preview"}
      mimeType={video?.mime_type ?? undefined}
      creatorHandle={creatorHandle}
    />
  );
}

function WatchError({ title, message }: { title: string; message: string }) {
  return (
    <main className="min-h-screen flex items-center justify-center p-8 text-center">
      <div className="max-w-md space-y-2">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-foreground/60">{message}</p>
      </div>
    </main>
  );
}

// Don't allow this page to be embedded — protects the watermark overlay from
// being hidden by a parent frame.
export const metadata = {
  robots: { index: false, follow: false },
};
