import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { favoritesApi } from "@/lib/api";
import { useSession } from "./useSession";

export const favoriteKeys = {
  sections: ["favorites", "sections"] as const,
};

export function useFavorites() {
  const { isAuthenticated } = useSession();
  const qc = useQueryClient();

  const { data: favorites = [], isLoading } = useQuery({
    queryKey: favoriteKeys.sections,
    queryFn: () => favoritesApi.listSections(),
    enabled: isAuthenticated,
  });

  const favoritedIds = useMemo(
    () => new Set(favorites.map((f) => f.id)),
    [favorites],
  );

  const add = useMutation({
    mutationFn: (sectionId: number) => favoritesApi.addSection(sectionId),
    onSuccess: () => qc.invalidateQueries({ queryKey: favoriteKeys.sections }),
  });

  const remove = useMutation({
    mutationFn: (sectionId: number) => favoritesApi.removeSection(sectionId),
    onSuccess: () => qc.invalidateQueries({ queryKey: favoriteKeys.sections }),
  });

  const toggle = (sectionId: number) => {
    if (favoritedIds.has(sectionId)) {
      remove.mutate(sectionId);
    } else {
      add.mutate(sectionId);
    }
  };

  return { favorites, favoritedIds, isLoading, toggle };
}
