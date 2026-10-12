import details from 'virtual:cocktail-details';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const recipe = Object.hasOwn(details, id) ? details[id] : undefined;
  if (!recipe)
    return Response.json({ error: 'Recipe not found' }, { status: 404 });
  return Response.json(recipe, {
    headers: { 'Cache-Control': 'public, max-age=300' },
  });
}
