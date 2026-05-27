"use client";

import { useEffect, useState } from "react";

/**
 * Heuristic DevTools detection. Combines two signals:
 *  1. The window outer/inner dimension delta — when DevTools docks, the gap
 *     between outerWidth and innerWidth (or outerHeight and innerHeight) jumps.
 *  2. A `debugger` statement timing trick — if devtools is open with sources
 *     active, the debugger pause adds latency we can measure.
 *
 * Both are defeatable, but combining them deters casual inspection. The hook
 * returns a boolean `open` flag the parent uses to blur + pause the video.
 */
export function useDevToolsOpen(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const threshold = 160;
    const check = () => {
      if (cancelled) return;
      const widthGap = window.outerWidth - window.innerWidth;
      const heightGap = window.outerHeight - window.innerHeight;
      const sizeOpen = widthGap > threshold || heightGap > threshold;

      const t0 = performance.now();
      // eslint-disable-next-line no-debugger
      debugger;
      const t1 = performance.now();
      const debuggerOpen = t1 - t0 > 100;

      setOpen(sizeOpen || debuggerOpen);
    };

    check();
    const id = window.setInterval(check, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return open;
}
