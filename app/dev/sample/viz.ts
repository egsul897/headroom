/**
 * Chart-only previews for /dev/sample?viz=A|B|C|D|E|F.
 * Hexes match app/dev/sample/viz.css. Nothing here is the product default.
 */
export const VIZ_PALETTES = {
  A: {
    name: "Slate & Sand",
    colors: ["#588cad", "#9a835d", "#918a85", "#886f89", "#9d7267"],
  },
  B: {
    name: "Mist & Plum",
    colors: ["#497e91", "#978d7d", "#608e91", "#926c7d", "#7f766c"],
  },
  C: {
    name: "Harbor",
    colors: ["#4e7e8d", "#75939e", "#73787c", "#ae7a67", "#778b7c"],
  },
  D: {
    name: "Plum tonal",
    colors: ["#98627b", "#a98094", "#bd9daf", "#9b8261", "#c9aec1"],
  },
  E: {
    name: "Plum & Slate",
    colors: ["#9a687f", "#9e8564", "#bbaea3", "#61869d", "#d2b3c2"],
  },
  F: {
    name: "Plum & Rose-gold",
    colors: ["#9a687f", "#aa7a7a", "#bea88b", "#868d8f", "#cdadbb"],
  },
} as const;

export type VizId = keyof typeof VIZ_PALETTES;
