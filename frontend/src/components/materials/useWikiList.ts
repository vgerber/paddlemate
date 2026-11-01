import { useEffect, useState } from "react";
import type { MaterialModel } from "@/lib/api";
import { useDebouncedValue } from "@/lib/hooks/ui/useDebouncedValue";
import { useMaterialModels } from "@/lib/hooks/useMaterials";
import {
  type MaterialWikiSearch,
  toMaterialFilters,
} from "@/lib/materials/search";

export interface MaterialsViewProps {
  search: MaterialWikiSearch;
  compareIds: number[];
  onChange: (patch: Partial<MaterialWikiSearch>) => void;
  onOpen: (id: number) => void;
  onAdd: () => void;
  onTools: () => void;
  onToggleCompare: (model: MaterialModel) => void;
  onToggleSize: (id: number) => void;
  onClearCompare: () => void;
  onCompare: () => void;
}

/** The search text and the model list behind it, shared by both layouts. The
 * field types faster than the URL should change, so the query reaches the
 * search state only once typing stops. */
export function useWikiList(
  search: MaterialWikiSearch,
  onChange: (patch: Partial<MaterialWikiSearch>) => void,
) {
  const [text, setText] = useState(search.q ?? "");
  const debouncedText = useDebouncedValue(text);
  useEffect(() => {
    const next = debouncedText.trim() || undefined;
    if (next !== search.q) onChange({ q: next });
  }, [debouncedText, search.q, onChange]);
  // A link or the back button changes `q` from outside the field.
  useEffect(() => {
    setText((current) =>
      current.trim() === (search.q ?? "") ? current : (search.q ?? ""),
    );
  }, [search.q]);

  const query = useMaterialModels(toMaterialFilters(search));
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const total = query.data?.pages[0]?.total;
  return { text, setText, query, items, total };
}
