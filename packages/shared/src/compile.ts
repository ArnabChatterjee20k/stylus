import type { EditOp, PresetName, Scope } from './ops';

/** Elements that must keep their real colors when a filter-based theme inverts the page. */
const MEDIA = 'img, video, picture, canvas, iframe, svg image, [style*="background-image"]';

const READING_CSS = `body { line-height: 1.7 !important; }
:is(p, li, blockquote) { max-width: 72ch !important; font-size: max(1em, 17px) !important; }`;

/** Filters stack: combine all active filter presets into one `filter` declaration so they don't override each other. */
const FILTERS: Partial<Record<PresetName, string>> = {
  dark: 'invert(0.9) hue-rotate(180deg)',
  sepia: 'sepia(0.35) brightness(0.97) contrast(0.95)',
  dim: 'brightness(0.82) contrast(0.95)',
  grayscale: 'grayscale(1)',
  warm: 'sepia(0.15) saturate(0.9) hue-rotate(-8deg) brightness(0.96)',
  contrast: 'contrast(1.25)',
};

const STATE_SUFFIX = { hover: ':hover', focus: ':focus', active: ':active' } as const;

function scopedSelector(selector: string, scope?: Scope): string {
  if (!scope?.state) return selector;
  const suffix = STATE_SUFFIX[scope.state];
  // Apply to the real pseudo-class and to the forced-state class the canvas toggles while styling.
  return selector
    .split(',')
    .map((s) => s.trim())
    .flatMap((s) => [`${s}${suffix}`, `${s}.__stylus-force-${scope.state}`])
    .join(', ');
}

function wrapMedia(css: string, scope?: Scope): string {
  return scope?.media ? `@media ${scope.media} {\n${css}\n}` : css;
}

const decl = (props: Record<string, string>) =>
  Object.entries(props)
    .filter(([, v]) => v !== '')
    .map(([k, v]) => `  ${k}: ${v.replace(/\s*!important\s*$/, '')} !important;`)
    .join('\n');

/** Compile a list of ops into the single stylesheet Stylus injects into the page. */
export function compileCss(ops: EditOp[]): string {
  const active = ops.filter((op) => !op.disabled);
  const out: string[] = [];

  const presets = active.filter((op) => op.kind === 'preset').map((op) => op.name);
  const filters = presets.flatMap((p) => (FILTERS[p] ? [FILTERS[p]] : []));
  if (filters.length) out.push(`html { filter: ${filters.join(' ')} !important; }`);
  if (presets.includes('dark')) {
    out.push(`html { background: #fff !important; }\nhtml :is(${MEDIA}) { filter: invert(1) hue-rotate(180deg) !important; }`);
  }
  if (presets.includes('reading')) out.push(READING_CSS);

  for (const op of active) {
    switch (op.kind) {
      case 'style': {
        const body = decl(op.props);
        if (body) out.push(wrapMedia(`${scopedSelector(op.selector, op.scope)} {\n${body}\n}`, op.scope));
        break;
      }
      case 'hide':
        out.push(
          wrapMedia(
            `${op.selector} { ${op.mode === 'visibility' ? 'visibility: hidden' : 'display: none'} !important; }`,
            op.scope,
          ),
        );
        break;
      case 'rawCss':
        if (op.css.trim()) out.push(wrapMedia(op.css, op.scope));
        break;
      default:
        break;
    }
  }
  return out.join('\n\n');
}

/** Human-readable one-liner for an op, used in the Changes panel. */
export function describeOp(op: EditOp): string {
  switch (op.kind) {
    case 'style':
      return `Style ${op.selector} · ${Object.keys(op.props).join(', ')}`;
    case 'hide':
      return `Hidden ${op.selector}`;
    case 'text':
      return `Text ${op.selector} → “${op.text.replace(/<[^>]+>/g, '').slice(0, 40)}”`;
    case 'rawCss':
      return `Custom CSS (${op.css.split('\n').length} lines)`;
    case 'preset':
      return `Theme: ${op.name}`;
  }
}
