class RudderTrimGauge extends TemplateElement {
  get templateID() {
    return "rudder-trim-gauge-template";
  }

  get isInitialized() {
    return this.el ? true : false;
  }

  constructor() {
    super();
    this.pendingAttributes = [];
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
    this.gaugePointer = this.querySelector("#rud-gauge-pointer");
  }

  connectedCallback() {
    super.connectedCallback();
    this.init();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  Update({ pct, rad }) {
    if (!this.isInitialized) {
      this.init();
    } else {
      if (this.pendingAttributes.length > 0) {
        this.pendingAttributes.forEach((attr) => {
          this.attributeChangedCallback(
            attr.name,
            attr.oldValue,
            attr.newValue
          );
        });

        this.pendingAttributes = [];
      }
      // Update
      this.updateGaugePointer(pct);
      this.setBandColour(pct);
    }
  }

  static get BAND_PCT() { return 11 / 38; }

  setBandColour(pct) {
    if (!this.gaugePointer) { return; }
    const inBand = Math.abs(Number(pct)) <= RudderTrimGauge.BAND_PCT;
    this.gaugePointer.classList.toggle("rud-in-band", inBand);
    this.gaugePointer.classList.toggle("rud-out-of-band", !inBand);
  }

  updateGaugePointer(pct) {
    const translateValue = `translateX(${(66 / 2) * pct * -1}%)`;
    diffAndSetStyle(this.gaugePointer, "transform", translateValue);
  }
}

customElements.define("rudder-trim-gauge", RudderTrimGauge);
checkAutoload();
