console.log("Registered MFD.js...");
// Include.addImports([
//     "/Pages/VCockpit/Instruments/NavSystems/350/wt21/MFD/P21/components/radial-gauge-240/radial-gauge-240.html"
// ]);

class P21MFD extends BaseInstrument {
  constructor() {
    super();

    this.boot = {
      powerSeen: undefined,   
      poweredAtMs: null,      
      aliveAtMs: null,        
      shown: false,           
      markUntilMs: null,      
      markEl: undefined,      
    };
  }

  get templateID() {
    return "P21-MFD";
  }

  get isInteractive() {
    return true;
  }

  get isGlassCockpit() {
    return true;
  }

  Init() {
    super.Init();

    this.mfdSide = (Number(this.instrumentIndex) === 2) ? 2 : 1;

    if (this.mfdSide === 2) {
      this.classList.add("copilot-mfd");
    }

    this.activateInitialPage();
    this.store = {
      currentPage: {
        electrical: 1,
        summary: 0,
        fuel: 0,
        flightControls: 0,
        hydraulics: 0,
        ecs: 0,
        antiIce: 0,
      },
    };
    this.Electricity = this.querySelector("#Electricity");

    window.mfd = this;
  }

  get isOn() {
    if (this.Electricity) {
      if (this.Electricity.getAttribute("state") !== "off") {
        return true;
      }
    }
    return false;
  }

  activateInitialPage() {
    // SimVar.SetSimVarValue(`L:P21_MCP_ECS_1`, "number", 1);
    // SimVar.SetSimVarValue(`L:P21_MCP_ANTI_ICE_1`, "number", 1);
  }

  getSimVars() {

    const n = this.mfdSide;
    this.simvars = {
      page: {
        electrical: SimVar.GetSimVarValue(`L:P21_MCP_ELEC_${n}`, "Number"),
        summary: SimVar.GetSimVarValue(`L:P21_MCP_SUMRY_${n}`, "Number"),
        fuel: SimVar.GetSimVarValue(`L:P21_MCP_FUEL_${n}`, "Number"),
        flightControls: SimVar.GetSimVarValue(
          `L:P21_MCP_FLIGHT_CONTROLS_${n}`,
          "Number"
        ),
        hydraulics: SimVar.GetSimVarValue(`L:P21_MCP_HYDRAULICS_${n}`, "Number"),
        ecs: SimVar.GetSimVarValue(`L:P21_MCP_ECS_${n}`, "Number"),
        antiIce: SimVar.GetSimVarValue(`L:P21_MCP_ANTI_ICE_${n}`, "Number"),
        checklist: SimVar.GetSimVarValue(`L:P21_MCP_CKLST_${n}`, "Number"),
      },
    };
  }

