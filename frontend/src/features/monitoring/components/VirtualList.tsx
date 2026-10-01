import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode, UIEvent } from "react";

import { windowRange } from "../model/pagination";

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

export function VirtualList<T>({
  items,
  rowHeight,
  getKey,
  render,
  className,
  label,
  hasMore,
  loading,
  onMore,
  footer,
}: Props<T>) {
  const container = useRef<HTMLDivElement>(null);
  const focusedKey = useRef<string | null>(null);
  const [focusedRowKey, setFocusedRowKey] = useState<string | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(480);
  const range = windowRange(items.length, scrollTop, viewportHeight, rowHeight);
  const isTimeline = className.split(/\s+/).includes("timeline");
  const focusedIndex =
    focusedRowKey === null
      ? -1
      : items.findIndex((item) => getKey(item) === focusedRowKey);
  const visibleRows = items
    .slice(range.start, range.end)
    .map((item, offset) => ({ item, index: range.start + offset }));
  // Keep a focused row mounted when scrolling it out of the visible window.
  // Otherwise a disclosure/button can disappear while a keyboard user is operating it.
  if (
    focusedIndex >= 0 &&
    (focusedIndex < range.start || focusedIndex >= range.end)
  ) {
    const item = items[focusedIndex];
    if (item !== undefined) visibleRows.push({ item, index: focusedIndex });
  }

  useEffect(() => {
    const element = container.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const resize = new ResizeObserver(() =>
      setViewportHeight(element.clientHeight),
    );
    resize.observe(element);
    setViewportHeight(element.clientHeight);
    return () => resize.disconnect();
  }, []);

  useEffect(() => {
    if (
      hasMore &&
      !loading &&
      items.length * rowHeight - scrollTop - viewportHeight < rowHeight * 3
    )
      onMore();
  }, [
    hasMore,
    items.length,
    loading,
    onMore,
    rowHeight,
    scrollTop,
    viewportHeight,
  ]);

  function onScroll(event: UIEvent<HTMLDivElement>) {
    setScrollTop(event.currentTarget.scrollTop);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!className.split(/\s+/).includes("sessions")) return;
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const current = items.findIndex(
      (item) => getKey(item) === focusedKey.current,
    );
    if (current < 0) return;
    const next = Math.max(
      0,
      Math.min(
        items.length - 1,
        current + (event.key === "ArrowDown" ? 1 : -1),
      ),
    );
    if (next === current) return;
    event.preventDefault();
    const element = container.current;
    if (!element) return;
    element.scrollTop = Math.max(0, next * rowHeight - rowHeight);
    setScrollTop(element.scrollTop);
    const nextItem = items[next];
    if (nextItem === undefined) return;
    focusedKey.current = getKey(nextItem);
    setFocusedRowKey(focusedKey.current);
    requestAnimationFrame(() => {
      const row = Array.from(
        element.querySelectorAll<HTMLElement>(".virtual-row"),
      ).find((candidate) => candidate.dataset.key === focusedKey.current);
      row?.querySelector("button")?.focus();
    });
  }

  // Emit one mobile height per list: Tailwind utility order does not follow
  // the order of competing class names on an element.
  return (
    <div
      ref={container}
      className={`${className} virtual-list h-[480px] min-h-[480px] max-h-[480px] overflow-y-auto overscroll-contain ${isTimeline ? "max-[720px]:h-[62vh] max-[720px]:min-h-[62vh] max-[720px]:max-h-[62vh]" : className.split(/\s+/).includes("sessions") ? "max-[720px]:h-[280px] max-[720px]:min-h-[280px] max-[720px]:max-h-[280px]" : ""}`}
      aria-label={label}
      onScroll={onScroll}
      onKeyDown={onKeyDown}
      onFocusCapture={(event) => {
        const row = (event.target as HTMLElement).closest<HTMLElement>(
          ".virtual-row",
        );
        focusedKey.current = row?.dataset.key ?? null;
        setFocusedRowKey(focusedKey.current);
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          focusedKey.current = null;
          setFocusedRowKey(null);
        }
      }}
    >
      <div className="relative" style={{ height: items.length * rowHeight }}>
        {visibleRows.map(({ item, index }) => (
          <div
            className="virtual-row absolute left-0 right-0 overflow-hidden px-[0.4rem] py-[0.2rem]"
            key={getKey(item)}
            data-key={getKey(item)}
            style={{ top: index * rowHeight, height: rowHeight }}
          >
            {render(item)}
          </div>
        ))}
      </div>
      {footer}
    </div>
  );
}
