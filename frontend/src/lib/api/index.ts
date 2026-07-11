import { ApiError, client } from "./client";
import type { components, operations } from "./schema.d.ts";

export type Waterway = components["schemas"]["Waterway"];
export type WaterwayWithSections =
  components["schemas"]["WaterwayWithSections"];
export type Section = components["schemas"]["Section"];
export type SectionWithFeatures = components["schemas"]["SectionWithFeatures"];
export type Feature = components["schemas"]["Feature"];
export type FeatureName = components["schemas"]["FeatureName"];
export type FeatureDescription = components["schemas"]["FeatureDescription"];
export type Comment = components["schemas"]["Comment"];
export type Proposal = components["schemas"]["Proposal"];
export type ProposalEntityType = components["schemas"]["ProposalEntityType"];
export type ProposalOperation = components["schemas"]["ProposalOperation"];
export type ProposalStatus = components["schemas"]["ProposalStatus"];
export type ReviewRequest = components["schemas"]["ReviewRequest"];
export type FeatureType = components["schemas"]["FeatureType"];
export type PaginatedResponse =
  components["schemas"]["PaginatedResponse_for_Waterway"];
export type CreateFeatureInput = components["schemas"]["CreateFeatureBody"];
export type UpdateFeatureInput = components["schemas"]["UpdateFeatureBody"];
export type SectionWaterStatus = components["schemas"]["SectionWaterStatus"];
export type WaterRangeWithStatus =
  components["schemas"]["WaterRangeWithStatus"];
export type GaugeReading = components["schemas"]["GaugeReading"];
export type GaugeWithSeries = components["schemas"]["GaugeWithSeries"];
export type GaugeSource = components["schemas"]["GaugeSource"];
export type FeatureWaterRangeBody =
  components["schemas"]["FeatureWaterRangeBody"];
export type ApiToken = components["schemas"]["ApiToken"];
export type ApiTokenCreated = components["schemas"]["ApiTokenCreated"];
export type FavoriteSection = components["schemas"]["FavoriteSectionResponse"];
export type UserWithFollowStatus =
  components["schemas"]["UserWithFollowStatusResponse"];
export type User = components["schemas"]["User"];

export type WaterwayFilters = NonNullable<
  operations["list_waterways"]["parameters"]["query"]
>;

export type ProposalFilters = NonNullable<
  operations["list_proposals"]["parameters"]["query"]
>;

function assertData<T>(data: T | undefined): T {
  if (data === undefined) throw new ApiError(0, "No data returned");
  return data;
}

export const waterwaysApi = {
  list: async (filters: WaterwayFilters = {}, signal?: AbortSignal) => {
    const { data } = await client.GET("/api/v1/waterways", {
      params: { query: filters },
      signal,
    });
    return assertData(data);
  },
  get: async (id: number, signal?: AbortSignal) => {
    const { data } = await client.GET("/api/v1/waterways/{waterway_id}", {
      params: { path: { waterway_id: id } },
      signal,
    });
    return assertData(data);
  },
  create: async (body: components["schemas"]["CreateWaterwayBody"]) => {
    const { data } = await client.POST("/api/v1/waterways", { body });
    // 201 (admin, Waterway) or 202 (proposal); client throws ApiError on 409.
    return assertData(data);
  },
};

export const sectionsApi = {
  get: async (waterwayId: number, sectionId: number) => {
    const { data } = await client.GET(
      "/api/v1/waterways/{waterway_id}/sections/{section_id}",
      { params: { path: { waterway_id: waterwayId, section_id: sectionId } } },
    );
    return assertData(data);
  },
  create: async (
    waterwayId: number,
    body: components["schemas"]["CreateSectionBody"],
  ) => {
    const { data } = await client.POST(
      "/api/v1/waterways/{waterway_id}/sections",
      { params: { path: { waterway_id: waterwayId } }, body },
    );
    return assertData(data);
  },
  update: async (
    waterwayId: number,
    sectionId: number,
    body: components["schemas"]["UpdateSectionBody"],
  ) => {
    const { data } = await client.PUT(
      "/api/v1/waterways/{waterway_id}/sections/{section_id}",
      {
        params: { path: { waterway_id: waterwayId, section_id: sectionId } },
        body,
      },
    );
    return assertData(data);
  },
};

