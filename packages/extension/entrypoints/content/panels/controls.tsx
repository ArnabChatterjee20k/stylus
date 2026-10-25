import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '../canvas/icons';
import { isTransparent, toHex } from '../lib/dom';

const NUM = /^(-?\d*\.?\d+)([a-z%]*)$/i;

function parse(value: string, unit: string) {
  const m = value.trim().match(NUM);
  return m ? { n: Number(m[1]), unit: m[2] || unit } : { n: 0, unit };
}

const round = (n: number, step: number) => {
  const decimals = step < 1 ? String(step).split('.')[1]?.length ?? 2 : 0;
  return Number(n.toFixed(decimals));
};

/** Text input committed on Enter/blur, synced with outside value while not focused. */
function useDraft(value: string) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);
  return { draft, setDraft, focused };
}

/**
 * Number field with a draggable label (Figma "scrubby" input). Arrow keys step; Shift = ×10.
 * The wrapper is a <div>, not a <label>, so dragging doesn't focus the input and ⌘Z still undoes the edit.
 */
export function Scrub(props: {
  label: ComponentChildren;
  value: string;
  onChange: (v: string) => void;
  step?: number;
  unit?: string;
  min?: number;
  max?: number;
  title?: string;
  wide?: boolean;
}) {
  const { label, value, onChange, step = 1, unit = 'px', min, max, title } = props;
  const { draft, setDraft, focused } = useDraft(value);

  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
  const emit = (n: number, u: string) => onChange(`${round(clamp(n), step)}${u}`);

  const onPointerDown = (e: PointerEvent) => {
    const start = parse(value, unit);
    const x0 = e.clientX;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => emit(start.n + Math.round((ev.clientX - x0) / 2) * step * (ev.shiftKey ? 10 : 1), start.unit);
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
  };

  const commitDraft = () => {
    const t = draft.trim();
    if (t !== value) onChange(/^-?\d*\.?\d+$/.test(t) && unit ? `${t}${unit}` : t);
  };

  return (
    <div class={`field scrub ${props.wide ? 'wide' : ''}`} title={title}>
      <span class="scrub-label" onPointerDown={onPointerDown}>
        {label}
      </span>
      <input
        value={draft}
        onFocus={() => (focused.current = true)}
        onBlur={() => {
          focused.current = false;
          commitDraft();
        }}
        onInput={(e) => setDraft(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const p = parse(draft, unit);
            const n = p.n + (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
            setDraft(`${round(clamp(n), step)}${p.unit}`);
            emit(n, p.unit);
          }
        }}
      />
    </div>
  );
}

export function TextField(props: { label?: string; value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean }) {
  const { draft, setDraft, focused } = useDraft(props.value);
  return (
    <label class="field text">
      {props.label && <span class="field-label">{props.label}</span>}
      <input
        class={props.mono ? 'mono' : ''}
        value={draft}
        placeholder={props.placeholder}
        onFocus={() => (focused.current = true)}
        onBlur={() => {
          focused.current = false;
          if (draft !== props.value) props.onChange(draft.trim());
        }}
        onInput={(e) => setDraft(e.currentTarget.value)}
        onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
      />
    </label>
  );
}

