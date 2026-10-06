import type { CredentialChange, ProviderPreset } from "@/shared/api/types";

export type TransportDraft = { action: "keep" | "set" | "clear"; value: string };
/** Values at submission determine replacement; only an explicit clear removes a key. */
export function submittedCredentialDraft(action: string | undefined, value: string): TransportDraft {
  return { action: action === "clear" ? "clear" : value ? "set" : "keep", value: action === "clear" ? "" : value };
}
export const supportedTransportParameters: Record<string, readonly string[]> = {
  vertex_ai: ["vertex_credentials"],
  bedrock: ["aws_access_key_id", "aws_secret_access_key", "aws_session_token"],
};
export function transportFields(preset: ProviderPreset | null) {
  return (preset?.setup_fields ?? []).filter((field) => field.target === "param_env" && supportedTransportParameters[preset?.type ?? ""]?.includes(field.key));
}
/** Canonicalize only the JSON credential, retaining the original text in the editor. */
export function transportValue(parameter: string, value: string): string {
  if (parameter !== "vertex_credentials") return value;
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid credential");
  return JSON.stringify(parsed);
}
export function validTransportValue(parameter: string, value: string) {
  try {
    const canonical = transportValue(parameter, value);
    return !!canonical.trim() && !["\r", "\n", "\0"].some((character) => canonical.includes(character)) && new TextEncoder().encode(canonical).length <= 8192;
  } catch { return false; }
}
export function transportActions(drafts: Record<string, TransportDraft>): Record<string, CredentialChange> {
  return Object.fromEntries(Object.entries(drafts).map(([key, draft]) => [key,
    draft.action === "set" && draft.value ? { action: "set", value: transportValue(key, draft.value) } : { action: draft.action === "clear" ? "clear" : "keep" },
  ]));
}
