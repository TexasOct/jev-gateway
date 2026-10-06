import { describe, expect, it } from "vitest";
import { sameParameterReferences } from "../suppliers/setupProjection";

describe("complete parameter reference comparison", () => {
  it("ignores insertion order for retained cloud and unrelated references", () => {
    expect(sameParameterReferences({ vertex_credentials: "VERTEX", extra_header: "HEADER" }, { extra_header: "HEADER", vertex_credentials: "VERTEX" })).toBe(true);
  });
  it("recognizes a reference restored to its original value", () => {
    const original = { extra_header: "HEADER" };
    const current = { ...original, extra_header: "OTHER" };
    current.extra_header = original.extra_header;
    expect(sameParameterReferences(current, original)).toBe(true);
  });
  it("distinguishes missing or cleared optional declarations", () => {
    expect(sameParameterReferences({}, { aws_session_token: "TOKEN" })).toBe(false);
    expect(sameParameterReferences({ aws_session_token: "" }, { aws_session_token: "TOKEN" })).toBe(false);
  });
  it("detects cloud authentication detachment while retaining unrelated references", () => {
    expect(sameParameterReferences({ extra_header: "HEADER" }, { extra_header: "HEADER", vertex_credentials: "VERTEX" })).toBe(false);
  });
  it("detects generated direct transport declarations", () => {
    expect(sameParameterReferences({ aws_access_key_id: "ID", aws_secret_access_key: "SECRET" }, {})).toBe(false);
  });
});
