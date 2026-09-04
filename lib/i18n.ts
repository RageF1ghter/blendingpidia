export type Lang = 'zh' | 'en';

export const langStorageKey = 'blendingpidia-lang-v1';

const zh = {
  brand: {
    subtitle: '鸡尾酒百科',
  },
  header: {
    searchAria: '搜索鸡尾酒或原料',
    searchPlaceholder: '搜索名称、原料、风味，支持模糊匹配…',
    clearSearch: '清除搜索',
    random: '随机',
    showFavorites: '只显示收藏',
    add: '新增',
  },
  aside: {
    stockTitle: '我的酒柜',
    stockCountLabel: '已入库原料',
    manage: '管理酒柜',
    availabilityTitle: '制作条件',
    availabilityAll: '全部',
    availabilityMakeable: '现在可以制作',
    availabilityNear: '缺少 1–2 种',
    ingredientsTitle: '按原料过滤',
    clearFilters: '清除筛选',
  },
  featured: {
    label: '配方档案',
    makeable: '✓ 现在可以制作',
    missing: '缺少 {list}',
    variants: '{count} 个改编版本',
    myRecipe: '我的配方',
  },
  explore: {
    label: '探索',
    favorites: '我的收藏',
    withIngredients: '{list} 的配方',
    all: '全部鸡尾酒',
    sort: '排序',
    sortPopular: '人气',
    sortName: '名称',
    sortNewest: '我的新增',
    cardReady: '✓ 原料齐全',
    cardMissing: '缺少 {count} 种',
    cardFavoriteAria: '收藏 {name}',
    cardVersions: '{count} 个版本',
    cardMyRecipe: '我的配方',
    cardView: '查看档案',
    empty: '没有找到符合条件的配方。试试移除一个筛选条件。',
  },
  family: {
    label: '配方家族',
    title: '{name} 的版本谱系',
    description: '同一配方可保留独立用量与手法；从原始配方或任意版本继续改编。',
  },
  stockDialog: {
    title: '我的酒柜',
    description: '选择当前拥有的原料；“可以制作”会立即按此更新。',
  },
  formDialog: {
    title: '新增个人配方',
    description: '可以作为原创配方保存，或选择已有配方作为改编来源。',
    name: '名称',
    relation: '配方关系',
    original: '原创',
    basedOn: '改编自 {name}',
    method: '调制手法',
    glass: '杯型',
    ingredients: '原料',
    image: '图片 URL（可选）',
    instructions: '调制步骤',
    instructionsPlaceholder: '描述摇和、搅拌、滤冰和装饰步骤。',
    cancel: '取消',
    save: '保存配方',
  },
  notice: {
    readError: '本地数据无法读取，已使用默认酒柜。',
    tryTonight: '今晚试试 {name}。',
    formRequired: '请填写配方名称和至少一种原料。',
    addedVariant: '{name} 已作为改编版本保存。',
    added: '{name} 已加入我的配方。',
  },
};

const en: typeof zh = {
  brand: {
    subtitle: 'COCKTAIL ENCYCLOPEDIA',
  },
  header: {
    searchAria: 'Search cocktails or ingredients',
    searchPlaceholder: 'Search by name, ingredient, flavor — fuzzy matching…',
    clearSearch: 'Clear search',
    random: 'Random',
    showFavorites: 'Show favorites only',
    add: 'Add',
  },
  aside: {
    stockTitle: 'My Stock',
    stockCountLabel: 'ingredients in stock',
    manage: 'Manage',
    availabilityTitle: 'Availability',
    availabilityAll: 'All',
    availabilityMakeable: 'Makeable now',
    availabilityNear: 'Missing 1–2',
    ingredientsTitle: 'Filter by ingredient',
    clearFilters: 'Clear filters',
  },
  featured: {
    label: 'Recipe file',
    makeable: '✓ Makeable now',
    missing: 'Missing {list}',
    variants: '{count} variations',
    myRecipe: 'My recipe',
  },
  explore: {
    label: 'Explore',
    favorites: 'My favorites',
    withIngredients: 'Recipes with {list}',
    all: 'All cocktails',
    sort: 'Sort',
    sortPopular: 'Popular',
    sortName: 'Name',
    sortNewest: 'My additions',
    cardReady: '✓ All ingredients',
    cardMissing: 'Missing {count}',
    cardFavoriteAria: 'Favorite {name}',
    cardVersions: '{count} versions',
    cardMyRecipe: 'My recipe',
    cardView: 'View file',
    empty: 'No recipes match your filters. Try removing a filter.',
  },
  family: {
    label: 'Version family',
    title: 'The {name} family',
    description: 'Keep independent measures and technique per recipe; branch from the original or any version.',
  },
  stockDialog: {
    title: 'My Stock',
    description: 'Select the ingredients you have; “makeable” updates instantly.',
  },
  formDialog: {
    title: 'Add recipe',
    description: 'Save as an original recipe, or base it on an existing one.',
    name: 'Name',
    relation: 'Version',
    original: 'Original',
    basedOn: 'Based on {name}',
    method: 'Method',
    glass: 'Glass',
    ingredients: 'Ingredients',
    image: 'Image URL (optional)',
    instructions: 'Instructions',
    instructionsPlaceholder: 'Describe shake, stir, strain, and garnish steps.',
    cancel: 'Cancel',
    save: 'Save',
  },
  notice: {
    readError: 'Local data could not be read; using the default stock.',
    tryTonight: 'Try {name} tonight.',
    formRequired: 'Please enter a recipe name and at least one ingredient.',
    addedVariant: '{name} saved as a variation.',
    added: '{name} added to my recipes.',
  },
};

