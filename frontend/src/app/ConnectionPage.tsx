import type { FormEvent } from "react";
import type { useLocale } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";

type Props = {
  keyDraft: string;
  error: string | null;
  pending: boolean;
  locale: "en" | "zh-CN";
  setLocale: (locale: "en" | "zh-CN") => void;
  t: ReturnType<typeof useLocale>["t"];
  onConnect: (event: FormEvent<HTMLFormElement>) => void;
  onKeyDraftChange: (value: string) => void;
};

export function ConnectionPage({ keyDraft, error, pending, locale, setLocale, t, onConnect, onKeyDraftChange }: Props) {
  return (
    <main data-connection-page className="grid min-h-dvh min-w-0 place-items-center bg-page px-4 py-8 text-ink">
      <div className="grid w-full min-w-0 max-w-md gap-6">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span aria-hidden="true" className="grid size-9 place-items-center rounded-md border border-outline bg-panel text-sm font-bold text-primary">J</span>
            <span className="text-sm font-semibold tracking-tight">JEV Gateway</span>
          </div>
          <select aria-label={t("language")} className="min-w-0 max-w-full" value={locale} onChange={(event) => setLocale(event.target.value as Props["locale"])}>
            <option value="en">{t("english")}</option>
            <option value="zh-CN">{t("chinese")}</option>
          </select>
        </div>
        <Card className="min-w-0 gap-5 p-6 max-[360px]:p-4">
          <div>
            <h1 className="m-0 text-2xl font-semibold tracking-tight">{t("connect")}</h1>
            <p className="mb-0 mt-3 text-sm text-ink-muted [overflow-wrap:anywhere]">{t("connectionIntro")}</p>
          </div>
          <form className="grid min-w-0 gap-3" aria-busy={pending} onSubmit={onConnect}>
            <label htmlFor="gateway-api-key" className="text-sm font-medium">{t("apiKey")}</label>
            <input id="gateway-api-key" className="min-h-11 w-full min-w-0 rounded-lg border border-outline bg-panel px-3 text-ink" type="password" value={keyDraft} autoComplete="off" autoCapitalize="none" spellCheck={false} disabled={pending} aria-describedby="connection-credential-note" onChange={(event) => onKeyDraftChange(event.target.value)} />
            {error !== null && <div role="alert" className="rounded-md border-l-[3px] border-caution bg-panel-muted px-3 py-2 text-sm text-ink [overflow-wrap:anywhere]">{error}</div>}
            {pending && <p role="status" className="m-0 text-sm text-ink-muted">{t("connectionPending")}</p>}
            <Button type="submit" size="lg" disabled={pending} className="mt-1 w-full">{t("connect")}</Button>
          </form>
          <p id="connection-credential-note" className="m-0 text-xs leading-relaxed text-ink-muted [overflow-wrap:anywhere]">{t("credentialNote")}</p>
        </Card>
      </div>
    </main>
  );
}
