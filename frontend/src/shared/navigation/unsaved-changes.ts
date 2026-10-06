/** Combine dirty form guards without discarding one draft before another rejects leaving. */

export type NavigationGuardRef = { current: (() => boolean) | null };
type UnsavedChange = { isDirty: () => boolean; isBlocked?: () => boolean; discard: () => void; message: string };
type Registry = { entries: Map<object, UnsavedChange>; canLeave: () => boolean };

const registrations = new WeakMap<NavigationGuardRef, Registry>();

export function hasUnsavedChanges(ref: NavigationGuardRef): boolean {
  return [...(registrations.get(ref)?.entries.values() ?? [])].some((entry) => entry.isDirty());
}

export function registerUnsavedChanges(
  ref: NavigationGuardRef,
  owner: object,
  entry: UnsavedChange,
  confirm: (message: string) => boolean = (message) => window.confirm(message),
): () => void {
  let registry = registrations.get(ref);
  if (!registry) {
    const entries = new Map<object, UnsavedChange>();
    registry = {
      entries,
      canLeave: () => {
        const active = [...entries.values()];
        if (active.some((item) => item.isBlocked?.())) return false;
        const dirty = active.filter((item) => item.isDirty());
        const first = dirty[0];
        if (!first) return true;
        if (!confirm(first.message)) return false;
        for (const item of dirty) item.discard();
        return true;
      },
    };
    registrations.set(ref, registry);
  }
  const { entries, canLeave } = registry;
  entries.set(owner, entry);
  ref.current = canLeave;
  return () => {
    if (entries.get(owner) !== entry) return;
    entries.delete(owner);
    if (entries.size === 0) {
      registrations.delete(ref);
      if (ref.current === canLeave) ref.current = null;
    }
  };
}
