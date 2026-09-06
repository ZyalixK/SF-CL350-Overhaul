class GearGauge extends TemplateElement {
  get templateID() {
    return "gear-gauge-template";
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
    this.box = {
      center: {
        complete: this.querySelector("#center-box-complete"),
        progress: this.querySelector("#center-box-progress"),
      },
      left: {
        complete: this.querySelector("#left-box-complete"),
        progress: this.querySelector("#left-box-progress"),
      },
      right: {
        complete: this.querySelector("#right-box-complete"),
        progress: this.querySelector("#right-box-progress"),
      },
    };
    this.readout = {
      center: this.querySelector("#center-readout"),
      left: this.querySelector("#left-readout"),
      right: this.querySelector("#right-readout"),
    };
  }

  connectedCallback() {
    super.connectedCallback();
    this.init();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  Update({ center, left, right }) {
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
      this.updateGear("center", center);
      this.updateGear("left", left);
      this.updateGear("right", right);
    }
  }

  updateGear(gear, position) {

    if (position >= GearGauge.POSITION_TOLERANCE) {

      this.box[gear].complete.classList.remove("hidden");
      this.box[gear].complete.classList.remove("fill-red");
      this.box[gear].complete.classList.remove("fill-white");
      this.box[gear].complete.classList.add("fill-green");

      this.box[gear].complete.style.fill = "";
      this.box[gear].complete.style.stroke = "";
      this.box[gear].complete.style.strokeWidth = "";
      if (this.readout[gear]) { this.readout[gear].style.fill = ""; }
      this.box[gear].progress.classList.add("hidden");
      diffAndSetText(this.readout[gear], "DN");
    } else if (position <= 1 - GearGauge.POSITION_TOLERANCE) {

      this.box[gear].complete.classList.remove("hidden");
      this.box[gear].complete.classList.remove("fill-red");
      this.box[gear].complete.classList.remove("fill-green");
      this.box[gear].complete.classList.add("fill-white");

      this.box[gear].complete.style.fill = "var(--p21-color-black, #000)";
      this.box[gear].complete.style.stroke = "var(--p21-color-white, #fff)";
      this.box[gear].complete.style.strokeWidth = "2";
      if (this.readout[gear]) { this.readout[gear].style.fill = "var(--p21-color-white, #fff)"; }
      this.box[gear].progress.classList.add("hidden");
      diffAndSetText(this.readout[gear], "UP");
    } else {
      this.box[gear].complete.classList.add("hidden");
      this.box[gear].progress.classList.remove("hidden");
      diffAndSetText(this.readout[gear], "");
    }
  }
}


GearGauge.POSITION_TOLERANCE = 0.99;

customElements.define("gear-gauge", GearGauge);
checkAutoload();
