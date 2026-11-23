// Resolve once against a fixed origin so only application-local navigation survives.
export function returnPath(value: string | null): string {
  const origin = "https://terra.invalid";
  if (!value?.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f]/.test(value)) return "/dashboard";
  try {
    const url = new URL(value, origin);
    return url.origin === origin && !url.pathname.startsWith("//") && !["/login", "/login/"].includes(url.pathname)
      ? url.pathname + url.search + url.hash
      : "/dashboard";
  } catch {
    return "/dashboard";
  }
}
