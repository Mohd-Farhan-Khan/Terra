export function errorMessage(error: unknown, fallback: string) {
  const message =
    typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error && typeof error.message === "string"
        ? error.message
        : "";
  if (/fetch|network|connection|load failed|timeout/i.test(message))
    return "Terra could not confirm the result. Check your connection and retry.";
  return message || fallback;
}
