/**
 * Field Overview: live status of all wells and the mobile steam-unit schedule.
 */
// ---- field overview
const FS = WELLS.map((w, i) => ({
  d: [8, 25, 58, 47, 70, 40, 95, 62][i],
  mode: i % 2 ? "manual" : "auto",
}));
/** Small temperature sparkline for the field grid. */
function spark(r, d) {
  const x = (i) => 2 + (i * 96) / DAYS,
    y = (T) => 22 - ((T - 40) / 200) * 20;
  return `<svg viewBox="0 0 100 24" style="width:100px;height:24px"><polyline fill="none" stroke="${C.T}" stroke-width="1.2" points="${r.out.map((o) => x(o.d).toFixed(1) + "," + y(o.T).toFixed(1)).join(" ")}"/><line x1="${x(d)}" y1="0" x2="${x(d)}" y2="24" stroke="#1C2024"/></svg>`;
}
const WOPT = {};
/** Cached per-well optimum used by the steam schedule. */
function wellOpt(i) {
  if (!WOPT[i]) {
    const b = params({ w: i, mode: "auto" });
    let best = null;
    for (let s = 400; s <= 3000; s += 200)
      for (let k = 2; k <= 10; k++) {
        const r = sim({ ...b, steam: s, soak: k, pres: 90, stroke: 168, heater: false });
        if (!best || r.value > best.v) best = { v: r.value, s, k };
      }
    WOPT[i] = best;
  }
  return WOPT[i];
}
var LASTJOBS = [];
/** Earliest-due-first schedule for the mobile steam units, drawn as a Gantt chart. */
function schedule() {
  const N = +$("nsg").value,
    RATE = +$("srate").value,
    MV = +$("mv").value,
    H = 60;
  const jobs = FS.map((f, i) => {
    const r = sim(
      params({
        w: i,
        steam: 1800,
        pres: 70,
        soak: 3,
        stroke: 144,
        spm: 5,
        mode: f.mode,
        heater: false,
      })
    );
    let due = r.out.findIndex((o, j) => j > 3 && o.T < 60);
    if (due < 0) due = DAYS;
    due = Math.min(due, r.stop);
    const wo = wellOpt(i),
      inj = Math.ceil(wo.s / RATE);
    const nr = sim(
      params({ w: i, steam: wo.s, soak: wo.k, pres: 90, stroke: 168, mode: "auto", heater: false })
    );
    return {
      i,
      left: Math.max(0, due - f.d),
      inj,
      soak: wo.k,
      steam: wo.s,
      rate: nr.cum / (nr.stop || DAYS),
    };
  }).sort((a, b) => a.left - b.left);
  const free = Array(N).fill(0),
    loc = Array(N).fill(-1);
  LASTJOBS = jobs;
  let lost = 0,
    waits = 0;
  jobs.forEach((j) => {
    let u = 0,
      best = 1e9;
    for (let k = 0; k < N; k++) {
      const t = free[k] + (loc[k] < 0 ? 0 : MV);
      if (Math.max(t, j.left) < best) {
        best = Math.max(t, j.left);
        u = k;
      }
    }
    j.unit = u;
    j.start = best;
    j.wait = j.start - j.left;
    j.end = j.start + j.inj + j.soak;
    free[u] = j.start + j.inj;
    loc[u] = j.i;
    j.lost = j.wait * j.rate;
    lost += j.lost;
    waits += j.wait;
  });
  const X = (d) => 80 + d * (810 / H);
  let g = `<rect x="80" y="8" width="810" height="${N * 34 + 6}" fill="#fff" stroke="#9EA29B"/>`;
  for (let d = 0; d <= H; d += 10)
    g += `<line x1="${X(d)}" y1="8" x2="${X(d)}" y2="${N * 34 + 14}" stroke="#D5D7D2"/><text x="${X(d)}" y="${N * 34 + 28}" text-anchor="middle">${d}</text>`;
  g += `<text x="890" y="${N * 34 + 42}" text-anchor="end">days from today</text>`;
  for (let k = 0; k < N; k++)
    g += `<text x="74" y="${30 + k * 34}" text-anchor="end">SG-${k + 1}</text>`;
  jobs.forEach((j) => {
    if (j.start > H) return;
    const y = 14 + j.unit * 34;
    if (j.wait > 0)
      g += `<rect x="${X(j.left)}" y="${y + 27}" width="${X(Math.min(H, j.start)) - X(j.left)}" height="4" fill="#E8B200"/>`;
    g += `<rect x="${X(j.start)}" y="${y}" width="${Math.max(2, X(Math.min(H, j.start + j.inj)) - X(j.start))}" height="26" fill="#3A3F45"/><rect x="${X(Math.min(H, j.start + j.inj))}" y="${y}" width="${Math.max(0, X(Math.min(H, j.end)) - X(Math.min(H, j.start + j.inj)))}" height="26" fill="#fff" stroke="#3A3F45" stroke-dasharray="3 2"/>`;
    g += `<text x="${X(j.start) + 3}" y="${y + 17}" style="fill:#fff;font-size:9px">${WELLS[j.i].n.slice(4)}</text>`;
  });
  g += `<rect x="80" y="${N * 34 + 34}" width="10" height="8" fill="#3A3F45"/><text x="94" y="${N * 34 + 42}">injection</text><rect x="160" y="${N * 34 + 34}" width="10" height="8" fill="#fff" stroke="#3A3F45" stroke-dasharray="3 2"/><text x="174" y="${N * 34 + 42}">soak (unit free)</text><rect x="270" y="${N * 34 + 37}" width="10" height="4" fill="#E8B200"/><text x="284" y="${N * 34 + 42}">well waiting for a unit</text>`;
  $("gantt").setAttribute("viewBox", `0 0 900 ${N * 34 + 50}`);
  $("gantt").innerHTML = g;
  $("schedKpi").textContent =
    `${jobs.length} wells · total wait ${waits} d · deferred oil ≈ ${fmt(lost)} bbl`;
  $("sched").innerHTML = jobs
    .map(
      (j, k) =>
        `<tr><td class="v">${k + 1}</td><td class="mono"><b>${WELLS[j.i].n}</b></td><td class="mono">SG-${j.unit + 1}</td><td class="v">${j.left}</td><td class="v">${j.start}</td><td class="v">${j.inj} + ${j.soak} d</td><td class="v ${j.wait > 0 ? "a2" : ""}">${j.wait} d</td><td class="v">${fmt(j.steam)} t</td><td class="v">${fmt(j.lost)} bbl</td></tr>`
    )
    .join("");
}
["nsg", "srate", "mv"].forEach((i) => ($(i).onchange = schedule));
/** Field overview grid for all wells. */
function fleet() {
  let tot = 0,
    al = 0,
    html = "";
  FS.forEach((f, i) => {
    const r = sim(
      params({ w: i, steam: 1800, pres: 70, soak: 3, stroke: 144, spm: 5, mode: f.mode })
    );
    const o = r.out[Math.min(f.d, DAYS)];
    const nz = 1 + (Math.random() - 0.5) * 0.04,
      q = o.q * nz;
    tot += q;
    let st = ["Normal", ""];
    if (o.flt) {
      st = ["Rod float", "a1"];
      al++;
    } else if (o.spm && o.fill < 0.6) {
      st = ["Fluid pound", "a2"];
      al++;
    } else if (!o.spm) {
      if (f.d < 3) st = ["Soak", ""];
      else {
        st = ["Shut in – steam due", "a2"];
        al++;
      }
    } else if (o.T < 60) {
      st = ["Steam due", "a2"];
      al++;
    }
    html += `<tr><td class="mono"><b>${WELLS[i].n}</b></td><td class="${st[1]}">${st[0]}</td><td class="v">${f.d}</td><td class="v">${(o.T * nz).toFixed(1)}</td><td class="v">${fmt(o.m)}</td><td class="v">${q.toFixed(1)}</td><td class="v">${o.spm ? o.spm.toFixed(1) + " (" + o.fl.toFixed(1) + ")" : "—"}</td><td>${f.mode === "auto" ? "Adaptive" : "Manual"}</td><td>${spark(r, f.d)}</td>
  <td><button onclick="$('well').value=${i};OPT=null;day=${f.d};$('day').value=${f.d};document.querySelector('[data-t=twin]').click();draw()">Open</button></td></tr>`;
  });
  $("fc").innerHTML = html;
  schedule();
  $("fk").textContent =
    `FIELD ALARMS: ${al} · ${WELLS.length} wells · ${tot.toFixed(0)} bbl/d · ${FS.filter((f) => f.mode === "auto").length} adaptive`;
}
let tick = 0;
setInterval(() => {
  if (!$("fleet").classList.contains("on")) return;
  if (++tick % 5 == 0) {
    FS.forEach((f) => (f.d = (f.d + 1) % DAYS));
  }
  fleet();
}, 1000);
fleet();
