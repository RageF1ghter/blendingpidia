'use client';

/* oxlint-disable nextjs/no-img-element -- Direct asset URLs use native loading, decoding and explicit dimensions. */

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  Dices,
  Heart,
  Plus,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { CocktailCards } from '@/components/cocktail-cards';
import { CocktailSidebar } from '@/components/cocktail-sidebar';
import {
  buildCocktailIndex,
  calculateAvailability,
} from '@/lib/cocktail-index';
import { useCocktailDetails } from '@/hooks/use-cocktail-details';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { LanguageToggle } from '@/components/language-toggle';
import { useLang } from '@/hooks/use-lang';
import { canonicalIngredientName } from '@/lib/ingredients';
import {
  buildIngredientRegistry,
  builtInIngredientId,
  displayIngredientName,
  findManagedIngredient,
  findManagedIngredientById,
  ingredientIdForName,
  isTrackedIngredient,
  type ManagedIngredient,
} from '@/lib/ingredient-registry';
import {
  baseCocktails,
  fuzzyMatch,
  initialStock,
  methods,
  slugify,
  type Cocktail,
  type Method,
} from '@/lib/data';
import {
  appStorageChangeEvent,
  loadAppStorage,
  reconcileIngredientMigration,
  saveAppStorage,
} from '@/lib/ingredient-storage';
import type { IngredientMigrationIssue } from '@/lib/ingredient-storage';
import {
  glassNames,
  ingredientNames,
  instructions as instructionMap,
  methodNames,
  tagNames,
  term,
  ui,
  type TermMap,
} from '@/lib/i18n';

