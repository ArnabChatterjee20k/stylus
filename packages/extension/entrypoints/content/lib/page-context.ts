import { describeOp, type EditOp } from '@stylus/shared';
import { pageFonts, pagePalette } from './dom';
import { labelFor, selectorFor } from './selector';

const STYLE_PROPS = [
  'display', 'position', 'width', 'height', 'max-width', 'margin', 'padding', 'gap',
  'flex-direction', 'justify-content', 'align-items', 'grid-template-columns',
  'color', 'background-color', 'background-image', 'font-family', 'font-size', 'font-weight',
  'line-height', 'letter-spacing', 'text-align', 'text-transform',
  'border', 'border-radius', 'box-shadow', 'opacity',
];
const LANDMARK = /^(header|nav|main|aside|footer|section|article|form|h1|h2|h3|dialog)$/;
const MAX_OUTLINE = 60;
const MAX_HTML = 3000;

/** The selection's HTML with scripts, styles and SVG internals stripped and long text shortened. */
function trimmedHtml(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll('script, style, noscript, template').forEach((n) => n.remove());
  clone.querySelectorAll('svg').forEach((svg) => (svg.innerHTML = ''));
  const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.textContent ?? '';
    if (t.length > 120) n.textContent = `${t.slice(0, 117)}…`;
  }
  const html = clone.outerHTML.replace(/\s{2,}/g, ' ');
  return html.length > MAX_HTML ? `${html.slice(0, MAX_HTML)}… (truncated)` : html;
}

/** A short outline of the page's main regions, with selectors the model can target. */
function outline(): string[] {
  const lines: string[] = [];
  const walk = (el: Element, depth: number) => {
    if (lines.length >= MAX_OUTLINE || depth > 5) return;
    for (const child of Array.from(el.children)) {
      if (lines.length >= MAX_OUTLINE) return;
      const r = child.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const notable = LANDMARK.test(child.localName) || child.id || child.getAttribute('role');
      if (notable) lines.push(`${'  '.repeat(depth)}${selectorFor(child)}  (${labelFor(child)}, ${Math.round(r.width)}×${Math.round(r.height)})`);
      walk(child, notable ? depth + 1 : depth);
    }
  };
  if (document.body) walk(document.body, 0);
  return lines;
}

export function buildContext(selection: { els: Element[]; selector: string } | null, ops: EditOp[]): string {
  const body = getComputedStyle(document.body);
  const parts = [
    `<page url="${location.href}" title="${document.title.replace(/"/g, "'")}" viewport="${innerWidth}×${innerHeight}">`,
    `Body: background ${body.backgroundColor}, text ${body.color}, font ${body.fontFamily.split(',')[0]}, size ${body.fontSize}`,
    `Most used colors: ${pagePalette(10).join(', ')}`,
    `Fonts: ${pageFonts().slice(0, 6).join(', ')}`,
    'Outline:',
    ...outline(),
    '</page>',
  ];
  const el = selection?.els.find((e) => e.isConnected);
  if (selection && el) {
    const cs = getComputedStyle(el);
    parts.push(
      `<selection selector="${selection.selector}" count="${selection.els.length}">`,
      'Computed styles of the first selected element:',
      ...STYLE_PROPS.map((p) => `  ${p}: ${cs.getPropertyValue(p)}`),
      'HTML:',
      trimmedHtml(el),
      '</selection>',
    );
  } else {
    parts.push('<selection>none: the request is about the whole page</selection>');
  }
  const active = ops.filter((op) => !op.disabled);
  if (active.length) parts.push('<existing_edits>', ...active.slice(-30).map((op) => `- ${describeOp(op)}`), '</existing_edits>');
  return parts.join('\n');
}
