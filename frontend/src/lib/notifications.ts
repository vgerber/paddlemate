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
