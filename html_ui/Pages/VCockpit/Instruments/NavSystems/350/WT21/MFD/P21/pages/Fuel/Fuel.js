class FuelPage extends TemplateElement {
  constructor() {
    super();
    this.simvar = {};
  }

  get templateID() {
    return "fuel-page-template";
  }

  get isInitialized() {
    return this.el ? true : false;
  }

  init() {
    this.el = document.getElementById(this.id);

    // components
    this.eicas = document.querySelector("#eicas-page");

    this.eicasMessages = {
      engFuelSovClosed: {
        message: "L (R) ENG FUEL SOV CLOSED",
        type: "normal",
      },
      fuelBalanced: {
        message: "FUEL BALANCED",
        type: "normal",
      },
      fuelGravXflowOpen: {
        message: "FUEL GRAV XFLOW OPEN",
        type: "normal",
      },
      fuelPumpOff: {
        message: "L (R) FUEL PUMP OFF",
        type: "normal",
      },
      fuelPumpOn: {
        message: "L (R) FUEL PUMP ON",
        type: "normal",
      },
      fuelXferOpen: {
        message: "FUEL XFER OPEN",
        type: "normal",
      },
    };

    this.fuel = {
      total: this.querySelector("#total-fuel-readout"),
      left: this.querySelector("#left-fuel-readout"),
      right: this.querySelector("#right-fuel-readout"),
      used: this.querySelector("#fuel-used-readout"),
      temp: this.querySelector("#fuel-temp-readout"),
    };
    this.valves = {
      xfer: this.querySelector("#valve-xfer"),
      xflow: this.querySelector("#valve-xflow"),
      apu: this.querySelector("#valve-sov-apu"),
      left: this.querySelector("#valve-sov-left"),
      right: this.querySelector("#valve-sov-right"),
    };
    // Fuel Heater / Oil Cooler (FHOC)
    this.fhoc = {
      left: this.querySelector("#fhoc-left"),
      right: this.querySelector("#fhoc-right"),
    };

    this.pump = {
      left: this.querySelector("#pump-left"),
      right: this.querySelector("#pump-right"),
    };

    this.fuelFilter = {
      left: this.querySelector("#fuel-filter-left"),
      right: this.querySelector("#fuel-filter-right"),
    };

    this.ejector = {
      mainLeft: this.querySelector("#ejector-main-left"),
      suppLeft: this.querySelector("#ejector-supp-left"),
      mainRight: this.querySelector("#ejector-main-right"),
      suppRight: this.querySelector("#ejector-supp-right"),
    };

    this.line = {
      xflow: this.querySelector("#line-xflow"),
      xfer: this.querySelector("#line-xfer"),

      pumpLeft: this.querySelector("#line-pump-left"),
      pumpRight: this.querySelector("#line-pump-right"),

      ejectorMainLeft: this.querySelector("#line-ejector-main-left"),
      ejectorMainRight: this.querySelector("#line-ejector-main-right"),
      ejectorSuppLeft: this.querySelector("#line-ejector-supp-left"),
      ejectorSuppRight: this.querySelector("#line-ejector-supp-right"),

      sovEngLeft: this.querySelector("#line-sov-left"),
      sovEngRight: this.querySelector("#line-sov-right"),
      sovApu: this.querySelector("#line-sov-apu"),

      filterLeft: this.querySelector("#line-filter-left"),
      filterRight: this.querySelector("#line-filter-right"),
    };

    window.fuel = this;
  }

  connectedCallback() {
    super.connectedCallback();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  getSimVars() {
    this.simvar = {
      fuel: {
        qtyLeft: SimVar.GetSimVarValue("FUEL LEFT QUANTITY", "gallons"),
        qtyRight: SimVar.GetSimVarValue("FUEL RIGHT QUANTITY", "gallons"),
        totalWeight: SimVar.GetSimVarValue(
          "FUEL TOTAL QUANTITY WEIGHT",
          "pounds"
        ),
        used: SimVar.GetSimVarValue(
          "GENERAL ENG FUEL USED SINCE START:1",
          "pounds"
        ),
      },
      valve: {
        // xfer: SimVar.GetSimVarValue("L:P21_FUEL_XFER_BTN", "numbers"),
        xflow: SimVar.GetSimVarValue("FUELSYSTEM VALVE SWITCH:5", "Bool"),
        xfer: SimVar.GetSimVarValue("L:P21_FUEL_XFER_BTN", "Bool"),
        sovEngLeft: SimVar.GetSimVarValue("GENERAL ENG FUEL VALVE:1", "Bool"),
        sovEngRight: SimVar.GetSimVarValue("GENERAL ENG FUEL VALVE:2", "Bool"),
        sovApu: SimVar.GetSimVarValue("FUELSYSTEM VALVE SWITCH:4", "Bool"),
      },
      pump: {
        left: SimVar.GetSimVarValue("L:P21_PUMP_LEFT", "numbers"),
        right: SimVar.GetSimVarValue("L:P21_PUMP_RIGHT", "numbers"),
      },
      engine: {
        left: SimVar.GetSimVarValue("ENG COMBUSTION:1", "Bool"),
        right: SimVar.GetSimVarValue("ENG COMBUSTION:2", "Bool"),
      },
    };
  }

  updateEicasMessages() {
    if (!this.simvar.valve.sovEngLeft && !this.simvar.valve.sovEngRight) {
      this.eicas.messages.add(this.eicasMessages.engFuelSovClosed);
    } else {
      this.eicas.messages.remove(this.eicasMessages.engFuelSovClosed);
    }

    if (Math.abs(this.simvar.fuel.qtyLeft - this.simvar.fuel.qtyRight) <= 100) {
      this.eicas.messages.remove(this.eicasMessages.fuelBalanced);
    } else {
      this.eicas.messages.add(this.eicasMessages.fuelBalanced);
    }

    if (!this.simvar.pump.left || !this.simvar.pump.right) {
      this.eicas.messages.add(this.eicasMessages.fuelPumpOff);
      this.eicas.messages.remove(this.eicasMessages.fuelPumpOn);
    } else {
      this.eicas.messages.remove(this.eicasMessages.fuelPumpOff);
      this.eicas.messages.add(this.eicasMessages.fuelPumpOn);
    }

    if (!this.simvar.valve.xfer) {
      this.eicas.messages.remove(this.eicasMessages.fuelXferOpen);
    } else {
      this.eicas.messages.add(this.eicasMessages.fuelXferOpen);
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

      // Update components
      this.getSimVars();

      this.updateEicasMessages();

      this.updateTotalFuelAndUsed();
      this.updateLeftRightFuel();
      this.fuel.temp.Update("--");
      this.valves.xfer.Update(this.simvar.valve.xfer);
      this.valves.xflow.Update(this.simvar.valve.xflow);
      this.valves.apu.Update(this.simvar.valve.sovApu);
      this.valves.left.Update(this.simvar.valve.sovEngLeft);
      this.valves.right.Update(this.simvar.valve.sovEngRight);
      this.fhoc.left.Update(this.simvar.engine.left ? 135 : "--");
      this.fhoc.right.Update(this.simvar.engine.right ? 135 : "--");
      this.pump.left.Update(this.simvar.pump.left);
      this.pump.right.Update(this.simvar.pump.right);
      this.fuelFilter.left.Update(this.simvar.engine.left);
      this.fuelFilter.right.Update(this.simvar.engine.right);
      this.ejector.mainLeft.Update(1);
      this.ejector.suppLeft.Update(1);
      this.ejector.mainRight.Update(1);
      this.ejector.suppRight.Update(1);

      // LINE XFER
      if (
        this.simvar.valve.xfer === 1 &&
        (this.simvar.pump.left === 1 ||
          this.simvar.pump.left === 2 ||
          this.simvar.pump.right === 1 ||
          this.simvar.pump.right === 2)
      ) {
        this.line.xfer.classList.remove("stroke-white");
        this.line.xfer.classList.add("stroke-green");
      } else {
        this.line.xfer.classList.add("stroke-white");
        this.line.xfer.classList.remove("stroke-green");
      }

      // LINE PUMP
      if (this.simvar.pump.left === 0) {
        this.line.pumpLeft.classList.add("stroke-white");
        this.line.pumpLeft.classList.remove("stroke-green");
      } else {
        this.line.pumpLeft.classList.remove("stroke-white");
        this.line.pumpLeft.classList.add("stroke-green");
      }
      if (this.simvar.pump.right === 0) {
        this.line.pumpRight.classList.add("stroke-white");
        this.line.pumpRight.classList.remove("stroke-green");
      } else {
        this.line.pumpRight.classList.remove("stroke-white");
        this.line.pumpRight.classList.add("stroke-green");
      }

      // LINE SOV
      if (this.simvar.valve.sovApu === 0) {
        this.line.sovApu.classList.add("stroke-white");
        this.line.sovApu.classList.remove("stroke-green");
      } else {
        this.line.sovApu.classList.remove("stroke-white");
        this.line.sovApu.classList.add("stroke-green");
      }
      if (this.simvar.valve.sovEngLeft === 0) {
        this.line.sovEngLeft.classList.add("stroke-white");
        this.line.sovEngLeft.classList.remove("stroke-green");
      } else {
        this.line.sovEngLeft.classList.remove("stroke-white");
        this.line.sovEngLeft.classList.add("stroke-green");
      }
      if (this.simvar.valve.sovEngRight === 0) {
        this.line.sovEngRight.classList.add("stroke-white");
        this.line.sovEngRight.classList.remove("stroke-green");
      } else {
        this.line.sovEngRight.classList.remove("stroke-white");
        this.line.sovEngRight.classList.add("stroke-green");
      }

      // Engine lines
      if (this.simvar.engine.left === 0) {
        this.line.filterLeft.classList.add("stroke-white");
        this.line.filterLeft.classList.remove("stroke-green");
      } else {
        this.line.filterLeft.classList.remove("stroke-white");
        this.line.filterLeft.classList.add("stroke-green");
      }
      if (this.simvar.engine.right === 0) {
        this.line.filterRight.classList.add("stroke-white");
        this.line.filterRight.classList.remove("stroke-green");
      } else {
        this.line.filterRight.classList.remove("stroke-white");
        this.line.filterRight.classList.add("stroke-green");
      }
    }
  }

  updateTotalFuelAndUsed() {
    const total = Number(this.simvar.fuel.totalWeight).toFixed(0);
    const used = Number(this.simvar.fuel.used).toFixed(0);

    this.fuel.total.Update(total.toString());
    this.fuel.used.Update(used.toString());
  }

  updateLeftRightFuel() {
    const left = Number(
      convertGallonsToPounds(this.simvar.fuel.qtyLeft)
    ).toFixed(0);
    const right = Number(
      convertGallonsToPounds(this.simvar.fuel.qtyRight)
    ).toFixed(0);
    this.fuel.left.Update(left.toString().padStart(4, "0"));
    this.fuel.right.Update(right.toString().padStart(4, "0"));
  }
}

customElements.define("fuel-page", FuelPage);
checkAutoload();
