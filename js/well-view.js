/**
 * Well Overview screen: trend, faceplate, alarms, wellbore profile,
 * dynamometer cards, process graphic, advisory and the cycle report.
 */
/** Re-runs the simulation for the current setpoints and redraws the whole Well Overview. */
function draw() {
  const p = params();
  S = sim(p);
  $("vSteam").textContent = fmt(p.steam) + " t";
  $("vPres").textContent = p.pres + " kg/cm²";
  $("vSoak").textContent = p.soak + " d";
  $("vCut").textContent = p.cut * 10 + " bbl/d";
  $("vSpm").textContent = p.spm.toFixed(1) + " SPM";
  $("vStroke").textContent = p.stroke + " in";
  $("vCyc").textContent = "cycle " + p.cyc;
  $("spm").disabled = p.mode === "auto";
  $("pgTag").textContent = WELLS[$("well").value].n;
  trend(p);
  const o = S.out[day];
  $("dayLbl").textContent = day;
  $("dayLbl2").textContent = day;
  dyn(o);
  faceplate(o, p);
  alarms(o, p);
  visc(o.T);
  cmp();
  wellView(o, p);
  xai(o, p);
}

/** Cycle trend: temperature, oil rate (with P10–P90 band), pump speed and rod-float band. */
function trend(p) {
  const W = 800,
    H = 230,
    L = 46,
    R = 754,
    x = (d) => L + (d * (R - L)) / DAYS,
    yT = (T) => H - 24 - ((T - 40) / 200) * (H - 40),
    yQ = (q) => H - 24 - (q / 160) * (H - 40),
    yS = (s) => H - 24 - (s / 12) * (H - 40);
  let g = `<rect x="${L}" y="16" width="${R - L}" height="${H - 40}" fill="${C.bg}" stroke="#9EA29B"/>`;
  for (let d = 0; d <= DAYS; d += 10)
    g +=
      `<line x1="${x(d)}" y1="16" x2="${x(d)}" y2="${H - 24}" stroke="${C.grid}"/>` +
      (d % 20 == 0 ? `<text x="${x(d)}" y="${H - 10}" text-anchor="middle">${d}</text>` : "");
  [40, 80, 120, 160, 200, 240].forEach((T) => {
    g += `<line x1="${L}" y1="${yT(T)}" x2="${R}" y2="${yT(T)}" stroke="${C.grid}"/><text x="${L - 4}" y="${yT(T) + 3}" text-anchor="end" style="fill:${C.T}">${T}</text>`;
  });
  [0, 40, 80, 120, 160].forEach(
    (q) => (g += `<text x="${R + 4}" y="${yQ(q) + 3}" style="fill:${C.Q}">${q}</text>`)
  );
  g += `<text x="${L}" y="11" style="fill:${C.T}">°C</text><text x="${R}" y="11" text-anchor="end" style="fill:${C.Q}">bbl/d</text><text x="${(L + R) / 2}" y="${H - 1}" text-anchor="middle">cycle day</text>`;
  g += `<rect x="${L}" y="16.5" width="${x(p.soak) - L}" height="${H - 41}" fill="${C.soak}"/><text x="${L + 4}" y="28">SOAK</text>`;
  S.out.forEach((o) => {
    if (o.flt)
      g += `<rect x="${x(o.d)}" y="16.5" width="${(R - L) / DAYS + 0.4}" height="${H - 41}" fill="${C.flt}"/>`;
  });
  const qq = S.out.filter((o) => o.q > 0),
    unc = (o) => UNC;
  if (qq.length)
    g += `<polygon points="${qq
      .map((o) => x(o.d).toFixed(1) + "," + yQ(o.q * (1 + unc(o))).toFixed(1))
      .concat(
        qq
          .slice()
          .reverse()
          .map((o) => x(o.d).toFixed(1) + "," + yQ(o.q * (1 - unc(o))).toFixed(1))
      )
      .join(" ")}" fill="#1F4F8C" opacity=".13"/>`;
  g +=
    line(
      S.out.map((o) => [x(o.d), yT(o.T)]),
      C.T,
      1.8
    ) +
    line(
      S.out.filter((o) => o.q > 0).map((o) => [x(o.d), yQ(o.q)]),
      C.Q,
      1.8
    ) +
    line(
      S.out.filter((o) => o.spm > 0).map((o) => [x(o.d), yS(o.spm)]),
      C.S,
      1.4,
      "5 3"
    );
  g += `<line x1="${x(day)}" y1="16" x2="${x(day)}" y2="${H - 24}" stroke="#1C2024" stroke-width="1"/>`;
  $("chMain").innerHTML = g;
  const o = S.out[day],
    t = tagp();
  $("pens").innerHTML = [
    [C.T, "", t + "-TT-101", "Near-well temperature", o.T.toFixed(1) + " °C"],
    [C.Q, "", t + "-FT-201", "Oil rate", o.q.toFixed(1) + " bbl/d"],
    [
      C.S,
      "dashed",
      t + "-SC-301",
      "Pump speed (right axis ×13)",
      o.spm ? o.spm.toFixed(1) + " SPM" : "—",
    ],
    [C.flt, "block", "—", "Rod-float band", S.floatDays + " d this cycle"],
    [
      "#C9D6E8",
      "block",
      "—",
      "Oil rate P10–P90 (from model hold-out error)",
      o.q ? (o.q * (1 - UNC)).toFixed(1) + " – " + (o.q * (1 + UNC)).toFixed(1) : "—",
    ],
  ]
    .map(
      (r) =>
        `<tr><td class="pen"><i style="background:${r[0]};${r[1] == "dashed" ? "background:repeating-linear-gradient(90deg," + r[0] + " 0 5px,transparent 5px 8px)" : ""}${r[1] == "block" ? ";height:8px" : ""}"></i></td><td class="t">${r[2]}</td><td>${r[3]}</td><td class="v">${r[4]}</td></tr>`
    )
    .join("");
}

