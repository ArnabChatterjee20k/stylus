/**
 * Save a file to the user's Downloads folder and report whether it really finished, so callers
 * only remove their stored copy once the file is safely on disk (not when a save was cancelled).
 */
export type SaveResult = 'complete' | 'interrupted';

const KEEP_KEY = 'stylus:keep-after-download';

/** Whether to keep a copy in Stylus after downloading. Off by default, so storage doesn't pile up. */
export function keepAfterDownload(): boolean {
  try {
    return localStorage.getItem(KEEP_KEY) === '1';
  } catch {
    return false;
  }
}

export function setKeepAfterDownload(keep: boolean) {
  try {
    localStorage.setItem(KEEP_KEY, keep ? '1' : '0');
  } catch {
    /* storage unavailable */
  }
}

export async function saveToDownloads(blob: Blob, filename: string): Promise<SaveResult> {
  const url = URL.createObjectURL(blob);
  try {
    const id = await chrome.downloads.download({ url, filename, conflictAction: 'uniquify' });
    return await new Promise<SaveResult>((resolve) => {
      const done = (state: SaveResult) => {
        chrome.downloads.onChanged.removeListener(onChanged);
        resolve(state);
      };
      const onChanged = (delta: chrome.downloads.DownloadDelta) => {
        if (delta.id !== id || !delta.state) return;
        if (delta.state.current === 'complete') done('complete');
        if (delta.state.current === 'interrupted') done('interrupted');
      };
      chrome.downloads.onChanged.addListener(onChanged);
      // It may have finished before the listener was attached (small files).
      chrome.downloads.search({ id }).then(([item]) => {
        if (item?.state === 'complete') done('complete');
        if (item?.state === 'interrupted') done('interrupted');
      });
    });
  } catch {
    return 'interrupted';
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

/** Filenames: keep it readable but safe for every OS. */
export const safeName = (title: string, fallback: string) => title.replace(/[^\w\- .@]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 120) || fallback;

export const formatBytes = (bytes: number) =>
  bytes >= 1e9 ? `${(bytes / 1e9).toFixed(2)} GB` : bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : bytes >= 1e3 ? `${Math.round(bytes / 1e3)} KB` : `${bytes} B`;