export const commentsApi = {
  listForSection: async (waterwayId: number, sectionId: number) => {
    const { data } = await client.GET(
      "/api/v1/waterways/{waterway_id}/sections/{section_id}/comments",
      { params: { path: { waterway_id: waterwayId, section_id: sectionId } } },
    );
    return assertData(data);
  },
  createForSection: async (
    waterwayId: number,
    sectionId: number,
    body: string,
  ) => {
    const { data } = await client.POST(
      "/api/v1/waterways/{waterway_id}/sections/{section_id}/comments",
      {
        params: { path: { waterway_id: waterwayId, section_id: sectionId } },
        body: { body },
      },
    );
    return assertData(data);
  },
};

export const featuresApi = {
  create: async (
    waterwayId: number,
    sectionId: number,
    input: CreateFeatureInput,
  ) => {
    const { data } = await client.POST(
      "/api/v1/waterways/{waterway_id}/sections/{section_id}/features",
      {
        params: { path: { waterway_id: waterwayId, section_id: sectionId } },
        body: input,
      },
    );
    return assertData(data);
  },
  update: async (
    waterwayId: number,
    sectionId: number,
    featureId: number,
    input: UpdateFeatureInput,
  ) => {
    const { data } = await client.PUT(
      "/api/v1/waterways/{waterway_id}/sections/{section_id}/features/{feature_id}",
      {
        params: {
          path: {
            waterway_id: waterwayId,
            section_id: sectionId,
            feature_id: featureId,
          },
        },
        body: input,
      },
    );
    return assertData(data);
  },
  remove: async (waterwayId: number, sectionId: number, featureId: number) => {
    await client.DELETE(
      "/api/v1/waterways/{waterway_id}/sections/{section_id}/features/{feature_id}",
      {
        params: {
          path: {
            waterway_id: waterwayId,
            section_id: sectionId,
            feature_id: featureId,
          },
        },
      },
    );
  },
};

export const waterStatusApi = {
  getForSection: async (
    waterwayId: number,
    sectionId: number,
    signal?: AbortSignal,
  ) => {
    const { data } = await client.GET(
      "/api/v1/waterways/{waterway_id}/sections/{section_id}/water-status",
      {
        params: { path: { waterway_id: waterwayId, section_id: sectionId } },
        signal,
      },
    );
    return assertData(data);
  },
};

export const gaugesApi = {
  /** Search active gauges by name and/or proximity (nearest-first). */
  search: async (params: {
    q?: string;
    lat?: number;
    lon?: number;
    limit?: number;
  }) => {
    const { data } = await client.GET("/api/v1/gauges/search", {
      params: { query: params },
    });
    return assertData(data);
  },
};

export const gaugeReadingsApi = {
  list: async (
    gaugeId: number,
    seriesId: number,
    from?: string,
    limit?: number,
  ) => {
    const { data } = await client.GET(
      "/api/v1/gauges/{gauge_id}/series/{series_id}/readings",
      {
        params: {
          path: { gauge_id: gaugeId, series_id: seriesId },
          query: { from, limit },
        },
      },
    );
    return assertData(data);
  },
};

export type Descent = components["schemas"]["Descent"];
export type DescentSection = components["schemas"]["DescentSection"];
export type SectionWaterSnapshot =
  components["schemas"]["SectionWaterSnapshot"];
export type DescentSectionInput = components["schemas"]["DescentSectionInput"];
export type Visibility = components["schemas"]["Visibility"];
export type CreateDescentRequest =
  components["schemas"]["CreateDescentRequest"];
export type PatchDescentRequest = components["schemas"]["PatchDescentRequest"];
export type PaginatedDescentResponse =
  components["schemas"]["PaginatedResponse_for_Descent"];
export type DescentFilters = NonNullable<
  operations["list_descents"]["parameters"]["query"]
>;

export type Group = components["schemas"]["Group"];

export const groupsApi = {
  list: async () => {
    const { data } = await client.GET("/api/v1/groups", {});
    return assertData(data);
  },
};

