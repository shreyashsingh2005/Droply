import { memo } from 'react';

/**
 * HeroVisual — the laptop / phone file-transfer scene.
 *
 * Authored as a single inline SVG rather than a raster image on purpose:
 *
 *  - it stays perfectly crisp on Retina and 4K displays at any size,
 *  - it costs no extra network request and causes no layout shift,
 *  - individual parts (the transfer ribbon, the file tiles, the particles) can
 *    be animated independently and still respect `prefers-reduced-motion`,
 *  - it picks up the font token, so it matches the rest of the page.
 *
 * Everything in here is decorative. The real transfer UI lives on /send and
 * /receive; the percentages drawn below are part of the illustration and are
 * deliberately static, so nothing can be mistaken for live progress.
 */

/* Animation is applied inline so the whole scene stays in one file. All of it
   is transform / opacity / filter only, which the compositor handles without
   touching layout. The global `prefers-reduced-motion` rule in index.css
   neutralises every one of these. */
const float = (duration: number, delay: number) => ({
  animation: `float-soft ${duration}s ease-in-out ${delay}s infinite`,
  transformBox: 'fill-box' as const,
  transformOrigin: 'center' as const,
});

type FileTile = {
  x: number;
  y: number;
  size: number;
  /** Gradient id for the tile background. */
  fill: string;
  glow: string;
  /** Glyph drawn inside, authored in a 24x24 space. */
  glyph: string;
  duration: number;
  delay: number;
};

const GLYPH_DOC =
  'M7 3.5h6.2L18 8.2v12.3a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Zm6 1.4v3.6h3.6ZM8.6 12h6.8v1.5H8.6Zm0 3.4h6.8v1.5H8.6Z';
const GLYPH_IMAGE =
  'M4.5 5h15a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm0 11.8 4.6-4.6 3.1 3.1 3.3-3.3 3.9 3.9V6.5h-15Zm3-7.3a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2Z';
const GLYPH_VIDEO =
  'M4.5 5.5h15a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1Zm5 2.8v7.4L16 12Z';
const GLYPH_FOLDER =
  'M3.8 5.6h5.4l1.8 2.2h9.2a1 1 0 0 1 1 1v8.6a1 1 0 0 1-1 1H3.8a1 1 0 0 1-1-1V6.6a1 1 0 0 1 1-1Z';
const GLYPH_LOCK =
  'M12 3.2a4.3 4.3 0 0 1 4.3 4.3v2h.9a1 1 0 0 1 1 1v8.3a1 1 0 0 1-1 1H6.8a1 1 0 0 1-1-1V10.5a1 1 0 0 1 1-1h.9v-2A4.3 4.3 0 0 1 12 3.2Zm0 1.9a2.4 2.4 0 0 0-2.4 2.4v2h4.8v-2A2.4 2.4 0 0 0 12 5.1Z';

/* The tiles riding the transfer ribbon, ordered along the path. */
const FILE_TILES: FileTile[] = [
  {
    x: 528,
    y: 268,
    size: 54,
    fill: 'url(#tileBlue)',
    glow: 'rgba(59,130,246,0.55)',
    glyph: GLYPH_DOC,
    duration: 6.5,
    delay: 0,
  },
  {
    x: 604,
    y: 226,
    size: 60,
    fill: 'url(#tileViolet)',
    glow: 'rgba(168,85,247,0.55)',
    glyph: GLYPH_IMAGE,
    duration: 7.5,
    delay: 0.6,
  },
  {
    x: 686,
    y: 262,
    size: 56,
    fill: 'url(#tileMagenta)',
    glow: 'rgba(236,72,153,0.5)',
    glyph: GLYPH_VIDEO,
    duration: 6,
    delay: 1.2,
  },
  {
    x: 744,
    y: 324,
    size: 52,
    fill: 'url(#tileOrange)',
    glow: 'rgba(245,158,11,0.5)',
    glyph: GLYPH_FOLDER,
    duration: 8,
    delay: 0.3,
  },
  {
    x: 778,
    y: 394,
    size: 48,
    fill: 'url(#tilePink)',
    glow: 'rgba(244,114,182,0.5)',
    glyph: GLYPH_LOCK,
    duration: 7,
    delay: 1.6,
  },
];

