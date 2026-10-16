'use client';

import { useEffect, useState } from 'react';
import type { Cocktail } from '@/lib/data';
import { loadCocktailDetails, type CocktailDetails } from '@/lib/cocktail-details';

export function useCocktailDetails(recipe: Cocktail | null) {
  const [loaded, setLoaded] = useState<{
    id: string;
    details?: CocktailDetails;
    failed?: boolean;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const needsDetails = Boolean(recipe && !recipe.isCustom && !recipe.measures);
  const id = recipe?.id;
  useEffect(() => {
    if (!id || !needsDetails) return;
    let active = true;
    loadCocktailDetails(id).then(
      (details) => {
        if (active) setLoaded({ id, details });
      },
      () => {
        if (active) setLoaded({ id, failed: true });
      },
    );
    return () => {
      active = false;
    };
  }, [id, needsDetails, attempt]);
  const current = loaded?.id === id ? loaded : null;
  return {
    recipe:
      recipe && current?.details ? { ...recipe, ...current.details } : recipe,
    loading: needsDetails && !current,
    failed: Boolean(current?.failed),
    retry: () => {
      setLoaded(null);
      setAttempt((value) => value + 1);
    },
  };
}
