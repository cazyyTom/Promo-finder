export function csToTimestamp(cs: number): string {
  if (!Number.isSafeInteger(cs) || cs < 0)
    throw new Error("Time must be non-negative integer centiseconds");
  return `${String(Math.floor(cs / 6000)).padStart(2, "0")}:${String(Math.floor((cs % 6000) / 100)).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
}
export function timestampToCs(value: string): number {
  const match = /^(\d{2,}):([0-5]\d)\.(\d{2})$/.exec(value);
  if (!match) throw new Error("Use mm:ss.cc");
  const valueCs =
    Number(match[1]) * 6000 + Number(match[2]) * 100 + Number(match[3]);
  if (!Number.isSafeInteger(valueCs)) throw new Error("Timestamp too large");
  return valueCs;
}
export const duration = (seconds: number) => `${Number(seconds.toFixed(2))} s`;
export const fileSize = (bytes: number) =>
  bytes >= 1024 ** 2
    ? `${(bytes / 1024 ** 2).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
