"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardTitle, CardDescription } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime: string;
}

type Tab = "drive" | "device";

export function UploadWorkflow() {
  const [tab, setTab] = useState<Tab>("drive");
  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b border-foreground/10">
        <TabButton active={tab === "drive"} onClick={() => setTab("drive")}>
          Pick from Drive
        </TabButton>
        <TabButton active={tab === "device"} onClick={() => setTab("device")}>
          Upload from device
        </TabButton>
      </div>
      {tab === "drive" ? <DrivePicker /> : <DeviceUploader />}
    </div>
  );
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "h-10 px-4 text-sm font-medium border-b-2 -mb-px",
        active ? "border-foreground" : "border-transparent text-foreground/60 hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

function DrivePicker() {
  const router = useRouter();
  const [files, setFiles] = useState<DriveFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [registering, startRegister] = useTransition();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/drive/google/list")
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
        return r.json();
      })
      .then((j) => { if (!cancelled) setFiles(j.files); })
      .catch((e) => { if (!cancelled) setError(String(e.message ?? e)); });
    return () => { cancelled = true; };
  }, []);

  const register = (file: DriveFile) => {
    setError(null);
    startRegister(async () => {
      try {
        const r = await fetch("/api/videos", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            provider: "google",
            provider_file_id: file.id,
            display_name: file.name,
          }),
        });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error ?? `HTTP ${r.status}`);
        }
        const j = await r.json();
        router.push(`/videos/${j.id}`);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to register");
      }
    });
  };

  if (error) return <p className="text-sm text-red-500">{error}</p>;
  if (!files) return <p className="text-sm text-foreground/60">Loading your Drive videos…</p>;
  if (files.length === 0)
    return (
      <p className="text-sm text-foreground/60">
        No videos found in your Drive. Try the &quot;Upload from device&quot; tab instead.
      </p>
    );

  return (
    <ul className="space-y-2">
      {files.map((f) => (
        <li key={f.id}>
          <Card className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="font-medium truncate">{f.name}</p>
              <p className="text-xs text-foreground/60">
                {f.mimeType} · {formatSize(f.size)}
              </p>
            </div>
            <Button onClick={() => register(f)} disabled={registering} size="sm">
              {registering ? "Adding…" : "Use this"}
            </Button>
          </Card>
        </li>
      ))}
    </ul>
  );
}

// 4 MB per chunk — well under Vercel Edge's 4.5 MB body limit.
// Must be a multiple of 256 KB per the Drive resumable upload spec.
const CHUNK_SIZE = 4 * 1024 * 1024; // 4,194,304 bytes

function DeviceUploader() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  const upload = async () => {
    if (!file) return;
    setError(null);
    setUploading(true);
    setProgress(0);
    setStatus("Preparing…");
    try {
      const driveFile = await chunkedUpload(file, (p, s) => {
        setProgress(p);
        setStatus(s);
      });

      setStatus("Registering…");
      const reg = await fetch("/api/videos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: "google",
          provider_file_id: driveFile.id,
          display_name: driveFile.name,
        }),
      });
      if (!reg.ok) {
        const j = await reg.json().catch(() => ({}));
        throw new Error(j.error ?? `Register failed: ${reg.status}`);
      }
      const j = await reg.json();
      router.push(`/videos/${j.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      setStatus("");
    }
  };

  return (
    <Card className="space-y-4">
      <CardTitle>Upload from your device</CardTitle>
      <CardDescription>
        The file uploads in 4 MB chunks through our server into your Google Drive. Works for any file size.
      </CardDescription>
      <Input
        type="file"
        accept="video/*"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        disabled={uploading}
      />
      {file && !uploading && (
        <p className="text-sm text-foreground/60">
          {file.name} · {(file.size / (1024 * 1024)).toFixed(1)} MB
        </p>
      )}
      {uploading && (
        <div className="space-y-1">
          <div className="h-2 w-full bg-foreground/10 rounded-full overflow-hidden">
            <div
              className="h-2 bg-foreground rounded-full transition-all duration-150"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-foreground/60">{status} {progress}%</p>
        </div>
      )}
      {error && <p className="text-sm text-red-500">{error}</p>}
      <Button onClick={upload} disabled={!file || uploading}>
        {uploading ? "Uploading…" : "Upload to Drive"}
      </Button>
    </Card>
  );
}

async function chunkedUpload(
  file: File,
  onProgress: (pct: number, status: string) => void
): Promise<{ id: string; name: string; mimeType: string; size?: string }> {
  // Step 1: init a Google resumable session via our backend.
  const initRes = await fetch("/api/drive/google/upload/init", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: file.name,
      mimeType: file.type || "video/mp4",
      size: file.size,
    }),
  });
  if (!initRes.ok) {
    const j = await initRes.json().catch(() => ({}));
    throw new Error(j.error ?? `Init failed (${initRes.status})`);
  }
  const { sessionToken } = await initRes.json();

  // Step 2: upload chunks one at a time.
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);
    const chunkBuffer = await chunk.arrayBuffer();

    const pct = Math.round((start / file.size) * 100);
    onProgress(pct, `Chunk ${i + 1}/${totalChunks}`);

    const chunkRes = await uploadChunk({
      sessionToken,
      chunkBuffer,
      mimeType: file.type || "video/mp4",
      rangeStart: start,
      rangeTotal: file.size,
    });

    if (chunkRes.done && chunkRes.file) {
      onProgress(100, "Done");
      return chunkRes.file;
    }
    // 308 incomplete — loop continues
  }

  throw new Error("Upload ended without receiving final file metadata from Drive");
}

async function uploadChunk({
  sessionToken,
  chunkBuffer,
  mimeType,
  rangeStart,
  rangeTotal,
}: {
  sessionToken: string;
  chunkBuffer: ArrayBuffer;
  mimeType: string;
  rangeStart: number;
  rangeTotal: number;
}): Promise<{ done: boolean; file?: { id: string; name: string; mimeType: string; size?: string } }> {
  const res = await fetch("/api/drive/google/upload/chunk", {
    method: "POST",
    headers: {
      "content-type": mimeType,
      "x-session-token": sessionToken,
      "x-range-start": String(rangeStart),
      "x-range-total": String(rangeTotal),
    },
    body: chunkBuffer,
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error ?? `Chunk upload failed (${res.status})`);
  }
  return res.json();
}

function formatSize(size?: string) {
  if (!size) return "—";
  const n = Number(size);
  if (Number.isNaN(n)) return "—";
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
