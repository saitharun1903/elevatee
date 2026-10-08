import { describe, expect, it } from "vitest";
import { SseParser, readSseStream, type SseEvent } from "../src/lib/sse";
import { streamResponse } from "./helpers";

function parse(chunks: string[]): { events: SseEvent[]; parser: SseParser } {
  const events: SseEvent[] = [];
  const parser = new SseParser((e) => events.push(e));
  for (const c of chunks) parser.feed(c);
  return { events, parser };
}

describe("SseParser", () => {
  it("parses event, data and id fields", () => {
    const { events, parser } = parse(['id: 7\nevent: status\ndata: {"status":"EXTRACTING"}\n\n']);
    expect(events).toEqual([{ event: "status", data: '{"status":"EXTRACTING"}', id: "7" }]);
    expect(parser.lastEventId).toBe("7");
  });

  it("defaults the event type to message", () => {
    expect(parse(["data: hi\n\n"]).events).toEqual([{ event: "message", data: "hi", id: "" }]);
  });

  it("handles arbitrary chunk boundaries, including inside field names and CRLF pairs", () => {
    const stream = 'id: 1\r\nevent: analysis_event\r\ndata: {"a":1}\r\n\r\nid: 2\r\nevent: end\r\ndata: {"status":"COMPLETED"}\r\n\r\n';
    const whole = parse([stream]).events;
    for (let size = 1; size <= 7; size++) {
      const chunks: string[] = [];
      for (let i = 0; i < stream.length; i += size) chunks.push(stream.slice(i, i + size));
      expect(parse(chunks).events).toEqual(whole);
    }
    expect(whole.map((e) => e.event)).toEqual(["analysis_event", "end"]);
    expect(whole[1]!.id).toBe("2");
  });

  it("treats a CR at the end of a chunk followed by LF as one line ending", () => {
    const { events } = parse(["data: a\r", "\ndata: b\r", "\n\r", "\n"]);
    expect(events).toEqual([{ event: "message", data: "a\nb", id: "" }]);
  });

  it("supports bare CR line endings", () => {
    expect(parse(["event: x\rdata: 1\r\r"]).events).toEqual([{ event: "x", data: "1", id: "" }]);
  });

  it("joins multi-line data with newlines and strips only one leading space", () => {
    const { events } = parse(["data: line one\ndata: line two\ndata:\ndata:  indented\n\n"]);
    expect(events[0]!.data).toBe("line one\nline two\n\n indented");
  });

  it("ignores comments and unknown fields, and does not dispatch events without data", () => {
    const { events } = parse([": keep-alive\n\nfoo: bar\nevent: ready\n\n:comment\ndata: x\n\n"]);
    expect(events).toEqual([{ event: "message", data: "x", id: "" }]);
  });

  it("keeps the last id across events and ignores ids containing NUL", () => {
    const { events } = parse(["id: 5\ndata: a\n\ndata: b\n\nid: bad\u0000\ndata: c\n\n"]);
    expect(events.map((e) => e.id)).toEqual(["5", "5", "5"]);
  });

  it("parses retry and a field with no colon", () => {
    const { events, parser } = parse(["retry: 3000\ndata\n\n"]);
    expect(parser.retryMs).toBe(3000);
    expect(events).toEqual([{ event: "message", data: "", id: "" }]);
  });

  it("discards an unterminated trailing event at end of stream", async () => {
    const events: SseEvent[] = [];
    const res = streamResponse(["event: status\ndata: 1\n\n", "event: status\ndata: 2"]);
    const { lastEventId } = await readSseStream(res.body!, (e) => events.push(e));
    expect(events.map((e) => e.data)).toEqual(["1"]);
    expect(lastEventId).toBe("");
  });

  it("decodes multi-byte UTF-8 split across chunks", async () => {
    const bytes = new TextEncoder().encode("data: café — ok\n\n");
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        for (const b of bytes) c.enqueue(new Uint8Array([b]));
        c.close();
      },
    });
    const events: SseEvent[] = [];
    await readSseStream(body, (e) => events.push(e));
    expect(events[0]!.data).toBe("café — ok");
  });
});
