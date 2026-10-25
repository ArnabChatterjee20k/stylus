import { useMemo, useState } from 'preact/hooks';
import { hasPreset, setStyle, stylesFor, togglePreset, type PresetName } from '@stylus/shared';
import { focusMode } from '../canvas/actions';
import { commit, ops } from '../engine/store';
import { pageFonts, pagePalette } from '../lib/dom';
import { ColorField, Scrub, Select } from './controls';
import { Panel } from './Panel';

const PRESETS: { name: PresetName; label: string; hint: string; swatch: string }[] = [
  { name: 'dark', label: 'Dark', hint: 'Smart invert, keeps images', swatch: '#1e1e1e' },
  { name: 'dim', label: 'Dim', hint: 'Lower brightness', swatch: '#8a8a8a' },
  { name: 'sepia', label: 'Sepia', hint: 'Paper-like warmth', swatch: '#e9dcc0' },
  { name: 'warm', label: 'Night', hint: 'Less blue light', swatch: '#f3c98b' },
  { name: 'grayscale', label: 'Mono', hint: 'Grayscale, fewer distractions', swatch: '#b5b5b5' },
  { name: 'contrast', label: 'Contrast', hint: 'Boost contrast', swatch: '#000' },
  { name: 'reading', label: 'Reading', hint: 'Comfortable line length & spacing', swatch: '#fdfaf3' },
];

const PAGE = 'html, body';
const TEXT_TARGETS = 'body :not(i, code, pre, kbd, samp, svg, svg *, [class*="icon" i], [class*="material" i], [aria-hidden="true"])';

export function Theme() {
  const [hidden, setHidden] = useState<number | null>(null);
  const palette = useMemo(() => pagePalette(), []);
  const fonts = useMemo(() => pageFonts(), []);
  const page = stylesFor(ops.value, PAGE);
  const body = stylesFor(ops.value, 'body');
  const links = stylesFor(ops.value, 'a');
  const text = stylesFor(ops.value, TEXT_TARGETS);
  const cs = getComputedStyle(document.body);

  const set = (selector: string, prop: string, value: string) => commit(setStyle(ops.value, selector, prop, value), `theme|${selector}|${prop}`);

  return (
    <Panel id="theme" title="Theme & comfort" width={280} initial={() => ({ x: 284, y: 64 })}>
      <div class="presets">
        {PRESETS.map((p) => (
          <button key={p.name} class={`preset ${hasPreset(ops.value, p.name) ? 'on' : ''}`} title={p.hint} onClick={() => commit(togglePreset(ops.value, p.name))}>
            <span class="preset-swatch" style={{ background: p.swatch }} />
            {p.label}
          </button>
        ))}
      </div>

      <div class="theme-block">
        <button
          class="btn wide"
          title="Hide cookie banners, ads, popups, sidebars and sticky bars"
          onClick={() => setHidden(focusMode())}
        >
          Focus mode: hide distractions
        </button>
        {hidden !== null && <div class="hint">{hidden ? `Hid ${hidden} elements. Review them in Changes.` : 'Nothing obvious to hide.'}</div>}
      </div>

      <div class="theme-block">
        <ColorField label="Page background" value={page['background-color'] ?? cs.backgroundColor} palette={palette} onChange={(v) => set(PAGE, 'background-color', v)} />
        <ColorField label="Text" value={body.color ?? cs.color} palette={palette} onChange={(v) => set('body', 'color', v)} />
        <ColorField label="Links" value={links.color ?? getComputedStyle(document.querySelector('a') ?? document.body).color} palette={palette} onChange={(v) => set('a', 'color', v)} />
      </div>

      <div class="theme-block">
        <Select
          label="Font"
          value={(text['font-family'] ?? '').replace(/["']/g, '') || 'Page default'}
          options={['Page default', ...fonts]}
          onChange={(v) => set(TEXT_TARGETS, 'font-family', v === 'Page default' ? '' : /\s/.test(v) ? `"${v}"` : v)}
        />
        <Scrub label="Zoom" value={body.zoom ?? '100%'} unit="%" step={5} min={50} max={300} onChange={(v) => set('body', 'zoom', v === '100%' ? '' : v)} wide title="Scale the whole page content" />
      </div>
    </Panel>
  );
}
