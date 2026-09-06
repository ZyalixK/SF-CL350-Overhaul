class EICAS extends TemplateElement {
  constructor() {
    super();
    this.states = {
      apu: {
        egt: null,
      },
    };

    this.apuItt = { phase: "off", value: null, lastMs: null };


    this.apuVis = { onAtMs: null, offAtMs: null, wasShown: false };

    this.gfDeclutter = { state: null, sinceMs: null };


    this.hydLow = { sinceMs: null };

    this.flapsFailLatched = false;
    this.simvar = {};
  }

  get templateID() {
    return "eicas-page-template";
  }

  get isInitialized() {
    return this.el ? true : false;
  }

  init() {
    this.el = document.getElementById(this.id);

    // components
    this.n1 = {
      left: document.getElementById("n1-left"),
      right: document.getElementById("n1-right"),
    };
    this.itt = {
      left: document.getElementById("itt-left"),
      right: document.getElementById("itt-right"),
    };
    this.n2 = {
      left: document.getElementById("n2-left"),
      right: document.getElementById("n2-right"),
    };
    this.oilPress = {
      left: document.getElementById("oil-press-left"),
      right: document.getElementById("oil-press-right"),
    };
    this.oilTemp = {
      left: document.getElementById("oil-temp-left"),
      right: document.getElementById("oil-temp-right"),
    };
    this.ff = {
      left: document.getElementById("ff-left"),
      right: document.getElementById("ff-right"),
    };

    this.engStart = {
      left: this.querySelector("#eng-start-left"),
      right: this.querySelector("#eng-start-right"),
    };
    this.engIgn = {
      left: this.querySelector("#eng-ign-left"),
      right: this.querySelector("#eng-ign-right"),
    };

    this.engSync = this.querySelector("#eng-sync");


    this.gearTransitSince = null;


    this.apuWasRunning = false;


    this.engN2Prev = { left: null, right: null, ms: 0 };

    this.casInhibit = { to: false, land: false, prevAgl: 0 };

    this.casSeq = new Map();
    this.casSeqNext = 1;

    this.engPhase = { left: "off", right: "off" };

    this.engPrevN2 = { left: 0, right: 0 };
    this.engSeeded = { left: false, right: false };
    this.apu = {
      rpm: this.querySelector("#apu-rpm"),
      egt: this.querySelector("#apu-egt"),

      section: this.querySelector("#apu-section"),
      start: this.querySelector("#apu-start"),
    };
    this.fuel = {
      qtyLeft: document.getElementById("fuel-qty-left"),
      qtyRight: document.getElementById("fuel-qty-right"),
      qtyTotal: document.getElementById("fuel-qty-total"),
    };
    this.stabGauge = this.querySelector("#stab-gauge");
    this.flapsGauge = this.querySelector("#flaps-gauge");
    this.aileronGauge = this.querySelector("#aileron-gauge");
    this.rudderTrimGauge = this.querySelector("#rudder-trim-gauge");
    this.gearGauge = this.querySelector("#gear-gauge");
    this.spoilersGauge = this.querySelector("#spoilers-gauge");
    this.cabReadout = this.querySelector("#cab-readout");
    this.messages = this.querySelector("#eicas-messages");

    window.eicas = this;
  }

  connectedCallback() {
    super.connectedCallback();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  getSimVars() {
    this.simvar = {
      n1: {
        left: {
          maxRpm: 101,
          rpm: SimVar.GetSimVarValue("TURB ENG N1:1", "percent"),
          target: SimVar.GetSimVarValue("TURB ENG COMMANDED N1:1", "percent"),
          targetReverse: SimVar.GetSimVarValue(
            "TURB ENG REVERSE NOZZLE PERCENT:1",
            "percent"
          ),
        },
        right: {
          maxRpm: 101,
          rpm: SimVar.GetSimVarValue("TURB ENG N1:2", "percent"),

          target: SimVar.GetSimVarValue("TURB ENG COMMANDED N1:2", "percent"),
          targetReverse: SimVar.GetSimVarValue(
            "TURB ENG REVERSE NOZZLE PERCENT:2",
            "percent"
          ),
        },
      },
      itt: {

        max: 955,
        left: parseInt(SimVar.GetSimVarValue("TURB ENG ITT:1", "rankine")),
        right: parseInt(SimVar.GetSimVarValue("TURB ENG ITT:2", "rankine")),
      },
      n2: {
        left: SimVar.GetSimVarValue("TURB ENG N2:1", "percent"),
        right: SimVar.GetSimVarValue("TURB ENG N2:2", "percent"),
      },

      combustion: {
        left: !!SimVar.GetSimVarValue("ENG COMBUSTION:1", "Bool"),
        right: !!SimVar.GetSimVarValue("ENG COMBUSTION:2", "Bool"),
      },
      oilPress: {
        left: parseInt(SimVar.GetSimVarValue("ENG OIL PRESSURE:1", "psi")),
        right: parseInt(SimVar.GetSimVarValue("ENG OIL PRESSURE:2", "psi")),
      },
      oilTemp: {
        left: parseInt(
          SimVar.GetSimVarValue("ENG OIL TEMPERATURE:1", "celsius")
        ),
        right: parseInt(
          SimVar.GetSimVarValue("ENG OIL TEMPERATURE:2", "celsius")
        ),
      },
      ff: {
        left: SimVar.GetSimVarValue("ENG FUEL FLOW PPH:1", "pounds per hour"), // pph - pounds per hour
        right: SimVar.GetSimVarValue("ENG FUEL FLOW PPH:2", "pounds per hour"), // pph - pounds per hour
      },
      apu: {
        rpm: SimVar.GetSimVarValue("APU PCT RPM", "Percent Over 100") * 100,

        selected: SimVar.GetSimVarValue("APU SWITCH", "Bool"),
        knob: SimVar.GetSimVarValue("L:XMLVAR_APU_StarterKnob_Pos", "Number"),

        ambient: SimVar.GetSimVarValue("AMBIENT TEMPERATURE", "celsius"),
      },

      fadec: {
        left: {
          target: SimVar.GetSimVarValue("L:FADEC_TGT_N1_1", "percent"),
          mode: SimVar.GetSimVarValue("L:FADEC_TGT_MODE_1", "number"),
        },
        right: {
          target: SimVar.GetSimVarValue("L:FADEC_TGT_N1_2", "percent"),
          mode: SimVar.GetSimVarValue("L:FADEC_TGT_MODE_2", "number"),
        },
      },
      fuel: {
        qtyLeft: parseInt(
          SimVar.GetSimVarValue("FUEL LEFT QUANTITY", "gallons")
        ),
        qtyRight: parseInt(
          SimVar.GetSimVarValue("FUEL RIGHT QUANTITY", "gallons")
        ),
        totalWeight: parseInt(
          SimVar.GetSimVarValue("FUEL TOTAL QUANTITY WEIGHT", "pounds")
        ),
      },
      pitchTrim: {
        rad: parseFloat(
          SimVar.GetSimVarValue("ELEVATOR TRIM POSITION", "Radians")
        ),
        pct: SimVar.GetSimVarValue("ELEVATOR TRIM PCT", "Percent Over 100"),
      },

      flaps: {
        num: SimVar.GetSimVarValue("TRAILING EDGE FLAPS LEFT INDEX", "Number"),
        angle: SimVar.GetSimVarValue("TRAILING EDGE FLAPS LEFT ANGLE", "degrees"),
        commanded: SimVar.GetSimVarValue("FLAPS HANDLE INDEX", "Number"),
      },
      aileron: {
        left: {
          rad: SimVar.GetSimVarValue("AILERON LEFT DEFLECTION", "Radians"),
        },
        right: {
          rad: SimVar.GetSimVarValue("AILERON RIGHT DEFLECTION", "Radians"),
        },
      },
      rudder: {
        rad: SimVar.GetSimVarValue("RUDDER DEFLECTION", "Radians"),
        pct: SimVar.GetSimVarValue("RUDDER DEFLECTION PCT", "Percent Over 100"),
      },
      rudderTrim: {
        pct: SimVar.GetSimVarValue("RUDDER TRIM PCT", "Percent Over 100"),
        rad: SimVar.GetSimVarValue("RUDDER TRIM", "Radians"),
      },
      gears: {
        center: SimVar.GetSimVarValue("GEAR CENTER POSITION", "Percent Over 100"),
        left: SimVar.GetSimVarValue("GEAR LEFT POSITION", "Percent Over 100"),
        right: SimVar.GetSimVarValue("GEAR RIGHT POSITION", "Percent Over 100"),
      },

      bleeds: {
        left: SimVar.GetSimVarValue("L:P21_LBLEED_BTN", "Number"),
        right: SimVar.GetSimVarValue("L:P21_RBLEED_BTN", "Number"),
      },

      cabin: {
        pressAlt: SimVar.GetSimVarValue(
          "PRESSURIZATION CABIN ALTITUDE",
          "Feet"
        ),
        pressAltRate: SimVar.GetSimVarValue(
          "PRESSURIZATION CABIN ALTITUDE RATE",
          "Feet per second"
        ),
        dp: SimVar.GetSimVarValue(
          "PRESSURIZATION PRESSURE DIFFERENTIAL",
          "PSI"
        ),
        cabinTemp: SimVar.GetSimVarValue("AMBIENT TEMPERATURE", "celsius"),

        landingAlt: SimVar.GetSimVarValue("L:P21_LNDG_ELEV_SET", "Number") === 1
          ? SimVar.GetSimVarValue("L:P21_LNDG_ELEV_FT", "Number")
          : NaN,
        oxyQty: undefined,
      },
      spoilers: {
        left: SimVar.GetSimVarValue(
          "SPOILERONS LEFT POSITION",
          "Percent Over 100"
        ),
        right: SimVar.GetSimVarValue(
          "SPOILERONS RIGHT POSITION",
          "Percent Over 100"
        ),
        leftGnd: SimVar.GetSimVarValue(
          "SPOILERS LEFT POSITION",
          "Percent Over 100"
        ),
        rightGnd: SimVar.GetSimVarValue(
          "SPOILERS RIGHT POSITION",
          "Percent Over 100"
        ),

        handle: SimVar.GetSimVarValue("SPOILERS HANDLE POSITION", "Percent Over 100"),

        n1: {
          1: SimVar.GetSimVarValue("TURB ENG N1:1", "percent"),
          2: SimVar.GetSimVarValue("TURB ENG N1:2", "percent"),
        },

        onGround: !!SimVar.GetSimVarValue("SIM ON GROUND", "Bool"),
      },
    };
  }

  updateApuItt(rpm, ambientC) {
    const amb = typeof ambientC === "number" && isFinite(ambientC) ? ambientC : 15;
    const s = this.apuItt;
    if (s.value === null) {
      s.value = amb;
    }

    const nowMs = Date.now();

    const dt = s.lastMs === null ? 0 : Math.max(0, Math.min(5, (nowMs - s.lastMs) / 1000));
    s.lastMs = nowMs;

    const pct = typeof rpm === "number" && isFinite(rpm) ? rpm : 0;

    const wasStarting = s.phase === "starting";
    if (pct < 1) {
      s.phase = "off";
    } else if (pct >= 99.5) {
      s.phase = "running";
    } else if (s.phase === "running" || s.phase === "cooling") {
      s.phase = "cooling";
    } else {
      s.phase = "starting";
    }

    if (s.phase === "running" && wasStarting) {
      s.value = EICAS.apuStartItt(100, amb);
    }

    if (s.phase === "starting") {
      s.value = EICAS.apuStartItt(pct, amb);
    } else {


      const running = s.phase === "running";

      const target = running ? EICAS.apuRunningItt(amb) : amb;
      const tau = running ? EICAS.APU_ITT_TAU_SETTLE : EICAS.APU_ITT_TAU_COOL;
      const k = dt > 0 ? 1 - Math.exp(-dt / tau) : 0;
      s.value = s.value + (target - s.value) * k;
    }
    return s.value;
  }

  static get CABIN_ALT_CAUTION_FT() { return 8500; }   
  static get CABIN_ALT_WARN_FT() { return 9400; }      

  static get CABIN_ALT_CAUTION_ABOVE_FIELD_FT() { return 650; }
  static get CABIN_ALT_WARN_ABOVE_FIELD_FT() { return 1550; }
  static get CABIN_ALT_THRESHOLD_CAP_FT() { return 14300; }

  static cabinAltThreshold(baseFt, aboveFieldFt) {

    const set = SimVar.GetSimVarValue("L:P21_LNDG_ELEV_SET", "Number") === 1;
    if (!set) { return baseFt; }
    const field = SimVar.GetSimVarValue("L:P21_LNDG_ELEV_FT", "Number");
    if (!isFinite(field)) { return baseFt; }
    return Math.min(EICAS.CABIN_ALT_THRESHOLD_CAP_FT, Math.max(baseFt, field + aboveFieldFt));
  }
  static get CABIN_DP_MAX_PSID() { return 9.2; }       
  static get CABIN_DP_MIN_PSID() { return -0.5; }      

  static get STAB_TO_UNITS_MIN() { return 2.5; }   
  static get STAB_TO_UNITS_MAX() { return 8.0; }
  static get STAB_UNITS_FULL() { return 15; }
  static get STAB_TRIM_DEG_ND() { return -5; }     
  static get STAB_TRIM_DEG_NU() { return 12.5; }   
  static get STAB_TRIM_DEG_SPAN() { return EICAS.STAB_TRIM_DEG_NU - EICAS.STAB_TRIM_DEG_ND; }
  static stabUnitsToDeg(u) {
    return EICAS.STAB_TRIM_DEG_ND + EICAS.STAB_TRIM_DEG_SPAN * u / EICAS.STAB_UNITS_FULL;
  }
  static stabPctToDeg(pct) { return pct * EICAS.STAB_TRIM_DEG_NU; }
  static get STAB_TO_DEG_MIN() { return EICAS.stabUnitsToDeg(EICAS.STAB_TO_UNITS_MIN); }
  static get STAB_TO_DEG_MAX() { return EICAS.stabUnitsToDeg(EICAS.STAB_TO_UNITS_MAX); }

  static get TO_CONFIG_THROTTLE_PCT() { return 77.6; }   

  static get SYNC_LEVER_MIN_PCT() { return 3.5; }    
  static get SYNC_LEVER_MAX_PCT() { return 95.8; }   

  static get SYNC_TOLERANCE_PCT() { return 5; }

  static get BLEED_OFF_MIN_ALT_FT() { return 10000; }
  static get FUEL_LB_PER_GAL() { return 6.75; }        
  static get FUEL_QTY_LOW_LB() { return 300; }         

  static get FUEL_IMBALANCE_BANDS() {
    return [
      { aboveTotalLb: 13700, limitLb: 250 },
      { aboveTotalLb: 10000, limitLb: 315 },
      { aboveTotalLb: 4700, limitLb: 450 },
      { aboveTotalLb: 0, limitLb: 600 }
    ];
  }
  static get GEAR_DISAGREE_SECONDS() { return 28; }    

  static get STARTER_FAIL_ON_N2() { return 51; }       

  static get ENG_IDLE_N2() { return 55; }

  static get C7_N2_RATE_WINDOW_MS() { return 500; }
  static get C7_N2_FALL_EPS() { return 0.2; }

  static get C7_ITT_FALL_EPS_C() { return 1.0; }


  static apuRunningItt(ambientC) {
    const amb = (ambientC - EICAS.APU_ITT_IDLE_REF_SAT) * EICAS.APU_ITT_AMB_SLOPE;
    const load = SimVar.GetSimVarValue("L:P21_APU_BTN", "Number") === 1
      ? EICAS.APU_ITT_LOAD_BLEED : 0;
    return EICAS.APU_ITT_IDLE + amb + load;
  }

  static get TO_FLAP_POSITIONS() { return [1, 2]; }   

  static get BATT_OVERHEAT_C() { return 70; }

  static get HYD_PRESS_LOW_PSI() { return 1800; }

  static get HYD_PRESS_LOW_DWELL_MS() { return 60000; }

  updateFlightPhase() {
    const ias = SimVar.GetSimVarValue("AIRSPEED INDICATED", "knots");
    const agl = SimVar.GetSimVarValue("PLANE ALT ABOVE GROUND", "feet");
    const onGround = !!SimVar.GetSimVarValue("SIM ON GROUND", "Bool");


    if (!this.casInhibit.to && onGround && ias > 80) {
      this.casInhibit.to = true;
    } else if (this.casInhibit.to && agl >= 400) {
      this.casInhibit.to = false;
    }

    const descending = agl < this.casInhibit.prevAgl;
    if (!this.casInhibit.land && descending && agl < 400 && !this.casInhibit.to) {
      this.casInhibit.land = true;
    } else if (this.casInhibit.land && ias < 40) {
      this.casInhibit.land = false;
    }
    this.casInhibit.prevAgl = agl;
  }


  isInhibited(flag) {
    if (!flag || flag === "-") { return false; }
    if (this.casInhibit.to && (flag === "TO" || flag === "TO/LAND")) { return true; }
    if (this.casInhibit.land && (flag === "LAND" || flag === "TO/LAND")) { return true; }
    return false;
  }

  buildCasMessages() {
    const sv = (name, unit) => SimVar.GetSimVarValue(name, unit);
    const lvar = (name) => SimVar.GetSimVarValue("L:" + name, "Number");
    const out = [];

    const inhibitFor = (typeof casInhibitFor === "function")
      ? casInhibitFor
      : () => "-";
    const add = (text, tier) => out.push({ text, tier, inhibit: inhibitFor(text, tier) });
    const onGroundNow = !!sv("SIM ON GROUND", "Bool");

    const oilGate = (side, idx) =>
      !!sv("ENG COMBUSTION:" + idx, "Bool") && this.engPhase[side] !== "starting";
    if (oilGate("left", 1) &&
        Number(this.simvar.oilPress.left) < EICAS.OIL_PRESS_RED_BELOW) {
      add("L ENG OIL PRESS LOW", "warning");
    }
    if (oilGate("right", 2) &&
        Number(this.simvar.oilPress.right) < EICAS.OIL_PRESS_RED_BELOW) {
      add("R ENG OIL PRESS LOW", "warning");
    }

    const fireTest = lvar("P21_FIRE_TEST_RUN") === 1;
    if (sv("ENG ON FIRE:1", "Bool") || fireTest) { add("L ENGINE FIRE", "warning"); }
    if (sv("ENG ON FIRE:2", "Bool") || fireTest) { add("R ENGINE FIRE", "warning"); }


    if (fireTest) { add("GEAR BAY OVHT", "warning"); }

    if (lvar("P21_FIRE_APU_DETECTED") === 1 || fireTest) { add("APU FIRE", "warning"); }

    const cabAlt = sv("PRESSURIZATION CABIN ALTITUDE", "feet");


    const cabWarnAt = EICAS.cabinAltThreshold(
      EICAS.CABIN_ALT_WARN_FT, EICAS.CABIN_ALT_WARN_ABOVE_FIELD_FT);
    const cabCautionAt = EICAS.cabinAltThreshold(
      EICAS.CABIN_ALT_CAUTION_FT, EICAS.CABIN_ALT_CAUTION_ABOVE_FIELD_FT);
    if (cabAlt >= cabWarnAt) {
      add("CABIN ALTITUDE", "warning");
    } else if (cabAlt >= cabCautionAt) {
      add("CABIN ALTITUDE", "caution");
    }
    const dp = convertPsfToPsi(sv("PRESSURIZATION PRESSURE DIFFERENTIAL", "psf"));
    if (dp > EICAS.CABIN_DP_MAX_PSID || dp < EICAS.CABIN_DP_MIN_PSID) {
      add("CABIN DELTA P", "warning");
    }

    const leverPct = (i) => lvar("WT_Virtual_Throttle_Lever_Pos_" + i);
    const toConfig = onGroundNow &&
      leverPct(1) >= EICAS.TO_CONFIG_THROTTLE_PCT &&
      leverPct(2) >= EICAS.TO_CONFIG_THROTTLE_PCT;
    if (toConfig) {

      const spoilerOut =
        sv("SPOILERS LEFT POSITION", "Percent Over 100") > 0.02 ||
        sv("SPOILERS RIGHT POSITION", "Percent Over 100") > 0.02;
      if (spoilerOut) { add("CONFIG SPOILERS", "warning"); }
      if (sv("AUTOPILOT MASTER", "Bool")) { add("CONFIG AUTOPILOT", "warning"); }

      if (!EICAS.TO_FLAP_POSITIONS.includes(Math.round(sv("FLAPS HANDLE INDEX", "Number")))) {
        add("CONFIG FLAPS", "warning");
      }
      if (sv("BRAKE PARKING POSITION", "Bool")) { add("PARK/EMER BRAKE ON", "warning"); }

      const stabDeg = EICAS.stabPctToDeg(sv("ELEVATOR TRIM PCT", "Percent Over 100"));
      if (stabDeg < EICAS.STAB_TO_DEG_MIN || stabDeg > EICAS.STAB_TO_DEG_MAX) {
        add("CONFIG STAB TRIM", "warning");
      }
    }

    const bothEnginesRunning = !!sv("ENG COMBUSTION:1", "Bool") && !!sv("ENG COMBUSTION:2", "Bool");
    const hydPsi = (i) => convertPsfToPsi(sv("HYDRAULIC PRESSURE:" + i, "psf"));

    const hydLowNow = bothEnginesRunning
      && (hydPsi(1) < EICAS.HYD_PRESS_LOW_PSI || hydPsi(1) < EICAS.HYD_PRESS_LOW_PSI);
    const nowMs = Date.now();
    if (!hydLowNow) {
      this.hydLow.sinceMs = null;
    } else if (this.hydLow.sinceMs === null) {
      this.hydLow.sinceMs = nowMs;
    }

    const hydSettled = this.hydLow.sinceMs !== null
      && nowMs - this.hydLow.sinceMs >= EICAS.HYD_PRESS_LOW_DWELL_MS;

    const hydL = hydSettled && hydPsi(1) < EICAS.HYD_PRESS_LOW_PSI;
    const hydR = hydSettled && hydPsi(1) < EICAS.HYD_PRESS_LOW_PSI;
    if (hydL && hydR) {
      add("HYD PRESS LOW", "warning");
    } else {
      if (hydL) { add("L HYD PRESS LOW", "caution"); }
      if (hydR) { add("R HYD PRESS LOW", "caution"); }
    }

    const genVolts = (i) => (i === 3 && typeof P21ApuGen !== "undefined")
      ? P21ApuGen.volts()
      : sv("ELECTRICAL GENALT BUS VOLTAGE:" + i, "volts");
    const anyGenOnline = genVolts(1) > 0 || genVolts(2) > 0 || genVolts(3) > 0;
    if (!onGroundNow && !anyGenOnline) { add("ESSENTIAL POWER ONLY", "warning"); }

    const revPct = (i) => sv("TURB ENG REVERSE NOZZLE PERCENT:" + i, "percent");

    if (!onGroundNow) {
      if (revPct(1) > EICAS.REV_STOWED_PCT) { add("L REVERSER UNSAFE", "warning"); }
      if (revPct(2) > EICAS.REV_STOWED_PCT) { add("R REVERSER UNSAFE", "warning"); }
    }

    if (lvar("P21_PROBES_L_BTN") === 0) { add("L PROBE HEAT OFF", "caution"); }
    if (lvar("P21_PROBES_R_BTN") === 0) { add("R PROBE HEAT OFF", "caution"); }

    if (!this.engN2Prev) { this.engN2Prev = { left: null, right: null, ms: 0 }; }


    if (!this.engIttPrev) { this.engIttPrev = { left: null, right: null }; }
    const n2Now = { left: Number(this.simvar.n2.left), right: Number(this.simvar.n2.right) };
    const n2SampleMs = Date.now();
    const n2Aged = this.engN2Prev.ms !== 0
      && n2SampleMs - this.engN2Prev.ms >= EICAS.C7_N2_RATE_WINDOW_MS;
    const n2Falling = (side) => {
      const prev = this.engN2Prev[side];
      if (prev === null) { return false; }
      return n2Now[side] < prev - EICAS.C7_N2_FALL_EPS;
    };

    const ittNow = {
      left: convertRankineToCelsius(Number(this.simvar.itt.left)),
      right: convertRankineToCelsius(Number(this.simvar.itt.right))
    };
    const ittFalling = (side) => {
      const prev = this.engIttPrev[side];
      if (prev === null || !isFinite(ittNow[side])) { return false; }
      return ittNow[side] < prev - EICAS.C7_ITT_FALL_EPS_C;
    };


    const flameout = (n2, valveOpen, burning, side) =>
      !burning && !!valveOpen && Number(n2) > 0 && Number(n2) < EICAS.ENG_IDLE_N2
      && (n2Falling(side) || ittFalling(side) || this.engN2Prev[side + "Flamed"] === true);
    const starterStuck = (n2, starterOn) =>
      !!starterOn && Number(n2) > EICAS.STARTER_FAIL_ON_N2;
    for (const side of ["left", "right"]) {
      const i = side === "left" ? 1 : 2;
      if (sv("ENG COMBUSTION:" + i, "Bool") || !sv("GENERAL ENG FUEL VALVE:" + i, "Bool")) {
        this.engN2Prev[side + "Flamed"] = false;
      } else if ((n2Falling(side) || ittFalling(side)) && n2Now[side] < EICAS.ENG_IDLE_N2 && n2Now[side] > 0) {
        this.engN2Prev[side + "Flamed"] = true;
      }
    }
    if (flameout(this.simvar.n2.left, sv("GENERAL ENG FUEL VALVE:1", "Bool"), sv("ENG COMBUSTION:1", "Bool"), "left")) {
      add("L ENGINE FLAMEOUT", "caution");
    }
    if (flameout(this.simvar.n2.right, sv("GENERAL ENG FUEL VALVE:2", "Bool"), sv("ENG COMBUSTION:2", "Bool"), "right")) {
      add("R ENGINE FLAMEOUT", "caution");
    }
    if (n2Aged || this.engN2Prev.ms === 0) {
      this.engN2Prev.left = n2Now.left;
      this.engN2Prev.right = n2Now.right;
      this.engN2Prev.ms = n2SampleMs;

      this.engIttPrev.left = ittNow.left;
      this.engIttPrev.right = ittNow.right;
    }

    if (starterStuck(this.simvar.n2.left, sv("GENERAL ENG STARTER:1", "Bool"))) {
      add("L STARTER FAIL ON", "caution");
    }
    if (starterStuck(this.simvar.n2.right, sv("GENERAL ENG STARTER:2", "Bool"))) {
      add("R STARTER FAIL ON", "caution");
    }

    const lbLeft = sv("FUEL LEFT QUANTITY", "gallons") * EICAS.FUEL_LB_PER_GAL;
    const lbRight = sv("FUEL RIGHT QUANTITY", "gallons") * EICAS.FUEL_LB_PER_GAL;
    if (isFinite(lbLeft) && isFinite(lbRight) &&
        (lbLeft <= EICAS.FUEL_QTY_LOW_LB || lbRight <= EICAS.FUEL_QTY_LOW_LB)) {
      add("FUEL QUANTITY LOW", "caution");
    }


    const totalLb = lbLeft + lbRight;
    if (isFinite(totalLb) && totalLb > 0) {
      let limit = 600;
      for (const band of EICAS.FUEL_IMBALANCE_BANDS) {
        if (totalLb > band.aboveTotalLb) { limit = band.limitLb; break; }
      }
      if (Math.abs(lbLeft - lbRight) > limit) { add("FUEL IMBALANCE", "caution"); }
    }

    {
      const handleDown = !!sv("GEAR HANDLE POSITION", "Bool");
      const want = handleDown ? 1 : 0;
      const settled =
        Math.abs(sv("GEAR LEFT POSITION", "Percent Over 100") - want) < 0.02 &&
        Math.abs(sv("GEAR RIGHT POSITION", "Percent Over 100") - want) < 0.02 &&
        Math.abs(sv("GEAR CENTER POSITION", "Percent Over 100") - want) < 0.02;
      if (settled) {
        this.gearTransitSince = null;
      } else {
        if (this.gearTransitSince === null) { this.gearTransitSince = Date.now(); }
        if (Date.now() - this.gearTransitSince > EICAS.GEAR_DISAGREE_SECONDS * 1000) {
          add("GEAR DISAGREE", "caution");
        }
      }
    }

    if (lvar("BC350_EMER_LIGHT_ARMED") === 0 &&
        (!!sv("ELECTRICAL MASTER BATTERY:1", "Bool") || !!sv("ELECTRICAL MASTER BATTERY:2", "Bool"))) {
      add("EMER LIGHTS OFF", "caution");
    }

    const icePct = sv("STRUCTURAL ICE PCT", "percent over 100");
    const iceAccreted = isFinite(icePct) && icePct > 0.01;

    const visibleMoisture = !!sv("AMBIENT IN CLOUD", "Bool");
    const tatC = Number(sv("TOTAL AIR TEMPERATURE", "celsius"));
    const satC = Number(sv("AMBIENT TEMPERATURE", "celsius"));
    const icingAir = isFinite(tatC) && tatC <= EICAS.ICE_TAT_MAX_C &&
      isFinite(satC) && satC >= EICAS.ICE_SAT_MIN_C;
    const iceOn = iceAccreted || (visibleMoisture && icingAir);
    const wingAntiIce = lvar("P21_WING_PUSH_BTN") === 1;

    const antiIceAllOn = wingAntiIce && lvar("P21_ENG_L_BTN") === 1 && lvar("P21_ENG_R_BTN") === 1;
    const antiIceAllOff = !wingAntiIce && lvar("P21_ENG_L_BTN") !== 1 && lvar("P21_ENG_R_BTN") !== 1;
    if (iceOn && antiIceAllOff) { add("ICE DETECTED", "caution"); }

    const pumpKnob = (side) => lvar("P21_PUMP_" + side);
    const apuFeeding = sv("APU PCT RPM", "percent") >= EICAS.APU_RUNNING_RPM;
    const engRunningNow = (i) =>
      Number(i === 1 ? this.simvar.n2.left : this.simvar.n2.right) > EICAS.ENG_RUNNING_N2;
    const autoPumpDemand = (i) => onGroundNow && (
      !!sv("GENERAL ENG STARTER:" + i, "Bool") ||
      (apuFeeding && !engRunningNow(1) && !engRunningNow(2))
    );
    for (const [side, text, i] of [["LEFT", "L FUEL PUMP ON", 1], ["RIGHT", "R FUEL PUMP ON", 2]]) {
      const k = pumpKnob(side);
      if (k === 1 && autoPumpDemand(i)) { add(text, "advisory"); }  
      else if (k === 2) { add(text, "status"); }                    
    }

    if (lvar("P21_FIREX_BTL1_SPENT") === 1) { add("FIREX BTL 1 LOW", "advisory"); }
    if (lvar("P21_FIREX_BTL2_SPENT") === 1) { add("FIREX BTL 2 LOW", "advisory"); }

    {
      const syncKnob = lvar("P21_ENG_SYNC_KNOB");
      if (syncKnob === 1 || syncKnob === 2) {
        const lever = (i) => lvar("WT_Virtual_Throttle_Lever_Pos_" + i);
        const inBand = (v) => isFinite(v) &&
          v >= EICAS.SYNC_LEVER_MIN_PCT && v < EICAS.SYNC_LEVER_MAX_PCT;
        const param = syncKnob === 2 ? "N2" : "N1";
        const a = sv("TURB ENG " + param + ":1", "percent");
        const b = sv("TURB ENG " + param + ":2", "percent");
        if (inBand(lever(1)) && inBand(lever(2)) &&
            isFinite(a) && isFinite(b) &&
            Math.abs(a - b) > EICAS.SYNC_TOLERANCE_PCT) {
          add("ENGINE SYNC FAIL", "advisory");
        }
      }
    }

    if (iceOn && antiIceAllOn) { add("ICE DETECTED", "advisory"); }

    {
      const burning1 = !!sv("ENG COMBUSTION:1", "Bool");
      const burning2 = !!sv("ENG COMBUSTION:2", "Bool");

      const wingXbleedValveOpen = lvar("P21_WING_SRC_KNOB") !== 1
        || (!onGroundNow && burning1 !== burning2);
      if (wingXbleedValveOpen) {
        add("WING SOURCE-XBLEED", "advisory");
      }
    }

    {
      const flapAt = Math.round(Number(this.simvar.flaps.num));
      const flapWant = Math.round(Number(this.simvar.flaps.commanded));
      const moving = isFinite(flapAt) && isFinite(flapWant) && flapAt !== flapWant;
      const rightHydGone = !sv("ENG COMBUSTION:2", "Bool") || lvar("P21_HYD_R_SOV_BTN") === 0;

      if (moving && rightHydGone) { add("FLAPS RATE LOW", "advisory"); }
    }

    {
      const apuRpm = sv("APU PCT RPM", "percent");
      const apuSwitchOn = lvar("P21_APU_BTN") === 1;
      if (apuRpm >= EICAS.APU_RUNNING_RPM) { this.apuWasRunning = true; }
      if (!apuSwitchOn) { this.apuWasRunning = false; }
      if (this.apuWasRunning && apuSwitchOn && apuRpm < EICAS.APU_RUNNING_RPM) {
        add("APU SHUTDOWN", "advisory");
      }
    }

    const engPumpExpected = (i) =>
      Number(i === 1 ? this.simvar.n2.left : this.simvar.n2.right) > EICAS.ENG_RUNNING_N2;
    if (engPumpExpected(1) && lvar("P21_HYD_L_SOV_BTN") === 1 && hydL) {
      add("L HYD ENG PUMP FAIL", "advisory");
    }
    if (engPumpExpected(2) && lvar("P21_HYD_R_SOV_BTN") === 1 && hydR) {
      add("R HYD ENG PUMP FAIL", "advisory");
    }

    const busVolts = (i) => sv("ELECTRICAL MAIN BUS VOLTAGE:" + i, "volts");
    const someBusPowered =
      busVolts(5) > 0 || busVolts(6) > 0 || busVolts(7) > 0 || busVolts(8) > 0;
    if (someBusPowered) {
      if (busVolts(7) <= 0) { add("L MAIN BUS FAIL", "caution"); }
      if (busVolts(8) <= 0) { add("R MAIN BUS FAIL", "caution"); }
      if (busVolts(5) <= 0) { add("L ESS BUS FAIL", "caution"); }
      if (busVolts(6) <= 0) { add("R ESS BUS FAIL", "caution"); }
      if (busVolts(9) <= 0) { add("L AUX BUS FAIL", "advisory"); }
      if (busVolts(11) <= 0) { add("R AUX BUS FAIL", "advisory"); }
    }

    if (sv("PARTIAL PANEL ELECTRICAL", "Enum") !== 0) { add("ELECTRICAL FAULT", "advisory"); }

    if (sv("PARTIAL PANEL FUEL INDICATOR", "Enum") !== 0) { add("FUEL QUANTITY FAIL", "caution"); }

    if (sv("FLAPS NUM HANDLE POSITIONS", "number") > 0 && !sv("FLAPS AVAILABLE", "Bool")) {
      this.flapsFailLatched = true;
    }
    if (this.flapsFailLatched) {
      add("FLAPS FAIL", "caution");
    }

    const someGenOnline = genVolts(1) > 0 || genVolts(2) > 0 || genVolts(3) > 0;
    {


      if (sv("ENG COMBUSTION:1", "Bool") && !!sv("GENERAL ENG MASTER ALTERNATOR:1", "Bool") &&
          genVolts(1) <= 0) {
        add("L GEN FAIL", "caution");
      }
      if (sv("ENG COMBUSTION:2", "Bool") && !!sv("GENERAL ENG MASTER ALTERNATOR:2", "Bool") &&
          genVolts(2) <= 0) {
        add("R GEN FAIL", "caution");
      }

      if (sv("APU PCT RPM", "percent") >= EICAS.APU_RUNNING_RPM &&
          !!sv("APU GENERATOR SWITCH", "Bool") && genVolts(3) <= 0) {
        add("APU GEN FAIL", "caution");
      }
    }

    const runStopOff = (i) => !sv("GENERAL ENG FUEL VALVE:" + i, "Bool");
    if (lvar("P21_FIRE_L_ENG") === 1 || runStopOff(1)) { add("L ENGINE SHUTDOWN", "status"); }
    if (lvar("P21_FIRE_R_ENG") === 1 || runStopOff(2)) { add("R ENGINE SHUTDOWN", "status"); }

    if (fireTest) { add("FIRE SYS IN TEST", "status"); }
    if (lvar("P21_FIRE_TEST_OK") === 1) { add("FIRE SYS TEST OK", "status"); }

    if (onGroundNow && sv("BRAKE PARKING POSITION", "Bool") && !toConfig) {
      add("PARK/EMER BRAKE ON", "status");
    }
    if (lvar("P21_XBLEED_BTN") === 1) { add("XBLEED OPEN", "status"); }
    if (!sv("AUTOPILOT YAW DAMPER", "Bool")) { add("YAW DAMPER OFF", "status"); }

    if (!sv("ELECTRICAL MASTER BATTERY:1", "Bool")) { add("L BATT OFF", "status"); }
    if (!sv("ELECTRICAL MASTER BATTERY:2", "Bool")) { add("R BATT OFF", "status"); }

    if (lvar("P21_FUEL_XFER_BTN") === 1) { add("FUEL XFER OPEN", "status"); }

    const wingAI = lvar("P21_WING_PUSH_BTN") === 1;
    const engL = lvar("P21_ENG_L_BTN") === 1;
    const engR = lvar("P21_ENG_R_BTN") === 1;

    if (wingAI) { add("WING ANTI-ICE ON", "status"); }
    if (engL) { add("L ENG ANTI-ICE ON", "status"); }
    if (engR) { add("R ENG ANTI-ICE ON", "status"); }
    if (wingAI && engL && engR) { add("WING/ENG ANTI-ICE ON", "status"); }
    else if (engL && engR) { add("ENG ANTI-ICE ON", "status"); }

    const airSrc = lvar("P21_AIR_SOURCE_KNOB");
    if (airSrc === 0) { add("AIR SOURCE OFF", "status"); }        
    if (airSrc === 2) { add("PACK ONLY", "status"); }             
    if (airSrc === 3) { add("TRIM AIR ONLY", "status"); }         

    if (lvar("P21_LBLEED_BTN") === 0 && lvar("P21_RBLEED_BTN") === 0 && lvar("P21_APU_BTN") !== 1) {
      add("BLEED OFF", "status");
    }


    if (lvar("P21_RAM_AIR_BTN") === 1) { add("RAM AIR ON", "status"); }

    if (lvar("P21_HYD_L_PUMP_KNOB") !== 1 || lvar("P21_HYD_R_PUMP_KNOB") !== 1
      || lvar("P21_HYD_PTU_KNOB") !== 1 || lvar("P21_HYD_AUX_KNOB") !== 1) {
      add("HYD PUMP NOT AUTO", "status");
    }

    if (lvar("P21_WING_SRC_KNOB") !== 1) { add("WING SOURCE-XBLEED", "status"); }

    if (lvar("P21_MAN_TEMP_BTN") === 1) { add("AIR COND MAN TEMP ON", "status"); }

    if (sv("PRESSURIZATION DUMP SWITCH", "Bool")) { add("EMER DEPRESS ON", "status"); }

    if (!sv("SPOILERS ARMED", "Bool")) { add("GND SPOILERS OFF", "status"); }

    if (lvar("P21_HYD_L_SOV_BTN") === 0) { add("L HYD SOV CLOSED", "status"); }
    if (lvar("P21_HYD_R_SOV_BTN") === 0) { add("R HYD SOV CLOSED", "status"); }

    if (lvar("P21_X_STBY_BATT") === 0) { add("STBY INST OFF", "status"); }

    if (lvar("P21_AUTO_APR_BTN") === 0) { add("AUTO APR OFF", "status"); }
    if (lvar("P21_ROLL_SPOILERS_BTN") === 0) { add("ROLL SPOILERS OFF", "status"); }

    if (lvar("P21_PRESS_MAN_BTN") === 1) { add("MANUAL PRESS ON", "status"); }
    if (lvar("P21_PRESS_DITCHING_BTN") === 1) { add("DITCHING ON", "status"); }

    const genOn = (i) => !!sv("GENERAL ENG MASTER ALTERNATOR:" + i, "Bool");
    if (!genOn(1)) { add("L GEN OFF", "status"); }                                     
    if (!genOn(2)) { add("R GEN OFF", "status"); }                                     

    const engGenSupplying = (i) =>
      genOn(i)
      && Number(i === 1 ? this.simvar.n2.left : this.simvar.n2.right) > EICAS.ENG_RUNNING_N2;
    const apuRunning = sv("APU PCT RPM", "percent") >= EICAS.APU_RUNNING_RPM;
    if (apuRunning
        && !engGenSupplying(1) && !engGenSupplying(2)
        && !sv("APU GENERATOR SWITCH", "Bool")) {
      add("APU GEN OFF", "status");                                                    
    }

    this.updateFlightPhase();

    const key = (m) => m.text + "\u0000" + m.tier;
    const live = new Set(out.map(key));
    for (const k of Array.from(this.casSeq.keys())) {
      if (!live.has(k)) { this.casSeq.delete(k); }
    }
    for (const m of out) {
      const k = key(m);
      if (!this.casSeq.has(k)) { this.casSeq.set(k, this.casSeqNext++); }
      m.seq = this.casSeq.get(k);
    }
    out.sort((a, b) => a.seq - b.seq);
    return out.filter((m) => !this.isInhibited(m.inhibit));
  }

  applyParameterColours() {
    const set = (el, cls) => {
      if (!el) { return; }
      for (const c of ["text-green", "text-yellow", "text-red"]) {
        if (c !== cls) { el.classList.remove(c); }
      }
      if (!el.classList.contains(cls)) { el.classList.add(cls); }
    };
    const band = (v, redLow, amberLow, amberHigh) => {
      const n = Number(v);
      if (!isFinite(n)) { return "text-green"; }
      if (n < redLow) { return "text-red"; }
      if (n < amberLow) { return "text-yellow"; }
      if (n >= amberHigh) { return "text-yellow"; }
      return "text-green";
    };
    for (const side of ["left", "right"]) {
      set(this.oilPress[side], band(
        this.simvar.oilPress[side],
        EICAS.OIL_PRESS_RED_BELOW, EICAS.OIL_PRESS_RED_BELOW, EICAS.OIL_PRESS_AMBER_ABOVE));
      set(this.oilTemp[side], band(
        this.simvar.oilTemp[side],
        -1e9, EICAS.OIL_TEMP_AMBER_BELOW, EICAS.OIL_TEMP_AMBER_ABOVE));
    }
  }

  updateEngineStartLegends() {
    for (const side of ["left", "right"]) {
      const n2 = Number(this.simvar.n2[side]) || 0;
      const burning = this.simvar.combustion[side];
      const otherRunning = this.simvar.combustion[side === "left" ? "right" : "left"];

      const prev = this.engPrevN2[side];
      this.engPrevN2[side] = n2;
      if (!this.engSeeded[side]) {

        this.engSeeded[side] = true;
        continue;
      }
      const rising = n2 > prev;

      if (n2 < EICAS.ENG_START_ARM_N2) {
        this.engPhase[side] = "off";
      } else if (this.engPhase[side] === "off" && !burning && rising) {
        this.engPhase[side] = "starting";
      } else if (
        this.engPhase[side] === "starting" &&
        n2 >= EICAS.ENG_START_CLEAR_N2
      ) {
        this.engPhase[side] = "running";
      }

      const starting = this.engPhase[side] === "starting";
      const showStart = starting && n2 < EICAS.ENG_START_CLEAR_N2;
      const ignClear = otherRunning
        ? EICAS.ENG_IGN_CLEAR_N2_OTHER_RUNNING
        : EICAS.ENG_IGN_CLEAR_N2;
      const showIgn = starting && n2 < ignClear;

      if (this.engStart[side]) {
        this.engStart[side].classList.toggle("visibility-hidden", !showStart);
      }
      if (this.engIgn[side]) {
        this.engIgn[side].classList.toggle("visibility-hidden", !showIgn);
      }
    }
  }

  updateEngineSyncLegend() {
    const el = this.engSync;
    if (!el) { return; }
    const knob = SimVar.GetSimVarValue("L:P21_ENG_SYNC_KNOB", "Number");

    if (knob !== 1 && knob !== 2) {
      el.classList.add("visibility-hidden");
      return;
    }

    const lever = (i) =>
      SimVar.GetSimVarValue("L:WT_Virtual_Throttle_Lever_Pos_" + i, "Number");
    const inBand = (v) =>
      typeof v === "number" && isFinite(v) &&
      v >= EICAS.SYNC_LEVER_MIN_PCT && v < EICAS.SYNC_LEVER_MAX_PCT;

    const spun = (name, i) => SimVar.GetSimVarValue("TURB ENG " + name + ":" + i, "percent");
    const param = knob === 2 ? "N2" : "N1";
    const a = spun(param, 1), b = spun(param, 2);
    const matched =
      typeof a === "number" && isFinite(a) && typeof b === "number" && isFinite(b) &&
      Math.abs(a - b) <= EICAS.SYNC_TOLERANCE_PCT;
    const active = inBand(lever(1)) && inBand(lever(2)) && matched;

    const inCruise =
      SimVar.GetSimVarValue("L:FADEC_TGT_MODE_1", "number") === 3 &&
      SimVar.GetSimVarValue("L:FADEC_TGT_MODE_2", "number") === 3;
    const machHold = inCruise ? SimVar.GetSimVarValue("L:P21_MACH_HOLD_STATE", "number") : 0;
    if (machHold === 1 || machHold === 2) {
      diffAndSetText(el, "MACH HOLD");
      el.classList.remove("visibility-hidden");
      el.classList.toggle("text-green", machHold === 1);
      el.classList.toggle("text-white", machHold === 2);
      return;
    }
    diffAndSetText(el, "SYNC");

    if (!active) {
      el.classList.add("visibility-hidden");
      return;
    }
    el.classList.remove("visibility-hidden");
    el.classList.add("text-green");
    el.classList.remove("text-white");
  }

  updateApuVisibility(rpm, selected, knobPos) {
    const pct = typeof rpm === "number" && isFinite(rpm) ? rpm : 0;
    const nowMs = Date.now();
    const v = this.apuVis;
    const on = !!selected || Number(knobPos) >= 1;

    if (on) {
      if (v.onAtMs === null) {
        v.onAtMs = nowMs;
      }
      v.offAtMs = null;
    } else {
      v.onAtMs = null;

      if (v.wasShown && v.offAtMs === null) {
        v.offAtMs = nowMs;
      }
    }
    const appeared =
      v.onAtMs !== null &&
      (nowMs - v.onAtMs) / 1000 >= EICAS.APU_BLOCK_APPEAR_S;
    const holding =
      v.offAtMs !== null &&
      (nowMs - v.offAtMs) / 1000 < EICAS.APU_BLOCK_HOLD_S;

    const show = appeared || pct >= 1 || holding;
    v.wasShown = show;
    if (this.apu.section) {
      this.apu.section.classList.toggle("visibility-hidden", !show);
    }
    const showStart =
      this.apuItt.phase === "starting" && pct < EICAS.APU_START_CLEAR_RPM;
    if (this.apu.start) {
      this.apu.start.classList.toggle("visibility-hidden", !showStart);
    }
    return { show, showStart, holding, appeared };
  }

  static get GEAR_FLAP_DECLUTTER_SECONDS() { return 30; }


  static get GEAR_UP_TOLERANCE() { return 0.01; }

  static get FLAP_UP_DEGREES() { return 0.5; }

  updateGearFlapDeclutter(input) {
    const i = input || {};
    const now = typeof i.nowMs === "number" && isFinite(i.nowMs) ? i.nowMs : Date.now();
    const g = i.gears || {};

    const numOr = (v, dflt) => (typeof v === "number" && isFinite(v) ? v : dflt);

    const gearUp =
      numOr(g.center, 1) <= EICAS.GEAR_UP_TOLERANCE &&
      numOr(g.left, 1) <= EICAS.GEAR_UP_TOLERANCE &&
      numOr(g.right, 1) <= EICAS.GEAR_UP_TOLERANCE;
    const flapUp =
      numOr(i.flapAngle, 30) <= EICAS.FLAP_UP_DEGREES &&
      Math.round(numOr(i.flapCommanded, 1)) === 0;
    const clean = gearUp && flapUp;
    const airborne = !i.onGround;

    const state = (airborne ? "A" : "-") + (clean ? "C" : "-");
    const s = this.gfDeclutter;
    if (state !== s.state) {
      s.state = state;
      s.sinceMs = now;
    }
    const heldMs = now - (s.sinceMs === null ? now : s.sinceMs);
    const timerDone = heldMs >= EICAS.GEAR_FLAP_DECLUTTER_SECONDS * 1000;
    const mayHide = airborne && clean && (timerDone || !!i.bleedsOnEngine);

    if (this.gearGauge && this.gearGauge.classList.contains("hidden") !== mayHide) {
      this.gearGauge.classList.toggle("hidden", mayHide);
    }
    if (this.flapsGauge && this.flapsGauge.classList.contains("hidden") !== mayHide) {
      this.flapsGauge.classList.toggle("hidden", mayHide);
    }
    return { gearUp, flapUp, clean, airborne, heldMs, timerDone, mayHide };
  }

  static apuStartItt(pct, ambientC) {
    const R = EICAS.APU_ITT_RPM;
    const T = EICAS.APU_ITT_TEMP;
    const at = (i) => (T[i] === null ? ambientC : T[i]);
    if (pct <= R[0]) {
      return at(0);
    }
    for (let i = 1; i < R.length; i++) {
      if (pct <= R[i]) {
        const span = R[i] - R[i - 1];
        const f = span > 0 ? (pct - R[i - 1]) / span : 0;
        return at(i - 1) + f * (at(i) - at(i - 1));
      }
    }
    return at(T.length - 1);
  }

  Update() {
    if (!this.isInitialized) {
      this.init();
    }
    // if (!this.simvar) {
    // this.simvar = document.getElementById("simvar");
    // this.vars = this.simvar.vars.mfd.sys.electrical;
    // }
    this.getSimVars();

    // modify original data
    this.simvar.n1.left.rpm = Number(this.simvar.n1.left.rpm).toFixed(1);
    this.simvar.n1.right.rpm = Number(this.simvar.n1.right.rpm).toFixed(1);


    this.simvar.n1.left.fadecTarget = this.simvar.fadec.left.target;
    this.simvar.n1.left.fadecMode = this.simvar.fadec.left.mode;
    this.simvar.n1.right.fadecTarget = this.simvar.fadec.right.target;
    this.simvar.n1.right.fadecMode = this.simvar.fadec.right.mode;

    const revState = (i) => {

      const doorVar = i === 1 ? "L:CL350_REV_DOOR_1" : "L:CL350_REV_DOOR_2";
      const state = Number(SimVar.GetSimVarValue(doorVar, "number"));
      switch (state) {
        case EICAS.REV_DOOR_DEPLOYING: return "transit";
        case EICAS.REV_DOOR_DEPLOYED:  return "deployed";
        case EICAS.REV_DOOR_STOWING:   return "transit";
        case EICAS.REV_DOOR_AIRBORNE:  return "airborne";
        default:                       return null;
      }
    };
    this.n1.left.Update(Object.assign({}, this.simvar.n1.left, {
      rev: revState(1),
      fire: !!SimVar.GetSimVarValue("ENG ON FIRE:1", "Bool"),
    }));
    this.n1.right.Update(Object.assign({}, this.simvar.n1.right, {
      rev: revState(2),
      fire: !!SimVar.GetSimVarValue("ENG ON FIRE:2", "Bool"),
    }));
    this.itt.left.Update({
      rpm: Math.round(convertRankineToCelsius(this.simvar.itt.left)),
      maxRpm: this.simvar.itt.max,
    });
    this.itt.right.Update({
      rpm: Math.round(convertRankineToCelsius(this.simvar.itt.right)),
      maxRpm: this.simvar.itt.max,
    });
    diffAndSetText(this.n2.left, Number(this.simvar.n2.left).toFixed(1));
    diffAndSetText(this.n2.right, Number(this.simvar.n2.right).toFixed(1));
    diffAndSetText(
      this.oilPress.left,
      Number(this.simvar.oilPress.left).toFixed(0)
    );
    diffAndSetText(
      this.oilPress.right,
      Number(this.simvar.oilPress.right).toFixed(0)
    );
    diffAndSetText(
      this.oilTemp.left,
      Number(this.simvar.oilTemp.left).toFixed(0)
    );
    diffAndSetText(
      this.oilTemp.right,
      Number(this.simvar.oilTemp.right).toFixed(0)
    );
    diffAndSetText(this.ff.left, Number(this.simvar.ff.left).toFixed(0));
    diffAndSetText(this.ff.right, Number(this.simvar.ff.right).toFixed(0));
    diffAndSetText(this.apu.rpm, Number(this.simvar.apu.rpm).toFixed(0));


    const apuItt = this.updateApuItt(this.simvar.apu.rpm, this.simvar.apu.ambient);
    if (this.states.apu.egt !== apuItt) {
      diffAndSetText(this.apu.egt, Number(apuItt).toFixed(0));
      this.states.apu.egt = apuItt;
    }


    if (this.messages && this.messages.setMessages) {
      this.messages.setMessages(this.buildCasMessages());
    }


    this.applyParameterColours();

    this.updateEngineStartLegends();

    this.updateEngineSyncLegend();

    this.updateApuVisibility(
      this.simvar.apu.rpm,
      this.simvar.apu.selected,
      this.simvar.apu.knob
    );
    diffAndSetText(
      this.fuel.qtyLeft,
      Number(convertGallonsToPounds(this.simvar.fuel.qtyLeft)).toFixed(0)
    );
    diffAndSetText(
      this.fuel.qtyRight,
      Number(convertGallonsToPounds(this.simvar.fuel.qtyRight)).toFixed(0)
    );
    // const totalFuelQty = this.simvar.fuel.qtyLeft + this.simvar.fuel.qtyRight;
    diffAndSetText(
      this.fuel.qtyTotal,
      // Number(convertGallonsToPounds(totalFuelQty)).toFixed(0)
      Number(this.simvar.fuel.totalWeight).toFixed(0)
    );

    this.stabGauge.Update(this.simvar.pitchTrim);
    this.aileronGauge.Update(this.simvar.aileron);
    this.flapsGauge.Update(this.simvar.flaps);
    this.rudderTrimGauge.Update(this.simvar.rudderTrim);
    this.gearGauge.Update(this.simvar.gears);


    this.updateGearFlapDeclutter({
      gears: this.simvar.gears,
      flapAngle: this.simvar.flaps.angle,
      flapCommanded: this.simvar.flaps.commanded,
      onGround: this.simvar.spoilers.onGround,
      bleedsOnEngine:
        this.simvar.bleeds.left === 1 && this.simvar.bleeds.right === 1,
    });
    this.spoilersGauge.Update(this.simvar.spoilers);
    this.cabReadout.Update(this.simvar.cabin);
    this.messages.Update();
  }
}

EICAS.APU_ITT_RPM = [0, 38, 49, 60, 67, 84, 100];
EICAS.APU_ITT_TEMP = [null, 311, 369, 407, 408, 354, 311];
EICAS.APU_ITT_IDLE = 234; 

EICAS.APU_ITT_IDLE_REF_SAT = 11;
EICAS.APU_ITT_AMB_SLOPE = 1.0;
EICAS.APU_ITT_LOAD_BLEED = 100;

EICAS.APU_ITT_TAU_SETTLE = 2.5;

EICAS.APU_ITT_TAU_COOL = 29;

EICAS.APU_BLOCK_APPEAR_S = 3;

EICAS.APU_BLOCK_HOLD_S = 28;


EICAS.APU_START_CLEAR_RPM = 99;

EICAS.APU_RUNNING_RPM = 95;

EICAS.OIL_PRESS_RED_BELOW = 20;      
EICAS.OIL_PRESS_AMBER_ABOVE = 200;   
EICAS.OIL_TEMP_AMBER_BELOW = 30;     
EICAS.OIL_TEMP_AMBER_ABOVE = 400;    

EICAS.ENG_START_ARM_N2 = 2;

EICAS.REV_DOOR_STOWED = 0;
EICAS.REV_DOOR_DEPLOYING = 1;
EICAS.REV_DOOR_DEPLOYED = 2;
EICAS.REV_DOOR_STOWING = 3;
EICAS.REV_DOOR_AIRBORNE = 4;

EICAS.ICE_TAT_MAX_C = 10;
EICAS.ICE_SAT_MIN_C = -30;
EICAS.REV_STOWED_PCT = 1;
EICAS.REV_DEPLOYED_PCT = 99;

EICAS.REV_LEVER_SELECTED = -0.5;

EICAS.ENG_START_CLEAR_N2 = 50;
EICAS.ENG_RUNNING_N2 = 50;
EICAS.ENG_IGN_CLEAR_N2 = 30;
EICAS.ENG_IGN_CLEAR_N2_OTHER_RUNNING = 28;

customElements.define("eicas-page", EICAS);
checkAutoload();
