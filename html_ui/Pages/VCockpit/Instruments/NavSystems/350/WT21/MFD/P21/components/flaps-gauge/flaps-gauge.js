class FlapsGauge extends TemplateElement {
  get templateID() {
    return "flaps-gauge-template";
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
    this.flapsPointer = this.querySelector("#flaps-pointer");
    this.flapsIndexReadout = this.querySelector("#flaps-index-readout");
    this.flapsCommanded = this.querySelector("#flaps-commanded"); 
  }

  connectedCallback() {
    super.connectedCallback();
    this.init();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  Update({ num, angle, commanded }) {
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
      num = num > 3 ? 3 : num < 0 ? 0 : num;
      this.moveFlaps(num, angle);
      this.moveCommanded(commanded !== undefined ? commanded : num);
      this.updateReadout(num, angle);
    }
  }

  screenAngleFor(flapDegrees) {
    const F = FlapsGauge.DETENT_FLAP;
    const S = FlapsGauge.DETENT_SCREEN;
    if (!(flapDegrees > F[0])) {
      return S[0];
    }
    for (let i = 1; i < F.length; i++) {
      if (flapDegrees <= F[i]) {
        const span = F[i] - F[i - 1];
        const t = span > 0 ? (flapDegrees - F[i - 1]) / span : 0;
        return S[i - 1] + t * (S[i] - S[i - 1]);
      }
    }
    return S[S.length - 1];
  }

  moveFlaps(num, angle) {
    const useLive = typeof angle === "number" && isFinite(angle);
    const rotation = useLive
      ? this.screenAngleFor(angle)
      : FlapsGauge.DETENT_SCREEN[Math.round(num)];
    diffAndSetStyle(this.flapsPointer, "transform", `rotate(${rotation.toFixed(2)}deg)`);
  }


  moveCommanded(commandedIndex) {
    if (!this.flapsCommanded) {
      return;
    }
    let i = Math.round(commandedIndex);
    i = i > 3 ? 3 : i < 0 ? 0 : i;
    const rotation = FlapsGauge.DETENT_SCREEN[i];
    diffAndSetStyle(this.flapsCommanded, "transform", `rotate(${rotation}deg)`);
  }

  updateReadout(num, angle) {
    let label;
    if (typeof angle === "number" && isFinite(angle)) {
      label = String(Math.round(angle));
    } else {
      label = FlapsGauge.DETENT_DEGREES[Math.round(num)];
      if (label === undefined) {
        label = String(num);
      }
    }
    diffAndSetText(this.flapsIndexReadout, label);
  }
}

FlapsGauge.DETENT_FLAP = [0, 10, 20, 30];
FlapsGauge.DETENT_SCREEN = [0, 24, 48, 80];

FlapsGauge.DETENT_DEGREES = ["0", "10", "20", "30"];

customElements.define("flaps-gauge", FlapsGauge);
checkAutoload();
