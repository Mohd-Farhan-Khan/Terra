/** Turns Supabase and browser failures into copy that is useful in-product. */
export function errorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const normalized = message.toLowerCase();

  if (
    normalized.includes("failed to fetch") ||
    normalized.includes("networkerror") ||
    normalized.includes("network request failed")
  ) {
    return "We couldn’t reach Terra. Check your connection and try again—nothing was saved.";
  }

  return message || fallback;
}
