class HydReservoir extends TemplateElement {
  get templateID() {
    return "hyd-reservoir-template";
  }

  get isInitialized() {
    return this.el ? true : false;
  }

  constructor() {
    super();
    this.pendingAttributes = [];

    this.config = {
      // if below or upper normal level,
      // the value color will be white, otherwise green
      normalUpperLevel: {
        left: 85,
        right: 85,
        aux: 85,
      },
      normalLowerLevel: {
        left: 30,
        right: 40,
        aux: 20,
      },
    };
  }

  static get observedAttributes() {
    return ["state"];
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

    // set attributes here
  }

  // not to be confused with Init method on BaseInstrument
  // https://docs.flightsimulator.com/flighting/html/Programming_Tools/JavaScript/BaseInstruments.htm#Init
  init() {
    this.el = document.getElementById(this.id);

    // set elements here
    this.percentage = this.querySelector("#qty-percentage");
    this.temp = this.querySelector("#qty-temp");
  }

  connectedCallback() {
    super.connectedCallback();
    this.init();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  Update(percentage, temp, systemPosition) {
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

      const band = (typeof P21Hyd !== "undefined" && P21Hyd.BAND && P21Hyd.BAND[systemPosition])
        ? P21Hyd.BAND[systemPosition]
        : { lo: this.config.normalLowerLevel[systemPosition],
            hi: this.config.normalUpperLevel[systemPosition] };
      const pct = (typeof P21Hyd !== "undefined" && typeof percentage === "number")
        ? P21Hyd.quantize(percentage)
        : percentage;

      // Update
      diffAndSetText(this.percentage, pct.toFixed().padStart(2, "0"));

      diffAndSetText(this.temp,
        typeof temp === "number" && isFinite(temp) ? temp.toFixed().padStart(2, "0") : String(temp));

      // change color
      const outOfBand = !(pct >= band.lo && pct <= band.hi);
      if (outOfBand) {
        this.percentage.classList.remove("text-green");
        this.percentage.classList.add("text-white");
      } else {
        this.percentage.classList.add("text-green");
        this.percentage.classList.remove("text-white");
      }
    }
  }
}

customElements.define("hyd-reservoir", HydReservoir);
checkAutoload();
