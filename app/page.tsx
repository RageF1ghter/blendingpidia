'use client';

import { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Dices,
  Heart,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';

type Cocktail = {
  id: string;
  name: string;
  image: string;
  method: 'Shake' | 'Stir' | 'Build';
  glass: string;
  ingredients: string[];
  tags: string[];
  available: boolean;
  missing?: string;
  versions?: number;
  likes: number;
};

const cocktails: Cocktail[] = [
  {
    id: 'negroni',
    name: 'Negroni',
    image: '/cocktails/negroni.webp',
    method: 'Build',
    glass: 'Lowball',
    ingredients: ['Gin', 'Campari', 'Sweet Vermouth'],
    tags: ['IBA Cocktail', 'Bitter'],
    available: true,
    versions: 2,
    likes: 328,
  },
  {
    id: 'margarita',
    name: 'Margarita',
    image: '/cocktails/margarita.webp',
    method: 'Shake',
    glass: 'Margarita',
    ingredients: ['Tequila Blanco', 'Triple Sec', 'Lime juice', 'Agave Syrup'],
    tags: ['IBA Cocktail', 'Contemporary Classic'],
    available: false,
    missing: 'Agave Syrup',
    likes: 246,
  },
  {
    id: 'martini',
    name: 'Martini',
    image: '/cocktails/martini.webp',
    method: 'Stir',
    glass: 'Cocktail',
    ingredients: ['Gin', 'Dry Vermouth', 'Orange bitters'],
    tags: ['IBA Cocktail', 'Dry'],
    available: true,
    likes: 212,
  },
  {
    id: 'daiquiri',
    name: 'Daiquiri',
    image: '/cocktails/daiquiri.webp',
    method: 'Shake',
    glass: 'Coupe',
    ingredients: ['Light Rum', 'Lime juice', 'Simple Syrup'],
    tags: ['IBA Cocktail', 'Classic'],
    available: true,
    likes: 197,
  },
  {
    id: 'aviation',
    name: 'Aviation',
    image: '/cocktails/aviation.webp',
    method: 'Shake',
    glass: 'Cocktail',
    ingredients: ['Gin', 'Lemon juice', 'Maraschino', 'Crème de Violette'],
    tags: ['IBA Cocktail', 'Herbaceous'],
    available: false,
    missing: 'Crème de Violette',
    likes: 164,
  },
  {
    id: 'old-fashioned',
    name: 'Old Fashioned',
    image: '/cocktails/old-fashioned.webp',
    method: 'Build',
    glass: 'Lowball',
    ingredients: ['Bourbon Whiskey', 'Simple Syrup', 'Angostura bitters', 'Orange bitters'],
    tags: ['IBA Cocktail', 'Old Fashioned'],
    available: true,
    likes: 301,
  },
];

const ingredientFilters = ['Gin', 'Campari', 'Lime juice', 'Simple Syrup', 'Dry Vermouth'];

export default function Home() {
  const [query, setQuery] = useState('');
  const [availability, setAvailability] = useState<'all' | 'ready' | 'near'>('all');
  const [ingredient, setIngredient] = useState<string | null>('Gin');
  const [liked, setLiked] = useState<string[]>(['negroni']);
  const [featured, setFeatured] = useState<Cocktail>(cocktails[0]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return cocktails.filter((cocktail) => {
      const matchesQuery =
        !normalized ||
        [cocktail.name, ...cocktail.ingredients, ...cocktail.tags]
          .join(' ')
          .toLowerCase()
          .includes(normalized);
      const matchesIngredient = !ingredient || cocktail.ingredients.includes(ingredient);
      const matchesStock =
        availability === 'all' ||
        (availability === 'ready' && cocktail.available) ||
        (availability === 'near' && !cocktail.available);
      return matchesQuery && matchesIngredient && matchesStock;
    });
  }, [availability, ingredient, query]);

  function chooseRandom() {
    const source = filtered.length ? filtered : cocktails;
    setFeatured(source[Math.floor(Math.random() * source.length)]);
  }

  function toggleLike(id: string) {
    setLiked((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  return (
    <main className="min-h-screen bg-[#0e1011] text-[#f3ebdd]">
      <header className="sticky top-0 z-30 border-b border-white/8 bg-[#0e1011]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[76px] max-w-[1540px] items-center gap-4 px-5 lg:px-9">
          <a className="group flex shrink-0 items-center gap-3" href="#top">
            <span className="grid h-10 w-10 place-items-center rounded-full border border-[#c88955]/55 bg-[#c88955]/10 text-lg text-[#e8c197] transition group-hover:bg-[#c88955]/20">✦</span>
            <span className="hidden leading-none sm:block">
              <strong className="font-serif text-base tracking-[0.16em]">NOCTURNE</strong>
              <small className="mt-1 block text-[10px] tracking-[0.2em] text-[#8d9493]">COCKTAIL INDEX</small>
            </span>
          </a>

          <label className="relative mx-auto max-w-[520px] flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3a7]" />
            <input
              aria-label="搜索鸡尾酒或原料"
              className="h-11 w-full rounded-xl border border-white/9 bg-white/[0.045] pl-11 pr-10 text-sm text-[#f3ebdd] outline-none transition placeholder:text-[#858c8b] focus:border-[#c88955]/70 focus:bg-white/[0.07]"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索鸡尾酒、原料或风味…"
              value={query}
            />
            {query && <X className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3a7]" />}
          </label>

          <button className="hidden h-10 items-center gap-2 rounded-lg px-3 text-sm text-[#d2d4cc] transition hover:bg-white/6 md:flex" onClick={chooseRandom} type="button">
            <Dices className="h-4 w-4 text-[#e8c197]" /> 随机一杯
          </button>
          <button className="grid h-10 w-10 place-items-center rounded-lg text-[#d2d4cc] transition hover:bg-white/6" type="button" aria-label="我的收藏">
            <Heart className="h-4 w-4" />
          </button>
          <button className="hidden h-10 items-center gap-2 rounded-lg bg-[#c88955] px-4 text-sm font-medium text-[#1a1512] transition hover:bg-[#deb07f] sm:flex" type="button">
            <Plus className="h-4 w-4" /> 新增配方
          </button>
        </div>
      </header>

      <div id="top" className="mx-auto grid max-w-[1540px] grid-cols-1 gap-8 px-5 py-7 lg:grid-cols-[248px_minmax(0,1fr)] lg:px-9">
        <aside className="order-2 lg:order-1">
          <div className="sticky top-[100px] space-y-7">
            <section>
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8d9493]">我的酒柜</p>
              <div className="rounded-2xl border border-[#c88955]/25 bg-[#c88955]/[0.07] p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-2xl font-semibold tracking-tight">24</p>
                    <p className="mt-1 text-xs text-[#adb1a8]">已入库原料</p>
                  </div>
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-[#78b77a]/15 text-[#91cf94]"><Check className="h-4 w-4" /></span>
                </div>
                <button className="mt-4 flex w-full items-center justify-between border-t border-[#c88955]/20 pt-3 text-xs text-[#e8c197]" type="button">查看我的酒柜 <ArrowUpRight className="h-3.5 w-3.5" /></button>
              </div>
            </section>

            <section>
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8d9493]">制作条件</p>
              <div className="space-y-1">
                {[
                  ['all', '全部配方', 663],
                  ['ready', '现在可以制作', 184],
                  ['near', '缺少一两种原料', 97],
                ].map(([value, label, count]) => (
                  <button
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition ${availability === value ? 'bg-white/8 text-[#f3ebdd]' : 'text-[#a6aaa4] hover:bg-white/[0.045] hover:text-[#e7e6dd]'}`}
                    key={value}
                    onClick={() => setAvailability(value as 'all' | 'ready' | 'near')}
                    type="button"
                  >
                    <span className="flex items-center gap-2"><span className={`h-1.5 w-1.5 rounded-full ${value === 'ready' ? 'bg-[#78b77a]' : value === 'near' ? 'bg-[#c96b5b]' : 'bg-[#c88955]'}`} />{label}</span>
                    <span className="text-xs text-[#737a78]">{count}</span>
                  </button>
                ))}
              </div>
            </section>

            <section>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8d9493]">按原料过滤</p>
                <SlidersHorizontal className="h-3.5 w-3.5 text-[#8d9493]" />
              </div>
              <div className="flex flex-wrap gap-2 lg:block lg:space-y-1.5">
                {ingredientFilters.map((item) => (
                  <button
                    className={`rounded-full px-3 py-1.5 text-xs transition lg:flex lg:w-full lg:items-center lg:justify-between lg:rounded-lg ${ingredient === item ? 'bg-[#c88955]/15 text-[#eac59d]' : 'bg-white/[0.035] text-[#a6aaa4] hover:bg-white/[0.08]'}`}
                    key={item}
                    onClick={() => setIngredient(ingredient === item ? null : item)}
                    type="button"
                  >
                    {item}
                    {ingredient === item && <X className="ml-2 inline h-3 w-3 lg:ml-0" />}
                  </button>
                ))}
              </div>
            </section>
          </div>
        </aside>

        <section className="min-w-0">
          <div className="mb-8 overflow-hidden rounded-[24px] border border-white/8 bg-[#171a1c]">
            <div className="grid min-h-[240px] grid-cols-1 md:grid-cols-[1.1fr_1fr]">
              <div className="relative min-h-[260px] overflow-hidden">
                <img alt={featured.name} className="absolute inset-0 h-full w-full object-cover opacity-75" src={featured.image} />
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#171a1c]/15 to-[#171a1c]" />
                <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#171a1c] to-transparent md:hidden" />
              </div>
              <div className="flex flex-col justify-center p-6 md:-ml-12 md:py-8 lg:p-9">
                <div className="mb-4 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#e8c197]">
                  <Sparkles className="h-3.5 w-3.5" /> 今日索引
                </div>
                <h1 className="font-serif text-4xl tracking-tight text-[#f6f0e4] lg:text-5xl">{featured.name}</h1>
                <p className="mt-2 text-sm text-[#aeb2aa]">{featured.method} · {featured.glass} · {featured.ingredients.join(' · ')}</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {featured.available ? <span className="rounded-full bg-[#78b77a]/14 px-3 py-1.5 text-xs text-[#a4dca6]">✓ 现在可以制作</span> : <span className="rounded-full bg-[#c96b5b]/12 px-3 py-1.5 text-xs text-[#e1a49c]">缺少 {featured.missing}</span>}
                  {featured.versions && <span className="rounded-full bg-[#9b87d6]/15 px-3 py-1.5 text-xs text-[#c9bff3]">{featured.versions} 个改编版本</span>}
                </div>
                <button className="mt-6 flex w-fit items-center gap-2 text-sm text-[#e8c197]" type="button">打开配方档案 <ArrowUpRight className="h-4 w-4" /></button>
              </div>
            </div>
          </div>

          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8d9493]">探索配方</p>
              <h2 className="mt-1 font-serif text-2xl tracking-tight">{ingredient ? `${ingredient} 的鸡尾酒` : '全部鸡尾酒'}</h2>
            </div>
            <button className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-[#bec0b8]" type="button">按人气排序 <ChevronDown className="h-3.5 w-3.5" /></button>
          </div>

          {filtered.length ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((cocktail) => {
                const isLiked = liked.includes(cocktail.id);
                return (
                  <article className="group overflow-hidden rounded-2xl border border-white/8 bg-[#171a1c] transition duration-300 hover:-translate-y-1 hover:border-[#c88955]/35" key={cocktail.id}>
                    <button className="relative block h-52 w-full overflow-hidden text-left" onClick={() => setFeatured(cocktail)} type="button">
                      <img alt={cocktail.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" src={cocktail.image} />
                      <span className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[#171a1c] to-transparent" />
                      <span className={`absolute bottom-3 left-3 rounded-full px-2.5 py-1 text-[11px] ${cocktail.available ? 'bg-[#78b77a]/20 text-[#b1e3b1]' : 'bg-[#d46d60]/20 text-[#f0bbb4]'}`}>{cocktail.available ? '✓ 原料齐全' : `缺少 ${cocktail.missing}`}</span>
                    </button>
                    <div className="p-4 pt-2">
                      <div className="flex items-start justify-between gap-3">
                        <button className="text-left" onClick={() => setFeatured(cocktail)} type="button">
                          <h3 className="font-serif text-xl text-[#f3ebdd]">{cocktail.name}</h3>
                          <p className="mt-1 text-xs text-[#9ca3a7]">{cocktail.method} · {cocktail.glass}</p>
                        </button>
                        <button aria-label={`收藏 ${cocktail.name}`} className={`grid h-8 w-8 place-items-center rounded-full transition ${isLiked ? 'bg-[#c88955]/15 text-[#e8c197]' : 'text-[#8d9493] hover:bg-white/7 hover:text-[#e8c197]'}`} onClick={() => toggleLike(cocktail.id)} type="button">
                          <Heart className="h-4 w-4" fill={isLiked ? 'currentColor' : 'none'} />
                        </button>
                      </div>
                      <p className="mt-3 line-clamp-1 text-xs text-[#b3b6ae]">{cocktail.ingredients.join(' · ')}</p>
                      <div className="mt-4 flex items-center justify-between border-t border-white/7 pt-3">
                        <span className="text-[11px] text-[#858b88]">♡ {cocktail.likes + (isLiked ? 1 : 0)}</span>
                        {cocktail.versions ? <span className="text-[11px] text-[#c9bff3]">{cocktail.versions} 个版本</span> : <span className="text-[11px] text-[#858b88]">查看档案</span>}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/12 py-16 text-center text-sm text-[#9ca3a7]">没有找到符合条件的配方。试试移除一个原料筛选。</div>
          )}

          <section className="mt-9 rounded-2xl border border-[#9b87d6]/20 bg-[#9b87d6]/[0.055] p-5 sm:p-6">
            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#c9bff3]">配方家族</p>
                <h2 className="mt-1 font-serif text-2xl">Negroni 的 3 种诠释</h2>
                <p className="mt-1 text-sm text-[#acabb7]">经典配方为基线；Boulevardier 与 White Negroni 均在数据中关联到 Negroni。</p>
              </div>
              <button className="w-fit rounded-lg border border-[#9b87d6]/35 px-4 py-2.5 text-sm text-[#d8d0f6]" type="button">查看版本谱系</button>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {['Negroni · 原始配方', 'Boulevardier · 改编', 'White Negroni · 改编'].map((name, index) => <div className="rounded-xl border border-white/8 bg-black/10 px-4 py-3 text-sm text-[#ded9ed]" key={name}><span className="mr-2 text-[#c9bff3]">{index === 0 ? '●' : '↳'}</span>{name}</div>)}
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
