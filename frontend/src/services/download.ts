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

import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { log } from '../lib/logger';
import { sanitizeFilename } from './mime';

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const comma = dataUrl.indexOf(',');
      resolve(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** iOS/iPadOS, including iPadOS reporting itself as a Mac with touch. */
export function isAppleMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

/** Whether the system share sheet can take this file. */
export function canShareFile(blob: Blob, filename: string): boolean {
  if (typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform()) {
    return true;
  }
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

  // On native Android / iOS Capacitor platforms, write directly to user storage.
  if (typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform()) {
    try {
      const base64 = await blobToBase64(_blob);
      await Filesystem.writeFile({
        path: `Droply/${name}`,
        data: base64,
        directory: Directory.Documents,
        recursive: true,
      });
      return 'saved';
    } catch (err) {
      log.app.warn('saving to Documents/Droply failed, attempting root Documents', err);
      try {
        const base64 = await blobToBase64(_blob);
        await Filesystem.writeFile({
          path: name,
          data: base64,
          directory: Directory.Documents,
          recursive: true,
        });
        return 'saved';
      } catch (err2) {
        log.app.error('native filesystem write failed', err2);
      }
    }
  }

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

  // On native Android / iOS Capacitor platforms, use native share sheet.
  if (typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform()) {
    try {
      const base64 = await blobToBase64(blob);
      const writeResult = await Filesystem.writeFile({
        path: `droply-share/${name}`,
        data: base64,
        directory: Directory.Cache,
        recursive: true,
      });
      await Share.share({
        title: name,
        url: writeResult.uri,
      });
      return 'shared';
    } catch (err) {
      log.app.warn('native share failed', err);
      return 'failed';
    }
  }
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
