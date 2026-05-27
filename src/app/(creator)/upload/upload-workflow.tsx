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

function DeviceUploader() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async () => {
    if (!file) return;
    setError(null);
    setUploading(true);
    setProgress(0);
    try {
      // Upload the file to our own API endpoint (same-origin, no CORS).
      // Our Edge function proxies the bytes to Google Drive server-side.
      // XHR is used so we get real upload progress to our server.
      const driveFile = await uploadViaOurProxy(file, (p) => setProgress(p));

      // Register the Drive file in our DB.
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
    }
  };

  return (
    <Card className="space-y-4">
      <CardTitle>Upload from your device</CardTitle>
      <CardDescription>
        Your file is uploaded to your Google Drive. We proxy it server-side so you get a clean progress bar with no CORS noise.
      </CardDescription>
      <Input
        type="file"
        accept="video/*"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        disabled={uploading}
      />
      {file && (
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
          <p className="text-xs text-foreground/60">Uploading to Drive… {progress}%</p>
        </div>
      )}
      {error && <p className="text-sm text-red-500">{error}</p>}
      <Button onClick={upload} disabled={!file || uploading}>
        {uploading ? "Uploading…" : "Upload to Drive"}
      </Button>
    </Card>
  );
}

function uploadViaOurProxy(
  file: File,
  onProgress: (pct: number) => void
): Promise<{ id: string; name: string; mimeType: string; size?: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/drive/google/upload", true);
    // Metadata in headers; body is the raw file bytes.
    xhr.setRequestHeader("Content-Type", file.type || "video/mp4");
    xhr.setRequestHeader("x-file-name", encodeURIComponent(file.name));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error("Invalid JSON in upload response"));
        }
      } else {
        let msg = `Upload failed (${xhr.status})`;
        try {
          const j = JSON.parse(xhr.responseText);
          if (j.error) msg = j.error;
        } catch { /* ignore */ }
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(file);
  });
}

function formatSize(size?: string) {
  if (!size) return "—";
  const n = Number(size);
  if (Number.isNaN(n)) return "—";
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
