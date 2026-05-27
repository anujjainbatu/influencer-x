import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 text-center">
      <div className="max-w-2xl space-y-6">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
          Share UGC previews. Never lose them.
        </h1>
        <p className="text-lg text-foreground/70">
          Stream watermarked previews to brand partners before payment — straight
          from your Google Drive, with anti-download protections built in.
        </p>
        <div className="flex gap-3 justify-center">
          {user ? (
            <Link href="/dashboard">
              <Button size="lg">Open dashboard</Button>
            </Link>
          ) : (
            <>
              <Link href="/signup">
                <Button size="lg">Get started</Button>
              </Link>
              <Link href="/login">
                <Button size="lg" variant="secondary">
                  Sign in
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
