import { asString } from "../_shared/http.ts";

export const INPUT_LIMITS = {
  title: 120,
  content: 5_000,
  comment: 2_000,
  issueResult: 2_000,
  rejectionReason: 500,
  search: 120,
} as const;

export function requiredText(value: unknown, field: string, maxLength: number) {
  const text = asString(value);
  if (!text) throw new Error(`${field}-required`);
  if (text.length > maxLength) throw new Error(`${field}-too-long`);
  return text;
}

export function optionalText(value: unknown, field: string, maxLength: number) {
  const text = asString(value);
  if (text.length > maxLength) throw new Error(`${field}-too-long`);
  return text;
}
