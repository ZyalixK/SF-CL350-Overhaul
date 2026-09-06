

class ECSpage extends TemplateElement {
  constructor() {
    super();
    this.simvar = {};
    this.config = {};

    this.zone = { cockpit: null, cabin: null, seeded: false, last: 0 };

    // config -- ref: flight_model.cfg
  }

  static get TEMP_RANGE_NORMAL() { return { min: 15, max: 35 }; }
  static get TEMP_RANGE_MANUAL() { return { min: 10, max: 70 }; }

  static get PACK_OUTLET_C() { return 10; }

  static get DUCT_GAIN() { return 4; }

  static get DUCT_MAX_C() { return 85; }

  static get ZONE_MIX_PER_S() { return 0.05; }
  static get ZONE_LEAK_PER_S() { return 0.01; }


  static get MAX_STEP_S() { return 1; }

  static clampC(v, lo, hi) {
    const n = Number(v);
    if (!isFinite(n)) { return lo; }
    return n < lo ? lo : n > hi ? hi : n;
  }


  static selectedC(knob, manual) {
    const r = manual ? ECSpage.TEMP_RANGE_MANUAL : ECSpage.TEMP_RANGE_NORMAL;
    const k = ECSpage.clampC(knob, 0, 1);
    return r.min + k * (r.max - r.min);
  }

  static stepZone({ actual, selected, ambient, packRunning, dt }) {
    const amb = Number(ambient) || 0;
    const want = actual
      + ECSpage.DUCT_GAIN * (selected - actual)
      + (actual - amb) * (ECSpage.ZONE_LEAK_PER_S / ECSpage.ZONE_MIX_PER_S);

    const duct = packRunning
      ? Math.min(ECSpage.DUCT_MAX_C, Math.max(ECSpage.PACK_OUTLET_C, want))
      : amb;
    const step = ECSpage.clampC(dt, 0, ECSpage.MAX_STEP_S);
    const next = actual
      + (duct - actual) * ECSpage.ZONE_MIX_PER_S * step
      + ((Number(ambient) || 0) - actual) * ECSpage.ZONE_LEAK_PER_S * step;
    return { actual: next, duct };
  }

  get templateID() {
    return "ecs-page-template";
  }

  get isInitialized() {
    return this.el ? true : false;
  }

  init() {
    this.el = document.getElementById(this.id);

    // components
    // EICAS
    this.eicas = document.querySelector("#eicas-page");
    this.eicasMessages = {
      manualMode: {
        message: "AIR COND MAN TEMP ON",
        type: "normal",
      },
      airSourceOff: {
        message: "AIR SOURCE OFF",
        type: "normal",
      },
      packOnly: {
        message: "PACK ONLY",
        type: "normal",
      },
      bleedOff: {
        message: "BLEED OFF",
        type: "normal",
      },
      xbleedOpen: {
        message: "XBLEED OPEN",
        type: "normal",
      },
      trimAirOnly: {
        message: "TRIM AIR ONLY",
        type: "normal",
      },
    };

    this.summaryTable = document.querySelector("#ecs-summary-table");
    this.tempControl = {
      targetCockpit: this.querySelector("#temp-target-cockpit"),
      targetCabin: this.querySelector("#temp-target-cabin"),
      cockpit: this.querySelector("#temp-control-cockpit"),
      cabin: this.querySelector("#temp-control-cabin"),
    };
    this.cockpitBoxTemp = this.querySelector("#cockpit-box-value");
    this.cabinBoxTemp = this.querySelector("#cabin-box-value");

    this.press = {
      left: this.querySelector("#press-left"),
      right: this.querySelector("#press-right"),
    };

    this.valve = {
      ramAir: this.querySelector("#valve-ram-air"),
      checkLeft: this.querySelector("#valve-check-left"),
      checkRight: this.querySelector("#valve-check-right"),
      checkTop: this.querySelector("#valve-check-top"),
      checkBottom: this.querySelector("#valve-check-bottom"),
      ipLeft: this.querySelector("#valve-ip-left"),
      ipRight: this.querySelector("#valve-ip-right"),
      apuBleed: this.querySelector("#valve-apu-bleed"),
    };

    this.label = {
      manual: this.querySelector("#label-manual"),
    };

    this.lines = this.querySelector("#ecs-line-network");

    window.ecs = this;

    // apply config
  }