// Ramey-type wellbore profile. Producing: fluid relaxes toward geothermal over length A that grows with rate.
/** Temperature profile up the tubing for the current day (steam during soak). */
function wellbore(o, p) {
  const pts = [];
  const inj = !o.spm && o.d < p.soak;
  for (let z = 0; z <= DEPTH; z += 25) {
    let T;
    if (inj) T = tsat(p.pres) - (tsat(p.pres) - tsat(p.pres * 0.93)) * (1 - z / DEPTH);
    else if (!o.spm) T = tgeo(z);
    else T = tubingT(z, o.T, o.qPrev, p.heater);
    pts.push([z, T]);
  }
  return { pts, inj, whT: pts[0][1], whMu: mu(Math.max(pts[0][1], 25)) };
}
/** Draws the wellbore profile panel and its note. */
function wbDraw(o, p) {
  const w = wellbore(o, p),
    x = (T) => 40 + ((T - 20) / 280) * 205,
    y = (z) => 16 + (z / DEPTH) * 250;
  let s = `<rect x="40" y="16" width="205" height="250" fill="#fff" stroke="#9EA29B"/>`;
  [0, 300, 600, 900, 1150].forEach(
    (z) =>
      (s += `<line x1="40" y1="${y(z)}" x2="245" y2="${y(z)}" stroke="${C.grid}"/><text x="36" y="${y(z) + 3}" text-anchor="end">${z}</text>`)
  );
  [50, 150, 250].forEach(
    (T) =>
      (s += `<line x1="${x(T)}" y1="16" x2="${x(T)}" y2="266" stroke="${C.grid}"/><text x="${x(T)}" y="280" text-anchor="middle">${T}</text>`)
  );
  s += `<text x="4" y="10">m</text><text x="245" y="294" text-anchor="end">°C</text>`;
  s +=
    line(
      [
        [x(tgeo(0)), y(0)],
        [x(tgeo(DEPTH)), y(DEPTH)],
      ],
      "#9EA29B",
      1.2,
      "4 3"
    ) +
    line(
      w.pts.map((q) => [x(q[1]), y(q[0])]),
      w.inj ? "#4F83A6" : C.T,
      2
    );
  s += `<text x="${x(tgeo(DEPTH)) + 4}" y="${y(DEPTH) - 6}">geothermal</text>`;
  $("wbsvg").innerHTML = s;
  $("wbnote").innerHTML = w.inj
    ? `Steam at ~${tsat(p.pres).toFixed(0)} °C (saturation at ${p.pres} kg/cm²). ${(S.heatLoss * 100).toFixed(0)} % of injected heat is lost in the wellbore.`
    : o.spm
      ? `Produced fluid leaves the sand at ${o.T.toFixed(0)} °C and reaches the wellhead at <b class="num">${w.whT.toFixed(0)} °C</b>. ${w.whMu > 5000 ? `At this low rate it cools toward geothermal, so oil in the upper tubing is ~${fmt(w.whMu)} cP, which adds rod drag on the downstroke.` : `At this rate most of the heat reaches the surface; upper-tubing viscosity ~${fmt(w.whMu)} cP.`}`
      : "Well shut in: tubing at geothermal temperature.";
  return w;
}
/** Tagged well faceplate. Abnormal values get the alarm colour. */
function faceplate(o, p) {
  const wb = wbDraw(o, p);
  const t = tagp();
  const rows = [
    [
      "TT-101",
      "Near-well temperature",
      o.T.toFixed(1) + " °C",
      o.T < 60 && o.d > p.soak ? "a2" : "",
    ],
    ["VI-101", "Oil viscosity (calc.)", fmt(o.m) + " cP", ""],
    ["FT-201", "Oil rate", o.q.toFixed(1) + " bbl/d", ""],
    ["VI-002", "Tubing viscosity, avg over rod string", o.spm ? fmt(o.muT) + " cP" : "—", ""],
    ["HTR-401", "Downhole heater", p.heater ? "ON 40 kW" : "OFF", ""],
    ["SC-301", "Pump speed", o.spm ? o.spm.toFixed(1) + " SPM" : "shut in", o.flt ? "a1" : ""],
    [
      "LC-301.PPRL",
      "Peak polished-rod load",
      LASTW ? (LASTW.prlMax / 1000).toFixed(1) + " kN" : "—",
      LASTW && LASTW.prlMax > ROD_ALLOW ? "a1" : "",
    ],
    [
      "LC-301.MPRL",
      "Minimum polished-rod load",
      LASTW ? (LASTW.prlMin / 1000).toFixed(1) + " kN" : "—",
      LASTW && LASTW.prlMin < 0 ? "a1" : "",
    ],
    ["SC-301.LIM", "Rod-fall speed limit (physics)", o.spm ? o.fl.toFixed(1) + " SPM" : "—", ""],
    [
      "LC-301.FILL",
      "Pump fillage",
      o.spm ? (o.fill * 100).toFixed(0) + " %" : "—",
      o.spm && o.fill < 0.6 ? "a2" : "",
    ],
    [
      "VFD-301",
      "Downstroke speed",
      o.spm ? (p.mode === "auto" ? (100 / (o.vr || 1)).toFixed(0) : "100") + " % of up" : "—",
      "",
    ],
    ["TT-001", "Wellhead fluid temperature", o.spm ? wb.whT.toFixed(1) + " °C" : "—", ""],
    ["VI-001", "Tubing viscosity at surface (calc.)", o.spm ? fmt(wb.whMu) + " cP" : "—", ""],
    ["HL-101", "Wellbore heat loss (injection)", (S.heatLoss * 100).toFixed(0) + " %", ""],
    ["CYC.OIL", "Cycle oil forecast (P50)", fmt(S.cum) + " bbl", ""],
    [
      "CYC.OIL.RNG",
      "Cycle oil P10 – P90",
      fmt(S.cum * (1 - UNC)) + " – " + fmt(S.cum * (1 + UNC)),
      "",
    ],
    ["CYC.SOR", "Steam-oil ratio", S.sor.toFixed(2), ""],
    [
      "RSK.ROD",
      "Rod-failure risk",
      (S.rodRisk * 100).toFixed(0) + " %",
      S.rodRisk > 0.5 ? "a2" : "",
    ],
    [
      "RSK.UNS",
      "Pump-unsetting risk",
      (S.unsetRisk * 100).toFixed(0) + " %",
      S.unsetRisk > 0.5 ? "a2" : "",
    ],
    ["ECO.NV", "Net value / 120 d", "₹ " + S.value.toFixed(1) + " L", ""],
  ];
  $("kpis").innerHTML = rows
    .map(
      (r) =>
        `<tr><td class="t">${t}-${r[0]}</td><td>${r[1]}</td><td class="v ${r[3]}">${r[2]}</td></tr>`
    )
    .join("");
}

