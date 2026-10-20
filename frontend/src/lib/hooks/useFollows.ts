import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { followsApi } from "@/lib/api";
import { useSession } from "./useSession";

export const followKeys = {
  all: ["follows"] as const,
  following: () => [...followKeys.all, "following"] as const,
  followers: () => [...followKeys.all, "followers"] as const,
  pending: () => [...followKeys.all, "pending"] as const,
  allUsers: () => [...followKeys.all, "users"] as const,
};

/** Every user with their follow relation, for the social search list. */
export function useAllUsers(enabled: boolean) {
  return useQuery({
    queryKey: followKeys.allUsers(),
    queryFn: () => followsApi.listAll(),
    enabled,
  });
}

export function useFollows() {
  const { isAuthenticated } = useSession();
  const qc = useQueryClient();

  const followingQuery = useQuery({
    queryKey: followKeys.following(),
    queryFn: () => followsApi.listFollowing(),
    enabled: isAuthenticated,
  });

  const followersQuery = useQuery({
    queryKey: followKeys.followers(),
    queryFn: () => followsApi.listFollowers(),
    enabled: isAuthenticated,
  });

  const pendingQuery = useQuery({
    queryKey: followKeys.pending(),
    queryFn: () => followsApi.listPendingRequests(),
    enabled: isAuthenticated,
  });

  const follow = useMutation({
    mutationFn: (userId: string) => followsApi.follow(userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: followKeys.all }),
  });

  const unfollow = useMutation({
    mutationFn: (userId: string) => followsApi.unfollow(userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: followKeys.all }),
  });

  const accept = useMutation({
    mutationFn: (userId: string) => followsApi.acceptRequest(userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: followKeys.all }),
  });

  const queries = [followingQuery, followersQuery, pendingQuery];
  // A failed load must not read as "not following anyone yet".
  const failed = queries.find((q) => q.isError && !q.data);

  return {
    following: followingQuery.data ?? [],
    followers: followersQuery.data ?? [],
    pendingRequests: pendingQuery.data ?? [],
    isLoading: queries.some((q) => q.isLoading),
    error: failed?.error ?? null,
    refetch: () => Promise.all(queries.map((q) => q.refetch())),
    follow,
    unfollow,
    accept,
  };
}
