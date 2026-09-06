class HydraulicsPage extends TemplateElement {

  static get PRESS_NORM_PSI() {
    return 1800;
  }

  constructor() {
    super();
    this.simvar = {};
    this.config = {};


    this.hydTemp = { left: null, right: null, aux: null, lastMs: null };

    // config -- ref: flight_model.cfg
  }

  get templateID() {
    return "hydraulics-page-template";
  }

  get isInitialized() {
    return this.el ? true : false;
  }

  init() {
    this.el = document.getElementById(this.id);

    // components
    // EICAS
    this.eicas = document.querySelector("#eicas-page");

    this.left = {
      reservoir: this.querySelector("#reservoir-left"),
      pumpEdp: this.querySelector("#pump-edp-left"),
      pumpDcmp: this.querySelector("#pump-dcmp-left"),
      valveSov: this.querySelector("#valve-sov-left"),
      press: this.querySelector("#press-left"),
      ptu: this.querySelector("#ptu"),
    };
    this.right = {
      reservoir: this.querySelector("#reservoir-right"),
      pumpEdp: this.querySelector("#pump-edp-right"),
      pumpDcmp: this.querySelector("#pump-dcmp-right"),
      valveSov: this.querySelector("#valve-sov-right"),
      press: this.querySelector("#press-right"),
    };
    this.aux = {
      reservoir: this.querySelector("#reservoir-aux"),
      pumpDcmp: this.querySelector("#pump-dcmp-aux"),
      press: this.querySelector("#press-aux"),
    };
    this.lines = this.querySelector("#hyd-line-network");
    this.servicing = {
      left: this.querySelector("#servicing-left"),
      right: this.querySelector("#servicing-right"),
    };

    window.hydraulics = this;

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
      left: {
        pumpEdp: SimVar.GetSimVarValue(
          "ELECTRICAL GENALT BUS VOLTAGE:1",
          "volts"
        ),
        valveSov: SimVar.GetSimVarValue("L:P21_HYD_L_SOV_BTN", "Bool"),
        ptu: SimVar.GetSimVarValue("L:P21_HYD_PTU_KNOB", "Numbers"),
        pumpDcmp: SimVar.GetSimVarValue("L:P21_HYD_L_PUMP_KNOB", "Numbers"),
      },
      right: {

        pumpEdp: SimVar.GetSimVarValue(
          "ELECTRICAL GENALT BUS VOLTAGE:2",
          "volts"
        ),
        valveSov: SimVar.GetSimVarValue("L:P21_HYD_R_SOV_BTN", "Bool"),
        pumpDcmp: SimVar.GetSimVarValue("L:P21_HYD_R_PUMP_KNOB", "Numbers"),
      },
      aux: {
        pumpDcmp: SimVar.GetSimVarValue("L:P21_HYD_AUX_KNOB", "Numbers"),
      },

      gearExtendedPct: SimVar.GetSimVarValue("GEAR TOTAL PCT EXTENDED", "percent"),
      ambientC: SimVar.GetSimVarValue("AMBIENT TEMPERATURE", "celsius"),


      gearCommandedPct:
        SimVar.GetSimVarValue("GEAR HANDLE POSITION", "percent over 100") * 100,
      leftEngineRunning: !!SimVar.GetSimVarValue("ENG COMBUSTION:1", "Bool"),
      rightEngineRunning: !!SimVar.GetSimVarValue("ENG COMBUSTION:2", "Bool"),
      airborne: !SimVar.GetSimVarValue("SIM ON GROUND", "Bool"),
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

      // Update components
      this.getSimVars();

      const hydPsi = (i) => Math.round(convertPsfToPsi(
        SimVar.GetSimVarValue("HYDRAULIC PRESSURE:" + i, "psf")));

      const nowMs = Date.now();
      const dtMs = this.hydTemp.lastMs === null ? 0 : nowMs - this.hydTemp.lastMs;
      this.hydTemp.lastMs = nowMs;
      const gearPct = this.simvar.gearExtendedPct;
      const ambC = this.simvar.ambientC;
      const resTemp = (side, pressurised) => {
        this.hydTemp[side] = P21Hyd.stepTempC(this.hydTemp[side], pressurised, ambC, dtMs);
        return Math.round(this.hydTemp[side]);
      };
      if (this.simvar.left.pumpDcmp || this.simvar.left.valveSov) {
        this.left.reservoir.Update(
          P21Hyd.quantity("left", gearPct),
          resTemp("left", hydPsi(1) >= P21Hyd.LIVE_PSI),
          "left");
      } else {
        this.left.reservoir.Update(0, 0, "left");
      }
      if (this.simvar.left.pumpDcmp || this.simvar.left.pumpEdp) {
        this.left.press.Update(hydPsi(1));
      } else {
        this.left.press.Update("--");
      }
      this.left.pumpEdp.Update(this.simvar.left.pumpEdp);
      this.left.pumpDcmp.Update(this.simvar.left.pumpDcmp);
      this.left.valveSov.Update(this.simvar.left.valveSov);

      const ptu = P21Hyd.ptuState({
        knob: this.simvar.left.ptu,
        leftEngineOut: !this.simvar.leftEngineRunning,
        rightEdpDriving:
          this.simvar.rightEngineRunning && hydPsi(3) >= P21Hyd.LIVE_PSI,
        gearExtendedPct: this.simvar.gearExtendedPct,
        gearCommandedPct: this.simvar.gearCommandedPct,
        airborne: this.simvar.airborne,
      });


      this.left.ptu.Update({ open: ptu.open, green: ptu.green });

      if (this.simvar.aux.pumpDcmp) {
        this.aux.press.Update(hydPsi(2));
        this.aux.reservoir.Update(
          P21Hyd.quantity("aux", gearPct),
          resTemp("aux", hydPsi(2) >= P21Hyd.LIVE_PSI), "aux");
      } else {
        this.aux.press.Update("--");
        this.aux.reservoir.Update(0, 0, "aux");
      }
      this.aux.pumpDcmp.Update(this.simvar.aux.pumpDcmp);

      if (this.simvar.right.pumpDcmp || this.simvar.right.valveSov) {
        this.right.reservoir.Update(
          P21Hyd.quantity("right", gearPct),
          resTemp("right", hydPsi(3) >= P21Hyd.LIVE_PSI),
          "right");
      } else {
        this.right.reservoir.Update(0, 0, "right");
      }
      if (this.simvar.right.pumpDcmp || this.simvar.right.pumpEdp) {
        this.right.press.Update(hydPsi(3));
      } else {
        this.right.press.Update("--");
      }
      this.right.pumpEdp.Update(this.simvar.right.pumpEdp);
      this.right.pumpDcmp.Update(this.simvar.right.pumpDcmp);
      this.right.valveSov.Update(this.simvar.right.valveSov);

      this.servicing.left.Update(
        hydPsi(1) >= HydraulicsPage.PRESS_NORM_PSI ? 1 : 0);
      this.servicing.right.Update(
        hydPsi(3) >= HydraulicsPage.PRESS_NORM_PSI ? 1 : 0);

      // control lines on hyd-line-network.js
      this.lines.Update(this.simvar);

      // EICAS Messages
      // if any of the pump is not auto
      const messages = {
        pumpNotAuto: {
          message: "HYD PUMP NOT AUTO",
          type: "normal",
        },
        anyValveClosed: {
          message: "L (R) HYD SOV CLOSED",
          type: "normal",
        },
      };

      if (!this.eicas || !this.eicas.messages) { return; }
      // if any of the pump is not auto
      if (this.simvar.left.pumpDcmp !== 1 || this.simvar.right.pumpDcmp !== 1) {
        this.eicas.messages.add(messages.pumpNotAuto);
      } else {
        this.eicas.messages.remove(messages.pumpNotAuto);
      }
      // if any of the valve is closed
      if (!this.simvar.left.valveSov || !this.simvar.right.valveSov) {
        this.eicas.messages.add(messages.anyValveClosed);
      } else {
        this.eicas.messages.remove(messages.anyValveClosed);
      }
    }
  }
}

customElements.define("hydraulics-page", HydraulicsPage);
checkAutoload();
