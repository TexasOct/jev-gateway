import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";

it("renders only the connection page without reading retained console state", () => {
  const unused = vi.fn();
  const retained = new Proxy({}, { get() { throw new Error("Console state must stay hidden"); } });
  const markup = renderToStaticMarkup(<AppShell
    view="strategy" needsKey connectionPending keyDraft="" error="Connection failed"
    locale="en" setLocale={unused} t={((key: string) => key) as never}
    formatDateTime={unused as never} schemePreference="system" setSchemePreference={unused}
    configuration={retained as never} monitoring={retained as never}
    routeActivity={retained as never} theme={retained as never}
    onOpenView={unused} onRefresh={unused} onConnect={unused}
    onKeyDraftChange={unused} onReloadConfiguration={unused as never} onError={unused} onRetryMonitoring={unused}
  />);
  expect(markup).toContain("data-connection-page");
  expect(markup).not.toContain("<nav");
  expect(markup).not.toContain("app-header");
  expect(markup).not.toContain("routing-canvas");
  expect(markup).toContain('type="password"');
  expect(markup).toContain('for="gateway-api-key"');
  expect(markup).toContain('aria-busy="true"');
  expect(markup).toContain('role="alert"');
  expect(markup).toContain('role="status"');
  expect(markup).toMatch(/<button[^>]*disabled/);
});
