"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";
import { ProtectedVideoPlayer } from "@/components/ProtectedVideoPlayer";

interface WatchClientProps {
  token: string;
  videoName: string;
  mimeType?: string;
  creatorHandle: string;
}

export function WatchClient({ token, videoName, mimeType, creatorHandle }: WatchClientProps) {
  const [brandLabel, setBrandLabel] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = brandLabel.trim();
    if (v.length < 2) {
      setError("Please enter a brand or company name.");
      return;
    }
    setError(null);
    start(async () => {
      try {
        const r = await fetch(`/api/share-links/${token}/view-start`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ brand_label: v }),
        });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error ?? `HTTP ${r.status}`);
        }
        setSubmitted(v);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not start playback");
      }
    });
  };

  if (submitted) {
    return (
      <main className="min-h-screen p-4 sm:p-8 flex flex-col items-center gap-4 bg-black">
        <div className="w-full max-w-4xl space-y-3">
          <h1 className="text-white text-lg font-medium">{videoName}</h1>
          <ProtectedVideoPlayer
            src={`/api/stream/${token}`}
            brandLabel={submitted}
            creatorHandle={creatorHandle}
            tokenSuffix={token.slice(-6)}
            mimeType={mimeType}
          />
          <p className="text-xs text-white/40">
            Viewing as <span className="text-white/70">{submitted}</span>. This preview is watermarked and tracked.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardTitle>{videoName}</CardTitle>
        <CardDescription className="mt-1 mb-6">
          You&apos;ve been sent a watermarked preview by @{creatorHandle}. Enter your
          brand or company name to continue. It will appear on the video so the
          creator can trust the source.
        </CardDescription>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Brand / Company name</label>
            <Input
              autoFocus
              value={brandLabel}
              onChange={(e) => setBrandLabel(e.target.value)}
              placeholder="Acme Co"
              maxLength={120}
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Loading…" : "Watch preview"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
