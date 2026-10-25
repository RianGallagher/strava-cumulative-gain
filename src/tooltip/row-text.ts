// Turns a copy of Strava's Elevation row into one of our rows by rewriting
// only its text, so Strava's fonts, spacing and attributes are kept.
import { MARKER_ATTRIBUTE } from "../settings.ts";

export interface RowText {
  label: string;
  value: string;
}

const VALUE_ATTRIBUTE = `${MARKER_ATTRIBUTE}-value`;
const ELEVATION_LABEL = /Elev(?:ation)?/;
const NUMBER_WITH_UNIT = /-?\d[\d,.]*(?:\s*(?:m|ft)(?![a-z]))?/;
const UNIT_ONLY = /^\s*(?:m|ft)\s*$/;

function textNodesOf(node: Node): Text[] {
  const found: Text[] = [];
  for (const child of node.childNodes) {
    if (child.nodeType === child.TEXT_NODE) found.push(child as Text);
    else found.push(...textNodesOf(child));
  }
  return found;
}

/** Replaces "Elev"/"Elevation" with the label and the first number (and its unit) with the value. */
function relabel(row: Element, { label, value }: RowText): void {
  let labelled = false;
  let valued = false;
  for (const textNode of textNodesOf(row)) {
    let remainder = textNode.data;
    // Text up to and including the new label is never searched for the
    // value: the label itself can contain digits ("Climb 4").
    let head = "";
    const labelMatch = labelled ? null : ELEVATION_LABEL.exec(remainder);
    if (labelMatch) {
      head = remainder.slice(0, labelMatch.index) + label;
      remainder = remainder.slice(labelMatch.index + labelMatch[0].length);
      labelled = true;
    }
    if (!valued && /\d/.test(remainder)) {
      remainder = remainder.replace(NUMBER_WITH_UNIT, () => value);
      valued = true;
    } else if (valued && head === "" && UNIT_ONLY.test(remainder)) {
      // The unit had its own node ("95" + " m"); the value carries its own.
      remainder = "";
    }
    textNode.data = head + remainder;
  }
}

/**
 * Rebuilds the row from the live Elevation row when its text changes, so it
 * keeps Strava's current fonts and attributes.
 */
export function fillRow(row: Element, elevationRow: Element, text: RowText): void {
  const shownText = `${text.label}|${text.value}`;
  if (row.getAttribute(VALUE_ATTRIBUTE) === shownText) return;
  row.replaceChildren(...[...elevationRow.childNodes].map((child) => child.cloneNode(true)));
  relabel(row, text);
  row.setAttribute(VALUE_ATTRIBUTE, shownText);
}
