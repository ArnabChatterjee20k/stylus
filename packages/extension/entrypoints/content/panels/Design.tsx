import { useMemo, useState } from 'preact/hooks';
import { setSiteCss, setStyles, siteCss, stylesFor } from '@stylus/shared';
import { editStyle } from '../canvas/actions';
import { commit, ops, scope, select, selection } from '../engine/store';
import { pageFonts, pagePalette } from '../lib/dom';
import { AlignGrid, BoxModel, ColorField, Scrub, Section, Segmented, Select, TextField } from './controls';
import { Panel } from './Panel';

const SHADOWS: [string, string][] = [
  ['none', 'None'],
  ['0 1px 2px rgba(0,0,0,.08)', 'XS'],
  ['0 2px 8px rgba(0,0,0,.12)', 'S'],
  ['0 8px 24px rgba(0,0,0,.16)', 'M'],
  ['0 20px 48px rgba(0,0,0,.22)', 'L'],
];

let paletteCache: string[] | null = null;
let fontsCache: string[] | null = null;

export function Design() {
  const [tab, setTab] = useState<'design' | 'css'>('design');
  return (
    <Panel
      id="design"
      title="Design"
      width={280}
      initial={() => ({ x: innerWidth - 292, y: 64 })}
      actions={<Segmented value={tab} onChange={(v) => setTab(v as 'design' | 'css')} options={[{ value: 'design', label: 'Design' }, { value: 'css', label: 'CSS' }]} />}
    >
      {tab === 'design' ? <DesignTab /> : <CssTab />}
    </Panel>
  );
}

function SelectorBar() {
  const sel = selection.value!;
  return (
    <div class="selector-bar">
      <TextField
        mono
        value={sel.selector}
        onChange={(v) => {
          try {
            const els = Array.from(document.querySelectorAll(v));
            if (els.length) select(els, v);
          } catch {
            /* keep previous selection on invalid selector */
          }
        }}
      />
      <span class="count">{sel.els.length > 1 ? `${sel.els.length}×` : ''}</span>
    </div>
  );
}

