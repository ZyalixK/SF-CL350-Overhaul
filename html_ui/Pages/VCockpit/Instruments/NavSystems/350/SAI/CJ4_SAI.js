class CJ4_SAI extends BaseAirliners {
    get templateID() { return "CJ4_SAI"; }
    connectedCallback() {
        super.connectedCallback();

        this.electricityElement = this.getChildById("Electricity");
        this.radioNav.init(NavMode.TWO_SLOTS);
        this.addIndependentElementContainer(new NavSystemElementContainer("Altimeter", "Altimeter", new CJ4_SAI_Altimeter()));
        this.addIndependentElementContainer(new NavSystemElementContainer("Airspeed", "Airspeed", new CJ4_SAI_Airspeed()));
        this.addIndependentElementContainer(new NavSystemElementContainer("Horizon", "Horizon", new CJ4_SAI_Attitude()));
        this.addIndependentElementContainer(new NavSystemElementContainer("Compass", "Compass", new CJ4_SAI_Compass()));
        this.addIndependentElementContainer(new NavSystemElementContainer("Barometer", "Barometer", new CJ4_SAI_Baro()));
    }

    onUpdate(_deltaTime) {
        super.onUpdate(_deltaTime);
        this.updateStandbyPower();
    }

    updateStandbyPower() {
        if (!this.electricityElement) {
            this.electricityElement = this.getChildById("Electricity");
            if (!this.electricityElement) {
                return;
            }
        }

        const powered = !!SimVar.GetSimVarValue("L:P21_X_STBY_BATT", "Number");
        diffAndSetAttribute(this.electricityElement, "state", powered ? "on" : "off");
    }
}

