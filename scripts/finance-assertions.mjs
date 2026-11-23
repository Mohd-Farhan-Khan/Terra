export function assertClose(actual, expected, label) {
  if (
    (typeof actual !== "number" && typeof actual !== "string") ||
    String(actual).trim() === "" ||
    !Number.isFinite(Number(actual)) ||
    Math.abs(Number(actual) - expected) > 0.000001
  ) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`);
  }
}