function DesignTab() {
  const sel = selection.value;
  const el = sel?.els.find((e) => e.isConnected);
  const palette = useMemo(() => (paletteCache ??= pagePalette()), []);
  const fonts = useMemo(() => (fontsCache ??= pageFonts()), []);
  // Read `ops` so the panel re-renders (and re-reads computed styles) after every edit.
  const overrides = sel ? stylesFor(ops.value, sel.selector, scope.value.media || scope.value.state ? scope.value : undefined) : {};

  if (!sel || !el) return <div class="empty">Select an element on the page to edit its design.<br />Hover and click, or pick from Layers.</div>;

  const cs = getComputedStyle(el);
  const get = (prop: string) => overrides[prop] ?? cs.getPropertyValue(prop);
  const set = editStyle;
  const display = get('display');
  const isFlex = display.includes('flex');
  const isGrid = display.includes('grid');
  const rect = el.getBoundingClientRect();

  return (
    <div class="design">
      <SelectorBar />

      <Section title="Layout">
        <div class="grid2">
          <Select label="Display" value={display} options={['block', 'flex', 'grid', 'inline', 'inline-block', 'inline-flex', 'contents', 'none']} onChange={(v) => set('display', v)} />
          <Select label="Position" value={get('position')} options={['static', 'relative', 'absolute', 'fixed', 'sticky']} onChange={(v) => set('position', v)} />
        </div>
        {isFlex && (
          <div class="flex-controls">
            <AlignGrid direction={get('flex-direction')} justify={get('justify-content')} align={get('align-items')} onChange={(j, a) => {
              set('justify-content', j);
              set('align-items', a);
            }} />
            <div class="stack">
              <Segmented
                value={get('flex-direction')}
                onChange={(v) => set('flex-direction', v)}
                options={[
                  { value: 'row', label: '→', title: 'Row' },
                  { value: 'column', label: '↓', title: 'Column' },
                  { value: 'row-reverse', label: '←', title: 'Row reverse' },
                  { value: 'column-reverse', label: '↑', title: 'Column reverse' },
                ]}
              />
              <Scrub label="Gap" value={get('gap') === 'normal' ? '0px' : get('gap')} onChange={(v) => set('gap', v)} min={0} />
              <Segmented value={get('flex-wrap')} onChange={(v) => set('flex-wrap', v)} options={[{ value: 'nowrap', label: 'No wrap' }, { value: 'wrap', label: 'Wrap' }]} />
            </div>
          </div>
        )}
        {isGrid && (
          <div class="grid2">
            <TextField label="Columns" mono value={get('grid-template-columns')} onChange={(v) => set('grid-template-columns', v)} />
            <Scrub label="Gap" value={get('gap') === 'normal' ? '0px' : get('gap')} onChange={(v) => set('gap', v)} min={0} />
          </div>
        )}
        {get('position') !== 'static' && (
          <div class="grid4">
            <Scrub label="T" value={get('top')} onChange={(v) => set('top', v)} />
            <Scrub label="R" value={get('right')} onChange={(v) => set('right', v)} />
            <Scrub label="B" value={get('bottom')} onChange={(v) => set('bottom', v)} />
            <Scrub label="L" value={get('left')} onChange={(v) => set('left', v)} />
          </div>
        )}
      </Section>

      <Section
        title="Size"
        actions={
          <span class="mini-actions">
            <button title="Fill container width" onClick={() => set('width', '100%')}>Fill</button>
            <button title="Hug contents" onClick={() => set('width', 'fit-content')}>Hug</button>
            <button title="Reset width/height" onClick={() => { set('width', ''); set('height', ''); }}>Reset</button>
          </span>
        }
      >
        <div class="grid2">
          <Scrub label="W" value={overrides.width ?? `${Math.round(rect.width)}px`} onChange={(v) => set('width', v)} min={0} />
          <Scrub label="H" value={overrides.height ?? `${Math.round(rect.height)}px`} onChange={(v) => set('height', v)} min={0} />
          <Scrub label="Min W" value={get('min-width')} onChange={(v) => set('min-width', v)} min={0} />
          <Scrub label="Max W" value={get('max-width')} onChange={(v) => set('max-width', v)} min={0} />
        </div>
        <div class="grid2">
          <Select label="Overflow" value={get('overflow')} options={['visible', 'hidden', 'auto', 'scroll', 'clip']} onChange={(v) => set('overflow', v)} />
          <Scrub label="Z" value={get('z-index')} unit="" onChange={(v) => set('z-index', v)} title="z-index" />
        </div>
      </Section>

      <Section title="Spacing">
        <BoxModel get={get} onChange={set} size={`${Math.round(rect.width)} × ${Math.round(rect.height)}`} />
      </Section>

      <Section title="Typography">
        <Select label="Font" value={get('font-family').split(',')[0].replace(/["']/g, '').trim()} options={fonts} onChange={(v) => set('font-family', /\s/.test(v) ? `"${v}"` : v)} />
        <div class="grid2">
          <Scrub label="Size" value={get('font-size')} onChange={(v) => set('font-size', v)} min={1} />
          <Select label="Weight" value={get('font-weight')} options={['100', '200', '300', '400', '500', '600', '700', '800', '900']} onChange={(v) => set('font-weight', v)} />
          <Scrub label="Line" value={get('line-height')} unit="" step={0.05} onChange={(v) => set('line-height', v)} title="Line height (unitless or px)" />
          <Scrub label="Letter" value={get('letter-spacing') === 'normal' ? '0px' : get('letter-spacing')} step={0.1} onChange={(v) => set('letter-spacing', v)} />
        </div>
        <ColorField label="Color" value={get('color')} palette={palette} onChange={(v) => set('color', v)} />
        <div class="grid2">
          <Segmented
            value={get('text-align')}
            onChange={(v) => set('text-align', v)}
            options={[
              { value: 'left', label: '⇤' },
              { value: 'center', label: '↔' },
              { value: 'right', label: '⇥' },
              { value: 'justify', label: '≡' },
            ]}
          />
          <Select label="Case" value={get('text-transform')} options={['none', 'uppercase', 'lowercase', 'capitalize']} onChange={(v) => set('text-transform', v)} />
        </div>
      </Section>

      <Section title="Fill">
        <ColorField label="Background" value={get('background-color')} palette={palette} onChange={(v) => set('background-color', v)} />
        <TextField label="Image / gradient" mono value={get('background-image')} placeholder="linear-gradient(…)" onChange={(v) => set('background-image', v)} />
        <Scrub label="Opacity" value={get('opacity')} unit="" step={0.05} min={0} max={1} onChange={(v) => set('opacity', v)} wide />
      </Section>

      <Section title="Border">
        <div class="grid2">
          <Scrub label="Width" value={get('border-top-width')} onChange={(v) => set('border-width', v)} min={0} />
          <Select label="Style" value={get('border-top-style')} options={['none', 'solid', 'dashed', 'dotted', 'double']} onChange={(v) => set('border-style', v)} />
        </div>
        <ColorField label="Color" value={get('border-top-color')} palette={palette} onChange={(v) => set('border-color', v)} />
        <Scrub label="Radius" value={get('border-top-left-radius')} onChange={(v) => set('border-radius', v)} min={0} wide />
      </Section>

      <Section title="Effects">
        <Select label="Shadow" value={get('box-shadow')} options={SHADOWS} onChange={(v) => set('box-shadow', v)} />
        <div class="grid2">
          <Scrub label="Blur" value={(get('filter').match(/blur\(([^)]+)\)/) ?? [, '0px'])[1]!} onChange={(v) => set('filter', Number.parseFloat(v) ? `blur(${v})` : 'none')} min={0} />
          <Scrub label="Backdrop" value={(get('backdrop-filter').match(/blur\(([^)]+)\)/) ?? [, '0px'])[1]!} onChange={(v) => set('backdrop-filter', Number.parseFloat(v) ? `blur(${v})` : 'none')} min={0} title="Backdrop blur (frosted glass)" />
        </div>
        <Select label="Blend" value={get('mix-blend-mode')} options={['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'difference', 'luminosity']} onChange={(v) => set('mix-blend-mode', v)} />
        <Select label="Cursor" value={get('cursor')} options={['auto', 'default', 'pointer', 'text', 'grab', 'not-allowed']} onChange={(v) => set('cursor', v)} />
      </Section>
    </div>
  );
}

const toText = (props: Record<string, string>) => Object.entries(props).map(([k, v]) => `${k}: ${v};`).join('\n');

function parseDecls(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of text.split(';')) {
    const i = part.indexOf(':');
    if (i === -1) continue;
    const k = part.slice(0, i).trim().toLowerCase();
    const v = part.slice(i + 1).trim();
    if (k && v) out[k] = v;
  }
  return out;
}

function CssTab() {
  const sel = selection.value;
  const sc = scope.value.media || scope.value.state ? scope.value : undefined;
  const current = sel ? stylesFor(ops.value, sel.selector, sc) : {};
  const [draft, setDraft] = useState<string | null>(null);
  const site = siteCss(ops.value);

  const applyElement = () => {
    if (!sel || draft === null) return;
    const next = parseDecls(draft);
    const cleared = Object.fromEntries(Object.keys(current).filter((k) => !(k in next)).map((k) => [k, '']));
    commit(setStyles(ops.value, sel.selector, { ...cleared, ...next }, { scope: sc }));
    setDraft(null);
  };

  return (
    <div class="css-tab">
      {sel ? (
        <>
          <div class="css-label">
            Element <code>{sel.selector}</code>
            {sc && <em> · {[sc.state && `:${sc.state}`, sc.media].filter(Boolean).join(' ')}</em>}
          </div>
          <textarea
            class="code"
            rows={8}
            spellcheck={false}
            placeholder="color: tomato;&#10;padding: 12px;"
            value={draft ?? toText(current)}
            onInput={(e) => setDraft(e.currentTarget.value)}
            onBlur={applyElement}
            onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && applyElement()}
          />
        </>
      ) : (
        <div class="empty">Select an element to write CSS for it.</div>
      )}
      <div class="css-label">Whole site · {location.host}</div>
      <textarea
        class="code"
        rows={12}
        spellcheck={false}
        placeholder="/* Any CSS, applied live to every page on this site */"
        value={site}
        onInput={(e) => commit(setSiteCss(ops.value, e.currentTarget.value), 'site-css')}
      />
    </div>
  );
}
