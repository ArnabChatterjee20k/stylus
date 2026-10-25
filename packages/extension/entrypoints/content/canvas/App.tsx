import { useEffect } from 'preact/hooks';
import { hasPreset } from '@stylus/shared';
import { ops, panels, recording, scope, selection, tool, uiHost } from '../engine/store';
import { Changes } from '../panels/Changes';
import { Design } from '../panels/Design';
import { Layers } from '../panels/Layers';
import { Theme } from '../panels/Theme';
import { BottomBar } from './BottomBar';
import { Guides } from './Guides';
import { Handles } from './Handles';
import { Overlay } from './Overlay';
import { RecordingLayer } from './RecordingLayer';
import { Toolbar } from './Toolbar';

const CANVAS_CSS = `
html.__stylus-editing, html.__stylus-editing * { cursor: default !important; }
html.__stylus-tool-zap, html.__stylus-tool-zap * { cursor: crosshair !important; }
html.__stylus-tool-text, html.__stylus-tool-text * { cursor: text !important; }
html.__stylus-recording, html.__stylus-recording * { cursor: none !important; }
[data-stylus-editing] { outline: 2px solid #0d99ff !important; outline-offset: 2px !important; cursor: text !important; }
`;

export function App({ onExit }: { onExit: () => void }) {
  // Page-side helper styles (cursors, text-edit outline) that live outside our shadow root.
  useEffect(() => {
    const style = document.createElement('style');
    style.id = '__stylus-canvas';
    style.textContent = CANVAS_CSS;
    document.documentElement.appendChild(style);
    return () => style.remove();
  }, []);

  const t = tool.value;
  useEffect(() => {
    const cl = document.documentElement.classList;
    cl.remove('__stylus-tool-zap', '__stylus-tool-text');
    if (t !== 'select') cl.add(`__stylus-tool-${t}`);
    return () => cl.remove('__stylus-tool-zap', '__stylus-tool-text');
  }, [t]);

  // The dark preset inverts <html>, which includes our UI: invert it back so panels look normal.
  const dark = hasPreset(ops.value, 'dark');
  useEffect(() => {
    const host = uiHost.value;
    // Set via an attribute + :host rule: inline styles on the host lose to WXT's `all: initial !important` reset.
    host?.toggleAttribute('data-dark', dark);
  }, [dark]);

  // Force :hover/:focus/:active styling on the selection while that state scope is chosen.
  const state = scope.value.state;
  const els = selection.value?.els;
  useEffect(() => {
    if (!state || !els) return;
    const cls = `__stylus-force-${state}`;
    els.forEach((el) => el.classList.add(cls));
    return () => els.forEach((el) => el.classList.remove(cls));
  }, [state, els]);

  // While recording, only the recording layer shows: the editing UI would end up in the video.
  if (recording.value) {
    return (
      <div class="root">
        <RecordingLayer />
      </div>
    );
  }

  return (
    <div class="root">
      <Overlay />
      <Handles />
      {/* After the handles, so distance labels are never hidden under one. */}
      <Guides />
      <Toolbar onExit={onExit} />
      {panels.value.layers && <Layers />}
      {panels.value.design && <Design />}
      {panels.value.theme && <Theme />}
      {panels.value.changes && <Changes />}
      <BottomBar />
    </div>
  );
}