/** Alarm summary, priority 1 (red) to 3 (advisory). */
function alarms(o, p) {
  const t = tagp(),
    a = [];
  if (o.flt)
    a.push([
      1,
      t + "-SC-301",
      `ROD FLOAT – ${o.spm.toFixed(1)} SPM above rod-fall limit ${o.fl.toFixed(1)}`,
    ]);
  if (LASTW && LASTW.prlMax > ROD_ALLOW)
    a.push([
      1,
      t + "-LC-301",
      `ROD OVERLOAD – peak ${(LASTW.prlMax / 1000).toFixed(0)} kN above ${ROD_ALLOW / 1000} kN allowable`,
    ]);
  if (o.spm && o.fill < 0.6)
    a.push([2, t + "-LC-301", `LOW FILLAGE ${(o.fill * 100).toFixed(0)} % – fluid pound`]);
  if (o.T < 60 && o.d > p.soak) a.push([2, t + "-TT-101", "LOW TEMP < 60 °C – schedule steam"]);
  if (p.mode === "manual" && S.floatDays > 0)
    a.push([
      3,
      t + "-SC-301",
      `ADVISORY – fixed SPM gives ${S.floatDays} rod-float days this cycle`,
    ]);
  $("alerts").innerHTML = a.length
    ? a
        .map(
          (r) =>
            `<tr><td><span class="pri ${r[0] == 1 ? "a1" : r[0] == 2 ? "a2" : ""}" style="${r[0] == 3 ? "border:1px solid #50565D" : ""}">${r[0]}</span></td><td class="t">${r[1]}</td><td>${r[2]}</td></tr>`
        )
        .join("")
    : `<tr><td></td><td colspan="2" class="muted">No active alarms</td></tr>`;
  const n = a.filter((r) => r[0] < 3).length;
  $("alCount").textContent = n + " active";
  $("sbAl").textContent = "Alarms: " + n + " active (" + WELLS[$("well").value].n + ")";
}

