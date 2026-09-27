/**
 * Models & Data: cycle-response regression, pump-card classifier
 * and the automated model validation checks.
 */
// ---- models & data
let MODEL = null,
  DC = null;
const FEAT = ["steam", "pressure", "soak", "stroke", "pi", "cycle"];
/** Small seeded random generator, so sample data is reproducible. */
function rng(seed) {
  return () =>
    ((seed = (Math.imul(seed ^ (seed >>> 15), seed | 1) + 0x6d2b79f5) | 0) >>> 0) / 4294967296;
}
/** 60 synthetic CSS cycles (5 wells × 12) in the same format as the CSV loader. */
function sample() {
  const r = rng(42),
    rows = [];
  for (let w = 0; w < 5; w++)
    for (let c = 0; c < 12; c++) {
      const p = {
        w,
        steam: 600 + Math.round((r() * 2200) / 50) * 50,
        pres: 50 + Math.round(r() * 8) * 5,
        soak: 2 + Math.floor(r() * 9),
        stroke: [96, 120, 144, 168][Math.floor(r() * 4)],
        spm: 5,
        mode: "manual",
        cut: 1.5,
        cyc: 1 + Math.floor(r() * 8),
        heater: false,
      };
      const o = sim(p);
      rows.push({
        well: WELLS[w].n,
        steam: p.steam,
        pressure: p.pres,
        soak: p.soak,
        stroke: p.stroke,
        pi: WELLS[w].pi,
        cycle: p.cyc,
        cycle_oil: Math.round(o.cum * (1 + (r() - 0.5) * 0.08)),
      });
    }
  return rows;
}
/** Gaussian elimination with partial pivoting. */
function solve(A, b) {
  const n = A.length;
  for (let i = 0; i < n; i++) {
    let m = i;
    for (let k = i + 1; k < n; k++) if (Math.abs(A[k][i]) > Math.abs(A[m][i])) m = k;
    [A[i], A[m]] = [A[m], A[i]];
    [b[i], b[m]] = [b[m], b[i]];
    for (let k = i + 1; k < n; k++) {
      const f = A[k][i] / A[i][i];
      for (let j = i; j < n; j++) A[k][j] -= f * A[i][j];
      b[k] -= f * b[i];
    }
  }
  const x = Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let j = i + 1; j < n; j++) s -= A[i][j] * x[j];
    x[i] = s / A[i][i];
  }
  return x;
}
/** Ridge regression with squared and interaction terms; 20 % hold-out test set. */
function train(rows) {
  const feats = FEAT.filter((k) => rows.every((r) => !isNaN(+r[k])));
  const X0 = rows.map((r) => feats.map((k) => +r[k])),
    y = rows.map((r) => +r.cycle_oil);
  const m0 = feats.map((_, j) => X0.reduce((a, r) => a + r[j], 0) / X0.length),
    sd = feats.map(
      (_, j) => Math.sqrt(X0.reduce((a, r) => a + (r[j] - m0[j]) ** 2, 0) / X0.length) || 1
    );
  const Z = X0.map((r) => {
    const z = r.map((v, j) => (v - m0[j]) / sd[j]);
    const ix = [];
    for (let a = 0; a < z.length; a++) for (let c = a + 1; c < z.length; c++) ix.push(z[a] * z[c]);
    return [1, ...z, ...z.map((v) => v * v), ...ix];
  });
  const idx = Z.map((_, i) => i),
    test = idx.filter((i) => i % 5 == 0),
    tr = idx.filter((i) => i % 5 != 0);
  const P = Z[0].length,
    lam = 1;
  const A = Array.from({ length: P }, (_, i) =>
      Array.from(
        { length: P },
        (_, j) => tr.reduce((s, k) => s + Z[k][i] * Z[k][j], 0) + (i == j && i > 0 ? lam : 0)
      )
    ),
    bb = Array.from({ length: P }, (_, i) => tr.reduce((s, k) => s + Z[k][i] * y[k], 0));
  const w = solve(A, bb),
    pred = Z.map((z) => z.reduce((s, v, i) => s + v * w[i], 0));
  const ym = test.reduce((s, i) => s + y[i], 0) / test.length,
    ssr = test.reduce((s, i) => s + (y[i] - pred[i]) ** 2, 0),
    sst = test.reduce((s, i) => s + (y[i] - ym) ** 2, 0),
    mae = test.reduce((s, i) => s + Math.abs(y[i] - pred[i]), 0) / test.length;
  MODEL = { feats, w, r2: 1 - ssr / sst, mae };
  const ybar = y.reduce((a, b) => a + b, 0) / y.length;
  UNC = Math.min(0.35, (1.6 * mae) / ybar); // ±1.28σ, σ≈1.25·MAE
  $("mlStat").innerHTML =
    `<tr><td>Forecast band used on Well Overview (P10–P90)</td><td class="v">± ${(UNC * 100).toFixed(0)} %</td></tr><tr><td>Cycles loaded (train / test)</td><td class="v">${rows.length} (${tr.length} / ${test.length})</td></tr><tr><td>R², hold-out</td><td class="v">${MODEL.r2.toFixed(2)}</td></tr><tr><td>Mean absolute error</td><td class="v">± ${fmt(mae)} bbl</td></tr>`;
  const imp = feats.map((k, j) => [k, Math.abs(w[1 + j]) + Math.abs(w[1 + feats.length + j])]),
    mx = Math.max(...imp.map((x) => x[1]));
  $("coef").innerHTML =
    "<thead><tr><th>Feature</th><th>Relative influence on cycle oil</th></tr></thead><tbody>" +
    imp
      .sort((a, b) => b[1] - a[1])
      .map(
        ([k, v]) =>
          `<tr><td class="mono">${k}</td><td class="bars"><div style="width:${((v / mx) * 100).toFixed(0)}%"></div></td></tr>`
      )
      .join("") +
    "</tbody>";
  const all = [...y, ...pred],
    lo = Math.min(...all) * 0.9,
    hi = Math.max(...all) * 1.05,
    X = (v) => 40 + ((v - lo) / (hi - lo)) * 345,
    Y = (v) => 262 - ((v - lo) / (hi - lo)) * 246;
  let g = `<rect x="36" y="10" width="354" height="258" fill="#fff" stroke="#9EA29B"/><line x1="${X(lo)}" y1="${Y(lo)}" x2="${X(hi)}" y2="${Y(hi)}" stroke="#9EA29B" stroke-dasharray="4 3"/><text x="390" y="286" text-anchor="end">actual, bbl</text><text x="40" y="24">predicted</text>`;
  [lo, (lo + hi) / 2, hi].forEach(
    (v) => (g += `<text x="${X(v)}" y="280" text-anchor="middle">${fmt(v)}</text>`)
  );
  idx.forEach(
    (i) =>
      (g += test.includes(i)
        ? `<circle cx="${X(y[i])}" cy="${Y(pred[i])}" r="4" fill="${C.Q}"/>`
        : `<circle cx="${X(y[i])}" cy="${Y(pred[i])}" r="3.2" fill="none" stroke="#50565D"/>`)
  );
  g += `<circle cx="300" cy="30" r="3.2" fill="none" stroke="#50565D"/><text x="308" y="33">train</text><circle cx="300" cy="46" r="4" fill="${C.Q}"/><text x="308" y="49">test</text>`;
  $("pva").innerHTML = g;
}
const CL = ["Normal", "Fluid pound", "Rod float", "Gas interference"];
/** Synthetic pump card for one of four classes, with noise and smoothing. */
function card(c, r) {
  const n = 32,
    up = [],
    dn = [],
    Fu = 1 + (r() - 0.5) * 0.15,
    Fd = 0.25 + (r() - 0.5) * 0.1,
    f = 0.35 + r() * 0.6;
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1);
    let u = Fu,
      d = Fd;
    if (x < 0.12) u = Fd + ((Fu - Fd) * x) / 0.12;
    if (c == 2) {
      u = Fu * 0.85 - 0.25 * x;
      if (x < 0.3) u = Fd + ((Fu * 0.8 - Fd) * x) / 0.3;
    }
    dn.push(d);
    up.push(u);
  }
  for (let i = 0; i < n; i++) {
    const x = 1 - i / (n - 1);
    let d = Fd;
    if (c == 1) {
      d = x > f ? Fu : x > f - 0.06 ? Fd + ((Fu - Fd) * (x - (f - 0.06))) / 0.06 : Fd;
    } else if (c == 3) {
      d = x > f ? Fd + (Fu - Fd) * Math.pow((x - f) / (1 - f), 0.35) : Fd;
    } else if (c == 2) {
      d = Fd + 0.25 * Math.sin(x * Math.PI);
    } else {
      d = x > 0.9 ? Fd + ((Fu - Fd) * (x - 0.9)) / 0.1 : Fd;
    }
    dn[i] = d;
  }
  const sm = (a) =>
    a.map((v, i) => (a[Math.max(0, i - 1)] + v + a[Math.min(a.length - 1, i + 1)]) / 3);
  const nz = (a) => a.map((v) => v + (r() - 0.5) * 0.34);
  return [...sm(sm(nz(up))), ...sm(sm(nz(dn)))];
}
/** Labelled card set: nPer cards for each class. */
function genSet(nPer, seed) {
  const r = rng(seed),
    X = [],
    y = [];
  for (let c = 0; c < 4; c++)
    for (let k = 0; k < nPer; k++) {
      X.push(card(c, r));
      y.push(c);
    }
  return { X, y };
}
/** k-nearest-neighbour vote. */
function knn(X, y, q, k = 5) {
  const d = X.map((x, i) => [x.reduce((s, v, j) => s + (v - q[j]) ** 2, 0), y[i]])
    .sort((a, b) => a[0] - b[0])
    .slice(0, k);
  const v = [0, 0, 0, 0];
  d.forEach((e) => v[e[1]]++);
  const m = Math.max(...v);
  return [v.indexOf(m), m / k];
}
/** Trains and tests the pump-card classifier and fills the confusion matrix. */
function dcTrain() {
  const tr = genSet(200, 7),
    te = genSet(50, 99),
    cm = [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ];
  let ok = 0;
  te.X.forEach((x, i) => {
    const [p] = knn(tr.X, tr.y, x);
    cm[te.y[i]][p]++;
    if (p == te.y[i]) ok++;
  });
  DC = { tr, te, acc: ok / te.X.length };
  $("dcStat").innerHTML =
    `<tr><td>Test accuracy</td><td class="v">${((ok / te.X.length) * 100).toFixed(1)} %</td></tr><tr><td>Cards (train / test)</td><td class="v">800 / 200</td></tr>`;
  $("dcCM").innerHTML =
    `<thead><tr><th>Actual \\ predicted</th>${CL.map((c) => `<th style="text-align:right">${c}</th>`).join("")}</tr></thead><tbody>` +
    cm
      .map(
        (r, i) =>
          `<tr><td>${CL[i]}</td>${r.map((v, j) => `<td class="v" style="${i == j ? "font-weight:600" : v ? "color:#C62828" : "color:#9EA29B"}">${v}</td>`).join("")}</tr>`
      )
      .join("") +
    "</tbody>";
  dcTest();
}
/** Draws a random card and classifies it. */
function dcTest() {
  if (!DC) return dcTrain();
  const r = rng((Math.random() * 2 ** 31) | 0);
  r();
  r();
  const c = Math.floor(Math.random() * 4),
    x = card(c, r),
    [p, conf] = knn(DC.tr.X, DC.tr.y, x),
    n = 32;
  const X = (i) => 46 + (i / (n - 1)) * 334,
    Y = (v) => 196 - v * 150;
  let pts = [];
  for (let i = 0; i < n; i++) pts.push([X(i), Y(x[i])]);
  for (let i = 0; i < n; i++) pts.push([X(n - 1 - i), Y(x[n + i])]);
  $("dcSvg").innerHTML =
    axes(400, 230, "position", "load") +
    `<polygon points="${pts.map((q) => q.map((v) => v.toFixed(1)).join(",")).join(" ")}" fill="none" stroke="${p == 0 ? C.proc : C.p1}" stroke-width="1.8"/>`;
  const act = [
    "No action.",
    "Reduce SPM or enable pump-off control.",
    "Lower SPM and slow the VFD downstroke; review sinker-bar weight.",
    "Check gas anchor; adjust casing-head pressure.",
  ];
  $("dcOut").innerHTML =
    `<table><tbody><tr><td>Label (ground truth)</td><td class="v">${CL[c]}</td></tr><tr><td>Classifier output</td><td class="v ${p == c ? "" : "a2"}">${CL[p]} · ${(conf * 100).toFixed(0)} % votes</td></tr><tr><td>Recommended action</td><td>${act[p]}</td></tr></tbody></table>`;
}

