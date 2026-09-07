/**
 * Central design palette, inspired by the EFG private-banking presentation style:
 * a muted, sophisticated set of slate / steel / sand tones with a single deep
 * red used sparingly for emphasis.
 *
 * The text/grid tokens (ink, muted, line, bg) resolve from the CSS variables
 * defined in src/index.css at render time, so charts follow the light/dark
 * theme automatically. The series colors stay fixed — they are chosen to read
 * on both light and dark surfaces.
 */

const cssVar = (name: string, fallback: string): string => {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v ? `rgb(${v})` : fallback;
};

export const PALETTE = {
  get ink() { return cssVar('--pal-ink', '#2B3338'); },       // primary text — charcoal
  get muted() { return cssVar('--pal-muted', '#6B7780'); },   // secondary text — slate grey
  red: '#B23A35',        // primary emphasis — maroon red (readable on both themes)
  redBright: '#C25650',  // brighter red for highlights / hover
  slate: '#52616A',      // primary chart color — dark slate
  slateDark: '#7E8C9A',  // series variant (was near-black; steel reads on dark too)
  steel: '#7E8C9A',      // secondary chart color — blue-grey
  mist: '#A9B8BE',       // tertiary chart color — light blue-grey
  sand: '#C9C7BB',       // quaternary chart color — warm light grey
  get line() { return cssVar('--pal-line', '#E4E6E4'); },     // grid / hairline rules
  get bg() { return cssVar('--pal-bg', '#F4F5F4'); },         // page background
};

/** Ordered categorical palette for multi-series charts (pies, multi-line, stacks). */
export const CHART_COLORS = [
  PALETTE.slate,
  PALETTE.red,
  PALETTE.steel,
  PALETTE.sand,
  PALETTE.mist,
  PALETTE.slateDark,
] as const;

/** Semantic colors for status thresholds (kept distinct from the brand palette). */
export const STATUS_COLORS = {
  get green() { return cssVar('--status-green', '#3F7A5E'); },
  get amber() { return cssVar('--status-amber', '#B8862E'); },
  get red() { return cssVar('--status-red', '#A33A33'); },
};
