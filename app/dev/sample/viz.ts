/**
 * Chart-only previews for /dev/sample?viz=A|B|C.
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
} as const;

export type VizId = keyof typeof VIZ_PALETTES;
