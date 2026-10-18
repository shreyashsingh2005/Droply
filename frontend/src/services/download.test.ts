import { describe, expect, it, vi } from 'vitest';
import { canShareFile, isAppleMobile, saveFile } from './download';
import { Capacitor } from '@capacitor/core';
import { Filesystem } from '@capacitor/filesystem';

vi.mock('@capacitor/filesystem', () => ({
  Filesystem: {
    writeFile: vi.fn().mockResolvedValue({ uri: 'file:///data/user/0/com.droply.app/files/test.txt' }),
  },
  Directory: {
    Documents: 'DOCUMENTS',
    Cache: 'CACHE',
  },
}));

describe('download and save services', () => {
  it('detects apple mobile user agents correctly', () => {
    expect(isAppleMobile()).toBe(false);
  });

  it('canShareFile checks sharing capability', () => {
    const blob = new Blob(['sample data'], { type: 'text/plain' });
    // In node/jsdom environment without navigator.canShare or native platform
    expect(canShareFile(blob, 'sample.txt')).toBe(false);
  });

  it('triggers anchor download on web platforms', async () => {
    const blob = new Blob(['hello world'], { type: 'text/plain' });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const outcome = await saveFile(blob, 'hello.txt', 'blob:http://localhost/mock-uuid');
    expect(outcome).toBe('saved');
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it('writes to native filesystem when running on native platform', async () => {
    const isNativeSpy = vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    const blob = new Blob(['android data'], { type: 'text/plain' });

    const outcome = await saveFile(blob, 'report.pdf', 'blob:http://localhost/mock-pdf');
    expect(outcome).toBe('saved');
    expect(Filesystem.writeFile).toHaveBeenCalled();

    isNativeSpy.mockRestore();
  });
});
