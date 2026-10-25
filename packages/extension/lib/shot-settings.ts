/** How a screenshot is presented: background, frame, layout and effects. Stored with each capture. */

export type Background =
  | { kind: 'gradient'; id: string }
  | { kind: 'solid'; color: string }
  | { kind: 'blur' }
  | { kind: 'none' };

export type Frame = 'none' | 'mac-light' | 'mac-dark' | 'browser-light' | 'browser-dark';
export type Shadow = 'none' | 'soft' | 'medium' | 'strong';
export type Aspect = 'auto' | '16:9' | '1:1' | '4:5' | '9:16' | '1.91:1' | '3:2';

export type ShotSettings = {
  background: Background;
  frame: Frame;
  aspect: Aspect;
  /** Space around the screenshot, as % of its longer side. */
  padding: number;
  /** Corner radius in CSS pixels of the original screenshot. */
  radius: number;
  shadow: Shadow;
  /** Thin light edge around the screenshot, like glass. */
  glass: boolean;
  grain: boolean;
  watermark: string;
};

export const DEFAULT_SETTINGS: ShotSettings = {
  background: { kind: 'gradient', id: 'candy' },
  frame: 'mac-light',
  aspect: 'auto',
  padding: 8,
  radius: 12,
  shadow: 'medium',
  glass: true,
  grain: false,
  watermark: '',
};

/** Linear gradients are [angle, ...stops]; mesh gradients layer soft radial blobs over a base. */
export type Gradient =
  | { id: string; name: string; type: 'linear'; angle: number; stops: string[] }
  | { id: string; name: string; type: 'mesh'; base: string; blobs: { x: number; y: number; r: number; color: string }[] };

export const GRADIENTS: Gradient[] = [
  { id: 'candy', name: 'Candy', type: 'linear', angle: 135, stops: ['#ff4d94', '#ffb86b'] },
  { id: 'grape', name: 'Grape', type: 'linear', angle: 135, stops: ['#7b61ff', '#ff4d94'] },
  { id: 'ocean', name: 'Ocean', type: 'linear', angle: 135, stops: ['#2193b0', '#6dd5ed'] },
  { id: 'mint', name: 'Mint', type: 'linear', angle: 135, stops: ['#43e97b', '#38f9d7'] },
  { id: 'sunset', name: 'Sunset', type: 'linear', angle: 135, stops: ['#ff7e5f', '#feb47b'] },
  { id: 'peach', name: 'Peach', type: 'linear', angle: 135, stops: ['#ffecd2', '#fcb69f'] },
  { id: 'midnight', name: 'Midnight', type: 'linear', angle: 135, stops: ['#0f2027', '#203a43', '#2c5364'] },
  { id: 'slate', name: 'Slate', type: 'linear', angle: 160, stops: ['#e2e8f0', '#94a3b8'] },
  {
    id: 'aurora',
    name: 'Aurora',
    type: 'mesh',
    base: '#0b1026',
    blobs: [
      { x: 0.15, y: 0.2, r: 0.7, color: '#7b61ff' },
      { x: 0.85, y: 0.3, r: 0.6, color: '#00d4ff' },
      { x: 0.5, y: 0.95, r: 0.7, color: '#ff4d94' },
    ],
  },
  {
    id: 'bloom',
    name: 'Bloom',
    type: 'mesh',
    base: '#fff1f5',
    blobs: [
      { x: 0.1, y: 0.1, r: 0.6, color: '#ffb3d1' },
      { x: 0.9, y: 0.2, r: 0.55, color: '#ffd6a5' },
      { x: 0.7, y: 0.95, r: 0.6, color: '#bdb2ff' },
    ],
  },
  {
    id: 'lagoon',
    name: 'Lagoon',
    type: 'mesh',
    base: '#e0fbfc',
    blobs: [
      { x: 0.0, y: 0.8, r: 0.7, color: '#98f5e1' },
      { x: 0.9, y: 0.1, r: 0.6, color: '#8ecae6' },
      { x: 0.5, y: 0.4, r: 0.4, color: '#caffbf' },
    ],
  },
];

export const SOLIDS = ['#ffffff', '#f4f4f5', '#18181b', '#000000', '#ff4d94', '#2563eb', '#16a34a', '#f59e0b'];

export const ASPECTS: { id: Aspect; label: string; hint: string; ratio: number | null }[] = [
  { id: 'auto', label: 'Auto', hint: 'Fit the screenshot', ratio: null },
  { id: '16:9', label: '16:9', hint: 'X / Twitter, YouTube', ratio: 16 / 9 },
  { id: '1.91:1', label: '1.91:1', hint: 'LinkedIn, link previews', ratio: 1.91 },
  { id: '1:1', label: '1:1', hint: 'Instagram post', ratio: 1 },
  { id: '4:5', label: '4:5', hint: 'Instagram portrait', ratio: 4 / 5 },
  { id: '9:16', label: '9:16', hint: 'Stories, Reels', ratio: 9 / 16 },
  { id: '3:2', label: '3:2', hint: 'Classic', ratio: 3 / 2 },
];

export const FRAMES: { id: Frame; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'mac-light', label: 'Window' },
  { id: 'mac-dark', label: 'Window dark' },
  { id: 'browser-light', label: 'Browser' },
  { id: 'browser-dark', label: 'Browser dark' },
];

export const SHADOWS: Record<Shadow, { blur: number; y: number; alpha: number }> = {
  none: { blur: 0, y: 0, alpha: 0 },
  soft: { blur: 24, y: 8, alpha: 0.18 },
  medium: { blur: 48, y: 18, alpha: 0.3 },
  strong: { blur: 80, y: 32, alpha: 0.45 },
};
