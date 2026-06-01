import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { followsApi } from "@/lib/api";
import { useSession } from "./useSession";

export const followKeys = {
  all: ["follows"] as const,
  following: ["follows", "following"] as const,
  followers: ["follows", "followers"] as const,
};

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

  const followingIds = useMemo(
    () => new Set(following.map((u) => u.id)),
    [following],
  );

  const follow = useMutation({
    mutationFn: (userId: string) => followsApi.follow(userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: followKeys.all }),
  });

  const unfollow = useMutation({
    mutationFn: (userId: string) => followsApi.unfollow(userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: followKeys.all }),
  });

  const toggle = (userId: string) => {
    if (followingIds.has(userId)) {
      unfollow.mutate(userId);
    } else {
      follow.mutate(userId);
    }
  };

  return {
    following,
    followers,
    followingIds,
    isLoading: followingLoading || followersLoading,
    toggle,
  };
}
