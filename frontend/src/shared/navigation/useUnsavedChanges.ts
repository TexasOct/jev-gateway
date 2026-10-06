import { useLayoutEffect, useRef } from "react";
import { registerUnsavedChanges } from "./unsaved-changes";
import type { NavigationGuardRef } from "./unsaved-changes";

export function useUnsavedChanges(ref: NavigationGuardRef, dirty: boolean, discard: () => void, message: string, blocked = false) {
  const owner = useRef({});
  useLayoutEffect(() => registerUnsavedChanges(ref, owner.current, {
    isDirty: () => dirty,
    isBlocked: () => blocked,
    discard,
    message,
  }), [ref, dirty, discard, message, blocked]);
}
