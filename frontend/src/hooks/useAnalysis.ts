import { useCallback, useEffect, useState } from "react";
import { api, ApiError, messageOf } from "../api/client";
import type { AnalysisStatus, Results } from "../api/types";
import { terminal } from "../api/types";
import { POLL_INTERVAL } from "../config";
export function useAnalysis(id: string | null) {
  const [owner, setOwner] = useState(id);
  const [status, setStatus] = useState<AnalysisStatus | null>(null),
    [results, setResults] = useState<Results | null>(null);
  const [error, setError] = useState<string | null>(null),
    [loading, setLoading] = useState(false),
    [retry, setRetry] = useState(0);
  const refresh = useCallback(() => setRetry((n) => n + 1), []);
  useEffect(() => {
    setOwner(id);
    setStatus(null);
    setResults(null);
    setError(null);
    setLoading(Boolean(id));
    if (!id) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    let finalStatus: AnalysisStatus | null = null;
    async function poll() {
      try {
        const next = finalStatus ?? (await api.status(id!, controller.signal));
        if (controller.signal.aborted) return;
        setStatus(next);
        setLoading(false);
        setError(null);
        if (terminal(next.status)) {
          finalStatus = next;
          if (next.status === "failed") return;
          const result = await api.results(id!, controller.signal);
          if (!controller.signal.aborted) {
            setResults(result);
            failures = 0;
          }
          return;
        }
        failures = 0;
        timer = setTimeout(poll, POLL_INTERVAL);
      } catch (e) {
        if (controller.signal.aborted) return;
        failures++;
        setLoading(false);
        setError(messageOf(e));
        if (
          e instanceof ApiError &&
          [400, 401, 403, 404, 422].includes(e.status)
        )
          return;
        timer = setTimeout(
          poll,
          Math.min(30000, POLL_INTERVAL * 2 ** Math.min(failures, 4)),
        );
      }
    }
    void poll();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [id, retry]);
  return {
    status: owner === id ? status : null,
    results: owner === id ? results : null,
    error: owner === id ? error : null,
    loading: owner === id ? loading : Boolean(id),
    refresh,
  };
}
