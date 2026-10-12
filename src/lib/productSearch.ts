// Shared product search matching, used by the live search suggestions and
// the Products page so both show the same results for the same text.

const normalize = (text: string) => text.trim().toLowerCase().replace(/\s+/g, " ");

const searchWords = (query: string) => normalize(query).split(" ").filter(Boolean);

/**
 * True when every word of the query appears in the product name or its
 * category name, in any order — so "basmati rice" also finds "Rice Basmati".
 */
export function matchesProductSearch(query: string, name: string, categoryName?: string | null): boolean {
  const words = searchWords(query);
  if (words.length === 0) return true;
  const haystack = `${normalize(name)} ${normalize(categoryName ?? "")}`;
  return words.every((word) => haystack.includes(word));
}

/**
 * Lower is better: names starting with the query first, then names containing
 * the whole query, then names matching only word by word or by category.
 */
export function productSearchRank(query: string, name: string): number {
  const q = normalize(query);
  const n = normalize(name);
  if (n.startsWith(q)) return 0;
  if (n.split(" ").some((word) => word.startsWith(q))) return 1;
  if (n.includes(q)) return 2;
  return 3;
}
