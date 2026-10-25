import { useEffect, useRef, useState } from 'preact/hooks';
import { recording } from '../engine/store';
import { labelFor } from '../lib/selector';
import { cancelRecording, stopRecording, togglePause } from './recorder';

const PILL = { width: 210, height: 38, gap: 10 };
const KEY_NAMES: Record<string, string> = {
  Enter: '⏎', Escape: 'Esc', Backspace: '⌫', Delete: '⌦', Tab: '⇥', ' ': 'Space',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
};
const MODIFIERS = new Set(['Meta', 'Control', 'Alt', 'Shift', 'CapsLock']);

const targetRect = (target: Element | null) =>
  target?.isConnected ? target.getBoundingClientRect() : new DOMRect(0, 0, document.documentElement.clientWidth || innerWidth, innerHeight);

/** Put the controls next to the recorded area, never inside it (they'd end up in the video). */
function pillPosition(r: DOMRect): { x: number; y: number } | null {
  const vw = document.documentElement.clientWidth || innerWidth;
  const cx = Math.min(Math.max(8, r.left + r.width / 2 - PILL.width / 2), vw - PILL.width - 8);
  if (r.bottom + PILL.gap + PILL.height <= innerHeight - 4) return { x: cx, y: r.bottom + PILL.gap };
  if (r.top - PILL.gap - PILL.height >= 4) return { x: cx, y: r.top - PILL.gap - PILL.height };
  const cy = Math.min(Math.max(8, r.top + r.height / 2 - PILL.height / 2), innerHeight - PILL.height - 8);
  if (r.right + PILL.gap + PILL.width <= vw - 4) return { x: r.right + PILL.gap, y: cy };
  if (r.left - PILL.gap - PILL.width >= 4) return { x: r.left - PILL.gap - PILL.width, y: cy };
  return null;
}

