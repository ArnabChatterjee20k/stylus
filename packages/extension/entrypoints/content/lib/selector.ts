import { finder } from '@medv/finder';
import type { Fingerprint } from '@stylus/shared';

/** Classes/ids that look generated (CSS modules, styled-components, hashes) make brittle selectors. */
const HASHY = /(^|[-_])[a-zA-Z0-9]*\d[a-zA-Z0-9]*\d[a-zA-Z0-9]*$|^(css|sc|jsx|svelte|emotion)-|^_|[A-Z0-9]{6,}/;
const isStable = (name: string) => !name.startsWith('__stylus') && !HASHY.test(name) && name.length < 40;

export function selectorFor(el: Element): string {
  if (el === document.documentElement) return 'html';
  if (el === document.body) return 'body';
  try {
    return finder(el, {
      root: document.body ?? document.documentElement,
      idName: isStable,
      className: isStable,
      attr: (name, value) => ['data-testid', 'data-test', 'data-id', 'aria-label', 'role', 'name'].includes(name) && value.length < 40,
      timeoutMs: 300,
      seedMinLength: 1,
      optimizedMinLength: 2,
    });
  } catch {
    return pathSelector(el);
  }
}

/** Fallback: plain nth-child path from body. */
function pathSelector(el: Element): string {
  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node !== document.body && node.parentElement) {
    const idx = Array.from(node.parentElement.children).indexOf(node) + 1;
    parts.unshift(`${node.localName}:nth-child(${idx})`);
    node = node.parentElement;
  }
  return ['body', ...parts].join(' > ');
}

/** A selector matching elements "like" this one (same tag + stable classes), for bulk edits. */
export function similarSelector(el: Element): string {
  const classes = stableClasses(el).slice(0, 3);
  if (classes.length) return `${el.localName}${classes.map((c) => `.${CSS.escape(c)}`).join('')}`;
  const parent = el.parentElement;
  if (!parent || parent === document.documentElement) return el.localName;
  return `${selectorFor(parent)} > ${el.localName}`;
}

export const stableClasses = (el: Element) => Array.from(el.classList).filter(isStable);

export const combinedSelector = (els: Element[]) => [...new Set(els.map(selectorFor))].join(', ');

export function fingerprint(el: Element): Fingerprint {
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
  return {
    tag: el.localName,
    id: el.id || undefined,
    classes: Array.from(el.classList).filter((c) => !c.startsWith('__stylus')),
    text: text || undefined,
    testId: el.getAttribute('data-testid') ?? undefined,
  };
}

/** Short Figma-layer-like name: `nav#top`, `button "Sign in"`, `div.card`. */
export function labelFor(el: Element): string {
  const tag = el.localName;
  if (el.id && isStable(el.id)) return `${tag}#${el.id}`;
  const cls = stableClasses(el)[0];
  const textish = /^(a|button|h[1-6]|label|li|p|span|summary|th|td|figcaption)$/.test(tag);
  if (textish && el.children.length === 0) {
    const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ');
    if (text) return `${tag} “${text.length > 24 ? `${text.slice(0, 24)}…` : text}”`;
  }
  return cls ? `${tag}.${cls}` : tag;
}
