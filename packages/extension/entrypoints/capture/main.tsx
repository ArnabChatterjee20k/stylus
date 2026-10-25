import { render } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { deleteCapture, listCaptures, updateCapture, type Capture } from '../../lib/captures-db';
import { keepAfterDownload, safeName, saveToDownloads, setKeepAfterDownload } from '../../lib/downloads';
import { renderShot } from '../../lib/shot-render';
import { ASPECTS, DEFAULT_SETTINGS, FRAMES, GRADIENTS, SOLIDS, type Background, type Shadow, type ShotSettings } from '../../lib/shot-settings';
import './style.css';

const LAST_SETTINGS = 'stylus:shot-settings';

function lastSettings(): ShotSettings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(LAST_SETTINGS) ?? '{}') };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

const sameBg = (a: Background, b: Background) => JSON.stringify(a) === JSON.stringify(b);
const fileName = (c: Capture, scale: number) => `${safeName(c.title, 'screenshot')}${scale > 1 ? `@${scale}x` : ''}.png`;

/** CSS preview of a gradient swatch, matching what the renderer paints. */
function swatchStyle(id: string) {
  const g = GRADIENTS.find((x) => x.id === id)!;
  if (g.type === 'linear') return { background: `linear-gradient(${g.angle}deg, ${g.stops.join(', ')})` };
  return {
    background: [...g.blobs.map((b) => `radial-gradient(circle at ${b.x * 100}% ${b.y * 100}%, ${b.color}, transparent ${b.r * 100}%)`), g.base].join(', '),
  };
}

