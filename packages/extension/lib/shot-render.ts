import { ASPECTS, GRADIENTS, SHADOWS, type ShotSettings } from './shot-settings';

type Source = ImageBitmap | HTMLImageElement | HTMLCanvasElement | OffscreenCanvas;
type Ctx = OffscreenCanvasRenderingContext2D;

export type RenderOptions = {
  /** Screenshot pixels per CSS pixel (the page's devicePixelRatio when captured). */
  density: number;
  /** Output pixels per CSS pixel: 1 for "1×", 2 for "2×". */
  scale: number;
  /** Shown in the browser frame's address bar. */
  url?: string;
};

export type Layout = {
  width: number;
  height: number;
  card: { x: number; y: number; width: number; height: number };
  bar: number;
  image: { x: number; y: number; width: number; height: number };
};

const MAC_BAR = 38;
const BROWSER_BAR = 46;

/** Where everything goes, in output pixels. Pure, so the editor and tests can reason about it. */
export function layoutShot(w: number, h: number, s: ShotSettings, o: RenderOptions): Layout {
  const f = o.scale / o.density; // screenshot pixels → output pixels
  const iw = w * f;
  const ih = h * f;
  const bar = s.frame === 'none' ? 0 : (s.frame.startsWith('browser') ? BROWSER_BAR : MAC_BAR) * o.scale;
  const cw = iw;
  const ch = ih + bar;
  const pad = Math.round((Math.max(cw, ch) * s.padding) / 100);
  let width = cw + pad * 2;
  let height = ch + pad * 2;
  const ratio = ASPECTS.find((a) => a.id === s.aspect)?.ratio;
  if (ratio) {
    if (width / height < ratio) width = height * ratio;
    else height = width / ratio;
  }
  width = Math.round(width);
  height = Math.round(height);
  const card = { x: Math.round((width - cw) / 2), y: Math.round((height - ch) / 2), width: Math.round(cw), height: Math.round(ch) };
  return { width, height, card, bar, image: { x: card.x, y: card.y + bar, width: card.width, height: Math.round(ih) } };
}

