import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api } from "@/shared/api/client";
import type { DiscoveryResult, MetadataItem, MetadataResult, ProviderConfiguration, ProviderOperation, ProviderSelector } from "@/shared/api/types";

export function useProviderManagement(enabled: boolean, onUnauthorized: () => void, onCatalogChanged: () => Promise<void>) {
  const [configuration, setConfiguration] = useState<ProviderConfiguration | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [error, setError] = useState<number | null>(null);
  const [discovery, setDiscovery] = useState<DiscoveryResult | null>(null);
  const [metadata, setMetadata] = useState<MetadataResult | null>(null);
  const [evidence, setEvidence] = useState<MetadataItem[]>([]);
  const [evidenceVersion, setEvidenceVersion] = useState(0);
  const [catalogRefreshFailed, setCatalogRefreshFailed] = useState(false);
  const [refreshingCatalog, setRefreshingCatalog] = useState(false);
  const [querying, setQuerying] = useState<"discovery" | "metadata" | null>(null);
  const [queryError, setQueryError] = useState<number | null>(null);
  const [lastQueryMode, setLastQueryMode] = useState<"discovery" | "metadata">("discovery");
  const readGeneration = useRef(0);
  const queryGeneration = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const writeLock = useRef(false);
  const navigationGuardRef = useRef<(() => boolean) | null>(null);
  const revision = useRef<string | null>(null);

  const cancelQuery = useCallback((preserveResults = false) => {
    ++queryGeneration.current;
    abort.current?.abort();
    if (!preserveResults) { setDiscovery(null); setMetadata(null); setEvidence([]); }
    setQuerying(null);
    setQueryError(null);
  }, []);

  const failure = useCallback((caught: unknown) => {
    const status = caught instanceof ApiError ? caught.status : 0;
    if (status === 401) onUnauthorized();
    return status;
  }, [onUnauthorized]);

  const load = useCallback(async () => {
    const generation = ++readGeneration.current;
    setLoading(true);
    setError(null);
    try {
      const result = await api.providerConfiguration();
      if (generation === readGeneration.current) {
        // The opaque revision also covers credential-file changes invisible in safe views.
        if (revision.current !== null && revision.current !== result.revision) {
          cancelQuery();
          setEvidenceVersion((previous) => previous + 1);
        }
        revision.current = result.revision;
        setConfiguration(result);
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
    const reads = readGeneration;
    const queries = queryGeneration;
    const controller = abort;
    return () => { active = false; ++reads.current; ++queries.current; controller.current?.abort(); };
  }, [enabled, load]);

  const query = useCallback(async (selector: ProviderSelector, mode: "discovery" | "metadata", models: string[] = [], refresh = false) => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const generation = ++queryGeneration.current;
    setQuerying(mode);
    setLastQueryMode(mode);
    setQueryError(null);
    try {
      if (mode === "discovery") {
        const result = await api.discoverModels(selector, controller.signal);
        if (generation === queryGeneration.current) {
          setDiscovery(result);
          setMetadata(null);
          setEvidence(result.items.map((item) => ({ upstream_model: item.upstream_model, ...item.metadata, metadata: item.metadata_envelope })));
        }
      } else {
        const result = await api.providerMetadata({ ...selector, upstream_models: models, refresh }, controller.signal);
        if (generation === queryGeneration.current) { setMetadata(result); setEvidence(result.items); }
      }
    } catch (caught) {
      if (!controller.signal.aborted && generation === queryGeneration.current) setQueryError(failure(caught));
    } finally {
      if (generation === queryGeneration.current) setQuerying(null);
    }
  }, [failure]);

  const retryCatalogRefresh = useCallback(async () => {
    setRefreshingCatalog(true);
    try { await onCatalogChanged(); setCatalogRefreshFailed(false); }
    catch (caught) { failure(caught); setCatalogRefreshFailed(true); }
    finally { setRefreshingCatalog(false); }
  }, [failure, onCatalogChanged]);

  const save = useCallback(async (operations: ProviderOperation[]) => {
    if (writeLock.current || !configuration?.write_available) return false;
    writeLock.current = true;
    setPending(true);
    setError(null);
    setCatalogRefreshFailed(false);
    const payload = { expected_revision: configuration.revision, operations };
    try {
      const validation = await api.validateProviders(payload);
      if (!validation.valid) { setError(400); return false; }
      const result = await api.saveProviders(payload);
      ++readGeneration.current;
      cancelQuery(true);
      // A successful local write preserves review of the same candidate configuration.
      revision.current = result.revision;
      setConfiguration(result);
      setImportResult({ imported: result.imported, skipped: result.skipped });
      setLoading(false);
      await retryCatalogRefresh();
      return true;
    } catch (caught) {
      setError(failure(caught));
      return false;
    } finally { writeLock.current = false; setPending(false); }
  }, [configuration, failure, cancelQuery, retryCatalogRefresh]);

  const saveGatewayCredential = useCallback(async (value: string) => {
    if (writeLock.current || !configuration || !(configuration.write_available || configuration.gateway_bootstrap_available)) return false;
    writeLock.current = true;
    ++readGeneration.current;
    cancelQuery();
    setPending(true);
    setLoading(false);
    setError(null);
    setCatalogRefreshFailed(false);
    try {
      const result = await api.saveGatewayCredential({ expected_revision: configuration.revision, credential: { action: "set", value } });
      revision.current = result.revision;
      setConfiguration(result);
      await retryCatalogRefresh();
      return true;
    } catch (caught) {
      setError(failure(caught));
      return false;
    } finally { writeLock.current = false; setPending(false); }
  }, [configuration, failure, cancelQuery, retryCatalogRefresh]);

  return { configuration, loading, pending, importResult, error, discovery, metadata, evidence, evidenceVersion, catalogRefreshFailed, refreshingCatalog, retryCatalogRefresh, querying, queryError, lastQueryMode, load, save, saveGatewayCredential, query, cancelQuery, navigationGuardRef };
}
export type ProviderManagement = ReturnType<typeof useProviderManagement>;
