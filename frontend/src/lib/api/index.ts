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

export type Descent = components["schemas"]["Descent"];
export type DescentSection = components["schemas"]["DescentSection"];
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
