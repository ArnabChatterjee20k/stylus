import { aiOpen, hovered, redo, select, selection, tool, uiHost, undo, togglePanel } from '../engine/store';
import { isPickable } from '../lib/dom';
import {
  finishTextEdit,
  hideElement,
  hideSelection,
  isEditingText,
  selectRelative,
  selectSimilar,
  startTextEdit,
} from './actions';

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

function onClick(e: MouseEvent) {
  if (fromUi(e) || inEditedText(e)) return;
  block(e);
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
  // Typing in our own inputs keeps native behavior; other focus inside the UI still gets shortcuts.
  if (fromUi(e) && targetOf(e)?.closest('input, textarea, select, [contenteditable]')) return;
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
    if (mod && e.key.toLowerCase() === 'k') {
      aiOpen.value = !aiOpen.value;
      return true;
    }
    if (mod && e.key.toLowerCase() === 'y') {
      redo();
      return true;
    }
    if (mod || e.altKey) return false;
    switch (e.key) {
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

const BLOCKED = ['pointerdown', 'mousedown', 'mouseup', 'pointerup', 'auxclick', 'contextmenu', 'submit', 'dragstart'] as const;

export function startPicker() {
  window.addEventListener('pointermove', onMove, true);
  window.addEventListener('click', onClick, true);
  window.addEventListener('dblclick', onDblClick, true);
  window.addEventListener('keydown', onKey, true);
  for (const type of BLOCKED) window.addEventListener(type, block, true);
  document.documentElement.classList.add('__stylus-editing');
}

export function stopPicker() {
  window.removeEventListener('pointermove', onMove, true);
  window.removeEventListener('click', onClick, true);
  window.removeEventListener('dblclick', onDblClick, true);
  window.removeEventListener('keydown', onKey, true);
  for (const type of BLOCKED) window.removeEventListener(type, block, true);
  document.documentElement.classList.remove('__stylus-editing');
  if (isEditingText()) finishTextEdit();
  hovered.value = null;
}
