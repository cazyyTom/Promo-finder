import type { HistoryEntry } from "../api/types";
export const BUCKETS = [
  "Today",
  "Yesterday",
  "Previous 7 days",
  "Last 30 days",
  "Older",
] as const;
export type Bucket = (typeof BUCKETS)[number];
function dayOrdinal(date: Date) {
  return (
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000
  );
}
export function dateBucket(date: string, now = new Date()): Bucket {
  const age = dayOrdinal(now) - dayOrdinal(new Date(date));
  return age <= 0
    ? "Today"
    : age === 1
      ? "Yesterday"
      : age <= 7
        ? "Previous 7 days"
        : age <= 30
          ? "Last 30 days"
          : "Older";
}
export function groupHistory(
  items: HistoryEntry[],
  query: string,
  now = new Date(),
) {
  const filtered = items
    .filter((i) => i.title.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return BUCKETS.map((label) => ({
    label,
    items: filtered.filter((i) => dateBucket(i.createdAt, now) === label),
  })).filter((g) => g.items.length);
}