CJ4_SAI.STBY_CIRCUIT = 52;
CJ4_SAI.STBY_BATTERY = 3;
class CJ4_SAI_Airspeed extends NavSystemElement {
    constructor() {
        super();
    }
    init(root) {
        this.airspeedElement = this.gps.getChildById("Airspeed");
    }
    onEnter() {
    }
    isReady() {
        return true;
    }
    onUpdate(_deltaTime) {
        this.airspeedElement.update(_deltaTime);
    }
    onExit() {
    }
    onEvent(_event) {
    }
}
class CJ4_SAI_AirspeedIndicator extends HTMLElement {
    constructor() {
        super(...arguments);
        this.greenColor = "green";
        this.yellowColor = "yellow";
        this.redColor = "red";
        this.fontSize = 25;
        this.graduationScrollPosX = 0;
        this.graduationScrollPosY = 0;
        this.graduationSpacing = 24;
        this.graduationMinValue = 30;
        this.nbPrimaryGraduations = 11;
        this.nbSecondaryGraduations = 1;
        this.totalGraduations = this.nbPrimaryGraduations + ((this.nbPrimaryGraduations - 1) * this.nbSecondaryGraduations);
    }
    connectedCallback() {
        this.graduationScroller = new Avionics.Scroller(this.nbPrimaryGraduations, 20);
        this.cursorIntegrals = new Array();
        this.cursorIntegrals.push(new Avionics.AirspeedScroller(65, 100));
        this.cursorIntegrals.push(new Avionics.AirspeedScroller(65, 10));
        this.cursorDecimals = new Avionics.AirspeedScroller(30);
        this.construct();
    }
    construct() {
        Utils.RemoveAllChildren(this);
        this.rootSVG = document.createElementNS(Avionics.SVG.NS, "svg");
        diffAndSetAttribute(this.rootSVG, "id", "ViewBox");
        diffAndSetAttribute(this.rootSVG, "viewBox", "0 0 250 500");
        var width = 40;
        var height = 196;
        var posX = width * 0.5;
        var posY = 27;
        if (!this.rootGroup) {
            this.rootGroup = document.createElementNS(Avionics.SVG.NS, "g");
            diffAndSetAttribute(this.rootGroup, "id", "Airspeed");
        }
        else {
            Utils.RemoveAllChildren(this.rootGroup);
        }
        if (!this.centerSVG) {
            this.centerSVG = document.createElementNS(Avionics.SVG.NS, "svg");
            diffAndSetAttribute(this.centerSVG, "id", "CenterGroup");
        }
        else
            Utils.RemoveAllChildren(this.centerSVG);
        diffAndSetAttribute(this.centerSVG, "x", (posX - width * 0.5) + '');
        diffAndSetAttribute(this.centerSVG, "y", posY + '');
        diffAndSetAttribute(this.centerSVG, "width", width + '');
        diffAndSetAttribute(this.centerSVG, "height", height + '');
        diffAndSetAttribute(this.centerSVG, "viewBox", "0 0 " + width + " " + height);
        {
            var _top = 0;
            var _left = 0;
            var _width = width;
            var _height = height;
            var bg = document.createElementNS(Avionics.SVG.NS, "rect");
            diffAndSetAttribute(bg, "x", _left + '');
            diffAndSetAttribute(bg, "y", _top + '');
            diffAndSetAttribute(bg, "width", _width + '');
            diffAndSetAttribute(bg, "height", _height + '');
            diffAndSetAttribute(bg, "fill", "#0e0d08");
            this.centerSVG.appendChild(bg);
            if (this.airspeeds) {
                var arcGroup = document.createElementNS(Avionics.SVG.NS, "g");
                diffAndSetAttribute(arcGroup, "id", "Arcs");
                {
                    this.arcs = [];
                    var _arcWidth = 18;
                    var _arcPosX = _left + _width + 3;
                    var _arcStartPosY = _top + _height * 0.5;
                    var arcHeight = this.arcToSVG(this.airspeeds.greenEnd - this.airspeeds.greenStart);
                    var arcPosY = _arcStartPosY - this.arcToSVG(this.airspeeds.greenStart) - arcHeight;
                    var arc = document.createElementNS(Avionics.SVG.NS, "rect");
                    diffAndSetAttribute(arc, "x", _arcPosX + '');
                    diffAndSetAttribute(arc, "y", arcPosY + '');
                    diffAndSetAttribute(arc, "width", _arcWidth + '');
                    diffAndSetAttribute(arc, "height", arcHeight + '');
                    diffAndSetAttribute(arc, "fill", this.greenColor);
                    this.arcs.push(arc);
                    var arcHeight = this.arcToSVG(this.airspeeds.yellowEnd - this.airspeeds.yellowStart);
                    var arcPosY = _arcStartPosY - this.arcToSVG(this.airspeeds.yellowStart) - arcHeight;
                    var arc = document.createElementNS(Avionics.SVG.NS, "rect");
                    diffAndSetAttribute(arc, "x", _arcPosX + '');
                    diffAndSetAttribute(arc, "y", arcPosY + '');
                    diffAndSetAttribute(arc, "width", _arcWidth + '');
                    diffAndSetAttribute(arc, "height", arcHeight + '');
                    diffAndSetAttribute(arc, "fill", this.yellowColor);
                    this.arcs.push(arc);
                    var arcHeight = this.arcToSVG(this.airspeeds.redEnd - this.airspeeds.redStart);
                    var arcPosY = _arcStartPosY - this.arcToSVG(this.airspeeds.redStart) - arcHeight;
                    var arc = document.createElementNS(Avionics.SVG.NS, "rect");
                    diffAndSetAttribute(arc, "x", _arcPosX + '');
                    diffAndSetAttribute(arc, "y", arcPosY + '');
                    diffAndSetAttribute(arc, "width", _arcWidth + '');
                    diffAndSetAttribute(arc, "height", arcHeight + '');
                    diffAndSetAttribute(arc, "fill", this.redColor);
                    this.arcs.push(arc);
                    var arcHeight = this.arcToSVG(this.airspeeds.whiteEnd - this.airspeeds.whiteStart);
                    var arcPosY = _arcStartPosY - this.arcToSVG(this.airspeeds.whiteStart) - arcHeight;
                    var arc = document.createElementNS(Avionics.SVG.NS, "rect");
                    diffAndSetAttribute(arc, "x", (_arcPosX + _arcWidth * 0.5) + '');
                    diffAndSetAttribute(arc, "y", arcPosY + '');
                    diffAndSetAttribute(arc, "width", (_arcWidth * 0.5) + '');
                    diffAndSetAttribute(arc, "height", arcHeight + '');
                    diffAndSetAttribute(arc, "fill", "white");
                    this.arcs.push(arc);
                    for (var i = 0; i < this.arcs.length; i++) {
                        arcGroup.appendChild(this.arcs[i]);
                    }
                    this.centerSVG.appendChild(arcGroup);
                }
            }
            var graduationGroup = document.createElementNS(Avionics.SVG.NS, "g");
            diffAndSetAttribute(graduationGroup, "id", "Graduations");
            {
                this.graduationScrollPosX = _left + _width;
                this.graduationScrollPosY = _top + _height * 0.5;
                this.graduations = [];
                for (var i = 0; i < this.totalGraduations; i++) {
                    var line = new Avionics.SVGGraduation();
                    line.IsPrimary = (i % (this.nbSecondaryGraduations + 1)) ? false : true;
                    var lineWidth = line.IsPrimary ? 8 : 5;
                    var lineHeight = line.IsPrimary ? 2 : 2;
                    var linePosX = -lineWidth;
                    line.SVGLine = document.createElementNS(Avionics.SVG.NS, "rect");
                    diffAndSetAttribute(line.SVGLine, "x", linePosX + '');
                    diffAndSetAttribute(line.SVGLine, "width", lineWidth + '');
                    diffAndSetAttribute(line.SVGLine, "height", lineHeight + '');
                    diffAndSetAttribute(line.SVGLine, "fill", "white");
                    if (line.IsPrimary) {
                        line.SVGText1 = document.createElementNS(Avionics.SVG.NS, "text");
                        diffAndSetAttribute(line.SVGText1, "x", (linePosX - 2) + '');
                        diffAndSetAttribute(line.SVGText1, "fill", "white");
                        diffAndSetAttribute(line.SVGText1, "font-size", (this.fontSize * 0.65) + '');
                        diffAndSetAttribute(line.SVGText1, "font-family", "Roboto-Bold");
                        diffAndSetAttribute(line.SVGText1, "text-anchor", "end");
                        diffAndSetAttribute(line.SVGText1, "alignment-baseline", "central");
                    }
                    this.graduations.push(line);
                }
                for (var i = 0; i < this.totalGraduations; i++) {
                    var line = this.graduations[i];
                    graduationGroup.appendChild(line.SVGLine);
                    if (line.SVGText1) {
                        graduationGroup.appendChild(line.SVGText1);
                    }
                }
                this.centerSVG.appendChild(graduationGroup);
            }
            var cursorPosX = _left - 13;
            var cursorPosY = _top + 2 + _height * 0.5;
            var cursorWidth = _width + 13;
            var cursorHeight = 38;
            if (!this.cursorSVG) {
                this.cursorSVG = document.createElementNS(Avionics.SVG.NS, "svg");
                diffAndSetAttribute(this.cursorSVG, "id", "CursorGroup");
            }
            else
                Utils.RemoveAllChildren(this.cursorSVG);
            diffAndSetAttribute(this.cursorSVG, "x", cursorPosX + '');
            diffAndSetAttribute(this.cursorSVG, "y", (cursorPosY - cursorHeight * 0.5) + '');
            diffAndSetAttribute(this.cursorSVG, "width", cursorWidth + '');
            diffAndSetAttribute(this.cursorSVG, "height", cursorHeight + '');
            diffAndSetAttribute(this.cursorSVG, "viewBox", "0 4 " + cursorWidth + " " + cursorHeight);
            {
                let _scale = 0.6;
                var trs = document.createElementNS(Avionics.SVG.NS, "g");
                diffAndSetAttribute(trs, "transform", "scale(" + _scale + ")");
                this.cursorSVG.appendChild(trs);
                if (!this.cursorSVGShape)
                    this.cursorSVGShape = document.createElementNS(Avionics.SVG.NS, "path");
                diffAndSetAttribute(this.cursorSVGShape, "fill", "#0e0d08");
                diffAndSetAttribute(this.cursorSVGShape, "d", "M24 22 L62 22 L62 7 L86 7 L86 70 L62 70 L62 56 L24 56 Z");
                diffAndSetAttribute(this.cursorSVGShape, "stroke", "white");
                diffAndSetAttribute(this.cursorSVGShape, "stroke-width", "0.85");
                trs.appendChild(this.cursorSVGShape);
                var _cursorWidth = (cursorWidth / _scale);
                var _cursorHeight = (cursorHeight / _scale + 10);
                var _cursorPosX = -2;
                var _cursorPosY = cursorHeight * 0.5 + 20;
                let integralsGroup = document.createElementNS(Avionics.SVG.NS, "svg");
                diffAndSetAttribute(integralsGroup, "x", "0");
                diffAndSetAttribute(integralsGroup, "y", "23");
                diffAndSetAttribute(integralsGroup, "width", _cursorWidth + '');
                diffAndSetAttribute(integralsGroup, "height", (_cursorHeight - 41) + '');
                diffAndSetAttribute(integralsGroup, "viewBox", "0 0 " + (_cursorWidth) + " " + (_cursorHeight));
                trs.appendChild(integralsGroup);
                {
                    this.cursorIntegrals[0].construct(integralsGroup, _cursorPosX + 50, _cursorPosY - 5, _width, "Roboto-Bold", this.fontSize * 3, "green");
                    this.cursorIntegrals[1].construct(integralsGroup, _cursorPosX + 92, _cursorPosY - 5, _width, "Roboto-Bold", this.fontSize * 3, "green");
                }
                this.cursorDecimals.construct(trs, _cursorPosX + 86, _cursorPosY - 1, _width, "Roboto-Bold", this.fontSize * 1.4, "green");
                this.centerSVG.appendChild(this.cursorSVG);
            }
        }
        this.rootGroup.appendChild(this.centerSVG);
        this.rootSVG.appendChild(this.rootGroup);
        this.appendChild(this.rootSVG);
    }
    update(dTime) {
        var indicatedSpeed = Simplane.getIndicatedSpeed();
        this.updateArcScrolling(indicatedSpeed);
        this.updateGraduationScrolling(indicatedSpeed);
        this.updateCursorScrolling(indicatedSpeed);
    }
    arcToSVG(_value) {
        var pixels = (_value * this.graduationSpacing * (this.nbSecondaryGraduations + 1)) / 10;
        return pixels;
    }
    updateGraduationScrolling(_speed) {
        if (this.graduations && this.graduationScroller.scroll(_speed)) {
            var currentVal = this.graduationScroller.firstValue;
            var currentY = this.graduationScrollPosY + this.graduationScroller.offsetY * this.graduationSpacing * (this.nbSecondaryGraduations + 1);
            for (var i = 0; i < this.totalGraduations; i++) {
                var posX = this.graduationScrollPosX;
                var posY = currentY;
                diffAndSetAttribute(this.graduations[i].SVGLine, "transform", "translate(" + posX + '' + " " + posY + '' + ")");
                if (this.graduations[i].SVGText1) {
                    if ((currentVal % 4) == 0)
                        diffAndSetText(this.graduations[i].SVGText1, currentVal + '');
                    else
                        diffAndSetText(this.graduations[i].SVGText1, "");
                    diffAndSetAttribute(this.graduations[i].SVGText1, "transform", "translate(" + posX + '' + " " + posY + '' + ")");
                    currentVal = this.graduationScroller.nextValue;
                }
                currentY -= this.graduationSpacing;
            }
        }
    }
    updateArcScrolling(_speed) {
        if (this.arcs) {
            var offset = this.arcToSVG(_speed);
            for (var i = 0; i < this.arcs.length; i++) {
                diffAndSetAttribute(this.arcs[i], "transform", "translate(0 " + offset + '' + ")");
            }
        }
    }
    updateCursorScrolling(_speed) {
        if (_speed <= this.graduationMinValue) {
            if (this.cursorIntegrals) {
                for (let i = 0; i < this.cursorIntegrals.length; i++) {
                    this.cursorIntegrals[i].clear("-");
                }
            }
            if (this.cursorDecimals) {
                this.cursorDecimals.clear("");
            }
        }
        else {
            if (this.cursorIntegrals) {
                this.cursorIntegrals[0].update(_speed, 100, 100);
                this.cursorIntegrals[1].update(_speed, 10, 10);
            }
            if (this.cursorDecimals) {
                this.cursorDecimals.update(_speed);
            }
        }
    }
}
customElements.define('cj4-sai-airspeed-indicator', CJ4_SAI_AirspeedIndicator);
class CJ4_SAI_Altimeter extends NavSystemElement {
    constructor() {
        super();
    }
    init(root) {
        this.altimeterElement = this.gps.getChildById("Altimeter");
    }
    onEnter() {
    }
    isReady() {
        return true;
        ;
    }
    onUpdate(_deltaTime) {
        this.altimeterElement.update(_deltaTime);
    }
    onExit() {
    }
    onEvent(_event) {
        switch (_event) {
            case "BARO_INC":
                SimVar.SetSimVarValue("K:KOHLSMAN_INC", "number", 1);
                break;
            case "BARO_DEC":
                SimVar.SetSimVarValue("K:KOHLSMAN_DEC", "number", 1);
                break;
        }
    }
}
class CJ4_SAI_AltimeterIndicator extends HTMLElement {
    constructor() {
        super(...arguments);
        this.fontSize = 25;
        this.graduationScrollPosX = 0;
        this.graduationScrollPosY = 0;
        this.nbPrimaryGraduations = 7;
        this.nbSecondaryGraduations = 4;
        this.totalGraduations = this.nbPrimaryGraduations + ((this.nbPrimaryGraduations - 1) * this.nbSecondaryGraduations);
        this.graduationSpacing = 22;
    }
    connectedCallback() {
        this.graduationScroller = new Avionics.Scroller(this.nbPrimaryGraduations, 500, true);
        this.cursorIntegrals = new Array();
        this.cursorIntegrals.push(new Avionics.AltitudeScroller(3, 68, 1, 10, 1000));
        this.cursorIntegrals.push(new Avionics.AltitudeScroller(3, 68, 1, 10, 100));
        this.cursorIntegrals.push(new Avionics.AltitudeScroller(3, 68, 1, 10, 10));
        this.cursorDecimals = new Avionics.AltitudeScroller(3, 28, 10, 100);
        this.construct();
    }
    construct() {
        Utils.RemoveAllChildren(this);
        this.rootSVG = document.createElementNS(Avionics.SVG.NS, "svg");
        diffAndSetAttribute(this.rootSVG, "id", "ViewBox");
        diffAndSetAttribute(this.rootSVG, "viewBox", "0 0 250 500");
        var width = 66;
        var height = 196;
        var posX = width * 0.5;
        var posY = 27;
        if (!this.rootGroup) {
            this.rootGroup = document.createElementNS(Avionics.SVG.NS, "g");
            diffAndSetAttribute(this.rootGroup, "id", "Altimeter");
        }
        else {
            Utils.RemoveAllChildren(this.rootGroup);
        }
        if (!this.centerSVG) {
            this.centerSVG = document.createElementNS(Avionics.SVG.NS, "svg");
            diffAndSetAttribute(this.centerSVG, "id", "CenterGroup");
        }
        else
            Utils.RemoveAllChildren(this.centerSVG);
        diffAndSetAttribute(this.centerSVG, "x", posX + '');
        diffAndSetAttribute(this.centerSVG, "y", posY + '');
        diffAndSetAttribute(this.centerSVG, "width", width + '');
        diffAndSetAttribute(this.centerSVG, "height", height + '');
        diffAndSetAttribute(this.centerSVG, "viewBox", "0 0 " + width + " " + height);
        diffAndSetAttribute(this.centerSVG, "overflow", "hidden");
        {
            var _top = 0;
            var _left = 0;
            var _width = width;
            var _height = height;
            var bg = document.createElementNS(Avionics.SVG.NS, "rect");
            diffAndSetAttribute(bg, "x", _left + '');
            diffAndSetAttribute(bg, "y", _top + '');
            diffAndSetAttribute(bg, "width", _width + '');
            diffAndSetAttribute(bg, "height", _height + '');
            diffAndSetAttribute(bg, "fill", "#0e0d08");
            this.centerSVG.appendChild(bg);
            if (!this.graduationBarSVG)
                this.graduationBarSVG = document.createElementNS(Avionics.SVG.NS, "path");
            diffAndSetAttribute(this.graduationBarSVG, "fill", "transparent");
            diffAndSetAttribute(this.graduationBarSVG, "d", "M0 0 l20 20 l0 70 l-20 20 l20 20 l0 70 l-20 20 l20 20 l0 70 l-20 20 l20 20 l0 70 l-20 20 l20 20 l0 70");
            diffAndSetAttribute(this.graduationBarSVG, "stroke", "white");
            diffAndSetAttribute(this.graduationBarSVG, "stroke-width", "0.85");
            this.centerSVG.appendChild(this.graduationBarSVG);
            this.graduationScrollPosX = _left;
            this.graduationScrollPosY = _top + _height * 0.5;
            this.graduations = [];
            for (var i = 0; i < this.totalGraduations; i++) {
                var line = new Avionics.SVGGraduation();
                line.IsPrimary = true;
                if (this.nbSecondaryGraduations > 0 && (i % (this.nbSecondaryGraduations + 1)))
                    line.IsPrimary = false;
                var lineWidth = line.IsPrimary ? 0 : 12;
                line.SVGLine = document.createElementNS(Avionics.SVG.NS, "rect");
                diffAndSetAttribute(line.SVGLine, "x", "0");
                diffAndSetAttribute(line.SVGLine, "width", lineWidth + '');
                diffAndSetAttribute(line.SVGLine, "height", "2");
                diffAndSetAttribute(line.SVGLine, "fill", "white");
                if (line.IsPrimary) {
                    line.SVGText1 = document.createElementNS(Avionics.SVG.NS, "text");
                    diffAndSetAttribute(line.SVGText1, "x", (lineWidth + 30) + '');
                    diffAndSetAttribute(line.SVGText1, "fill", "white");
                    diffAndSetAttribute(line.SVGText1, "font-size", (this.fontSize * 0.85) + '');
                    diffAndSetAttribute(line.SVGText1, "font-family", "Roboto-Light");
                    diffAndSetAttribute(line.SVGText1, "text-anchor", "end");
                    diffAndSetAttribute(line.SVGText1, "alignment-baseline", "central");
                    line.SVGText2 = document.createElementNS(Avionics.SVG.NS, "text");
                    diffAndSetAttribute(line.SVGText2, "x", (lineWidth + 30) + '');
                    diffAndSetAttribute(line.SVGText2, "fill", "white");
                    diffAndSetAttribute(line.SVGText2, "font-size", (this.fontSize * 0.6) + '');
                    diffAndSetAttribute(line.SVGText2, "font-family", "Roboto-Light");
                    diffAndSetAttribute(line.SVGText2, "text-anchor", "start");
                    diffAndSetAttribute(line.SVGText2, "alignment-baseline", "central");
                }
                this.graduations.push(line);
            }
            var graduationGroup = document.createElementNS(Avionics.SVG.NS, "g");
            diffAndSetAttribute(graduationGroup, "id", "graduationGroup");
            for (var i = 0; i < this.totalGraduations; i++) {
                var line = this.graduations[i];
                graduationGroup.appendChild(line.SVGLine);
                if (line.SVGText1)
                    graduationGroup.appendChild(line.SVGText1);
                if (line.SVGText2)
                    graduationGroup.appendChild(line.SVGText2);
            }
            this.centerSVG.appendChild(graduationGroup);
        }
        this.rootGroup.appendChild(this.centerSVG);
        var cursorPosX = _left + 20;
        var cursorPosY = _top + 30 + _height * 0.5;
        var cursorWidth = width * 1.1;
        var cursorHeight = 39;
        if (!this.cursorSVG) {
            this.cursorSVG = document.createElementNS(Avionics.SVG.NS, "svg");
            diffAndSetAttribute(this.cursorSVG, "id", "CursorGroup");
        }
        else
            Utils.RemoveAllChildren(this.cursorSVG);
        diffAndSetAttribute(this.cursorSVG, "x", cursorPosX + '');
        diffAndSetAttribute(this.cursorSVG, "y", (cursorPosY - cursorHeight * 0.5) + '');
        diffAndSetAttribute(this.cursorSVG, "width", cursorWidth + '');
        diffAndSetAttribute(this.cursorSVG, "height", cursorHeight + '');
        diffAndSetAttribute(this.cursorSVG, "viewBox", "0 4 " + cursorWidth + " " + cursorHeight);
        {
            let _scale = 0.6;
            var trs = document.createElementNS(Avionics.SVG.NS, "g");
            diffAndSetAttribute(trs, "transform", "scale(" + _scale + ")");
            this.cursorSVG.appendChild(trs);
            if (!this.cursorSVGShape)
                this.cursorSVGShape = document.createElementNS(Avionics.SVG.NS, "path");
            diffAndSetAttribute(this.cursorSVGShape, "fill", "#0e0d08");
            diffAndSetAttribute(this.cursorSVGShape, "d", "M0 22 L65 22 L65 7 L120 7 L120 71 L65 71 L65 56 L0 56 Z");
            diffAndSetAttribute(this.cursorSVGShape, "stroke", "white");
            diffAndSetAttribute(this.cursorSVGShape, "stroke-width", "0.85");
            trs.appendChild(this.cursorSVGShape);
            var _cursorWidth = (cursorWidth / _scale);
            var _cursorHeight = (cursorHeight / _scale + 10);
            var _cursorPosX = 0;
            var _cursorPosY = _cursorHeight * 0.5;
            let integralsGroup = document.createElementNS(Avionics.SVG.NS, "svg");
            diffAndSetAttribute(integralsGroup, "x", "0");
            diffAndSetAttribute(integralsGroup, "y", "23");
            diffAndSetAttribute(integralsGroup, "width", _cursorWidth + '');
            diffAndSetAttribute(integralsGroup, "height", (_cursorHeight - 43) + '');
            diffAndSetAttribute(integralsGroup, "viewBox", "0 0 " + (_cursorWidth) + " " + (_cursorHeight));
            trs.appendChild(integralsGroup);
            {
                this.cursorIntegrals[0].construct(integralsGroup, _cursorPosX - 22, _cursorPosY - 2, _width, "Roboto-Bold", this.fontSize * 3, "green");
                this.cursorIntegrals[1].construct(integralsGroup, _cursorPosX + 24, _cursorPosY - 2, _width, "Roboto-Bold", this.fontSize * 3, "green");
                this.cursorIntegrals[2].construct(integralsGroup, _cursorPosX + 70, _cursorPosY - 2, _width, "Roboto-Bold", this.fontSize * 3, "green");
            }
            this.cursorDecimals.construct(trs, _cursorPosX + 113, _cursorPosY, _width, "Roboto-Bold", this.fontSize * 1.4, "green");
            this.rootGroup.appendChild(this.cursorSVG);
        }
        this.rootSVG.appendChild(this.rootGroup);
        this.appendChild(this.rootSVG);
    }
    update(_dTime) {
        var altitude = SimVar.GetSimVarValue("INDICATED ALTITUDE:2", "feet");
        this.updateGraduationScrolling(altitude);
        this.updateCursorScrolling(altitude);
        this.updateBaroPressure();
    }
    updateBaroPressure() {
        if (this.pressureSVG) {
            var pressure = SimVar.GetSimVarValue("KOHLSMAN SETTING HG:2", "inches of mercury");
            diffAndSetText(this.pressureSVG, fastToFixed(pressure, 2) + " in");
        }
    }
    updateGraduationScrolling(_altitude) {
        if (this.graduations && this.graduationScroller.scroll(_altitude)) {
            var currentVal = this.graduationScroller.firstValue;
            var currentY = this.graduationScrollPosY + this.graduationScroller.offsetY * this.graduationSpacing * (this.nbSecondaryGraduations + 1);
            var firstRoundValueY = currentY;
            for (var i = 0; i < this.totalGraduations; i++) {
                var posX = this.graduationScrollPosX;
                var posY = Math.round(currentY);
                diffAndSetAttribute(this.graduations[i].SVGLine, "transform", "translate(" + posX + '' + " " + posY + '' + ")");
                if (this.graduations[i].SVGText1) {
                    var roundedVal = 0;
                    roundedVal = Math.floor(Math.abs(currentVal));
                    var integral = Math.floor(roundedVal / 1000);
                    var modulo = Math.floor(roundedVal - (integral * 1000));
                    diffAndSetText(this.graduations[i].SVGText1, integral + '');
                    diffAndSetText(this.graduations[i].SVGText2, Utils.leadingZeros(modulo, 3));
                    diffAndSetAttribute(this.graduations[i].SVGText1, "transform", "translate(" + posX + '' + " " + posY + '' + ")");
                    if (this.graduations[i].SVGText2)
                        diffAndSetAttribute(this.graduations[i].SVGText2, "transform", "translate(" + posX + '' + " " + posY + '' + ")");
                    firstRoundValueY = posY;
                    currentVal = this.graduationScroller.nextValue;
                }
                currentY -= this.graduationSpacing;
            }
            if (this.graduationBarSVG) {
                diffAndSetAttribute(this.graduationBarSVG, "transform", "translate(0 " + firstRoundValueY + ")");
            }
        }
    }
    updateCursorScrolling(_altitude) {
        if (this.cursorIntegrals) {
            this.cursorIntegrals[0].update(_altitude, 10000, 10000);
            this.cursorIntegrals[1].update(_altitude, 1000, 1000);
            this.cursorIntegrals[2].update(_altitude, 100);
        }
        if (this.cursorDecimals) {
            this.cursorDecimals.update(_altitude);
        }
    }
}
customElements.define('cj4-sai-altimeter-indicator', CJ4_SAI_AltimeterIndicator);
class CJ4_SAI_Attitude extends NavSystemElement {
    init(root) {
        this.attitudeElement = this.gps.getChildById("Horizon");
        diffAndSetAttribute(this.attitudeElement, "is-backup", "true");
        if (this.gps) {
            var aspectRatio = this.gps.getAspectRatio();
            diffAndSetAttribute(this.attitudeElement, "aspect-ratio", aspectRatio + '');
        }
    }
    onEnter() {
    }
    onUpdate(_deltaTime) {
        var xyz = Simplane.getOrientationAxis();
        if (xyz) {
            diffAndSetAttribute(this.attitudeElement, "pitch", (xyz.pitch / Math.PI * 180) + '');
            diffAndSetAttribute(this.attitudeElement, "bank", (xyz.bank / Math.PI * 180) + '');
            diffAndSetAttribute(this.attitudeElement, "slip_skid", Simplane.getInclinometer() + '');
        }
    }
    onExit() {
    }
    onEvent(_event) {
    }
}
class CJ4_SAI_AttitudeIndicator extends HTMLElement {
    constructor() {
        super();
        this.backgroundVisible = true;
        this.bankSizeRatio = -7;
        this.bankSizeRatioFactor = 1.0;
    }
    static get observedAttributes() {
        return [
            "pitch",
            "bank",
            "slip_skid",
            "background",
        ];
    }
    connectedCallback() {
        this.construct();
    }
    construct() {
        Utils.RemoveAllChildren(this);
        this.bankSizeRatioFactor = 0.60;
        {
            this.horizon_root = document.createElementNS(Avionics.SVG.NS, "svg");
            diffAndSetAttribute(this.horizon_root, "width", "100%");
            diffAndSetAttribute(this.horizon_root, "height", "100%");
            diffAndSetAttribute(this.horizon_root, "viewBox", "-200 -200 400 300");
            diffAndSetAttribute(this.horizon_root, "x", "-100");
            diffAndSetAttribute(this.horizon_root, "y", "-100");
            diffAndSetAttribute(this.horizon_root, "overflow", "visible");
            diffAndSetAttribute(this.horizon_root, "style", "position:absolute; z-index: -3; width: 100%; height:100%;");
            diffAndSetAttribute(this.horizon_root, "transform", "translate(0, 100)");
            this.appendChild(this.horizon_root);
            this.horizonTopColor = "#045CEB";
            this.horizonBottomColor = "#9E6345";
            this.horizonTop = document.createElementNS(Avionics.SVG.NS, "rect");
            diffAndSetAttribute(this.horizonTop, "fill", (this.backgroundVisible) ? this.horizonTopColor : "transparent");
            diffAndSetAttribute(this.horizonTop, "x", "-1000");
            diffAndSetAttribute(this.horizonTop, "y", "-1000");
            diffAndSetAttribute(this.horizonTop, "width", "2000");
            diffAndSetAttribute(this.horizonTop, "height", "2000");
            this.horizon_root.appendChild(this.horizonTop);
            this.bottomPart = document.createElementNS(Avionics.SVG.NS, "g");
            this.horizon_root.appendChild(this.bottomPart);
            this.horizonBottom = document.createElementNS(Avionics.SVG.NS, "rect");
            diffAndSetAttribute(this.horizonBottom, "fill", (this.backgroundVisible) ? this.horizonBottomColor : "transparent");
            diffAndSetAttribute(this.horizonBottom, "x", "-1500");
            diffAndSetAttribute(this.horizonBottom, "y", "0");
            diffAndSetAttribute(this.horizonBottom, "width", "3000");
            diffAndSetAttribute(this.horizonBottom, "height", "3000");
            this.bottomPart.appendChild(this.horizonBottom);
            let separator = document.createElementNS(Avionics.SVG.NS, "rect");
            diffAndSetAttribute(separator, "fill", "#e0e0e0");
            diffAndSetAttribute(separator, "x", "-1500");
            diffAndSetAttribute(separator, "y", "-3");
            diffAndSetAttribute(separator, "width", "3000");
            diffAndSetAttribute(separator, "height", "6");
            this.bottomPart.appendChild(separator);
        }
        {
            let pitchContainer = document.createElement("div");
            diffAndSetAttribute(pitchContainer, "id", "Pitch");
            pitchContainer.style.top = "-15.5%";
            pitchContainer.style.left = "-10%";
            pitchContainer.style.width = "120%";
            pitchContainer.style.height = "120%";
            pitchContainer.style.position = "absolute";
            pitchContainer.style.transform = "scale(1.4)";
            this.appendChild(pitchContainer);
            this.pitch_root = document.createElementNS(Avionics.SVG.NS, "svg");
            diffAndSetAttribute(this.pitch_root, "width", "100%");
            diffAndSetAttribute(this.pitch_root, "height", "100%");
            diffAndSetAttribute(this.pitch_root, "viewBox", "-200 -200 400 300");
            diffAndSetAttribute(this.pitch_root, "overflow", "visible");
            diffAndSetAttribute(this.pitch_root, "style", "position:absolute; z-index: -2;");
            pitchContainer.appendChild(this.pitch_root);
            {
                this.pitch_root_group = document.createElementNS(Avionics.SVG.NS, "g");
                this.pitch_root.appendChild(this.pitch_root_group);
                var x = -115;
                var y = -122;
                var w = 230;
                var h = 250;
                let attitudePitchContainer = document.createElementNS(Avionics.SVG.NS, "svg");
                diffAndSetAttribute(attitudePitchContainer, "width", w + '');
                diffAndSetAttribute(attitudePitchContainer, "height", h + '');
                diffAndSetAttribute(attitudePitchContainer, "x", x + '');
                diffAndSetAttribute(attitudePitchContainer, "y", y + '');
                diffAndSetAttribute(attitudePitchContainer, "viewBox", x + " " + y + " " + w + " " + h);
                diffAndSetAttribute(attitudePitchContainer, "overflow", "hidden");
                this.pitch_root_group.appendChild(attitudePitchContainer);
                {
                    this.attitude_pitch = document.createElementNS(Avionics.SVG.NS, "g");
                    attitudePitchContainer.appendChild(this.attitude_pitch);
                    let maxDash = 80;
                    let fullPrecisionLowerLimit = -20;
                    let fullPrecisionUpperLimit = 20;
                    let halfPrecisionLowerLimit = -30;
                    let halfPrecisionUpperLimit = 45;
                    let unusualAttitudeLowerLimit = -30;
                    let unusualAttitudeUpperLimit = 50;
                    let bigWidth = 120;
                    let bigHeight = 3;
                    let mediumWidth = 52.5;
                    let mediumHeight = 3;
                    let smallWidth = 30;
                    let smallHeight = 2;
                    let fontSize = 20;
                    let angle = -maxDash;
                    let nextAngle;
                    let width;
                    let height;
                    let text;
                    while (angle <= maxDash) {
                        if (angle % 10 == 0) {
                            width = bigWidth;
                            height = bigHeight;
                            text = true;
                            if (angle >= fullPrecisionLowerLimit && angle < fullPrecisionUpperLimit) {
                                nextAngle = angle + 2.5;
                            }
                            else if (angle >= halfPrecisionLowerLimit && angle < halfPrecisionUpperLimit) {
                                nextAngle = angle + 5;
                            }
                            else {
                                nextAngle = angle + 10;
                            }
                        }
                        else {
                            if (angle % 5 == 0) {
                                width = mediumWidth;
                                height = mediumHeight;
                                text = false;
                                if (angle >= fullPrecisionLowerLimit && angle < fullPrecisionUpperLimit) {
                                    nextAngle = angle + 2.5;
                                }
                                else {
                                    nextAngle = angle + 5;
                                }
                            }
                            else {
                                width = smallWidth;
                                height = smallHeight;
                                nextAngle = angle + 2.5;
                                text = false;
                            }
                        }
                        if (angle != 0) {
                            let rect = document.createElementNS(Avionics.SVG.NS, "rect");
                            diffAndSetAttribute(rect, "fill", "white");
                            diffAndSetAttribute(rect, "x", (-width / 2) + '');
                            diffAndSetAttribute(rect, "y", (this.bankSizeRatio * angle - height / 2) + '');
                            diffAndSetAttribute(rect, "width", width + '');
                            diffAndSetAttribute(rect, "height", height + '');
                            this.attitude_pitch.appendChild(rect);
                            if (text) {
                                let leftText = document.createElementNS(Avionics.SVG.NS, "text");
                                diffAndSetText(leftText, Math.abs(angle) + '');
                                diffAndSetAttribute(leftText, "x", ((-width / 2) - 5) + '');
                                diffAndSetAttribute(leftText, "y", (this.bankSizeRatio * angle - height / 2 + fontSize / 2) + '');
                                diffAndSetAttribute(leftText, "text-anchor", "end");
                                diffAndSetAttribute(leftText, "font-size", fontSize + '');
                                diffAndSetAttribute(leftText, "font-family", "Roboto-Light");
                                diffAndSetAttribute(leftText, "fill", "white");
                                this.attitude_pitch.appendChild(leftText);
                                let rightText = document.createElementNS(Avionics.SVG.NS, "text");
                                diffAndSetText(rightText, Math.abs(angle) + '');
                                diffAndSetAttribute(rightText, "x", ((width / 2) + 5) + '');
                                diffAndSetAttribute(rightText, "y", (this.bankSizeRatio * angle - height / 2 + fontSize / 2) + '');
                                diffAndSetAttribute(rightText, "text-anchor", "start");
                                diffAndSetAttribute(rightText, "font-size", fontSize + '');
                                diffAndSetAttribute(rightText, "font-family", "Roboto-Light");
                                diffAndSetAttribute(rightText, "fill", "white");
                                this.attitude_pitch.appendChild(rightText);
                            }
                            if (angle < unusualAttitudeLowerLimit) {
                                let chevron = document.createElementNS(Avionics.SVG.NS, "path");
                                let path = "M" + -smallWidth / 2 + " " + (this.bankSizeRatio * nextAngle - bigHeight / 2) + " l" + smallWidth + "  0 ";
                                path += "L" + bigWidth / 2 + " " + (this.bankSizeRatio * angle - bigHeight / 2) + " l" + -smallWidth + " 0 ";
                                path += "L0 " + (this.bankSizeRatio * nextAngle + 20) + " ";
                                path += "L" + (-bigWidth / 2 + smallWidth) + " " + (this.bankSizeRatio * angle - bigHeight / 2) + " l" + -smallWidth + " 0 Z";
                                diffAndSetAttribute(chevron, "d", path);
                                diffAndSetAttribute(chevron, "fill", "red");
                                this.attitude_pitch.appendChild(chevron);
                            }
                            if (angle >= unusualAttitudeUpperLimit && nextAngle <= maxDash) {
                                let chevron = document.createElementNS(Avionics.SVG.NS, "path");
                                let path = "M" + -smallWidth / 2 + " " + (this.bankSizeRatio * angle - bigHeight / 2) + " l" + smallWidth + "  0 ";
                                path += "L" + (bigWidth / 2) + " " + (this.bankSizeRatio * nextAngle + bigHeight / 2) + " l" + -smallWidth + " 0 ";
                                path += "L0 " + (this.bankSizeRatio * angle - 20) + " ";
                                path += "L" + (-bigWidth / 2 + smallWidth) + " " + (this.bankSizeRatio * nextAngle + bigHeight / 2) + " l" + -smallWidth + " 0 Z";
                                diffAndSetAttribute(chevron, "d", path);
                                diffAndSetAttribute(chevron, "fill", "red");
                                this.attitude_pitch.appendChild(chevron);
                            }
                        }
                        angle = nextAngle;
                    }
                }
            }
        }
        {
            let attitudeContainer = document.createElement("div");
            diffAndSetAttribute(attitudeContainer, "id", "Attitude");
            attitudeContainer.style.top = "-15.5%";
            attitudeContainer.style.left = "-10%";
            attitudeContainer.style.width = "120%";
            attitudeContainer.style.height = "120%";
            attitudeContainer.style.position = "absolute";
            attitudeContainer.style.transform = "scale(1.4)";
            this.appendChild(attitudeContainer);
            this.attitude_root = document.createElementNS(Avionics.SVG.NS, "svg");
            diffAndSetAttribute(this.attitude_root, "width", "100%");
            diffAndSetAttribute(this.attitude_root, "height", "100%");
            diffAndSetAttribute(this.attitude_root, "viewBox", "-200 -200 400 300");
            diffAndSetAttribute(this.attitude_root, "overflow", "visible");
            diffAndSetAttribute(this.attitude_root, "style", "position:absolute; z-index: 0");
            attitudeContainer.appendChild(this.attitude_root);
            {
                this.attitude_bank = document.createElementNS(Avionics.SVG.NS, "g");
                this.attitude_root.appendChild(this.attitude_bank);
                let topTriangle = document.createElementNS(Avionics.SVG.NS, "path");
                diffAndSetAttribute(topTriangle, "d", "M0 -180 l-7.5 -10 l15 0 Z");
                diffAndSetAttribute(topTriangle, "fill", "#0e0d08");
                diffAndSetAttribute(topTriangle, "stroke", "white");
                diffAndSetAttribute(topTriangle, "stroke-width", "1");
                diffAndSetAttribute(topTriangle, "stroke-opacity", "1");
                this.attitude_bank.appendChild(topTriangle);
                let smallDashesAngle = [-50, -40, -30, -20, -10, 10, 20, 30, 40, 50];
                let smallDashesHeight = [18, 18, 18, 11, 11, 11, 11, 18, 18, 18];
                let radius = 175;
                for (let i = 0; i < smallDashesAngle.length; i++) {
                    let dash = document.createElementNS(Avionics.SVG.NS, "line");
                    diffAndSetAttribute(dash, "x1", "0");
                    diffAndSetAttribute(dash, "y1", (-radius) + '');
                    diffAndSetAttribute(dash, "x2", "0");
                    diffAndSetAttribute(dash, "y2", (-radius - smallDashesHeight[i]) + '');
                    diffAndSetAttribute(dash, "fill", "none");
                    diffAndSetAttribute(dash, "stroke", "white");
                    diffAndSetAttribute(dash, "stroke-width", "2");
                    diffAndSetAttribute(dash, "transform", "rotate(" + smallDashesAngle[i] + ",0,0)");
                    this.attitude_bank.appendChild(dash);
                }
            }
            {
                let cursors = document.createElementNS(Avionics.SVG.NS, "g");
                this.attitude_root.appendChild(cursors);
                let leftUpper = document.createElementNS(Avionics.SVG.NS, "path");
                diffAndSetAttribute(leftUpper, "d", "M-90 5 h 50 v 20 h 10 v -32 h -60 Z");
                diffAndSetAttribute(leftUpper, "fill", "#0e0d08");
                diffAndSetAttribute(leftUpper, "stroke", "white");
                diffAndSetAttribute(leftUpper, "stroke-width", "2.0");
                diffAndSetAttribute(leftUpper, "stroke-opacity", "1.0");
                cursors.appendChild(leftUpper);
                let rightUpper = document.createElementNS(Avionics.SVG.NS, "path");
                diffAndSetAttribute(rightUpper, "d", "M90 5 h -50 v 20 h -10 v -32 h 60 Z");
                diffAndSetAttribute(rightUpper, "fill", "#0e0d08");
                diffAndSetAttribute(rightUpper, "stroke", "white");
                diffAndSetAttribute(rightUpper, "stroke-width", "2.0");
                diffAndSetAttribute(rightUpper, "stroke-opacity", "1.0");
                cursors.appendChild(rightUpper);
                let centerRect = document.createElementNS(Avionics.SVG.NS, "rect");
                diffAndSetAttribute(centerRect, "x", "-6");
                diffAndSetAttribute(centerRect, "y", "-6");
                diffAndSetAttribute(centerRect, "height", "12");
                diffAndSetAttribute(centerRect, "width", "12");
                diffAndSetAttribute(centerRect, "stroke", "white");
                diffAndSetAttribute(centerRect, "stroke-width", "4");
                cursors.appendChild(centerRect);
                this.slipSkidTriangle = document.createElementNS(Avionics.SVG.NS, "path");
                diffAndSetAttribute(this.slipSkidTriangle, "d", "M0 -170 l-13 20 l26 0 Z");
                diffAndSetAttribute(this.slipSkidTriangle, "fill", "#0e0d08");
                diffAndSetAttribute(this.slipSkidTriangle, "stroke", "white");
                this.attitude_root.appendChild(this.slipSkidTriangle);
                this.slipSkid = document.createElementNS(Avionics.SVG.NS, "path");
                diffAndSetAttribute(this.slipSkid, "d", "M-20 -140 L-16 -146 L16 -146 L20 -140 Z");
                diffAndSetAttribute(this.slipSkid, "fill", "#0e0d08");
                diffAndSetAttribute(this.slipSkid, "stroke", "white");
                this.attitude_root.appendChild(this.slipSkid);
            }
        }
        this.applyAttributes();
    }
    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue == newValue)
            return;
        switch (name) {
            case "pitch":
                this.pitch = parseFloat(newValue);
                break;
            case "bank":
                this.bank = parseFloat(newValue);
                break;
            case "slip_skid":
                this.slipSkidValue = parseFloat(newValue);
                break;
            case "background":
                if (newValue == "false")
                    this.backgroundVisible = false;
                else
                    this.backgroundVisible = true;
                break;
            default:
                return;
        }
        this.applyAttributes();
    }
    applyAttributes() {
        if (this.bottomPart)
            diffAndSetAttribute(this.bottomPart, "transform", "rotate(" + this.bank + ", 0, 0) translate(0," + (this.pitch * this.bankSizeRatio) + ")");
        if (this.pitch_root_group)
            diffAndSetAttribute(this.pitch_root_group, "transform", "rotate(" + this.bank + ", 0, 0)");
        if (this.attitude_pitch)
            diffAndSetAttribute(this.attitude_pitch, "transform", "translate(0," + (this.pitch * this.bankSizeRatio * this.bankSizeRatioFactor) + ")");
        if (this.slipSkid)
            diffAndSetAttribute(this.slipSkid, "transform", "rotate(" + this.bank + ", 0, 0) translate(" + (this.slipSkidValue * 40) + ", 0)");
        if (this.slipSkidTriangle)
            diffAndSetAttribute(this.slipSkidTriangle, "transform", "rotate(" + this.bank + ", 0, 0)");
        if (this.horizonTop) {
            if (this.backgroundVisible) {
                diffAndSetAttribute(this.horizonTop, "fill", this.horizonTopColor);
                diffAndSetAttribute(this.horizonBottom, "fill", this.horizonBottomColor);
            }
            else {
                diffAndSetAttribute(this.horizonTop, "fill", "transparent");
                diffAndSetAttribute(this.horizonBottom, "fill", "transparent");
            }
        }
    }
}
customElements.define('cj4-sai-attitude-indicator', CJ4_SAI_AttitudeIndicator);
class CJ4_SAI_Compass extends NavSystemElement {
    init(root) {
        this.compassElement = this.gps.getChildById("Compass");
    }
    onEnter() {
    }
    onUpdate(_deltaTime) {
        this.compassElement.update(_deltaTime);
    }
    onExit() {
    }
    onEvent(_event) {
    }
}
class CJ4_SAI_CompassIndicator extends HTMLElement {
    constructor() {
        super(...arguments);
        this.cursorOpacity = "1.0";
        this.fontSize = 25;
        this.graduationScrollPosX = 0;
        this.graduationScrollPosY = 0;
        this.nbPrimaryGraduations = 9;
        this.nbSecondaryGraduations = 1;
        this.totalGraduations = this.nbPrimaryGraduations + ((this.nbPrimaryGraduations - 1) * this.nbSecondaryGraduations);
        this.graduationSpacing = 23;
    }
    connectedCallback() {
        this.graduationScroller = new Avionics.Scroller(this.nbPrimaryGraduations, 10, true, 360);
        this.construct();
    }
    construct() {
        this.rootSVG = document.createElementNS(Avionics.SVG.NS, "svg");
        diffAndSetAttribute(this.rootSVG, "id", "ViewBox");
        diffAndSetAttribute(this.rootSVG, "viewBox", "0 0 500 250");
        var posX = 0;
        var posY = 0;
        var width = 495;
        var height = 110;
        if (!this.rootGroup) {
            this.rootGroup = document.createElementNS(Avionics.SVG.NS, "g");
            diffAndSetAttribute(this.rootGroup, "id", "HS");
        }
        else {
            Utils.RemoveAllChildren(this.rootGroup);
        }
        if (!this.centerSVG) {
            this.centerSVG = document.createElementNS(Avionics.SVG.NS, "svg");
            diffAndSetAttribute(this.centerSVG, "id", "CenterGroup");
        }
        else
            Utils.RemoveAllChildren(this.centerSVG);
        diffAndSetAttribute(this.centerSVG, "x", posX + '');
        diffAndSetAttribute(this.centerSVG, "y", posY + '');
        diffAndSetAttribute(this.centerSVG, "width", width + '');
        diffAndSetAttribute(this.centerSVG, "height", height + '');
        diffAndSetAttribute(this.centerSVG, "viewBox", "0 0 " + width + " " + height);
        {
            var _top = 35;
            var _left = 0;
            var _width = width;
            var _height = 80;
            var bg = document.createElementNS(Avionics.SVG.NS, "rect");
            diffAndSetAttribute(bg, "x", _left + '');
            diffAndSetAttribute(bg, "y", _top + '');
            diffAndSetAttribute(bg, "width", _width + '');
            diffAndSetAttribute(bg, "height", _height + '');
            diffAndSetAttribute(bg, "fill", "#0e0d08");
            this.centerSVG.appendChild(bg);

            var cursorPosX = _left + _width * 0.5;
            var cursorPosY = posY + 30;
            var cursorWidth = 45;
            var cursorHeight = _height + 25;
            if (!this.cursorSVG) {
                this.cursorSVG = document.createElementNS(Avionics.SVG.NS, "svg");
                diffAndSetAttribute(this.cursorSVG, "id", "CursorGroup");
            }
            else
                Utils.RemoveAllChildren(this.cursorSVG);
            diffAndSetAttribute(this.cursorSVG, "x", (cursorPosX - cursorWidth * 0.5) + '');
            diffAndSetAttribute(this.cursorSVG, "y", cursorPosY + '');
            diffAndSetAttribute(this.cursorSVG, "width", cursorWidth + '');
            diffAndSetAttribute(this.cursorSVG, "height", cursorHeight + '');
            diffAndSetAttribute(this.cursorSVG, "viewBox", "0 0 " + cursorWidth + " " + cursorHeight);
            {
                let cursorShape = document.createElementNS(Avionics.SVG.NS, "path");
                diffAndSetAttribute(cursorShape, "fill", "white");
                diffAndSetAttribute(cursorShape, "fill-opacity", this.cursorOpacity);
                diffAndSetAttribute(cursorShape, "d", "M 18 2 L 25 2 L 25 23 L 25 53 L 18 53 L 18 23 L 18 2 Z");
                this.cursorSVG.appendChild(cursorShape);
            }
            this.centerSVG.appendChild(this.cursorSVG);
            var graduationGroup = document.createElementNS(Avionics.SVG.NS, "g");
            diffAndSetAttribute(graduationGroup, "id", "Graduations");
            {
                this.graduationScrollPosX = _left + _width * 0.5;
                this.graduationScrollPosY = _top;

                if (!this.graduations) {
                    this.graduations = [];

                    for (var i = 0; i < this.totalGraduations; i++) {
                        var line = new Avionics.SVGGraduation();
                        line.IsPrimary = (i % (this.nbSecondaryGraduations + 1)) ? false : true;
                        var lineWidth = line.IsPrimary ? 2 : 2;
                        var lineHeight = line.IsPrimary ? 21 : 11;
                        var linePosY = 0;
                        line.SVGLine = document.createElementNS(Avionics.SVG.NS, "rect");
                        diffAndSetAttribute(line.SVGLine, "y", linePosY + '');
                        diffAndSetAttribute(line.SVGLine, "width", lineWidth + '');
                        diffAndSetAttribute(line.SVGLine, "height", lineHeight + '');
                        diffAndSetAttribute(line.SVGLine, "fill", "white");
                        if (line.IsPrimary) {
                            line.SVGText1 = document.createElementNS(Avionics.SVG.NS, "text");
                            diffAndSetAttribute(line.SVGText1, "y", (linePosY + lineHeight + 15) + '');
                            diffAndSetAttribute(line.SVGText1, "fill", "white");
                            diffAndSetAttribute(line.SVGText1, "font-size", (this.fontSize * 1.3) + '');
                            diffAndSetAttribute(line.SVGText1, "font-family", "Roboto-Light");
                            diffAndSetAttribute(line.SVGText1, "text-anchor", "middle");
                            diffAndSetAttribute(line.SVGText1, "alignment-baseline", "central");
                        }
                        this.graduations.push(line);
                    }
                }
                for (var i = 0; i < this.totalGraduations; i++) {
                    var line = this.graduations[i];
                    graduationGroup.appendChild(line.SVGLine);
                    if (line.SVGText1) {
                        graduationGroup.appendChild(line.SVGText1);
                    }
                }
                this.centerSVG.appendChild(graduationGroup);
            }
            this.headingGroup = document.createElementNS(Avionics.SVG.NS, "g");
            diffAndSetAttribute(this.headingGroup, "id", "Heading");
            {
                var headingPosX = _left + _width * 0.5;
                var headingPosY = posY + 30;
                var headingWidth = 28;
                var headingHeight = _height;
                if (!this.headingSVG) {
                    this.headingSVG = document.createElementNS(Avionics.SVG.NS, "svg");
                    diffAndSetAttribute(this.headingSVG, "id", "HeadingGroup");
                }
                else
                    Utils.RemoveAllChildren(this.headingSVG);
                diffAndSetAttribute(this.headingSVG, "x", (headingPosX - headingWidth * 0.5) + '');
                diffAndSetAttribute(this.headingSVG, "y", headingPosY + '');
                diffAndSetAttribute(this.headingSVG, "width", headingWidth + '');
                diffAndSetAttribute(this.headingSVG, "height", headingHeight + '');
                diffAndSetAttribute(this.headingSVG, "viewBox", "0 0 " + headingWidth + " " + headingHeight);
                {
                    let headingShape = document.createElementNS(Avionics.SVG.NS, "path");
                    diffAndSetAttribute(headingShape, "fill", "transparent");
                    diffAndSetAttribute(headingShape, "stroke", "#00FF21");
                    diffAndSetAttribute(headingShape, "stroke-width", "4");
                    diffAndSetAttribute(headingShape, "stroke-opacity", "1");
                    diffAndSetAttribute(headingShape, "d", "M13 0 l-13 17 l13 17 l13 -17 Z");
                    this.headingSVG.appendChild(headingShape);
                }
                this.headingGroup.appendChild(this.headingSVG);
            }
            this.centerSVG.appendChild(this.headingGroup);

            var _rectTop = 0;
            var _rectLeft = 0;
            var _rectWidth = 40;
            var _rectHeight = 80;
            var lbg = document.createElementNS(Avionics.SVG.NS, "rect");
            diffAndSetAttribute(lbg, "x", _rectLeft + '');
            diffAndSetAttribute(lbg, "y", _rectTop + '');
            diffAndSetAttribute(lbg, "width", _rectWidth + '');
            diffAndSetAttribute(lbg, "height", _rectHeight + '');
            diffAndSetAttribute(lbg, "fill", "#0e0d08");
            this.headingGroup.appendChild(lbg);
        }
        var _top = 35;
        var _left = 20;
        var _width = 78;
        var _height = 80;
        var bg1 = document.createElementNS(Avionics.SVG.NS, "rect");
        diffAndSetAttribute(bg1, "x", _left + '');
        diffAndSetAttribute(bg1, "y", _top + '');
        diffAndSetAttribute(bg1, "width", _width + '');
        diffAndSetAttribute(bg1, "height", _height + '');
        diffAndSetAttribute(bg1, "fill", "#0e0d08");
        this.centerSVG.appendChild(bg1);

        var _left1 = 395;
        var _width1 = 104;
        var bg2 = document.createElementNS(Avionics.SVG.NS, "rect");
        diffAndSetAttribute(bg2, "x", _left1 + '');
        diffAndSetAttribute(bg2, "y", _top + '');
        diffAndSetAttribute(bg2, "width", _width1 + '');
        diffAndSetAttribute(bg2, "height", _height + '');
        diffAndSetAttribute(bg2, "fill", "#0e0d08");
        this.centerSVG.appendChild(bg2);

        this.rootGroup.appendChild(this.centerSVG);
        this.rootSVG.appendChild(this.rootGroup);
        this.appendChild(this.rootSVG);
    }
    update(dTime) {
        var compass = SimVar.GetSimVarValue("PLANE HEADING DEGREES MAGNETIC", "degree");
        this.updateGraduationScrolling(compass);
        var heading = SimVar.GetSimVarValue("AUTOPILOT HEADING LOCK DIR", "degree");
        this.updateHeadingIndicator(heading, compass);
    }
    updateGraduationScrolling(_compass) {
        if (this.graduations && this.graduationScroller.scroll(_compass)) {
            var currentVal = this.graduationScroller.firstValue;
            var currentX = this.graduationScrollPosX - this.graduationScroller.offsetY * this.graduationSpacing * (this.nbSecondaryGraduations + 1);
            for (var i = 0; i < this.totalGraduations; i++) {
                var posX = currentX;
                var posY = this.graduationScrollPosY;
                diffAndSetAttribute(this.graduations[i].SVGLine, "transform", "translate(" + posX + '' + " " + posY + '' + ")");
                if (this.graduations[i].SVGText1) {
                    var roundedVal = Math.floor(currentVal / 10);
                    if (roundedVal % 3 == 0) {
                        if (roundedVal == 0)
                            diffAndSetText(this.graduations[i].SVGText1, "N");
                        else if (roundedVal == 9)
                            diffAndSetText(this.graduations[i].SVGText1, "E");
                        else if (roundedVal == 18)
                            diffAndSetText(this.graduations[i].SVGText1, "S");
                        else if (roundedVal == 27)
                            diffAndSetText(this.graduations[i].SVGText1, "W");
                        else
                            diffAndSetText(this.graduations[i].SVGText1, roundedVal + '');
                    }
                    else {
                        diffAndSetText(this.graduations[i].SVGText1, "");
                    }
                    diffAndSetAttribute(this.graduations[i].SVGText1, "transform", "translate(" + posX + '' + " " + posY + '' + ")");
                    currentVal = this.graduationScroller.nextValue;
                }
                currentX += this.graduationSpacing;
            }
        }
    }
    updateHeadingIndicator(_heading, _compass) {
        var autoPilotActive = Simplane.getAutoPilotHeadingLockActive();
        if (autoPilotActive) {
            var delta = (_heading - _compass);
            if (delta > 180)
                delta = delta - 360;
            else if (delta < -180)
                delta = delta + 360;
            delta /= 10;
            var posX = delta * this.graduationSpacing * (this.nbSecondaryGraduations + 1);
            var posY = 0;
            diffAndSetAttribute(this.headingGroup, "transform", "translate(" + posX + '' + " " + posY + '' + ")");
            diffAndSetAttribute(this.headingGroup, "visibility", "visible");
        }
        else {
            diffAndSetAttribute(this.headingGroup, "visibility", "hidden");
        }
    }
}
customElements.define('cj4-sai-compass-indicator', CJ4_SAI_CompassIndicator);
class CJ4_SAI_Baro extends NavSystemElement {
    constructor() {
        super();
    }
    init(root) {
        this.baroElement = this.gps.getChildById("Baro");
    }
    onEnter() {
    }
    isReady() {
        return true;
    }
    onUpdate(_deltaTime) {
        this.baroElement.update(_deltaTime);
    }
    onExit() {
    }
    onEvent(_event) {
        switch (_event) {
            case "BARO_INC":
                SimVar.SetSimVarValue("K:KOHLSMAN_INC", "number", 1);
                break;
            case "BARO_DEC":
                SimVar.SetSimVarValue("K:KOHLSMAN_DEC", "number", 1);
                break;
        }
    }
}
class CJ4_SAI_BaroIndicator extends HTMLElement {
    constructor() {
        super(...arguments);
        this.fontSize = 25;
        this.graduationScrollPosX = 0;
        this.graduationScrollPosY = 0;
        this.nbPrimaryGraduations = 7;
        this.nbSecondaryGraduations = 4;
        this.totalGraduations = this.nbPrimaryGraduations + ((this.nbPrimaryGraduations - 1) * this.nbSecondaryGraduations);
        this.graduationSpacing = 22;
    }
    connectedCallback() {
        this.construct();
    }
    construct() {
        Utils.RemoveAllChildren(this);
        this.rootSVG = document.createElementNS(Avionics.SVG.NS, "svg");
        diffAndSetAttribute(this.rootSVG, "id", "ViewBox");
        diffAndSetAttribute(this.rootSVG, "viewBox", "0 0 250 500");
        if (!this.rootGroup) {
            this.rootGroup = document.createElementNS(Avionics.SVG.NS, "svg");
            diffAndSetAttribute(this.rootGroup, "id", "Barometer");
        }
        else {
            Utils.RemoveAllChildren(this.rootGroup);
        }
        {
            var x = 0;
            var y = 25;
            var w = 250;
            var h = 27;
            var baroBg = document.createElementNS(Avionics.SVG.NS, "rect");
            diffAndSetAttribute(baroBg, "x", x + '');
            diffAndSetAttribute(baroBg, "y", y + '');
            diffAndSetAttribute(baroBg, "width", w + '');
            diffAndSetAttribute(baroBg, "height", h + '');
            diffAndSetAttribute(baroBg, "fill", "#0e0d08");
            this.rootGroup.appendChild(baroBg);
            if (!this.pressureSVG)
                this.pressureSVG = document.createElementNS(Avionics.SVG.NS, "text");
            diffAndSetText(this.pressureSVG, "---");
            diffAndSetAttribute(this.pressureSVG, "x", (x - 13 + w * 0.5) + '');
            diffAndSetAttribute(this.pressureSVG, "y", (y + h * 0.45) + '');
            diffAndSetAttribute(this.pressureSVG, "fill", "#00FF21");
            diffAndSetAttribute(this.pressureSVG, "font-size", (this.fontSize * 0.60) + '');
            diffAndSetAttribute(this.pressureSVG, "font-family", "Roboto-Light");
            diffAndSetAttribute(this.pressureSVG, "text-anchor", "middle");
            diffAndSetAttribute(this.pressureSVG, "alignment-baseline", "central");
            this.rootGroup.appendChild(this.pressureSVG);
        }
        this.rootSVG.appendChild(this.rootGroup);
        this.appendChild(this.rootSVG);
    }
    update(_dTime) {
        this.updateBaroPressure();
    }
    updateBaroPressure() {
        if (this.pressureSVG) {
            var pressure = SimVar.GetSimVarValue("KOHLSMAN SETTING HG:2", "inches of mercury");
            diffAndSetText(this.pressureSVG, fastToFixed(pressure, 2) + "in");
        }
    }
}
customElements.define('cj4-sai-baro-indicator', CJ4_SAI_BaroIndicator);
registerInstrument("cj4-sai-display-element", CJ4_SAI);
//# sourceMappingURL=CJ4_SAI.js.map