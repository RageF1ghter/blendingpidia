'use client';

/* oxlint-disable nextjs/no-img-element -- Direct asset URLs use native lazy loading, decoding and explicit dimensions. */

import { memo } from 'react';
import { Heart } from 'lucide-react';
import type { Cocktail } from '@/lib/data';
import type { CocktailAvailability } from '@/lib/cocktail-index';
import {
  displayIngredientName,
  type ManagedIngredient,
} from '@/lib/ingredient-registry';
import {
  glassNames,
  ingredientNames,
  methodNames,
  term,
  ui,
  type Lang,
  type TermMap,
} from '@/lib/i18n';

type Props = {
  cocktails: Cocktail[];
  availability: Map<string, CocktailAvailability>;
  variants: Map<string, Cocktail[]>;
  ingredientRegistry: ManagedIngredient[];
  lang: Lang;
  liked: Set<string>;
  openDetail: (id: string) => void;
  toggleLike: (id: string) => void;
};

export const CocktailCards = memo(function CocktailCards({
  cocktails,
  availability,
  variants,
  ingredientRegistry,
  lang,
  liked,
  openDetail,
  toggleLike,
}: Props) {
  const t = ui[lang];
  const tr = (map: TermMap, value: string) =>
    map === ingredientNames
      ? displayIngredientName(value, ingredientRegistry, lang)
      : term(map, value, lang);
  return (
    <>
      {cocktails.map((cocktail) => {
        const { missing: missingItems, broken: recipeBroken } =
          availability.get(cocktail.id)!;
        const isLiked = liked.has(cocktail.id);
        const versionCount =
          variants.get(cocktail.parentId ?? cocktail.id)?.length ?? 0;
        return (
          <article
            className="group overflow-hidden rounded-2xl border border-white/8 bg-[#171a1c] transition duration-300 hover:-translate-y-1 hover:border-[#c88955]/35"
            key={cocktail.id}
          >
            <button
              className="relative block h-52 w-full overflow-hidden text-left"
              onClick={() => openDetail(cocktail.id)}
              type="button"
            >
              {cocktail.image ? (
                <img
                  loading="lazy"
                  decoding="async"
                  width={480}
                  height={320}
                  alt={cocktail.name}
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                  src={cocktail.image}
                />
              ) : (
                <div className="h-full bg-[radial-gradient(circle_at_30%_30%,#c8895566,transparent_35%),linear-gradient(140deg,#2a3435,#171a1c)]" />
              )}
              <span className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[#171a1c] to-transparent" />
              <span
                className={`absolute bottom-3 left-3 rounded-full px-2.5 py-1 text-[11px] ${missingItems.length === 0 ? 'bg-[#78b77a]/20 text-[#b1e3b1]' : 'bg-[#d46d60]/20 text-[#f0bbb4]'}`}
              >
                {recipeBroken
                  ? t.explore.cardBroken
                  : missingItems.length === 0
                    ? t.explore.cardReady
                    : t.explore.cardMissing.replace(
                        '{count}',
                        String(missingItems.length),
                      )}
              </span>
            </button>
            <div className="p-4 pt-2">
              <div className="flex items-start justify-between gap-3">
                <button
                  className="text-left"
                  onClick={() => openDetail(cocktail.id)}
                  type="button"
                >
                  <h3 className="font-serif text-xl text-[#f3ebdd]">
                    {cocktail.name}
                  </h3>
                  <p className="mt-1 text-xs text-[#9ca3a7]">
                    {tr(methodNames, cocktail.method)} ·{' '}
                    {tr(glassNames, cocktail.glass)}
                  </p>
                </button>
                <button
                  aria-label={t.explore.cardFavoriteAria.replace(
                    '{name}',
                    cocktail.name,
                  )}
                  className={`grid h-8 w-8 place-items-center rounded-full ${isLiked ? 'bg-[#c88955]/15 text-[#e8c197]' : 'text-[#8d9493] hover:bg-white/7'}`}
                  onClick={() => toggleLike(cocktail.id)}
                  type="button"
                >
                  <Heart
                    className="h-4 w-4"
                    fill={isLiked ? 'currentColor' : 'none'}
                  />
                </button>
              </div>
              <p className="mt-3 line-clamp-1 text-xs text-[#b3b6ae]">
                {cocktail.ingredients
                  .map((item) => tr(ingredientNames, item))
                  .join(' · ')}
              </p>
              <div className="mt-4 flex items-center justify-between border-t border-white/7 pt-3">
                <span className="text-[11px] text-[#858b88]">
                  ♡ {cocktail.likes + Number(isLiked)}
                </span>
                {versionCount > 0 ? (
                  <button
                    className="text-[11px] text-[#c9bff3]"
                    onClick={() => openDetail(cocktail.id)}
                    type="button"
                  >
                    {t.explore.cardVersions.replace(
                      '{count}',
                      String(versionCount),
                    )}
                  </button>
                ) : (
                  <span className="text-[11px] text-[#858b88]">
                    {cocktail.isCustom
                      ? t.explore.cardMyRecipe
                      : t.explore.cardView}
                  </span>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </>
  );
});
