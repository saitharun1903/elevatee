/**
 * Server-Sent Events over fetch.
 *
 * EventSource cannot send an Authorization header, so the extension reads the stream with
 * fetch + ReadableStream and parses it with this incremental parser, which follows the
 * WHATWG event-stream interpretation rules (line endings CRLF / LF / CR, `:` comments,
 * multi-line `data:`, `id:` persistence, a single optional space after the colon).
 */

export interface SseEvent {
  /** Event type; "message" when the stream gave none. */
  event: string;
  data: string;
  /** Last event id seen on the stream at dispatch time ("" if none). */
  id: string;
}

export class SseParser {
  private buffer = "";
  private pendingCR = false;
  private dataLines: string[] = [];
  private hasData = false;
  private eventType = "";
  private lastId = "";
  /** Server-suggested reconnection delay, if any. */
  retryMs: number | null = null;

  constructor(private readonly onEvent: (e: SseEvent) => void) {}

  get lastEventId(): string {
    return this.lastId;
  }

  /** Feed a decoded text chunk. Chunks may split lines (and CRLF pairs) anywhere. */
  feed(chunk: string): void {
    let text = chunk;
    if (this.pendingCR) {
      this.pendingCR = false;
      if (text.startsWith("\n")) text = text.slice(1);
    }
    this.buffer += text;
    let start = 0;
    for (let i = 0; i < this.buffer.length; i++) {
      const ch = this.buffer.charCodeAt(i);
      if (ch !== 10 && ch !== 13) continue;
      const line = this.buffer.slice(start, i);
      if (ch === 13) {
        if (i + 1 < this.buffer.length) {
          if (this.buffer.charCodeAt(i + 1) === 10) i++;
        } else {
          // CR at the very end of the chunk: a following LF belongs to this line ending.
          this.pendingCR = true;
        }
      }
      start = i + 1;
      this.processLine(line);
    }
    this.buffer = this.buffer.slice(start);
  }

  /** End of stream: an incomplete trailing event is discarded, per spec. */
  end(): void {
    this.buffer = "";
    this.resetEvent();
  }

  private resetEvent(): void {
    this.dataLines = [];
    this.hasData = false;
    this.eventType = "";
  }

  private processLine(line: string): void {
    if (line === "") {
      if (this.hasData) {
        this.onEvent({ event: this.eventType || "message", data: this.dataLines.join("\n"), id: this.lastId });
      }
      this.resetEvent();
      return;
    }
    if (line.startsWith(":")) return; // comment / keep-alive
    const colon = line.indexOf(":");
    let field: string;
    let value: string;
    if (colon === -1) {
      field = line;
      value = "";
    } else {
      field = line.slice(0, colon);
      value = line.slice(colon + 1);
      if (value.startsWith(" ")) value = value.slice(1);
    }
    switch (field) {
      case "event":
        this.eventType = value;
        break;
      case "data":
        this.dataLines.push(value);
        this.hasData = true;
        break;
      case "id":
        if (!value.includes("\u0000")) this.lastId = value;
        break;
      case "retry":
        if (/^\d+$/.test(value)) this.retryMs = Number(value);
        break;
      default:
        break; // unknown fields are ignored
    }
  }
}

/**
 * Read an SSE response body to completion, dispatching parsed events.
 * Resolves when the stream ends. Rejects on read errors / abort.
 * `onActivity` is called on every received chunk (used for idle timeouts).
 */
export async function readSseStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (e: SseEvent) => void,
  onActivity?: () => void,
): Promise<{ lastEventId: string }> {
  const parser = new SseParser(onEvent);
  const reader = body.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      onActivity?.();
      parser.feed(decoder.decode(value, { stream: true }));
    }
    const tail = decoder.decode();
    if (tail) parser.feed(tail);
    parser.end();
    return { lastEventId: parser.lastEventId };
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* already released */
    }
  }
}
