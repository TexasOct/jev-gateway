import type { ConfigurationPayload } from "../api";
import { useTranslation } from "../i18n";
import { labelMembers } from "./draft";
import type { RoutingDraft } from "./draft";

type CanvasNodeKind = "questions" | "rule" | "fallback" | "label" | "model" | "unknown";

// The helper shares this module with the content so outer-button styling uses the same role.
// eslint-disable-next-line react-refresh/only-export-components
export function getCanvasNodeKind(id: string): CanvasNodeKind {
  if (/\p{Cc}/u.test(id)) return "unknown";
  if (id === "questions" || id === "fallback") return id;
  if (/^rule-(0|[1-9][0-9]{0,3})$/.test(id)) return "rule";
  if (/^zone::[^\p{Cc}]{1,240}$/u.test(id)) return "label";
  if (/^model::[^\p{Cc}]{1,240}$/u.test(id)) return "model";
  return "unknown";
}

const kindKeys = {
  questions: "canvasNodeQuestions", rule: "rule", fallback: "fallback",
  label: "canvasNodeLabelPool", model: "canvasNodeModel", unknown: "canvasNodeUnknown",
} as const;

const iconPaths: Record<CanvasNodeKind, string> = {
  questions: "M5 3h12v11H9l-4 3V3Z M2 7v13l4-3 M9 7a2 2 0 0 1 4 0c0 1-2 1-2 3 M11 12h.01",
  rule: "M3 12h5 M8 12V5h10 M8 12v7h10 M15 2l3 3-3 3 M15 16l3 3-3 3",
  fallback: "M5 3v8a6 6 0 0 0 6 6h9 M15 12l5 5-5 5",
  label: "M3 3h9l9 9-9 9-9-9V3Z M7 7h.01",
  model: "M3 3h18v7H3V3Z M3 14h18v7H3v-7Z M6 6.5h.01 M6 17.5h.01 M11 6.5h7 M11 17.5h7",
  unknown: "M4 4h16v16H4V4Z M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4 M12 16h.01",
};

interface Props {
  id: string;
  text: string;
  draft: RoutingDraft;
  config: ConfigurationPayload;
}

export default function CanvasNodeContent({ id, text, draft, config }: Props) {
  const { t } = useTranslation();
  const kind = getCanvasNodeKind(id);
  const typeName = t(kindKeys[kind]);
  const title = text || typeName;
  let summary = t("canvasNodeUnavailable");

  switch (kind) {
    case "questions": {
      const count = Object.keys(draft.questions).length;
      summary = t(count === 1 ? "canvasNodeQuestionCountOne" : "canvasNodeQuestionCount").replace("{count}", String(count));
      break;
    }
    case "rule": {
      const rule = draft.rules[Number(id.slice(5))];
      if (rule) {
        const conditions = Object.entries(rule.when)
          .map(([name, value]) => `${name}=${Array.isArray(value) ? `(${value.join(" | ")})` : value}`)
          .join(", ");
        summary = `${conditions || t("canvasNodeNoConditions")} → ${rule.select.label || t("labelUnavailable")}`;
      }
      break;
    }
    case "fallback":
      summary = draft.fallback.label ? `${t("label")}: ${draft.fallback.label}` : t("labelUnavailable");
      break;
    case "label": {
      const label = config.labels.find((item) => `zone::${item.tag}` === id);
      if (label) {
        const count = label.resolution === "models" ? label.models.length : labelMembers(draft, config, label).length;
        summary = t(count === 1 ? "canvasNodeModelCountOne" : "canvasNodeModelCount").replace("{count}", String(count));
      }
      break;
    }
    case "model": {
      const model = config.models.find((item) => `model::${item.id}` === id);
      if (model) summary = model.provider ? `${t("provider")}: ${model.provider}` : t("providerUnavailable");
      break;
    }
  }

  return <span className={`canvas-node-content canvas-node-kind-${kind}`} data-node-kind={kind}>
    <span className="canvas-node-type" title={typeName}>
      <svg className="canvas-node-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <path d={iconPaths[kind]} />
      </svg>
      <span>{typeName}</span>
    </span>
    <span className="canvas-node-title" title={title}>{title}</span>
    <span className="canvas-node-summary" title={summary}>{summary}</span>
  </span>;
}
