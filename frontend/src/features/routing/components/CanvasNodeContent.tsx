import { CircleQuestionMark, CornerDownRight, GitBranch, MessageCircleQuestionMark, Server, Tag } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ConfigurationPayload } from "@/shared/api/types";
import { useTranslation } from "@/shared/i18n";
import { labelMembers, workflowEdges } from "../model/draft";
import { formatRouteLabel } from "@/shared/i18n/route-label";
import { matrixChoiceLabel } from "@/shared/routing/choice-label";
import type { RoutingDraft } from "../model/draft";

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

const nodeIcons: Record<CanvasNodeKind, LucideIcon> = {
  questions: MessageCircleQuestionMark,
  rule: GitBranch,
  fallback: CornerDownRight,
  label: Tag,
  model: Server,
  unknown: CircleQuestionMark,
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
  const Icon = nodeIcons[kind];
  const typeName = t(kindKeys[kind]);
  let title = text || typeName;
  let summary = t("canvasNodeUnavailable");

  switch (kind) {
    case "questions": {
      const count = Object.keys(draft.questions).length;
      summary = t(count === 1 ? "canvasNodeQuestionCountOne" : "canvasNodeQuestionCount").replace("{count}", String(count));
      title = Object.keys(draft.questions).join(" · ") || title;
      break;
    }
    case "rule": {
      const rule = draft.rules[Number(id.slice(5))];
      if (rule) {
        const conditions = Object.entries(rule.when)
          .map(([name, value]) => `${name}=${Array.isArray(value) ? `(${value.join(" | ")})` : value}`)
          .join(", ");
        summary = `${conditions || t("canvasNodeNoConditions")} → ${matrixChoiceLabel(rule.select, config.labels[0]?.name) || t("labelUnavailable")}`;
        title = Object.entries(rule.when).map(([name, value]) =>
          `${name} = ${Array.isArray(value) ? value.join(" / ") : value}`).join(" · ") || t("canvasNodeNoConditions");
      }
      break;
    }
    case "fallback": {
      const label = matrixChoiceLabel(draft.fallback, config.labels[0]?.name);
      summary = label ? `${t("label")}: ${label}` : t("labelUnavailable");
      title = t("canvasFailureRoute");
      break;
    }
    case "label": {
      const label = config.labels.find((item) => `zone::${item.tag}` === id);
      if (label) {
        const count = draft.pools !== undefined ? labelMembers(draft, config, label).length : label.resolution === "models" ? label.models.length : labelMembers(draft, config, label).length;
        summary = t(count === 1 ? "canvasNodeModelCountOne" : "canvasNodeModelCount").replace("{count}", String(count));
        if (workflowEdges(draft, config).some((edge) => edge.from === id && edge.kind === "default")) {
          summary = t("inheritedDefaultPath").replace("{label}", formatRouteLabel("default", t, { defaulted: true }));
        } else if (label.resolution === "tag" && count === 0 && config.defaults !== undefined) {
          summary = t("emptyTagPath");
        }
      }
      break;
    }
    case "model": {
      const model = config.models.find((item) => `model::${item.id}` === id);
      if (model) summary = model.provider ? `${t("provider")}: ${model.provider}` : t("providerUnavailable");
      break;
    }
  }

  return <span className={`canvas-node-content canvas-node-kind-${kind} absolute left-0 right-0 top-0 grid h-[56px] min-w-0 ${kind === "rule" ? "grid-rows-[12px_32px]" : "grid-rows-[12px_16px_12px]"} content-center select-none px-3`} data-node-kind={kind}>
    <span className="canvas-node-type flex min-w-0 items-center gap-1 text-[10px] font-medium leading-3 text-ink-muted" title={typeName}>
      <Icon className="canvas-node-icon shrink-0" size={14} strokeWidth={1.8} aria-hidden="true" focusable="false" />
      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{kind === "rule" ? text : typeName}</span>
    </span>
    <span className={`canvas-node-title min-w-0 overflow-hidden text-sm font-semibold leading-4 text-ink ${kind === "rule" ? "line-clamp-2 break-words" : "text-ellipsis whitespace-nowrap"}`} title={title}>{title}</span>
    <span className={kind === "rule" ? "canvas-node-summary sr-only" : "canvas-node-summary min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] leading-3 text-ink-muted"} title={summary}>{summary}</span>
  </span>;
}
