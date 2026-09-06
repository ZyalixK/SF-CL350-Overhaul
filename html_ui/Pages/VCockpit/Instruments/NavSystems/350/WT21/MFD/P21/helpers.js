function fitCanvasToContainer(canvas) {
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
}

function roundNumberSetDecimal(val, decimals = 1) {
  return Math.round(val * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

function numberWithMinimumDigitString(val, minDigit = 3) {
  return String(Math.round(val)).padStart(minDigit, "0");
}

function degreeToRadians(degrees) {
  return degrees * (Math.PI / 180);
}

function radiansToDegrees(radians) {
  return radians * (180 / Math.PI);
}

function ascendingInterpolation(x, xMin, xMax, yMin, yMax) {
  return yMin + ((yMax - yMin) * (x - xMin)) / (xMax - xMin);
}

function convertRemToPixels(rem) {
  return rem * parseFloat(getComputedStyle(document.documentElement).fontSize);
}

function getHeadingDiff(h1, h2) {
  return ((h2 - h1 + 540) % 360) - 180;
}

function knotsToFeetPerMinute(knots) {
  return knots * 101.2685916476;
}

const clampNumber = (num, min, max) => Math.min(Math.max(num, min), max);

function convertPsfToPsi(pressurePsf) {
  const pressurePsi = pressurePsf / 144;
  return pressurePsi;
}

function diffAndSetClass(element, className) {
  if (!element.classList.contains(className)) {
    element.classList.add(className);
  }
}

function extractTransponderCode(bco16) {

  const raw = Number(bco16);
  if (!isFinite(raw)) {
    return "----";
  }
  return Math.round(raw).toString(16).toUpperCase().padStart(4, "0");
}

const transponderStates = ["Off", "Stby", "Test", "On", "Alt", "Ground"];

function convertRankineToCelsius(rankine) {
  return (rankine - 491.67) * (5 / 9);
}

function convertGallonsToPounds(gallons, density = 6.75) {
  return gallons * density;
}

const P21ApuGen = {
  FALLBACK_ALTERNATOR_INDEX: 3,


  volts() {
    const v = Number(SimVar.GetSimVarValue("APU VOLTS", "volts"));
    if (isFinite(v) && v > 0) { return v; }
    const fb = Number(SimVar.GetSimVarValue(
      "ELECTRICAL GENALT BUS VOLTAGE:" + this.FALLBACK_ALTERNATOR_INDEX, "volts"));
    return isFinite(fb) ? fb : 0;
  },


  amps() {
    const a = Number(SimVar.GetSimVarValue(
      "ELECTRICAL GENALT BUS AMPS:" + this.FALLBACK_ALTERNATOR_INDEX, "amperes"));
    return isFinite(a) ? a : 0;
  },


  online() {
    if (SimVar.GetSimVarValue("APU GENERATOR ACTIVE", "Bool")) { return true; }
    return this.volts() > 0;
  },


  switchOn() {
    return !!SimVar.GetSimVarValue("APU GENERATOR SWITCH:1", "Bool");
  }
};


const P21Bleed = {
  IDLE_N2_PCT: 55,      
  MAX_N2_PCT: 100,
  IDLE_PSI: 30,
  MAX_PSI: 62,
  APU_PSI: 42,          
  GROUND_PSI: 45,

  APU_RUNNING_RPM_PCT: 95,

  apuIsRunning(rpmPct) {
    const n = Number(rpmPct);
    return isFinite(n) && n >= this.APU_RUNNING_RPM_PCT;
  },


  enginePsi(n2) {
    const n = Number(n2);
    if (!isFinite(n) || n <= 0) { return 0; }
    if (n < this.IDLE_N2_PCT) {

      return Math.max(0, (n / this.IDLE_N2_PCT) * this.IDLE_PSI);
    }
    const span = this.MAX_N2_PCT - this.IDLE_N2_PCT;
    const k = span > 0 ? (n - this.IDLE_N2_PCT) / span : 0;
    return this.IDLE_PSI + Math.min(1, k) * (this.MAX_PSI - this.IDLE_PSI);
  },

  manifold({ engine, valve, apuRunning, groundAir }) {
    const v = valve || {};
    const e = engine || {};
    const left = v.leftIp ? this.enginePsi(e.left) : 0;
    const right = v.rightIp ? this.enginePsi(e.right) : 0;
    const apu = (v.apuBleed && apuRunning) ? this.APU_PSI : 0;
    const gnd = groundAir ? this.GROUND_PSI : 0;


    const common = Math.max(apu, gnd);
    if (v.xBleed) {
      const both = Math.max(left, right, common);
      return { left: both, right: both };
    }
    return { left: Math.max(left, common), right: Math.max(right, common) };
  },
};

const P21Hyd = {

  SERVICED_GEAR_DOWN: { left: 65, right: 70, aux: 75 },

  GEAR_SWING_PCT: 15,

  QUANTITY_STEP_PCT: 2,

  BAND: {
    left: { lo: 30, hi: 85 },
    right: { lo: 40, hi: 85 },
    aux: { lo: 20, hi: 85 },
  },


  swingFor(system) {
    return system === "left" ? this.GEAR_SWING_PCT : 0;
  },


  quantize(pct) {
    const step = this.QUANTITY_STEP_PCT;
    return Math.round(pct / step) * step;
  },


  quantity(system, gearExtendedPct) {
    const base = this.SERVICED_GEAR_DOWN[system];
    if (typeof base !== "number") { return 0; }
    const ext = (typeof gearExtendedPct === "number" && isFinite(gearExtendedPct))
      ? Math.min(100, Math.max(0, gearExtendedPct))
      : 100;
    const up = (100 - ext) / 100;
    const raw = base + this.swingFor(system) * up;
    return this.quantize(Math.min(100, Math.max(0, raw)));
  },

  PTU_OFF: 0,
  PTU_AUTO: 1,
  PTU_ON: 2,

  GEAR_MISMATCH_PCT: 1,


  ptuState(input) {
    const i = input || {};
    const knob = Number(i.knob);
    const ext = (typeof i.gearExtendedPct === "number" && isFinite(i.gearExtendedPct))
      ? i.gearExtendedPct : 100;
    const cmd = (typeof i.gearCommandedPct === "number" && isFinite(i.gearCommandedPct))
      ? i.gearCommandedPct : ext;
    const gearMoving = Math.abs(ext - cmd) > this.GEAR_MISMATCH_PCT;
    const driven = !!i.rightEdpDriving;
    const autoWouldRun = !!i.leftEngineOut && driven && gearMoving && !!i.airborne;

    let open;
    if (knob === this.PTU_ON) { open = true; }
    else if (knob === this.PTU_AUTO) { open = autoWouldRun; }
    else { open = false; }

    return { open, driven, green: open && driven, autoWouldRun, gearMoving };
  },


  inBand(system, pct) {
    const b = this.BAND[system];
    if (!b) { return true; }
    return pct >= b.lo && pct <= b.hi;
  },

  HX_GOVERNED_C: 51.7,
  WARMUP_TAU_S: 600,

  LIVE_PSI: 500,


  stepTempC(previousC, pressurised, ambientC, dtMs) {
    const amb = (typeof ambientC === "number" && isFinite(ambientC)) ? ambientC : 15;
    const target = pressurised ? Math.max(amb, this.HX_GOVERNED_C) : amb;
    if (typeof previousC !== "number" || !isFinite(previousC)) { return target; }
    const dt = (typeof dtMs === "number" && isFinite(dtMs) && dtMs > 0) ? dtMs / 1000 : 0;
    if (dt <= 0) { return previousC; }

    const k = 1 - Math.exp(-dt / this.WARMUP_TAU_S);
    return previousC + (target - previousC) * k;
  },
};
