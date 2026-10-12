declare module 'virtual:cocktail-catalog' {
  const catalog: import('./data').Cocktail[];
  export default catalog;
}

declare module 'virtual:cocktail-details' {
  const details: Record<string, { measures: string[]; instructions?: string }>;
  export default details;
}
