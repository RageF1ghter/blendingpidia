'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentPropsWithoutRef } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  AlertTriangle,
  Bot,
  Eraser,
  Send,
  Settings2,
  Square,
  X,
} from 'lucide-react';
import { useAiAssistant } from '@/hooks/use-ai-assistant';
import { activeProviderKey } from '@/lib/ai/key-storage';
import type { AiErrorCode } from '@/lib/ai/contracts';
import { ApiKeySettings } from './api-key-settings';
import { OperationPreview } from './operation-preview';
import { ui } from '@/lib/i18n';

type SidebarProps = {
  lang: 'zh' | 'en';
  open: boolean;
  onClose: () => void;
  resolveRecipeName: (recipeId: string) => string | undefined;
};

const sidebarWidthStorageKey = 'blendingpidia-ai-sidebar-width';
const defaultSidebarWidth = 430;
const minSidebarWidth = 320;
const maxSidebarWidth = 720;

function clampSidebarWidth(candidate: number) {
  const viewportCap = Math.min(maxSidebarWidth, window.innerWidth * 0.9);
  return Math.max(minSidebarWidth, Math.min(candidate, viewportCap));
}

const assistantMarkdownClass =
  'text-sm leading-6 [&_a]:no-underline [&_blockquote]:my-1.5 [&_blockquote]:border-l-2 [&_blockquote]:border-white/15 [&_blockquote]:pl-3 [&_blockquote]:text-[#c9cec9] [&_code]:rounded [&_code]:bg-black/30 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_em]:italic [&_h1]:mb-1 [&_h1]:mt-2 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mb-1 [&_h2]:mt-2 [&_h2]:font-semibold [&_h3]:mb-1 [&_h3]:mt-1.5 [&_h3]:font-medium [&_h4]:mb-1 [&_h4]:mt-1.5 [&_h4]:font-medium [&_hr]:my-3 [&_hr]:border-white/10 [&_li]:my-0.5 [&_li>p]:m-0 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:m-0 [&_p]:whitespace-pre-wrap [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-black/30 [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-xs [&_strong]:font-semibold [&_strong]:text-[#f6e7d2] [&_table]:my-2 [&_table]:w-full [&_table]:text-xs [&_td]:border [&_td]:border-white/10 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-white/10 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5';

function AssistantLink({ href, children }: ComponentPropsWithoutRef<'a'>) {
  // Only app-verified recipe references become pills; model-fed external
  // links render as inert text and never navigate (design rule).
  if (typeof href === 'string' && /^recipe:[A-Za-z0-9_.-]+$/.test(href)) {
    return (
      <span className="mx-0.5 inline-flex items-center rounded-full border border-[#c88955]/40 bg-[#c88955]/10 px-2 py-0.5 text-xs text-[#f1d4af]">
        {children}
      </span>
    );
  }
  return <span className="text-[#c9cec9] underline decoration-white/25">{children}</span>;
}

function AssistantText({
  text,
  resolveRecipeName,
}: {
  text: string;
  resolveRecipeName: (recipeId: string) => string | undefined;
}) {
  const normalized = useMemo(
    () =>
      text.replace(/recipe:([A-Za-z0-9_.-]+)/g, (whole, recipeId: string) => {
        const name = resolveRecipeName(recipeId);
        return name ? `[${name.replace(/[[\]]/g, '')}](recipe:${recipeId})` : whole;
      }),
    [text, resolveRecipeName],
  );
  return (
    <div className={assistantMarkdownClass}>
      {/* Custom schemes (recipe:) survive url sanitizing; AssistantLink is the
          single gate that decides what renders as a pill and nothing renders
          as a navigable link. */}
      <Markdown
        components={{ a: AssistantLink }}
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) => url}
      >
        {normalized}
      </Markdown>
    </div>
  );
}

