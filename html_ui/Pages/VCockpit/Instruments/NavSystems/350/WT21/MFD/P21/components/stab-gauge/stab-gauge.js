class StabGauge extends TemplateElement {
  get templateID() {
    return "stab-gauge-template";
  }

  get isInitialized() {
    return this.el ? true : false;
  }

  constructor() {
    super();
    this.pendingAttributes = [];
    this.state = {
      rad: null,
      pct: null,
    };
  }

  static get observedAttributes() {
    return [];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (!this.isInitialized) {
      this.pendingAttributes.push({
        name: name,
        oldValue: oldValue,
        newValue: newValue,
      });
      return;
    }
  }

  // not to be confused with Init method on BaseInstrument
  // https://docs.flightsimulator.com/flighting/html/Programming_Tools/JavaScript/BaseInstruments.htm#Init
  init() {
    this.el = document.getElementById(this.id);
    this.gaugePointer = this.querySelector("#gauge-pointer");
    this.gaugeReadout = this.querySelector("#gauge-readout");
    this.gaugeNegIcon = this.querySelector("#gauge-neg-icon");

    this.stabCallout = this.querySelector("#stab-callout");
  }

  connectedCallback() {
    super.connectedCallback();
    this.init();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  Update({ rad, pct }) {
    if (!this.isInitialized) {
      this.init();
    } else {
      if (this.pendingAttributes.length > 0) {
        this.pendingAttributes.forEach((attr) => {
          this.attributeChangedCallback(attr.name, attr.oldValue, attr.newValue);
        });

        this.pendingAttributes = [];
      }
    }

    if (this.state.rad !== rad) {
      this.state.rad = rad;
      this.state.pct = pct;
      this.state.deg = radiansToDegrees(rad);
      this.movePointer(pct);

      this.updateReadout(pct);
      this.setBandColour(pct);
    }
  }

  static get UNITS_FULL() { return 15; }
  static get TRIM_DEG_ND() { return -5; }    
  static get TRIM_DEG_NU() { return 12.5; }  
  static get TRIM_DEG_SPAN() { return StabGauge.TRIM_DEG_NU - StabGauge.TRIM_DEG_ND; }
  static degToUnits(deg) {
    return StabGauge.UNITS_FULL * (Number(deg) - StabGauge.TRIM_DEG_ND) / StabGauge.TRIM_DEG_SPAN;
  }
  static unitsToDeg(u) {
    return StabGauge.TRIM_DEG_ND + StabGauge.TRIM_DEG_SPAN * Number(u) / StabGauge.UNITS_FULL;
  }


  static pctToDeg(pct) { return Number(pct) * StabGauge.TRIM_DEG_NU; }
  static pctToUnits(pct) { return StabGauge.degToUnits(StabGauge.pctToDeg(pct)); }

  static get BAND_UNITS_MIN() { return 2.5; }
  static get BAND_UNITS_MAX() { return 8.0; }

  static get BAND_DEG_MIN() { return StabGauge.unitsToDeg(StabGauge.BAND_UNITS_MIN); }
  static get BAND_DEG_MAX() { return StabGauge.unitsToDeg(StabGauge.BAND_UNITS_MAX); }

  setBandColour(pct) {
    if (!this.stabCallout) { return; }
    const deg = StabGauge.pctToDeg(pct);
    const inBand = deg >= StabGauge.BAND_DEG_MIN && deg <= StabGauge.BAND_DEG_MAX;
    this.stabCallout.classList.toggle("stab-in-band", inBand);
    this.stabCallout.classList.toggle("stab-out-of-band", !inBand);
  }

  movePointer(pct) {


    const frac = Math.min(1, Math.max(0, StabGauge.pctToUnits(pct) / StabGauge.UNITS_FULL));
    const transformValue = `translateY(${-1 * (74 * frac)}%)`;
    diffAndSetStyle(this.gaugePointer, "transform", transformValue);
  }

  updateReadout(pct) {
    const units = Math.min(StabGauge.UNITS_FULL, Math.max(0, StabGauge.pctToUnits(pct)));
    diffAndSetText(this.gaugeReadout, units.toFixed(1));


    if (this.gaugeNegIcon) { this.gaugeNegIcon.classList.add("hidden"); }
  }
}

customElements.define("stab-gauge", StabGauge);
checkAutoload();
