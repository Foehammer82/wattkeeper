import { useEffect, useRef } from "react";

const DEFAULT_INTERVAL_MS = 10_000;

/**
 * Runs `refresh` on a fixed interval while the tab is visible. Polling pauses
 * while the tab is hidden (Page Visibility API) and fires an immediate refresh
 * as soon as the tab becomes visible again, so data is never stale-but-silent
 * for longer than necessary. `refresh` is expected to be a "silent" background
 * refresh (no loading spinner, no error UI) since it fires repeatedly.
 */
export function useLiveRefresh(refresh: () => void, intervalMs: number = DEFAULT_INTERVAL_MS, enabled = true) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let intervalId: ReturnType<typeof setInterval> | null = null;

    function start() {
      if (intervalId != null) {
        return;
      }
      intervalId = setInterval(() => refreshRef.current(), intervalMs);
    }

    function stop() {
      if (intervalId != null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        stop();
        return;
      }
      refreshRef.current();
      start();
    }

    if (!document.hidden) {
      start();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [intervalMs, enabled]);
}