function App() {
  const [items, setItems] = useState<Capture[] | null>(null);
  const [selectedId, setSelectedId] = useState(() => location.hash.slice(1));
  const [settings, setSettings] = useState<ShotSettings>(lastSettings);
  const [exportScale, setExportScale] = useState(2);
  const [status, setStatus] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [keep, setKeep] = useState(keepAfterDownload);
  const [saving, setSaving] = useState(false);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const reload = async () => setItems(await listCaptures());
  useEffect(() => {
    void reload();
    const onHash = () => setSelectedId(location.hash.slice(1));
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);

  const selected = items?.find((c) => c.id === selectedId) ?? items?.[0];
  const thumbs = useMemo(() => new Map(items?.map((c) => [c.id, URL.createObjectURL(c.image)])), [items]);
  useEffect(() => () => thumbs.forEach((u) => URL.revokeObjectURL(u)), [thumbs]);

  // Load the selected screenshot and its saved style.
  useEffect(() => {
    setConfirmDelete(false);
    setBitmap(null);
    if (!selected) return;
    setSettings(selected.settings ?? lastSettings());
    let live = true;
    createImageBitmap(selected.image).then((b) => live && setBitmap(b));
    return () => {
      live = false;
    };
  }, [selected?.id]);

  // Preview = the exact renderer used for export, at the screenshot's own density.
  useEffect(() => {
    if (!bitmap || !selected || !canvasRef.current) return;
    const raf = requestAnimationFrame(() => {
      const out = renderShot(bitmap, settings, { density: selected.density, scale: selected.density, url: selected.url });
      const canvas = canvasRef.current!;
      canvas.width = out.width;
      canvas.height = out.height;
      canvas.getContext('bitmaprenderer')!.transferFromImageBitmap(out.transferToImageBitmap());
    });
    return () => cancelAnimationFrame(raf);
  }, [bitmap, settings]);

  // Save the style with the screenshot, and remember it for the next one.
  useEffect(() => {
    if (!selected) return;
    const t = setTimeout(() => {
      void updateCapture(selected.id, { settings });
      try {
        localStorage.setItem(LAST_SETTINGS, JSON.stringify(settings));
      } catch {
        /* storage unavailable */
      }
    }, 300);
    return () => clearTimeout(t);
  }, [settings]);

  const set = <K extends keyof ShotSettings>(key: K, value: ShotSettings[K]) => setSettings((s) => ({ ...s, [key]: value }));

  const exportBlob = () => renderShot(bitmap!, settings, { density: selected!.density, scale: exportScale, url: selected!.url }).convertToBlob({ type: 'image/png' });

  const flash = (text: string) => {
    setStatus(text);
    setTimeout(() => setStatus((s) => (s === text ? '' : s)), 2000);
  };

  // Save to Downloads, then free the space here once the file is safely written.
  const download = async () => {
    const c = selected!;
    setSaving(true);
    const result = await saveToDownloads(await exportBlob(), fileName(c, exportScale));
    setSaving(false);
    if (result !== 'complete') return flash('Download didn’t finish. The screenshot is still here.');
    if (keep) return flash('Saved to Downloads');
    await deleteCapture(c.id);
    history.replaceState(null, '', '#');
    setSelectedId('');
    await reload();
    flash('Saved to Downloads and removed from Stylus');
  };

  const copy = async () => {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': exportBlob() })]);
      flash('Copied to clipboard');
    } catch (e) {
      flash(`Couldn’t copy: ${e instanceof Error ? e.message : e}`);
    }
  };

  const choose = (id: string) => {
    history.replaceState(null, '', `#${id}`);
    setSelectedId(id);
  };

  if (!items) return null;

  return (
    <div class="app">
      {status && (
        <div class="status toast" role="status">
          {status}
        </div>
      )}
      <aside class="list">
        <header class="brand">
          <img src="/icon/logo.svg" alt="" width={22} height={22} />
          <span>Screenshots</span>
          <a class="storage-link" href="/options.html">Storage</a>
        </header>
        {items.length === 0 ? (
          <p class="empty">No screenshots yet. Open Stylus on a page, click the camera, and pick an element or the visible tab.</p>
        ) : (
          <ul>
            {items.map((c) => (
              <li key={c.id}>
                <button class={`item ${c.id === selected?.id ? 'on' : ''}`} onClick={() => choose(c.id)} title={c.title}>
                  <img src={thumbs.get(c.id)} alt="" />
                  <span>{c.title}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      {selected ? (
        <>
          <main class="stage">
            <div class="toolbar">
              <span class="title" title={selected.title}>
                {selected.title}
              </span>
              <div class="seg" role="group" aria-label="Export size">
                {[1, 2].map((n) => (
                  <button key={n} class={exportScale === n ? 'on' : ''} onClick={() => setExportScale(n)}>
                    {n}×
                  </button>
                ))}
              </div>
              <button class="btn" onClick={copy} disabled={!bitmap}>
                Copy
              </button>
              <button class="btn primary" onClick={download} disabled={!bitmap || saving}>
                {saving ? 'Saving…' : 'Download PNG'}
              </button>
            </div>
            <div class="canvas-wrap">
              <canvas ref={canvasRef} class="preview" aria-label="Styled screenshot preview" />
            </div>
          </main>

          <aside class="inspector">
            <Section title="Background">
              <div class="swatches">
                {GRADIENTS.map((g) => (
                  <button
                    key={g.id}
                    class={`swatch ${sameBg(settings.background, { kind: 'gradient', id: g.id }) ? 'on' : ''}`}
                    style={swatchStyle(g.id)}
                    title={g.name}
                    aria-label={g.name}
                    onClick={() => set('background', { kind: 'gradient', id: g.id })}
                  />
                ))}
                <button
                  class={`swatch blur ${settings.background.kind === 'blur' ? 'on' : ''}`}
                  style={{ backgroundImage: `url(${thumbs.get(selected.id)})` }}
                  title="Blurred screenshot"
                  aria-label="Blurred screenshot"
                  onClick={() => set('background', { kind: 'blur' })}
                />
                <button
                  class={`swatch none ${settings.background.kind === 'none' ? 'on' : ''}`}
                  title="Transparent"
                  aria-label="Transparent"
                  onClick={() => set('background', { kind: 'none' })}
                />
              </div>
              <div class="swatches small">
                {SOLIDS.map((c) => (
                  <button
                    key={c}
                    class={`swatch ${sameBg(settings.background, { kind: 'solid', color: c }) ? 'on' : ''}`}
                    style={{ background: c }}
                    title={c}
                    aria-label={`Solid ${c}`}
                    onClick={() => set('background', { kind: 'solid', color: c })}
                  />
                ))}
                <label class="swatch custom" title="Custom color">
                  <input
                    type="color"
                    aria-label="Custom background color"
                    value={settings.background.kind === 'solid' ? settings.background.color : '#ffffff'}
                    onInput={(e) => set('background', { kind: 'solid', color: e.currentTarget.value })}
                  />
                </label>
              </div>
            </Section>

            <Section title="Frame">
              <div class="chips">
                {FRAMES.map((f) => (
                  <button key={f.id} class={settings.frame === f.id ? 'on' : ''} onClick={() => set('frame', f.id)}>
                    {f.label}
                  </button>
                ))}
              </div>
            </Section>

            <Section title="Size">
              <div class="chips">
                {ASPECTS.map((a) => (
                  <button key={a.id} class={settings.aspect === a.id ? 'on' : ''} title={a.hint} onClick={() => set('aspect', a.id)}>
                    {a.label}
                  </button>
                ))}
              </div>
              <p class="hint">{ASPECTS.find((a) => a.id === settings.aspect)?.hint}</p>
            </Section>

            <Section title="Layout">
              <Slider label="Padding" value={settings.padding} min={0} max={25} onChange={(v) => set('padding', v)} suffix="%" />
              <Slider label="Corners" value={settings.radius} min={0} max={40} onChange={(v) => set('radius', v)} suffix="px" />
              <div class="row stacked">
                <span class="label">Shadow</span>
                <div class="seg full">
                  {(['none', 'soft', 'medium', 'strong'] as Shadow[]).map((s) => (
                    <button key={s} class={settings.shadow === s ? 'on' : ''} onClick={() => set('shadow', s)}>
                      {s[0].toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </Section>

            <Section title="Effects">
              <label class="toggle">
                <input type="checkbox" checked={settings.glass} onChange={(e) => set('glass', e.currentTarget.checked)} />
                Glass edge
              </label>
              <label class="toggle">
                <input type="checkbox" checked={settings.grain} onChange={(e) => set('grain', e.currentTarget.checked)} />
                Grain
              </label>
              <input
                class="text"
                placeholder="Watermark, e.g. @yourname"
                value={settings.watermark}
                onInput={(e) => set('watermark', e.currentTarget.value)}
                aria-label="Watermark"
              />
            </Section>

            <label class="toggle keep" title="Otherwise the screenshot is removed from Stylus once it is in your Downloads folder">
              <input
                type="checkbox"
                checked={keep}
                onChange={(e) => {
                  setKeep(e.currentTarget.checked);
                  setKeepAfterDownload(e.currentTarget.checked);
                }}
              />
              Keep a copy in Stylus after downloading
            </label>
            <div class="footer">
              <button class="link" onClick={() => setSettings(DEFAULT_SETTINGS)}>
                Reset style
              </button>
              {confirmDelete ? (
                <span class="confirm">
                  Delete?
                  <button
                    class="btn danger"
                    onClick={async () => {
                      await deleteCapture(selected.id);
                      history.replaceState(null, '', '#');
                      setSelectedId('');
                      await reload();
                    }}
                  >
                    Delete
                  </button>
                  <button class="btn" onClick={() => setConfirmDelete(false)}>
                    Keep
                  </button>
                </span>
              ) : (
                <button class="link danger" onClick={() => setConfirmDelete(true)}>
                  Delete screenshot
                </button>
              )}
            </div>
          </aside>
        </>
      ) : (
        <main class="stage placeholder">Your screenshots will appear here.</main>
      )}
    </div>
  );
}

function Section(props: { title: string; children: preact.ComponentChildren }) {
  return (
    <section class="section">
      <h2>{props.title}</h2>
      {props.children}
    </section>
  );
}

function Slider(props: { label: string; value: number; min: number; max: number; suffix: string; onChange: (v: number) => void }) {
  return (
    <label class="row">
      <span class="label">{props.label}</span>
      <input type="range" min={props.min} max={props.max} value={props.value} onInput={(e) => props.onChange(Number(e.currentTarget.value))} />
      <span class="value">
        {props.value}
        {props.suffix}
      </span>
    </label>
  );
}

render(<App />, document.getElementById('app')!);