  connectedCallback() {
    super.connectedCallback();
    console.log("MFD Connected...");
    this.eicas = document.querySelector("#eicas-page");
    this.summary = document.querySelector("#summary-page");
    this.navcom = document.querySelector("#navcom-page");
    this.electrical = document.querySelector("#electrical-page");
    this.fuel = document.querySelector("#fuel-page");
    this.flightControls = document.querySelector("#flight-controls-page");
    this.hydraulics = document.querySelector("#hydraulics-page");
    this.ecs = document.querySelector("#ecs-page");
    this.antiIce = document.querySelector("#anti-ice-page");
    this.hsiMap = document.querySelector("#hsi-map-page");
    this.wt21MFD = new WT21_MFD_Instrument(this);
    this.checklist = document.querySelector("#checklist-page");
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  onInteractionEvent(_args) {
    if (this.wt21MFD && typeof this.wt21MFD.onInteractionEvent === "function") {
      this.wt21MFD.onInteractionEvent(_args);
    }
  }

  parseXMLConfig() {
    super.parseXMLConfig();
  }

  Update() {
    super.Update();

    this.getSimVars();

    const p21BootReady = this.p21BootShouldShow(Date.now());
    if (this.isOn && p21BootReady) {
      this.classList.remove("hidden");
    } else {
      this.classList.add("hidden");
    }

    if (this.simvars.page.electrical == 1) {
      // show
      this.electrical.classList.remove("hidden");
      this.summary.classList.add("hidden");
      this.fuel.classList.add("hidden");
      this.flightControls.classList.add("hidden");
      this.hydraulics.classList.add("hidden");
      this.ecs.classList.add("hidden");
      this.antiIce.classList.add("hidden");
      this.hsiMap.classList.add("hidden");
      this.checklist.classList.add("hidden");
      // update
    } else if (this.simvars.page.summary == 1) {
      // show
      this.electrical.classList.add("hidden");
      this.summary.classList.remove("hidden");
      this.fuel.classList.add("hidden");
      this.flightControls.classList.add("hidden");
      this.hydraulics.classList.add("hidden");
      this.ecs.classList.add("hidden");
      this.antiIce.classList.add("hidden");
      this.hsiMap.classList.add("hidden");
      this.checklist.classList.add("hidden");
      // update
    } else if (this.simvars.page.fuel == 1) {
      // show
      this.electrical.classList.add("hidden");
      this.summary.classList.add("hidden");
      this.fuel.classList.remove("hidden");
      this.flightControls.classList.add("hidden");
      this.hydraulics.classList.add("hidden");
      this.ecs.classList.add("hidden");
      this.antiIce.classList.add("hidden");
      this.hsiMap.classList.add("hidden");
      this.checklist.classList.add("hidden");
      // update
    } else if (this.simvars.page.flightControls == 1) {
      // show
      this.electrical.classList.add("hidden");
      this.summary.classList.add("hidden");
      this.fuel.classList.add("hidden");
      this.flightControls.classList.remove("hidden");
      this.hydraulics.classList.add("hidden");
      this.ecs.classList.add("hidden");
      this.antiIce.classList.add("hidden");
      this.hsiMap.classList.add("hidden");
      this.checklist.classList.add("hidden");
      // update
    } else if (this.simvars.page.hydraulics == 1) {
      // show
      this.electrical.classList.add("hidden");
      this.summary.classList.add("hidden");
      this.fuel.classList.add("hidden");
      this.flightControls.classList.add("hidden");
      this.hydraulics.classList.remove("hidden");
      this.ecs.classList.add("hidden");
      this.antiIce.classList.add("hidden");
      this.hsiMap.classList.add("hidden");
      this.checklist.classList.add("hidden");
      // update
    } else if (this.simvars.page.ecs === 1) {
      // show
      this.electrical.classList.add("hidden");
      this.summary.classList.add("hidden");
      this.fuel.classList.add("hidden");
      this.flightControls.classList.add("hidden");
      this.hydraulics.classList.add("hidden");
      this.ecs.classList.remove("hidden");
      this.antiIce.classList.add("hidden");
      this.hsiMap.classList.add("hidden");
      this.checklist.classList.add("hidden");
      // update
    } else if (this.simvars.page.antiIce === 1) {
      // show
      this.electrical.classList.add("hidden");
      this.summary.classList.add("hidden");
      this.fuel.classList.add("hidden");
      this.flightControls.classList.add("hidden");
      this.hydraulics.classList.add("hidden");
      this.ecs.classList.add("hidden");
      this.antiIce.classList.remove("hidden");
      this.hsiMap.classList.add("hidden");
      this.checklist.classList.add("hidden");
      // update
    } else if (this.simvars.page.checklist === 1) {
      // show
      this.electrical.classList.add("hidden");
      this.summary.classList.add("hidden");
      this.fuel.classList.add("hidden");
      this.flightControls.classList.add("hidden");
      this.hydraulics.classList.add("hidden");
      this.ecs.classList.add("hidden");
      this.antiIce.classList.add("hidden");
      this.hsiMap.classList.add("hidden");
      this.checklist.classList.remove("hidden");
      // update
    } else {
      this.electrical.classList.add("hidden");
      this.summary.classList.add("hidden");
      this.fuel.classList.add("hidden");
      this.flightControls.classList.add("hidden");
      this.hydraulics.classList.add("hidden");
      this.ecs.classList.add("hidden");
      this.antiIce.classList.add("hidden");
      this.hsiMap.classList.remove("hidden");
      this.checklist.classList.add("hidden");
    }
    this.electrical.Update();
    this.summary.Update();
    this.fuel.Update();
    this.flightControls.Update();
    this.hydraulics.Update();
    this.ecs.Update();
    this.antiIce.Update();

    if (this.mfdSide !== 2) {
      this.eicas.Update();
    }
    this.navcom.Update();
    this.wt21MFD.Update();
    this.checklist.Update();
  }

  p21HasDisplayPower() {
    if (SimVar.GetSimVarValue("L:P21_X_ELEC_BATT_LEFT", "Number")) { return true; }
    if (SimVar.GetSimVarValue("L:P21_X_ELEC_BATT_RIGHT", "Number")) { return true; }
    if (SimVar.GetSimVarValue("ELECTRICAL MASTER BATTERY:1", "Bool")) { return true; }
    if (SimVar.GetSimVarValue("ELECTRICAL MASTER BATTERY:2", "Bool")) { return true; }
    const volts = SimVar.GetSimVarValue("ELECTRICAL MAIN BUS VOLTAGE", "Volts");
    return typeof volts === "number" && isFinite(volts) && volts > P21MFD.BUS_ALIVE_VOLTS;
  }


  p21BootShouldShow(now) {
    const b = this.boot;
    const powered = this.p21HasDisplayPower();

    if (b.powerSeen === undefined) {

      b.powerSeen = powered;
      b.poweredAtMs = powered ? now : null;
      b.shown = powered;
    } else if (powered && !b.powerSeen) {
      b.powerSeen = true;
      b.poweredAtMs = now;
      b.shown = false;
      b.aliveAtMs = P21MFD.BOOT_ALIVE_MS > 0 ? now + P21MFD.BOOT_ALIVE_MS : now;
    } else if (!powered && b.powerSeen) {
      b.powerSeen = false;
      b.poweredAtMs = null;
      b.aliveAtMs = null;
      b.shown = false;
      this.p21SetWatermark(false, now);
    }


    if (b.aliveAtMs !== null && now >= b.aliveAtMs) {
      b.aliveAtMs = null;
      b.shown = true;
      this.p21SetWatermark(true, now);
    }


    if (!b.shown && b.aliveAtMs === null && b.powerSeen === true && b.poweredAtMs !== null
      && (now - b.poweredAtMs) > P21MFD.BOOT_ALIVE_MS + P21MFD.BOOT_FAILSAFE_MARGIN_MS) {
      b.shown = true;
    }

    if (b.markUntilMs !== null && now >= b.markUntilMs) {
      this.p21SetWatermark(false, now);
    }
    return b.shown;
  }


  p21SetWatermark(on, now) {
    const b = this.boot;
    if (on && !(P21MFD.WATERMARK_MS > 0)) { return; }
    if (!on && b.markEl === undefined) { b.markUntilMs = null; return; }
    if (b.markEl === undefined) {

      let box = document.getElementById("wt21-boot-watermark");
      if (!box) {
        box = document.createElement("div");
        box.id = "wt21-boot-watermark";
        for (let i = 0; i < P21MFD.WATERMARK_LINES.length; i++) {
          const line = document.createElement("div");
          line.textContent = P21MFD.WATERMARK_LINES[i];
          box.appendChild(line);
        }
        document.body.appendChild(box);
      }
      b.markEl = box;
    }
    b.markEl.setAttribute("style", P21MFD.WATERMARK_STYLE + (on ? "display:block;" : "display:none;"));
    b.markUntilMs = on ? now + P21MFD.WATERMARK_MS : null;
  }
}

P21MFD.BOOT_ALIVE_MS = 5600;
P21MFD.WATERMARK_MS = 3000;


P21MFD.BOOT_FAILSAFE_MARGIN_MS = 3000;


P21MFD.BUS_ALIVE_VOLTS = 1;
P21MFD.WATERMARK_LINES = ["@2006 ROCKWELL COLLINS, INC.", "ALL RIGHTS RESERVED"];
P21MFD.WATERMARK_STYLE =
  "position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);" +
  "border:2px solid #68C8D8;color:#68C8D8;background:rgba(0,0,0,0.72);" +
  "padding:7px 16px;font-size:20px;line-height:1.3;text-align:center;" +
  "letter-spacing:1px;white-space:nowrap;z-index:9999;pointer-events:none;";

registerInstrument("p21-mfd", P21MFD);
