import type { FormEvent } from "react";
import type { useLocale } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { NativeSelect } from "@/shared/ui/native-select";
import { Alert, AlertDescription } from "@/shared/ui/alert";

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
          <div className="w-36 min-w-0 max-w-full"><NativeSelect aria-label={t("language")} value={locale} onChange={(event) => setLocale(event.target.value as Props["locale"])}>
            <option value="en">{t("english")}</option>
            <option value="zh-CN">{t("chinese")}</option>
          </NativeSelect></div>
        </div>
        <Card className="min-w-0 gap-5 rounded-none border-x-0 border-b-0 bg-transparent p-0 pt-6 shadow-none">
          <div>
            <h1 className="m-0 text-2xl font-semibold tracking-tight">{t("connect")}</h1>
            <p className="mb-0 mt-3 text-sm text-ink-muted [overflow-wrap:anywhere]">{t("connectionIntro")}</p>
          </div>
          <form className="grid min-w-0 gap-3" aria-busy={pending} onSubmit={onConnect}>
            <Label htmlFor="gateway-api-key">{t("apiKey")}</Label>
            <Input id="gateway-api-key" type="password" value={keyDraft} autoComplete="off" autoCapitalize="none" spellCheck={false} disabled={pending} aria-describedby="connection-credential-note" onChange={(event) => onKeyDraftChange(event.target.value)} />
            {error !== null && <Alert role="alert" className="border-caution bg-panel-muted text-ink [overflow-wrap:anywhere]"><AlertDescription className="text-ink">{error}</AlertDescription></Alert>}
            {pending && <p role="status" className="m-0 text-sm text-ink-muted">{t("connectionPending")}</p>}
            <Button type="submit" size="lg" disabled={pending} className="mt-1 w-full">{t("connect")}</Button>
          </form>
          <p id="connection-credential-note" className="m-0 text-xs leading-relaxed text-ink-muted [overflow-wrap:anywhere]">{t("credentialNote")}</p>
        </Card>
      </div>
    </main>
  );
}
