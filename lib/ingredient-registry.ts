import { ingredientNames } from './i18n';
import {
  canonicalIngredientName,
  ingredientCatalog,
  ingredientCategory,
  ingredientCategoryOrder,
  type IngredientCategory,
} from './ingredients';

export type ManagedIngredient = {
  id: string;
  nameEn: string;
  nameZh: string;
  category: IngredientCategory;
  aliases: string[];
  archived: boolean;
  deleted: boolean;
  custom: boolean;
};

const trackedCategories = new Set<IngredientCategory>(ingredientCategoryOrder);

function normalizeName(value: string) {
  return value.trim().normalize('NFC').replace(/\s+/g, ' ').toLocaleLowerCase();
}

type IndexedIngredient = { record: ManagedIngredient; order: number };
type IngredientIndex = {
  byId: Map<string, ManagedIngredient>;
  byName: Map<string, IndexedIngredient[]>;
  byCanonical: Map<string, IndexedIngredient[]>;
  matches: Map<string, ManagedIngredient[]>;
};

// Registries are immutable snapshots. Editing an ingredient creates a new array
// and therefore a new index, including changed aliases and deleted records.
const ingredientIndexes = new WeakMap<ManagedIngredient[], IngredientIndex>();

function indexFor(records: ManagedIngredient[]) {
  const cached = ingredientIndexes.get(records);
  if (cached) return cached;
  const index: IngredientIndex = {
    byId: new Map(),
    byName: new Map(),
    byCanonical: new Map(),
    matches: new Map(),
  };
  const add = (
    map: Map<string, IndexedIngredient[]>,
    name: string,
    entry: IndexedIngredient,
  ) => {
    const key = normalizeName(name);
    const bucket = map.get(key) ?? [];
    bucket.push(entry);
    map.set(key, bucket);
  };
  records.forEach((record, order) => {
    const entry = { record, order };
    if (!index.byId.has(record.id)) index.byId.set(record.id, record);
    add(index.byName, record.nameEn, entry);
    add(index.byName, record.nameZh, entry);
    add(index.byCanonical, record.nameEn, entry);
    for (const alias of record.aliases) {
      add(index.byName, alias, entry);
      add(index.byCanonical, alias, entry);
    }
  });
  ingredientIndexes.set(records, index);
  return index;
}

function indexedMatches(name: string, records: ManagedIngredient[]) {
  const index = indexFor(records);
  const cached = index.matches.get(name);
  if (cached) return cached;
  const raw = normalizeName(name);
  const canonical = normalizeName(canonicalIngredientName(name));
  const entries = [
    ...(index.byName.get(raw) ?? []),
    ...(index.byCanonical.get(canonical) ?? []),
  ];
  entries.sort((a, b) => a.order - b.order);
  const matches = [
    ...new Map(entries.map(({ record }) => [record.id, record])).values(),
  ];
  index.matches.set(name, matches);
  return matches;
}

export function findManagedIngredientById(
  id: string,
  records: ManagedIngredient[],
) {
  return indexFor(records).byId.get(id);
}

export function builtInIngredientId(name: string) {
  return `builtin:${encodeURIComponent(canonicalIngredientName(name).toLocaleLowerCase())}`;
}

function parseStoredIngredient(value: unknown): ManagedIngredient | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<ManagedIngredient>;
  if (
    typeof record.id !== 'string' ||
    typeof record.nameEn !== 'string' ||
    typeof record.nameZh !== 'string' ||
    !isIngredientCategory(record.category) ||
    !Array.isArray(record.aliases)
  )
    return null;
  return {
    id: record.id,
    nameEn: record.nameEn.trim(),
    nameZh: record.nameZh.trim(),
    category: record.category as IngredientCategory,
    aliases: record.aliases.filter(
      (alias): alias is string => typeof alias === 'string',
    ),
    archived: Boolean(record.archived),
    deleted: Boolean(record.deleted),
    custom: Boolean(record.custom),
  };
}

export function isIngredientCategory(
  value: unknown,
): value is IngredientCategory {
  return (
    typeof value === 'string' &&
    trackedCategories.has(value as IngredientCategory)
  );
}

export function buildIngredientRegistry(
  recipeNames: string[],
  saved: unknown[] = [],
): ManagedIngredient[] {
  const records = new Map<string, ManagedIngredient>();
  const storedRecords = saved
    .map(parseStoredIngredient)
    .filter((item): item is ManagedIngredient => item !== null);
  const sourceNames = [
    ...ingredientCatalog.map(({ name }) => name),
    ...recipeNames,
  ];

  for (const sourceName of sourceNames) {
    const customMatches = findManagedIngredients(
      sourceName,
      storedRecords,
    ).filter((item) => item.custom);
    if (customMatches.length === 1) continue;

    const nameEn = canonicalIngredientName(sourceName);
    if (!nameEn) continue;
    const id = builtInIngredientId(nameEn);
    const current = records.get(id);
    if (current) {
      if (sourceName !== nameEn && !current.aliases.includes(sourceName))
        current.aliases.push(sourceName);
      continue;
    }
    records.set(id, {
      id,
      nameEn,
      nameZh: ingredientNames[nameEn]?.zh ?? nameEn,
      category: ingredientCategory(nameEn),
      aliases: sourceName === nameEn ? [] : [sourceName],
      archived: false,
      deleted: false,
      custom: false,
    });
  }

  for (const stored of storedRecords) {
    if (!stored.nameEn || !stored.nameZh) continue;
    const previous = records.get(stored.id);
    records.set(stored.id, {
      ...(previous ?? stored),
      ...stored,
      aliases: [...new Set([...(previous?.aliases ?? []), ...stored.aliases])],
    });
  }

  return [...records.values()].sort((a, b) => a.nameEn.localeCompare(b.nameEn));
}

export function findManagedIngredients(
  name: string,
  records: ManagedIngredient[],
) {
  return [...indexedMatches(name, records)];
}

export function findManagedIngredient(
  name: string,
  records: ManagedIngredient[],
) {
  return indexedMatches(name, records)[0];
}

export function ingredientIdForName(
  name: string,
  records: ManagedIngredient[],
) {
  return findManagedIngredient(name, records)?.id ?? builtInIngredientId(name);
}

export function displayIngredientName(
  name: string,
  records: ManagedIngredient[],
  lang: 'zh' | 'en',
) {
  const record =
    findManagedIngredientById(name, records) ??
    findManagedIngredient(name, records);
  if (record) return lang === 'zh' ? record.nameZh : record.nameEn;
  const canonical = canonicalIngredientName(name);
  return lang === 'zh'
    ? (ingredientNames[canonical]?.zh ?? canonical)
    : canonical;
}

export function categoryForIngredient(
  name: string,
  records: ManagedIngredient[],
) {
  return (
    findManagedIngredient(name, records)?.category ?? ingredientCategory(name)
  );
}

export function isOptionalIngredient(
  name: string,
  records: ManagedIngredient[],
) {
  const record = findManagedIngredient(name, records);
  if (record?.deleted) return false;
  const category = record?.category ?? ingredientCategory(name);
  return category === 'mixer' || category === 'garnish';
}

export function isTrackedIngredient(
  name: string,
  records: ManagedIngredient[],
) {
  return !isOptionalIngredient(name, records);
}

export function createCustomIngredientId() {
  const randomPart =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `custom:${randomPart}`;
}

export function normalizeIngredientName(name: string) {
  return normalizeName(canonicalIngredientName(name));
}
