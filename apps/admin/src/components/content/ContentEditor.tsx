"use client";

import { useState } from "react";
import { contentWarnings, PLACEHOLDERS } from "@zentro/commerce/content";
import { RichText } from "./RichText";

type Values = Parameters<typeof contentWarnings>[1];

/** Body editor with a live preview and warnings, rendered by the storefront's parser. */
export function ContentEditor({ initial, values }: { initial: string; values: Values }) {
  const [body, setBody] = useState(initial);
  const warnings = contentWarnings(body, values);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        <label htmlFor="content-body" className="block text-sm font-medium">Content</label>
        <textarea id="content-body" name="body" aria-describedby="content-help" value={body} onChange={(e) => setBody(e.target.value)} rows={22} maxLength={60000} className="input mt-1.5 h-auto py-2 font-mono text-sm leading-relaxed" />
        <p id="content-help" className="mt-1 text-xs text-ink-muted">
          <code>## Heading</code>, <code>### Sub-heading</code>, <code>- bullet</code>, <code>1. step</code>, <code>**bold**</code>, <code>[link](/help)</code>. Blank line = new paragraph.
          Placeholders: {PLACEHOLDERS.map((p) => `{${p}}`).join(" ")}
        </p>
      </div>
      <div>
        <p className="text-sm font-medium">Preview</p>
        <section aria-label="Preview" className="mt-1.5 max-h-[34rem] overflow-y-auto rounded-xl bg-white p-4 ring-1 ring-line"><RichText body={body} values={values} /></section>
        {warnings.length > 0 && <ul aria-label="Content warnings" className="mt-2 list-disc space-y-1 pl-5 text-xs text-warn-700">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
      </div>
    </div>
  );
}
