'use client';

import { useState } from 'react';
import { Bot, Check, EyeOff, KeyRound, Trash2 } from 'lucide-react';
import type { AiProvider } from '@/lib/ai/contracts';
import {
  clearProviderKey,
  saveProviderKey,
  setActiveProvider,
} from '@/lib/ai/key-storage';
import { ui } from '@/lib/i18n';

type ProviderKeyState = { input: string; notice: string; error: boolean };

export function ApiKeySettings({
  lang,
  provider,
  savedProviders,
  onConfigChange,
}: {
  lang: 'zh' | 'en';
  provider: AiProvider;
  savedProviders: Record<AiProvider, boolean>;
  onConfigChange: () => void;
}) {
  const t = ui[lang].ai;
  const [states, setStates] = useState<Record<AiProvider, ProviderKeyState>>({
    deepseek: { input: '', notice: '', error: false },
    glm: { input: '', notice: '', error: false },
  });

  const patch = (name: AiProvider, patchValue: Partial<ProviderKeyState>) => {
    setStates((current) => ({ ...current, [name]: { ...current[name], ...patchValue } }));
  };

  const save = (name: AiProvider) => {
    const result = saveProviderKey(name, states[name].input);
    if (result.ok) {
      patch(name, { input: '', notice: t.keySavedNotice, error: false });
    } else {
      patch(name, { notice: t.keySaveFailed, error: true });
    }
    onConfigChange();
  };

  const clear = (name: AiProvider) => {
    const result = clearProviderKey(name);
    if (result.ok) patch(name, { input: '', notice: t.keyClearedNotice, error: false });
    else patch(name, { notice: t.keySaveFailed, error: true });
    onConfigChange();
  };

  const switchProvider = (name: AiProvider) => {
    const result = setActiveProvider(name);
    if (result.ok) setStates((current) => ({
      deepseek: { ...current.deepseek, notice: '' },
      glm: { ...current.glm, notice: '' },
    }));
    onConfigChange();
  };

  const providerName = (name: AiProvider) =>
    name === 'deepseek' ? t.providerDeepseek : t.providerGlm;

  return (
    <section className="grid gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8d9493]">
        <KeyRound className="h-3.5 w-3.5" /> {t.settings}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(['deepseek', 'glm'] as AiProvider[]).map((name) => (
          <button
            className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs transition ${
              provider === name
                ? 'border-[#c88955]/60 bg-[#c88955]/15 text-[#f1d4af]'
                : 'border-white/10 text-[#aeb2aa] hover:bg-white/6'
            }`}
            key={name}
            onClick={() => switchProvider(name)}
            type="button"
          >
            {provider === name && <Check className="h-3 w-3" />}
            {providerName(name)}
            {savedProviders[name] && <EyeOff className="h-3 w-3 opacity-60" />}
          </button>
        ))}
      </div>
      {(['deepseek', 'glm'] as AiProvider[]).map((name) => (
        <div className="grid gap-1.5" key={name}>
          <span className="text-[11px] text-[#8d9493]">
            {t.keyLabel.replace('{provider}', providerName(name))}
            {savedProviders[name] ? ` · ${t.keyMasked}` : ''}
          </span>
          <div className="flex gap-1.5">
            <input
              autoComplete="off"
              className="h-9 min-w-0 flex-1 rounded-lg border border-white/10 bg-black/20 px-3 text-xs text-[#f3ebdd] outline-none focus:border-[#c88955]/70"
              onChange={(event) => patch(name, { input: event.target.value, notice: '' })}
              onKeyDown={(event) => {
                if (event.key === 'Enter') save(name);
              }}
              placeholder={t.keyPlaceholder}
              type="password"
              value={states[name].input}
            />
            <button
              className="shrink-0 rounded-lg bg-[#c88955] px-3 text-xs font-medium text-[#1a1512] transition hover:bg-[#deb07f] disabled:opacity-40"
              disabled={!states[name].input.trim()}
              onClick={() => save(name)}
              type="button"
            >
              {t.saveKey}
            </button>
            <button
              aria-label={t.clearKey}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[#9ca3a7] transition hover:bg-white/8 hover:text-[#f0bbb4] disabled:opacity-30"
              disabled={!savedProviders[name]}
              onClick={() => clear(name)}
              title={t.clearKey}
              type="button"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          {states[name].notice && (
            <span className={`text-[11px] ${states[name].error ? 'text-[#f0bbb4]' : 'text-[#a4dca6]'}`}>
              {states[name].notice}
            </span>
          )}
        </div>
      ))}
      <p className="flex items-start gap-1.5 text-[10px] leading-4 text-[#8d9493]">
        <Bot className="mt-0.5 h-3 w-3 shrink-0" />
        {t.subtitle}
      </p>
    </section>
  );
}
