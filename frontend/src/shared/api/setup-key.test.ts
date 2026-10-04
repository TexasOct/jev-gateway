import { expect, it } from "vitest";

import { isValidSetupKey } from "./setup-key";

it.each([
  ["a".repeat(16), true],
  ["a".repeat(8192), true],
  ["fixture interior space", false],
  ["fixture-symbols-!~", true],
  ["a".repeat(15), false],
  ["a".repeat(8193), false],
  [" fixture-management-key", false],
  ["fixture-management-key ", false],
  ["fixture-management-密钥", false],
  ["fixture-management-\tkey", false],
  ["fixture-management-\nkey", false],
  ["fixture-management-\rkey", false],
  ["fixture-management-\x00key", false],
  ["fixture-management-\x7fkey", false],
  ["fixture-management-\u00a0key", false],
] as const)("validates a transport-safe setup key (case %#)", (key, valid) => {
  expect(isValidSetupKey(key)).toBe(valid);
});
