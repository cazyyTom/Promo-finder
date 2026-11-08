import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import { normalizeHistory } from "../api/normalize";
import type { AnalysisState, HistoryEntry } from "../api/types";
import { STORAGE_PREFIX } from "../config";
const KEY = `${STORAGE_PREFIX}:history`,
  HIDDEN = `${STORAGE_PREFIX}:removed`;
function read(): HistoryEntry[] {
  try {
    return normalizeHistory(
      JSON.parse(localStorage.getItem(KEY) || "[]") as unknown,
    );
  } catch {
    return [];
  }
}
function removed(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(HIDDEN) || "[]");
    return Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}
export function useHistory() {
  const [items, setItems] = useState<HistoryEntry[]>(read),
    [loading, setLoading] = useState(true),
    [storageWarning, setStorageWarning] = useState(false);
  const update = useCallback(
    (fn: (items: HistoryEntry[]) => HistoryEntry[]) =>
      setItems((previous) => {
        const next = fn(previous);
        try {
          localStorage.setItem(KEY, JSON.stringify(next));
        } catch {
          setStorageWarning(true);
        }
        return next;
      }),
    [],
  );
  useEffect(() => {
    const c = new AbortController();
    api
      .list(c.signal)
      .then((server) => {
        if (!c.signal.aborted)
          update((local) => {
            const hidden = new Set(removed()),
              merged = new Map(
                server
                  .filter((i) => !hidden.has(i.analysis_id))
                  .map((i) => [i.analysis_id, i]),
              );
            for (const item of local) merged.set(item.analysis_id, item); // Local titles preserve renames.
            return [...merged.values()];
          });
      })
      .catch(() => {
        /* Optional list endpoint; local history remains available. */
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    const onStorage = () => setItems(read());
    window.addEventListener("storage", onStorage);
    return () => {
      c.abort();
      window.removeEventListener("storage", onStorage);
    };
  }, [update]);
  const add = useCallback(
    (item: HistoryEntry) =>
      update((items) => [
        item,
        ...items.filter((i) => i.analysis_id !== item.analysis_id),
      ]),
    [update],
  );
  const rename = useCallback(
    (id: string, title: string) =>
      update((items) =>
        items.map((i) =>
          i.analysis_id === id ? { ...i, title: title.trim() || i.title } : i,
        ),
      ),
    [update],
  );
  const remove = useCallback(
    (id: string) => {
      try {
        localStorage.setItem(
          HIDDEN,
          JSON.stringify([...new Set([...removed(), id])]),
        );
      } catch {
        setStorageWarning(true);
      }
      update((items) => items.filter((i) => i.analysis_id !== id));
    },
    [update],
  );
  const setStatus = useCallback(
    (id: string, lastStatus: AnalysisState) =>
      update((items) =>
        items.map((i) =>
          i.analysis_id === id && i.lastStatus !== lastStatus
            ? { ...i, lastStatus }
            : i,
        ),
      ),
    [update],
  );
  return { items, loading, storageWarning, add, rename, remove, setStatus };
}
