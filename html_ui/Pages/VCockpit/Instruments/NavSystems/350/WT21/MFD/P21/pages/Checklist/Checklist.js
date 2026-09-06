class Checklist extends TemplateElement {
  constructor() {
    super();
    this.simvar = {};
    this.config = {};
    this.state = {
      currentPage: 0,
      currentItem: 0,
      skip: 0,
      enter: 0,
      joy: {
        leftRight: 1,
        downUp: 1,
      },
    };
    // position by getting element.getBoundingClientRect()
    // https://dev.to/sprite421/working-with-an-html-element-s-position-onscreen-in-vanilla-javascript-436h
    this.scrollThres = 795;

    // config -- ref: flight_model.cfg
    this.checklist = [
      {
        order: 1,
        title: "APU START",
        items: [
          {
            label: "DOCS/SAFETY EQP/VOR",
            command: "CHECKED",
            check: false,
          },
          {
            label: "SWITCHES/CBS",
            command: "CHECKED",
            check: false,
          },
          {
            label: "GEAR HANDLE",
            command: "DOWN",
            check: false,
          },
          {
            label: "L/RAND AUX HYD PUMPS",
            command: "OFF",
            check: false,
          },
          {
            label: "A/R SOURCE",
            command: "OFF",
            check: false,
          },
          {
            label: "STBY INST SWITCH",
            command: "ON 5O SEC MIN",
            check: false,
          },
          {
            label: "L BATT",
            command: "ON 20 VOLTS MIN",
            check: false,
          },
          {
            label: "R BATT",
            command: "ON",
            check: false,
          },
          {
            label: "CAS",
            command: "APU/NORMAL FAULTS",
            check: false,
          },
          {
            label: "LIGHTS",
            command: "NAV/AS REQ",
            check: false,
          },
          {
            label: "LIR FUEL PUMPS",
            command: "AUTO",
            check: false,
          },
          {
            label: "APU",
            command: "START",
            check: false,
          },
          {
            label: "ELECTRICS",
            command: "CHECK",
            check: false,
          },
          {
            label: "LAND R BLEEDS",
            command: "OFF",
            check: false,
          },
          {
            label: "APU BLEED",
            command: "ON",
            check: false,
          },
          {
            label: "XBLEED",
            command: "OPEN",
            check: false,
          },
          {
            label: "AIR SOURCE",
            command: "NORM",
            check: false,
          },
        ],
      },
      {
        order: 2,
        title: "INITIAL CHECK 1/2",
        items: [
          {
            label: "02 MASKSGOOGLES OXYGENQUANTITY",
            command: "CHECKED",
            check: false,
          },
          {
            label: "OXYGEN QUANTITY",
            command: "CHECK",
            check: false,
          },
          {
            label: "FUEL QUANTITY",
            command: "CHECK",
            check: false,
          },
          {
            label: "STBY INSTRUMENT",
            command: "CHECKED",
            check: false,
          },
          {
            label: "CLOCK",
            command: "RESET",
            check: false,
          },
          {
            label: "NWS",
            command: "OFF",
            check: false,
          },
          {
            label: "RAM AIR",
            command: "CHECKED/OFF",
            check: false,
          },
          {
            label: "AIR COND BLEEDS",
            command: "CHECKED/SET",
            check: false,
          },
          {
            label: "PRESSURIZATION PANEL",
            command: "SET/LNDG ELEV",
            check: false,
          },
          {
            label: "ANTI-CE PROBES",
            command: "WING SOURCE NORM",
            check: false,
          },
          {
            label: "REVERSION PANEL",
            command: "OFF",
            check: false,
          },
          {
            label: "LTS/EVER LIS",
            command: "NORMAL",
            check: false,
          },
          {
            label: "L/R HYD PUMPBRAKES",
            command: "ONSET",
            check: false,
          },
          {
            label: "AUX HYD PUMP ",
            command: "AUTO CHECKD",
            check: false,
          },
          {
            label: "HYD PANEL",
            command: "AUTO",
            check: false,
          },
          {
            label: "GUST LOCK",
            command: "ON",
            check: false,
          },
        ],
      },
      {
        order: 3,
        title: "INITIAL CHECK 2/2",
        items: [
          {
            label: "02 MASKSGOOGLES OXYGENQUANTITY",
            command: "CHECKED",
            check: false,
          },
          {
            label: "OXYGEN QUANTITY",
            command: "CHECK",
            check: false,
          },
          {
            label: "FUEL QUANTITY",
            command: "CHECK",
            check: false,
          },
          {
            label: "STBY INSTRUMENT",
            command: "CHECKED",
            check: false,
          },
          {
            label: "CLOCK",
            command: "RESET",
            check: false,
          },
          {
            label: "NWS",
            command: "OFF",
            check: false,
          },
        ],
      },
    ];
  }

  get templateID() {
    return "checklist-page-template";
  }

  get isInitialized() {
    return this.el ? true : false;
  }

  init() {
    this.el = document.getElementById(this.id);

    // components
    // EICAS
    this.eicas = document.querySelector("#eicas-page");

    this.eicasMessages = {
      // EXAMPLE
      // engineAntiIceLeftRightOn: {
      //   message: "L (R) ENGINE ANTI-ICE ON",
      //   type: "normal",
      // },
    };

    this.checklistTitle = this.querySelector("#checklist-title");
    this.renderChecklist(this.state.currentPage);
    this.checklistContainer = this.querySelector("#checklist-container");
    window.checklist = this;

    // apply config
  }

  connectedCallback() {
    super.connectedCallback();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  get mfdSide() {
    return (window.mfd && Number(window.mfd.mfdSide) === 2) ? 2 : 1;
  }

  getSimVars() {

    const n = this.mfdSide;
    this.simvar = {
      skipBtn: SimVar.GetSimVarValue(`L:P21_MCP_SKIP_BTN_${n}`, "numbers"),
      enterBtn: SimVar.GetSimVarValue(`L:P21_MCP_ENTER_BTN_${n}`, "numbers"),
      joy: {
        leftRight: SimVar.GetSimVarValue(`L:P21_CCP_JOYSTICK_L_R_${n}`, "numbers"),
        downUp: SimVar.GetSimVarValue(`L:P21_CCP_Joystick_DN_UP_${n}`, "numbers"),
      },
    };
  }

  updateEicasMessages() {}

  renderChecklist(page) {
    let html = "";
    const checklistItemsEl = this.querySelector("#checklist-items");
    const checklist = this.checklist[page];

    checklist.items.forEach((item, index) => {
      const label = item.label;
      const command = item.command;
      const check = item.check;
      let textColor = "text-white";
      if (check) {
        textColor = "text-green";
      }
      if (index === this.state.currentItem) {
        textColor = "text-magenta";
      }

      html += `
            <tr id="checklist-item-${index}" class="${textColor}">
              <td id="label-${index}" >${label}</td>
              <td id="command-${index}" class="text-right">${command}</td>
            </tr>
          `;
    });
    checklistItemsEl.innerHTML = html;

    // update reference
    this.checklistItems = this.querySelectorAll("tr");
  }

  updateChecklistItems() {
    if (!this.checklistItems) {
      console.log("No Checklist Item", this.checklistItems);
      return;
    }
    // loop through items
    this.checklistItems.forEach((item, index) => {
      const itemData = this.checklist[this.state.currentPage].items[index];

      if (index === this.state.currentItem) {
        // current item highlight
        item.classList.remove("text-green");
        item.classList.remove("text-white");
        item.classList.add("text-magenta");
      } else if (itemData.check) {
        item.classList.add("text-green");
        item.classList.remove("text-white");
        item.classList.remove("text-magenta");
      } else {
        item.classList.remove("text-green");
        item.classList.add("text-white");
        item.classList.remove("text-magenta");
      }
    });
  }

  Update() {
    if (!this.isInitialized) {
      this.init();
    } else {
      // if (!this.simvar) {
      // this.simvar = document.getElementById("simvar");
      // this.vars = this.simvar.vars.mfd.sys.electrical;
      // }

      // Update components
      this.getSimVars();

      // EICAS Messages
      this.updateEicasMessages();

      diffAndSetText(
        this.checklistTitle,
        this.checklist[this.state.currentPage].title
      );

      if (this.simvar.skipBtn !== this.state.skip) {
        this.state.skip = this.simvar.skipBtn;
        this.handleSkip();
        this.updateChecklistItems();
      }

      if (this.simvar.enterBtn !== this.state.enter) {
        this.state.enter = this.simvar.enterBtn;
        this.handleEnter();
        this.updateChecklistItems();
      }

      if (this.simvar.joy.leftRight !== this.state.joy.leftRight) {
        this.state.joy.leftRight = this.simvar.joy.leftRight;
        this.handleLeftRight();
        this.updateChecklistItems();
      }

      if (this.simvar.joy.downUp !== this.state.joy.downUp) {
        this.state.joy.downUp = this.simvar.joy.downUp;
        this.handleDownUp();
        this.updateChecklistItems();
      }
    }
  }

  incrementItem() {
    this.state.currentItem++;

    // check if at last item
    if (
      this.state.currentItem + 1 >
      this.checklist[this.state.currentPage].items.length
    ) {
      this.state.currentItem = 0;
    }
  }

  incrementPage() {
    this.state.currentPage++;

    // check if at last page
    if (this.state.currentPage > this.checklist.length - 1) {
      this.state.currentPage = 0;
      this.state.currentItem = 0;
    }

    this.state.currentItem = 0;
    this.renderChecklist(this.state.currentPage);
  }

  decrementPage() {
    this.state.currentPage--;

    // check if at last page
    if (this.state.currentPage < 0) {
      this.state.currentPage = 0;
    }

    this.state.currentItem = 0;
    this.renderChecklist(this.state.currentPage);
  }

  handleSkip() {
    const currentItem =
      this.checklist[this.state.currentPage].items[this.state.currentItem];
    currentItem.check = false;
    this.incrementItem();
    this.focusOnItem();
  }

  handleEnter() {
    // setup objects
    const currentItem =
      this.checklist[this.state.currentPage].items[this.state.currentItem];

    // check value
    currentItem.check = true;

    // move to next item
    this.incrementItem();

    // scroll
    this.focusOnItem();
  }

  focusOnItem() {
    if (this.state.currentItem === 0) {
      this.scrollIntoView();
      return;
    }
    const selected = this.checklistItems[this.state.currentItem];
    let next = selected.nextElementSibling;

    if (!next) {
      next = this.checklistItems[0];
    }

    if (
      next.offsetTop + next.offsetHeight >
        this.checklistContainer.offsetHeight ||
      next.offsetTop < this.checklistContainer.scrollTop
    ) {
      if (this.state.currentItem) {
        this.checklistContainer.scrollTop = next.offsetTop;
      }
    }

    // const position = selected.getBoundingClientRect().top;
    // console.log(position);
    // if (position > this.scrollThres) {
    //   this.checklistItems[this.state.currentItem].scrollIntoView();
    // }
  }

  handleLeftRight() {
    if (this.simvar.joy.leftRight === 0) {
      // left
      this.decrementPage();
    } else if (this.simvar.joy.leftRight === 2) {
      // right
      this.incrementPage();
    }
  }

  handleDownUp() {
    if (this.simvar.joy.downUp === 0) {
      // Up
      console.log("Joy DOWN");
    } else if (this.simvar.joy.downUp === 2) {
      // Down
      console.log("Joy UP");
    }
  }
}

customElements.define("checklist-page", Checklist);
checkAutoload();
