import { useEffect, useRef } from 'preact/hooks';
import { hovered, preview, select, selection } from '../engine/store';
import { px } from '../lib/dom';
import { labelFor } from '../lib/selector';

const MAX_RECTS = 300;

function pool(container: HTMLElement, n: number, className: string) {
  while (container.childElementCount < n) {
    const d = document.createElement('div');
    d.className = className;
    container.appendChild(d);
  }
  while (container.childElementCount > n) container.lastElementChild!.remove();
  return Array.from(container.children) as HTMLElement[];
}

function place(node: HTMLElement, r: { left: number; top: number; width: number; height: number }) {
  node.style.transform = `translate(${r.left}px, ${r.top}px)`;
  node.style.width = `${Math.max(0, r.width)}px`;
  node.style.height = `${Math.max(0, r.height)}px`;
}

function visibleRects(els: Iterable<Element>) {
  const out: DOMRect[] = [];
  for (const el of els) {
    if (out.length >= MAX_RECTS) break;
    if (!el.isConnected) continue;
    const r = el.getBoundingClientRect();
    if (r.width || r.height) out.push(r);
  }
  return out;
}

/** If the page re-rendered the selected elements away (SPA), re-find them by selector. */
function followRerender() {
  const cur = selection.value;
  if (!cur || cur.els.some((el) => el.isConnected)) return;
  let els: Element[] = [];
  try {
    els = Array.from(document.querySelectorAll(cur.selector));
  } catch {
    /* ignore */
  }
  select(els.length ? els : null, cur.similar ? cur.selector : undefined);
}

/** Hover/selection/preview outlines plus Figma-style padding & margin shading, drawn every frame. */
export function Overlay() {
  const hoverRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const selRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      followRerender();
      const sel = selection.value?.els ?? [];
      const hov = hovered.value;

      // Hover
      const hoverNode = hoverRef.current!;
      if (hov && hov.isConnected && !sel.includes(hov)) {
        hoverNode.style.display = 'block';
        place(hoverNode, hov.getBoundingClientRect());
      } else {
        hoverNode.style.display = 'none';
      }

      // Selection
      const rects = visibleRects(sel);
      pool(selRef.current!, rects.length, 'sel').forEach((n, i) => place(n, rects[i]));

      // Padding / margin for a single selection
      const box = boxRef.current!;
      const single = sel.length === 1 && rects.length === 1 ? sel[0] : null;
      if (single) {
        const cs = getComputedStyle(single);
        const r = rects[0];
        const [pt, pr, pb, pl] = [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].map(px);
        const [mt, mr, mb, ml] = [cs.marginTop, cs.marginRight, cs.marginBottom, cs.marginLeft].map(px);
        const parts = pool(box, 8, 'zone');
        const zones = [
          { r: { left: r.left, top: r.top, width: r.width, height: pt }, k: 'pad' },
          { r: { left: r.left, top: r.bottom - pb, width: r.width, height: pb }, k: 'pad' },
          { r: { left: r.left, top: r.top + pt, width: pl, height: r.height - pt - pb }, k: 'pad' },
          { r: { left: r.right - pr, top: r.top + pt, width: pr, height: r.height - pt - pb }, k: 'pad' },
          { r: { left: r.left - ml, top: r.top - mt, width: r.width + ml + mr, height: Math.max(0, mt) }, k: 'mar' },
          { r: { left: r.left - ml, top: r.bottom, width: r.width + ml + mr, height: Math.max(0, mb) }, k: 'mar' },
          { r: { left: r.left - ml, top: r.top, width: Math.max(0, ml), height: r.height }, k: 'mar' },
          { r: { left: r.right, top: r.top, width: Math.max(0, mr), height: r.height }, k: 'mar' },
        ];
        parts.forEach((n, i) => {
          n.className = `zone ${zones[i].k}`;
          place(n, zones[i].r);
        });
      } else {
        pool(box, 0, 'zone');
      }

      // Preview (hovering a change / layer)
      let prevEls: Element[] = [];
      if (preview.value) {
        try {
          prevEls = Array.from(document.querySelectorAll(preview.value)).slice(0, MAX_RECTS);
        } catch {
          /* invalid selector while typing */
        }
      }
      const prevRects = visibleRects(prevEls);
      pool(previewRef.current!, prevRects.length, 'pv').forEach((n, i) => place(n, prevRects[i]));

      // Label: hovered element, else the primary selection
      const labelEl = hov && hov.isConnected ? hov : single;
      const label = labelRef.current!;
      if (labelEl) {
        const r = labelEl.getBoundingClientRect();
        label.style.display = 'block';
        label.textContent = `${labelFor(labelEl)}  ${Math.round(r.width)} × ${Math.round(r.height)}`;
        const top = r.top > 24 ? r.top - 22 : r.bottom + 4;
        label.style.transform = `translate(${Math.max(4, Math.min(r.left, innerWidth - 220))}px, ${Math.max(4, Math.min(top, innerHeight - 24))}px)`;
        label.dataset.kind = labelEl === hov && !sel.includes(hov) ? 'hover' : 'sel';
      } else {
        label.style.display = 'none';
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div class="overlay">
      <div ref={boxRef} />
      <div ref={previewRef} />
      <div ref={selRef} />
      <div ref={hoverRef} class="hover" />
      <div ref={labelRef} class="label" />
    </div>
  );
}
