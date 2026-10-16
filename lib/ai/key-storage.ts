// Dual-provider API key storage. Keys live in their own localStorage entry,
// never in the business JSON or chat records, and can be cleared per provider.

import { isAiProvider, type AiProvider } from './contracts';

export const aiKeyStorageKey = 'blendingpidia-ai-key-v1';

export const aiKeyChangeEvent = 'blendingpidia:ai-key-changed';

export type AiKeyConfig = {
  schemaVersion: 1;
  provider: AiProvider;
  keys: { deepseek?: string; glm?: string };
};

function isKeyConfig(value: unknown): value is AiKeyConfig {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<AiKeyConfig>;
  return (
    record.schemaVersion === 1 &&
    isAiProvider(record.provider) &&
    Boolean(record.keys) &&
    ['deepseek', 'glm'].every(
      (name) =>
        record.keys?.[name as keyof AiKeyConfig['keys']] === undefined ||
        typeof record.keys[name as keyof AiKeyConfig['keys']] === 'string',
    )
  );
}

export type KeyStorageResult =
  | { ok: true; config: AiKeyConfig }
  | { ok: false; reason: 'unavailable' };

export function loadAiKeyConfig(): KeyStorageResult {
  try {
    const raw = localStorage.getItem(aiKeyStorageKey);
    if (raw === null) return { ok: true, config: { schemaVersion: 1, provider: 'deepseek', keys: {} } };
    const parsed: unknown = JSON.parse(raw);
    if (!isKeyConfig(parsed)) {
      // Unreadable key config is not business data; drop it and start fresh.
      localStorage.removeItem(aiKeyStorageKey);
      return { ok: true, config: { schemaVersion: 1, provider: 'deepseek', keys: {} } };
    }
    return { ok: true, config: parsed };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

function writeConfig(config: AiKeyConfig): { ok: true } | { ok: false; reason: 'unavailable' } {
  try {
    localStorage.setItem(aiKeyStorageKey, JSON.stringify(config));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(aiKeyChangeEvent));
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

export function saveProviderKey(provider: AiProvider, key: string) {
  const loaded = loadAiKeyConfig();
  if (!loaded.ok) return loaded;
  const trimmed = key.trim();
  const keys = { ...loaded.config.keys };
  if (trimmed) keys[provider] = trimmed;
  else delete keys[provider];
  // Saving an empty key clears it; the active provider stays valid unless it
  // now has no key, in which case requests simply require reconfiguration.
  return writeConfig({ ...loaded.config, keys });
}

export function clearProviderKey(provider: AiProvider) {
  const loaded = loadAiKeyConfig();
  if (!loaded.ok) return loaded;
  const keys = { ...loaded.config.keys };
  delete keys[provider];
  return writeConfig({ ...loaded.config, keys });
}

export function setActiveProvider(provider: AiProvider) {
  const loaded = loadAiKeyConfig();
  if (!loaded.ok) return loaded;
  return writeConfig({ ...loaded.config, provider });
}

export function activeProviderKey(config: AiKeyConfig) {
  return config.keys[config.provider];
}
