/**
 * Temporary development helper: render routes of the running dev server with
 * headless Chrome so the result can be compared against the design reference.
 * Not part of the app. Delete together with the `shot` npm script.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];

const browser = CANDIDATES.find((p) => fs.existsSync(p));
if (!browser) throw new Error('No Chrome or Edge found');

const outDir = path.resolve('.shots');
fs.mkdirSync(outDir, { recursive: true });

const base = process.env.SHOT_BASE ?? 'http://127.0.0.1:5178';

/** name, width, height, route */
const TARGETS = [
  ['home-desktop', 1672, 1120, '/'],
  ['home-desktop-tall', 1672, 2000, '/'],
  ['home-mobile', 414, 1600, '/'],
  ['home-tablet', 834, 1400, '/'],
  ['send', 1672, 1100, '/send'],
  ['privacy', 1672, 1100, '/privacy'],
  ['help', 1672, 1100, '/help'],
  ['history', 1672, 1100, '/history'],
  ['receive', 1672, 1100, '/receive'],
];

const only = process.argv.slice(2);
for (const [name, w, h, route] of TARGETS) {
  if (only.length > 0 && !only.includes(name)) continue;
  const file = path.join(outDir, `${name}.png`);
  execFileSync(
    browser,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      `--window-size=${w},${h}`,
      '--virtual-time-budget=7000',
      `--screenshot=${file}`,
      base + route,
    ],
    { stdio: 'inherit' },
  );
  console.log(name, fs.statSync(file).size, 'bytes');
}
