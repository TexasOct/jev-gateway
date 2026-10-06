import { describe, expect, it, vi } from "vitest";
import { hasUnsavedChanges, registerUnsavedChanges } from "./unsaved-changes";
import type { NavigationGuardRef } from "./unsaved-changes";

describe("combined configuration navigation", () => {
  it("keeps every draft when leaving is rejected, then discards them together", () => {
    const ref: NavigationGuardRef = { current: null };
    const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    const first = vi.fn();
    const second = vi.fn();
    const removeFirst = registerUnsavedChanges(ref, {}, { isDirty: () => true, discard: first, message: "Discard edits?" }, confirm);
    const removeSecond = registerUnsavedChanges(ref, {}, { isDirty: () => true, discard: second, message: "Discard edits?" }, confirm);
    expect(hasUnsavedChanges(ref)).toBe(true);
    expect(ref.current?.()).toBe(false);
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
    expect(ref.current?.()).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    removeFirst();
    expect(hasUnsavedChanges(ref)).toBe(true);
    removeSecond();
    expect(hasUnsavedChanges(ref)).toBe(false);
    expect(ref.current).toBe(null);
  });

  it("does not warn on clean forms or remove a newer registration", () => {
    const ref: NavigationGuardRef = { current: null };
    const owner = {};
    const confirm = vi.fn();
    const oldCleanup = registerUnsavedChanges(ref, owner, { isDirty: () => true, discard: vi.fn(), message: "Discard?" }, confirm);
    const cleanup = registerUnsavedChanges(ref, owner, { isDirty: () => false, discard: vi.fn(), message: "Discard?" }, confirm);
    oldCleanup();
    expect(ref.current?.()).toBe(true);
    expect(hasUnsavedChanges(ref)).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
    cleanup();
    expect(ref.current).toBe(null);
  });

  it("keeps all drafts while another form is saving, then permits one discard decision", () => {
    const ref: NavigationGuardRef = { current: null };
    const confirm = vi.fn().mockReturnValue(true);
    const discard = vi.fn();
    let pending = true;
    const removeDraft = registerUnsavedChanges(ref, {}, { isDirty: () => true, discard, message: "Discard edits?" }, confirm);
    const removeSave = registerUnsavedChanges(ref, {}, { isDirty: () => false, isBlocked: () => pending, discard: vi.fn(), message: "Discard edits?" }, confirm);
    expect(ref.current?.()).toBe(false);
    expect(discard).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    pending = false;
    expect(ref.current?.()).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(discard).toHaveBeenCalledTimes(1);
    removeDraft();
    removeSave();
  });

  it("removes the combined callback when forms unmount in reverse order", () => {
    const ref: NavigationGuardRef = { current: null };
    const entry = { isDirty: () => false, discard: vi.fn(), message: "Discard?" };
    const firstCleanup = registerUnsavedChanges(ref, {}, entry);
    const secondCleanup = registerUnsavedChanges(ref, {}, entry);
    secondCleanup();
    firstCleanup();
    expect(ref.current).toBe(null);
  });
});