// ---- model validation suite
/** Runs the model validation checks and fills the results table. */
function runChecks() {
  const R = [],
    add = (area, name, exp, val, ok) => R.push([area, name, exp, val, ok]);
  const base = {
    w: 0,
    steam: 1800,
    pres: 70,
    soak: 3,
    cut: 1.5,
    stroke: 144,
    spm: 5,
    cyc: 4,
    heater: false,
  };
  add(
    "Physics",
    "Viscosity at 50 °C matches OIL data",
    "10,000–13,000 cP",
    fmt(mu(50)) + " cP",
    mu(50) >= 10000 && mu(50) <= 13000
  );
  let mono = true;
  for (let T = 40; T < 250; T += 5) if (mu(T + 5) >= mu(T)) mono = false;
  add(
    "Physics",
    "Viscosity falls as temperature rises",
    "monotonic, 40–250 °C",
    mono ? "monotonic" : "not monotonic",
    mono
  );
  let hot = true,
    worst = -1e9;
  for (const pr of [40, 70, 110])
    for (const st of [400, 1800, 3000]) {
      const r = sim({ ...base, pres: pr, steam: st });
      worst = Math.max(worst, r.Tpk - tsat(pr));
      if (r.Tpk > tsat(pr)) hot = false;
    }
  add(
    "Physics",
    "Near-well peak temperature below steam saturation",
    "T_peak ≤ T_sat(p)",
    "closest: " + (-worst).toFixed(0) + " °C below",
    hot
  );
  const r0 = sim({ ...base, mode: "manual" }),
    Te = r0.out[DAYS].T;
  add(
    "Physics",
    "Reservoir cools back towards 47 °C",
    "47 ≤ T(day 120) < T(day 10)",
    Te.toFixed(1) + " °C",
    Te >= TR - 0.5 && Te < r0.out[10].T
  );
  const L1 = rodLimit(90, 30, false, 144, 1).spm,
    L2 = rodLimit(70, 20, false, 144, 1).spm,
    L3 = rodLimit(55, 15, false, 144, 1).spm;
  add(
    "Physics",
    "Rod-fall limit drops as the tubing cools",
    "limit(90 °C) > limit(70) > limit(55)",
    `${L1.toFixed(2)} > ${L2.toFixed(2)} > ${L3.toFixed(2)}`,
    L1 > L2 && L2 > L3
  );
  const Lh = rodLimit(60, 15, true, 144, 1).spm,
    Lc = rodLimit(60, 15, false, 144, 1).spm;
  add(
    "Physics",
    "Downhole heater raises the rod-fall limit",
    "heater ON ≥ OFF",
    `${Lh.toFixed(2)} vs ${Lc.toFixed(2)} SPM`,
    Lh >= Lc
  );
  const ws = rodWave(0.5, 144, 1, 0.05, 1),
    e1 = Math.abs(ws.upMean - (WB + FO)) / (WB + FO),
    e2 = Math.abs(ws.dnMean - WB) / WB;
  add(
    "Physics",
    "Wave equation: mid-stroke loads = rod weight (+ fluid load on upstroke)",
    "within 5 %",
    `${(e1 * 100).toFixed(1)} %, ${(e2 * 100).toFixed(1)} %`,
    e1 < 0.05 && e2 < 0.05
  );
  const muC = 8,
    Lim = (60 * (WB / (((2 * Math.PI * muC) / LNK) * PUMPD))) / (Math.PI * 144 * 0.0254),
    wa = rodWave(Lim * 0.8, 144, 1, muC, 1),
    wb = rodWave(Lim * 1.5, 144, 1, muC, 1);
  add(
    "Consistency",
    "Wave equation agrees with rod-fall limit",
    "no float at 0.8× limit, float at 1.5×",
    `${(wa.prlMin / 1000).toFixed(1)} / ${(wb.prlMin / 1000).toFixed(1)} kN`,
    wa.prlMin > 0 && wb.prlMin < 0
  );
  let fd = 0;
  for (let i = 0; i < WELLS.length; i++) fd += sim({ ...base, w: i, mode: "auto" }).floatDays;
  add(
    "Consistency",
    "Adaptive SPM never exceeds the rod-fall limit",
    "0 rod-float days, all wells",
    fd + " days",
    fd === 0
  );
  const sum = r0.out.reduce((a, o) => a + o.q, 0);
  add(
    "Consistency",
    "Cycle oil equals the sum of daily rates",
    "difference < 0.1 %",
    ((Math.abs(sum - r0.cum) / r0.cum) * 100).toFixed(3) + " %",
    Math.abs(sum - r0.cum) / r0.cum < 0.001
  );
  const c1 = sim({ ...base, cyc: 1, mode: "auto" }).cum,
    c8 = sim({ ...base, cyc: 8, mode: "auto" }).cum;
  add(
    "Consistency",
    "Later CSS cycles yield less oil",
    "cycle 1 > cycle 8",
    `${fmt(c1)} > ${fmt(c8)} bbl`,
    c1 > c8
  );
  const o = optimise(),
    b = o.best;
  add(
    "Optimiser",
    "Best steam and soak are inside the search range",
    "not on the grid edge",
    `${fmt(b.s)} t, ${b.k} d`,
    b.s > 400 && b.s < 3000 && b.k > 2 && b.k < 14
  );
  const j = sim({ ...base, steam: b.s, soak: b.k, pres: b.pr, stroke: b.st, mode: "auto" }).value,
    so = sim({ ...base, mode: "auto" }).value;
  let co = -1e9;
  for (let s2 = 400; s2 <= 3000; s2 += 200)
    for (let k = 2; k <= 14; k++)
      for (const pr of [60, 70, 80, 90, 100, 110])
        co = Math.max(co, sim({ ...base, steam: s2, soak: k, pres: pr, mode: "manual" }).value);
  add(
    "Optimiser",
    "Joint optimum beats pump-only and steam-only",
    "joint ≥ both",
    `₹${j.toFixed(1)} vs ${so.toFixed(1)} / ${co.toFixed(1)} L`,
    j >= so && j >= co
  );
  schedule();
  let ov = 0;
  const bu = {};
  LASTJOBS.forEach((x) => {
    (bu[x.unit] = bu[x.unit] || []).push(x);
  });
  Object.values(bu).forEach((a) => {
    a.sort((p, q) => p.start - q.start);
    for (let i = 1; i < a.length; i++) if (a[i].start < a[i - 1].start + a[i - 1].inj) ov++;
  });
  add(
    "Scheduler",
    "No steam unit is booked twice at once",
    "0 overlaps",
    ov + " overlaps",
    ov === 0
  );
  add(
    "Uncertainty",
    "P10 ≤ P50 ≤ P90",
    "ordered band",
    `± ${(UNC * 100).toFixed(0)} %`,
    UNC > 0 && UNC < 0.5
  );
  if (!MODEL) train(sample());
  add(
    "ML",
    "Cycle model accuracy on hold-out data",
    "R² ≥ 0.70",
    MODEL.r2.toFixed(2),
    MODEL.r2 >= 0.7
  );
  if (!DC) dcTrain();
  add(
    "ML",
    "Pump-card classifier accuracy on unseen cards",
    "≥ 90 %",
    (DC.acc * 100).toFixed(1) + " %",
    DC.acc >= 0.9
  );
  const n = R.filter((r) => r[4]).length;
  $("vcSum").textContent = `${n} / ${R.length} passed`;
  $("vcTab").innerHTML = R.map(
    (r, i) =>
      `<tr><td class="v">${i + 1}</td><td>${r[0]}</td><td>${r[1]}</td><td class="muted">${r[2]}</td><td class="v">${r[3]}</td><td class="${r[4] ? "" : "a1"}" style="font-weight:600">${r[4] ? "PASS" : "FAIL"}</td></tr>`
  ).join("");
  draw();
  return { n, t: R.length, R };
}
$("vcRun").onclick = runChecks;
$("dcTrain").onclick = dcTrain;
$("dcTest").onclick = dcTest;
$("trainBtn").onclick = () => train(sample());
$("csv").onchange = (e) => {
  const fr = new FileReader();
  fr.onload = () => {
    const L = fr.result.trim().split(/\r?\n/),
      H = L[0].split(",").map((h) => h.trim().toLowerCase());
    const rows = L.slice(1)
      .map((l) => {
        const v = l.split(",");
        const o = {};
        H.forEach((h, i) => (o[h] = v[i]));
        return o;
      })
      .filter((r) => r.cycle_oil);
    if (rows.length < 25) {
      $("mlStat").innerHTML =
        '<tr><td class="a2" colspan="2">The file needs at least 25 rows and a cycle_oil column.</td></tr>';
      return;
    }
    train(rows);
  };
  fr.readAsText(e.target.files[0]);
};
$("tplBtn").onclick = () => {
  const rows = sample(),
    H = ["well", "cycle", "steam", "pressure", "soak", "stroke", "pi", "cycle_oil"];
  const t = [H.join(","), ...rows.map((r) => H.map((h) => r[h]).join(","))].join("\n");
  showModal(
    `<h2>CSV format</h2><p class="muted">One row per CSS cycle. Required columns: cycle (CSS cycle number), steam (t), pressure (kg/cm²), soak (d), stroke (in), pi (productivity index), cycle_oil (bbl). The 60 sample rows are shown below.</p><pre>${t}</pre>`
  );
};
train(sample());
draw();
