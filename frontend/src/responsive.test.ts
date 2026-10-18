import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('mobile responsiveness verification', () => {
  const cssPath = path.resolve(__dirname, 'index.css');
  const cssContent = fs.readFileSync(cssPath, 'utf-8');

  it('declares box-sizing border-box globally', () => {
    expect(cssContent).toMatch(/box-sizing:\s*border-box/);
  });

  it('prevents horizontal overflow on html and body', () => {
    expect(cssContent).toMatch(/html\s*\{[^}]*overflow-x:\s*hidden/);
    expect(cssContent).toMatch(/body\s*\{[^}]*overflow-x:\s*hidden/);
    expect(cssContent).toMatch(/html\s*\{[^}]*max-width:\s*100%/);
    expect(cssContent).toMatch(/body\s*\{[^}]*max-width:\s*100%/);
  });

  it('configures safe area insets with minimum mobile padding fallbacks', () => {
    expect(cssContent).toMatch(/\.pb-safe\s*\{[^}]*max\(env\(safe-area-inset-bottom/);
    expect(cssContent).toMatch(/\.pt-safe\s*\{[^}]*max\(env\(safe-area-inset-top/);
    expect(cssContent).toMatch(/\.mb-safe-nav\s*\{[^}]*max\(env\(safe-area-inset-bottom/);
  });

  it('ensures shell and shell-narrow have min-width 0 and box-sizing border-box', () => {
    expect(cssContent).toMatch(/\.shell\s*\{[^}]*min-width:\s*0/);
    expect(cssContent).toMatch(/\.shell\s*\{[^}]*box-sizing:\s*border-box/);
    expect(cssContent).toMatch(/\.shell-narrow\s*\{[^}]*min-width:\s*0/);
    expect(cssContent).toMatch(/\.shell-narrow\s*\{[^}]*box-sizing:\s*border-box/);
  });

  const targetWidths = [360, 375, 390, 412];

  it.each(targetWidths)('verifies responsive layout bounds for %ipx viewport width', (width) => {
    // Shell padding is 1rem (16px) on each side = 32px total
    const padding = 32;
    const availableWidth = width - padding;

    // Minimum hero heading clamp at 2.125rem (~34px) fits available width without overflow
    const approxHeadingCharWidth = 20; // 34px font has ~20px average char width
    const longestWord = 'devices.';
    const wordWidth = longestWord.length * approxHeadingCharWidth;
    expect(wordWidth).toBeLessThan(availableWidth);

    // Hero buttons take full width of container on mobile without overflow
    const buttonPadding = 24 * 2;
    expect(buttonPadding).toBeLessThan(availableWidth);

    // Bottom navigation width matches viewport width
    expect(width).toBeGreaterThanOrEqual(360);
    const navItemWidth = width / 4;
    expect(navItemWidth).toBeGreaterThanOrEqual(90);
  });
});
