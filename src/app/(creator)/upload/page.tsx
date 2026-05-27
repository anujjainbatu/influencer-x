import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { UploadWorkflow } from "./upload-workflow";

export default async function UploadPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: conn } = await supabase
    .from("drive_connections")
    .select("provider, account_email")
    .eq("user_id", user.id)
    .eq("provider", "google")
    .maybeSingle();

  if (!conn) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Card>
          <CardTitle>Connect Google Drive first</CardTitle>
          <CardDescription className="mt-2">
            Your videos live in your own Google Drive. Connect once and you can
            pick existing videos or upload new ones from your device — they all
            land in your drive.
          </CardDescription>
          <Link
            href="/connect"
            className="inline-block mt-4 underline text-sm"
          >
            Connect now →
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Add a video</h1>
        <p className="text-foreground/60 text-sm mt-1">
          Connected as {conn.account_email}. Pick from your Drive or upload a new file straight into it.
        </p>
      </div>
      <UploadWorkflow />
    </div>
  );
}
