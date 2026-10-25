/** Messages between the content script, the background script and the offscreen recorder. */

/** The area to record, in CSS pixels relative to the viewport. */
export type Crop = { x: number; y: number; width: number; height: number; viewportWidth: number; viewportHeight: number; dpr: number };

export type RecordMode = 'element' | 'tab';

/** Content → background. */
export type RecStartRequest = { type: 'stylus:rec:start'; crop: Crop; mode: RecordMode; audio: boolean; title: string };
export type RecControlRequest = { type: 'stylus:rec:stop' | 'stylus:rec:pause' | 'stylus:rec:resume' | 'stylus:rec:cancel' };

/** Content → offscreen, sent directly (broadcast) while recording, as the target moves. */
export type RecCropUpdate = { type: 'rec:crop'; crop: Crop };

/** Background → offscreen. */
export type OffscreenStart = { target: 'offscreen'; type: 'start'; streamId: string; crop: Crop; audio: boolean; url: string; title: string };
export type OffscreenControl = { target: 'offscreen'; type: 'stop' | 'pause' | 'resume' | 'cancel' };

export type RecResult = { ok: true; id?: string } | { ok: false; error: string };

export const RECORDINGS_PAGE = '/recordings.html';