function curSoak() {
  return +$("soak").value;
}
/** Empty chart frame used by the small plots. */
function axes(W, H, xl, yl) {
  return `<rect x="36" y="10" width="${W - 46}" height="${H - 40}" fill="${C.bg}" stroke="#9EA29B"/><text x="${W - 10}" y="${H - 14}" text-anchor="end">${xl}</text><text x="40" y="22">${yl}</text>`;
}
let LASTW = null;
/** Surface and pump dynamometer cards from the rod-string wave equation, with diagnosis. */
function dyn(o) {
  const p = params();
  if (!o.spm) {
    $("dyn").innerHTML =
      axes(400, 220, "", "") +
      `<text x="200" y="100" text-anchor="middle" style="font-size:12px;fill:#1C2024">${o.d < curSoak() ? "WELL SHUT IN – SOAK" : "WELL SHUT IN – BELOW CUT-OFF"}</text>`;
    $("dynDiag").innerHTML = "No card while the well is shut in.";
    LASTW = null;
    return;
  }
  const w = rodWave(
    o.spm,
    p.stroke,
    o.vr || 1,
    Math.max(0.02, o.muT / 1000),
    Math.max(0.2, Math.min(1, o.fill))
  );
  LASTW = w;
  const mini = (x0, w0, pts, xl, yl, lo, hi, col, title) => {
    const X = (v) => x0 + 4 + (v / pts.S) * (w0 - 8),
      Y = (v) => 176 - ((v - lo) / (hi - lo)) * 150;
    let g = `<rect x="${x0}" y="22" width="${w0}" height="160" fill="#fff" stroke="#9EA29B"/><text x="${x0}" y="14" style="fill:#1C2024;font-weight:600">${title}</text>`;
    if (lo < 0 && hi > 0)
      g += `<line x1="${x0}" y1="${Y(0)}" x2="${x0 + w0}" y2="${Y(0)}" stroke="#50565D" stroke-dasharray="3 2"/><text x="${x0 + w0 - 2}" y="${Y(0) - 2}" text-anchor="end">0</text>`;
    g += `<text x="${x0 - 3}" y="${Y(hi) + 8}" text-anchor="end">${(hi / 1000).toFixed(0)}</text><text x="${x0 - 3}" y="${Y(lo)}" text-anchor="end">${(lo / 1000).toFixed(0)}</text><text x="${x0 + w0}" y="196" text-anchor="end">${xl}</text>`;
    return (
      g +
      `<polyline fill="none" stroke="${col}" stroke-width="1.6" points="${pts.map((q) => X(q[0]).toFixed(1) + "," + Y(q[1]).toFixed(1)).join(" ")}"/>`
    );
  };
  w.surf.S = w.S;
  w.down.S = w.S;
  const lo = Math.min(0, w.prlMin * 1.05),
    hi = Math.max(w.prlMax * 1.05, WB + FO);
  const fl = w.prlMin < 0,
    over = w.prlMax > ROD_ALLOW;
  let s = mini(
    28,
    220,
    w.surf,
    "position",
    "kN",
    lo,
    hi,
    fl || over ? C.p1 : C.proc,
    "Surface card (load cell)"
  );
  if (ROD_ALLOW < hi)
    s += `<line x1="28" y1="${176 - ((ROD_ALLOW - lo) / (hi - lo)) * 150}" x2="248" y2="${176 - ((ROD_ALLOW - lo) / (hi - lo)) * 150}" stroke="#E8B200" stroke-dasharray="5 3"/>`;
  s += mini(
    282,
    112,
    w.down,
    "position",
    "",
    -FO * 0.15,
    FO * 1.25,
    o.fill < 0.6 ? "#9A7400" : C.proc,
    "Pump card"
  );
  const ps = w.down.reduce((m, q) => [Math.min(m[0], q[0]), Math.max(m[1], q[0])], [1e9, -1e9]),
    pst = (ps[1] - ps[0]) / w.S;
  w.pst = pst;
  s += `<text x="4" y="212">kN · amber dashed = rod allowable ${ROD_ALLOW / 1000} kN</text><text x="282" y="212" style="fill:${pst < 0.7 ? "#C62828" : "#50565D"}">plunger stroke ${(pst * 100).toFixed(0)} % of surface</text>`;
  $("dyn").innerHTML = s;
  const dg = fl
    ? [
        "a1",
        "ROD FLOAT",
        "Polished-rod load goes negative on the downstroke: the rods cannot sink through the viscous tubing oil and push up on the carrier bar.",
      ]
    : over
      ? [
          "a1",
          "ROD OVERLOAD",
          "Peak load exceeds the rod allowable: impact loading, high risk of rod failure.",
        ]
      : o.fill < 0.6
        ? ["a2", "FLUID POUND", "Pump barrel only partly filled; pump is faster than inflow."]
        : w.prlMin < 0.15 * WB
          ? ["a2", "NEAR FLOAT", "Minimum load is close to zero; slow the downstroke."]
          : o.fill < 0.9
            ? [
                "",
                "PARTIAL FILLAGE",
                `Barrel about ${(o.fill * 100).toFixed(0)} % full; loads within rod limits.`,
              ]
            : ["", "NORMAL", "Full-pump card; loads within rod limits."];
  $("dynDiag").innerHTML =
    `Diagnosis: <span class="${dg[0]}" style="padding:0 4px;font-weight:600">${dg[1]}</span> ${dg[2]} <span class="muted">Loads ${(w.prlMin / 1000).toFixed(1)} to ${(w.prlMax / 1000).toFixed(1)} kN; plunger travels ${(w.pst * 100).toFixed(0)} % of the surface stroke. Cards simulated with the Gibbs damped wave equation for the 1,100 m rod string, with damping from the tubing-oil viscosity.</span>`;
}
/** Viscosity–temperature curve with OIL's data point and the current state. */
function visc(Tn) {
  let s = axes(400, 220, "°C", "cP (log)");
  const x = (T) => 36 + ((T - 40) / 200) * 354,
    y = (m) => 180 - (Math.log10(m) / 5) * 168;
  const pts = [];
  for (let T = 40; T <= 240; T += 4) pts.push([x(T), y(mu(T))]);
  [1, 10, 100, 1000, 10000, 100000].forEach(
    (m) =>
      (s += `<line x1="36" y1="${y(m)}" x2="390" y2="${y(m)}" stroke="${C.grid}"/><text x="32" y="${y(m) + 3}" text-anchor="end">${m >= 1000 ? m / 1000 + "k" : m}</text>`)
  );
  [50, 100, 150, 200].forEach(
    (T) => (s += `<text x="${x(T)}" y="194" text-anchor="middle">${T}</text>`)
  );
  s +=
    line(pts, C.T, 1.8) +
    `<rect x="${x(50) - 3}" y="${y(13000)}" width="6" height="${y(10000) - y(13000)}" fill="none" stroke="#1C2024"/><text x="${x(50) + 6}" y="${y(13000) - 2}">OIL data</text>`;
  s += `<circle cx="${x(Tn)}" cy="${y(mu(Tn))}" r="4" fill="#1C2024"/><text x="${x(Tn) + 7}" y="${y(mu(Tn)) - 5}" style="fill:#1C2024">${fmt(mu(Tn))} cP</text>`;
  $("visc").innerHTML = s;
}