/* Rows in the phone's received-file list. Illustration content. */
const PHONE_FILES = [
  { name: 'Photos.zip', meta: 'Camera roll', size: '2.4 GB', fill: 'url(#tileBlue)', glyph: 'img' },
  {
    name: 'Vacation.mp4',
    meta: 'Final cut',
    size: '1.8 GB',
    fill: 'url(#tileMagenta)',
    glyph: 'play',
  },
  { name: 'Notes.pdf', meta: 'Trip plan', size: '12 MB', fill: 'url(#tileOrange)', glyph: 'doc' },
  { name: 'Design.fig', meta: 'Handoff v4', size: '45 MB', fill: 'url(#tileViolet)', glyph: 'doc' },
] as const;

/** The transfer ribbon, reused for every stroked layer so they stay aligned. */
const RIBBON =
  'M 86 560 C 300 548 404 452 520 352 C 636 252 742 236 818 330 C 876 402 936 436 1012 430';

/** A second, fainter ribbon behind the first, for depth. */
const RIBBON_BACK =
  'M 60 596 C 290 596 416 500 540 392 C 664 284 760 274 842 372 C 898 440 950 470 1016 466';

const PARTICLES = [
  { x: 236, y: 500, r: 2.4, d: 7, delay: 0 },
  { x: 470, y: 470, r: 1.8, d: 9, delay: 1.4 },
  { x: 612, y: 420, r: 2.2, d: 8, delay: 2.6 },
  { x: 700, y: 492, r: 1.6, d: 10, delay: 0.8 },
  { x: 900, y: 520, r: 2.6, d: 7.5, delay: 3.2 },
  { x: 160, y: 430, r: 1.6, d: 11, delay: 2 },
  { x: 990, y: 400, r: 2, d: 9.5, delay: 4 },
  { x: 560, y: 560, r: 2, d: 8.5, delay: 1.1 },
];

