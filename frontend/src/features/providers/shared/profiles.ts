import type { ProviderKind, ProviderProfile } from "@/shared/api/types";
import { profileIconAliases } from "./icons";

export function profileForWrite(profile: ProviderProfile, kind: ProviderKind): ProviderProfile {
  return {
    id: profile.id.trim(), api_base: profile.api_base?.trim() || null, api_key_env: profile.api_key_env?.trim() || null,
    display_name: profile.display_name?.trim() || null, brand_id: profile.brand_id?.trim() || null, icon_id: profile.icon_id?.trim() || null,
    ...(kind === "llm" ? { type: profile.type, allow_private_network: profile.allow_private_network === true } : { protocol: profile.protocol, model: profile.model?.trim() || null }),
  };
}

export function searchProfiles<T extends ProviderProfile & { aliases?: string[] }>(profiles: T[], search: string): T[] {
  const query = search.trim().toLocaleLowerCase();
  return profiles.filter((profile) => [profile.id, profile.display_name, profile.brand_id, profile.type, profile.protocol, ...(profile.aliases ?? []), ...profileIconAliases(profile)].some((value) => value?.toLocaleLowerCase().includes(query)));
}

export function newPresetInstanceID(id: string, profiles: ProviderProfile[]): string {
  const used = new Set(profiles.map((profile) => profile.id));
  if (!used.has(id)) return id;
  let suffix = 2;
  while (used.has(`${id}-${suffix}`)) ++suffix;
  return `${id}-${suffix}`;
}
