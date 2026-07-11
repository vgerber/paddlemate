/** Normalize a name for comparison: lowercase + remove accents */
export function normalizeForSearch(str: string): string {
  return str.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}
