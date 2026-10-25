import { EditOpSchema, opId, PRESETS, type EditOp } from './ops';

/**
 * JSON schema for the model's reply (structured outputs). Structured outputs need
 * `additionalProperties: false` everywhere and no free-form maps, so CSS declarations are a
 * list of {property, value} pairs and every field is always present (empty when unused).
 */
export const AI_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'edits'],
  properties: {
    summary: { type: 'string', description: 'One short sentence describing the change, shown to the user.' },
    edits: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'selector', 'declarations', 'text', 'css', 'preset'],
        properties: {
          kind: { type: 'string', enum: ['style', 'hide', 'text', 'rawCss', 'preset'] },
          selector: { type: 'string', description: 'CSS selector for style, hide and text edits; empty otherwise.' },
          declarations: {
            type: 'array',
            description: 'For style edits: CSS declarations to set.',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['property', 'value'],
              properties: { property: { type: 'string' }, value: { type: 'string' } },
            },
          },
          text: { type: 'string', description: 'For text edits: the new plain text.' },
          css: { type: 'string', description: 'For rawCss edits: a complete stylesheet snippet.' },
          preset: { type: 'string', enum: ['', ...PRESETS] },
        },
      },
    },
  },
} as const;

export type AiEdit = {
  kind: 'style' | 'hide' | 'text' | 'rawCss' | 'preset';
  selector: string;
  declarations: { property: string; value: string }[];
  text: string;
  css: string;
  preset: string;
};
export type AiReply = { summary: string; edits: AiEdit[] };

export const AI_SYSTEM_PROMPT = `You restyle live web pages for the user of Stylus, a browser extension that edits pages like a design tool.

You receive the user's request, a description of the page, and usually the element they selected (its selector, HTML and computed styles). Reply with the smallest set of edits that does what they asked.

Edits:
- style: set CSS declarations on a selector. Use real CSS property names and values. They apply with !important.
- hide: remove an element from view.
- text: replace an element's text.
- rawCss: a stylesheet snippet, for changes that need several selectors, pseudo-elements or media queries.
- preset: one of the page-wide themes (dark, dim, sepia, warm, grayscale, contrast, reading).

Rules:
- Target the selectors given in the context. Use other selectors only when they clearly exist on the page (tags such as body, h1, a, or ids and classes shown in the context).
- When the user selected an element, change that element unless they ask about something else.
- Keep text readable: aim for WCAG AA contrast between text and its background.
- Don't hide content the user is likely reading unless they ask.
- The summary is one plain sentence about what changed.`;

const isValidSelector = (selector: string, check?: (s: string) => boolean) => {
  if (!selector.trim()) return false;
  if (!check) return true;
  try {
    return check(selector);
  } catch {
    return false;
  }
};

/**
 * Turn the model's reply into ops. Drops edits that are empty, malformed, or (when `isSelector`
 * is given, e.g. a DOM-backed check) target selectors that don't parse.
 */
export function aiEditsToOps(reply: AiReply, isSelector?: (s: string) => boolean): EditOp[] {
  const at = Date.now();
  const ops: EditOp[] = [];
  for (const e of reply.edits ?? []) {
    let candidate: unknown;
    switch (e.kind) {
      case 'style': {
        const props = Object.fromEntries(
          (e.declarations ?? []).filter((d) => d.property.trim() && d.value.trim()).map((d) => [d.property.trim().toLowerCase(), d.value.trim()]),
        );
        if (!Object.keys(props).length || !isValidSelector(e.selector, isSelector)) continue;
        candidate = { kind: 'style', selector: e.selector, props };
        break;
      }
      case 'hide':
        if (!isValidSelector(e.selector, isSelector)) continue;
        candidate = { kind: 'hide', selector: e.selector, mode: 'display' };
        break;
      case 'text':
        if (!isValidSelector(e.selector, isSelector)) continue;
        candidate = { kind: 'text', selector: e.selector, text: e.text, html: false };
        break;
      case 'rawCss':
        if (!e.css.trim()) continue;
        candidate = { kind: 'rawCss', css: e.css };
        break;
      case 'preset':
        candidate = { kind: 'preset', name: e.preset };
        break;
      default:
        continue;
    }
    const parsed = EditOpSchema.safeParse({ ...(candidate as object), id: opId(), by: 'ai', at });
    if (parsed.success) ops.push(parsed.data);
  }
  return ops;
}