function keyLabel(e: KeyboardEvent): { text: string; typing: boolean } | null {
  if (MODIFIERS.has(e.key)) return null;
  const mods = `${e.ctrlKey ? '⌃' : ''}${e.altKey ? '⌥' : ''}${e.shiftKey && (e.key.length > 1 || e.metaKey || e.ctrlKey) ? '⇧' : ''}${e.metaKey ? '⌘' : ''}`;
  const name = KEY_NAMES[e.key] ?? (e.key.length === 1 ? e.key.toUpperCase() : e.key);
  if (!mods && e.key.length === 1 && e.key !== ' ') return { text: e.key, typing: true };
  return { text: `${mods}${name}`, typing: false };
}

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Everything shown while recording: countdown, cursor, click ripples, keystrokes and the controls. */
export function RecordingLayer() {
  const rec = recording.value!;
  const cursorRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const keysRef = useRef<HTMLDivElement>(null);
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  const [keys, setKeys] = useState<{ id: number; text: string; typing: boolean } | null>(null);
  const [now, setNow] = useState(performance.now());
  const live = rec.phase === 'recording' || rec.phase === 'paused';

  // Pointer, clicks and keys. Listeners are passive: the page keeps working normally.
  useEffect(() => {
    let x = -100;
    let y = -100;
    let raf = 0;
    let keysTimer: ReturnType<typeof setTimeout> | undefined;
    const move = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
    };
    const down = (e: PointerEvent) => {
      const id = performance.now();
      setRipples((r) => [...r.slice(-4), { id, x: e.clientX, y: e.clientY }]);
      setTimeout(() => setRipples((r) => r.filter((p) => p.id !== id)), 650);
    };
    const key = (e: KeyboardEvent) => {
      const cur = recording.value;
      if (cur?.phase === 'countdown' && e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        void cancelRecording();
        return;
      }
      const label = keyLabel(e);
      if (!label || cur?.phase !== 'recording') return;
      setKeys((prev) =>
        label.typing && prev?.typing && prev.text.length < 24 ? { ...prev, text: prev.text + label.text } : { id: performance.now(), ...label },
      );
      clearTimeout(keysTimer);
      keysTimer = setTimeout(() => setKeys(null), 1600);
    };
    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (cursorRef.current) cursorRef.current.style.transform = `translate(${x}px, ${y}px)`;
      const cur = recording.value;
      const r = targetRect(cur?.target ?? null);
      const pill = pillRef.current;
      if (pill) {
        const pos = cur?.mode === 'element' ? pillPosition(r) : null;
        pill.style.display = pos ? 'flex' : 'none';
        if (pos) pill.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
      }
      if (keysRef.current) keysRef.current.style.transform = `translate(${r.left + r.width / 2}px, ${r.bottom - 16}px) translate(-50%, -100%)`;
      setNow(performance.now());
    };
    addEventListener('pointermove', move, { capture: true, passive: true });
    addEventListener('pointerdown', down, { capture: true, passive: true });
    addEventListener('keydown', key, true);
    draw();
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(keysTimer);
      removeEventListener('pointermove', move, true);
      removeEventListener('pointerdown', down, true);
      removeEventListener('keydown', key, true);
    };
  }, []);

  if (rec.error) {
    return (
      <div class="rec-toast error" role="alert">
        Couldn’t start recording: {rec.error}
      </div>
    );
  }

  const elapsed = rec.startedAt ? (rec.pausedAt ?? now) - rec.startedAt - rec.pausedMs : 0;

  return (
    <div class="rec-layer">
      {rec.phase === 'countdown' && rec.count > 0 && (
        <div class="rec-countdown">
          <div class="rec-count">{rec.count}</div>
          <div class="rec-hint">
            Recording {rec.target ? labelFor(rec.target) : 'the whole tab'}
            <br />
            {rec.mode === 'tab' ? 'Stop with Alt+Shift+S or the Stylus icon' : 'Controls appear next to the recorded area'} · Esc to cancel
          </div>
        </div>
      )}
      {rec.phase === 'countdown' && rec.target && rec.count > 0 && <TargetOutline target={rec.target} />}

      {/* Tab capture only sends frames when the page repaints; this keeps a still page recording at a steady rate. */}
      {(live || rec.phase === 'countdown') && <div class="rec-heartbeat" aria-hidden="true" />}

      {live && (
        <>
          {ripples.map((r) => (
            <div key={r.id} class="rec-ripple" style={{ transform: `translate(${r.x}px, ${r.y}px)` }} />
          ))}
          <div ref={cursorRef} class="rec-cursor">
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 3.2v15.6l4.3-4.1 2.7 6.3 2.6-1.1-2.7-6.2H18L5 3.2z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round" />
            </svg>
          </div>
          <div ref={keysRef} class="rec-keys">{keys && <span key={keys.id}>{keys.text}</span>}</div>
          <div ref={pillRef} class="rec-pill" role="toolbar" aria-label="Recording controls">
            <span class={`rec-dot ${rec.phase === 'paused' ? 'paused' : ''}`} />
            <span class="rec-time">{clock(elapsed)}</span>
            <button class="rec-btn" title={rec.phase === 'paused' ? 'Resume' : 'Pause'} onClick={() => togglePause()}>
              {rec.phase === 'paused' ? 'Resume' : 'Pause'}
            </button>
            <button class="rec-btn stop" title="Stop and save" onClick={() => stopRecording()}>
              Stop
            </button>
            <button class="rec-btn" title="Discard recording" onClick={() => cancelRecording()}>
              ✕
            </button>
          </div>
        </>
      )}

      {rec.phase === 'saving' && <div class="rec-toast">Saving recording…</div>}
    </div>
  );
}

function TargetOutline({ target }: { target: Element }) {
  const r = target.getBoundingClientRect();
  return <div class="rec-target" style={{ transform: `translate(${r.left}px, ${r.top}px)`, width: `${r.width}px`, height: `${r.height}px` }} />;
}
