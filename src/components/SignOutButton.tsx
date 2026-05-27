"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const onClick = () =>
    start(async () => {
      await createSupabaseBrowserClient().auth.signOut();
      router.replace("/");
      router.refresh();
    });
  return (
    <Button variant="ghost" size="sm" onClick={onClick} disabled={pending}>
      {pending ? "Signing out..." : "Sign out"}
    </Button>
  );
}
