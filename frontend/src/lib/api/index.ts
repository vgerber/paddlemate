import { ApiError, client, postForm } from "./client";
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
export type CommentCategory = components["schemas"]["CommentCategory"];
export type CommentStatus = components["schemas"]["CommentStatus"];
export type Media = components["schemas"]["Media"];
export type MediaKind = components["schemas"]["MediaKind"];
export type Proposal = components["schemas"]["Proposal"];
export type ProposalEntityType = components["schemas"]["ProposalEntityType"];
export type ProposalOperation = components["schemas"]["ProposalOperation"];
export type ProposalStatus = components["schemas"]["ProposalStatus"];
export type ReviewRequest = components["schemas"]["ReviewRequest"];
export type FeatureType = components["schemas"]["FeatureType"];
export type PaginatedResponse =
  components["schemas"]["PaginatedResponse_for_WaterwayListItem"];
/** A waterway in search results, carrying which text matched the query. */
export type WaterwayListItem = components["schemas"]["WaterwayListItem"];
export type MatchSource = components["schemas"]["MatchSource"];
export type CreateFeatureInput = components["schemas"]["CreateFeatureBody"];
export type UpdateFeatureInput = components["schemas"]["UpdateFeatureBody"];
export type SectionWaterStatus = components["schemas"]["SectionWaterStatus"];
export type WaterRangeWithStatus =
  components["schemas"]["WaterRangeWithStatus"];
export type GaugeReading = components["schemas"]["GaugeReading"];
export type GaugeWithSeries = components["schemas"]["GaugeWithSeries"];
export type GaugeSource = components["schemas"]["GaugeSource"];
export type GaugeOption = components["schemas"]["GaugeOption"];
export type CatalogRiver = components["schemas"]["CatalogRiver"];
export type CatalogGaugeRef = components["schemas"]["CatalogGaugeRef"];
export type GaugeMapPoint = components["schemas"]["GaugeMapPoint"];
export type GaugeMapState = components["schemas"]["GaugeMapState"];
export type FeatureWaterRangeBody =
  components["schemas"]["FeatureWaterRangeBody"];
export type ApiToken = components["schemas"]["ApiToken"];
export type ApiTokenCreated = components["schemas"]["ApiTokenCreated"];
export type FavoriteSection = components["schemas"]["FavoriteSectionResponse"];
export type UserWithFollowStatus =
  components["schemas"]["UserWithFollowStatusResponse"];
export type User = components["schemas"]["User"];
export type Trip = components["schemas"]["Trip"];
export type TripMember = components["schemas"]["TripMember"];
export type TripMemberRole = components["schemas"]["TripMemberRole"];
export type TripStay = components["schemas"]["TripStay"];
export type TripStayKind = components["schemas"]["TripStayKind"];
export type TripSection = components["schemas"]["TripSection"];
export type TripSectionInput = components["schemas"]["TripSectionInput"];
export type TripSectionStatus = components["schemas"]["TripSectionStatus"];
export type CreateTripRequest = components["schemas"]["CreateTripRequest"];
export type CreateTripStayRequest =
  components["schemas"]["CreateTripStayRequest"];
export type PatchTripRequest = components["schemas"]["PatchTripRequest"];
export type PatchTripStayRequest =
  components["schemas"]["PatchTripStayRequest"];
export type PatchTripMemberRequest =
  components["schemas"]["PatchTripMemberRequest"];
export type PaginatedTrips =
  components["schemas"]["PaginatedResponse_for_Trip"];
export type TripFilters = NonNullable<
  operations["list_trips"]["parameters"]["query"]
>;
export type Region = components["schemas"]["Region"];
export type RegionKind = components["schemas"]["RegionKind"];
export type RegionOutline = components["schemas"]["RegionOutline"];
export type CountryBorder = components["schemas"]["CountryBorder"];
export type RegionOutlineList = components["schemas"]["RegionOutlineList"];

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
  /** Gauges already linked to any section of the waterway. */
  gauges: async (id: number) => {
    const { data } = await client.GET(
      "/api/v1/waterways/{waterway_id}/gauges",
      {
        params: { path: { waterway_id: id } },
      },
    );
    return assertData(data);
  },
};

