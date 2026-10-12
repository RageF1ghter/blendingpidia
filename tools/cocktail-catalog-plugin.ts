import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, join, relative, resolve, sep } from 'node:path';
import type { Plugin } from 'vite';

type ResourceRecipe = {
  _id: string;
  name: string;
  method: string | null;
  glass: string | null;
  tags: string[] | null;
  parent_cocktail_id: string | null;
  instructions: string | null;
  images: { uri: string; sort: number }[];
  ingredients: {
    name: string;
    amount: number | null;
    units: string | null;
    note: string | null;
  }[];
};

const catalogId = 'virtual:cocktail-catalog';
const detailsId = 'virtual:cocktail-details';

// Read the local dataset once on the server. Browser imports receive one compact
// catalog instead of a separate transformed module for every JSON and image URL.
export function cocktailCatalogPlugin(): Plugin {
  let root = '';
  let build = false;
  let recipes:
    | { recipe: ResourceRecipe; path: string; image?: string }[]
    | undefined;
  function readRecipes() {
    if (recipes) return recipes;
    const directory = join(root, 'resource/data/cocktails');
    recipes = existsSync(directory)
      ? readdirSync(directory, { withFileTypes: true })
          .filter(
            (entry) =>
              entry.isDirectory() &&
              existsSync(join(directory, entry.name, 'data.json')),
          )
          .map((entry) => {
            const path = join(directory, entry.name, 'data.json');
            const recipe = JSON.parse(
              readFileSync(path, 'utf8'),
            ) as ResourceRecipe;
            const image = [...recipe.images]
              .sort((a, b) => a.sort - b.sort)
              .map(({ uri }) =>
                join(
                  directory,
                  entry.name,
                  basename(uri.replace('file:///', '')),
                ),
              )
              .find((candidate) => existsSync(candidate));
            return { recipe, path, image };
          })
      : [];
    return recipes;
  }
  function detail(recipe: ResourceRecipe) {
    return {
      measures: recipe.ingredients.map(({ amount, units, note }) => {
        if (amount !== null && units)
          return units === 'ml' ? `${amount}${units}` : `${amount} ${units}`;
        return amount !== null ? String(amount) : (note ?? '');
      }),
      instructions: recipe.instructions ?? undefined,
    };
  }
  return {
    name: 'cocktail-catalog',
    configResolved(config) {
      root = config.root;
      build = config.command === 'build';
    },
    resolveId(id) {
      if (id === catalogId || id === detailsId) return `\0${id}`;
    },
    load(id) {
      if (id !== `\0${catalogId}` && id !== `\0${detailsId}`) return;
      const rows = readRecipes();
      for (const row of rows) this.addWatchFile(row.path);
      if (id === `\0${detailsId}`) {
        return `export default ${JSON.stringify(Object.fromEntries(rows.map(({ recipe }) => [recipe._id, detail(recipe)])))};`;
      }
      const entries = rows.map(({ recipe, image }) => {
        const summary = {
          id: recipe._id,
          name: recipe.name,
          method: recipe.method ?? 'Build',
          glass: recipe.glass ?? 'Cocktail',
          ingredients: recipe.ingredients.map(({ name }) => name),
          tags: recipe.tags ?? [],
          likes: 0,
          parentId: recipe.parent_cocktail_id,
          // The initial featured recipe is complete without an extra request.
          ...(recipe._id === 'negroni' ? detail(recipe) : {}),
        };
        let imageExpression = 'undefined';
        if (image) {
          this.addWatchFile(image);
          if (build) {
            const source = readFileSync(image);
            const hash = createHash('sha256')
              .update(source)
              .digest('hex')
              .slice(0, 16);
            const fileName = `assets/cocktails/${hash}-${basename(image)}`;
            this.emitFile({
              type: 'asset',
              fileName,
              source,
            });
            // Browser and Worker SSR use the same content-hashed public URL.
            // Worker modules cannot resolve assets relative to import.meta.url.
            imageExpression = JSON.stringify(
              '/' + fileName.split('/').map(encodeURIComponent).join('/'),
            );
          } else {
            imageExpression = JSON.stringify(
              '/' +
                relative(root, image)
                  .split('\\')
                  .map(encodeURIComponent)
                  .join('/'),
            );
          }
        }
        return `{...${JSON.stringify(summary)},image:${imageExpression}}`;
      });
      return `export default [${entries.join(',')}];`;
    },
    configureServer(server) {
      const directory = resolve(server.config.root, 'resource/data/cocktails');
      server.watcher.add(directory);
      server.watcher.on('all', (_event, path) => {
        if (!resolve(path).startsWith(directory + sep)) return;
        recipes = undefined;
        for (const environment of Object.values(server.environments))
          environment.moduleGraph.invalidateAll();
        server.ws.send({ type: 'full-reload' });
      });
    },
  };
}