  connectedCallback() {
    super.connectedCallback();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  getSimVars() {
    this.simvar = {
      oxyQty: "--",
      cabin: {
        pressAlt: SimVar.GetSimVarValue(
          "PRESSURIZATION CABIN ALTITUDE",
          "Feet"
        ),
        pressAltRate: SimVar.GetSimVarValue(
          "PRESSURIZATION CABIN ALTITUDE RATE",
          "Feet per second"
        ),
        pressDiff: SimVar.GetSimVarValue(
          "PRESSURIZATION PRESSURE DIFFERENTIAL",
          "psf"
        ),
      },

      landingAlt: SimVar.GetSimVarValue("L:P21_LNDG_ELEV_SET", "Number") === 1
      ? SimVar.GetSimVarValue("L:P21_LNDG_ELEV_FT", "Number")
      : NaN,

      temp: {
        knobCockpit: SimVar.GetSimVarValue("L:P21_CKPT_TEMP_KNOB", "Numbers"),
        knobCabin: SimVar.GetSimVarValue("L:P21_CABIN_TEMP_KNOB", "Numbers"),
      },
      ambient: SimVar.GetSimVarValue("AMBIENT TEMPERATURE", "celsius"),

      press: (typeof P21Bleed !== "undefined")
        ? P21Bleed.manifold({
            engine: {
              left: SimVar.GetSimVarValue("TURB ENG N2:1", "percent"),
              right: SimVar.GetSimVarValue("TURB ENG N2:2", "percent"),
            },
            valve: {
              leftIp: SimVar.GetSimVarValue("L:P21_LBLEED_BTN", "Numbers"),
              rightIp: SimVar.GetSimVarValue("L:P21_RBLEED_BTN", "Numbers"),
              xBleed: SimVar.GetSimVarValue("L:P21_XBLEED_BTN", "Numbers"),
              apuBleed: SimVar.GetSimVarValue("L:P21_APU_BTN", "Numbers"),
            },


            apuRunning: P21Bleed.apuIsRunning(SimVar.GetSimVarValue("APU PCT RPM", "percent")),
            groundAir: !!SimVar.GetSimVarValue("EXTERNAL POWER ON", "Bool"),
          })
        : { left: 45, right: 60 },
      manualMode: SimVar.GetSimVarValue("L:P21_MAN_TEMP_BTN", "Numbers"),
      valve: {
        leftIp: SimVar.GetSimVarValue("L:P21_LBLEED_BTN", "Numbers"),
        rightIp: SimVar.GetSimVarValue("L:P21_RBLEED_BTN", "Numbers"),
        xBleed: SimVar.GetSimVarValue("L:P21_XBLEED_BTN", "Numbers"),
        apuBleed: SimVar.GetSimVarValue("L:P21_APU_BTN", "Numbers"),
        checkLeft: 1,
        checkRight: 1,
        checkTop: SimVar.GetSimVarValue("L:P21_XBLEED_BTN", "Numbers"),
        checkBottom: SimVar.GetSimVarValue("L:P21_XBLEED_BTN", "Numbers"),
      },
      // Air Source Selection
      // 0 OFF
      // 1 AIR SOURCE
      // 2 PACK ONLY
      // 3 TRIM AIR ONLY
      airSourceSelection: SimVar.GetSimVarValue(
        "L:P21_AIR_SOURCE_KNOB",
        "Numbers"
      ),
    };
  }

  updateEicasMessages() {

    if (!this.eicas || !this.eicas.messages) { return; }
    if (!this.simvar.manualMode) {
      this.eicas.messages.remove(this.eicasMessages.manualMode);
    } else {
      this.eicas.messages.add(this.eicasMessages.manualMode);
    }

    if (this.simvar.airSourceSelection === 0) {
      this.eicas.messages.add(this.eicasMessages.airSourceOff);
    } else {
      this.eicas.messages.remove(this.eicasMessages.airSourceOff);
    }

    if (this.simvar.airSourceSelection === 2) {
      this.eicas.messages.add(this.eicasMessages.packOnly);
    } else {
      this.eicas.messages.remove(this.eicasMessages.packOnly);
    }

    if (this.simvar.airSourceSelection === 3) {
      this.eicas.messages.add(this.eicasMessages.trimAirOnly);
    } else {
      this.eicas.messages.remove(this.eicasMessages.trimAirOnly);
    }

    if (
      this.simvar.valve.leftIp === 0 &&
      this.simvar.valve.rightIp === 0 &&
      this.simvar.valve.apuBleed === 0
    ) {
      this.eicas.messages.add(this.eicasMessages.bleedOff);
    } else {
      this.eicas.messages.remove(this.eicasMessages.bleedOff);
    }

    if (this.simvar.valve.xBleed === 1) {
      this.eicas.messages.add(this.eicasMessages.xbleedOpen);
    } else {
      this.eicas.messages.remove(this.eicasMessages.xbleedOpen);
    }
  }

  Update() {
    if (!this.isInitialized) {
      this.init();
    } else {
      // if (!this.simvar) {
      // this.simvar = document.getElementById("simvar");
      // this.vars = this.simvar.vars.mfd.sys.electrical;
      // }

      // Update components
      this.getSimVars();

      this.summaryTable.Update(
        this.simvar.oxyQty,
        this.simvar.cabin,
        this.simvar.landingAlt
      );

      // EICAS Messages
      this.updateEicasMessages();

      // update manual mode
      if (!this.simvar.manualMode) {
        this.tempControl.targetCockpit.classList.add("hidden");
        this.tempControl.targetCabin.classList.add("hidden");
        this.label.manual.classList.add("hidden");
      } else {
        this.tempControl.targetCockpit.classList.remove("hidden");
        this.tempControl.targetCabin.classList.remove("hidden");
        this.label.manual.classList.remove("hidden");
      }

      // update valve check left and right
      // when air source selection to 1
      this.simvar.valve.checkLeft =
        (this.simvar.airSourceSelection === 1 ||
          this.simvar.airSourceSelection === 2) &&
        this.simvar.valve.leftIp
          ? 1
          : 0;
      this.simvar.valve.checkRight =
        (this.simvar.airSourceSelection === 1 ||
          this.simvar.airSourceSelection === 3) &&
        this.simvar.valve.rightIp
          ? 1
          : 0;

      const manual = !!this.simvar.manualMode;
      const ambient = Number(this.simvar.ambient) || 0;
      const packRunning = this.simvar.airSourceSelection !== 0 &&
        !!(this.simvar.valve.leftIp || this.simvar.valve.rightIp ||
           this.simvar.valve.apuBleed);

      const now = Date.now();
      let dt = this.zone.last ? (now - this.zone.last) / 1000 : 0;
      this.zone.last = now;
      if (!this.zone.seeded) {

        this.zone.cockpit = ambient;
        this.zone.cabin = ambient;
        this.zone.seeded = true;
        dt = 0;
      }

      const selCockpit = ECSpage.selectedC(this.simvar.temp.knobCockpit, manual);
      const selCabin = ECSpage.selectedC(this.simvar.temp.knobCabin, manual);

      const zc = ECSpage.stepZone({
        actual: this.zone.cockpit, selected: selCockpit, ambient, packRunning, dt,
      });
      const zb = ECSpage.stepZone({
        actual: this.zone.cabin, selected: selCabin, ambient, packRunning, dt,
      });
      this.zone.cockpit = zc.actual;
      this.zone.cabin = zb.actual;

      const deg = (v) => Math.round(v).toString().padStart(2, "0");
      this.tempControl.targetCockpit.Update(deg(selCockpit));
      this.tempControl.targetCabin.Update(deg(selCabin));
      this.tempControl.cockpit.Update(deg(zc.duct));
      this.tempControl.cabin.Update(deg(zb.duct));

      diffAndSetText(this.cockpitBoxTemp, deg(this.zone.cockpit));
      diffAndSetText(this.cabinBoxTemp, deg(this.zone.cabin));

      this.press.left.Update(
        !this.simvar.valve.leftIp ||
          (this.simvar.airSourceSelection !== 1 &&
            this.simvar.airSourceSelection !== 2)
          ? "--"
          : Math.round(this.simvar.press.left)
      );
      this.press.right.Update(
        !this.simvar.valve.rightIp ||
          (this.simvar.airSourceSelection !== 1 &&
            this.simvar.airSourceSelection !== 3)
          ? "--"
          : Math.round(this.simvar.press.right)
      );

      this.valve.checkLeft.Update(this.simvar.valve.checkLeft);
      this.valve.checkRight.Update(this.simvar.valve.checkRight);
      this.valve.checkTop.Update(this.simvar.valve.checkTop);
      this.valve.checkBottom.Update(this.simvar.valve.checkBottom);
      this.valve.ipLeft.Update(this.simvar.valve.leftIp);
      this.valve.ipRight.Update(this.simvar.valve.rightIp);
      this.valve.apuBleed.Update(this.simvar.valve.apuBleed);

      // control lines on ecs-line-network.js
      this.lines.Update(this.simvar);
    }
  }
}

customElements.define("ecs-page", ECSpage);
checkAutoload();
