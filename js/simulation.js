/**
 * Day-by-day simulation of one CSS cycle (reservoir -> tubing -> pump) and the
 * grid-search optimiser for steam volume, soak time, pressure and stroke.
 *
 * The wells are synthetic: pi is a productivity multiplier and tau the
 * near-well cooling time constant in days.
 */

const $ = (id) => document.getElementById(id);

const WELLS = [
  { n: "BGW-07", pi: 1.0, tau: 26 },
  { n: "BGW-12", pi: 1.25, tau: 30 },
  { n: "BGW-15", pi: 0.95, tau: 28 },
  { n: "BGW-18", pi: 0.8, tau: 22 },
  { n: "BGW-23", pi: 1.1, tau: 34 },
  { n: "BGW-27", pi: 1.05, tau: 25 },
  { n: "BGW-31", pi: 0.9, tau: 24 },
  { n: "BGW-34", pi: 1.15, tau: 31 },
];

const INJECTION_RATE = 250; // t/day of steam from a mobile steam generator
const PUMP_BBL_PER_SPM_IN = 0.1166 * 1.25 * 1.25 * 0.85; // bbl/d per SPM per inch of stroke, 1.25 in pump

/**
 * Simulates one CSS cycle.
 *
 * p = { w, steam (t), pres (kg/cm2), soak (d), cut (bbl/d ÷ 10), mode ("manual" | "auto"),
 *       spm, stroke (in), heater (bool), cyc (cycle number) }
 *
 * Returns the daily trace plus cycle totals, risks and net value per 120 days (₹ lakh).
 */
