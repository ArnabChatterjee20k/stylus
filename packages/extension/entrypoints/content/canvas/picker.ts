import { hovered, measuring, redo, select, selection, tool, uiHost, undo, togglePanel } from '../engine/store';
import { isPickable } from '../lib/dom';
import {
  finishTextEdit,
  hideElement,
  hideSelection,
  isEditingText,
  nudge,
  selectRelative,
  selectSimilar,
  startTextEdit,
} from './actions';
import { cancelReorder, consumeDragClick, reorderDown, reorderMove, reorderUp } from './reorder';

const TEXT_ENTRY = 'input:not([type=checkbox], [type=radio], [type=color], [type=range], [type=button]), textarea, select, [contenteditable]';

const fromUi = (e: Event) => !!uiHost.value && e.composedPath().includes(uiHost.value);

/** Deepest page element under the event, piercing open shadow roots of page components. */
function targetOf(e: Event): Element | null {
  const t = e.composedPath()[0];
  return t instanceof Element ? t : null;
}

const inEditedText = (e: Event) => {
  const t = targetOf(e);
  return isEditingText() && !!t?.closest('[data-stylus-editing]');
};

function onMove(e: PointerEvent) {
  measuring.value = e.altKey;
  if (reorderMove(e)) return;
  if (fromUi(e) || inEditedText(e)) {
    if (fromUi(e)) hovered.value = null;
    return;
  }
  const t = targetOf(e);
  hovered.value = isPickable(t) ? t : null;
}

/** Swallow page interactions (links, buttons, drag) while editing. */
function block(e: Event) {
  if (fromUi(e) || inEditedText(e)) return;
  e.preventDefault();
  e.stopImmediatePropagation();
}

function onDown(e: PointerEvent) {
  if (fromUi(e) || inEditedText(e)) return;
  block(e);
  // Blocking the page's mousedown also stops focus from leaving our panels; release it so shortcuts work.
  (uiHost.value?.shadowRoot?.activeElement as HTMLElement | null)?.blur();
  const t = targetOf(e);
  if (t && !isEditingText()) reorderDown(e, t);
}

function onUp(e: PointerEvent) {
  if (reorderUp()) {
    e.preventDefault();
    e.stopImmediatePropagation();
    return;
  }
  block(e);
}

function onClick(e: MouseEvent) {
  if (fromUi(e) || inEditedText(e)) return;
  block(e);
  if (consumeDragClick()) return;
  if (isEditingText()) finishTextEdit();
  const t = targetOf(e);
  if (!isPickable(t)) return;
  switch (tool.value) {
    case 'zap':
      hideElement(t);
      hovered.value = null;
      return;
    case 'text':
      startTextEdit(t);
      return;
    default:
      if (e.shiftKey && selection.value) {
        const els = selection.value.els.includes(t) ? selection.value.els.filter((x) => x !== t) : [...selection.value.els, t];
        select(els);
      } else {
        select([t]);
      }
  }
}

function onDblClick(e: MouseEvent) {
  if (fromUi(e) || inEditedText(e)) return;
  block(e);
  const t = targetOf(e);
  if (isPickable(t) && tool.value === 'select') startTextEdit(t);
}

function onKey(e: KeyboardEvent) {
  // Typing in our own text fields keeps native behavior; other focus inside the UI still gets shortcuts.
  if (fromUi(e) && targetOf(e)?.closest(TEXT_ENTRY)) return;
  if (isEditingText()) {
    if (e.key === 'Escape') finishTextEdit(true);
    else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      finishTextEdit();
    }
    return;
  }
  const mod = e.metaKey || e.ctrlKey;
  const handled = (() => {
    if (mod && e.key.toLowerCase() === 'z') {
      if (e.shiftKey) redo();
      else undo();
      return true;
    }
    if (mod && e.key.toLowerCase() === 'y') {
      redo();
      return true;
    }
    if (e.key === 'Alt') {
      measuring.value = true;
      return false;
    }
    if (mod || e.altKey) return false;
    const step = e.shiftKey ? 10 : 1;
    switch (e.key) {
      case 'ArrowUp':
        nudge(0, -step);
        return true;
      case 'ArrowDown':
        nudge(0, step);
        return true;
      case 'ArrowLeft':
        nudge(-step, 0);
        return true;
      case 'ArrowRight':
        nudge(step, 0);
        return true;
      case 'Escape':
        selectRelative('parent');
        return true;
      case 'Enter':
        selectRelative(e.shiftKey ? 'parent' : 'child');
        return true;
      case 'Tab':
        selectRelative(e.shiftKey ? 'prev' : 'next');
        return true;
      case 'Delete':
      case 'Backspace':
        hideSelection();
        return true;
      case 'v':
        tool.value = 'select';
        return true;
      case 'h':
        tool.value = 'zap';
        return true;
      case 't':
        tool.value = 'text';
        return true;
      case 's':
        selectSimilar();
        return true;
      case 'l':
        togglePanel('layers');
        return true;
      case 'd':
        togglePanel('design');
        return true;
      default:
        return false;
    }
  })();
  if (handled) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }
}

function onKeyUp(e: KeyboardEvent) {
  if (e.key === 'Alt') measuring.value = false;
}

const onBlur = () => {
  measuring.value = false;
  cancelReorder();
};

const BLOCKED = ['mousedown', 'mouseup', 'auxclick', 'contextmenu', 'submit', 'dragstart'] as const;

export function startPicker() {
  window.addEventListener('pointermove', onMove, true);
  window.addEventListener('click', onClick, true);
  window.addEventListener('dblclick', onDblClick, true);
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKeyUp, true);
  window.addEventListener('pointerdown', onDown, true);
  window.addEventListener('pointerup', onUp, true);
  window.addEventListener('blur', onBlur);
  for (const type of BLOCKED) window.addEventListener(type, block, true);
  document.documentElement.classList.add('__stylus-editing');
}

export function stopPicker() {
  window.removeEventListener('pointermove', onMove, true);
  window.removeEventListener('click', onClick, true);
  window.removeEventListener('dblclick', onDblClick, true);
  window.removeEventListener('keydown', onKey, true);
  window.removeEventListener('keyup', onKeyUp, true);
  window.removeEventListener('pointerdown', onDown, true);
  window.removeEventListener('pointerup', onUp, true);
  window.removeEventListener('blur', onBlur);
  for (const type of BLOCKED) window.removeEventListener(type, block, true);
  onBlur();
  document.documentElement.classList.remove('__stylus-editing');
  if (isEditingText()) finishTextEdit();
  hovered.value = null;
}
