import { useEffect, useState } from "react";

import { DEFAULT_TERMINAL_PROFILES, PROVIDER_READY_TIMEOUT_MS } from "./constants";
import type { ComposerSelection, PaseoClient, ProviderSnapshot, TerminalProfile } from "./types";
import { defaultSelection, readPaseoProviderModelPreference, readyProviders } from "./provider-selection";

export function useTerminalProfiles(paseo: PaseoClient): TerminalProfile[] {
  const [profiles, setProfiles] = useState<TerminalProfile[]>(DEFAULT_TERMINAL_PROFILES);
  useEffect(() => {
    let cancelled = false;
    void paseo.config.get().then(({ config }) => {
      if (!cancelled && Array.isArray(config.terminalProfiles)) {
        setProfiles(config.terminalProfiles.map((profile) => ({ ...profile, args: profile.args ?? [] })));
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [paseo]);
  return profiles;
}

async function loadProviderCatalog(paseo: PaseoClient, cwd?: string): Promise<ProviderSnapshot> {
  const initial = await paseo.providers.snapshot({ cwd }) as ProviderSnapshot;
  const entries = await Promise.all(initial.entries.map(async (entry) => {
    if (entry.enabled === false) return entry;
    const provider = entry.provider as Parameters<typeof paseo.providers.listModels>[0];
    const [modelsResult, modesResult] = await Promise.allSettled([
      paseo.providers.listModels(provider, { cwd }),
      paseo.providers.listModes(provider, { cwd }),
    ]);
    const models = modelsResult.status === "fulfilled" ? modelsResult.value.models : entry.models;
    return {
      ...entry,
      status: models?.length ? "ready" : entry.status,
      models,
      modes: modesResult.status === "fulfilled" ? modesResult.value.modes : entry.modes,
    };
  }));
  return { ...initial, entries };
}

export function useProviderCatalog(paseo: PaseoClient, cwd: string) {
  const [snapshot, setSnapshot] = useState<ProviderSnapshot | null>(null);
  const [selection, setSelection] = useState<ComposerSelection | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cwd) return;
    let cancelled = false;
    setLoading(true); setError(null); setSnapshot(null); setSelection(null);
    const requireReadyProviders = (next: ProviderSnapshot): ProviderSnapshot => {
      if (!readyProviders(next).length) {
        const details = next.entries.filter((entry) => entry.enabled !== false)
          .map((entry) => `${entry.label ?? entry.provider}: ${entry.status}${entry.error ? ` (${entry.error})` : ""}`);
        throw new Error(details.length ? `Provider 尚不可用：${details.join("；")}` : "主机未返回已启用的 Provider");
      }
      return next;
    };
    // An incomplete snapshot or an unsupported wait API must not win over
    // the other discovery path before it has returned usable providers.
    const localCatalog = Promise.any([
      loadProviderCatalog(paseo, cwd).then(requireReadyProviders),
      paseo.providers.waitForReady({ cwd, timeoutMs: PROVIDER_READY_TIMEOUT_MS }).then(requireReadyProviders),
    ]);
    void localCatalog.catch(async (localError: unknown) => {
      // Global discovery can remain usable when directory-specific discovery fails.
      try {
        return requireReadyProviders(await loadProviderCatalog(paseo));
      } catch (globalError) {
        const failures = localError instanceof AggregateError ? localError.errors : [localError];
        throw new AggregateError([...failures, globalError]);
      }
    }).then((nextSnapshot) => {
      if (cancelled) return;
      setSnapshot(nextSnapshot);
      setSelection(defaultSelection(nextSnapshot, readPaseoProviderModelPreference()));
    }).catch((loadError: unknown) => {
      if (!cancelled) {
        const failures = loadError instanceof AggregateError ? loadError.errors : [loadError];
        setError([...new Set(failures.map((failure) => failure instanceof Error ? failure.message : String(failure)))].join("\n"));
      }
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [cwd, paseo]);

  return { snapshot, selection, setSelection, loading, error };
}
