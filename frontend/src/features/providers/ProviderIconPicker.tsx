import { useId, useRef, useState } from "react";
import type { ProviderProfile } from "@/shared/api/types";
import type { useLocale } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { controlClass } from "./constants";
import { brandIcon, genericIcons, genericIconLabels, searchIcons } from "./icons";
import { ProviderIdentity } from "./ProviderIdentity";

type Props = { provider: ProviderProfile; disabled: boolean; onChange: (id: string | null) => void; t: ReturnType<typeof useLocale>["t"] };

export function ProviderIconPicker({ provider, disabled, onChange, t }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState("");
  const libraryID = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  const id = provider.icon_id;
  const generic = genericIcons.find((value) => value === id);
  const label = !id ? t("pmIconAutomatic") : generic ? t(genericIconLabels[generic]) : brandIcon(id)?.label ?? id;
  const icons = searchIcons(search);
  return <div data-provider-icon-picker className="grid min-w-0 gap-3 border-y border-outline py-3" onKeyDown={(event) => {
    if (event.key === "Escape" && expanded) { event.preventDefault(); event.stopPropagation(); setExpanded(false); toggle.current?.focus(); }
  }}>
    <div className="flex min-w-0 flex-wrap items-center gap-3">
      <ProviderIdentity provider={provider} t={t} />
      <div className="min-w-0 flex-1"><p className="m-0 text-sm font-medium">{t("pmIcon")}</p><p data-current-icon className="m-0 break-words text-xs text-ink-muted">{label}</p></div>
      <Button ref={toggle} type="button" variant="outline" className="min-h-11 whitespace-normal" disabled={disabled} aria-expanded={expanded} aria-controls={libraryID} onClick={() => setExpanded((value) => !value)}>{t(expanded ? "pmIconClose" : "pmIconChoose")}</Button>
    </div>
    {expanded && <div id={libraryID} className="grid min-w-0 gap-3">
      <p className="m-0 text-xs text-ink-muted">{t("pmIconIndependent")}</p>
      <div className="flex min-w-0 flex-wrap gap-2">{[null, ...genericIcons].map((choice) => <Button type="button" variant="outline" className="min-h-11 whitespace-normal aria-pressed:border-primary aria-pressed:bg-panel-muted aria-pressed:text-primary" key={choice ?? "automatic"} disabled={disabled} aria-pressed={choice === null ? !id : id === choice} onClick={() => onChange(choice)}>{t(choice === null ? "pmIconAutomatic" : genericIconLabels[choice])}</Button>)}</div>
      <label className="grid min-w-0 gap-1 text-sm"><span>{t("pmIconSearch")}</span><input className={controlClass} type="search" value={search} disabled={disabled} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} onChange={(event) => setSearch(event.target.value)} /></label>
      <div className="grid max-h-80 min-w-0 grid-cols-2 gap-2 overflow-y-auto p-1 sm:grid-cols-3" aria-label={t("pmIconLibrary")}>
        {icons.map((icon) => <Button type="button" key={icon.id} variant="outline" className="h-auto min-h-24 min-w-0 flex-col gap-2 whitespace-normal p-2 aria-pressed:border-primary aria-pressed:bg-panel-muted aria-pressed:text-primary" disabled={disabled} aria-label={icon.label} aria-pressed={id === icon.id} onClick={() => onChange(icon.id)}><ProviderIdentity provider={{ ...provider, icon_id: icon.id }} compact t={t} /><span className="w-full min-w-0 break-words text-xs">{icon.label}</span></Button>)}
      </div>
      {!icons.length && <p role="status" className="m-0 text-xs text-ink-muted">{t("pmIconNoResults")}</p>}
    </div>}
  </div>;
}
