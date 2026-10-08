import { useMemo, useState } from "react";
import type { RefObject } from "react";
import type { useLocale } from "@/shared/i18n";
import { ModelDialog } from "./ModelDialog";
import { confirmedModel, draftFromModel, prefillMetadata, withConfirmedMetadata } from "./model";
import type { ProviderManagement } from "../shared/useProviderManagement";

/**
 * Opens the one shared model editor Dialog for a workflow canvas model node.
 *
 * The canvas resolves a node id to its exact provider/upstream identity. This
 * owner looks that record up in the shared configuration manager and renders the
 * same ModelDialog the supplier model list uses, so there is a single editor
 * surface rather than a canvas-specific duplicate. Read-only inspection writes
 * nothing: the Dialog only saves through the manager's atomic update_model.
 */
export function CanvasModelEditor({ request, manager, t, onClose, fallbackFocusRef }: {
  request: { provider: string; upstream: string };
  manager: ProviderManagement;
  t: ReturnType<typeof useLocale>["t"];
  onClose: () => void;
  fallbackFocusRef?: RefObject<HTMLElement | null>;
}) {
  const [editAttempted, setEditAttempted] = useState(false);
  const configuration = manager.configuration;
  const model = useMemo(
    () => configuration?.models.find((record) => record.provider === request.provider && record.upstream_model === request.upstream),
    [configuration, request.provider, request.upstream],
  );
  const source = manager.sourceResponse;
  const evidence = source && source.configurationGeneration === manager.configurationGeneration && "provider_id" in source.selector && source.selector.provider_id === model?.provider && source.upstreamModels.includes(model?.upstream_model ?? "")
    ? manager.evidence.find((item) => item.upstream_model === model?.upstream_model) : undefined;
  const initial = useMemo(() => model ? evidence ? prefillMetadata(draftFromModel(model), evidence) : draftFromModel(model) : null, [model, evidence]);
  // The caller keys this component on the identity, so a new node remounts it
  // and the attempted-save flag cannot leak across models.
  const identity = `${request.provider}::${request.upstream}`;
  if (!configuration) return null;
  const currentModel = configuration.models.find((record) => record.provider === request.provider && record.upstream_model === request.upstream);
  const targetAvailable = !!currentModel;
  const routingOverlayFields = currentModel?.routing_overlay_fields ?? ["tags", "priority"] as const;
  if (!model || !initial) return null;
  return <ModelDialog
    key={identity} identity={model.upstream_model} canonicalId={model.name}
    fallbackFocusRef={fallbackFocusRef} evidenceVersion={manager.evidenceVersion}
    routingOverlayFields={[...routingOverlayFields]} routingOwnershipUnknown={currentModel?.routing_overlay_fields === undefined}
    currentRouting={currentModel ? draftFromModel(currentModel) : undefined}
    connectionLabel={configuration.providers.find((provider) => provider.id === model.provider)?.display_name || model.provider}
    initial={initial} t={t} pending={manager.pending} querying={manager.querying !== null}
    queryError={manager.queryError} readOnly={!configuration.write_available || !targetAvailable}
    error={editAttempted || manager.errorOwner === "model" ? manager.error : null}
    onDirtyChange={() => undefined}
    onClose={onClose}
    onRefresh={() => void manager.query({ provider_id: model.provider }, "metadata", [model.upstream_model], true)}
    onSave={async (draft) => {
      if (!targetAvailable || !configuration.write_available) return false;
      const confirmed = confirmedModel(model.upstream_model, draft);
      if (!confirmed) return false;
      for (const field of routingOverlayFields) delete confirmed[field];
      setEditAttempted(true);
      return manager.save([{ action: "update_model", model_id: model.name, model: withConfirmedMetadata({ ...confirmed, provider: model.provider }, draft, new Date().toISOString()) }]);
    }}
  />;
}