export const sectionsApi = {
  descentCounts: async (waterwayId: number) => {
    const { data } = await client.GET(
      "/api/v1/waterways/{waterway_id}/descents/count",
      { params: { path: { waterway_id: waterwayId } } },
    );
    return assertData(data);
  },
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

export const commentsApi = {
  /** Notes on the river; `includeSections` folds in its sections' notes. */
  list: async (
    waterwayId: number,
    includeSections = false,
    signal?: AbortSignal,
  ) => {
    const { data } = await client.GET(
      "/api/v1/waterways/{waterway_id}/comments",
      {
        params: {
          path: { waterway_id: waterwayId },
          query: { include_sections: includeSections },
        },
        signal,
      },
    );
    return assertData(data);
  },
  listForSection: async (
    waterwayId: number,
    sectionId: number,
    signal?: AbortSignal,
  ) => {
    const { data } = await client.GET(
      "/api/v1/waterways/{waterway_id}/sections/{section_id}/comments",
      {
        params: { path: { waterway_id: waterwayId, section_id: sectionId } },
        signal,
      },
    );
    return assertData(data);
  },
  createForSection: async (
    waterwayId: number,
    sectionId: number,
    input: {
      body: string;
      category?: CommentCategory;
      mediaIds?: number[];
      location?: [number, number] | null;
    },
  ) => {
    const { data } = await client.POST(
      "/api/v1/waterways/{waterway_id}/sections/{section_id}/comments",
      {
        params: { path: { waterway_id: waterwayId, section_id: sectionId } },
        body: {
          body: input.body,
          category: input.category ?? null,
          media_ids: input.mediaIds ?? [],
          location: input.location
            ? { type: "Point", coordinates: input.location }
            : null,
        },
      },
    );
    return assertData(data);
  },
  create: async (
    waterwayId: number,
    input: {
      body: string;
      category?: CommentCategory;
      mediaIds?: number[];
      location?: [number, number] | null;
    },
  ) => {
    const { data } = await client.POST(
      "/api/v1/waterways/{waterway_id}/comments",
      {
        params: { path: { waterway_id: waterwayId } },
        body: {
          body: input.body,
          category: input.category ?? null,
          media_ids: input.mediaIds ?? [],
          location: input.location
            ? { type: "Point", coordinates: input.location }
            : null,
        },
      },
    );
    return assertData(data);
  },
  update: async (
    waterwayId: number,
    commentId: number,
    input: { body: string; category?: CommentCategory },
  ) => {
    const { data } = await client.PUT(
      "/api/v1/waterways/{waterway_id}/comments/{comment_id}",
      {
        params: { path: { waterway_id: waterwayId, comment_id: commentId } },
        body: { body: input.body, category: input.category ?? null },
      },
    );
    return assertData(data);
  },
  remove: async (waterwayId: number, commentId: number) => {
    await client.DELETE(
      "/api/v1/waterways/{waterway_id}/comments/{comment_id}",
      {
        params: { path: { waterway_id: waterwayId, comment_id: commentId } },
      },
    );
  },
  /** Admin: fold a note into curated data, retire it, or hide it. */
  moderate: async (
    waterwayId: number,
    commentId: number,
    status: CommentStatus,
  ) => {
    const { data } = await client.PUT(
      "/api/v1/waterways/{waterway_id}/comments/{comment_id}/status",
      {
        params: { path: { waterway_id: waterwayId, comment_id: commentId } },
        body: { status },
      },
    );
    return assertData(data);
  },
};

export const mediaApi = {
  list: async (
    waterwayId: number,
    includeFromNotes = false,
    signal?: AbortSignal,
  ) => {
    const { data } = await client.GET("/api/v1/waterways/{waterway_id}/media", {
      params: {
        path: { waterway_id: waterwayId },
        query: { include_from_notes: includeFromNotes },
      },
      signal,
    });
    return assertData(data);
  },
  /** Multipart, so this one bypasses the typed client. `sectionId` scopes
   * the upload to a section instead of the river. */
  upload: async (
    waterwayId: number,
    sectionId: number | null,
    form: {
      file?: File;
      kind?: MediaKind;
      url?: string;
      caption?: string;
      copyright?: string;
    },
  ): Promise<Media> => {
    const data = new FormData();
    if (form.file) data.append("file", form.file);
    if (form.kind) data.append("kind", form.kind);
    if (form.url) data.append("url", form.url);
    if (form.caption) data.append("caption", form.caption);
    if (form.copyright) data.append("copyright", form.copyright);
    const path =
      sectionId == null
        ? `/api/v1/waterways/${waterwayId}/media`
        : `/api/v1/waterways/${waterwayId}/sections/${sectionId}/media`;
    return postForm<Media>(path, data);
  },
  remove: async (waterwayId: number, mediaId: number) => {
    await client.DELETE("/api/v1/waterways/{waterway_id}/media/{media_id}", {
      params: { path: { waterway_id: waterwayId, media_id: mediaId } },
    });
  },
};

/** Line parameter format shared by the geographic lookups. */
const lineParam = (line: [number, number][]) =>
  line.map(([lon, lat]) => `${lon},${lat}`).join(";");

export const waterwayGeometryApi = {
  /** A waterway's cached river geometry; a centerline miss is fetched
   * server-side (bounded by the sections bbox or the given area). Throws
   * ApiError 404 when nothing could be cached. */
  get: async (
    waterwayId: number,
    kind?: "centerline" | "bank",
    bbox?: { south: number; west: number; north: number; east: number },
    signal?: AbortSignal,
  ) => {
    const { data } = await client.GET(
      "/api/v1/waterways/{waterway_id}/geometry",
      {
        params: {
          path: { waterway_id: waterwayId },
          query: {
            kind,
            bbox: bbox
              ? `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`
              : undefined,
          },
        },
        signal,
      },
    );
    return assertData(data);
  },
};

export const riverSegmentsApi = {
  /** River segments around a corridor, for routing across confluences. */
  list: async (
    line: [number, number][],
    radiusM: number,
    signal?: AbortSignal,
  ) => {
    const { data } = await client.GET("/api/v1/geo/river-segments", {
      params: { query: { line: lineParam(line), radius_m: radiusM } },
      signal,
    });
    return assertData(data);
  },
};

export const regionsApi = {
  /** Regions containing a line - valley, district, state, range, country,
   * most specific first. Derived from OSM, so ids and outlines are absent. */
  list: async (line: [number, number][], signal?: AbortSignal) => {
    const { data } = await client.GET("/api/v1/geo/regions", {
      params: { query: { line: lineParam(line) } },
      signal,
    });
    return assertData(data);
  },
  /** Imported regions matching a name, for the region filter's picker. */
  search: async (q: string, signal?: AbortSignal) => {
    const { data } = await client.GET("/api/v1/geo/regions", {
      params: { query: { q } },
      signal,
    });
    return assertData(data);
  },
  /** Every region in a viewport, for drawing region mode on the map. The
   * server fetches ground it has not seen from OSM in the background, so a
   * list that comes back `filling` is not the whole picture yet. */
  inView: async (
    bbox: [number, number, number, number],
    signal?: AbortSignal,
  ) => {
    const { data } = await client.GET("/api/v1/geo/region-outlines", {
      params: { query: { bbox: bbox.join(",") } },
      signal,
    });
    return assertData(data);
  },
  /** One region with its boundary, for drawing on the map. */
  outline: async (regionId: number, signal?: AbortSignal) => {
    const { data } = await client.GET("/api/v1/geo/regions/{region_id}", {
      params: { path: { region_id: regionId } },
      signal,
    });
    return assertData(data);
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
    const { data } = await client.GET("/api/v1/waterways/gauges/search", {
      params: { query: params },
    });
    return assertData(data);
  },
  /** The gauge catalog: all available gauges (existing + catalog stations
   * across every provider), filtered by name and/or proximity. */
  catalogSearch: async (params: {
    q?: string;
    /** Exact river name (case-insensitive): only that river's catalog stations. */
    river?: string;
    lat?: number;
    lon?: number;
    radius_km?: number;
    limit?: number;
  }) => {
    const { data } = await client.GET("/api/v1/waterways/gauges/catalog", {
      params: { query: params },
    });
    return assertData(data);
  },
  /** Distinct river names from the gauge catalog matching a query, with
   * station counts - used to suggest gauge-backed rivers. */
  catalogRivers: async (params: { q?: string; limit?: number }) => {
    const { data } = await client.GET(
      "/api/v1/waterways/gauges/catalog/rivers",
      { params: { query: params } },
    );
    return assertData(data);
  },
  /** Every gauge as a coverage-map point (used / fetched / available). */
  map: async () => {
    const { data } = await client.GET("/api/v1/waterways/gauges/map");
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
      "/api/v1/waterways/gauges/{gauge_id}/series/{series_id}/readings",
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

export const tripsApi = {
  list: async (filters: TripFilters = {}) => {
    const { data } = await client.GET("/api/v1/trips", {
      params: { query: filters },
    });
    return assertData(data);
  },
  get: async (id: number) => {
    const { data } = await client.GET("/api/v1/trips/{trip_id}", {
      params: { path: { trip_id: id } },
    });
    return assertData(data);
  },
  create: async (body: CreateTripRequest) => {
    const { data } = await client.POST("/api/v1/trips", { body });
    return assertData(data);
  },
  update: async (id: number, body: PatchTripRequest) => {
    const { data } = await client.PATCH("/api/v1/trips/{trip_id}", {
      params: { path: { trip_id: id } },
      body,
    });
    return assertData(data);
  },
  remove: async (id: number) => {
    await client.DELETE("/api/v1/trips/{trip_id}", {
      params: { path: { trip_id: id } },
    });
  },
  members: async (id: number) => {
    const { data } = await client.GET("/api/v1/trips/{trip_id}/members", {
      params: { path: { trip_id: id } },
    });
    return assertData(data);
  },
  join: async (id: number) => {
    const { data } = await client.POST("/api/v1/trips/{trip_id}/members", {
      params: { path: { trip_id: id } },
    });
    return assertData(data);
  },
  updateMember: async (
    id: number,
    userId: string,
    body: PatchTripMemberRequest,
  ) => {
    const { data } = await client.PATCH(
      "/api/v1/trips/{trip_id}/members/{user_id}",
      { params: { path: { trip_id: id, user_id: userId } }, body },
    );
    return assertData(data);
  },
  removeMember: async (id: number, userId: string) => {
    await client.DELETE("/api/v1/trips/{trip_id}/members/{user_id}", {
      params: { path: { trip_id: id, user_id: userId } },
    });
  },
  stays: async (id: number) => {
    const { data } = await client.GET("/api/v1/trips/{trip_id}/stays", {
      params: { path: { trip_id: id } },
    });
    return assertData(data);
  },
  createStay: async (id: number, body: CreateTripStayRequest) => {
    const { data } = await client.POST("/api/v1/trips/{trip_id}/stays", {
      params: { path: { trip_id: id } },
      body,
    });
    return assertData(data);
  },
  updateStay: async (
    id: number,
    stayId: number,
    body: PatchTripStayRequest,
  ) => {
    const { data } = await client.PATCH(
      "/api/v1/trips/{trip_id}/stays/{stay_id}",
      { params: { path: { trip_id: id, stay_id: stayId } }, body },
    );
    return assertData(data);
  },
  removeStay: async (id: number, stayId: number) => {
    await client.DELETE("/api/v1/trips/{trip_id}/stays/{stay_id}", {
      params: { path: { trip_id: id, stay_id: stayId } },
    });
  },
  replaceStaySections: async (
    id: number,
    stayId: number,
    sections: TripSectionInput[],
  ) => {
    const { data } = await client.PUT(
      "/api/v1/trips/{trip_id}/stays/{stay_id}/sections",
      {
        params: { path: { trip_id: id, stay_id: stayId } },
        body: { sections },
      },
    );
    return assertData(data);
  },
  replaceAudienceUsers: async (id: number, users: string[]) => {
    await client.PUT("/api/v1/trips/{trip_id}/audiences/users", {
      params: { path: { trip_id: id } },
      body: { users },
    });
  },
  replaceAudienceGroups: async (id: number, groups: number[]) => {
    await client.PUT("/api/v1/trips/{trip_id}/audiences/groups", {
      params: { path: { trip_id: id } },
      body: { groups },
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

/** The signed-in caller, as the API addresses them. Whose data a request is
 * about stays in the path; the token decides whether it is allowed. */
const ME = "me";

export const tokensApi = {
  list: async (): Promise<ApiToken[]> => {
    const { data } = await client.GET("/api/v1/users/me/tokens");
    return assertData(data);
  },
  create: async (
    name: string,
    expiresAt?: string,
  ): Promise<ApiTokenCreated> => {
    const { data } = await client.POST("/api/v1/users/me/tokens", {
      body: { name, expires_at: expiresAt ?? null },
    });
    return assertData(data);
  },
  revoke: async (tokenId: number): Promise<void> => {
    await client.DELETE("/api/v1/users/me/tokens/{token_id}", {
      params: { path: { token_id: tokenId } },
    });
  },
};

export const favoritesApi = {
  listSections: async (): Promise<FavoriteSection[]> => {
    const { data } = await client.GET(
      "/api/v1/users/{user_id}/favorites/sections",
      { params: { path: { user_id: ME } } },
    );
    return assertData(data);
  },
  addSection: async (sectionId: number): Promise<void> => {
    await client.PUT(
      "/api/v1/users/{user_id}/favorites/sections/{section_id}",
      {
        params: { path: { user_id: ME, section_id: sectionId } },
      },
    );
  },
  removeSection: async (sectionId: number): Promise<void> => {
    await client.DELETE(
      "/api/v1/users/{user_id}/favorites/sections/{section_id}",
      { params: { path: { user_id: ME, section_id: sectionId } } },
    );
  },
};

export const followsApi = {
  listAll: async (): Promise<UserWithFollowStatus[]> => {
    const { data } = await client.GET("/api/v1/users");
    return assertData(data);
  },
  listFollowing: async (): Promise<User[]> => {
    const { data } = await client.GET("/api/v1/users/{user_id}/following", {
      params: { path: { user_id: ME } },
    });
    return assertData(data);
  },
  listFollowers: async (): Promise<User[]> => {
    const { data } = await client.GET("/api/v1/users/{user_id}/followers", {
      params: { path: { user_id: ME } },
    });
    return assertData(data);
  },
  listPendingRequests: async (): Promise<User[]> => {
    const { data } = await client.GET("/api/v1/users/{user_id}/followers", {
      params: { path: { user_id: ME }, query: { status: "pending" } },
    });
    return assertData(data);
  },
  follow: async (userId: string): Promise<void> => {
    await client.PUT("/api/v1/users/{user_id}/following/{target_id}", {
      params: { path: { user_id: ME, target_id: userId } },
    });
  },
  unfollow: async (userId: string): Promise<void> => {
    await client.DELETE("/api/v1/users/{user_id}/following/{target_id}", {
      params: { path: { user_id: ME, target_id: userId } },
    });
  },
  acceptRequest: async (userId: string): Promise<void> => {
    await client.PATCH("/api/v1/users/{user_id}/followers/{follower_id}", {
      params: { path: { user_id: ME, follower_id: userId } },
      body: { status: "accepted" },
    });
  },
};
