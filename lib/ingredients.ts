export type IngredientCategory =
  | 'spirit'
  | 'liqueur'
  | 'fortified'
  | 'bitters'
  | 'syrup'
  | 'juice'
  | 'mixer'
  | 'modifier'
  | 'fresh'
  | 'garnish'
  | 'other';

export const ingredientCategoryOrder: IngredientCategory[] = [
  'spirit',
  'liqueur',
  'fortified',
  'bitters',
  'syrup',
  'juice',
  'modifier',
  'fresh',
  'other',
];

export type CatalogIngredient = { name: string; category: IngredientCategory };

export const ingredientCatalog: CatalogIngredient[] = [
  // 基酒 Base Spirits
  { name: 'Gin', category: 'spirit' },
  { name: 'Vodka', category: 'spirit' },
  { name: 'Light Rum', category: 'spirit' },
  { name: 'Aged Rum', category: 'spirit' },
  { name: 'Cachaça', category: 'spirit' },
  { name: 'Tequila Blanco', category: 'spirit' },
  { name: 'Reposado Tequila', category: 'spirit' },
  { name: 'Mezcal', category: 'spirit' },
  { name: 'Bourbon Whiskey', category: 'spirit' },
  { name: 'Rye Whiskey', category: 'spirit' },
  { name: 'Scotch Whisky', category: 'spirit' },
  { name: 'Irish Whiskey', category: 'spirit' },
  { name: 'Cognac', category: 'spirit' },
  { name: 'Brandy', category: 'spirit' },
  { name: 'Pisco', category: 'spirit' },
  // 利口酒 Liqueurs
  { name: 'Campari', category: 'liqueur' },
  { name: 'Aperol', category: 'liqueur' },
  { name: 'Cynar', category: 'liqueur' },
  { name: 'Suze', category: 'liqueur' },
  { name: 'Triple Sec', category: 'liqueur' },
  { name: 'Maraschino', category: 'liqueur' },
  { name: 'Crème de Violette', category: 'liqueur' },
  { name: 'Amaretto', category: 'liqueur' },
  { name: 'Coffee Liqueur', category: 'liqueur' },
  { name: 'Elderflower Liqueur', category: 'liqueur' },
  { name: 'Green Chartreuse', category: 'liqueur' },
  { name: 'Yellow Chartreuse', category: 'liqueur' },
  { name: 'Fernet-Branca', category: 'liqueur' },
  // 味美思与加强酒 Vermouth & Fortified
  { name: 'Sweet Vermouth', category: 'fortified' },
  { name: 'Dry Vermouth', category: 'fortified' },
  { name: 'Lillet Blanc', category: 'fortified' },
  { name: 'Sherry', category: 'fortified' },
  { name: 'Port', category: 'fortified' },
  // 苦精 Bitters
  { name: 'Angostura bitters', category: 'bitters' },
  { name: 'Orange bitters', category: 'bitters' },
  { name: "Peychaud's Bitters", category: 'bitters' },
  // 糖浆 Syrups
  { name: 'Simple Syrup', category: 'syrup' },
  { name: 'Agave Syrup', category: 'syrup' },
  { name: 'Honey Syrup', category: 'syrup' },
  { name: 'Demerara Syrup', category: 'syrup' },
  { name: 'Maple Syrup', category: 'syrup' },
  { name: 'Orgeat', category: 'syrup' },
  // 果汁 Juices
  { name: 'Lime juice', category: 'juice' },
  { name: 'Lemon juice', category: 'juice' },
  { name: 'Orange juice', category: 'juice' },
  { name: 'Grapefruit juice', category: 'juice' },
  { name: 'Pineapple juice', category: 'juice' },
  { name: 'Cranberry juice', category: 'juice' },
  // 可选软饮 Soft drinks (not tracked in the stock cabinet)
  { name: 'Soda Water', category: 'mixer' },
  { name: 'Tonic Water', category: 'mixer' },
  { name: 'Ginger Beer', category: 'mixer' },
  // 必需的质地与乳制品成分 Required texture and dairy ingredients
  { name: 'Egg White', category: 'modifier' },
  { name: 'Cream', category: 'modifier' },
  // 装饰 Garnish
  { name: 'Orange Peel', category: 'garnish' },
  { name: 'Lemon Peel', category: 'garnish' },
  // Mint is a measured/muddled ingredient in many recipes, not only decoration.
  { name: 'Mint', category: 'fresh' },
  { name: 'Cherry', category: 'garnish' },
  { name: 'Olive', category: 'garnish' },
];

