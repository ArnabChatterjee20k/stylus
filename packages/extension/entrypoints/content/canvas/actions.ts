import { opId, setStyle, setText, stylesFor, toggleHide, type EditOp } from '@stylus/shared';
import { rememberOriginal } from '../engine/style-engine';
import { commit, ops, scope, select, selection } from '../engine/store';
import { isPickable, sanitizeHtml } from '../lib/dom';
import { fingerprint, selectorFor, similarSelector } from '../lib/selector';

const primary = () => selection.value?.els.find((el) => el.isConnected) ?? null;

/** Set one CSS property on the current selection (respecting the active state/breakpoint scope). */
export function editStyle(prop: string, value: string) {
  const sel = selection.value;
  const el = primary();
  if (!sel || !el) return;
  const before = getComputedStyle(el).getPropertyValue(prop);
  const s = scope.value.media || scope.value.state ? scope.value : undefined;
  commit(setStyle(ops.value, sel.selector, prop, value, { before, scope: s, fingerprint: fingerprint(el) }), `${sel.selector}|${prop}`);
}

/** Set several properties as one undo step (`key` coalesces repeated calls, e.g. during a drag). */
export function editStyles(props: Record<string, string>, key: string) {
  const sel = selection.value;
  const el = primary();
  if (!sel || !el) return;
  const cs = getComputedStyle(el);
  const s = scope.value.media || scope.value.state ? scope.value : undefined;
  let next = ops.value;
  for (const [prop, value] of Object.entries(props)) {
    next = setStyle(next, sel.selector, prop, value, { before: cs.getPropertyValue(prop), scope: s, fingerprint: fingerprint(el) });
  }
  commit(next, `${sel.selector}|${key}`);
}

/** Move the selection by (dx, dy) pixels with the CSS `translate` property, which doesn't disturb layout. */
export function nudge(dx: number, dy: number) {
  const sel = selection.value;
  const el = primary();
  if (!sel || !el) return;
  const s = scope.value.media || scope.value.state ? scope.value : undefined;
  const set = stylesFor(ops.value, sel.selector, s);
  const cs = getComputedStyle(el);
  if (cs.display === 'inline') {
    // `translate` doesn't apply to inline boxes; offset them with relative positioning instead.
    const left = Number.parseFloat(set.left ?? cs.left) || 0;
    const top = Number.parseFloat(set.top ?? cs.top) || 0;
    const props: Record<string, string> = { left: `${left + dx}px`, top: `${top + dy}px` };
    if (cs.position === 'static') props.position = 'relative';
    editStyles(props, 'nudge');
    return;
  }
  const current = set.translate ?? cs.translate;
  const [x = 0, y = 0] = current === 'none' ? [] : current.split(/\s+/).map((v) => Number.parseFloat(v) || 0);
  const next = x + dx === 0 && y + dy === 0 ? '' : `${x + dx}px ${y + dy}px`;
  editStyles({ translate: next }, 'nudge');
}

export function hideSelection() {
  const sel = selection.value;
  const el = primary();
  if (!sel || !el) return;
  const parent = el.parentElement;
  commit(toggleHide(ops.value, sel.selector, fingerprint(el)));
  select(isPickable(parent) && parent !== document.body ? [parent] : null);
}

export function hideElement(el: Element) {
  commit(toggleHide(ops.value, selectorFor(el), fingerprint(el)));
}

export function selectSimilar() {
  const el = primary();
  if (!el) return;
  const selector = similarSelector(el);
  const els = Array.from(document.querySelectorAll(selector));
  select(els.length ? els : [el], selector);
}

export function selectRelative(dir: 'parent' | 'child' | 'next' | 'prev') {
  const el = primary();
  if (!el) return;
  const next =
    dir === 'parent'
      ? el.parentElement
      : dir === 'child'
        ? el.firstElementChild
        : dir === 'next'
          ? el.nextElementSibling
          : el.previousElementSibling;
  if (isPickable(next) && next !== document.body) select([next]);
  else if (dir === 'parent') select(null);
}

