import { useEffect, useId, useRef } from "react";
import type { ReactNode, RefObject } from "react";
import { useWorkspaceActive } from "@/shared/navigation/workspace-activity";

export function Dialog({ title, children, footer, onClose, fallbackFocusRef }: { title: string; children: ReactNode; footer: ReactNode; onClose: () => void; fallbackFocusRef?: RefObject<HTMLElement | null> }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const active = useWorkspaceActive();
  const trigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const element = ref.current!;
    if (!active) { element.close(); return; }
    if (!trigger.current) trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element.showModal();
    return () => { element.close(); };
  }, [active]);
  useEffect(() => () => {
    const usable = (element: HTMLElement | null | undefined): element is HTMLElement => !!element?.isConnected && !element.matches(":disabled") && !element.closest("[inert], [hidden]") && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden";
    const target = usable(trigger.current) ? trigger.current : fallbackFocusRef?.current;
    if (usable(target)) target.focus();
  }, [fallbackFocusRef]);
  return <dialog ref={ref} tabIndex={-1} aria-labelledby={titleId} onKeyDown={(event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const controls = [...event.currentTarget.querySelectorAll<HTMLElement>("button,input,select,textarea,a[href],summary,[tabindex]")].filter((element) => !element.matches(":disabled") && !element.closest("[inert], [hidden]") && element.tabIndex >= 0 && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden" && ![...event.currentTarget.querySelectorAll("details:not([open])")].some((details) => details.contains(element) && element !== details.querySelector(":scope > summary")));
    const first = controls[0]; const last = controls.at(-1);
    const current = document.activeElement;
    if (!first) { event.preventDefault(); event.currentTarget.focus(); }
    else if (!controls.some((control) => control === current)) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
    else if (event.shiftKey && current === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && current === last) { event.preventDefault(); first.focus(); }
  }} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => {
    if (event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
  }} className="m-auto w-[calc(100%_-_2rem)] max-w-3xl overflow-hidden rounded-xl border border-outline bg-panel p-0 text-ink shadow-xl backdrop:bg-black/50">
    <div className="flex max-h-[90dvh] min-w-0 flex-col">
      <header className="border-b border-outline px-4 py-3"><h2 id={titleId} className="m-0 break-all text-lg font-semibold">{title}</h2></header>
      <div className="min-h-0 overflow-y-auto overscroll-contain p-4">{children}</div>
      <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-outline bg-panel p-4">{footer}</footer>
    </div>
  </dialog>;
}