function paintBackground(ctx: Ctx, img: Source, s: ShotSettings, L: Layout, o: RenderOptions) {
  const { width: W, height: H } = L;
  const bg = s.background;
  if (bg.kind === 'none') return;
  if (bg.kind === 'solid') {
    ctx.fillStyle = bg.color;
    ctx.fillRect(0, 0, W, H);
    return;
  }
  if (bg.kind === 'blur') {
    // The screenshot itself, blown up and blurred: colors that always match.
    const k = Math.max(W / img.width, H / img.height) * 1.15;
    ctx.save();
    ctx.filter = `blur(${Math.round(40 * o.scale)}px) saturate(1.4)`;
    ctx.drawImage(img, (W - img.width * k) / 2, (H - img.height * k) / 2, img.width * k, img.height * k);
    ctx.restore();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
    ctx.fillRect(0, 0, W, H);
    return;
  }
  const g = GRADIENTS.find((x) => x.id === bg.id) ?? GRADIENTS[0];
  if (g.type === 'linear') {
    const a = ((g.angle - 90) * Math.PI) / 180;
    const len = (Math.abs(W * Math.cos(a)) + Math.abs(H * Math.sin(a))) / 2;
    const [cx, cy] = [W / 2, H / 2];
    const grad = ctx.createLinearGradient(cx - Math.cos(a) * len, cy - Math.sin(a) * len, cx + Math.cos(a) * len, cy + Math.sin(a) * len);
    g.stops.forEach((c, i) => grad.addColorStop(i / (g.stops.length - 1), c));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    return;
  }
  ctx.fillStyle = g.base;
  ctx.fillRect(0, 0, W, H);
  const size = Math.max(W, H);
  for (const b of g.blobs) {
    const grad = ctx.createRadialGradient(b.x * W, b.y * H, 0, b.x * W, b.y * H, b.r * size);
    grad.addColorStop(0, b.color);
    grad.addColorStop(1, `${b.color}00`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }
}

function paintFrame(ctx: Ctx, s: ShotSettings, L: Layout, o: RenderOptions) {
  if (s.frame === 'none') return;
  const dark = s.frame.endsWith('dark');
  const { x, y, width } = L.card;
  const u = o.scale;
  ctx.fillStyle = dark ? '#2a2a2e' : '#ececef';
  ctx.fillRect(x, y, width, L.bar);
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  ctx.fillRect(x, y + L.bar - u, width, u);
  ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => {
    ctx.beginPath();
    ctx.arc(x + (18 + i * 20) * u, y + L.bar / 2, 6 * u, 0, Math.PI * 2);
    ctx.fillStyle = c;
    ctx.fill();
  });
  if (s.frame.startsWith('browser')) {
    const pillW = Math.min(width * 0.5, 460 * u);
    const pillH = 26 * u;
    const px = x + (width - pillW) / 2;
    const py = y + (L.bar - pillH) / 2;
    ctx.beginPath();
    ctx.roundRect(px, py, pillW, pillH, 8 * u);
    ctx.fillStyle = dark ? '#1c1c1f' : '#ffffff';
    ctx.fill();
    let host = '';
    try {
      host = o.url ? new URL(o.url).host : '';
    } catch {
      host = '';
    }
    ctx.fillStyle = dark ? '#c7c7cc' : '#52525b';
    ctx.font = `500 ${12 * u}px Inter, -apple-system, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(host, px + pillW / 2, py + pillH / 2, pillW - 20 * u);
  }
}

/** Seeded so the same settings always render the same pixels. */
function noise(size: number): OffscreenCanvas {
  const c = new OffscreenCanvas(size, size);
  const cx = c.getContext('2d')!;
  const data = cx.createImageData(size, size);
  let seed = 1337;
  for (let i = 0; i < data.data.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const v = seed >>> 24;
    data.data.set([v, v, v, 28], i);
  }
  cx.putImageData(data, 0, 0);
  return c;
}

/** Render the finished image. Used for both the editor preview and the exported PNG. */
export function renderShot(img: Source, s: ShotSettings, o: RenderOptions): OffscreenCanvas {
  const L = layoutShot(img.width, img.height, s, o);
  const canvas = new OffscreenCanvas(L.width, L.height);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  const r = Math.min(s.radius * o.scale, L.card.width / 2, L.card.height / 2);

  paintBackground(ctx, img, s, L, o);

  const sh = SHADOWS[s.shadow];
  if (sh.alpha) {
    ctx.save();
    ctx.shadowColor = `rgba(0, 0, 0, ${sh.alpha})`;
    ctx.shadowBlur = sh.blur * o.scale;
    ctx.shadowOffsetY = sh.y * o.scale;
    ctx.beginPath();
    ctx.roundRect(L.card.x, L.card.y, L.card.width, L.card.height, r);
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(L.card.x, L.card.y, L.card.width, L.card.height, r);
  ctx.clip();
  paintFrame(ctx, s, L, o);
  ctx.drawImage(img, L.image.x, L.image.y, L.image.width, L.image.height);
  ctx.restore();

  if (s.glass) {
    ctx.beginPath();
    ctx.roundRect(L.card.x + 0.5, L.card.y + 0.5, L.card.width - 1, L.card.height - 1, r);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = Math.max(1, o.scale);
    ctx.stroke();
  }

  if (s.grain && s.background.kind !== 'none') {
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = ctx.createPattern(noise(160), 'repeat')!;
    ctx.fillRect(0, 0, L.width, L.height);
    ctx.restore();
  }

  if (s.watermark.trim()) {
    const size = Math.max(11, Math.round(Math.min(L.width, L.height) * 0.022));
    ctx.font = `600 ${size}px Inter, -apple-system, system-ui, sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = size / 2;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    const margin = Math.max(size, (L.height - L.card.y - L.card.height) / 2 - size / 2);
    ctx.fillText(s.watermark.trim(), L.width - Math.max(size, L.card.x / 2), L.height - margin);
  }
  return canvas;
}