/** Current practice vs optimised cycle for the selected well. */
function cmp() {
  const cur = sim(params({ steam: 1800, pres: 70, soak: 3, mode: "manual", spm: 5, stroke: 144 }));
  if (!OPT) OPT = optimise();
  const b = OPT.best,
    ai = sim(params({ steam: b.s, soak: b.k, pres: b.pr, stroke: b.st, mode: "auto" }));
  const pc = (a, c) => {
    const v = ((c - a) / a) * 100;
    return (v > 0 ? "+" : "") + v.toFixed(0) + " %";
  };
  $("cmp").innerHTML =
    `<thead><tr><th></th><th style="text-align:right">Current</th><th style="text-align:right">Optimised</th><th style="text-align:right">Δ</th></tr></thead><tbody>
 <tr><td>Steam</td><td class="v">${fmt(1800)} t</td><td class="v">${fmt(b.s)} t</td><td></td></tr>
 <tr><td>Soak</td><td class="v">3 d</td><td class="v">${b.k} d</td><td></td></tr>
 <tr><td>Inj. pressure</td><td class="v">70</td><td class="v">${b.pr}</td><td></td></tr>
 <tr><td>Stroke / SPM</td><td class="v">144 / 5.0</td><td class="v">${b.st} / adapt.</td><td></td></tr>
 <tr><td>Cycle oil, bbl</td><td class="v">${fmt(cur.cum)}</td><td class="v">${fmt(ai.cum)}</td><td class="v"><b>${pc(cur.cum, ai.cum)}</b></td></tr>
 <tr><td>Steam-oil ratio</td><td class="v">${cur.sor.toFixed(2)}</td><td class="v">${ai.sor.toFixed(2)}</td><td class="v"><b>${pc(cur.sor, ai.sor)}</b></td></tr>
 <tr><td>Rod-float days</td><td class="v">${cur.floatDays}</td><td class="v">${ai.floatDays}</td><td class="v">${ai.floatDays - cur.floatDays}</td></tr>
 <tr><td>Fluid-pound days</td><td class="v">${cur.poundDays}</td><td class="v">${ai.poundDays}</td><td class="v">${ai.poundDays - cur.poundDays}</td></tr>
 <tr><td>Unsetting risk</td><td class="v">${(cur.unsetRisk * 100).toFixed(0)} %</td><td class="v">${(ai.unsetRisk * 100).toFixed(0)} %</td><td class="v">${pc(cur.unsetRisk, ai.unsetRisk)}</td></tr>
 <tr><td>Pump energy idx</td><td class="v">${fmt(cur.kwh / 1000)}k</td><td class="v">${fmt(ai.kwh / 1000)}k</td><td class="v">${pc(cur.kwh, ai.kwh)}</td></tr>
 <tr><td>Net value/120 d</td><td class="v">₹${cur.value.toFixed(1)} L</td><td class="v">₹${ai.value.toFixed(1)} L</td><td class="v"><b>${pc(cur.value, ai.value)}</b></td></tr></tbody>`;
  heat();
}
/** Optimiser search space: net value over steam volume × soak time. */
function heat() {
  const g = OPT.grid,
    all = g.flat(),
    mn = Math.min(...all),
    mx = Math.max(...all);
  let s = "";
  const x0 = 48,
    y0 = 10,
    cw = 340 / 13,
    ch = 180 / g.length;
  g.forEach((row, i) =>
    row.forEach((v, j) => {
      const t = (v - mn) / (mx - mn);
      s += `<rect x="${x0 + j * cw}" y="${y0 + i * ch}" width="${cw + 0.3}" height="${ch + 0.3}" fill="hsl(212,${20 + t * 30}%,${94 - t * 58}%)"/>`;
    })
  );
  const bi = (OPT.best.s - 400) / 200,
    bj = OPT.best.k - 2;
  s += `<rect x="${x0 + bj * cw}" y="${y0 + bi * ch}" width="${cw}" height="${ch}" fill="none" stroke="#000" stroke-width="2"/>`;
  [400, 1400, 2400].forEach(
    (v) =>
      (s += `<text x="${x0 - 4}" y="${y0 + ((v - 400) / 200) * ch + ch / 2 + 3}" text-anchor="end">${v} t</text>`)
  );
  [2, 6, 10, 14].forEach(
    (k) =>
      (s += `<text x="${x0 + (k - 2) * cw + cw / 2}" y="${y0 + 180 + 12}" text-anchor="middle">${k} d</text>`)
  );
  s += `<text x="${x0 + 345}" y="${y0 + 180 + 12}" text-anchor="end"></text><text x="${x0}" y="${y0 + 180 + 25}">soak time →</text>`;
  const gx = x0 + 150,
    gy = 222;
  for (let i = 0; i < 10; i++)
    s += `<rect x="${gx + i * 9}" y="${gy - 6}" width="9" height="6" fill="hsl(212,${20 + (i / 9) * 30}%,${94 - (i / 9) * 58}%)"/>`;
  s += `<text x="${gx - 4}" y="${gy}" text-anchor="end">₹${mn.toFixed(0)} L</text><text x="${gx + 94}" y="${gy}">₹${mx.toFixed(0)} L</text>`;
  $("heat").innerHTML = s;
}

