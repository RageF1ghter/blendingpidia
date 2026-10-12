import { canonicalIngredientName } from './ingredients';
import catalog from 'virtual:cocktail-catalog';

export type Method = 'Shake' | 'Stir' | 'Build' | 'Blend' | 'Muddle' | 'Layer';

export type Cocktail = {
  id: string;
  name: string;
  image?: string;
  method: Method;
  glass: string;
  ingredients: string[];
  measures?: string[];
  tags: string[];
  likes: number;
  instructions?: string;
  parentId?: string | null;
  isCustom?: boolean;
};

const fallbackCocktails: Cocktail[] = [
  {
    id: 'negroni',
    name: 'Negroni',
    image: '/cocktails/negroni.webp',
    method: 'Build',
    glass: 'Lowball',
    ingredients: ['Gin', 'Campari', 'Sweet Vermouth'],
    measures: ['30ml', '30ml', '30ml'],
    tags: ['IBA Cocktail', 'Bitter'],
    likes: 328,
  },
  {
    id: 'boulevardier',
    name: 'Boulevardier',
    image: '/cocktails/boulevardier.webp',
    method: 'Stir',
    glass: 'Cocktail',
    ingredients: ['Bourbon Whiskey', 'Campari', 'Sweet Vermouth'],
    measures: ['45ml', '30ml', '30ml'],
    tags: ['Negroni', 'Bitter'],
    likes: 188,
    parentId: 'negroni',
  },
  {
    id: 'white-negroni',
    name: 'White Negroni',
    image: '/cocktails/white-negroni.webp',
    method: 'Stir',
    glass: 'Lowball',
    ingredients: ['Gin', 'Suze', 'Lillet Blanc'],
    measures: ['45ml', '30ml', '22ml'],
    tags: ['Negroni', 'Herbaceous'],
    likes: 156,
    parentId: 'negroni',
  },
  {
    id: 'margarita',
    name: 'Margarita',
    image: '/cocktails/margarita.webp',
    method: 'Shake',
    glass: 'Margarita',
    ingredients: ['Tequila Blanco', 'Triple Sec', 'Lime juice', 'Agave Syrup'],
    measures: ['50ml', '25ml', '25ml', '5ml'],
    tags: ['IBA Cocktail', 'Contemporary Classic'],
    likes: 246,
  },
  {
    id: 'martini',
    name: 'Martini',
    image: '/cocktails/martini.webp',
    method: 'Stir',
    glass: 'Cocktail',
    ingredients: ['Gin', 'Dry Vermouth', 'Orange bitters'],
    measures: ['60ml', '10ml', '1 dash'],
    tags: ['IBA Cocktail', 'Dry'],
    likes: 212,
  },
  {
    id: 'daiquiri',
    name: 'Daiquiri',
    image: '/cocktails/daiquiri.webp',
    method: 'Shake',
    glass: 'Coupe',
    ingredients: ['Light Rum', 'Lime juice', 'Simple Syrup'],
    measures: ['60ml', '30ml', '20ml'],
    tags: ['IBA Cocktail', 'Classic'],
    likes: 197,
  },
  {
    id: 'aviation',
    name: 'Aviation',
    image: '/cocktails/aviation.webp',
    method: 'Shake',
    glass: 'Cocktail',
    ingredients: ['Gin', 'Lemon juice', 'Maraschino', 'Crème de Violette'],
    measures: ['45ml', '20ml', '10ml', '5ml'],
    tags: ['IBA Cocktail', 'Herbaceous'],
    likes: 164,
  },
  {
    id: 'old-fashioned',
    name: 'Old Fashioned',
    image: '/cocktails/old-fashioned.webp',
    method: 'Build',
    glass: 'Lowball',
    ingredients: [
      'Bourbon Whiskey',
      'Simple Syrup',
      'Angostura bitters',
      'Orange bitters',
    ],
    measures: ['60ml', '10ml', '2 dashes', '1 dash'],
    tags: ['IBA Cocktail', 'Old Fashioned'],
    likes: 301,
  },
];

const resourceCocktails = catalog
  .map((recipe) => ({
    ...recipe,
    ingredients: recipe.ingredients.map(canonicalIngredientName),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

export const baseCocktails: Cocktail[] = resourceCocktails.length
  ? resourceCocktails
  : fallbackCocktails;

export const initialStock = [
  'Gin',
  'Campari',
  'Sweet Vermouth',
  'Dry Vermouth',
  'Orange bitters',
  'Light Rum',
  'Lime juice',
  'Simple Syrup',
  'Bourbon Whiskey',
  'Angostura bitters',
  'Tequila Blanco',
  'Triple Sec',
];

export const methods: Method[] = [
  'Shake',
  'Stir',
  'Build',
  'Blend',
  'Muddle',
  'Layer',
];

export const storageKey = 'blendingpidia-v1';

export function fuzzyMatch(query: string, value: string) {
  const needle = query.toLowerCase().replace(/\s/g, '');
  const haystack = value.toLowerCase().replace(/\s/g, '');
  let index = 0;
  for (const char of haystack) if (char === needle[index]) index += 1;
  return index === needle.length;
}

export function slugify(value: string) {
  return `${value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')}-${Date.now()}`;
}
