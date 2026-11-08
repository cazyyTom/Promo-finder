import type { Promo, Segment } from "../api/types";
export const segmentText = (s: Segment) =>
  `Ep ${s.episode} · ${s.start} -> ${s.end}`;
export const timestampsText = (p: Promo) =>
  p.segments.map(segmentText).join("\n");
export const promosText = (promos: Promo[]) =>
  promos
    .map(
      (p) =>
        `#${p.rank} · ${p.total_seconds} s · ${p.scores.weighted}/5\n${timestampsText(p)}\nHook: ${p.hook.description}\nCliffhanger: ${p.cliffhanger.open_question}`,
    )
    .join("\n\n");
export async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const previous = document.activeElement;
  const input = document.createElement("textarea");
  input.value = text;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.append(input);
  input.select();
  const ok = document.execCommand("copy");
  input.remove();
  if (previous instanceof HTMLElement) previous.focus();
  if (!ok)
    throw new Error(
      "Clipboard access was blocked. Select and copy the timestamps manually.",
    );
}
