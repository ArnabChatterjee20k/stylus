import { signal } from '@preact/signals';
import { setMove } from '@stylus/shared';
import { movedSelector } from '../engine/style-engine';
import { commit, ops, selection, tool } from '../engine/store';
import { isPickable } from '../lib/dom';
import { fingerprint, selectorFor } from '../lib/selector';

/** Insertion line shown while dragging an element to a new position among its siblings. */
export const dropLine = signal<{ x: number; y: number; w: number; h: number } | null>(null);

const THRESHOLD = 5;

let drag: { el: Element; x0: number; y0: number; started: boolean; anchor: Element | null } | null = null;
let swallowClick = false;

/** Siblings laid out left-to-right (flex row, inline items) are reordered horizontally, others vertically. */
function horizontal(parent: Element) {
  const cs = getComputedStyle(parent);
  if (cs.display.includes('flex')) return !cs.flexDirection.startsWith('column');
  if (cs.display.includes('grid')) return cs.gridAutoFlow.startsWith('column') || cs.gridTemplateColumns.split(' ').length > 1;
  return false;
}

const visible = (el: Element) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 || r.height > 0;
};

export function reorderDown(e: PointerEvent, target: Element) {
  const sel = selection.value;
  if (tool.value !== 'select' || e.button !== 0 || e.shiftKey || sel?.els.length !== 1) return;
  const el = sel.els[0];
  if (!el.contains(target) || !el.parentElement || el === document.body) return;
  drag = { el, x0: e.clientX, y0: e.clientY, started: false, anchor: el.nextElementSibling };
}

/** Returns true while a reorder drag is in progress (so hover tracking pauses). */
export function reorderMove(e: PointerEvent) {
  if (!drag) return false;
  if (!drag.started) {
    if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < THRESHOLD) return false;
    drag.started = true;
  }
  const parent = drag.el.parentElement!;
  const sibs = Array.from(parent.children).filter((c) => c !== drag!.el && isPickable(c) && visible(c));
  const across = horizontal(parent);
  const pos = across ? e.clientX : e.clientY;
  const anchor = sibs.find((c) => {
    const r = c.getBoundingClientRect();
    return pos < (across ? r.left + r.width / 2 : r.top + r.height / 2);
  }) ?? null;
  drag.anchor = anchor;

  const pr = parent.getBoundingClientRect();
  const ref = anchor ?? sibs.at(-1);
  if (!ref) {
    dropLine.value = null;
    return true;
  }
  const r = ref.getBoundingClientRect();
  const edge = anchor ? (across ? r.left : r.top) - 3 : (across ? r.right : r.bottom) + 1;
  dropLine.value = across ? { x: edge, y: r.top, w: 2, h: r.height } : { x: pr.left, y: edge, w: pr.width, h: 2 };
  return true;
}

export function reorderUp() {
  const d = drag;
  drag = null;
  dropLine.value = null;
  if (!d?.started) return false;
  // Chrome only fires a click after this pointerup when the pressed element didn't move in the DOM.
  // Swallow that click if it comes, but never a later, real one.
  swallowClick = true;
  setTimeout(() => (swallowClick = false), 0);
  const parent = d.el.parentElement;
  if (!parent || d.anchor === d.el.nextElementSibling) return true;
  const others = Array.from(parent.children).filter((c) => c !== d.el);
  const index = d.anchor ? others.indexOf(d.anchor) : others.length;
  const selector = movedSelector(d.el) ?? selectorFor(d.el);
  commit(setMove(ops.value, selector, index, fingerprint(d.el)));
  return true;
}

/** The click that ends a drag shouldn't change the selection. */
export function consumeDragClick() {
  const was = swallowClick;
  swallowClick = false;
  return was;
}

export function cancelReorder() {
  drag = null;
  dropLine.value = null;
}
