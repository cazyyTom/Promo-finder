import { API_BASE_URL, MAX_UPLOAD_MB, USE_MOCK } from "../config";
import type { Api } from "./types";
import {
  errorMessage,
  normalizeChat,
  normalizeHealth,
  normalizeHistory,
  normalizeResults,
  normalizeStatus,
  record,
} from "./normalize";
import { mockApi } from "./mock";
import { ApiError } from "./errors";
export { ApiError } from "./errors";
export function validateUpload(file: File): string | null {
  if (!file.name.toLowerCase().endsWith(".zip"))
    return "Please choose a .zip file containing your episode scripts.";
  if (file.size === 0)
    return "This ZIP is empty. Choose a ZIP containing episode scripts.";
  if (file.size > MAX_UPLOAD_MB * 1024 ** 2)
    return `This ZIP is too large. The upload limit is ${MAX_UPLOAD_MB} MB.`;
  return null;
}
async function request(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  // A deadline complements caller cancellation; no poll or upload can hang forever.
  const controller = new AbortController();
  const cancel = () => controller.abort();
  init.signal?.addEventListener("abort", cancel, { once: true });
  if (init.signal?.aborted) controller.abort();
  const timer = setTimeout(cancel, 120000);
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
    });
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      const code = record(body).code;
      throw new ApiError(
        errorMessage(
          body,
          `Request failed (${response.status}). Please try again.`,
        ),
        response.status,
        typeof code === "string" ? code : "http_error",
      );
    }
    return response;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (init.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    throw new ApiError(
      controller.signal.aborted
        ? "The request timed out. Please try again."
        : "Could not connect to the server. Check your connection and try again.",
    );
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener("abort", cancel);
  }
}
const path = (id: string) => `/analyses/${encodeURIComponent(id)}`;
export const realApi: Api = {
  health: async (signal) =>
    normalizeHealth(await (await request("/health", { signal })).json()),
  upload: async (file, signal) => {
    const error = validateUpload(file);
    if (error) throw new ApiError(error, 400, "invalid_upload");
    const form = new FormData();
    form.append("file", file);
    const body = record(
      await (
        await request("/analyses", { method: "POST", body: form, signal })
      ).json(),
    );
    if (typeof body.analysis_id !== "string" || !body.analysis_id)
      throw new ApiError("The server returned no analysis ID.", 502);
    return body.analysis_id;
  },
  status: async (id, signal) =>
    normalizeStatus(await (await request(path(id), { signal })).json()),
  results: async (id, signal) =>
    normalizeResults(
      await (await request(`${path(id)}/results`, { signal })).json(),
    ),
  csv: async (id, signal) =>
    (await request(`${path(id)}/results?format=csv`, { signal })).blob(),
  chat: async (id, question, signal) =>
    normalizeChat(
      await (
        await request(`${path(id)}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question }),
          signal,
        })
      ).json(),
    ),
  list: async (signal) => {
    try {
      return normalizeHistory(
        await (await request("/analyses", { signal })).json(),
      );
    } catch (error) {
      if (error instanceof ApiError && [404, 405, 501].includes(error.status))
        return [];
      throw error;
    }
  },
};
export const api: Api = USE_MOCK ? mockApi : realApi;
export const messageOf = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
