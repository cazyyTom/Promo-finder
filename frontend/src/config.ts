export const APP_NAME = "Promo Finder";
export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000"
).replace(/\/$/, "");
const uploadLimit = Number(import.meta.env.VITE_MAX_UPLOAD_MB || 25);
export const MAX_UPLOAD_MB =
  Number.isFinite(uploadLimit) && uploadLimit > 0 ? uploadLimit : 25;
export const USE_MOCK = import.meta.env.VITE_USE_MOCK === "1";
export const POLL_INTERVAL = 1500;
export const STORAGE_PREFIX = `promo-finder:${USE_MOCK ? "mock" : API_BASE_URL}`;
