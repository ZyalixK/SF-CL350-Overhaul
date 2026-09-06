class FcWing extends TemplateElement {
  get templateID() {
    return "fc-wing-template";
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

    // set attributes here
  }

  // not to be confused with Init method on BaseInstrument
  // https://docs.flightsimulator.com/flighting/html/Programming_Tools/JavaScript/BaseInstruments.htm#Init
  init() {
    this.el = document.getElementById(this.id);

    // set elements here
    this.readout = {
      left: {
        color: this.querySelector("#readout-left-color"),
        value: this.querySelector("#readout-left-value"),
      },
      right: {
        color: this.querySelector("#readout-right-color"),
        value: this.querySelector("#readout-right-value"),
      }
    }
  }

  connectedCallback() {
    super.connectedCallback();
    this.init();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  Update(flaps) {
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

      this.updateFlapReadouts(flaps);
    }
  }

  setReadout(side, angle, commanded) {
    const node = this.readout && this.readout[side] && this.readout[side].value;
    if (!node) {
      return;
    }
    let label;
    if (typeof angle === "number" && isFinite(angle)) {
      label = String(Math.round(angle));
    } else if (typeof commanded === "number" && isFinite(commanded)) {
      const i = Math.max(0, Math.min(3, Math.round(commanded)));
      label = FcWing.DETENT_FLAP[i];
    } else {
      return;
    }
    if (node.textContent !== label) {
      node.textContent = label;
    }
  }

  updateFlapReadouts(flaps) {
    if (!flaps) {
      return;
    }
    this.setReadout("left", flaps.left, flaps.commanded);
    this.setReadout("right", flaps.right, flaps.commanded);
  }
}

FcWing.DETENT_FLAP = ["0", "10", "20", "30"];

customElements.define("fc-wing", FcWing);
checkAutoload();
