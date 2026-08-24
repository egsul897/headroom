export function fmtM(n: number): string {
  if (!isFinite(n)) return "unlimited";
  return "$" + Math.round(n).toLocaleString("en-US") + "M";
}

export function fmtX(n: number): string {
  return isFinite(n) ? n.toFixed(2) + "x" : "n/m";
}

export function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
