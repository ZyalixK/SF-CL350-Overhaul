class SummaryPage extends TemplateElement {
  constructor() {
    super();
    this.simvar = {};

    this.hydTemp = { left: null, right: null, aux: null, lastMs: null };
  }

  get templateID() {
    return "summary-page-template";
  }

  get isInitialized() {
    return this.el ? true : false;
  }

  init() {
    this.el = document.getElementById(this.id);

    // components
    this.ecs = {
      oxyQty: this.querySelector("#ecs-oxy-qty"),
      cabAlt: this.querySelector("#ecs-cab-alt"),
      cabRateArrow: this.querySelector("#ecs-cab-rate-arrow"),
      cabRate: this.querySelector("#ecs-cab-rate"),
      cabDelta: this.querySelector("#ecs-cab-delta"),
      landingAlt: this.querySelector("#ecs-landing-alt"),
      bleedLeft: this.querySelector("#ecs-bleed-left"),
      bleedRight: this.querySelector("#ecs-bleed-right"),
    };
    this.electrical = {
      genAmps: {
        left: this.querySelector("#el-genamps-left"),
        apu: this.querySelector("#el-genamps-apu"),
        right: this.querySelector("#el-genamps-right"),
      },
      genVolts: {
        left: this.querySelector("#el-genvolts-left"),
        apu: this.querySelector("#el-genvolts-apu"),
        right: this.querySelector("#el-genvolts-right"),
      },
      battVolts: {
        left: this.querySelector("#el-batt-volts-left"),
        right: this.querySelector("#el-batt-volts-right"),
      },
      battTemp: {
        left: this.querySelector("#el-batt-temp-left"),
        right: this.querySelector("#el-batt-temp-right"),
      },
    };
    this.hydraulic = {
      prssure: {
        left: this.querySelector("#hyd-prs-left"),
        aux: this.querySelector("#hyd-prs-aux"),
        right: this.querySelector("#hyd-prs-right"),
      },
      temp: {
        left: this.querySelector("#hyd-temp-left"),
        aux: this.querySelector("#hyd-temp-aux"),
        right: this.querySelector("#hyd-temp-right"),
      },
      qty: {
        left: this.querySelector("#hyd-qty-left"),
        aux: this.querySelector("#hyd-qty-aux"),
        right: this.querySelector("#hyd-qty-right"),
      },
      inbdBrakes: {
        left: this.querySelector("#hyd-inbd-brakes-left"),
        aux: this.querySelector("#hyd-inbd-brakes-aux"),
        right: this.querySelector("#hyd-inbd-brakes-right"),
      },
      outbdBrakes: {
        left: this.querySelector("#hyd-outbd-brakes-left"),
        aux: this.querySelector("#hyd-outbd-brakes-aux"),
        right: this.querySelector("#hyd-outbd-brakes-right"),
      },
      pkBrake: {
        left: this.querySelector("#hyd-pk-brake-left"),
        aux: this.querySelector("#hyd-pk-brake-aux"),
        right: this.querySelector("#hyd-pk-brake-right"),
      },
    };
    window.Summary = this;
  }

  connectedCallback() {
    super.connectedCallback();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  getSimVars() {

    const hydNowMs = Date.now();
    const hydDtMs = this.hydTemp.lastMs === null ? 0 : hydNowMs - this.hydTemp.lastMs;
    this.hydTemp.lastMs = hydNowMs;
    const hydGearPct = SimVar.GetSimVarValue("GEAR TOTAL PCT EXTENDED", "percent");
    const hydAmbC = SimVar.GetSimVarValue("AMBIENT TEMPERATURE", "celsius");
    const hydPsi = (i) => convertPsfToPsi(
      SimVar.GetSimVarValue("HYDRAULIC PRESSURE:" + i, "pound-force per square foot"));
    const hydLive = {
      left: hydPsi(1) >= P21Hyd.LIVE_PSI,
      aux: hydPsi(2) >= P21Hyd.LIVE_PSI,
      right: hydPsi(3) >= P21Hyd.LIVE_PSI,
    };

    this.simvar = {
      ecs: {
        oxyQty: "--",
        cabin: {
          pressAlt: SimVar.GetSimVarValue("PRESSURIZATION CABIN ALTITUDE", "Feet"),
          pressAltRate: SimVar.GetSimVarValue("PRESSURIZATION CABIN ALTITUDE RATE", "Feet per second"),
          pressDiff: SimVar.GetSimVarValue("PRESSURIZATION PRESSURE DIFFERENTIAL", "psf"),
        },

        landingAlt: SimVar.GetSimVarValue("L:P21_LNDG_ELEV_SET", "Number") === 1
        ? SimVar.GetSimVarValue("L:P21_LNDG_ELEV_FT", "Number")
        : NaN,
        bleedPress: {
          left: SimVar.GetSimVarValue("TURB ENG BLEED AIR:1:1", "psi"),
          right: SimVar.GetSimVarValue("TURB ENG BLEED AIR:1:2", "psi"),
        },
      },
      electrical: {

        genAmps: {
          left: SimVar.GetSimVarValue("ELECTRICAL GENALT BUS AMPS:1", "amperes"),
          right: SimVar.GetSimVarValue("ELECTRICAL GENALT BUS AMPS:2", "amperes"),
          apu: P21ApuGen.amps(), 
        },
        genVolts: {
          left: SimVar.GetSimVarValue("ELECTRICAL GENALT BUS VOLTAGE:1", "volts"),
          right: SimVar.GetSimVarValue("ELECTRICAL GENALT BUS VOLTAGE:2", "volts"),
          apu: P21ApuGen.volts(), 
        },
        battVolts: {
          left: SimVar.GetSimVarValue("ELECTRICAL BATTERY BUS VOLTAGE:1", "volts"),
          right: SimVar.GetSimVarValue("ELECTRICAL BATTERY BUS VOLTAGE:2", "volts"),
        },
        battTemp: {
          left: SimVar.GetSimVarValue("ELECTRICAL BATTERY BUS TEMPERATURE:1", "celcius"),
          right: SimVar.GetSimVarValue("ELECTRICAL BATTERY BUS TEMPERATURE:2", "celcius"),
        },
      },
      hydraulic: {
        prssure: {
          left: SimVar.GetSimVarValue("HYDRAULIC PRESSURE:1", "pound-force per square foot"),
          aux: SimVar.GetSimVarValue("HYDRAULIC PRESSURE:2", "pound-force per square foot"),
          right: SimVar.GetSimVarValue("HYDRAULIC PRESSURE:3", "pound-force per square foot"),
        },

        temp: {
          left: P21Hyd.stepTempC(this.hydTemp.left, hydLive.left, hydAmbC, hydDtMs),
          aux: P21Hyd.stepTempC(this.hydTemp.aux, hydLive.aux, hydAmbC, hydDtMs),
          right: P21Hyd.stepTempC(this.hydTemp.right, hydLive.right, hydAmbC, hydDtMs),
        },
        qty: {
          left: P21Hyd.quantity("left", hydGearPct),
          aux: P21Hyd.quantity("aux", hydGearPct),
          right: P21Hyd.quantity("right", hydGearPct),
        },
        inbdBrakes: {
          left: SimVar.GetSimVarValue("BRAKE LEFT POSITION", "position 32k"),
          aux: "--",
          right: "--",
        },
        outbdBrakes: {
          left: "--",
          aux: "--",
          right: SimVar.GetSimVarValue("BRAKE RIGHT POSITION", "position 32k"),
        },
        pkBrake: {
          left: SimVar.GetSimVarValue("BRAKE PARKING POSITION", "position 32k"),
        },
      },
    };
  }

  Update() {
    if (!this.isInitialized) {
      this.init();
    } else {
      // if (!this.simvar) {
      // this.simvar = document.getElementById("simvar");
      // this.vars = this.simvar.vars.mfd.sys.electrical;
      // }
      this.getSimVars();
      this.updateECS(this.simvar.oxyQty, this.simvar.ecs.cabin, this.simvar.ecs.landingAlt, this.simvar.ecs.bleedPress);
      this.updateElectrical(this.simvar.electrical);
      this.updateHydraulic(this.simvar.hydraulic);
    }
  }

  updateECS(oxyQtyVal, { pressAlt, pressAltRate, pressDiff }, landingAltVal, bleedPress) {
    const oxyQty = this.ecs.oxyQty;
    const cabAlt = this.ecs.cabAlt;
    const cabRate = this.ecs.cabRate;
    const cabRateArrow = this.ecs.cabRateArrow;
    const bleedLeft = this.ecs.bleedLeft;
    const bleedRight = this.ecs.bleedRight;
    const cabDelta = this.ecs.cabDelta;
    const landingAlt = this.ecs.landingAlt;

    // oxy qty
    diffAndSetText(oxyQty, oxyQtyVal || "--");

    // Update cabin
    const pressRateMin = pressAltRate * 60;
    diffAndSetText(cabAlt, Number(pressAlt).toFixed());
    diffAndSetText(cabRate, Math.abs(Number(pressRateMin).toFixed()));

    if (pressRateMin > 0) {
      diffAndSetStyle(cabRateArrow, "transform", "rotate(180deg)");
      diffAndSetStyle(cabRateArrow, "top", "0");
    } else {
      diffAndSetStyle(cabRateArrow, "transform", "rotate(0deg)");
      diffAndSetStyle(cabRateArrow, "top", "0.2rem");
    }

    diffAndSetText(cabDelta, Number(pressDiff).toFixed(1));

    // update landing alt

    diffAndSetText(landingAlt, isFinite(Number(landingAltVal)) ? Number(landingAltVal).toFixed() : "--");

    // update bleed press
    diffAndSetText(bleedLeft, Number(bleedPress.left).toFixed());
    diffAndSetText(bleedRight, Number(bleedPress.right).toFixed());
  }

  updateElectrical({ genAmps, genVolts, battVolts, battTemp }) {
    // update gen amps
    diffAndSetText(this.electrical.genAmps.left, Number(genAmps.left).toFixed());
    diffAndSetText(this.electrical.genAmps.apu, Number(genAmps.apu).toFixed());
    diffAndSetText(this.electrical.genAmps.right, Number(genAmps.right).toFixed());
    // update gen volts
    diffAndSetText(this.electrical.genVolts.left, Number(genVolts.left).toFixed(1));
    diffAndSetText(this.electrical.genVolts.apu, Number(genVolts.apu).toFixed(1));
    diffAndSetText(this.electrical.genVolts.right, Number(genVolts.right).toFixed(1));
    // update gen volts
    diffAndSetText(this.electrical.battVolts.left, Number(battVolts.left).toFixed(1));
    diffAndSetText(this.electrical.battVolts.right, Number(battVolts.right).toFixed(1));
    // update gen volts
    diffAndSetText(this.electrical.battTemp.left, Number(battTemp.left).toFixed());
    diffAndSetText(this.electrical.battTemp.right, Number(battTemp.right).toFixed());
  }

  updateHydraulic({ prssure, temp, qty, inbdBrakes, outbdBrakes, pkBrake }) {
    // update prsure
    diffAndSetText(this.hydraulic.prssure.left, Number(convertPsfToPsi(prssure.left)).toFixed());
    diffAndSetText(this.hydraulic.prssure.aux, Number(convertPsfToPsi(prssure.aux)).toFixed());
    diffAndSetText(this.hydraulic.prssure.right, Number(convertPsfToPsi(prssure.right)).toFixed());

    // update temp

    this.hydTemp.left = temp.left;
    this.hydTemp.aux = temp.aux;
    this.hydTemp.right = temp.right;
    diffAndSetText(this.hydraulic.temp.left, Math.round(temp.left));
    diffAndSetText(this.hydraulic.temp.aux, Math.round(temp.aux));
    diffAndSetText(this.hydraulic.temp.right, Math.round(temp.right));

    // update qty

    diffAndSetText(this.hydraulic.qty.left, Number(qty.left).toFixed());
    diffAndSetText(this.hydraulic.qty.aux, Number(qty.aux).toFixed());
    diffAndSetText(this.hydraulic.qty.right, Number(qty.right).toFixed());

    // update brks
    function convertBrakesToLabel(brakes32k) {
      if (brakes32k < 12600) {
        return {
          label: "LOW",
          colorClass: "text-yellow",
        };
      } else if (brakes32k < 23200) {
        return {
          label: "MED",
          colorClass: "text-cyan",
        };
      } else {
        return {
          label: "NORM",
          colorClass: "text-green",
        };
      }
    }
    const inbdBrakesVal = convertBrakesToLabel(inbdBrakes.left);
    const outbdBrakesVal = convertBrakesToLabel(outbdBrakes.right);
    const pkBrakeVal = convertBrakesToLabel(pkBrake.left);
    diffAndSetText(this.hydraulic.inbdBrakes.left, inbdBrakesVal.label);
    if (!this.hydraulic.inbdBrakes.left.classList.contains(inbdBrakesVal.colorClass)) {
      this.hydraulic.inbdBrakes.left.classList.remove("text-yellow");
      this.hydraulic.inbdBrakes.left.classList.remove("text-cyan");
      this.hydraulic.inbdBrakes.left.classList.remove("text-green");
      this.hydraulic.inbdBrakes.left.classList.add(inbdBrakesVal.colorClass);
    }

    diffAndSetText(this.hydraulic.outbdBrakes.right, outbdBrakesVal.label);
    if (!this.hydraulic.outbdBrakes.right.classList.contains(outbdBrakesVal.colorClass)) {
      this.hydraulic.outbdBrakes.right.classList.remove("text-yellow");
      this.hydraulic.outbdBrakes.right.classList.remove("text-cyan");
      this.hydraulic.outbdBrakes.right.classList.remove("text-green");
      this.hydraulic.outbdBrakes.right.classList.add(outbdBrakesVal.colorClass);
    }

    diffAndSetText(this.hydraulic.pkBrake.left, Number(pkBrake.left / 10).toFixed());
    if (!this.hydraulic.pkBrake.left.classList.contains(pkBrakeVal.colorClass)) {
      this.hydraulic.pkBrake.left.classList.remove("text-yellow");
      this.hydraulic.pkBrake.left.classList.remove("text-cyan");
      this.hydraulic.pkBrake.left.classList.remove("text-green");
      this.hydraulic.pkBrake.left.classList.add(pkBrakeVal.colorClass);
    }
  }
}

customElements.define("summary-page", SummaryPage);
checkAutoload();
