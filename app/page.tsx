'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
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

type Method = 'Shake' | 'Stir' | 'Build' | 'Blend' | 'Muddle' | 'Layer';
type Cocktail = {
  id: string;
  name: string;
  image?: string;
  method: Method;
  glass: string;
  ingredients: string[];
  tags: string[];
  likes: number;
  instructions: string;
  parentId?: string | null;
  isCustom?: boolean;
};

const baseCocktails: Cocktail[] = [
  { id: 'negroni', name: 'Negroni', image: '/cocktails/negroni.webp', method: 'Build', glass: 'Lowball', ingredients: ['Gin', 'Campari', 'Sweet Vermouth'], tags: ['IBA Cocktail', 'Bitter'], likes: 328, instructions: '将所有材料注入装有冰块的古典杯，轻轻搅拌。' },
  { id: 'boulevardier', name: 'Boulevardier', image: '/cocktails/boulevardier.webp', method: 'Stir', glass: 'Cocktail', ingredients: ['Bourbon Whiskey', 'Campari', 'Sweet Vermouth'], tags: ['Negroni', 'Bitter'], likes: 188, instructions: '加冰搅拌后滤入冰镇鸡尾酒杯。', parentId: 'negroni' },
  { id: 'white-negroni', name: 'White Negroni', image: '/cocktails/white-negroni.webp', method: 'Stir', glass: 'Lowball', ingredients: ['Gin', 'Suze', 'Lillet Blanc'], tags: ['Negroni', 'Herbaceous'], likes: 156, instructions: '加冰搅拌，滤入装有大冰块的古典杯。', parentId: 'negroni' },
  { id: 'margarita', name: 'Margarita', image: '/cocktails/margarita.webp', method: 'Shake', glass: 'Margarita', ingredients: ['Tequila Blanco', 'Triple Sec', 'Lime juice', 'Agave Syrup'], tags: ['IBA Cocktail', 'Contemporary Classic'], likes: 246, instructions: '所有材料加冰摇和，滤入冰镇玛格丽特杯。' },
  { id: 'martini', name: 'Martini', image: '/cocktails/martini.webp', method: 'Stir', glass: 'Cocktail', ingredients: ['Gin', 'Dry Vermouth', 'Orange bitters'], tags: ['IBA Cocktail', 'Dry'], likes: 212, instructions: '加冰搅拌，滤入冰镇鸡尾酒杯。' },
  { id: 'daiquiri', name: 'Daiquiri', image: '/cocktails/daiquiri.webp', method: 'Shake', glass: 'Coupe', ingredients: ['Light Rum', 'Lime juice', 'Simple Syrup'], tags: ['IBA Cocktail', 'Classic'], likes: 197, instructions: '所有材料加冰摇和，细滤入冰镇 Coupe 杯。' },
  { id: 'aviation', name: 'Aviation', image: '/cocktails/aviation.webp', method: 'Shake', glass: 'Cocktail', ingredients: ['Gin', 'Lemon juice', 'Maraschino', 'Crème de Violette'], tags: ['IBA Cocktail', 'Herbaceous'], likes: 164, instructions: '所有材料加冰摇和，滤入鸡尾酒杯。' },
  { id: 'old-fashioned', name: 'Old Fashioned', image: '/cocktails/old-fashioned.webp', method: 'Build', glass: 'Lowball', ingredients: ['Bourbon Whiskey', 'Simple Syrup', 'Angostura bitters', 'Orange bitters'], tags: ['IBA Cocktail', 'Old Fashioned'], likes: 301, instructions: '在古典杯中加冰搅拌，表达橙皮精油。' },
];

const initialStock = ['Gin', 'Campari', 'Sweet Vermouth', 'Dry Vermouth', 'Orange bitters', 'Light Rum', 'Lime juice', 'Simple Syrup', 'Bourbon Whiskey', 'Angostura bitters', 'Tequila Blanco', 'Triple Sec'];
const methods: Method[] = ['Shake', 'Stir', 'Build', 'Blend', 'Muddle', 'Layer'];
const storageKey = 'blendingpidia-v1';