// Only clear spelling/format aliases are merged. Similar but distinct products
// (for example Scotch whisky and Irish whiskey) intentionally remain separate.
const ingredientAliases: Record<string, string> = {
  'angostura aromatic bitters': 'Angostura bitters',
  'club soda': 'Soda Water',
  'coffee liqueur': 'Coffee Liqueur',
  'fernet branca': 'Fernet-Branca',
  'ginger beer': 'Ginger Beer',
  'irish whiskey': 'Irish Whiskey',
  'maple syrup': 'Maple Syrup',
  'orgeat syrup': 'Orgeat',
  "peychauds bitters": "Peychaud's Bitters",
  'rye whiskey': 'Rye Whiskey',
  tonic: 'Tonic Water',
};

const catalogNamesByLowercase = new Map(ingredientCatalog.map(({ name }) => [name.toLowerCase(), name]));

export function canonicalIngredientName(name: string): string {
  const trimmed = name.trim().normalize('NFC');
  const alias = ingredientAliases[trimmed.toLowerCase()];
  return alias ?? catalogNamesByLowercase.get(trimmed.toLowerCase()) ?? trimmed;
}

const softDrinkNames = new Set([
  'Club soda', 'Cola', 'Ginger beer', 'Grapefruit soda', 'Lemon soda',
  'Ginger Beer', 'Orange Soda', 'Root beer', 'Soda Water', 'Strawberry soda', 'Ting',
  'Tonic', 'Tonic Water',
]);

const garnishNames = new Set([
  'Cherry', 'Cocktail cherry', 'Lemon Peel', 'Mint', 'Olive', 'Orange Peel',
]);

const freshIngredientNames = new Set([
  'Apple', 'Arugula', 'Banana', 'Basil', 'Blackberries', 'Carrot juice',
  'Celery', 'Chilli Pepper', 'Cilantro', 'Cranberries', 'Cucumber',
  'Ginger', 'Grapefruit', 'Grapes', 'Kiwi', 'Lemon', 'Lime', 'Mint',
  'Orange', 'Peach', 'Pepper', 'Pineapple', 'Rosemary', 'Sage', 'Strawberry',
]);

