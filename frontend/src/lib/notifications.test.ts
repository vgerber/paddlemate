import { describe, expect, test } from "bun:test";
import { describeEvent, parseSse } from "./notifications";

describe("describeEvent", () => {
  test("names the base", () => {
    expect(
      describeEvent({
        kind: "candidate_accepted",
        actor_username: "vincent",
        summary: { name: "Haus Wildspitze" },
      }),
    ).toBe("vincent made Haus Wildspitze a base");
  });

  test("tells joining from being added", () => {
    expect(
      describeEvent({
        kind: "member_joined",
        actor_username: "eve",
        summary: {},
      }),
    ).toBe("eve joined the trip");
    expect(
      describeEvent({
        kind: "member_joined",
        actor_username: "mara",
        summary: { username: "tobi" },
      }),
    ).toBe("mara added tobi");
  });

  test("says when someone arrives", () => {
    expect(
      describeEvent({
        kind: "attendance_changed",
        actor_username: "tobi",
        summary: { arrival: "2026-09-22" },
      }),
    ).toBe("tobi arrives Tue, 22 Sept 2026");
  });

  test("a deleted account is someone", () => {
    expect(describeEvent({ kind: "member_left", summary: {} })).toBe(
      "Someone left the trip",
    );
  });
});

describe("parseSse", () => {
  test("reads named events and keeps the unfinished tail", () => {
    const { messages, rest } = parseSse(
      'event: connected\ndata: \n\n: keep-alive\n\nevent: trip_event\ndata: {"id":1}\n\nevent: tri',
    );
    expect(messages).toEqual([
      { event: "connected", data: "" },
      { event: "trip_event", data: '{"id":1}' },
    ]);
    expect(rest).toBe("event: tri");
  });

  test("joins multi-line data and accepts CRLF", () => {
    const { messages } = parseSse("data: a\r\ndata: b\r\n\r\n");
    expect(messages).toEqual([{ event: "message", data: "a\nb" }]);
  });
});
