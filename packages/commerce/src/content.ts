// A small, safe Markdown subset for content pages. Text is parsed into a
// tree and rendered by React — never injected as HTML — so page bodies
// can't carry scripts. Supported:
//   ## Heading   ### Sub-heading   - bullet   1. numbered
//   **bold**   [link text](/page | https://… | mailto:… | tel:…)
//   blank line = new paragraph
// Placeholders such as {business} are filled from configuration.

export type Inline = { t: "text"; v: string } | { t: "b"; v: string } | { t: "a"; v: string; href: string };
export type Block =
  | { type: "h2"; text: Inline[] } | { type: "h3"; text: Inline[] } | { type: "p"; text: Inline[] }
  | { type: "ul"; items: Inline[][] } | { type: "ol"; items: Inline[][] };

export const PLACEHOLDERS = ["business", "email", "phone", "returnDays", "address", "gstin"] as const;
export type Placeholder = (typeof PLACEHOLDERS)[number];

const SAFE_HREF = /^(\/(?!\/)[^\s]*|https:\/\/[^\s]+|mailto:[^\s]+|tel:\+?[0-9 ()-]+)$/;

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0, m: RegExpExecArray | null;
  const push = (n: Inline) => {
    const prev = out[out.length - 1];
    if (n.t === "text" && prev?.t === "text") prev.v += n.v; else if (n.t !== "text" || n.v) out.push(n);
  };
  while ((m = re.exec(src))) {
    push({ t: "text", v: src.slice(last, m.index) });
    if (m[1] !== undefined) push({ t: "b", v: m[1] });
    else if (SAFE_HREF.test(m[3]!)) push({ t: "a", v: m[2]!, href: m[3]! });
    else push({ t: "text", v: m[2]! }); // unsafe link → plain text
    last = re.lastIndex;
  }
  push({ t: "text", v: src.slice(last) });
  return out;
}

export function parseContent(body: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: { type: "ul" | "ol"; items: string[] } | null = null;
  const flush = () => {
    if (para.length) blocks.push({ type: "p", text: parseInline(para.join(" ")) });
    if (list) blocks.push({ type: list.type, items: list.items.map(parseInline) } as Block);
    para = []; list = null;
  };
  for (const raw of body.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^(#{2,3})\s+(.+)$/))) { flush(); blocks.push({ type: m[1]!.length === 2 ? "h2" : "h3", text: parseInline(m[2]!) } as Block); continue; }
    if ((m = line.match(/^[-*]\s+(.+)$/)) || (m = line.match(/^\d+[.)]\s+(.+)$/))) {
      const type = /^\d/.test(line) ? "ol" : "ul";
      if (para.length || (list && list.type !== type)) flush();
      list ??= { type, items: [] };
      list.items.push(m[1]!);
      continue;
    }
    if (list) flush();
    para.push(line);
  }
  flush();
  return blocks;
}

/** Fills {placeholders}; unknown or unset ones are left visible so they get noticed. */
export function fillPlaceholders(text: string, values: Partial<Record<Placeholder, string | null | undefined>>): string {
  return text.replace(/\{([a-zA-Z]+)\}/g, (all, k: string) => {
    const v = values[k as Placeholder];
    return v ? v : all;
  });
}

/** Problems worth showing an editor before publishing. */
export function contentWarnings(body: string, values: Partial<Record<Placeholder, string | null | undefined>>): string[] {
  const w: string[] = [];
  for (const [, k] of body.matchAll(/\{([a-zA-Z]+)\}/g)) {
    if (!(PLACEHOLDERS as readonly string[]).includes(k!)) w.push(`Unknown placeholder {${k}} — it will appear as typed.`);
    else if (!values[k as Placeholder]) w.push(`{${k}} isn’t configured yet, so it will appear as typed.`);
  }
  for (const [, , href] of body.matchAll(/\[([^\]]+)\]\(([^)\s]+)\)/g)) if (!SAFE_HREF.test(href!)) w.push(`Link “${href}” isn’t allowed and will show as plain text. Use /page, https://, mailto: or tel:.`);
  if (/<[a-z!/]/i.test(body)) w.push("HTML tags aren’t supported and will show as text.");
  return [...new Set(w)];
}
