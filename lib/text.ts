/**
 * Normalize whitespace and truncate text to a maximum length.
 *
 * Returns `null` when the input is empty/blank.  When truncation is needed the
 * returned string ends with an ellipsis character ("…") and the total length
 * (including the ellipsis) will not exceed `maxLength`.
 */
export function summarizeText(
  value: string | null | undefined,
  maxLength: number,
): string | null {
  if (!value) return null
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) return null
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`
}
