import { v } from "convex/values";

export const roleValidator = v.union(
  v.literal("admin"),
  v.literal("member"),
);

export const areaKeyValidator = v.union(
  v.literal("dev"),
  v.literal("marketing"),
  v.literal("sales"),
  v.literal("other"),
);

export const pageKindValidator = v.union(
  v.literal("note"),
  v.literal("task"),
);

export const taskStatusValidator = v.union(
  v.literal("backlog"),
  v.literal("next"),
  v.literal("in_progress"),
  v.literal("blocked"),
  v.literal("done"),
);

export const taskPriorityValidator = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
  v.literal("urgent"),
);

export const AREA_DEFINITIONS = [
  { key: "dev", label: "Dev notes", position: 0 },
  { key: "marketing", label: "Marketing notes", position: 1 },
  { key: "sales", label: "Sales notes", position: 2 },
  { key: "other", label: "Other notes", position: 3 },
] as const;

export function boundedLimit(value: number | undefined, fallback: number, max: number) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`Limit mora biti ceo broj između 1 i ${max}.`);
  }
  return value;
}

export function cleanRequiredText(value: string, label: string, maxLength: number) {
  const cleaned = value.trim();
  if (cleaned.length === 0) throw new Error(`${label} je obavezno polje.`);
  if (cleaned.length > maxLength) {
    throw new Error(`${label} može imati najviše ${maxLength} znakova.`);
  }
  return cleaned;
}

export function cleanOptionalText(
  value: string | undefined,
  label: string,
  maxLength: number,
) {
  if (value === undefined) return undefined;
  const cleaned = value.trim();
  if (cleaned.length > maxLength) {
    throw new Error(`${label} može imati najviše ${maxLength} znakova.`);
  }
  return cleaned;
}

export function normalizeEmail(email: string) {
  const normalized = email.trim().toLocaleLowerCase("en-US");
  if (
    normalized.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
  ) {
    throw new Error("Unesite ispravnu email adresu.");
  }
  return normalized;
}
