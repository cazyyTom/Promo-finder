export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function downloadJson(value: unknown, filename: string) {
  downloadBlob(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
    filename,
  );
}
export function csvCell(value: string | number): string {
  let text = String(value);
  if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