// ---- process graphic (P&ID style)
var RM = matchMedia("(prefers-reduced-motion: reduce)").matches,
  phase = 0,
  curO = null,
  curP = null;
/** Stores the current state for the animated process graphic. */
function wellView(o, p) {
  curO = o;
  curP = p;
  $("vOil").textContent = "₹ " + fmt(OIL) + " /bbl";
  $("sbOil").textContent = fmt(OIL);
}
const bub = (
  x,
  y,
  tag,
  val,
  cls
) => `<g><circle cx="${x}" cy="${y}" r="15" fill="#fff" stroke="#3A3F45"/><line x1="${x - 15}" y1="${y}" x2="${x + 15}" y2="${y}" stroke="#3A3F45" stroke-width=".8"/><text x="${x}" y="${y - 3}" text-anchor="middle" style="font-size:8px;fill:#1C2024">${tag.split("-")[0]}</text><text x="${x}" y="${y + 10}" text-anchor="middle" style="font-size:8px;fill:#1C2024">${tag.split("-")[1]}</text>
 <rect x="${x + 18}" y="${y - 8}" width="${val.length * 6.4 + 8}" height="16" fill="${cls == "a1" ? "#C62828" : cls == "a2" ? "#E8B200" : "#fff"}" stroke="#3A3F45" stroke-width=".8"/><text x="${x + 22}" y="${y + 4}" style="font-size:10px;fill:${cls == "a1" ? "#fff" : "#1C2024"}">${val}</text></g>`;
