// Shared product search matching, used by the live search suggestions and
// the Products page so both show the same results for the same text.

const normalize = (text: string) => text.trim().toLowerCase().replace(/\s+/g, " ");

// Words of a name or query: letters/digits only, so "Toor Dal (1kg)" gives
// ["toor", "dal", "1kg"].
const toWords = (text: string) => normalize(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/**
 * True when every word typed is the start of a word in the product name, in
 * any order — "rice" finds "Basmati Rice" but not "Price" or other products in
 * a rice category; "ric" still matches while the word is being typed.
 */
export function matchesProductSearch(query: string, name: string): boolean {
  const queryWords = toWords(query);
  if (queryWords.length === 0) return true;
  const nameWords = toWords(name);
  return queryWords.every((q) => nameWords.some((word) => word.startsWith(q)));
}

/**
 * Lower is better: names starting with the query first, then names with a
 * word starting with it, then the rest (words matched in another order).
 */
export function productSearchRank(query: string, name: string): number {
  const q = normalize(query);
  const n = normalize(name);
  if (n.startsWith(q)) return 0;
  if (n.includes(` ${q}`)) return 1;
  return 2;
}
