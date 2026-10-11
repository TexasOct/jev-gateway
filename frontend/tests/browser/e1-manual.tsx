/// <reference types="vite/client" />
import { createRoot } from "react-dom/client";
import { useCallback, useEffect, useState } from "react";
import "../../src/styles/index.css";
import { ModelDialog } from "../../src/features/providers/models/ModelDialog";
import { emptyModelDraft } from "../../src/features/providers/models/model";
import type { ModelDraft } from "../../src/features/providers/models/model";
import { messages } from "../../src/shared/i18n";
import { applyPalette, buildPalette } from "../../src/shared/theme/palette";
import { Button } from "../../src/shared/ui/button";

const params = new URLSearchParams(location.search);
applyPalette(buildPalette("#3b66d9")[params.get("scheme") === "dark" ? "dark" : "light"], document.documentElement);
const locale = params.get("locale") === "en" ? "en" : "zh-CN";
const t = (key: keyof typeof messages.en) => messages[locale][key];
document.documentElement.lang = locale;

type Scenario = "clean" | "dirty" | "pending";
type Observation = {
  modal: boolean;
  popup: boolean | "unsupported";
  value: string | null;
  displayName: string | null;
  focused: string;
  dirty: boolean;
  discardPrompt: boolean;
  memorySaves: number;
};
const session = { scenario: null as Scenario | null, dirty: false, saves: 0 };
const history: { at: string; event: string; observation: Observation }[] = [];
const started = new Date().toISOString();

function snapshot(): Observation {
  const modal = document.querySelector('[role="dialog"][aria-modal="true"]');
  const select = document.querySelector<HTMLSelectElement>("#model-dialog-tools") ?? document.querySelector<HTMLSelectElement>("#e1-plain");
  let popup: Observation["popup"] = "unsupported";
  try { popup = !!select?.matches(":open"); } catch { /* Native visual observation remains necessary. */ }
  const focus = document.activeElement;
  return {
    modal: !!modal,
    popup,
    value: select?.value ?? null,
    displayName: document.querySelector<HTMLInputElement>("#model-dialog-display-name")?.value ?? null,
    focused: focus instanceof HTMLElement ? focus.id || focus.getAttribute("aria-label") || focus.tagName.toLowerCase() : "unknown",
    dirty: session.dirty,
    discardPrompt: !!modal?.textContent?.includes(t("mmDiscardQuestion")),
    memorySaves: session.saves,
  };
}

function text(id: string, value: string) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

function record(event: string, observation = snapshot()) {
  history.push({ at: new Date().toISOString(), event, observation });
  if (history.length > 256) history.shift();
  text("e1-log", history.slice(-24).map((item) => `${item.at.slice(11, 23)} ${item.event} ${JSON.stringify(item.observation)}`).join("\n"));
}

function makeDraft(): ModelDraft {
  const draft = emptyModelDraft();
  return { ...draft, displayName: "E1 示例模型", enabled: true, tags: "", priority: "100", quality: "0.5", values: {
    ...draft.values, tools: "true", vision: "false", json_mode: "true", reasoning: "false", temperature: "true",
    reasoning_effort: "[]", input_per_million: "1", output_per_million: "2", context_window: "8192", max_output_tokens: "1024",
  } };
}

