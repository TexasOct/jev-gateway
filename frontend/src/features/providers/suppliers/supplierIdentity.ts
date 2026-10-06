import type { ProviderProfile } from "@/shared/api/types";

export function transportReference(id: string, parameter: string, reserved: Iterable<string>) {
  const stem = `JEV_${id}_${parameter}`.toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 240);
  const taken = new Set(reserved);
  let reference = stem;
  for (let suffix = 2; taken.has(reference); suffix++) reference = `${stem}_${suffix}`;
  return reference;
}

/** Choose identities once when opening a new connection, never from its display name. */
export function newSupplierIdentity(base: string, profiles: Pick<ProviderProfile, "id" | "api_key_env" | "param_env">[], gatewayReference?: string | null) {
  const stem = base.toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/^-+|-+$/g, "") || "supplier";
  const ids = new Set(profiles.map((profile) => profile.id));
  let id = stem;
  for (let suffix = 2; ids.has(id); suffix++) id = `${stem}-${suffix}`;
  const references = new Set([
    gatewayReference,
    ...profiles.flatMap((profile) => [profile.api_key_env, ...Object.values(profile.param_env ?? {})]),
  ]);
  // Protected orphan values are intentionally absent from the public configuration.
  // A fresh reference therefore cannot be allocated from visible bindings alone.
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
  const referenceStem = `JEV_${id.toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 180)}_${nonce}_API_KEY`;
  let api_key_env = referenceStem;
  for (let suffix = 2; references.has(api_key_env); suffix++) api_key_env = `${referenceStem}_${suffix}`;
  return { id, api_key_env };
}