function sim(p) {
  const well = WELLS[p.w != null ? p.w : $("well").value];

  // Wellbore heat loss during injection (Ramey-type): slower injection loses more heat.
  const injRate = p.steam / Math.max(3, p.steam / INJECTION_RATE);
  const heatLoss = Math.min(0.4, 0.13 * Math.pow(250 / injRate, 0.35) * (1 + DEPTH / 11500));

  // A short soak lets live steam flash back up the well, so less heat stays in the sand.
  const soakEfficiency = p.soak < 4 ? 1 - (4 - p.soak) * 0.09 : 1;
  const heatIn = p.steam * (1 - heatLoss) * soakEfficiency;
  const Tpeak = TR + 175 * (1 - Math.exp(-heatIn / 520)) * (0.85 + p.pres / 450);

  // Cooling time constant: more steam and a moderate soak heat a larger zone.
  const tau =
    well.tau *
    Math.pow(p.steam / 1200, 0.2) *
    (1 + 0.06 * Math.min(p.soak, 6)) *
    (p.soak > 7 ? Math.exp(-(p.soak - 7) * 0.08) : 1);

  // Each later CSS cycle produces from a more depleted near-well zone.
  const cycleDecline = Math.pow(0.93, (p.cyc || 1) - 1);
  const pumpPerSpm = PUMP_BBL_PER_SPM_IN * p.stroke;

  const out = [];
  let cum = 0;
  let kwh = 0;
  let floatDays = 0;
  let poundDays = 0;
  let heaterDays = 0;
  let strokeDays = 0; // sum of SPM over the cycle: a proxy for rod fatigue
  let stop = DAYS;
  let qPrev = 40;

  for (let d = 0; d <= DAYS; d++) {
    const T =
      d < p.soak
        ? Tpeak - (Tpeak - TR) * 0.015 * d
        : TR + (Tpeak - (Tpeak - TR) * 0.015 * p.soak - TR) * Math.exp(-(d - p.soak) / tau);
    const m = mu(T);

    let q = 0;
    let spm = 0;
    let fl = 0;
    let fill = 0;
    let flt = false;
    let vr = 1;
    let muT = 0;

    if (d >= p.soak && d < stop) {
      const inflow =
        cycleDecline * well.pi * 12 * Math.pow(MREF / m, 0.36) * Math.pow(p.pres / 70, 0.15);

      // Rod-fall limit from the tubing oil. In adaptive mode the VFD also slows the downstroke.
      const base = rodLimit(T, qPrev, p.heater, p.stroke, 1);
      vr = p.mode === "auto" ? Math.max(1, Math.min(2.2, Math.pow(base.muAvg / 280, 0.18))) : 1;
      const limit = vr > 1 ? rodLimit(T, qPrev, p.heater, p.stroke, vr) : base;
      fl = limit.spm;
      muT = limit.muAvg;

      // Adaptive: match inflow, but stay 8 % under the rod-fall limit. Manual: fixed SPM.
      spm =
        p.mode === "auto"
          ? Math.max(0.8, Math.min(fl * 0.92, inflow / (pumpPerSpm * 0.88)))
          : p.spm;

      const capacity = pumpPerSpm * spm;
      q = Math.min(inflow, capacity * 0.92);
      fill = Math.min(1, inflow / capacity);
      flt = spm > fl;
      if (flt) {
        floatDays++;
        q *= 0.92;
      }
      if (fill < 0.6) poundDays++;

      kwh += spm * p.stroke * 0.9;
      if (p.heater) {
        kwh += HEATER_KW * 24;
        heaterDays++;
      }
      cum += q;
      qPrev = q;
      strokeDays += spm;

      if (q < p.cut * 10 && d > p.soak + 5) stop = d;
    }

    out.push({ d, T, m, q, spm, fl, fill, flt, vr, muT, qPrev });
  }

  const sor = p.steam / (cum / 6.29); // t of steam per m3 of oil
  const rodRisk = Math.min(0.95, floatDays / 60 + poundDays / 300 + 0.03);
  const unsetRisk = Math.min(0.9, poundDays / 220 + floatDays / 250 + 0.03);

  // Economics over the whole cycle, normalised to 120 days so cycles of different length compare.
  const cycleDays = stop + 4 + p.steam / INJECTION_RATE;
  const steamCost = p.steam * STEAM * (1 + Math.max(0, p.pres - 60) / 120);
  const highPressurePenalty = Math.pow(Math.max(0, p.pres - 90), 2) * 4000;
  const rodFatigueCost = strokeDays * 260;
  const netRupees =
    cum * OIL -
    steamCost -
    highPressurePenalty -
    kwh * KWH -
    rodRisk * 400000 -
    rodFatigueCost -
    cycleDays * 22000;
  const value = (netRupees / 1e5) * (120 / cycleDays);

  return {
    out,
    cum,
    sor,
    kwh,
    floatDays,
    poundDays,
    rodRisk,
    unsetRisk,
    heatLoss,
    value,
    stop,
    Tpk: Tpeak,
    hDays: heaterDays,
  };
}

/** Reads the current setpoints from the controls, with optional overrides. */
function params(overrides = {}) {
  return {
    steam: +$("steam").value,
    pres: +$("pres").value,
    soak: +$("soak").value,
    cut: +$("cut").value,
    mode: $("mode").value,
    spm: +$("spm").value,
    stroke: +$("stroke").value,
    heater: $("heater").checked,
    cyc: +$("cyc").value,
    ...overrides,
  };
}

/**
 * Grid search over steam volume and soak time. For each cell the best injection
 * pressure and stroke length are also searched. Returns the best point and the grid.
 */
function optimise() {
  const base = params({ mode: "auto" });
  const grid = [];
  let best = null;

  for (let steam = 400; steam <= 3000; steam += 200) {
    const row = [];
    for (let soak = 2; soak <= 14; soak++) {
      let cellBest = -Infinity;
      let cellSettings = null;
      for (const pres of [60, 70, 80, 90, 100, 110]) {
        for (const stroke of [96, 120, 144, 168]) {
          const r = sim({ ...base, steam, soak, pres, stroke });
          if (r.value > cellBest) {
            cellBest = r.value;
            cellSettings = { pr: pres, st: stroke };
          }
        }
      }
      row.push(cellBest);
      if (!best || cellBest > best.v) best = { v: cellBest, s: steam, k: soak, ...cellSettings };
    }
    grid.push(row);
  }

  return { best, grid };
}
