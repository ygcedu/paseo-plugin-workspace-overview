import type { ComposerSelection, PaseoProviderModelPreference, ProviderEntry, ProviderModel, ProviderSnapshot, ThinkingOption } from "./types";

export function readPaseoProviderModelPreference(): PaseoProviderModelPreference | null { return null; }
export function readyProviders(snapshot: ProviderSnapshot): ProviderEntry[] {
  return snapshot.entries.filter((entry) => entry.enabled !== false && entry.status === "ready");
}
export function selectableModels(entry: ProviderEntry | null): ProviderModel[] {
  return (entry?.models ?? []).filter((model) => model.isSelectable !== false);
}
export function defaultModel(entry: ProviderEntry | null): ProviderModel | null {
  const models = selectableModels(entry);
  return models.find((model) => model.isDefault) ?? models[0] ?? null;
}
function defaultMode(entry: ProviderEntry | null): { id: string; label?: string } | null {
  if (!entry) return null;
  return entry.modes?.find((mode) => mode.id === entry.defaultModeId) ?? entry.modes?.[0]
    ?? (entry.defaultModeId ? { id: entry.defaultModeId } : null);
}
function defaultThinking(model: ProviderModel | null): ThinkingOption | null {
  if (!model) return null;
  return model.thinkingOptions?.find((option) => option.id === model.defaultThinkingOptionId)
    ?? model.thinkingOptions?.find((option) => option.isDefault) ?? model.thinkingOptions?.[0] ?? null;
}
export function buildSelection(entry: ProviderEntry, model = defaultModel(entry)): ComposerSelection {
  const mode = defaultMode(entry); const thinking = defaultThinking(model);
  return {
    providerId: entry.provider, providerLabel: entry.label ?? entry.provider,
    modelId: model?.id ?? null, modelLabel: model?.label ?? null,
    modeId: mode?.id ?? null, modeLabel: mode?.label ?? mode?.id ?? null,
    thinkingOptionId: thinking?.id ?? null, thinkingLabel: thinking?.label ?? thinking?.id ?? null,
  };
}
export function defaultSelection(snapshot: ProviderSnapshot, preferred: PaseoProviderModelPreference | null = readPaseoProviderModelPreference()): ComposerSelection | null {
  const entries = readyProviders(snapshot);
  const preferredProviderId = preferred?.providerId ?? null;
  const preferredModelId = preferred?.modelId ?? null;
  const preferredEntry = preferredProviderId ? entries.find((item) => item.provider === preferredProviderId) ?? null : null;
  if (preferredEntry) {
    const preferredModel = preferredModelId ? selectableModels(preferredEntry).find((model) => model.id === preferredModelId) ?? null : null;
    return buildSelection(preferredEntry, preferredModel ?? defaultModel(preferredEntry));
  }
  const entry = entries.find((item) => item.provider === "codex")
    ?? entries.find((item) => item.provider.toLowerCase().includes("codex")) ?? entries[0] ?? null;
  return entry ? buildSelection(entry) : null;
}
export function providerModelId(selection: ComposerSelection): string {
  return selection.modelId ? `${selection.providerId}/${selection.modelId}` : selection.providerId;
}
export function providerById(snapshot: ProviderSnapshot | null, providerId: string): ProviderEntry | null {
  return readyProviders(snapshot ?? { entries: [] }).find((entry) => entry.provider === providerId) ?? null;
}