export function Select(props: { label?: string; value: string; options: (string | [string, string])[]; onChange: (v: string) => void }) {
  const opts = props.options.map((o) => (Array.isArray(o) ? o : [o, o]));
  const known = opts.some(([v]) => v === props.value);
  return (
    <label class="field select">
      {props.label && <span class="field-label">{props.label}</span>}
      <select value={props.value} onChange={(e) => props.onChange(e.currentTarget.value)}>
        {!known && <option value={props.value}>{props.value}</option>}
        {opts.map(([v, l]) => (
          <option value={v} key={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Segmented(props: { value: string; options: { value: string; label: ComponentChildren; title?: string }[]; onChange: (v: string) => void }) {
  return (
    <div class="segmented">
      {props.options.map((o) => (
        <button key={o.value} title={o.title ?? o.value} class={o.value === props.value ? 'on' : ''} onClick={() => props.onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const hasEyeDropper = typeof (window as { EyeDropper?: unknown }).EyeDropper === 'function';

export function ColorField(props: { label?: string; value: string; onChange: (v: string) => void; palette?: string[] }) {
  const [open, setOpen] = useState(false);
  const transparent = isTransparent(props.value);
  const hex = toHex(props.value);
  const { draft, setDraft, focused } = useDraft(transparent ? 'transparent' : hex);

  const pick = async () => {
    try {
      const ed = new (window as unknown as { EyeDropper: new () => { open(): Promise<{ sRGBHex: string }> } }).EyeDropper();
      props.onChange((await ed.open()).sRGBHex);
    } catch {
      /* cancelled */
    }
  };

  return (
    <div class="field color">
      {props.label && <span class="field-label">{props.label}</span>}
      <div class="color-row">
        <label class={`swatch ${transparent ? 'transparent' : ''}`} style={{ background: transparent ? undefined : props.value }}>
          <input type="color" value={hex} onInput={(e) => props.onChange(e.currentTarget.value)} />
        </label>
        <input
          class="mono"
          value={draft}
          onFocus={() => (focused.current = true)}
          onBlur={() => {
            focused.current = false;
            if (draft !== hex) props.onChange(draft.trim());
          }}
          onInput={(e) => setDraft(e.currentTarget.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
        />
        {hasEyeDropper && (
          <button class="icon-btn" title="Pick a color from the screen" onClick={pick}>
            <Icon name="pipette" size={13} />
          </button>
        )}
        {!!props.palette?.length && (
          <button class="icon-btn" title="Page colors" onClick={() => setOpen(!open)}>
            <Icon name={open ? 'chevronDown' : 'chevronRight'} size={13} />
          </button>
        )}
      </div>
      {open && (
        <div class="palette">
          {props.palette!.map((c) => (
            <button key={c} class="chip" title={c} style={{ background: c }} onClick={() => props.onChange(c)} />
          ))}
        </div>
      )}
    </div>
  );
}

type Side = 'top' | 'right' | 'bottom' | 'left';
const SIDES: Side[] = ['top', 'right', 'bottom', 'left'];

/** Figma-like box model editor: margin ring around padding ring around the size. */
export function BoxModel(props: { get: (prop: string) => string; onChange: (prop: string, v: string) => void; size: string }) {
  const cell = (kind: 'margin' | 'padding', side: Side) => (
    <BoxInput key={`${kind}-${side}`} class={`bm-${side}`} value={props.get(`${kind}-${side}`)} onChange={(v) => props.onChange(`${kind}-${side}`, v)} />
  );
  return (
    <div class="boxmodel">
      <span class="bm-tag">margin</span>
      {SIDES.map((s) => cell('margin', s))}
      <div class="bm-padding">
        <span class="bm-tag">padding</span>
        {SIDES.map((s) => cell('padding', s))}
        <div class="bm-content">{props.size}</div>
      </div>
    </div>
  );
}

function BoxInput(props: { value: string; onChange: (v: string) => void; class: string }) {
  const short = props.value.replace(/\.\d+px$/, 'px').replace(/^0px$/, '0').replace(/px$/, '');
  const { draft, setDraft, focused } = useDraft(short);
  return (
    <input
      class={`bm-input ${props.class}`}
      value={draft}
      onFocus={(e) => {
        focused.current = true;
        e.currentTarget.select();
      }}
      onBlur={() => {
        focused.current = false;
        if (draft !== short) props.onChange(/^-?\d*\.?\d+$/.test(draft) ? `${draft}px` : draft);
      }}
      onInput={(e) => setDraft(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const n = (Number.parseFloat(draft) || 0) + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1);
          setDraft(String(n));
          props.onChange(`${n}px`);
        }
      }}
    />
  );
}

const JUSTIFY = ['flex-start', 'center', 'flex-end'];

/** 3×3 alignment picker for flex containers; maps to justify-content (main axis) and align-items (cross axis). */
export function AlignGrid(props: { direction: string; justify: string; align: string; onChange: (justify: string, align: string) => void }) {
  const column = props.direction.startsWith('column');
  const norm = (v: string) => (v === 'start' || v === 'normal' || v === 'stretch' ? 'flex-start' : v === 'end' ? 'flex-end' : v);
  const j = JUSTIFY.indexOf(norm(props.justify));
  const a = JUSTIFY.indexOf(norm(props.align));
  return (
    <div class="aligngrid">
      {[0, 1, 2].flatMap((row) =>
        [0, 1, 2].map((col) => {
          const main = column ? row : col;
          const cross = column ? col : row;
          const on = main === j && cross === a;
          return <button key={`${row}${col}`} class={on ? 'on' : ''} onClick={() => props.onChange(JUSTIFY[main], JUSTIFY[cross])} />;
        }),
      )}
    </div>
  );
}

export function Section(props: { title: string; children: ComponentChildren; actions?: ComponentChildren }) {
  const [open, setOpen] = useState(true);
  return (
    <section class="section">
      <header onClick={() => setOpen(!open)}>
        <span>{props.title}</span>
        <span class="section-actions" onClick={(e) => e.stopPropagation()}>
          {props.actions}
        </span>
      </header>
      {open && <div class="section-body">{props.children}</div>}
    </section>
  );
}
