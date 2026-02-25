/** Design tokens for consistent touch targets, spacing, and typography. */

export const TOUCH = {
  /** Standard interactive element minimum size (px). */
  standard: 56,
  /** Primary action / nav bar button size (px). */
  primary: 64,
  /** Small chip / secondary action (px). */
  small: 48,
} as const;

export const SPACING = {
  /** Gap between adjacent buttons (px). */
  buttonGap: 12,
  /** Panel inner padding (px). */
  panel: 16,
  /** Card inner padding (px). */
  card: 16,
} as const;

export const FONT = {
  /** Primary heading / action labels (px). */
  primary: 16,
  /** Body text (px). */
  body: 15,
  /** Countdown timers / critical numbers (px). */
  time: 24,
  /** Route number badges (px). */
  routeNumber: 18,
  /** Small labels (px). */
  label: 13,
  /** Captions (px). */
  caption: 11,
} as const;

/** Height of the mobile bottom navigation bar (px). */
export const NAV_HEIGHT = 64;
