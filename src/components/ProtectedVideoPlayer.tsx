"use client";

import { useEffect, useRef, useState } from "react";
import { WatermarkOverlay } from "./WatermarkOverlay";
import { useDevToolsOpen } from "./DevToolsGuard";

interface Props {
  src: string;
  brandLabel: string;
  creatorHandle: string;
  tokenSuffix: string;
  mimeType?: string;
}

export function ProtectedVideoPlayer({
  src,
  brandLabel,
  creatorHandle,
  tokenSuffix,
  mimeType,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);

  const devOpen = useDevToolsOpen();

  // --- video element event wiring ---
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTime = () => setCurrentTime(v.currentTime);
    const onLoaded = () => setDuration(v.duration || 0);
    const onWaiting = () => setBuffering(true);
    const onPlaying = () => setBuffering(false);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onLoaded);
    v.addEventListener("waiting", onWaiting);
    v.addEventListener("playing", onPlaying);
    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onLoaded);
      v.removeEventListener("waiting", onWaiting);
      v.removeEventListener("playing", onPlaying);
    };
  }, []);

  // --- pause when tab hidden ---
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) videoRef.current?.pause();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onVis);
    };
  }, []);

  // --- pause + warn when devtools open ---
  useEffect(() => {
    if (devOpen) videoRef.current?.pause();
  }, [devOpen]);

  // --- keyboard / context-menu / drag suppression ---
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      // Common save / inspect / view-source shortcuts. These can't truly
      // disable DevTools (the browser owns those) but they remove the casual path.
      if (
        (e.ctrlKey || e.metaKey) &&
        (k === "s" || k === "u" || k === "p")
      ) {
        e.preventDefault();
      }
      if (e.key === "F12") e.preventDefault();
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (k === "i" || k === "j" || k === "c")) {
        e.preventDefault();
      }
    };
    const onCtx = (e: Event) => e.preventDefault();
    const onDrag = (e: DragEvent) => e.preventDefault();

    root.addEventListener("contextmenu", onCtx);
    root.addEventListener("dragstart", onDrag);
    document.addEventListener("keydown", onKey);
    return () => {
      root.removeEventListener("contextmenu", onCtx);
      root.removeEventListener("dragstart", onDrag);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // --- fullscreen tracking ---
  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };
  const seek = (t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = t;
  };
  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };
  const changeVolume = (vol: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = vol;
    setVolume(vol);
    if (vol > 0 && v.muted) {
      v.muted = false;
      setMuted(false);
    }
  };
  const toggleFullscreen = () => {
    const root = containerRef.current;
    if (!root) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else root.requestFullscreen().catch(() => {});
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full bg-black overflow-hidden rounded-lg select-none"
      style={{ aspectRatio: fullscreen ? undefined : "16 / 9" }}
    >
      <video
        ref={videoRef}
        src={src}
        controls={false}
        playsInline
        controlsList="nodownload noremoteplayback noplaybackrate"
        disablePictureInPicture
        crossOrigin="anonymous"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          display: "block",
          filter: devOpen ? "blur(24px)" : undefined,
          transition: "filter 0.2s",
          pointerEvents: "none",
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {mimeType && <source src={src} type={mimeType} />}
      </video>

      <WatermarkOverlay
        brandLabel={brandLabel}
        creatorHandle={creatorHandle}
        tokenSuffix={tokenSuffix}
      />

      {/* Click target for play/pause toggle */}
      <button
        type="button"
        aria-label={playing ? "Pause" : "Play"}
        onClick={togglePlay}
        className="absolute inset-0 z-10 bg-transparent"
      />

      {/* Center play icon when paused */}
      {!playing && !buffering && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <div className="w-16 h-16 rounded-full bg-black/60 flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-8 h-8 fill-white">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      )}

      {/* Buffering spinner */}
      {buffering && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <div className="w-10 h-10 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      )}

      {/* DevTools open warning */}
      {devOpen && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-40">
          <div className="text-center p-6">
            <p className="text-white font-semibold text-lg">Playback paused</p>
            <p className="text-white/70 text-sm mt-2">
              Close developer tools to resume.
            </p>
          </div>
        </div>
      )}

      {/* Custom controls */}
      <div className="absolute bottom-0 left-0 right-0 z-30 px-3 pb-3 pt-8 bg-linear-to-t from-black/80 to-transparent pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            type="button"
            onClick={togglePlay}
            aria-label={playing ? "Pause" : "Play"}
            className="text-white p-1.5 rounded hover:bg-white/10"
          >
            {playing ? (
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={currentTime}
            onChange={(e) => seek(Number(e.target.value))}
            className="flex-1 accent-white"
          />

          <span className="text-white text-xs tabular-nums w-24 text-right">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? "Unmute" : "Mute"}
            className="text-white p-1.5 rounded hover:bg-white/10"
          >
            {muted || volume === 0 ? (
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
              </svg>
            )}
          </button>

          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={(e) => changeVolume(Number(e.target.value))}
            className="w-20 accent-white"
            aria-label="Volume"
          />

          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label="Fullscreen"
            className="text-white p-1.5 rounded hover:bg-white/10"
          >
            {fullscreen ? (
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatTime(s: number): string {
  if (!Number.isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
}