export function AcceptanceFixture() {
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [initial, setInitial] = useState(makeDraft);
  const dirtyChanged = useCallback((dirty: boolean) => { session.dirty = dirty; record("草稿状态"); }, []);
  const close = useCallback(() => { record("模型 onClose"); setScenario(null); session.scenario = null; }, []);
  const save = useCallback(async () => { session.saves++; record("仅内存保存"); return true; }, []);

  useEffect(() => {
    if (!scenario || scenario === "pending") return;
    // One preparation handoff before human interaction; no Escape handler.
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(scenario === "dirty" ? "model-dialog-display-name" : "model-dialog-tools");
      target?.scrollIntoView({ block: "center" });
      target?.focus({ preventScroll: true });
      record("人工操作前定位字段");
    });
    return () => cancelAnimationFrame(frame);
  }, [scenario]);

  const open = (next: Scenario) => {
    session.scenario = next;
    session.dirty = false;
    setInitial(makeDraft());
    setScenario(next);
    record(`打开 ${next}`);
  };

  return <>
    <div className="e1-actions">
      <Button id="e1-open-clean" onClick={() => open("clean")}>打开干净草稿</Button>
      <Button id="e1-open-dirty" variant="outline" onClick={() => open("dirty")}>打开未保存草稿场景</Button>
      <Button id="e1-open-pending" variant="outline" onClick={() => open("pending")}>保存中（补充）</Button>
    </div>
    <p className="e1-muted">“未保存草稿场景”会定位显示名称；请先亲手修改，再展开工具调用菜单。保存中场景按 Esc 不会关闭，可刷新页面退出。</p>
    {scenario && <ModelDialog key={scenario} identity="e1-demo-model" connectionLabel="E1 合成供应商" initial={initial} t={t} pending={scenario === "pending"} onSave={save} onClose={close} onDirtyChange={dirtyChanged} />}
  </>;
}

createRoot(document.getElementById("e1-react-root")!).render(<AcceptanceFixture />);

let previous = snapshot();
let popupInitial: Observation | null = null;
function observe() {
  const current = snapshot();
  document.body.dataset.e1Dialog = current.modal ? "open" : "closed";
  text("e1-modal", current.modal ? current.discardPrompt ? "保留，显示放弃确认" : "打开" : "关闭");
  text("e1-popup", current.popup === "unsupported" ? ":open 不支持，请肉眼确认" : current.popup ? "已展开" : "未展开");
  text("e1-value", current.value === "" ? "未知（空值）" : current.value ?? "无字段");
  text("e1-draft", current.dirty ? "有未保存修改" : "未修改");
  text("e1-focus", current.focused);
  text("e1-saves", String(current.memorySaves));
  if (current.popup === true && previous.popup !== true) popupInitial = current;
  if (previous.popup === true && current.popup === false) {
    text("e1-last", `最近一次收菜单：\n弹窗 ${current.modal ? "保留" : "关闭"}\n值 ${current.value === popupInitial?.value ? "未变" : "改变"}\n焦点 ${current.focused}\n放弃确认 ${current.discardPrompt ? "出现" : "未出现"}\n关闭原因需人工确认`);
    record("原生菜单由开到关（原因需人工确认）", current);
  } else if (JSON.stringify(current) !== JSON.stringify(previous)) record("状态变化", current);
  previous = current;
}
const timer = window.setInterval(observe, 150);
const events = ["focusin", "keydown", "change", "click"] as const;
function passive(event: Event) {
  if (event.target instanceof HTMLElement && event.target.closest("#e1-live")) return;
  if (event instanceof KeyboardEvent && event.key !== "Escape") return;
  const target = event.target instanceof HTMLElement ? event.target.id || event.target.tagName.toLowerCase() : "unknown";
  record(`${event.type}${event instanceof KeyboardEvent ? `:${event.key}` : ""} ${target}`);
}
for (const name of events) document.addEventListener(name, passive, { capture: true, passive: true });
document.getElementById("e1-export")?.addEventListener("click", async () => {
  const checked = (id: string) => (document.getElementById(id) as HTMLInputElement).checked;
  const sourceBinding = await fetch("./e1-manual-source.json").then((response) => response.json());
  const report = {
    kind: "E1 component-level human observation, not automatic acceptance",
    started, exported: new Date().toISOString(), userAgent: navigator.userAgent, url: location.href,
    sourceBinding,
    observer: { samplingMs: 150, maxRecords: 256 },
    operatorChecks: { clean: checked("e1-clean"), dirty: checked("e1-dirty"), plainControl: checked("e1-control") },
    note: (document.getElementById("e1-note") as HTMLTextAreaElement).value,
    officialE1Status: "UNVERIFIED pending evidence review",
    history,
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = `e1-human-observation-${Date.now()}.json`; link.click();
  URL.revokeObjectURL(url);
});
window.addEventListener("pagehide", () => { clearInterval(timer); for (const name of events) document.removeEventListener(name, passive, true); }, { once: true });
record("页面准备完成");
