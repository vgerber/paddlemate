import type { TripEvent } from "@/lib/api";
import { formatDate } from "@/lib/format";

/** One line for a change under the bell, as the trip's other members read
 * it. Mirrors the server's push text, which has to read without the app. */
export function describeEvent(
  e: Pick<TripEvent, "kind" | "summary" | "actor_username">,
): string {
  const actor = e.actor_username ?? "Someone";
  const name = e.summary.name ?? "a base";
  const who = e.summary.username ?? "someone";
  switch (e.kind) {
    case "trip_changed":
      return `${actor} changed the trip`;
    case "member_joined":
      return e.summary.username
        ? `${actor} added ${who}`
        : `${actor} joined the trip`;
    case "member_left":
      return `${actor} left the trip`;
    case "member_removed":
      return `${actor} removed ${who}`;
    case "attendance_changed":
      if (e.summary.arrival)
        return `${actor} arrives ${formatDate(e.summary.arrival, { weekday: true })}`;
      if (e.summary.departure)
        return `${actor} leaves ${formatDate(e.summary.departure, { weekday: true })}`;
      return `${actor} changed when they are coming`;
    case "stay_added":
      return `${actor} added ${name}`;
    case "stay_changed":
      return `${actor} changed ${name}`;
    case "stay_removed":
      return `${actor} removed ${name}`;
    case "watch_list_changed":
      return `${actor} changed the runs watched from ${name}`;
    case "candidate_proposed":
      return `${actor} proposed ${name}`;
    case "candidate_changed":
      return `${actor} edited ${name}`;
    case "candidate_voted":
      return `${actor} voted on ${name}`;
    case "candidate_accepted":
      return `${actor} made ${name} a base`;
    case "candidate_withdrawn":
      return `${actor} withdrew ${name}`;
    case "log_linked":
      return `${actor} logged ${e.summary.name ?? "a run"}`;
  }
}

export interface SseMessage {
  event: string;
  data: string;
}

/** Splits a server-sent-events buffer into complete messages, returning
 * them and the unfinished tail to prepend to the next chunk. Comments (the
 * keep-alives) are dropped. */
export function parseSse(buffer: string): {
  messages: SseMessage[];
  rest: string;
} {
  const blocks = buffer.replace(/\r\n/g, "\n").split("\n\n");
  const rest = blocks.pop() ?? "";
  const messages: SseMessage[] = [];
  for (const block of blocks) {
    let event = "message";
    const data: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith(":")) continue;
      const colon = line.indexOf(":");
      const field = colon === -1 ? line : line.slice(0, colon);
      const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
      if (field === "event") event = value;
      else if (field === "data") data.push(value);
    }
    if (event !== "message" || data.length > 0) {
      messages.push({ event, data: data.join("\n") });
    }
  }
  return { messages, rest };
}
