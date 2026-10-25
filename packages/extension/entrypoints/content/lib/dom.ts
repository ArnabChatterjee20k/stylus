/** Strip anything executable from HTML captured from an edited element before we store and re-apply it. */
export function sanitizeHtml(html: string): string {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  tpl.content.querySelectorAll('script, iframe, object, embed, link, meta, style, base').forEach((n) => n.remove());
  tpl.content.querySelectorAll('*').forEach((el) => {
    for (const { name, value } of Array.from(el.attributes)) {
      if (name.startsWith('on') || /^\s*javascript:/i.test(value) || name === 'contenteditable' || name.startsWith('data-stylus')) {
        el.removeAttribute(name);
      }
    }
  });
  return tpl.innerHTML;
}

export const px = (v: string) => Number.parseFloat(v) || 0;

/** rgb()/rgba() → #rrggbb (alpha dropped; <input type=color> can't show it). */
export function toHex(color: string): string {
  if (color.startsWith('#')) return color.length === 4 ? `#${[...color.slice(1)].map((c) => c + c).join('')}` : color.slice(0, 7);
  const m = color.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
  if (!m) return '#000000';
  return `#${m.slice(1, 4).map((n) => Math.round(Number(n)).toString(16).padStart(2, '0')).join('')}`;
}

export const isTransparent = (color: string) => color === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(color) || /\/\s*0\)$/.test(color);

/** Most used text/background/border colors on the page — the "document colors" swatches. */
export function pagePalette(limit = 14): string[] {
  const counts = new Map<string, number>();
  const els = document.body?.querySelectorAll('*') ?? [];
  const max = Math.min(els.length, 2500);
  for (let i = 0; i < max; i++) {
    const cs = getComputedStyle(els[i]);
    for (const c of [cs.color, cs.backgroundColor, cs.borderTopColor]) {
      if (!c || isTransparent(c)) continue;
      const hex = toHex(c);
      counts.set(hex, (counts.get(hex) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([c]) => c);
}

const SYSTEM_FONTS = [
  'system-ui', 'Inter', 'Helvetica Neue', 'Arial', 'Georgia', 'Times New Roman', 'Charter', 'Iowan Old Style',
  'Palatino', 'Verdana', 'Menlo', 'ui-monospace', 'ui-serif', 'ui-rounded',
];

export function pageFonts(): string[] {
  const fams = new Set<string>();
  document.fonts?.forEach((f) => fams.add(f.family.replace(/["']/g, '')));
  for (const el of [document.body, ...Array.from(document.querySelectorAll('h1, h2, p, a, button')).slice(0, 50)]) {
    if (!el) continue;
    const first = getComputedStyle(el).fontFamily.split(',')[0]?.trim().replace(/["']/g, '');
    if (first) fams.add(first);
  }
  return [...new Set([...fams, ...SYSTEM_FONTS])];
}

/** Elements we never let the user pick. */
export const isPickable = (el: Element | null): el is Element =>
  !!el && el.nodeType === 1 && el !== document.documentElement && !el.localName.startsWith('stylus-');