export const ui: Record<Lang, typeof zh> = { zh, en };

export type TermMap = Record<string, { zh: string; en: string }>;

export const methodNames: TermMap = {
  Shake: { zh: '摇和', en: 'Shake' },
  Stir: { zh: '搅拌', en: 'Stir' },
  Build: { zh: '直调', en: 'Build' },
  Blend: { zh: '搅打', en: 'Blend' },
  Muddle: { zh: '捣压', en: 'Muddle' },
  Layer: { zh: '分层', en: 'Layer' },
};

export const glassNames: TermMap = {
  Lowball: { zh: '古典杯', en: 'Lowball' },
  Cocktail: { zh: '鸡尾酒杯', en: 'Cocktail' },
  Margarita: { zh: '玛格丽特杯', en: 'Margarita' },
  Coupe: { zh: '碟形杯', en: 'Coupe' },
};

export const ingredientNames: TermMap = {
  Gin: { zh: '金酒', en: 'Gin' },
  Campari: { zh: '金巴利', en: 'Campari' },
  'Sweet Vermouth': { zh: '甜味美思', en: 'Sweet Vermouth' },
  'Dry Vermouth': { zh: '干味美思', en: 'Dry Vermouth' },
  'Bourbon Whiskey': { zh: '波本威士忌', en: 'Bourbon Whiskey' },
  Suze: { zh: '苏兹', en: 'Suze' },
  'Lillet Blanc': { zh: '利莱白', en: 'Lillet Blanc' },
  'Tequila Blanco': { zh: '白龙舌兰', en: 'Tequila Blanco' },
  'Triple Sec': { zh: '橙皮利口酒', en: 'Triple Sec' },
  'Lime juice': { zh: '青柠汁', en: 'Lime juice' },
  'Agave Syrup': { zh: '龙舌兰糖浆', en: 'Agave Syrup' },
  'Orange bitters': { zh: '橙味苦精', en: 'Orange bitters' },
  'Light Rum': { zh: '白朗姆酒', en: 'Light Rum' },
  'Simple Syrup': { zh: '糖浆', en: 'Simple Syrup' },
  'Lemon juice': { zh: '柠檬汁', en: 'Lemon juice' },
  Maraschino: { zh: '黑樱桃利口酒', en: 'Maraschino' },
  'Crème de Violette': { zh: '紫罗兰利口酒', en: 'Crème de Violette' },
  'Angostura bitters': { zh: '安哥斯图娜苦精', en: 'Angostura bitters' },
};

export const tagNames: TermMap = {
  'IBA Cocktail': { zh: 'IBA 官方配方', en: 'IBA Cocktail' },
  Bitter: { zh: '苦味', en: 'Bitter' },
  Negroni: { zh: '内格罗尼', en: 'Negroni' },
  Herbaceous: { zh: '草本', en: 'Herbaceous' },
  'Contemporary Classic': { zh: '当代经典', en: 'Contemporary Classic' },
  Dry: { zh: '干型', en: 'Dry' },
  Classic: { zh: '经典', en: 'Classic' },
  'Old Fashioned': { zh: '古典派', en: 'Old Fashioned' },
  'My recipe': { zh: '我的配方', en: 'My recipe' },
};

export const instructions: TermMap = {
  negroni: { zh: '将所有材料注入装有冰块的古典杯，轻轻搅拌。', en: 'Build all ingredients in a rocks glass over ice and stir gently.' },
  boulevardier: { zh: '加冰搅拌后滤入冰镇鸡尾酒杯。', en: 'Stir with ice, then strain into a chilled cocktail glass.' },
  'white-negroni': { zh: '加冰搅拌，滤入装有大冰块的古典杯。', en: 'Stir with ice and strain into a rocks glass over a large cube.' },
  margarita: { zh: '所有材料加冰摇和，滤入冰镇玛格丽特杯。', en: 'Shake all ingredients with ice and strain into a chilled margarita glass.' },
  martini: { zh: '加冰搅拌，滤入冰镇鸡尾酒杯。', en: 'Stir with ice and strain into a chilled cocktail glass.' },
  daiquiri: { zh: '所有材料加冰摇和，细滤入冰镇碟形杯。', en: 'Shake all ingredients with ice and fine-strain into a chilled coupe.' },
  aviation: { zh: '所有材料加冰摇和，滤入鸡尾酒杯。', en: 'Shake all ingredients with ice and strain into a cocktail glass.' },
  'old-fashioned': { zh: '在古典杯中加冰搅拌，表达橙皮精油。', en: 'Build in a rocks glass over ice, stir, and express orange peel oils.' },
};

export function term(map: TermMap, value: string, lang: Lang): string {
  return map[value]?.[lang] ?? value;
}