/** Animation frame of the P&ID-style process graphic. */
function wellFrame() {
  requestAnimationFrame(wellFrame);
  if (!curO || !$("twin").classList.contains("on")) return;
  if (!RM && curO.spm) phase += ((curO.spm / 60) * 2 * Math.PI) / 60;
  const o = curO,
    p = curP,
    up = Math.sin(phase),
    inj = !o.spm;
  const h = Math.max(0, Math.min(1, (o.T - TR) / (S.Tpk - TR)));
  const k = C.proc;
  let g = `<rect width="420" height="300" fill="#F6F6F4"/>`;
  g += `<line x1="0" y1="112" x2="420" y2="112" stroke="${k}" stroke-width="1.5"/>`;
  for (let i = 0; i < 420; i += 12)
    g += `<line x1="${i}" y1="112" x2="${i + 8}" y2="120" stroke="#9EA29B" stroke-width=".8"/>`;
  g += `<rect x="0" y="236" width="420" height="40" fill="#E6E1D6" stroke="#9EA29B"/><text x="412" y="272" text-anchor="end">JODHPUR SST · ~1,150 m</text>`;
  g += `<ellipse cx="96" cy="256" rx="${20 + h * 120}" ry="${9 + h * 9}" fill="hsl(28,${25 + h * 45}%,${82 - h * 32}%)" stroke="#8A4B12" stroke-width=".8"/>`;
  g += `<line x1="88" y1="112" x2="88" y2="262" stroke="${k}" stroke-width="1.5"/><line x1="104" y1="112" x2="104" y2="262" stroke="${k}" stroke-width="1.5"/><line x1="93" y1="112" x2="93" y2="244" stroke="#7C817A"/><line x1="99" y1="112" x2="99" y2="244" stroke="#7C817A"/>`;
  const r = inj ? 0 : up * 8;
  g += `<line x1="96" y1="${60 + r}" x2="96" y2="${238 + r}" stroke="${o.flt ? C.p1 : k}" stroke-width="${o.flt ? 2.2 : 1.4}"/><rect x="92" y="${236 + r}" width="8" height="14" fill="#fff" stroke="${k}"/>`;
  const ang = inj ? 0 : up * 12;
  g += `<polygon points="138,112 150,64 162,112" fill="none" stroke="${k}" stroke-width="1.5"/><g transform="rotate(${ang.toFixed(2)} 150 64)"><rect x="92" y="59" width="118" height="9" fill="#fff" stroke="${k}" stroke-width="1.5"/><path d="M92 55 q-12 9 0 22" fill="none" stroke="${k}" stroke-width="1.5"/></g>`;
  g += `<circle cx="196" cy="94" r="12" fill="#fff" stroke="${k}" stroke-width="1.5"/><line x1="196" y1="94" x2="${196 + 11 * Math.cos(phase)}" y2="${94 + 11 * Math.sin(phase)}" stroke="${k}" stroke-width="1.5"/><rect x="222" y="84" width="30" height="20" fill="#fff" stroke="${k}"/><text x="237" y="98" text-anchor="middle" style="fill:#1C2024">M</text><line x1="208" y1="94" x2="222" y2="94" stroke="${k}"/>`;
  g += `<polyline points="104,104 300,104 300,150 404,150" fill="none" stroke="${k}" stroke-width="1.5"/><polygon points="404,146 412,150 404,154" fill="${k}"/><text x="410" y="165" text-anchor="end">TO TANK</text>`;
  if (inj) {
    g += `<text x="112" y="40" style="fill:#1C2024;font-size:11px">${o.d < p.soak ? "SOAK – WELL SHUT IN" : "SHUT IN – BELOW CUT-OFF, STEAM DUE"}</text>`;
    if (o.d < p.soak)
      for (let i = 0; i < 3; i++) {
        const y = 130 + ((performance.now() / 40 + i * 40) % 100);
        g += `<polygon points="92,${y} 100,${y} 96,${y + 7}" fill="#4F83A6"/>`;
      }
  }
  g += bub(262, 34, "SC-301", o.spm ? o.spm.toFixed(1) + " SPM" : "OFF", o.flt ? "a1" : "");
  g += bub(330, 126, "FT-201", o.q.toFixed(1) + " bbl/d", "");
  g += bub(148, 204, "TT-101", o.T.toFixed(0) + " °C", o.T < 60 && o.d > p.soak ? "a2" : "");
  g += bub(236, 204, "VI-101", fmt(o.m) + " cP", "");
  if (o.flt)
    g += `<rect x="8" y="126" width="74" height="18" fill="${C.p1}"/><text x="45" y="139" text-anchor="middle" style="fill:#fff;font-weight:600">ROD FLOAT</text>`;
  $("wellsvg").innerHTML = g;
}
requestAnimationFrame(wellFrame);

/** Operating advisory: each recommendation with the reason behind it. */
function xai(o, p) {
  if (!OPT) OPT = optimise();
  const b = OPT.best,
    r = [];
  if (o.spm) {
    const ao = sim({ ...p, mode: "auto" }).out[o.d],
      rec = ao.spm || o.spm,
      byFloat = rec >= o.fl * 0.9;
    r.push([
      "Pump speed",
      `Set <b class="num">${rec.toFixed(1)} SPM</b>${p.mode === "manual" && Math.abs(o.spm - rec) > 0.3 ? ` (now ${o.spm.toFixed(1)})` : ""}. With oil averaging ${fmt(o.muT)} cP along the rod string, the rods sink freely only up to ${o.fl.toFixed(1)} SPM; ${byFloat ? "speed is set by that rod-fall limit." : "speed is matched to reservoir inflow so the barrel fills."}`,
    ]);
    r.push([
      "VFD",
      `Run the downstroke at <b class="num">${(100 / (o.vr || 1)).toFixed(0)} %</b> of upstroke speed to avoid impact loading.`,
    ]);
  } else r.push(["Soak", "Well shut in while heat spreads into the reservoir."]);
  const left = S.out.findIndex((x, i) => i > o.d && x.T < 60);
  r.push([
    "Next steam",
    left > 0
      ? `TT-101 falls below 60 °C in about <b class="num">${left - o.d} d</b> (day ${left}). Schedule the steam generator before then.`
      : "Near-well zone is already near reservoir temperature. Schedule steam now.",
  ]);
  if (o.spm) {
    const wb = wellbore(o, p);
    if (wb.whMu > 5000 || p.heater) {
      const on = sim({ ...p, heater: true }),
        off = sim({ ...p, heater: false }),
        dv = on.value - off.value;
      r.push([
        "Heater",
        `Upper tubing oil ~${fmt(wb.whMu)} cP at ${wb.whT.toFixed(0)} °C. Heater ON changes net value by <b class="num">₹ ${dv >= 0 ? "+" : ""}${dv.toFixed(1)} L</b> / 120 d (oil ${on.cum >= off.cum ? "+" : ""}${fmt(on.cum - off.cum)} bbl, rod-float days ${off.floatDays} → ${on.floatDays}). ${dv > 0 ? "Recommend ON." : "Recommend OFF; the slower downstroke is enough."}`,
      ]);
    }
  }
  const g = OPT.grid,
    si = (b.s - 400) / 200,
    k = b.k - 2,
    marg = si + 1 < g.length ? g[si + 1][k] - g[si][k] : 0;
  r.push([
    "CSS design",
    `<b class="num">${fmt(b.s)} t</b> steam, <b class="num">${b.k} d</b> soak, <b class="num">${b.pr} kg/cm²</b>, ${b.st} in stroke. A further 200 t changes net value by ₹ ${marg.toFixed(1)} L, so it does not pay back.`,
  ]);
  $("xai").innerHTML = r.map((x) => `<li><b>${x[0]}</b><span>${x[1]}</span></li>`).join("");
}

