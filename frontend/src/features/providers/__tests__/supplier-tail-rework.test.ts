import { describe, expect, it } from "vitest";
import { submittedCredentialDraft, transportActions } from "../suppliers/transportCredentials";

describe("submit-time native credentials", () => {
  it("blank native values override a stale replacement action for every managed field", () => {
    const keys = ["primary", "aws_access_key_id", "aws_secret_access_key", "aws_session_token", "vertex_credentials"];
    const actions = transportActions(Object.fromEntries(keys.map((key) => [key, submittedCredentialDraft("set", "")])));
    expect(Object.values(actions)).toEqual(keys.map(() => ({ action: "keep" })));
  });
  it("retains explicit clear and canonicalizes captured JSON without changing the raw snapshot", () => {
    const raw = '{\n "private_key": "synthetic\\nkey"\n}';
    const snapshot = submittedCredentialDraft("keep", raw);
    expect(transportActions({ vertex_credentials: snapshot })).toEqual({ vertex_credentials: { action: "set", value: '{"private_key":"synthetic\\nkey"}' } });
    expect(snapshot.value).toBe(raw);
    expect(submittedCredentialDraft("clear", "removed-value")).toEqual({ action: "clear", value: "" });
  });
});
