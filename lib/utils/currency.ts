const precise = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const whole = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
export const numberValue = (value: number | string | null | undefined) => Number(value ?? 0);
export const formatInr = (value: number | string | null | undefined) => precise.format(numberValue(value));
export const formatWholeInr = (value: number | string | null | undefined) => whole.format(numberValue(value));

export function paise(value: string) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(amount) && amount > 0 && amount <= 99999999999999 ? amount : null;
}
