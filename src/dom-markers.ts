// Names for what the extension adds to Strava's pages.

/** Marks every element we add, so we can find, skip or remove it. Must stay unchanged. */
export const MARKER_ATTRIBUTE = "data-cumulative-gain";

/** What an element was last rendered from; an unchanged signature skips the render. */
export const SIGNATURE_ATTRIBUTE = `${MARKER_ATTRIBUTE}-signature`;

export const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