export function AssistantSidebar({ lang, open, onClose, resolveRecipeName }: SidebarProps) {
  const t = ui[lang].ai;
  const assistant = useAiAssistant(lang);
  const [input, setInput] = useState('');
  // Null keeps the derived default: settings expand while no key is set.
  const [settingsOverride, setSettingsOverride] = useState<boolean | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(defaultSidebarWidth);
  const widthRef = useRef(defaultSidebarWidth);
  const dragPointerRef = useRef<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(sidebarWidthStorageKey);
      if (raw === null) return;
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) {
        const clamped = clampSidebarWidth(parsed);
        widthRef.current = clamped;
        setSidebarWidth(clamped);
      }
    } catch {
      // storage unavailable: keep the default width
    }
  }, []);

  const applyDraggedWidth = (candidate: number) => {
    const clamped = clampSidebarWidth(candidate);
    widthRef.current = clamped;
    setSidebarWidth(clamped);
  };

  const endResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragPointerRef.current !== event.pointerId) return;
    dragPointerRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // capture already released
    }
    try {
      localStorage.setItem(sidebarWidthStorageKey, String(widthRef.current));
    } catch {
      // persistence best-effort; width still applies for this session
    }
  };

  useEffect(() => {
    const container = listRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [assistant.messages, assistant.draft, assistant.proposals, open]);

  // Publish the live width so the page content can reflow alongside the
  // sidebar (push layout) instead of being covered by it.
  useEffect(() => {
    if (!open) return;
    document.documentElement.style.setProperty('--ai-sidebar-w', `${sidebarWidth}px`);
    return () => {
      document.documentElement.style.removeProperty('--ai-sidebar-w');
    };
  }, [open, sidebarWidth]);

  const showSettings =
    settingsOverride ??
    (Boolean(assistant.keyConfig) && !activeProviderKey(assistant.keyConfig!));

  if (!open) return null;

  const busy = assistant.status !== 'idle';
  const providerLabel =
    assistant.activeProvider === 'glm' ? t.providerGlm : assistant.activeProvider === 'deepseek' ? t.providerDeepseek : '';
  const missingKey = Boolean(assistant.keyConfig) && !activeProviderKey(assistant.keyConfig!);

  const submit = () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    void assistant.send(text);
  };

  return (
    <>
      {/* Mobile keeps the dismiss overlay; on desktop the sidebar pushes the
          page instead of covering it, so the content stays interactive. */}
      <button
        aria-label={t.open}
        className="fixed inset-0 z-40 cursor-default bg-black/50 md:hidden"
        onClick={onClose}
        type="button"
      />
      <aside
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[430px] flex-col border-l border-white/10 bg-[#15181a] text-[#f3ebdd] shadow-2xl max-md:w-full! max-md:max-w-full!"
        style={{ width: sidebarWidth, maxWidth: 'min(90vw, 720px)' }}
      >
        <div
          aria-label={t.resize}
          aria-orientation="vertical"
          className="absolute left-0 top-0 z-10 hidden h-full w-1.5 cursor-col-resize touch-none transition-colors hover:bg-[#c88955]/50 md:block"
          onPointerCancel={endResize}
          onPointerDown={(event) => {
            dragPointerRef.current = event.pointerId;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (dragPointerRef.current !== event.pointerId) return;
            event.preventDefault();
            applyDraggedWidth(window.innerWidth - event.clientX);
          }}
          onPointerUp={endResize}
          role="separator"
        />
        <header className="flex items-center gap-2 border-b border-white/8 px-4 py-3">
          <span className="grid h-8 w-8 place-items-center rounded-full border border-[#c88955]/55 bg-[#c88955]/10 text-[#e8c197]">
            <Bot className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-medium">{t.title}</h2>
            <p className="truncate text-[10px] text-[#8d9493]">
              {providerLabel ? t.usageNote.replace('{provider}', providerLabel) : t.subtitle}
            </p>
          </div>
          <button
            aria-label={t.settings}
            className={`grid h-8 w-8 place-items-center rounded-lg transition hover:bg-white/8 ${showSettings ? 'text-[#e8c197]' : 'text-[#9ca3a7]'}`}
            onClick={() => setSettingsOverride(!showSettings)}
            type="button"
          >
            <Settings2 className="h-4 w-4" />
          </button>
          <button
            aria-label={t.clear}
            className="grid h-8 w-8 place-items-center rounded-lg text-[#9ca3a7] transition hover:bg-white/8 hover:text-[#f0bbb4]"
            onClick={() => {
              if (window.confirm(t.clearConfirm)) void assistant.clearChat();
            }}
            title={t.clear}
            type="button"
          >
            <Eraser className="h-4 w-4" />
          </button>
          <button
            aria-label={t.close}
            className="grid h-8 w-8 place-items-center rounded-lg text-[#9ca3a7] transition hover:bg-white/8 hover:text-[#f3ebdd]"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {showSettings && assistant.keyConfig && (
          <div className="border-b border-white/8 px-4 py-3">
            <ApiKeySettings
              lang={lang}
              provider={assistant.keyConfig.provider}
              savedProviders={{
                deepseek: Boolean(assistant.keyConfig.keys.deepseek),
                glm: Boolean(assistant.keyConfig.keys.glm),
              }}
              onConfigChange={assistant.reloadKeyConfig}
            />
          </div>
        )}

        {(assistant.keyStorageFailed || assistant.chatStorageFailed || assistant.dataChangedNotice) && (
          <div className="grid gap-1 border-b border-white/8 px-4 py-2 text-[11px] text-[#f0bbb4]">
            {assistant.keyStorageFailed && (
              <span className="flex items-center gap-1.5"><AlertTriangle className="h-3 w-3" /> {t.keyStorageWarning}</span>
            )}
            {assistant.chatStorageFailed && (
              <span className="flex items-center gap-1.5"><AlertTriangle className="h-3 w-3" /> {t.storageWarning}</span>
            )}
            {assistant.dataChangedNotice && <span>{t.dataChanged}</span>}
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4" ref={listRef}>
          {assistant.messages.length === 0 && !assistant.draft && (
            <p className="my-auto text-center text-xs text-[#8d9493]">{t.emptyHistory}</p>
          )}
          {assistant.messages.map((message) => {
            if (message.kind === 'notice') {
              return message.content === '[tool-round-limit]' ? (
                <p key={message.id} className="text-center text-[10px] text-[#8d9493]">…</p>
              ) : null;
            }
            if (message.role === 'user') {
              return (
                <div className="flex justify-end" key={message.id}>
                  <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-[#c88955]/20 px-3.5 py-2 text-sm leading-6 text-[#f6e7d2]">
                    {message.content}
                  </p>
                </div>
              );
            }
            if (message.role === 'assistant' && message.content) {
              return (
                <div className="max-w-[92%]" key={message.id}>
                  <AssistantText resolveRecipeName={resolveRecipeName} text={message.content} />
                </div>
              );
            }
            return null;
          })}
          {assistant.draft && (
            <div className="max-w-[92%]">
              <AssistantText resolveRecipeName={resolveRecipeName} text={assistant.draft} />
            </div>
          )}
          {busy && (
            <p className="text-[11px] text-[#8d9493]">
              {assistant.status === 'resolving_tools' ? t.resolving : t.thinking}
            </p>
          )}
          {assistant.proposals.length > 0 && (
            <section className="grid gap-2.5">
              {assistant.proposals.map((proposal) => (
                <OperationPreview
                  confirming={assistant.confirmingProposalId === proposal.proposalId}
                  key={proposal.proposalId}
                  lang={lang}
                  onCancel={assistant.cancelProposal}
                  onConfirm={assistant.confirmProposal}
                  proposal={proposal}
                />
              ))}
            </section>
          )}
        </div>

        {assistant.error && (
          <div className="border-t border-[#d46d60]/25 bg-[#d46d60]/[0.07] px-4 py-2 text-xs text-[#f0bbb4]">
            {t.errors[assistant.error.code as AiErrorCode] ?? assistant.error.code}
            {assistant.error.detail ? ` (${assistant.error.detail})` : ''}
          </div>
        )}
        {missingKey && !assistant.error && (
          <div className="border-t border-[#c88955]/25 bg-[#c88955]/[0.06] px-4 py-2 text-xs text-[#f1d4af]">
            {t.noKey}
          </div>
        )}

        <form
          className="flex items-end gap-2 border-t border-white/8 px-4 py-3"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <textarea
            className="max-h-32 min-h-10 flex-1 resize-none rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-[#f3ebdd] outline-none placeholder:text-[#858c8b] focus:border-[#c88955]/70"
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            placeholder={t.placeholder}
            rows={1}
            value={input}
          />
          {busy ? (
            <button
              aria-label={t.stop}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/12 text-[#f0bbb4] transition hover:bg-white/6"
              onClick={() => assistant.stop()}
              type="button"
            >
              <Square className="h-4 w-4" />
            </button>
          ) : (
            <button
              aria-label={t.send}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#c88955] text-[#1a1512] transition hover:bg-[#deb07f] disabled:opacity-40"
              disabled={!input.trim()}
              type="submit"
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </form>
      </aside>
    </>
  );
}
