import type { Cocktail } from './data';

export type CocktailDetails = Pick<Cocktail, 'measures' | 'instructions'>;

const requests = new Map<string, Promise<CocktailDetails>>();

// Shared detail loader: built-in recipes keep measures/instructions behind
// /api/cocktails/[id]; one in-flight request per id is cached for the page.
export function loadCocktailDetails(id: string): Promise<CocktailDetails> {
  const cached = requests.get(id);
  if (cached) return cached;
  const request = fetch(`/api/cocktails/${encodeURIComponent(id)}`)
    .then(async (response) => {
      if (!response.ok) throw new Error('Could not load recipe');
      return (await response.json()) as CocktailDetails;
    })
    .catch((error: unknown) => {
      requests.delete(id);
      throw error;
    });
  requests.set(id, request);
  return request;
}
