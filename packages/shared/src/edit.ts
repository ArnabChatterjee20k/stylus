import { opId, type EditOp, type Fingerprint, type OpOf, type PresetName, type Scope } from './ops';

const sameScope = (a?: Scope, b?: Scope) => (a?.media ?? '') === (b?.media ?? '') && (a?.state ?? '') === (b?.state ?? '');

/**
 * Set (or clear, with value '') one CSS property for a selector. Edits to the same selector+scope
 * merge into one style op so the change list stays readable.
 */
export function setStyle(
  ops: EditOp[],
  selector: string,
  prop: string,
  value: string,
  opts: { scope?: Scope; before?: string; fingerprint?: Fingerprint; by?: EditOp['by'] } = {},
): EditOp[] {
  const idx = ops.findIndex((op) => op.kind === 'style' && op.selector === selector && sameScope(op.scope, opts.scope));
  if (idx === -1) {
    if (value === '') return ops;
    const op: OpOf<'style'> = {
      id: opId(),
      by: opts.by ?? 'user',
      at: Date.now(),
      kind: 'style',
      selector,
      props: { [prop]: value },
      before: opts.before !== undefined ? { [prop]: opts.before } : undefined,
      scope: opts.scope,
      fingerprint: opts.fingerprint,
    };
    return [...ops, op];
  }
  const existing = ops[idx] as OpOf<'style'>;
  const props = { ...existing.props };
  if (value === '') delete props[prop];
  else props[prop] = value;
  const before = { ...existing.before };
  if (opts.before !== undefined && !(prop in before)) before[prop] = opts.before;
  const next = [...ops];
  if (Object.keys(props).length === 0) next.splice(idx, 1);
  else next[idx] = { ...existing, props, before, at: Date.now() };
  return next;
}

export function setStyles(ops: EditOp[], selector: string, props: Record<string, string>, opts: Parameters<typeof setStyle>[4] = {}) {
  return Object.entries(props).reduce((acc, [k, v]) => setStyle(acc, selector, k, v, opts), ops);
}

export function toggleHide(ops: EditOp[], selector: string, fingerprint?: Fingerprint, mode: 'display' | 'visibility' = 'display'): EditOp[] {
  const idx = ops.findIndex((op) => op.kind === 'hide' && op.selector === selector);
  if (idx !== -1) return ops.filter((_, i) => i !== idx);
  return [...ops, { id: opId(), by: 'user', at: Date.now(), kind: 'hide', selector, mode, fingerprint }];
}

export function setText(ops: EditOp[], selector: string, text: string, html: boolean, before?: string, fingerprint?: Fingerprint): EditOp[] {
  const idx = ops.findIndex((op) => op.kind === 'text' && op.selector === selector);
  if (idx !== -1) {
    const existing = ops[idx] as OpOf<'text'>;
    if (existing.before !== undefined && existing.before === text) return ops.filter((_, i) => i !== idx);
    const next = [...ops];
    next[idx] = { ...existing, text, html, at: Date.now() };
    return next;
  }
  if (before === text) return ops;
  return [...ops, { id: opId(), by: 'user', at: Date.now(), kind: 'text', selector, text, html, before, fingerprint }];
}

/** The site-wide raw CSS op (there is at most one user-authored one). */
export function setSiteCss(ops: EditOp[], css: string): EditOp[] {
  const idx = ops.findIndex((op) => op.kind === 'rawCss' && op.by === 'user' && !op.scope);
  if (idx === -1) return css.trim() ? [...ops, { id: opId(), by: 'user', at: Date.now(), kind: 'rawCss', css }] : ops;
  const next = [...ops];
  if (!css.trim()) next.splice(idx, 1);
  else next[idx] = { ...(ops[idx] as OpOf<'rawCss'>), css, at: Date.now() };
  return next;
}

export const siteCss = (ops: EditOp[]) =>
  (ops.find((op) => op.kind === 'rawCss' && op.by === 'user' && !op.scope) as OpOf<'rawCss'> | undefined)?.css ?? '';

export function togglePreset(ops: EditOp[], name: PresetName): EditOp[] {
  const idx = ops.findIndex((op) => op.kind === 'preset' && op.name === name);
  if (idx !== -1) return ops.filter((_, i) => i !== idx);
  return [...ops, { id: opId(), by: 'user', at: Date.now(), kind: 'preset', name }];
}

export const hasPreset = (ops: EditOp[], name: PresetName) => ops.some((op) => op.kind === 'preset' && op.name === name && !op.disabled);

export const updateOp = (ops: EditOp[], id: string, patch: Partial<EditOp>) =>
  ops.map((op) => (op.id === id ? ({ ...op, ...patch } as EditOp) : op));

export const removeOp = (ops: EditOp[], id: string) => ops.filter((op) => op.id !== id);

/** Style props currently set by ops on exactly this selector+scope. */
export function stylesFor(ops: EditOp[], selector: string, scope?: Scope): Record<string, string> {
  const op = ops.find((o) => o.kind === 'style' && o.selector === selector && sameScope(o.scope, scope)) as OpOf<'style'> | undefined;
  return op?.props ?? {};
}
