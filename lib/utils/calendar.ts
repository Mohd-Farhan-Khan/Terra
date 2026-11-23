export function dateString(date = new Date()): string {
  return [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
export function occurrencesInPeriod(
  due: string,
  frequency: "weekly" | "monthly" | "yearly",
  anchor: number,
  start: string,
  end: string,
) {
  if (due >= end || start >= end) return 0;
  // UTC arithmetic treats a stored calendar date as an integer day, including across DST.
  const first = new Date(due + "T00:00:00Z");
  if (frequency === "weekly") {
    const week = 7 * 86400000;
    const steps = (date: string) => Math.max(0, Math.ceil((Date.parse(date + "T00:00:00Z") - first.getTime()) / week));
    return steps(end) - steps(start);
  }
  const lower = new Date(start + "T00:00:00Z");
  const stride = frequency === "yearly" ? 12 : 1;
  const months = (lower.getUTCFullYear() - first.getUTCFullYear()) * 12 + lower.getUTCMonth() - first.getUTCMonth();
  let index = Math.max(0, Math.floor(months / stride));
  let count = 0;
  while (true) {
    const month = first.getUTCMonth() + index * stride;
    const last = new Date(Date.UTC(first.getUTCFullYear(), month + 1, 0));
    last.setUTCDate(Math.min(anchor, last.getUTCDate()));
    const date = index === 0 ? due : last.toISOString().slice(0, 10);
    if (date >= end) return count;
    if (date >= start) count++;
    index++;
  }
}

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
export function displayDate(date: string) {
  return dateFormatter.format(new Date(date + "T00:00:00Z"));
}
export function nextMonth(month: string) {
  const start = new Date(month + "T00:00:00Z");
  start.setUTCDate(1);
  start.setUTCMonth(start.getUTCMonth() + 1);
  return start.toISOString().slice(0, 10);
}
export function daysBetween(start: string, end: string) {
  return (Date.parse(end + "T00:00:00Z") - Date.parse(start + "T00:00:00Z")) / 86400000;
}
export function addDays(day: string, count: number) {
  const date = new Date(day + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}