/** Hide everything that isn't the selection or one of its ancestors ("show only this"). */
export function isolateSelection() {
  const keep = new Set<Element>();
  for (const el of selection.value?.els ?? []) {
    for (let n: Element | null = el; n; n = n.parentElement) keep.add(n);
  }
  if (!keep.size) return;
  let next = ops.value;
  for (const el of keep) {
    for (const sib of Array.from(el.parentElement?.children ?? [])) {
      if (keep.has(sib) || !isPickable(sib) || /^(script|style|link|meta|head)$/.test(sib.localName)) continue;
      next = toggleHide(next, selectorFor(sib), fingerprint(sib));
    }
  }
  commit(next);
}

/** One-click distraction removal: cookie/ad/newsletter widgets plus floating fixed/sticky overlays. */
export function focusMode() {
  const KNOWN = [
    '[id*="cookie" i]', '[class*="cookie" i]', '[id*="consent" i]', '[class*="consent" i]',
    '[class*="newsletter" i]', '[class*="subscribe" i][class*="modal" i]', '[class*="popup" i]',
    'ins.adsbygoogle', '[id^="google_ads"]', '[class*="ad-slot" i]', '[class*="advert" i]', '[aria-label*="advert" i]',
    'iframe[src*="doubleclick"]', 'iframe[src*="ads"]', '[class*="sponsored" i]', '[data-ad]', '[data-ad-slot]',
    'aside',
  ];
  const targets = new Set<Element>();
  for (const sel of KNOWN) {
    document.querySelectorAll(sel).forEach((el) => {
      if (el !== document.body && !el.closest('main, article') && !isLarge(el)) targets.add(el);
    });
  }
  for (const el of Array.from(document.body?.querySelectorAll('*') ?? []).slice(0, 4000)) {
    const pos = getComputedStyle(el).position;
    if ((pos === 'fixed' || pos === 'sticky') && isPickable(el) && !isLarge(el, 0.6)) targets.add(el);
  }
  // Drop targets nested inside other targets; hiding the outermost is enough.
  let next: EditOp[] = ops.value;
  for (const el of targets) {
    let nested = false;
    for (let p = el.parentElement; p; p = p.parentElement) if (targets.has(p)) nested = true;
    if (nested) continue;
    const selector = selectorFor(el);
    if (!next.some((op) => op.kind === 'hide' && op.selector === selector)) {
      next = [...next, { id: opId(), by: 'user', at: Date.now(), kind: 'hide', selector, mode: 'display', fingerprint: fingerprint(el) }];
    }
  }
  commit(next);
  return targets.size;
}

function isLarge(el: Element, fraction = 0.5) {
  const r = el.getBoundingClientRect();
  return r.width * r.height > innerWidth * innerHeight * fraction && r.height > innerHeight * 0.8;
}

let editing: { el: HTMLElement; before: string; html: boolean; prevEditable: string | null } | null = null;
export const isEditingText = () => !!editing;

export function startTextEdit(target: Element) {
  if (!(target instanceof HTMLElement) || editing) return;
  if (!target.textContent?.trim()) return;
  rememberOriginal(target);
  const html = target.children.length > 0;
  editing = { el: target, before: html ? target.innerHTML : target.textContent ?? '', html, prevEditable: target.getAttribute('contenteditable') };
  target.setAttribute('data-stylus-editing', '');
  target.contentEditable = html ? 'true' : 'plaintext-only';
  target.focus();
  const range = document.createRange();
  range.selectNodeContents(target);
  const sel = getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  target.addEventListener('blur', finishTextEdit, { once: true });
  select([target]);
}

export function finishTextEdit(cancel?: boolean | Event) {
  if (!editing) return;
  const { el, before, html, prevEditable } = editing;
  editing = null;
  el.removeEventListener('blur', finishTextEdit);
  el.removeAttribute('data-stylus-editing');
  if (prevEditable === null) el.removeAttribute('contenteditable');
  else el.setAttribute('contenteditable', prevEditable);
  getSelection()?.removeAllRanges();
  if (cancel === true) {
    if (html) el.innerHTML = before;
    else el.textContent = before;
    return;
  }
  const value = html ? sanitizeHtml(el.innerHTML) : (el.textContent ?? '');
  if (value === before) return;
  const selector = selectorFor(el);
  const existing = ops.value.find((op) => op.kind === 'text' && op.selector === selector);
  commit(setText(ops.value, selector, value, html, existing ? undefined : before, fingerprint(el)));
}
