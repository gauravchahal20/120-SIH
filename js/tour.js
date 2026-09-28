/**
 * Guided demo: an 8-step walkthrough. Opens automatically for links ending in #tour.
 */

// ---- guided demo tour
const TAB = (t) => {
  const btn = document.querySelector(`[data-t=${t}]`);
  if (btn) btn.click();
};
const setv = (id, v) => {
  const e = $(id);
  if (!e) return;
  if (e.type === "checkbox") {
    e.checked = Boolean(v);
  } else {
    e.value = v;
  }
  e.dispatchEvent(new Event("input"));
  e.dispatchEvent(new Event("change"));
};
const panel = (sel) => {
  const e = document.querySelector(sel);
  return e && (e.closest("section") || e);
};
let TS = 0,
  tourTimer = null;
const STEPS = [
  {
    t: "1 · The problem",
    sel: "#chMain",
    go() {
      TAB("twin");
      $("well").value = 0;
      OPT = null;
      setv("mode", "manual");
      setv("heater", false);
      setv("steam", 1800);
      setv("soak", 3);
      setv("pres", 70);
      setv("stroke", 144);
      setv("spm", 7);
      setv("day", 0);
      day = 0;
      draw();
    },
    p: "Well BGW-07 has just been steamed. Baghewala crude is 10,000–13,000 cP at 50 °C, so as the well cools the oil thickens about a thousand times. Today the pump runs at a fixed speed set by hand; here it is 7 SPM.",
  },
  {
    t: "2 · The well cools",
    sel: "#chMain",
    go() {
      TAB("twin");
      clearInterval(tourTimer);
      day = 0;
      $("day").value = 0;
      draw();
      tourTimer = setInterval(() => {
        if (day >= 65) {
          clearInterval(tourTimer);
          return;
        }
        day += 1;
        $("day").value = day;
        draw();
      }, 45);
    },
    p: "Watch the cycle trend: temperature (brown) falls, the oil rate (blue) falls, and the pink band appears. That band is rod float: the rods cannot sink through the thick oil at 7 SPM.",
  },
  {
    t: "3 · Rod float is detected",
    sel: "#alerts",
    go() {
      TAB("twin");
      clearInterval(tourTimer);
      day = 65;
      $("day").value = 65;
      draw();
    },
    p: "The alarm summary raises a priority-1 ROD FLOAT and a ROD OVERLOAD alarm. Only abnormal values are coloured, as in ISA-101 control-room screens.",
  },
  {
    t: "4 · The physics behind it",
    sel: "#dyn",
    go() {
      TAB("twin");
      clearInterval(tourTimer);
      day = 65;
      $("day").value = 65;
      draw();
    },
    p: "The dynamometer cards come from the Gibbs damped wave equation for the 1,100 m rod string. The surface load goes below zero on the downstroke (rods pushing up on the carrier bar) and peaks far above the rod allowable. The wellbore profile on the left shows why: the oil cools to about 30 °C near the surface.",
  },
  {
    t: "5 · Optimise steam and pump together",
    sel: "#cmp",
    go() {
      TAB("twin");
      clearInterval(tourTimer);
      $("optBtn").click();
    },
    p: "The optimiser picks steam volume, pressure, soak and stroke, and switches the pump to adaptive SPM. On this sample well: about +19 % oil per cycle, 25 % lower steam-oil ratio, and no rod-float or fluid-pound days.",
  },
  {
    t: "6 · Every setpoint is explained",
    sel: "#xai",
    go() {
      TAB("twin");
      clearInterval(tourTimer);
      if (!OPT) {
        $("optBtn").click();
      } else {
        draw();
      }
    },
    p: "The operating advisory gives the reason for each recommendation, including whether the downhole heater pays for its power. An engineer approves before anything reaches the VFD.",
  },
  {
    t: "7 · Plan the whole field",
    sel: "#gantt",
    go() {
      clearInterval(tourTimer);
      TAB("fleet");
      setv("nsg", "1");
      schedule();
    },
    p: "The field overview shows all wells. The scheduler plans the mobile steam units: with one unit, wells wait for steam (amber) and oil is deferred. Switch to 2 units to see the difference.",
  },
  {
    t: "8 · Verified, not just a demo",
    sel: "#vcTab",
    go() {
      clearInterval(tourTimer);
      TAB("ml");
      if (!MODEL) train(sample());
      if (!DC) dcTrain();
      runChecks();
    },
    p: "The models are checked automatically: physics, consistency, optimiser, scheduler and ML accuracy. Data here is synthetic, calibrated to Oil India’s published figures; the CSV loader retrains on real records.",
  },
];
/** Shows step i of the guided demo and highlights its panel. */
function tourShow(i) {
  TS = Math.max(0, Math.min(STEPS.length - 1, i));
  clearInterval(tourTimer);
  document.querySelectorAll(".tourhl").forEach((e) => e.classList.remove("tourhl"));
  const s = STEPS[TS];
  s.go();
  setTimeout(
    () => {
      const e = panel(s.sel);
      if (e) {
        e.classList.add("tourhl");
        e.scrollIntoView({ behavior: typeof RM !== "undefined" && RM ? "auto" : "smooth", block: "center" });
      }
    },
    TS >= 6 ? 200 : 80
  );
  $("tourT").textContent = s.t;
  $("tourN").textContent = TS + 1 + " / " + STEPS.length;
  $("tourP").textContent = s.p;
  $("tourBack").disabled = TS === 0;
  $("tourNext").textContent = TS === STEPS.length - 1 ? "Finish" : "Next";
  $("tour").hidden = false;
}
/** Closes the guided demo. */
function tourEnd() {
  clearInterval(tourTimer);
  $("tour").hidden = true;
  document.querySelectorAll(".tourhl").forEach((e) => e.classList.remove("tourhl"));
}
$("tourBtn").onclick = () => tourShow(0);
$("tourNext").onclick = () => (TS === STEPS.length - 1 ? tourEnd() : tourShow(TS + 1));
$("tourBack").onclick = () => tourShow(TS - 1);
$("tourClose").onclick = tourEnd;
document.addEventListener("keydown", (e) => {
  if ($("tour").hidden) return;
  if (e.key === "Escape") tourEnd();
  if (e.key === "ArrowRight") $("tourNext").click();
  if (e.key === "ArrowLeft" && TS > 0) tourShow(TS - 1);
});
if (location.hash === "#tour") setTimeout(() => tourShow(0), 600);

