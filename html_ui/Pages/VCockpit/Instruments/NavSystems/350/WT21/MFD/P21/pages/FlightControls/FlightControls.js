class FlightControlsPage extends TemplateElement {
  constructor() {
    super();
    this.simvar = {};
    this.config = {};

    // config -- ref: flight_model.cfg
    this.config.elevator_up_limit = 15;
    this.config.elevator_down_limit = 25;
    this.config.aileron_up_limit = 15;
    this.config.aileron_down_limit = 25;
    this.config.rudder_limit = 30;
    this.config.spoiler_limit = 40;
    this.config.spoiler_handle_available = 1;
  }

  get templateID() {
    return "flight-controls-page-template";
  }

  get isInitialized() {
    return this.el ? true : false;
  }

  init() {
    this.el = document.getElementById(this.id);

    this.eicas = document.querySelector("#eicas-page");
    this.eicasMessages = {
      gndSpoilersOff: {
        message: "GND SPOILERS OFF",
        type: "normal",
      },
      pitchDisconnect: {
        message: "PITCH DISCONNECT",
        type: "normal",
      },
      rollDisconnect: {
        message: "ROLL DISCONNECT",
        type: "normal",
      },
      rollSpoilersOff: {
        message: "ROLL SPOILERS OFF",
        type: "normal",
      },
      rudInTest: {
        message: "RUD LIMITER IN TEST",
        type: "normal",
      },
      secStabTrimOn: {
        message: "SEC STAB TRIM ON",
        type: "normal",
      },
      stabTrimOff: {
        message: "STAB TRIM OFF",
        type: "normal",
      },
      stallPusherOff: {
        message: "STALL PUSHER OFF",
        type: "normal",
      },
    };

    // components
    this.fcWing = this.querySelector("#fc-wing");
    this.rudderGauge = this.querySelector("#rudder-gauge");
    this.elevatorLeft = this.querySelector("#elevator-left");
    this.elevatorRight = this.querySelector("#elevator-right");
    this.aileronLeft = this.querySelector("#aileron-left");
    this.aileronRight = this.querySelector("#aileron-right");
    this.spoilerLeft = this.querySelector("#spoiler-left");
    this.spoilerRight = this.querySelector("#spoiler-right");
    window.flightControls = this;

  }

  connectedCallback() {
    super.connectedCallback();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  getSimVars() {
    this.simvar = {
      rudder: SimVar.GetSimVarValue("RUDDER DEFLECTION", "degree"),
      elevator: {
        left: SimVar.GetSimVarValue("ELEVATOR DEFLECTION", "degree"),
        right: SimVar.GetSimVarValue("ELEVATOR DEFLECTION", "degree"),
      },
      aileron: {
        left: SimVar.GetSimVarValue(
          "AILERON LEFT DEFLECTION PCT",
          "percent over 100"
        ),
        right: SimVar.GetSimVarValue(
          "AILERON RIGHT DEFLECTION PCT",
          "percent over 100"
        ),
      },

      flaps: {
        left: SimVar.GetSimVarValue("TRAILING EDGE FLAPS LEFT ANGLE", "degrees"),
        right: SimVar.GetSimVarValue("TRAILING EDGE FLAPS RIGHT ANGLE", "degrees"),
        commanded: SimVar.GetSimVarValue("FLAPS HANDLE INDEX", "Number"),
      },
      spoiler: {
        handle: SimVar.GetSimVarValue(
          "SPOILERS HANDLE POSITION",
          "Percent Over 100"
        ),
        left: SimVar.GetSimVarValue(
          "SPOILERS LEFT POSITION",
          "Percent Over 100"
        ),
        right: SimVar.GetSimVarValue(
          "SPOILERS RIGHT POSITION",
          "Percent Over 100"
        ),

        rollLeft: SimVar.GetSimVarValue(
          "SPOILERONS LEFT POSITION",
          "Percent Over 100"
        ),
        rollRight: SimVar.GetSimVarValue(
          "SPOILERONS RIGHT POSITION",
          "Percent Over 100"
        ),
      },
    };
  }

  updateEicasMessages() {}

  Update() {
    if (!this.isInitialized) {
      this.init();
    } else {
      // if (!this.simvar) {
      // this.simvar = document.getElementById("simvar");
      // this.vars = this.simvar.vars.mfd.sys.electrical;
      // }
      this.updateEicasMessages();

      // Update components
      this.getSimVars();
      this.rudderGauge.Update(this.simvar.rudder);
      this.elevatorLeft.Update(this.simvar.elevator.left);
      this.elevatorRight.Update(this.simvar.elevator.right);
      this.aileronLeft.Update(this.simvar.aileron.left);
      this.aileronRight.Update(this.simvar.aileron.right);


      this.fcWing.Update(this.simvar.flaps);

      const minN1 = (typeof SpoilersGauge !== "undefined" && SpoilersGauge.N1_AVAILABLE_PCT) || 1;

      const spoilersAvailable = {
        1: SimVar.GetSimVarValue("TURB ENG N1:1", "percent"),
        2: SimVar.GetSimVarValue("TURB ENG N1:2", "percent"),
      };

      const onGround = !!SimVar.GetSimVarValue("SIM ON GROUND", "Bool");
      this.spoilerLeft.Update(
        this.simvar.spoiler.left,
        this.simvar.spoiler.rollLeft,
        spoilersAvailable,
        onGround
      );
      this.spoilerRight.Update(
        this.simvar.spoiler.right,
        this.simvar.spoiler.rollRight,
        spoilersAvailable,
        onGround
      );
    }
  }
}

customElements.define("flight-controls-page", FlightControlsPage);
checkAutoload();
