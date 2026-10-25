import { browser } from 'wxt/browser';
import type { Crop, RecResult, RecordMode } from '../../../lib/recorder-protocol';
import { recording, selection } from '../engine/store';
import { labelFor } from '../lib/selector';
import { startPicker, stopPicker } from './picker';

const COUNTDOWN = 3;

function cropOf(target: Element | null): Crop {
  const vw = document.documentElement.clientWidth || innerWidth;
  const vh = innerHeight;
  const dpr = devicePixelRatio || 1;
  if (!target) return { x: 0, y: 0, width: vw, height: vh, viewportWidth: vw, viewportHeight: vh, dpr };
  const r = target.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height, viewportWidth: vw, viewportHeight: vh, dpr };
}

const send = (msg: Record<string, unknown>) => browser.runtime.sendMessage(msg) as Promise<RecResult>;

/** Keep the recorder's crop on the target as the page scrolls or the target moves. */
let follow = 0;
function followTarget() {
  let last = '';
  const tick = () => {
    const rec = recording.value;
    if (!rec || rec.phase === 'saving') return;
    const crop = cropOf(rec.target);
    const key = `${Math.round(crop.x)},${Math.round(crop.y)},${Math.round(crop.width)},${Math.round(crop.height)}`;
    if (key !== last) {
      last = key;
      void browser.runtime.sendMessage({ type: 'rec:crop', crop }).catch(() => {});
    }
    follow = requestAnimationFrame(tick);
  };
  follow = requestAnimationFrame(tick);
}

function setRecordingClass(on: boolean) {
  document.documentElement.classList.toggle('__stylus-recording', on);
}

/** Count down, then record the selected element (or the whole tab). The page stays usable throughout. */
export async function startRecording(mode: RecordMode) {
  if (recording.value) return;
  const target = mode === 'element' ? (selection.value?.els.find((e) => e.isConnected) ?? null) : null;
  if (mode === 'element' && !target) return;
  stopPicker();
  setRecordingClass(true);
  recording.value = { phase: 'countdown', mode, target, count: COUNTDOWN, startedAt: 0, pausedMs: 0, pausedAt: null };

  for (let n = COUNTDOWN; n > 0; n--) {
    if (!recording.value) return; // cancelled during the countdown
    recording.value = { ...recording.value, count: n };
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!recording.value) return;
  // Let the countdown overlay disappear before the first captured frame.
  recording.value = { ...recording.value, count: 0 };
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  const title = `${document.title || location.host}${target ? ` · ${labelFor(target)}` : ''}`;
  const result = await send({ type: 'stylus:rec:start', crop: cropOf(target), mode, audio: true, title }).catch((e: unknown) => ({
    ok: false as const,
    error: String(e),
  }));
  if (!recording.value) return;
  if (!result.ok) {
    finishLocally();
    recording.value = { phase: 'saving', mode, target, count: 0, startedAt: 0, pausedMs: 0, pausedAt: null, error: result.error };
    setTimeout(() => (recording.value = null), 6000);
    return;
  }
  recording.value = { ...recording.value, phase: 'recording', startedAt: performance.now() };
  followTarget();
}

function finishLocally() {
  cancelAnimationFrame(follow);
  setRecordingClass(false);
  startPicker();
}

export async function stopRecording() {
  const rec = recording.value;
  if (!rec) return;
  if (rec.phase === 'countdown') return cancelRecording();
  recording.value = { ...rec, phase: 'saving' };
  cancelAnimationFrame(follow);
  await send({ type: 'stylus:rec:stop' }).catch(() => {});
  recording.value = null;
  finishLocally();
}

export async function cancelRecording() {
  const rec = recording.value;
  if (!rec) return;
  const wasRecording = rec.phase !== 'countdown';
  recording.value = null;
  finishLocally();
  if (wasRecording) await send({ type: 'stylus:rec:cancel' }).catch(() => {});
}

export async function togglePause() {
  const rec = recording.value;
  if (!rec || (rec.phase !== 'recording' && rec.phase !== 'paused')) return;
  if (rec.phase === 'recording') {
    recording.value = { ...rec, phase: 'paused', pausedAt: performance.now() };
    await send({ type: 'stylus:rec:pause' });
  } else {
    recording.value = { ...rec, phase: 'recording', pausedMs: rec.pausedMs + performance.now() - (rec.pausedAt ?? performance.now()), pausedAt: null };
    await send({ type: 'stylus:rec:resume' });
  }
}

export const openLibrary = () => browser.runtime.sendMessage({ type: 'stylus:rec:library' }).catch(() => {});
