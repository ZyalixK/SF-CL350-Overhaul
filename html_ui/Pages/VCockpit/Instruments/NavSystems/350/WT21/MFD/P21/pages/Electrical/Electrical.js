class ElectricalPage extends TemplateElement {
  constructor() {
    super();
    this.simvar = {};
    this.state = {
      extPowerActive: 0,
      genActive: {
        left: 0,
        right: 0,
        apu: 0,
      },
    };
  }

  get templateID() {
    return "electrical-page-template";
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
      apuGenOff: {
        message: "APU GEN OFF",
        type: "normal",
      },
      battOff: {
        message: "L (R) BATT OFF",
        type: "normal",
      },
      busTieOpen: {
        message: "BUS TIE MAN OPEN",
        type: "normal",
      },
      elecHydGenOn: {
        message: "ELEC HYD GEN ON",
        type: "normal",
      },
      genOff: {
        message: "L (R) GEN OFF",
        type: "normal",
      },
    };

    this.batt = {
      left: this.querySelector("#batt-left"),
      right: this.querySelector("#batt-right"),
    };
    this.extPwr = this.querySelector("#ci-ext-pwr");
    this.hydGen = this.querySelector("#ci-hyd-gen");

    this.genVolts = {
      left: this.querySelector("#ci-gen-volts-left"),
      apu: this.querySelector("#ci-gen-volts-apu"),
      right: this.querySelector("#ci-gen-volts-right"),
    };
    this.genAmps = {
      left: this.querySelector("#dr-gen-amps-left"),
      apu: this.querySelector("#dr-gen-amps-apu"),
      right: this.querySelector("#dr-gen-amps-right"),
    };
    this.bus = {
      ess: {
        left: this.querySelector("#bus-ess-left"),
        right: this.querySelector("#bus-ess-right"),
      },
      aux: {
        left: this.querySelector("#bus-aux-left"),
        right: this.querySelector("#bus-aux-right"),
      },
      main: {
        left: this.querySelector("#bus-main-left"),
        right: this.querySelector("#bus-main-right"),
      },
    };
    this.lines = {
      line1: this.querySelector("#line-1"),
      line2: this.querySelector("#line-2"),
      line3: this.querySelector("#line-3"),
      line4: this.querySelector("#line-4"),
      line5: this.querySelector("#line-5"),
      line6: this.querySelector("#line-6"),
      line7: this.querySelector("#line-7"),
      line8: this.querySelector("#line-8"),
      line9: this.querySelector("#line-9"),
      line10: this.querySelector("#line-10"),
      line11: this.querySelector("#line-11"),
      line12: this.querySelector("#line-12"),
      line13: this.querySelector("#line-13"),
      line14: this.querySelector("#line-14"),
      line15: this.querySelector("#line-15"),
      line16: this.querySelector("#line-16"),
      line17: this.querySelector("#line-17"),
      line18: this.querySelector("#line-18"),
      extPwr: this.querySelector("#line-ext-pwr"),
      hydGen: this.querySelector("#line-hyd-gen"),
    };

    // // initial state
    // SimVar.SetSimVarValue("L:P21_X_ELEC_GEN_LEFT", "numbers", 1);
    // SimVar.SetSimVarValue("L:P21_X_ELEC_GEN_RIGHT", "numbers", 1);

    window.electrical = this;
  }

  connectedCallback() {
    super.connectedCallback();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  getSimVars() {
    this.simvar = {
      engineActive: {
        left: Simplane.getEngineActive(0),
        right: Simplane.getEngineActive(1),
        apu: 1, // added for gen logic
      },
      electrical: {
        extPwr: {
          available: SimVar.GetSimVarValue("EXTERNAL POWER AVAILABLE", "Bool"),
          connection: SimVar.GetSimVarValue(
            "EXTERNAL CONNECTION POWER ON",
            "Bool"
          ),
          on: SimVar.GetSimVarValue("EXTERNAL POWER ON", "Bool"),
          btn: SimVar.GetSimVarValue("EXTERNAL POWER ON", "Bool"),

          volts: SimVar.GetSimVarValue("EXTERNAL POWER VOLTAGE", "volts"),
        },

        genAmps: {
          left: SimVar.GetSimVarValue(
            "ELECTRICAL GENALT BUS AMPS:1",
            "amperes"
          ),
          right: SimVar.GetSimVarValue(
            "ELECTRICAL GENALT BUS AMPS:2",
            "amperes"
          ),
          apu: P21ApuGen.amps(), 
        },
        genVolts: {
          left: SimVar.GetSimVarValue(
            "ELECTRICAL GENALT BUS VOLTAGE:1",
            "volts"
          ),
          right: SimVar.GetSimVarValue(
            "ELECTRICAL GENALT BUS VOLTAGE:2",
            "volts"
          ),
          apu: P21ApuGen.volts(), 
        },
        genBtn: {
          left: SimVar.GetSimVarValue("GENERAL ENG MASTER ALTERNATOR:1", "numbers"),
          apu: SimVar.GetSimVarValue("APU GENERATOR SWITCH:1", "Bool"),
          right: SimVar.GetSimVarValue("GENERAL ENG MASTER ALTERNATOR:2", "numbers"),
        },
        battery: {
          left: {
            load: SimVar.GetSimVarValue("ELECTRICAL BATTERY LOAD:1", "amperes"),
            volts: SimVar.GetSimVarValue(
              "ELECTRICAL BATTERY BUS VOLTAGE:1",
              "volts"
            ),
            temp: SimVar.GetSimVarValue(
              "ELECTRICAL BATTERY BUS TEMPERATURE:1",
              "celcius"
            ),
          },
          right: {
            load: SimVar.GetSimVarValue("ELECTRICAL BATTERY LOAD:2", "amperes"),
            volts: SimVar.GetSimVarValue(
              "ELECTRICAL BATTERY BUS VOLTAGE:2",
              "volts"
            ),
            temp: SimVar.GetSimVarValue(
              "ELECTRICAL BATTERY BUS TEMPERATURE:2",
              "celcius"
            ),
          },
        },
        bus: {
          ess: {
            left: SimVar.GetSimVarValue("ELECTRICAL MAIN BUS AMPS:1", "volts"),
            right: SimVar.GetSimVarValue("ELECTRICAL MAIN BUS AMPS:2", "volts"),
          },
          aux: {
            left: SimVar.GetSimVarValue("ELECTRICAL MAIN BUS AMPS:1", "volts"),
            right: SimVar.GetSimVarValue("ELECTRICAL MAIN BUS AMPS:2", "volts"),
          },
          main: {
            left: SimVar.GetSimVarValue(
              "ELECTRICAL MAIN BUS AMPS:1",
              "amperes"
            ),
            right: SimVar.GetSimVarValue(
              "ELECTRICAL MAIN BUS AMPS:2",
              "amperes"
            ),
          },
        },
      },
    };
  }

  updateEicasMessages() {
    if (!this.eicas) return;

    if (!this.simvar.electrical.genBtn.apu) {
      this.eicas.messages.add(this.eicasMessages.apuGenOff);
    } else {
      this.eicas.messages.remove(this.eicasMessages.apuGenOff);
    }

    if (
      !this.simvar.electrical.battery.left.load ||
      !this.simvar.electrical.battery.right.load
    ) {
      this.eicas.messages.add(this.eicasMessages.battOff);
    } else {

      this.eicas.messages.remove(this.eicasMessages.battOff);
    }

    if (
      !this.simvar.electrical.genAmps.left ||
      !this.simvar.electrical.genAmps.right
    ) {
      this.eicas.messages.add(this.eicasMessages.genOff);
    } else {

      this.eicas.messages.remove(this.eicasMessages.genOff);
    }
  }

  Update() {

    if (!this.isInitialized || !this.eicas || !this.eicas.messages) {
      this.init();
    } else {
      // if (!this.simvar) {
      // this.simvar = document.getElementById("simvar");
      // this.vars = this.simvar.vars.mfd.sys.electrical;
      // }
      this.getSimVars();

      this.updateEicasMessages();

      this.updateBatt(
        this.simvar.electrical.battery.left,
        this.simvar.electrical.battery.right,
        this.lines.line1, // obj
        this.lines.line11 // obj
      );
      this.updateExternalPower();

      // this plane version according to the panel model
      // doesn't have the additional Hydraulic Motorh Driven Generator (HMDG)
      // so we always turn it off777
      // this.updateHydGen();

      this.updateExternalPowerLines();

      this.updateGen("left");
      this.updateGen("right");
      this.updateGen("apu");

      this.genVolts.apu.Update(
        this.simvar.electrical.genVolts.apu,
        this.lines.line18
      );
      this.genVolts.left.Update(
        this.simvar.electrical.genVolts.left,
        this.lines.line5
      );
      this.genVolts.right.Update(
        this.simvar.electrical.genVolts.right,
        this.lines.line15
      );

      this.genAmps.apu.Update(
        Number(this.simvar.electrical.genAmps.apu).toFixed(1),
        this.lines.line16,
        this.lines.line17
      );
      this.genAmps.right.Update(
        Number(this.simvar.electrical.genAmps.right).toFixed(1),
        this.lines.line14
      );

      this.bus.ess.left.Update(
        this.simvar.electrical.bus.ess.left,
        this.lines.line2
      );
      this.bus.ess.right.Update(
        this.simvar.electrical.bus.ess.right,
        this.lines.line12
      );
      this.bus.aux.left.Update(
        this.simvar.electrical.bus.aux.left,
        this.lines.line3
      );
      this.bus.aux.right.Update(
        this.simvar.electrical.bus.aux.right,
        this.lines.line13
      );
      this.bus.main.left.Update(this.simvar.electrical.bus.main.left);
      this.bus.main.right.Update(this.simvar.electrical.bus.main.right);
    }
  }

  updateBatt(left, right, lineLeft, lineRight) {
    this.batt.left.Update(left.load, left.volts, left.temp, lineLeft);
    this.batt.right.Update(right.load, right.volts, right.temp, lineRight);
  }

  updateExternalPower() {
    const line = this.lines.extPwr;
    const available = this.simvar.electrical.extPwr.available;
    // const available = 1;
    if (available) {
      if (this.simvar.electrical.extPwr.btn) {
        this.extPwr.Update(this.simvar.electrical.extPwr.volts);

        line.classList.remove("stroke-white");
        line.classList.add("stroke-green");

        this.state.extPowerActive = 1;

        return;
      } else {
        this.extPwr.Update(0);

        line.classList.add("stroke-white");
        line.classList.remove("stroke-green");

        this.state.extPowerActive = 0;
      }
    } else {
      this.extPwr.Update(false, this.lines.extPwr);

      line.classList.add("stroke-white");
      line.classList.remove("stroke-green");

      this.state.extPowerActive = 0;
    }
  }

  updateHydGen() {
    const line = this.lines.hydGen;

    // this plane version according to the panel model
    // doesn't have the additional Hydraulic Motorh Driven Generator (HMDG)
    // so we always turn it off
    this.hydGen.Update(0);
    line.classList.add("stroke-white");
    line.classList.remove("stroke-green");
  }

  updateExternalPowerLines() {
    if (
      (this.state.extPowerActive ||
        // any gen is active
        (this.state.genActive.left && !this.state.genActive.right) ||
        (!this.state.genActive.left && this.state.genActive.right)) &&
      !this.state.genActive.apu
    ) {
      // turn on extra lines connected to others
      this.lines.line6.classList.remove("stroke-white");
      this.lines.line6.classList.add("stroke-green");
      this.lines.line8.classList.remove("stroke-white");
      this.lines.line8.classList.add("stroke-green");
      this.lines.line10.classList.remove("stroke-white");
      this.lines.line10.classList.add("stroke-green");
    } else {
      this.lines.line6.classList.add("stroke-white");
      this.lines.line6.classList.remove("stroke-green");
      this.lines.line8.classList.add("stroke-white");
      this.lines.line8.classList.remove("stroke-green");
      this.lines.line10.classList.add("stroke-white");
      this.lines.line10.classList.remove("stroke-green");
    }
  }

  updateGen(part) {
    // Gen only active when engine is on
    // except APU
    if (!this.simvar.engineActive[part]) {
      return;
    }

    // can only turn off one
    const counterPart = part === "left" ? "right" : "left";
    if (this.state.genActive[part] && !this.state.genActive[counterPart]) {
      // turn back the btn
      // if (part === "left") {
      //   SimVar.SetSimVarValue("L:P21_X_ELEC_GEN_LEFT", "numbers", 1);
      // } else {
      //   SimVar.SetSimVarValue("L:P21_X_ELEC_GEN_RIGHT", "numbers", 1);
      // }
      return;
    }

    const volts = this.simvar.electrical.genVolts[part];
    const amps = this.simvar.electrical.genAmps[part];
    const btn = this.simvar.electrical.genBtn[part];

    const isActive = (part === "apu" && typeof P21ApuGen !== "undefined")
      ? (P21ApuGen.online() ? 1 : 0)
      : (volts ? 1 : 0);
    let lineVolt;
    let lineAmps;
    let secondline;
    if (part === "left") {
      lineVolt = this.lines.line5;
      lineAmps = this.lines.line4;
    } else if (part === "right") {
      lineVolt = this.lines.line15;
      lineAmps = this.lines.line14;
    } else if (part === "apu") {
      lineVolt = this.lines.line18;
      lineAmps = this.lines.line16;
      secondline = this.lines.line17;
    }

    if (btn && isActive && !this.state.extPowerActive) {
      this.genVolts[part].Update(volts);
      this.genAmps[part].Update(Number(amps).toFixed(1));
      lineVolt.classList.remove("stroke-white");
      lineVolt.classList.add("stroke-green");
      lineAmps.classList.remove("stroke-white");
      lineAmps.classList.add("stroke-green");
      if (secondline) {
        secondline.classList.remove("stroke-white");
        secondline.classList.add("stroke-green");
      }
      this.state.genActive[part] = 1;
    } else {
      this.genVolts[part].Update(false);
      this.genAmps[part].Update(0);
      lineVolt.classList.add("stroke-white");
      lineVolt.classList.remove("stroke-green");
      lineAmps.classList.add("stroke-white");
      lineAmps.classList.remove("stroke-green");
      if (secondline) {
        secondline.classList.add("stroke-white");
        secondline.classList.remove("stroke-green");
      }
      this.state.genActive[part] = 0;
    }
  }
}

customElements.define("electrical-page", ElectricalPage);
checkAutoload();
