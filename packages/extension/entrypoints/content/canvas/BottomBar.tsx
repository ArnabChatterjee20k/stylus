import { scope, select, selection } from '../engine/store';
import { isPickable } from '../lib/dom';
import { labelFor } from '../lib/selector';
import { hideSelection, isolateSelection, selectSimilar, startTextEdit } from './actions';

const BREAKPOINTS: [string, string][] = [
  ['', 'All sizes'],
  ['(max-width: 1024px)', '≤ 1024 tablet'],
  ['(max-width: 768px)', '≤ 768 mobile L'],
  ['(max-width: 480px)', '≤ 480 mobile'],
  ['(min-width: 1025px)', '> 1024 desktop'],
];

/** Breadcrumbs, quick actions for the selection, and the state/breakpoint scope for new edits. */
export function BottomBar() {
  const sel = selection.value;
  const el = sel?.els[0];
  const crumbs: Element[] = [];
  for (let n: Element | null = el ?? null; n && n !== document.documentElement; n = n.parentElement) crumbs.unshift(n);
  const shown = crumbs.slice(-6);

  return (
    <div class="bottombar">
      {sel && el ? (
        <>
          <div class="crumbs">
            {crumbs.length > shown.length && <span class="crumb dim">…</span>}
            {shown.map((c, i) => (
              <button key={i} class={`crumb ${c === el ? 'on' : ''}`} onClick={() => isPickable(c) && select([c])}>
                {labelFor(c)}
              </button>
            ))}
            {sel.els.length > 1 && <span class="pill">{sel.els.length} selected</span>}
          </div>
          <div class="bb-actions">
            <button title="Select all similar elements (S)" onClick={selectSimilar}>Similar</button>
            <button title="Hide everything except this" onClick={isolateSelection}>Isolate</button>
            <button title="Edit text (double-click)" onClick={() => startTextEdit(el)}>Edit text</button>
            <button title="Hide (Delete)" class="danger" onClick={hideSelection}>Hide</button>
          </div>
        </>
      ) : (
        <div class="crumbs dim">Hover to inspect · click to select · Shift-click to multi-select · double-click to edit text · Esc for parent</div>
      )}
      <div class="bb-scope" title="New style edits apply only in this state / screen size">
        <select value={scope.value.state ?? ''} onChange={(e) => (scope.value = { ...scope.value, state: (e.currentTarget.value || undefined) as typeof scope.value.state })}>
          <option value="">Default state</option>
          <option value="hover">:hover</option>
          <option value="focus">:focus</option>
          <option value="active">:active</option>
        </select>
        <select value={scope.value.media ?? ''} onChange={(e) => (scope.value = { ...scope.value, media: e.currentTarget.value || undefined })}>
          {BREAKPOINTS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
