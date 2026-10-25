import { signal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { selection, tool } from '../engine/store';
import { px } from '../lib/dom';
import { editStyle, editStyles, isEditingText } from './actions';

type Side = 'top' | 'right' | 'bottom' | 'left';
type Kind = 'e' | 's' | 'se' | 'radius' | `pad-${Side}` | `mar-${Side}`;

const SIDES: Side[] = ['top', 'right', 'bottom', 'left'];
const KINDS: Kind[] = ['e', 's', 'se', 'radius', ...SIDES.map((s) => `pad-${s}` as Kind), ...SIDES.map((s) => `mar-${s}` as Kind)];
/** Below this size only the resize handles show, so small elements stay clickable. */
const MIN_FOR_SPACING = 56;

/** Live value shown next to the pointer while dragging a handle. */
export const dragLabel = signal<{ text: string; x: number; y: number } | null>(null);

const TITLES: Record<string, string> = {
  e: 'Drag to change width',
  s: 'Drag to change height',
  se: 'Drag to change width and height',
  radius: 'Drag to change corner radius',
};
const title = (k: Kind) => TITLES[k] ?? `Drag to change ${k.startsWith('pad') ? 'padding' : 'margin'}-${k.split('-')[1]} (Alt: all sides)`;

/** Where each handle sits for an element's box. */
function layout(el: Element) {
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const [bt, br, bb, bl] = [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth].map(px);
  const [pt, pr, pb, pl] = [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].map(px);
  const [mt, mr, mb, ml] = [cs.marginTop, cs.marginRight, cs.marginBottom, cs.marginLeft].map((v) => Math.max(0, px(v)));
  const big = r.width >= MIN_FOR_SPACING && r.height >= MIN_FOR_SPACING;
  const x1 = r.left + r.width * 0.3;
  const x2 = r.left + r.width * 0.7;
  const y1 = r.top + r.height * 0.3;
  const y2 = r.top + r.height * 0.7;
  const radius = Math.min(px(cs.borderTopLeftRadius), Math.min(r.width, r.height) / 2);
  const off = Math.min(Math.max(10, radius * 0.3 + 10), Math.min(r.width, r.height) / 2);
  const at = (x: number, y: number, show = true) => ({ x, y, show });
  return {
    e: at(r.right, r.top + r.height / 2),
    s: at(r.left + r.width / 2, r.bottom),
    se: at(r.right, r.bottom),
    radius: at(r.left + off, r.top + off, r.width >= 40 && r.height >= 40),
    'pad-top': at(x1, r.top + bt + Math.max(pt / 2, 5), big),
    'pad-bottom': at(x1, r.bottom - bb - Math.max(pb / 2, 5), big),
    'pad-left': at(r.left + bl + Math.max(pl / 2, 5), y1, big),
    'pad-right': at(r.right - br - Math.max(pr / 2, 5), y1, big),
    'mar-top': at(x2, r.top - Math.max(mt / 2, 6), big),
    'mar-bottom': at(x2, r.bottom + Math.max(mb / 2, 6), big),
    'mar-left': at(r.left - Math.max(ml / 2, 6), y2, big),
    'mar-right': at(r.right + Math.max(mr / 2, 6), y2, big),
  } satisfies Record<Kind, { x: number; y: number; show: boolean }>;
}

function startDrag(kind: Kind, e: PointerEvent) {
  const el = selection.value?.els[0];
  if (!el) return;
  e.preventDefault();
  e.stopPropagation();
  const handle = e.currentTarget as HTMLElement;
  handle.setPointerCapture(e.pointerId);
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const start = {
    w: px(cs.width),
    h: px(cs.height),
    radius: px(cs.borderTopLeftRadius),
    side: kind.includes('-') ? px(cs.getPropertyValue(`${kind.startsWith('pad') ? 'padding' : 'margin'}-${kind.split('-')[1]}`)) : 0,
  };
  const parent = el.parentElement ? getComputedStyle(el.parentElement) : null;
  const flexMain = parent?.display.includes('flex') ? (parent.flexDirection.startsWith('column') ? 'column' : 'row') : null;
  const x0 = e.clientX;
  const y0 = e.clientY;
  const round = (n: number, ev: PointerEvent) => (ev.shiftKey ? Math.round(n / 8) * 8 : Math.round(n));

  const move = (ev: PointerEvent) => {
    const dx = ev.clientX - x0;
    const dy = ev.clientY - y0;
    let text = '';
    if (kind === 'e' || kind === 's' || kind === 'se') {
      const props: Record<string, string> = {};
      if (kind !== 's') props.width = `${Math.max(0, round(start.w + dx, ev))}px`;
      if (kind !== 'e') props.height = `${Math.max(0, round(start.h + dy, ev))}px`;
      // A flex item sized by flex-grow/basis ignores width/height on the main axis: make it a fixed size, like Figma does.
      if (flexMain && ((flexMain === 'row' && props.width) || (flexMain === 'column' && props.height))) props.flex = '0 0 auto';
      editStyles(props, `handle-${kind}`);
      text = [props.width && `W ${px(props.width)}`, props.height && `H ${px(props.height)}`].filter(Boolean).join(' × ');
    }
    if (kind === 'radius') {
      const v = Math.max(0, Math.min(round(start.radius + Math.max(dx, dy), ev), Math.min(r.width, r.height) / 2));
      editStyle('border-radius', `${v}px`);
      text = `Radius ${v}`;
    }
    if (kind.startsWith('pad-') || kind.startsWith('mar-')) {
      const [group, side] = kind.split('-') as ['pad' | 'mar', Side];
      const prop = group === 'pad' ? 'padding' : 'margin';
      // Moving a handle away from the element's content makes the space bigger.
      const inward = { top: dy, bottom: -dy, left: dx, right: -dx }[side];
      const delta = group === 'pad' ? inward : -inward;
      const v = round(start.side + delta, ev);
      const value = `${group === 'pad' ? Math.max(0, v) : v}px`;
      if (ev.altKey) editStyle(prop, value);
      else editStyle(`${prop}-${side}`, value);
      text = `${ev.altKey ? prop : `${prop}-${side}`} ${value.replace('px', '')}`;
    }
    dragLabel.value = { text, x: ev.clientX + 12, y: ev.clientY + 14 };
  };
  const up = () => {
    handle.removeEventListener('pointermove', move);
    handle.removeEventListener('pointerup', up);
    handle.removeEventListener('pointercancel', up);
    dragLabel.value = null;
  };
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', up);
  handle.addEventListener('pointercancel', up);
}

/** Figma-style handles on a single selected element. Positioned every frame, like the overlay. */
export function Handles() {
  const refs = useRef<Partial<Record<Kind, HTMLDivElement | null>>>({});
  const labelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const els = selection.value?.els ?? [];
      const el = els.length === 1 && els[0].isConnected && tool.value === 'select' && !isEditingText() ? els[0] : null;
      const pos = el ? layout(el) : null;
      for (const k of KINDS) {
        const node = refs.current[k];
        if (!node) continue;
        const p = pos?.[k];
        node.style.display = p?.show ? 'block' : 'none';
        if (p?.show) node.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
      }
      const label = labelRef.current!;
      const l = dragLabel.value;
      label.style.display = l ? 'block' : 'none';
      if (l) {
        label.textContent = l.text;
        label.style.transform = `translate(${l.x}px, ${l.y}px)`;
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div class="handles">
      {KINDS.map((k) => (
        <div key={k} ref={(n) => { refs.current[k] = n; }} class={`handle h-${k}`} data-handle={k} title={title(k)} onPointerDown={(e) => startDrag(k, e)} />
      ))}
      <div ref={labelRef} class="drag-label" />
    </div>
  );
}
