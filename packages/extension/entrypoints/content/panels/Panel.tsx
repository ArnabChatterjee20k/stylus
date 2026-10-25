import type { ComponentChildren } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { Icon } from '../canvas/icons';
import { togglePanel, type PanelId } from '../engine/store';

const positions = new Map<PanelId, { x: number; y: number }>();

/** Floating, draggable panel. Position survives close/reopen within the page session. */
export function Panel(props: { id: PanelId; title: string; width: number; initial: () => { x: number; y: number }; actions?: ComponentChildren; children: ComponentChildren }) {
  const [pos, setPos] = useState(() => positions.get(props.id) ?? props.initial());
  const [collapsed, setCollapsed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const onPointerDown = (e: PointerEvent) => {
    if ((e.target as Element).closest('button, input, select')) return;
    const head = e.currentTarget as HTMLElement;
    head.setPointerCapture(e.pointerId);
    const dx = e.clientX - pos.x;
    const dy = e.clientY - pos.y;
    const move = (ev: PointerEvent) => {
      const next = {
        x: Math.min(innerWidth - 60, Math.max(-props.width + 60, ev.clientX - dx)),
        y: Math.min(innerHeight - 30, Math.max(0, ev.clientY - dy)),
      };
      positions.set(props.id, next);
      setPos(next);
    };
    const up = () => {
      head.removeEventListener('pointermove', move);
      head.removeEventListener('pointerup', up);
    };
    head.addEventListener('pointermove', move);
    head.addEventListener('pointerup', up);
  };

  return (
    <div ref={ref} class="panel" style={{ transform: `translate(${pos.x}px, ${pos.y}px)`, width: `${props.width}px` }}>
      <header class="panel-head" onPointerDown={onPointerDown} onDblClick={() => setCollapsed(!collapsed)}>
        <button class="icon-btn" onClick={() => setCollapsed(!collapsed)} title={collapsed ? 'Expand' : 'Collapse'}>
          <Icon name={collapsed ? 'chevronRight' : 'chevronDown'} size={12} />
        </button>
        <span class="panel-title">{props.title}</span>
        <span class="panel-actions">{props.actions}</span>
        <button class="icon-btn" onClick={() => togglePanel(props.id, false)} title="Close">
          <Icon name="close" size={12} />
        </button>
      </header>
      {!collapsed && <div class="panel-body">{props.children}</div>}
    </div>
  );
}