const categorizedRecipeIngredients: Partial<Record<IngredientCategory, Set<string>>> = {
  spirit: new Set([
    'Absinthe', 'Apple Brandy', 'Aquavit', 'Arrack', 'Barbados Rum', 'Blended Scotch Whisky',
    'Brown Rum', 'Cask-Proof Whiskey', 'Coconut Rum', 'Dark Rum', 'Demerara Rum', 'Fig-infused mezcal',
    'Grape Brandy', 'Grappa', 'Islay Scotch Whiskey', 'Jamaican Rum', 'Japanese Whiskey',
    'Navy Strength Gin', 'Old Tom Gin', 'Overproof Rum', 'Pear Brandy (Williams)', 'Plum Brandy',
    'Rhum agricole', 'Rum', 'Sage-infused vodka', 'Scotch whiskey', 'Tequila',
    'Tequila Reposado', 'Vanilla Vodka', 'Whiskey',
  ]),
  liqueur: new Set([
    'Allspice dram', 'Amaro', 'Amaro Averna', 'Amaro CioCiaro', 'Amaro Lazzaroni',
    'Amaro Meletti', 'Amaro Montenegro', 'Amaro Nonino', 'Amaro Ramazzotti', 'Amaro Sibilla',
    'Ancho Reyes', 'Apricot liqueur', 'Avéze', 'Baileys Irish Cream', 'Becherovka',
    'Bigallet China China', 'Blue Curaçao', 'Chambord', 'Chamomile Liqueur', 'Chinola (Passionfruit)',
    'Cocchi Aperitivo Americano', 'Crème de Cacao (Dark)', 'Crème de Cacao (White)',
    'Crème de banane', 'Crème de cassis', 'Crème de menthe', 'Crème de mûre', 'Drambuie',
    'Dry Curaçao', 'Falernum', 'Fernet Branca', 'Galliano', 'Gentian Liqueur', 'Génépy',
    'Grand Marnier', 'Honey liqueur', 'Italicus Rosolio di Bergamotto', 'Jägermeister',
    'Licor 43', 'Limoncello', 'Orange Curaçao', 'Pamplemousse Liqueur', 'Passoã',
    'Peach liqueur', 'Pear liqueur', 'Pelinkovac', 'Pernod', 'Pimm’s #1', 'St-Germain',
    'Cointreau', 'Strega', 'Swedish punsch', 'Underberg', 'Walnut Liqueur',
  ]),
  fortified: new Set([
    'Fino', 'Lillet Rose', 'Manzanilla sherry', 'Pedro Ximénez', 'Port', 'Punt e Mes',
    'Red wine', 'Rosé wine', 'Sherry', 'Sparkling wine', 'Sweet Vermouth', 'Tawny Port',
    'Umeshu', 'Vermouth Bianco', 'White wine',
  ]),
  bitters: new Set([
    'Amargo-Vallet', 'Angostura aromatic bitters', 'Angostura cocoa bitters', 'Bitters',
    'Bouquet bitters', 'Cardamom bitters', 'Celery bitters', 'Grapefruit bitters', 'Mole Bitters',
  ]),
  syrup: new Set([
    'Cinnamon syrup', 'Coconut Syrup', 'Donn’s Mix', 'Gardenia Mix', 'Ginger syrup',
    'Grenadine Syrup', 'Honey ginger syrup', 'Hot honey-clove syrup', 'Lavender syrup',
    'Orgeat Syrup', 'Passionfruit syrup', 'Peach syrup', 'Pineapple Syrup', 'Raspberry Syrup',
    'Rose syrup', 'Spiced brown nectar', 'Spiced wine syrup', 'Strawberry shrub syrup',
    'Vanilla syrup',
  ]),
  juice: new Set([
    'Apple Juice', 'Beet juice', 'Blood Orange Juice', 'Cherry juice', 'Clamato juice',
    'Cranberry juice', 'Lime juice', 'Orange juice', 'Pineapple juice', 'Tangerine juice',
    'Tomato juice',
  ]),
  modifier: new Set([
    'Aquafaba', 'Batter', 'Cream of Coconut', 'Egg', 'Egg White', 'Ice cream', 'Milk',
    'Saline solution', 'Water',
  ]),
  fresh: freshIngredientNames,
  mixer: softDrinkNames,
  garnish: garnishNames,
};

export function ingredientCategory(name: string): IngredientCategory {
  const canonical = canonicalIngredientName(name);
  const catalogItem = ingredientCatalog.find((item) => item.name === canonical);
  if (catalogItem) return catalogItem.category;
  for (const category of Object.keys(categorizedRecipeIngredients) as IngredientCategory[]) {
    if (categorizedRecipeIngredients[category]?.has(canonical)) return category;
  }
  if (garnishNames.has(canonical)) return 'garnish';
  return 'other';
}

export function isOptionalForMakeability(name: string): boolean {
  const canonical = canonicalIngredientName(name);
  const category = ingredientCategory(canonical);
  return category === 'mixer' || category === 'garnish';
}

export function isTrackedInStock(name: string): boolean {
  return !isOptionalForMakeability(name);
}
