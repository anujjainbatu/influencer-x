"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

interface ShareLink {
  id: string;
  token: string;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

const EXPIRY_OPTIONS = [
  { label: "1 day", days: 1 },
  { label: "3 days", days: 3 },
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "Never", days: null as number | null },
];

export function VideoShareControls({
  videoId,
  initialLinks,
}: {
  videoId: string;
  initialLinks: ShareLink[];
}) {
  const router = useRouter();
  const [links, setLinks] = useState(initialLinks);
  const [expiryDays, setExpiryDays] = useState<number | null>(7);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const create = () => {
    setError(null);
    start(async () => {
      try {
        const expires_at =
          expiryDays == null
            ? null
            : new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString();
        const r = await fetch("/api/share-links", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ video_id: videoId, expires_at }),
        });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error ?? `HTTP ${r.status}`);
        }
        const link = await r.json();
        setLinks([link, ...links]);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create link");
      }
    });
  };

  const revoke = (id: string) => {
    start(async () => {
      const r = await fetch("/api/share-links", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (r.ok) {
        setLinks(links.map((l) => (l.id === id ? { ...l, revoked_at: new Date().toISOString() } : l)));
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <label className="text-sm font-medium">Expire after</label>
        <div className="flex flex-wrap gap-2">
          {EXPIRY_OPTIONS.map((o) => (
            <button
              key={o.label}
              type="button"
              onClick={() => setExpiryDays(o.days)}
              className={`h-9 px-3 rounded-md border text-sm ${
                expiryDays === o.days
                  ? "bg-foreground text-background border-foreground"
                  : "border-foreground/15 hover:bg-foreground/5"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <Button onClick={create} disabled={pending}>
          {pending ? "Working…" : "Generate share link"}
        </Button>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-medium">Existing links</h3>
        {links.length === 0 ? (
          <p className="text-sm text-foreground/60">No links yet.</p>
        ) : (
          <ul className="space-y-2">
            {links.map((l) => {
              const url = `${typeof window !== "undefined" ? window.location.origin : ""}/watch/${l.token}`;
              const expired = l.expires_at && new Date(l.expires_at).getTime() < Date.now();
              const revoked = !!l.revoked_at;
              const dead = expired || revoked;
              return (
                <li
                  key={l.id}
                  className="border border-foreground/10 rounded-md p-3 flex flex-col gap-2"
                >
                  <div className="flex items-center gap-2">
                    <Input value={url} readOnly className={dead ? "opacity-50" : ""} />
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => navigator.clipboard.writeText(url)}
                      disabled={dead}
                    >
                      Copy
                    </Button>
                    {!revoked && (
                      <Button size="sm" variant="danger" onClick={() => revoke(l.id)} disabled={pending}>
                        Revoke
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-foreground/60">
                    {revoked
                      ? `Revoked ${new Date(l.revoked_at!).toLocaleString()}`
                      : expired
                      ? `Expired ${new Date(l.expires_at!).toLocaleString()}`
                      : l.expires_at
                      ? `Expires ${new Date(l.expires_at).toLocaleString()}`
                      : "Never expires"}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
