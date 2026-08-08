import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { followsApi } from "@/lib/api";
import { useSession } from "./useSession";

export const followKeys = {
  all: ["follows"] as const,
  following: ["follows", "following"] as const,
  followers: ["follows", "followers"] as const,
  pending: ["follows", "pending"] as const,
  allUsers: ["follows", "users"] as const,
};

/** Every user with their follow relation, for the social search list. */
export function useAllUsers(enabled: boolean) {
  return useQuery({
    queryKey: followKeys.allUsers,
    queryFn: () => followsApi.listAll(),
    enabled,
  });
}

export function useFollows() {
  const { isAuthenticated } = useSession();
  const qc = useQueryClient();

  const { data: following = [], isLoading: followingLoading } = useQuery({
    queryKey: followKeys.following,
    queryFn: () => followsApi.listFollowing(),
    enabled: isAuthenticated,
  });

  const { data: followers = [], isLoading: followersLoading } = useQuery({
    queryKey: followKeys.followers,
    queryFn: () => followsApi.listFollowers(),
    enabled: isAuthenticated,
  });

  const { data: pendingRequests = [], isLoading: pendingLoading } = useQuery({
    queryKey: followKeys.pending,
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

  return {
    following,
    followers,
    pendingRequests,
    isLoading: followingLoading || followersLoading || pendingLoading,
    follow,
    unfollow,
    accept,
  };
}
