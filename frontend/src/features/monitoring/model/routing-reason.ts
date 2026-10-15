import type { ClassificationStatus, RecordedDecision, RetainedRequest } from "@/shared/api/types";
import type { useLocale } from "@/shared/i18n";

type Translate = ReturnType<typeof useLocale>["t"];
export function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
export function text(value: unknown): string | null { return typeof value === "string" && value.length ? value : null; }
export function requestId(item: RetainedRequest): string { return String(item.request["request_id"]); }
export function modelName(decision: RecordedDecision | null): string | null {
  return text(decision?.["route"]) ?? (text(decision?.["provider"]) && text(decision?.["upstream_model"]) ? `${decision!["provider"]}/${decision!["upstream_model"]}` : text(decision?.["upstream_model"]));
}
export function routingReason(decision: RecordedDecision | null, t: Translate, locale: "en" | "zh-CN" = "en"): string {
  const evidence = decision?.routing_evidence;
  if (!evidence) return typeof decision?.["reason"] === "string" && /decision_(?:matrix|classifier):[^:]+:fallback(?:[:;]|$)/.test(decision["reason"])
    ? t("legacyFallbackReason") : t("legacyReason");
  const path = evidence.rule_status;
  if (path === "manual") return t("manualReason");
  if (path === "session_reuse") return t("sessionReuseReason");
  if (path === "classifier_fallback") return `${classificationLabel(evidence.classification?.status, locale, t("evidenceUnknown"))}. ${t("fallbackReason")}`;
  if (path === "accepted_unmatched") return t("validUnmatchedReason");
  if (path === "matched") return `${t("matchedReason")} ${evidence.matched_rule_index ?? t("evidenceUnknown")}.`;
  if (path === "classified") return t("classifiedReason");
  return path === "policy" ? t("policyReason") : t("legacyReason");
}
const statuses: Record<ClassificationStatus, [string, string]> = {
  accepted: ["Accepted", "已接受"], disabled: ["Classification disabled", "分类已关闭"],
  missing_provider: ["No configured provider", "供应商未配置"], missing_key: ["Credential missing", "缺少凭据"],
  http_error: ["HTTP error", "HTTP 错误"], timeout: ["Timed out", "超时"], network_error: ["Network error", "网络错误"],
  invalid_json: ["Invalid JSON", "无效 JSON"], invalid_envelope: ["Invalid response format", "响应格式无效"],
  invalid_answers: ["Invalid answers", "分类答案无效"], unsupported_protocol: ["Unsupported protocol", "协议不支持"],
  unavailable: ["Unavailable", "不可用"], bypassed_manual: ["Bypassed: manual model", "跳过：手动选择"],
  bypassed_session: ["Bypassed: session reuse", "跳过：会话复用"], not_applicable: ["Not applicable", "不适用"],
};
export function classificationLabel(status: ClassificationStatus | undefined, locale: "en" | "zh-CN", unknown: string): string {
  return status && statuses[status] ? statuses[status][locale === "en" ? 0 : 1] : unknown;
}
