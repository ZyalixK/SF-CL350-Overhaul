class AileronGauge extends TemplateElement {
  get templateID() {
    return "aileron-gauge-template";
  }

  get isInitialized() {
    return this.el ? true : false;
  }

  constructor() {
    super();
    this.pendingAttributes = [];
    this.states = {
      left: {
        rad: null,
        deg: null,
      },
      right: {
        rad: null,
        deg: null,
      },
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
    this.ailPointer = {
      left: this.querySelector("#ail-pointer-left"),
      right: this.querySelector("#ail-pointer-right"),
    };
  }

  connectedCallback() {
    super.connectedCallback();
    this.init();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  Update({ left, right }) {
    if (!this.isInitialized) {
      this.init();
    } else {
      if (this.pendingAttributes.length > 0) {
        this.pendingAttributes.forEach((attr) => {
          this.attributeChangedCallback(attr.name, attr.oldValue, attr.newValue);
        });

        this.pendingAttributes = [];
      }

      // update
      if (this.states.left.rad !== left.rad) {
        this.states.left.rad = left.rad;
        this.states.left.deg = radiansToDegrees(left.rad);
      }

      if (this.states.right.rad !== right.rad) {
        this.states.right.rad = right.rad;
        this.states.right.deg = radiansToDegrees(right.rad);
      }

      this.updatePointer("left", this.states.left.deg);
      this.updatePointer("right", this.states.right.deg);

      this.setBandColour(this.states.left.deg);
    }
  }

  static get BAND_DEG() { return Math.asin(10 / 35) * 180 / Math.PI; }

  setBandColour(deg) {
    const inBand = Math.abs(Number(deg)) <= AileronGauge.BAND_DEG;
    for (const side of ["left", "right"]) {
      const el = this.ailPointer && this.ailPointer[side];
      if (!el) { continue; }
      el.classList.toggle("ail-in-band", inBand);
      el.classList.toggle("ail-out-of-band", !inBand);
    }
  }

  updatePointer(side, deg) {
    const transformValue = `rotate(${deg}deg)`;
    diffAndSetStyle(this.ailPointer[side], "transform", transformValue);
  }
}

customElements.define("aileron-gauge", AileronGauge);
checkAutoload();
