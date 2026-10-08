/**
 * Tiny DOM builder. All dynamic text goes through text nodes — never innerHTML — because job
 * pages and server responses are untrusted.
 */
type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, string | number | boolean | null | undefined | EventListener>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Attrs | null, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k.startsWith("on") && typeof v === "function") {
        el.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (k === "class") {
        el.className = String(v);
      } else if (v === true) {
        el.setAttribute(k, "");
      } else if (typeof v !== "function") {
        el.setAttribute(k, String(v));
      }
    }
  }
  append(el, children);
  return el;
}

function append(el: Node, children: (Child | Child[])[]): void {
  for (const c of children) {
    if (Array.isArray(c)) append(el, c);
    else if (c === null || c === undefined || c === false) continue;
    else if (typeof c === "string" || typeof c === "number") el.appendChild(document.createTextNode(String(c)));
    else el.appendChild(c);
  }
}

/** Static inline SVG icons (constant markup, never data-derived). */
const SVG_NS = "http://www.w3.org/2000/svg";
export function icon(name: "mark" | "arrow" | "chevron" | "external"): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const path = (d: string, extra: Record<string, string> = {}) => {
    const p = document.createElementNS(SVG_NS, "path");
    p.setAttribute("d", d);
    for (const [k, v] of Object.entries(extra)) p.setAttribute(k, v);
    svg.appendChild(p);
  };
  if (name === "mark") {
    svg.setAttribute("viewBox", "0 0 32 32");
    svg.setAttribute("class", "mark");
    const r = document.createElementNS(SVG_NS, "rect");
    for (const [k, v] of Object.entries({ x: "1", y: "1", width: "30", height: "30", rx: "8", fill: "var(--mark-bg)" })) r.setAttribute(k, v);
    svg.appendChild(r);
    path("M7 23h6v-5h6v-5h5", { fill: "none", stroke: "var(--mark-fg)", "stroke-width": "2.6", "stroke-linecap": "round", "stroke-linejoin": "round" });
    const c = document.createElementNS(SVG_NS, "circle");
    for (const [k, v] of Object.entries({ cx: "25", cy: "9", r: "2.6", fill: "var(--mark-dot)" })) c.setAttribute(k, v);
    svg.appendChild(c);
    return svg;
  }
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("class", "ico");
  const stroke = { fill: "none", stroke: "currentColor", "stroke-width": "1.6", "stroke-linecap": "round", "stroke-linejoin": "round" };
  if (name === "arrow") path("M3 8h10M9 4l4 4-4 4", stroke);
  if (name === "chevron") path("M6 4l4 4-4 4", stroke);
  if (name === "external") path("M9 3h4v4M13 3L7 9M11 9.5V13H3V5h3.5", stroke);
  return svg;
}