["steam", "pres", "soak", "cut", "mode", "spm"].forEach(
  (i) => ($(i).oninput = () => draw())
);
["cyc", "stroke"].forEach(
  (i) =>
    ($(i).oninput = () => {
      OPT = null;
      draw();
    })
);
$("heater").onchange = () => {
  OPT = null;
  draw();
};
$("well").onchange = () => {
  OPT = null;
  draw();
};
$("day").oninput = (e) => {
  day = +e.target.value;
  draw();
};
$("play").onclick = () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
    $("play").textContent = "Play";
    return;
  }
  $("play").textContent = "Pause";
  timer = setInterval(() => {
    day = (day + 1) % (DAYS + 1);
    $("day").value = day;
    draw();
  }, 90);
};
$("optBtn").onclick = () => {
  OPT = optimise();
  $("steam").value = OPT.best.s;
  $("soak").value = OPT.best.k;
  $("pres").value = OPT.best.pr;
  $("stroke").value = OPT.best.st;
  $("mode").value = "auto";
  draw();
};
$("oilp").oninput = (e) => {
  OIL = +e.target.value;
  OPT = null;
  for (let k in WOPT) delete WOPT[k];
  draw();
};
draw();

// ---- report
$("repBtn").onclick = () => {
  if (!OPT) OPT = optimise();
  const b = OPT.best,
    w = WELLS[$("well").value].n,
    cur = sim(params({ steam: 1800, pres: 70, soak: 3, mode: "manual", spm: 5, stroke: 144 })),
    ai = sim(params({ steam: b.s, soak: b.k, pres: b.pr, stroke: b.st, mode: "auto" }));
  showModal(`<h2>CSS / SRP recommendation – ${w}</h2><div class="muted small">Baghewala Field · generated ${new Date().toLocaleString("en-GB")} · for engineer approval</div>
 <h3>Next cycle setpoints</h3><table><tbody><tr><td>Steam volume</td><td class="v">${fmt(b.s)} t</td></tr><tr><td>Injection pressure</td><td class="v">${b.pr} kg/cm²</td></tr><tr><td>Soak time</td><td class="v">${b.k} d</td></tr><tr><td>Stroke length</td><td class="v">${b.st} in</td></tr><tr><td>SPM control</td><td class="v">adaptive, VFD closed loop</td></tr></tbody></table>
 <h3>Expected outcome</h3><table><thead><tr><th></th><th style="text-align:right">Current</th><th style="text-align:right">Recommended</th></tr></thead><tbody><tr><td>Cycle oil, bbl</td><td class="v">${fmt(cur.cum)}</td><td class="v">${fmt(ai.cum)}</td></tr><tr><td>Steam-oil ratio</td><td class="v">${cur.sor.toFixed(2)}</td><td class="v">${ai.sor.toFixed(2)}</td></tr><tr><td>Rod-float days</td><td class="v">${cur.floatDays}</td><td class="v">${ai.floatDays}</td></tr><tr><td>Unsetting risk</td><td class="v">${(cur.unsetRisk * 100).toFixed(0)} %</td><td class="v">${(ai.unsetRisk * 100).toFixed(0)} %</td></tr><tr><td>Net value / 120 d</td><td class="v">₹ ${cur.value.toFixed(1)} L</td><td class="v">₹ ${ai.value.toFixed(1)} L</td></tr></tbody></table>
 <h3>Basis</h3><ul class="adv">${$("xai").innerHTML}</ul><p class="note">Surrogate model on synthetic data. Not for field use without calibration on OIL records.</p>`);
};
/** Opens the report / info dialog. */
function showModal(h) {
  $("mcont").innerHTML = h;
  $("modal").hidden = false;
}
$("mclose").onclick = () => ($("modal").hidden = true);
$("mprint").onclick = () => window.print();
$("modal").onclick = (e) => {
  if (e.target.id === "modal") $("modal").hidden = true;
};
$("mcopy").onclick = () => {
  const t = $("mcont").innerText;
  try {
    navigator.clipboard.writeText(t).then(
      () => ($("mcopy").textContent = "Copied"),
      () => {}
    );
  } catch (e) {}
};

// ---- tabs
document.querySelectorAll("#tabs button").forEach(
  (b) =>
    (b.onclick = () => {
      document.querySelectorAll("#tabs button").forEach((x) => x.classList.toggle("on", x === b));
      document
        .querySelectorAll(".tab")
        .forEach((t) => t.classList.toggle("on", t.id === b.dataset.t));
      if (b.dataset.t === "fleet") fleet();
      if (b.dataset.t === "ml") {
        if (!MODEL) train(sample());
        if (!DC) dcTrain();
        setTimeout(runChecks, 30);
      }
    })
);
