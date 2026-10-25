/** Content → background: take a screenshot of the visible tab, cropped to `rect` (CSS px) if given. */
export type ShotRequest = {
  type: 'stylus:shot';
  rect: { x: number; y: number; width: number; height: number } | null;
  viewportWidth: number;
  title: string;
};

export type ShotResult = { ok: true; id: string } | { ok: false; error: string };

export const CAPTURE_PAGE = '/capture.html';
