/**
 * Physics of a Baghewala CSS well.
 *
 *  - oil viscosity vs temperature (Andrade fit to Oil India's published data)
 *  - temperature profile up the tubing (Ramey-type heat loss)
 *  - rod-fall limit: fastest pump speed before the rods float
 *  - Gibbs damped wave equation for the rod string (surface and pump cards)
 *
 * Units are SI unless the name says otherwise (cP, SPM, inches, kg/cm2).
 */

// ---------------------------------------------------------------------------
// Field and economic constants
// ---------------------------------------------------------------------------

const TR = 47; // initial reservoir temperature, °C (OIL: 46–48 °C)
const DAYS = 120; // length of a simulated CSS cycle, days
const DEPTH = 1150; // reservoir depth, m
const PUMPD = 1100; // pump setting depth, m
const TSURF = 30; // surface temperature, °C

let OIL = 5500; // oil price, ₹/bbl (changed by the price slider)
const STEAM = 2600; // steam cost, ₹/t
const KWH = 8; // power cost, ₹/kWh

// ---------------------------------------------------------------------------
// Viscosity: Andrade equation  ln(mu) = A + B / T
// Fitted to 11,500 cP at 50 °C (OIL: 10,000–13,000 cP) and ~80 cP at 150 °C.
// ---------------------------------------------------------------------------

const VISC_B = 6793;
const VISC_A = Math.log(11500) - VISC_B / 323.15;

/** Oil viscosity in cP at temperature T in °C. */
const mu = (T) => Math.exp(VISC_A + VISC_B / (T + 273.15));

/** Viscosity at original reservoir temperature: the reference for inflow. */
const MREF = mu(TR);

/** Steam saturation temperature (°C) at a pressure given in kg/cm2. */
const tsat = (pressureKg) => 179.9 * Math.pow(pressureKg * 0.0981, 0.23);

/** Undisturbed (geothermal) temperature at depth z, °C. */
const tgeo = (z) => TSURF + ((TR - TSURF) * z) / DEPTH;

// ---------------------------------------------------------------------------
// Rod string and pump
// ---------------------------------------------------------------------------

const RR = 0.0111; // rod radius, m (7/8 in rods)
const RT = 0.031; // tubing inner radius, m (2-7/8 in tubing)
const LNK = Math.log(RT / RR); // geometry term of annular (Couette) drag
const AR = Math.PI * RR * RR; // rod cross-section, m2

const RHO_S = 7850; // steel density, kg/m3
const RHO_O = 950; // heavy-oil density, kg/m3
const E_ROD = 2.07e11; // Young's modulus of steel, Pa
const EA = E_ROD * AR; // axial stiffness, N
const A_W = Math.sqrt(E_ROD / RHO_S); // stress-wave speed in steel, m/s

/** Buoyant weight of the whole rod string, N. */
const WB = (RHO_S - RHO_O) * 9.81 * AR * PUMPD;

const AP = Math.PI * 0.0159 * 0.0159; // plunger area, m2 (1.25 in pump)
const FO = RHO_O * 9.81 * PUMPD * AP; // fluid load on the plunger, N
const ROD_ALLOW = 80000; // allowable rod load, N (7/8 in grade-D, simplified)

const HEATER_KW = 40; // electric downhole heater power
const HEAT_DT = 35; // heater keeps the upper 700 m this much above geothermal, °C

// ---------------------------------------------------------------------------
// Wellbore temperature and rod-fall limit
// ---------------------------------------------------------------------------

/**
 * Temperature of produced fluid at depth z (m). The fluid leaves the sand at
 * Tbh and relaxes towards geothermal over a length that grows with rate q.
 */
function tubingT(z, Tbh, q, heater) {
  const relaxLength = Math.max(150, 25 * q);
  let T = tgeo(z) + (Tbh - TR) * Math.exp(-(DEPTH - z) / relaxLength);
  if (heater && z < 700) T = Math.max(T, tgeo(z) + HEAT_DT);
  return T;
}

/**
 * Fastest pump speed (SPM) before the rods float.
 *
 * On the downstroke the buoyant rod weight must overcome the viscous drag of
 * the tubing oil: drag per metre = 2·pi·mu·v / ln(RT/RR). Integrating along the
 * tubing temperature profile gives the maximum rod-fall speed; a slower VFD
 * downstroke (ratio vr) allows a higher overall SPM.
 */
function rodLimit(Tbh, q, heater, strokeIn, vr) {
  const segments = 22;
  let dragPerSpeed = 0;
  let muAvg = 0;

  for (let i = 0; i < segments; i++) {
    const z = ((i + 0.5) * PUMPD) / segments;
    const muPa = mu(tubingT(z, Tbh, q, heater)) / 1000;
    dragPerSpeed += ((2 * Math.PI * muPa) / LNK) * (PUMPD / segments);
    muAvg += (muPa * 1000) / segments;
  }

  const vmax = WB / dragPerSpeed;
  const stroke = strokeIn * 0.0254;
  const spm = Math.min(12, (60 * vmax * 2 * vr) / (Math.PI * stroke * (1 + vr)));
  return { spm, muAvg, vmax };
}

