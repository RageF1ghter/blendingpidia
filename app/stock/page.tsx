'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, ArrowLeft, Check, Pencil, Plus, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { LanguageToggle } from '@/components/language-toggle';
import { useLang } from '@/hooks/use-lang';
import { baseCocktails, type Cocktail } from '@/lib/data';
import {
  buildIngredientRegistry,
  createCustomIngredientId,
  displayIngredientName,
  findManagedIngredients,
  ingredientIdForName,
  isTrackedIngredient,
  normalizeIngredientName,
  type ManagedIngredient,
} from '@/lib/ingredient-registry';
import { ingredientCategoryOrder, type IngredientCategory } from '@/lib/ingredients';
import { categoryNames, term, ui, type TermMap } from '@/lib/i18n';
import { loadAppStorage, type IngredientMigrationIssue } from '@/lib/ingredient-storage';
import { commitBusinessState } from '@/lib/app-storage-repository';
import { useBusinessStorageSync } from '@/hooks/use-app-storage';

type IngredientForm = { nameEn: string; nameZh: string; category: IngredientCategory };

export default function StockPage() {
  const [lang, setLang] = useLang();
  const [stockIds, setStockIds] = useState<string[]>([]);
  const [ingredients, setIngredients] = useState<ManagedIngredient[]>([]);
  const [customRecipes, setCustomRecipes] = useState<Cocktail[]>([]);
  const [migrationIssues, setMigrationIssues] = useState<IngredientMigrationIssue[]>([]);
  const [legacyStockBackup, setLegacyStockBackup] = useState<string[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editor, setEditor] = useState<{ id: string | null; form: IngredientForm } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ManagedIngredient | null>(null);
  const [error, setError] = useState('');

  const t = ui[lang];
  const tr = (map: TermMap, value: string) => term(map, value, lang);
  const recipeNames = useMemo(
    () => [...baseCocktails, ...customRecipes].flatMap((recipe) => recipe.ingredients),
    [customRecipes],
  );
  const registry = useMemo(() => buildIngredientRegistry(recipeNames, ingredients), [recipeNames, ingredients]);

  async function persistInventory(nextStockIds: string[], nextIngredients: ManagedIngredient[]) {
    if (!storageReady || storageBlocked) return false;
    const result = await commitBusinessState((state) => ({
      ...state,
      stockIds: nextStockIds,
      ingredients: nextIngredients,
    }));
    if (!result.ok) {
      setStorageBlocked(true);
      setError(t.notice.readError);
      return false;
    }
    setIngredients(result.state.ingredients);
    setStockIds(result.state.stockIds);
    setMigrationIssues(result.state.migrationIssues);
    setLegacyStockBackup(result.state.legacyStockBackup);
    setError('');
    return true;
  }

  useEffect(() => {
    const loaded = loadAppStorage();
    if (!loaded.ok) {
      setStorageBlocked(true);
      setStorageReady(true);
      return;
    }
    setIngredients(loaded.state.ingredients);
    setCustomRecipes(loaded.state.customRecipes);
    setStockIds(loaded.state.stockIds);
    setMigrationIssues(loaded.state.migrationIssues);
    setLegacyStockBackup(loaded.state.legacyStockBackup);
    if (loaded.needsPersist) {
      void commitBusinessState(() => loaded.state).then((result) => {
        if (!result.ok) setStorageBlocked(true);
      });
    }
    setStorageReady(true);
  }, []);

  const syncFromStorage = useCallback(() => {
    const loaded = loadAppStorage();
    if (!loaded.ok) {
      setStorageBlocked(true);
      return;
    }
    setStorageBlocked(false);
    setIngredients((current) =>
      JSON.stringify(current) === JSON.stringify(loaded.state.ingredients)
        ? current
        : loaded.state.ingredients,
    );
    setStockIds((current) =>
      JSON.stringify(current) === JSON.stringify(loaded.state.stockIds)
        ? current
        : loaded.state.stockIds,
    );
    setCustomRecipes((current) =>
      JSON.stringify(current) === JSON.stringify(loaded.state.customRecipes)
        ? current
        : loaded.state.customRecipes,
    );
    setMigrationIssues((current) =>
      JSON.stringify(current) === JSON.stringify(loaded.state.migrationIssues)
        ? current
        : loaded.state.migrationIssues,
    );
    setLegacyStockBackup((current) =>
      JSON.stringify(current) === JSON.stringify(loaded.state.legacyStockBackup)
        ? current
        : loaded.state.legacyStockBackup,
    );
  }, []);

  useBusinessStorageSync(syncFromStorage);

  const totalCount = registry.filter((item) => !item.archived && !item.deleted && isTrackedIngredient(item.nameEn, registry)).length;
  const activeStockCount = stockIds.filter((id) => registry.some((item) => item.id === id && !item.archived && !item.deleted && isTrackedIngredient(item.nameEn, registry))).length;
  const activeItems = registry.filter((item) => !item.archived && !item.deleted && isTrackedIngredient(item.nameEn, registry));
  const archivedItems = registry.filter((item) => item.archived && !item.deleted);
  const normalizedQuery = query.trim();
  const matches = (item: ManagedIngredient) => !normalizedQuery || [item.nameEn, item.nameZh, ...item.aliases]
    .some((name) => normalizeIngredientName(name).includes(normalizeIngredientName(normalizedQuery)) || name.toLocaleLowerCase().includes(normalizedQuery.toLocaleLowerCase()));

  const groups = useMemo(() => ingredientCategoryOrder.flatMap((category) => {
    const items = activeItems.filter((item) => item.category === category && matches(item));
    return items.length ? [{ category, items }] : [];
  }), [activeItems, normalizedQuery]);
  const filteredArchived = archivedItems.filter(matches);

  async function saveIngredient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    const nameEn = editor.form.nameEn.trim();
    const nameZh = editor.form.nameZh.trim();
    if (!nameEn || !nameZh || !editor.form.category) {
      setError(t.stockPage.ingredientRequired);
      return;
    }

    const collision = [...findManagedIngredients(nameEn, registry), ...findManagedIngredients(nameZh, registry)]
      .find((item) => item.id !== editor.id);
    if (collision) {
      const collisionName = displayIngredientName(collision.id, registry, lang);
      setError(collision.deleted
        ? t.stockPage.deletedIngredientNameReserved.replace('{name}', collisionName)
        : t.stockPage.duplicateIngredientNamed.replace('{name}', collisionName));
      return;
    }

    const existing = editor.id ? registry.find((item) => item.id === editor.id) : undefined;
    const nextIngredient: ManagedIngredient = {
      id: existing?.id ?? createCustomIngredientId(),
      nameEn,
      nameZh,
      category: editor.form.category,
      aliases: [...new Set([...(existing?.aliases ?? []), ...(existing ? [existing.nameEn, existing.nameZh] : [])])],
      archived: false,
      deleted: false,
      custom: existing?.custom ?? true,
    };
    const nextIngredients = [...registry.filter((item) => item.id !== nextIngredient.id), nextIngredient];
    const nextStockIds = isTrackedIngredient(nextIngredient.nameEn, nextIngredients)
      ? stockIds
      : stockIds.filter((id) => id !== nextIngredient.id);
    if (await persistInventory(nextStockIds, nextIngredients)) setEditor(null);
  }

  function toggleStock(id: string) {
    const next = stockIds.includes(id) ? stockIds.filter((value) => value !== id) : [...stockIds, id];
    void persistInventory(next, registry);
  }

  function archiveIngredient(item: ManagedIngredient) {
    const nextIngredients = registry.map((entry) => entry.id === item.id ? { ...entry, archived: true } : entry);
    const nextStockIds = stockIds.filter((id) => id !== item.id);
    void persistInventory(nextStockIds, nextIngredients);
  }

  function restoreIngredient(item: ManagedIngredient) {
    const nextIngredients = registry.map((entry) => entry.id === item.id ? { ...entry, archived: false } : entry);
    void persistInventory(stockIds, nextIngredients);
  }

  function recipesUsingIngredient(item: ManagedIngredient) {
    return [...baseCocktails, ...customRecipes].filter((recipe) =>
      recipe.ingredients.some((name) => ingredientIdForName(name, registry) === item.id),
    ).length;
  }

  async function confirmDeleteIngredient() {
    if (!pendingDelete) return;
    const nextIngredients = registry.map((entry) => entry.id === pendingDelete.id
      ? { ...entry, archived: false, deleted: true }
      : entry);
    const nextStockIds = stockIds.filter((id) => id !== pendingDelete.id);
    if (await persistInventory(nextStockIds, nextIngredients)) setPendingDelete(null);
  }

  function openEditor(item?: ManagedIngredient) {
    setError('');
    setEditor({
      id: item?.id ?? null,
      form: {
        nameEn: item?.nameEn ?? '',
        nameZh: item?.nameZh ?? '',
        category: item?.category ?? 'other',
      },
    });
  }

  const renderIngredient = (item: ManagedIngredient) => {
    const has = stockIds.includes(item.id);
    const name = displayIngredientName(item.nameEn, registry, lang);
    return (
      <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.025] p-1" key={item.id}>
        <button
          aria-label={`${name}: ${has ? t.stockPage.inStock : t.stockPage.outOfStock}`}
          aria-pressed={has}
          className={`flex min-w-0 flex-1 items-center justify-between rounded-lg px-2 py-2.5 text-left text-sm transition ${has ? 'text-[#bae4ba]' : 'text-[#aeb2aa] hover:text-[#f3ebdd]'}`}
          disabled={!storageReady || storageBlocked}
          onClick={() => toggleStock(item.id)}
          type="button"
        >
          <span className="truncate">{name}</span>
          <span className={`ml-2 grid h-5 w-5 shrink-0 place-items-center rounded-full ${has ? 'bg-[#78b77a]/25 text-[#a4dca6]' : 'text-[#737a78]'}`}>
            {has ? <Check className="h-3 w-3" /> : null}
          </span>
        </button>
        {!showArchived && <>
          <button aria-label={`${t.stockPage.editIngredient}: ${name}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[#9ca3a7] hover:bg-white/8 hover:text-[#f3ebdd] disabled:opacity-40" disabled={!storageReady || storageBlocked} onClick={() => openEditor(item)} title={t.stockPage.editIngredient} type="button"><Pencil className="h-3.5 w-3.5" /></button>
          <button aria-label={`${t.stockPage.archiveIngredient}: ${name}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[#9ca3a7] hover:bg-white/8 hover:text-[#e8c197] disabled:opacity-40" disabled={!storageReady || storageBlocked} onClick={() => archiveIngredient(item)} title={t.stockPage.archiveIngredient} type="button"><Archive className="h-3.5 w-3.5" /></button>
        </>}
        {showArchived && <button aria-label={`${t.stockPage.restoreIngredient}: ${name}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[#9ca3a7] hover:bg-white/8 hover:text-[#a4dca6] disabled:opacity-40" disabled={!storageReady || storageBlocked} onClick={() => restoreIngredient(item)} title={t.stockPage.restoreIngredient} type="button"><RotateCcw className="h-3.5 w-3.5" /></button>}
        <button aria-label={`${t.stockPage.deleteIngredient}: ${name}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[#9ca3a7] hover:bg-white/8 hover:text-[#f0aaa0] disabled:opacity-40" disabled={!storageReady || storageBlocked} onClick={() => { setError(''); setPendingDelete(item); }} title={t.stockPage.deleteIngredient} type="button"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-[#0e1011] text-[#f3ebdd]">
      <header className="sticky top-0 z-30 border-b border-white/8 bg-[#0e1011]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[76px] max-w-[900px] items-center gap-3 px-4 lg:px-9">
          {/* oxlint-disable-next-line nextjs/no-html-link-for-pages -- vinext's current production Link runtime cannot load navigation helpers. */}
          <a aria-label={t.stockPage.back} className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 text-[#d2d4cc] transition hover:bg-white/6 hover:text-[#f3ebdd]" href="/"><ArrowLeft className="h-4 w-4" /></a>
          <h1 className="font-serif text-xl tracking-tight">{t.stockPage.title}</h1>
          <label className="relative ml-auto max-w-[340px] flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3a7]" />
            <input aria-label={t.stockPage.searchPlaceholder} className="h-10 w-full rounded-xl border border-white/9 bg-white/[0.045] pl-10 pr-9 text-sm outline-none transition placeholder:text-[#858c8b] focus:border-[#c88955]/70" onChange={(event) => setQuery(event.target.value)} placeholder={t.stockPage.searchPlaceholder} value={query} />
            {query && <button aria-label={t.header.clearSearch} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9ca3a7]" onClick={() => setQuery('')} type="button"><X className="h-4 w-4" /></button>}
          </label>
          <LanguageToggle lang={lang} onChange={setLang} />
        </div>
      </header>

      {storageBlocked && <div className="mx-auto max-w-[900px] px-4 pt-5 lg:px-9"><div className="rounded-xl border border-[#d46d60]/30 bg-[#d46d60]/[0.08] px-4 py-3 text-sm text-[#f0bbb4]">{t.notice.storageBlocked}</div></div>}

      <div className="mx-auto max-w-[900px] px-4 py-8 lg:px-9">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm text-[#a6aaa4]">{t.stockPage.subtitle}</h2>
            <p className="mt-2 text-xs text-[#8d9493]">{t.stockPage.selectedCount.replace('{count}', String(activeStockCount)).replace('{total}', String(totalCount))}</p>
          </div>
          {!showArchived && <button className="inline-flex items-center gap-2 rounded-xl bg-[#c88955] px-3.5 py-2.5 text-sm font-medium text-[#1a1512] transition hover:bg-[#deb07f] disabled:cursor-not-allowed disabled:opacity-50" disabled={!storageReady || storageBlocked} onClick={() => openEditor()} type="button"><Plus className="h-4 w-4" />{t.stockPage.addIngredient}</button>}
        </div>

        {migrationIssues.length > 0 && <section aria-live="polite" className="mb-6 rounded-xl border border-[#c88955]/30 bg-[#c88955]/[0.07] p-4 text-sm text-[#e8c197]">
          <h2 className="font-medium">{t.stockPage.migrationTitle}</h2>
          <p className="mt-1 text-xs leading-5 text-[#c5b19a]">{t.stockPage.migrationDescription}</p>
          <ul className="mt-3 space-y-2">
            {migrationIssues.map((issue) => <li className="rounded-lg bg-black/15 px-3 py-2" key={issue.id}>
              <span className="font-medium">{issue.value}</span>
              <span className="ml-2 text-xs text-[#bda88f]">{t.stockPage.migrationReason[issue.reason]}</span>
              {issue.candidates.length > 0 && <span className="mt-1 block text-xs text-[#bda88f]">{issue.candidates.map((id) => displayIngredientName(id, registry, lang)).join(' · ')}</span>}
            </li>)}
          </ul>
          {legacyStockBackup.length > 0 && <p className="mt-3 text-xs text-[#bda88f]">{t.stockPage.migrationBackup}</p>}
        </section>}

        <div className="mb-6 flex gap-2 border-b border-white/8">
          <button className={`border-b-2 px-3 py-2 text-sm ${!showArchived ? 'border-[#c88955] text-[#e8c197]' : 'border-transparent text-[#8d9493]'}`} onClick={() => setShowArchived(false)} type="button">{t.stockPage.activeTab}</button>
          <button className={`border-b-2 px-3 py-2 text-sm ${showArchived ? 'border-[#c88955] text-[#e8c197]' : 'border-transparent text-[#8d9493]'}`} onClick={() => setShowArchived(true)} type="button">{t.stockPage.archivedTab} ({archivedItems.length})</button>
        </div>

        {showArchived ? (
          filteredArchived.length ? <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{filteredArchived.map(renderIngredient)}</div>
            : <div className="rounded-2xl border border-dashed border-white/12 py-16 text-center text-sm text-[#9ca3a7]">{normalizedQuery ? t.stockPage.empty : t.stockPage.archivedEmpty}</div>
        ) : groups.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/12 py-16 text-center text-sm text-[#9ca3a7]">{t.stockPage.empty}</div>
        ) : groups.map((group) => (
          <section className="mb-8" key={group.category}>
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8d9493]">{tr(categoryNames, group.category)}</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{group.items.map(renderIngredient)}</div>
          </section>
        ))}
      </div>

      {editor && <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditor(null); }}>
        <form className="w-full max-w-md rounded-2xl border border-white/10 bg-[#202427] p-5 shadow-2xl" onSubmit={saveIngredient}>
          <div className="mb-5 flex items-center justify-between">
            <h2 className="font-serif text-xl">{editor.id ? t.stockPage.editIngredient : t.stockPage.addIngredient}</h2>
            <button aria-label={t.stockPage.cancel} className="grid h-8 w-8 place-items-center rounded-lg text-[#9ca3a7] hover:bg-white/8" onClick={() => setEditor(null)} type="button"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid gap-4">
            <label className="grid gap-2 text-xs text-[#b5b9b1]">{t.stockPage.nameEn}<input autoFocus required className="h-10 rounded-lg border border-white/10 bg-black/15 px-3 text-sm text-[#f3ebdd] outline-none focus:border-[#c88955]/70" onChange={(event) => setEditor({ ...editor, form: { ...editor.form, nameEn: event.target.value } })} value={editor.form.nameEn} /></label>
            <label className="grid gap-2 text-xs text-[#b5b9b1]">{t.stockPage.nameZh}<input required className="h-10 rounded-lg border border-white/10 bg-black/15 px-3 text-sm text-[#f3ebdd] outline-none focus:border-[#c88955]/70" onChange={(event) => setEditor({ ...editor, form: { ...editor.form, nameZh: event.target.value } })} value={editor.form.nameZh} /></label>
            <label className="grid gap-2 text-xs text-[#b5b9b1]">{t.stockPage.category}<select className="h-10 rounded-lg border border-white/10 bg-[#171a1c] px-3 text-sm text-[#f3ebdd] outline-none focus:border-[#c88955]/70" onChange={(event) => setEditor({ ...editor, form: { ...editor.form, category: event.target.value as IngredientCategory } })} value={editor.form.category}>{ingredientCategoryOrder.map((category) => <option key={category} value={category}>{tr(categoryNames, category)}</option>)}</select></label>
            {error && <p className="text-sm text-[#e1a49c]">{error}</p>}
            <div className="mt-1 flex justify-end gap-2"><button className="rounded-lg px-3 py-2 text-sm text-[#adb1a8] hover:bg-white/6" onClick={() => setEditor(null)} type="button">{t.stockPage.cancel}</button><button className="rounded-lg bg-[#c88955] px-4 py-2 text-sm font-medium text-[#1a1512] hover:bg-[#deb07f] disabled:opacity-50" disabled={!storageReady || storageBlocked} type="submit">{t.stockPage.saveIngredient}</button></div>
          </div>
        </form>
      </div>}

      {pendingDelete && <div aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setPendingDelete(null); }} role="dialog">
        <section className="w-full max-w-md rounded-2xl border border-white/10 bg-[#202427] p-5 shadow-2xl">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-serif text-xl">{t.stockPage.deleteConfirmationTitle}</h2>
            <button aria-label={t.stockPage.cancel} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[#9ca3a7] hover:bg-white/8" onClick={() => setPendingDelete(null)} type="button"><X className="h-4 w-4" /></button>
          </div>
          <p className="text-sm leading-6 text-[#c5c5bd]">{t.stockPage.deleteConfirmation.replace('{name}', displayIngredientName(pendingDelete.nameEn, registry, lang)).replace('{count}', String(recipesUsingIngredient(pendingDelete)))}</p>
          <p className="mt-2 text-xs text-[#e1a49c]">{t.stockPage.deleteNoRestore}</p>
          {error && <p className="mt-3 text-sm text-[#e1a49c]">{error}</p>}
          <div className="mt-6 flex justify-end gap-2">
            <button className="rounded-lg px-3 py-2 text-sm text-[#adb1a8] hover:bg-white/6" onClick={() => setPendingDelete(null)} type="button">{t.stockPage.cancel}</button>
            <button className="rounded-lg bg-[#d46d60] px-4 py-2 text-sm font-medium text-[#1a1512] hover:bg-[#e48678] disabled:opacity-50" disabled={!storageReady || storageBlocked} onClick={confirmDeleteIngredient} type="button">{t.stockPage.confirmDelete}</button>
          </div>
        </section>
      </div>}
    </main>
  );
}
