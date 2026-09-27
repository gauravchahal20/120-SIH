/**
 * Shared UI state and small helpers used by every screen.
 */

let S; // result of the current simulation
let OPT; // cached optimiser result (cleared when an input changes)
let day = 0; // cycle day under the trend cursor
let timer; // Play animation timer
let UNC = 0.16; // P10–P90 half-width, replaced by the cycle model's hold-out error

// ISA-101 palette: greys for normal states, colour only for alarms.
const C = {
  proc: "#3A3F45",
  grid: "#D5D7D2",
  mut: "#50565D",
  p1: "#C62828", // priority-1 alarm
  p2: "#E8B200", // priority-2 alarm
  T: "#8A4B12", // temperature pen
  Q: "#1F4F8C", // oil-rate pen
  S: "#2F6B45", // pump-speed pen
  bg: "#FFFFFF",
  soak: "#E4E5E2",
  flt: "#F2CACA", // rod-float band
};

WELLS.forEach((w, i) => $("well").add(new Option(w.n, i)));

/** Tag prefix for the selected well, e.g. "BGW07". */
const tagp = () => WELLS[$("well").value].n.replace("-", "");

/** SVG polyline from [[x, y], ...]. */
const line = (pts, color, width = 1.6, dash) => {
  const points = pts.map((p) => p.map((v) => v.toFixed(1)).join(",")).join(" ");
  const dashAttr = dash ? `stroke-dasharray="${dash}"` : "";
  return `<polyline fill="none" stroke="${color}" stroke-width="${width}" ${dashAttr} points="${points}"/>`;
};

/** Number in Indian grouping, e.g. 1,20,000. */
const fmt = (v, digits = 0) =>
  Number(v).toLocaleString("en-IN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

const tickClock = () => {
  $("clock").textContent = new Date().toLocaleTimeString("en-GB");
};
tickClock();
setInterval(tickClock, 1000);
