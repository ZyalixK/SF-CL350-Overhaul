class CabReadout extends TemplateElement {


  static get OXY_QTY_PLACEHOLDER_PSI() { return 1850; }

  get templateID() {
    return "cab-readout-template";
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
    this.cabAlt = this.querySelector("#cab-alt");
    this.cabRate = this.querySelector("#cab-rate");
    this.cabRateArrow = this.querySelector("#cab-rate-arrow");

    this.cabOxyQty = this.querySelector("#cab-oxy-qty");
    this.cabDp = this.querySelector("#cab-dp");
    this.cabTemp = this.querySelector("#cab-temp");
    this.cabLndgAlt = this.querySelector("#cab-lndg-alt");
  }

  connectedCallback() {
    super.connectedCallback();
    this.init();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  Update({ pressAlt, pressAltRate, dp, cabinTemp, landingAlt, oxyQty }) {
    if (!this.isInitialized) {
      this.init();
    } else {
      if (this.pendingAttributes.length > 0) {
        this.pendingAttributes.forEach((attr) => {
          this.attributeChangedCallback(attr.name, attr.oldValue, attr.newValue);
        });

        this.pendingAttributes = [];
      }

      // Update
      const pressRateMin = pressAltRate * 60;
      diffAndSetText(this.cabAlt, Number(pressAlt).toFixed());
      diffAndSetText(this.cabRate, Math.abs(Number(pressRateMin).toFixed()));

      const show = (el, v, digits) => {
        if (!el) { return; }
        const n = Number(v);
        diffAndSetText(el, (v === undefined || v === null || !isFinite(n))
          ? "--" : n.toFixed(digits));
      };

      show(this.cabOxyQty, oxyQty === undefined ? CabReadout.OXY_QTY_PLACEHOLDER_PSI : oxyQty, 0);
      show(this.cabDp, dp, 1);
      show(this.cabTemp, cabinTemp, 0);
      show(this.cabLndgAlt, landingAlt, 0);

      if (pressRateMin > 0) {
        diffAndSetStyle(this.cabRateArrow, "transform", "rotate(180deg)");
        diffAndSetStyle(this.cabRateArrow, "top", "-0.5rem");
      } else {
        diffAndSetStyle(this.cabRateArrow, "transform", "rotate(0deg)");
        diffAndSetStyle(this.cabRateArrow, "top", "0");
      }
    }
  }
}

customElements.define("cab-readout", CabReadout);
checkAutoload();
