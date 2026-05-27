import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type SearchParams = Promise<{ error?: string }>;

export default async function ConnectPage({ searchParams }: { searchParams: SearchParams }) {
  const { error } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: conn } = await supabase
    .from("drive_connections")
    .select("provider, account_email")
    .eq("user_id", user.id)
    .eq("provider", "google")
    .maybeSingle();

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Connect your Google Drive</h1>
        <p className="text-foreground/60 text-sm mt-1">
          We use Drive to host your video bytes. We can only access files you pick
          here or that we create when you upload from your device — never your
          whole drive.
        </p>
      </div>

      <Card>
        <CardTitle>Google Drive</CardTitle>
        <CardDescription className="mb-4">
          {conn?.account_email
            ? `Connected as ${conn.account_email}.`
            : "Not connected yet."}
        </CardDescription>
        <div className="flex gap-3">
          <Link href="/api/drive/google/connect">
            <Button>{conn ? "Reconnect" : "Connect Google Drive"}</Button>
          </Link>
          {conn && (
            <Link href="/upload">
              <Button variant="secondary">Pick a video</Button>
            </Link>
          )}
        </div>
        {error && (
          <p className="text-sm text-red-500 mt-4">
            Couldn&apos;t connect: {error}
          </p>
        )}
      </Card>
    </div>
  );
}
