import { ApiError, client } from "./client";
import type { components, operations } from "./schema.d.ts";

export type Waterway = components["schemas"]["Waterway"];
export type WaterwayWithSections =
  components["schemas"]["WaterwayWithSections"];
export type Section = components["schemas"]["Section"];
export type SectionWithFeatures = components["schemas"]["SectionWithFeatures"];
export type Feature = components["schemas"]["Feature"];
export type Comment = components["schemas"]["Comment"];
export type Proposal = components["schemas"]["Proposal"];
export type PaginatedResponse =
  components["schemas"]["PaginatedResponse_for_Waterway"];
export type CreateFeatureInput = components["schemas"]["CreateFeatureBody"];
export type SectionWaterStatus = components["schemas"]["SectionWaterStatus"];
export type WaterRangeWithStatus =
  components["schemas"]["WaterRangeWithStatus"];
export type GaugeReading = components["schemas"]["GaugeReading"];

export type WaterwayFilters = NonNullable<
  operations["list_waterways"]["parameters"]["query"]
>;

function assertData<T>(data: T | undefined): T {
  if (data === undefined) throw new ApiError(0, "No data returned");
  return data;
}

export const waterwaysApi = {
  list: async (filters: WaterwayFilters = {}) => {
    const { data } = await client.GET("/api/v1/waterways", {
      params: { query: filters },
    });
    return assertData(data);
  },
  get: async (id: number) => {
    const { data } = await client.GET("/api/v1/waterways/{waterway_id}", {
      params: { path: { waterway_id: id } },
    });
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
};

export const waterStatusApi = {
  getForSection: async (waterwayId: number, sectionId: number) => {
    const { data } = await client.GET(
      "/api/v1/waterways/{waterway_id}/sections/{section_id}/water-status",
      { params: { path: { waterway_id: waterwayId, section_id: sectionId } } },
    );
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
