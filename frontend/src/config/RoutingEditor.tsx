/**
 * Visual routing editor: rule order and label membership.
 *
 * Two drag surfaces exist. Rule rows reorder because the first matching rule
 * wins. Model chips move between label columns, which adds or removes that
 * label's tag on the model. Dragging a chip onto a label adds that tag; dragging
 * it back to the unassigned pool removes the tag it came from. A model may serve
 * several labels, which is what the current catalog does, so adding a second
 * label keeps the first and the chip shows every tag it carries.
 *
 * Label order is not draggable: label scores must increase and the first label
 * must score 0. Pool rank inside a label comes from the selection mode with
 * priority as a tiebreak, so priority is a number field and the resulting order
 * is displayed read-only with its reason.
 */

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useCallback, useMemo, useState } from "react";

import { api } from "../api";
import type { ConfigurationPayload, LabelRow } from "../api";
import {
  diffSummary,
  draftFromConfiguration,
  labelMembers,
  moveRule,
  setLabelMembership,
  setPriority,
  setRuleChoice,
  toOverlayPayload,
  unassignedModels,
} from "./draft";
import type { ModelDraft, RoutingDraft } from "./draft";

interface EditorProps {
  config: ConfigurationPayload;
  onReloaded: () => Promise<void>;
  onError: (message: string) => void;
}

const POOL_ID = "pool";

function ruleId(index: number): string {
  return `rule-${index}`;
}

function chipId(modelId: string, source: string): string {
  return `chip::${modelId}::${source}`;
}

function parseChip(id: string): { modelId: string; source: string } | null {
  const parts = id.split("::");
  if (parts.length !== 3 || parts[1] === undefined || parts[2] === undefined) return null;
  return { modelId: parts[1], source: parts[2] };
}

function zoneId(tag: string): string {
  return `zone::${tag}`;
}

function parseZone(id: string): string | null {
  const parts = id.split("::");
  return parts.length === 2 && parts[1] !== undefined ? parts[1] : null;
}

/** Tags that belong to other strategies stay untouched and read-only. */
function foreignTags(model: ModelDraft, config: ConfigurationPayload): string[] {
  const own = new Set(config.labels.map((label) => label.tag));
  return model.tags.filter((tag) => !own.has(tag));
}

function describeRule(rule: RoutingDraft["rules"][number]): string {
  const conditions = Object.entries(rule.when)
    .map(([key, value]) => `${key} = ${Array.isArray(value) ? value.join(" or ") : String(value)}`)
    .join(", and ");
  return `${conditions} → ${rule.select.label ?? "no label"}`;
}

