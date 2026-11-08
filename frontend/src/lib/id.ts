/** UI/mock identifiers only; never used as authentication credentials. */
export function uniqueId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function")
    return globalThis.crypto.randomUUID();
  const values = new Uint32Array(3);
  if (globalThis.crypto?.getRandomValues)
    globalThis.crypto.getRandomValues(values);
  else
    for (let i = 0; i < values.length; i++)
      values[i] = Math.floor(Math.random() * 0xffffffff);
  return `${Date.now().toString(36)}-${Array.from(values, (v) => v.toString(16)).join("-")}`;
}
