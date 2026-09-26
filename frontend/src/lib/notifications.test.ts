import { describe, expect, test } from "bun:test";
import { parseSse } from "./notifications";

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
