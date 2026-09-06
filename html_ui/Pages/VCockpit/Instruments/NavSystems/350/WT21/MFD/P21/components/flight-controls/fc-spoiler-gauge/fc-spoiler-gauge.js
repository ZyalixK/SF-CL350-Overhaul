class FcSpoilerGauge extends TemplateElement {
  get templateID() {
    return "fc-spoiler-gauge-template";
  }

  get isInitialized() {
    return this.el ? true : false;
  }

  constructor() {
    super();
    this.pendingAttributes = [];
  }

  static get observedAttributes() {
    return ["label", "right", "value", "min", "max"];
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
    if (name === "right") {

      this.right = newValue !== null && newValue !== "false";
      this.setOrientation(this.right);
    }
  }

  // not to be confused with Init method on BaseInstrument
  // https://docs.flightsimulator.com/flighting/html/Programming_Tools/JavaScript/BaseInstruments.htm#Init
  init() {
    this.el = document.getElementById(this.id);

    // set elements here
    // Left orientation
    this.g1 = this.querySelector("#g1");
    this.g2 = this.querySelector("#g2");

    // Right orientation
    this.g3 = this.querySelector("#g3");
    this.g4 = this.querySelector("#g4");

    // Left
    this.arrow = {
      g1: {
        left: this.querySelector("#g1-left"),
        right: this.querySelector("#g1-right"),
      },
      g2: {
        left: this.querySelector("#g2-left"),
        right: this.querySelector("#g2-right"),
      },
      g3: {
        left: this.querySelector("#g3-left"),
        right: this.querySelector("#g3-right"),
      },
      g4: {
        left: this.querySelector("#g4-left"),
        right: this.querySelector("#g4-right"),
      },
    };

    this.box = {
      g1: { l: this.querySelector("#g1-box-l"), r: this.querySelector("#g1-box-r") },
      g2: { l: this.querySelector("#g2-box-l"), r: this.querySelector("#g2-box-r") },
      g3: { l: this.querySelector("#g3-box-l"), r: this.querySelector("#g3-box-r") },
      g4: { l: this.querySelector("#g4-box-l"), r: this.querySelector("#g4-box-r") },
    };
    this.right = this.getAttribute("right") !== null &&
      this.getAttribute("right") !== "false";
    this.setOrientation(this.right);
  }

  connectedCallback() {
    super.connectedCallback();
    this.init();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  Update(position, spoileron, available, onGround) {
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

      const pos = Number(position) || 0;
      const roll = Number(spoileron) || 0;
      const cl = (v) => (!isFinite(v) ? 0 : v < 0 ? 0 : v > 1 ? 1 : v);
      const outboard = cl(cl(pos) + cl(roll));

      const inboard = (onGround === undefined || onGround) ? cl(pos) : 0;

      const setArrow = (g, v) => {
        const t = `translateY(${v * -66}%)`;
        const a = this.arrow[g];
        if (!a) { return; }
        diffAndSetStyle(a.left, "transform", t);
        diffAndSetStyle(a.right, "transform", t);
      };
      const keys = this.right ? ["g3", "g4"] : ["g1", "g2"];
      if (this.right) {
        setArrow("g3", inboard);
        setArrow("g4", outboard);
      } else {
        setArrow("g1", outboard);
        setArrow("g2", inboard);
      }

      if (available !== undefined) {
        const map = (typeof SpoilersGauge !== "undefined" && SpoilersGauge.CELL_ENGINE) || null;
        const min = (typeof SpoilersGauge !== "undefined" && SpoilersGauge.N1_AVAILABLE_PCT) || 1;
        const perEngine = available && typeof available === "object";
        for (const k of keys) {
          const pair = this.box && this.box[k];
          for (const side of ["l", "r"]) {
            const el = pair && pair[side];
            if (!el) { continue; }
            const ok = perEngine && map
              ? Number(available[map[k][side]]) >= min
              : !!available;
            const cls = ok ? "stroke-green" : "stroke-amber";
            if (!el.classList.contains(cls)) {
              el.classList.remove("stroke-white", "stroke-green", "stroke-amber");
              el.classList.add(cls);
            }
          }
        }
      }
    }
  }

  setOrientation(right) {

    if (right) {
      this.g1.classList.add("hidden");
      this.g2.classList.add("hidden");
      this.g3.classList.remove("hidden");
      this.g4.classList.remove("hidden");
    } else {
      this.g1.classList.remove("hidden");
      this.g2.classList.remove("hidden");
      this.g3.classList.add("hidden");
      this.g4.classList.add("hidden");
    }
  }
}

customElements.define("fc-spoiler-gauge", FcSpoilerGauge);
checkAutoload();
