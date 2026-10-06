import type { JsonValue, ProviderPreset } from "@/shared/api/types";

export function initialSetupValues(preset?: ProviderPreset): Record<string, string> {
  return Object.fromEntries((preset?.setup_fields ?? []).map((field) => {
    const value = preset?.[field.target]?.[field.key];
    return [field.key, value == null ? "" : String(value)];
  }));
}

export function missingSetupFields(preset: ProviderPreset | null, values: Record<string, string>): boolean {
  return (preset?.setup_fields ?? []).some((field) => field.required && !values[field.key]?.trim());
}

export function setupForWrite(preset: ProviderPreset | null, values: Record<string, string>): { params?: Record<string, JsonValue>; param_env?: Record<string, string> } {
  if (!preset) return {};
  const params = { ...preset.params };
  const param_env = { ...preset.param_env };
  for (const field of preset.setup_fields ?? []) {
    const value = values[field.key]?.trim();
    const target = field.target === "params" ? params : param_env;
    if (value) target[field.key] = value;
    else delete target[field.key];
  }
  return {
    ...(Object.keys(params).length ? { params } : {}),
    ...(Object.keys(param_env).length ? { param_env } : {}),
  };
}
