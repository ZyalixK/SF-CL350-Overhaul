class AntiIcePage extends TemplateElement {
  constructor() {
    super();
    this.simvar = {};
    this.config = {};
    this.state = {
      valve: {
        cowlLeft: 0,
        hiPressLeft: 0,
        wingLeft: 0,
        crossBleed: 0,
        wingRight: 0,
        hiPressRight: 0,
        cowlRight: 0,
      },
      press: {
        left: 0,
        right: 0,
      },
    };

    // config -- ref: flight_model.cfg
  }

  get templateID() {
    return "anti-ice-page-template";
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
      engineAntiIceLeftRightOn: {
        message: "L (R) ENGINE ANTI-ICE ON",
        type: "normal",
      },
      engineAntiIceOn: {
        message: "ENGINE ANTI-ICE ON",
        type: "normal",
      },
      probeTestOk: {
        message: "PROBE HEAT TEST OK",
        type: "normal",
      },
      wingAntiIceOn: {
        message: "WING ANTI-ICE ON",
        type: "normal",
      },
      wingEngAntiIceOn: {
        message: "WING/ENG ANTI-ICE ON",
        type: "normal",
      },
      wingSourceXbleed: {
        message: "WING SOURCE XBLEED",
        type: "normal",
      },
    };

    this.jet = {
      left: this.querySelector("#jet-left"),
      right: this.querySelector("#jet-right"),
    };

    this.valve = {
      cowlLeft: this.querySelector("#valve-cowl-left"),
      hiPressLeft: this.querySelector("#valve-hipress-left"),
      wingLeft: this.querySelector("#valve-wing-left"),
      crossBleed: this.querySelector("#valve-cross-bleed"),
      wingRight: this.querySelector("#valve-wing-right"),
      hiPressRight: this.querySelector("#valve-hipress-right"),
      cowlRight: this.querySelector("#valve-cowl-right"),
    };

    this.press = {
      left: this.querySelector("#press-left"),
      right: this.querySelector("#press-right"),
    };

    this.lineNetwork = this.querySelector("#ice-line-network");

    // initial state

    window.antiIce = this;

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
      wing: SimVar.GetSimVarValue("L:P21_WING_PUSH_BTN", "numbers"),
      probes: {
        left: SimVar.GetSimVarValue("L:P21_PROBES_L_BTN", "numbers"),
        right: SimVar.GetSimVarValue("L:P21_PROBES_R_BTN", "numbers"),
      },
      engineAntiIce: {
        left: Simplane.getEngineAntiIce(1),
        right: Simplane.getEngineAntiIce(2),
      },
      engine: {
        left: SimVar.GetSimVarValue("L:P21_ENG_L_BTN", "numbers"),
        right: SimVar.GetSimVarValue("L:P21_ENG_R_BTN", "numbers"),
      },
      window: {
        left: SimVar.GetSimVarValue("L:P21_WSHLD_WINDOW_L_BTN", "numbers"),
        right: SimVar.GetSimVarValue("L:P21_WSHLD_WINDOW_R_BTN", "numbers"),
      },
      wingSource: SimVar.GetSimVarValue("L:P21_WING_SRC_KNOB", "numbers"),
    };
  }

  updateEicasMessages() {

    if (!this.eicas || !this.eicas.messages) { return; }
    if (!this.simvar.engineAntiIce.left && !this.simvar.engineAntiIce.right) {
      this.eicas.messages.remove(this.eicasMessages.engineAntiIceLeftRightOn);
      this.eicas.messages.remove(this.eicasMessages.engineAntiIceOn);
    } else {
      this.eicas.messages.add(this.eicasMessages.engineAntiIceLeftRightOn);
      this.eicas.messages.add(this.eicasMessages.engineAntiIceOn);
    }

    if (!this.simvar.wing) {
      this.eicas.messages.remove(this.eicasMessages.wingAntiIceOn);
    } else {
      this.eicas.messages.add(this.eicasMessages.wingAntiIceOn);
    }

    if (
      this.simvar.wing &&
      this.simvar.engineAntiIce.left &&
      this.simvar.engineAntiIce.right
    ) {
      this.eicas.messages.add(this.eicasMessages.wingEngAntiIceOn);
    } else {
      this.eicas.messages.remove(this.eicasMessages.wingEngAntiIceOn);
    }

    if (this.simvar.wingSource === 0 || this.simvar.wingSource === 2) {
      this.eicas.messages.add(this.eicasMessages.wingSourceXbleed);
    } else {
      this.eicas.messages.remove(this.eicasMessages.wingSourceXbleed);
    }
    this.eicas.Update();
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

      // upcate valve and press state
      if (this.simvar.wing === 1) {
        if (this.simvar.wingSource === 1) {
          // every valves open except cross bleed
          this.state.valve.wingLeft = 1;
          this.state.valve.wingRight = 1;
          this.state.valve.crossBleed = 0;
          this.state.valve.hiPressLeft = 1;
          this.state.valve.hiPressRight = 1;

        } else if (this.simvar.wingSource === 0) {
          // turn on every left valves and turn on cross bleed
          this.state.valve.wingLeft = 1;
          this.state.valve.wingRight = 0;
          this.state.valve.crossBleed = 1;
          this.state.valve.hiPressLeft = 1;
          this.state.valve.hiPressRight = 0;

        } else if (this.simvar.wingSource === 2) {
          // turn on every right valves and turn on cross bleed
          this.state.valve.wingLeft = 0;
          this.state.valve.wingRight = 1;
          this.state.valve.crossBleed = 1;
          this.state.valve.hiPressLeft = 0;
          this.state.valve.hiPressRight = 1;

        }
      } else {
        // turn off every valves
        this.state.valve.wingLeft = 0;
        this.state.valve.wingRight = 0;
        this.state.valve.crossBleed = 0;
        this.state.valve.hiPressLeft = 0;
        this.state.valve.hiPressRight = 0;


      }

      this.state.valve.cowlLeft =
        (this.simvar.engine.left || this.simvar.engineAntiIce.left) ? 1 : 0;
      this.state.valve.cowlRight =
        (this.simvar.engine.right || this.simvar.engineAntiIce.right) ? 1 : 0;

      const psi = (typeof P21Bleed !== "undefined")
        ? P21Bleed.manifold({
            engine: {
              left: SimVar.GetSimVarValue("TURB ENG N2:1", "percent"),
              right: SimVar.GetSimVarValue("TURB ENG N2:2", "percent"),
            },
            valve: {
              leftIp: this.state.valve.hiPressLeft,
              rightIp: this.state.valve.hiPressRight,
              xBleed: this.state.valve.crossBleed,
              apuBleed: SimVar.GetSimVarValue("L:P21_APU_BTN", "Numbers"),
            },


            apuRunning: P21Bleed.apuIsRunning(SimVar.GetSimVarValue("APU PCT RPM", "percent")),
            groundAir: !!SimVar.GetSimVarValue("EXTERNAL POWER ON", "Bool"),
          })
        : { left: 0, right: 0 };
      this.state.press.left = psi.left;
      this.state.press.right = psi.right;

      this.jet.left.Update(this.state.valve.cowlLeft);
      this.jet.right.Update(this.state.valve.cowlRight);

      this.valve.cowlLeft.Update(this.state.valve.cowlLeft);
      this.valve.hiPressLeft.Update(this.state.valve.hiPressLeft);
      this.valve.wingLeft.Update(this.state.valve.wingLeft);
      this.valve.crossBleed.Update(this.state.valve.crossBleed);
      this.valve.wingRight.Update(this.state.valve.wingRight);
      this.valve.hiPressRight.Update(this.state.valve.hiPressRight);
      this.valve.cowlRight.Update(this.state.valve.cowlRight);

      this.press.left.Update(this.state.press.left.toFixed(0).padStart(2, "0"));
      this.press.right.Update(
        this.state.press.right.toFixed(0).padStart(2, "0")
      );

      this.lineNetwork.Update(this.state.valve);

      // EICAS Messages
      this.updateEicasMessages();
    }
  }
}

customElements.define("anti-ice-page", AntiIcePage);
checkAutoload();
