'use client';

import { memo } from 'react';
import { ArrowUpRight, Check, X } from 'lucide-react';
import {
  displayIngredientName,
  type ManagedIngredient,
} from '@/lib/ingredient-registry';
import { ui, type Lang } from '@/lib/i18n';

type Props = {
  lang: Lang;
  stockedCount: number;
  stockMode: 'all' | 'makeable' | 'near';
  counts: { all: number; makeable: number; near: number };
  allIngredients: ManagedIngredient[];
  ingredientRegistry: ManagedIngredient[];
  selectedIngredients: string[];
  setStockMode: (mode: 'all' | 'makeable' | 'near') => void;
  toggleIngredient: (id: string) => void;
  clearIngredients: () => void;
};

export const CocktailSidebar = memo(function CocktailSidebar({
  lang,
  stockedCount,
  stockMode,
  counts,
  allIngredients,
  ingredientRegistry,
  selectedIngredients,
  setStockMode,
  toggleIngredient,
  clearIngredients,
}: Props) {
  const t = ui[lang];
  return (
    <aside className="order-2 lg:order-2">
      <div className="sticky top-[100px] space-y-7">
        <section>
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8d9493]">
            {t.aside.stockTitle}
          </p>
          <div className="rounded-2xl border border-[#c88955]/25 bg-[#c88955]/[0.07] p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-2xl font-semibold tracking-tight">
                  {stockedCount}
                </p>
                <p className="mt-1 text-xs text-[#adb1a8]">
                  {t.aside.stockCountLabel}
                </p>
              </div>
              <span className="grid h-8 w-8 place-items-center rounded-full bg-[#78b77a]/15 text-[#91cf94]">
                <Check className="h-4 w-4" />
              </span>
            </div>
            {/* oxlint-disable-next-line nextjs/no-html-link-for-pages -- vinext's current production Link runtime cannot load navigation helpers. */}
            <a
              className="mt-4 flex w-full items-center justify-between border-t border-[#c88955]/20 pt-3 text-xs text-[#e8c197]"
              href="/stock"
            >
              {t.aside.manage} <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </section>
        <section>
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8d9493]">
            {t.aside.availabilityTitle}
          </p>
          <div className="space-y-1">
            {(
              [
                ['all', t.aside.availabilityAll],
                ['makeable', t.aside.availabilityMakeable],
                ['near', t.aside.availabilityNear],
              ] as const
            ).map(([value, label]) => (
              <button
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm ${stockMode === value ? 'bg-white/8 text-[#f3ebdd]' : 'text-[#a6aaa4] hover:bg-white/[0.045]'}`}
                key={value}
                onClick={() => setStockMode(value)}
                type="button"
              >
                <span>{label}</span>
                <span className="text-xs text-[#737a78]">{counts[value]}</span>
              </button>
            ))}
          </div>
        </section>
        <section>
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8d9493]">
            {t.aside.ingredientsTitle}
          </p>
          <div className="flex flex-wrap gap-2 lg:block lg:space-y-1.5">
            {allIngredients.slice(0, 14).map((item) => (
              <button
                className={`rounded-full px-3 py-1.5 text-xs lg:flex lg:w-full lg:items-center lg:justify-between lg:rounded-lg ${selectedIngredients.includes(item.id) ? 'bg-[#c88955]/15 text-[#eac59d]' : 'bg-white/[0.035] text-[#a6aaa4] hover:bg-white/[0.08]'}`}
                key={item.id}
                onClick={() => toggleIngredient(item.id)}
                type="button"
              >
                {displayIngredientName(item.id, ingredientRegistry, lang)}
                {selectedIngredients.includes(item.id) && (
                  <X className="ml-2 inline h-3 w-3 lg:ml-0" />
                )}
              </button>
            ))}
          </div>
          {selectedIngredients.length > 0 && (
            <button
              className="mt-3 text-xs text-[#e8c197]"
              onClick={clearIngredients}
              type="button"
            >
              {t.aside.clearFilters}
            </button>
          )}
        </section>
      </div>
    </aside>
  );
});
