import type { EdgeInsets } from 'react-native-safe-area-context';

/** Phone-sized column cap (design reference starts at 375pt wide). */
export const PHONE_COLUMN_MAX = 430;

/** Readable max width on tablets / large windows (centered column). */
export const TABLET_COLUMN_MAX = 744;

export const TABLET_SHORT_SIDE_BREAKPOINT = 600;

/**
 * Usable column width after **symmetric** horizontal inset (max of left/right + min gutter).
 * Avoids `contentWidth` + extra `sideGutter` exceeding the screen (which pushed layouts to one side on phones).
 */
export function computeContentMaxWidth(width: number, height: number, insets: EdgeInsets): number {
  const hPad = Math.max(insets.left, insets.right);
  const inner = Math.max(0, width - 2 * hPad);
  const shortSide = Math.min(width, height);
  if (shortSide >= TABLET_SHORT_SIDE_BREAKPOINT) {
    return Math.min(inner * 0.96, TABLET_COLUMN_MAX);
  }
  return Math.min(inner, width);
}

/** Bottom padding for scroll areas above the floating tab bar + home indicator (matches BottomNavBar chrome). */
export function scrollBottomPaddingWithTabs(insetsBottom: number, tabChromeHeight = 118, extra = 14): number {
  return tabChromeHeight + extra + Math.max(insetsBottom, 0);
}