export const descentsApi = {
  list: async (filters: DescentFilters = {}) => {
    const { data } = await client.GET("/api/v1/descents", {
      params: { query: filters },
    });
    return assertData(data);
  },
  get: async (id: number) => {
    const { data } = await client.GET("/api/v1/descents/{descent_id}", {
      params: { path: { descent_id: id } },
    });
    return assertData(data);
  },
  create: async (body: CreateDescentRequest) => {
    const { data } = await client.POST("/api/v1/descents", { body });
    return assertData(data);
  },
  update: async (id: number, body: PatchDescentRequest) => {
    const { data } = await client.PATCH("/api/v1/descents/{descent_id}", {
      params: { path: { descent_id: id } },
      body,
    });
    return assertData(data);
  },
  remove: async (id: number) => {
    await client.DELETE("/api/v1/descents/{descent_id}", {
      params: { path: { descent_id: id } },
    });
  },
};

export const proposalsApi = {
  list: async (filters: ProposalFilters = {}) => {
    const { data } = await client.GET("/api/v1/proposals", {
      params: { query: filters },
    });
    return assertData(data);
  },
  get: async (id: number) => {
    const { data } = await client.GET("/api/v1/proposals/{proposal_id}", {
      params: { path: { proposal_id: id } },
    });
    return assertData(data);
  },
  review: async (id: number, body: ReviewRequest) => {
    const { data } = await client.PATCH("/api/v1/proposals/{proposal_id}", {
      params: { path: { proposal_id: id } },
      body,
    });
    return assertData(data);
  },
  vote: async (id: number, vote: 1 | -1) => {
    await client.POST("/api/v1/proposals/{proposal_id}/vote", {
      params: { path: { proposal_id: id } },
      body: { vote },
    });
  },
  unvote: async (id: number) => {
    await client.DELETE("/api/v1/proposals/{proposal_id}/vote", {
      params: { path: { proposal_id: id } },
    });
  },
  delete: async (id: number) => {
    await client.DELETE("/api/v1/proposals/{proposal_id}", {
      params: { path: { proposal_id: id } },
    });
  },
};

export const tokensApi = {
  list: async (): Promise<ApiToken[]> => {
    const { data } = await client.GET("/api/v1/tokens");
    return assertData(data);
  },
  create: async (
    name: string,
    expiresAt?: string,
  ): Promise<ApiTokenCreated> => {
    const { data } = await client.POST("/api/v1/tokens", {
      body: { name, expires_at: expiresAt ?? null },
    });
    return assertData(data);
  },
  revoke: async (tokenId: number): Promise<void> => {
    await client.DELETE("/api/v1/tokens/{token_id}", {
      params: { path: { token_id: tokenId } },
    });
  },
};

export const favoritesApi = {
  listSections: async (): Promise<FavoriteSection[]> => {
    const { data } = await client.GET("/api/v1/favorites/sections");
    return assertData(data);
  },
  addSection: async (sectionId: number): Promise<void> => {
    await client.POST("/api/v1/favorites/sections/{section_id}", {
      params: { path: { section_id: sectionId } },
    });
  },
  removeSection: async (sectionId: number): Promise<void> => {
    await client.DELETE("/api/v1/favorites/sections/{section_id}", {
      params: { path: { section_id: sectionId } },
    });
  },
};

export const followsApi = {
  listAll: async (): Promise<UserWithFollowStatus[]> => {
    const { data } = await client.GET("/api/v1/follows/users");
    return assertData(data);
  },
  listFollowing: async (): Promise<User[]> => {
    const { data } = await client.GET("/api/v1/follows/users/following");
    return assertData(data);
  },
  listFollowers: async (): Promise<User[]> => {
    const { data } = await client.GET("/api/v1/follows/users/followers");
    return assertData(data);
  },
  listPendingRequests: async (): Promise<User[]> => {
    const { data } = await client.GET("/api/v1/follows/users/pending");
    return assertData(data);
  },
  follow: async (userId: string): Promise<void> => {
    await client.POST("/api/v1/follows/users/{user_id}", {
      params: { path: { user_id: userId } },
    });
  },
  unfollow: async (userId: string): Promise<void> => {
    await client.DELETE("/api/v1/follows/users/{user_id}", {
      params: { path: { user_id: userId } },
    });
  },
  acceptRequest: async (userId: string): Promise<void> => {
    await client.PATCH("/api/v1/follows/users/{user_id}/accept", {
      params: { path: { user_id: userId } },
    });
  },
};
