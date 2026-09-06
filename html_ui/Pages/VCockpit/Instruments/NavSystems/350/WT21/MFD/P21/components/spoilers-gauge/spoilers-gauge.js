class SpoilersGauge extends TemplateElement {
  get templateID() {
    return "spoilers-gauge-template";
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
    this.arrows = {
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

    this.boxes = {
      g1: { l: this.querySelector("#g1-box-l"), r: this.querySelector("#g1-box-r") },
      g2: { l: this.querySelector("#g2-box-l"), r: this.querySelector("#g2-box-r") },
      g3: { l: this.querySelector("#g3-box-l"), r: this.querySelector("#g3-box-r") },
      g4: { l: this.querySelector("#g4-box-l"), r: this.querySelector("#g4-box-r") },
    };
  }

  connectedCallback() {
    super.connectedCallback();
    this.init();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  Update({ left, right, leftGnd, rightGnd, n1, onGround, handle }) {
    if (!this.isInitialized) {
      this.init();
    } else {
      if (this.pendingAttributes.length > 0) {
        this.pendingAttributes.forEach((attr) => {
          this.attributeChangedCallback(attr.name, attr.oldValue, attr.newValue);
        });

        this.pendingAttributes = [];
      }

      const col = SpoilersGauge.columns({ left, right, leftGnd, rightGnd, onGround });
      this.updateArrow("g1", { left: col.g1, right: col.g1 });
      this.updateArrow("g2", { left: col.g2, right: col.g2 });
      this.updateArrow("g3", { left: col.g3, right: col.g3 });
      this.updateArrow("g4", { left: col.g4, right: col.g4 });

      if (n1 !== undefined) {

        this.setBoxes(col, n1, { leftGnd, rightGnd, handle });
      }
    }
  }

  static get CELL_ENGINE() {
    return {
      g1: { l: 2, r: 1 },   
      g2: { l: 2, r: 1 },   
      g3: { l: 1, r: 2 },   
      g4: { l: 1, r: 2 },   
    };
  }

  static get N1_AVAILABLE_PCT() { return 1; }

  static clamp01(v) {
    const n = Number(v);
    if (!isFinite(n)) { return 0; }
    return n < 0 ? 0 : n > 1 ? 1 : n;
  }

  static columns({ left, right, leftGnd, rightGnd, onGround }) {
    const c = SpoilersGauge.clamp01;
    const gnd = onGround === undefined ? 1 : (onGround ? 1 : 0);
    return {
      g1: c(c(leftGnd) + c(left)),
      g2: gnd ? c(leftGnd) : 0,
      g3: gnd ? c(rightGnd) : 0,
      g4: c(c(rightGnd) + c(right)),
    };
  }

  setBoxes(values, n1, deployment) {
    const map = SpoilersGauge.CELL_ENGINE;
    const min = SpoilersGauge.N1_AVAILABLE_PCT;
    let allAvailable = true;
    let anyDeployed = false;

    for (const key of ["g1", "g2", "g3", "g4"]) {
      const pair = this.boxes && this.boxes[key];
      for (const side of ["l", "r"]) {
        const available = Number(n1 && n1[map[key][side]]) >= min;
        if (!available) { allAvailable = false; }
        const el = pair && pair[side];
        if (!el) { continue; }
        const cls = available ? "stroke-green" : "stroke-amber";
        if (!el.classList.contains(cls)) {
          el.classList.remove("stroke-white", "stroke-green", "stroke-amber");
          el.classList.add(cls);
        }
      }
    }

    const dep = deployment || {};
    const bothSides = Math.min(
      SpoilersGauge.clamp01(dep.leftGnd),
      SpoilersGauge.clamp01(dep.rightGnd)
    );
    anyDeployed =
      SpoilersGauge.clamp01(dep.handle) > SpoilersGauge.DEPLOY_HANDLE_MIN ||
      bothSides > SpoilersGauge.DEPLOY_BOTH_SIDES_MIN;

    this.updateDeclutter(allAvailable, anyDeployed);
  }

  static get DECLUTTER_SECONDS() { return 30; }


  static get DEPLOY_HANDLE_MIN() { return 0.02; }

  static get DEPLOY_BOTH_SIDES_MIN() { return 0.15; }

  updateDeclutter(allAvailable, anyDeployed) {
    const now = Date.now();
    const state = (allAvailable ? "A" : "-") + (anyDeployed ? "D" : "-");
    if (state !== this._declutterState) {
      this._declutterState = state;
      this._declutterSince = now;
    }

    const mayHide = allAvailable && !anyDeployed &&
      (now - (this._declutterSince || now)) >= SpoilersGauge.DECLUTTER_SECONDS * 1000;
    if (this.classList.contains("hidden") !== mayHide) {
      this.classList.toggle("hidden", mayHide);
    }
  }

  updateArrow(gauge, { left, right }) {
    const transformValueLeft = `translateY(${left * -66}%)`;
    const transformValueRight = `translateY(${right * -66}%)`;
    diffAndSetStyle(this.arrows[gauge].left, "transform", transformValueLeft);
    diffAndSetStyle(this.arrows[gauge].right, "transform", transformValueRight);
  }
}

customElements.define("spoilers-gauge", SpoilersGauge);
checkAutoload();
