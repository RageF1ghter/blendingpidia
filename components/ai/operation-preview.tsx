'use client';

import { Archive, ArrowRight, Check, PackagePlus, Pencil, Plus, X } from 'lucide-react';
import type { AiErrorCode } from '@/lib/ai/contracts';
import type { OperationImpact, OperationProposal, PreviewValue, RecipePreview } from '@/lib/ai/operations';
import { ui } from '@/lib/i18n';

function RecipeFields({ lang, recipe }: { lang: 'zh' | 'en'; recipe: RecipePreview }) {
  const t = ui[lang].ai.proposal.field;
  const rows = recipe.rows
    .map((row) => `${row.name}${row.measure ? ` — ${row.measure}` : ''}`)
    .join(lang === 'zh' ? '；' : '; ');
  return (
    <div className="grid gap-1 text-xs text-[#c5c5bd]">
      <span><span className="text-[#8d9493]">{t.name}: </span>{recipe.name}</span>
      <span><span className="text-[#8d9493]">{t.method}: </span>{recipe.method} · {recipe.glass}</span>
      <span><span className="text-[#8d9493]">{t.ingredients}: </span>{rows}</span>
      {recipe.instructions && (
        <span className="whitespace-pre-line"><span className="text-[#8d9493]">{t.instructions}: </span>{recipe.instructions}</span>
      )}
    </div>
  );
}

function PreviewBlock({ lang, value }: { lang: 'zh' | 'en'; value: PreviewValue | null }) {
  const t = ui[lang].ai.proposal;
  if (!value) return null;
  if (value.type === 'recipe') return <RecipeFields lang={lang} recipe={value.recipe} />;
  if (value.type === 'ingredient') {
    return (
      <div className="grid gap-1 text-xs text-[#c5c5bd]">
        <span>{value.ingredient.nameEn} / {value.ingredient.nameZh}</span>
        <span className="text-[#8d9493]">{value.ingredient.category}</span>
        {value.ingredient.archived && <span className="text-[#e8c197]">{t.field.archived}: ✓</span>}
      </div>
    );
  }
  return (
    <div className="text-xs text-[#c5c5bd]">
      {value.nameEn} / {value.nameZh} — {value.present ? '✓' : '✗'}
    </div>
  );
}

function impactText(lang: 'zh' | 'en', impact: OperationImpact) {
  const t = ui[lang].ai.proposal.impact;
  switch (impact.kind) {
    case 'duplicateRecipeName': return t.duplicateRecipeName.replace('{name}', impact.name);
    case 'missingInStockRows': return t.missingInStockRows.replace('{names}', impact.names.join(lang === 'zh' ? '、' : ', '));
    case 'leavesStock': return t.leavesStock;
    case 'removedFromStock': return t.removedFromStock;
    case 'entersStock': return t.entersStock;
    case 'recipesAffected': return t.recipesAffected.replace('{count}', String(impact.count));
    case 'parentLink': return t.parentLink.replace('{name}', impact.parentName);
    case 'adaptedFromBuiltIn': return t.adaptedFromBuiltIn.replace('{name}', impact.parentName);
    case 'createdAsCustom': return t.createdAsCustom;
  }
}

function actionLabel(lang: 'zh' | 'en', proposal: OperationProposal) {
  const t = ui[lang].ai.proposal;
  const payload = proposal.operation.payload;
  if (payload.kind === 'createRecipe') return t.createRecipe;
  if (payload.kind === 'updateRecipe') return t.updateRecipe;
  if (payload.kind === 'setStock') return payload.present ? t.setStockPresent : t.setStockAbsent;
  if (payload.kind === 'createIngredient') return t.createIngredient;
  return t.archiveIngredient;
}

function ActionIcon({ proposal }: { proposal: OperationProposal }) {
  const kind = proposal.operation.payload.kind;
  if (kind === 'createRecipe') return <Plus className="h-3.5 w-3.5" />;
  if (kind === 'updateRecipe') return <Pencil className="h-3.5 w-3.5" />;
  if (kind === 'archiveIngredient') return <Archive className="h-3.5 w-3.5" />;
  if (kind === 'createIngredient') return <PackagePlus className="h-3.5 w-3.5" />;
  return <Check className="h-3.5 w-3.5" />;
}

