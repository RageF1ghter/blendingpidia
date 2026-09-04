'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  Check,
  Dices,
  Heart,
  Plus,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
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
import {
  baseCocktails,
  fuzzyMatch,
  initialStock,
  methods,
  slugify,
  storageKey,
  type Cocktail,
  type Method,
} from '@/lib/data';
import {
  glassNames,
  ingredientNames,
  instructions as instructionMap,
  labels,
  langStorageKey,
  methodNames,
  tagNames,
  term,
  ui,
  type Lang,
  type TermMap,
} from '@/lib/i18n';

export default function Home() {
  const [lang, setLang] = useLang();
  const [query, setQuery] = useState('');
  const [stockMode, setStockMode] = useState<'all' | 'makeable' | 'near'>('all');
  const [selectedIngredients, setSelectedIngredients] = useState<string[]>([]);
  const [stock, setStock] = useState<string[]>(initialStock);
  const [liked, setLiked] = useState<string[]>([]);
  const [customRecipes, setCustomRecipes] = useState<Cocktail[]>([]);
  const [featuredId, setFeaturedId] = useState('negroni');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [showFavorites, setShowFavorites] = useState(false);
  const [showRecipeForm, setShowRecipeForm] = useState(false);
  const [notice, setNotice] = useState('');
  const [sort, setSort] = useState<'popular' | 'name' | 'newest'>('popular');

  const t = ui[lang];
  const tr = (map: TermMap, value: string) => term(map, value, lang);

  useEffect(() => {
    const savedLang = localStorage.getItem(langStorageKey);
    const resolved: Lang = savedLang === 'zh' || savedLang === 'en' ? savedLang : (navigator.language?.toLowerCase().startsWith('zh') ? 'zh' : 'en');
    try {
      const saved = localStorage.getItem(storageKey);
      if (!saved) return;
      const data = JSON.parse(saved) as { stock?: string[]; liked?: string[]; customRecipes?: Cocktail[] };
      if (data.stock) setStock(data.stock);
      if (data.liked) setLiked(data.liked);
      if (data.customRecipes) setCustomRecipes(data.customRecipes);
    } catch {
      setNotice(ui[resolved].notice.readError);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify({ stock, liked, customRecipes }));
  }, [stock, liked, customRecipes]);

  const cocktails = useMemo(() => [...baseCocktails, ...customRecipes], [customRecipes]);
  const featured = cocktails.find((item) => item.id === featuredId) ?? cocktails[0];
  const allIngredients = useMemo(() => [...new Set(cocktails.flatMap((item) => item.ingredients))].sort(), [cocktails]);
  const missing = (cocktail: Cocktail) => cocktail.ingredients.filter((item) => !stock.includes(item));
  const familyRoot = (cocktail: Cocktail) => cocktail.parentId ?? cocktail.id;
  const variantsFor = (cocktail: Cocktail) => cocktails.filter((item) => item.parentId === familyRoot(cocktail));

  const filtered = useMemo(() => {
    const normalized = query.trim();
    return cocktails
      .filter((cocktail) => {
        const missingCount = missing(cocktail).length;
        const searchable = [
          cocktail.name,
          ...cocktail.ingredients,
          ...cocktail.ingredients.map((item) => term(ingredientNames, item, 'zh')),
          ...cocktail.tags,
          ...cocktail.tags.map((item) => term(tagNames, item, 'zh')),
          cocktail.method,
          term(methodNames, cocktail.method, 'zh'),
        ].join(' ');
        const matchesSearch = !normalized || fuzzyMatch(normalized, searchable);
        const matchesIngredients = selectedIngredients.every((ingredient) => cocktail.ingredients.includes(ingredient));
        const matchesStock = stockMode === 'all' || (stockMode === 'makeable' && missingCount === 0) || (stockMode === 'near' && missingCount > 0 && missingCount <= 2);
        return matchesSearch && matchesIngredients && matchesStock && (!showFavorites || liked.includes(cocktail.id));
      })
      .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : sort === 'newest' ? Number(Boolean(b.isCustom)) - Number(Boolean(a.isCustom)) : b.likes + Number(liked.includes(b.id)) - (a.likes + Number(liked.includes(a.id))));
  }, [cocktails, liked, query, selectedIngredients, showFavorites, sort, stock, stockMode]);

  function toggleIngredient(ingredient: string) {
    setSelectedIngredients((current) => current.includes(ingredient) ? current.filter((item) => item !== ingredient) : [...current, ingredient]);
  }

  function toggleLike(id: string) {
    setLiked((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function openDetail(id: string) {
    setFeaturedId(id);
    setDetailId(id);
  }

  function chooseRandom() {
    const pool = filtered.length ? filtered : cocktails;
    const choice = pool[Math.floor(Math.random() * pool.length)];
    setFeaturedId(choice.id);
    setNotice(t.notice.tryTonight.replace('{name}', choice.name));
  }

  function addRecipe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    const ingredients = String(form.get('ingredients') ?? '').split(',').map((item) => item.trim()).filter(Boolean);
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
    setNotice(recipe.parentId ? t.notice.addedVariant.replace('{name}', recipe.name) : t.notice.added.replace('{name}', recipe.name));
  }

  const featuredMissing = missing(featured);
  const featuredVariants = variantsFor(featured);
  const featuredInstructions = featured.instructions ?? instructionMap[featured.id]?.[lang] ?? '';
  const detail = detailId ? cocktails.find((item) => item.id === detailId) ?? null : null;
  const detailMissing = detail ? missing(detail) : [];
  const detailInstructions = detail ? (detail.instructions ?? instructionMap[detail.id]?.[lang] ?? '') : '';

  return (
    <main className="min-h-screen bg-[#0e1011] text-[#f3ebdd]">
      <header className="sticky top-0 z-30 border-b border-white/8 bg-[#0e1011]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[76px] max-w-[1540px] items-center gap-3 px-4 lg:px-9">
          <a className="group flex shrink-0 items-center gap-3" href="#top">
            <span className="grid h-10 w-10 place-items-center rounded-full border border-[#c88955]/55 bg-[#c88955]/10 text-lg text-[#e8c197]">✦</span>
            <span className="hidden leading-none sm:block"><strong className="font-serif text-base tracking-[0.11em]">BLENDINGPIDIA</strong><small className="mt-1 block text-[10px] tracking-[0.16em] text-[#8d9493]">{labels.brandSubtitle}</small></span>
          </a>
          <label className="relative mx-auto max-w-[550px] flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3a7]" />
            <input aria-label={t.header.searchAria} className="h-11 w-full rounded-xl border border-white/9 bg-white/[0.045] pl-11 pr-10 text-sm outline-none transition placeholder:text-[#858c8b] focus:border-[#c88955]/70" onChange={(event) => setQuery(event.target.value)} placeholder={t.header.searchPlaceholder} value={query} />
            {query && <button aria-label={t.header.clearSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca3a7]" onClick={() => setQuery('')} type="button"><X className="h-4 w-4" /></button>}
          </label>
          <LanguageToggle lang={lang} onChange={setLang} />
          <Button className="hidden bg-transparent text-[#d2d4cc] hover:bg-white/6 hover:text-[#f3ebdd] md:inline-flex" onClick={chooseRandom} variant="ghost"><Dices className="text-[#e8c197]" /> {labels.random}</Button>
          <Button aria-label={t.header.showFavorites} className={showFavorites ? 'bg-[#c88955]/15 text-[#e8c197]' : 'bg-transparent text-[#d2d4cc] hover:bg-white/6'} onClick={() => setShowFavorites((value) => !value)} size="icon" variant="ghost"><Heart fill={showFavorites ? 'currentColor' : 'none'} /></Button>
          <Button className="hidden bg-[#c88955] text-[#1a1512] hover:bg-[#deb07f] sm:inline-flex" onClick={() => setShowRecipeForm(true)}><Plus /> {labels.add}</Button>
        </div>
      </header>

      {notice && <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full border border-[#c88955]/30 bg-[#202427] px-4 py-2 text-sm text-[#f1d4af] shadow-xl"><button className="mr-3 text-[#8d9493]" onClick={() => setNotice('')} type="button">×</button>{notice}</div>}

      <div id="top" className="mx-auto grid max-w-[1540px] grid-cols-1 gap-8 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_258px] lg:px-9">
        <aside className="order-2 lg:order-2"><div className="sticky top-[100px] space-y-7">
          <section>
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8d9493]">{labels.stockTitle}</p>
            <div className="rounded-2xl border border-[#c88955]/25 bg-[#c88955]/[0.07] p-4"><div className="flex items-start justify-between"><div><p className="text-2xl font-semibold tracking-tight">{stock.length}</p><p className="mt-1 text-xs text-[#adb1a8]">{labels.stockCount}</p></div><span className="grid h-8 w-8 place-items-center rounded-full bg-[#78b77a]/15 text-[#91cf94]"><Check className="h-4 w-4" /></span></div><Link className="mt-4 flex w-full items-center justify-between border-t border-[#c88955]/20 pt-3 text-xs text-[#e8c197]" href="/stock">{labels.manage} <ArrowUpRight className="h-3.5 w-3.5" /></Link></div>
          </section>
          <section><p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8d9493]">{labels.availabilityTitle}</p><div className="space-y-1">{([
            ['all', labels.availabilityAll], ['makeable', t.aside.availabilityMakeable], ['near', t.aside.availabilityNear],
          ] as const).map(([value, label]) => <button className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm ${stockMode === value ? 'bg-white/8 text-[#f3ebdd]' : 'text-[#a6aaa4] hover:bg-white/[0.045]'}`} key={value} onClick={() => setStockMode(value)} type="button"><span>{label}</span><span className="text-xs text-[#737a78]">{value === 'all' ? cocktails.length : cocktails.filter((item) => value === 'makeable' ? missing(item).length === 0 : missing(item).length <= 2 && missing(item).length > 0).length}</span></button>)}</div></section>
          <section><p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8d9493]">{labels.ingredientsTitle}</p><div className="flex flex-wrap gap-2 lg:block lg:space-y-1.5">{allIngredients.slice(0, 14).map((item) => <button className={`rounded-full px-3 py-1.5 text-xs lg:flex lg:w-full lg:items-center lg:justify-between lg:rounded-lg ${selectedIngredients.includes(item) ? 'bg-[#c88955]/15 text-[#eac59d]' : 'bg-white/[0.035] text-[#a6aaa4] hover:bg-white/[0.08]'}`} key={item} onClick={() => toggleIngredient(item)} type="button">{tr(ingredientNames, item)}{selectedIngredients.includes(item) && <X className="ml-2 inline h-3 w-3 lg:ml-0" />}</button>)}</div>{selectedIngredients.length > 0 && <button className="mt-3 text-xs text-[#e8c197]" onClick={() => setSelectedIngredients([])} type="button">{labels.clearFilters}</button>}</section>
        </div></aside>

        <section className="min-w-0">
          <div className="mb-8 overflow-hidden rounded-[24px] border border-white/8 bg-[#171a1c]"><div className="grid min-h-[250px] grid-cols-1 md:grid-cols-[1.1fr_1fr]"><div className="relative min-h-[255px] overflow-hidden">{featured.image ? <img alt={featured.name} className="absolute inset-0 h-full w-full object-cover opacity-75" src={featured.image} /> : <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,#c8895577,transparent_30%),linear-gradient(140deg,#303a3b,#171a1c)]" />}<div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#171a1c]/15 to-[#171a1c]" /></div><div className="flex flex-col justify-center p-6 md:-ml-12 md:py-8 lg:p-9"><div className="mb-4 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#e8c197]"><Sparkles className="h-3.5 w-3.5" /> {labels.featuredLabel}</div><h1 className="font-serif text-4xl tracking-tight text-[#f6f0e4] lg:text-5xl">{featured.name}</h1><p className="mt-2 text-sm text-[#aeb2aa]">{tr(methodNames, featured.method)} · {tr(glassNames, featured.glass)} · {featured.ingredients.map((item) => tr(ingredientNames, item)).join(' · ')}</p><div className="mt-5 flex flex-wrap gap-2">{featuredMissing.length === 0 ? <span className="rounded-full bg-[#78b77a]/14 px-3 py-1.5 text-xs text-[#a4dca6]">{t.featured.makeable}</span> : <span className="rounded-full bg-[#c96b5b]/12 px-3 py-1.5 text-xs text-[#e1a49c]">{t.featured.missing.replace('{list}', featuredMissing.map((item) => tr(ingredientNames, item)).join(lang === 'zh' ? '、' : ', '))}</span>} {featuredVariants.length > 0 && <span className="rounded-full bg-[#9b87d6]/15 px-3 py-1.5 text-xs text-[#c9bff3]">{t.featured.variants.replace('{count}', String(featuredVariants.length))}</span>} {featured.isCustom && <span className="rounded-full bg-[#c88955]/15 px-3 py-1.5 text-xs text-[#e8c197]">{t.featured.myRecipe}</span>}</div><p className="mt-5 text-sm leading-6 text-[#c5c5bd]">{featuredInstructions}</p><button className="mt-5 inline-flex w-fit items-center gap-2 rounded-full border border-[#c88955]/40 px-4 py-2 text-xs text-[#e8c197] transition hover:bg-[#c88955]/10" onClick={() => openDetail(featured.id)} type="button">{labels.viewDetail} <ArrowUpRight className="h-3.5 w-3.5" /></button></div></div></div>

          <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8d9493]">{labels.exploreLabel}</p><h2 className="mt-1 font-serif text-2xl tracking-tight">{showFavorites ? t.explore.favorites : selectedIngredients.length ? t.explore.withIngredients.replace('{list}', selectedIngredients.map((item) => tr(ingredientNames, item)).join(' + ')) : t.explore.all}</h2></div><label className="rounded-lg border border-white/10 px-3 py-2 text-xs text-[#bec0b8]">{labels.sortLabel} <select className="ml-1 bg-transparent outline-none" onChange={(event) => setSort(event.target.value as typeof sort)} value={sort}><option value="popular">{t.explore.sortPopular}</option><option value="name">{t.explore.sortName}</option><option value="newest">{t.explore.sortNewest}</option></select></label></div>
          {filtered.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{filtered.map((cocktail) => { const missingItems = missing(cocktail); const isLiked = liked.includes(cocktail.id); const versionCount = variantsFor(cocktail).length; return <article className="group overflow-hidden rounded-2xl border border-white/8 bg-[#171a1c] transition duration-300 hover:-translate-y-1 hover:border-[#c88955]/35" key={cocktail.id}><button className="relative block h-52 w-full overflow-hidden text-left" onClick={() => openDetail(cocktail.id)} type="button">{cocktail.image ? <img alt={cocktail.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" src={cocktail.image} /> : <div className="h-full bg-[radial-gradient(circle_at_30%_30%,#c8895566,transparent_35%),linear-gradient(140deg,#2a3435,#171a1c)]" />}<span className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[#171a1c] to-transparent" /><span className={`absolute bottom-3 left-3 rounded-full px-2.5 py-1 text-[11px] ${missingItems.length === 0 ? 'bg-[#78b77a]/20 text-[#b1e3b1]' : 'bg-[#d46d60]/20 text-[#f0bbb4]'}`}>{missingItems.length === 0 ? t.explore.cardReady : t.explore.cardMissing.replace('{count}', String(missingItems.length))}</span></button><div className="p-4 pt-2"><div className="flex items-start justify-between gap-3"><button className="text-left" onClick={() => openDetail(cocktail.id)} type="button"><h3 className="font-serif text-xl text-[#f3ebdd]">{cocktail.name}</h3><p className="mt-1 text-xs text-[#9ca3a7]">{tr(methodNames, cocktail.method)} · {tr(glassNames, cocktail.glass)}</p></button><button aria-label={t.explore.cardFavoriteAria.replace('{name}', cocktail.name)} className={`grid h-8 w-8 place-items-center rounded-full ${isLiked ? 'bg-[#c88955]/15 text-[#e8c197]' : 'text-[#8d9493] hover:bg-white/7'}`} onClick={() => toggleLike(cocktail.id)} type="button"><Heart className="h-4 w-4" fill={isLiked ? 'currentColor' : 'none'} /></button></div><p className="mt-3 line-clamp-1 text-xs text-[#b3b6ae]">{cocktail.ingredients.map((item) => tr(ingredientNames, item)).join(' · ')}</p><div className="mt-4 flex items-center justify-between border-t border-white/7 pt-3"><span className="text-[11px] text-[#858b88]">♡ {cocktail.likes + Number(isLiked)}</span>{versionCount > 0 ? <button className="text-[11px] text-[#c9bff3]" onClick={() => openDetail(cocktail.id)} type="button">{t.explore.cardVersions.replace('{count}', String(versionCount))}</button> : <span className="text-[11px] text-[#858b88]">{cocktail.isCustom ? t.explore.cardMyRecipe : t.explore.cardView}</span>}</div></div></article>})}</div> : <div className="rounded-2xl border border-dashed border-white/12 py-16 text-center text-sm text-[#9ca3a7]">{t.explore.empty}</div>}

          <section className="mt-9 rounded-2xl border border-[#9b87d6]/20 bg-[#9b87d6]/[0.055] p-5 sm:p-6"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#c9bff3]">{labels.familyLabel}</p><h2 className="mt-1 font-serif text-2xl">{t.family.title.replace('{name}', baseCocktails.find((item) => item.id === familyRoot(featured))?.name ?? featured.name)}</h2><p className="mt-1 text-sm text-[#acabb7]">{t.family.description}</p><div className="mt-6 grid gap-3 sm:grid-cols-3">{[cocktails.find((item) => item.id === familyRoot(featured)), ...featuredVariants].filter(Boolean).map((item) => { const recipe = item as Cocktail; return <button className={`rounded-xl border px-4 py-3 text-left text-sm ${recipe.id === featured.id ? 'border-[#c88955]/45 bg-[#c88955]/10 text-[#f2d1a9]' : 'border-white/8 bg-black/10 text-[#ded9ed]'}`} key={recipe.id} onClick={() => setFeaturedId(recipe.id)} type="button"><span className="mr-2 text-[#c9bff3]">{recipe.parentId ? '↳' : '●'}</span>{recipe.name}</button> })}</div></section>
        </section>
      </div>

      <Dialog onOpenChange={setShowRecipeForm} open={showRecipeForm}><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto border-white/10 bg-[#202427] text-[#f3ebdd]"><DialogHeader><DialogTitle className="font-serif text-2xl">{labels.formTitle}</DialogTitle><DialogDescription>{t.formDialog.description}</DialogDescription></DialogHeader><form className="grid gap-4" onSubmit={addRecipe}><div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-xs text-[#b5b9b1]">{labels.formName}<Input className="border-white/10 bg-black/15 text-[#f3ebdd]" name="name" placeholder="Smoked Negroni" /></label><label className="grid gap-2 text-xs text-[#b5b9b1]">{labels.formRelation}<select className="h-9 rounded-lg border border-white/10 bg-black/15 px-2 text-sm text-[#f3ebdd]" name="parentId"><option value="">{labels.formOriginal}</option>{cocktails.filter((item) => !item.parentId).map((item) => <option key={item.id} value={item.id}>{t.formDialog.basedOn.replace('{name}', item.name)}</option>)}</select></label></div><div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-xs text-[#b5b9b1]">{labels.formMethod}<select className="h-9 rounded-lg border border-white/10 bg-black/15 px-2 text-sm text-[#f3ebdd]" defaultValue="Shake" name="method">{methods.map((item) => <option key={item}>{tr(methodNames, item)}</option>)}</select></label><label className="grid gap-2 text-xs text-[#b5b9b1]">{labels.formGlass}<Input className="border-white/10 bg-black/15 text-[#f3ebdd]" defaultValue="Cocktail" name="glass" /></label></div><label className="grid gap-2 text-xs text-[#b5b9b1]">{labels.formIngredients}<Input className="border-white/10 bg-black/15 text-[#f3ebdd]" name="ingredients" placeholder="Gin, Lime juice, Simple Syrup" /></label><label className="grid gap-2 text-xs text-[#b5b9b1]">{labels.formImage}<Input className="border-white/10 bg-black/15 text-[#f3ebdd]" name="image" placeholder="https://..." /></label><label className="grid gap-2 text-xs text-[#b5b9b1]">{labels.formInstructions}<textarea className="min-h-24 rounded-lg border border-white/10 bg-black/15 p-3 text-sm text-[#f3ebdd] outline-none focus:border-[#c88955]/70" name="instructions" placeholder={t.formDialog.instructionsPlaceholder} /></label><div className="flex justify-end gap-2 pt-2"><Button className="text-[#c5c8c1]" onClick={() => setShowRecipeForm(false)} type="button" variant="ghost">{labels.formCancel}</Button><Button className="bg-[#c88955] text-[#1a1512] hover:bg-[#deb07f]" type="submit">{labels.formSave}</Button></div></form></DialogContent></Dialog>
      <Dialog onOpenChange={(open) => { if (!open) setDetailId(null); }} open={detailId !== null}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto border-white/10 bg-[#202427] text-[#f3ebdd]">
          {detail && (
            <>
              <div className="relative -mx-4 -mt-4 h-56 overflow-hidden rounded-t-xl">
                {detail.image ? <img alt={detail.name} className="h-full w-full object-cover" src={detail.image} /> : <div className="h-full bg-[radial-gradient(circle_at_30%_30%,#c8895566,transparent_35%),linear-gradient(140deg,#2a3435,#171a1c)]" />}
                <div className="absolute inset-0 bg-gradient-to-t from-[#202427] via-transparent to-transparent" />
              </div>
              <DialogHeader>
                <DialogTitle className="font-serif text-3xl text-[#f6f0e4]">{detail.name}</DialogTitle>
                <DialogDescription className="text-sm text-[#aeb2aa]">{tr(methodNames, detail.method)} · {tr(glassNames, detail.glass)}</DialogDescription>
              </DialogHeader>
              <div className="flex flex-wrap gap-2">
                {detailMissing.length === 0 ? <span className="rounded-full bg-[#78b77a]/14 px-3 py-1.5 text-xs text-[#a4dca6]">{t.featured.makeable}</span> : <span className="rounded-full bg-[#c96b5b]/12 px-3 py-1.5 text-xs text-[#e1a49c]">{t.featured.missing.replace('{list}', detailMissing.map((item) => tr(ingredientNames, item)).join(lang === 'zh' ? '、' : ', '))}</span>}
                {detail.tags.map((tag) => <span className="rounded-full bg-white/6 px-3 py-1.5 text-xs text-[#c5c5bd]" key={tag}>{tr(tagNames, tag)}</span>)}
              </div>
              <section>
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8d9493]">{labels.recipe}</h3>
                <ul className="divide-y divide-white/6 rounded-xl border border-white/8 bg-black/15">
                  {detail.ingredients.map((item, index) => (
                    <li className="flex items-center justify-between px-4 py-2.5" key={item}>
                      <span className={`text-sm ${stock.includes(item) ? 'text-[#e6e2d8]' : 'text-[#8d9493]'}`}>{tr(ingredientNames, item)}</span>
                      <span className="text-xs text-[#aeb2aa]">{detail.measures?.[index]}</span>
                    </li>
                  ))}
                </ul>
              </section>
              {detailInstructions && (
                <section>
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8d9493]">{labels.method}</h3>
                  <p className="text-sm leading-6 text-[#c5c5bd]">{detailInstructions}</p>
                </section>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
