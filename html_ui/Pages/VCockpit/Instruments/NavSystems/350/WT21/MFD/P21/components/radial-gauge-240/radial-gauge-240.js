class RadialGauge240 extends TemplateElement {
  get templateID() {
    return "radial-gauge-240-template";
  }

  get isInitialized() {
    return this.el ? true : false;
  }

  constructor() {
    super();
    this.pendingAttributes = [];
  }

  static get observedAttributes() {
    return ["rpm", "to"];
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

    if (name == "rpm") {
      this.setRpm(newValue);
      this.setRpmNeedle(newValue);
    }

    if (name == "to") {
      this.setTo(newValue, "TO");
    }
  }

  // not to be confused with Init method on BaseInstrument
  // https://docs.flightsimulator.com/flighting/html/Programming_Tools/JavaScript/BaseInstruments.htm#Init
  init() {
    this.el = document.getElementById(this.id);
    this.rpm = this.querySelector("#rg-v1");
    this.rpmNeedle = this.querySelector("#rpm-needle");
    this.to = this.querySelector("#rg-v2");

    this.fadecMarker = this.querySelector("#fadec-target-marker");
    this.fadecMarkerCircle = this.querySelector("#fadec-target-circle");
    this.fadecMarkerLine = this.querySelector("#fadec-target-line");

    this.targetPointer = this.querySelector("#target-pointer");


    this.fireFlag = this.querySelector("#rg-fire");


    this.revFlag = this.querySelector("#rg-rev");
    this.revText = this.querySelector("#rg-rev-text");
  }

  connectedCallback() {
    super.connectedCallback();
    this.init();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  setRpm(rpm) {
    diffAndSetText(this.rpm, rpm);
  }

  setTo(value, label) {
    diffAndSetText(this.to, value + " " + (label || "TO"));
  }

  setRpmNeedle(rpm) {
    const rotateDeg = (240 / this.maxRpm) * Number(rpm);
    diffAndSetStyle(this.rpmNeedle, "transform", `rotate(${rotateDeg}deg)`);
  }

  static get FADEC_MARKER_SHAPES() { return { TO: "line", CLB: "line", CRZ: "circle", APR: "line" }; }

  setFadecMarker(value, label) {
    if (!this.fadecMarker) { return; }
    if (value === null || !isFinite(value) || !this.maxRpm) {
      this.fadecMarker.classList.add("hidden");
      return;
    }
    const shape = RadialGauge240.FADEC_MARKER_SHAPES[label] || "line";
    if (this.fadecMarkerCircle) {
      this.fadecMarkerCircle.classList.toggle("hidden", shape !== "circle");
    }
    if (this.fadecMarkerLine) {
      this.fadecMarkerLine.classList.toggle("hidden", shape !== "line");
    }
    this.fadecMarker.classList.remove("hidden");
    diffAndSetStyle(this.fadecMarker, "transform",
      `rotate(${(240 / this.maxRpm) * Number(value)}deg)`);
  }

  showTo(show) {
    if (!show) {
      this.to.classList.add("hidden");
    } else {
      this.to.classList.remove("hidden");
    }
  }

  Update({ rpm, maxRpm, target, targetReverse, fadecTarget, fadecMode, fire, rev }) {
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
    this.maxRpm = maxRpm;
    this.setRpm(rpm);
    this.setRpmNeedle(rpm);

    if (fadecMode !== undefined) {
      const label = RadialGauge240.FADEC_MODE_LABELS[Math.round(Number(fadecMode))];
      if (label && Number(fadecTarget) > 0) {
        this.showTo(true);
        this.setTo(Number(fadecTarget).toFixed(1), label);

        this.setFadecMarker(Number(fadecTarget), label);
      } else {
        this.showTo(false);
        this.setFadecMarker(null);
      }
    } else if (!this.hasAttribute("to")) {
      this.showTo(false);
    }

    if (target) {
      this.updateTarget(target);
    }

    if (fire !== undefined) { this.setFire(!!fire); }


    if (rev !== undefined) { this.setRev(rev); }
    // update target reverse here
  }


  setRev(state) {
    if (!this.revFlag) { return; }
    const colour = RadialGauge240.REV_STATE_COLOURS[state] || null;
    if (!colour) {
      this.revFlag.classList.add("hidden");
      return;
    }
    this.revFlag.classList.remove("hidden");

    if (this.revText) { diffAndSetStyle(this.revText, "fill", colour); }
  }

  setFire(on) {
    if (!this.fireFlag) { return; }
    if (this.fireFlag.classList.contains("hidden") === on) {
      this.fireFlag.classList.toggle("hidden", !on);
    }
  }

  updateTarget(target) {
    const targetDegree = target * (240 / 100);
    diffAndSetStyle(this.targetPointer, "transform", `rotate(${targetDegree}deg)`);
  }
}

RadialGauge240.FADEC_MODE_LABELS = [null, "TO", "CLB", "CRZ", "APR", "REV"];

RadialGauge240.REV_STATE_COLOURS = {
  transit: "var(--p21-color-white)",
  deployed: "var(--p21-color-green)",
  airborne: "var(--p21-color-amber)"
};

customElements.define("radial-gauge-240", RadialGauge240);
checkAutoload();