function fuzzyMatch(query: string, value: string) {
  const needle = query.toLowerCase().replace(/\s/g, '');
  const haystack = value.toLowerCase().replace(/\s/g, '');
  let index = 0;
  for (const char of haystack) if (char === needle[index]) index += 1;
  return index === needle.length;
}

function slugify(value: string) {
  return `${value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${Date.now()}`;
}

export default function Home() {
  const [query, setQuery] = useState('');
  const [stockMode, setStockMode] = useState<'all' | 'makeable' | 'near'>('all');
  const [selectedIngredients, setSelectedIngredients] = useState<string[]>([]);
  const [stock, setStock] = useState<string[]>(initialStock);
  const [liked, setLiked] = useState<string[]>([]);
  const [customRecipes, setCustomRecipes] = useState<Cocktail[]>([]);
  const [featuredId, setFeaturedId] = useState('negroni');
  const [showFavorites, setShowFavorites] = useState(false);
  const [showStock, setShowStock] = useState(false);
  const [showRecipeForm, setShowRecipeForm] = useState(false);
  const [notice, setNotice] = useState('');
  const [sort, setSort] = useState<'popular' | 'name' | 'newest'>('popular');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (!saved) return;
      const data = JSON.parse(saved) as { stock?: string[]; liked?: string[]; customRecipes?: Cocktail[] };
      if (data.stock) setStock(data.stock);
      if (data.liked) setLiked(data.liked);
      if (data.customRecipes) setCustomRecipes(data.customRecipes);
    } catch {
      setNotice('本地数据无法读取，已使用默认酒柜。');
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
        const searchable = [cocktail.name, ...cocktail.ingredients, ...cocktail.tags, cocktail.method].join(' ');
        const matchesSearch = !normalized || fuzzyMatch(normalized, searchable);
        const matchesIngredients = selectedIngredients.every((ingredient) => cocktail.ingredients.includes(ingredient));
        const matchesStock = stockMode === 'all' || (stockMode === 'makeable' && missingCount === 0) || (stockMode === 'near' && missingCount > 0 && missingCount <= 2);
        return matchesSearch && matchesIngredients && matchesStock && (!showFavorites || liked.includes(cocktail.id));
      })
      .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : sort === 'newest' ? Number(Boolean(b.isCustom)) - Number(Boolean(a.isCustom)) : b.likes + Number(liked.includes(b.id)) - (a.likes + Number(liked.includes(a.id))));
  }, [cocktails, liked, query, selectedIngredients, showFavorites, sort, stock, stockMode]);

  function toggleStock(ingredient: string) {
    setStock((current) => current.includes(ingredient) ? current.filter((item) => item !== ingredient) : [...current, ingredient]);
  }

  function toggleIngredient(ingredient: string) {
    setSelectedIngredients((current) => current.includes(ingredient) ? current.filter((item) => item !== ingredient) : [...current, ingredient]);
  }

  function toggleLike(id: string) {
    setLiked((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function chooseRandom() {
    const pool = filtered.length ? filtered : cocktails;
    const choice = pool[Math.floor(Math.random() * pool.length)];
    setFeaturedId(choice.id);
    setNotice(`今晚试试 ${choice.name}。`);
  }

  function addRecipe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    const ingredients = String(form.get('ingredients') ?? '').split(',').map((item) => item.trim()).filter(Boolean);
    if (!name || !ingredients.length) {
      setNotice('请填写配方名称和至少一种原料。');
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
      instructions: String(form.get('instructions') ?? '').trim() || '请补充调制步骤。',
      parentId: String(form.get('parentId') ?? '') || null,
      isCustom: true,
    };
    setCustomRecipes((current) => [recipe, ...current]);
    setFeaturedId(recipe.id);
    setShowRecipeForm(false);
    setNotice(recipe.parentId ? `${recipe.name} 已作为改编版本保存。` : `${recipe.name} 已加入我的配方。`);
  }

  const featuredMissing = missing(featured);
  const featuredVariants = variantsFor(featured);

  return (
    <main className="min-h-screen bg-[#0e1011] text-[#f3ebdd]">
      <header className="sticky top-0 z-30 border-b border-white/8 bg-[#0e1011]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[76px] max-w-[1540px] items-center gap-3 px-4 lg:px-9">
          <a className="group flex shrink-0 items-center gap-3" href="#top">
            <span className="grid h-10 w-10 place-items-center rounded-full border border-[#c88955]/55 bg-[#c88955]/10 text-lg text-[#e8c197]">✦</span>
            <span className="hidden leading-none sm:block"><strong className="font-serif text-base tracking-[0.11em]">BLENDINGPIDIA</strong><small className="mt-1 block text-[10px] tracking-[0.16em] text-[#8d9493]">COCKTAIL ENCYCLOPEDIA</small></span>
          </a>
          <label className="relative mx-auto max-w-[550px] flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3a7]" />
            <input aria-label="搜索鸡尾酒或原料" className="h-11 w-full rounded-xl border border-white/9 bg-white/[0.045] pl-11 pr-10 text-sm outline-none transition placeholder:text-[#858c8b] focus:border-[#c88955]/70" onChange={(event) => setQuery(event.target.value)} placeholder="搜索 Search · 名称、原料、风味，支持模糊匹配…" value={query} />
            {query && <button aria-label="清除搜索" className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca3a7]" onClick={() => setQuery('')} type="button"><X className="h-4 w-4" /></button>}
          </label>
          <Button className="hidden bg-transparent text-[#d2d4cc] hover:bg-white/6 hover:text-[#f3ebdd] md:inline-flex" onClick={chooseRandom} variant="ghost"><Dices className="text-[#e8c197]" /> 随机 Random</Button>
          <Button aria-label="只显示收藏" className={showFavorites ? 'bg-[#c88955]/15 text-[#e8c197]' : 'bg-transparent text-[#d2d4cc] hover:bg-white/6'} onClick={() => setShowFavorites((value) => !value)} size="icon" variant="ghost"><Heart fill={showFavorites ? 'currentColor' : 'none'} /></Button>
          <Button className="hidden bg-[#c88955] text-[#1a1512] hover:bg-[#deb07f] sm:inline-flex" onClick={() => setShowRecipeForm(true)}><Plus /> 新增 Add</Button>
        </div>
      </header>

      {notice && <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full border border-[#c88955]/30 bg-[#202427] px-4 py-2 text-sm text-[#f1d4af] shadow-xl"><button className="mr-3 text-[#8d9493]" onClick={() => setNotice('')} type="button">×</button>{notice}</div>}

      <div id="top" className="mx-auto grid max-w-[1540px] grid-cols-1 gap-8 px-4 py-6 lg:grid-cols-[258px_minmax(0,1fr)] lg:px-9">
        <aside className="order-2 lg:order-1"><div className="sticky top-[100px] space-y-7">
          <section>
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8d9493]">我的酒柜 · Stock</p>
            <div className="rounded-2xl border border-[#c88955]/25 bg-[#c88955]/[0.07] p-4"><div className="flex items-start justify-between"><div><p className="text-2xl font-semibold tracking-tight">{stock.length}</p><p className="mt-1 text-xs text-[#adb1a8]">已入库 ingredients</p></div><span className="grid h-8 w-8 place-items-center rounded-full bg-[#78b77a]/15 text-[#91cf94]"><Check className="h-4 w-4" /></span></div><button className="mt-4 flex w-full items-center justify-between border-t border-[#c88955]/20 pt-3 text-xs text-[#e8c197]" onClick={() => setShowStock(true)} type="button">管理酒柜 Manage <ArrowUpRight className="h-3.5 w-3.5" /></button></div>
          </section>
          <section><p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8d9493]">制作条件 · Availability</p><div className="space-y-1">{([
            ['all', '全部 All'], ['makeable', '现在可以制作'], ['near', '缺少 1–2 种'],
          ] as const).map(([value, label]) => <button className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm ${stockMode === value ? 'bg-white/8 text-[#f3ebdd]' : 'text-[#a6aaa4] hover:bg-white/[0.045]'}`} key={value} onClick={() => setStockMode(value)} type="button"><span>{label}</span><span className="text-xs text-[#737a78]">{value === 'all' ? cocktails.length : cocktails.filter((item) => value === 'makeable' ? missing(item).length === 0 : missing(item).length <= 2 && missing(item).length > 0).length}</span></button>)}</div></section>
          <section><p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8d9493]">按原料过滤 · Ingredients</p><div className="flex flex-wrap gap-2 lg:block lg:space-y-1.5">{allIngredients.slice(0, 14).map((item) => <button className={`rounded-full px-3 py-1.5 text-xs lg:flex lg:w-full lg:items-center lg:justify-between lg:rounded-lg ${selectedIngredients.includes(item) ? 'bg-[#c88955]/15 text-[#eac59d]' : 'bg-white/[0.035] text-[#a6aaa4] hover:bg-white/[0.08]'}`} key={item} onClick={() => toggleIngredient(item)} type="button">{item}{selectedIngredients.includes(item) && <X className="ml-2 inline h-3 w-3 lg:ml-0" />}</button>)}</div>{selectedIngredients.length > 0 && <button className="mt-3 text-xs text-[#e8c197]" onClick={() => setSelectedIngredients([])} type="button">清除筛选 Clear</button>}</section>
        </div></aside>

        <section className="min-w-0">
          <div className="mb-8 overflow-hidden rounded-[24px] border border-white/8 bg-[#171a1c]"><div className="grid min-h-[250px] grid-cols-1 md:grid-cols-[1.1fr_1fr]"><div className="relative min-h-[255px] overflow-hidden">{featured.image ? <img alt={featured.name} className="absolute inset-0 h-full w-full object-cover opacity-75" src={featured.image} /> : <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,#c8895577,transparent_30%),linear-gradient(140deg,#303a3b,#171a1c)]" />}<div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#171a1c]/15 to-[#171a1c]" /></div><div className="flex flex-col justify-center p-6 md:-ml-12 md:py-8 lg:p-9"><div className="mb-4 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#e8c197]"><Sparkles className="h-3.5 w-3.5" /> 配方档案 · Recipe file</div><h1 className="font-serif text-4xl tracking-tight text-[#f6f0e4] lg:text-5xl">{featured.name}</h1><p className="mt-2 text-sm text-[#aeb2aa]">{featured.method} · {featured.glass} · {featured.ingredients.join(' · ')}</p><div className="mt-5 flex flex-wrap gap-2">{featuredMissing.length === 0 ? <span className="rounded-full bg-[#78b77a]/14 px-3 py-1.5 text-xs text-[#a4dca6]">✓ 现在可以制作</span> : <span className="rounded-full bg-[#c96b5b]/12 px-3 py-1.5 text-xs text-[#e1a49c]">缺少 {featuredMissing.join('、')}</span>} {featuredVariants.length > 0 && <span className="rounded-full bg-[#9b87d6]/15 px-3 py-1.5 text-xs text-[#c9bff3]">{featuredVariants.length} 个改编版本</span>} {featured.isCustom && <span className="rounded-full bg-[#c88955]/15 px-3 py-1.5 text-xs text-[#e8c197]">我的配方</span>}</div><p className="mt-5 text-sm leading-6 text-[#c5c5bd]">{featured.instructions}</p></div></div></div>

          <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8d9493]">探索 · Explore</p><h2 className="mt-1 font-serif text-2xl tracking-tight">{showFavorites ? '我的收藏' : selectedIngredients.length ? `${selectedIngredients.join(' + ')} 的配方` : '全部鸡尾酒'}</h2></div><label className="rounded-lg border border-white/10 px-3 py-2 text-xs text-[#bec0b8]">排序 Sort <select className="ml-1 bg-transparent outline-none" onChange={(event) => setSort(event.target.value as typeof sort)} value={sort}><option value="popular">人气</option><option value="name">名称</option><option value="newest">我的新增</option></select></label></div>
          {filtered.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{filtered.map((cocktail) => { const missingItems = missing(cocktail); const isLiked = liked.includes(cocktail.id); const versionCount = variantsFor(cocktail).length; return <article className="group overflow-hidden rounded-2xl border border-white/8 bg-[#171a1c] transition duration-300 hover:-translate-y-1 hover:border-[#c88955]/35" key={cocktail.id}><button className="relative block h-52 w-full overflow-hidden text-left" onClick={() => setFeaturedId(cocktail.id)} type="button">{cocktail.image ? <img alt={cocktail.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" src={cocktail.image} /> : <div className="h-full bg-[radial-gradient(circle_at_30%_30%,#c8895566,transparent_35%),linear-gradient(140deg,#2a3435,#171a1c)]" />}<span className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[#171a1c] to-transparent" /><span className={`absolute bottom-3 left-3 rounded-full px-2.5 py-1 text-[11px] ${missingItems.length === 0 ? 'bg-[#78b77a]/20 text-[#b1e3b1]' : 'bg-[#d46d60]/20 text-[#f0bbb4]'}`}>{missingItems.length === 0 ? '✓ 原料齐全' : `缺少 ${missingItems.length} 种`}</span></button><div className="p-4 pt-2"><div className="flex items-start justify-between gap-3"><button className="text-left" onClick={() => setFeaturedId(cocktail.id)} type="button"><h3 className="font-serif text-xl text-[#f3ebdd]">{cocktail.name}</h3><p className="mt-1 text-xs text-[#9ca3a7]">{cocktail.method} · {cocktail.glass}</p></button><button aria-label={`收藏 ${cocktail.name}`} className={`grid h-8 w-8 place-items-center rounded-full ${isLiked ? 'bg-[#c88955]/15 text-[#e8c197]' : 'text-[#8d9493] hover:bg-white/7'}`} onClick={() => toggleLike(cocktail.id)} type="button"><Heart className="h-4 w-4" fill={isLiked ? 'currentColor' : 'none'} /></button></div><p className="mt-3 line-clamp-1 text-xs text-[#b3b6ae]">{cocktail.ingredients.join(' · ')}</p><div className="mt-4 flex items-center justify-between border-t border-white/7 pt-3"><span className="text-[11px] text-[#858b88]">♡ {cocktail.likes + Number(isLiked)}</span>{versionCount > 0 ? <button className="text-[11px] text-[#c9bff3]" onClick={() => setFeaturedId(cocktail.id)} type="button">{versionCount} 个版本</button> : <span className="text-[11px] text-[#858b88]">{cocktail.isCustom ? '我的配方' : '查看档案'}</span>}</div></div></article>})}</div> : <div className="rounded-2xl border border-dashed border-white/12 py-16 text-center text-sm text-[#9ca3a7]">没有找到符合条件的配方。试试移除一个筛选条件。</div>}

          <section className="mt-9 rounded-2xl border border-[#9b87d6]/20 bg-[#9b87d6]/[0.055] p-5 sm:p-6"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#c9bff3]">配方家族 · Version family</p><h2 className="mt-1 font-serif text-2xl">{baseCocktails.find((item) => item.id === familyRoot(featured))?.name ?? featured.name} 的版本谱系</h2><p className="mt-1 text-sm text-[#acabb7]">同一配方可保留独立用量与手法；从原始配方或任意版本继续改编。</p><div className="mt-6 grid gap-3 sm:grid-cols-3">{[cocktails.find((item) => item.id === familyRoot(featured)), ...featuredVariants].filter(Boolean).map((item) => { const recipe = item as Cocktail; return <button className={`rounded-xl border px-4 py-3 text-left text-sm ${recipe.id === featured.id ? 'border-[#c88955]/45 bg-[#c88955]/10 text-[#f2d1a9]' : 'border-white/8 bg-black/10 text-[#ded9ed]'}`} key={recipe.id} onClick={() => setFeaturedId(recipe.id)} type="button"><span className="mr-2 text-[#c9bff3]">{recipe.parentId ? '↳' : '●'}</span>{recipe.name}</button> })}</div></section>
        </section>
      </div>

      <Dialog onOpenChange={setShowStock} open={showStock}><DialogContent className="max-w-xl border-white/10 bg-[#202427] text-[#f3ebdd]"><DialogHeader><DialogTitle className="font-serif text-2xl">我的酒柜 · Stock</DialogTitle><DialogDescription>选择当前拥有的原料；“可以制作”会立即按此更新。</DialogDescription></DialogHeader><div className="grid max-h-[55vh] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">{allIngredients.map((item) => <button className={`rounded-lg border px-3 py-2 text-left text-xs ${stock.includes(item) ? 'border-[#78b77a]/35 bg-[#78b77a]/10 text-[#bae4ba]' : 'border-white/10 text-[#aeb2aa]'}`} key={item} onClick={() => toggleStock(item)} type="button">{stock.includes(item) ? '✓ ' : '+ '}{item}</button>)}</div></DialogContent></Dialog>

      <Dialog onOpenChange={setShowRecipeForm} open={showRecipeForm}><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto border-white/10 bg-[#202427] text-[#f3ebdd]"><DialogHeader><DialogTitle className="font-serif text-2xl">新增个人配方 · Add recipe</DialogTitle><DialogDescription>可以作为原创配方保存，或选择已有配方作为改编来源。</DialogDescription></DialogHeader><form className="grid gap-4" onSubmit={addRecipe}><div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-xs text-[#b5b9b1]">名称 Name<Input className="border-white/10 bg-black/15 text-[#f3ebdd]" name="name" placeholder="例如：Smoked Negroni" /></label><label className="grid gap-2 text-xs text-[#b5b9b1]">配方关系 Version<select className="h-9 rounded-lg border border-white/10 bg-black/15 px-2 text-sm text-[#f3ebdd]" name="parentId"><option value="">原创 Original</option>{cocktails.filter((item) => !item.parentId).map((item) => <option key={item.id} value={item.id}>改编自 {item.name}</option>)}</select></label></div><div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-xs text-[#b5b9b1]">调制手法 Method<select className="h-9 rounded-lg border border-white/10 bg-black/15 px-2 text-sm text-[#f3ebdd]" defaultValue="Shake" name="method">{methods.map((item) => <option key={item}>{item}</option>)}</select></label><label className="grid gap-2 text-xs text-[#b5b9b1]">杯型 Glass<Input className="border-white/10 bg-black/15 text-[#f3ebdd]" defaultValue="Cocktail" name="glass" /></label></div><label className="grid gap-2 text-xs text-[#b5b9b1]">原料 Ingredients<Input className="border-white/10 bg-black/15 text-[#f3ebdd]" name="ingredients" placeholder="Gin, Lime juice, Simple Syrup" /></label><label className="grid gap-2 text-xs text-[#b5b9b1]">图片 URL（可选）<Input className="border-white/10 bg-black/15 text-[#f3ebdd]" name="image" placeholder="https://..." /></label><label className="grid gap-2 text-xs text-[#b5b9b1]">调制步骤 Instructions<textarea className="min-h-24 rounded-lg border border-white/10 bg-black/15 p-3 text-sm text-[#f3ebdd] outline-none focus:border-[#c88955]/70" name="instructions" placeholder="描述摇和、搅拌、滤冰和装饰步骤。" /></label><div className="flex justify-end gap-2 pt-2"><Button className="text-[#c5c8c1]" onClick={() => setShowRecipeForm(false)} type="button" variant="ghost">取消 Cancel</Button><Button className="bg-[#c88955] text-[#1a1512] hover:bg-[#deb07f]" type="submit">保存配方 Save</Button></div></form></DialogContent></Dialog>
    </main>
  );
}
