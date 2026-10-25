import { describe, expect, it } from 'vitest';
import { aiEditsToOps, compileCss, History, parseRule, setStyle, setText, toggleHide, togglePreset, type EditOp } from '../src';

describe('setStyle', () => {
  it('merges props for the same selector into one op', () => {
    let ops: EditOp[] = [];
    ops = setStyle(ops, '.card', 'color', 'red', { before: 'black' });
    ops = setStyle(ops, '.card', 'padding', '8px');
    ops = setStyle(ops, '.card', 'color', 'blue', { before: 'red' });
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ kind: 'style', props: { color: 'blue', padding: '8px' }, before: { color: 'black' } });
  });

  it('removes the op once every prop is cleared', () => {
    let ops = setStyle([], '.a', 'color', 'red');
    ops = setStyle(ops, '.a', 'color', '');
    expect(ops).toEqual([]);
  });

  it('keeps scoped edits separate', () => {
    let ops = setStyle([], '.a', 'color', 'red');
    ops = setStyle(ops, '.a', 'color', 'blue', { scope: { state: 'hover' } });
    expect(ops).toHaveLength(2);
  });
});

describe('compileCss', () => {
  it('compiles style, hide, scopes and skips disabled ops', () => {
    let ops = setStyle([], '.a', 'color', 'red');
    ops = setStyle(ops, '.a', 'color', 'blue', { scope: { state: 'hover', media: '(max-width: 600px)' } });
    ops = toggleHide(ops, '#ad');
    ops = toggleHide(ops, '#gone');
    ops = ops.map((op) => (op.kind === 'hide' && op.selector === '#gone' ? { ...op, disabled: true } : op));
    const css = compileCss(ops);
    expect(css).toContain('.a {\n  color: red !important;\n}');
    expect(css).toContain('@media (max-width: 600px) {\n.a:hover, .a.__stylus-force-hover {');
    expect(css).toContain('#ad { display: none !important; }');
    expect(css).not.toContain('#gone');
  });

  it('stacks filter presets into a single declaration', () => {
    let ops = togglePreset([], 'sepia');
    ops = togglePreset(ops, 'dim');
    const css = compileCss(ops);
    expect(css.match(/html \{ filter:/g)).toHaveLength(1);
    expect(css).toContain('sepia(0.35)');
    expect(css).toContain('brightness(0.82)');
    expect(compileCss(togglePreset(ops, 'dim'))).not.toContain('brightness(0.82)');
  });
});

describe('setText', () => {
  it('drops the op when text is restored to the original', () => {
    let ops = setText([], 'h1', 'Hello', false, 'Hi');
    expect(ops).toHaveLength(1);
    ops = setText(ops, 'h1', 'Hi', false);
    expect(ops).toEqual([]);
  });
});

describe('History', () => {
  it('coalesces commits with the same key', () => {
    const h = new History<number>(0);
    h.commit(1, 'w', 0);
    h.commit(2, 'w', 100);
    h.commit(3, 'w', 200);
    h.commit(4, 'x', 300);
    expect(h.undo()).toBe(3);
    expect(h.undo()).toBe(0);
    expect(h.redo()).toBe(3);
  });
});

describe('parseRule', () => {
  it('keeps valid ops and drops invalid ones', () => {
    const rule = parseRule('https://x.com', {
      ops: [{ id: '1', at: 1, kind: 'hide', selector: '#a' }, { kind: 'nope' }],
    });
    expect(rule.ops).toHaveLength(1);
    expect(rule.ops[0]).toMatchObject({ kind: 'hide', mode: 'display', by: 'user' });
  });
});

describe('aiEditsToOps', () => {
  const edit = (e: Partial<import('../src').AiEdit>): import('../src').AiEdit => ({
    kind: 'style', selector: '', declarations: [], text: '', css: '', preset: '', ...e,
  });

  it('converts each edit kind into an AI-authored op', () => {
    const ops = aiEditsToOps({
      summary: 'x',
      edits: [
        edit({ selector: '.card', declarations: [{ property: 'Background-Color', value: ' #111 ' }] }),
        edit({ kind: 'hide', selector: '#ad' }),
        edit({ kind: 'text', selector: 'h1', text: 'Hi' }),
        edit({ kind: 'rawCss', css: 'p { color: red }' }),
        edit({ kind: 'preset', preset: 'sepia' }),
      ],
    });
    expect(ops.map((o) => o.kind)).toEqual(['style', 'hide', 'text', 'rawCss', 'preset']);
    expect(ops.every((o) => o.by === 'ai')).toBe(true);
    expect(ops[0]).toMatchObject({ selector: '.card', props: { 'background-color': '#111' } });
  });

  it('drops empty, unknown and invalid edits', () => {
    const ops = aiEditsToOps(
      {
        summary: 'x',
        edits: [
          edit({ selector: '.a', declarations: [] }),
          edit({ kind: 'hide', selector: '' }),
          edit({ kind: 'preset', preset: 'neon' }),
          edit({ kind: 'rawCss', css: '  ' }),
          edit({ kind: 'hide', selector: '!!bad' }),
          edit({ kind: 'hide', selector: '#ok' }),
        ],
      },
      (s) => !s.startsWith('!'),
    );
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ kind: 'hide', selector: '#ok' });
  });
});
