import { useEffect, useRef } from 'preact/hooks';
import { hovered, measuring, selection } from '../engine/store';
import { px } from '../lib/dom';
import { dropLine } from './reorder';

type Box = { left: number; top: number; right: number; bottom: number; width: number; height: number };
type Line = { x1: number; y1: number; x2: number; y2: number };

function pool(container: HTMLElement, n: number, className: string) {
  while (container.childElementCount < n) {
    const d = document.createElement('div');
    d.className = className;
    container.appendChild(d);
  }
  while (container.childElementCount > n) container.lastElementChild!.remove();
  return Array.from(container.children) as HTMLElement[];
}

const place = (n: HTMLElement, x: number, y: number, w: number, h: number) => {
  n.style.transform = `translate(${x}px, ${y}px)`;
  n.style.width = `${Math.max(0, w)}px`;
  n.style.height = `${Math.max(0, h)}px`;
};

const contains = (o: Box, i: Box) => o.left <= i.left && o.right >= i.right && o.top <= i.top && o.bottom >= i.bottom;
const mid = (a: number, b: number, c: number, d: number) => (Math.max(a, c) + Math.min(b, d)) / 2;

/** Figma-style redlines between the selection `a` and the hovered element `b`. */
export function measureLines(a: Box, b: Box): Line[] {
  if (contains(b, a) || contains(a, b)) {
    const [inner, outer] = contains(b, a) ? [a, b] : [b, a];
    const cx = inner.left + inner.width / 2;
    const cy = inner.top + inner.height / 2;
    return [
      { x1: cx, y1: outer.top, x2: cx, y2: inner.top },
      { x1: cx, y1: inner.bottom, x2: cx, y2: outer.bottom },
      { x1: outer.left, y1: cy, x2: inner.left, y2: cy },
      { x1: inner.right, y1: cy, x2: outer.right, y2: cy },
    ].filter((l) => l.x2 - l.x1 > 0.5 || l.y2 - l.y1 > 0.5);
  }
  const lines: Line[] = [];
  const y = a.bottom > b.top && b.bottom > a.top ? mid(a.top, a.bottom, b.top, b.bottom) : a.top + a.height / 2;
  const x = a.right > b.left && b.right > a.left ? mid(a.left, a.right, b.left, b.right) : a.left + a.width / 2;
  if (b.left >= a.right) lines.push({ x1: a.right, y1: y, x2: b.left, y2: y });
  if (b.right <= a.left) lines.push({ x1: b.right, y1: y, x2: a.left, y2: y });
  if (b.top >= a.bottom) lines.push({ x1: x, y1: a.bottom, x2: x, y2: b.top });
  if (b.bottom <= a.top) lines.push({ x1: x, y1: b.bottom, x2: x, y2: a.top });
  return lines;
}