export function OperationPreview({
  lang,
  proposal,
  confirming,
  onConfirm,
  onCancel,
}: {
  lang: 'zh' | 'en';
  proposal: OperationProposal;
  confirming: boolean;
  onConfirm: (proposalId: string) => void;
  onCancel: (proposalId: string) => void;
}) {
  const t = ui[lang].ai.proposal;
  const statusKey =
    proposal.status === 'committed' && proposal.errorCode === 'REPLAYED'
      ? 'replayed'
      : proposal.status === 'awaiting_confirmation'
        ? 'awaiting'
        : proposal.status;
  const statusText = t.status[statusKey];
  const isStale = proposal.status === 'stale';
  const actionable = proposal.status === 'awaiting_confirmation';

  return (
    <article
      className={`grid gap-2.5 rounded-xl border p-3 ${
        proposal.status === 'committed'
          ? 'border-[#78b77a]/35 bg-[#78b77a]/[0.07]'
          : isStale || proposal.status === 'failed'
            ? 'border-[#d46d60]/35 bg-[#d46d60]/[0.06]'
            : 'border-[#c88955]/40 bg-[#c88955]/[0.07]'
      }`}
    >
      <header className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-[#f1d4af]">
          <ActionIcon proposal={proposal} />
          {actionLabel(lang, proposal)}
        </span>
        <span className={`text-[10px] ${proposal.status === 'committed' ? 'text-[#a4dca6]' : 'text-[#9ca3a7]'}`}>
          {statusText}
        </span>
      </header>

      {proposal.before && (
        <div className="grid gap-1">
          <span className="text-[10px] uppercase tracking-[0.12em] text-[#8d9493]">{t.before}</span>
          <PreviewBlock lang={lang} value={proposal.before} />
        </div>
      )}
      {proposal.before && <div className="flex items-center gap-1 text-[#8d9493]"><ArrowRight className="h-3 w-3" /></div>}
      <div className="grid gap-1">
        {proposal.before && <span className="text-[10px] uppercase tracking-[0.12em] text-[#8d9493]">{t.after}</span>}
        <PreviewBlock lang={lang} value={proposal.after} />
      </div>

      {proposal.impacts.length > 0 && (
        <ul className="grid gap-1 border-t border-white/8 pt-2 text-[11px] text-[#e8c197]">
          {proposal.impacts.map((impact, index) => (
            <li key={index}>· {impactText(lang, impact)}</li>
          ))}
        </ul>
      )}

      {isStale && <p className="text-[11px] text-[#f0bbb4]">{t.staleHint}</p>}
      {proposal.status === 'failed' && proposal.errorCode && (
        <p className="text-[11px] text-[#f0bbb4]">
          {ui[lang].ai.errors[proposal.errorCode as AiErrorCode] ?? proposal.errorCode}
        </p>
      )}

      {actionable && (
        <div className="flex justify-end gap-2">
          <button
            className="rounded-lg px-3 py-1.5 text-xs text-[#aeb2aa] transition hover:bg-white/6"
            onClick={() => onCancel(proposal.proposalId)}
            type="button"
          >
            <span className="flex items-center gap-1"><X className="h-3 w-3" /> {t.cancel}</span>
          </button>
          <button
            className="rounded-lg bg-[#c88955] px-3 py-1.5 text-xs font-medium text-[#1a1512] transition hover:bg-[#deb07f] disabled:opacity-50"
            disabled={confirming}
            onClick={() => onConfirm(proposal.proposalId)}
            type="button"
          >
            {confirming ? <span className="flex items-center gap-1">{t.status.committing}</span> : <span className="flex items-center gap-1"><Check className="h-3 w-3" /> {t.confirm}</span>}
          </button>
        </div>
      )}
    </article>
  );
}
