import { browser } from 'wxt/browser';
import { appendChunk, beginSession, discardSession, finalizeSession } from '../../lib/recordings-db';
import type { Crop, OffscreenControl, OffscreenStart, RecCropUpdate, RecResult } from '../../lib/recorder-protocol';

// Insertable streams are Chrome-only and not in TypeScript's DOM lib.
declare class MediaStreamTrackProcessor {
  constructor(init: { track: MediaStreamTrack });
  readable: ReadableStream<VideoFrame>;
}
declare class MediaStreamTrackGenerator extends MediaStreamTrack {
  constructor(init: { kind: 'video' });
  writable: WritableStream<VideoFrame>;
}

const MAX_WIDTH = 1920;
const MIME_TYPES = ['video/mp4;codecs=avc1,opus', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'];
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

type Session = {
  id: string;
  media: MediaStream;
  recorder: MediaRecorder;
  /** Chunk writes to IndexedDB, kept in order; awaited before finishing. */
  writes: Promise<unknown>;
  seq: number;
  audioCtx?: AudioContext;
  crop: Crop;
  url: string;
  title: string;
  width: number;
  height: number;
  startedAt: number;
  pausedAt: number | null;
  pausedMs: number;
  thumbnail?: string;
  cancelled: boolean;
};

let session: Session | null = null;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

async function start(msg: OffscreenStart): Promise<RecResult> {
  if (session) return { ok: false, error: 'Already recording.' };
  const tabSource = { chromeMediaSource: 'tab', chromeMediaSourceId: msg.streamId };
  // Ask for frames at the tab's own size and pixel density. Without an exact size Chrome scales the
  // tab into a 16:9 frame with bars on the sides, and both blur and offset the crop.
  const { viewportWidth: vw, viewportHeight: vh, dpr } = msg.crop;
  const density = Math.min(dpr, 3840 / vw, 2160 / vh);
  const width = Math.round(vw * density);
  const height = Math.round(vh * density);
  const media = await navigator.mediaDevices.getUserMedia({
    video: { mandatory: { ...tabSource, minWidth: width, maxWidth: width, minHeight: height, maxHeight: height, maxFrameRate: 30 } },
    audio: msg.audio ? { mandatory: tabSource } : false,
  } as unknown as MediaStreamConstraints);

  // Capturing a tab's audio silences it for the user; play it back so the page still sounds normal.
  let audioCtx: AudioContext | undefined;
  if (media.getAudioTracks().length) {
    audioCtx = new AudioContext();
    audioCtx.createMediaStreamSource(media).connect(audioCtx.destination);
  }

  // Crop every captured frame to the target area. The output size is fixed by the first frame;
  // later crops (the target moving as the page scrolls) are scaled into it.
  const [track] = media.getVideoTracks();
  const processor = new MediaStreamTrackProcessor({ track });
  const generator = new MediaStreamTrackGenerator({ kind: 'video' });
  let canvas: OffscreenCanvas | null = null;
  let ctx: OffscreenCanvasRenderingContext2D | null = null;
  const s = { crop: msg.crop } as Session;

  const crop = new TransformStream<VideoFrame, VideoFrame>({
    transform(frame, controller) {
      const c = s.crop;
      // Where the tab's content sits in the frame: scaled to fit and centered if the tab was resized
      // after the size was chosen.
      const scale = Math.min(frame.displayWidth / c.viewportWidth, frame.displayHeight / c.viewportHeight);
      const ox = (frame.displayWidth - c.viewportWidth * scale) / 2;
      const oy = (frame.displayHeight - c.viewportHeight * scale) / 2;
      const sw = Math.min(c.width * scale, frame.displayWidth);
      const sh = Math.min(c.height * scale, frame.displayHeight);
      if (!canvas) {
        const fit = Math.min(1, MAX_WIDTH / sw);
        canvas = new OffscreenCanvas(even(sw * fit), even(sh * fit));
        ctx = canvas.getContext('2d', { alpha: false })!;
        s.width = canvas.width;
        s.height = canvas.height;
      }
      // Keep the source rect inside the frame (a target partly scrolled out shows its neighbours instead).
      const sx = Math.max(0, Math.min(ox + c.x * scale, frame.displayWidth - sw));
      const sy = Math.max(0, Math.min(oy + c.y * scale, frame.displayHeight - sh));
      ctx!.drawImage(frame, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      const out = new VideoFrame(canvas, { timestamp: frame.timestamp });
      frame.close();
      controller.enqueue(out);
      if (!s.thumbnail && canvas) {
        s.thumbnail = 'pending';
        const thumb = new OffscreenCanvas(320, Math.round((320 * canvas.height) / canvas.width));
        thumb.getContext('2d')!.drawImage(canvas, 0, 0, thumb.width, thumb.height);
        thumb.convertToBlob({ type: 'image/jpeg', quality: 0.75 }).then(blobToDataUrl).then((url) => (s.thumbnail = url));
      }
    },
  });
  processor.readable.pipeThrough(crop).pipeTo(generator.writable).catch(() => {});

  const out = new MediaStream([generator, ...media.getAudioTracks()]);
  const candidates = out.getAudioTracks().length ? MIME_TYPES : MIME_TYPES.filter((m) => !m.includes('opus'));
  const mimeType = candidates.find((m) => MediaRecorder.isTypeSupported(m));
  // MP4 is written in fragments that end at keyframes, so ask for one every second: otherwise most of
  // the video stays inside the encoder until stop and a crash would lose it.
  const recorder = new MediaRecorder(out, {
    mimeType,
    videoBitsPerSecond: 8_000_000,
    videoKeyFrameIntervalDuration: 1000,
  } as MediaRecorderOptions & { videoKeyFrameIntervalDuration: number });
  const id = `rec_${Date.now().toString(36)}`;
  await beginSession({
    id,
    title: msg.title,
    url: msg.url,
    createdAt: Date.now(),
    durationMs: 0,
    width: 0,
    height: 0,
    mime: recorder.mimeType || mimeType || 'video/webm',
    chunks: 0,
    size: 0,
  });

  // Each encoded chunk goes straight to IndexedDB with the session's latest metadata; nothing piles
  // up in memory, and a crash leaves a recoverable recording behind.
  recorder.ondataavailable = (e) => {
    if (!e.data.size || !session) return;
    const cur = session;
    const seq = cur.seq++;
    const elapsed = (cur.pausedAt ?? performance.now()) - cur.startedAt - cur.pausedMs;
    const update = { durationMs: Math.round(elapsed), width: cur.width, height: cur.height, thumbnail: cur.thumbnail?.startsWith('data:') ? cur.thumbnail : undefined };
    cur.writes = cur.writes.then(() => appendChunk(cur.id, seq, e.data, update)).catch((err) => console.error('Stylus: chunk write failed', err));
  };

  session = Object.assign(s, {
    id,
    media,
    recorder,
    writes: Promise.resolve(),
    seq: 0,
    audioCtx,
    url: msg.url,
    title: msg.title,
    width: 0,
    height: 0,
    startedAt: performance.now(),
    pausedAt: null,
    pausedMs: 0,
    cancelled: false,
  });
  recorder.start(1000);
  return { ok: true };
}

function finish(): Promise<RecResult> {
  const s = session;
  if (!s) return Promise.resolve({ ok: false, error: 'Not recording.' });
  return new Promise((resolve) => {
    s.recorder.onstop = async () => {
      session = null;
      s.media.getTracks().forEach((t) => t.stop());
      await s.audioCtx?.close();
      await s.writes; // the final chunk arrives just before stop
      if (s.cancelled) {
        await discardSession(s.id);
        return resolve({ ok: true });
      }
      const recording = await finalizeSession(s.id);
      resolve(recording ? { ok: true, id: recording.id } : { ok: false, error: 'Nothing was recorded.' });
    };
    if (s.recorder.state !== 'inactive') s.recorder.stop();
  });
}

browser.runtime.onMessage.addListener((raw: unknown, _sender, sendResponse) => {
  const msg = raw as OffscreenStart | OffscreenControl | RecCropUpdate;
  if (msg.type === 'rec:crop') {
    if (session) session.crop = msg.crop;
    return;
  }
  if (!('target' in msg) || msg.target !== 'offscreen') return;
  const reply = (p: Promise<RecResult>) => {
    p.then(sendResponse, (e: unknown) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
    return true;
  };
  switch (msg.type) {
    case 'start':
      return reply(start(msg));
    case 'stop':
      return reply(finish());
    case 'cancel':
      if (session) session.cancelled = true;
      return reply(finish());
    case 'pause':
      if (session?.recorder.state === 'recording') {
        session.recorder.pause();
        session.pausedAt = performance.now();
      }
      return reply(Promise.resolve({ ok: true }));
    case 'resume':
      if (session?.recorder.state === 'paused') {
        session.recorder.resume();
        session.pausedMs += performance.now() - (session.pausedAt ?? performance.now());
        session.pausedAt = null;
      }
      return reply(Promise.resolve({ ok: true }));
  }
});