/** Child boxes, gaps and grid tracks of a selected flex/grid container. */
function layoutGuides(el: Element) {
  const cs = getComputedStyle(el);
  const flex = cs.display.includes('flex');
  const grid = cs.display.includes('grid');
  if (!flex && !grid) return null;
  const r = el.getBoundingClientRect();
  const kids = Array.from(el.children)
    .filter((c) => !['absolute', 'fixed'].includes(getComputedStyle(c).position))
    .map((c) => c.getBoundingClientRect())
    .filter((k) => k.width || k.height)
    .slice(0, 100);
  const content = {
    left: r.left + px(cs.borderLeftWidth) + px(cs.paddingLeft),
    top: r.top + px(cs.borderTopWidth) + px(cs.paddingTop),
    right: r.right - px(cs.borderRightWidth) - px(cs.paddingRight),
    bottom: r.bottom - px(cs.borderBottomWidth) - px(cs.paddingBottom),
  };
  const gaps: Box[] = [];
  const tracks: Line[] = [];
  if (flex) {
    const row = !cs.flexDirection.startsWith('column');
    for (let i = 0; i + 1 < kids.length; i++) {
      const [p, n] = [kids[i], kids[i + 1]];
      if (row && n.left > p.right + 0.5) gaps.push(box(p.right, Math.min(p.top, n.top), n.left, Math.max(p.bottom, n.bottom)));
      if (!row && n.top > p.bottom + 0.5) gaps.push(box(Math.min(p.left, n.left), p.bottom, Math.max(p.right, n.right), n.top));
    }
  } else {
    let x = content.left;
    const colGap = px(cs.columnGap);
    for (const w of cs.gridTemplateColumns.split(' ').map(px)) {
      tracks.push({ x1: x, y1: content.top, x2: x, y2: content.bottom }, { x1: x + w, y1: content.top, x2: x + w, y2: content.bottom });
      if (colGap) gaps.push(box(x + w, content.top, x + w + colGap, content.bottom));
      x += w + colGap;
    }
    let y = content.top;
    const rowGap = px(cs.rowGap);
    for (const h of cs.gridTemplateRows.split(' ').map(px)) {
      tracks.push({ x1: content.left, y1: y, x2: content.right, y2: y }, { x1: content.left, y1: y + h, x2: content.right, y2: y + h });
      y += h + rowGap;
    }
  }
  return { kids, gaps, tracks };
}

const box = (left: number, top: number, right: number, bottom: number): Box => ({ left, top, right, bottom, width: right - left, height: bottom - top });

export function Guides() {
  const kidsRef = useRef<HTMLDivElement>(null);
  const gapsRef = useRef<HTMLDivElement>(null);
  const tracksRef = useRef<HTMLDivElement>(null);
  const linesRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const els = selection.value?.els ?? [];
      const el = els.length === 1 && els[0].isConnected ? els[0] : null;

      // Layout guides for a selected flex/grid container.
      const g = el ? layoutGuides(el) : null;
      pool(kidsRef.current!, g?.kids.length ?? 0, 'g-kid').forEach((n, i) => {
        const k = g!.kids[i];
        place(n, k.left, k.top, k.width, k.height);
      });
      pool(gapsRef.current!, g?.gaps.length ?? 0, 'g-gap').forEach((n, i) => {
        const k = g!.gaps[i];
        place(n, k.left, k.top, k.width, k.height);
      });
      pool(tracksRef.current!, g?.tracks.length ?? 0, 'g-track').forEach((n, i) => {
        const t = g!.tracks[i];
        place(n, t.x1, t.y1, Math.max(1, t.x2 - t.x1), Math.max(1, t.y2 - t.y1));
      });

      // Alt-hover redlines.
      const hov = hovered.value;
      const lines = measuring.value && el && hov && hov !== el && hov.isConnected ? measureLines(el.getBoundingClientRect(), hov.getBoundingClientRect()) : [];
      pool(linesRef.current!, lines.length, 'm-line').forEach((n, i) => {
        const l = lines[i];
        place(n, l.x1, l.y1, Math.max(1, l.x2 - l.x1), Math.max(1, l.y2 - l.y1));
      });
      pool(labelsRef.current!, lines.length, 'm-label').forEach((n, i) => {
        const l = lines[i];
        n.textContent = String(Math.round(Math.max(l.x2 - l.x1, l.y2 - l.y1)));
        n.style.transform = `translate(${(l.x1 + l.x2) / 2}px, ${(l.y1 + l.y2) / 2}px) translate(-50%, -50%)`;
      });

      // Reorder insertion line.
      const d = dropLine.value;
      const drop = dropRef.current!;
      drop.style.display = d ? 'block' : 'none';
      if (d) place(drop, d.x, d.y, d.w, d.h);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div class="guides">
      <div ref={gapsRef} />
      <div ref={kidsRef} />
      <div ref={tracksRef} />
      <div ref={linesRef} />
      <div ref={labelsRef} />
      <div ref={dropRef} class="drop-line" />
    </div>
  );
}
