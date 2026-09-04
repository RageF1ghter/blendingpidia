export type IngredientCategory =
  | 'spirit'
  | 'liqueur'
  | 'fortified'
  | 'bitters'
  | 'syrup'
  | 'juice'
  | 'mixer'
  | 'garnish';

export const ingredientCategoryOrder: IngredientCategory[] = [
  'spirit',
  'liqueur',
  'fortified',
  'bitters',
  'syrup',
  'juice',
  'mixer',
  'garnish',
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
  // 气泡与混合剂 Soda & Mixers
  { name: 'Soda Water', category: 'mixer' },
  { name: 'Tonic Water', category: 'mixer' },
  { name: 'Ginger Beer', category: 'mixer' },
  { name: 'Egg White', category: 'mixer' },
  { name: 'Cream', category: 'mixer' },
  // 装饰 Garnish
  { name: 'Orange Peel', category: 'garnish' },
  { name: 'Lemon Peel', category: 'garnish' },
  { name: 'Mint', category: 'garnish' },
  { name: 'Cherry', category: 'garnish' },
  { name: 'Olive', category: 'garnish' },
];
