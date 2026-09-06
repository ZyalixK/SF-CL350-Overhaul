class Navcom extends TemplateElement {
  constructor() {
    super();
    this.simvar = {};
  }

  get templateID() {
    return "navcom-page-template";
  }

  get isInitialized() {
    return this.el ? true : false;
  }

  get mfdSide() {
    return (window.mfd && Number(window.mfd.mfdSide) === 2) ? 2 : 1;
  }

  init() {
    this.el = document.getElementById(this.id);

    // components

    this.comOwn = {
      active: this.querySelector("#com1-active"),
      standby: this.querySelector("#com1-standby"),
      transmit: this.querySelector("#com1-transmit"),
    };
    this.comOther = {
      active: this.querySelector("#com2-active"),
      standby: this.querySelector("#com2-standby"),
      transmit: this.querySelector("#com2-transmit"),
    };
    this.com3 = {
      active: this.querySelector("#com3-active"),
      standby: this.querySelector("#com3-standby"),
      transmit: this.querySelector("#com3-transmit"),
    };
    this.nav1 = {
      label: this.querySelector("#nav1-label"),
      active: this.querySelector("#nav1-active"),
      standby: this.querySelector("#nav1-standby"),
    };
    this.transponder = {
      code: this.querySelector("#transponder-code"),
      state: this.querySelector("#transponder-state"),
      altitude: this.querySelector("#transponder-altitude"), // ABV or else
    };
    this.adf = {
      active: this.querySelector("#adf-active"),
      standby: this.querySelector("#adf-standby"),
    };
    this.hf1 = {
      active: this.querySelector("#hf1-active"),
      standby: this.querySelector("#hf1-standby"),
      modulation: this.querySelector("#hf1-modulation"), // ABV or else
    };

    this.labels = {
      comOwn: this.querySelector("#com-own-label"),
      comOther: this.querySelector("#com-other-label"),
      nav: this.querySelector("#nav1-label"),
      atc: this.querySelector("#atc-label"),
      adf: this.querySelector("#adf-label"),
      hf: this.querySelector("#hf-label"),
    };
    this.applySeatLabels();

    window.summary = this;
  }

  applySeatLabels() {
    const n = String(this.mfdSide);
    const other = this.mfdSide === 2 ? "1" : "2";
    const set = (el, text) => { if (el) { diffAndSetText(el, text); } };
    set(this.labels.comOwn, "COM" + n);
    set(this.labels.comOther, "COM" + other);
    set(this.labels.nav, "NAV" + n);
    set(this.labels.adf, "ADF" + n);
    set(this.labels.hf, "HF" + n);


    set(this.labels.atc, this.mfdSide === 2 ? "ATC2/TCAS" : "ATC/TCAS");
  }

  connectedCallback() {
    super.connectedCallback();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  getSimVars() {

    const n = this.mfdSide;
    const other = this.mfdSide === 2 ? 1 : 2;
    const com = (i) => ({
      active: SimVar.GetSimVarValue(`COM ACTIVE FREQUENCY:${i}`, "MHz"),
      standby: SimVar.GetSimVarValue(`COM STANDBY FREQUENCY:${i}`, "MHz"),
      transmit: SimVar.GetSimVarValue(`COM TRANSMIT:${i}`, "bool"),
    });
    this.simvar = {
      comOwn: com(n),
      comOther: com(other),
      com3: com(3),
      nav1: {
        active: SimVar.GetSimVarValue(`NAV ACTIVE FREQUENCY:${n}`, "MHz"),
        standby: SimVar.GetSimVarValue(`NAV STANDBY FREQUENCY:${n}`, "MHz"),
      },
      transponder: {
        code: SimVar.GetSimVarValue(`TRANSPONDER CODE:${n}`, "Bco16"),
        state: SimVar.GetSimVarValue(`TRANSPONDER STATE:${n}`, "Enum"),
      },
      adf: {
        active: SimVar.GetSimVarValue(`ADF ACTIVE FREQUENCY:${n}`, "KHz"),
        standby: SimVar.GetSimVarValue(`ADF STANDBY FREQUENCY:${n}`, "KHz"),
      },
      hf1: {
        active: "-.----",
        standby: "-.----",
        modulation: "--",
      },
    };
  }

  Update() {
    if (!this.isInitialized) {
      this.init();
    }
    this.getSimVars();
    this.updateCom("comOwn");
    this.updateCom("comOther");
    this.updateCom("com3");
    this.updateNav("nav1");
    this.updateTransponder(this.simvar.transponder);
    this.updateAdf(this.simvar.adf);
    this.updateHf1(this.simvar.hf1);
  }

  updateCom(label) {
    // update freqs
    diffAndSetText(this[label].active, Number(this.simvar[label].active).toFixed(3));
    diffAndSetText(this[label].standby, Number(this.simvar[label].standby).toFixed(3));

    // update transmit
    const transmit = Number(this.simvar[label].transmit);
    if (transmit) {
      diffAndSetText(this[label].transmit, "TX");
    } else {
      diffAndSetText(this[label].transmit, "  ");
    }
  }

  updateNav(label) {
    // update freqs
    diffAndSetText(this[label].active, Number(this.simvar[label].active).toFixed(3));
    diffAndSetText(this[label].standby, Number(this.simvar[label].standby).toFixed(3));
  }

  updateTransponder({ code, state }) {
    const extractedCode = extractTransponderCode(code);
    diffAndSetText(this.transponder.code, extractedCode);
    diffAndSetText(this.transponder.state, transponderStates[state]);
  }

  updateAdf({ active, standby }) {
    diffAndSetText(this.adf.active, Number(active).toFixed(1));
    diffAndSetText(this.adf.standby, Number(standby).toFixed(1));
  }

  updateHf1({ active, standby, modulation }) {
    diffAndSetText(this.hf1.active, active);
    diffAndSetText(this.hf1.standby, standby);
    diffAndSetText(this.hf1.modulation, modulation);
  }
}

customElements.define("navcom-page", Navcom);
checkAutoload();
