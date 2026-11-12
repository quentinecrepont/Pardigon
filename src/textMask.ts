export type MaskTextAlign = "left" | "center" | "right";

export interface MaskFontStyle {
  fontStyle: string;
  fontVariantCaps: string;
  fontWeight: string;
  fontSize: string;
  fontFamily: string;
}

/** Converts a computed CSS text-align value to a physical canvas alignment. */
export function resolveTextAlign(
  textAlign: string,
  direction: string,
): MaskTextAlign {
  if (textAlign.endsWith("center")) return "center";
  if (textAlign.endsWith("left")) return "left";
  if (textAlign.endsWith("right")) return "right";

  // start, end, justify and match-parent follow the writing direction.
  const isRtl = direction === "rtl";
  return (textAlign === "end") !== isRtl ? "right" : "left";
}

/**
 * Returns the canvas x anchor from the line edges measured in the page.
 * Anchoring on the aligned edge keeps small canvas width differences on the
 * side the browser would also let grow.
 */
export function resolveAnchorX(
  align: MaskTextAlign,
  left: number,
  right: number,
): number {
  if (align === "left") return left;
  if (align === "right") return right;
  return (left + right) / 2;
}

const FONT_STRETCH_KEYWORDS = [
  [50, "ultra-condensed"],
  [62.5, "extra-condensed"],
  [75, "condensed"],
  [87.5, "semi-condensed"],
  [100, "normal"],
  [112.5, "semi-expanded"],
  [125, "expanded"],
  [150, "extra-expanded"],
  [200, "ultra-expanded"],
] as const;

export type MaskFontStretch = (typeof FONT_STRETCH_KEYWORDS)[number][1];

/** Canvas only accepts keywords, while computed styles return percentages. */
export function resolveFontStretch(value: string): MaskFontStretch {
  const keyword = FONT_STRETCH_KEYWORDS.find(([, name]) => name === value);
  if (keyword) return keyword[1];

  const percentage = Number.parseFloat(value);
  if (!value.endsWith("%") || !Number.isFinite(percentage)) return "normal";

  let closest: MaskFontStretch = "normal";
  let closestDistance = Infinity;
  for (const [stretch, name] of FONT_STRETCH_KEYWORDS) {
    const distance = Math.abs(stretch - percentage);
    if (distance < closestDistance) {
      closest = name;
      closestDistance = distance;
    }
  }
  return closest;
}

/**
 * Builds a canvas font shorthand from computed styles. The shorthand only
 * accepts CSS2 font variants: values such as tabular-nums would make the
 * browser ignore the complete font and draw the mask in 10px sans-serif.
 */
export function buildCanvasFont(style: MaskFontStyle): string {
  const fontVariant = style.fontVariantCaps === "small-caps"
    ? "small-caps"
    : "normal";
  return [
    style.fontStyle,
    fontVariant,
    style.fontWeight,
    style.fontSize,
    style.fontFamily,
  ].join(" ");
}
