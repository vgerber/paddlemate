import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tokensApi } from "@/lib/api";

export const tokenKeys = {
  all: ["tokens"] as const,
};

export function useApiTokens() {
  return useQuery({
    queryKey: tokenKeys.all,
    queryFn: () => tokensApi.list(),
  });
}

export function useCreateApiToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => tokensApi.create(name),
    // The settings panel renders create.isError inline below the form.
    meta: { errorHandledLocally: true },
    onSuccess: () => qc.invalidateQueries({ queryKey: tokenKeys.all }),
  });
}

export function useRevokeApiToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => tokensApi.revoke(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: tokenKeys.all }),
  });
}
