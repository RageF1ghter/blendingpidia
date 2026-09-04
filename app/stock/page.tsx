'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Search, X } from 'lucide-react';
import { LanguageToggle } from '@/components/language-toggle';
import { useLang } from '@/hooks/use-lang';
import { fuzzyMatch, initialStock, storageKey, type Cocktail } from '@/lib/data';
import { ingredientCatalog, ingredientCategoryOrder, type IngredientCategory } from '@/lib/ingredients';
import { categoryNames, ingredientNames, labels, term, ui, type TermMap } from '@/lib/i18n';

type SavedData = { stock?: string[]; liked?: string[]; customRecipes?: Cocktail[] };

function readSaved(): SavedData {
  try {
    const saved = localStorage.getItem(storageKey);
    return saved ? (JSON.parse(saved) as SavedData) : {};
  } catch {
    return {};
  }
}

export default function StockPage() {
  const [lang, setLang] = useLang();
  const [stock, setStock] = useState<string[]>(initialStock);
  const [customRecipes, setCustomRecipes] = useState<Cocktail[]>([]);
  const [query, setQuery] = useState('');

  const t = ui[lang];
  const tr = (map: TermMap, value: string) => term(map, value, lang);

  useEffect(() => {
    const data = readSaved();
    if (data.stock) setStock(data.stock);
    if (data.customRecipes) setCustomRecipes(data.customRecipes);
  }, []);

  const customOnlyIngredients = useMemo(() => {
    const catalogSet = new Set(ingredientCatalog.map((item) => item.name));
    return [...new Set(customRecipes.flatMap((item) => item.ingredients))].filter((name) => !catalogSet.has(name)).sort();
  }, [customRecipes]);

  const totalCount = ingredientCatalog.length + customOnlyIngredients.length;

  const groups = useMemo(() => {
    const normalized = query.trim();
    const matches = (name: string) => !normalized || fuzzyMatch(normalized, `${name} ${term(ingredientNames, name, 'zh')}`);
    const result: { category: IngredientCategory | 'other'; items: string[] }[] = [];
    for (const category of ingredientCategoryOrder) {
      const items = ingredientCatalog
        .filter((item) => item.category === category)
        .map((item) => item.name)
        .filter(matches);
      if (items.length) result.push({ category, items });
    }
    const other = customOnlyIngredients.filter(matches);
    if (other.length) result.push({ category: 'other', items: other });
    return result;
  }, [customOnlyIngredients, query]);

  function toggleStock(item: string) {
    const next = stock.includes(item) ? stock.filter((value) => value !== item) : [...stock, item];
    setStock(next);
    localStorage.setItem(storageKey, JSON.stringify({ ...readSaved(), stock: next }));
  }

  return (
    <main className="min-h-screen bg-[#0e1011] text-[#f3ebdd]">
      <header className="sticky top-0 z-30 border-b border-white/8 bg-[#0e1011]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[76px] max-w-[900px] items-center gap-3 px-4 lg:px-9">
          <Link aria-label={t.stockPage.back} className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 text-[#d2d4cc] transition hover:bg-white/6 hover:text-[#f3ebdd]" href="/"><ArrowLeft className="h-4 w-4" /></Link>
          <h1 className="font-serif text-xl tracking-tight">{labels.stockPageTitle}</h1>
          <label className="relative ml-auto max-w-[340px] flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3a7]" />
            <input aria-label={t.stockPage.searchPlaceholder} className="h-10 w-full rounded-xl border border-white/9 bg-white/[0.045] pl-10 pr-9 text-sm outline-none transition placeholder:text-[#858c8b] focus:border-[#c88955]/70" onChange={(event) => setQuery(event.target.value)} placeholder={t.stockPage.searchPlaceholder} value={query} />
            {query && <button aria-label={t.header.clearSearch} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9ca3a7]" onClick={() => setQuery('')} type="button"><X className="h-4 w-4" /></button>}
          </label>
          <LanguageToggle lang={lang} onChange={setLang} />
        </div>
      </header>

      <div className="mx-auto max-w-[900px] px-4 py-8 lg:px-9">
        <div className="mb-6">
          <h2 className="text-sm text-[#a6aaa4]">{t.stockPage.subtitle}</h2>
          <p className="mt-2 text-xs text-[#8d9493]">{t.stockPage.selectedCount.replace('{count}', String(stock.length)).replace('{total}', String(totalCount))}</p>
        </div>

        {groups.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/12 py-16 text-center text-sm text-[#9ca3a7]">{t.stockPage.empty}</div>
        ) : (
          groups.map((group) => (
            <section className="mb-8" key={group.category}>
              <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8d9493]">{tr(categoryNames, group.category)}</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {group.items.map((item) => {
                  const has = stock.includes(item);
                  return (
                    <button className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm transition ${has ? 'border-[#78b77a]/35 bg-[#78b77a]/10 text-[#bae4ba]' : 'border-white/10 text-[#aeb2aa] hover:border-white/20'}`} key={item} onClick={() => toggleStock(item)} type="button">
                      <span>{tr(ingredientNames, item)}</span>
                      <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${has ? 'bg-[#78b77a]/25 text-[#a4dca6]' : 'text-[#737a78]'}`}>{has ? <Check className="h-3 w-3" /> : null}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>
    </main>
  );
}
