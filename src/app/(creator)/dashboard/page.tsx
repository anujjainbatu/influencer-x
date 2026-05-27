import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: videos } = await supabase
    .from("videos")
    .select("id, display_name, mime_type, size_bytes, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const { data: conn } = await supabase
    .from("drive_connections")
    .select("provider")
    .eq("user_id", user.id)
    .eq("provider", "google")
    .maybeSingle();

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Your videos</h1>
        <Link href="/upload">
          <Button>Add a video</Button>
        </Link>
      </div>

      {!conn && (
        <Card>
          <CardTitle>Connect your Drive first</CardTitle>
          <CardDescription className="mt-1 mb-3">
            Your videos live in your own Google Drive. Connect once to start sharing.
          </CardDescription>
          <Link href="/connect">
            <Button>Connect Google Drive</Button>
          </Link>
        </Card>
      )}

      {videos && videos.length > 0 ? (
        <ul className="space-y-2">
          {videos.map((v) => (
            <li key={v.id}>
              <Link href={`/videos/${v.id}`} className="block">
                <Card className="hover:bg-foreground/5 transition-colors flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{v.display_name}</p>
                    <p className="text-xs text-foreground/60">
                      {v.mime_type ?? "video"} · {formatBytes(v.size_bytes)} · {new Date(v.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="text-sm text-foreground/60">Open →</span>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        conn && (
          <Card>
            <CardTitle>No videos yet</CardTitle>
            <CardDescription className="mt-1 mb-3">
              Add a video from your Drive or upload one from your device.
            </CardDescription>
            <Link href="/upload">
              <Button>Add a video</Button>
            </Link>
          </Card>
        )
      )}
    </div>
  );
}

function formatBytes(n: number | null) {
  if (n == null) return "—";
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
