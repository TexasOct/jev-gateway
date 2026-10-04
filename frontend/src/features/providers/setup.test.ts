import { describe, expect, it } from "vitest";
import type { ProviderPreset } from "@/shared/api/types";
import { initialSetupValues, missingSetupFields, setupForWrite } from "./setup";

const preset: ProviderPreset = {
  kind: "llm", id: "vertex_ai", display_name: "Vertex AI", type: "vertex_ai", api_base: null,
  params: { vertex_location: "us-central1" },
  setup_fields: [
    { key: "vertex_project", target: "params", label: "Project", label_zh: "项目", required: true },
    { key: "vertex_location", target: "params", label: "Region", label_zh: "区域", required: true },
    { key: "vertex_credentials", target: "param_env", label: "Credential reference", label_zh: "凭证引用", required: false },
  ],
};

describe("new provider template setup", () => {
  it("requires account configuration without inventing credentials", () => {
    const values = initialSetupValues(preset);
    expect(values).toEqual({ vertex_project: "", vertex_location: "us-central1", vertex_credentials: "" });
    expect(missingSetupFields(preset, values)).toBe(true);
    values.vertex_project = " project-id ";
    expect(missingSetupFields(preset, values)).toBe(false);
    expect(setupForWrite(preset, values)).toEqual({ params: { vertex_project: "project-id", vertex_location: "us-central1" } });
  });
  it("projects only explicit environment references and omits blank optional fields", () => {
    const values = { ...initialSetupValues(preset), vertex_project: "project", vertex_credentials: " PROJECT_CREDENTIALS " };
    expect(setupForWrite(preset, values).param_env).toEqual({ vertex_credentials: "PROJECT_CREDENTIALS" });
    values.vertex_credentials = "";
    expect(setupForWrite(preset, values)).not.toHaveProperty("param_env");
  });
  it("omits parameter projections on ordinary existing-provider edits", () => {
    expect(setupForWrite(null, { timeout: "[configured]" })).toEqual({});
    expect(missingSetupFields(null, {})).toBe(false);
    expect(initialSetupValues()).toEqual({});
  });
});