export default function Home() {
  const [lang, setLang] = useLang();
  const [query, setQuery] = useState('');
  const [stockMode, setStockMode] = useState<'all' | 'makeable' | 'near'>(
    'all',
  );
  const [selectedIngredients, setSelectedIngredients] = useState<string[]>([]);
  const [stockIds, setStockIds] = useState<string[]>(
    initialStock.map(builtInIngredientId),
  );
  const [managedIngredients, setManagedIngredients] = useState<
    ManagedIngredient[]
  >([]);
  const [liked, setLiked] = useState<string[]>([]);
  const [customRecipes, setCustomRecipes] = useState<Cocktail[]>([]);
  const [migrationIssues, setMigrationIssues] = useState<
    IngredientMigrationIssue[]
  >([]);
  const [legacyStockBackup, setLegacyStockBackup] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [featuredId, setFeaturedId] = useState('negroni');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [showFavorites, setShowFavorites] = useState(false);
  const [showRecipeForm, setShowRecipeForm] = useState(false);
  const [notice, setNotice] = useState('');
  const [sort, setSort] = useState<'popular' | 'name' | 'newest'>('popular');
  const [page, setPage] = useState({ key: '', count: 24 });

  const cocktails = useMemo(
    () => [...baseCocktails, ...customRecipes],
    [customRecipes],
  );
  const recipeNames = useMemo(
    () => cocktails.flatMap((item) => item.ingredients),
    [cocktails],
  );
  const ingredientRegistry = useMemo(
    () => buildIngredientRegistry(recipeNames, managedIngredients),
    [recipeNames, managedIngredients],
  );
  const cocktailIndex = useMemo(
    () => buildCocktailIndex(cocktails, ingredientRegistry),
    [cocktails, ingredientRegistry],
  );
  const availability = useMemo(
    () => calculateAvailability(cocktailIndex, stockIds),
    [cocktailIndex, stockIds],
  );
  const likedIds = useMemo(() => new Set(liked), [liked]);
  const t = ui[lang];
  const tr = (map: TermMap, value: string) =>
    map === ingredientNames
      ? displayIngredientName(value, ingredientRegistry, lang)
      : term(map, value, lang);

  useEffect(() => {
    try {
      const loaded = loadAppStorage();
      if (!loaded.ok) {
        setStorageBlocked(true);
      } else {
        setManagedIngredients(loaded.state.ingredients);
        setStockIds(loaded.state.stockIds);
        setLiked(loaded.state.liked);
        setCustomRecipes(loaded.state.customRecipes);
        setMigrationIssues(loaded.state.migrationIssues);
        setLegacyStockBackup(loaded.state.legacyStockBackup);
        if (loaded.needsPersist) saveAppStorage(loaded.state);
      }
    } catch {
      setStorageBlocked(true);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    const syncFromStorage = () => {
      const loaded = loadAppStorage();
      if (!loaded.ok) {
        setStorageBlocked(true);
        return;
      }
      setStorageBlocked(false);
      setStockIds((current) =>
        JSON.stringify(current) === JSON.stringify(loaded.state.stockIds)
          ? current
          : loaded.state.stockIds,
      );
      setManagedIngredients((current) =>
        JSON.stringify(current) === JSON.stringify(loaded.state.ingredients)
          ? current
          : loaded.state.ingredients,
      );
      setLiked((current) =>
        JSON.stringify(current) === JSON.stringify(loaded.state.liked)
          ? current
          : loaded.state.liked,
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
        JSON.stringify(current) ===
        JSON.stringify(loaded.state.legacyStockBackup)
          ? current
          : loaded.state.legacyStockBackup,
      );
    };
    window.addEventListener(appStorageChangeEvent, syncFromStorage);
    return () =>
      window.removeEventListener(appStorageChangeEvent, syncFromStorage);
  }, []);

  useEffect(() => {
    if (!hydrated || storageBlocked) return;
    const currentState = {
      stockIds,
      ingredients: managedIngredients,
      liked,
      customRecipes,
      migrationIssues,
      legacyStockBackup,
    };
    const reconciled = reconcileIngredientMigration(
      currentState,
      ingredientRegistry,
    );
    if (JSON.stringify(reconciled) !== JSON.stringify(currentState)) {
      setStockIds(reconciled.stockIds);
      setMigrationIssues(reconciled.migrationIssues);
      setLegacyStockBackup(reconciled.legacyStockBackup);
      return;
    }
    try {
      saveAppStorage(reconciled);
    } catch {
      setStorageBlocked(true);
      setNotice(t.notice.readError);
    }
  }, [
    customRecipes,
    hydrated,
    ingredientRegistry,
    legacyStockBackup,
    liked,
    managedIngredients,
    migrationIssues,
    stockIds,
    storageBlocked,
    t.notice.readError,
  ]);

  const featured = cocktailIndex.byId.get(featuredId)?.recipe ?? cocktails[0];
  const allIngredients = useMemo(() => {
    const byId = new Map<string, ManagedIngredient>();
    for (const name of cocktails.flatMap((item) => item.ingredients)) {
      const id = ingredientIdForName(name, ingredientRegistry);
      const record = findManagedIngredientById(id, ingredientRegistry);
      if (record && !record.deleted) byId.set(id, record);
    }
    return [...byId.values()].sort((a, b) => a.nameEn.localeCompare(b.nameEn));
  }, [cocktails, ingredientRegistry]);
  const stockedCount = useMemo(
    () =>
      stockIds.filter((id) => {
        const item = findManagedIngredientById(id, ingredientRegistry);
        return (
          item &&
          !item.archived &&
          !item.deleted &&
          isTrackedIngredient(item.nameEn, ingredientRegistry)
        );
      }).length,
    [stockIds, ingredientRegistry],
  );
  const familyRoot = (cocktail: Cocktail) => cocktail.parentId ?? cocktail.id;
  const variantsFor = (cocktail: Cocktail) =>
    cocktailIndex.variants.get(familyRoot(cocktail)) ?? [];

  const filtered = useMemo(() => {
    const normalized = query.trim();
    return cocktails
      .filter((cocktail) => {
        const missingCount = availability.byId.get(cocktail.id)!.missing.length;
        const indexed = cocktailIndex.byId.get(cocktail.id)!;
        const searchable = indexed.searchText;
        const matchesSearch = !normalized || fuzzyMatch(normalized, searchable);
        const matchesIngredients = selectedIngredients.every((id) =>
          indexed.ingredientIds.has(id),
        );
        const matchesStock =
          stockMode === 'all' ||
          (stockMode === 'makeable' && missingCount === 0) ||
          (stockMode === 'near' && missingCount > 0 && missingCount <= 2);
        return (
          matchesSearch &&
          matchesIngredients &&
          matchesStock &&
          (!showFavorites || likedIds.has(cocktail.id))
        );
      })
      .sort((a, b) =>
        sort === 'name'
          ? a.name.localeCompare(b.name)
          : sort === 'newest'
            ? Number(Boolean(b.isCustom)) - Number(Boolean(a.isCustom))
            : b.likes +
              Number(likedIds.has(b.id)) -
              (a.likes + Number(likedIds.has(a.id))),
      );
  }, [
    cocktails,
    cocktailIndex,
    availability,
    likedIds,
    query,
    selectedIngredients,
    showFavorites,
    sort,
    stockMode,
  ]);

  const pageKey = JSON.stringify([
    query,
    stockMode,
    selectedIngredients,
    showFavorites,
    sort,
  ]);
  const visibleCount = page.key === pageKey ? page.count : 24;
  const visibleCocktails = useMemo(
    () => filtered.slice(0, visibleCount),
    [filtered, visibleCount],
  );

  const clearIngredients = useCallback(() => setSelectedIngredients([]), []);
  const toggleIngredient = useCallback((ingredientId: string) => {
    setSelectedIngredients((current) =>
      current.includes(ingredientId)
        ? current.filter((item) => item !== ingredientId)
        : [...current, ingredientId],
    );
  }, []);

  const toggleLike = useCallback(
    (id: string) => {
      if (!hydrated || storageBlocked) return;
      setLiked((current) =>
        current.includes(id)
          ? current.filter((item) => item !== id)
          : [...current, id],
      );
    },
    [hydrated, storageBlocked],
  );

  const openDetail = useCallback((id: string) => {
    setFeaturedId(id);
    setDetailId(id);
  }, []);

  function chooseRandom() {
    const pool = filtered.length ? filtered : cocktails;
    const choice = pool[Math.floor(Math.random() * pool.length)];
    setFeaturedId(choice.id);
    setNotice(t.notice.tryTonight.replace('{name}', choice.name));
  }

  function addRecipe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hydrated || storageBlocked) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    const ingredients = [
      ...new Set(
        String(form.get('ingredients') ?? '')
          .split(',')
          .map(
            (item) =>
              findManagedIngredient(item, ingredientRegistry)?.nameEn ??
              canonicalIngredientName(item),
          )
          .filter(Boolean),
      ),
    ];
    if (!name || !ingredients.length) {
      setNotice(t.notice.formRequired);
      return;
    }
    const recipe: Cocktail = {
      id: slugify(name),
      name,
      image: String(form.get('image') ?? '').trim() || undefined,
      method: String(form.get('method')) as Method,
      glass: String(form.get('glass') ?? '').trim() || 'Cocktail',
      ingredients,
      tags: ['My recipe'],
      likes: 0,
      instructions: String(form.get('instructions') ?? '').trim(),
      parentId: String(form.get('parentId') ?? '') || null,
      isCustom: true,
    };
    setCustomRecipes((current) => [recipe, ...current]);
    setFeaturedId(recipe.id);
    setShowRecipeForm(false);
    setNotice(
      recipe.parentId
        ? t.notice.addedVariant.replace('{name}', recipe.name)
        : t.notice.added.replace('{name}', recipe.name),
    );
  }

  const featuredMissing = availability.byId.get(featured.id)!.missing;
  const featuredBroken = availability.byId.get(featured.id)!.broken;
  const featuredVariants = variantsFor(featured);
  const featuredDetails = useCocktailDetails(featured);
  const featuredInstructions =
    featuredDetails.recipe?.instructions ??
    instructionMap[featured.id]?.[lang] ??
    '';
  const detailDetails = useCocktailDetails(
    detailId ? (cocktailIndex.byId.get(detailId)?.recipe ?? null) : null,
  );
  const detail = detailDetails.recipe;
  const detailMissing = detail ? availability.byId.get(detail.id)!.missing : [];
  const detailBroken = detail
    ? availability.byId.get(detail.id)!.broken
    : false;
  const detailInstructions = detail
    ? (detail.instructions ?? instructionMap[detail.id]?.[lang] ?? '')
    : '';

  return (
    <main className="min-h-screen bg-[#0e1011] text-[#f3ebdd]">
      <header className="sticky top-0 z-30 border-b border-white/8 bg-[#0e1011]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[76px] max-w-[1540px] items-center gap-3 px-4 lg:px-9">
          <a className="group flex shrink-0 items-center gap-3" href="#top">
            <span className="grid h-10 w-10 place-items-center rounded-full border border-[#c88955]/55 bg-[#c88955]/10 text-lg text-[#e8c197]">
              ✦
            </span>
            <span className="hidden leading-none sm:block">
              <strong className="font-serif text-base tracking-[0.11em]">
                BLENDINGPIDIA
              </strong>
              <small className="mt-1 block text-[10px] tracking-[0.16em] text-[#8d9493]">
                {t.brand.subtitle}
              </small>
            </span>
          </a>
          <label className="relative mx-auto max-w-[550px] flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3a7]" />
            <input
              aria-label={t.header.searchAria}
              className="h-11 w-full rounded-xl border border-white/9 bg-white/[0.045] pl-11 pr-10 text-sm outline-none transition placeholder:text-[#858c8b] focus:border-[#c88955]/70"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t.header.searchPlaceholder}
              value={query}
            />
            {query && (
              <button
                aria-label={t.header.clearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca3a7]"
                onClick={() => setQuery('')}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </label>
          <LanguageToggle lang={lang} onChange={setLang} />
          <Button
            className="hidden bg-transparent text-[#d2d4cc] hover:bg-white/6 hover:text-[#f3ebdd] md:inline-flex"
            onClick={chooseRandom}
            variant="ghost"
          >
            <Dices className="text-[#e8c197]" /> {t.header.random}
          </Button>
          <Button
            aria-label={t.header.showFavorites}
            className={
              showFavorites
                ? 'bg-[#c88955]/15 text-[#e8c197]'
                : 'bg-transparent text-[#d2d4cc] hover:bg-white/6'
            }
            disabled={!hydrated || storageBlocked}
            onClick={() => setShowFavorites((value) => !value)}
            size="icon"
            variant="ghost"
          >
            <Heart fill={showFavorites ? 'currentColor' : 'none'} />
          </Button>
          <Button
            className="hidden bg-[#c88955] text-[#1a1512] hover:bg-[#deb07f] sm:inline-flex"
            disabled={!hydrated || storageBlocked}
            onClick={() => setShowRecipeForm(true)}
          >
            <Plus /> {t.header.add}
          </Button>
        </div>
      </header>

      {storageBlocked && (
        <div className="mx-auto mt-4 max-w-[1540px] px-4 lg:px-9">
          <div className="rounded-xl border border-[#d46d60]/30 bg-[#d46d60]/[0.08] px-4 py-3 text-sm text-[#f0bbb4]">
            {t.notice.storageBlocked}
          </div>
        </div>
      )}
      {migrationIssues.length > 0 && (
        <div className="mx-auto mt-4 max-w-[1540px] px-4 lg:px-9">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#c88955]/30 bg-[#c88955]/[0.08] px-4 py-3 text-sm text-[#e8c197]">
            <span>
              {t.notice.migrationSummary.replace(
                '{count}',
                String(migrationIssues.length),
              )}
            </span>
            <Link className="underline underline-offset-4" href="/stock">
              {t.aside.manage}
            </Link>
          </div>
        </div>
      )}

      {notice && (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full border border-[#c88955]/30 bg-[#202427] px-4 py-2 text-sm text-[#f1d4af] shadow-xl">
          <button
            className="mr-3 text-[#8d9493]"
            onClick={() => setNotice('')}
            type="button"
          >
            ×
          </button>
          {notice}
        </div>
      )}

      <div
        id="top"
        className="mx-auto grid max-w-[1540px] grid-cols-1 gap-8 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_258px] lg:px-9"
      >
        <CocktailSidebar
          lang={lang}
          stockedCount={stockedCount}
          stockMode={stockMode}
          counts={availability.counts}
          allIngredients={allIngredients}
          ingredientRegistry={ingredientRegistry}
          selectedIngredients={selectedIngredients}
          setStockMode={setStockMode}
          toggleIngredient={toggleIngredient}
          clearIngredients={clearIngredients}
        />

        <section className="min-w-0">
          <div className="mb-8 overflow-hidden rounded-[24px] border border-white/8 bg-[#171a1c]">
            <div className="grid min-h-[250px] grid-cols-1 md:grid-cols-[1.1fr_1fr]">
              <div className="relative z-0 min-h-[255px] overflow-hidden">
                {featured.image ? (
                  <img
                    fetchPriority="high"
                    decoding="async"
                    width={960}
                    height={640}
                    alt={featured.name}
                    className="absolute inset-0 h-full w-full object-cover opacity-75"
                    src={featured.image}
                  />
                ) : (
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,#c8895577,transparent_30%),linear-gradient(140deg,#303a3b,#171a1c)]" />
                )}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#171a1c]/15 to-[#171a1c]" />
              </div>
              <div className="relative z-10 flex flex-col justify-center p-6 md:-ml-12 md:py-8 lg:p-9">
                <div className="mb-4 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#e8c197]">
                  <Sparkles className="h-3.5 w-3.5" /> {t.featured.label}
                </div>
                <h1 className="font-serif text-4xl tracking-tight text-[#f6f0e4] lg:text-5xl">
                  {featured.name}
                </h1>
                <p className="mt-2 text-sm text-[#aeb2aa]">
                  {tr(methodNames, featured.method)} ·{' '}
                  {tr(glassNames, featured.glass)} ·{' '}
                  {featured.ingredients
                    .map((item) => tr(ingredientNames, item))
                    .join(' · ')}
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {featuredBroken ? (
                    <span className="rounded-full bg-[#c96b5b]/12 px-3 py-1.5 text-xs text-[#e1a49c]">
                      {t.featured.broken}
                    </span>
                  ) : featuredMissing.length === 0 ? (
                    <span className="rounded-full bg-[#78b77a]/14 px-3 py-1.5 text-xs text-[#a4dca6]">
                      {t.featured.makeable}
                    </span>
                  ) : (
                    <span className="rounded-full bg-[#c96b5b]/12 px-3 py-1.5 text-xs text-[#e1a49c]">
                      {t.featured.missing.replace(
                        '{list}',
                        featuredMissing
                          .map((item) => tr(ingredientNames, item))
                          .join(lang === 'zh' ? '、' : ', '),
                      )}
                    </span>
                  )}{' '}
                  {featuredVariants.length > 0 && (
                    <span className="rounded-full bg-[#9b87d6]/15 px-3 py-1.5 text-xs text-[#c9bff3]">
                      {t.featured.variants.replace(
                        '{count}',
                        String(featuredVariants.length),
                      )}
                    </span>
                  )}{' '}
                  {featured.isCustom && (
                    <span className="rounded-full bg-[#c88955]/15 px-3 py-1.5 text-xs text-[#e8c197]">
                      {t.featured.myRecipe}
                    </span>
                  )}
                </div>
                <p className="mt-5 text-sm leading-6 text-[#c5c5bd]">
                  {featuredDetails.loading
                    ? t.recipe.loading
                    : featuredInstructions}
                </p>
                {featuredDetails.failed && (
                  <button
                    className="mt-2 text-left text-xs text-[#f0bbb4] underline"
                    onClick={featuredDetails.retry}
                    type="button"
                  >
                    {t.recipe.loadError} {t.recipe.retry}
                  </button>
                )}
                <button
                  className="mt-5 inline-flex w-fit items-center gap-2 rounded-full border border-[#c88955]/40 px-4 py-2 text-xs text-[#e8c197] transition hover:bg-[#c88955]/10"
                  onClick={() => openDetail(featured.id)}
                  type="button"
                >
                  {t.featured.viewDetail}{' '}
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8d9493]">
                {t.explore.label}
              </p>
              <h2 className="mt-1 font-serif text-2xl tracking-tight">
                {showFavorites
                  ? t.explore.favorites
                  : selectedIngredients.length
                    ? t.explore.withIngredients.replace(
                        '{list}',
                        selectedIngredients
                          .map((item) => tr(ingredientNames, item))
                          .join(' + '),
                      )
                    : t.explore.all}
              </h2>
            </div>
            <label className="rounded-lg border border-white/10 px-3 py-2 text-xs text-[#bec0b8]">
              {t.explore.sort}{' '}
              <select
                className="ml-1 bg-transparent outline-none"
                onChange={(event) => setSort(event.target.value as typeof sort)}
                value={sort}
              >
                <option value="popular">{t.explore.sortPopular}</option>
                <option value="name">{t.explore.sortName}</option>
                <option value="newest">{t.explore.sortNewest}</option>
              </select>
            </label>
          </div>
          {filtered.length ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <CocktailCards
                cocktails={visibleCocktails}
                availability={availability.byId}
                variants={cocktailIndex.variants}
                ingredientRegistry={ingredientRegistry}
                lang={lang}
                liked={likedIds}
                openDetail={openDetail}
                toggleLike={toggleLike}
              />
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/12 py-16 text-center text-sm text-[#9ca3a7]">
              {t.explore.empty}
            </div>
          )}

          {filtered.length > 0 && (
            <div className="mt-5 flex flex-wrap items-center justify-center gap-4">
              <span className="text-xs text-[#9ca3a7]">
                {t.explore.showing
                  .replace('{shown}', String(visibleCocktails.length))
                  .replace('{total}', String(filtered.length))}
              </span>
              {visibleCount < filtered.length && (
                <Button
                  onClick={() =>
                    setPage({ key: pageKey, count: visibleCount + 24 })
                  }
                  variant="outline"
                >
                  {t.explore.loadMore}
                </Button>
              )}
            </div>
          )}

          <section className="mt-9 rounded-2xl border border-[#9b87d6]/20 bg-[#9b87d6]/[0.055] p-5 sm:p-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#c9bff3]">
              {t.family.label}
            </p>
            <h2 className="mt-1 font-serif text-2xl">
              {t.family.title.replace(
                '{name}',
                baseCocktails.find((item) => item.id === familyRoot(featured))
                  ?.name ?? featured.name,
              )}
            </h2>
            <p className="mt-1 text-sm text-[#acabb7]">
              {t.family.description}
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {[
                cocktails.find((item) => item.id === familyRoot(featured)),
                ...featuredVariants,
              ]
                .filter(Boolean)
                .map((item) => {
                  const recipe = item as Cocktail;
                  return (
                    <button
                      className={`rounded-xl border px-4 py-3 text-left text-sm ${recipe.id === featured.id ? 'border-[#c88955]/45 bg-[#c88955]/10 text-[#f2d1a9]' : 'border-white/8 bg-black/10 text-[#ded9ed]'}`}
                      key={recipe.id}
                      onClick={() => setFeaturedId(recipe.id)}
                      type="button"
                    >
                      <span className="mr-2 text-[#c9bff3]">
                        {recipe.parentId ? '↳' : '●'}
                      </span>
                      {recipe.name}
                    </button>
                  );
                })}
            </div>
          </section>
        </section>
      </div>

      <Dialog onOpenChange={setShowRecipeForm} open={showRecipeForm}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto border-white/10 bg-[#202427] text-[#f3ebdd]">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">
              {t.formDialog.title}
            </DialogTitle>
            <DialogDescription>{t.formDialog.description}</DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={addRecipe}>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-xs text-[#b5b9b1]">
                {t.formDialog.name}
                <Input
                  className="border-white/10 bg-black/15 text-[#f3ebdd]"
                  name="name"
                  placeholder="Smoked Negroni"
                />
              </label>
              <label className="grid gap-2 text-xs text-[#b5b9b1]">
                {t.formDialog.relation}
                <select
                  className="h-9 rounded-lg border border-white/10 bg-black/15 px-2 text-sm text-[#f3ebdd]"
                  name="parentId"
                >
                  <option value="">{t.formDialog.original}</option>
                  {cocktails
                    .filter((item) => !item.parentId)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {t.formDialog.basedOn.replace('{name}', item.name)}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-xs text-[#b5b9b1]">
                {t.formDialog.method}
                <select
                  className="h-9 rounded-lg border border-white/10 bg-black/15 px-2 text-sm text-[#f3ebdd]"
                  defaultValue="Shake"
                  name="method"
                >
                  {methods.map((item) => (
                    <option key={item}>{tr(methodNames, item)}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-xs text-[#b5b9b1]">
                {t.formDialog.glass}
                <Input
                  className="border-white/10 bg-black/15 text-[#f3ebdd]"
                  defaultValue="Cocktail"
                  name="glass"
                />
              </label>
            </div>
            <label className="grid gap-2 text-xs text-[#b5b9b1]">
              {t.formDialog.ingredients}
              <Input
                className="border-white/10 bg-black/15 text-[#f3ebdd]"
                name="ingredients"
                placeholder="Gin, Lime juice, Simple Syrup"
              />
            </label>
            <label className="grid gap-2 text-xs text-[#b5b9b1]">
              {t.formDialog.image}
              <Input
                className="border-white/10 bg-black/15 text-[#f3ebdd]"
                name="image"
                placeholder="https://..."
              />
            </label>
            <label className="grid gap-2 text-xs text-[#b5b9b1]">
              {t.formDialog.instructions}
              <textarea
                className="min-h-24 rounded-lg border border-white/10 bg-black/15 p-3 text-sm text-[#f3ebdd] outline-none focus:border-[#c88955]/70"
                name="instructions"
                placeholder={t.formDialog.instructionsPlaceholder}
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                className="text-[#c5c8c1]"
                onClick={() => setShowRecipeForm(false)}
                type="button"
                variant="ghost"
              >
                {t.formDialog.cancel}
              </Button>
              <Button
                className="bg-[#c88955] text-[#1a1512] hover:bg-[#deb07f]"
                type="submit"
              >
                {t.formDialog.save}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        onOpenChange={(open) => {
          if (!open) setDetailId(null);
        }}
        open={detailId !== null}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto border-white/10 bg-[#202427] text-[#f3ebdd]">
          {detail && (
            <>
              <div className="relative -mx-4 -mt-4 h-56 overflow-hidden rounded-t-xl">
                {detail.image ? (
                  <img
                    decoding="async"
                    width={960}
                    height={640}
                    alt={detail.name}
                    className="h-full w-full object-cover"
                    src={detail.image}
                  />
                ) : (
                  <div className="h-full bg-[radial-gradient(circle_at_30%_30%,#c8895566,transparent_35%),linear-gradient(140deg,#2a3435,#171a1c)]" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[#202427] via-transparent to-transparent" />
              </div>
              <DialogHeader>
                <DialogTitle className="font-serif text-3xl text-[#f6f0e4]">
                  {detail.name}
                </DialogTitle>
                <DialogDescription className="text-sm text-[#aeb2aa]">
                  {tr(methodNames, detail.method)} ·{' '}
                  {tr(glassNames, detail.glass)}
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-wrap gap-2">
                {detailBroken ? (
                  <span className="rounded-full bg-[#c96b5b]/12 px-3 py-1.5 text-xs text-[#e1a49c]">
                    {t.featured.broken}
                  </span>
                ) : detailMissing.length === 0 ? (
                  <span className="rounded-full bg-[#78b77a]/14 px-3 py-1.5 text-xs text-[#a4dca6]">
                    {t.featured.makeable}
                  </span>
                ) : (
                  <span className="rounded-full bg-[#c96b5b]/12 px-3 py-1.5 text-xs text-[#e1a49c]">
                    {t.featured.missing.replace(
                      '{list}',
                      detailMissing
                        .map((item) => tr(ingredientNames, item))
                        .join(lang === 'zh' ? '、' : ', '),
                    )}
                  </span>
                )}
                {detail.tags.map((tag) => (
                  <span
                    className="rounded-full bg-white/6 px-3 py-1.5 text-xs text-[#c5c5bd]"
                    key={tag}
                  >
                    {tr(tagNames, tag)}
                  </span>
                ))}
              </div>
              {detailDetails.loading && (
                <output className="block text-sm text-[#aeb2aa]">
                  {t.recipe.loading}
                </output>
              )}
              {detailDetails.failed && (
                <p role="alert" className="text-sm text-[#f0bbb4]">
                  {t.recipe.loadError}{' '}
                  <button
                    className="underline"
                    onClick={detailDetails.retry}
                    type="button"
                  >
                    {t.recipe.retry}
                  </button>
                </p>
              )}
              <section>
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8d9493]">
                  {t.recipe.ingredients}
                </h3>
                <ul className="divide-y divide-white/6 rounded-xl border border-white/8 bg-black/15">
                  {detail.ingredients.map((item, index) => (
                    <li
                      className="flex items-center justify-between px-4 py-2.5"
                      key={item}
                    >
                      <span
                        className={`text-sm ${findManagedIngredient(item, ingredientRegistry)?.deleted ? 'text-[#f0aaa0]' : stockIds.includes(ingredientIdForName(item, ingredientRegistry)) ? 'text-[#e6e2d8]' : 'text-[#8d9493]'}`}
                      >
                        {tr(ingredientNames, item)}
                        {findManagedIngredient(item, ingredientRegistry)
                          ?.deleted && (
                          <span className="ml-2 text-[10px] text-[#e1a49c]">
                            {t.recipe.deletedIngredient}
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-[#aeb2aa]">
                        {detail.measures?.[index]}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
              {detailInstructions && (
                <section>
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8d9493]">
                    {t.recipe.method}
                  </h3>
                  <p className="text-sm leading-6 text-[#c5c5bd]">
                    {detailInstructions}
                  </p>
                </section>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
