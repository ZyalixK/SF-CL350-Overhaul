

class EicasMessages extends TemplateElement {
  get templateID() {
    return "eicas-messages-template";
  }

  get isInitialized() {
    return this.el ? true : false;
  }

  constructor() {
    super();
    this.pendingAttributes = [];
    this.messages = [];
    this.lastKey = null;


    this.config = {
      messageType: {
        warning: "text-red",
        caution: "text-yellow",
        advisory: "text-cyan",
        status: "text-white",
      },
    };
  }

  static get observedAttributes() {
    return [];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (!this.isInitialized) {
      this.pendingAttributes.push({ name, oldValue, newValue });
      return;
    }
  }

  init() {
    this.el = document.getElementById(this.id);
    this.container = this.querySelector("#messages-container");
    this.counter = this.querySelector("#messages-count");
  }

  connectedCallback() {
    super.connectedCallback();
    this.init();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  Update() {
    if (!this.isInitialized) {
      this.init();
      return;
    }
    if (this.pendingAttributes.length > 0) {
      this.pendingAttributes.forEach((a) =>
        this.attributeChangedCallback(a.name, a.oldValue, a.newValue)
      );
      this.pendingAttributes = [];
    }

  }

  add() {

  }

  remove() {

  }

  setMessages(list) {
    const incoming = Array.isArray(list) ? list : [];

    const key = incoming.map((m) => m.tier + "" + m.text).join("");
    if (key === this.lastKey) {
      return;
    }
    this.lastKey = key;
    this.messages = incoming;
    this.render();
  }

  render() {
    if (!this.container) {
      return;
    }
    this.container.innerHTML = "";
    let total = 0;
    for (const tier of Object.keys(this.config.messageType)) {

      const block = this.messages.filter((m) => m.tier === tier).reverse();
      for (const m of block) {
        const div = document.createElement("div");
        div.className = this.config.messageType[tier];
        div.textContent = m.text;
        this.container.appendChild(div);
        total++;
      }
    }
    if (this.counter) {


      this.counter.textContent = total > 0 ? String(total) : "";
      this.counter.classList.toggle("visibility-hidden", total === 0);
    }
  }
}

customElements.define("eicas-messages", EicasMessages);
checkAutoload();
