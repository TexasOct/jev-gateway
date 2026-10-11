import type { CanvasLayout } from "@/shared/api/types";
import type { RoutingDraft } from "./draft";
import { createStrategyHistory } from "./history";

type Snapshot = { draft: RoutingDraft; nodes: CanvasLayout["nodes"]; selected: string; selection: string[] };

/** Memory owned by the admitted connection, above the keyed strategy editor. */
export function createCanvasHistoryScope(owner = 0) {
  const histories = createStrategyHistory<Snapshot>((a, b) => JSON.stringify([a.draft, a.nodes]) === JSON.stringify([b.draft, b.nodes]));
  const cursors = new Map<string, { selected: string; selection: string[] }>();
  const generations = new Map<string, number>();
  const pendingSeeds = new Set<string>();
  return {
    owner,
    histories,
    hashes: new Map<string, string>(),
    cursors,
    generations,
    pendingSeeds,
    discard(strategy: string) {
      histories.remove(strategy); cursors.delete(strategy);
      generations.set(strategy, (generations.get(strategy) ?? 0) + 1);
      pendingSeeds.add(strategy);
    },
  };
}
export type CanvasHistoryScope = ReturnType<typeof createCanvasHistoryScope>;
