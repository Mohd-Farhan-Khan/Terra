// Scope retry tokens to the signed-in user and exact payload in this tab.
export async function sendEntryOnce<T>(
  userId: string,
  entry: object,
  storage: Storage,
  send: (requestId: string) => Promise<T>,
) {
  const bytes = new TextEncoder().encode(JSON.stringify(entry));
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const key = "terra:pending-entry:" + userId + ":" + hash;
  const requestId = storage.getItem(key) ?? crypto.randomUUID();
  storage.setItem(key, requestId);
  const result = await send(requestId);
  storage.removeItem(key);
  return result;
}
