import type { ConfigurationPayload } from "@/shared/api/types";
import { addQuestion, addRule } from "./draft";
import type { RoutingDraft } from "./draft";

/** Creatable objects stay inside the catalog's ordered routing semantics. */
export function createEditableNode(draft: RoutingDraft, config: ConfigurationPayload, kind: "rule" | "question"): { draft: RoutingDraft; id: string } | null {
  if (kind === "question") {
    let index = 1;
    while (Object.hasOwn(draft.questions, `question_${index}`)) index++;
    return { draft: addQuestion(draft, `question_${index}`), id: "questions" };
  }
  const entry = Object.entries(draft.questions).find(([, question]) => Object.keys(question.criteria).length > 0);
  const label = config.labels.find((item) => item.resolution === "tag" || item.models.some((id) => Object.hasOwn(draft.models, id)));
  if (!entry || !label) return null;
  const added = addRule(draft, config, entry[0], Object.keys(entry[1].criteria)[0]!, label.name);
  if (added === draft) return null;
  // A new destination needs an explicit choice. Empty blocks review and cannot inherit a default.
  const rules = added.rules.map((rule, index) => index === draft.rules.length ? { ...rule, select: { label: "" } } : rule);
  return { draft: { ...added, rules }, id: `rule-${draft.rules.length}` };
}