function RuleRow({
  index,
  total,
  rule,
  labels,
  selections,
  onChoice,
  onMove,
}: {
  index: number;
  total: number;
  rule: RoutingDraft["rules"][number];
  labels: LabelRow[];
  selections: string[];
  onChoice: (patch: { label?: string; selection?: string }) => void;
  onMove: (to: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: ruleId(index),
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <li ref={setNodeRef} style={style} className="rule-row">
      <button
        type="button"
        className="handle"
        aria-label={`Reorder rule ${index + 1} of ${total}`}
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
      <span className="rule-index">{index + 1}</span>
      <span className="rule-condition">{describeRule(rule)}</span>
      <label>
        Label
        <select
          value={rule.select.label ?? ""}
          onChange={(event) => onChoice({ label: event.target.value })}
        >
          {labels.map((label) => (
            <option key={label.name} value={label.name}>
              {label.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Selection
        <select
          value={rule.select.selection ?? ""}
          onChange={(event) => onChoice({ selection: event.target.value })}
        >
          <option value="">default</option>
          {selections.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <span className="move-buttons">
        <button
          type="button"
          disabled={index === 0}
          onClick={() => onMove(index - 1)}
          aria-label={`Move rule ${index + 1} earlier`}
        >
          ↑
        </button>
        <button
          type="button"
          disabled={index === total - 1}
          onClick={() => onMove(index + 1)}
          aria-label={`Move rule ${index + 1} later`}
        >
          ↓
        </button>
      </span>
    </li>
  );
}

function ModelChip({
  model,
  source,
  config,
  onPriority,
  onMembership,
}: {
  model: ModelDraft;
  source: string;
  config: ConfigurationPayload;
  onPriority: (priority: number) => void;
  onMembership: (tag: string, member: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: chipId(model.id, source),
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 3 }
    : undefined;
  const foreign = foreignTags(model, config);
  return (
    <div ref={setNodeRef} style={style} className={`chip${isDragging ? " dragging" : ""}`}>
      <button
        type="button"
        className="chip-handle"
        aria-label={`Move ${model.id}`}
        {...listeners}
        {...attributes}
      >
        {model.id}
      </button>
      <label>
        Add to label
        <select
          value=""
          aria-label={`Add ${model.id} to label`}
          onChange={(event) => onMembership(event.target.value, true)}
        >
          <option value="">Choose label</option>
          {config.labels.filter((label) => !model.tags.includes(label.tag)).map((label) => (
            <option key={label.tag} value={label.tag}>{label.name}</option>
          ))}
        </select>
      </label>
      {source === POOL_ID ? null : (
        <button type="button" onClick={() => onMembership(source, false)}
          aria-label={`Remove ${model.id} from ${source}`}>
          Remove
        </button>
      )}
      {foreign.length === 0 ? null : (
        <span className="meta chip-tags" title="Tags owned by other strategies">
          {foreign.join(" ")}
        </span>
      )}
      <label className="chip-priority">
        priority
        <input
          type="number"
          value={model.priority}
          aria-label={`Priority for ${model.id}`}
          onChange={(event) => {
            const parsed = Number.parseInt(event.target.value, 10);
            if (Number.isFinite(parsed)) onPriority(parsed);
          }}
        />
      </label>
    </div>
  );
}

function DropZone({
  id,
  title,
  subtitle,
  children,
}: {
  id: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`zone${isOver ? " over" : ""}`}>
      <h4>{title}</h4>
      {subtitle === undefined ? null : <div className="meta">{subtitle}</div>}
      {children}
    </div>
  );
}

export default function RoutingEditor({ config, onReloaded, onError }: EditorProps) {
  const [draft, setDraft] = useState<RoutingDraft>(() => draftFromConfiguration(config));
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [serverWarnings, setServerWarnings] = useState<string[]>([]);

  const selections = useMemo(() => {
    const found = new Set<string>();
    for (const rule of config.rules) {
      if (rule.select.selection !== undefined) found.add(rule.select.selection);
    }
    for (const name of ["cheapest_adequate", "quality_first", "balanced"]) found.add(name);
    return [...found].sort();
  }, [config.rules]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const diff = diffSummary(draft, config);
  const writeDisabled = !config.write_available;

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const activeId = String(event.active.id);
      const overId = event.over === null ? null : String(event.over.id);
      if (overId === null) return;

      if (activeId.startsWith("rule-")) {
        const from = Number.parseInt(activeId.slice("rule-".length), 10);
        const to = Number.parseInt(overId.slice("rule-".length), 10);
        if (Number.isFinite(from) && Number.isFinite(to)) {
          setDraft((current) => moveRule(current, from, to));
        }
        return;
      }

      const chip = parseChip(activeId);
      const tag = parseZone(overId);
      if (chip === null || tag === null) return;
      setDraft((current) => {
        if (tag === POOL_ID) {
          // Back to the pool: drop the tag this chip was dragged out of.
          return chip.source === POOL_ID
            ? current
            : setLabelMembership(current, chip.modelId, chip.source, false);
        }
        return setLabelMembership(current, chip.modelId, tag, true);
      });
    },
    [],
  );

  const save = useCallback(() => {
    setBusy(true);
    setServerWarnings([]);
    void (async () => {
      try {
        const response = await api.applyConfiguration(toOverlayPayload(draft, config));
        setServerWarnings(response.warnings.map((warning) => warning.message));
        setNotice("Routing overlay applied.");
        await onReloaded();
      } catch (caught) {
        onError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setBusy(false);
      }
    })();
  }, [config, draft, onError, onReloaded]);

  const reset = useCallback(() => {
    setBusy(true);
    void (async () => {
      try {
        await api.resetConfiguration();
        setNotice("Overlay removed. The baseline file is active again.");
        setServerWarnings([]);
        await onReloaded();
      } catch (caught) {
        onError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setBusy(false);
      }
    })();
  }, [onError, onReloaded]);

  return (
    <section className="panel" style={{ gridColumn: "1 / -1" }}>
      <h2>Routing configuration</h2>
      <div className="meta">
        Strategy <code>{config.strategy}</code> from <code>{config.baseline_source}</code>
      </div>
      <div className="meta">
        {config.overlay.applied
          ? `Overlay applied from ${config.overlay.path}`
          : "No overlay applied. The baseline file is active."}
      </div>
      {config.overlay.error === null ? null : (
        <div className="notice warn">Overlay unreadable: {config.overlay.error}</div>
      )}
      {writeDisabled ? (
        <div className="notice warn">
          Routing edits are disabled because gateway.api_key_env is not configured.
        </div>
      ) : null}
      {notice === null ? null : <div className="notice">{notice}</div>}
      {serverWarnings.map((warning) => (
        <div className="notice warn" key={warning}>
          {warning}
        </div>
      ))}
      {config.warnings.length === 0 ? null : (
        <div className="notice warn">
          {config.warnings.map((warning) => (
            <div key={`${warning.code}-${warning.label ?? ""}`}>{warning.message}</div>
          ))}
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <h3>Rule order (first match wins)</h3>
        <SortableContext
          items={draft.rules.map((_rule, index) => ruleId(index))}
          strategy={verticalListSortingStrategy}
        >
          <ol className="rules">
            {draft.rules.map((rule, index) => (
              <RuleRow
                key={ruleId(index)}
                index={index}
                total={draft.rules.length}
                rule={rule}
                labels={config.labels}
                selections={selections}
                onChoice={(patch) =>
                  setDraft((current) => setRuleChoice(current, index, patch))
                }
                onMove={(to) => setDraft((current) => moveRule(current, index, to))}
              />
            ))}
          </ol>
        </SortableContext>

        <h3>Label membership</h3>
        <p className="meta">
          Dropping a chip on a label adds that label's tag. A model may serve several labels.
          Unrelated strategy tags are shown but never edited.
        </p>
        <div className="board">
          <DropZone
            id={zoneId(POOL_ID)}
            title="Unassigned"
            subtitle="Not bound to any label of this strategy"
          >
            {unassignedModels(draft, config).map((model) => (
              <ModelChip
                key={chipId(model.id, POOL_ID)}
                model={model}
                source={POOL_ID}
                config={config}
                onPriority={(priority) =>
                  setDraft((current) => setPriority(current, model.id, priority))
                }
                onMembership={(tag, member) =>
                  setDraft((current) => setLabelMembership(current, model.id, tag, member))
                }
              />
            ))}
          </DropZone>
          {config.labels.map((label) => (
            <DropZone
              key={label.tag}
              id={zoneId(label.tag)}
              title={`${label.name} (score ${label.score})`}
              subtitle={
                label.resolution === "models"
                  ? "Resolves by explicit model list, so tag edits do not reach it"
                  : `Tag ${label.tag}`
              }
            >
              {labelMembers(draft, config, label).map((model) => (
                <ModelChip
                  key={chipId(model.id, label.tag)}
                  model={model}
                  source={label.tag}
                  config={config}
                  onPriority={(priority) =>
                    setDraft((current) => setPriority(current, model.id, priority))
                  }
                  onMembership={(tag, member) =>
                    setDraft((current) => setLabelMembership(current, model.id, tag, member))
                  }
                />
              ))}
              {labelMembers(draft, config, label).length === 0 ? (
                <div className="empty">No models in this label.</div>
              ) : null}
            </DropZone>
          ))}
        </div>
      </DndContext>

      <h3>Saved pool order</h3>
      <p className="meta">
        The server ranks the saved pool by strategy selection mode, with priority as a tiebreak.
        New memberships and priority edits are pending until saved; this order is not a live preview.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Label</th>
              <th>Rank</th>
              <th>Model</th>
              <th>Entry</th>
            </tr>
          </thead>
          <tbody>
            {config.labels.map((label) => {
              return label.models.map((modelId, position) => (
                <tr key={`${label.name}-${modelId}`}>
                  <td data-label="Label">{label.name}</td>
                  <td data-label="Rank">{position + 1}</td>
                  <td data-label="Model">{modelId}</td>
                  <td data-label="Entry">ranked by the server</td>
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>

      <h3>Pending changes</h3>
      {diff.changed ? (
        <ul className="diff">
          {diff.rules.map((line) => (
            <li key={line}>{line}</li>
          ))}
          {diff.models.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : (
        <div className="empty">No pending changes.</div>
      )}
      <div className="toolbar">
        <button type="button" onClick={save} disabled={writeDisabled || busy || !diff.changed}>
          Save overlay
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft(draftFromConfiguration(config));
            setNotice(null);
          }}
          disabled={busy || !diff.changed}
        >
          Cancel
        </button>
        <button type="button" onClick={reset} disabled={writeDisabled || busy}>
          Reset to baseline
        </button>
      </div>
    </section>
  );
}
