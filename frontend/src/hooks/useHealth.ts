import { useEffect, useState, useCallback } from "react";
import { api } from "../api/client";
import type { Health } from "../api/types";
export function useHealth() {
  const [health, setHealth] = useState<Health | null>(null),
    [unreachable, setUnreachable] = useState(false),
    [checking, setChecking] = useState(true),
    [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  useEffect(() => {
    const c = new AbortController();
    setChecking(true);
    api
      .health(c.signal)
      .then((h) => {
        if (!c.signal.aborted) {
          setHealth(h);
          setUnreachable(false);
        }
      })
      .catch(() => {
        if (!c.signal.aborted) setUnreachable(true);
      })
      .finally(() => {
        if (!c.signal.aborted) setChecking(false);
      });
    return () => c.abort();
  }, [attempt]);
  return { health, unreachable, checking, retry };
}
