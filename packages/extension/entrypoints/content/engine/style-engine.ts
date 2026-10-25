import { effect } from '@preact/signals';
import { compileCss, type OpOf } from '@stylus/shared';
import { rule } from './store';

const STYLE_ID = '__stylus-style';
let styleEl: HTMLStyleElement | null = null;

/** Original innerHTML of every element a text op has changed, so disabling/undoing restores it. */
const originals = new Map<Element, string>();

export const rememberOriginal = (el: Element) => {
  if (!originals.has(el)) originals.set(el, el.innerHTML);
};

function ensureStyle(): HTMLStyleElement {
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
  }
  // A direct child of <html> after <head>/<body> comes after the page's own sheets in source order.
  const root = document.documentElement;
  if (styleEl.parentNode !== root) root.appendChild(styleEl);
  return styleEl;
}

function textOps(): OpOf<'text'>[] {
  if (!rule.value.enabled) return [];
  return rule.value.ops.filter((op): op is OpOf<'text'> => op.kind === 'text' && !op.disabled);
}

function moveOps(): OpOf<'move'>[] {
  if (!rule.value.enabled) return [];
  return rule.value.ops.filter((op): op is OpOf<'move'> => op.kind === 'move' && !op.disabled);
}

/** Where each moved element originally sat, so removing the move puts it back. */
const moveOriginals = new Map<Element, { parent: Element; next: Element | null }>();
/** Op id → element. After a move, a positional selector can match a different element, so remember the one we moved. */
const moveTargets = new Map<string, Element>();

function safeQuery(selector: string): Element | null {
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}

function applyMoveOps() {
  const ops = moveOps();
  const moved = new Set<Element>();
  for (const op of ops) {
    let el = moveTargets.get(op.id);
    if (!el?.isConnected) el = safeQuery(op.selector) ?? undefined;
    const parent = el?.parentElement;
    if (!el || !parent) continue;
    moveTargets.set(op.id, el);
    if (!moveOriginals.has(el)) moveOriginals.set(el, { parent, next: el.nextElementSibling });
    moved.add(el);
    const anchor = Array.from(parent.children).filter((c) => c !== el)[op.index] ?? null;
    if (el.nextElementSibling !== anchor) parent.insertBefore(el, anchor);
  }
  const ids = new Set(ops.map((op) => op.id));
  for (const id of moveTargets.keys()) if (!ids.has(id)) moveTargets.delete(id);
  for (const [el, { parent, next }] of moveOriginals) {
    if (moved.has(el)) continue;
    if (el.isConnected && parent.isConnected) parent.insertBefore(el, next?.parentElement === parent ? next : null);
    moveOriginals.delete(el);
  }
}

function applyDomOps() {
  applyTextOps();
  applyMoveOps();
}

function applyTextOps() {
  const targeted = new Set<Element>();
  for (const op of textOps()) {
    let els: NodeListOf<Element>;
    try {
      els = document.querySelectorAll(op.selector);
    } catch {
      continue;
    }
    for (const el of els) {
      if (el.hasAttribute('data-stylus-editing')) continue;
      targeted.add(el);
      rememberOriginal(el);
      try {
        if (op.html) {
          if (el.innerHTML !== op.text) el.innerHTML = op.text;
        } else if (el.textContent !== op.text) {
          el.textContent = op.text;
        }
      } catch {
        // Trusted Types or similar page policy; fall back to plain text.
        el.textContent = op.text.replace(/<[^>]+>/g, '');
      }
    }
  }
  for (const [el, html] of originals) {
    if (targeted.has(el) || el.hasAttribute('data-stylus-editing')) continue;
    if (el.isConnected && el.innerHTML !== html) {
      try {
        el.innerHTML = html;
      } catch {
        /* ignore */
      }
    }
    originals.delete(el);
  }
}

/** Keep the stylesheet and DOM edits applied as the page (or a SPA) re-renders. */
export function startEngine() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      ensureStyle();
      if (textOps().length || moveOps().length) applyDomOps();
    }, 120);
  });

  effect(() => {
    const r = rule.value;
    ensureStyle().textContent = r.enabled ? compileCss(r.ops) : '';
    const hasDomOps = textOps().length > 0 || moveOps().length > 0 || originals.size > 0 || moveOriginals.size > 0;
    if (document.body) applyDomOps();
    observer.disconnect();
    observer.observe(document.documentElement, { childList: true, subtree: hasDomOps });
  });

  if (!document.body) {
    document.addEventListener('DOMContentLoaded', () => applyDomOps(), { once: true });
  }
}
