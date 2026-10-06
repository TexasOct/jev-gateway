import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ApiError, api } from "@/shared/api/client";
import type { DiscoveryResult, MetadataItem, MetadataResult, ProviderConfiguration, ProviderOperation, ProviderSelector } from "@/shared/api/types";

type ManagementOwner = "read" | "gateway" | "default" | "model" | "provider";
export type SourceResponse = { selector: ProviderSelector; upstreamModels: string[]; generation: number; configurationGeneration: number };

export function useProviderManagement(enabled: boolean, onUnauthorized: () => void, onCatalogChanged: () => Promise<void>) {
  const [configuration, setConfiguration] = useState<ProviderConfiguration | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [defaultReloadRequired, setDefaultReloadRequired] = useState(false);
  const [pendingOwner, setPendingOwner] = useState<ManagementOwner | null>(null);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [error, setError] = useState<number | null>(null);
  const [errorOwner, setErrorOwner] = useState<ManagementOwner>("read");
  const [catalogRefreshOwner, setCatalogRefreshOwner] = useState<ManagementOwner | null>(null);
  const [modelOperationProviderId, setModelOperationProviderId] = useState<string | null>(null);
  const [modelOperationKind, setModelOperationKind] = useState<"import" | "update_model" | null>(null);
  const [discovery, setDiscovery] = useState<DiscoveryResult | null>(null);
  const [metadata, setMetadata] = useState<MetadataResult | null>(null);
  const [evidence, setEvidence] = useState<MetadataItem[]>([]);
  const [evidenceVersion, setEvidenceVersion] = useState(0);
  const [configurationVersion, setConfigurationVersion] = useState(0);
  const [sourceResponse, setSourceResponse] = useState<SourceResponse | null>(null);
  const [queryRequest, setQueryRequest] = useState<{ selector: ProviderSelector; upstreamModels: string[]; configurationGeneration: number } | null>(null);
  const [catalogRefreshFailed, setCatalogRefreshFailed] = useState(false);
  const [refreshingCatalog, setRefreshingCatalog] = useState(false);
  const [querying, setQuerying] = useState<"discovery" | "metadata" | null>(null);
  const [queryError, setQueryError] = useState<number | null>(null);
  const [lastQueryMode, setLastQueryMode] = useState<"discovery" | "metadata">("discovery");
  const readGeneration = useRef(0);
  const queryGeneration = useRef(0);
  const configurationGeneration = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const writeLock = useRef(false);
  const writeGeneration = useRef(0);
  const catalogRefreshGeneration = useRef(0);
  const navigationGuardRef = useRef<(() => boolean) | null>(null);
  const revision = useRef<string | null>(null);
  const uncertainWrite = useRef(false);
  const activeRef = useRef(enabled);
  const suspensionGeneration = useRef(0);
  useLayoutEffect(() => {
    if (!enabled && activeRef.current) ++suspensionGeneration.current;
    activeRef.current = enabled;
    const generation = suspensionGeneration;
    return () => { activeRef.current = false; ++generation.current; };
  }, [enabled]);

  const cancelQuery = useCallback((preserveResults = false) => {
    ++queryGeneration.current;
    abort.current?.abort();
    if (!preserveResults) { setDiscovery(null); setMetadata(null); setEvidence([]); setSourceResponse(null); }
    setQuerying(null);
    setQueryError(null);
    setQueryRequest(null);
  }, []);

  const failure = useCallback((caught: unknown) => {
    const status = caught instanceof ApiError ? caught.status : 0;
    if (status === 401) {
      ++suspensionGeneration.current;
      activeRef.current = false;
      ++readGeneration.current;
      ++queryGeneration.current;
      abort.current?.abort();
      onUnauthorized();
    }
    return status;
  }, [onUnauthorized]);

  const load = useCallback(async () => {
    if (!activeRef.current || writeLock.current) return;
    const generation = ++readGeneration.current;
    setLoading(true);
    setError(null);
    setErrorOwner("read");
    try {
      const result = await api.providerConfiguration();
      if (generation === readGeneration.current) {
        // The opaque revision also covers credential-file changes invisible in safe views.
        if (revision.current !== null && revision.current !== result.revision) {
          ++configurationGeneration.current;
          setConfigurationVersion(configurationGeneration.current);
          cancelQuery(true);
          setMetadata(null); setEvidence([]); setSourceResponse(null);
          setEvidenceVersion((previous) => previous + 1);
        }
        revision.current = result.revision;
        uncertainWrite.current = false;
        setConfiguration(result);
        setDefaultReloadRequired(false);
      }
    } catch (caught) {
      if (generation === readGeneration.current) setError(failure(caught));
    } finally {
      if (generation === readGeneration.current) setLoading(false);
    }
  }, [failure, cancelQuery]);

  useEffect(() => {
    let active = true;
    if (enabled) void Promise.resolve().then(() => active ? load() : undefined);
    else void Promise.resolve().then(() => {
      if (!active) return;
      setLoading(false);
      cancelQuery(true);
    });
    const reads = readGeneration;
    const queries = queryGeneration;
    const controller = abort;
    return () => { active = false; ++reads.current; ++queries.current; controller.current?.abort(); };
  }, [enabled, load, cancelQuery]);

  const query = useCallback(async (selector: ProviderSelector, mode: "discovery" | "metadata", models: string[] = [], refresh = false) => {
    if (!activeRef.current || writeLock.current) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const generation = ++queryGeneration.current;
    const sourceConfiguration = configurationGeneration.current;
    setQueryRequest({ selector, upstreamModels: models, configurationGeneration: sourceConfiguration });
    setQuerying(mode);
    setLastQueryMode(mode);
    setQueryError(null);
    try {
      if (mode === "discovery") {
        const result = await api.discoverModels(selector, controller.signal);
        if (generation === queryGeneration.current) {
          setSourceResponse({ selector, upstreamModels: result.items.map((item) => item.upstream_model), generation, configurationGeneration: sourceConfiguration });
          setQueryRequest({ selector, upstreamModels: result.items.map((item) => item.upstream_model), configurationGeneration: sourceConfiguration });
          setDiscovery(result);
          setMetadata(null);
          setEvidence(result.items.map((item) => ({ upstream_model: item.upstream_model, ...item.metadata, metadata: item.metadata_envelope })));
          if (result.items.length) {
            setQuerying("metadata"); setLastQueryMode("metadata");
            const enriched = await api.providerMetadata({ ...selector, upstream_models: result.items.map((item) => item.upstream_model), refresh }, controller.signal);
            if (generation === queryGeneration.current) { setMetadata(enriched); setEvidence(enriched.items); }
          }
        }
      } else {
        const result = await api.providerMetadata({ ...selector, upstream_models: models, refresh }, controller.signal);
        if (generation === queryGeneration.current) { setSourceResponse({ selector, upstreamModels: models, generation, configurationGeneration: sourceConfiguration }); setMetadata(result); setEvidence(result.items); }
      }
    } catch (caught) {
      if (!controller.signal.aborted && generation === queryGeneration.current) setQueryError(failure(caught));
    } finally {
      if (generation === queryGeneration.current) setQuerying(null);
    }
  }, [failure]);

  const retryCatalogRefresh = useCallback(async () => {
    if (!activeRef.current) { setCatalogRefreshFailed(true); return; }
    const generation = suspensionGeneration.current;
    const refresh = ++catalogRefreshGeneration.current;
    const ownsRefresh = () => refresh === catalogRefreshGeneration.current;
    const active = () => activeRef.current && generation === suspensionGeneration.current;
    setRefreshingCatalog(true);
    try { await onCatalogChanged(); if (ownsRefresh()) setCatalogRefreshFailed(!active()); }
    catch (caught) {
      if (ownsRefresh()) {
        if (active()) failure(caught);
        setCatalogRefreshFailed(true);
      }
    }
    finally { if (ownsRefresh()) setRefreshingCatalog(false); }
  }, [failure, onCatalogChanged]);

  const recoverUncertainWrite = useCallback(async (current: ProviderConfiguration, generation: number) => {
    if (!uncertainWrite.current) return current;
    const read = ++readGeneration.current;
    const fresh = await api.providerConfiguration();
    if (!activeRef.current || generation !== suspensionGeneration.current || read !== readGeneration.current) return null;
    if (revision.current !== fresh.revision) {
      ++configurationGeneration.current;
      setConfigurationVersion(configurationGeneration.current);
      cancelQuery(true);
      setMetadata(null); setEvidence([]); setSourceResponse(null);
      setEvidenceVersion((previous) => previous + 1);
    }
    revision.current = fresh.revision;
    setConfiguration(fresh);
    setDefaultReloadRequired(false);
    uncertainWrite.current = false;
    return fresh;
  }, [cancelQuery]);

  const save = useCallback(async (operations: ProviderOperation[]) => {
    if (!activeRef.current || writeLock.current || !configuration?.write_available) return false;
    const owner = operations.every((operation) => operation.action === "set_default_model") ? "default" : operations.every((operation) => operation.action === "update_model" || operation.action === "import") ? "model" : "provider";
    if (owner === "default" && defaultReloadRequired) return false;
    writeLock.current = true;
    const modelProviders = owner === "model" ? operations.map((operation) => operation.action === "import" ? operation.provider_id : operation.action === "update_model" ? operation.model.provider ?? configuration.models.find((model) => model.name === operation.model_id)?.provider : undefined) : [];
    const uniqueModelProviders = new Set(modelProviders);
    setModelOperationProviderId(uniqueModelProviders.size === 1 && modelProviders[0] ? modelProviders[0] : null);
    setModelOperationKind(owner === "model" && operations.every((operation) => operation.action === "import") ? "import" : owner === "model" && operations.every((operation) => operation.action === "update_model") ? "update_model" : null);
    const write = ++writeGeneration.current;
    ++catalogRefreshGeneration.current;
    setRefreshingCatalog(false);
    ++readGeneration.current;
    setLoading(false);
    setPendingOwner(owner);
    setPending(true);
    setError(null);
    setErrorOwner(owner);
    setCatalogRefreshOwner(owner);
    setCatalogRefreshFailed(false);
    const generation = suspensionGeneration.current;
    const ownsWrite = () => write === writeGeneration.current;
    const active = () => ownsWrite() && activeRef.current && generation === suspensionGeneration.current;
    let applying = false;
    try {
      const admittedConfiguration = await recoverUncertainWrite(configuration, generation);
      if (!admittedConfiguration || !activeRef.current || generation !== suspensionGeneration.current) return false;
      if (!admittedConfiguration.write_available) { setError(403); return false; }
      const payload = { expected_revision: admittedConfiguration.revision, operations };
      const validation = await api.validateProviders(payload);
      if (!activeRef.current || generation !== suspensionGeneration.current) return false;
      if (!validation.valid) { setError(400); return false; }
      applying = true;
      const result = await api.saveProviders(payload);
      applying = false;
      ++readGeneration.current;
      const connectionChanged = operations.some((operation) => {
        if (operation.action === "delete") return operation.kind === "llm";
        if (operation.action !== "upsert" || operation.kind !== "llm") return false;
        const original = admittedConfiguration.providers.find((provider) => provider.id === operation.provider.id);
        return !original || operation.credential.action !== "keep" ||
          Object.values(operation.transport_credentials ?? {}).some((credential) => credential.action !== "keep") ||
          original.type !== operation.provider.type || original.api_base !== operation.provider.api_base ||
          original.api_key_env !== operation.provider.api_key_env || original.allow_private_network !== operation.provider.allow_private_network ||
          operation.provider.params !== undefined || operation.provider.param_env !== undefined;
      });
      cancelQuery(!connectionChanged);
      if (connectionChanged) { ++configurationGeneration.current; setConfigurationVersion(configurationGeneration.current); setEvidenceVersion((previous) => previous + 1); }
      // A successful local write preserves review of the same candidate configuration.
      revision.current = result.revision;
      setConfiguration(result);
      setImportResult({ imported: result.imported, skipped: result.skipped });
      setLoading(false);
      if (generation !== suspensionGeneration.current) setCatalogRefreshFailed(true);
      else await retryCatalogRefresh();
      return true;
    } catch (caught) {
      if (ownsWrite() && applying && (!(caught instanceof ApiError) || caught.status === 0)) uncertainWrite.current = true;
      if (active()) {
        if (owner === "default" && caught instanceof ApiError && caught.status === 409) setDefaultReloadRequired(true);
        setErrorOwner(owner);
        setError(failure(caught));
      }
      return false;
    } finally {
      // Suspension retires feedback, but the admitted operation still owns the lock.
      if (ownsWrite()) { writeLock.current = false; setPending(false); setPendingOwner(null); }
    }
  }, [configuration, failure, cancelQuery, retryCatalogRefresh, defaultReloadRequired, recoverUncertainWrite]);

  const saveGatewayCredential = useCallback(async (value: string) => {
    if (!activeRef.current || writeLock.current || !configuration || !(configuration.write_available || configuration.gateway_bootstrap_available)) return false;
    writeLock.current = true;
    setModelOperationProviderId(null);
    setModelOperationKind(null);
    const write = ++writeGeneration.current;
    ++catalogRefreshGeneration.current;
    setRefreshingCatalog(false);
    setPendingOwner("gateway");
    ++readGeneration.current;
    cancelQuery(true);
    setPending(true);
    setLoading(false);
    setError(null);
    setErrorOwner("gateway");
    setCatalogRefreshOwner("gateway");
    setCatalogRefreshFailed(false);
    const generation = suspensionGeneration.current;
    const ownsWrite = () => write === writeGeneration.current;
    const active = () => ownsWrite() && activeRef.current && generation === suspensionGeneration.current;
    let applying = false;
    try {
      const admittedConfiguration = await recoverUncertainWrite(configuration, generation);
      if (!admittedConfiguration || !activeRef.current || generation !== suspensionGeneration.current) return false;
      if (!(admittedConfiguration.write_available || admittedConfiguration.gateway_bootstrap_available)) { setError(403); return false; }
      applying = true;
      const result = await api.saveGatewayCredential({ expected_revision: admittedConfiguration.revision, credential: { action: "set", value } });
      applying = false;
      revision.current = result.revision;
      setConfiguration(result);
      if (!active()) setCatalogRefreshFailed(true);
      else await retryCatalogRefresh();
      return true;
    } catch (caught) {
      if (ownsWrite() && applying && (!(caught instanceof ApiError) || caught.status === 0)) uncertainWrite.current = true;
      if (active()) { setErrorOwner("gateway"); setError(failure(caught)); }
      return false;
    } finally {
      if (ownsWrite()) { writeLock.current = false; setPending(false); setPendingOwner(null); }
    }
  }, [configuration, failure, cancelQuery, retryCatalogRefresh, recoverUncertainWrite]);

  return { configurationGeneration: configurationVersion, defaultReloadRequired, configuration, loading, pending, pendingOwner, importResult, error: errorOwner === "gateway" || errorOwner === "default" ? null : error, operationError: error, errorOwner, active: enabled, onUnauthorized, catalogRefreshOwner, modelOperationProviderId, modelOperationKind, sourceResponse, queryRequest, discovery, metadata, evidence, evidenceVersion, catalogRefreshFailed, refreshingCatalog, retryCatalogRefresh, querying, queryError, lastQueryMode, load, save, saveGatewayCredential, query, cancelQuery, navigationGuardRef };
}
export type ProviderManagement = ReturnType<typeof useProviderManagement>;
