import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode, UIEvent } from "react";

import { windowRange } from "./pagination";

interface Props<T> {
  items: T[];
  rowHeight: number;
  getKey: (item: T) => string;
  render: (item: T) => ReactNode;
  className: string;
  label: string;
  hasMore: boolean;
  loading: boolean;
  onMore: () => void;
  footer?: ReactNode;
}

export function VirtualList<T>({ items, rowHeight, getKey, render, className, label, hasMore, loading, onMore, footer }: Props<T>) {
  const container = useRef<HTMLDivElement>(null);
  const focusedKey = useRef<string | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(480);
  const range = windowRange(items.length, scrollTop, viewportHeight, rowHeight);

  useEffect(() => {
    const element = container.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const resize = new ResizeObserver(() => setViewportHeight(element.clientHeight));
    resize.observe(element);
    setViewportHeight(element.clientHeight);
    return () => resize.disconnect();
  }, []);

  useEffect(() => {
    if (hasMore && !loading && items.length * rowHeight - scrollTop - viewportHeight < rowHeight * 3) onMore();
  }, [hasMore, items.length, loading, onMore, rowHeight, scrollTop, viewportHeight]);

  function onScroll(event: UIEvent<HTMLDivElement>) {
    setScrollTop(event.currentTarget.scrollTop);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (className !== "sessions") return;
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const current = items.findIndex((item) => getKey(item) === focusedKey.current);
    if (current < 0) return;
    const next = Math.max(0, Math.min(items.length - 1, current + (event.key === "ArrowDown" ? 1 : -1)));
    if (next === current) return;
    event.preventDefault();
    const element = container.current;
    if (!element) return;
    element.scrollTop = Math.max(0, next * rowHeight - rowHeight);
    setScrollTop(element.scrollTop);
    const nextItem = items[next];
    if (nextItem === undefined) return;
    focusedKey.current = getKey(nextItem);
    requestAnimationFrame(() => {
      const row = Array.from(element.querySelectorAll<HTMLElement>(".virtual-row"))
        .find((candidate) => candidate.dataset.key === focusedKey.current);
      row?.querySelector("button")?.focus();
    });
  }

  return (
    <div ref={container} className={`${className} virtual-list`} aria-label={label} onScroll={onScroll} onKeyDown={onKeyDown} onFocusCapture={(event) => {
      const row = (event.target as HTMLElement).closest<HTMLElement>(".virtual-row");
      focusedKey.current = row?.dataset.key ?? null;
    }}>
      <div style={{ height: items.length * rowHeight, position: "relative" }}>
        {items.slice(range.start, range.end).map((item, offset) => (
          <div className="virtual-row" key={getKey(item)} data-key={getKey(item)} style={{ top: (range.start + offset) * rowHeight, height: rowHeight }}>
            {render(item)}
          </div>
        ))}
      </div>
      {footer}
    </div>
  );
}
