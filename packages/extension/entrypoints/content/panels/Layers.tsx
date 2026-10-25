import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { toggleHide } from '@stylus/shared';
import { Icon } from '../canvas/icons';
import { commit, hovered, ops, select, selection } from '../engine/store';
import { isPickable } from '../lib/dom';
import { fingerprint, labelFor, selectorFor } from '../lib/selector';
import { Panel } from './Panel';

const SKIP = /^(script|style|link|meta|noscript|template|head|title|base|br|wbr)$/;
const MAX_CHILDREN = 300;

const keys = new WeakMap<Element, number>();
let nextKey = 0;
const keyOf = (el: Element) => {
  let k = keys.get(el);
  if (k === undefined) keys.set(el, (k = nextKey++));
  return k;
};

const matchesAny = (el: Element, selectors: string[]) =>
  selectors.some((s) => {
    try {
      return el.matches(s);
    } catch {
      return false;
    }
  });

const childrenOf = (el: Element) => Array.from(el.children).filter((c) => isPickable(c) && !SKIP.test(c.localName)).slice(0, MAX_CHILDREN);

/** Re-render when the page DOM changes (debounced), so the tree tracks SPAs. */
function useDomTick() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const mo = new MutationObserver(() => {
      clearTimeout(t);
      t = setTimeout(() => setTick((n) => n + 1), 400);
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      clearTimeout(t);
    };
  }, []);
  return tick;
}

export function Layers() {
  const [expanded, setExpanded] = useState<Set<Element>>(() => new Set([document.body]));
  const [query, setQuery] = useState('');
  useDomTick();
  const selected = selection.value?.els ?? [];
  const hiddenSelectors = ops.value.flatMap((op) => (op.kind === 'hide' && !op.disabled ? [op.selector] : []));

  // Reveal the selection in the tree.
  useEffect(() => {
    const el = selected[0];
    if (!el) return;
    const next = new Set(expanded);
    for (let p = el.parentElement; p; p = p.parentElement) next.add(p);
    setExpanded(next);
  }, [selected[0]]);

  const toggle = (el: Element) => {
    const next = new Set(expanded);
    if (next.has(el)) next.delete(el);
    else next.add(el);
    setExpanded(next);
  };

  const matches = useMemo(() => {
    const q = query.trim();
    if (!q) return null;
    try {
      const bySelector = Array.from(document.body.querySelectorAll(q)).filter(isPickable).slice(0, 150);
      if (bySelector.length) return bySelector;
    } catch {
      /* not a selector; search by name */
    }
    // Plain words like "sidebar" are valid (tag) selectors that match nothing, so fall back to names.
    const lower = q.toLowerCase();
    return Array.from(document.body.querySelectorAll('*'))
      .slice(0, 5000)
      .filter((el) => isPickable(el) && labelFor(el).toLowerCase().includes(lower))
      .slice(0, 150);
  }, [query]);

  const row = (el: Element, depth: number) => {
    const kids = matches ? [] : childrenOf(el);
    const open = expanded.has(el);
    const hidden = matchesAny(el, hiddenSelectors);
    return (
      <div key={keyOf(el)}>
        <LayerRow
          el={el}
          depth={depth}
          hasKids={kids.length > 0}
          open={open}
          hidden={hidden}
          selected={selected.includes(el)}
          onToggle={() => toggle(el)}
          onHide={() =>
            commit(
              hidden
                ? ops.value.filter((op) => !(op.kind === 'hide' && matchesAny(el, [op.selector])))
                : toggleHide(ops.value, selectorFor(el), fingerprint(el)),
            )
          }
        />
        {open && kids.map((k) => row(k, depth + 1))}
      </div>
    );
  };

  return (
    <Panel id="layers" title="Layers" width={260} initial={() => ({ x: 12, y: 64 })}>
      <div class="layers-search">
        <input placeholder="Search by name or CSS selector" value={query} onInput={(e) => setQuery(e.currentTarget.value)} />
      </div>
      <div class="layers" onPointerLeave={() => (hovered.value = null)}>
        {matches ? (matches.length ? matches.map((el) => row(el, 0)) : <div class="empty">No matches</div>) : row(document.body, 0)}
      </div>
    </Panel>
  );
}

function LayerRow(props: { el: Element; depth: number; hasKids: boolean; open: boolean; hidden: boolean; selected: boolean; onToggle: () => void; onHide: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (props.selected) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [props.selected]);
  return (
    <div
      ref={ref}
      class={`layer ${props.selected ? 'on' : ''} ${props.hidden ? 'hidden' : ''}`}
      style={{ paddingLeft: `${6 + props.depth * 12}px` }}
      onPointerEnter={() => (hovered.value = props.el)}
      onClick={(e) => {
        if (e.shiftKey && selection.value) select([...selection.value.els, props.el]);
        else select([props.el]);
        const r = props.el.getBoundingClientRect();
        if (r.bottom < 0 || r.top > innerHeight) props.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }}
    >
      <button
        class={`twisty ${props.hasKids ? '' : 'none'}`}
        onClick={(e) => {
          e.stopPropagation();
          props.onToggle();
        }}
      >
        {props.hasKids && <Icon name={props.open ? 'chevronDown' : 'chevronRight'} size={11} />}
      </button>
      <span class="layer-name">{labelFor(props.el)}</span>
      <button
        class="icon-btn eye"
        title={props.hidden ? 'Show' : 'Hide'}
        onClick={(e) => {
          e.stopPropagation();
          props.onHide();
        }}
      >
        <Icon name={props.hidden ? 'eyeOff' : 'eye'} size={12} />
      </button>
    </div>
  );
}
