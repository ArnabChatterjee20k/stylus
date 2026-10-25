import { batch, computed, signal } from '@preact/signals';
import { browser } from 'wxt/browser';
import { History, emptyRule, parseRule, type EditOp, type Scope, type SiteRule } from '@stylus/shared';
import { combinedSelector } from '../lib/selector';

const origin = location.origin;
const KEY = `site:${origin}`;

export type Tool = 'select' | 'zap' | 'text';
export type Selection = { els: Element[]; selector: string; similar?: boolean };
export type PanelId = 'layers' | 'design' | 'changes' | 'theme';

export const rule = signal<SiteRule>(emptyRule(origin));
export const ops = computed(() => rule.value.ops);
export const editMode = signal(false);
export const tool = signal<Tool>('select');
export const hovered = signal<Element | null>(null);
export const selection = signal<Selection | null>(null);
/** Selector to outline from elsewhere in the UI (hovering a change or a layer). */
export const preview = signal<string | null>(null);
export const scope = signal<Scope>({});
export const panels = signal<Record<PanelId, boolean>>({ layers: true, design: true, changes: false, theme: false });
export const canUndo = signal(false);
export const canRedo = signal(false);
/** The shadow host of our UI, so pickers can ignore it. */
export const uiHost = signal<HTMLElement | null>(null);

const history = new History<EditOp[]>([]);
/** Our own writes still waiting for their storage.onChanged echo; those echoes must not be mistaken for external edits. */
const pendingWrites = new Set<string>();
let writeTimer: ReturnType<typeof setTimeout> | undefined;

/** JSON with sorted keys: chrome.storage hands objects back with their keys reordered. */
const stableJson = (value: unknown) =>
  JSON.stringify(value, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v,
  );

function syncFlags() {
  canUndo.value = history.canUndo;
  canRedo.value = history.canRedo;
}

function persist() {
  clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    pendingWrites.add(stableJson(rule.value));
    browser.storage.local.set({ [KEY]: rule.value }).catch(() => {});
  }, 150);
}

export async function loadRule() {
  const data = (await browser.storage.local.get(KEY))[KEY];
  if (data) {
    rule.value = parseRule(origin, data);
    history.reset(rule.value.ops);
  }
  browser.storage.onChanged.addListener((changes, area) => {
    const change = changes[KEY];
    if (area !== 'local' || !change) return;
    const json = stableJson(change.newValue);
    if (pendingWrites.delete(json) || json === stableJson(rule.value)) return;
    // Edited in another tab of the same site (or by an agent): adopt it.
    rule.value = change.newValue ? parseRule(origin, change.newValue) : emptyRule(origin);
    history.reset(rule.value.ops);
    syncFlags();
  });
}

/** Apply a new op list as one undo step (steps with the same `key` coalesce, e.g. while scrubbing). */
export function commit(next: EditOp[], key?: string) {
  if (next === rule.value.ops) return;
  history.commit(next, key);
  rule.value = { ...rule.value, ops: next, updatedAt: Date.now() };
  syncFlags();
  persist();
}

export function undo() {
  rule.value = { ...rule.value, ops: history.undo(), updatedAt: Date.now() };
  syncFlags();
  persist();
}

export function redo() {
  rule.value = { ...rule.value, ops: history.redo(), updatedAt: Date.now() };
  syncFlags();
  persist();
}

export function setSiteEnabled(enabled: boolean) {
  rule.value = { ...rule.value, enabled, updatedAt: Date.now() };
  persist();
}

export function select(els: Element[] | null, similar?: string) {
  batch(() => {
    if (!els?.length) selection.value = null;
    else selection.value = { els, selector: similar ?? combinedSelector(els), similar: !!similar };
  });
}

export function togglePanel(id: PanelId, open?: boolean) {
  panels.value = { ...panels.value, [id]: open ?? !panels.value[id] };
}
