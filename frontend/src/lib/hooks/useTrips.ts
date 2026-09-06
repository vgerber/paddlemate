import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  type CreateTripRequest,
  type CreateTripStayRequest,
  descentsApi,
  type PatchTripMemberRequest,
  type PatchTripRequest,
  type PatchTripStayRequest,
  type Trip,
  type TripFilters,
  type TripSectionInput,
  tripsApi,
} from "@/lib/api";
import { buildTimeline, type TripDay } from "@/lib/tripTimeline";
import { descentKeys, useDescents } from "./useDescents";

export const tripKeys = {
  all: ["trips"] as const,
  lists: () => [...tripKeys.all, "list"] as const,
  list: (filters: TripFilters) => [...tripKeys.lists(), filters] as const,
  detail: (id: number) => [...tripKeys.all, id] as const,
  members: (id: number) => [...tripKeys.detail(id), "members"] as const,
  stays: (id: number) => [...tripKeys.detail(id), "stays"] as const,
};

export function useTrips(filters: TripFilters = {}, enabled = true) {
  return useQuery({
    queryKey: tripKeys.list(filters),
    queryFn: () => tripsApi.list(filters),
    enabled,
  });
}

export function useMyTrips(filters: Omit<TripFilters, "scope"> = {}) {
  return useTrips({ ...filters, scope: "member" });
}

export function useTrip(id: number | null) {
  return useQuery({
    queryKey: tripKeys.detail(id ?? 0),
    queryFn: () => tripsApi.get(id as number),
    enabled: id !== null,
  });
}

export function useTripMembers(id: number | null) {
  return useQuery({
    queryKey: tripKeys.members(id ?? 0),
    queryFn: () => tripsApi.members(id as number),
    enabled: id !== null,
  });
}

export function useTripStays(id: number | null) {
  return useQuery({
    queryKey: tripKeys.stays(id ?? 0),
    queryFn: () => tripsApi.stays(id as number),
    enabled: id !== null,
  });
}

export function useCreateTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTripRequest) => tripsApi.create(body),
    // TripForm renders the failure inline next to the save button.
    meta: { errorHandledLocally: true },
    onSuccess: () => qc.invalidateQueries({ queryKey: tripKeys.lists() }),
  });
}

export function usePatchTrip(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PatchTripRequest) => tripsApi.update(id, body),
    meta: { errorHandledLocally: true },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tripKeys.detail(id) });
      qc.invalidateQueries({ queryKey: tripKeys.lists() });
    },
  });
}

export function useDeleteTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => tripsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tripKeys.lists() });
      // A deleted trip ungroups its logs rather than removing them.
      qc.invalidateQueries({ queryKey: descentKeys.lists() });
    },
  });
}

export function useJoinTrip(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => tripsApi.join(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tripKeys.detail(id) });
      qc.invalidateQueries({ queryKey: tripKeys.lists() });
    },
  });
}

export function usePatchTripMember(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      userId,
      body,
    }: {
      userId: string;
      body: PatchTripMemberRequest;
    }) => tripsApi.updateMember(id, userId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: tripKeys.detail(id) }),
  });
}

export function useRemoveTripMember(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => tripsApi.removeMember(id, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tripKeys.detail(id) });
      qc.invalidateQueries({ queryKey: tripKeys.lists() });
    },
  });
}

export function useCreateTripStay(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTripStayRequest) => tripsApi.createStay(id, body),
    meta: { errorHandledLocally: true },
    onSuccess: () => qc.invalidateQueries({ queryKey: tripKeys.stays(id) }),
  });
}

export function usePatchTripStay(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      stayId,
      body,
    }: {
      stayId: number;
      body: PatchTripStayRequest;
    }) => tripsApi.updateStay(id, stayId, body),
    meta: { errorHandledLocally: true },
    onSuccess: () => qc.invalidateQueries({ queryKey: tripKeys.stays(id) }),
  });
}

export function useDeleteTripStay(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (stayId: number) => tripsApi.removeStay(id, stayId),
    onSuccess: () => qc.invalidateQueries({ queryKey: tripKeys.stays(id) }),
  });
}

export function useReplaceStaySections(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      stayId,
      sections,
    }: {
      stayId: number;
      sections: TripSectionInput[];
    }) => tripsApi.replaceStaySections(id, stayId, sections),
    onSuccess: () => qc.invalidateQueries({ queryKey: tripKeys.stays(id) }),
  });
}

/**
 * Credit a log to this trip, or drop it with `trip_id: null`. Lives here
 * rather than with the descent mutations because it also moves the trip's log
 * count, so both caches have to be invalidated.
 */
export function useLinkDescentToTrip(tripId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, trip_id }: { id: number; trip_id: number | null }) =>
      descentsApi.update(id, { trip_id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: descentKeys.lists() });
      qc.invalidateQueries({ queryKey: tripKeys.detail(tripId) });
      qc.invalidateQueries({ queryKey: tripKeys.lists() });
    },
  });
}

/**
 * The trip as a run of days. A composition of the three queries behind it, so
 * the timeline and the day editor read the same list without either owning it
 * - React Query dedupes the fetches.
 */
export function useTripTimeline(trip: Trip) {
  const members = useTripMembers(trip.id);
  const stays = useTripStays(trip.id);
  const descents = useDescents({ trip_id: trip.id });

  const days: TripDay[] = useMemo(
    () =>
      buildTimeline({
        startDate: trip.start_date,
        endDate: trip.end_date,
        members: members.data ?? [],
        stays: stays.data ?? [],
        descents: descents.data?.items ?? [],
      }),
    [trip.start_date, trip.end_date, members.data, stays.data, descents.data],
  );

  return {
    days,
    isLoading: members.isLoading || stays.isLoading || descents.isLoading,
  };
}
