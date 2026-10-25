import { browser } from 'wxt/browser';
import { saveRecording } from '../../lib/recordings-db';
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
  media: MediaStream;
  recorder: MediaRecorder;
  chunks: Blob[];
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
  const recorder = new MediaRecorder(out, { mimeType, videoBitsPerSecond: 8_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);

  session = Object.assign(s, {
    media,
    recorder,
    chunks,
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
      if (s.cancelled) return resolve({ ok: true });
      const end = s.pausedAt ?? performance.now();
      const blob = new Blob(s.chunks, { type: s.recorder.mimeType });
      const id = `rec_${Date.now().toString(36)}`;
      await saveRecording({
        id,
        title: s.title,
        url: s.url,
        createdAt: Date.now(),
        durationMs: Math.round(end - s.startedAt - s.pausedMs),
        width: s.width,
        height: s.height,
        mime: s.recorder.mimeType,
        size: blob.size,
        blob,
        thumbnail: s.thumbnail?.startsWith('data:') ? s.thumbnail : undefined,
      });
      resolve({ ok: true, id });
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
