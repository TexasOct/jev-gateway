import { describe, expect, it, vi } from "vitest";
import type { SessionsPayload } from "@/shared/api/types";
import { remainingSessionPages } from "../model/session-pages";

function page(ids: string[], next: string | null, storage: SessionsPayload["storage"] = { enabled: true }): SessionsPayload {
  return {
    data: ids.map((session_id) => ({ session_id })),
    next_cursor: next,
    has_more: next !== null,
    storage,
    evidence_available: true,
    page_size: 2,
  };
}

describe("remaining session pages", () => {
  it("resumes after a failed second page, keeps partial rows, and walks all later pages", async () => {
    const first = page(["one", "two"], "cursor-2");
    const fetchPage = vi.fn().mockRejectedValueOnce(new Error("temporarily unavailable"))
      .mockResolvedValueOnce(page(["two", "three"], "cursor-3"))
      .mockResolvedValueOnce(page(["three", "four"], null));
    const updates: SessionsPayload[] = [];
    await expect(remainingSessionPages(first, fetchPage, (value) => updates.push(value), () => true))
      .rejects.toThrow("temporarily unavailable");
    expect(updates).toEqual([]);
    const result = await remainingSessionPages(first, fetchPage, (value) => updates.push(value), () => true);
    expect(fetchPage.mock.calls.map(([cursor]) => cursor)).toEqual(["cursor-2", "cursor-2", "cursor-3"]);
    expect(updates.map((value) => value.data.map((row) => row.session_id))).toEqual([
      ["one", "two", "three"], ["one", "two", "three", "four"],
    ]);
    expect(result.page.has_more).toBe(false);
    expect(result.cursorError).toBe(false);
  });

  it("reports a repeated or missing cursor without treating the walk as complete", async () => {
    const fetchPage = vi.fn().mockResolvedValue(page(["two"], "cursor-2"));
    const result = await remainingSessionPages(page(["one"], "cursor-2"), fetchPage, () => {}, () => true);
    expect(result.cursorError).toBe(true);
    expect(result.page.has_more).toBe(true);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect((await remainingSessionPages(page(["one"], null), fetchPage, () => {}, () => true)).cursorError).toBe(false);
    expect((await remainingSessionPages({ ...page(["one"], null), has_more: true }, fetchPage, () => {}, () => true)).cursorError).toBe(true);
  });

  it("drops an in-flight result from a superseded generation", async () => {
    let resolvePage!: (value: SessionsPayload) => void;
    const fetchPage = vi.fn(() => new Promise<SessionsPayload>((resolve) => { resolvePage = resolve; }));
    const onPage = vi.fn();
    let current = true;
    const pending = remainingSessionPages(page(["one"], "cursor-2"), fetchPage, onPage, () => current);
    current = false;
    resolvePage(page(["two"], null));
    expect((await pending).stopped).toBe(true);
    expect(onPage).not.toHaveBeenCalled();
  });

  it("preserves storage failure on the last page for the caller to mark incomplete", async () => {
    const result = await remainingSessionPages(page(["one"], "cursor-2"), async () => page(["two"], null, { enabled: false, error: "offline" }), () => {}, () => true);
    expect(result.page.storage.error).toBe("offline");
    expect(result.page.data).toHaveLength(2);
  });
});
