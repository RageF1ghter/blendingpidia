// Tool JSON-schema definitions shared by the server policy (sent upstream)
// and the browser dispatcher (names + parameter validation reference).

import { methods } from '../data';
import { ingredientCategoryOrder } from '../ingredients';

export type ToolDefinition = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
  };
};

export const aiToolDefinitions: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'list_stock',
      description:
        'List the ingredients currently in the user\'s stock for this turn. Stock is presence-only (no amounts). Archived/deleted ingredients are excluded.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_recipes',
      description:
        'Search the combined recipe catalog (built-in + user custom recipes) by keyword. Returns summaries with source, missing-ingredient status and a pagination cursor. Empty query lists the collection.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Free-text keyword; fuzzy matched against names, ingredients, tags' },
          scope: { type: 'string', enum: ['all', 'custom', 'builtIn'] },
          availability: { type: 'string', enum: ['any', 'makeable', 'near'], description: 'any=all recipes; makeable=no missing tracked ingredients; near=missing 1-2' },
          cursor: { type: 'string', description: 'Pagination cursor from a previous result' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_recipe',
      description:
        'Read one recipe\'s full text fields (ingredients, measures, method, glass, instructions) with its makeable status based on the current stock. Built-in recipe details are fetched on demand; use this before quoting exact measures or steps.',
      parameters: {
        type: 'object',
        properties: { recipeId: { type: 'string' } },
        required: ['recipeId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_create_recipe',
      description:
        'Propose creating a new custom recipe. Produces a preview for the user to confirm; nothing is saved until confirmed. To adapt a built-in recipe, set parentId to that recipe and provide the full modified field set.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          ingredientRows: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Ingredient name (English preferred; registry aliases match)' },
                measure: { type: 'string', description: 'e.g. "45 ml"; omit when unknown' },
              },
              required: ['name'],
            },
          },
          method: { type: 'string', enum: methods },
          glass: { type: 'string' },
          instructions: { type: 'string', description: 'Step-by-step preparation text' },
          parentId: { type: 'string', description: 'Optional id of a base recipe this adapts' },
        },
        required: ['name', 'ingredientRows'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_update_recipe',
      description:
        'Propose edits to one custom recipe (built-in recipes cannot be edited; adapt them as new recipes instead). Only provided fields change; id, likes and image are preserved. Returns a preview; nothing is saved until confirmed.',
      parameters: {
        type: 'object',
        properties: {
          recipeId: { type: 'string' },
          name: { type: 'string' },
          ingredientRows: {
            type: 'array',
            items: {
              type: 'object',
              properties: { name: { type: 'string' }, measure: { type: 'string' } },
              required: ['name'],
            },
          },
          method: { type: 'string', enum: methods },
          glass: { type: 'string' },
          instructions: { type: 'string' },
          parentId: { type: 'string', description: 'Recipe id, or null to clear the relation' },
        },
        required: ['recipeId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_set_stock',
      description:
        'Propose setting one ingredient\'s stock presence to an absolute value (present true/false, never a toggle). Only valid for tracked, non-archived, non-deleted ingredients.',
      parameters: {
        type: 'object',
        properties: {
          ingredient: { type: 'string', description: 'Ingredient id or name' },
          present: { type: 'boolean' },
        },
        required: ['ingredient', 'present'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_create_ingredient',
      description:
        'Propose adding a new ingredient to the catalog with English + Chinese names and a category. It is NOT added to stock automatically; issue a separate propose_set_stock afterwards if the user has it.',
      parameters: {
        type: 'object',
        properties: {
          nameEn: { type: 'string' },
          nameZh: { type: 'string' },
          category: { type: 'string', enum: ingredientCategoryOrder },
        },
        required: ['nameEn', 'nameZh', 'category'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_archive_ingredient',
      description:
        'Propose archiving one ingredient. Archiving removes it from current stock; recipes referencing it keep it and become missing it. Deletion is not available.',
      parameters: {
        type: 'object',
        properties: { ingredient: { type: 'string', description: 'Ingredient id or name' } },
        required: ['ingredient'],
      },
    },
  },
];
