/**
 * Central design palette, inspired by the EFG private-banking presentation style:
 * a muted, sophisticated set of slate / steel / sand tones with a single deep
 * red used sparingly for emphasis.
 *
 * These hex values are the single source of truth for chart colors. The same
 * tokens are mirrored (by name) in tailwind.config.js for use in classNames.
 */
export const PALETTE = {
  ink: '#2B3338',        // primary text — charcoal
  muted: '#6B7780',      // secondary text — slate grey
  red: '#8C3A38',        // primary emphasis — deep maroon red
  redBright: '#B23A35',  // brighter red for highlights / hover
  slate: '#52616A',      // primary chart color — dark slate
  slateDark: '#3A4248',  // darker slate (totals)
  steel: '#7E8C9A',      // secondary chart color — blue-grey
  mist: '#A9B8BE',       // tertiary chart color — light blue-grey
  sand: '#C9C7BB',       // quaternary chart color — warm light grey
  line: '#E4E6E4',       // grid / hairline rules
  bg: '#F4F5F4',         // page background — cool off-white
} as const;

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
  green: '#3F7A5E',
  amber: '#B8862E',
  red: '#A33A33',
} as const;
