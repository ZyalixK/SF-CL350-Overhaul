class PtuIcon extends TemplateElement {
  get templateID() {
    return "ptu-icon-template";
  }

  get isInitialized() {
    return this.el ? true : false;
  }

  get states() {}

  constructor() {
    super();
    this.pendingAttributes = [];
  }

  init() {
    this.el = document.getElementById(this.id);
    // if need to change stroke color
    this.lines = this.querySelector("#lines");

    this.circle = this.querySelector("#circle");
    this.group = this.querySelector("#group");
  }

  connectedCallback() {
    super.connectedCallback();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
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

  static get OPEN_DEGREES() { return 90; }
  static get CLOSED_DEGREES() { return 0; }

  rotate(degrees) {
    if (this.group) {
      this.group.setAttribute("transform", `rotate(${degrees})`);
    }
  }

  Update(active) {
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
    }
    const state = (active && typeof active === "object")
      ? active
      : { open: !!active, green: !!active };
    if (state.green) {
      this.group.classList.add("stroke-green");
      this.group.classList.remove("stroke-white");
    } else {
      this.group.classList.remove("stroke-green");
      this.group.classList.add("stroke-white");
    }
    this.rotate(state.open ? PtuIcon.OPEN_DEGREES : PtuIcon.CLOSED_DEGREES);
  }
}

customElements.define("ptu-icon", PtuIcon);
checkAutoload();
