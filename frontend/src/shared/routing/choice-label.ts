/** The matrix uses the first configured label when a choice omits its label. */
export function matrixChoiceLabel(value: unknown, first: string | undefined): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return first;
  const choice = value as Record<string, unknown>;
  const label = choice["label"] ?? choice["tier"];
  return typeof label === "string" ? label : first;
}