// ---------------------------------------------------------------------------
// Gibbs damped wave equation for the rod string
//
//   d2u/dt2 = a^2 · d2u/dx2 − c · du/dt
//
// solved by explicit finite differences. Top: polished-rod motion. Bottom:
// pump load (fluid load on the upstroke, released on the downstroke once the
// plunger meets liquid). Damping c comes from the tubing-oil viscosity.
// ---------------------------------------------------------------------------

/**
 * Simulates two strokes and returns the second as surface and pump cards.
 * @param {number} spm       strokes per minute
 * @param {number} strokeIn  surface stroke length, inches
 * @param {number} vr        downstroke / upstroke time ratio set by the VFD
 * @param {number} muPa      average tubing-oil viscosity, Pa·s
 * @param {number} fill      pump fillage, 0–1
 */
function rodWave(spm, strokeIn, vr, muPa, fill) {
  const nodes = 40;
  const dx = PUMPD / nodes;
  const dt = (0.9 * dx) / A_W; // CFL-stable time step
  const S = strokeIn * 0.0254;
  const period = 60 / spm;
  const tUp = period / (1 + vr);
  const tDown = period - tUp;

  // Viscous damping from the tubing oil, never below Gibbs' structural damping (nu = 0.1).
  const viscous = (2 * Math.PI * muPa) / LNK / (RHO_S * AR);
  const structural = (Math.PI * A_W * 0.1) / (2 * PUMPD);
  const c = Math.max(viscous, structural);

  const r2 = Math.pow((A_W * dt) / dx, 2);
  const k1 = 1 + (c * dt) / 2;
  const k2 = 1 - (c * dt) / 2;

  const u = new Float64Array(nodes + 1).fill(S); // displacement now (downwards positive)
  const uPrev = new Float64Array(nodes + 1).fill(S);
  const uNext = new Float64Array(nodes + 1);

  // Polished-rod position: bottom of stroke = S, top = 0.
  const topPosition = (t) => {
    t = t % period;
    return t < tUp
      ? (S / 2) * (1 + Math.cos((Math.PI * t) / tUp))
      : (S / 2) * (1 - Math.cos((Math.PI * (t - tUp)) / tDown));
  };

  // Valves switch at plunger turning points. The tolerance is larger than the
  // rod stretch caused by the fluid load (~0.11 m), so vibration cannot chatter them.
  const tolerance = Math.max(0.01 * S, (2.5 * FO * PUMPD) / EA);
  let valve = "up";
  let extreme = S;
  let topReach = 0;
  let pumpLoad = FO;

  const surf = [];
  const down = [];
  let prlMin = Infinity;
  let prlMax = -Infinity;
  let upSum = 0;
  let upCount = 0;
  let downSum = 0;
  let downCount = 0;

  const steps = Math.ceil((2 * period) / dt);
  const every = Math.max(1, Math.floor(period / dt / 300));

  for (let n = 0; n < steps; n++) {
    const t = n * dt;
    const plunger = u[nodes];

    if (valve === "up") {
      if (plunger < extreme) extreme = plunger;
      if (plunger > extreme + tolerance) {
        valve = "down";
        topReach = extreme;
        extreme = plunger;
      }
    } else {
      if (plunger > extreme) extreme = plunger;
      if (plunger < extreme - tolerance) {
        valve = "up";
        extreme = plunger;
      }
    }

    // On the downstroke the load stays on until the plunger reaches liquid (fillage).
    const target = valve === "up" || plunger - topReach < (1 - fill) * S ? FO : 0;
    pumpLoad += (target - pumpLoad) * Math.min(1, dt / 0.25); // gradual transfer (fluid compressibility)

    for (let i = 1; i < nodes; i++) {
      uNext[i] = (2 * u[i] - k2 * uPrev[i] + r2 * (u[i + 1] - 2 * u[i] + u[i - 1])) / k1;
    }
    const ghost = u[nodes - 1] + (2 * dx * pumpLoad) / EA; // bottom boundary: EA·du/dx = pump load
    uNext[nodes] =
      (2 * u[nodes] - k2 * uPrev[nodes] + r2 * (ghost - 2 * u[nodes] + u[nodes - 1])) / k1;
    uNext[0] = topPosition(t + dt);

    uPrev.set(u);
    u.set(uNext);

    if (t < period) continue; // the first stroke settles the start-up transient

    const prl = WB + (EA * (u[1] - u[0])) / dx; // polished-rod load
    const phase = t % period;
    if (phase > 0.3 * tUp && phase < 0.7 * tUp) {
      upSum += prl;
      upCount++;
    } else if (phase > tUp + 0.3 * tDown && phase < tUp + 0.7 * tDown) {
      downSum += prl;
      downCount++;
    }
    prlMin = Math.min(prlMin, prl);
    prlMax = Math.max(prlMax, prl);
    if (n % every === 0) {
      surf.push([S - u[0], prl]);
      down.push([S - u[nodes], pumpLoad]);
    }
  }

  return {
    surf,
    down,
    prlMin,
    prlMax,
    S,
    c,
    upMean: upSum / Math.max(1, upCount),
    dnMean: downSum / Math.max(1, downCount),
  };
}
