/**
 * Saving a received file to the device.
 *
 * The previous implementation created an `<a download>` and clicked it the
 * instant a file finished, with no user gesture. That is why photos "would not
 * open" on iPhone: iOS Safari ignores `download` for a programmatic click and
 * navigates to the Blob instead, replacing the page -- and for a multi-file
 * transfer every click after the first is blocked as a popup.
 *
 * So: nothing is ever saved automatically. Every save runs inside a real user
 * gesture, and on platforms where `download` is unreliable we offer the
 * system share sheet ("Save to Files", "Save Image") instead of pretending.
 */

import { log } from '../lib/logger';
import { sanitizeFilename } from './mime';

/** iOS/iPadOS, including iPadOS reporting itself as a Mac with touch. */
export function isAppleMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

/** Whether the system share sheet can take this file. */
export function canShareFile(blob: Blob, filename: string): boolean {
  if (typeof navigator === 'undefined' || !navigator.canShare || !navigator.share) return false;
  try {
    const file = new File([blob], sanitizeFilename(filename), {
      type: blob.type || 'application/octet-stream',
    });
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export type SaveOutcome = 'saved' | 'shared' | 'opened-in-tab' | 'cancelled' | 'failed';

/**
 * Hand a file to the OS. Must be called synchronously from a user gesture
 * (click/tap) or the browser will block it.
 */
export async function saveFile(
  _blob: Blob,
  filename: string,
  objectUrl: string,
): Promise<SaveOutcome> {
  const name = sanitizeFilename(filename);

  // Anchor download: correct on desktop and on Android Chrome, and on iOS 13+
  // *when triggered by a gesture*, which is the case here.
  try {
    const a = document.createElement('a');
    if ('download' in a) {
      a.href = objectUrl;
      a.download = name;
      a.rel = 'noopener';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
      return 'saved';
    }
  } catch (err) {
    log.app.warn('anchor download failed', err);
  }

  // Very old engines without the download attribute: opening the Blob in a new
  // tab at least lets the user save it by hand.
  try {
    const opened = window.open(objectUrl, '_blank');
    if (opened) return 'opened-in-tab';
  } catch {
    /* fall through */
  }
  return 'failed';
}

/** Offer the file to the system share sheet. Gesture-bound, like `saveFile`. */
export async function shareFile(blob: Blob, filename: string): Promise<SaveOutcome> {
  const name = sanitizeFilename(filename);
  try {
    const file = new File([blob], name, { type: blob.type || 'application/octet-stream' });
    await navigator.share({ files: [file], title: name });
    return 'shared';
  } catch (err) {
    // The user dismissing the sheet throws AbortError; that is not a failure.
    if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
    log.app.warn('share failed', err);
    return 'failed';
  }
}

/**
 * Object URLs pin their Blob in memory (and on disk) until revoked. Leaking
 * them was a real contributor to the tab running out of memory after a few
 * large transfers, so every URL we create is owned by one of these and
 * released on teardown.
 */
export class ObjectUrlRegistry {
  private urls = new Set<string>();

  create(blob: Blob): string {
    const url = URL.createObjectURL(blob);
    this.urls.add(url);
    return url;
  }

  release(url: string): void {
    if (!this.urls.delete(url)) return;
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  }

  releaseAll(): void {
    for (const url of this.urls) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        /* ignore */
      }
    }
    this.urls.clear();
  }

  get size(): number {
    return this.urls.size;
  }
}