export const HeroVisual = memo(function HeroVisual() {
  return (
    /* `fontFamily` is set once on the root so the labels inside both screens
       inherit the app's typeface: a browser that rejects `var()` in a
       per-element `font-family` presentation attribute still inherits it from
       here. */
    <svg
      viewBox="0 0 1040 700"
      className="h-auto w-full max-w-full overflow-hidden sm:overflow-visible"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="A laptop sending four files directly to a phone over a glowing peer-to-peer connection."
      style={{ fontFamily: 'var(--font-sans)' }}
    >
      <defs>
        {/* ---- device shells ------------------------------------------- */}
        <linearGradient id="lidShell" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#8ea8d8" />
          <stop offset="18%" stopColor="#5b7bb4" />
          <stop offset="55%" stopColor="#2c4374" />
          <stop offset="100%" stopColor="#16244a" />
        </linearGradient>

        <linearGradient id="deckShell" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#6d8cc4" />
          <stop offset="35%" stopColor="#3b547f" />
          <stop offset="100%" stopColor="#101c3c" />
        </linearGradient>

        <linearGradient id="deckLip" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#47618f" />
          <stop offset="100%" stopColor="#0b1430" />
        </linearGradient>

        <linearGradient id="phoneShell" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#9ec0f0" />
          <stop offset="22%" stopColor="#4a6fae" />
          <stop offset="60%" stopColor="#1d2f5c" />
          <stop offset="100%" stopColor="#101b3b" />
        </linearGradient>

        {/* ---- screens -------------------------------------------------- */}
        <linearGradient id="screenGlass" x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" stopColor="#0d1b3c" />
          <stop offset="48%" stopColor="#081330" />
          <stop offset="100%" stopColor="#040b1f" />
        </linearGradient>

        <radialGradient id="screenBloom" cx="50%" cy="34%" r="62%">
          <stop offset="0%" stopColor="#2f6bff" stopOpacity="0.36" />
          <stop offset="100%" stopColor="#2f6bff" stopOpacity="0" />
        </radialGradient>

        <radialGradient id="phoneBloom" cx="50%" cy="26%" r="68%">
          <stop offset="0%" stopColor="#22d9f5" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#22d9f5" stopOpacity="0" />
        </radialGradient>

        {/* ---- the transfer ribbon -------------------------------------- */}
        <linearGradient id="ribbonCore" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#1e40af" />
          <stop offset="26%" stopColor="#3b82f6" />
          <stop offset="54%" stopColor="#38e6ff" />
          <stop offset="78%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>

        <linearGradient id="ribbonWide" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#1d4ed8" stopOpacity="0.05" />
          <stop offset="35%" stopColor="#3b82f6" stopOpacity="0.4" />
          <stop offset="65%" stopColor="#22d9f5" stopOpacity="0.38" />
          <stop offset="100%" stopColor="#a855f7" stopOpacity="0.1" />
        </linearGradient>

        {/* ---- icon tiles ----------------------------------------------- */}
        <linearGradient id="tileBlue" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="100%" stopColor="#1d4ed8" />
        </linearGradient>
        <linearGradient id="tileViolet" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#c084fc" />
          <stop offset="100%" stopColor="#6d28d9" />
        </linearGradient>
        <linearGradient id="tileMagenta" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f472b6" />
          <stop offset="100%" stopColor="#9d174d" />
        </linearGradient>
        <linearGradient id="tileOrange" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fcd34d" />
          <stop offset="100%" stopColor="#ea8a1b" />
        </linearGradient>
        <linearGradient id="tilePink" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fda4af" />
          <stop offset="100%" stopColor="#be185d" />
        </linearGradient>

        <linearGradient id="tileSheen" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.42" />
          <stop offset="55%" stopColor="#ffffff" stopOpacity="0.04" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>

        {/* ---- progress fills ------------------------------------------ */}
        <linearGradient id="progressBlue" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#38e6ff" />
        </linearGradient>

        {/* ---- floor ---------------------------------------------------- */}
        <radialGradient id="floorPool" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#2f6bff" stopOpacity="0.5" />
          <stop offset="60%" stopColor="#2f6bff" stopOpacity="0.14" />
          <stop offset="100%" stopColor="#2f6bff" stopOpacity="0" />
        </radialGradient>

        <radialGradient id="floorPoolCyan" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#22d9f5" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#22d9f5" stopOpacity="0" />
        </radialGradient>

        <linearGradient id="reflectionFade" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>

        {/* Soft bloom. Two shared blurs keep the filter count low. */}
        <filter id="bloom" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="14" />
        </filter>
        <filter id="bloomTight" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="5" />
        </filter>

        {/* Keep each device's UI inside its display area. */}
        <clipPath id="laptopScreen">
          <rect x="146" y="130" width="398" height="256" rx="7" />
        </clipPath>
        <clipPath id="phoneScreen">
          <rect x="760" y="152" width="172" height="404" rx="26" />
        </clipPath>
      </defs>

      {/* ================================================================
          Floor: luminous pools and reflections under both devices
          ================================================================ */}
      <g>
        <ellipse cx="340" cy="520" rx="330" ry="78" fill="url(#floorPool)" opacity="0.9" />
        <ellipse cx="845" cy="596" rx="190" ry="54" fill="url(#floorPoolCyan)" opacity="0.8" />
        {/* Light bouncing off the floor below each device. */}
        <rect x="150" y="486" width="400" height="92" fill="url(#reflectionFade)" opacity="0.5" />
        <rect x="754" y="566" width="184" height="78" fill="url(#reflectionFade)" opacity="0.45" />
      </g>

      {/* ================================================================
          Transfer ribbon — behind the devices, so it reads as passing
          between and around them
          ================================================================ */}
      <g>
        <path
          d={RIBBON_BACK}
          fill="none"
          stroke="url(#ribbonWide)"
          strokeWidth="46"
          strokeLinecap="round"
          opacity="0.3"
          filter="url(#bloom)"
        />
        <path
          d={RIBBON}
          fill="none"
          stroke="url(#ribbonWide)"
          strokeWidth="34"
          strokeLinecap="round"
          opacity="0.55"
          filter="url(#bloom)"
          style={{ animation: 'glow-breathe 7s ease-in-out infinite' }}
        />
        <path
          d={RIBBON}
          fill="none"
          stroke="url(#ribbonCore)"
          strokeWidth="9"
          strokeLinecap="round"
          opacity="0.75"
          filter="url(#bloomTight)"
        />
        <path
          d={RIBBON}
          fill="none"
          stroke="url(#ribbonCore)"
          strokeWidth="2.6"
          strokeLinecap="round"
          opacity="0.95"
        />
        {/* Data ticks drifting along the path. */}
        <path
          d={RIBBON}
          fill="none"
          stroke="#cffafe"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="2 16"
          opacity="0.6"
          style={{ animation: 'dash-flow 9s linear infinite' }}
        />
        {/* A bright packet sweeping end to end. Two stacked unfiltered
            strokes rather than one blurred stroke: animating
            `stroke-dashoffset` through an SVG filter would force the filter to
            re-rasterise on every frame, which is exactly the kind of cost a
            decorative hero must not impose while a transfer is running. The
            wrapping group dims the wide halo, since the keyframes themselves
            run opacity up to 1. */}
        <g opacity="0.4">
          <path
            d={RIBBON}
            fill="none"
            stroke="#67e8f9"
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray="60 1200"
            opacity="0"
            style={{ animation: 'path-pulse 5.5s linear infinite' }}
          />
        </g>
        <path
          d={RIBBON}
          fill="none"
          stroke="#ffffff"
          strokeWidth="3.4"
          strokeLinecap="round"
          strokeDasharray="60 1200"
          opacity="0"
          style={{ animation: 'path-pulse 5.5s linear infinite' }}
        />
      </g>

      {/* ================================================================
          Laptop
          ================================================================ */}
      <g>
        {/* Rim bloom around the lid. */}
        <rect
          x="112"
          y="100"
          width="466"
          height="316"
          rx="22"
          fill="none"
          stroke="#3b82f6"
          strokeWidth="10"
          opacity="0.35"
          filter="url(#bloom)"
        />

        {/* Deck (keyboard base), widening toward the viewer. */}
        <path d="M120 404 H570 L648 472 H42 Z" fill="url(#deckShell)" />
        <path
          d="M120 404 H570 L648 472 H42 Z"
          fill="none"
          stroke="#7ea6e8"
          strokeWidth="1.2"
          opacity="0.5"
        />
        {/* Front lip. */}
        <path d="M42 472 H648 L642 488 Q345 497 48 488 Z" fill="url(#deckLip)" />
        {/* Hinge. */}
        <rect x="246" y="400" width="198" height="7" rx="3.5" fill="#0a1430" opacity="0.85" />
        {/* Trackpad, drawn in the deck's perspective. */}
        <path d="M300 432 H392 L404 460 H288 Z" fill="#0d1a3d" opacity="0.75" />
        <path
          d="M300 432 H392 L404 460 H288 Z"
          fill="none"
          stroke="#6f93d4"
          strokeWidth="0.8"
          opacity="0.4"
        />
        {/* Light spilling from the screen onto the deck. */}
        <path d="M150 404 H540 L600 468 H92 Z" fill="#3b82f6" opacity="0.12" />

        {/* Lid shell. */}
        <rect x="120" y="108" width="450" height="300" rx="16" fill="url(#lidShell)" />
        <rect
          x="120.8"
          y="108.8"
          width="448.4"
          height="298.4"
          rx="15.4"
          fill="none"
          stroke="#bcd6ff"
          strokeWidth="1.6"
          opacity="0.55"
        />
        {/* Bezel. */}
        <rect x="132" y="120" width="426" height="276" rx="11" fill="#060d22" />
        {/* Display. */}
        <rect x="146" y="130" width="398" height="256" rx="7" fill="url(#screenGlass)" />

        <g clipPath="url(#laptopScreen)">
          <rect x="146" y="130" width="398" height="256" fill="url(#screenBloom)" />

          {/* Window chrome */}
          <rect x="146" y="130" width="398" height="26" fill="#0a1736" />
          <circle cx="162" cy="143" r="3.6" fill="#ff6b6b" />
          <circle cx="175" cy="143" r="3.6" fill="#ffc53d" />
          <circle cx="188" cy="143" r="3.6" fill="#38d9a9" />
          <rect x="206" y="137" width="96" height="12" rx="6" fill="#16264f" />
          <rect x="498" y="137" width="34" height="12" rx="6" fill="#16264f" />

          {/* Sidebar */}
          <rect x="146" y="156" width="94" height="230" fill="#071027" />
          <rect x="158" y="168" width="13" height="13" rx="4" fill="url(#tileBlue)" />
          <path d="M161.4 174.6l6.2-2.4-2.4 6.2-1.1-2.6z" fill="#ffffff" opacity="0.95" />
          <rect x="176" y="171" width="34" height="7" rx="3.5" fill="#dbeafe" opacity="0.9" />

          {[198, 222, 246].map((y, i) => (
            <g key={y}>
              <rect
                x="154"
                y={y}
                width="78"
                height="18"
                rx="6"
                fill={i === 0 ? '#16306e' : '#0c1a3c'}
                opacity={i === 0 ? 1 : 0.7}
              />
              <circle cx="164" cy={y + 9} r="3.2" fill={i === 0 ? '#60a5fa' : '#3b5588'} />
              <rect
                x="172"
                y={y + 6}
                width={i === 0 ? 44 : i === 1 ? 32 : 38}
                height="6"
                rx="3"
                fill={i === 0 ? '#cfe2ff' : '#44618f'}
              />
            </g>
          ))}
          <rect x="154" y="352" width="78" height="20" rx="7" fill="#0c1a3c" opacity="0.7" />
          <rect x="162" y="359" width="46" height="6" rx="3" fill="#3b5588" />

          {/* Main panel */}
          <rect x="252" y="168" width="280" height="206" rx="12" fill="#091430" />
          <rect
            x="252.6"
            y="168.6"
            width="278.8"
            height="204.8"
            rx="11.4"
            fill="none"
            stroke="#2a4380"
            strokeWidth="1.2"
            opacity="0.8"
          />
          <rect x="264" y="180" width="62" height="7" rx="3.5" fill="#44618f" />

          {/* Upload ring */}
          <g style={float(5, 0)}>
            <circle cx="392" cy="252" r="40" fill="#0d1f4c" />
            <circle
              cx="392"
              cy="252"
              r="40"
              fill="none"
              stroke="#3b82f6"
              strokeWidth="3"
              opacity="0.5"
            />
            <circle
              cx="392"
              cy="252"
              r="30"
              fill="none"
              stroke="url(#progressBlue)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray="147 42"
              transform="rotate(-90 392 252)"
            />
            <path
              d="M392 238v26M392 238l-9 9M392 238l9 9"
              stroke="#eaf4ff"
              strokeWidth="3.4"
              strokeLinecap="round"
              fill="none"
            />
          </g>
          {/* Pulse ring around the upload icon. */}
          <circle
            cx="392"
            cy="252"
            r="40"
            fill="none"
            stroke="#38e6ff"
            strokeWidth="2"
            opacity="0.5"
            style={{
              animation: 'pulse-ring 3.4s ease-out infinite',
              transformBox: 'fill-box',
              transformOrigin: 'center',
            }}
          />

          <text
            x="392"
            y="318"
            textAnchor="middle"
            fill="#eaf2ff"
            fontSize="13"
            fontWeight="600"
            fontFamily="var(--font-sans)"
          >
            Sending files…
          </text>

          {/* Progress */}
          <rect x="296" y="334" width="162" height="8" rx="4" fill="#132446" />
          <rect x="296" y="334" width="126" height="8" rx="4" fill="url(#progressBlue)" />
          <rect
            x="296"
            y="334"
            width="126"
            height="8"
            rx="4"
            fill="url(#progressBlue)"
            filter="url(#bloomTight)"
            opacity="0.7"
          />
          <text
            x="470"
            y="341"
            fill="#9fc4ff"
            fontSize="10"
            fontWeight="600"
            fontFamily="var(--font-sans)"
          >
            78%
          </text>

          {/* Glass reflection across the display. */}
          <path d="M146 130 H258 L170 386 H146 Z" fill="#ffffff" opacity="0.04" />
        </g>
      </g>

      {/* ================================================================
          Phone
          ================================================================ */}
      <g style={float(9, 0.8)}>
        {/* Rim bloom. */}
        <rect
          x="732"
          y="126"
          width="226"
          height="458"
          rx="46"
          fill="none"
          stroke="#38bdf8"
          strokeWidth="12"
          opacity="0.4"
          filter="url(#bloom)"
        />

        <rect x="742" y="136" width="206" height="438" rx="38" fill="url(#phoneShell)" />
        <rect
          x="742.9"
          y="136.9"
          width="204.2"
          height="436.2"
          rx="37.2"
          fill="none"
          stroke="#cfe3ff"
          strokeWidth="1.8"
          opacity="0.6"
        />
        <rect x="752" y="146" width="186" height="418" rx="31" fill="#050c1e" />
        <rect x="760" y="152" width="172" height="404" rx="26" fill="url(#screenGlass)" />

        <g clipPath="url(#phoneScreen)">
          <rect x="760" y="152" width="172" height="404" fill="url(#phoneBloom)" />

          {/* Status bar */}
          <text
            x="774"
            y="172"
            fill="#cbd9f5"
            fontSize="8"
            fontWeight="600"
            fontFamily="var(--font-sans)"
          >
            9:41
          </text>
          <g fill="#cbd9f5">
            <rect x="896" y="167" width="3" height="4" rx="1" />
            <rect x="901" y="165" width="3" height="6" rx="1" />
            <rect x="906" y="163" width="3" height="8" rx="1" />
            <rect x="911" y="161" width="3" height="10" rx="1" />
          </g>
          {/* Dynamic island */}
          <rect x="826" y="158" width="40" height="11" rx="5.5" fill="#02060f" />

          {/* App header */}
          <path
            d="M777 192l-5 5 5 5"
            stroke="#8fb4ea"
            strokeWidth="1.8"
            fill="none"
            strokeLinecap="round"
          />
          <rect x="786" y="190" width="11" height="11" rx="3.5" fill="url(#tileBlue)" />
          <path d="M788.8 196l5.2-2-2 5.2-.9-2.2z" fill="#ffffff" opacity="0.95" />
          <text
            x="801"
            y="199"
            fill="#e8f1ff"
            fontSize="9"
            fontWeight="700"
            fontFamily="var(--font-sans)"
          >
            Droply
          </text>

          {/* Download ring */}
          <g style={float(6, 0.4)}>
            <circle cx="846" cy="250" r="34" fill="#071a33" />
            <circle
              cx="846"
              cy="250"
              r="34"
              fill="none"
              stroke="#22d9f5"
              strokeWidth="2.4"
              opacity="0.45"
            />
            <circle
              cx="846"
              cy="250"
              r="26"
              fill="none"
              stroke="#38e6ff"
              strokeWidth="3.4"
              strokeLinecap="round"
              strokeDasharray="127 36"
              transform="rotate(-90 846 250)"
            />
            <path
              d="M846 238v24M846 262l-8-8M846 262l8-8"
              stroke="#e6fbff"
              strokeWidth="3"
              strokeLinecap="round"
              fill="none"
            />
          </g>
          <circle
            cx="846"
            cy="250"
            r="34"
            fill="none"
            stroke="#38e6ff"
            strokeWidth="1.6"
            opacity="0.45"
            style={{
              animation: 'pulse-ring 3.8s ease-out 0.6s infinite',
              transformBox: 'fill-box',
              transformOrigin: 'center',
            }}
          />

          <text
            x="846"
            y="306"
            textAnchor="middle"
            fill="#eaf5ff"
            fontSize="10.5"
            fontWeight="600"
            fontFamily="var(--font-sans)"
          >
            Receiving files…
          </text>
          <text
            x="846"
            y="320"
            textAnchor="middle"
            fill="#7fa8dd"
            fontSize="8"
            fontWeight="500"
            fontFamily="var(--font-sans)"
          >
            78% · 4 files
          </text>

          {/* Progress */}
          <rect x="778" y="330" width="136" height="6" rx="3" fill="#122240" />
          <rect x="778" y="330" width="106" height="6" rx="3" fill="url(#progressBlue)" />

          {/* File rows */}
          {PHONE_FILES.map((file, i) => {
            const top = 350 + i * 42;
            return (
              <g key={file.name}>
                <rect x="772" y={top} width="148" height="36" rx="9" fill="#0b1832" />
                <rect
                  x="772.5"
                  y={top + 0.5}
                  width="147"
                  height="35"
                  rx="8.5"
                  fill="none"
                  stroke="#223a6c"
                  strokeWidth="1"
                  opacity="0.9"
                />
                <rect x="779" y={top + 8} width="20" height="20" rx="6" fill={file.fill} />
                <g
                  transform={`translate(783 ${top + 12}) scale(0.5)`}
                  fill="#ffffff"
                  opacity="0.95"
                >
                  {file.glyph === 'img' && (
                    <path d="M0 2h24v18H0zM2.5 17.5 8 12l4 4 4.5-4.5L21.5 16V4.5h-19zM5.5 6.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4z" />
                  )}
                  {file.glyph === 'play' && <path d="M2 1h20v20H2zm7 4v12l10-6z" />}
                  {file.glyph === 'doc' && (
                    <path d="M3 0h11l7 7v15H3zm11 2.5V7h4.5zM6 11h12v2H6zm0 4h12v2H6z" />
                  )}
                </g>
                <text
                  x="806"
                  y={top + 16}
                  fill="#e8f1ff"
                  fontSize="7.6"
                  fontWeight="600"
                  fontFamily="var(--font-sans)"
                >
                  {file.name}
                </text>
                <text
                  x="806"
                  y={top + 26}
                  fill="#6d8fc4"
                  fontSize="6.2"
                  fontFamily="var(--font-sans)"
                >
                  {file.meta}
                </text>
                <text
                  x="913"
                  y={top + 22}
                  textAnchor="end"
                  fill="#9fc4ff"
                  fontSize="6.6"
                  fontWeight="600"
                  fontFamily="var(--font-sans)"
                >
                  {file.size}
                </text>
              </g>
            );
          })}

          {/* Screen glass highlight. */}
          <path d="M760 152 H826 L774 556 H760 Z" fill="#ffffff" opacity="0.035" />
        </g>
      </g>

      {/* ================================================================
          File tiles riding the ribbon
          ================================================================ */}
      <g>
        {FILE_TILES.map((tile) => (
          <g key={`${tile.x}-${tile.y}`} style={float(tile.duration, tile.delay)}>
            {/* Glow behind the tile. */}
            <rect
              x={tile.x - 4}
              y={tile.y - 4}
              width={tile.size + 8}
              height={tile.size + 8}
              rx={tile.size * 0.34}
              fill={tile.glow}
              filter="url(#bloom)"
              opacity="0.9"
            />
            <rect
              x={tile.x}
              y={tile.y}
              width={tile.size}
              height={tile.size}
              rx={tile.size * 0.29}
              fill={tile.fill}
            />
            {/* Top-left sheen, as on glass. */}
            <rect
              x={tile.x}
              y={tile.y}
              width={tile.size}
              height={tile.size}
              rx={tile.size * 0.29}
              fill="url(#tileSheen)"
            />
            <rect
              x={tile.x + 0.6}
              y={tile.y + 0.6}
              width={tile.size - 1.2}
              height={tile.size - 1.2}
              rx={tile.size * 0.29}
              fill="none"
              stroke="#ffffff"
              strokeOpacity="0.35"
              strokeWidth="1.2"
            />
            <g
              transform={`translate(${tile.x + tile.size * 0.22} ${tile.y + tile.size * 0.22}) scale(${
                (tile.size * 0.56) / 24
              })`}
              fill="#ffffff"
              opacity="0.97"
            >
              <path d={tile.glyph} />
            </g>
          </g>
        ))}
      </g>

      {/* ================================================================
          Ambient particles
          ================================================================ */}
      <g>
        {PARTICLES.map((p) => (
          <circle
            key={`${p.x}-${p.y}`}
            cx={p.x}
            cy={p.y}
            r={p.r}
            fill="#7dd3fc"
            opacity="0"
            style={{ animation: `particle-rise ${p.d}s ease-out ${p.delay}s infinite` }}
          />
        ))}
      </g>
    </svg>
  );
});
