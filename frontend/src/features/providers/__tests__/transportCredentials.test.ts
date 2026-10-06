import { describe, expect, it } from "vitest";
import { newSupplierIdentity, transportReference } from "../suppliers/supplierIdentity";
import { transportActions, transportValue, validTransportValue } from "../suppliers/transportCredentials";

describe("cloud credentials", () => {
  it("canonicalizes pasted JSON for the one-line credential store, including escaped private-key newlines", () => {
    const text = '{\n  "type": "service_account",\n  "private_key": "synthetic\\nmasked"\n}';
    expect(transportValue("vertex_credentials", text)).toBe('{"type":"service_account","private_key":"synthetic\\nmasked"}');
    expect(validTransportValue("vertex_credentials", text)).toBe(true);
    expect(transportValue("aws_secret_access_key", "synthetic-key")).toBe("synthetic-key");
  });
  it("rejects malformed JSON, scalar JSON, NUL, multiline opaque credentials, and oversized UTF-8", () => {
    for (const value of ["{", "[]", "null", '"string"', `{"a":"${"界".repeat(3000)}"}`]) expect(validTransportValue("vertex_credentials", value)).toBe(false);
    for (const value of ["", "a\nb", "a\rb", "a\0b", "界".repeat(3000)]) expect(validTransportValue("aws_session_token", value)).toBe(false);
  });
  it("keeps blank replacements, preserves explicit clear, and submits only canonical direct values", () => {
    expect(transportActions({ aws_access_key_id: { action: "set", value: "" }, aws_secret_access_key: { action: "clear", value: "" }, vertex_credentials: { action: "set", value: '{\n"a":1\n}' } })).toEqual({ aws_access_key_id: { action: "keep" }, aws_secret_access_key: { action: "clear" }, vertex_credentials: { action: "set", value: '{"a":1}' } });
  });
  it("allocates refs against gateway, decision, other suppliers and drafts without sharing same-brand values", () => {
    const profiles = [{ id: "bedrock", api_key_env: "X", param_env: { aws_access_key_id: "JEV_BEDROCK_2_AWS_ACCESS_KEY_ID" } }];
    const identity = newSupplierIdentity("bedrock", profiles);
    const reserved = ["JEV_BEDROCK_2_AWS_ACCESS_KEY_ID", "JEV_BEDROCK_2_AWS_ACCESS_KEY_ID_2", "JEV_BEDROCK_2_AWS_ACCESS_KEY_ID_3"];
    expect(transportReference(identity.id, "aws_access_key_id", reserved)).toBe("JEV_BEDROCK_2_AWS_ACCESS_KEY_ID_4");
    expect(transportReference("bedrock-3", "aws_access_key_id", reserved)).not.toBe(transportReference(identity.id, "aws_access_key_id", reserved));
    expect(transportReference("123-proxy", "aws_session_token", [])).toMatch(/^[A-Z_][A-Z0-9_]*$/);
    expect(transportReference("cloud".repeat(100), "aws_session_token", []).length).toBeLessThanOrEqual(256);
  });
});
