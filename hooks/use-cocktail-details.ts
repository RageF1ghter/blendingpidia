'use client';

import { useEffect, useState } from 'react';
import type { Cocktail } from '@/lib/data';

type Details = Pick<Cocktail, 'measures' | 'instructions'>;
const requests = new Map<string, Promise<Details>>();

function loadDetails(id: string) {
  const cached = requests.get(id);
  if (cached) return cached;
  const request = fetch(`/api/cocktails/${encodeURIComponent(id)}`)
    .then(async (response) => {
      if (!response.ok) throw new Error('Could not load recipe');
      return (await response.json()) as Details;
    })
    .catch((error: unknown) => {
      requests.delete(id);
      throw error;
    });
  requests.set(id, request);
  return request;
}

export function useCocktailDetails(recipe: Cocktail | null) {
  const [loaded, setLoaded] = useState<{
    id: string;
    details?: Details;
    failed?: boolean;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const needsDetails = Boolean(recipe && !recipe.isCustom && !recipe.measures);
  const id = recipe?.id;
  useEffect(() => {
    if (!id || !needsDetails) return;
    let active = true;
    loadDetails(id).then(
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
