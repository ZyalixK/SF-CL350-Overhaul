var wtg3000common = (function (exports, msfssdk, garminsdk) {
    'use strict';

    /**
     * A G3000 autopilot.
     */
    class G3000Autopilot extends msfssdk.Autopilot {
        /**
         * Creates an instance of the G1000Autopilot.
         * @param bus The event bus.
         * @param flightPlanner This autopilot's associated flight planner.
         * @param config This autopilot's configuration.
         * @param stateManager This autopilot's state manager.
         * @param settingsManager The settings manager to pass to altitude preselect system.
         * @param minimumsDataProvider A provider of minimums data.
         */
        constructor(bus, flightPlanner, config, stateManager, settingsManager, minimumsDataProvider) {
            super(bus, flightPlanner, config, stateManager);
            this.settingsManager = settingsManager;
            this.altSelectStops = msfssdk.SetSubject.create();
            this.altSelectManager = new msfssdk.AltitudeSelectManager(this.bus, this.settingsManager, G3000Autopilot.ALT_SELECT_OPTIONS, this.altSelectStops);
            this.fmaData = msfssdk.ObjectSubject.create({
                verticalActive: msfssdk.APVerticalModes.NONE,
                verticalArmed: msfssdk.APVerticalModes.NONE,
                verticalApproachArmed: msfssdk.APVerticalModes.NONE,
                verticalAltitudeArmed: msfssdk.APAltitudeModes.NONE,
                altitideCaptureArmed: false,
                altitideCaptureValue: -1,
                lateralActive: msfssdk.APLateralModes.NONE,
                lateralArmed: msfssdk.APLateralModes.NONE,
                lateralModeFailed: false,
                vnavState: garminsdk.FmaVNavState.OFF
            });
            this.fmaDataPublisher = this.bus.getPublisher();
            this.needPublishFmaData = false;
            this.machToKias = msfssdk.ConsumerValue.create(null, 1);
            this.selSpeedIsMach = msfssdk.ConsumerSubject.create(null, false);
            this.fmaData.sub(() => {
                this.needPublishFmaData = true;
            }, true);
            // Add a stop for the altitude preselector at the minimums altitude if BARO minimums are active.
            msfssdk.MappedSubject.create(minimumsDataProvider.mode, minimumsDataProvider.minimums).sub(([mode, minimums]) => {
                this.altSelectStops.clear();
                if (mode === msfssdk.MinimumsMode.BARO && minimums !== null) {
                    this.altSelectStops.add(minimums);
                }
            }, true);
        }
        /**
         * Resets this autopilot. Resets the altitude preselector, sets AP MASTER to off, and deactivates the flight
         * director.
         */
        reset() {
            this.altSelectManager.reset(0, true);
            if (SimVar.GetSimVarValue('AUTOPILOT MASTER', msfssdk.SimVarValueType.Bool) !== 0) {
                SimVar.SetSimVarValue('K:AP_MASTER', msfssdk.SimVarValueType.Number, 0);
            }
            if (SimVar.GetSimVarValue('AUTOPILOT FLIGHT DIRECTOR ACTIVE', msfssdk.SimVarValueType.Bool) !== 0) {
                SimVar.SetSimVarValue('K:TOGGLE_FLIGHT_DIRECTOR', msfssdk.SimVarValueType.Number, 0);
            }
        }
        /** @inheritdoc */
        onAfterUpdate() {
            this.updateFma();
        }
        /** @inheritdoc */
        onInitialized() {
            this.bus.pub('vnav_set_state', true);
            this.monitorAdditionalEvents();
        }
        /** @inheritdoc */
        monitorAdditionalEvents() {
            const sub = this.bus.getSubscriber();
            // Whenever we switch between mach and IAS hold and we are in manual speed mode, we need to set the value to which
            // we are switching to be equal to the value we are switching from.
            this.machToKias.setConsumer(sub.on('adc_mach_to_kias_factor_1'));
            this.selSpeedIsMach.setConsumer(sub.on('ap_selected_speed_is_mach'));
            const speedIsMachSub = this.selSpeedIsMach.sub(isMach => {
                if (isMach) {
                    SimVar.SetSimVarValue('K:AP_MACH_VAR_SET', msfssdk.SimVarValueType.Number, Math.round(this.apValues.selectedIas.get() / this.machToKias.get() * 100));
                }
                else {
                    SimVar.SetSimVarValue('K:AP_SPD_VAR_SET', msfssdk.SimVarValueType.Number, Math.round(this.apValues.selectedMach.get() * this.machToKias.get()));
                }
            }, false, true);
            sub.on('ap_selected_speed_is_manual').whenChanged().handle(isManual => {
                if (isManual) {
                    speedIsMachSub.resume();
                }
                else {
                    speedIsMachSub.pause();
                }
            });
        }
        /**
         * Checks and sets the proper armed altitude mode.
         */
        manageAltitudeCapture() {
            var _a, _b, _c;
            let altCapType = msfssdk.APAltitudeModes.NONE;
            let armAltCap = false;
            switch (this.apValues.verticalActive.get()) {
                case msfssdk.APVerticalModes.VS:
                case msfssdk.APVerticalModes.FLC:
                case msfssdk.APVerticalModes.PITCH:
                case msfssdk.APVerticalModes.TO:
                case msfssdk.APVerticalModes.GA:
                    armAltCap = true;
                    altCapType = this.vnavCaptureType === msfssdk.VNavAltCaptureType.VNAV ? msfssdk.APAltitudeModes.ALTV : msfssdk.APAltitudeModes.ALTS;
                    break;
                case msfssdk.APVerticalModes.PATH: {
                    altCapType = this.vnavCaptureType === msfssdk.VNavAltCaptureType.VNAV ? msfssdk.APAltitudeModes.ALTV : msfssdk.APAltitudeModes.ALTS;
                    break;
                }
                case msfssdk.APVerticalModes.CAP:
                    altCapType = this.verticalAltitudeArmed;
                    break;
            }
            if (this.verticalAltitudeArmed !== altCapType) {
                this.verticalAltitudeArmed = altCapType;
            }
            if (armAltCap && (!this.altCapArmed || ((_a = this.verticalModes.get(msfssdk.APVerticalModes.CAP)) === null || _a === void 0 ? void 0 : _a.state) === msfssdk.DirectorState.Inactive)) {
                (_b = this.verticalModes.get(msfssdk.APVerticalModes.CAP)) === null || _b === void 0 ? void 0 : _b.arm();
            }
            else if (!armAltCap && this.altCapArmed) {
                (_c = this.verticalModes.get(msfssdk.APVerticalModes.CAP)) === null || _c === void 0 ? void 0 : _c.deactivate();
                this.altCapArmed = false;
            }
        }
        /**
         * Publishes data for the FMA.
         */
        updateFma() {
            const fmaData = this.fmaData;
            const vnavManager = this.vnavManager;
            let fmaVNavState = garminsdk.FmaVNavState.OFF;
            fmaVNavState = vnavManager.isActive
                ? garminsdk.FmaVNavState.ACTIVE
                : vnavManager.state === msfssdk.VNavState.Enabled_Active ? garminsdk.FmaVNavState.ARMED : garminsdk.FmaVNavState.OFF;
            fmaData.set('verticalApproachArmed', this.verticalApproachArmed);
            fmaData.set('verticalArmed', this.apValues.verticalArmed.get());
            fmaData.set('verticalActive', this.apValues.verticalActive.get());
            fmaData.set('verticalAltitudeArmed', this.verticalAltitudeArmed);
            fmaData.set('altitideCaptureArmed', this.altCapArmed);
            fmaData.set('altitideCaptureValue', this.apValues.capturedAltitude.get());
            fmaData.set('lateralActive', this.apValues.lateralActive.get());
            fmaData.set('lateralArmed', this.apValues.lateralArmed.get());
            fmaData.set('lateralModeFailed', this.lateralModeFailed);
            fmaData.set('vnavState', fmaVNavState);
            if (this.needPublishFmaData) {
                this.needPublishFmaData = false;
                this.fmaDataPublisher.pub('fma_data', Object.assign({}, fmaData.get()), true, true);
            }

        }
    }
    G3000Autopilot.ALT_SELECT_OPTIONS = {
        supportMetric: true,
        minValue: msfssdk.UnitType.FOOT.createNumber(-1000),
        maxValue: msfssdk.UnitType.FOOT.createNumber(50000),
        inputIncrLargeThreshold: 999,
        incrSmall: msfssdk.UnitType.FOOT.createNumber(100),
        incrLarge: msfssdk.UnitType.FOOT.createNumber(1000),
        incrSmallMetric: msfssdk.UnitType.METER.createNumber(50),
        incrLargeMetric: msfssdk.UnitType.METER.createNumber(500),
        initOnInput: true,
        initToIndicatedAlt: true,
        transformSetToIncDec: false
    };

    /**
     * Statuses for a G3000 autothrottle.
     */
    exports.G3000AutothrottleStatus = void 0;
    (function (G3000AutothrottleStatus) {
        G3000AutothrottleStatus["Off"] = "Off";
        G3000AutothrottleStatus["Disconnected"] = "Disconnected";
        G3000AutothrottleStatus["Armed"] = "Armed";
        G3000AutothrottleStatus["On"] = "On";
    })(exports.G3000AutothrottleStatus || (exports.G3000AutothrottleStatus = {}));

    /**
     * A configuration object which defines options related to the autopilot.
     */
    class AutopilotConfig {
        /**
         * Creates a new AutopilotConfig from a configuration document element.
         * @param baseInstrument The `BaseInstrument` element associated with the configuration.
         * @param element A configuration document element.
         */
        constructor(baseInstrument, element) {
            if (element === undefined) {
                this.rollOptions = { minBankAngle: AutopilotConfig.DEFAULT_ROLL_MIN_BANK_ANGLE, maxBankAngle: AutopilotConfig.DEFAULT_MAX_BANK_ANGLE };
                this.hdgOptions = { maxBankAngle: AutopilotConfig.DEFAULT_MAX_BANK_ANGLE };
                this.vorOptions = { maxBankAngle: AutopilotConfig.DEFAULT_MAX_BANK_ANGLE };
                this.locOptions = { maxBankAngle: AutopilotConfig.DEFAULT_MAX_BANK_ANGLE };
                this.lnavOptions = { maxBankAngle: AutopilotConfig.DEFAULT_MAX_BANK_ANGLE };
                this.lowBankOptions = { maxBankAngle: AutopilotConfig.DEFAULT_LOW_BANK_ANGLE };
            }
            else {
                if (element.tagName !== 'Autopilot') {
                    throw new Error(`Invalid AutopilotConfig definition: expected tag name 'Autopilot' but was '${element.tagName}'`);
                }
                this.rollOptions = this.parseRollOptions(element.querySelector(':scope>ROL'));
                this.hdgOptions = this.parseHdgOptions(element.querySelector(':scope>HDG'));
                this.vorOptions = this.parseVorOptions(element.querySelector(':scope>VOR'));
                this.locOptions = this.parseLocOptions(element.querySelector(':scope>LOC'));
                this.lnavOptions = this.parseLNavOptions(element.querySelector(':scope>FMS'));
                this.lowBankOptions = this.parseLowBankOptions(element.querySelector(':scope>LowBank'));
            }
        }
        /**
         * Parses ROL director options from a configuration document element.
         * @param element A configuration document element.
         * @returns The ROL director options defined by the configuration document element.
         */
        parseRollOptions(element) {
            var _a, _b;
            if (element !== null) {
                let minBankAngle = Number((_a = element.getAttribute('min-bank')) !== null && _a !== void 0 ? _a : undefined);
                if (isNaN(minBankAngle) || minBankAngle < 0) {
                    console.warn('Invalid AutopilotConfig definition: missing or unrecognized min-bank value (expected a non-negative number)');
                    minBankAngle = AutopilotConfig.DEFAULT_ROLL_MIN_BANK_ANGLE;
                }
                let maxBankAngle = Number((_b = element.getAttribute('max-bank')) !== null && _b !== void 0 ? _b : undefined);
                if (isNaN(maxBankAngle) || maxBankAngle < 0) {
                    console.warn('Invalid AutopilotConfig definition: missing or unrecognized max-bank value (expected a non-negative number)');
                    maxBankAngle = AutopilotConfig.DEFAULT_MAX_BANK_ANGLE;
                }
                return { minBankAngle, maxBankAngle };
            }
            return { minBankAngle: AutopilotConfig.DEFAULT_ROLL_MIN_BANK_ANGLE, maxBankAngle: AutopilotConfig.DEFAULT_MAX_BANK_ANGLE };
        }
        /**
         * Parses HDG director options from a configuration document element.
         * @param element A configuration document element.
         * @returns The HDG director options defined by the configuration document element.
         */
        parseHdgOptions(element) {
            var _a;
            if (element !== null) {
                let maxBankAngle = Number((_a = element.getAttribute('max-bank')) !== null && _a !== void 0 ? _a : undefined);
                if (isNaN(maxBankAngle) || maxBankAngle < 0) {
                    console.warn('Invalid AutopilotConfig definition: missing or unrecognized max-bank value (expected a non-negative number)');
                    maxBankAngle = AutopilotConfig.DEFAULT_MAX_BANK_ANGLE;
                }
                return { maxBankAngle };
            }
            return { maxBankAngle: AutopilotConfig.DEFAULT_MAX_BANK_ANGLE };
        }
        /**
         * Parses VOR director options from a configuration document element.
         * @param element A configuration document element.
         * @returns The VOR director options defined by the configuration document element.
         */
        parseVorOptions(element) {
            var _a;
            if (element !== null) {
                let maxBankAngle = Number((_a = element.getAttribute('max-bank')) !== null && _a !== void 0 ? _a : undefined);
                if (isNaN(maxBankAngle) || maxBankAngle < 0) {
                    console.warn('Invalid AutopilotConfig definition: missing or unrecognized max-bank value (expected a non-negative number)');
                    maxBankAngle = AutopilotConfig.DEFAULT_MAX_BANK_ANGLE;
                }
                return { maxBankAngle };
            }
            return { maxBankAngle: AutopilotConfig.DEFAULT_MAX_BANK_ANGLE };
        }
        /**
         * Parses LOC director options from a configuration document element.
         * @param element A configuration document element.
         * @returns The LOC director options defined by the configuration document element.
         */
        parseLocOptions(element) {
            var _a;
            if (element !== null) {
                let maxBankAngle = Number((_a = element.getAttribute('max-bank')) !== null && _a !== void 0 ? _a : undefined);
                if (isNaN(maxBankAngle) || maxBankAngle < 0) {
                    console.warn('Invalid AutopilotConfig definition: missing or unrecognized max-bank value (expected a non-negative number)');
                    maxBankAngle = AutopilotConfig.DEFAULT_MAX_BANK_ANGLE;
                }
                return { maxBankAngle };
            }
            return { maxBankAngle: AutopilotConfig.DEFAULT_MAX_BANK_ANGLE };
        }
        /**
         * Parses HDG director options from a configuration document element.
         * @param element A configuration document element.
         * @returns The HDG director options defined by the configuration document element.
         */
        parseLNavOptions(element) {
            var _a;
            if (element !== null) {
                let maxBankAngle = Number((_a = element.getAttribute('max-bank')) !== null && _a !== void 0 ? _a : undefined);
                if (isNaN(maxBankAngle) || maxBankAngle < 0) {
                    console.warn('Invalid AutopilotConfig definition: missing or unrecognized max-bank value (expected a non-negative number)');
                    maxBankAngle = AutopilotConfig.DEFAULT_MAX_BANK_ANGLE;
                }
                return { maxBankAngle };
            }
            return { maxBankAngle: AutopilotConfig.DEFAULT_MAX_BANK_ANGLE };
        }
        /**
         * Parses Low Bank Mode options from a configuration document element.
         * @param element A configuration document element.
         * @returns The Low Bank Mode options defined by the configuration document element.
         */
        parseLowBankOptions(element) {
            var _a;
            if (element !== null) {
                let maxBankAngle = Number((_a = element.getAttribute('max-bank')) !== null && _a !== void 0 ? _a : undefined);
                if (isNaN(maxBankAngle) || maxBankAngle < 0) {
                    console.warn('Invalid AutopilotConfig definition: missing or unrecognized max-bank value (expected a non-negative number)');
                    maxBankAngle = AutopilotConfig.DEFAULT_MAX_BANK_ANGLE;
                }
                return { maxBankAngle };
            }
            return { maxBankAngle: AutopilotConfig.DEFAULT_LOW_BANK_ANGLE };
        }
    }
    AutopilotConfig.DEFAULT_ROLL_MIN_BANK_ANGLE = 6;
    AutopilotConfig.DEFAULT_MAX_BANK_ANGLE = 25;
    AutopilotConfig.DEFAULT_LOW_BANK_ANGLE = 15;

    /**
     * A configuration object which defines options related to maps.
     */
    class MapConfig {
        /**
         * Creates a new MapConfig from a configuration document element.
         * @param element A configuration document element.
         */
        constructor(element) {
            var _a, _b;
            if (element === undefined) {
                this.ownAirplaneIconSrc = MapConfig.DEFAULT_AIRPLANE_ICON_SRC;
                this.trafficRangeLabelRadial = MapConfig.DEFAULT_TRAFFIC_RANGE_LABEL_RADIAL;
                this.trafficRangeInnerRingShow = true;
            }
            else {
                if (element.tagName !== 'Map') {
                    throw new Error(`Invalid MapConfig definition: expected tag name 'Map' but was '${element.tagName}'`);
                }
                this.ownAirplaneIconSrc = (_a = element.getAttribute('airplane-icon-src')) !== null && _a !== void 0 ? _a : MapConfig.DEFAULT_AIRPLANE_ICON_SRC;
                const trafficRangeLabelRadial = Number((_b = element.getAttribute('traffic-range-label-radial')) !== null && _b !== void 0 ? _b : MapConfig.DEFAULT_TRAFFIC_RANGE_LABEL_RADIAL);
                if (isNaN(trafficRangeLabelRadial)) {
                    console.warn('Invalid MapConfig definition: unrecognized traffic range label radial value (must be a number)');
                    this.trafficRangeLabelRadial = MapConfig.DEFAULT_TRAFFIC_RANGE_LABEL_RADIAL;
                }
                else {
                    this.trafficRangeLabelRadial = trafficRangeLabelRadial % 360;
                }
                const trafficRangeInnerRingShow = element.getAttribute('traffic-range-inner-ring-show');
                switch ((trafficRangeInnerRingShow !== null && trafficRangeInnerRingShow !== void 0 ? trafficRangeInnerRingShow : 'false').toLowerCase()) {
                    case 'true':
                        this.trafficRangeInnerRingShow = true;
                        break;
                    case 'false':
                        this.trafficRangeInnerRingShow = false;
                        break;
                    default:
                        console.warn('Invalid MapConfig definition: unrecognized show traffic range inner ring value (must be \'true\' or \'false\' - case-insensitive)');
                        this.trafficRangeInnerRingShow = false;
                }
            }
        }
    }
    MapConfig.DEFAULT_AIRPLANE_ICON_SRC = 'coui://html_ui/Pages/VCockpit/Instruments/NavSystems/TTX/WTG3000/Assets/Images/Map/airplane_generic.svg';
    MapConfig.DEFAULT_TRAFFIC_RANGE_LABEL_RADIAL = 135;

    /**
     * A configuration object which defines a lookup table.
     */
    class LookupTableConfig {
        /**
         * Creates a new LookupTableConfig from a configuration document element.
         * @param element A configuration document element.
         */
        constructor(element) {
            /** @inheritdoc */
            this.isResolvableConfig = true;
            if (element.tagName !== 'LookupTable') {
                throw new Error(`Invalid LookupTableConfig definition: expected tag name 'LookupTable' but was '${element.tagName}'`);
            }
            const dimensions = element.getAttribute('dimensions');
            if (dimensions === null) {
                throw new Error('Invalid LookupTableConfig definition: undefined \'dimensions\' attribute');
            }
            const parsedDimensions = Number(dimensions);
            if (isNaN(parsedDimensions) || Math.trunc(parsedDimensions) !== parsedDimensions || parsedDimensions <= 0) {
                throw new Error(`Invalid LookupTableConfig definition: expected 'dimensions' to be a positive integer but was '${dimensions}'`);
            }
            this.dimensions = parsedDimensions;
            const value = element.textContent;
            if (value === null) {
                throw new Error('Invalid LookupTableConfig definition: undefined value');
            }
            let parsedValue = undefined;
            try {
                parsedValue = JSON.parse(value);
            }
            catch (_a) {
                // continue
            }
            if (parsedValue instanceof Array) {
                for (const breakpoint of parsedValue) {
                    if (!(breakpoint instanceof Array && breakpoint.length === parsedDimensions + 1 && breakpoint.every(el => typeof el === 'number'))) {
                        throw new Error('Invalid LookupTableConfig definition: malformed lookup table array');
                    }
                }
            }
            else {
                throw new Error('Invalid LookupTableConfig definition: value was not an array');
            }
            this.breakpoints = parsedValue;
        }
        /** @inheritdoc */
        resolve() {
            const table = new msfssdk.LerpLookupTable(this.dimensions);
            for (const breakpoint of this.breakpoints) {
                table.insertBreakpoint(breakpoint);
            }
            return table;
        }
    }

    /**
     * Types of reference V-speed groups.
     */
    exports.VSpeedGroupType = void 0;
    (function (VSpeedGroupType) {
        VSpeedGroupType["General"] = "General";
        VSpeedGroupType["Takeoff"] = "Takeoff";
        VSpeedGroupType["Landing"] = "Landing";
        VSpeedGroupType["Configuration"] = "Configuration";
    })(exports.VSpeedGroupType || (exports.VSpeedGroupType = {}));
    /**
     * Keys for reference V-speed values derived from aircraft configuration files.
     */
    exports.VSpeedValueKey = void 0;
    (function (VSpeedValueKey) {
        VSpeedValueKey["StallLanding"] = "VS0";
        VSpeedValueKey["StallCruise"] = "VS1";
        VSpeedValueKey["FlapsExtended"] = "VFe";
        VSpeedValueKey["NeverExceed"] = "VNe";
        VSpeedValueKey["NormalOperation"] = "VNo";
        VSpeedValueKey["Minimum"] = "VMin";
        VSpeedValueKey["Maximum"] = "VMax";
        VSpeedValueKey["Rotation"] = "Vr";
        VSpeedValueKey["BestClimbAngle"] = "Vx";
        VSpeedValueKey["BestClimbRate"] = "Vy";
        VSpeedValueKey["Approach"] = "Vapp";
        VSpeedValueKey["BestGlide"] = "BestGlide";
        VSpeedValueKey["BestClimbRateSingleEngine"] = "Vyse";
        VSpeedValueKey["MinimumControl"] = "Vmc";
    })(exports.VSpeedValueKey || (exports.VSpeedValueKey = {}));

    /**
     * Types of speed configs.
     */
    exports.SpeedConfigType = void 0;
    (function (SpeedConfigType) {
        SpeedConfigType["Ias"] = "Ias";
        SpeedConfigType["Mach"] = "Mach";
        SpeedConfigType["Aoa"] = "Aoa";
        SpeedConfigType["Reference"] = "Reference";
    })(exports.SpeedConfigType || (exports.SpeedConfigType = {}));
    /**
     * A configuration object which defines a factory for an airspeed value presented as knots indicated airspeed.
     *
     * The airspeed value can be defined from a specific indicated airspeed, mach number, or angle-of-attack value, from
     * a one-dimensional lookup table of any of the previous value types keyed on pressure altitude, or from an aircraft
     * reference speed.
     */
    class SpeedConfig {
        /**
         * Creates a new SpeedConfig from a configuration document element.
         * @param element A configuration document element.
         */
        constructor(element) {
            this.isResolvableConfig = true;
            this.isNumericConfig = true;
            if (element.tagName !== 'Speed') {
                throw new Error(`Invalid SpeedConfig definition: expected tag name 'Speed' but was '${element.tagName}'`);
            }
            const type = element.getAttribute('type');
            switch (type) {
                case exports.SpeedConfigType.Ias:
                case exports.SpeedConfigType.Mach:
                case exports.SpeedConfigType.Aoa:
                case exports.SpeedConfigType.Reference:
                    this.type = type;
                    break;
                default:
                    throw new Error(`Invalid SpeedConfig definition: unrecognized type '${type}'`);
            }
            if (this.type === exports.SpeedConfigType.Reference) {
                const value = element.textContent;
                if (value === null) {
                    throw new Error('Invalid SpeedConfig definition: undefined value');
                }
                if (Object.values(exports.VSpeedValueKey).includes(value)) {
                    this.value = value;
                }
                else {
                    throw new Error(`Invalid SpeedConfig definition: unrecognized value ${value} (value must be a valid reference speed key)`);
                }
            }
            else {
                const lookupTable = element.querySelector(':scope>LookupTable');
                if (lookupTable !== null) {
                    this.value = new LookupTableConfig(lookupTable);
                }
                else {
                    const value = element.textContent;
                    if (value === null) {
                        throw new Error('Invalid SpeedConfig definition: undefined value');
                    }
                    const parsedValue = Number(value);
                    if (isNaN(parsedValue)) {
                        throw new Error('Invalid SpeedConfig definition: value was not a number or a lookup table');
                    }
                    this.value = parsedValue;
                }
            }
        }
        /** @inheritdoc */
        resolve() {
            switch (this.type) {
                case exports.SpeedConfigType.Ias:
                    return this.resolveIas();
                case exports.SpeedConfigType.Mach:
                    return this.resolveMach();
                case exports.SpeedConfigType.Aoa:
                    return this.resolveAoa();
                case exports.SpeedConfigType.Reference:
                    return this.resolveReference();
            }
        }
        /**
         * Resolves this config as a factory for an airspeed value defined from indicated airspeed.
         * @returns A factory for an airspeed value defined from indicated airspeed.
         */
        resolveIas() {
            const value = this.value;
            return (context) => {
                if (typeof value === 'number') {
                    return value;
                }
                else {
                    const table = value.resolve();
                    return context.pressureAlt.map(indicatedAlt => table.get(indicatedAlt));
                }
            };
        }
        /**
         * Resolves this config as a factory for an airspeed value defined from mach number.
         * @returns A factory for an airspeed value defined from mach number.
         */
        resolveMach() {
            const value = this.value;
            return (context) => {
                if (typeof value === 'number') {
                    return context.machToKias.map(machToKias => machToKias * value);
                }
                else {
                    const table = value.resolve();
                    return msfssdk.MappedSubject.create(([indicatedAlt, machToKias]) => {
                        return table.get(indicatedAlt) * machToKias;
                    }, context.pressureAlt, context.machToKias);
                }
            };
        }
        /**
         * Resolves this config as a factory for an airspeed value defined from angle of attack.
         * @returns A factory for an airspeed value defined from angle of attack.
         */
        resolveAoa() {
            const value = this.value;
            return (context) => {
                if (typeof value === 'number') {
                    return context.normAoaIasCoef.map((coef) => coef === null ? NaN : context.estimateIasFromNormAoa(value), msfssdk.SubscribableUtils.NUMERIC_NAN_EQUALITY);
                }
                else {
                    const table = value.resolve();
                    return msfssdk.MappedSubject.create(([indicatedAlt, coef]) => {
                        return coef === null ? NaN : context.estimateIasFromNormAoa(table.get(indicatedAlt));
                    }, msfssdk.SubscribableUtils.NUMERIC_NAN_EQUALITY, context.pressureAlt, context.normAoaIasCoef);
                }
            };
        }
        /**
         * Resolves this config as a factory for an airspeed value defined from a reference speed.
         * @returns A factory for an airspeed value defined from a reference speed.
         */
        resolveReference() {
            const value = this.value;
            return () => {
                return Math.round(Simplane.getDesignSpeeds()[value]);
            };
        }
    }

    /**
     * A configuration object which defines a factory for a numeric constant.
     */
    class NumericConstantConfig {
        /**
         * Creates a new NumericConstantConfig from a configuration document element.
         * @param element A configuration document element.
         */
        constructor(element) {
            this.isResolvableConfig = true;
            this.isNumericConfig = true;
            if (element.tagName !== 'Number') {
                throw new Error(`Invalid NumericConstantConfig definition: expected tag name 'Number' but was '${element.tagName}'`);
            }
            const value = element.textContent;
            if (value === null) {
                throw new Error('Invalid NumericConstantConfig definition: undefined value');
            }
            const parsedValue = Number(value);
            if (isNaN(parsedValue)) {
                throw new Error('Invalid NumericConstantConfig definition: value was not a number');
            }
            this.value = parsedValue;
        }
        /** @inheritdoc */
        resolve() {
            return () => this.value;
        }
    }
    /**
     * A configuration object which defines a factory for a numeric value which is the minimum of one or more inputs.
     */
    class NumericMinConfig {
        /**
         * Creates a new NumericMinConfig from a configuration document element.
         * @param element A configuration document element.
         * @param factory A configuration object factory to use to create child configuration objects.
         */
        constructor(element, factory) {
            this.isResolvableConfig = true;
            this.isNumericConfig = true;
            if (element.tagName !== 'Min') {
                throw new Error(`Invalid NumericMinConfig definition: expected tag name 'Min' but was '${element.tagName}'`);
            }
            const args = [];
            for (const child of element.children) {
                const config = factory.create(child);
                if (config !== undefined && 'isNumericConfig' in config) {
                    args.push(config);
                }
            }
            if (args.length === 0) {
                throw new Error('Invalid NumericMinConfig definition: found zero inputs (must have at least one)');
            }
            this.inputs = args;
        }
        /** @inheritdoc */
        resolve() {
            return (context) => {
                const resolvedArgs = this.inputs.map(arg => typeof arg === 'number' ? arg : arg.resolve()(context));
                if (resolvedArgs.some(arg => typeof arg === 'object')) {
                    if (resolvedArgs.length === 1) {
                        return resolvedArgs[0];
                    }
                    else {
                        const numbers = resolvedArgs.filter(arg => typeof arg === 'number');
                        const subscribables = resolvedArgs.filter(arg => typeof arg === 'object');
                        const min = Math.min(...numbers, Number.POSITIVE_INFINITY);
                        return new ChainedMappedSubscribable(msfssdk.MappedSubject.create((args) => {
                            return Math.min(min, ...args);
                        }, ...subscribables), subscribables);
                    }
                }
                else {
                    return Math.min(...resolvedArgs);
                }
            };
        }
    }
    /**
     * A configuration object which defines a factory for a numeric value which is the maximum of one or more inputs.
     */
    class NumericMaxConfig {
        /**
         * Creates a new NumericMaxConfig from a configuration document element.
         * @param element A configuration document element.
         * @param factory A configuration object factory to use to create child configuration objects.
         */
        constructor(element, factory) {
            this.isResolvableConfig = true;
            this.isNumericConfig = true;
            if (element.tagName !== 'Max') {
                throw new Error(`Invalid NumericMaxConfig definition: expected tag name 'Max' but was '${element.tagName}'`);
            }
            const args = [];
            for (const child of element.children) {
                const config = factory.create(child);
                if (config !== undefined && 'isNumericConfig' in config) {
                    args.push(config);
                }
            }
            if (args.length === 0) {
                throw new Error('Invalid NumericMaxConfig definition: found zero inputs (must have at least one)');
            }
            this.inputs = args;
        }
        /** @inheritdoc */
        resolve() {
            return (context) => {
                const resolvedArgs = this.inputs.map(arg => typeof arg === 'number' ? arg : arg.resolve()(context));
                if (resolvedArgs.some(arg => typeof arg === 'object')) {
                    if (resolvedArgs.length === 1) {
                        return resolvedArgs[0];
                    }
                    else {
                        const numbers = resolvedArgs.filter(arg => typeof arg === 'number');
                        const subscribables = resolvedArgs.filter(arg => typeof arg === 'object');
                        const max = Math.max(...numbers, Number.NEGATIVE_INFINITY);
                        return new ChainedMappedSubscribable(msfssdk.MappedSubject.create((args) => {
                            return Math.max(max, ...args);
                        }, ...subscribables), subscribables);
                    }
                }
                else {
                    return Math.max(...resolvedArgs);
                }
            };
        }
    }
    /**
     * A subscribable which wraps a mapped subscribable chained from another mapped subscribable. Pause/resume/destroy
     * operations on this subscribable are transferred to the source of the wrapped subscribable.
     */
    class ChainedMappedSubscribable {
        /**
         * Constructor.
         * @param mapped The mapped subscribable wrapped by this chained subscribable.
         * @param sources The sources of this chained subscribable's wrapped subscribable.
         */
        constructor(mapped, sources) {
            this.mapped = mapped;
            this.sources = sources;
            /** @inheritdoc */
            this.isSubscribable = true;
        }
        /** @inheritdoc */
        get isAlive() {
            return this.mapped.isAlive;
        }
        /** @inheritdoc */
        get isPaused() {
            return this.mapped.isPaused;
        }
        /** @inheritdoc */
        get() {
            return this.mapped.get();
        }
        /** @inheritdoc */
        sub(handler, initialNotify, paused) {
            return this.mapped.sub(handler, initialNotify, paused);
        }
        /** @inheritdoc */
        unsub(handler) {
            this.mapped.unsub(handler);
        }
        // eslint-disable-next-line jsdoc/require-jsdoc
        map(fn, equalityFunc, mutateFunc, initialVal) {
            if (mutateFunc === undefined) {
                return this.mapped.map(fn, equalityFunc);
            }
            else {
                return this.mapped.map(fn, equalityFunc, mutateFunc, initialVal);
            }
        }
        // eslint-disable-next-line jsdoc/require-jsdoc
        pipe(to, arg2, arg3) {
            if (typeof arg2 === 'function') {
                return this.mapped.pipe(to, arg2, arg3);
            }
            else {
                return this.mapped.pipe(to, arg2);
            }
        }
        /** @inheritdoc */
        pause() {
            this.mapped.pause();
            for (let i = 0; i < this.sources.length; i++) {
                this.sources[i].pause();
            }
            return this;
        }
        /** @inheritdoc */
        resume() {
            for (let i = 0; i < this.sources.length; i++) {
                this.sources[i].resume();
            }
            this.mapped.resume();
            return this;
        }
        /** @inheritdoc */
        destroy() {
            this.mapped.destroy();
            for (let i = 0; i < this.sources.length; i++) {
                this.sources[i].destroy();
            }
        }
    }

    /**
     * A default implementation of {@link ConfigFactory}.
     */
    class DefaultConfigFactory {
        /** @inheritdoc */
        create(element) {
            const ctor = DefaultConfigFactory.TAG_MAP[element.tagName];
            if (ctor === undefined) {
                return undefined;
            }
            return new ctor(element, this);
        }
    }
    DefaultConfigFactory.TAG_MAP = {
        'Number': NumericConstantConfig,
        'Min': NumericMinConfig,
        'Max': NumericMaxConfig,
        'LookupTable': LookupTableConfig,
        'Speed': SpeedConfig
    };

    /**
     * Runway surface conditions for TOLD (takeoff/landing) performance calculations.
     */
    exports.ToldRunwaySurfaceCondition = void 0;
    (function (ToldRunwaySurfaceCondition) {
        ToldRunwaySurfaceCondition["Dry"] = "Dry";
        ToldRunwaySurfaceCondition["Wet"] = "Wet";
    })(exports.ToldRunwaySurfaceCondition || (exports.ToldRunwaySurfaceCondition = {}));
    /**
     * TOLD (takeoff/landing) limit exceedance flags.
     */
    exports.ToldLimitExceedance = void 0;
    (function (ToldLimitExceedance) {
        ToldLimitExceedance[ToldLimitExceedance["FieldLength"] = 1] = "FieldLength";
        ToldLimitExceedance[ToldLimitExceedance["Weight"] = 2] = "Weight";
        ToldLimitExceedance[ToldLimitExceedance["PressureAltitudeLow"] = 4] = "PressureAltitudeLow";
        ToldLimitExceedance[ToldLimitExceedance["PressureAltitudeHigh"] = 8] = "PressureAltitudeHigh";
        ToldLimitExceedance[ToldLimitExceedance["TemperatureLow"] = 16] = "TemperatureLow";
        ToldLimitExceedance[ToldLimitExceedance["TemperatureHigh"] = 32] = "TemperatureHigh";
        ToldLimitExceedance[ToldLimitExceedance["Headwind"] = 64] = "Headwind";
        ToldLimitExceedance[ToldLimitExceedance["Tailwind"] = 128] = "Tailwind";
        ToldLimitExceedance[ToldLimitExceedance["Crosswind"] = 256] = "Crosswind";
    })(exports.ToldLimitExceedance || (exports.ToldLimitExceedance = {}));

    /**
     * States describing which TOLD (takeoff/landing) performance calculation thrust reverser settings are selectable.
     */
    exports.ToldThrustReverserSelectable = void 0;
    (function (ToldThrustReverserSelectable) {
        /** Only the `false` thrust reverser setting is selectable. */
        ToldThrustReverserSelectable["OnlyFalse"] = "OnlyFalse";
        /** Only the `true` thrust reverser setting is selectable. */
        ToldThrustReverserSelectable["OnlyTrue"] = "OnlyTrue";
        /** Both the `true` and `false` thrust reverser settings are selectable. */
        ToldThrustReverserSelectable["Both"] = "Both";
    })(exports.ToldThrustReverserSelectable || (exports.ToldThrustReverserSelectable = {}));
    /**
     * A configuration object which defines options related to TOLD (takeoff/landing) performance calculations.
     */
    class ToldConfig {
        /**
         * Creates a new ToldConfig from a configuration document element.
         * @param element A configuration document element.
         */
        constructor(element) {
            if (element.tagName !== 'TOLD') {
                throw new Error(`Invalid ToldConfig definition: expected tag name 'TOLD' but was '${element.tagName}'`);
            }
            this.takeoff = this.parseTakeoff(element.querySelector(':scope>Takeoff'));
            this.landing = this.parseLanding(element.querySelector(':scope>Landing'));
        }
        /**
         * Parses takeoff options from a configuration document element.
         * @param element A configuration document element.
         * @returns The takeoff options defined by the configuration document element.
         */
        parseTakeoff(element) {
            var _a, _b, _c, _d;
            return {
                flaps: this.parseFlaps((_a = element === null || element === void 0 ? void 0 : element.querySelector(':scope>Flaps')) !== null && _a !== void 0 ? _a : null),
                antiIce: this.parseAntiIce((_b = element === null || element === void 0 ? void 0 : element.querySelector(':scope>AntiIce')) !== null && _b !== void 0 ? _b : null),
                thrustReverser: this.parseThrustReverser((_c = element === null || element === void 0 ? void 0 : element.querySelector(':scope>ThrustReverser')) !== null && _c !== void 0 ? _c : null),
                rolling: this.parseRollingTakeoff((_d = element === null || element === void 0 ? void 0 : element.querySelector(':scope>Rolling')) !== null && _d !== void 0 ? _d : null)
            };
        }
        /**
         * Parses takeoff options from a configuration document element.
         * @param element A configuration document element.
         * @returns The takeoff options defined by the configuration document element.
         */
        parseLanding(element) {
            var _a, _b, _c, _d;
            return {
                flaps: this.parseFlaps((_a = element === null || element === void 0 ? void 0 : element.querySelector(':scope>Flaps')) !== null && _a !== void 0 ? _a : null),
                antiIce: this.parseAntiIce((_b = element === null || element === void 0 ? void 0 : element.querySelector(':scope>AntiIce')) !== null && _b !== void 0 ? _b : null),
                thrustReverser: this.parseThrustReverser((_c = element === null || element === void 0 ? void 0 : element.querySelector(':scope>ThrustReverser')) !== null && _c !== void 0 ? _c : null),
                autothrottle: this.parseAutothrottle((_d = element === null || element === void 0 ? void 0 : element.querySelector(':scope>Autothrottle')) !== null && _d !== void 0 ? _d : null)
            };
        }
        /**
         * Parses flaps options from a configuration document element.
         * @param element A configuration document element.
         * @returns The flaps options defined by the configuration document element, or `undefined` if the element is `null`.
         */
        parseFlaps(element) {
            if (element === null) {
                return undefined;
            }
            const options = Array.from(element.querySelectorAll(':scope>Option'))
                .map(option => this.parseFlapsOption(option))
                .filter(option => option !== undefined);
            if (options.length === 0) {
                return undefined;
            }
            let defaultIndex = 0;
            const defaultOption = element.getAttribute('default');
            if (defaultOption !== null) {
                defaultIndex = options.findIndex(option => option.name === defaultOption);
                if (defaultIndex < 0) {
                    console.warn(`Invalid ToldConfig definition: unrecognized default flaps option '${defaultOption}', defaulting to the first defined option`);
                    defaultIndex = 0;
                }
            }
            return { defaultIndex, options };
        }
        /**
         * Parses a single flaps option from a configuration document element.
         * @param element A configuration document element.
         * @returns The flaps option defined by the configuration document element, or `undefined` if the element is malformed.
         */
        parseFlapsOption(element) {
            var _a;
            const name = element.textContent;
            if (name === null || name.length === 0) {
                console.warn('Invalid ToldConfig definition: missing or empty flaps option name, discarding option');
                return undefined;
            }
            const extension = Number((_a = element.getAttribute('extension')) !== null && _a !== void 0 ? _a : undefined);
            if (!isFinite(extension)) {
                console.warn(`Invalid ToldConfig definition: missing or unrecognized flaps option extension value for option '${name}', discarding option`);
                return undefined;
            }
            return { name, extension };
        }
        /**
         * Parses anti-ice options from a configuration document element.
         * @param element A configuration document element.
         * @returns The anti-ice options defined by the configuration document element, or `undefined` if the element is `null`.
         */
        parseAntiIce(element) {
            var _a;
            if (element === null) {
                return undefined;
            }
            const maxTemp = msfssdk.UnitType.CELSIUS.createNumber(Infinity);
            const maxTempAttr = element.getAttribute('max-temp');
            if (maxTempAttr !== null) {
                const maxTempValue = Number((_a = element.getAttribute('max-temp')) !== null && _a !== void 0 ? _a : undefined);
                if (!isFinite(maxTempValue)) {
                    console.warn('Invalid ToldConfig definition: unrecognized maximum anti-ice temperature, defaulting to no maximum');
                }
                else {
                    maxTemp.set(maxTempValue);
                }
            }
            return { maxTemp: maxTemp.readonly };
        }
        /**
         * Parses thrust reverser options from a configuration document element.
         * @param element A configuration document element.
         * @returns The thrust reverser options defined by the configuration document element, or `undefined` if the element is `null`.
         */
        parseThrustReverser(element) {
            if (element === null) {
                return undefined;
            }
            return {
                selectable: new ThrustReverserSelectableConfig(element)
            };
        }
        /**
         * Parses rolling takeoff options from a configuration document element.
         * @param element A configuration document element.
         * @returns The rolling takeoff options defined by the configuration document element, or `undefined` if the element is `null`.
         */
        parseRollingTakeoff(element) {
            if (element === null) {
                return undefined;
            }
            let defaultOption = false;
            const defaultString = element.getAttribute('default');
            switch (defaultString === null || defaultString === void 0 ? void 0 : defaultString.toLowerCase()) {
                case undefined:
                case 'false':
                    break;
                case 'true':
                    defaultOption = true;
                    break;
                default:
                    console.warn('Invalid ToldConfig definition: unrecognized default rolling takeoff option (must be true or false), defaulting to false');
            }
            return { defaultOption };
        }
        /**
         * Parses autothrottle options from a configuration document element.
         * @param element A configuration document element.
         * @returns The autothrottle options defined by the configuration document element, or `undefined` if the element is `null`.
         */
        parseAutothrottle(element) {
            if (element === null) {
                return undefined;
            }
            return { placeHolder: true };
        }
    }
    /**
     * A configuration object which defines selectable TOLD (takeoff/landing) performance calculation thrust reverser
     * settings.
     */
    class ThrustReverserSelectableConfig {
        /**
         * Creates a new ThrustReverserSelectableConfig from a configuration document element.
         * @param element A configuration document element.
         */
        constructor(element) {
            var _a, _b, _c, _d, _e;
            this.isResolvableConfig = true;
            this.conditions = new Map();
            if (element.tagName !== 'ThrustReverser') {
                throw new Error(`Invalid ThrustReverserSelectableConfig definition: expected tag name 'ThrustReverser' but was '${element.tagName}'`);
            }
            for (const conditionElement of element.querySelectorAll(':scope>Condition')) {
                const selectableString = (_b = (_a = conditionElement.textContent) === null || _a === void 0 ? void 0 : _a.toLowerCase()) !== null && _b !== void 0 ? _b : 'false';
                let selectable;
                switch (selectableString) {
                    case 'false':
                    case 'off':
                        selectable = exports.ToldThrustReverserSelectable.OnlyFalse;
                        break;
                    case 'true':
                    case 'on':
                        selectable = exports.ToldThrustReverserSelectable.OnlyTrue;
                        break;
                    case 'both':
                        selectable = exports.ToldThrustReverserSelectable.Both;
                        break;
                    default:
                        continue;
                }
                let surface;
                const surfaceString = (_c = conditionElement.getAttribute('surface')) === null || _c === void 0 ? void 0 : _c.toLowerCase();
                if (surfaceString === 'dry' || surfaceString === 'wet' || surfaceString === 'contaminated') {
                    surface = [surfaceString];
                }
                else {
                    surface = ['dry', 'wet', 'contaminated'];
                }
                const flaps = (_d = conditionElement.getAttribute('flaps')) !== null && _d !== void 0 ? _d : '';
                let antiIce;
                switch ((_e = conditionElement.getAttribute('anti-ice')) === null || _e === void 0 ? void 0 : _e.toLowerCase()) {
                    case 'false':
                    case 'off':
                        antiIce = ['false'];
                        break;
                    case 'true':
                    case 'on':
                        antiIce = ['true'];
                        break;
                    default:
                        antiIce = ['false', 'true'];
                }
                for (let i = 0; i < surface.length; i++) {
                    for (let j = 0; j < antiIce.length; j++) {
                        const key = `${surface[i]}::${antiIce[j]}::${flaps}`;
                        this.conditions.set(key, selectable);
                    }
                }
            }
        }
        /** @inheritdoc */
        resolve() {
            return (surface, flaps, antiIce) => {
                const key = `${ThrustReverserSelectableConfig.SURFACE_KEYS[surface]}::${antiIce !== null && antiIce !== void 0 ? antiIce : false}::${flaps !== null && flaps !== void 0 ? flaps : ''}`;
                let selectable = this.conditions.get(key);
                if (selectable !== undefined) {
                    return selectable;
                }
                if (flaps !== undefined) {
                    const anyFlapsKey = `${ThrustReverserSelectableConfig.SURFACE_KEYS[surface]}::${antiIce}::`;
                    selectable = this.conditions.get(anyFlapsKey);
                }
                return selectable !== null && selectable !== void 0 ? selectable : exports.ToldThrustReverserSelectable.Both;
            };
        }
    }
    ThrustReverserSelectableConfig.SURFACE_KEYS = {
        [exports.ToldRunwaySurfaceCondition.Dry]: 'dry',
        [exports.ToldRunwaySurfaceCondition.Wet]: 'wet',
    };

    /**
     * A configuration object which defines options related to performance calculations.
     */
    class PerformanceConfig {
        /**
         * Creates a new PerformanceConfig from a configuration document element.
         * @param element A configuration document element.
         */
        constructor(element) {
            var _a, _b;
            if (element === undefined) {
                this.weightLimits = this.parseWeightLimits(null);
                this.airframe = '';
            }
            else {
                if (element.tagName !== 'Performance') {
                    throw new Error(`Invalid PerformanceConfig definition: expected tag name 'Performance' but was '${element.tagName}'`);
                }
                this.weightLimits = this.parseWeightLimits(element.querySelector(':scope>Weights'));
                this.airframe = (_b = (_a = element.querySelector(':scope>Airframe')) === null || _a === void 0 ? void 0 : _a.textContent) !== null && _b !== void 0 ? _b : '';
                this.toldConfig = this.parseToldConfig(element.querySelector(':scope>TOLD'));
            }
            this.isToldSupported = this.toldConfig !== undefined;
        }
        /**
         * Parses weight limits from a configuration document element.
         * @param element A configuration document element.
         * @returns The weight limits defined by the configuration document element.
         */
        parseWeightLimits(element) {
            var _a, _b, _c, _d, _e, _f, _g;
            let basicEmpty = this.parseWeightLimit((_a = element === null || element === void 0 ? void 0 : element.querySelector('BasicEmpty')) !== null && _a !== void 0 ? _a : null);
            if (basicEmpty === undefined) {
                console.warn('Invalid PerformanceConfig definition: could not find basic empty weight, defaulting to zero');
                basicEmpty = msfssdk.UnitType.POUND.createNumber(0).readonly;
            }
            let maxRamp = this.parseWeightLimit((_b = element === null || element === void 0 ? void 0 : element.querySelector('MaxRamp')) !== null && _b !== void 0 ? _b : null);
            if (maxRamp === undefined) {
                console.warn('Invalid PerformanceConfig definition: could not find maximum ramp weight, defaulting to zero');
                maxRamp = msfssdk.UnitType.POUND.createNumber(0).readonly;
            }
            let maxTakeoff = this.parseWeightLimit((_c = element === null || element === void 0 ? void 0 : element.querySelector('MaxTakeoff')) !== null && _c !== void 0 ? _c : null);
            if (maxTakeoff === undefined) {
                console.warn('Invalid PerformanceConfig definition: could not find maximum takeoff weight, defaulting to zero');
                maxTakeoff = msfssdk.UnitType.POUND.createNumber(0).readonly;
            }
            let maxLanding = this.parseWeightLimit((_d = element === null || element === void 0 ? void 0 : element.querySelector('MaxLanding')) !== null && _d !== void 0 ? _d : null);
            if (maxLanding === undefined) {
                console.warn('Invalid PerformanceConfig definition: could not find maximum landing weight, defaulting to zero');
                maxLanding = msfssdk.UnitType.POUND.createNumber(0).readonly;
            }
            let maxZeroFuel = this.parseWeightLimit((_e = element === null || element === void 0 ? void 0 : element.querySelector('MaxZeroFuel')) !== null && _e !== void 0 ? _e : null);
            if (maxZeroFuel === undefined) {
                console.warn('Invalid PerformanceConfig definition: could not find maximum zero fuel weight, defaulting to zero');
                maxZeroFuel = msfssdk.UnitType.POUND.createNumber(0).readonly;
            }
            let maxPassengerCount = Number((_g = (_f = element === null || element === void 0 ? void 0 : element.querySelector('MaxPax')) === null || _f === void 0 ? void 0 : _f.textContent) !== null && _g !== void 0 ? _g : undefined);
            if (!Number.isInteger(maxPassengerCount) || maxPassengerCount < 0) {
                console.warn('Invalid PerformanceConfig definition: unrecognized maximum passenger count (must be a non-negative integer), defaulting to zero');
                maxPassengerCount = 0;
            }
            return { basicEmpty, maxRamp, maxTakeoff, maxLanding, maxZeroFuel, maxPassengerCount };
        }
        /**
         * Parses a single weight limit from a configuration document element.
         * @param element A configuration document element.
         * @returns The weight limit defined by the configuration document element, or `undefined` if the element is `null`.
         */
        parseWeightLimit(element) {
            var _a;
            if (element === null) {
                return undefined;
            }
            let unit;
            const unitString = element.getAttribute('unit');
            switch (unitString === null || unitString === void 0 ? void 0 : unitString.toLowerCase()) {
                case 'kg':
                case 'kgs':
                case 'kilogram':
                case 'kilograms':
                    unit = msfssdk.UnitType.KILOGRAM;
                    break;
                case 'lb':
                case 'lbs':
                case 'pound':
                case 'pounds':
                case undefined:
                    unit = msfssdk.UnitType.POUND;
                    break;
                default:
                    console.warn(`Invalid PerformanceConfig definition: unrecognized weight unit type for ${element.tagName}, defaulting to pounds`);
                    unit = msfssdk.UnitType.POUND;
            }
            let value = Number((_a = element.textContent) !== null && _a !== void 0 ? _a : undefined);
            if (!isFinite(value) || value < 0) {
                console.warn(`Invalid PerformanceConfig definition: unrecognized weight value for ${element.tagName} (must be a non-negative number), defaulting to zero`);
                value = 0;
            }
            return unit.createNumber(value).readonly;
        }
        /**
         * Parses a TOLD configuration object from a configuration document element.
         * @param element A configuration document element.
         * @returns The TOLD configuration defined by the configuration document element, or `undefined` if the element is `null`.
         */
        parseToldConfig(element) {
            if (element !== null) {
                try {
                    return new ToldConfig(element);
                }
                catch (e) {
                    console.warn(e);
                }
            }
            return undefined;
        }
    }

    /**
     * A configuration object which defines options related to the avionics' traffic system.
     */
    class TrafficConfig {
        /**
         * Creates a new TrafficConfig from a configuration document element.
         * @param baseInstrument The `BaseInstrument` element associated with the configuration.
         * @param element A configuration document element.
         */
        constructor(baseInstrument, element) {
            /** @inheritdoc */
            this.isResolvableConfig = true;
            if (element === undefined) {
                this.type = garminsdk.TrafficSystemType.Tis;
                this.supportAdsb = false;
            }
            else {
                if (element.tagName !== 'Traffic') {
                    throw new Error(`Invalid TrafficConfig definition: expected tag name 'Traffic' but was '${element.tagName}'`);
                }
                const type = element.getAttribute('type');
                switch (type) {
                    case garminsdk.TrafficSystemType.Tis:
                    case garminsdk.TrafficSystemType.Tas:
                    case garminsdk.TrafficSystemType.TcasII:
                        this.type = type;
                        break;
                    default:
                        this.type = garminsdk.TrafficSystemType.Tis;
                }
                const supportAdsb = element.getAttribute('ads-b');
                switch ((supportAdsb !== null && supportAdsb !== void 0 ? supportAdsb : 'false').toLowerCase()) {
                    case 'true':
                        this.supportAdsb = true;
                        break;
                    case 'false':
                        this.supportAdsb = false;
                        break;
                    default:
                        console.warn('Invalid TrafficConfig definition: unrecognized ads-b value (must be \'true\' or \'false\' - case-insensitive)');
                        this.supportAdsb = false;
                }
                const electricLogicElement = element.querySelector(':scope>Electric');
                this.electricity = electricLogicElement === null ? undefined : new CompositeLogicXMLElement(baseInstrument, electricLogicElement);
            }
        }
        /** @inheritdoc */
        resolve() {
            return (bus, tfcInstrument, initializationTime) => {
                let system;
                switch (this.type) {
                    case garminsdk.TrafficSystemType.Tis:
                        system = new garminsdk.TrafficInfoService(bus, tfcInstrument, true);
                        break;
                    case garminsdk.TrafficSystemType.Tas:
                        system = new garminsdk.TrafficAdvisorySystem(bus, tfcInstrument, this.supportAdsb ? new garminsdk.GarminAdsb(bus) : null, true);
                        break;
                    case garminsdk.TrafficSystemType.TcasII:
                        system = new garminsdk.GarminTcasII(bus, tfcInstrument, this.supportAdsb ? new garminsdk.GarminAdsb(bus) : null);
                        break;
                }
                return new garminsdk.TrafficAvionicsSystem(bus, system, this.electricity, initializationTime);
            };
        }
    }

    /**
     * A configuration object which defines a reference V-speed.
     */
    class VSpeedConfig {
        /**
         * Creates a new VSpeedConfig from a configuration document element.
         * @param element A configuration document element.
         */
        constructor(element) {
            this.isResolvableConfig = true;
            if (element.tagName !== 'VSpeed') {
                throw new Error(`Invalid VSpeedConfig definition: expected tag name 'VSpeed' but was '${element.tagName}'`);
            }
            const name = element.getAttribute('name');
            if (name === null) {
                throw new Error('Invalid VSpeedConfig definition: undefined name');
            }
            this.name = name;
            const value = element.textContent;
            if (value === null) {
                throw new Error('Invalid VSpeedConfig definition: undefined value');
            }
            const numberValue = Number(value);
            if (!isNaN(numberValue)) {
                this.defaultValue = numberValue < 1 ? -1 : Math.round(numberValue);
            }
            else if (Object.values(exports.VSpeedValueKey).includes(value)) {
                this.defaultValue = value;
            }
            else {
                throw new Error(`Invalid VSpeedConfig definition: unrecognized value ${value} (value must be a number or a valid reference speed key)`);
            }
        }
        /** @inheritdoc */
        resolve() {
            return {
                name: this.name,
                defaultValue: typeof this.defaultValue === 'number'
                    ? this.defaultValue
                    : Math.round(Simplane.getDesignSpeeds()[this.defaultValue])
            };
        }
    }

    /**
     * A configuration object which defines an airspeed tape color range.
     */
    class VSpeedGroupConfig {
        /**
         * Creates a new VSpeedGroupConfig from a configuration document element.
         * @param element A configuration document element.
         */
        constructor(element) {
            /** @inheritdoc */
            this.isResolvableConfig = true;
            if (element.tagName !== 'Group') {
                throw new Error(`Invalid VSpeedGroupConfig definition: expected tag name 'Group' but was '${element.tagName}'`);
            }
            const type = element.getAttribute('type');
            switch (type) {
                case exports.VSpeedGroupType.General:
                case exports.VSpeedGroupType.Takeoff:
                case exports.VSpeedGroupType.Landing:
                case exports.VSpeedGroupType.Configuration:
                    this.type = type;
                    break;
                default:
                    throw new Error(`Invalid VSpeedGroupConfig definition: unrecognized type '${type}'`);
            }
            const children = Array.from(element.querySelectorAll(':scope>VSpeed'));
            this.vSpeedDefinitions = children.map(child => {
                try {
                    return new VSpeedConfig(child).resolve();
                }
                catch (e) {
                    console.warn(e);
                    return null;
                }
            }).filter(val => val !== null);
            if (this.type === exports.VSpeedGroupType.Takeoff) {
                const maxIasString = element.getAttribute('max-ias');
                let maxIas;
                if (maxIasString !== null) {
                    maxIas = Math.round(Number(maxIasString));
                    if (!isFinite(maxIas) || maxIas <= 0) {
                        throw new Error('Invalid VSpeedGroupConfig definition: unrecognized max-ias value (must be a positive number)');
                    }
                }
                else {
                    maxIas = undefined;
                }
                this.maxIas = maxIas;
            }
            else if (this.type === exports.VSpeedGroupType.Configuration) {
                const maxAltitudeString = element.getAttribute('max-altitude');
                let maxAltitude;
                if (maxAltitudeString !== null) {
                    maxAltitude = Math.round(Number(maxAltitudeString));
                    if (!isFinite(maxAltitude) || maxAltitude <= 0) {
                        throw new Error('Invalid VSpeedGroupConfig definition: unrecognized max-altitude value (must be a positive number)');
                    }
                }
                else {
                    maxAltitude = undefined;
                }
                this.maxAltitude = maxAltitude;
            }
        }
        /** @inheritdoc */
        resolve() {
            switch (this.type) {
                case exports.VSpeedGroupType.Takeoff:
                    return {
                        type: this.type,
                        vSpeedDefinitions: Array.from(this.vSpeedDefinitions),
                        maxIas: this.maxIas
                    };
                case exports.VSpeedGroupType.Configuration:
                    return {
                        type: this.type,
                        vSpeedDefinitions: Array.from(this.vSpeedDefinitions),
                        maxAltitude: this.maxAltitude
                    };
                default:
                    return {
                        type: this.type,
                        vSpeedDefinitions: Array.from(this.vSpeedDefinitions)
                    };
            }
        }
    }

    /**
     * A configuration object which defines FMS options.
     */
    class FmsConfig {
        /**
         * Creates a new FmsConfig from a configuration document element.
         * @param element A configuration document element.
         */
        constructor(element) {
            if (element === undefined) {
                this.flightPathOptions = { maxBankAngle: FmsConfig.DEFAULT_MAX_BANK_ANGLE, lowBankAngle: FmsConfig.DEFAULT_LOW_BANK_ANGLE };
                this.approach = new FmsApproachConfig(undefined);
            }
            else {
                if (element.tagName !== 'Fms') {
                    throw new Error(`Invalid FmsConfig definition: expected tag name 'Fms' but was '${element.tagName}'`);
                }
                this.flightPathOptions = this.parseFlightPathOptions(element.querySelector(':scope>FlightPath'));
                this.approach = this.parseApproachConfig(element.querySelector(':scope>Approach'));
            }
        }
        /**
         * Parses flight path calculation options from a configuration document element.
         * @param element A configuration document element.
         * @returns The flight path calculation options defined by the configuration document element.
         */
        parseFlightPathOptions(element) {
            var _a, _b;
            if (element !== null) {
                let maxBankAngle = Number((_a = element.getAttribute('max-bank')) !== null && _a !== void 0 ? _a : undefined);
                if (isNaN(maxBankAngle) || maxBankAngle < 0 || maxBankAngle > 40) {
                    console.warn('Invalid FmsConfig definition: missing or unrecognized max-bank value (expected a non-negative number less than or equal to 40). Defaulting to 25.');
                    maxBankAngle = FmsConfig.DEFAULT_MAX_BANK_ANGLE;
                }
                let lowBankAngle = Number((_b = element.getAttribute('low-bank')) !== null && _b !== void 0 ? _b : undefined);
                if (isNaN(lowBankAngle) || lowBankAngle < 0 || maxBankAngle > 40) {
                    console.warn('Invalid FmsConfig definition: missing or unrecognized low-bank value (expected a non-negative number less than or equal to 40). Defaulting to 12.');
                    lowBankAngle = FmsConfig.DEFAULT_LOW_BANK_ANGLE;
                }
                return { maxBankAngle, lowBankAngle };
            }
            return { maxBankAngle: FmsConfig.DEFAULT_MAX_BANK_ANGLE, lowBankAngle: FmsConfig.DEFAULT_LOW_BANK_ANGLE };
        }
        /**
         * Parses an approach configuration object from a configuration document element.
         * @param element A configuration document element.
         * @returns The approach configuration defined by the configuration document element.
         */
        parseApproachConfig(element) {
            if (element !== null) {
                try {
                    return new FmsApproachConfig(element);
                }
                catch (e) {
                    console.warn(e);
                }
            }
            return new FmsApproachConfig(undefined);
        }
    }
    FmsConfig.DEFAULT_MAX_BANK_ANGLE = 25;
    FmsConfig.DEFAULT_LOW_BANK_ANGLE = 12;
    /**
     * A configuration object which defines FMS approach options.
     */
    class FmsApproachConfig {
        /**
         * Creates a new FmsApproachConfig from a configuration document element.
         * @param element A configuration document element.
         */
        constructor(element) {
            if (element === undefined) {
                this.supportRnpAr = false;
                this.visualApproachOptions = { finalFixDistance: 2.5, strghtFixDistance: 5 };
            }
            else {
                if (element.tagName !== 'Approach') {
                    throw new Error(`Invalid FmsApproachConfig definition: expected tag name 'Approach' but was '${element.tagName}'`);
                }
                const rnpAr = element.getAttribute('rnp-ar');
                switch (rnpAr === null || rnpAr === void 0 ? void 0 : rnpAr.toLowerCase()) {
                    case 'true':
                        this.supportRnpAr = true;
                        break;
                    case 'false':
                        this.supportRnpAr = false;
                        break;
                    default:
                        console.warn('Invalid FmsApproachConfig definition: unrecognized rnp-ar option (expected \'true\' or \'false\'). Defaulting to false.');
                        this.supportRnpAr = false;
                }
                this.visualApproachOptions = this.parseVisualApproachOptions(element.querySelector(':scope>Visual'));
            }
        }
        /**
         * Parses a visual approach options from a configuration document element.
         * @param element A configuration document element.
         * @returns The visual approach options defined by the configuration document element.
         */
        parseVisualApproachOptions(element) {
            const opts = { finalFixDistance: 2.5, strghtFixDistance: 2.5 };
            if (element !== null) {
                const finalDistanceText = element.getAttribute('final-dist');
                if (finalDistanceText !== null) {
                    const finalDistance = Number(finalDistanceText);
                    if (isFinite(finalDistance) && finalDistance > 0) {
                        opts.finalFixDistance = finalDistance;
                    }
                    else {
                        console.warn('Invalid FmsApproachConfig definition: unrecognized visual approach final-dist option (expected a positive number). Defaulting to 2.5.');
                    }
                }
                const strghtDistanceText = element.getAttribute('strght-dist');
                if (strghtDistanceText !== null) {
                    const strghtDistance = Number(strghtDistanceText);
                    if (isFinite(strghtDistance) && strghtDistance > 0) {
                        opts.strghtFixDistance = strghtDistance;
                    }
                    else {
                        console.warn('Invalid FmsApproachConfig definition: unrecognized visual approach strght-dist option (expected a positive number greater than the final fix distance). Defaulting to 2.5.');
                    }
                }
            }
            return opts;
        }
    }

    /**
     * A configuration object which defines options related to IAUs.
     */
    class IauDefsConfig {
        /**
         * Creates a new IauDefsConfig from a configuration document element.
         * @param baseInstrument The `BaseInstrument` element associated with the configuration.
         * @param element A configuration document element.
         */
        constructor(baseInstrument, element) {
            if (element === undefined) {
                this.count = 1;
                this.definitions = [undefined, new IauConfig(baseInstrument, undefined)];
            }
            else {
                if (element.tagName !== 'IauDefs') {
                    throw new Error(`Invalid IauDefsConfig definition: expected tag name 'IauDefs' but was '${element.tagName}'`);
                }
                const count = Number(element.getAttribute('count'));
                if (!Number.isInteger(count) || count < 1) {
                    console.warn('Invalid IauDefsConfig definition: unrecognized IAU count (must be a positive integer)');
                    this.count = 1;
                }
                else {
                    this.count = count;
                }
                this.definitions = this.parseDefinitions(baseInstrument, element);
            }
        }
        /**
         * Parses IAU definitions from a configuration document element.
         * @param baseInstrument The `BaseInstrument` element associated with the configuration.
         * @param element A configuration document element.
         * @returns An array of IAU definitions defined by the configuration document element.
         */
        parseDefinitions(baseInstrument, element) {
            const elements = element.querySelectorAll(':scope>Iau');
            const defs = [];
            for (const iauElement of elements) {
                try {
                    const def = new IauConfig(baseInstrument, iauElement);
                    defs[def.index] = def;
                }
                catch (_a) {
                    // noop
                }
            }
            // Set defaults for indexes that don't have definitions
            for (let i = 1; i <= this.count; i++) {
                if (defs[i] === undefined) {
                    defs[i] = new IauConfig(baseInstrument, undefined, i);
                }
            }
            return defs;
        }
    }
    /**
     * A configuration object which defines options related to an IAU.
     */
    class IauConfig {
        /**
         * Creates a new IauConfig from a configuration document element.
         * @param baseInstrument The `BaseInstrument` element associated with the configuration.
         * @param element A configuration document element.
         * @param defaultIndex The IAU index to assign to the config if one cannot be parsed from the configuration document
         * element. Defaults to `1`.
         */
        constructor(baseInstrument, element, defaultIndex = 1) {
            var _a;
            defaultIndex = Math.max(1, Math.trunc(defaultIndex));
            if (element === undefined) {
                this.index = defaultIndex;
                this.defaultAdcIndex = 1;
                this.defaultAhrsIndex = 1;
                this.altimeterIndex = 1;
                this.supportBaroPreselect = false;
                this.gpsDefinition = {};
                this.fmsPosDefinition = {};
            }
            else {
                if (element.tagName !== 'Iau') {
                    throw new Error(`Invalid IauConfig definition: expected tag name 'Iau' but was '${element.tagName}'`);
                }
                const index = Number(element.getAttribute('index'));
                if (!Number.isInteger(index) || index < 1) {
                    console.warn(`Invalid IauConfig definition: unrecognized index (must be a positive integer). Defaulting to ${defaultIndex}.`);
                    this.index = defaultIndex;
                }
                else {
                    this.index = index;
                }
                const defaultAdcIndex = Number(element.getAttribute('default-adc'));
                if (!Number.isInteger(defaultAdcIndex) || defaultAdcIndex < 1) {
                    console.warn('Invalid IauConfig definition: unrecognized default ADC index (must be a positive integer). Defaulting to 1.');
                    this.defaultAdcIndex = 1;
                }
                else {
                    this.defaultAdcIndex = defaultAdcIndex;
                }
                const defaultAhrsIndex = Number(element.getAttribute('default-ahrs'));
                if (!Number.isInteger(defaultAhrsIndex) || defaultAhrsIndex < 1) {
                    console.warn('Invalid IauConfig definition: unrecognized default AHRS index (must be a positive integer). Defaulting to 1.');
                    this.defaultAhrsIndex = 1;
                }
                else {
                    this.defaultAhrsIndex = defaultAhrsIndex;
                }
                const altimeterIndex = Number(element.getAttribute('altimeter-source'));
                if (!Number.isInteger(altimeterIndex) || altimeterIndex < 1) {
                    console.warn('Invalid IauConfig definition: unrecognized altimeter index (must be a positive integer). Defaulting to 1.');
                    this.altimeterIndex = 1;
                }
                else {
                    this.altimeterIndex = altimeterIndex;
                }
                const baroPreselect = (_a = element.getAttribute('baro-preselect')) === null || _a === void 0 ? void 0 : _a.toLowerCase();
                switch (baroPreselect) {
                    case 'true':
                        this.supportBaroPreselect = true;
                        break;
                    case 'false':
                        this.supportBaroPreselect = false;
                        break;
                    case undefined:
                        this.supportBaroPreselect = false;
                        break;
                    default:
                        console.warn('Invalid IauConfig definition: invalid baro-preselect option (must be true or false). Defaulting to false.');
                        this.supportBaroPreselect = false;
                }
                this.gpsDefinition = this.parseGpsDefinition(baseInstrument, element);
                this.fmsPosDefinition = this.parseFmsPositionDefinition(baseInstrument, element);
            }
        }
        /**
         * Parses a GPS receiver definition from a configuration document element.
         * @param baseInstrument The `BaseInstrument` element associated with the configuration.
         * @param element A configuration document element.
         * @returns The GPS receiver definition defined by the configuration document element.
         */
        parseGpsDefinition(baseInstrument, element) {
            const gpsElement = element.querySelector(':scope>Gps');
            const def = {};
            if (gpsElement) {
                const electricLogicElement = gpsElement.querySelector(':scope>Electric');
                def.electricity = electricLogicElement === null ? undefined : new CompositeLogicXMLElement(baseInstrument, electricLogicElement);
            }
            return def;
        }
        /**
         * Parses a FMS geo-positioning system definition from a configuration document element.
         * @param baseInstrument The `BaseInstrument` element associated with the configuration.
         * @param element A configuration document element.
         * @returns The geo-positioning system definition defined by the configuration document element.
         */
        parseFmsPositionDefinition(baseInstrument, element) {
            const fmsPosElement = element.querySelector(':scope>FmsPosition');
            const def = {};
            if (fmsPosElement) {
                const electricLogicElement = fmsPosElement.querySelector(':scope>Electric');
                def.electricity = electricLogicElement === null ? undefined : new CompositeLogicXMLElement(baseInstrument, electricLogicElement);
            }
            return def;
        }
    }

    /**
     * A configuration object which defines options related to radios.
     */
    class RadiosConfig {
        /**
         * Creates a new RadiosConfig from a configuration document element.
         * @param baseInstrument The `BaseInstrument` element associated with the configuration.
         * @param element A configuration document element.
         */
        constructor(baseInstrument, element) {
            /** The number of com radios supported by the plane. */
            this.comCount = 2;
            /** The number of nav radios supported by the plane. */
            this.navCount = 2;
            if (element === undefined) {
                this.dmeCount = 0;
                this.adfCount = 0;
                this.comDefinitions = [undefined, {}, {}];
                this.navDefinitions = [undefined, {}, {}];
                this.dmeDefinitions = [];
                this.adfDefinitions = [];
            }
            else {
                if (element.tagName !== 'Radios') {
                    throw new Error(`Invalid RadiosConfig definition: expected tag name 'Radios' but was '${element.tagName}'`);
                }
                const dmeCount = Number(element.getAttribute('dme-count'));
                if (!Number.isInteger(dmeCount) || dmeCount < 1 || dmeCount > 2) {
                    console.warn('Invalid RadiosConfig definition: unrecognized DME radio count (must be 0, 1, or 2)');
                    this.dmeCount = 0;
                }
                else {
                    this.dmeCount = dmeCount;
                }
                const adfCount = Number(element.getAttribute('adf-count'));
                if (!Number.isInteger(adfCount) || adfCount < 1) {
                    console.warn('Invalid RadiosConfig definition: unrecognized ADF radio count (must be 0, 1, or 2)');
                    this.adfCount = 0;
                }
                else {
                    this.adfCount = adfCount;
                }
                this.comDefinitions = this.parseComDefinitions(baseInstrument, element);
                this.navDefinitions = this.parseNavDefinitions(baseInstrument, element);
                this.dmeDefinitions = this.parseDmeDefinitions(baseInstrument, element);
                this.adfDefinitions = this.parseAdfDefinitions(baseInstrument, element);
            }
        }
        /**
         * Parses com radio definitions from a configuration document element.
         * @param baseInstrument The `BaseInstrument` element associated with the configuration.
         * @param element A configuration document element.
         * @returns An array of com radio definitions defined by the configuration document element.
         */
        parseComDefinitions(baseInstrument, element) {
            const comElements = element.querySelectorAll(':scope>Com');
            const defs = [];
            for (const comElement of comElements) {
                const index = Number(comElement.getAttribute('index'));
                if (!Number.isInteger(index) || index < 1 || index > this.comCount) {
                    console.warn('Invalid RadiosConfig definition: unrecognized com radio index (must be 1 or 2)');
                    continue;
                }
                const electricLogicElement = comElement.querySelector(':scope>Electric');
                defs[index] = {
                    electricity: electricLogicElement === null ? undefined : new CompositeLogicXMLElement(baseInstrument, electricLogicElement)
                };
            }
            // Set defaults for indexes that don't have definitions
            for (let i = 1; i <= this.comCount; i++) {
                if (defs[i] === undefined) {
                    defs[i] = {};
                }
            }
            return defs;
        }
        /**
         * Parses nav radio definitions from a configuration document element.
         * @param baseInstrument The `BaseInstrument` element associated with the configuration.
         * @param element A configuration document element.
         * @returns An array of nav radio definitions defined by the configuration document element.
         */
        parseNavDefinitions(baseInstrument, element) {
            const navElements = element.querySelectorAll(':scope>Nav');
            const defs = [];
            for (const navElement of navElements) {
                const index = Number(navElement.getAttribute('index'));
                if (!Number.isInteger(index) || index < 1 || index > this.navCount) {
                    console.warn('Invalid RadiosConfig definition: unrecognized nav radio index (must be 1 or 2)');
                    continue;
                }
                const electricLogicElement = navElement.querySelector(':scope>Electric');
                defs[index] = {
                    electricity: electricLogicElement === null ? undefined : new CompositeLogicXMLElement(baseInstrument, electricLogicElement)
                };
            }
            // Set defaults for indexes that don't have definitions
            for (let i = 1; i <= this.navCount; i++) {
                if (defs[i] === undefined) {
                    defs[i] = {};
                }
            }
            return defs;
        }
        /**
         * Parses DME radio definitions from a configuration document element.
         * @param baseInstrument The `BaseInstrument` element associated with the configuration.
         * @param element A configuration document element.
         * @returns An array of DME radio definitions defined by the configuration document element.
         */
        parseDmeDefinitions(baseInstrument, element) {
            const dmeElements = element.querySelectorAll(':scope>Dme');
            const defs = [];
            for (const dmeElement of dmeElements) {
                const index = Number(dmeElement.getAttribute('index'));
                if (!Number.isInteger(index) || index < 1 || index > this.dmeCount) {
                    console.warn('Invalid RadiosConfig definition: unrecognized DME radio index (must be between 1 and the number of supported DME radios)');
                    continue;
                }
                const electricLogicElement = dmeElement.querySelector(':scope>Electric');
                defs[index] = {
                    electricity: electricLogicElement === null ? undefined : new CompositeLogicXMLElement(baseInstrument, electricLogicElement)
                };
            }
            // Set defaults for indexes that don't have definitions
            for (let i = 1; i <= this.dmeCount; i++) {
                if (defs[i] === undefined) {
                    defs[i] = {};
                }
            }
            return defs;
        }
        /**
         * Parses ADF radio definitions from a configuration document element.
         * @param baseInstrument The `BaseInstrument` element associated with the configuration.
         * @param element A configuration document element.
         * @returns An array of ADF radio definitions defined by the configuration document element.
         */
        parseAdfDefinitions(baseInstrument, element) {
            const adfElements = element.querySelectorAll(':scope>Adf');
            const defs = [];
            for (const adfElement of adfElements) {
                const index = Number(adfElement.getAttribute('index'));
                if (!Number.isInteger(index) || index < 1 || index > this.dmeCount) {
                    console.warn('Invalid RadiosConfig definition: unrecognized ADF radio index (must be between 1 and the number of supported ADF radios)');
                    continue;
                }
                const electricLogicElement = adfElement.querySelector(':scope>Electric');
                defs[index] = {
                    electricity: electricLogicElement === null ? undefined : new CompositeLogicXMLElement(baseInstrument, electricLogicElement)
                };
            }
            // Set defaults for indexes that don't have definitions
            for (let i = 1; i <= this.adfCount; i++) {
                if (defs[i] === undefined) {
                    defs[i] = {};
                }
            }
            return defs;
        }
    }

    /**
     * A configuration object which defines options related to various aircraft sensors.
     */
    class SensorsConfig {
        /**
         * Creates a new SensorsConfig from a configuration document element.
         * @param baseInstrument The `BaseInstrument` element associated with the configuration.
         * @param element A configuration document element.
         */
        constructor(baseInstrument, element) {
            if (element === undefined) {
                this.adcCount = 1;
                this.ahrsCount = 1;
                this.adcDefinitions = [undefined, { airspeedIndicatorIndex: 1 }];
                this.ahrsDefinitions = [undefined, { attitudeIndicatorIndex: 1, directionIndicatorIndex: 1 }];
                this.aoaDefinition = {};
                this.radarAltimeterDefinition = undefined;
                this.markerBeaconDefinition = {};
                this.weatherRadarDefinition = undefined;
            }
            else {
                if (element.tagName !== 'Sensors') {
                    throw new Error(`Invalid SensorsConfig definition: expected tag name 'Sensors' but was '${element.tagName}'`);
                }
                const adcCount = Number(element.getAttribute('adc-count'));
                if (!Number.isInteger(adcCount) || adcCount < 1) {
                    console.warn('Invalid SensorsConfig definition: unrecognized ADC count (must be a positive integer)');
                    this.adcCount = 1;
                }
                else {
                    this.adcCount = adcCount;
                }
                const ahrsCount = Number(element.getAttribute('ahrs-count'));
                if (!Number.isInteger(ahrsCount) || ahrsCount < 1) {
                    console.warn('Invalid SensorsConfig definition: unrecognized AHRS count (must be a positive integer)');
                    this.ahrsCount = 1;
                }
                else {
                    this.ahrsCount = ahrsCount;
                }
                this.adcDefinitions = this.parseAdcDefinitions(baseInstrument, element);
                this.ahrsDefinitions = this.parseAhrsDefinitions(baseInstrument, element);
                this.aoaDefinition = this.parseAoaDefinition(baseInstrument, element);
                this.radarAltimeterDefinition = this.parseRadarAltimeterDefinition(baseInstrument, element);
                this.markerBeaconDefinition = this.parseMarkerBeaconDefinition(baseInstrument, element);
                this.weatherRadarDefinition = this.parseWeatherRadarDefinition(baseInstrument, element);
            }
        }
        // eslint-disable-next-line jsdoc/require-returns
        /** Whether this configuration defines a radar altimeter. */
        get hasRadarAltimeter() {
            return this.radarAltimeterDefinition !== undefined;
        }
        // eslint-disable-next-line jsdoc/require-returns
        /** Whether this configuration defines a weather radar. */
        get hasWeatherRadar() {
            return this.weatherRadarDefinition !== undefined;
        }
        /**
         * Parses ADC definitions from a configuration document element.
         * @param baseInstrument The `BaseInstrument` element associated with the configuration.
         * @param element A configuration document element.
         * @returns An array of ADC definitions defined by the configuration document element.
         */
        parseAdcDefinitions(baseInstrument, element) {
            const adcElements = element.querySelectorAll(':scope>Adc');
            const defs = [];
            for (const adcElement of adcElements) {
                const index = Number(adcElement.getAttribute('index'));
                if (!Number.isInteger(index) || index < 1 || index > this.adcCount) {
                    console.warn('Invalid SensorsConfig definition: unrecognized ADC index (must be an integer between 1 and the number of supported ADCs)');
                    continue;
                }
                const airspeedIndicatorIndex = Number(adcElement.getAttribute('airspeed-indicator'));
                if (!Number.isInteger(airspeedIndicatorIndex) || airspeedIndicatorIndex < 1) {
                    console.warn('Invalid SensorsConfig definition: unrecognized airspeed indicator index (must be a positive integer)');
                    continue;
                }
                const electricLogicElement = adcElement.querySelector(':scope>Electric');
                defs[index] = {
                    airspeedIndicatorIndex,
                    electricity: electricLogicElement === null ? undefined : new CompositeLogicXMLElement(baseInstrument, electricLogicElement)
                };
            }
            // Set defaults for indexes that don't have definitions
            for (let i = 1; i <= this.adcCount; i++) {
                if (defs[i] === undefined) {
                    defs[i] = {
                        airspeedIndicatorIndex: i
                    };
                }
            }
            return defs;
        }
        /**
         * Parses AHRS definitions from a configuration document element.
         * @param baseInstrument The `BaseInstrument` element associated with the configuration.
         * @param element A configuration document element.
         * @returns An array of AHRS definitions defined by the configuration document element.
         */
        parseAhrsDefinitions(baseInstrument, element) {
            const ahrsElements = element.querySelectorAll(':scope>Ahrs');
            const defs = [];
            for (const ahrsElement of ahrsElements) {
                const index = Number(ahrsElement.getAttribute('index'));
                if (!Number.isInteger(index) || index < 1 || index > this.ahrsCount) {
                    console.warn('Invalid SensorsConfig definition: unrecognized AHRS index (must be an integer between 1 and the number of supported AHRS)');
                    continue;
                }
                const attitudeIndicatorIndex = Number(ahrsElement.getAttribute('attitude-indicator'));
                if (!Number.isInteger(attitudeIndicatorIndex) || attitudeIndicatorIndex < 1) {
                    console.warn('Invalid SensorsConfig definition: unrecognized attitude indicator index (must be a positive integer)');
                    continue;
                }
                const directionIndicatorIndex = Number(ahrsElement.getAttribute('direction-indicator'));
                if (!Number.isInteger(directionIndicatorIndex) || directionIndicatorIndex < 1) {
                    console.warn('Invalid SensorsConfig definition: unrecognized direction indicator index (must be a positive integer)');
                    continue;
                }
                const electricLogicElement = ahrsElement.querySelector(':scope>Electric');
                defs[index] = {
                    attitudeIndicatorIndex,
                    directionIndicatorIndex,
                    electricity: electricLogicElement === null ? undefined : new CompositeLogicXMLElement(baseInstrument, electricLogicElement)
                };
            }
            // Set defaults for indexes that don't have definitions
            for (let i = 1; i <= this.adcCount; i++) {
                if (defs[i] === undefined) {
                    defs[i] = {
                        attitudeIndicatorIndex: i,
                        directionIndicatorIndex: i
                    };
                }
            }
            return defs;
        }
        /**
         * Parses an angle of attack computer definition from a configuration document element.
         * @param baseInstrument The `BaseInstrument` element associated with the configuration.
         * @param element A configuration document element.
         * @returns The angle of attack computer definition defined by the configuration document element, or `undefined` if
         * there is no such definition.
         */
        parseAoaDefinition(baseInstrument, element) {
            const aoaElement = element.querySelector(':scope>Aoa');
            if (aoaElement === null) {
                return {};
            }
            const electricLogicElement = aoaElement.querySelector(':scope>Electric');
            return {
                electricity: electricLogicElement === null ? undefined : new CompositeLogicXMLElement(baseInstrument, electricLogicElement)
            };
        }
        /**
         * Parses a radar altimeter definition from a configuration document element.
         * @param baseInstrument The `BaseInstrument` element associated with the configuration.
         * @param element A configuration document element.
         * @returns The radar altimeter definition defined by the configuration document element, or `undefined` if there is
         * no such definition.
         */
        parseRadarAltimeterDefinition(baseInstrument, element) {
            const radarAltimeterElement = element.querySelector(':scope>RadarAltimeter');
            if (radarAltimeterElement === null) {
                return undefined;
            }
            const electricLogicElement = radarAltimeterElement.querySelector(':scope>Electric');
            return {
                electricity: electricLogicElement === null ? undefined : new CompositeLogicXMLElement(baseInstrument, electricLogicElement)
            };
        }
        /**
         * Parses a marker beacon receiver definition from a configuration document element.
         * @param baseInstrument The `BaseInstrument` element associated with the configuration.
         * @param element A configuration document element.
         * @returns The marker beacon receiver definition defined by the configuration document element, or `undefined` if
         * there is no such definition.
         */
        parseMarkerBeaconDefinition(baseInstrument, element) {
            var _a;
            const markerBeaconElement = element.querySelector(':scope>MarkerBeacon');
            const electricLogicElement = (_a = markerBeaconElement === null || markerBeaconElement === void 0 ? void 0 : markerBeaconElement.querySelector(':scope>Electric')) !== null && _a !== void 0 ? _a : null;
            return {
                electricity: electricLogicElement === null ? undefined : new CompositeLogicXMLElement(baseInstrument, electricLogicElement)
            };
        }
        /**
         * Parses a weather radar definition from a configuration document element.
         * @param baseInstrument The `BaseInstrument` element associated with the configuration.
         * @param element A configuration document element.
         * @returns The weather radar definition defined by the configuration document element, or `undefined` if there is
         * no such definition.
         */
        parseWeatherRadarDefinition(baseInstrument, element) {
            const weatherRadarElement = element.querySelector(':scope>WeatherRadar');
            if (weatherRadarElement === null) {
                return undefined;
            }
            let horizontalScanWidth = Number(weatherRadarElement.getAttribute('horiz-scan-width'));
            if (isNaN(horizontalScanWidth) || horizontalScanWidth < 60 || horizontalScanWidth > 120) {
                console.warn('Invalid SensorsConfig definition: unrecognized weather radar scan width (must be a number between 60 and 120). Defaulting to 90.');
                horizontalScanWidth = 90;
            }
            let supportExtendedColors;
            const colors = weatherRadarElement.getAttribute('colors');
            switch (colors === null || colors === void 0 ? void 0 : colors.toLowerCase()) {
                case undefined:
                case 'standard':
                    supportExtendedColors = false;
                    break;
                case 'extended':
                    supportExtendedColors = true;
                    break;
                default:
                    console.warn('Invalid SensorsConfig definition: unrecognized weather radar colors option (must be either \'standard\' or \'extended\'). Defaulting to standard.');
                    supportExtendedColors = false;
            }
            const electricLogicElement = weatherRadarElement.querySelector(':scope>Electric');
            return {
                horizontalScanWidth,
                supportExtendedColors,
                electricity: electricLogicElement === null ? undefined : new CompositeLogicXMLElement(baseInstrument, electricLogicElement)
            };
        }
    }

    /**
     * A configuration object which defines options related to VNAV.
     */
    class VNavConfig {
        /**
         * Creates a new RadiosConfig from a configuration document element.
         * @param baseInstrument The `BaseInstrument` element associated with the configuration.
         * @param element A configuration document element.
         */
        constructor(baseInstrument, element) {
            if (element === undefined) {
                this.advanced = false;
            }
            else {
                if (element.tagName !== 'VNAV') {
                    throw new Error(`Invalid VNavConfig definition: expected tag name 'VNAV' but was '${element.tagName}'`);
                }
                const advanced = element.getAttribute('advanced');
                switch (advanced === null || advanced === void 0 ? void 0 : advanced.toLowerCase()) {
                    case 'true':
                        this.advanced = true;
                        break;
                    case 'false':
                        this.advanced = false;
                        break;
                    default:
                        console.warn('Invalid VNavConfig definition: unrecognized advanced option (expected \'true\' or \'false\'). Defaulting to false.');
                        this.advanced = false;
                }
                if (this.advanced) {
                    this.fmsSpeeds = this.parseFmsSpeeds(baseInstrument, element.querySelector(':scope>FmsSpeeds'));
                }
            }
        }
        /**
         * Parses the advanced VNAV option from a configuration document element.
         * @param baseInstrument The `BaseInstrument` element associated with the configuration.
         * @param element A configuration document element.
         * @returns Whether advanced VNAV is enabled.
         */
        parseFmsSpeeds(baseInstrument, element) {
            if (element !== null) {
                try {
                    return new FmsSpeedsConfig(baseInstrument, element);
                }
                catch (e) {
                    console.warn(e);
                }
            }
            return new FmsSpeedsConfig(baseInstrument, undefined);
        }
    }
    /**
     * A configuration object which defines options related to FMS speeds.
     */
    class FmsSpeedsConfig {
        /**
         * Creates a new RadiosConfig from a configuration document element.
         * @param baseInstrument The `BaseInstrument` element associated with the configuration.
         * @param element A configuration document element.
         */
        constructor(baseInstrument, element) {
            const designSpeeds = Simplane.getDesignSpeeds();
            this.generalLimits = {
                minimumIas: Math.round(designSpeeds.VS0),
                maximumIas: Math.round(designSpeeds.VNe),
                minimumMach: 0.2,
                maximumMach: 0.83 
            };
            if (element === undefined) {
                this.airframeLimits = this.parseAirframeLimits(null);
                this.configurationSpeeds = [];
                this.climbSchedules = [];
                this.cruiseSchedules = [];
                this.descentSchedules = [];
            }
            else {
                if (element.tagName !== 'FmsSpeeds') {
                    throw new Error(`Invalid FmsSpeedsConfig definition: expected tag name 'FmsSpeeds' but was '${element.tagName}'`);
                }
                this.parseGeneralLimits(element.querySelector(':scope>GeneralLimits'), this.generalLimits);
                this.airframeLimits = this.parseAirframeLimits(element.querySelector(':scope>AirframeLimits'));
                this.configurationSpeeds = this.parseConfigurationSpeeds(element.querySelector(':scope>ConfigurationSpeeds'));
                const schedules = element.querySelector(':scope>Schedules');
                this.climbSchedules = this.parseClimbSchedules(schedules);
                this.cruiseSchedules = this.parseCruiseSchedules(schedules);
                this.descentSchedules = this.parseDescentSchedules(schedules);
            }
        }
        /**
         * Parses general speed limits options from a configuration document element.
         * @param element A configuration document element.
         * @param limits The object to which to write the parsed options.
         */
        parseGeneralLimits(element, limits) {
            var _a, _b, _c, _d, _e, _f, _g, _h;
            if (element === null) {
                return;
            }
            const minimumIas = Math.round(Number((_b = (_a = element.querySelector(':scope>Ias>Minimum')) === null || _a === void 0 ? void 0 : _a.textContent) !== null && _b !== void 0 ? _b : undefined));
            if (isNaN(minimumIas) || minimumIas < 1 || minimumIas > 999) {
                console.warn('Invalid FmsSpeedsConfig definition: unrecognized minimum IAS value (expected a number between 1 and 999)');
            }
            else {
                limits.minimumIas = minimumIas;
            }
            const maximumIas = Math.round(Number((_d = (_c = element.querySelector(':scope>Ias>Maximum')) === null || _c === void 0 ? void 0 : _c.textContent) !== null && _d !== void 0 ? _d : undefined));
            if (isNaN(maximumIas) || maximumIas <= limits.minimumIas || maximumIas > 999) {
                console.warn('Invalid FmsSpeedsConfig definition: unrecognized maximum IAS value (expected a number between the minimum IAS value and 999)');
            }
            else {
                limits.maximumIas = maximumIas;
            }
            const minimumMach = msfssdk.MathUtils.round(Number((_f = (_e = element.querySelector(':scope>Mach>Minimum')) === null || _e === void 0 ? void 0 : _e.textContent) !== null && _f !== void 0 ? _f : undefined), 0.01);
            if (isNaN(minimumMach) || minimumMach < 0.01 || minimumMach > 0.99) {
                console.warn('Invalid FmsSpeedsConfig definition: unrecognized minimum mach value (expected a number between 0.01 and 0.99)');
            }
            else {
                limits.minimumMach = minimumMach;
            }
            const maximumMach = msfssdk.MathUtils.round(Number((_h = (_g = element.querySelector(':scope>Mach>Maximum')) === null || _g === void 0 ? void 0 : _g.textContent) !== null && _h !== void 0 ? _h : undefined), 0.01);
            if (isNaN(maximumMach) || maximumMach <= limits.minimumMach || maximumMach > 0.99) {
                console.warn('Invalid FmsSpeedsConfig definition: unrecognized maximum mach value (expected a number between the minimum mach value and 0.99)');
            }
            else {
                limits.maximumMach = maximumMach;
            }
        }
        /**
         * Parses airframe speed limits options from a configuration document element.
         * @param element A configuration document element.
         * @returns The airframe speed limit options defined by the configuration document element.
         */
        parseAirframeLimits(element) {
            const ias = element === null || element === void 0 ? void 0 : element.querySelector(':scope>Ias');
            const mach = element === null || element === void 0 ? void 0 : element.querySelector(':scope>Mach');
            return {
                ias: new FmsAirframeSpeedLimitConfig(ias !== null && ias !== void 0 ? ias : this.generalLimits.maximumIas),
                mach: new FmsAirframeSpeedLimitConfig(mach !== null && mach !== void 0 ? mach : this.generalLimits.maximumMach)
            };
        }
        /**
         * Parses aircraft configuration speed limit definitions from a configuration document element.
         * @param element A configuration document element.
         * @returns The aircraft configuration speed limit definitions defined by the configuration document element.
         */
        parseConfigurationSpeeds(element) {
            if (element === null) {
                return [];
            }
            let hasGear = false;
            let flapsExtension = -1;
            return Array.from(element.children)
                .filter(child => child.tagName === 'Flaps' || child.tagName === 'Gear')
                .map(child => {
                    var _a, _b, _c, _d;
                    const name = child.getAttribute('name');
                    if (name === null) {
                        console.warn('Invalid FmsSpeedsConfig definition: missing configuration speed limit name');
                        return null;
                    }
                    const extension = Number((_a = child.getAttribute('extension')) !== null && _a !== void 0 ? _a : undefined);
                    if (isNaN(extension) || extension < 0) {
                        console.warn('Invalid FmsSpeedsConfig definition: missing or unrecognized configuration speed limit extension value (expected a non-negative number)');
                        return null;
                    }
                    const minimumValue = Math.round(Number((_b = child.getAttribute('min')) !== null && _b !== void 0 ? _b : undefined));
                    if (isNaN(minimumValue) || minimumValue < this.generalLimits.minimumIas || minimumValue > this.generalLimits.maximumIas) {
                        console.warn('Invalid FmsSpeedsConfig definition: missing or unrecognized configuration speed limit minimum value (expected number between the minimum and maximum IAS values defined in general limits)');
                        return null;
                    }
                    const maximumValue = Math.round(Number((_c = child.getAttribute('max')) !== null && _c !== void 0 ? _c : undefined));
                    if (isNaN(maximumValue) || maximumValue <= minimumValue || maximumValue > this.generalLimits.maximumIas) {
                        console.warn('Invalid FmsSpeedsConfig definition: missing or unrecognized configuration speed limit maximum value (expected number between the limit\'s minimum value and the maximum IAS value defined in general limits)');
                        return null;
                    }
                    const defaultValue = Math.round(Number((_d = child.getAttribute('default')) !== null && _d !== void 0 ? _d : undefined));
                    if (isNaN(defaultValue) || defaultValue < minimumValue || defaultValue > maximumValue) {
                        console.warn('Invalid FmsSpeedsConfig definition: missing or unrecognized configuration speed limit default value (expected a positive number between the limit\'s minimum and maximum values)');
                        return null;
                    }
                    return {
                        type: child.tagName === 'Flaps' ? 'flaps' : 'gear',
                        name,
                        extension,
                        minimumValue,
                        maximumValue,
                        defaultValue
                    };
                })
                .filter(def => {
                    if (def === null) {
                        return false;
                    }
                    if (def.type === 'gear') {
                        // A maximum of one gear limit is allowed.
                        if (hasGear) {
                            console.warn('Invalid FmsSpeedsConfig definition: multiple gear speed limits detected (maximum allowed of one)');
                            return false;
                        }
                        else {
                            hasGear = true;
                            return true;
                        }
                    }
                    else {
                        // Flaps limit extension value must be greater than the values of all flaps limits that come before it.
                        if (def.extension <= flapsExtension) {
                            console.warn('Invalid FmsSpeedsConfig definition: duplicate or decreasing flaps speed limit extension value detected');
                            return false;
                        }
                        else {
                            flapsExtension = def.extension;
                            return true;
                        }
                    }
                });
        }
        /**
         * Parses climb schedules from a configuration document element.
         * @param element A configuration document element.
         * @returns The climb schedules defined by the configuration document element.
         */
        parseClimbSchedules(element) {
            if (element === null) {
                return [];
            }
            return Array.from(element.querySelectorAll(':scope>ClimbSchedule'))
                .map(child => {
                    var _a, _b, _c, _d;
                    const name = child.getAttribute('name');
                    if (name === null) {
                        console.warn('Invalid FmsSpeedsConfig definition: missing speed schedule name');
                        return null;
                    }
                    let isDefault;
                    const defaultOption = child.getAttribute('default');
                    switch (defaultOption === null || defaultOption === void 0 ? void 0 : defaultOption.toLowerCase()) {
                        case 'true':
                            isDefault = true;
                            break;
                        case 'false':
                        case undefined:
                            isDefault = false;
                            break;
                        default:
                            isDefault = false;
                            console.warn('Invalid FmsSpeedsConfig definition: unrecognized speed schedule default option (expected true or false). Defaulting to false');
                    }
                    const ias = Math.round(Number((_b = (_a = child.querySelector(':scope>Ias')) === null || _a === void 0 ? void 0 : _a.textContent) !== null && _b !== void 0 ? _b : undefined));
                    if (isNaN(ias) || ias < this.generalLimits.minimumIas || ias > this.generalLimits.maximumIas) {
                        console.warn('Invalid FmsSpeedsConfig definition: missing or unrecognized speed schedule IAS value (expected a number between the minimum and maximum IAS values defined in general limits)');
                        return null;
                    }
                    const mach = msfssdk.MathUtils.round(Number((_d = (_c = child.querySelector(':scope>Mach')) === null || _c === void 0 ? void 0 : _c.textContent) !== null && _d !== void 0 ? _d : undefined), 0.01);
                    if (isNaN(mach) || mach < this.generalLimits.minimumMach || mach > this.generalLimits.maximumMach) {
                        console.warn('Invalid FmsSpeedsConfig definition: missing or unrecognized speed schedule mach value (expected a number between the minimum and maximum mach values defined in general limits)');
                        return null;
                    }
                    return {
                        type: 'climb',
                        name,
                        isDefault,
                        ias,
                        mach
                    };
                })
                .filter(def => def !== null);
        }
        /**
         * Parses cruise schedules from a configuration document element.
         * @param element A configuration document element.
         * @returns The cruise schedules defined by the configuration document element.
         */
        parseCruiseSchedules(element) {
            if (element === null) {
                return [];
            }
            return Array.from(element.querySelectorAll(':scope>CruiseSchedule'))
                .map(child => {
                    var _a, _b;
                    const name = child.getAttribute('name');
                    if (name === null) {
                        console.warn('Invalid FmsSpeedsConfig definition: missing speed schedule name');
                        return null;
                    }
                    let isDefault;
                    const defaultOption = child.getAttribute('default');
                    switch (defaultOption === null || defaultOption === void 0 ? void 0 : defaultOption.toLowerCase()) {
                        case 'true':
                            isDefault = true;
                            break;
                        case 'false':
                        case undefined:
                            isDefault = false;
                            break;
                        default:
                            isDefault = false;
                            console.warn('Invalid FmsSpeedsConfig definition: unrecognized speed schedule default option (expected true or false). Defaulting to false');
                    }
                    const iasElement = child.querySelector(':scope>Ias');
                    const machElement = child.querySelector(':scope>Mach');
                    let ias, mach;
                    if (iasElement === null && machElement === null) {
                        // If there is no IAS or mach value defined, this is a non-speed-targeting cruise schedule.
                        ias = mach = -1;
                    }
                    else {
                        ias = Math.round(Number((_a = iasElement === null || iasElement === void 0 ? void 0 : iasElement.textContent) !== null && _a !== void 0 ? _a : undefined));
                        if (isNaN(ias) || ias < this.generalLimits.minimumIas || ias > this.generalLimits.maximumIas) {
                            console.warn('Invalid FmsSpeedsConfig definition: missing or unrecognized speed schedule IAS value (expected a number between the minimum and maximum IAS values defined in general limits)');
                            return null;
                        }
                        mach = msfssdk.MathUtils.round(Number((_b = machElement === null || machElement === void 0 ? void 0 : machElement.textContent) !== null && _b !== void 0 ? _b : undefined), 0.01);
                        if (isNaN(mach) || mach < this.generalLimits.minimumMach || mach > this.generalLimits.maximumMach) {
                            console.warn('Invalid FmsSpeedsConfig definition: missing or unrecognized speed schedule mach value (expected a number between the minimum and maximum mach values defined in general limits)');
                            return null;
                        }
                    }
                    return {
                        type: 'cruise',
                        name,
                        isDefault,
                        ias,
                        mach
                    };
                })
                .filter(def => def !== null);
        }
        /**
         * Parses descent schedules from a configuration document element.
         * @param element A configuration document element.
         * @returns The descent schedules defined by the configuration document element.
         */
        parseDescentSchedules(element) {
            if (element === null) {
                return [];
            }
            return Array.from(element.querySelectorAll(':scope>DescentSchedule'))
                .map(child => {
                    var _a, _b, _c, _d, _e, _f;
                    const name = child.getAttribute('name');
                    if (name === null) {
                        console.warn('Invalid FmsSpeedsConfig definition: missing speed schedule name');
                        return null;
                    }
                    let isDefault;
                    const defaultOption = child.getAttribute('default');
                    switch (defaultOption === null || defaultOption === void 0 ? void 0 : defaultOption.toLowerCase()) {
                        case 'true':
                            isDefault = true;
                            break;
                        case 'false':
                        case undefined:
                            isDefault = false;
                            break;
                        default:
                            isDefault = false;
                            console.warn('Invalid FmsSpeedsConfig definition: unrecognized speed schedule default option (expected true or false). Defaulting to false');
                    }
                    const ias = Math.round(Number((_b = (_a = child.querySelector(':scope>Ias')) === null || _a === void 0 ? void 0 : _a.textContent) !== null && _b !== void 0 ? _b : undefined));
                    if (isNaN(ias) || ias < this.generalLimits.minimumIas || ias > this.generalLimits.maximumIas) {
                        console.warn('Invalid FmsSpeedsConfig definition: missing or unrecognized speed schedule IAS value (expected a number between the minimum and maximum IAS values defined in general limits)');
                        return null;
                    }
                    const mach = msfssdk.MathUtils.round(Number((_d = (_c = child.querySelector(':scope>Mach')) === null || _c === void 0 ? void 0 : _c.textContent) !== null && _d !== void 0 ? _d : undefined), 0.01);
                    if (isNaN(mach) || mach < this.generalLimits.minimumMach || mach > this.generalLimits.maximumMach) {
                        console.warn('Invalid FmsSpeedsConfig definition: missing or unrecognized speed schedule mach value (expected a number between the minimum and maximum mach values defined in general limits)');
                        return null;
                    }
                    const fpa = msfssdk.MathUtils.round(Number((_f = (_e = child.querySelector(':scope>Fpa')) === null || _e === void 0 ? void 0 : _e.textContent) !== null && _f !== void 0 ? _f : undefined), 0.01);
                    if (isNaN(fpa) || fpa < -6 || fpa > -1.5) {
                        console.warn('Invalid FmsSpeedsConfig definition: missing or unrecognized descent schedule FPA value (expected a number between -1.5 and -6)');
                        return null;
                    }
                    return {
                        type: 'descent',
                        name,
                        isDefault,
                        ias,
                        mach,
                        fpa
                    };
                })
                .filter(def => def !== null);
        }
    }
    /**
     * A configuration object which defines a factory for an FMS airframe speed limit value.
     *
     * The speed limit value can be defined from a specific static value or a one-dimensional lookup table keyed on
     * pressure altitude.
     */
    class FmsAirframeSpeedLimitConfig {
        /**
         * Creates a new SpeedConfig from a configuration document element.
         * @param source The source of this config's value, either a configuration document element defining the value or the
         * numeric value itself.
         */
        constructor(source) {
            this.isResolvableConfig = true;
            this.isNumericConfig = true;
            if (typeof source === 'number') {
                this.value = source;
                return;
            }
            if (source.tagName !== 'Ias' && source.tagName !== 'Mach') {
                throw new Error(`Invalid AirframeSpeedLimitConfig definition: expected tag name 'Ias' or 'Mach' but was '${source.tagName}'`);
            }
            const lookupTable = source.querySelector(':scope>LookupTable');
            if (lookupTable !== null) {
                this.value = new LookupTableConfig(lookupTable);
            }
            else {
                const value = source.textContent;
                if (value === null) {
                    throw new Error('Invalid AirframeSpeedLimitConfig definition: undefined value');
                }
                const parsedValue = Number(value);
                if (isNaN(parsedValue)) {
                    throw new Error('Invalid AirframeSpeedLimitConfig definition: value was not a number or a lookup table');
                }
                this.value = parsedValue;
            }
        }
        /** @inheritdoc */
        resolve() {
            const value = this.value;
            return (context) => {
                if (typeof value === 'number') {
                    return value;
                }
                else {
                    const table = value.resolve();
                    return context.pressureAlt.map(pressureAlt => table.get(pressureAlt));
                }
            };
        }
    }

    /**
     * A configuration object which defines options for G3000/5000 avionics systems.
     */
    class AvionicsConfig {
        /**
         * Creates an AvionicsConfig from an XML configuration document.
         * @param baseInstrument The `BaseInstrument` element associated with the configuration.
         * @param xmlConfig An XML configuration document.
         */
        constructor(baseInstrument, xmlConfig) {
            this.factory = new DefaultConfigFactory();
            const root = xmlConfig.getElementsByTagName('PlaneHTMLConfig')[0];
            this.type = this.parseAvionicsType(root.querySelector(':scope>AvionicsType'));
            this.autothrottle = this.parseAutothrottle(root.querySelector(':scope>Autothrottle'));
            this.fms = this.parseFms(root.querySelector(':scope>Fms'));
            this.vnav = this.parseVNav(baseInstrument, root.querySelector(':scope>VNAV'));
            this.iauDefs = this.parseIauDefsConfig(baseInstrument, root.querySelector(':scope>IauDefs'));
            this.sensors = this.parseSensorsConfig(baseInstrument, root.querySelector(':scope>Sensors'));
            this.radios = this.parseRadiosConfig(baseInstrument, root.querySelector(':scope>Radios'));
            this.autopilot = this.parseAutopilotConfig(baseInstrument, root.querySelector(':scope>Autopilot'));
            this.vSpeedGroups = this.parseVSpeeds(root.querySelector(':scope>VSpeeds'));
            this.traffic = this.parseTrafficConfig(baseInstrument, root.querySelector(':scope>Traffic'));
            this.map = this.parseMapConfig(root.querySelector(':scope>Map'));
            this.performance = this.parsePerformanceConfig(root.querySelector(':scope>Performance'));
            this.annunciations = new msfssdk.XMLAnnunciationFactory(baseInstrument).parseConfig(baseInstrument.xmlConfig);
        }
        /**
         * Parses an avionics type from a configuration document element.
         * @param element A configuration document element.
         * @returns The avionics type defined by the configuration document element.
         */
        parseAvionicsType(element) {
            if (element === null) {
                console.warn('Avionics Type not defined. Defaulting to G3000.');
                return 'G3000';
            }
            const type = element.textContent;
            switch (type) {
                case 'G3000':
                case 'G5000':
                    return type;
                default:
                    console.warn(`Unrecognized avionics type ${type} (expected 'G3000' or 'G5000'). Defaulting to G3000.`);
                    return 'G3000';
            }
        }
        /**
         * Parses an FMS configuration object from a configuration document element.
         * @param element A configuration document element.
         * @returns The FMS configuration defined by the configuration document element.
         */
        parseFms(element) {
            if (element !== null) {
                try {
                    return new FmsConfig(element);
                }
                catch (e) {
                    console.warn(e);
                }
            }
            return new FmsConfig(undefined);
        }
        /**
         * Parses a VNAV configuration object from a configuration document element.
         * @param baseInstrument The `BaseInstrument` element associated with the configuration.
         * @param element A configuration document element.
         * @returns The VNAV configuration defined by the configuration document element.
         */
        parseVNav(baseInstrument, element) {
            if (element !== null) {
                try {
                    return new VNavConfig(baseInstrument, element);
                }
                catch (e) {
                    console.warn(e);
                }
            }
            return new VNavConfig(baseInstrument, undefined);
        }
        /**
         * Parses the autothrottle option from a configuration document element.
         * @param element A configuration document element.
         * @returns Whether autothrottle is supported.
         */
        parseAutothrottle(element) {
            if (element === null) {
                return false;
            }
            const setting = element.textContent;
            switch (setting === null || setting === void 0 ? void 0 : setting.toLowerCase()) {
                case 'true': return true;
                case 'false': return false;
                default:
                    console.warn(`Unrecognized Autothrottle setting ${setting} (expected 'True' or 'False'). Defaulting to False.`);
                    return false;
            }
        }
        /**
         * Parses a sensors configuration object from a configuration document element.
         * @param baseInstrument The `BaseInstrument` element associated with the configuration.
         * @param element A configuration document element.
         * @returns The sensors configuration defined by the configuration document element.
         */
        parseSensorsConfig(baseInstrument, element) {
            if (element !== null) {
                try {
                    return new SensorsConfig(baseInstrument, element);
                }
                catch (e) {
                    console.warn(e);
                }
            }
            return new SensorsConfig(baseInstrument, undefined);
        }
        /**
         * Parses an IAU definitions configuration object from a configuration document element.
         * @param baseInstrument The `BaseInstrument` element associated with the configuration.
         * @param element A configuration document element.
         * @returns The IAU definitions configuration defined by the configuration document element.
         */
        parseIauDefsConfig(baseInstrument, element) {
            if (element !== null) {
                try {
                    return new IauDefsConfig(baseInstrument, element);
                }
                catch (e) {
                    console.warn(e);
                }
            }
            return new IauDefsConfig(baseInstrument, undefined);
        }
        /**
         * Parses a radios configuration object from a configuration document element.
         * @param baseInstrument The `BaseInstrument` element associated with the configuration.
         * @param element A configuration document element.
         * @returns The radios configuration defined by the configuration document element.
         */
        parseRadiosConfig(baseInstrument, element) {
            if (element !== null) {
                try {
                    return new RadiosConfig(baseInstrument, element);
                }
                catch (e) {
                    console.warn(e);
                }
            }
            return new RadiosConfig(baseInstrument, undefined);
        }
        /**
         * Parses an autopilot configuration object from a configuration document element.
         * @param baseInstrument The `BaseInstrument` element associated with the configuration.
         * @param element A configuration document element.
         * @returns The autopilot configuration defined by the configuration document element.
         */
        parseAutopilotConfig(baseInstrument, element) {
            if (element !== null) {
                try {
                    return new AutopilotConfig(baseInstrument, element);
                }
                catch (e) {
                    console.warn(e);
                }
            }
            return new AutopilotConfig(baseInstrument, undefined);
        }
        /**
         * Parses reference V-speed groups from a configuration document element.
         * @param element A configuration document element.
         * @returns An array of configs defining reference V-speed groups.
         */
        parseVSpeeds(element) {
            if (element === null) {
                return new Map();
            }
            const children = Array.from(element.querySelectorAll(':scope>Group'));
            const groups = children.map(child => {
                try {
                    return new VSpeedGroupConfig(child).resolve();
                }
                catch (e) {
                    console.warn(e);
                    return null;
                }
            });
            // Pick the first group of each type.
            const map = new Map();
            for (const group of groups) {
                if (group === null) {
                    continue;
                }
                if (!map.has(group.type)) {
                    map.set(group.type, group);
                }
            }
            return map;
        }
        /**
         * Parses a traffic configuration object from a configuration document element.
         * @param baseInstrument The `BaseInstrument` element associated with the configuration.
         * @param element A configuration document element.
         * @returns The traffic configuration defined by the configuration document element.
         */
        parseTrafficConfig(baseInstrument, element) {
            if (element !== null) {
                try {
                    return new TrafficConfig(baseInstrument, element);
                }
                catch (e) {
                    console.warn(e);
                }
            }
            return new TrafficConfig(baseInstrument, undefined);
        }
        /**
         * Parses a map configuration object from a configuration document element.
         * @param element A configuration document element.
         * @returns The map configuration defined by the configuration document element.
         */
        parseMapConfig(element) {
            if (element !== null) {
                try {
                    return new MapConfig(element);
                }
                catch (e) {
                    console.warn(e);
                }
            }
            return new MapConfig(undefined);
        }
        /**
         * Parses a performance configuration object from a configuration document element.
         * @param element A configuration document element.
         * @returns The performance configuration defined by the configuration document element.
         */
        parsePerformanceConfig(element) {
            if (element !== null) {
                try {
                    return new PerformanceConfig(element);
                }
                catch (e) {
                    console.warn(e);
                }
            }
            return new PerformanceConfig(undefined);
        }
    }

    /**
     * Statuses for a G3000 avionics unit (GDU or GTC).
     */
    exports.AvionicsStatus = void 0;
    (function (AvionicsStatus) {
        AvionicsStatus[AvionicsStatus["Off"] = 0] = "Off";
        AvionicsStatus[AvionicsStatus["Booting"] = 1] = "Booting";
        AvionicsStatus[AvionicsStatus["Startup"] = 2] = "Startup";
        AvionicsStatus[AvionicsStatus["On"] = 3] = "On";
        AvionicsStatus[AvionicsStatus["Reversionary"] = 4] = "Reversionary";
        AvionicsStatus[AvionicsStatus["Failed"] = 5] = "Failed";
    })(exports.AvionicsStatus || (exports.AvionicsStatus = {}));

    /**
     * A utility class for for working with G3000 avionics status.
     */
    class AvionicsStatusUtils {
        /**
         * Gets the UID for a G3000 avionics unit (GDU or GTC).
         * @param instrumentType The instrument type of the avionics unit.
         * @param instrumentIndex The instrument index of the avionics unit.
         * @returns The UID for the specified avionics unit.
         */
        static getUid(instrumentType, instrumentIndex) {
            return `${instrumentType}_${instrumentIndex}`;
        }
    }

    /**
     * A manager for G3000 avionics unit (GDUs and GTCs) status. Processes status updates received from instances of
     * {@link AvionicsStatusClient} and publishes avionics unit status events, including global power state events.
     */
    class AvionicsStatusManager {
        /**
         * Constructor.
         * @param bus The event bus.
         */
        constructor(bus) {
            this.bus = bus;
            this.syncPublisher = this.bus.getPublisher();
            this.eventSyncPublisher = this.bus.getPublisher();
            this.clients = new Map();
            this.currentGlobalPower = undefined;
            this.previousGlobalPower = undefined;
            this.isAlive = true;
            this.isInit = false;
        }
        /**
         * Initializes this manager. Once initialized, this manager will keep track of the status of all
         * {@link AvionicsStatusClient} instances and publish them on the event bus, along with the avionics global power
         * state.
         * @throws Error if this manager was destroyed.
         */
        init() {
            if (!this.isAlive) {
                throw new Error('AvionicsStatusManager: cannot initialize a dead manager');
            }
            if (this.isInit) {
                return;
            }
            this.isInit = true;
            this.syncSub = this.bus.getSubscriber()
                .on('avionics_status_client_sync_data')
                .handle(this.onStatusSyncReceived.bind(this));
            this.eventHandshakeRequestSub = this.bus.getSubscriber()
                .on('avionics_status_event_handshake')
                .handle(this.onEventHandshakeInitialized.bind(this));
            // Send a request for all existing clients to sync their statuses.
            this.syncPublisher.pub('avionics_status_sync_request', undefined, true, false);
            // Send a request for all existing event clients to start the handshake process.
            this.eventSyncPublisher.pub('avionics_status_event_handshake_request', undefined, true, false);
        }
        /**
         * Responds to when a status sync event is received.
         * @param data The event data.
         */
        onStatusSyncReceived(data) {
            const uid = AvionicsStatusUtils.getUid(data.instrumentType, data.instrumentIndex);
            let entry = this.clients.get(uid);
            if (entry === undefined) {
                entry = {
                    uid,
                    instrumentType: data.instrumentType,
                    instrumentIndex: data.instrumentIndex,
                };
                this.clients.set(uid, entry);
            }
            else if (data.isInitial) {
                // We are receiving an initial sync for a client that we are already tracking. This can only happen if the
                // client's instrument was reloaded. In this case we reset the status of the client as if this was the first
                // time we are receiving data from the client.
                entry.currentStatus = undefined;
                entry.previousStatus = undefined;
            }
            entry.previousStatus = entry.currentStatus;
            entry.currentStatus = data.status;
            if (entry.previousStatus !== entry.currentStatus) {
                this.eventSyncPublisher.pub('avionics_status_event_status_sync_data', {
                    avionicsUid: uid,
                    event: { previous: entry.previousStatus, current: entry.currentStatus }
                }, true, false);
            }
            this.updateGlobalPower();
        }
        /**
         * Updates the avionics global power state and if it has changed, publishes the change to the event bus.
         */
        updateGlobalPower() {
            let globalPower = false;
            for (const entry of this.clients.values()) {
                if (entry.currentStatus !== exports.AvionicsStatus.Off) {
                    globalPower = true;
                    break;
                }
            }
            this.previousGlobalPower = this.currentGlobalPower;
            this.currentGlobalPower = globalPower;
            if (this.previousGlobalPower !== globalPower) {
                this.eventSyncPublisher.pub('avionics_status_event_global_sync_data', {
                    event: { previous: this.previousGlobalPower, current: this.currentGlobalPower }
                }, true, false);
            }
        }
        /**
         * Responds to when an event client initializes a handshake.
         * @param uid The UID of the event client.
         */
        onEventHandshakeInitialized(uid) {
            for (const client of this.clients.values()) {
                if (client.currentStatus !== undefined) {
                    this.eventSyncPublisher.pub('avionics_status_event_status_sync_data', {
                        avionicsUid: client.uid,
                        event: { previous: client.previousStatus, current: client.currentStatus },
                        handshakeUid: uid
                    }, true, false);
                }
            }
            this.eventSyncPublisher.pub('avionics_status_event_global_sync_data', {
                event: { previous: this.previousGlobalPower, current: this.currentGlobalPower },
                handshakeUid: uid
            }, true, false);
        }
        /**
         * Destroys this manager. Once destroyed, this manager will no longer keep track of avionics unit statuses or publish
         * events to the event bus.
         */
        destroy() {
            var _a, _b;
            this.isAlive = false;
            (_a = this.syncSub) === null || _a === void 0 ? void 0 : _a.destroy();
            (_b = this.eventHandshakeRequestSub) === null || _b === void 0 ? void 0 : _b.destroy();
        }
    }
    /**
     * A client which tracks and sends the status of a G3000 avionics unit (GDU or GTC) to a central manager for
     * processing.
     */
    class AvionicsStatusClient {
        /**
         * Constructor.
         * @param instrumentType The instrument type of this client's avionics unit.
         * @param instrumentIndex The instrument index of this client's avionics unit.
         * @param bus The event bus.
         */
        constructor(instrumentType, instrumentIndex, bus) {
            this.instrumentType = instrumentType;
            this.instrumentIndex = instrumentIndex;
            this.bus = bus;
            this.syncPublisher = this.bus.getPublisher();
            this.status = undefined;
            this.isAlive = true;
            this.isInit = false;
            this.hasSentInitialSync = false;
            this.uid = AvionicsStatusUtils.getUid(instrumentType, instrumentIndex);
        }
        /**
         * Initializes this client. Once initialized, this client will automatically send its status to a central manager.
         * @throws Error if this client was destroyed.
         */
        init() {
            if (!this.isAlive) {
                throw new Error('AvionicsStatusClient: cannot initialize a dead client');
            }
            if (this.isInit) {
                return;
            }
            this.isInit = true;
            this.sendSyncData(true);
            const sub = this.bus.getSubscriber();
            this.syncRequestSub = sub.on('avionics_status_sync_request').handle(this.sendSyncData.bind(this, true));
        }
        /**
         * Sets the status of this client's avionics unit. If this client has been initialized, then the new status will
         * automatically be sent to the client's central manager.
         * @param status The status to set.
         * @throws Error if this client was destroyed.
         */
        setStatus(status) {
            if (!this.isAlive) {
                throw new Error('AvionicsStatusClient: cannot set the status of a dead client');
            }
            if (this.status === status) {
                return;
            }
            this.status = status;
            if (this.isInit) {
                this.sendSyncData(!this.hasSentInitialSync);
            }
        }
        /**
         * Sends this client's status to a central manager over the event bus.
         * @param isInitial Whether the status is to be sent as an initial sync.
         */
        sendSyncData(isInitial) {
            if (this.status === undefined) {
                return;
            }
            this.hasSentInitialSync = true;
            this.syncPublisher.pub('avionics_status_client_sync_data', { instrumentType: this.instrumentType, instrumentIndex: this.instrumentIndex, status: this.status, isInitial }, true, false);
        }
        /**
         * Destroys this client.
         */
        destroy() {
            var _a;
            this.isAlive = false;
            (_a = this.syncRequestSub) === null || _a === void 0 ? void 0 : _a.destroy();
        }
    }
    /**
     * A client which receives avionics status data from a central manager and publishes the data locally (i.e. only on the
     * client's hosting JS instrument) to the event bus as avionics status events.
     */
    class AvionicsStatusEventClient {
        /**
         * Constructor.
         * @param uid This client's unique ID.
         * @param bus The event bus.
         */
        constructor(uid, bus) {
            this.uid = uid;
            this.bus = bus;
            this.publisher = this.bus.getPublisher();
            this.syncPublisher = this.bus.getPublisher();
            this.isAlive = true;
            this.isInit = false;
            this.isHandshakeComplete = false;
            // Initialize global power topic.
            this.publisher.pub('avionics_global_power', { previous: undefined, current: undefined }, false, true);
        }
        /**
         * Initializes this client. Once initialized, this client will begin communicating with the central manager and
         * publish avionics status events as appropriate.
         * @throws Error if this client was destroyed.
         */
        init() {
            if (!this.isAlive) {
                throw new Error('AvionicsStatusEventClient: cannot initialize a dead client');
            }
            if (this.isInit) {
                return;
            }
            this.isInit = true;
            const sub = this.bus.getSubscriber();
            this.statusSyncSub = sub.on('avionics_status_event_status_sync_data').handle(this.onStatusSyncReceived.bind(this));
            this.globalPowerSyncSub = sub.on('avionics_status_event_global_sync_data').handle(this.onGlobalPowerSyncReceived.bind(this));
            // Send an initial handshake. Note that just because we send a handshake doesn't mean we will receive a response,
            // because the manager might not be initialized yet.
            this.syncPublisher.pub('avionics_status_event_handshake', this.uid, true, false);
            this.handshakeRequestSub = sub.on('avionics_status_event_handshake_request').handle(() => {
                this.syncPublisher.pub('avionics_status_event_handshake', this.uid, true, false);
            });
        }
        /**
         * Responds to when avionics unit status sync data is received from the central manager.
         * @param data The avionics unit status sync data that was received.
         */
        onStatusSyncReceived(data) {
            if (this.isHandshakeComplete) {
                // Do not respond to handshake status syncs if handshake is complete.
                if (data.handshakeUid !== undefined) {
                    return;
                }
            }
            else {
                // Do not respond to non-handshake or handshake status syncs directed at other clients if handshake is not complete.
                if (data.handshakeUid !== this.uid) {
                    return;
                }
            }
            this.publisher.pub(`avionics_status_${data.avionicsUid}`, data.event, false, true);
        }
        /**
         * Responds to when global power status sync data is received from the central manager.
         * @param data The global power status sync data that was received.
         */
        onGlobalPowerSyncReceived(data) {
            if (this.isHandshakeComplete) {
                // Do not respond to handshake status syncs if handshake is complete.
                if (data.handshakeUid !== undefined) {
                    return;
                }
            }
            else {
                // Do not respond to non-handshake or handshake status syncs directed at other clients if handshake is not complete.
                if (data.handshakeUid !== this.uid) {
                    return;
                }
                // The global power state is the last piece of data synced during a handshake, so once we receive that, we mark
                // the handshake as complete.
                this.isHandshakeComplete = true;
                // Because we locally initialize the global power topic to a state of undefined, do not publish the handshake
                // data if the current power is undefined.
                if (data.event.current === undefined) {
                    return;
                }
            }
            this.publisher.pub('avionics_global_power', data.event, false, true);
        }
        /**
         * Destroys this client.
         */
        destroy() {
            var _a, _b, _c;
            this.isAlive = false;
            (_a = this.statusSyncSub) === null || _a === void 0 ? void 0 : _a.destroy();
            (_b = this.globalPowerSyncSub) === null || _b === void 0 ? void 0 : _b.destroy();
            (_c = this.handshakeRequestSub) === null || _c === void 0 ? void 0 : _c.destroy();
        }
    }

    /**
     * A manager of CAS alert acknowledgement state in response to avionics power.
     */
    class CasPowerStateManager {
        /**
         * Constructor.
         * @param bus The event bus.
         */
        constructor(bus) {
            this.bus = bus;
            this.casPublisher = this.bus.getPublisher();
            this.casAckDebounceTimer = new msfssdk.DebounceTimer();
        }
        /**
         * Initializes this manager. Once initialized, this manager will automatically control CAS alert acknowledgement
         * state in response to changes in avionics power.
         */
        init() {
            msfssdk.Wait.awaitSubscribable(msfssdk.GameStateProvider.get(), state => state === GameState.briefing || state === GameState.loading)
                .then(() => { this.bus.getSubscriber().on('avionics_global_power').handle(this.onGlobalPowerChanged.bind(this)); });
        }
        /**
         * Responds to changes in the avionics global power state.
         * @param event The event describing the change in the avionics global power state.
         */
        onGlobalPowerChanged(event) {
            if (event.previous === true && event.current === false) {
                // Avionics global power off.
                // Clear master caution/warning on power off.
                this.casAckDebounceTimer.clear();
                SimVar.SetSimVarValue('K:MASTER_CAUTION_ACKNOWLEDGE', msfssdk.SimVarValueType.Number, 0);
                SimVar.SetSimVarValue('K:MASTER_WARNING_ACKNOWLEDGE', msfssdk.SimVarValueType.Number, 0);
                this.casPublisher.pub('cas_set_initial_acknowledge', true, true, false);
            }
            else if (event.current === true) {
                // Avionics global power on.
                this.casAckDebounceTimer.schedule(() => {
                    this.casPublisher.pub('cas_set_initial_acknowledge', false, true, false);
                }, CasPowerStateManager.POWER_ON_CAS_ACKNOWLEDGE_DELAY);
            }
        }
    }
    /** The delay, in milliseconds, after avionics power on before newly activated CAS alerts appear as unacknowledged. */
    CasPowerStateManager.POWER_ON_CAS_ACKNOWLEDGE_DELAY = 2000;

    /**
     * Indexes for display panes.
     */
    exports.DisplayPaneIndex = void 0;
    (function (DisplayPaneIndex) {
        DisplayPaneIndex[DisplayPaneIndex["LeftPfdInstrument"] = 0] = "LeftPfdInstrument";
        DisplayPaneIndex[DisplayPaneIndex["LeftPfd"] = 1] = "LeftPfd";
        DisplayPaneIndex[DisplayPaneIndex["LeftMfd"] = 2] = "LeftMfd";
        DisplayPaneIndex[DisplayPaneIndex["RightMfd"] = 3] = "RightMfd";
        DisplayPaneIndex[DisplayPaneIndex["RightPfd"] = 4] = "RightPfd";
        DisplayPaneIndex[DisplayPaneIndex["RightPfdInstrument"] = 5] = "RightPfdInstrument";
    })(exports.DisplayPaneIndex || (exports.DisplayPaneIndex = {}));
    /**
     * Indexes for GTC units that can control display panes.
     */
    exports.DisplayPaneControlGtcIndex = void 0;
    (function (DisplayPaneControlGtcIndex) {
        DisplayPaneControlGtcIndex[DisplayPaneControlGtcIndex["LeftGtc"] = 1] = "LeftGtc";
        DisplayPaneControlGtcIndex[DisplayPaneControlGtcIndex["RightGtc"] = 2] = "RightGtc";
    })(exports.DisplayPaneControlGtcIndex || (exports.DisplayPaneControlGtcIndex = {}));
    /**
     * Size modes for display panes.
     */
    exports.DisplayPaneSizeMode = void 0;
    (function (DisplayPaneSizeMode) {
        DisplayPaneSizeMode["Full"] = "Full";
        DisplayPaneSizeMode["Half"] = "Half";
        DisplayPaneSizeMode["Hidden"] = "Hidden";
    })(exports.DisplayPaneSizeMode || (exports.DisplayPaneSizeMode = {}));

    /**
     * A utility class for working with Bing instances.
     */
    class BingUtils {
        /**
         * Gets the amount of the time, in milliseconds, to delay binding a Bing instance for a map containedin a display
         * pane.
         * @param paneIndex The index of the display pane.
         * @returns The amount of the time, in milliseconds, to delay binding a Bing instance for map contained in the
         * specified display pane.
         */
        static getBindDelayForPane(paneIndex) {
            switch (paneIndex) {
                case exports.DisplayPaneIndex.LeftMfd:
                    return 0;
                case exports.DisplayPaneIndex.RightMfd:
                    return 2000;
                case exports.DisplayPaneIndex.LeftPfdInstrument:
                    return 4000;
                case exports.DisplayPaneIndex.RightPfdInstrument:
                    return 4000;
                case exports.DisplayPaneIndex.LeftPfd:
                    return 8000;
                case exports.DisplayPaneIndex.RightPfd:
                    return 8000;
            }
        }
        /**
         * Gets the amount of time, in milliseconds, to delay binding a Bing instance for a synthetic vision (SVT) display.
         * @param pfdIndex The index of the SVT display's parent PFD.
         * @returns The amount of time, in milliseconds, to delay binding a Bing instance for the specified synthetic vision
         * (SVT) display.
         */
        static getBindDelayForSvt(pfdIndex) {
            return pfdIndex === 1 ? 6000 : 6000;
        }
    }

    /** Our version of a CAS. */
    class G3000CASDisplay extends garminsdk.CASDisplay {
        constructor() {
            super(...arguments);
            this.controlEventsPub = this.props.bus.getPublisher();
            this.controlEventsSub = this.props.bus.getSubscriber();
        }
        /** @inheritdoc */
        onAfterRender() {
            super.onAfterRender();
            if (this.props.alertCounts) {
                this.props.alertCounts.sub((data, key, newValue, oldValue) => {
                    switch (key) {
                        case 'countAboveWindow':
                            if (newValue > 0 && oldValue === 0) {
                                this.handleScrollUpEnable(true);
                            }
                            else if (newValue === 0 && oldValue > 0) {
                                this.handleScrollUpEnable(false);
                            }
                            break;
                        case 'countBelowWindow':
                            if (newValue > 0 && oldValue === 0) {
                                this.handleScrollDownEnable(true);
                            }
                            else if (newValue === 0 && oldValue > 0) {
                                this.handleScrollDownEnable(false);
                            }
                            break;
                    }
                });
            }
            this.subscribeForScollCommands();
        }
        /**
         * Handle a scroll up (en|dis)able event.
         * @param enabled True to enable the control softkey, false to disable.
         * */
        handleScrollUpEnable(enabled) {
            var _a;
            ((_a = this.props.pfdIndices) !== null && _a !== void 0 ? _a : []).map(idx => this.controlEventsPub.pub(`cas_scroll_up_enable_${idx}`, enabled, true));
        }
        /**
         * Handle a scroll down (en|dis)able event.
         * @param enabled True to enable the control softkey, false to disable.
         * */
        handleScrollDownEnable(enabled) {
            var _a;
            ((_a = this.props.pfdIndices) !== null && _a !== void 0 ? _a : []).map(idx => this.controlEventsPub.pub(`cas_scroll_down_enable_${idx}`, enabled, true));
        }
        /** Subscribe for scroll command events */
        subscribeForScollCommands() {
            var _a, _b;
            ((_a = this.props.pfdIndices) !== null && _a !== void 0 ? _a : []).map(idx => this.controlEventsSub.on(`cas_scroll_up_${idx}`).handle((v) => v && this.scrollUp()));
            ((_b = this.props.pfdIndices) !== null && _b !== void 0 ? _b : []).map(idx => this.controlEventsSub.on(`cas_scroll_down_${idx}`).handle((v) => v && this.scrollDown()));
        }
    }
    /** The UI component that displays CAS message counts. */
    class CASMessageCount extends msfssdk.DisplayComponent {
        constructor() {
            super(...arguments);
            this.casSpanRef = msfssdk.FSComponent.createRef();
        }
        /** @inheritdoc */
        onAfterRender() {
            this.props.highestAlertState.sub((v) => {
                switch (v) {
                    case msfssdk.AnnunciationType.Warning:
                        this.casSpanRef.instance.classList.remove('caution');
                        this.casSpanRef.instance.classList.add('warning');
                        break;
                    case msfssdk.AnnunciationType.Caution:
                        this.casSpanRef.instance.classList.remove('warning');
                        this.casSpanRef.instance.classList.add('caution');
                        break;
                    default:
                        this.casSpanRef.instance.classList.remove('warning');
                        this.casSpanRef.instance.classList.remove('caution');
                }
            });
        }
        /** @inheritdoc */
        render() {
            return msfssdk.FSComponent.buildComponent("div", { class: 'cas-message-count' },
                msfssdk.FSComponent.buildComponent("span", { class: 'cas-message-count-header', ref: this.casSpanRef }, "CAS"),
                msfssdk.FSComponent.buildComponent("span", null,
                    this.props.countAboveWindow,
                    "\u2191"),
                msfssdk.FSComponent.buildComponent("span", null,
                    this.props.countBelowWindow,
                    "\u2193"));
        }
    }
    /** Our cas display */
    class CAS extends msfssdk.DisplayComponent {
        /** @inheritdoc */
        constructor(props) {
            super(props);
            this.alertCounts = msfssdk.ObjectSubject.create({
                totalAlerts: 0,
                countAboveWindow: 0,
                countBelowWindow: 0,
                numWarning: 0,
                numCaution: 0,
                numAdvisory: 0,
                numSafeOp: 0
            });
            this.countAboveWindow = msfssdk.Subject.create(0);
            this.countBelowWindow = msfssdk.Subject.create(0);
            this.totalAlerts = msfssdk.Subject.create(0);
            this.highestAlertState = msfssdk.Subject.create(null);
            this.divRef = msfssdk.FSComponent.createRef();
            this.alertCounts.sub((data, key, newValue) => {
                switch (key) {
                    case 'totalAlerts':
                        this.totalAlerts.set(newValue);
                        break;
                    case 'countAboveWindow':
                        this.countAboveWindow.set(newValue);
                        break;
                    case 'countBelowWindow':
                        this.countBelowWindow.set(newValue);
                        break;
                    case 'numWarning':
                    case 'numCaution':
                    case 'numAdvisory':
                    case 'numSafeOp':
                        this.highestAlertState.set(data.numWarning > 0 ? msfssdk.AnnunciationType.Warning : data.numCaution > 0 ? msfssdk.AnnunciationType.Caution : null);
                        break;
                }
            }, true);
        }
        /** @inheritdoc */
        onAfterRender() {
            this.totalAlerts.sub((v) => {
                if (v === 0) {
                    this.divRef.instance.style.display = 'none';
                }
                else {
                    this.divRef.instance.style.display = '';
                }
            }, true);
        }
        /** @inheritdoc */
        render() {
            return (msfssdk.FSComponent.buildComponent("div", { class: 'cas-container', ref: this.divRef },
                msfssdk.FSComponent.buildComponent(G3000CASDisplay, { bus: this.props.bus, numAnnunciationsShown: this.props.numAnnunciationsShown, annunciations: this.props.annunciations, alertCounts: this.alertCounts, pfdIndices: this.props.pfdIndices }),
                msfssdk.FSComponent.buildComponent(CASMessageCount, { bus: this.props.bus, countAboveWindow: this.countAboveWindow, countBelowWindow: this.countBelowWindow, highestAlertState: this.highestAlertState })));
        }
    }

    /**
     * A configuration object which defines angle of attack indicator options.
     */
    class CASConfig {
        /**
         * Creates a new VsiConfig from a configuration document element.
         * @param element A configuration document element.
         * @param factory A configuration object factory to use to create child configuration objects.
         */
        constructor(element, factory) {
            if (element === undefined) {
                this.casEnabled = false;
                this.alertCountFullScreen = 12;
                this.alertCountSplitScreen = 11;
            }
            else {
                if (element.tagName !== 'CAS') {
                    throw new Error(`Invalid CASConfig definition: expected tag name 'CAS' but was '${element.tagName}'`);
                }
                this.casEnabled = true;
                let attr = element.getAttribute('full-screen-alert-count');
                if (attr === null) {
                    this.alertCountFullScreen = 12;
                }
                else {
                    const fullCount = Number(attr);
                    if (Number.isInteger(fullCount)) {
                        this.alertCountFullScreen = fullCount;
                    }
                    else {
                        console.warn(`Invalid CASConfig definition: full screen alert count has non-integer value '${attr}`);
                        this.alertCountFullScreen = 12;
                    }
                }
                attr = element.getAttribute('split-screen-alert-count');
                if (attr === null) {
                    this.alertCountSplitScreen = 11;
                }
                else {
                    const splitCount = Number.parseInt(attr);
                    if (Number.isInteger(splitCount)) {
                        this.alertCountSplitScreen = splitCount;
                    }
                    else {
                        console.warn(`Invalid CASConfig definition: split screen alert count has non-integer value '${attr}'`);
                        this.alertCountSplitScreen = 11;
                    }
                }
                const inheritFromId = element.getAttribute('inherit');
                const inheritFromElement = inheritFromId === null
                    ? null
                    : element.ownerDocument.querySelector(`CAS[id='${inheritFromId}']`);
                this.inheritFrom(inheritFromElement, factory);
            }
        }
        /**
         * Inherits options from a parent configuration document element.
         * @param element A parent configuration document element.
         * @param factory A configuration object factory to use to create child configuration objects.
         */
        inheritFrom(element, factory) {
            var _a, _b;
            if (element === null) {
                return;
            }
            try {
                const parentConfig = new CASConfig(element, factory);
                (_a = this.alertCountFullScreen) !== null && _a !== void 0 ? _a : (this.alertCountFullScreen = parentConfig.alertCountFullScreen);
                (_b = this.alertCountSplitScreen) !== null && _b !== void 0 ? _b : (this.alertCountSplitScreen = parentConfig.alertCountSplitScreen);
            }
            catch (e) {
                console.warn(e);
            }
        }
    }

    /**
     * A component which displays a map range setting value.
     *
     * Displays the distance value for non-negative range indexes and `Off` for negative indexes.
     */
    class MapRangeSettingDisplay extends msfssdk.DisplayComponent {
        constructor() {
            super(...arguments);
            this.displayRef = msfssdk.FSComponent.createRef();
            this.displayStyle = msfssdk.ObjectSubject.create({
                display: 'none'
            });
            this.offStyle = msfssdk.ObjectSubject.create({
                display: 'none'
            });
            this.rangeIndex = msfssdk.Subject.create(0);
            this.rangeState = msfssdk.CombinedSubject.create(this.props.rangeArray, msfssdk.SubscribableUtils.toSubscribable(this.props.rangeIndex, true));
        }
        /** @inheritdoc */
        onAfterRender() {
            this.rangeState.sub(([rangeArray, rangeIndex]) => {
                if (rangeIndex < 0) {
                    this.displayStyle.set('display', 'none');
                    this.offStyle.set('display', '');
                }
                else {
                    this.offStyle.set('display', 'none');
                    this.displayStyle.set('display', '');
                    this.rangeIndex.set(Math.min(rangeIndex, rangeArray.length - 1));
                }
            }, true);
        }
        /** @inheritdoc */
        render() {
            var _a;
            return (msfssdk.FSComponent.buildComponent("div", { class: (_a = this.props.class) !== null && _a !== void 0 ? _a : '' },
                msfssdk.FSComponent.buildComponent("div", { style: this.displayStyle },
                    msfssdk.FSComponent.buildComponent(garminsdk.MapRangeValueDisplay, { ref: this.displayRef, rangeIndex: this.rangeIndex, rangeArray: this.props.rangeArray, displayUnit: this.props.displayUnit })),
                msfssdk.FSComponent.buildComponent("div", { style: this.offStyle }, "Off")));
        }
        /** @inheritdoc */
        destroy() {
            var _a;
            (_a = this.displayRef.getOrDefault()) === null || _a === void 0 ? void 0 : _a.destroy();
            this.rangeState.destroy();
            super.destroy();
        }
    }

    /** Displays an altitude constraint. */
    class AltitudeConstraintDisplay extends msfssdk.DisplayComponent {
        constructor() {
            var _a, _b;
            super(...arguments);
            this.altitudesRef = msfssdk.FSComponent.createRef();
            this.altitude1Feet = this.props.altitude1.map(x => x.asUnit(msfssdk.UnitType.FOOT));
            this.altitude2Feet = (_b = (_a = this.props.altitude2) === null || _a === void 0 ? void 0 : _a.map(x => x.asUnit(msfssdk.UnitType.FOOT))) !== null && _b !== void 0 ? _b : msfssdk.Subject.create(NaN);
            this.displayAltitude2AsFlightLevel = msfssdk.Subject.create(false);
            this.line1Content = msfssdk.MappedSubject.create(([altitude1Feet, isFlightLevel]) => {
                return AltitudeConstraintDisplay.formatAltitude(altitude1Feet, isFlightLevel);
            }, this.altitude1Feet, this.props.displayAltitude1AsFlightLevel);
            this.line2Content = msfssdk.MappedSubject.create(([altitude2Feet, isFlightLevel]) => {
                return AltitudeConstraintDisplay.formatAltitude(altitude2Feet, isFlightLevel);
            }, this.altitude2Feet, this.displayAltitude2AsFlightLevel);
            this.fontScale = msfssdk.MappedSubject.create(([line1Content, line2Content, altDesc]) => {
                if (altDesc === msfssdk.AltitudeRestrictionType.Between) {
                    if ((!line1Content.startsWith('FL') && line1Content.length === 5) ||
                        (!line2Content.startsWith('FL') && line2Content.length === 5)) {
                        return '0.78em';
                    }
                    else {
                        return '0.95em';
                    }
                }
                else {
                    if ((!line1Content.startsWith('FL') && line1Content.length === 5) ||
                        (!line2Content.startsWith('FL') && line2Content.length === 5)) {
                        return '0.95em';
                    }
                    else {
                        return '1em';
                    }
                }
            }, this.line1Content, this.line2Content, this.props.altDesc);
            this.classList = msfssdk.SetSubject.create(['altitude-constraint-display']);
            this.subs = [];
        }
        /** @inheritdoc */
        onAfterRender() {
            this.subs.push(this.props.displayAltitude1AsFlightLevel.sub(isFlightLevel => {
                this.classList.toggle('FL1', isFlightLevel);
            }, true));
            if (this.props.displayAltitude2AsFlightLevel) {
                this.subs.push(this.props.displayAltitude2AsFlightLevel.pipe(this.displayAltitude2AsFlightLevel));
            }
            this.displayAltitude2AsFlightLevel.sub(isFlightLevel => {
                this.classList.toggle('FL2', isFlightLevel);
            }, true);
            if (this.props.isInvalid) {
                this.subs.push(this.props.isInvalid.sub(isInvalid => {
                    this.classList.toggle('invalid', isInvalid);
                }, true));
            }
            if (this.props.isEdited) {
                this.subs.push(this.props.isEdited.sub(isEdited => {
                    this.classList.toggle('edited', isEdited);
                }, true));
            }
            if (msfssdk.SubscribableUtils.isSubscribable(this.props.isCyan)) {
                this.subs.push(this.props.isCyan.sub(isCyan => {
                    this.classList.toggle('altitude-constraint-display-cyan', isCyan);
                }, true));
            }
            else {
                this.classList.toggle('altitude-constraint-display-cyan', !!this.props.isCyan);
            }
            this.fontScale.sub(fontScale => {
                this.altitudesRef.instance.style.setProperty('--altitude-constraint-display-font-size-scale', fontScale);
            }, true);
            this.subs.push(this.props.altDesc.sub(altDesc => {
                this.classList.toggle('altitude-constraint-display-at', altDesc === msfssdk.AltitudeRestrictionType.At);
                this.classList.toggle('altitude-constraint-display-atorabove', altDesc === msfssdk.AltitudeRestrictionType.AtOrAbove);
                this.classList.toggle('altitude-constraint-display-atorbelow', altDesc === msfssdk.AltitudeRestrictionType.AtOrBelow);
                this.classList.toggle('altitude-constraint-display-between', altDesc === msfssdk.AltitudeRestrictionType.Between);
                this.classList.toggle('altitude-constraint-display-unused', altDesc === msfssdk.AltitudeRestrictionType.Unused);
            }, true));
        }
        /**
         * Formats altitude.
         * @param altitudeFeet The altitude in feet.
         * @param isFlightLevel Whether this is flight level or not.
         * @returns The formatted altitude.
         */
        static formatAltitude(altitudeFeet, isFlightLevel) {
            if (isFlightLevel) {
                if (altitudeFeet !== undefined && !isNaN(altitudeFeet)) {
                    return `FL${Math.round(altitudeFeet / 100).toString().padStart(3, '0').substring(0, 3)}`;
                }
                else {
                    return 'FL___';
                }
            }
            else {
                if (altitudeFeet !== undefined && !isNaN(altitudeFeet)) {
                    return altitudeFeet.toFixed(0);
                }
                else {
                    return '_____';
                }
            }
        }
        /** @inheritdoc */
        render() {
            return (msfssdk.FSComponent.buildComponent("div", { class: this.classList },
                msfssdk.FSComponent.buildComponent("div", { class: "altitudes", ref: this.altitudesRef },
                    msfssdk.FSComponent.buildComponent("div", { class: "lines-box" },
                        msfssdk.FSComponent.buildComponent("div", { class: "line line-1" },
                            msfssdk.FSComponent.buildComponent("div", { class: "line-inner" },
                                this.line1Content,
                                msfssdk.FSComponent.buildComponent("span", { class: "FT" }, "FT"))),
                        msfssdk.FSComponent.buildComponent("div", { class: "line line-2" },
                            msfssdk.FSComponent.buildComponent("div", { class: "line-inner" },
                                this.line2Content,
                                msfssdk.FSComponent.buildComponent("span", { class: "FT" }, "FT")))),
                    msfssdk.FSComponent.buildComponent("div", { class: "solid-line-box" }),
                    msfssdk.FSComponent.buildComponent("img", { class: "invalid-image single", src: "coui://html_ui/Pages/VCockpit/Instruments/NavSystems/TTX/WTG3000/Assets/Images/GTC/wt_cyan_crossed_out.png" }),
                    msfssdk.FSComponent.buildComponent("img", { class: "invalid-image double", src: "coui://html_ui/Pages/VCockpit/Instruments/NavSystems/TTX/WTG3000/Assets/Images/GTC/wt_cyan_crossed_out_double.png" })),
                msfssdk.FSComponent.buildComponent("img", { class: "pencil-icon", src: "coui://html_ui/Pages/VCockpit/Instruments/NavSystems/TTX/WTG3000/Assets/Images/GTC/icon_pencil.png" })));
        }
        /** @inheritdoc */
        destroy() {
            super.destroy();
            this.altitude1Feet.destroy();
            if ('destroy' in this.altitude2Feet) {
                this.altitude2Feet.destroy();
            }
            this.line1Content.destroy();
            this.line2Content.destroy();
            this.fontScale.destroy();
            this.subs.forEach(x => x.destroy());
        }
    }

    const ANGLE_FORMATTER = msfssdk.NumberFormatter.create({ precision: 0.01, nanString: '_.__', useMinusSign: true });
    /** Displays a Flight Path Angle. */
    class FpaDisplay extends msfssdk.DisplayComponent {
        constructor() {
            super(...arguments);
            this.numberUnitDisplayRef = msfssdk.FSComponent.createRef();
            this.classList = msfssdk.SetSubject.create(['flight-path-angle-display']);
            this.subs = [];
            this.fpa = msfssdk.NumberUnitSubject.create(msfssdk.UnitType.DEGREE.createNumber(NaN));
        }
        /** @inheritdoc */
        onAfterRender() {
            if (this.props.showClimb) {
                this.subs.push(this.props.showClimb.sub(showClimb => {
                    this.classList.toggle('show-phase', showClimb);
                }, true));
            }
            if (this.props.isEdited) {
                this.subs.push(this.props.isEdited.sub(isEdited => {
                    this.classList.toggle('edited', isEdited);
                }, true));
            }
            // FPA is stored as a positive number, but needs to be displayed as a negative one
            this.subs.push(this.props.fpa.pipe(this.fpa, x => -x));
        }
        /** @inheritdoc */
        render() {
            var _a;
            return (msfssdk.FSComponent.buildComponent("div", { class: this.classList },
                msfssdk.FSComponent.buildComponent("div", { class: "phase" }, "CLIMB"),
                msfssdk.FSComponent.buildComponent(garminsdk.NumberUnitDisplay, { ref: this.numberUnitDisplayRef, class: "fpa-number-unit", value: this.fpa, formatter: (_a = this.props.formatter) !== null && _a !== void 0 ? _a : ANGLE_FORMATTER, displayUnit: null }),
                this.props.isEdited !== undefined &&
                msfssdk.FSComponent.buildComponent("img", { class: "pencil-icon", src: "coui://html_ui/Pages/VCockpit/Instruments/NavSystems/TTX/WTG3000/Assets/Images/GTC/icon_pencil.png" })));
        }
        /** @inheritdoc */
        destroy() {
            var _a;
            super.destroy();
            (_a = this.numberUnitDisplayRef.getOrDefault()) === null || _a === void 0 ? void 0 : _a.destroy();
            this.subs.forEach(x => x.destroy());
        }
    }

    /** Displays an altitude constraint, simply. */
    class SimpleAltitudeConstraintDisplay extends msfssdk.DisplayComponent {
        constructor() {
            super(...arguments);
            this.altitude1Feet = this.props.altitude1.map(x => x.asUnit(msfssdk.UnitType.FOOT));
            this.line1Content = msfssdk.MappedSubject.create(([altitude1Feet, isFlightLevel]) => {
                return AltitudeConstraintDisplay.formatAltitude(altitude1Feet, isFlightLevel);
            }, this.altitude1Feet, this.props.displayAltitude1AsFlightLevel);
            this.classList = msfssdk.SetSubject.create(['simple-altitude-constraint-display']);
            this.subs = [];
        }
        /** @inheritdoc */
        onAfterRender() {
            this.subs.push(this.props.displayAltitude1AsFlightLevel.sub(isFlightLevel => {
                this.classList.toggle('FL', isFlightLevel);
            }, true));
        }
        /** @inheritdoc */
        render() {
            return (msfssdk.FSComponent.buildComponent("div", { class: this.classList },
                msfssdk.FSComponent.buildComponent("span", null, this.line1Content),
                msfssdk.FSComponent.buildComponent("span", { class: "FT" }, "FT")));
        }
        /** @inheritdoc */
        destroy() {
            super.destroy();
            this.altitude1Feet.destroy();
            this.line1Content.destroy();
            this.subs.forEach(x => x.destroy());
        }
    }

    /* eslint-disable @typescript-eslint/no-empty-interface */
    const SPEED_FORMATTER = msfssdk.NumberFormatter.create({ precision: 1, nanString: '___' });
    /** Displays a speed constraint. */
    class SpeedConstraintDisplay extends msfssdk.DisplayComponent {
        constructor() {
            super(...arguments);
            this.numberUnitDisplayRef = msfssdk.FSComponent.createRef();
            this.classList = msfssdk.SetSubject.create(['speed-constraint-display']);
            this.speed = msfssdk.NumberUnitSubject.create(msfssdk.UnitType.KNOT.createNumber(NaN));
            this.speedMach = msfssdk.ComputedSubject.create(NaN, x => {
                return `M ${x.toFixed(3)}`;
            });
            this.subs = [];
        }
        /** @inheritdoc */
        onAfterRender() {
            this.subs.push(this.props.speed.sub(speed => {
                this.speed.set(speed);
                this.speedMach.set(speed);
            }, true));
            this.subs.push(this.props.speedDesc.sub(speedDesc => {
                this.classList.toggle('at', speedDesc === msfssdk.SpeedRestrictionType.At);
                this.classList.toggle('above', speedDesc === msfssdk.SpeedRestrictionType.AtOrAbove);
                this.classList.toggle('below', speedDesc === msfssdk.SpeedRestrictionType.AtOrBelow);
            }, true));
            this.subs.push(this.props.speedUnit.sub(speedUnit => {
                this.classList.toggle('ias', speedUnit === msfssdk.SpeedUnit.IAS);
                this.classList.toggle('mach', speedUnit === msfssdk.SpeedUnit.MACH);
            }, true));
            if (this.props.isEdited) {
                this.subs.push(this.props.isEdited.sub(isEdited => {
                    this.classList.toggle('edited', isEdited);
                }, true));
            }
            if (this.props.isInvalid) {
                this.subs.push(this.props.isInvalid.sub(isInvalid => {
                    this.classList.toggle('invalid', isInvalid);
                }, true));
            }
        }
        /** @inheritdoc */
        render() {
            return (msfssdk.FSComponent.buildComponent("div", { class: this.classList },
                msfssdk.FSComponent.buildComponent("div", { class: "lines-box" },
                    msfssdk.FSComponent.buildComponent("div", { class: "mach" }, this.speedMach),
                    msfssdk.FSComponent.buildComponent(garminsdk.NumberUnitDisplay, { ref: this.numberUnitDisplayRef, class: "speed-number-unit", value: this.speed, formatter: SPEED_FORMATTER, displayUnit: this.props.userSpeedUnitsSetting }),
                    this.props.isInvalid !== undefined &&
                    msfssdk.FSComponent.buildComponent("img", { class: "invalid-image single", src: "coui://html_ui/Pages/VCockpit/Instruments/NavSystems/TTX/WTG3000/Assets/Images/GTC/wt_cyan_crossed_out.png" })),
                this.props.isEdited !== undefined &&
                msfssdk.FSComponent.buildComponent("img", { class: "pencil-icon", src: "coui://html_ui/Pages/VCockpit/Instruments/NavSystems/TTX/WTG3000/Assets/Images/GTC/icon_pencil.png" })));
        }
        /** @inheritdoc */
        destroy() {
            var _a;
            super.destroy();
            (_a = this.numberUnitDisplayRef.getOrDefault()) === null || _a === void 0 ? void 0 : _a.destroy();
            this.subs.forEach(x => x.destroy());
        }
    }

    /**
     * Keys for standard display pane views.
     */
    exports.DisplayPaneViewKeys = void 0;
    (function (DisplayPaneViewKeys) {
        DisplayPaneViewKeys["PfdInstrument"] = "pfd-instrument";
        DisplayPaneViewKeys["NavigationMap"] = "navigation-map";
        DisplayPaneViewKeys["TrafficMap"] = "traffic-map";
        DisplayPaneViewKeys["WeatherMap"] = "weather-map";
        DisplayPaneViewKeys["WeatherRadar"] = "weather-radar";
        DisplayPaneViewKeys["ProcedurePreview"] = "procedure-preview";
        DisplayPaneViewKeys["WaypointInfo"] = "waypoint-info";
        DisplayPaneViewKeys["Nearest"] = "nearest";
        DisplayPaneViewKeys["Gps1Status"] = "gps1-status";
        DisplayPaneViewKeys["Gps2Status"] = "gps2-status";
    })(exports.DisplayPaneViewKeys || (exports.DisplayPaneViewKeys = {}));

    /**
     * Utility class for retrieving G3000 display pane setting managers.
     */
    class DisplayPanesUserSettings {
        /**
         * Retrieves a manager for all true map settings.
         * @param bus The event bus.
         * @returns A manager for all true map settings.
         */
        static getMasterManager(bus) {
            var _a;
            return (_a = DisplayPanesUserSettings.masterInstance) !== null && _a !== void 0 ? _a : (DisplayPanesUserSettings.masterInstance = new msfssdk.DefaultUserSettingManager(bus, [
                ...DisplayPanesUserSettings.getDisplayPaneSettingDefs(exports.DisplayPaneIndex.LeftPfdInstrument),
                ...DisplayPanesUserSettings.getDisplayPaneSettingDefs(exports.DisplayPaneIndex.LeftPfd),
                ...DisplayPanesUserSettings.getDisplayPaneSettingDefs(exports.DisplayPaneIndex.LeftMfd),
                ...DisplayPanesUserSettings.getDisplayPaneSettingDefs(exports.DisplayPaneIndex.RightMfd),
                ...DisplayPanesUserSettings.getDisplayPaneSettingDefs(exports.DisplayPaneIndex.RightPfd),
                ...DisplayPanesUserSettings.getDisplayPaneSettingDefs(exports.DisplayPaneIndex.RightPfdInstrument),
            ]));
        }
        /**
         * Retrieves a manager for aliased map settings for a single display pane.
         * @param bus The event bus.
         * @param index The index of the display pane.
         * @returns A manager for aliased map settings for the specified display pane.
         */
        static getDisplayPaneManager(bus, index) {
            var _a;
            var _b;
            return (_a = (_b = DisplayPanesUserSettings.displayPaneInstances)[index]) !== null && _a !== void 0 ? _a : (_b[index] = DisplayPanesUserSettings.getMasterManager(bus).mapTo(DisplayPanesUserSettings.getDisplayPaneAliasMap(index)));
        }
        /**
         * Gets an array of definitions for true map settings for a single display pane.
         * @param index The index of the display pane.
         * @returns An array of definitions for true map settings for the specified display pane.
         */
        static getDisplayPaneSettingDefs(index) {
            let isVisible;
            let view;
            let designatedView;
            let designatedWeatherView;
            switch (index) {
                case exports.DisplayPaneIndex.LeftPfdInstrument:
                case exports.DisplayPaneIndex.RightPfdInstrument:
                    isVisible = true;
                    view = exports.DisplayPaneViewKeys.PfdInstrument;
                    designatedView = exports.DisplayPaneViewKeys.PfdInstrument;
                    designatedWeatherView = exports.DisplayPaneViewKeys.WeatherMap;
                    break;
                case exports.DisplayPaneIndex.LeftPfd:
                case exports.DisplayPaneIndex.RightPfd:
                    isVisible = false;
                    view = exports.DisplayPaneViewKeys.NavigationMap;
                    designatedView = exports.DisplayPaneViewKeys.NavigationMap;
                    designatedWeatherView = exports.DisplayPaneViewKeys.WeatherMap;
                    break;
                case exports.DisplayPaneIndex.LeftMfd:
                case exports.DisplayPaneIndex.RightMfd:
                    isVisible = true;
                    view = exports.DisplayPaneViewKeys.NavigationMap;
                    designatedView = exports.DisplayPaneViewKeys.NavigationMap;
                    designatedWeatherView = exports.DisplayPaneViewKeys.WeatherMap;
                    break;
            }
            return [
                {
                    name: `displayPaneVisible_${index}`,
                    defaultValue: isVisible
                },
                {
                    name: `displayPaneView_${index}`,
                    defaultValue: view
                },
                {
                    name: `displayPaneDesignatedView_${index}`,
                    defaultValue: designatedView
                },
                {
                    name: `displayPaneDesignatedWeatherView_${index}`,
                    defaultValue: designatedWeatherView
                },
                {
                    name: `displayPaneController_${index}`,
                    defaultValue: -1,
                },
                {
                    name: `displayPaneHalfSizeOnly_${index}`,
                    defaultValue: false,
                },
                {
                    name: `displayPaneMapPointerActive_${index}`,
                    defaultValue: false
                }
            ];
        }
        /**
         * Gets a setting name alias mapping for a display pane.
         * @param index The index of the display pane.
         * @returns A setting name alias mapping for the specified display pane.
         */
        static getDisplayPaneAliasMap(index) {
            const map = {};
            for (const name of DisplayPanesUserSettings.ALIASED_SETTING_NAMES) {
                map[name] = `${name}_${index}`;
            }
            return map;
        }
    }
    DisplayPanesUserSettings.ALIASED_SETTING_NAMES = [
        'displayPaneVisible',
        'displayPaneView',
        'displayPaneDesignatedView',
        'displayPaneDesignatedWeatherView',
        'displayPaneController',
        'displayPaneHalfSizeOnly',
        'displayPaneMapPointerActive'
    ];
    DisplayPanesUserSettings.displayPaneInstances = [];

    /**
     * The DisplayPane component.
     */
    class DisplayPane extends msfssdk.DisplayComponent {
        constructor() {
            super(...arguments);
            this.displayPaneTitleRef = msfssdk.FSComponent.createRef();
            this.displayPaneContentRef = msfssdk.FSComponent.createRef();
            this.rootCssClass = msfssdk.SetSubject.create(['display-pane']);
            this.paneTitle = msfssdk.Subject.create('');
            this.refsMap = new Map();
            this.activeViewEntry = msfssdk.Subject.create(null);
            /** The key of the currently active view. */
            this.activeViewKey = this.activeViewEntry.map(entry => { var _a; return (_a = entry === null || entry === void 0 ? void 0 : entry.key) !== null && _a !== void 0 ? _a : ''; });
            /** The currently active view. */
            this.activeView = this.activeViewEntry.map(entry => entry === null || entry === void 0 ? void 0 : entry.view);
            this.paneSettingsManager = DisplayPanesUserSettings.getDisplayPaneManager(this.props.bus, this.props.index);
            this.fullSize = msfssdk.SubscribableUtils.toSubscribable(this.props.fullSize, true);
            this.halfSize = msfssdk.SubscribableUtils.toSubscribable(this.props.halfSize, true);
            this.wasVisible = undefined;
            this.isAlive = true;
            this._isAwake = false;
        }
        /** @inheritdoc */
        onAfterRender() {
            this.paneTitle.sub(title => {
                this.clearTitle();
                if (typeof title === 'object') {
                    msfssdk.FSComponent.render(title, this.displayPaneTitleRef.instance);
                }
                else {
                    this.displayPaneTitleRef.instance.textContent = title;
                }
                this.renderedTitle = title;
            }, true);
            this.controllerSub = this.paneSettingsManager.getSetting('displayPaneController').sub(controller => {
                switch (controller) {
                    case exports.DisplayPaneControlGtcIndex.LeftGtc:
                        this.rootCssClass.delete('display-pane-selected-right');
                        this.rootCssClass.add('display-pane-selected-left');
                        break;
                    case exports.DisplayPaneControlGtcIndex.RightGtc:
                        this.rootCssClass.delete('display-pane-selected-left');
                        this.rootCssClass.add('display-pane-selected-right');
                        break;
                    default:
                        this.rootCssClass.delete('display-pane-selected-left');
                        this.rootCssClass.delete('display-pane-selected-right');
                }
            }, true);
            this.sizeModeSub = this.props.sizeMode.sub(this.onSizeModeChanged.bind(this), true);
            this.fullSizeSub = this.fullSize.sub(size => {
                var _a;
                if (this.props.sizeMode.get() === exports.DisplayPaneSizeMode.Full) {
                    (_a = this.activeViewEntry.get()) === null || _a === void 0 ? void 0 : _a.view.onResize(exports.DisplayPaneSizeMode.Full, size[0], size[1]);
                }
            }, false, !this._isAwake);
            this.halfSizeSub = this.fullSize.sub(size => {
                var _a;
                if (this.props.sizeMode.get() === exports.DisplayPaneSizeMode.Half) {
                    (_a = this.activeViewEntry.get()) === null || _a === void 0 ? void 0 : _a.view.onResize(exports.DisplayPaneSizeMode.Half, size[0], size[1]);
                }
            }, false, !this._isAwake);
            this.viewSub = this.paneSettingsManager.getSetting('displayPaneView').sub(this.open.bind(this), true);
            this.eventSub = this.props.bus.getSubscriber()
                .on('display_pane_view_event')
                .handle(this.onEvent.bind(this), !this._isAwake);
        }
        /**
         * Checks whether this pane is awake.
         * @returns Whether this pane is awake.
         */
        isAwake() {
            return this._isAwake;
        }
        /**
         * Wakes this pane. This will resume this pane's active view (if one exists) and resume handling of display pane
         * view events.
         * @throws Error if this pane has been destroyed.
         */
        wake() {
            var _a, _b, _c;
            if (!this.isAlive) {
                throw new Error('DisplayPane: cannot wake a dead pane');
            }
            if (this._isAwake) {
                return;
            }
            this._isAwake = true;
            if (this.props.sizeMode.get() !== exports.DisplayPaneSizeMode.Hidden) {
                const activeViewEntry = this.activeViewEntry.get();
                if (activeViewEntry !== null) {
                    this.resumeView(activeViewEntry);
                }
            }
            (_a = this.fullSizeSub) === null || _a === void 0 ? void 0 : _a.resume();
            (_b = this.halfSizeSub) === null || _b === void 0 ? void 0 : _b.resume();
            (_c = this.eventSub) === null || _c === void 0 ? void 0 : _c.resume();
        }
        /**
         * Puts this pane to sleep. This will pause this pane's active view (if one exists) and suspend handling of display
         * pane view events.
         * @throws Error if this pane has been destroyed.
         */
        sleep() {
            var _a, _b, _c;
            if (!this.isAlive) {
                throw new Error('DisplayPane: cannot sleep a dead pane');
            }
            if (!this._isAwake) {
                return;
            }
            this._isAwake = false;
            (_a = this.fullSizeSub) === null || _a === void 0 ? void 0 : _a.pause();
            (_b = this.halfSizeSub) === null || _b === void 0 ? void 0 : _b.pause();
            (_c = this.eventSub) === null || _c === void 0 ? void 0 : _c.pause();
            if (this.props.sizeMode.get() !== exports.DisplayPaneSizeMode.Hidden) {
                const activeViewEntry = this.activeViewEntry.get();
                if (activeViewEntry !== null) {
                    this.pauseView(activeViewEntry);
                }
            }
        }
        /**
         * Updates this display pane. Has no effect if this display pane is not visible.
         * @param time The current real (operating system) time, as a UNIX timestamp in milliseconds.
         */
        update(time) {
            var _a;
            if (this.props.sizeMode.get() !== exports.DisplayPaneSizeMode.Hidden) {
                (_a = this.activeViewEntry.get()) === null || _a === void 0 ? void 0 : _a.view.onUpdate(time);
            }
        }
        /**
         * Opens a view.
         * @param key The key of the view to open.
         */
        open(key) {
            let viewEntry = this.refsMap.get(key);
            if (viewEntry === undefined) {
                viewEntry = this.createView(key);
                this.refsMap.set(key, viewEntry);
            }
            this.paneSettingsManager.getSetting('displayPaneHalfSizeOnly').value = viewEntry.halfSizeOnly;
            const sizeMode = this.props.sizeMode.get();
            const isVisible = sizeMode !== exports.DisplayPaneSizeMode.Hidden;
            const activeViewEntry = this.activeViewEntry.get();
            if (activeViewEntry !== null) {
                activeViewEntry.isVisible.set(false);
                if (isVisible && this._isAwake) {
                    this.pauseView(activeViewEntry);
                }
            }
            this.activeViewEntry.set(viewEntry);
            // If a view only supports half-size mode, only make it visible in half-size mode.
            viewEntry.isVisible.set(!viewEntry.halfSizeOnly || sizeMode === exports.DisplayPaneSizeMode.Half);
            if (isVisible && this._isAwake) {
                this.resumeView(viewEntry);
            }
        }
        /**
         * Creates a view.
         * @param type The type string of the view to create.
         * @returns A ViewEntry for the created view.
         */
        createView(type) {
            var _a;
            const node = this.props.displayPaneViewFactory.createViewNode(type, this.props.index);
            const isVisible = msfssdk.Subject.create(false);
            msfssdk.FSComponent.render(msfssdk.FSComponent.buildComponent(DisplayPaneViewWrapper, { isVisible: isVisible }, node), this.displayPaneContentRef.instance);
            const view = node.instance;
            return {
                key: type,
                view,
                halfSizeOnly: (_a = view.props.halfSizeOnly) !== null && _a !== void 0 ? _a : false,
                isVisible,
                titleSubscription: view.title.pipe(this.paneTitle, true),
            };
        }
        /**
         * Resumes a view.
         * @param entry The entry for the view to resume.
         */
        resumeView(entry) {
            const sizeMode = this.props.sizeMode.get();
            const size = sizeMode === exports.DisplayPaneSizeMode.Full ? this.fullSize.get() : this.halfSize.get();
            entry.titleSubscription.resume(true);
            entry.view.onResume(sizeMode, size[0], size[1]);
        }
        /**
         * Pauses a view.
         * @param entry The entry for the view to pause.
         */
        pauseView(entry) {
            entry.titleSubscription.pause();
            entry.view.onPause();
        }
        /**
         * Clears this pane's rendered title.
         */
        clearTitle() {
            if (this.renderedTitle === undefined) {
                return;
            }
            if (typeof this.renderedTitle === 'object') {
                msfssdk.FSComponent.visitNodes(this.renderedTitle, node => {
                    if (node.instance instanceof msfssdk.DisplayComponent) {
                        node.instance.destroy();
                        return true;
                    }
                    return false;
                });
            }
            this.displayPaneTitleRef.instance.textContent = '';
            this.renderedTitle = undefined;
        }
        /**
         * Responds to when this pane's size mode changes.
         * @param sizeMode The new size mode.
         */
        onSizeModeChanged(sizeMode) {
            const wasVisible = this.wasVisible;
            const isVisible = sizeMode !== exports.DisplayPaneSizeMode.Hidden;
            this.wasVisible = isVisible;
            const activeViewEntry = this.activeViewEntry.get();
            this.rootCssClass.toggle('display-pane-full', sizeMode === exports.DisplayPaneSizeMode.Full);
            this.rootCssClass.toggle('display-pane-half', sizeMode === exports.DisplayPaneSizeMode.Half);
            if (isVisible) {
                this.rootCssClass.delete('hidden');
                if (this._isAwake) {
                    if (wasVisible === isVisible) {
                        const size = sizeMode === exports.DisplayPaneSizeMode.Full ? this.fullSize.get() : this.halfSize.get();
                        activeViewEntry === null || activeViewEntry === void 0 ? void 0 : activeViewEntry.view.onResize(sizeMode, size[0], size[1]);
                    }
                    else {
                        if (activeViewEntry !== null) {
                            this.resumeView(activeViewEntry);
                        }
                    }
                }
                // If the active view only supports half-size mode, make sure to update its visibility based on the new size mode.
                if (activeViewEntry !== null && activeViewEntry.halfSizeOnly) {
                    activeViewEntry.isVisible.set(sizeMode === exports.DisplayPaneSizeMode.Half);
                }
            }
            else {
                this.rootCssClass.add('hidden');
                if (this._isAwake && activeViewEntry !== null) {
                    this.pauseView(activeViewEntry);
                }
            }
        }
        /**
         * Responds to when a display pane view event is received.
         * @param event The received event.
         */
        onEvent(event) {
            var _a;
            if (event.displayPaneIndex === this.props.index) {
                (_a = this.activeView.get()) === null || _a === void 0 ? void 0 : _a.onEvent(event);
            }
        }
        /** @inheritdoc */
        render() {
            var _a;
            if (typeof this.props.class === 'object') {
                this.cssClassSub = msfssdk.FSComponent.bindCssClassSet(this.rootCssClass, this.props.class, ['display-pane']);
            }
            else {
                const classesToAdd = msfssdk.FSComponent.parseCssClassesFromString((_a = this.props.class) !== null && _a !== void 0 ? _a : '').filter(val => !DisplayPane.RESERVED_CLASSES.includes(val));
                for (const classToAdd of classesToAdd) {
                    this.rootCssClass.add(classToAdd);
                }
            }
            return (msfssdk.FSComponent.buildComponent("div", { class: this.rootCssClass },
                msfssdk.FSComponent.buildComponent("div", { class: "display-pane-title-bar" },
                    msfssdk.FSComponent.buildComponent("div", { class: "display-pane-title-text", ref: this.displayPaneTitleRef }, this.paneTitle)),
                msfssdk.FSComponent.buildComponent("div", { ref: this.displayPaneContentRef, class: "display-pane-content" })));
        }
        /** @inheritdoc */
        destroy() {
            var _a, _b, _c, _d, _e, _f, _g;
            this.isAlive = false;
            for (const entry of this.refsMap.values()) {
                entry.titleSubscription.destroy();
                entry.view.destroy();
            }
            this.clearTitle();
            (_a = this.cssClassSub) === null || _a === void 0 ? void 0 : _a.destroy();
            (_b = this.controllerSub) === null || _b === void 0 ? void 0 : _b.destroy();
            (_c = this.sizeModeSub) === null || _c === void 0 ? void 0 : _c.destroy();
            (_d = this.fullSizeSub) === null || _d === void 0 ? void 0 : _d.destroy();
            (_e = this.halfSizeSub) === null || _e === void 0 ? void 0 : _e.destroy();
            (_f = this.viewSub) === null || _f === void 0 ? void 0 : _f.destroy();
            (_g = this.eventSub) === null || _g === void 0 ? void 0 : _g.destroy();
            super.destroy();
        }
    }
    DisplayPane.RESERVED_CLASSES = ['display-pane', 'display-pane-selected-left', 'display-pane-selected-right', 'display-pane-full', 'display-pane-half'];
    /** A simple div wrapper useful for hiding and unhiding its child component */
    class DisplayPaneViewWrapper extends msfssdk.DisplayComponent {
        constructor() {
            super(...arguments);
            this.cssClass = this.props.isVisible.map((isVisible) => isVisible ? '' : 'hidden');
        }
        /** @inheritDoc */
        render() {
            return (msfssdk.FSComponent.buildComponent("div", { class: this.cssClass, style: 'position: absolute; left: 0; top: 0; width: 100%; height: 100%;' }, this.props.children));
        }
        /** @inheritDoc */
        destroy() {
            this.cssClass.destroy();
            super.destroy();
        }
    }

    /**
     * A container for two display panes: a left pane and a right pane. Automatically controls the size of each display
     * pane such that if both are visible, each is sized as a half pane, and if only one is visible, it is sized as a full
     * pane.
     */
    class DisplayPaneContainer extends msfssdk.DisplayComponent {
        constructor() {
            super(...arguments);
            this.leftPaneRef = msfssdk.FSComponent.createRef();
            this.rightPaneRef = msfssdk.FSComponent.createRef();
            this.leftPaneSettingsManager = DisplayPanesUserSettings.getDisplayPaneManager(this.props.bus, this.props.leftIndex);
            this.rightPaneSettingsManager = DisplayPanesUserSettings.getDisplayPaneManager(this.props.bus, this.props.rightIndex);
            this.leftPaneSizeMode = msfssdk.Subject.create(exports.DisplayPaneSizeMode.Hidden);
            this.rightPaneSizeMode = msfssdk.Subject.create(exports.DisplayPaneSizeMode.Hidden);
            this.paneState = msfssdk.MappedSubject.create(this.leftPaneSettingsManager.getSetting('displayPaneVisible'), this.rightPaneSettingsManager.getSetting('displayPaneVisible'));
            this.isSplit = this.paneState.map(([isLeftPaneVisible, isRightPaneVisible]) => isLeftPaneVisible && isRightPaneVisible);
            this.cssClassSet = msfssdk.SetSubject.create(['display-pane-container']);
            this.updateFreq = msfssdk.SubscribableUtils.toSubscribable(this.props.updateFreq, true);
            this.updateClock = msfssdk.ConsumerSubject.create(null, 0).pause();
            this.tickCounter = 0;
            this.isAlive = true;
            this._isAwake = false;
        }
        /** @inheritdoc */
        onAfterRender() {
            this.paneStateSub = this.paneState.sub(([isLeftPaneVisible, isRightPaneVisible]) => {
                const leftPaneSizeMode = isLeftPaneVisible
                    ? isRightPaneVisible ? exports.DisplayPaneSizeMode.Half : exports.DisplayPaneSizeMode.Full
                    : exports.DisplayPaneSizeMode.Hidden;
                const rightPaneSizeMode = isRightPaneVisible
                    ? isLeftPaneVisible ? exports.DisplayPaneSizeMode.Half : exports.DisplayPaneSizeMode.Full
                    : exports.DisplayPaneSizeMode.Hidden;
                this.leftPaneSizeMode.set(leftPaneSizeMode);
                this.rightPaneSizeMode.set(rightPaneSizeMode);
            }, this._isAwake, !this._isAwake);
            this.updateClock.sub(this.update.bind(this));
            if (this._isAwake) {
                this.leftPaneRef.instance.wake();
                this.rightPaneRef.instance.wake();
            }
            const realTimeConsumer = this.props.bus.getSubscriber().on('realTime');
            this.updateFreqSub = this.updateFreq.sub(freq => {
                this.updateClock.setConsumer(realTimeConsumer.atFrequency(freq));
            }, this._isAwake, !this._isAwake);
        }
        /**
         * Checks whether this container is awake.
         * @returns Whether this container is awake.
         */
        isAwake() {
            return this._isAwake;
        }
        /**
         * Wakes this container. This will wake this container's child panes and resume updates.
         * @throws Error if this container has been destroyed.
         */
        wake() {
            var _a, _b, _c, _d;
            if (!this.isAlive) {
                throw new Error('DisplayPaneContainer: cannot wake a dead container');
            }
            if (this._isAwake) {
                return;
            }
            this._isAwake = true;
            (_a = this.paneStateSub) === null || _a === void 0 ? void 0 : _a.resume(true);
            (_b = this.updateFreqSub) === null || _b === void 0 ? void 0 : _b.resume(true);
            (_c = this.leftPaneRef.getOrDefault()) === null || _c === void 0 ? void 0 : _c.wake();
            (_d = this.rightPaneRef.getOrDefault()) === null || _d === void 0 ? void 0 : _d.wake();
            this.updateClock.resume();
        }
        /**
         * Puts this container to sleep. This will put this container's child panes to sleep and pause updates.
         * @throws Error if this container has been destroyed.
         */
        sleep() {
            var _a, _b, _c, _d;
            if (!this.isAlive) {
                throw new Error('DisplayPaneContainer: cannot sleep a dead container');
            }
            if (!this._isAwake) {
                return;
            }
            this._isAwake = false;
            (_a = this.paneStateSub) === null || _a === void 0 ? void 0 : _a.pause();
            (_b = this.updateFreqSub) === null || _b === void 0 ? void 0 : _b.pause();
            (_c = this.leftPaneRef.getOrDefault()) === null || _c === void 0 ? void 0 : _c.sleep();
            (_d = this.rightPaneRef.getOrDefault()) === null || _d === void 0 ? void 0 : _d.sleep();
            this.updateClock.pause();
        }
        /**
         * Updates this container's panes.
         * @param time The current real (operating system) time, as a UNIX timestamp in milliseconds.
         */
        update(time) {
            if (this.props.alternateUpdatesInSplitMode && this.isSplit.get()) {
                if (this.tickCounter % 2 === 0) {
                    this.leftPaneRef.instance.update(time);
                }
                else {
                    this.rightPaneRef.instance.update(time);
                }
            }
            else {
                this.leftPaneRef.instance.update(time);
                this.rightPaneRef.instance.update(time);
            }
            this.tickCounter++;
        }
        /** @inheritdoc */
        render() {
            if (typeof this.props.class === 'object') {
                this.cssClassSub = msfssdk.FSComponent.bindCssClassSet(this.cssClassSet, this.props.class, ['display-pane-container']);
            }
            else if (this.props.class !== undefined) {
                for (const cssClass of msfssdk.FSComponent.parseCssClassesFromString(this.props.class).filter(val => val !== 'display-pane-container')) {
                    this.cssClassSet.add(cssClass);
                }
            }
            return (msfssdk.FSComponent.buildComponent("div", { class: this.cssClassSet },
                msfssdk.FSComponent.buildComponent(DisplayPane, { ref: this.leftPaneRef, bus: this.props.bus, index: this.props.leftIndex, displayPaneViewFactory: this.props.displayPaneViewFactory, sizeMode: this.leftPaneSizeMode, fullSize: this.props.leftPaneFullSize, halfSize: this.props.leftPaneHalfSize, class: 'display-pane-left' }),
                msfssdk.FSComponent.buildComponent(DisplayPane, { ref: this.rightPaneRef, bus: this.props.bus, index: this.props.rightIndex, displayPaneViewFactory: this.props.displayPaneViewFactory, sizeMode: this.rightPaneSizeMode, fullSize: this.props.rightPaneFullSize, halfSize: this.props.rightPaneHalfSize, class: 'display-pane-right' })));
        }
        /** @inheritdoc */
        destroy() {
            var _a, _b;
            this.isAlive = false;
            this.paneState.destroy();
            this.updateClock.destroy();
            (_a = this.cssClassSub) === null || _a === void 0 ? void 0 : _a.destroy();
            (_b = this.updateFreqSub) === null || _b === void 0 ? void 0 : _b.destroy();
            super.destroy();
        }
    }

    /**
     * Keeps track of which display pane is being controlled by which GTC.
     */
    class DisplayPanesController {
        /**
         * Creates a new DisplayPanesController.
         * @param bus The event bus.
         */
        constructor(bus) {
            this.bus = bus;
            this.gtc1SelectedPane = msfssdk.Subject.create(-1);
            this.gtc2SelectedPane = msfssdk.Subject.create(-1);
            this.paneSelections = {
                [exports.DisplayPaneControlGtcIndex.LeftGtc]: this.gtc1SelectedPane,
                [exports.DisplayPaneControlGtcIndex.RightGtc]: this.gtc2SelectedPane,
            };
            this.gtcSelectedPaneState = msfssdk.MappedSubject.create(this.gtc1SelectedPane, this.gtc2SelectedPane);
            this.displayPanePublisher = this.bus.getPublisher();
            this.displayPanesSettings = DisplayPanesUserSettings.getMasterManager(this.bus);
            this.displayPaneVisibleSettings = {
                [exports.DisplayPaneIndex.LeftPfdInstrument]: this.displayPanesSettings.getSetting(`displayPaneVisible_${exports.DisplayPaneIndex.LeftPfdInstrument}`),
                [exports.DisplayPaneIndex.LeftPfd]: this.displayPanesSettings.getSetting(`displayPaneVisible_${exports.DisplayPaneIndex.LeftPfd}`),
                [exports.DisplayPaneIndex.LeftMfd]: this.displayPanesSettings.getSetting(`displayPaneVisible_${exports.DisplayPaneIndex.LeftMfd}`),
                [exports.DisplayPaneIndex.RightMfd]: this.displayPanesSettings.getSetting(`displayPaneVisible_${exports.DisplayPaneIndex.RightMfd}`),
                [exports.DisplayPaneIndex.RightPfd]: this.displayPanesSettings.getSetting(`displayPaneVisible_${exports.DisplayPaneIndex.RightPfd}`),
                [exports.DisplayPaneIndex.RightPfdInstrument]: this.displayPanesSettings.getSetting(`displayPaneVisible_${exports.DisplayPaneIndex.RightPfdInstrument}`),
            };
            this.displayPaneControllerSettings = {
                [exports.DisplayPaneIndex.LeftPfdInstrument]: this.displayPanesSettings.getSetting(`displayPaneController_${exports.DisplayPaneIndex.LeftPfdInstrument}`),
                [exports.DisplayPaneIndex.LeftPfd]: this.displayPanesSettings.getSetting(`displayPaneController_${exports.DisplayPaneIndex.LeftPfd}`),
                [exports.DisplayPaneIndex.LeftMfd]: this.displayPanesSettings.getSetting(`displayPaneController_${exports.DisplayPaneIndex.LeftMfd}`),
                [exports.DisplayPaneIndex.RightMfd]: this.displayPanesSettings.getSetting(`displayPaneController_${exports.DisplayPaneIndex.RightMfd}`),
                [exports.DisplayPaneIndex.RightPfd]: this.displayPanesSettings.getSetting(`displayPaneController_${exports.DisplayPaneIndex.RightPfd}`),
                [exports.DisplayPaneIndex.RightPfdInstrument]: this.displayPanesSettings.getSetting(`displayPaneController_${exports.DisplayPaneIndex.RightPfdInstrument}`),
            };
            this.displayPaneHalfSizeOnlySettings = {
                [exports.DisplayPaneIndex.LeftMfd]: this.displayPanesSettings.getSetting(`displayPaneHalfSizeOnly_${exports.DisplayPaneIndex.LeftMfd}`),
                [exports.DisplayPaneIndex.RightMfd]: this.displayPanesSettings.getSetting(`displayPaneHalfSizeOnly_${exports.DisplayPaneIndex.RightMfd}`)
            };
            this.mfdState = 'split';
            this.gtc1SelectedPane.sub(v => {
                this.displayPanePublisher.pub('left_gtc_selected_display_pane', v, true);
            }, true);
            this.gtc2SelectedPane.sub(v => {
                this.displayPanePublisher.pub('right_gtc_selected_display_pane', v, true);
            }, true);
            this.gtcSelectedPaneState.sub(([gtc1SelectedPane, gtc2SelectedPane]) => {
                // update pane controller settings
                for (const paneIndex of DisplayPanesController.DISPLAY_PANE_INDEXES) {
                    const controllerSetting = this.displayPaneControllerSettings[paneIndex];
                    controllerSetting.value = gtc1SelectedPane === paneIndex
                        ? exports.DisplayPaneControlGtcIndex.LeftGtc
                        : gtc2SelectedPane === paneIndex
                            ? exports.DisplayPaneControlGtcIndex.RightGtc
                            : -1;
                }
            }, true);
            // If a half-size only display pane is displayed on an MFD pane, ensure that the MFD is in half pane mode.
            this.displayPaneHalfSizeOnlySettings[exports.DisplayPaneIndex.LeftMfd].sub(isHalfSizeOnly => {
                if (isHalfSizeOnly && !this.displayPaneVisibleSettings[exports.DisplayPaneIndex.RightMfd].value) {
                    this.splitMfd();
                }
            });
            this.displayPaneHalfSizeOnlySettings[exports.DisplayPaneIndex.RightMfd].sub(isHalfSizeOnly => {
                if (isHalfSizeOnly && !this.displayPaneVisibleSettings[exports.DisplayPaneIndex.LeftMfd].value) {
                    this.splitMfd();
                }
            });
            const displayPaneControlEvents = this.bus.getSubscriber();
            displayPaneControlEvents.on('gtc_1_display_pane_select').handle(paneIndex => {
                if (paneIndex !== this.gtc1SelectedPane.get()) {
                    this.gtc1SelectedPane.set(DisplayPanesController.getBestAvailablePane(exports.DisplayPaneControlGtcIndex.LeftGtc, paneIndex, this._getAvailablePanes()));
                }
                // We notify in case the selected pane hasn't changed, because GtcService needs to get corrected
                this.gtc1SelectedPane.notify();
            });
            displayPaneControlEvents.on('gtc_2_display_pane_select').handle(paneIndex => {
                if (paneIndex !== this.gtc2SelectedPane.get()) {
                    this.gtc2SelectedPane.set(DisplayPanesController.getBestAvailablePane(exports.DisplayPaneControlGtcIndex.RightGtc, paneIndex, this._getAvailablePanes()));
                }
                // We notify in case the selected pane hasn't changed, because GtcService needs to get corrected
                this.gtc2SelectedPane.notify();
            });
            displayPaneControlEvents.on('change_display_pane_select_left').handle(gtcIndex => {
                const gtc = this.paneSelections[gtcIndex];
                const gtcPaneSelection = gtc.get() === -1 ? 5 : gtc.get();
                const availablePanes = this._getAvailablePanes();
                let newPaneIndex = 0;
                for (let i = 0; i < availablePanes.length; i++) {
                    const paneIndex = availablePanes[i];
                    if (paneIndex < gtcPaneSelection) {
                        newPaneIndex = paneIndex;
                    }
                }
                if (newPaneIndex > 0) {
                    gtc.set(newPaneIndex);
                }
            });
            displayPaneControlEvents.on('change_display_pane_select_right').handle(gtcIndex => {
                const gtc = this.paneSelections[gtcIndex];
                const gtcPaneSelection = gtc.get() === -1 ? 0 : gtc.get();
                const availablePanes = this._getAvailablePanes();
                for (let i = 0; i < availablePanes.length; i++) {
                    if (availablePanes[i] > gtcPaneSelection) {
                        gtc.set(availablePanes[i]);
                        break;
                    }
                }
            });
            displayPaneControlEvents.on('toggle_pfd_split').handle(pfdIndex => {
                const paneIndex = pfdIndex === 1 ? exports.DisplayPaneIndex.LeftPfd : exports.DisplayPaneIndex.RightPfd;
                const isVisibleSetting = this.displayPaneVisibleSettings[paneIndex];
                const newPfdPaneVisiblity = !isVisibleSetting.get();
                let reselectLeft = false;
                let reselectRight = false;
                if (!newPfdPaneVisiblity) {
                    if (this.gtc1SelectedPane.get() === paneIndex) {
                        this.gtc1SelectedPane.set(-1);
                        reselectLeft = true;
                    }
                    if (this.gtc2SelectedPane.get() === paneIndex) {
                        this.gtc2SelectedPane.set(-1);
                        reselectRight = true;
                    }
                }
                isVisibleSetting.set(newPfdPaneVisiblity);
                // After pfd pane visiblity is changed, if it was hidden, attempt to select a new pane for the gtc
                if (reselectLeft) {
                    this.gtc1SelectedPane.set(DisplayPanesController.getBestAvailablePane(exports.DisplayPaneControlGtcIndex.LeftGtc, paneIndex, this._getAvailablePanes()));
                }
                else if (reselectRight) {
                    this.gtc2SelectedPane.set(DisplayPanesController.getBestAvailablePane(exports.DisplayPaneControlGtcIndex.RightGtc, paneIndex, this._getAvailablePanes()));
                }
            });
            displayPaneControlEvents.on('toggle_mfd_split').handle(gtcIndex => {
                if (this.mfdState === 'left') {
                    this.splitMfd();
                }
                else if (this.mfdState === 'right') {
                    this.splitMfd();
                }
                else if (this.mfdState === 'split') {
                    // Only switch to full mode if the selected pane supports it.
                    if (this.paneSelections[gtcIndex].get() === exports.DisplayPaneIndex.LeftMfd
                        && !this.displayPaneHalfSizeOnlySettings[exports.DisplayPaneIndex.LeftMfd].value) {
                        this.fullMfdLeft();
                    }
                    if (this.paneSelections[gtcIndex].get() === exports.DisplayPaneIndex.RightMfd
                        && !this.displayPaneHalfSizeOnlySettings[exports.DisplayPaneIndex.RightMfd].value) {
                        this.fullMfdRight();
                    }
                }
            });
        }
        /**
         * Resets this controller's display panes to their default configuration:
         * * MFD in Half Mode.
         * * Navigation Map displayed on both PFD panes and the Left MFD pane.
         * * Traffic Map displayed on the Right MFD pane.
         *
         * This operation leaves PFD Full/Split mode unchanged for both PFDs.
         */
        reset() {
            this.splitMfd();
            this.displayPanesSettings.getSetting(`displayPaneDesignatedView_${exports.DisplayPaneIndex.LeftPfd}`).value = exports.DisplayPaneViewKeys.NavigationMap;
            this.displayPanesSettings.getSetting(`displayPaneView_${exports.DisplayPaneIndex.LeftPfd}`).value = exports.DisplayPaneViewKeys.NavigationMap;
            this.displayPanesSettings.getSetting(`displayPaneDesignatedView_${exports.DisplayPaneIndex.LeftMfd}`).value = exports.DisplayPaneViewKeys.NavigationMap;
            this.displayPanesSettings.getSetting(`displayPaneView_${exports.DisplayPaneIndex.LeftMfd}`).value = exports.DisplayPaneViewKeys.NavigationMap;
            this.displayPanesSettings.getSetting(`displayPaneDesignatedView_${exports.DisplayPaneIndex.RightMfd}`).value = exports.DisplayPaneViewKeys.TrafficMap;
            this.displayPanesSettings.getSetting(`displayPaneView_${exports.DisplayPaneIndex.RightMfd}`).value = exports.DisplayPaneViewKeys.TrafficMap;
            this.displayPanesSettings.getSetting(`displayPaneDesignatedView_${exports.DisplayPaneIndex.RightPfd}`).value = exports.DisplayPaneViewKeys.NavigationMap;
            this.displayPanesSettings.getSetting(`displayPaneView_${exports.DisplayPaneIndex.RightPfd}`).value = exports.DisplayPaneViewKeys.NavigationMap;
        }
        /**
         * Returns an array of controllable display pane indices that are selectable.
         * @returns An array of controllable display pane indices that are selectable.
         */
        _getAvailablePanes() {
            return DisplayPanesController.getAvailablePanes(this.gtc1SelectedPane.get(), this.gtc2SelectedPane.get(), this.displayPaneVisibleSettings);
        }
        /** Split MFD */
        splitMfd() {
            this.mfdState = 'split';
            this.displayPanesSettings.getSetting('displayPaneVisible_2').set(true);
            this.displayPanesSettings.getSetting('displayPaneVisible_3').set(true);
        }
        /** Hide right MFD pane */
        fullMfdLeft() {
            this.mfdState = 'left';
            if (this.gtc1SelectedPane.get() === exports.DisplayPaneIndex.RightMfd) {
                this.gtc1SelectedPane.set(-1);
            }
            if (this.gtc2SelectedPane.get() === exports.DisplayPaneIndex.RightMfd) {
                this.gtc2SelectedPane.set(-1);
            }
            this.displayPanesSettings.getSetting('displayPaneVisible_2').set(true);
            this.displayPanesSettings.getSetting('displayPaneVisible_3').set(false);
        }
        /** Hide left MFD pane */
        fullMfdRight() {
            this.mfdState = 'right';
            if (this.gtc1SelectedPane.get() === exports.DisplayPaneIndex.LeftMfd) {
                this.gtc1SelectedPane.set(-1);
            }
            if (this.gtc2SelectedPane.get() === exports.DisplayPaneIndex.LeftMfd) {
                this.gtc2SelectedPane.set(-1);
            }
            this.displayPanesSettings.getSetting('displayPaneVisible_3').set(true);
            this.displayPanesSettings.getSetting('displayPaneVisible_2').set(false);
        }
        /**
         * Returns an array of controllable display pane indices that are selectable.
         * @param gtc1SelectedPane The index of the selected pane for the left GTC.
         * @param gtc2SelectedPane The index of the selected pane for the right GTC.
         * @param displayPaneVisibleSettings A record of the visibility settings for each controllable display pane.
         * @returns An array of controllable display pane indices that are selectable.
         */
        static getAvailablePanes(gtc1SelectedPane, gtc2SelectedPane, displayPaneVisibleSettings) {
            return DisplayPanesController.CONTROLLABLE_DISPLAY_PANE_INDEXES.filter(index => {
                return gtc1SelectedPane !== index
                    && gtc2SelectedPane !== index
                    && displayPaneVisibleSettings[index].value;
            });
        }
        /**
         * Determines which pane should be selected from the available panes.
         * @param side Which GTC side is this for.
         * @param desiredPane The preferred pane to select, if available.
         * @param availablePanes The available panes.
         * @returns The pane to be selected.
         */
        static getBestAvailablePane(side, desiredPane, availablePanes) {
            if (desiredPane === -1) {
                return -1;
            }
            else {
                if (availablePanes.includes(desiredPane)) {
                    // If pane is available, use that
                    return desiredPane;
                }
                else if (availablePanes.length > 0) {
                    if (side === exports.DisplayPaneControlGtcIndex.LeftGtc) {
                        return availablePanes[0];
                    }
                    else {
                        return availablePanes[availablePanes.length - 1];
                    }
                }
                else {
                    return -1;
                }
            }
        }
    }
    DisplayPanesController.DISPLAY_PANE_INDEXES = [
        exports.DisplayPaneIndex.LeftPfdInstrument,
        exports.DisplayPaneIndex.LeftPfd,
        exports.DisplayPaneIndex.LeftMfd,
        exports.DisplayPaneIndex.RightMfd,
        exports.DisplayPaneIndex.RightPfd,
        exports.DisplayPaneIndex.RightPfdInstrument
    ];
    DisplayPanesController.CONTROLLABLE_DISPLAY_PANE_INDEXES = [
        exports.DisplayPaneIndex.LeftPfd,
        exports.DisplayPaneIndex.LeftMfd,
        exports.DisplayPaneIndex.RightMfd,
        exports.DisplayPaneIndex.RightPfd
    ];

    /** Collection of functions for working with Display Panes. */
    class DisplayPaneUtils {
        /**
         * Checks whether a value is a controllable display pane index.
         * @param value The value to check.
         * @returns Whether the specified value is a controllable display pane index.
         */
        static isControllableDisplayPaneIndex(value) {
            if (typeof (value) === 'number') {
                return DisplayPaneUtils.CONTROLLABLE_INDEXES.includes(value);
            }
            else {
                return false;
            }
        }
        /**
         * Checks whether a value is a PFD instrument display pane index.
         * @param value The value to check.
         * @returns Whether the specified value is a PFD instrument display pane index.
         */
        static isPfdInstrumentDisplayPaneIndex(value) {
            if (typeof (value) === 'number') {
                return DisplayPaneUtils.PFD_INSTRUMENT_INDEXES.includes(value);
            }
            else {
                return false;
            }
        }
        /**
         * Checks whether a value is a PFD display pane index.
         * @param value The value to check.
         * @returns Whether the specified value is a PFD display pane index.
         */
        static isPfdDisplayPaneIndex(value) {
            if (typeof (value) === 'number') {
                return DisplayPaneUtils.PFD_INDEXES.includes(value);
            }
            else {
                return false;
            }
        }
        /**
         * Checks whether a value is an MFD display pane index.
         * @param value The value to check.
         * @returns Whether the specified value is an MFD display pane index.
         */
        static isMfdDisplayPaneIndex(value) {
            if (typeof (value) === 'number') {
                return DisplayPaneUtils.MFD_INDEXES.includes(value);
            }
            else {
                return false;
            }
        }
    }
    /** An array of indexes of all display panes. */
    DisplayPaneUtils.ALL_INDEXES = [
        exports.DisplayPaneIndex.LeftPfdInstrument,
        exports.DisplayPaneIndex.LeftPfd,
        exports.DisplayPaneIndex.LeftMfd,
        exports.DisplayPaneIndex.RightMfd,
        exports.DisplayPaneIndex.RightPfd,
        exports.DisplayPaneIndex.RightPfdInstrument
    ];
    /** An array of indexes of display panes that are controllable by GTCs. */
    DisplayPaneUtils.CONTROLLABLE_INDEXES = [
        exports.DisplayPaneIndex.LeftPfd,
        exports.DisplayPaneIndex.LeftMfd,
        exports.DisplayPaneIndex.RightMfd,
        exports.DisplayPaneIndex.RightPfd
    ];
    /** An array of indexes of PFD instrument display panes. */
    DisplayPaneUtils.PFD_INSTRUMENT_INDEXES = [
        exports.DisplayPaneIndex.LeftPfdInstrument,
        exports.DisplayPaneIndex.RightPfdInstrument
    ];
    /** An array of indexes of PFD display panes. */
    DisplayPaneUtils.PFD_INDEXES = [
        exports.DisplayPaneIndex.LeftPfd,
        exports.DisplayPaneIndex.RightPfd
    ];
    /** An array of indexes of MFD display panes. */
    DisplayPaneUtils.MFD_INDEXES = [
        exports.DisplayPaneIndex.LeftMfd,
        exports.DisplayPaneIndex.RightMfd
    ];

    /* eslint-disable @typescript-eslint/no-unused-vars */
    /** A DisplayPaneView component */
    class DisplayPaneView extends msfssdk.DisplayComponent {
        constructor() {
            super(...arguments);
            this._title = msfssdk.Subject.create('');
            /** The title of this display pane view. */
            this.title = this._title;
            this.isPfd = DisplayPaneUtils.isPfdDisplayPaneIndex(this.props.index);
        }
        /**
         * Called when this view is made visible.
         * @param size The size of this view's parent pane.
         * @param width The width of this view's parent pane, in pixels.
         * @param height The height of this view's parent pane, in pixels.
         */
        onResume(size, width, height) {
            // noop
        }
        /**
         * Called when this view is hidden.
         */
        onPause() {
            // noop
        }
        /**
         * Called when this view's parent pane is resized while this view is visible.
         * @param size The size of this view's parent pane.
         * @param width The width of this view's parent pane, in pixels.
         * @param height The height of this view's parent pane, in pixels.
         */
        onResize(size, width, height) {
            // noop
        }
        /**
         * Called every update cycle.
         * @param time The current real (operating system) time, as a UNIX timestamp in milliseconds.
         */
        onUpdate(time) {
            // noop
        }
        /**
         * Called when a display pane view event is received by this view.
         * @param event The event.
         */
        onEvent(event) {
            // noop
        }
    }

    /**
     * Creates display pane views.
     */
    class DisplayPaneViewFactory {
        constructor() {
            this.registeredViews = new Map();
        }
        /**
         * Registers a display pane view under a specific key. Once a view is registered, new instances can be created
         * using the key under which it was registered via the `createViewNode()` method. Registering a view under an
         * existing key will replace the old view registered under that key.
         * @param key The key of the display pane view to register.
         * @param vnodeFn A function which creates new instances of the display pane view to register as VNodes.
         */
        registerView(key, vnodeFn) {
            this.registeredViews.set(key, vnodeFn);
        }
        /**
         * Creates a new display pane view instance as a VNode.
         * @param key The key of the display pane view to create.
         * @param index The index of the view's parent pane.
         * @throws Error if no view is registered under the given key.
         * @returns A new display pane view instance as a VNode.
         */
        createViewNode(key, index) {
            const vnodeFn = this.registeredViews.get(key);
            if (vnodeFn !== undefined) {
                return vnodeFn(index);
            }
            else {
                console.error(`Could not find a registered display pane view of type ${key.toString()}!`);
                throw new Error(`Could not find a registered display pane view of type ${key.toString()}!`);
            }
        }
    }

    /* eslint-disable @typescript-eslint/no-non-null-assertion */
    /**
     * Data about a GPS satellite from the provider.
     */
    class GpsSatelliteData {
        /**
         * Creates an instance of GpsSatelliteData.
         * @param sat The satellite to track.
         */
        constructor(sat) {
            this.sat = sat;
            /** @inheritdoc */
            this.isVisible = msfssdk.Subject.create(true);
        }
    }
    /**
     * A data provider that provides GPS status.
     */
    class GpsStatusDataProvider {
        /**
         * Creates an instance of the GpsDataProvider.
         * @param bus The event bus to use with this instance.
         * @param index The GPS system index that this provider will track.
         */
        constructor(bus, index) {
            this.bus = bus;
            this.index = index;
            this._receiverState = msfssdk.Subject.create(undefined);
            /** The current GPS receiver state. */
            this.receiverState = this._receiverState;
            this._systemState = msfssdk.Subject.create(msfssdk.GPSSystemState.Searching);
            /** The current GPS system state. */
            this.systemState = this._systemState;
            this._sbasState = msfssdk.Subject.create(msfssdk.GPSSystemSBASState.Inactive);
            /** The current GPS system SBAS state. */
            this.sbasState = this._sbasState;
            this._activeSatellites = msfssdk.ArraySubject.create();
            /** The current satellites. */
            this.activeSatellites = this._activeSatellites;
            this._numInUseSatellites = msfssdk.Subject.create(0);
            /** The number of active tracking satellites. */
            this.numInUseSatellites = this._numInUseSatellites;
            this._positionsCalculated = new msfssdk.SubEvent();
            /** An event that fires when the satellite positions are calculated. */
            this.positionsCalculated = this._positionsCalculated;
            this._pdop = msfssdk.Subject.create(NaN, msfssdk.SubscribableUtils.NUMERIC_NAN_EQUALITY);
            /** The current GPS receiver PDOP. */
            this.pdop = this._pdop;
            this._hdop = msfssdk.Subject.create(NaN, msfssdk.SubscribableUtils.NUMERIC_NAN_EQUALITY);
            /** The current GPS receiver HDOP. */
            this.hdop = this._hdop;
            this._vdop = msfssdk.Subject.create(NaN, msfssdk.SubscribableUtils.NUMERIC_NAN_EQUALITY);
            /** The current GPS receiver VDOP. */
            this.vdop = this._vdop;
            this._position = msfssdk.GeoPointSubject.create(new msfssdk.GeoPoint(NaN, NaN));
            /** The current GPS position. Both lat and lon will be `NaN` if a GPS fix is not available. */
            this.position = this._position;
            this._time = msfssdk.ConsumerSubject.create(null, 0);
            /** The current time, as a UNIX timestamp in milliseconds. */
            this.time = this._time;
            this._altitude = msfssdk.NumberUnitSubject.create(msfssdk.UnitType.METER.createNumber(NaN));
            /** The current GPS altitude, or `NaN` if a GPS fix is not available. */
            this.altitude = this._altitude;
            this._groundSpeed = msfssdk.NumberUnitSubject.create(msfssdk.UnitType.KNOT.createNumber(NaN));
            /** The current GPS ground speed, or `NaN` if a GPS fix is not available. */
            this.groundSpeed = this._groundSpeed;
            this._groundTrack = msfssdk.BasicNavAngleSubject.create(msfssdk.BasicNavAngleUnit.create(false).createNumber(NaN));
            /** The current GPS ground track, or `NaN` if a GPS fix is not available. */
            this.groundTrack = this._groundTrack;
            this.isAlive = true;
            this.isInit = false;
        }
        /**
         * Initializes this data provider. Once initialized, this data provider will continuously update its data until
         * paused or destroyed.
         * @throws Error if this data provider is dead.
         */
        init() {
            if (!this.isAlive) {
                throw new Error('GpsStatusDataProvider: cannot initialize a dead provider');
            }
            if (this.isInit) {
                return;
            }
            this.isInit = true;
            const sub = this.bus.getSubscriber();
            this.posSub = sub.on('gps-position').handle(lla => {
                this._position.set(lla.lat, lla.long);
                this._altitude.set(lla.alt);
            }, true);
            this.gsSub = sub.on('ground_speed').handle(gs => {
                this._groundSpeed.set(gs);
            }, true);
            this.trackSub = sub.on('track_deg_true').handle(track => {
                this._groundTrack.set(track);
            }, true);
            this.magVarSub = sub.on('magvar').handle(magVar => {
                this._groundTrack.set(this._groundTrack.get().number, magVar);
            }, true);
            this._time.setConsumer(sub.on('simTime'));
            this.receiverStateSub = sub.on(`gps_rec_state_${this.index}`).handle(s => this._receiverState.set(s.current));
            this.systemStateSub = sub.on(`gps_rec_gps_system_state_changed_${this.index}`).handle(s => {
                this._systemState.set(s);
                if (s === msfssdk.GPSSystemState.SolutionAcquired || s === msfssdk.GPSSystemState.DiffSolutionAcquired) {
                    this.posSub.resume(true);
                    this.gsSub.resume(true);
                    this.trackSub.resume(true);
                    this.magVarSub.resume(true);
                }
                else {
                    this.posSub.pause();
                    this.gsSub.pause();
                    this.trackSub.pause();
                    this._position.set(NaN, NaN);
                    this._altitude.set(NaN);
                    this._groundSpeed.set(NaN);
                    this._groundTrack.set(NaN);
                }
            });
            this.sbasStateSub = sub.on(`gps_rec_gps_system_sbas_state_changed_${this.index}`).handle(s => this._sbasState.set(s));
            this.satPosCalculatedSub = sub.on(`gps_rec_gps_sat_pos_calculated_${this.index}`).handle(() => this._positionsCalculated.notify(this));
            this.satStateSub = sub.on(`gps_rec_gps_sat_state_changed_${this.index}`).handle(this.onSatStateChanged.bind(this));
            this.pdopSub = sub.on(`gps_rec_gps_system_pdop_${this.index}`).handle(p => this._pdop.set(p <= 0 ? NaN : p));
            this.hdopSub = sub.on(`gps_rec_gps_system_hdop_${this.index}`).handle(p => this._hdop.set(p <= 0 ? NaN : p));
            this.vdopSub = sub.on(`gps_rec_gps_system_vdop_${this.index}`).handle(p => this._vdop.set(p <= 0 ? NaN : p));
        }
        /**
         * A handler that runs when the state of a satellite changes.
         * @param sat The satellite that changed state.
         */
        onSatStateChanged(sat) {
            const satState = sat.state.get();
            if (satState === msfssdk.GPSSatelliteState.None || satState === msfssdk.GPSSatelliteState.Unreachable) {
                const index = this.activeSatellites.getArray().findIndex(s => s.sat.prn === sat.prn);
                if (index !== -1) {
                    this._activeSatellites.removeAt(index);
                }
            }
            else {
                const index = this.activeSatellites.getArray().findIndex(s => s.sat.prn === sat.prn);
                if (index === -1) {
                    this._activeSatellites.insert(new GpsSatelliteData(sat));
                }
            }
            let inUseSatellites = 0;
            this._activeSatellites
                .getArray()
                .forEach(s => (s.sat.state.get() === msfssdk.GPSSatelliteState.InUse || s.sat.state.get() === msfssdk.GPSSatelliteState.InUseDiffApplied) && inUseSatellites++);
            this._numInUseSatellites.set(inUseSatellites);
        }
        /**
         * Destroys the data provider.
         */
        destroy() {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
            this.isAlive = false;
            this._time.destroy();
            (_a = this.receiverStateSub) === null || _a === void 0 ? void 0 : _a.destroy();
            (_b = this.systemStateSub) === null || _b === void 0 ? void 0 : _b.destroy();
            (_c = this.sbasStateSub) === null || _c === void 0 ? void 0 : _c.destroy();
            (_d = this.satPosCalculatedSub) === null || _d === void 0 ? void 0 : _d.destroy();
            (_e = this.satStateSub) === null || _e === void 0 ? void 0 : _e.destroy();
            (_f = this.pdopSub) === null || _f === void 0 ? void 0 : _f.destroy();
            (_g = this.hdopSub) === null || _g === void 0 ? void 0 : _g.destroy();
            (_h = this.vdopSub) === null || _h === void 0 ? void 0 : _h.destroy();
            (_j = this.posSub) === null || _j === void 0 ? void 0 : _j.destroy();
            (_k = this.gsSub) === null || _k === void 0 ? void 0 : _k.destroy();
            (_l = this.trackSub) === null || _l === void 0 ? void 0 : _l.destroy();
            (_m = this.magVarSub) === null || _m === void 0 ? void 0 : _m.destroy();
        }
    }

    /** A dynamic list that handles adding and removing list items from an HTML element. */
    class DynamicList {
        /**
         * DynamicList constructor.
         * @param data The list data.
         * @param itemsContainer The Element where list items will be added and removed from.
         * @param renderItem A function that will be called when an item is added,
         * that should return a VNode representing that item. If the root node is a DisplayComponent,
         * then its destroy method will be called when the item is removed from the list.
         * @param sortItems A function to sort data items before rendering them. The function should return a negative
         * number if the first item should be rendered before the second, a positive number if the first item should be
         * rendered after the second, or zero if the two items' relative order does not matter. If not defined, items will
         * be rendered in the order in which they appear in the data array.
         */
        constructor(data, itemsContainer, renderItem, sortItems) {
            this.data = data;
            this.itemsContainer = itemsContainer;
            this.renderItem = renderItem;
            this.sortItems = sortItems;
            this.listItemCount = msfssdk.Subject.create(0);
            this._visibleItemCount = msfssdk.Subject.create(0);
            /** The count of visible items in the list.  */
            this.visibleItemCount = this._visibleItemCount;
            // Key everything on index instead of data item since data items are not guaranteed to be unique in the data array
            this.components = [];
            this.visibilitySubscriptions = [];
            this.elements = [];
            this.sortIndexes = this.sortItems === undefined
                ? undefined
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                : (a, b) => this.sortItems(this.data.get(a), this.data.get(b));
            this.sortedIndexes = [];
            this.indexToSortedIndex = [];
            /**
             * A callback fired when the array subject data changes.
             * @param index The index of the change.
             * @param type The type of change.
             * @param data The item that was changed.
             */
            this.onDataChanged = (index, type, data) => {
                switch (type) {
                    case msfssdk.SubscribableArrayEventType.Added:
                        this.onDataAdded(index, data);
                        break;
                    case msfssdk.SubscribableArrayEventType.Removed:
                        data !== undefined && this.onDataRemoved(index, data);
                        break;
                    case msfssdk.SubscribableArrayEventType.Cleared:
                        this.onDataCleared();
                        break;
                }
                this.listItemCount.set(this.data.length);
            };
            /**
             * Adjust the visible item count when a data item's visiblity changes.
             * @param isVisible The data item's new visibility.
             */
            this.dataItemVisibilityChanged = (isVisible) => {
                if (isVisible) {
                    this.incrementVisibleCount();
                }
                else {
                    this.decrementVisibleCount();
                }
            };
            this.renderList();
            this.dataSub = this.data.sub(this.onDataChanged);
        }
        /** Renders the complete list of data items. */
        renderList() {
            this.onDataAdded(0, this.data.getArray());
        }
        /**
         * Gets the sorted index of a data item index.
         * @param index A data item index.
         * @returns The index to which the specified data item index is sorted, or `-1` if the data index is out of bounds.
         */
        sortedIndexOfIndex(index) {
            var _a;
            return (_a = this.indexToSortedIndex[index]) !== null && _a !== void 0 ? _a : -1;
        }
        /**
         * Gets the sorted index of a data item.
         * @param data A data item.
         * @returns The index to which the specified data item is sorted, or `-1` if the item is not in this list.
         */
        sortedIndexOfData(data) {
            return this.sortedIndexOfIndex(this.data.getArray().indexOf(data));
        }
        /**
         * Iterates over each rendered component.
         * @param fn The function to run on each component.
         */
        forEachComponent(fn) {
            this.components.forEach(i => fn(i));
        }
        /**
         * An event called when data is added to the subscription.
         * @param index The index that the data was added at.
         * @param data The data that was added.
         */
        onDataAdded(index, data) {
            if (data !== undefined) {
                let numAdded = 0;
                if (Array.isArray(data)) {
                    for (let i = 0; i < data.length; i++) {
                        const dataItem = data[i];
                        const indexToAdd = index + i;
                        this.addDataItem(dataItem, indexToAdd);
                    }
                    numAdded = data.length;
                }
                else {
                    this.addDataItem(data, index);
                    numAdded = 1;
                }
                if (numAdded > 0) {
                    // Update the indexes in the sorted index array to account for shifting caused by the insertion of the new items.
                    for (let i = 0; i < this.sortedIndexes.length; i++) {
                        if (this.sortedIndexes[i] >= index) {
                            this.sortedIndexes[i] += numAdded;
                        }
                    }
                    // Insert the indexes of the new items at the positions where they were rendered into the DOM.
                    this.sortedIndexes.splice(index, 0, ...msfssdk.ArrayUtils.create(numAdded, i => index + i));
                    this.reconcileSortedIndexArrays();
                    this.updateOrder();
                }
            }
        }
        /**
         * Adds a data item to the list and performs the required rendering and
         * ordering operations.
         * @param dataItem The data item to add to the list.
         * @param indexToAdd The index to add the item at.
         */
        addDataItem(dataItem, indexToAdd) {
            // Create list item and store a reference to the instance if it is a DisplayComponent so we can destroy it later
            const listItemVNode = this.renderItem(dataItem, indexToAdd);
            this.components.splice(indexToAdd, 0, listItemVNode.instance instanceof msfssdk.DisplayComponent ? listItemVNode.instance : undefined);
            // Render the list item into the DOM and store a reference to the root element of the rendered item.
            // By default, we will render the item to the same index at which it appears in the data array. Therefore, if
            // this list does not support sorting, it will be in the correct position. If this list does support sorting, it
            // will be moved if necessary when the list is resorted immediately after the insertion operation.
            const elementAtIndexToInsert = this.itemsContainer.children.item(indexToAdd);
            const element = this.renderToDom(listItemVNode, elementAtIndexToInsert);
            this.elements.splice(indexToAdd, 0, element !== null && element !== void 0 ? element : undefined);
            // Update our visible items count.
            if (dataItem.isVisible === undefined || dataItem.isVisible.get() === true) {
                this.incrementVisibleCount();
            }
            // Subscribe to the item's visibility state if one is provided.
            if (dataItem.isVisible !== undefined) {
                this.visibilitySubscriptions.splice(indexToAdd, 0, dataItem.isVisible.sub(this.dataItemVisibilityChanged));
            }
            else {
                this.visibilitySubscriptions.splice(indexToAdd, 0, undefined);
            }
        }
        /**
         * Adds a list rendered DOM node to the collection.
         * @param node Item to render and add.
         * @param elementAtIndexToInsert The existing element, if any, located at the index to which to render the node.
         * @returns The created DOM element.
         */
        renderToDom(node, elementAtIndexToInsert) {
            if (elementAtIndexToInsert !== null) {
                node && elementAtIndexToInsert && msfssdk.FSComponent.renderBefore(node, elementAtIndexToInsert);
                return elementAtIndexToInsert.previousElementSibling;
            }
            else {
                elementAtIndexToInsert = this.itemsContainer;
                node && elementAtIndexToInsert && msfssdk.FSComponent.render(node, elementAtIndexToInsert);
                return this.itemsContainer.lastElementChild;
            }
        }
        /**
         * An event called when data is removed from the subscription.
         * @param index The index that the data was removed at.
         * @param data The data that was removed;
         */
        onDataRemoved(index, data) {
            let numRemoved = 0;
            if (Array.isArray(data)) {
                for (let i = 0; i < data.length; i++) {
                    const dataItem = data[i];
                    this.removeDataItem(dataItem, index + i);
                }
                numRemoved = data.length;
            }
            else {
                this.removeDataItem(data, index);
                numRemoved = 1;
            }
            if (numRemoved > 0) {
                this.components.splice(index, numRemoved);
                this.visibilitySubscriptions.splice(index, numRemoved);
                this.elements.splice(index, numRemoved);
                // Update the indexes in the sorted index array to account for shifting caused by the removal of items.
                for (let i = 0; i < this.sortedIndexes.length; i++) {
                    const diff = this.sortedIndexes[i] - index;
                    if (diff < 0) {
                        // Index is less than the range of removed indexes -> do nothing.
                        continue;
                    }
                    else if (diff >= numRemoved) {
                        // Index is greater than the range of removed indexes -> decrement the index by the number of removed indexes.
                        this.sortedIndexes[i] -= numRemoved;
                    }
                    else {
                        // Index is within the range of removed indexes -> remove the index from the array.
                        this.sortedIndexes.splice(i--, 1);
                    }
                }
                this.reconcileSortedIndexArrays();
            }
        }
        /**
         * Removes a data item from the list.
         * @param data The data item to remove.
         * @param index The index of the data that was removed.
         */
        removeDataItem(data, index) {
            var _a, _b;
            this.removeDomNode(data, index);
            (_a = this.components[index]) === null || _a === void 0 ? void 0 : _a.destroy();
            if (data.isVisible === undefined || data.isVisible.get() === true) {
                this.decrementVisibleCount();
            }
            (_b = this.visibilitySubscriptions[index]) === null || _b === void 0 ? void 0 : _b.destroy();
        }
        /**
         * Removes a dom node from the collection at the specified index.
         * @param data The data item to remove.
         * @param index The index to remove.
         */
        removeDomNode(data, index) {
            const toRemove = this.elements[index];
            if (toRemove !== undefined) {
                this.itemsContainer.removeChild(toRemove);
            }
            else {
                console.warn('DynamicList: could not find DOM node to remove');
            }
        }
        /** An event called when the data is cleared in the subscription. */
        onDataCleared() {
            this.itemsContainer.innerHTML = '';
            this.sortedIndexes.length = 0;
            this.indexToSortedIndex.length = 0;
            this.components.forEach(component => { component === null || component === void 0 ? void 0 : component.destroy(); });
            this.components.length = 0;
            this.visibilitySubscriptions.forEach(x => x === null || x === void 0 ? void 0 : x.destroy());
            this.visibilitySubscriptions.length = 0;
            this._visibleItemCount.set(0);
            this.elements.length = 0;
        }
        /** Increments the visible count by 1. */
        incrementVisibleCount() {
            this._visibleItemCount.set(this._visibleItemCount.get() + 1);
        }
        /** Decrements the visible count by 1. */
        decrementVisibleCount() {
            this._visibleItemCount.set(this._visibleItemCount.get() - 1);
        }
        /**
         * Updates the array which maps data indexes to sorted indexes to match the sorting order provided by the
         * sorted index array.
         */
        reconcileSortedIndexArrays() {
            for (let i = 0; i < this.sortedIndexes.length; i++) {
                this.indexToSortedIndex[this.sortedIndexes[i]] = i;
            }
        }
        /**
         * Updates the order of the rendered items in this list.
         */
        updateOrder() {
            if (this.sortIndexes === undefined) {
                return;
            }
            const oldOrder = Array.from(this.sortedIndexes);
            this.sortedIndexes.sort(this.sortIndexes);
            if (msfssdk.ArrayUtils.equals(this.sortedIndexes, oldOrder)) {
                return;
            }
            this.reconcileSortedIndexArrays();
            for (let i = 0; i < this.sortedIndexes.length; i++) {
                const element = this.elements[this.sortedIndexes[i]];
                if (element !== undefined) {
                    this.itemsContainer.appendChild(element);
                }
            }
        }
        /**
         * Destroys this list.
         */
        destroy() {
            this.dataSub.destroy();
            this.onDataCleared();
        }
    }

    /**
     * The G3000/5000 GPS Status display pane.
     */
    class GpsStatusPane extends DisplayPaneView {
        constructor() {
            super(...arguments);
            this.unitsSettings = garminsdk.UnitsUserSettings.getManager(this.props.bus);
            this.timeSettings = garminsdk.DateTimeUserSettings.getManager(this.props.bus);
            this.timeFormat = this.timeSettings.getSetting('dateTimeFormat').map(GpsStatusPane.TIME_FORMAT_MAP);
            this.satellites = msfssdk.FSComponent.createRef();
            this.canvasEl = msfssdk.FSComponent.createRef();
            this.label = new GPSSatelliteTextLabel();
            this.nullProjection = new msfssdk.MapProjection(8, 8);
            this.realGpsPos = msfssdk.ConsumerValue.create(null, new LatLongAlt(0, 0, 0)).pause();
            this.gpsPosition = msfssdk.GeoPointSubject.create(new msfssdk.GeoPoint(NaN, NaN));
            this.gpsAlt = msfssdk.NumberUnitSubject.create(msfssdk.UnitType.METER.createNumber(NaN));
            this.time = msfssdk.Subject.create(0);
            this.groundSpeed = msfssdk.NumberUnitSubject.create(msfssdk.UnitType.KNOT.createNumber(NaN));
            this.track = msfssdk.BasicNavAngleSubject.create(msfssdk.BasicNavAngleUnit.create(false).createNumber(NaN));
            this.epu = msfssdk.NumberUnitSubject.create(msfssdk.UnitType.NMILE.createNumber(NaN));
            this.hdop = msfssdk.Subject.create('_._');
            this.hfom = msfssdk.NumberUnitSubject.create(msfssdk.UnitType.FOOT.createNumber(NaN));
            this.vfom = msfssdk.NumberUnitSubject.create(msfssdk.UnitType.FOOT.createNumber(NaN));
            this.hfomDisplayUnit = msfssdk.MappedSubject.create(GpsStatusPane.FOM_DISPLAY_UNIT_MAP, this.hfom, this.unitsSettings.getSetting('unitsDistance')).pause();
            this.vfomDisplayUnit = msfssdk.MappedSubject.create(GpsStatusPane.FOM_DISPLAY_UNIT_MAP, this.vfom, this.unitsSettings.getSetting('unitsDistance')).pause();
            this.hfomLargeUnitFormatter = msfssdk.NumberFormatter.create({ precision: 0.1, nanString: '____', cache: true });
            this.hfomSmallUnitFormatter = msfssdk.NumberFormatter.create({ precision: 1, nanString: '____', cache: true });
            this.vfomLargeUnitFormatter = msfssdk.NumberFormatter.create({ precision: 0.1, nanString: '____', cache: true });
            this.vfomSmallUnitFormatter = msfssdk.NumberFormatter.create({ precision: 1, nanString: '____', cache: true });
            this.dataSubs = [];
            this.systemState = this.props.dataProvider.systemState.map(s => {
                switch (s) {
                    case msfssdk.GPSSystemState.Acquiring:
                        return 'ACQUIRING';
                    case msfssdk.GPSSystemState.SolutionAcquired:
                        return '3D NAV';
                    case msfssdk.GPSSystemState.DiffSolutionAcquired:
                        return '3D DIFF NAV';
                    default:
                        return 'SEARCHING';
                }
            }).pause();
            this.sbasState = this.props.dataProvider.sbasState.map(s => {
                switch (s) {
                    case msfssdk.GPSSystemSBASState.Active:
                        return 'ACTIVE';
                    case msfssdk.GPSSystemSBASState.Disabled:
                        return 'DISABLED';
                    case msfssdk.GPSSystemSBASState.Inactive:
                        return 'INACTIVE';
                    default:
                        return 'INACTIVE';
                }
            }).pause();
        }
        /** @inheritdoc */
        onAfterRender(node) {
            super.onAfterRender(node);
            this._title.set(`GPS${this.props.dataProvider.index} Status`);
            this.realGpsPos.setConsumer(this.props.bus.getSubscriber().on('gps-position'));
            this.satList = new DynamicList(this.props.dataProvider.activeSatellites, this.satellites.instance, d => msfssdk.FSComponent.buildComponent(SatelliteBar, { data: d.sat }), (a, b) => a.sat.prn - b.sat.prn);
            const hdopFormatter = msfssdk.NumberFormatter.create({ precision: 0.1, nanString: '_._', cache: true });
            this.dataSubs.push(this.props.dataProvider.position.pipe(this.gpsPosition, true), this.props.dataProvider.altitude.pipe(this.gpsAlt, true), this.props.dataProvider.time.pipe(this.time, msfssdk.SubscribableMapFunctions.withPrecision(1000), true), this.props.dataProvider.groundSpeed.pipe(this.groundSpeed, true), this.props.dataProvider.groundTrack.pipe(this.track, true), this.props.dataProvider.pdop.pipe(this.epu, p => p * 0.4, true), this.props.dataProvider.hdop.sub(h => {
                this.hdop.set(hdopFormatter(h));
                this.hfom.set(h * 35);
            }, true), this.props.dataProvider.vdop.pipe(this.vfom, v => v * 35, true), this.props.dataProvider.activeSatellites.sub(this.satList.updateOrder.bind(this.satList)));
        }
        /** @inheritdoc */
        onPause() {
            var _a;
            super.onPause();
            this.realGpsPos.pause();
            (_a = this.satList) === null || _a === void 0 ? void 0 : _a.forEachComponent(s => s === null || s === void 0 ? void 0 : s.onPause());
            this.systemState.pause();
            this.sbasState.pause();
            this.hfomDisplayUnit.pause();
            this.vfomDisplayUnit.pause();
            this.dataSubs.forEach(sub => { sub.pause(); });
        }
        /** @inheritdoc */
        onResume(size, width, height) {
            var _a;
            super.onResume(size, width, height);
            this.realGpsPos.resume();
            (_a = this.satList) === null || _a === void 0 ? void 0 : _a.forEachComponent(s => s === null || s === void 0 ? void 0 : s.onResume());
            this.systemState.resume();
            this.sbasState.resume();
            this.hfomDisplayUnit.resume();
            this.vfomDisplayUnit.resume();
            this.dataSubs.forEach(sub => { sub.resume(true); });
        }
        /** @inheritdoc */
        onUpdate() {
            this.drawSatellites();
        }
        /**
         * Draws the satellite sky display.
         */
        drawSatellites() {
            const context = this.canvasEl.instance.getContext('2d');
            this.label.displaySize.set(this.canvasEl.instance.width, this.canvasEl.instance.height);
            if (context !== null) {
                context.clearRect(0, 0, this.canvasEl.instance.width, this.canvasEl.instance.height);
                const cx = this.canvasEl.instance.width / 2;
                const cy = this.canvasEl.instance.height / 2;
                const radius = cy - 3;
                context.strokeStyle = 'white';
                context.lineWidth = 1;
                context.beginPath();
                context.ellipse(cx, cy, radius, radius, 0, 0, 2 * Math.PI);
                context.ellipse(cx, cy, radius / 2, radius / 2, 0, 0, 2 * Math.PI);
                context.ellipse(cx, cy, radius / 10, radius / 10, 0, 0, 2 * Math.PI);
                context.stroke();
                const maxZenithAngle = (Math.PI / 2) + this.calcHorizonAngle();
                this.label.maxZenithAngle.set(maxZenithAngle);
                let numVisible = 0;
                for (const data of this.props.dataProvider.activeSatellites.getArray()) {
                    const sat = data.sat;
                    const satState = sat.state.get();
                    const pos = sat.position.get();
                    if (satState !== msfssdk.GPSSatelliteState.None && satState !== msfssdk.GPSSatelliteState.Unreachable && numVisible < 15) {
                        numVisible++;
                        this.label.text.set(sat.prn.toFixed(0).padStart(3, '0'));
                        this.label.state.set(sat.state.get());
                        this.label.location.set(pos);
                        this.label.draw(context, this.nullProjection);
                    }
                }
            }
        }
        /**
         * Calculates the horizon zenith angle.
         * @returns The calculated horizon zenith angle based on the current altitude.
         */
        calcHorizonAngle() {
            return Math.acos(6378100 / (6378100 + Math.max(this.realGpsPos.get().alt, 0)));
        }
        /** @inheritdoc */
        render() {
            return (msfssdk.FSComponent.buildComponent("div", { class: 'gps-status-pane' },
                msfssdk.FSComponent.buildComponent("div", { class: 'gps-status-leftcol' },
                    msfssdk.FSComponent.buildComponent("div", { class: 'gps-status-sigstrength gps-status-box' },
                        msfssdk.FSComponent.buildComponent("h2", null, "GPS SIGNAL STRENGTH"),
                        msfssdk.FSComponent.buildComponent("div", { class: 'gps-status-sigstrength-bg' },
                            msfssdk.FSComponent.buildComponent("div", null),
                            msfssdk.FSComponent.buildComponent("div", null),
                            msfssdk.FSComponent.buildComponent("div", null),
                            msfssdk.FSComponent.buildComponent("div", null)),
                        msfssdk.FSComponent.buildComponent("div", { class: 'gps-status-satellites', ref: this.satellites }))),
                msfssdk.FSComponent.buildComponent("div", { class: 'gps-status-rightcol' },
                    msfssdk.FSComponent.buildComponent("div", { class: 'gps-status-constellation gps-status-box' },
                        msfssdk.FSComponent.buildComponent("h2", null, "CONSTELLATION"),
                        msfssdk.FSComponent.buildComponent("canvas", { class: 'gps-status-map', ref: this.canvasEl, width: '213px', height: '193px' })),
                    msfssdk.FSComponent.buildComponent("div", { class: 'gps-status-satstatus gps-status-box' },
                        msfssdk.FSComponent.buildComponent("h2", null, "SATELLITE STATUS"),
                        msfssdk.FSComponent.buildComponent("table", null,
                            msfssdk.FSComponent.buildComponent("tr", null,
                                msfssdk.FSComponent.buildComponent("td", null, "EPU"),
                                msfssdk.FSComponent.buildComponent("td", null,
                                    msfssdk.FSComponent.buildComponent(garminsdk.NumberUnitDisplay, { value: this.epu, displayUnit: this.unitsSettings.distanceUnitsLarge, formatter: msfssdk.NumberFormatter.create({ precision: 0.1, nanString: '_._' }) }))),
                            msfssdk.FSComponent.buildComponent("tr", null,
                                msfssdk.FSComponent.buildComponent("td", null, "HDOP"),
                                msfssdk.FSComponent.buildComponent("td", null, this.hdop)),
                            msfssdk.FSComponent.buildComponent("tr", null,
                                msfssdk.FSComponent.buildComponent("td", null, "HFOM"),
                                msfssdk.FSComponent.buildComponent("td", null,
                                    msfssdk.FSComponent.buildComponent(garminsdk.NumberUnitDisplay, {
                                        value: this.hfom, displayUnit: this.hfomDisplayUnit, formatter: value => {
                                            const displayUnit = this.hfomDisplayUnit.get();
                                            if (displayUnit === msfssdk.UnitType.FOOT || displayUnit === msfssdk.UnitType.METER) {
                                                return this.hfomSmallUnitFormatter(value);
                                            }
                                            else {
                                                return this.hfomLargeUnitFormatter(value);
                                            }
                                        }
                                    }))),
                            msfssdk.FSComponent.buildComponent("tr", null,
                                msfssdk.FSComponent.buildComponent("td", null, "VFOM"),
                                msfssdk.FSComponent.buildComponent("td", null,
                                    msfssdk.FSComponent.buildComponent(garminsdk.NumberUnitDisplay, {
                                        value: this.vfom, displayUnit: this.vfomDisplayUnit, formatter: value => {
                                            const displayUnit = this.vfomDisplayUnit.get();
                                            if (displayUnit === msfssdk.UnitType.FOOT || displayUnit === msfssdk.UnitType.METER) {
                                                return this.vfomSmallUnitFormatter(value);
                                            }
                                            else {
                                                return this.vfomLargeUnitFormatter(value);
                                            }
                                        }
                                    })))),
                        msfssdk.FSComponent.buildComponent("table", null,
                            msfssdk.FSComponent.buildComponent("tr", null,
                                msfssdk.FSComponent.buildComponent("td", null, "Position"),
                                msfssdk.FSComponent.buildComponent("td", null,
                                    msfssdk.FSComponent.buildComponent(garminsdk.LatLonDisplay, { class: 'gps-status-cyanvalue', value: this.gpsPosition, format: garminsdk.LatLonDisplayFormat.HDDD_MMmm }))),
                            msfssdk.FSComponent.buildComponent("tr", null,
                                msfssdk.FSComponent.buildComponent("td", null, "Time"),
                                msfssdk.FSComponent.buildComponent("td", null,
                                    msfssdk.FSComponent.buildComponent(garminsdk.TimeDisplay, { class: 'gps-status-cyanvalue', time: this.time, format: this.timeFormat, localOffset: this.timeSettings.getSetting('dateTimeLocalOffset') }))),
                            msfssdk.FSComponent.buildComponent("tr", null,
                                msfssdk.FSComponent.buildComponent("td", null, "GPS ALT"),
                                msfssdk.FSComponent.buildComponent("td", null,
                                    msfssdk.FSComponent.buildComponent(garminsdk.NumberUnitDisplay, { class: 'gps-status-alt', value: this.gpsAlt, displayUnit: this.unitsSettings.altitudeUnits, formatter: msfssdk.NumberFormatter.create({ precision: 1, nanString: '_____', cache: true }) }),
                                    " GSL")),
                            msfssdk.FSComponent.buildComponent("tr", null,
                                msfssdk.FSComponent.buildComponent("td", null, "GS"),
                                msfssdk.FSComponent.buildComponent("td", null,
                                    msfssdk.FSComponent.buildComponent(garminsdk.NumberUnitDisplay, { class: 'gps-status-cyanvalue', value: this.groundSpeed, displayUnit: this.unitsSettings.speedUnits, formatter: msfssdk.NumberFormatter.create({ precision: 0.1, nanString: '___._', cache: true }) }))),
                            msfssdk.FSComponent.buildComponent("tr", null,
                                msfssdk.FSComponent.buildComponent("td", null, "Track"),
                                msfssdk.FSComponent.buildComponent("td", null,
                                    msfssdk.FSComponent.buildComponent(garminsdk.BearingDisplay, { class: 'gps-status-cyanvalue', value: this.track, displayUnit: this.unitsSettings.navAngleUnits, formatter: msfssdk.NumberFormatter.create({ precision: 1, pad: 3, nanString: '___', cache: true }) }))))),
                    msfssdk.FSComponent.buildComponent("div", { class: 'gps-status-gpsstatus gps-status-box' },
                        msfssdk.FSComponent.buildComponent("h2", null, "GPS STATUS"),
                        msfssdk.FSComponent.buildComponent("table", null,
                            msfssdk.FSComponent.buildComponent("tr", null,
                                msfssdk.FSComponent.buildComponent("td", null, "PILOT"),
                                msfssdk.FSComponent.buildComponent("td", null, "GPS1")),
                            msfssdk.FSComponent.buildComponent("tr", null,
                                msfssdk.FSComponent.buildComponent("td", null, "COPILOT"),
                                msfssdk.FSComponent.buildComponent("td", null, "GPS1")),
                            msfssdk.FSComponent.buildComponent("tr", null,
                                msfssdk.FSComponent.buildComponent("td", null, "GPS SOLN"),
                                msfssdk.FSComponent.buildComponent("td", null, this.systemState)),
                            msfssdk.FSComponent.buildComponent("tr", null,
                                msfssdk.FSComponent.buildComponent("td", null, "SBAS"),
                                msfssdk.FSComponent.buildComponent("td", null, this.sbasState)))))));
        }
        /** @inheritdoc */
        destroy() {
            var _a;
            this.realGpsPos.destroy();
            (_a = this.satList) === null || _a === void 0 ? void 0 : _a.destroy();
            this.systemState.destroy();
            this.sbasState.destroy();
            this.timeFormat.destroy();
            this.hfomDisplayUnit.destroy();
            this.vfomDisplayUnit.destroy();
            this.dataSubs.forEach(sub => { sub.destroy(); });
        }
    }
    GpsStatusPane.TIME_FORMAT_MAP = (setting) => {
        switch (setting) {
            case garminsdk.DateTimeFormatSettingMode.Local12:
                return garminsdk.TimeDisplayFormat.Local12;
            case garminsdk.DateTimeFormatSettingMode.Local24:
                return garminsdk.TimeDisplayFormat.Local24;
            default:
                return garminsdk.TimeDisplayFormat.UTC;
        }
    };
    GpsStatusPane.FOM_DISPLAY_UNIT_MAP = ([fom, setting]) => {
        let largeUnit;
        let smallUnit;
        let smallUnitThreshold;
        if (setting === garminsdk.UnitsDistanceSettingMode.Metric) {
            largeUnit = msfssdk.UnitType.KILOMETER;
            smallUnit = msfssdk.UnitType.METER;
            smallUnitThreshold = 999;
        }
        else {
            largeUnit = msfssdk.UnitType.NMILE;
            smallUnit = msfssdk.UnitType.FOOT;
            smallUnitThreshold = 2500;
        }
        if (!fom.isNaN() && fom.asUnit(smallUnit) <= smallUnitThreshold) {
            return smallUnit;
        }
        else {
            return largeUnit;
        }
    };
    /**
     * A component that displays a signal bar for a satellite.
     */
    class SatelliteBar extends msfssdk.DisplayComponent {
        constructor() {
            super(...arguments);
            this.barEl = msfssdk.FSComponent.createRef();
            this.diffEl = msfssdk.FSComponent.createRef();
            this.diffInverseEl = msfssdk.FSComponent.createRef();
            this.signalStrength = this.props.data.signalStrength.map(s => Math.round(s * 100) / 100);
        }
        /** @inheritdoc */
        onAfterRender(thisNode) {
            super.onAfterRender(thisNode);
            this.stateSub = this.props.data.state.sub(v => {
                if (v === msfssdk.GPSSatelliteState.InUse) {
                    this.barEl.instance.classList.add('in-use');
                    this.barEl.instance.classList.remove('acquired');
                    this.barEl.instance.classList.remove('data-collected');
                    this.diffEl.instance.classList.add('hidden');
                    this.diffInverseEl.instance.classList.add('hidden');
                }
                else if (v === msfssdk.GPSSatelliteState.DataCollected) {
                    this.barEl.instance.classList.remove('in-use');
                    this.barEl.instance.classList.remove('acquired');
                    this.barEl.instance.classList.add('data-collected');
                    this.diffEl.instance.classList.add('hidden');
                    this.diffInverseEl.instance.classList.add('hidden');
                }
                else if (v === msfssdk.GPSSatelliteState.Acquired) {
                    this.barEl.instance.classList.remove('in-use');
                    this.barEl.instance.classList.add('acquired');
                    this.barEl.instance.classList.remove('data-collected');
                    this.diffEl.instance.classList.add('hidden');
                    this.diffInverseEl.instance.classList.add('hidden');
                }
                else if (v === msfssdk.GPSSatelliteState.InUseDiffApplied) {
                    this.barEl.instance.classList.add('in-use');
                    this.barEl.instance.classList.remove('acquired');
                    this.barEl.instance.classList.remove('data-collected');
                    this.diffEl.instance.classList.remove('hidden');
                    this.diffInverseEl.instance.classList.remove('hidden');
                }
                else {
                    this.barEl.instance.classList.remove('in-use');
                    this.barEl.instance.classList.remove('acquired');
                    this.barEl.instance.classList.remove('data-collected');
                    this.diffEl.instance.classList.add('hidden');
                    this.diffInverseEl.instance.classList.add('hidden');
                }
            }, true);
            this.signalSub = this.signalStrength.sub(s => this.barEl.instance.style.width = `${s * 180}px`, true);
        }
        /**
         * A callback called to pause the item when the page is paused.
         */
        onPause() {
            var _a, _b;
            (_a = this.stateSub) === null || _a === void 0 ? void 0 : _a.pause();
            (_b = this.signalSub) === null || _b === void 0 ? void 0 : _b.pause();
        }
        /**
         * A callback called to resume the item when the page is resumed.
         */
        onResume() {
            var _a, _b;
            (_a = this.stateSub) === null || _a === void 0 ? void 0 : _a.resume();
            (_b = this.signalSub) === null || _b === void 0 ? void 0 : _b.resume();
        }
        /** @inheritdoc */
        destroy() {
            var _a, _b;
            (_a = this.stateSub) === null || _a === void 0 ? void 0 : _a.destroy();
            (_b = this.signalSub) === null || _b === void 0 ? void 0 : _b.destroy();
            this.signalStrength.destroy();
        }
        /** @inheritdoc */
        render() {
            return (msfssdk.FSComponent.buildComponent("div", { class: 'gps-status-bargraph-item' },
                msfssdk.FSComponent.buildComponent("div", { class: 'gps-status-bargraph-prn' }, this.props.data.prn.toFixed(0).padStart(3, '0')),
                msfssdk.FSComponent.buildComponent("div", { class: 'gps-status-bargraph-bar inverse' },
                    msfssdk.FSComponent.buildComponent("span", { ref: this.diffInverseEl }, "D")),
                msfssdk.FSComponent.buildComponent("div", { class: 'gps-status-bargraph-bar', style: 'width: 0px;', ref: this.barEl },
                    msfssdk.FSComponent.buildComponent("span", { ref: this.diffEl }, "D"))));
        }
    }
    /**
     * A text label for a GPS satellite.
     */
    class GPSSatelliteTextLabel extends msfssdk.AbstractMapTextLabel {
        /**
         * Constructor.
         */
        constructor() {
            const text = msfssdk.Subject.create('');
            const state = msfssdk.Subject.create(msfssdk.GPSSatelliteState.Unreachable);
            const fontColor = msfssdk.ComputedSubject.create(msfssdk.GPSSatelliteState.None, s => {
                switch (s) {
                    case msfssdk.GPSSatelliteState.Acquired:
                        return '#0ff';
                    default:
                        return 'black';
                }
            });
            const bgColor = msfssdk.ComputedSubject.create(msfssdk.GPSSatelliteState.None, s => {
                switch (s) {
                    case msfssdk.GPSSatelliteState.DataCollected:
                        return 'cyan';
                    case msfssdk.GPSSatelliteState.InUseDiffApplied:
                    case msfssdk.GPSSatelliteState.InUse:
                        return '#0f0';
                    default:
                        return 'black';
                }
            });
            const bgStroke = msfssdk.ComputedSubject.create(msfssdk.GPSSatelliteState.None, s => {
                return s === msfssdk.GPSSatelliteState.Acquired ? 'cyan' : '';
            });
            state.sub(s => {
                fontColor.set(s);
                bgColor.set(s);
                bgStroke.set(s);
            });
            super(text, 0, {
                font: 'DejaVuSans-SemiBold',
                fontSize: 12,
                fontColor: fontColor,
                bgColor: bgColor,
                bgOutlineWidth: 1,
                bgOutlineColor: bgStroke,
                bgBorderRadius: 2,
                bgPadding: new Float64Array([1, 1, 0, 1]),
                anchor: new Float64Array([0.5, 0.5]),
                showBg: true
            });
            this.text = text;
            this.state = state;
            this.location = msfssdk.Vec2Subject.create(new Float64Array(2));
            this.displaySize = msfssdk.Vec2Subject.create(new Float64Array(2));
            this.maxZenithAngle = msfssdk.Subject.create(90);
        }
        /** @inheritdoc */
        getPosition(mapProjection, out) {
            const pos = this.location.get();
            const cx = this.displaySize.get()[0] / 2;
            const cy = this.displaySize.get()[1] / 2;
            const radius = (pos[0] / this.maxZenithAngle.get()) * Math.min(cx, cy) - 3;
            const theta = pos[1] - (Math.PI / 2);
            const x = (radius * Math.cos(theta)) + (cx);
            const y = (radius * Math.sin(theta)) + (cy);
            msfssdk.Vec2Math.set(x, y, out);
            return out;
        }
        /** @inheritdoc */
        drawBackground(context, centerX, centerY, width, height) {
            const bgWidth = width * 1.425;
            const bgHeight = height * 1.5;
            context.beginPath();
            context.moveTo(centerX - (bgWidth / 2) - 6, centerY);
            context.lineTo(centerX + (bgWidth / 2) + 6, centerY);
            context.lineWidth = 1.5;
            context.strokeStyle = this.bgOutlineColor.get() !== '' ? this.bgOutlineColor.get() : this.bgColor.get();
            context.stroke();
            context.beginPath();
            context.ellipse(centerX, centerY, bgWidth / 2, bgHeight / 2, 0, 0, 2 * Math.PI);
            if (this.bgOutlineColor.get() !== '') {
                context.lineWidth = 1.5;
                context.strokeStyle = this.bgOutlineColor.get();
                context.stroke();
            }
            context.fillStyle = this.bgColor.get();
            context.fill();
        }
    }

    /** The LegNameDisplay component. */
    class LegNameDisplay extends msfssdk.DisplayComponent {
        constructor() {
            super(...arguments);
            this.ref = msfssdk.FSComponent.createRef();
            this.legProp = msfssdk.SubscribableUtils.toSubscribable(this.props.leg, true);
            this.legNameProp = msfssdk.SubscribableUtils.toSubscribable(this.props.legName, true);
            this.legTypeProp = msfssdk.SubscribableUtils.toSubscribable(this.props.legType, true);
            this.fixIcaoProp = msfssdk.SubscribableUtils.toSubscribable(this.props.fixIcao, true);
            this.legNameDisplayDataProp = msfssdk.SubscribableUtils.toSubscribable(this.props.legNameDisplayData, true);
            this.legName = this.props.legName
                ? this.legNameProp.map(x => x)
                : this.legProp.map(x => x === null || x === void 0 ? void 0 : x.name);
            this.legType = this.props.legType
                ? this.legTypeProp.map(x => x)
                : this.legProp.map(x => x === null || x === void 0 ? void 0 : x.leg.type);
            this.fixIcao = this.props.fixIcao
                ? this.fixIcaoProp.map(x => x)
                : this.legProp.map(x => x === null || x === void 0 ? void 0 : x.leg.fixIcao);
            this.legData = this.props.legNameDisplayData
                ? this.legNameDisplayDataProp.map(x => x)
                : msfssdk.MappedSubject.create(([legName, legType, fixIcao]) => {
                    if (legName === undefined || legType === undefined || fixIcao === undefined) {
                        return undefined;
                    }
                    return { name: legName, type: legType, fixIcao };
                }, this.legName, this.legType, this.fixIcao);
        }
        /** @inheritdoc */
        onAfterRender() {
            this.legData.sub(legData => {
                this.ref.instance.innerHTML = '';
                msfssdk.FSComponent.render(this.renderLegName(legData), this.ref.instance);
            }, true);
        }
        /**
         * Renders the leg name as a VNode.
         * @param leg The leg definition.
         * @returns the leg rendered as vnode.
         */
        renderLegName(leg) {
            var _a;
            if (leg) {
                const legName = leg.name && msfssdk.StringUtils.useZeroSlash(leg.name);
                const isProcTurn = leg.type === msfssdk.LegType.PI;
                const isHoldLeg = msfssdk.FlightPlanUtils.isHoldLeg(leg.type);
                if (msfssdk.FlightPlanUtils.isAltitudeLeg(leg.type)) {
                    return msfssdk.FSComponent.buildComponent("span", null, legName === null || legName === void 0 ? void 0 :
                        legName.replace(/FT/, ''),
                        msfssdk.FSComponent.buildComponent("span", { style: "font-size: 0.75em;" }, "FT"));
                }
                else if (isHoldLeg) {
                    return msfssdk.FSComponent.buildComponent("span", null, msfssdk.ICAO.getIdent(leg.fixIcao));
                }
                else if (isProcTurn) {
                    return msfssdk.FSComponent.buildComponent("span", { style: `font-size: ${this.props.gtcOrientation === 'vertical' ? '0.95' : '0.85'}em;` }, legName);
                }
                else {
                    return msfssdk.FSComponent.buildComponent("span", null, legName);
                }
            }
            else {
                return msfssdk.FSComponent.buildComponent("span", null, (_a = this.props.nullText) !== null && _a !== void 0 ? _a : '_____');
            }
        }
        /** @inheritdoc */
        render() {
            return (msfssdk.FSComponent.buildComponent("span", { ref: this.ref, class: "leg-name-display" }));
        }
        /** @inheritdoc */
        destroy() {
            this.legName.destroy();
            this.legType.destroy();
            this.fixIcao.destroy();
            this.legData.destroy();
        }
    }

    /**
     * Controls the map's GPS and heading signal validity states.
     */
    class MapDataIntegrityController extends msfssdk.MapSystemController {
        /**
         * Constructor.
         * @param context This controller's map context.
         * @param iauIndex The index of the IAU (integrated avionics unit) used by the map to obtain heading and GPS data.
         * @param iauSettingManager A manager for all IAU user settings.
         */
        constructor(context, iauIndex, iauSettingManager) {
            super(context);
            this.iauSettingManager = iauSettingManager;
            this.dataIntegrityModule = this.context.model.getModule(msfssdk.MapSystemKeys.DataIntegrity);
            this.ahrsHeadingDataValid = msfssdk.ConsumerSubject.create(null, false);
            this.ahrsAttitudeDataValid = msfssdk.ConsumerSubject.create(null, false);
            this.adcSystemState = msfssdk.ConsumerSubject.create(null, null);
            this.fmsPosMode = msfssdk.ConsumerSubject.create(null, garminsdk.FmsPositionMode.None);
            this.iauIndex = msfssdk.SubscribableUtils.toSubscribable(iauIndex, true);
        }
        /** @inheritdoc */
        onAfterMapRender() {
            const sub = this.context.bus.getSubscriber();
            this.iauIndex.sub(iauIndex => {
                var _a, _b;
                (_a = this.ahrsIndexSub) === null || _a === void 0 ? void 0 : _a.destroy();
                this.ahrsIndexSub = this.iauSettingManager.getAliasedManager(iauIndex).getSetting('iauAhrsIndex').sub(ahrsIndex => {
                    this.ahrsHeadingDataValid.setConsumer(sub.on(`ahrs_heading_data_valid_${ahrsIndex}`));
                    this.ahrsAttitudeDataValid.setConsumer(sub.on(`ahrs_attitude_data_valid_${ahrsIndex}`));
                }, true);
                (_b = this.adcIndexSub) === null || _b === void 0 ? void 0 : _b.destroy();
                this.adcIndexSub = this.iauSettingManager.getAliasedManager(iauIndex).getSetting('iauAdcIndex').sub(adcIndex => {
                    this.adcSystemState.setConsumer(sub.on(`adc_state_${adcIndex}`));
                }, true);
                this.fmsPosMode.setConsumer(sub.on(`fms_pos_mode_${iauIndex}`));
            }, true);
            this.ahrsHeadingDataValid.pipe(this.dataIntegrityModule.headingSignalValid);
            this.ahrsAttitudeDataValid.pipe(this.dataIntegrityModule.attitudeSignalValid);
            this.adcSystemState.pipe(this.dataIntegrityModule.adcSignalValid, state => state !== null && state.current === msfssdk.AvionicsSystemState.On);
            this.fmsPosMode.pipe(this.dataIntegrityModule.gpsSignalValid, mode => mode !== garminsdk.FmsPositionMode.None);
            this.fmsPosMode.pipe(this.dataIntegrityModule.isDeadReckoning, mode => mode === garminsdk.FmsPositionMode.DeadReckoning || mode === garminsdk.FmsPositionMode.DeadReckoningExpired);
        }
        /** @inheritdoc */
        onMapDestroyed() {
            this.destroy();
        }
        /** @inheritdoc */
        destroy() {
            var _a, _b, _c;
            (_a = this.iauIndexSub) === null || _a === void 0 ? void 0 : _a.destroy();
            (_b = this.ahrsIndexSub) === null || _b === void 0 ? void 0 : _b.destroy();
            (_c = this.adcIndexSub) === null || _c === void 0 ? void 0 : _c.destroy();
            this.ahrsHeadingDataValid.destroy();
            this.ahrsAttitudeDataValid.destroy();
            this.adcSystemState.destroy();
            this.fmsPosMode.destroy();
            super.destroy();
        }
    }

    /**
     * A utility class for retrieving G3000 map runway designation image caches.
     */
    class G3000MapRunwayDesignationImageCache {
        /**
         * Gets a map runway designation image cache.
         * @returns A map runway designation image cache.
         */
        static getCache() {
            var _a;
            return (_a = G3000MapRunwayDesignationImageCache.INSTANCE) !== null && _a !== void 0 ? _a : (G3000MapRunwayDesignationImageCache.INSTANCE = this.createCache());
        }
        /**
         * Creates a runway designation image cache.
         * @returns A new runway designation image cache.
         */
        static createCache() {
            const cache = new garminsdk.DefaultMapRunwayDesignationImageCache();
            for (let i = 1; i <= 36; i++) {
                cache.registerNumber(i, `coui://html_ui/Pages/VCockpit/Instruments/NavSystems/TTX/WTG3000/Assets/Images/Map/runway/runway_${i.toString().padStart(2, '0')}.png`);
            }
            cache.registerDesignator(RunwayDesignator.RUNWAY_DESIGNATOR_LEFT, 'coui://html_ui/Pages/VCockpit/Instruments/NavSystems/TTX/WTG3000/Assets/Images/Map/runway/runway_L.png');
            cache.registerDesignator(RunwayDesignator.RUNWAY_DESIGNATOR_CENTER, 'coui://html_ui/Pages/VCockpit/Instruments/NavSystems/TTX/WTG3000/Assets/Images/Map/runway/runway_C.png');
            cache.registerDesignator(RunwayDesignator.RUNWAY_DESIGNATOR_RIGHT, 'coui://html_ui/Pages/VCockpit/Instruments/NavSystems/TTX/WTG3000/Assets/Images/Map/runway/runway_R.png');
            cache.registerDesignator(RunwayDesignator.RUNWAY_DESIGNATOR_WATER, 'coui://html_ui/Pages/VCockpit/Instruments/NavSystems/TTX/WTG3000/Assets/Images/Map/runway/runway_W.png');
            return cache;
        }
    }

    /**
     * Utility class defining virtual file system paths for the G3000.
     */
    class G3000FilePaths {
    }
    /** The virtual file system path to the assets directory. */
    G3000FilePaths.ASSETS_PATH = 'coui://html_ui/Pages/VCockpit/Instruments/NavSystems/TTX/WTG3000/Assets';

    /**
     * A cache of map waypoint icon images.
     */
    class MapWaypointIconImageCache {
        /**
         * Gets a map waypoint icon image cache.
         * @returns A map waypoint icon image cache.
         */
        static getCache() {
            var _a;
            return (_a = MapWaypointIconImageCache.INSTANCE) !== null && _a !== void 0 ? _a : (MapWaypointIconImageCache.INSTANCE = this.createCache());
        }
        /**
         * Creates a waypoint icon image cache.
         * @returns A new waypoint icon image cache.
         */
        static createCache() {
            const cache = new garminsdk.DefaultWaypointIconImageCache();
            cache.register(garminsdk.DefaultWaypointIconImageKey.AirportPrivate, 'coui://html_ui/Pages/VCockpit/Instruments/NavSystems/TTX/WTG3000/Assets/Images/Map/airport_r.png');
            cache.register(garminsdk.DefaultWaypointIconImageKey.AirportUnknown, 'coui://html_ui/Pages/VCockpit/Instruments/NavSystems/TTX/WTG3000/Assets/Images/Map/airport_q.png');
            cache.register(garminsdk.DefaultWaypointIconImageKey.AirportUntoweredServiced, 'coui://html_ui/Pages/VCockpit/Instruments/NavSystems/TTX/WTG3000/Assets/Images/Map/airport_large_magenta.png');
            cache.register(garminsdk.DefaultWaypointIconImageKey.AirportToweredUnserviced, 'coui://html_ui/Pages/VCockpit/Instruments/NavSystems/TTX/WTG3000/Assets/Images/Map/airport_med_blue.png');
            cache.register(garminsdk.DefaultWaypointIconImageKey.AirportToweredServiced, 'coui://html_ui/Pages/VCockpit/Instruments/NavSystems/TTX/WTG3000/Assets/Images/Map/airport_large_blue.png');
            cache.register(garminsdk.DefaultWaypointIconImageKey.AirportUntoweredUnserviced, 'coui://html_ui/Pages/VCockpit/Instruments/NavSystems/TTX/WTG3000/Assets/Images/Map/airport_med_magenta.png');
            cache.register(garminsdk.DefaultWaypointIconImageKey.AirportSmallUnserviced, 'coui://html_ui/Pages/VCockpit/Instruments/NavSystems/TTX/WTG3000/Assets/Images/Map/airport_small_a.png');
            cache.register(garminsdk.DefaultWaypointIconImageKey.AirportSmallServiced, 'coui://html_ui/Pages/VCockpit/Instruments/NavSystems/TTX/WTG3000/Assets/Images/Map/airport_small_b.png');
            cache.register(garminsdk.DefaultWaypointIconImageKey.Intersection, 'coui://html_ui/Pages/VCockpit/Instruments/NavSystems/TTX/WTG3000/Assets/Images/Map/intersection_cyan.png');
            cache.register(garminsdk.DefaultWaypointIconImageKey.Vor, 'coui://html_ui/Pages/VCockpit/Instruments/NavSystems/TTX/WTG3000/Assets/Images/Map/vor.png');
            cache.register(garminsdk.DefaultWaypointIconImageKey.VorDme, 'coui://html_ui/Pages/VCockpit/Instruments/NavSystems/TTX/WTG3000/Assets/Images/Map/vor_dme.png');
            cache.register(garminsdk.DefaultWaypointIconImageKey.DmeOnly, 'coui://html_ui/Pages/VCockpit/Instruments/NavSystems/TTX/WTG3000/Assets/Images/Map/dme.png');
            cache.register(garminsdk.DefaultWaypointIconImageKey.Vortac, 'coui://html_ui/Pages/VCockpit/Instruments/NavSystems/TTX/WTG3000/Assets/Images/Map/vor_vortac.png');
            // TODO TACAN icon
            cache.register(garminsdk.DefaultWaypointIconImageKey.Ndb, 'coui://html_ui/Pages/VCockpit/Instruments/NavSystems/TTX/WTG3000/Assets/Images/Map/ndb.png');
            cache.register(garminsdk.DefaultWaypointIconImageKey.User, 'coui://html_ui/Pages/VCockpit/Instruments/NavSystems/TTX/WTG3000/Assets/Images/Map/user.png');
            cache.register(garminsdk.DefaultWaypointIconImageKey.FlightPath, 'coui://html_ui/Pages/VCockpit/Instruments/NavSystems/TTX/WTG3000/Assets/Images/Map/map_icon_flight_path_waypoint.png');
            cache.register(garminsdk.DefaultWaypointIconImageKey.VNav, 'coui://html_ui/Pages/VCockpit/Instruments/NavSystems/TTX/WTG3000/Assets/Images/Map/vnav.png');
            return cache;
        }
    }

    /**
     * A G3000 map builder.
     */
    class MapBuilder {
        /**
         * Configures a map builder to generate a G3000 navigation map.
         *
         * The controller `[GarminMapKeys.Range]: MapRangeController` is added to the map context and can be used to control
         * the range of the map.
         *
         * If flight plan focus is supported, the module `[GarminMapKeys.FlightPlanFocus]: MapFlightPlanFocusModule` is added
         * to the map model and can be used to control the focus.
         *
         * If the map pointer is supported, the controller `[GarminMapKeys.Pointer]: MapPointerController` is added to the
         * map context and can be used to control the pointer.
         *
         * The map builder will **not** be configured to apply a custom projected size, dead zone, or to automatically update
         * the map.
         * @param mapBuilder The map builder to configure.
         * @param options Options for configuring the map.
         * @returns The builder, after it has been configured.
         */
        static navMap(mapBuilder, options) {
            var _a;
            mapBuilder.with(garminsdk.NextGenNavMapBuilder.build, Object.assign(Object.assign({}, options), { waypointIconImageCache: MapWaypointIconImageCache.getCache(), waypointStyleFontType: 'DejaVu', runwayDesignationImageCache: G3000MapRunwayDesignationImageCache.getCache(), noGpsBannerText: 'NO FMS POSITION' }));
            if ((_a = options.supportDataIntegrity) !== null && _a !== void 0 ? _a : true) {
                mapBuilder.withController(msfssdk.MapSystemKeys.DataIntegrity, context => { var _a; return new MapDataIntegrityController(context, (_a = options.iauIndex) !== null && _a !== void 0 ? _a : 1, options.iauSettingManager); });
            }
            return mapBuilder;
        }
        /**
         * Configures a map builder to generate a G3000 NXi HSI map.
         *
         * The controller `[GarminMapKeys.Range]: MapRangeController` is added to the map context and can be used to control
         * the range of the map.
         *
         * The map builder will **not** be configured to apply a custom projected size, dead zone, or to automatically update
         * the map.
         * @param mapBuilder The map builder to configure.
         * @param options Options for configuring the map.
         * @returns The builder, after it has been configured.
         */
        static hsiMap(mapBuilder, options) {
            var _a;
            mapBuilder.with(garminsdk.NextGenHsiMapBuilder.build, Object.assign(Object.assign({}, options), { waypointIconImageCache: MapWaypointIconImageCache.getCache(), waypointStyleFontType: 'DejaVu', runwayDesignationImageCache: G3000MapRunwayDesignationImageCache.getCache() }));
            if ((_a = options.supportDataIntegrity) !== null && _a !== void 0 ? _a : true) {
                mapBuilder.withController(msfssdk.MapSystemKeys.DataIntegrity, context => { var _a; return new MapDataIntegrityController(context, (_a = options.iauIndex) !== null && _a !== void 0 ? _a : 1, options.iauSettingManager); });
            }
            return mapBuilder;
        }
        /**
         * Configures a map builder to generate a G3000 waypoint map. The map is locked to a North Up orientation, targets
         * a highlighted waypoint, and follows the player airplane when there is no highlighted waypoint.
         *
         * The module `[GarminMapKeys.WaypointHighlight]: MapWaypointHighlightModule` is added to the map model and can be
         * used to control the highlighted waypoint.
         *
         * The controller `[GarminMapKeys.Range]: MapRangeController` is added to the map context and can be used to control
         * the range of the waypoint map.
         *
         * If the map pointer is supported, the controller `[GarminMapKeys.Pointer]: MapPointerController` is added to the
         * map context and can be used to control the pointer.
         *
         * The map builder will **not** be configured to apply a custom projected size, dead zone, or to automatically update
         * the map.
         * @param mapBuilder The map builder to configure.
         * @param options Options for configuring the map.
         * @returns The builder, after it has been configured.
         */
        static waypointMap(mapBuilder, options) {
            var _a;
            mapBuilder.with(garminsdk.NextGenWaypointMapBuilder.build, Object.assign(Object.assign({}, options), { waypointIconImageCache: MapWaypointIconImageCache.getCache(), waypointStyleFontType: 'DejaVu', runwayDesignationImageCache: G3000MapRunwayDesignationImageCache.getCache(), noGpsBannerText: 'NO FMS POSITION' }));
            if ((_a = options.supportDataIntegrity) !== null && _a !== void 0 ? _a : true) {
                mapBuilder.withController(msfssdk.MapSystemKeys.DataIntegrity, context => { var _a; return new MapDataIntegrityController(context, (_a = options.iauIndex) !== null && _a !== void 0 ? _a : 1, options.iauSettingManager); });
            }
            return mapBuilder;
        }
        /**
         * Configures a map builder to generate a G3000 nearest waypoint map.
         *
         * The module `[GarminMapKeys.WaypointHighlight]: MapWaypointHighlightModule` is added to the map model and can be
         * used to control the highlighted waypoint.
         *
         * The controller `[GarminMapKeys.Range]: MapRangeController` is added to the map context and can be used to control
         * the range of the map.
         *
         * If the map pointer is supported, the controller `[GarminMapKeys.Pointer]: MapPointerController` is added to the
         * map context and can be used to control the pointer.
         *
         * The map builder will **not** be configured to apply a custom projected size, dead zone, or to automatically update
         * the map.
         * @param mapBuilder The map builder to configure.
         * @param options Options for configuring the map.
         * @returns The builder, after it has been configured.
         */
        static nearestMap(mapBuilder, options) {
            var _a;
            mapBuilder.with(garminsdk.NextGenNearestMapBuilder.build, Object.assign(Object.assign({}, options), { waypointIconImageCache: MapWaypointIconImageCache.getCache(), waypointStyleFontType: 'DejaVu', runwayDesignationImageCache: G3000MapRunwayDesignationImageCache.getCache(), noGpsBannerText: 'NO FMS POSITION' }));
            if ((_a = options.supportDataIntegrity) !== null && _a !== void 0 ? _a : true) {
                mapBuilder.withController(msfssdk.MapSystemKeys.DataIntegrity, context => { var _a; return new MapDataIntegrityController(context, (_a = options.iauIndex) !== null && _a !== void 0 ? _a : 1, options.iauSettingManager); });
            }
            return mapBuilder;
        }
        /**
         * Configures a map builder to generate a G3000 procedure map. The map displays a flight plan procedure (departure,
         * arrival, approach) and its transitions, and is always focused on the displayed procedure. The map is also locked
         * to a North Up orientation.
         *
         * The module `[GarminMapKeys.ProcedurePreview]: MapProcedurePreviewModule` is added to the map model and can be
         * used to control the displayed procedure.
         *
         * The module `[GarminMapKeys.FlightPlanFocus]: MapFlightPlanFocusModule` is added to the map model and can be used
         * to control the procedure focus.
         *
         * The controller `[GarminMapKeys.Range]: MapRangeController` is added to the map context and can be used to control
         * the range of the map.
         *
         * If the map pointer is supported, the controller `[GarminMapKeys.Pointer]: MapPointerController` is added to the
         * map context and can be used to control the pointer.
         *
         * The map builder will **not** be configured to apply a custom projected size, dead zone, or to automatically update
         * the map.
         * @param mapBuilder The map builder to configure.
         * @param options Options for configuring the map.
         * @returns The builder, after it has been configured.
         */
        static procMap(mapBuilder, options) {
            var _a;
            mapBuilder.with(garminsdk.NextGenProcMapBuilder.build, Object.assign(Object.assign({}, options), { waypointIconImageCache: MapWaypointIconImageCache.getCache(), waypointStyleFontType: 'DejaVu', noGpsBannerText: 'NO FMS POSITION' }));
            if ((_a = options.supportDataIntegrity) !== null && _a !== void 0 ? _a : true) {
                mapBuilder.withController(msfssdk.MapSystemKeys.DataIntegrity, context => { var _a; return new MapDataIntegrityController(context, (_a = options.iauIndex) !== null && _a !== void 0 ? _a : 1, options.iauSettingManager); });
            }
            return mapBuilder;
        }
        /**
         * Configures a map builder to generate a G3000 Garmin traffic map. The map consists of an optional active flight
         * plan layer, an optional traffic range ring layer, a traffic intruder layer, an airplane icon layer, and an
         * optional mini-compass layer. The map is centered on the player airplane and is locked in Heading Up orientation.
         *
         * The controller `[GarminMapKeys.TrafficRange]: TrafficMapRangeController` is added to the map context and can be
         * used to control the range of the traffic map.
         *
         * The map builder will **not** be configured to apply a custom projected size, dead zone, or to automatically update
         * the map.
         * @param mapBuilder The map builder to configure.
         * @param options Options for configuring the map.
         * @returns The builder, after it has been configured.
         */
        static trafficMap(mapBuilder, options) {
            var _a;
            mapBuilder.with(garminsdk.TrafficMapBuilder.buildNextGen, Object.assign(Object.assign({}, options), { waypointIconImageCache: MapWaypointIconImageCache.getCache(), waypointStyleFontType: 'DejaVu' }));
            if ((_a = options.supportDataIntegrity) !== null && _a !== void 0 ? _a : true) {
                mapBuilder.withController(msfssdk.MapSystemKeys.DataIntegrity, context => { var _a; return new MapDataIntegrityController(context, (_a = options.iauIndex) !== null && _a !== void 0 ? _a : 1, options.iauSettingManager); });
            }
            return mapBuilder;
        }
        /**
         * Configures a map builder to generate a G3000 Connext weather map.
         *
         * The controller `[GarminMapKeys.Range]: MapRangeController` is added to the map context and can be used to control
         * the range of the map.
         *
         * If the map pointer is supported, the controller `[GarminMapKeys.Pointer]: MapPointerController` is added to the
         * map context and can be used to control the pointer.
         *
         * The map builder will **not** be configured to apply a custom projected size, dead zone, or to automatically update
         * the map.
         * @param mapBuilder The map builder to configure.
         * @param options Options for configuring the map.
         * @returns The builder, after it has been configured.
         */
        static connextMap(mapBuilder, options) {
            var _a;
            mapBuilder.with(garminsdk.NextGenConnextMapBuilder.build, Object.assign(Object.assign({}, options), { waypointIconImageCache: MapWaypointIconImageCache.getCache(), waypointStyleFontType: 'DejaVu', runwayDesignationImageCache: G3000MapRunwayDesignationImageCache.getCache(), noGpsBannerText: 'NO FMS POSITION' }));
            if ((_a = options.supportDataIntegrity) !== null && _a !== void 0 ? _a : true) {
                mapBuilder.withController(msfssdk.MapSystemKeys.DataIntegrity, context => { var _a; return new MapDataIntegrityController(context, (_a = options.iauIndex) !== null && _a !== void 0 ? _a : 1, options.iauSettingManager); });
            }
            return mapBuilder;
        }
        /**
         * Gets a set of standard options for the map's own airplane icon.
         * @param config The map configuration object defining the path to the own airplane icon's image asset.
         * @param includeNoHeadingIcon Whether to include the no-heading icon. Defaults to `true`.
         * @returns A set of standard options for the map's own airplane icon.
         */
        static ownAirplaneIconOptions(config, includeNoHeadingIcon = true) {
            const options = {
                airplaneIconSize: 35,
                airplaneIconSrc: config.ownAirplaneIconSrc,
                airplaneIconAnchor: msfssdk.Vec2Math.create(0.5, 0)
            };
            if (includeNoHeadingIcon) {
                options.noHeadingAirplaneIconSrc = `${G3000FilePaths.ASSETS_PATH}/Images/Map/airplane_nohdg.svg`;
                options.noHeadingAirplaneIconAnchor = msfssdk.Vec2Math.create(0.5, 0.5);
            }
            return options;
        }
        /**
         * Gets the URI for the mini-compass icon's image asset.
         * @returns The URI for the mini-compass icon's image asset.
         */
        static miniCompassIconSrc() {
            return `${G3000FilePaths.ASSETS_PATH}/Images/Map/map_mini_compass.png`;
        }
        /**
         * Gets the URI for the relative terrain mode indicator icon's image asset.
         * @returns The URI for the relative terrain mode indicator icon's image asset.
         */
        static relativeTerrainIconSrc() {
            return `${G3000FilePaths.ASSETS_PATH}/Images/Map/map_icon_relative_terrain.png`;
        }
        /**
         * Gets the index of the IAU (integrated avionics unit) used by a map on a specific display pane.
         * @param displayPaneIndex The index of the display pane on which the map appears.
         * @returns The index of the IAU (integrated avionics unit) used by a map on the specified display pane.
         */
        static getIauIndexForDisplayPane(displayPaneIndex) {
            switch (displayPaneIndex) {
                case exports.DisplayPaneIndex.RightPfd:
                case exports.DisplayPaneIndex.RightPfdInstrument:
                    return 2;
                default:
                    return 1;
            }
        }
    }

    /**
     * A direction for a joystick input that controls a map pointer.
     */
    exports.MapPointerJoystickDirection = void 0;
    (function (MapPointerJoystickDirection) {
        MapPointerJoystickDirection["Left"] = "Left";
        MapPointerJoystickDirection["LeftUp"] = "LeftUp";
        MapPointerJoystickDirection["Up"] = "Up";
        MapPointerJoystickDirection["RightUp"] = "RightUp";
        MapPointerJoystickDirection["Right"] = "Right";
        MapPointerJoystickDirection["RightDown"] = "RightDown";
        MapPointerJoystickDirection["Down"] = "Down";
        MapPointerJoystickDirection["LeftDown"] = "LeftDown";
    })(exports.MapPointerJoystickDirection || (exports.MapPointerJoystickDirection = {}));
    /**
     * A handler for joystick inputs that control the movement of a map pointer. Consumes inputs and converts them into
     * displacement vectors for the map pointer. Supports input acceleration.
     */
    class MapPointerJoystickHandler {
        /**
         * Constructor.
         * @param accelTimeThreshold The maximum time, in milliseconds, between inputs required to trigger acceleration.
         * Defaults to {@link MapPointerJoystickHandler.DEFAULT_ACCEL_TIME_THRESHOLD}.
         */
        constructor(accelTimeThreshold = MapPointerJoystickHandler.DEFAULT_ACCEL_TIME_THRESHOLD) {
            this.accelTimeThreshold = accelTimeThreshold;
            this.consecutiveInputs = 0;
            this.lastInputTime = 0;
        }
        /**
         * Handles a joystick input, converting it into a displacement vector for the map pointer.
         * @param direction The direction of the input.
         * @param out The vector to which to write the result.
         * @returns The displacement vector for the map pointer commanded by the input.
         */
        onInput(direction, out) {
            let angle = 0;
            switch (direction) {
                case exports.MapPointerJoystickDirection.Right:
                    angle = 0;
                    break;
                case exports.MapPointerJoystickDirection.RightDown:
                    angle = Math.PI / 4;
                    break;
                case exports.MapPointerJoystickDirection.Down:
                    angle = Math.PI / 2;
                    break;
                case exports.MapPointerJoystickDirection.LeftDown:
                    angle = 3 * Math.PI / 4;
                    break;
                case exports.MapPointerJoystickDirection.Left:
                    angle = Math.PI;
                    break;
                case exports.MapPointerJoystickDirection.LeftUp:
                    angle = -3 * Math.PI / 4;
                    break;
                case exports.MapPointerJoystickDirection.Up:
                    angle = -Math.PI / 2;
                    break;
                case exports.MapPointerJoystickDirection.RightUp:
                    angle = -Math.PI / 4;
                    break;
            }
            const time = Date.now();
            const dt = time - this.lastInputTime;
            this.lastInputTime = time;
            if (dt <= this.accelTimeThreshold) {
                this.consecutiveInputs++;
            }
            else {
                this.consecutiveInputs = 0;
            }
            let distance = MapPointerJoystickHandler.STEP;
            if (this.consecutiveInputs > 4) {
                distance *= 4;
            }
            else if (this.consecutiveInputs > 1) {
                distance *= 2;
            }
            return msfssdk.Vec2Math.setFromPolar(distance, angle, out);
        }
    }
    /** The base distance moved by the map pointer per input, in pixels. */
    MapPointerJoystickHandler.STEP = 5;
    /** The maximum time, in milliseconds, between inputs required to trigger acceleration. */
    MapPointerJoystickHandler.DEFAULT_ACCEL_TIME_THRESHOLD = 250;

    // TODO Maybe move to garminSDK, since this was copied from the NXI with minimal changes?
    /**
     * Utility methods for working with the flight plan display in the G3000.
     */
    class G3000FPLUtils {
        // eslint-disable-next-line jsdoc/require-jsdoc
        static getFlightPlanDisplayName(arg1, arg2, arg3) {
            let name, originIdent, destIdent;
            if (typeof arg1 === 'object') {
                name = arg1.getUserData('name');
                originIdent = arg1.originAirport ? msfssdk.ICAO.getIdent(arg1.originAirport) : undefined;
                destIdent = arg1.destinationAirport ? msfssdk.ICAO.getIdent(arg1.destinationAirport) : undefined;
            }
            else {
                name = arg1;
                originIdent = arg2;
                destIdent = arg3;
            }
            return name !== null && name !== void 0 ? name : `${originIdent ? msfssdk.StringUtils.useZeroSlash(originIdent) : '______'} / ${destIdent ? msfssdk.StringUtils.useZeroSlash(destIdent) : '______'}`;
        }
    }

    /**
     * Map inset setting modes.
     */
    exports.MapInsetSettingMode = void 0;
    (function (MapInsetSettingMode) {
        MapInsetSettingMode["None"] = "None";
        MapInsetSettingMode["FlightPlanText"] = "FlightPlanText";
        MapInsetSettingMode["VertSituationDisplay"] = "VertSituationDisplay";
        MapInsetSettingMode["FlightPlanProgress"] = "FlightPlanProgress";
    })(exports.MapInsetSettingMode || (exports.MapInsetSettingMode = {}));
    /**
     * Utility class for retrieving G3000 map user setting managers.
     */
    class MapUserSettings {
        /**
         * Retrieves a manager for all true map settings.
         * @param bus The event bus.
         * @returns A manager for all true map settings.
         */
        static getMasterManager(bus) {
            var _a;
            return (_a = MapUserSettings.masterInstance) !== null && _a !== void 0 ? _a : (MapUserSettings.masterInstance = new msfssdk.DefaultUserSettingManager(bus, [
                ...MapUserSettings.getDisplayPaneSettingDefs(exports.DisplayPaneIndex.LeftPfd),
                ...MapUserSettings.getDisplayPaneSettingDefs(exports.DisplayPaneIndex.LeftMfd),
                ...MapUserSettings.getDisplayPaneSettingDefs(exports.DisplayPaneIndex.RightMfd),
                ...MapUserSettings.getDisplayPaneSettingDefs(exports.DisplayPaneIndex.RightPfd),
                ...MapUserSettings.getPfdSettingDefs(1),
                ...MapUserSettings.getPfdSettingDefs(2)
            ]));
        }
        /**
         * Retrieves a manager for aliased map settings for a single display pane.
         * @param bus The event bus.
         * @param index The index of the display pane.
         * @returns A manager for aliased map settings for the specified display pane.
         */
        static getDisplayPaneManager(bus, index) {
            var _a;
            var _b;
            return (_a = (_b = MapUserSettings.displayPaneInstances)[index]) !== null && _a !== void 0 ? _a : (_b[index] = MapUserSettings.getMasterManager(bus).mapTo(MapUserSettings.getDisplayPaneAliasMap(index)));
        }
        /**
         * Retrieves a manager for aliased map settings for a PFD.
         * @param bus The event bus.
         * @param index The index of the PFD.
         * @returns A manager for aliased map settings for the specified PFD.
         */
        static getPfdManager(bus, index) {
            var _a;
            var _b;
            return (_a = (_b = MapUserSettings.pfdInstances)[index]) !== null && _a !== void 0 ? _a : (_b[index] = MapUserSettings.getMasterManager(bus).mapTo(MapUserSettings.getPfdAliasMap(index)));
        }
        /**
         * Gets the default values for a full set of aliased map settings.
         * @returns The default values for a full set of aliased map settings.
         */
        static getDefaultValues() {
            return {
                ['mapRangeIndex']: 11,
                ['mapOrientation']: garminsdk.MapOrientationSettingMode.HeadingUp,
                ['mapAutoNorthUpActive']: true,
                ['mapAutoNorthUpRangeIndex']: 27,
                ['mapDeclutter']: garminsdk.MapDeclutterSettingMode.All,
                ['mapTerrainMode']: garminsdk.MapTerrainSettingMode.Absolute,
                ['mapTerrainRangeIndex']: 27,
                ['mapTerrainScaleShow']: false,
                ['mapAirportShow']: true,
                ['mapAirportLargeRangeIndex']: 21,
                ['mapAirportMediumRangeIndex']: 19,
                ['mapAirportSmallRangeIndex']: 17,
                ['mapVorShow']: true,
                ['mapVorRangeIndex']: 19,
                ['mapNdbShow']: true,
                ['mapNdbRangeIndex']: 17,
                ['mapIntersectionShow']: true,
                ['mapIntersectionRangeIndex']: 17,
                ['mapUserWaypointShow']: true,
                ['mapUserWaypointRangeIndex']: 17,
                ['mapAirspaceShow']: true,
                ['mapAirspaceClassBRangeIndex']: 19,
                ['mapAirspaceClassCRangeIndex']: 19,
                ['mapAirspaceClassDRangeIndex']: 15,
                ['mapAirspaceRestrictedRangeIndex']: 19,
                ['mapAirspaceMoaRangeIndex']: 19,
                ['mapAirspaceOtherRangeIndex']: 19,
                ['mapTrafficShow']: false,
                ['mapTrafficRangeIndex']: 17,
                ['mapTrafficLabelShow']: true,
                ['mapTrafficLabelRangeIndex']: 17,
                ['mapTrafficAlertLevelMode']: garminsdk.MapTrafficAlertLevelSettingMode.All,
                ['mapNexradShow']: false,
                ['mapNexradRangeIndex']: 27,
                ['mapTrackVectorShow']: false,
                ['mapTrackVectorLookahead']: 60,
                ['mapAltitudeArcShow']: false,
                ['mapInsetMode']: exports.MapInsetSettingMode.None,
                ['mapInsetTextCumulative']: false,
            };
        }
        /**
         * Gets an array of user setting definitions for a full set of aliased map settings.
         * @returns An array of user setting definitions for a full set of aliased map settings.
         */
        static getAliasedSettingDefs() {
            const defaultValues = MapUserSettings.getDefaultValues();
            return Object.keys(defaultValues).map(name => {
                return {
                    name,
                    defaultValue: defaultValues[name]
                };
            });
        }
        /**
         * Gets an array of definitions for true map settings for a single display pane.
         * @param index The index of the display pane.
         * @returns An array of definitions for true map settings for the specified display pane.
         */
        static getDisplayPaneSettingDefs(index) {
            const values = MapUserSettings.getDefaultValues();
            return Object.keys(values).map(name => {
                return {
                    name: `${name}_${index}`,
                    defaultValue: values[name]
                };
            });
        }
        /**
         * Gets an array of definitions for true independent map settings for a PFD.
         * @param index The index of the PFD.
         * @returns An array of definitions for true independent map settings for the specified PFD.
         */
        static getPfdSettingDefs(index) {
            const values = MapUserSettings.getDefaultValues();
            const splitSettingNames = Object.keys(values).filter(name => MapUserSettings.SPLIT_SETTING_NAMES.includes(name));
            return splitSettingNames.map(name => {
                return {
                    name: `${name}Pfd_${index}`,
                    defaultValue: values[name]
                };
            });
        }
        /**
         * Gets a setting name alias mapping for a display pane.
         * @param index The index of the display pane.
         * @returns A setting name alias mapping for the specified display pane.
         */
        static getDisplayPaneAliasMap(index) {
            const map = {};
            for (const name of garminsdk.MapUserSettingsUtils.SETTING_NAMES) {
                if (name in G3000MapUserSettingUtils.DELEGATE_MAP) {
                    map[name] = `${G3000MapUserSettingUtils.DELEGATE_MAP[name]}_${index}`;
                }
                else {
                    map[name] = `${name}_${index}`;
                }
            }
            for (const name of G3000MapUserSettingUtils.SPECIFIC_SETTING_NAMES) {
                map[name] = `${name}_${index}`;
            }
            return map;
        }
        /**
         * Gets a setting name alias mapping for a PFD.
         * @param index The index of the PFD.
         * @returns A setting name alias mapping for the specified PFD.
         */
        static getPfdAliasMap(index) {
            const map = {};
            const displayPaneSettingNames = garminsdk.MapUserSettingsUtils.SETTING_NAMES.filter(name => !MapUserSettings.SPLIT_SETTING_NAMES.includes(name));
            const displayPaneIndex = (index === 1 ? exports.DisplayPaneIndex.LeftPfd : exports.DisplayPaneIndex.RightPfd);
            for (const name of displayPaneSettingNames) {
                if (name in G3000MapUserSettingUtils.DELEGATE_MAP) {
                    map[name] = `${G3000MapUserSettingUtils.DELEGATE_MAP[name]}_${displayPaneIndex}`;
                }
                else {
                    map[name] = `${name}_${displayPaneIndex}`;
                }
            }
            for (const name of G3000MapUserSettingUtils.SPECIFIC_SETTING_NAMES) {
                map[name] = `${name}_${displayPaneIndex}`;
            }
            for (const name of MapUserSettings.SPLIT_SETTING_NAMES) {
                map[name] = `${name}Pfd_${index}`;
            }
            return map;
        }
    }
    MapUserSettings.SPLIT_SETTING_NAMES = [
        'mapRangeIndex',
        'mapDeclutter',
        'mapTerrainMode',
        'mapTrafficShow',
        'mapNexradShow'
    ];
    MapUserSettings.displayPaneInstances = [];
    MapUserSettings.pfdInstances = [];
    /**
     * A utility class for working with G3000 map user settings.
     */
    class G3000MapUserSettingUtils {
    }
    /** An array of all G3000 map user setting names. */
    G3000MapUserSettingUtils.SETTING_NAMES = [
        'mapRangeIndex',
        'mapOrientation',
        'mapAutoNorthUpActive',
        'mapAutoNorthUpRangeIndex',
        'mapDeclutter',
        'mapTerrainMode',
        'mapTerrainRangeIndex',
        'mapTerrainScaleShow',
        'mapAirportShow',
        'mapAirportLargeRangeIndex',
        'mapAirportMediumRangeIndex',
        'mapAirportSmallRangeIndex',
        'mapVorShow',
        'mapVorRangeIndex',
        'mapNdbShow',
        'mapNdbRangeIndex',
        'mapIntersectionShow',
        'mapIntersectionRangeIndex',
        'mapUserWaypointShow',
        'mapUserWaypointRangeIndex',
        'mapAirspaceShow',
        'mapAirspaceClassBRangeIndex',
        'mapAirspaceClassCRangeIndex',
        'mapAirspaceClassDRangeIndex',
        'mapAirspaceRestrictedRangeIndex',
        'mapAirspaceMoaRangeIndex',
        'mapAirspaceOtherRangeIndex',
        'mapTrafficShow',
        'mapTrafficRangeIndex',
        'mapTrafficLabelShow',
        'mapTrafficLabelRangeIndex',
        'mapTrafficAlertLevelMode',
        'mapNexradShow',
        'mapNexradRangeIndex',
        'mapTrackVectorShow',
        'mapTrackVectorLookahead',
        'mapAltitudeArcShow',
        'mapInsetMode',
        'mapInsetTextCumulative',
    ];
    /** An array of names of all G3000-specific map user settings. */
    G3000MapUserSettingUtils.SPECIFIC_SETTING_NAMES = [
        'mapAirportShow',
        'mapAirspaceShow',
        'mapInsetMode',
        'mapInsetTextCumulative',
    ];
    /** A mapping of delegated map user settings to the user setting to which each is delegated. */
    G3000MapUserSettingUtils.DELEGATE_MAP = {
        'mapAirportLargeShow': 'mapAirportShow',
        'mapAirportMediumShow': 'mapAirportShow',
        'mapAirportSmallShow': 'mapAirportShow',
        'mapAirspaceClassBShow': 'mapAirspaceShow',
        'mapAirspaceClassCShow': 'mapAirspaceShow',
        'mapAirspaceClassDShow': 'mapAirspaceShow',
        'mapAirspaceRestrictedShow': 'mapAirspaceShow',
        'mapAirspaceMoaShow': 'mapAirspaceShow',
        'mapAirspaceOtherShow': 'mapAirspaceShow'
    };

    /* eslint-disable @typescript-eslint/no-unused-vars */
    /** A DisplayPaneInsetView component */
    class DisplayPaneInsetView extends msfssdk.DisplayComponent {
        constructor() {
            super(...arguments);
            this.isPfd = DisplayPaneUtils.isPfdDisplayPaneIndex(this.props.index);
        }
        /**
         * Called when this view is made visible.
         * @param size The size of this view's parent pane.
         * @param width The width of this view's parent pane, in pixels.
         * @param height The height of this view's parent pane, in pixels.
         */
        onResume(size, width, height) {
            // noop
        }
        /**
         * Called when this view is hidden.
         */
        onPause() {
            // noop
        }
        /**
         * Called when this view's parent pane is resized while this view is visible.
         * @param size The size of this view's parent pane.
         * @param width The width of this view's parent pane, in pixels.
         * @param height The height of this view's parent pane, in pixels.
         */
        onResize(size, width, height) {
            // noop
        }
        /**
         * Called every update cycle.
         * @param time The current real (operating system) time, as a UNIX timestamp in milliseconds.
         */
        onUpdate(time) {
            // noop
        }
        /**
         * Cleans up subscriptions.
         */
        destroy() {
            // noop
        }
    }

    /* eslint-disable @typescript-eslint/no-non-null-assertion */
    /** A store for vnav profile data. */
    class VnavProfileStore {
        /**
         * Creates a new vnav profile store.
         * @param bus The event bus.
         * @param store The flight plan store to use.
         * @param isAdvancedVnav Whether this is advanced vnav or not.
         * @param vnavDataProvider The vnav data provider.
         */
        constructor(bus, store, isAdvancedVnav, vnavDataProvider) {
            this.bus = bus;
            this.store = store;
            this.isAdvancedVnav = isAdvancedVnav;
            this.vnavDataProvider = vnavDataProvider;
            this.vnavState = msfssdk.ConsumerSubject.create(null, msfssdk.VNavState.Disabled).pause();
            this.selectedAlt = msfssdk.ConsumerSubject.create(null, 0).pause();
            this._verticalSpeedTarget = msfssdk.NumberUnitSubject.create(msfssdk.UnitType.FPM.createNumber(NaN));
            this._fpa = msfssdk.Subject.create(NaN, msfssdk.SubscribableUtils.NUMERIC_NAN_EQUALITY);
            this._fpaShowClimb = this.vnavDataProvider.phase.map(phase => phase === msfssdk.VerticalFlightPhase.Climb).pause();
            this._verticalSpeedRequired = msfssdk.NumberUnitSubject.create(msfssdk.UnitType.FPM.createNumber(NaN));
            this._timeToValue = msfssdk.NumberUnitSubject.create(msfssdk.UnitType.SECOND.createNumber(NaN));
            this._verticalDeviation = msfssdk.NumberUnitSubject.create(msfssdk.UnitType.FOOT.createNumber(NaN));
            this._vnavEnabled = this.vnavState.map(x => x !== msfssdk.VNavState.Disabled);
            this.isPathEditable = msfssdk.Subject.create(false);
            this._isPathEditButtonEnabled = msfssdk.MappedSubject.create(([isEditable, fpa, leg]) => isEditable && fpa !== null && fpa > 0 && leg !== null, this.isPathEditable, this.vnavDataProvider.fpa, this.vnavDataProvider.activeConstraintLeg);
            // TODO Could say CRZ ALT
            this._activeVnavWaypoint = msfssdk.Subject.create(undefined);
            this._altDesc = msfssdk.Subject.create(msfssdk.AltitudeRestrictionType.Unused);
            this._altitude1 = msfssdk.NumberUnitSubject.create(msfssdk.UnitType.METER.createNumber(NaN));
            this._altitude2 = msfssdk.NumberUnitSubject.create(msfssdk.UnitType.METER.createNumber(NaN));
            this._displayAltitude1AsFlightLevel = msfssdk.Subject.create(false);
            this._displayAltitude2AsFlightLevel = msfssdk.Subject.create(false);
            this._isAltitudeEdited = msfssdk.Subject.create(false);
            this.verticalDataPipes = [];
            this._isVnavDirectToButtonEnabled = msfssdk.Subject.create(false);
            this._timeToLabel = msfssdk.Subject.create('');
            this._timeToLabelExtended = this._timeToLabel.map(x => 'Time to\n' + x);
            this.updateSub = this.bus.getSubscriber().on('realTime').whenChangedBy(1000).handle(this.update.bind(this), true);
            /** Whether VNAV is enabled. */
            this.vnavEnabled = this._vnavEnabled;
            /** Whether the button(s) to edit the active descent path should be enabled. */
            this.isPathEditButtonEnabled = this._isPathEditButtonEnabled;
            /** The active VNAV waypoint. */
            this.activeVnavWaypoint = this._activeVnavWaypoint;
            /** The vertical speed target for the active descent path, or `NaN` if there is no active descent path. */
            this.verticalSpeedTarget = this._verticalSpeedTarget;
            /**
             * The flight path angle for the active descent path, or `NaN` if there is no active descent path. Positive values
             * indicate a descending path.
             */
            this.fpa = this._fpa;
            /** Whether the active VNAV waypoint defines a CLIMB constraint. */
            this.fpaShowClimb = this._fpaShowClimb;
            /** The vertical speed required to meet the active VNAV restriction, or `NaN` if there is no such speed. */
            this.verticalSpeedRequired = this._verticalSpeedRequired;
            /**
             * The vertical deviation from the active descent path, or `NaN` if there is no active descent path. Positive values
             * indicate deviation above the path.
             */
            this.verticalDeviation = this._verticalDeviation;
            /** The time remaining to TOD/BOD/TOC/BOC, or `NaN` if no such value exists. */
            this.timeToValue = this._timeToValue;
            /** The label for the time remaining field. */
            this.timeToLabel = this._timeToLabel;
            /** The label for the time remaining field prefixed by `'Time to '`. */
            this.timeToLabelExtended = this._timeToLabelExtended;
            this.altDesc = this._altDesc;
            this.altitude1 = this._altitude1;
            this.altitude2 = this._altitude2;
            this.displayAltitude1AsFlightLevel = this._displayAltitude1AsFlightLevel;
            this.displayAltitude2AsFlightLevel = this._displayAltitude2AsFlightLevel;
            this.isAltitudeEdited = this._isAltitudeEdited;
            this.isVnavDirectToButtonEnabled = this._isVnavDirectToButtonEnabled;
            const sub = this.bus.getSubscriber();
            this.vnavState.setConsumer(sub.on('vnav_state'));
            this.selectedAlt.setConsumer(sub.on('ap_altitude_selected'));
            this.activeConstraintLegSub = this.vnavDataProvider.activeConstraintLeg.sub(this.updateTargetWaypoint.bind(this), false, true);
            this.fpaPipe = this.vnavDataProvider.fpa.pipe(this._fpa, fpa => fpa === null || fpa === 0 ? NaN : fpa, true);
        }
        /** Resumes the store's subscriptions. */
        resume() {
            var _a, _b;
            this.vnavState.resume();
            this.selectedAlt.resume();
            (_a = this.activeConstraintLegSub) === null || _a === void 0 ? void 0 : _a.resume(true);
            this._fpaShowClimb.resume();
            (_b = this.fpaPipe) === null || _b === void 0 ? void 0 : _b.resume(true);
            this.updateSub.resume(true);
        }
        /** Pauses the store's subscriptions. */
        pause() {
            var _a, _b;
            this.updateSub.pause();
            this.vnavState.pause();
            this.selectedAlt.pause();
            (_a = this.activeConstraintLegSub) === null || _a === void 0 ? void 0 : _a.pause();
            this._fpaShowClimb.pause();
            (_b = this.fpaPipe) === null || _b === void 0 ? void 0 : _b.pause();
        }
        /** Updates the store's values. */
        update() {
            this.updatePathEditState();
            this.updateVerticalDeviation();
            this.updateTimeFields();
            this.updateVsTarget();
            this.updateVsRequired();
            this.updateVnavDirectTo();
        }
        /**
         * Sets whether to enable the FPA and vertical speed target edit buttons.
         */
        updatePathEditState() {
            const constraintLeg = this.vnavDataProvider.activeConstraintLeg.get();
            if (constraintLeg === null) {
                this.isPathEditable.set(false);
                return;
            }
            const distanceToTod = this.vnavDataProvider.distanceToTod.get();
            const selectedAlt = msfssdk.UnitType.FOOT.convertTo(this.selectedAlt.get(), msfssdk.UnitType.METER);
            const altitude = constraintLeg.verticalData.altDesc === msfssdk.AltitudeRestrictionType.Between
                ? constraintLeg.verticalData.altitude2
                : constraintLeg.verticalData.altitude1;
            this.isPathEditable.set(distanceToTod !== null && (this.vnavDataProvider.isVNavDirectToActive.get()
                || distanceToTod <= VnavProfileStore.TOD_DISTANCE_PATH_EDIT_THRESHOLD
                || selectedAlt < altitude));
        }
        /** Updates the vertical deviation field. */
        updateVerticalDeviation() {
            const vDev = this.vnavDataProvider.verticalDeviation.get();
            if (vDev === null || Math.abs(vDev) > 10000) {
                this._verticalDeviation.set(NaN);
            }
            else {
                this._verticalDeviation.set(vDev);
            }
        }
        /** Updates the TOD/BOD/TOC/BOC fields. */
        updateTimeFields() {
            let label = 'TOD';
            let time = NaN;
            if (this.vnavDataProvider.phase.get() === msfssdk.VerticalFlightPhase.Climb) {
                const timeToToc = this.vnavDataProvider.timeToToc.get();
                const timeToBoc = this.vnavDataProvider.timeToBoc.get();
                if (timeToToc !== null && timeToToc > 0) {
                    label = 'TOC';
                    time = timeToToc;
                }
                else if (timeToBoc !== null && timeToBoc >= 0) {
                    label = 'BOC';
                    time = timeToBoc;
                }
            }
            else {
                const timeToTod = this.vnavDataProvider.timeToTod.get();
                const timeToBod = this.vnavDataProvider.timeToBod.get();
                if (timeToTod !== null && timeToTod > 0) {
                    time = timeToTod;
                }
                else if (timeToBod !== null && timeToBod >= 0) {
                    label = 'BOD';
                    time = timeToBod;
                }
            }
            this._timeToLabel.set(label);
            this._timeToValue.set(time);
        }
        /** Updates the vertical speed target field. */
        updateVsTarget() {
            const vsTarget = this.vnavDataProvider.verticalSpeedTarget.get();
            if (vsTarget === null || vsTarget >= 0) {
                this._verticalSpeedTarget.set(NaN);
            }
            else {
                this._verticalSpeedTarget.set(vsTarget);
            }
        }
        /** Updates the vertical speed required field. */
        updateVsRequired() {
            const vsr = this.vnavDataProvider.vsRequired.get();
            if (vsr === null) {
                this._verticalSpeedRequired.set(NaN);
            }
            else {
                this._verticalSpeedRequired.set(vsr);
            }
        }
        /**
         * Updates the target waypoint field.
         * @param leg The flight plan leg to which the active VNAV target altitude belongs, or `null` if there is no active
         * VNAV target altitude.
         */
        updateTargetWaypoint(leg) {
            this.verticalDataPipes.forEach(pipe => pipe.destroy());
            const legData = leg ? this.store.legMap.get(leg) : undefined;
            if (leg === null || !legData) {
                this._activeVnavWaypoint.set(undefined);
                this._altDesc.set(msfssdk.AltitudeRestrictionType.Unused);
                this._altitude1.set(NaN);
                this._altitude2.set(NaN);
                this._displayAltitude1AsFlightLevel.set(false);
                this._displayAltitude2AsFlightLevel.set(false);
                this._isAltitudeEdited.set(false);
            }
            else {
                this._activeVnavWaypoint.set(leg);
                if (this.isAdvancedVnav) {
                    this.verticalDataPipes.push(legData.altDesc.pipe(this._altDesc));
                }
                else {
                    this._altDesc.set(msfssdk.AltitudeRestrictionType.Unused);
                }
                this.verticalDataPipes.push(legData.altitude1.pipe(this._altitude1));
                this.verticalDataPipes.push(legData.altitude2.pipe(this._altitude2));
                this.verticalDataPipes.push(legData.displayAltitude1AsFlightLevel.pipe(this._displayAltitude1AsFlightLevel));
                this.verticalDataPipes.push(legData.displayAltitude2AsFlightLevel.pipe(this._displayAltitude2AsFlightLevel));
                this.verticalDataPipes.push(legData.isAltitudeEdited.pipe(this._isAltitudeEdited));
            }
        }
        /** Updates the vnav direct to button. */
        updateVnavDirectTo() {
            this._isVnavDirectToButtonEnabled.set(this.canVnavDirectTo());
        }
        /**
         * Determines whether a vnav direct to is available.
         * @returns whether a vnav direct to is available.
         */
        canVnavDirectTo() {
            if (!this.store.fms.hasFlightPlan(this.store.planIndex)) {
                return false;
            }
            for (const legListItem of this.store.legItems()) {
                if (this.canVnavDirectToLeg(legListItem)) {
                    return true;
                }
            }
            return false;
        }
        /**
         * Gets the vnav direct to legs.
         * @returns the vnav direct to legs.
         */
        getVnavDirectToLegs() {
            const legs = [];
            for (const legListItem of this.store.legItems()) {
                if (this.canVnavDirectToLeg(legListItem)) {
                    legs.push(legListItem);
                }
            }
            return legs;
        }
        /**
         * Determines whether a vnav direct to this leg is allowed.
         * @param legListItem The leg lsit data.
         * @returns whether a vnav direct to this leg is allowed.
         */
        canVnavDirectToLeg(legListItem) {
            const altDesc = legListItem.leg.verticalData.altDesc;
            const isInFrontOfOrIsActiveLeg = !legListItem.isBehindActiveLeg.get();
            const isValidAltDesc = altDesc !== msfssdk.AltitudeRestrictionType.Unused && altDesc !== msfssdk.AltitudeRestrictionType.Between;
            const isValidPhase = legListItem.vnavPhase.get() !== msfssdk.VerticalFlightPhase.Climb;
            return isValidAltDesc && isInFrontOfOrIsActiveLeg && isValidPhase;
        }
        /** Cleans up. */
        destroy() {
            var _a, _b;
            this.verticalDataPipes.forEach(pipe => pipe.destroy());
            this.updateSub.destroy();
            this.vnavState.destroy();
            this.selectedAlt.destroy();
            (_a = this.activeConstraintLegSub) === null || _a === void 0 ? void 0 : _a.destroy();
            this._fpaShowClimb.destroy();
            (_b = this.fpaPipe) === null || _b === void 0 ? void 0 : _b.destroy();
        }
    }
    VnavProfileStore.TOD_DISTANCE_PATH_EDIT_THRESHOLD = 10; // nautical miles

    const VERTICAL_SPEED_FORMATTER = msfssdk.NumberFormatter.create({ precision: 1, nanString: '_____', useMinusSign: true });
    const FPA_FORMATTER = msfssdk.NumberFormatter.create({ precision: 0.01, nanString: '_____', useMinusSign: true });
    const ALTITUDE_FORMATTER = msfssdk.NumberFormatter.create({ precision: 1, nanString: '_____', useMinusSign: true });
    /** The CurrentVnavProfilePanel component. */
    class CurrentVnavProfilePanel extends msfssdk.DisplayComponent {
        constructor() {
            super(...arguments);
            this.legNameDisplay = msfssdk.FSComponent.createRef();
            this.altDisplay = msfssdk.FSComponent.createRef();
            this.durationDisplay = msfssdk.FSComponent.createRef();
            this.fpaDisplay = msfssdk.FSComponent.createRef();
            this.tgtDisplay = msfssdk.FSComponent.createRef();
            this.vsReqDisplay = msfssdk.FSComponent.createRef();
            this.vdevDisplay = msfssdk.FSComponent.createRef();
            this.unitsSettingManager = garminsdk.UnitsUserSettings.getManager(this.props.bus);
            this.vnavProfileStore = new VnavProfileStore(this.props.bus, this.props.store, this.props.store.isAdvancedVnav, this.props.vnavDataProvider);
        }
        /** Resumes the vnav panel. */
        resume() {
            this.vnavProfileStore.resume();
        }
        /** Pauses the vnav panel. */
        pause() {
            this.vnavProfileStore.pause();
        }
        /** @inheritdoc */
        render() {
            return (msfssdk.FSComponent.buildComponent("div", { class: "current-vnav-profile-panel pane-inset-panel" },
                msfssdk.FSComponent.buildComponent("div", { class: "pane-inset-panel-title" }, "Current VNAV Profile"),
                msfssdk.FSComponent.buildComponent("div", { class: "sub-title" }, "Active VNAV Waypoint"),
                msfssdk.FSComponent.buildComponent("div", { class: "waypoint-row" },
                    msfssdk.FSComponent.buildComponent("div", { class: "waypoint-name" },
                        msfssdk.FSComponent.buildComponent(LegNameDisplay, { ref: this.legNameDisplay, leg: this.vnavProfileStore.activeVnavWaypoint, nullText: "__________" })),
                    msfssdk.FSComponent.buildComponent(AltitudeConstraintDisplay, { ref: this.altDisplay, altDesc: this.vnavProfileStore.altDesc, altitude1: this.vnavProfileStore.altitude1, altitude2: this.vnavProfileStore.altitude2, displayAltitude1AsFlightLevel: this.vnavProfileStore.displayAltitude1AsFlightLevel, displayAltitude2AsFlightLevel: this.vnavProfileStore.displayAltitude2AsFlightLevel, isEdited: this.vnavProfileStore.isAltitudeEdited })),
                msfssdk.FSComponent.buildComponent("div", { class: "data-rows" },
                    msfssdk.FSComponent.buildComponent("div", { class: "row tod-bod" },
                        msfssdk.FSComponent.buildComponent("div", { class: "label" }, this.vnavProfileStore.timeToLabelExtended),
                        msfssdk.FSComponent.buildComponent(msfssdk.DurationDisplay, {
                            ref: this.durationDisplay, class: "data", value: this.vnavProfileStore.timeToValue, options: {
                                pad: 2,
                                format: msfssdk.DurationDisplayFormat.hh_mm_or_mm_ss,
                                delim: msfssdk.DurationDisplayDelim.ColonOrCross,
                                nanString: '__:__',
                            }
                        })),
                    msfssdk.FSComponent.buildComponent("div", { class: "row fpa" },
                        msfssdk.FSComponent.buildComponent("div", { class: "label" }, "FPA"),
                        msfssdk.FSComponent.buildComponent("div", { class: "data" },
                            msfssdk.FSComponent.buildComponent(FpaDisplay, { ref: this.fpaDisplay, fpa: this.vnavProfileStore.fpa, showClimb: this.vnavProfileStore.fpaShowClimb, formatter: FPA_FORMATTER }))),
                    msfssdk.FSComponent.buildComponent("div", { class: "row tgt" },
                        msfssdk.FSComponent.buildComponent("div", { class: "label" }, "VS TGT"),
                        msfssdk.FSComponent.buildComponent(garminsdk.NumberUnitDisplay, { ref: this.tgtDisplay, class: "data", displayUnit: this.unitsSettingManager.verticalSpeedUnits, formatter: VERTICAL_SPEED_FORMATTER, value: this.vnavProfileStore.verticalSpeedTarget })),
                    msfssdk.FSComponent.buildComponent("div", { class: "row req" },
                        msfssdk.FSComponent.buildComponent("div", { class: "label" }, "VS REQ"),
                        msfssdk.FSComponent.buildComponent(garminsdk.NumberUnitDisplay, { ref: this.vsReqDisplay, class: "data", displayUnit: this.unitsSettingManager.verticalSpeedUnits, formatter: VERTICAL_SPEED_FORMATTER, value: this.vnavProfileStore.verticalSpeedRequired })),
                    msfssdk.FSComponent.buildComponent("div", { class: "row dev" },
                        msfssdk.FSComponent.buildComponent("div", { class: "label" }, "V DEV"),
                        msfssdk.FSComponent.buildComponent(garminsdk.NumberUnitDisplay, { ref: this.vdevDisplay, class: "data", displayUnit: this.unitsSettingManager.distanceUnitsSmall, formatter: ALTITUDE_FORMATTER, value: this.vnavProfileStore.verticalDeviation })))));
        }
        /** Destroys subs and comps. */
        destroy() {
            var _a, _b, _c, _d, _e, _f, _g;
            (_a = this.legNameDisplay.getOrDefault()) === null || _a === void 0 ? void 0 : _a.destroy();
            (_b = this.altDisplay.getOrDefault()) === null || _b === void 0 ? void 0 : _b.destroy();
            (_c = this.durationDisplay.getOrDefault()) === null || _c === void 0 ? void 0 : _c.destroy();
            (_d = this.fpaDisplay.getOrDefault()) === null || _d === void 0 ? void 0 : _d.destroy();
            (_e = this.tgtDisplay.getOrDefault()) === null || _e === void 0 ? void 0 : _e.destroy();
            (_f = this.vsReqDisplay.getOrDefault()) === null || _f === void 0 ? void 0 : _f.destroy();
            (_g = this.vdevDisplay.getOrDefault()) === null || _g === void 0 ? void 0 : _g.destroy();
            this.vnavProfileStore.destroy();
        }
    }

    /**
     * Utility methods for the G3000 FMS.
     */
    class G3000FmsUtils {
        /**
         * Gets the sorting order of two runways.
         * @param a The first runway to sort.
         * @param b The second runway to sort.
         * @returns A negative number if runway `a` comes before runway `b`, a positive number if runway `a` comes after
         * runway `b`, or zero if both orderings are equivalent.
         */
        static sortRunway(a, b) {
            const primaryNumberA = parseInt(a.designation.split('-')[0]);
            const primaryNumberB = parseInt(b.designation.split('-')[0]);
            if (primaryNumberA < primaryNumberB) {
                return -1;
            }
            else if (primaryNumberA > primaryNumberB) {
                return 1;
            }
            return G3000FmsUtils.RUNWAY_DESIGNATOR_PRIORITIES[a.designatorCharPrimary] - G3000FmsUtils.RUNWAY_DESIGNATOR_PRIORITIES[b.designatorCharPrimary];
        }
        /**
         * Gets the sorting order of two one-way runways.
         * @param a The first runway to sort.
         * @param b The second runway to sort.
         * @returns A negative number if runway `a` comes before runway `b`, a positive number if runway `a` comes after
         * runway `b`, or zero if both orderings are equivalent.
         */
        static sortOneWayRunway(a, b) {
            if (a.direction < b.direction) {
                return -1;
            }
            else if (a.direction > b.direction) {
                return 1;
            }
            return G3000FmsUtils.RUNWAY_DESIGNATOR_PRIORITIES[a.runwayDesignator] - G3000FmsUtils.RUNWAY_DESIGNATOR_PRIORITIES[b.runwayDesignator];
        }
        /**
         * Gets the sorting order of two departures.
         * @param a The first departure to sort.
         * @param b The second departure to sort.
         * @returns A negative number if departure `a` comes before departure `b`, a positive number if departure `a` comes
         * after departure `b`, or zero if both orderings are equivalent.
         */
        static sortDeparture(a, b) {
            return a.name.localeCompare(b.name);
        }
        /**
         * Gets the sorting order of two arrivals.
         * @param a The first arrival to sort.
         * @param b The second arrival to sort.
         * @returns A negative number if arrival `a` comes before arrival `b`, a positive number if arrival `a` comes after
         * arrival `b`, or zero if both orderings are equivalent.
         */
        static sortArrival(a, b) {
            return a.name.localeCompare(b.name);
        }
        /**
         * Gets the sorting order of two approaches.
         * @param a The first approach to sort.
         * @param b The second approach to sort.
         * @returns A negative number if approach `a` comes before approach `b`, a positive number if approach `a` comes
         * after approach `b`, or zero if both orderings are equivalent.
         */
        static sortApproach(a, b) {
            // sort first by approach type (ILS, LOC, RNAV, etc)
            let compare = G3000FmsUtils.APPROACH_TYPE_PRIORITIES[a.approachType] - G3000FmsUtils.APPROACH_TYPE_PRIORITIES[b.approachType];
            if (compare === 0) {
                // then sort by runway (circling approaches go last)
                compare = (a.runwayNumber === 0 ? 37 : a.runwayNumber) - (b.runwayNumber === 0 ? 37 : b.runwayNumber);
                if (compare === 0) {
                    // then sort by L, C, R
                    compare = G3000FmsUtils.RUNWAY_DESIGNATOR_PRIORITIES[a.runwayDesignator] - G3000FmsUtils.RUNWAY_DESIGNATOR_PRIORITIES[b.runwayDesignator];
                    if (compare === 0) {
                        // finally sort by approach suffix
                        compare = a.approachSuffix.localeCompare(b.approachSuffix);
                    }
                }
            }
            return compare;
        }
        /**
         * Gets the sorting order of two approach items.
         * @param a The first approach item to sort.
         * @param b The second approach item to sort.
         * @returns A negative number if approach item `a` comes before approach item `b`, a positive number if approach
         * item `a` comes after approach item `b`, or zero if both orderings are equivalent.
         */
        static sortApproachItem(a, b) {
            return G3000FmsUtils.sortApproach(a.approach, b.approach);
        }
    }
    G3000FmsUtils.RUNWAY_DESIGNATOR_PRIORITIES = {
        [RunwayDesignator.RUNWAY_DESIGNATOR_NONE]: 0,
        [RunwayDesignator.RUNWAY_DESIGNATOR_CENTER]: 1,
        [RunwayDesignator.RUNWAY_DESIGNATOR_LEFT]: 2,
        [RunwayDesignator.RUNWAY_DESIGNATOR_RIGHT]: 3,
        [RunwayDesignator.RUNWAY_DESIGNATOR_WATER]: 4,
        [RunwayDesignator.RUNWAY_DESIGNATOR_B]: 5,
        [RunwayDesignator.RUNWAY_DESIGNATOR_A]: 6,
    };
    G3000FmsUtils.APPROACH_TYPE_PRIORITIES = {
        [ApproachType.APPROACH_TYPE_ILS]: 0,
        [ApproachType.APPROACH_TYPE_LOCALIZER]: 1,
        [ApproachType.APPROACH_TYPE_LOCALIZER_BACK_COURSE]: 2,
        [ApproachType.APPROACH_TYPE_LDA]: 3,
        [ApproachType.APPROACH_TYPE_SDF]: 4,
        [ApproachType.APPROACH_TYPE_RNAV]: 5,
        [ApproachType.APPROACH_TYPE_GPS]: 6,
        [ApproachType.APPROACH_TYPE_VORDME]: 7,
        [ApproachType.APPROACH_TYPE_VOR]: 8,
        [ApproachType.APPROACH_TYPE_NDBDME]: 9,
        [ApproachType.APPROACH_TYPE_NDB]: 10,
        [msfssdk.AdditionalApproachType.APPROACH_TYPE_VISUAL]: 11,
        [ApproachType.APPROACH_TYPE_UNKNOWN]: 12
    };

    /* eslint-disable @typescript-eslint/no-non-null-assertion */
    const airwayRegex = new RegExp(/\..*/);
    /**
     * Represents a flight plan leg in a list.
     * Wraps a {@link FlightPlanLegData} object.
     * Contains fields specific to flight plan lists.
     */
    class FlightPlanLegListData {
        /**
         * FlightPlanLegListData constructor.
         * @param legData The flight plan leg data to wrap.
         * @param segmentListData The segment list data that this leg belong's to. Not required for random direct to leg.
         * @param store The flight plan store this belongs to.
         * @param unitsSettingManager The units setting manager.
         */
        constructor(legData, segmentListData, store, unitsSettingManager) {
            var _a, _b;
            this.legData = legData;
            this.segmentListData = segmentListData;
            this.store = store;
            this.unitsSettingManager = unitsSettingManager;
            /** @inheritdoc */
            this.type = 'leg';
            this._isVisible = msfssdk.Subject.create(true);
            /** @inheritdoc */
            this.isVisible = this._isVisible;
            /** Whether this leg is the first visible leg in a segment. */
            this.isFirstVisibleLegInSegment = msfssdk.Subject.create(false);
            /** Whether there are hidden airway legs before this one, should only apply to last leg in collapsed airway. */
            this.hasHiddenAirwayLegsBefore = msfssdk.Subject.create(false);
            /** Airway exit text. */
            this.airwayExitText = msfssdk.MappedSubject.create(([hasHiddenLegsBefore, airway]) => {
                if (!hasHiddenLegsBefore || airway === undefined) {
                    return '';
                }
                return `${this.legData.leg.name} exit Airway ${airway.replace(airwayRegex, '')}`;
            }, this.hasHiddenAirwayLegsBefore, (_b = (_a = this.legData.segmentData) === null || _a === void 0 ? void 0 : _a.airway) !== null && _b !== void 0 ? _b : msfssdk.Subject.create(undefined));
            this._isFullyCollapsedAirwayExit = this.segmentListData
                ? msfssdk.MappedSubject.create(([isInAirwaySegment, isInCollapsedAirway, segmentIndex, isLastLegInSegment, activeLegSegmentIndex]) => {
                    return isInAirwaySegment && isInCollapsedAirway && isLastLegInSegment && activeLegSegmentIndex !== segmentIndex;
                }, this.legData.isInAirwaySegment, this.segmentListData.isCollapsed, this.segmentListData.segmentData.segmentIndex, this.legData.isLastLegInSegment, this.store.activeLegSegmentIndex)
                : msfssdk.Subject.create(false);
            this.isFullyCollapsedAirwayExit = this._isFullyCollapsedAirwayExit;
            /** The leg DTK for displaying in certain places like the flight plan page.
             * Changes when this is the active leg and stuff like that. */
            this.displayDtk = msfssdk.BasicNavAngleSubject.create(msfssdk.BasicNavAngleUnit.create(true).createNumber(NaN));
            this.displayDtkSubs = [];
            /** The leg distance, but meant for display in a list. Can change when active leg, and more.
             * Shows segment distance for collapsed airway exit. */
            this.displayDistance = msfssdk.NumberUnitSubject.create(msfssdk.UnitType.METER.createNumber(NaN));
            this.displayDistanceSubs = [];
            /** Estimated time Enroute of the leg, in seconds duration. How long it will take to fly the leg.
             * Shows the segment ETE for collapsed airway exit. */
            this.displayEte = msfssdk.NumberUnitSubject.create(msfssdk.UnitType.SECOND.createNumber(NaN));
            this.eteSubs = [];
            this.subs = [];
            this.updateDistanceSubs = () => {
                const { legData } = this;
                this.displayDistanceSubs.forEach(sub => sub.destroy());
                const isActiveLeg = legData.isActiveLeg.get();
                const isBehindActiveLeg = legData.isBehindActiveLeg.get();
                const shouldShowSegmentDistance = this.isFullyCollapsedAirwayExit.get();
                if (isBehindActiveLeg) {
                    this.displayDistance.set(NaN);
                }
                else if (legData.isHoldLeg) {
                    this.displayDistance.set(NaN);
                }
                else if (isActiveLeg) {
                    this.displayDistanceSubs.push(this.store.activeLegDistance.pipe(this.displayDistance));
                }
                else if (shouldShowSegmentDistance) {
                    this.displayDistanceSubs.push(legData.segmentData.distance.pipe(this.displayDistance));
                }
                else {
                    this.displayDistanceSubs.push(legData.distance.pipe(this.displayDistance));
                }
            };
            this.updateEteSubs = () => {
                const { legData } = this;
                this.eteSubs.forEach(sub => sub.destroy());
                const shouldShowSegmentDistance = this.isFullyCollapsedAirwayExit.get();
                if (shouldShowSegmentDistance) {
                    this.eteSubs.push(legData.segmentData.estimatedTimeEnroute.pipe(this.displayEte));
                }
                else {
                    this.eteSubs.push(legData.estimatedTimeEnroute.pipe(this.displayEte));
                }
            };
            if (this.segmentListData) {
                this.subs.push(this.segmentListData.isCollapsed.sub(() => this.updateVisibility()));
            }
            this.subs.push(this.legData.isActiveLeg.sub(() => this.updateVisibility()));
            this.subs.push(this.store.fromLeg.sub(() => this.updateVisibility()));
            this.subs.push(this.store.activeLeg.sub(() => this.updateVisibility()));
            this.subs.push(this.legData.globalLegIndex.sub(() => this.updateVisibility()));
            this.subs.push(this.store.activeLegGlobalIndex.sub(() => this.updateVisibility()));
            this.subs.push(this.legData.isLastLegInSegment.sub(() => this.updateVisibility()));
            this.updateVisibility();
            this.isFullyCollapsedAirwayExit.sub(this.updateDisplayDtkSubs.bind(this));
            this.subs.push(this.unitsSettingManager.navAngleUnits.sub(this.updateDisplayDtkSubs.bind(this)));
            this.subs.push(legData.isActiveLeg.sub(this.updateDisplayDtkSubs.bind(this)));
            this.subs.push(legData.isBehindActiveLeg.sub(this.updateDisplayDtkSubs.bind(this)));
            this.updateDisplayDtkSubs();
            this.isFullyCollapsedAirwayExit.sub(this.updateDistanceSubs);
            this.subs.push(legData.isActiveLeg.sub(this.updateDistanceSubs));
            this.subs.push(legData.isBehindActiveLeg.sub(this.updateDistanceSubs));
            this.updateDistanceSubs();
            this.isFullyCollapsedAirwayExit.sub(this.updateEteSubs);
            this.updateEteSubs();
        }
        /** Updates the leg's visibility. */
        updateVisibility() {
            this._isVisible.set(this.getVisibility());
        }
        /**
         * Updates the leg's visibility.
         * @returns Whether the leg should be visible or not. */
        getVisibility() {
            var _a;
            // If this is false, the leg should never be visible
            if (this.legData.isVisibleLegType === false) {
                return false;
            }
            if (!this.segmentListData) {
                return true;
            }
            const isInCollapsedAirway = this.segmentListData.isCollapsed.get();
            if (isInCollapsedAirway) {
                const isActiveLeg = this.legData.isActiveLeg.get();
                const isFromLeg = this.store.fromLeg.get() === this.legData.leg;
                const activeLeg = this.store.activeLeg.get();
                const isActiveLegInSameAirway = activeLeg && this.legData.segment.legs.includes(activeLeg);
                const isLegAfterActiveLeg = isActiveLegInSameAirway && this.legData.globalLegIndex.get() === (((_a = this.store.activeLegGlobalIndex.get()) !== null && _a !== void 0 ? _a : -1) + 1);
                const isLastLegInAirway = this.legData.isLastLegInSegment.get();
                return isActiveLeg || isFromLeg || isLegAfterActiveLeg || isLastLegInAirway;
            }
            return true;
        }
        /** Updates the data source for the display dtk. */
        updateDisplayDtkSubs() {
            const { legData } = this;
            this.displayDtkSubs.forEach(sub => sub.destroy());
            const isActiveLeg = legData.isActiveLeg.get();
            const isBehindActiveLeg = legData.isBehindActiveLeg.get();
            const shouldInhibitDtk = this.isFullyCollapsedAirwayExit.get();
            const navAngleUnits = this.unitsSettingManager.navAngleUnits.get();
            if (isBehindActiveLeg) {
                this.displayDtk.set(NaN);
            }
            else if (legData.isHeadingLeg) {
                this.displayDtk.set(NaN);
            }
            else if (isActiveLeg) {
                if (navAngleUnits.isMagnetic()) {
                    this.displayDtkSubs.push(this.store.activeLegDtkMag.sub(x => this.displayDtk.set(x.number, legData.initialDtk.get().unit.magVar), true));
                    this.displayDtkSubs.push(legData.initialDtk.sub(x => this.displayDtk.set(this.displayDtk.get().number, x.unit.magVar), true));
                }
                else {
                    this.displayDtkSubs.push(this.store.activeLegDtkTrue.sub(x => this.displayDtk.set(x), true));
                }
            }
            else if (shouldInhibitDtk) {
                this.displayDtk.set(NaN);
            }
            else {
                this.displayDtkSubs.push(legData.initialDtk.pipe(this.displayDtk));
            }
        }
        /** Call when this leg is removed from the list. */
        destroy() {
            this.subs.forEach(x => x.destroy());
            this.displayDtkSubs.forEach(sub => sub.destroy());
            this.displayDistanceSubs.forEach(sub => sub.destroy());
            this.eteSubs.forEach(sub => sub.destroy());
            if ('destroy' in this._isFullyCollapsedAirwayExit) {
                this._isFullyCollapsedAirwayExit.destroy();
            }
        }
    }
    /**
     * Represents a flight plan leg data object.
     * It stores lots of useful info about the leg in handy dandy subscribables.
     */
    class FlightPlanLegData {
        /**
         * Creates a new leg data object.
         * @param leg The leg definition.
         * @param segment The containing segment.
         * @param segmentData The containing segment data. Not needed for random direct to.
         * @param planIndex The index of the flight plan that this leg belongs to.
         * @param isAdvancedVnav Whether this is for advanced vnav.
         * @param store The flight plan store.
         * @param plan The flight plan that this leg exists in.
         * @param globalLegIndex The global leg index.
         * @param isDirectToRandom Whether this leg is for a direct to random.
         */
        constructor(leg, segment, segmentData, planIndex, isAdvancedVnav, store, plan, globalLegIndex, isDirectToRandom = false) {
            var _a, _b;
            this.leg = leg;
            this.segment = segment;
            this.segmentData = segmentData;
            this.planIndex = planIndex;
            this.isAdvancedVnav = isAdvancedVnav;
            this.store = store;
            this.plan = plan;
            this.isDirectToRandom = isDirectToRandom;
            /** @inheritdoc */
            this.type = 'leg';
            /** Whether this leg's flags and leg type allow for the leg to be visible. */
            this.isVisibleLegType = this.isDirectToRandom
                ? true
                : msfssdk.BitFlags.isAny(this.leg.flags, msfssdk.LegDefinitionFlags.VectorsToFinal | msfssdk.LegDefinitionFlags.DirectTo)
                    ? false
                    : msfssdk.FlightPlanUtils.isDiscontinuityLeg(this.leg.leg.type)
                        ? false
                        : true;
            /** The global index of this leg. */
            this.globalLegIndex = msfssdk.Subject.create(-1);
            /** The index of this leg in its segment. */
            this.segmentLegIndex = msfssdk.Subject.create(-1);
            /** Whether this leg is the first leg in its segment. */
            this.isFirstLegInSegment = this.segmentLegIndex.map(x => x === 0);
            this._isLastLegInSegment = msfssdk.Subject.create(false);
            /** Whether this leg is the first leg in its segment. */
            this.isLastLegInSegment = this._isLastLegInSegment;
            /** Whether this leg is in the departure segment. */
            this.isInDepartureSegment = this.segment.segmentType === msfssdk.FlightPlanSegmentType.Departure;
            /** Whether this leg is in the approach segment. */
            this.isInApproachSegment = this.segment.segmentType === msfssdk.FlightPlanSegmentType.Approach;
            /** Whether this leg is in the missed approach. */
            this.isInMissedApproach = msfssdk.BitFlags.isAll(this.leg.flags, msfssdk.LegDefinitionFlags.MissedApproach);
            /** Whether this leg is a runway. */
            this.isRunway = msfssdk.ICAO.isFacility(this.leg.leg.fixIcao, msfssdk.FacilityType.RWY);
            /** Whether this leg is a runway in the approach segment. */
            this.isApproachRunwayLeg = this.isInApproachSegment && this.isRunway;
            /** Whether this leg is in an airway segment. */
            this.isInAirwaySegment = (_b = (_a = this.segmentData) === null || _a === void 0 ? void 0 : _a.isAirway) !== null && _b !== void 0 ? _b : msfssdk.Subject.create(false);
            /** Whether this is currently the first leg in the plan. */
            this.isFirstLegInPlan = msfssdk.Subject.create(false);
            /** Whether this is the active leg in the flight plan. */
            this.isActiveLeg = msfssdk.Subject.create(false);
            /** Whether this leg is before the active leg. */
            this.isBehindActiveLeg = msfssdk.Subject.create(false);
            /** Whether this is a direct to leg. */
            this.isDtoLeg = this.store.directToExistingLeg.map(x => x === this.leg);
            // Leg type info
            this.isHoldLeg = msfssdk.FlightPlanUtils.isHoldLeg(this.leg.leg.type);
            this.isHeadingLeg = msfssdk.FlightPlanUtils.isHeadingToLeg(this.leg.leg.type);
            // Altitude constraint
            /** The altitude restriction type to use for the altitude constraint. */
            this.altDesc = msfssdk.Subject.create(msfssdk.AltitudeRestrictionType.Unused);
            /** The altitude 1 to use for the altitude constraint. */
            this.altitude1 = msfssdk.NumberUnitSubject.create(msfssdk.UnitType.METER.createNumber(NaN));
            /** The altitude 2 to use for the altitude constraint. */
            this.altitude2 = msfssdk.NumberUnitSubject.create(msfssdk.UnitType.METER.createNumber(NaN));
            /** Whether the altitude 1 should be displayed as a flight level. */
            this.displayAltitude1AsFlightLevel = msfssdk.Subject.create(false);
            /** Whether the altitude 2 should be displayed as a flight level. */
            this.displayAltitude2AsFlightLevel = msfssdk.Subject.create(false);
            /** Whether the altitude constraint is designated or not. */
            this.isAltitudeDesignated = msfssdk.Subject.create(false);
            /** Whether this leg's altitude constraint is different from the published constraint. */
            this.isAltitudeEdited = msfssdk.Subject.create(false);
            /** Whether this leg's altitude constraint is invalid or not. */
            this.isAltitudeInvalid = msfssdk.Subject.create(false);
            /** Whether this leg's altitude constraint is editable. */
            this.isAltitudeEditable = msfssdk.Subject.create(false);
            /** Whether this leg's altitude constraint is visible. */
            this.isAltitudeVisible = msfssdk.Subject.create(false);
            /** The altitude 1 to use for the altitude constraint, but for display in a list. */
            this.altitude1Display = msfssdk.NumberUnitSubject.create(msfssdk.UnitType.METER.createNumber(NaN));
            /** The altitude 2 to use for the altitude constraint, but for display in a list. */
            this.altitude2Display = msfssdk.NumberUnitSubject.create(msfssdk.UnitType.METER.createNumber(NaN));
            /** Whether this leg's altitude should be display in cyan or not. */
            this.isAltitudeCyan = msfssdk.MappedSubject.create(([isDesignated, altitude1, isBehindActiveLeg, isAltitudeEditable]) => {
                if (isBehindActiveLeg) {
                    return true;
                }
                if (altitude1.isNaN()) {
                    return true;
                }
                if (isDesignated === true && isAltitudeEditable === true) {
                    return true;
                }
                return false;
            }, this.isAltitudeDesignated, this.altitude1, this.isBehindActiveLeg, this.isAltitudeEditable);
            /** The alt desc, but for display in a list. */
            this.altDescDisplay = msfssdk.MappedSubject.create(([isAltitudeDesignated, altDesc, isBehindActiveLeg]) => {
                if (isBehindActiveLeg) {
                    return msfssdk.AltitudeRestrictionType.Unused;
                }
                else if (this.isAdvancedVnav) {
                    return altDesc;
                }
                else {
                    return isAltitudeDesignated ? msfssdk.AltitudeRestrictionType.Unused : altDesc;
                }
            }, this.isAltitudeDesignated, this.altDesc, this.isBehindActiveLeg);
            /** Whether the altitude is edited, but for display in a list. */
            this.isAltitudeEditedDisplay = msfssdk.MappedSubject.create(([isAltitudeEdited, isBehindActiveLeg]) => {
                if (isBehindActiveLeg) {
                    return false;
                }
                else {
                    return isAltitudeEdited;
                }
            }, this.isAltitudeEdited, this.isBehindActiveLeg);
            /** Whether the altitude is invalid, but for display in a list. */
            this.isAltitudeInvalidDisplay = msfssdk.MappedSubject.create(([isAltitudeInvalid, isBehindActiveLeg]) => {
                if (isBehindActiveLeg) {
                    return false;
                }
                else {
                    return isAltitudeInvalid;
                }
            }, this.isAltitudeInvalid, this.isBehindActiveLeg);
            /** Whether to display altitude 1 as a flight level, but for display in a list. */
            this.displayAltitude1AsFlightLevelDisplay = msfssdk.MappedSubject.create(([displayAltitude1AsFlightLevel, isBehindActiveLeg]) => {
                if (isBehindActiveLeg) {
                    return false;
                }
                else {
                    return displayAltitude1AsFlightLevel;
                }
            }, this.displayAltitude1AsFlightLevel, this.isBehindActiveLeg);
            /** Whether to display altitude 2 as a flight level, but for display in a list. */
            this.displayAltitude2AsFlightLevelDisplay = msfssdk.MappedSubject.create(([displayAltitude2AsFlightLevel, isBehindActiveLeg]) => {
                if (isBehindActiveLeg) {
                    return false;
                }
                else {
                    return displayAltitude2AsFlightLevel;
                }
            }, this.displayAltitude2AsFlightLevel, this.isBehindActiveLeg);
            /** Whether the altitude is editable, but for display in a list. */
            this.isEditableDisplay = msfssdk.MappedSubject.create(([isAltitudeConstraintEditable, isBehindActiveLeg]) => {
                if (isBehindActiveLeg) {
                    return false;
                }
                else {
                    return isAltitudeConstraintEditable;
                }
            }, this.isAltitudeEditable, this.isBehindActiveLeg);
            // Speed constraint
            /** This leg's speed constraint speed. */
            this.speed = msfssdk.Subject.create(NaN, msfssdk.SubscribableUtils.NUMERIC_NAN_EQUALITY);
            /** This leg's speed constraint units. */
            this.speedUnit = msfssdk.Subject.create(msfssdk.SpeedUnit.IAS);
            /** This leg's speed constraint type. */
            this.speedDesc = msfssdk.Subject.create(msfssdk.SpeedRestrictionType.Unused);
            /** Whether this leg's speed constraint is different from the published speed. */
            this.isSpeedEdited = msfssdk.Subject.create(false);
            /** Whether this leg's speed constraint is invalid or not. */
            this.isSpeedInvalid = msfssdk.Subject.create(false);
            // Flight path angle
            /**
             * This leg's flight path angle, in degrees, or `NaN` if there is no defined flight path angle. Positive values
             * indicate a descending path.
             */
            this.fpa = msfssdk.Subject.create(NaN, msfssdk.SubscribableUtils.NUMERIC_NAN_EQUALITY);
            /** Whether this leg's fpa has been set by the user. */
            this.isFpaEdited = msfssdk.Subject.create(false);
            /** Whether this leg's fpa and speed constraint are editable. */
            this.isFpaSpeedEditable = msfssdk.Subject.create(this.isApproachRunwayLeg === false);
            // Other
            /** The vertical flight phase. */
            this.vnavPhase = msfssdk.Subject.create(msfssdk.VerticalFlightPhase.Descent);
            /** Whether to show CLIMB for the fpa. */
            this.showClimbFpa = msfssdk.MappedSubject.create(([phase, isAltitudeDesignated, isAltitudeEditable]) => {
                return phase === msfssdk.VerticalFlightPhase.Climb && isAltitudeDesignated && isAltitudeEditable;
            }, this.vnavPhase, this.isAltitudeDesignated, this.isAltitudeEditable);
            /** The initial DTK of the leg. Magnetic. */
            this.initialDtk = msfssdk.BasicNavAngleSubject.create(msfssdk.BasicNavAngleUnit.create(true).createNumber(NaN));
            /** The leg course, rounded, and with 0 as 360. */
            this.courseRounded = Math.round(this.leg.leg.course) === 0 ? 360 : Math.round(this.leg.leg.course);
            /** The leg's total distance, not cut short by ingress/egress turn radii. Changes when active leg. */
            this.distance = msfssdk.NumberUnitSubject.create(msfssdk.UnitType.METER.createNumber(NaN));
            /** The cumulative distance up to the end of this leg. */
            this.distanceCumulative = msfssdk.NumberUnitSubject.create(msfssdk.UnitType.METER.createNumber(NaN));
            /** The estimated fuel remaining at the end of the leg. */
            this.fuelRemaining = msfssdk.NumberUnitSubject.create(msfssdk.UnitType.GALLON_FUEL.createNumber(NaN));
            /** Estimated time Enroute of the leg, in seconds duration. How long it will take to fly the leg. */
            this.estimatedTimeEnroute = msfssdk.NumberUnitSubject.create(msfssdk.UnitType.SECOND.createNumber(NaN));
            /** Cumulative ETE. How long it would take from the current position to the end of this leg. */
            this.estimatedTimeEnrouteCumulative = msfssdk.NumberUnitSubject.create(msfssdk.UnitType.SECOND.createNumber(NaN));
            /** Estimated Time of Arrival of the leg, in UTC milliseconds from midnight. */
            this.estimatedTimeOfArrival = msfssdk.Subject.create(NaN);
            this.subs = [];
            /** Updates the altitude display subjects. */
            this.updateAltitudes = () => {
                if (this.isBehindActiveLeg.get()) {
                    this.altitude1Display.set(NaN);
                    this.altitude2Display.set(NaN);
                }
                else {
                    this.altitude1Display.set(this.altitude1.get());
                    this.altitude2Display.set(this.altitude2.get());
                }
            };
            this.subs.push(this.isDtoLeg.sub(() => this.updateAltitudeVisibility()));
            this.updateLegPosition(globalLegIndex);
            this.handleLegChanged(this.leg);
            this.subs.push(this.isBehindActiveLeg.sub(this.updateAltitudes));
            this.subs.push(this.altitude1.sub(this.updateAltitudes));
            this.subs.push(this.altitude2.sub(this.updateAltitudes, true));
        }
        /**
         * Update leg based on it's global leg index.
         * We avoid storing indexes to avoid stale indexes.
         * @param globalLegIndex The global leg index of the leg.
         */
        updateLegPosition(globalLegIndex) {
            this.globalLegIndex.set(globalLegIndex);
            this.segmentLegIndex.set(this.segment.legs.indexOf(this.leg));
            this.isFirstLegInPlan.set(globalLegIndex === 0);
            this.updateAltitudeVisibility(globalLegIndex);
            this._isLastLegInSegment.set(this.segmentLegIndex.get() === this.segment.legs.length - 1);
        }
        /**
         * Updates the altitude visibility and editability.
         * @param globalLegIndex The global leg index of the leg.
         */
        updateAltitudeVisibility(globalLegIndex) {
            globalLegIndex !== null && globalLegIndex !== void 0 ? globalLegIndex : (globalLegIndex = this.plan.getLegIndexFromLeg(this.leg));
            if (globalLegIndex < 0) {
                return;
            }
            this.isAltitudeEditable.set(garminsdk.FmsUtils.isAltitudeEditable(this.plan, this.leg, this.isAdvancedVnav));
            this.isAltitudeVisible.set(garminsdk.FmsUtils.isAltitudeVisible(this.plan, this.leg, this.isAdvancedVnav, this.isAltitudeEditable.get()));
        }
        /**
         * Handles the leg changed event. Effectively when the vertical data object on the leg was modified.
         * @param leg The leg definition.
         */
        handleLegChanged(leg) {
            var _a;
            this.vnavPhase.set(leg.verticalData.phase);
            // Altitude constraint
            this.updateLegListDataAltitudeStuffFromVerticalData();
            // Speed constraint
            const publishedSpeedUnit = msfssdk.SpeedUnit.IAS;
            const publishedSpeed = leg.leg.speedRestriction <= 0 ? NaN : leg.leg.speedRestriction;
            const publishedSpeedDesc = garminsdk.FmsUtils.getPublishedSpeedDescBasedOnSegment(publishedSpeed, this.segment.segmentType);
            const isSpeedEdited = leg.verticalData.speedUnit !== publishedSpeedUnit
                || leg.verticalData.speedDesc !== publishedSpeedDesc
                || (leg.verticalData.speed !== publishedSpeed && !isNaN(leg.verticalData.speed) && !isNaN(publishedSpeed));
            this.speedDesc.set(leg.verticalData.speedDesc);
            this.speed.set(leg.verticalData.speed <= 0 ? NaN : leg.verticalData.speed);
            this.speedUnit.set(leg.verticalData.speedUnit);
            this.isSpeedEdited.set(leg.verticalData.speedDesc !== msfssdk.SpeedRestrictionType.Unused && isSpeedEdited);
            // FPA
            this.fpa.set((_a = leg.verticalData.fpa) !== null && _a !== void 0 ? _a : NaN);
            this.isFpaEdited.set(leg.verticalData.fpa !== undefined);
        }
        /**
         * Updates a leg list data item's altitude info from the leg's vertical data object.
         */
        updateLegListDataAltitudeStuffFromVerticalData() {
            const leg = this.leg;
            // Altitude constraint
            const isDesignatedAltitudeConstraint = leg.verticalData.altDesc !== msfssdk.AltitudeRestrictionType.Unused;
            const hasPublishedConstraint = leg.leg.altDesc !== msfssdk.AltitudeRestrictionType.Unused;
            this.isAltitudeDesignated.set(isDesignatedAltitudeConstraint);
            if (isDesignatedAltitudeConstraint) {
                this.altDesc.set(leg.verticalData.altDesc);
                this.altitude1.set(leg.verticalData.altitude1, msfssdk.UnitType.METER);
                this.altitude2.set(leg.verticalData.altitude2, msfssdk.UnitType.METER);
                this.displayAltitude1AsFlightLevel.set(leg.verticalData.displayAltitude1AsFlightLevel);
                this.displayAltitude2AsFlightLevel.set(leg.verticalData.displayAltitude2AsFlightLevel);
                this.isAltitudeEdited.set(this.isAltitudeConstraintEdited());
            }
            else if (hasPublishedConstraint) {
                if (this.isAdvancedVnav || leg.leg.altDesc !== msfssdk.AltitudeRestrictionType.Between) {
                    this.altDesc.set(leg.leg.altDesc);
                    this.altitude1.set(leg.leg.altitude1, msfssdk.UnitType.METER);
                    this.altitude2.set(leg.leg.altitude2, msfssdk.UnitType.METER);
                    this.displayAltitude1AsFlightLevel.set(garminsdk.FmsUtils.displayAltitudeAsFlightLevel(leg.leg.altitude1));
                    this.displayAltitude2AsFlightLevel.set(garminsdk.FmsUtils.displayAltitudeAsFlightLevel(leg.leg.altitude2));
                    this.isAltitudeEdited.set(false);
                }
                else {
                    // In simple mode, we only use altitude2 from a published between constraint
                    this.altDesc.set(msfssdk.AltitudeRestrictionType.AtOrAbove);
                    this.altitude1.set(leg.leg.altitude2, msfssdk.UnitType.METER);
                    this.altitude2.set(NaN, msfssdk.UnitType.METER);
                    this.displayAltitude1AsFlightLevel.set(garminsdk.FmsUtils.displayAltitudeAsFlightLevel(leg.leg.altitude2));
                    this.displayAltitude2AsFlightLevel.set(false);
                    this.isAltitudeEdited.set(false);
                }
            }
            else {
                this.altDesc.set(msfssdk.AltitudeRestrictionType.Unused);
                this.altitude1.set(NaN, msfssdk.UnitType.METER);
                this.altitude2.set(NaN, msfssdk.UnitType.METER);
                this.displayAltitude1AsFlightLevel.set(false);
                this.displayAltitude2AsFlightLevel.set(false);
                this.isAltitudeEdited.set(false);
            }
        }
        /**
         * Determines if the altitude constraint should be considered edited.
         * @returns Whether the constraint should be considered edited.
         */
        isAltitudeConstraintEdited() {
            const leg = this.leg;
            const publishedAltDesc = leg.leg.altDesc;
            const constraintAltDesc = leg.verticalData.altDesc;
            const altitude1Feet = Math.round(msfssdk.UnitType.METER.convertTo(leg.verticalData.altitude1, msfssdk.UnitType.FOOT));
            const altitude2Feet = Math.round(msfssdk.UnitType.METER.convertTo(leg.verticalData.altitude2, msfssdk.UnitType.FOOT));
            const altitude1FeetPublished = Math.round(msfssdk.UnitType.METER.convertTo(leg.leg.altitude1, msfssdk.UnitType.FOOT));
            const altitude2FeetPublished = Math.round(msfssdk.UnitType.METER.convertTo(leg.leg.altitude2, msfssdk.UnitType.FOOT));
            if (this.isAdvancedVnav) {
                return constraintAltDesc !== publishedAltDesc
                    || altitude1Feet !== altitude1FeetPublished
                    || altitude2Feet !== altitude2FeetPublished;
            }
            else {
                if (publishedAltDesc === msfssdk.AltitudeRestrictionType.Between) {
                    // In simple mode, we only use altitude2 from a published between constraint
                    return altitude1Feet !== altitude2FeetPublished;
                }
                else {
                    return altitude1Feet !== altitude1FeetPublished;
                }
            }
        }
        /** Call when this leg is removed from the plan. */
        destroy() {
            this.isDtoLeg.destroy();
            this.isFirstLegInSegment.destroy();
            this.subs.forEach(x => x.destroy());
        }
    }

    /**
     * Represents a flight plan segment in a list.
     * Wraps a {@link FlightPlanSegmentData} object.
     * Contains fields specific to flight plan lists.
     */
    class FlightPlanSegmentListData {
        /**
         * Creates a new segment list data object.
         * @param segmentData The flight plan segment data to wrap.
         * @param store The flight plan store this belongs to.
         * @param listManager The list manager that this belongs to.
         */
        constructor(segmentData, store, listManager) {
            this.segmentData = segmentData;
            this.store = store;
            this.listManager = listManager;
            /** @inheritdoc */
            this.type = 'segment';
            /** @inheritdoc */
            this.isVisible = msfssdk.Subject.create(true);
            /** Whether the segment is collapsed. */
            this.isCollapsed = msfssdk.MappedSubject.create(([isAirway, collapsedSegments]) => {
                return isAirway && collapsedSegments.has(this.segmentData.segment);
            }, this.segmentData.isAirway, this.listManager.collapsedAirwaySegments);
            this.airwayText = msfssdk.MappedSubject.create(([airway, isCollapsed]) => {
                const collapsedText = isCollapsed ? ' (collapsed)' : '';
                return msfssdk.StringUtils.useZeroSlash(`Airway – ${airway}${collapsedText}`);
            }, this.segmentData.airway, this.isCollapsed);
            this.subs = [];
        }
        /** Call when this segment is rmoved from the plan. */
        destroy() {
            // TODO Destroy inner segment data?
            this.isCollapsed.destroy();
            this.airwayText.destroy();
            this.subs.forEach(x => x.destroy());
        }
    }
    /**
     * Represents a flight plan segment data object.
     * It stores lots of useful info about the segment in handy dandy subscribables.
     */
    class FlightPlanSegmentData {
        /**
         * Creates a new leg list data object.
         * @param segment The containing segment.
         * @param planIndex The index of the flight plan that this leg belongs to.
         * @param store The flight plan store.
         * @param plan The flight plan that this leg exists in.
         */
        constructor(
            /** A reference to the segment in the flight plan. */
            segment, planIndex, store, plan) {
            this.segment = segment;
            this.planIndex = planIndex;
            this.store = store;
            this.plan = plan;
            /** @inheritdoc */
            this.type = 'segment';
            this._airway = msfssdk.Subject.create(undefined);
            /** The airway name of the segment, or `undefined` if the segment is not an airway. */
            this.airway = this._airway;
            /** Whether the segment is an airway. */
            this.isAirway = this._airway.map(airway => airway !== undefined);
            /** The total distance of all legs in the segment. */
            this.distance = msfssdk.NumberUnitSubject.create(msfssdk.UnitType.METER.createNumber(NaN));
            /** The total estimated time enroute of all legs in the segment. */
            this.estimatedTimeEnroute = msfssdk.NumberUnitSubject.create(msfssdk.UnitType.SECOND.createNumber(NaN));
            this.subs = [];
            this._airway.set(segment.airway);
            this._segmentIndex = msfssdk.Subject.create(segment.segmentIndex);
            this.segmentIndex = this._segmentIndex;
        }
        /**
         * Sets the new segment index.
         * @param segmentIndex The new segment index.
         */
        updateSegmentIndex(segmentIndex) {
            this._segmentIndex.set(segmentIndex);
        }
        /**
         * Handles the airway changing.
         * @param airway The new airway.
         */
        onAirwayChanged(airway) {
            this._airway.set(airway);
        }
        /** Call when this leg is rmoved from the plan. */
        destroy() {
            this.subs.forEach(x => x.destroy());
        }
    }

    /* eslint-disable max-len */
    const UNUSABLE_FUEL_QUANTITY_GALLONS = SimVar.GetSimVarValue('UNUSABLE FUEL TOTAL QUANTITY', msfssdk.SimVarValueType.GAL);
    /** Listens for flight plan events, and stores data as subjects to be used by the gtc flight plan page. */
    class FlightPlanStore {
        /**
         * Creates a new FlightPlanStore.
         * @param bus The EventBus.
         * @param fms The Fms.
         * @param planIndex Which flight plan index to listen to.
         * @param isAdvancedVnav Whether to use advanced VNAV or not.
         */
        constructor(bus, fms, planIndex, isAdvancedVnav) {
            this.bus = bus;
            this.fms = fms;
            this.planIndex = planIndex;
            this.isAdvancedVnav = isAdvancedVnav;
            // public readonly flightPlanListManager: FlightPlanListManager;
            this._segmentMap = new Map();
            /** Unordered map of FlightPlanSegments to segment list data items.
             * Segments are added/removed to/from this map to match the flight plan. */
            this.segmentMap = this._segmentMap;
            this._legMap = new Map();
            /** Unordered map of leg definitions to leg list data items.
             * Legs are added/removed to/from this map to match the flight plan. */
            this.legMap = this._legMap;
            this.unitsSettingManager = garminsdk.UnitsUserSettings.getManager(this.bus);
            this._activePlanIndex = msfssdk.Subject.create(undefined);
            this.activePlanIndex = this._activePlanIndex;
            this._flightPlanName = msfssdk.Subject.create(undefined);
            this.flightPlanName = this._flightPlanName;
            // Events
            this._flightPlanLegsChanged = new msfssdk.SubEvent();
            /** An event which fires when legs are added to or removed from this store's flight plan. */
            this.flightPlanLegsChanged = this._flightPlanLegsChanged;
            // Origin
            this._originIdent = msfssdk.Subject.create(undefined);
            this.originIdent = this._originIdent;
            this._originFacility = msfssdk.Subject.create(undefined);
            this.originFacility = this._originFacility;
            this._originRunway = msfssdk.Subject.create(undefined);
            this.originRunway = this._originRunway;
            this.originRunwayName = this._originRunway.map(x => x === null || x === void 0 ? void 0 : x.designation);
            // Departure
            this._departureProcedure = msfssdk.Subject.create(undefined);
            this.departureProcedure = this._departureProcedure;
            this._departureTransition = msfssdk.Subject.create(undefined);
            this.departureTransition = this._departureTransition;
            this.departureTransitionName = this._departureTransition.map(x => x === null || x === void 0 ? void 0 : x.name);
            this._departureTransitionIndex = msfssdk.Subject.create(-1);
            this.departureTransitionIndex = this._departureTransitionIndex;
            this._departureRunwayTransitionIndex = msfssdk.Subject.create(-1);
            this.departureRunwayTransitionIndex = this._departureRunwayTransitionIndex;
            this.departureString = msfssdk.MappedSubject.create(([origin, departure, transitionIndex, runway]) => {
                if (origin && departure) {
                    return msfssdk.StringUtils.useZeroSlash(garminsdk.FmsUtils.getDepartureNameAsString(origin, departure, transitionIndex, runway));
                }
                else {
                    return '';
                }
            }, this._originFacility, this._departureProcedure, this._departureTransitionIndex, this._originRunway);
            this.departureText1 = msfssdk.MappedSubject.create(([originIdent, departure, originRunwayName]) => {
                if (originIdent === undefined) {
                    return '';
                }
                else if (originRunwayName === undefined) {
                    return msfssdk.StringUtils.useZeroSlash(`Origin – ${originIdent}`);
                }
                else if (departure === undefined) {
                    return msfssdk.StringUtils.useZeroSlash(`Origin – ${originIdent} – RW${originRunwayName}`);
                }
                else {
                    return 'Departure –';
                }
            }, this._originIdent, this._departureProcedure, this.originRunwayName);
            this.departureText2 = msfssdk.MappedSubject.create(([originIdent, departure, originRunwayName, departureString]) => {
                if (originIdent === undefined) {
                    return '';
                }
                else if (originRunwayName === undefined) {
                    return '';
                }
                else if (departure === undefined) {
                    return '';
                }
                else {
                    return departureString !== null && departureString !== void 0 ? departureString : '';
                }
            }, this._originIdent, this._departureProcedure, this.originRunwayName, this.departureString);
            this.departureTextOneLine = msfssdk.MappedSubject.create(([departureText1, departureText2]) => {
                return `${departureText1} ${departureText2}`.trim();
            }, this.departureText1, this.departureText2);
            this._departureSegmentData = msfssdk.Subject.create(undefined);
            this.departureSegmentData = this._departureSegmentData;
            // Destination
            this._destinationIdent = msfssdk.Subject.create(undefined);
            this.destinationIdent = this._destinationIdent;
            this._destinationFacility = msfssdk.Subject.create(undefined);
            this.destinationFacility = this._destinationFacility;
            this._destinationRunway = msfssdk.Subject.create(undefined);
            this.destinationRunway = this._destinationRunway;
            this.destinationRunwayName = this._destinationRunway.map(x => x === null || x === void 0 ? void 0 : x.designation);
            this.destinationString = msfssdk.MappedSubject.create(([destination, runway]) => {
                if (!destination) {
                    return '';
                }
                else if (!runway) {
                    return msfssdk.StringUtils.useZeroSlash(`Destination – ${destination}`);
                }
                else {
                    return msfssdk.StringUtils.useZeroSlash(`Destination – ${destination} – RW${runway}`);
                }
            }, this.destinationIdent, this.destinationRunwayName);
            // Arrival
            this._arrivalIndex = msfssdk.Subject.create(-1);
            this.arrivalIndex = this._arrivalIndex;
            this._arrivalProcedure = msfssdk.Subject.create(undefined);
            this.arrivalProcedure = this._arrivalProcedure;
            this._arrivalTransition = msfssdk.Subject.create(undefined);
            this.arrivalTransition = this._arrivalTransition;
            this._arrivalTransitionIndex = msfssdk.Subject.create(-1);
            this.arrivalTransitionIndex = this._arrivalTransitionIndex;
            this._arrivalRunwayTransition = msfssdk.Subject.create(undefined);
            this.arrivalRunwayTransition = this._arrivalRunwayTransition;
            this._arrivalRunway = msfssdk.Subject.create(undefined);
            this.arrivalRunway = this._arrivalRunway;
            this._arrivalFacilityIcao = msfssdk.Subject.create(undefined);
            this.arrivalFacilityIcao = this._arrivalFacilityIcao;
            this._arrivalFacility = msfssdk.Subject.create(undefined);
            this.arrivalFacility = this._arrivalFacility;
            this._arrivalRunwayTransitionIndex = msfssdk.Subject.create(-1);
            this.arrivalRunwayTransitionIndex = this._arrivalRunwayTransitionIndex;
            this.arrivalString = msfssdk.MappedSubject.create(([arrivalFacility, arrival, transitionIndex, arrivalRunway]) => {
                if (arrivalFacility && arrival) {
                    return msfssdk.StringUtils.useZeroSlash(garminsdk.FmsUtils.getArrivalNameAsString(arrivalFacility, arrival, transitionIndex, arrivalRunway));
                }
                else {
                    return '';
                }
            }, this.arrivalFacility, this._arrivalProcedure, this._arrivalTransitionIndex, this.arrivalRunway);
            this.arrivalStringFull = this.arrivalString.map(x => `Arrival – ${x}`);
            this._arrivalSegmentData = msfssdk.Subject.create(undefined);
            this.arrivalSegmentData = this._arrivalSegmentData;
            // Approach
            this._visualApproachOneWayRunwayDesignation = msfssdk.Subject.create(undefined);
            this.visualApproachOneWayRunwayDesignation = this._visualApproachOneWayRunwayDesignation;
            this._skipCourseReversal = msfssdk.Subject.create(undefined);
            this.skipCourseReversal = this._skipCourseReversal;
            this._isApproachLoaded = msfssdk.Subject.create(false);
            this.isApproachLoaded = this._isApproachLoaded;
            this._approachProcedure = msfssdk.Subject.create(undefined);
            this.approachProcedure = this._approachProcedure;
            this._approachForDisplay = msfssdk.MappedSubject.create(([destination, visual, approach]) => {
                if (approach) {
                    return approach;
                }
                if (destination && visual) {
                    return garminsdk.FmsUtils.getApproachFromPlan(this.fms.getFlightPlan(this.planIndex), destination);
                }
            }, this.destinationFacility, this.visualApproachOneWayRunwayDesignation, this.approachProcedure);
            this.approachForDisplay = this._approachForDisplay;
            this._approachIndex = msfssdk.Subject.create(-1);
            this.approachIndex = this._approachIndex;
            this.approachName = this._approachProcedure.map(x => x === null || x === void 0 ? void 0 : x.name);
            this._approachTransition = msfssdk.Subject.create(undefined);
            this.approachTransition = this._approachTransition;
            this._approachTransitionIndex = msfssdk.Subject.create(-1);
            this.approachTransitionIndex = this._approachTransitionIndex;
            this.approachStringPrefix = this.approachTransitionIndex.map(index => {
                return index === -1
                    ? 'VTF Apr – '
                    : 'Approach – ';
            });
            this._approachSegmentData = msfssdk.Subject.create(undefined);
            this.approachSegmentData = this._approachSegmentData;
            // Other
            this._isThereAtLeastOneLeg = msfssdk.Subject.create(false);
            this.isThereAtLeastOneLeg = this._isThereAtLeastOneLeg;
            // TODO Needs to sync between the other pages on this GTC
            this.addEnrouteWaypointButtonIsVisible = msfssdk.Subject.create(true);
            // Active leg data
            this._activeLegGlobalIndex = msfssdk.Subject.create(undefined);
            this.activeLegGlobalIndex = this._activeLegGlobalIndex;
            this._activeLegDtkMag = msfssdk.BasicNavAngleSubject.create(msfssdk.BasicNavAngleUnit.create(true).createNumber(NaN));
            this.activeLegDtkMag = this._activeLegDtkMag;
            this._activeLegDtkTrue = msfssdk.BasicNavAngleSubject.create(msfssdk.BasicNavAngleUnit.create(false).createNumber(NaN));
            this.activeLegDtkTrue = this._activeLegDtkTrue;
            this._activeLegDistance = msfssdk.NumberUnitSubject.create(msfssdk.UnitType.NMILE.createNumber(NaN));
            this.activeLegDistance = this._activeLegDistance;
            this._activeLeg = msfssdk.Subject.create(undefined);
            this.activeLeg = this._activeLeg;
            this._activeLegListData = msfssdk.Subject.create(undefined);
            this.activeLegListData = this._activeLegListData;
            this._activeLegSegmentIndex = msfssdk.Subject.create(undefined);
            this.activeLegSegmentIndex = this._activeLegSegmentIndex;
            // Direct to
            this._directToData = msfssdk.Subject.create({ segmentIndex: -1, segmentLegIndex: -1 });
            this.directToData = this._directToData;
            this.directToState = msfssdk.MappedSubject.create(() => this.fms.getDirectToState(), this.activePlanIndex, this.directToData, this.activeLeg);
            this.isDirectToRandomActive = this.directToState.map(x => x === garminsdk.DirectToState.TORANDOM);
            this.isDirectToExistingActive = this.directToState.map(x => x === garminsdk.DirectToState.TOEXISTING);
            this._directToRandomLegData = msfssdk.Subject.create(undefined);
            this.directToRandomLegData = this._directToRandomLegData;
            this.directToRandomLegListData = this.directToRandomLegData.map(x => x === undefined ? undefined : new FlightPlanLegListData(x, undefined, this, this.unitsSettingManager));
            this._directToRandomHoldLegData = msfssdk.Subject.create(undefined);
            this.directToRandomHoldLegData = this._directToRandomHoldLegData;
            this.directToRandomHoldLegListData = this.directToRandomHoldLegData.map(x => x === undefined ? undefined : new FlightPlanLegListData(x, undefined, this, this.unitsSettingManager));
            this.directToExistingLeg = msfssdk.MappedSubject.create(([directToData, directToState]) => {
                if (directToState !== garminsdk.DirectToState.TOEXISTING || directToData.segmentIndex === -1 || directToData.segmentLegIndex === -1) {
                    return undefined;
                }
                const plan = this.fms.getFlightPlan(this.planIndex);
                return plan.tryGetLeg(directToData.segmentIndex, directToData.segmentLegIndex);
            }, this.directToData, this.directToState);
            this.isDirectToRandomActiveWithHold = msfssdk.MappedSubject.create(([isDirectToRandomActive, directToRandomLegListData, directToRandomHoldLegListData]) => {
                if (isDirectToRandomActive && directToRandomLegListData) {
                    if (directToRandomHoldLegListData) {
                        return 'with-hold';
                    }
                    else {
                        return 'no-hold';
                    }
                }
                return false;
            }, this.isDirectToRandomActive, this.directToRandomLegListData, this.directToRandomHoldLegListData);
            this._isDirectToRandomHoldLegActive = msfssdk.Subject.create(false);
            this.isDirectToRandomHoldLegActive = this._isDirectToRandomHoldLegActive;
            // From leg
            this._fromLeg = msfssdk.Subject.create(undefined);
            this.fromLeg = this._fromLeg;
            this.fromLegSegment = this.fromLeg.map(fromLeg => {
                if (fromLeg === undefined) {
                    return undefined;
                }
                const plan = this.fms.getFlightPlan(this.planIndex);
                return plan.getSegmentFromLeg(fromLeg);
            });
            // To leg
            this.toLeg = msfssdk.MappedSubject.create(([activeLeg, directToExistingLeg, isDirectToRandomActive]) => {
                if (isDirectToRandomActive) {
                    return undefined;
                }
                const toLeg = directToExistingLeg !== null && directToExistingLeg !== void 0 ? directToExistingLeg : activeLeg;
                if (!toLeg) {
                    return undefined;
                }
                const plan = this.fms.getFlightPlan(this.planIndex);
                const indexes = garminsdk.FmsUtils.getLegIndexes(plan, toLeg);
                if (!indexes) {
                    return undefined;
                }
                const segment = plan.getSegment(indexes.segmentIndex);
                return this.legMap.get(segment.legs[indexes.segmentLegIndex]);
            }, this.activeLeg, this.directToExistingLeg, this.isDirectToRandomActive);
            this.toLegSegment = this.toLeg.map(toLeg => toLeg === null || toLeg === void 0 ? void 0 : toLeg.segment);
            // Predictions
            this.fuelTotalGal = msfssdk.ConsumerSubject.create(this.bus.getSubscriber().on('fuel_usable_total'), 0);
            this.fuelFlowTotalGph = msfssdk.ConsumerSubject.create(this.bus.getSubscriber().on('fuel_flow_total'), 0);
            this.groundSpeedKnots = msfssdk.ConsumerSubject.create(this.bus.getSubscriber().on('ground_speed'), 0);
            this.unixSimTime = msfssdk.ConsumerSubject.create(this.bus.getSubscriber().on('simTime'), 0);
            // Events
            this.beforeFlightPlanLoaded = new msfssdk.SubEvent();
            this.segmentAdded = new msfssdk.SubEvent();
            this.segmentInserted = new msfssdk.SubEvent();
            this.segmentRemoved = new msfssdk.SubEvent();
            this.segmentChanged = new msfssdk.SubEvent();
            this.legAdded = new msfssdk.SubEvent();
            this.legRemoved = new msfssdk.SubEvent();
            this.currentAltitude = 0;
            this.selectedAltitude = 0;
            this.isInitialized = false;
            /**
             * Handles the fplUserDataSet event.
             * @param event The FlightPlanUserDataEvent.
             */
            this.handleUserDataSet = (event) => {
                if (event.planIndex !== this.planIndex) {
                    return;
                }
                if (event.key === 'name') {
                    this._flightPlanName.set(event.data);
                }
                if (event.key === 'visual_approach') {
                    this._visualApproachOneWayRunwayDesignation.set(event.data);
                }
                if (event.key === 'skipCourseReversal') {
                    this._skipCourseReversal.set(event.data);
                }
            };
            /**
             * Handles the fplUserDataDelete event.
             * @param event The FlightPlanUserDataEvent.
             */
            this.handleUserDataDelete = (event) => {
                if (event.planIndex !== this.planIndex) {
                    return;
                }
                if (event.key === 'name') {
                    this._flightPlanName.set(undefined);
                }
                if (event.key === 'visual_approach') {
                    this._visualApproachOneWayRunwayDesignation.set(undefined);
                }
                if (event.key === 'skipCourseReversal') {
                    this._skipCourseReversal.set(undefined);
                }
            };
            this.handleOriginDestChanged = async (event) => {
                if (event.planIndex !== this.planIndex) {
                    return;
                }
                switch (event.type) {
                    case msfssdk.OriginDestChangeType.OriginAdded: {
                        this._originIdent.set(msfssdk.ICAO.getIdent(event.airport));
                        const fac = await this.fms.facLoader.getFacility(msfssdk.FacilityType.Airport, event.airport);
                        this._originFacility.set(fac);
                        break;
                    }
                    case msfssdk.OriginDestChangeType.OriginRemoved:
                        this._originIdent.set(undefined);
                        this._originFacility.set(undefined);
                        break;
                    case msfssdk.OriginDestChangeType.DestinationAdded: {
                        this._destinationIdent.set(msfssdk.ICAO.getIdent(event.airport));
                        const fac = await this.fms.facLoader.getFacility(msfssdk.FacilityType.Airport, event.airport);
                        this._destinationFacility.set(fac);
                        break;
                    }
                    case msfssdk.OriginDestChangeType.DestinationRemoved:
                        this._destinationIdent.set(undefined);
                        this._destinationFacility.set(undefined);
                        break;
                }
            };
            this.handleProcDetailsChanged = (event) => {
                if (!event) {
                    event = this.lastProcDetailsEvent;
                }
                if (!event) {
                    return;
                }
                if (event.planIndex !== this.planIndex) {
                    return;
                }
                this.lastProcDetailsEvent = event;
                const plan = this.fms.flightPlanner.getFlightPlan(event.planIndex);
                this._originRunway.set(event.details.originRunway);
                const originFac = this.originFacility.get();
                const departureProcedure = originFac === null || originFac === void 0 ? void 0 : originFac.departures[event.details.departureIndex];
                this._departureProcedure.set(departureProcedure);
                this._departureTransitionIndex.set(event.details.departureTransitionIndex);
                this._departureTransition.set(departureProcedure === null || departureProcedure === void 0 ? void 0 : departureProcedure.enRouteTransitions[event.details.departureTransitionIndex]);
                this._departureRunwayTransitionIndex.set(event.details.departureRunwayIndex);
                this._destinationRunway.set(event.details.destinationRunway);
                this._arrivalIndex.set(event.details.arrivalIndex);
                this._arrivalTransitionIndex.set(event.details.arrivalTransitionIndex);
                this._arrivalRunwayTransitionIndex.set(event.details.arrivalRunwayTransitionIndex);
                this._arrivalRunway.set(event.details.arrivalRunway);
                this._arrivalFacilityIcao.set(event.details.arrivalFacilityIcao);
                if (event.details.arrivalFacilityIcao) {
                    this.fms.facLoader.getFacility(msfssdk.FacilityType.Airport, event.details.arrivalFacilityIcao)
                        .then(arrivalFacility => {
                            this._arrivalFacility.set(arrivalFacility);
                            const arrivalProcedure = arrivalFacility === null || arrivalFacility === void 0 ? void 0 : arrivalFacility.arrivals[this._arrivalIndex.get()];
                            this._arrivalProcedure.set(arrivalProcedure);
                            this._arrivalTransition.set(arrivalProcedure === null || arrivalProcedure === void 0 ? void 0 : arrivalProcedure.enRouteTransitions[this._arrivalTransitionIndex.get()]);
                            this._arrivalRunwayTransition.set(arrivalProcedure === null || arrivalProcedure === void 0 ? void 0 : arrivalProcedure.runwayTransitions[this._arrivalRunwayTransitionIndex.get()]);
                        });
                }
                else {
                    this._arrivalFacility.set(undefined);
                    this._arrivalProcedure.set(undefined);
                    this._arrivalTransition.set(undefined);
                    this._arrivalRunwayTransition.set(undefined);
                }
                const destinationFac = this.destinationFacility.get();
                let approachProcedure = undefined;
                if (destinationFac && destinationFac.icao === event.details.approachFacilityIcao) {
                    if (event.details.approachIndex >= 0) {
                        approachProcedure = destinationFac.approaches[event.details.approachIndex];
                    }
                    else if (event.details.destinationRunway) {
                        approachProcedure = garminsdk.FmsUtils.buildEmptyVisualApproach(event.details.destinationRunway);
                    }
                }
                this._approachProcedure.set(approachProcedure);
                this._approachIndex.set(event.details.approachIndex);
                this._approachTransition.set(approachProcedure === null || approachProcedure === void 0 ? void 0 : approachProcedure.transitions[this._approachTransitionIndex.get()]);
                this._approachTransitionIndex.set(event.details.approachTransitionIndex);
                this._isApproachLoaded.set(garminsdk.FmsUtils.isApproachLoaded(plan));
            };
            /**
             * Handles the segment event.
             * @param segEvent The segment event.
             * @param noUpdates When true, it will not call the extra update functions.
             * @throws Error when received an unexpected event.
             */
            this.handleSegmentChange = (segEvent, noUpdates = false) => {
                if (segEvent.planIndex !== this.planIndex) {
                    return;
                }
                switch (segEvent.type) {
                    case msfssdk.SegmentEventType.Added:
                        this.handleSegmentAdded(segEvent);
                        break;
                    case msfssdk.SegmentEventType.Inserted:
                        this.handleSegmentInserted(segEvent);
                        break;
                    case msfssdk.SegmentEventType.Removed:
                        this.handleSegmentRemoved(segEvent);
                        break;
                    case msfssdk.SegmentEventType.Changed:
                        this.handleSegmentChanged(segEvent);
                        break;
                }
                this.updateSegmentIndexes();
                if (noUpdates) {
                    return;
                }
                this.doUpdates();
            };
            /**
             * Handles the leg event.
             * @param legEvent The leg event.
             * @param noUpdates When true, it will not call the extra update functions.
             * @throws Error when received an unexpected event.
             */
            this.handleLegChange = (legEvent, noUpdates = false) => {
                if (legEvent.planIndex === garminsdk.Fms.DTO_RANDOM_PLAN_INDEX) {
                    this.handleDirectToRandomLegChange(legEvent);
                    return;
                }
                if (legEvent.planIndex !== this.planIndex) {
                    return;
                }
                switch (legEvent.type) {
                    case msfssdk.LegEventType.Added:
                        this.handleLegAdded(legEvent);
                        break;
                    case msfssdk.LegEventType.Removed:
                        this.handleLegRemoved(legEvent);
                        break;
                    case msfssdk.LegEventType.Changed:
                        this.handleLegChanged(legEvent);
                        break;
                }
                if (noUpdates) {
                    return;
                }
                this.doUpdates();
            };
            /**
             * Handles the active leg event.
             * @param activeLegEvent The event.
             */
            this.handleActiveLegChange = (activeLegEvent) => {
                var _a, _b;
                if (activeLegEvent.planIndex === garminsdk.Fms.DTO_RANDOM_PLAN_INDEX) {
                    this._isDirectToRandomHoldLegActive.set(activeLegEvent.legIndex === 3);
                    if (activeLegEvent.legIndex === 2) {
                        this.handleNewDirectToRandom();
                    }
                    else {
                        (_a = this.directToRandomLegData.get()) === null || _a === void 0 ? void 0 : _a.isActiveLeg.set(activeLegEvent.legIndex === 2);
                        (_b = this.directToRandomHoldLegData.get()) === null || _b === void 0 ? void 0 : _b.isActiveLeg.set(activeLegEvent.legIndex === 3);
                    }
                    return;
                }
                if (activeLegEvent.planIndex !== this.planIndex) {
                    return;
                }
                if (activeLegEvent.type !== msfssdk.ActiveLegType.Lateral) {
                    return;
                }
                // We can't use the segment and leg index because the can become out of date
                // TODO Fix active leg change event to send update if seg or leg index changes when global index doesn't
                this._activeLegGlobalIndex.set(activeLegEvent.legIndex < 0 ? undefined : activeLegEvent.index);
                this.updateFromLeg();
            };
            this.updateLegCount = () => {
                for (const leg of this.fms.getFlightPlan(this.planIndex).legs()) {
                    if (leg) {
                        this._isThereAtLeastOneLeg.set(true);
                        return;
                    }
                }
                this._isThereAtLeastOneLeg.set(false);
            };
            /**
             * Handles the flight plan calculated event.
             * @param event The event.
             */
            this.handleFlightPlanCalculated = (event) => {
                var _a, _b, _c, _d, _e, _f, _g;
                if (event.planIndex !== this.planIndex) {
                    return;
                }
                // TODO need to add up ETE as well
                let currentSegmentData;
                let segmentDistanceMeters = 0;
                const usableFuelGal = this.fuelTotalGal.get() - UNUSABLE_FUEL_QUANTITY_GALLONS;
                const fuelFlowTotalGph = this.fuelFlowTotalGph.get();
                // Standard minimum ground speed for predictions for Garmin
                const minimumPredictionsGroundSpeed = 30;
                const currentGsKnots = this.groundSpeedKnots.get() < minimumPredictionsGroundSpeed ? NaN : this.groundSpeedKnots.get();
                const unixSimTimeMs = this.unixSimTime.get();
                const unixSimTimeSeconds = msfssdk.UnitType.MILLISECOND.convertTo(unixSimTimeMs, msfssdk.UnitType.SECOND);
                const utcSeconds = unixSimTimeSeconds % (3600 * 24);
                const toLeg = this.toLeg.get();
                let fuelRemainingGal = usableFuelGal;
                let lastEtaUtcSeconds = utcSeconds;
                let foundActiveLeg = false;
                let cumulativeDistanceMeters = 0;
                let cumulativeTimeEnrouteSeconds = 0;
                // When handling the flight plan calculated event,
                // it's important to not iterate on the plan segments/legs,
                // but to instead keep track of leg reference and just grab from leg.calculated.
                // This is because in rare cases, when getting the calc event,
                // the plan might not match what legs we are tracking.
                for (const item of this.legItems()) {
                    if (item.segmentData !== currentSegmentData) {
                        if (currentSegmentData) {
                            currentSegmentData.distance.set(segmentDistanceMeters, msfssdk.UnitType.METER);
                            const segmentEte = msfssdk.FlightPlanPredictorUtils.predictTime(currentGsKnots, msfssdk.UnitType.METER.convertTo(segmentDistanceMeters, msfssdk.UnitType.NMILE));
                            currentSegmentData.estimatedTimeEnroute.set(segmentEte, msfssdk.UnitType.SECOND);
                            segmentDistanceMeters = 0;
                        }
                        currentSegmentData = item.segmentData;
                    }
                    const leg = item.leg;
                    const isActiveLeg = item === toLeg;
                    if (isActiveLeg) {
                        foundActiveLeg = true;
                    }
                    // Initial DTK
                    if (((_a = leg.calculated) === null || _a === void 0 ? void 0 : _a.startLat) !== undefined && ((_b = leg.calculated) === null || _b === void 0 ? void 0 : _b.startLon) !== undefined) {
                        item.initialDtk.set((_c = leg.calculated.initialDtk) !== null && _c !== void 0 ? _c : NaN, msfssdk.MagVar.get(leg.calculated.startLat, leg.calculated.startLon));
                    }
                    else {
                        item.initialDtk.set(NaN);
                    }
                    // Distance
                    // If behind active leg, set to NaN, which will cause ete, eta, and fuel to be NaN, which is what we want
                    const legDistanceMeters = isActiveLeg
                        ? this.activeLegDistance.get().asUnit(msfssdk.UnitType.METER)
                        : !foundActiveLeg
                            ? NaN
                            : (_e = (_d = leg.calculated) === null || _d === void 0 ? void 0 : _d.distance) !== null && _e !== void 0 ? _e : NaN;
                    const legDistanceNm = msfssdk.UnitType.METER.convertTo(legDistanceMeters, msfssdk.UnitType.NMILE);
                    item.distance.set(legDistanceMeters);
                    const cumulativeDistanceLegMeters = cumulativeDistanceMeters + legDistanceMeters;
                    if (!isNaN(legDistanceMeters)) {
                        cumulativeDistanceMeters += legDistanceMeters;
                    }
                    item.distanceCumulative.set(msfssdk.UnitType.METER.createNumber(cumulativeDistanceLegMeters));
                    // ETE
                    const estimatedTimeEnrouteSeconds = msfssdk.FlightPlanPredictorUtils.predictTime(currentGsKnots, legDistanceNm);
                    item.estimatedTimeEnroute.set(msfssdk.UnitType.SECOND.createNumber(estimatedTimeEnrouteSeconds));
                    const cumulativeTimeLegSeconds = cumulativeTimeEnrouteSeconds + estimatedTimeEnrouteSeconds;
                    if (!isNaN(estimatedTimeEnrouteSeconds)) {
                        cumulativeTimeEnrouteSeconds += estimatedTimeEnrouteSeconds;
                    }
                    item.estimatedTimeEnrouteCumulative.set(msfssdk.UnitType.SECOND.createNumber(cumulativeTimeLegSeconds));
                    // ETA
                    const timeToDistanceSeconds = msfssdk.FlightPlanPredictorUtils.predictTime(currentGsKnots, legDistanceNm);
                    const etaSeconds = lastEtaUtcSeconds + timeToDistanceSeconds;
                    if (!isNaN(etaSeconds)) {
                        lastEtaUtcSeconds = etaSeconds;
                    }
                    const estimatedTimeOfArrival = msfssdk.UnitType.SECOND.convertTo(etaSeconds, msfssdk.UnitType.MILLISECOND);
                    item.estimatedTimeOfArrival.set(estimatedTimeOfArrival);
                    // Fuel REM
                    const fuelUsedForLeg = fuelFlowTotalGph * (estimatedTimeEnrouteSeconds / 60 / 60);
                    const newFuelRemainingGal = fuelRemainingGal - fuelUsedForLeg;
                    if (!isNaN(newFuelRemainingGal)) {
                        fuelRemainingGal = newFuelRemainingGal;
                    }
                    item.fuelRemaining.set(msfssdk.UnitType.GALLON_FUEL.createNumber(newFuelRemainingGal));
                    segmentDistanceMeters += (_g = (_f = leg.calculated) === null || _f === void 0 ? void 0 : _f.distance) !== null && _g !== void 0 ? _g : 0;
                }
                // Set the segment distance for the last segment
                currentSegmentData === null || currentSegmentData === void 0 ? void 0 : currentSegmentData.distance.set(segmentDistanceMeters, msfssdk.UnitType.METER);
                const segmentEte = msfssdk.FlightPlanPredictorUtils.predictTime(currentGsKnots, msfssdk.UnitType.METER.convertTo(segmentDistanceMeters, msfssdk.UnitType.NMILE));
                currentSegmentData === null || currentSegmentData === void 0 ? void 0 : currentSegmentData.estimatedTimeEnroute.set(segmentEte, msfssdk.UnitType.SECOND);
            };
            /**
             * Handles the vnav path calculated event.
             * @param verticalPathCalculator VNavPathCalculator.
             * @param verticalPlanIndex The vertical plan index.
             */
            this.handleVnavPathCalculated = (verticalPathCalculator, verticalPlanIndex) => {
                if (verticalPlanIndex !== this.planIndex) {
                    return;
                }
                const lateralPlan = this.fms.getFlightPlan(this.planIndex);
                const verticalPlan = verticalPathCalculator.getVerticalFlightPlan(this.planIndex);
                const verticalSegments = msfssdk.VNavUtils.getVerticalSegmentsFromPlan(verticalPlan);
                let maxAltitudeMeters = msfssdk.UnitType.FOOT.convertTo(Math.max(this.getSelectedAltitude(), Math.round(this.getCurrentAltitude() / 100) * 100), msfssdk.UnitType.METER);
                let minAltitudeMeters = verticalPathCalculator.getFirstDescentConstraintAltitude(this.planIndex);
                for (const item of this.legItems()) {
                    const indexes = garminsdk.FmsUtils.getLegIndexes(lateralPlan, item.leg);
                    if (!indexes) {
                        return;
                    }
                    const vnavLeg = verticalSegments[indexes.segmentIndex].legs[indexes.segmentLegIndex];
                    if (item.leg === this.directToExistingLeg.get()) {
                        const hiddenDirectToVnavLeg = msfssdk.VNavUtils.getVerticalLegFromPlan(verticalPlan, lateralPlan.activeLateralLeg);
                        this.updateLegVnavData(item, vnavLeg, minAltitudeMeters, maxAltitudeMeters, hiddenDirectToVnavLeg);
                    }
                    else {
                        this.updateLegVnavData(item, vnavLeg, minAltitudeMeters, maxAltitudeMeters);
                    }
                    if (!vnavLeg.isAdvisory) {
                        maxAltitudeMeters = vnavLeg.altitude;
                        minAltitudeMeters = 0;
                    }
                }
            };
            /**
             * Handles the fplIndexChanged event.
             * @param event FlightPlanIndicationEvent.
             */
            this.handleFlightPlannerActiveIndexChanged = (event) => {
                this._activePlanIndex.set(event.planIndex);
                if (event.planIndex !== garminsdk.Fms.DTO_RANDOM_PLAN_INDEX) {
                    this.cleanDirectToRandomData();
                }
            };
            /** Handles a new direct to random being created. */
            this.handleNewDirectToRandom = () => {
                this.cleanDirectToRandomData();
                this._activeLegGlobalIndex.set(undefined);
                const plan = this.fms.getDirectToFlightPlan();
                const segment = plan.getSegment(0);
                const globalLegIndex = 2;
                const leg = segment.legs[globalLegIndex];
                const legData = new FlightPlanLegData(leg, segment, undefined, garminsdk.Fms.DTO_RANDOM_PLAN_INDEX, this.isAdvancedVnav, this, plan, globalLegIndex, true);
                legData.isActiveLeg.set(true);
                this._directToRandomLegData.set(legData);
            };
            /**
             * Handles the fplDirectToDataChanged event.
             * @param event FlightPlanDirectToDataEvent.
             */
            this.handleDirectToDataChanged = (event) => {
                if (event.planIndex !== this.planIndex) {
                    return;
                }
                this._directToData.set(Object.assign({}, event.directToData));
            };
        }
        /**
         * Tells the store to subscribe to the event bus.
         * @throws Error if already initialized.
         */
        init() {
            if (this.isInitialized) {
                throw new Error('flight plan store is already initialized.');
            }
            else {
                this.isInitialized = true;
            }
            const fpl = this.bus.getSubscriber();
            fpl.on('fplSegmentChange').handle(this.handleSegmentChange);
            fpl.on('fplLegChange').handle(this.handleLegChange);
            fpl.on('fplActiveLegChange').handle(this.handleActiveLegChange);
            fpl.on('fplOriginDestChanged').handle(this.handleOriginDestChanged);
            fpl.on('fplProcDetailsChanged').handle(this.handleProcDetailsChanged);
            fpl.on('fplLoaded').handle(e => {
                if (e.planIndex === this.planIndex) {
                    this.handleFlightPlanLoaded();
                }
            });
            fpl.on('fplCopied').handle(e => {
                if (e.targetPlanIndex === this.planIndex) {
                    this.handleFlightPlanLoaded();
                }
            });
            fpl.on('fplUserDataSet').handle(this.handleUserDataSet);
            fpl.on('fplUserDataDelete').handle(this.handleUserDataDelete);
            fpl.on('fplCalculated').handle(this.handleFlightPlanCalculated);
            fpl.on('fplIndexChanged').handle(this.handleFlightPlannerActiveIndexChanged);
            fpl.on('fplDirectToDataChanged').handle(this.handleDirectToDataChanged);
            this.fms.verticalPathCalculator.vnavCalculated.on(this.handleVnavPathCalculated);
            // We do this in case fplProcDetailsChanged is received before the facloader has returned our origin/dest facilities
            this._originFacility.sub(() => this.handleProcDetailsChanged());
            this._destinationFacility.sub(() => this.handleProcDetailsChanged());
            const lnav = this.bus.getSubscriber();
            lnav.on('lnavdata_dtk_mag').handle(x => this._activeLegDtkMag.set(x));
            lnav.on('lnavdata_dtk_true').handle(x => this._activeLegDtkTrue.set(x));
            lnav.on('lnavdata_waypoint_distance').handle(x => this._activeLegDistance.set(x));
            // We are using the same indicated_alt event that the vnav manager is using
            this.bus.getSubscriber().on('indicated_alt').atFrequency(1).handle(alt => this.currentAltitude = alt);
            this.bus.getSubscriber().on('ap_altitude_selected').withPrecision(0).handle(sAlt => this.selectedAltitude = sAlt);
            this.directToState.sub(() => this.updateFromLeg());
            this.activeLegGlobalIndex.sub(() => {
                this.updateActiveLeg();
                this.updateActiveLegListItems();
            });
            // this.flightPlanTextUpdateClock.handle(() => {
            //   this.flightPlanTextUpdater!.update();
            // });
        }
        /**
         * Gets the current altitude.
         * @returns The current altitude.
         */
        getCurrentAltitude() {
            return this.currentAltitude;
        }
        /**
         * Gets the selected altitude.
         * @returns The selected altitude.
         */
        getSelectedAltitude() {
            return this.selectedAltitude;
        }
        /**
         * Gets the leg list data items in forward order.
         * @param startIndex The global leg index of the leg with which to start. Defaults to 0.
         * @yields The leg list data items in forward order.
         */
        *legItems(startIndex) {
            const plan = this.fms.getFlightPlan(this.planIndex);
            const legs = plan.legs(false, startIndex);
            let next = legs.next();
            while (!next.done) {
                const legItem = this.legMap.get(next.value);
                if (legItem) {
                    yield legItem;
                }
                next = legs.next();
            }
        }
        /**
         * A callback fired when a new plan is loaded.
         */
        handleFlightPlanLoaded() {
            for (const [segment, segItem] of this.segmentMap) {
                this.removeSegmentData(segItem, segment.segmentIndex);
            }
            this._segmentMap.clear();
            for (const [, legData] of this.legMap) {
                this.removeLegData(legData);
            }
            this._legMap.clear();
            const plan = this.fms.flightPlanner.getFlightPlan(this.planIndex);
            this.beforeFlightPlanLoaded.notify(undefined, plan);
            this._flightPlanName.set(plan.getUserData('name'));
            if (plan.originAirport !== undefined) {
                this.handleOriginDestChanged({ planIndex: this.planIndex, airport: plan.originAirport, type: msfssdk.OriginDestChangeType.OriginAdded });
            }
            for (let i = 0; i < plan.segmentCount; i++) {
                const segment = plan.getSegment(i);
                this.handleSegmentChange({ planIndex: this.planIndex, segmentIndex: i, segment: segment, type: msfssdk.SegmentEventType.Added }, true);
                for (let l = 0; l < segment.legs.length; l++) {
                    this.handleLegChange({
                        planIndex: this.planIndex,
                        segmentIndex: i, legIndex: l, leg: segment.legs[l], type: msfssdk.LegEventType.Added,
                    }, true);
                }
            }
            this.doUpdates();
            this.handleProcDetailsChanged({ planIndex: this.planIndex, details: plan.procedureDetails });
            if (plan.destinationAirport !== undefined) {
                this.handleOriginDestChanged({ planIndex: this.planIndex, airport: plan.destinationAirport, type: msfssdk.OriginDestChangeType.DestinationAdded });
            }
            this.handleActiveLegChange({
                index: plan.activeLateralLeg,
                legIndex: plan.getSegmentLegIndex(plan.activeLateralLeg),
                planIndex: this.planIndex,
                previousLegIndex: -1,
                previousSegmentIndex: -1,
                segmentIndex: plan.getSegmentIndex(plan.activeLateralLeg),
                type: msfssdk.ActiveLegType.Lateral,
            });
        }
        /**
         * Handles the segment added event.
         * @param segEvent The segment event.
         * @throws Error when the segment being added already exists.
         */
        handleSegmentAdded(segEvent) {
            // In theory, added means append to end of flight plan
            // Is only used when intializing the flight plan, or recreating it after deleting it
            const segment = segEvent.segment;
            const newSegListItem = new FlightPlanSegmentData(segment, this.planIndex, this, this.fms.getFlightPlan(this.planIndex));
            this.handleNewSegment(newSegListItem);
            this._segmentMap.set(segment, newSegListItem);
            this.segmentAdded.notify(undefined, newSegListItem);
        }
        /**
         * Handles the segment inserted event.
         * @param segEvent The segment event.
         */
        handleSegmentInserted(segEvent) {
            const segment = segEvent.segment;
            const newSegListItem = new FlightPlanSegmentData(segment, this.planIndex, this, this.fms.getFlightPlan(this.planIndex));
            this.handleNewSegment(newSegListItem);
            this._segmentMap.set(segment, newSegListItem);
            this.segmentInserted.notify(undefined, newSegListItem);
        }
        /**
         * Handles the segment removed event.
         * @param segEvent The segment event.
         * @throws Error when the segment being removed does not exist.
         */
        handleSegmentRemoved(segEvent) {
            const segmentListItem = this.segmentMap.get(segEvent.segment);
            this.removeSegmentData(segmentListItem, segEvent.segmentIndex);
        }
        /**
         * Removes a segment data and destroys it.
         * @param segmentData The segment data.
         * @param segmentIndex The index of the segment begin removed.
         */
        removeSegmentData(segmentData, segmentIndex) {
            this._segmentMap.delete(segmentData.segment);
            this.segmentRemoved.notify(undefined, [segmentData, segmentIndex]);
            segmentData.destroy();
            switch (segmentData.segment.segmentType) {
                case msfssdk.FlightPlanSegmentType.Departure:
                    this._departureSegmentData.set(undefined);
                    break;
                case msfssdk.FlightPlanSegmentType.Arrival:
                    this._arrivalSegmentData.set(undefined);
                    break;
                case msfssdk.FlightPlanSegmentType.Approach:
                    this._approachSegmentData.set(undefined);
                    break;
            }
        }
        /**
         * Handles the segment changed event.
         * @param segEvent The segment event.
         * @throws Error when the segment being changed does not exist.
         */
        handleSegmentChanged(segEvent) {
            var _a;
            const segmentData = this.segmentMap.get(segEvent.segment);
            segmentData.onAirwayChanged((_a = segEvent.segment) === null || _a === void 0 ? void 0 : _a.airway);
            this.segmentChanged.notify(undefined, [segmentData, segEvent.segmentIndex]);
        }
        /**
         * Updates fields that track certain segment types.
         * @param newSegListData The new segment list data.
         */
        handleNewSegment(newSegListData) {
            switch (newSegListData.segment.segmentType) {
                case msfssdk.FlightPlanSegmentType.Departure:
                    this._departureSegmentData.set(newSegListData);
                    break;
                case msfssdk.FlightPlanSegmentType.Arrival:
                    this._arrivalSegmentData.set(newSegListData);
                    break;
                case msfssdk.FlightPlanSegmentType.Approach:
                    this._approachSegmentData.set(newSegListData);
                    break;
            }
        }
        /** Iterates through the segments and updates their segment indexes. */
        updateSegmentIndexes() {
            for (const [segment, segmentListData] of this.segmentMap) {
                segmentListData.updateSegmentIndex(segment.segmentIndex);
            }
        }
        /**
         * Handles the leg added event.
         * @param legEvent The leg event.
         */
        handleLegAdded(legEvent) {
            const { leg, segmentIndex, legIndex } = legEvent;
            const plan = this.fms.getFlightPlan(this.planIndex);
            const globalLegIndex = garminsdk.FmsUtils.getGlobalLegIndex(plan, segmentIndex, legIndex);
            const segment = plan.getSegment(segmentIndex);
            const segmentListData = this.segmentMap.get(segment);
            const newLegData = new FlightPlanLegData(leg, segment, segmentListData, this.planIndex, this.isAdvancedVnav, this, plan, globalLegIndex);
            this._legMap.set(leg, newLegData);
            this.legAdded.notify(undefined, [newLegData, segmentIndex, legIndex]);
        }
        /**
         * Handles the leg removed event.
         * @param legEvent The leg event.
         */
        handleLegRemoved(legEvent) {
            const legListItem = this.legMap.get(legEvent.leg);
            this.removeLegData(legListItem);
        }
        /**
         * Removes a leg data and destroys it.
         * @param legData The leg data.
         */
        removeLegData(legData) {
            this._legMap.delete(legData.leg);
            this.legRemoved.notify(undefined, legData);
            legData.destroy();
        }
        /**
         * Handles the leg changed event. Effectively when the vertical data object on the leg was modified.
         * @param legEvent The leg event.
         */
        handleLegChanged(legEvent) {
            const legListData = this.legMap.get(legEvent.leg);
            legListData.handleLegChanged(legEvent.leg);
        }
        /**
         * Handles a leg change in the direct to random plan.
         * @param legEvent The event.
         */
        handleDirectToRandomLegChange(legEvent) {
            var _a, _b;
            if (legEvent.type === msfssdk.LegEventType.Changed && legEvent.legIndex === 2) {
                const leg = legEvent.leg;
                const legData = this.directToRandomLegData.get();
                if (!legData) {
                    return;
                }
                // Altitude constraint
                legData.updateLegListDataAltitudeStuffFromVerticalData();
                // FPA
                // TODO Use vnav profile instead of hardcoding 3
                legData.fpa.set((_a = leg.verticalData.fpa) !== null && _a !== void 0 ? _a : 3);
                legData.isFpaEdited.set(leg.verticalData.fpa !== undefined);
                // Speed constraint
                legData.speedDesc.set(leg.verticalData.speedDesc);
                legData.speed.set(leg.verticalData.speed <= 0 ? NaN : leg.verticalData.speed);
                legData.speedUnit.set(leg.verticalData.speedUnit);
                legData.isSpeedEdited.set(leg.verticalData.speedDesc !== msfssdk.SpeedRestrictionType.Unused);
            }
            else if (legEvent.type === msfssdk.LegEventType.Added) {
                const isHoldLeg = legEvent.segmentIndex === 0 && legEvent.legIndex === 3 && msfssdk.FlightPlanUtils.isHoldLeg(legEvent.leg.leg.type);
                if (isHoldLeg) {
                    const holdLegGlobalIndex = 3;
                    const holdLeg = legEvent.leg;
                    const plan = this.fms.getDirectToFlightPlan();
                    const segment = plan.getSegment(0);
                    const holdLegData = new FlightPlanLegData(holdLeg, segment, undefined, garminsdk.Fms.DTO_RANDOM_PLAN_INDEX, this.isAdvancedVnav, this, plan, holdLegGlobalIndex, true);
                    holdLegData.isActiveLeg.set(false);
                    (_b = this._directToRandomHoldLegData.get()) === null || _b === void 0 ? void 0 : _b.destroy();
                    this._directToRandomHoldLegData.set(holdLegData);
                }
            }
        }
        /** Updates flight plan things when segments or legs change. */
        doUpdates() {
            this.updateActiveLeg();
            this.updateActiveLegListItems();
            this.updateLegs();
            this.updateLegCount();
            this.updateFromLeg();
            this._flightPlanLegsChanged.notify(undefined, this.fms.getFlightPlan(this.planIndex));
        }
        /** Updates the current from leg. */
        updateFromLeg() {
            const plan = this.fms.getFlightPlan(this.planIndex);
            const activeLegGlobalIndex = this.activeLegGlobalIndex.get();
            if (activeLegGlobalIndex === undefined || this.directToState.get() !== garminsdk.DirectToState.NONE) {
                this._fromLeg.set(undefined);
                return;
            }
            const fromLeg = garminsdk.FmsUtils.getFromLegForArrowDisplay(plan, activeLegGlobalIndex);
            // Only set it if we are tracking the leg in our legMap
            // If we don't have it, it's probably during a fpl loaded event and it will get added eventually
            if (fromLeg && this.legMap.has(fromLeg)) {
                this._fromLeg.set(fromLeg);
            }
            else {
                this._fromLeg.set(undefined);
            }
        }
        /**
         * Updates leg list item vnav related fields.
         * @param item The leg list item.
         * @param vnavLeg The vnav leg.
         * @param minAltitude The min altitude.
         * @param maxAltitude The max altitude.
         * @param directToVnavLeg The direct to vnav leg, if applicable.
         */
        updateLegVnavData(item, vnavLeg, minAltitude, maxAltitude, directToVnavLeg) {
            var _a, _b, _c;
            // Default advisory altitude to the vnav leg altitude
            let advisoryAltitude = (_a = directToVnavLeg === null || directToVnavLeg === void 0 ? void 0 : directToVnavLeg.altitude) !== null && _a !== void 0 ? _a : vnavLeg.altitude;
            const isAdvisory = (_b = directToVnavLeg === null || directToVnavLeg === void 0 ? void 0 : directToVnavLeg.isAdvisory) !== null && _b !== void 0 ? _b : vnavLeg.isAdvisory;
            // If advisory, applies the min and max altitudes
            if (advisoryAltitude !== 0 && isAdvisory && advisoryAltitude > maxAltitude) {
                advisoryAltitude = minAltitude !== undefined ? Math.max(minAltitude, maxAltitude) : maxAltitude;
            }
            // Advisory altitude
            if (!item.isAltitudeDesignated.get() && isAdvisory && advisoryAltitude > 0 && item.vnavPhase.get() === msfssdk.VerticalFlightPhase.Descent) {
                item.altDesc.set(msfssdk.AltitudeRestrictionType.Unused);
                item.altitude1.set(advisoryAltitude, msfssdk.UnitType.METER);
                item.altitude2.set(NaN, msfssdk.UnitType.METER);
                item.displayAltitude1AsFlightLevel.set(garminsdk.FmsUtils.displayAltitudeAsFlightLevel(advisoryAltitude));
                item.displayAltitude2AsFlightLevel.set(false);
                item.isAltitudeEdited.set(false);
            }
            else {
                item.updateLegListDataAltitudeStuffFromVerticalData();
            }
            // FPA
            if (item.isAltitudeDesignated.get() && item.leg.verticalData.fpa === undefined) {
                item.fpa.set((_c = directToVnavLeg === null || directToVnavLeg === void 0 ? void 0 : directToVnavLeg.fpa) !== null && _c !== void 0 ? _c : vnavLeg.fpa);
            }
            // Altitude constraint invalid
            // We don't care about the directToVnavLeg here because invalid only applies to designated constraints
            item.isAltitudeInvalid.set(vnavLeg.invalidConstraintAltitude !== undefined);
        }
        /** Destroys direct to random leg data. */
        cleanDirectToRandomData() {
            var _a, _b;
            (_a = this._directToRandomLegData.get()) === null || _a === void 0 ? void 0 : _a.destroy();
            (_b = this._directToRandomHoldLegData.get()) === null || _b === void 0 ? void 0 : _b.destroy();
            this._directToRandomLegData.set(undefined);
            this._directToRandomHoldLegData.set(undefined);
        }
        /** Updates the active leg subject. */
        updateActiveLeg() {
            const activeLegGlobalIndex = this.activeLegGlobalIndex.get();
            if (activeLegGlobalIndex === undefined || activeLegGlobalIndex < 0) {
                this._activeLeg.set(undefined);
                this._activeLegListData.set(undefined);
                this._activeLegSegmentIndex.set(undefined);
                return;
            }
            const plan = this.fms.getFlightPlan(this.planIndex);
            const activeLeg = plan.tryGetLeg(activeLegGlobalIndex);
            this._activeLeg.set(activeLeg !== null && activeLeg !== void 0 ? activeLeg : undefined);
            this._activeLegListData.set(activeLeg ? this.legMap.get(activeLeg) : undefined);
            this._activeLegSegmentIndex.set(activeLeg ? plan.getSegmentIndex(activeLegGlobalIndex) : undefined);
        }
        /**
         * Iterates through the legs in the list, updating their active leg subjects.
         * @throws Error when segment or leg cannot be found, or if something else went wrong.
         */
        updateActiveLegListItems() {
            var _a;
            const toLeg = (_a = this.toLeg.get()) === null || _a === void 0 ? void 0 : _a.leg;
            const plan = this.fms.getFlightPlan(this.planIndex);
            const indexes = toLeg && garminsdk.FmsUtils.getLegIndexes(plan, toLeg);
            if (toLeg === undefined || indexes === undefined) {
                for (const item of this.legItems()) {
                    item.isActiveLeg.set(false);
                    item.isBehindActiveLeg.set(false);
                }
                return;
            }
            const activeLegSegmentIndex = indexes.segmentIndex;
            const activeLegSegmentLegIndex = indexes.segmentLegIndex;
            for (const item of this.legItems()) {
                // We don't care about legs that will never be visible
                if (item.isVisibleLegType === false) {
                    continue;
                }
                const isActiveLeg = item.leg === toLeg;
                item.isActiveLeg.set(isActiveLeg);
                const segmentIndex = item.segment.segmentIndex;
                const segmentLegIndex = item.segment.legs.indexOf(item.leg);
                const isBehindActiveLeg = segmentIndex < activeLegSegmentIndex
                    ? true
                    : segmentIndex === activeLegSegmentIndex
                        ? segmentLegIndex < activeLegSegmentLegIndex
                            ? true
                            : false
                        : false;
                item.isBehindActiveLeg.set(!isActiveLeg && isBehindActiveLeg);
            }
        }
        /** Updates leg data. */
        updateLegs() {
            const plan = this.fms.getFlightPlan(this.planIndex);
            for (const item of this.legItems()) {
                const globalLegIndex = plan.getLegIndexFromLeg(item.leg);
                item.updateLegPosition(globalLegIndex);
            }
        }
    }

    /* eslint-disable @typescript-eslint/no-non-null-assertion */
    /** Tracks flight plan segments and legs and manages them together in a single list. */
    class FlightPlanListManager {
        /**
         * Creates a new FlightPlanListManager.
         * @param bus The event bus.
         * @param store The flight plan store to use.
         * @param fms The FMS.
         * @param planIndex The flight plan index to use.
         * @param loadNewAirwaysCollapsed A subscribable indicating whether new airways should be collapsed.
         */
        constructor(bus, store, fms, planIndex, loadNewAirwaysCollapsed) {
            this.bus = bus;
            this.store = store;
            this.fms = fms;
            this.planIndex = planIndex;
            this.loadNewAirwaysCollapsed = loadNewAirwaysCollapsed;
            this._dataList = msfssdk.ArraySubject.create();
            this.dataList = this._dataList;
            this.fromLegListIndex = msfssdk.Subject.create(undefined);
            this.toLegListIndex = msfssdk.Subject.create(undefined);
            this.fromLegVisibleListIndex = msfssdk.Subject.create(undefined);
            this.toLegVisibleListIndex = msfssdk.Subject.create(undefined);
            this.legVisibilitySubsMap = new Map();
            this.legVisibilityChangedDebounceTimer = new msfssdk.DebounceTimer();
            this._segmentDataMap = new Map();
            this.segmentDataMap = this._segmentDataMap;
            this._legDataMap = new Map();
            this.legDataMap = this._legDataMap;
            this.unitsSettingManager = garminsdk.UnitsUserSettings.getManager(this.bus);
            // Airways
            this.collapsedAirwaySegments = msfssdk.SetSubject.create([]);
            this.segments = [];
            this.subs = [];
            /**
             * For debugging only.
             * @throws errors if our list doesn't match the flight plan.
             */
            // private ensureMatchesFlightPlan(): void {
            //   if (this.paneIndex === 1) {
            //     const plan = this.fms.getFlightPlan(this.planIndex);
            //     // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            //     // @ts-ignore
            //     const planSegments = plan.planSegments;
            //     // console.log(planSegments);
            //     for (const planSeg of planSegments) {
            //       if (planSeg) {
            //         const ourSeg = this.segments[planSeg.segmentIndex];
            //         if (planSeg !== ourSeg?.segment) {
            //           throw new Error('segment mismatch paneIndex ' + this.paneIndex);
            //         }
            //         planSeg.legs.forEach((planLeg, legIndex) => {
            //           const ourLegListItem = this.getLegListItemFromIndex(planSeg.segmentIndex, legIndex);
            //           if (ourLegListItem.leg !== planLeg) {
            //             throw new Error('leg mismatch');
            //           }
            //         });
            //       }
            //     }
            //   }
            // }
            /** Updates the from and to leg list indexes. */
            this.updateFromToLegListIndexes = () => {
                var _a;
                const fromLeg = this.store.fromLeg.get();
                this.fromLegListIndex.set(fromLeg === undefined ? undefined : this.getListIndexFromLeg(fromLeg));
                const toLeg = (_a = this.store.toLeg.get()) === null || _a === void 0 ? void 0 : _a.leg;
                this.toLegListIndex.set(toLeg === undefined ? undefined : this.getListIndexFromLeg(toLeg));
                const fromLegListIndex = this.fromLegListIndex.get();
                this.fromLegVisibleListIndex.set(fromLegListIndex === undefined ? undefined : this.getVisibleListIndexFromListIndex(fromLegListIndex));
                const toLegListIndex = this.toLegListIndex.get();
                this.toLegVisibleListIndex.set(toLegListIndex === undefined ? undefined : this.getVisibleListIndexFromListIndex(toLegListIndex));
            };
            /** Called when any leg's visibility has changed. */
            this.onLegVisibilityChanged = () => {
                // We debounce it because many item visibilities can change at once
                if (this.legVisibilityChangedDebounceTimer.isPending()) {
                    return;
                }
                this.legVisibilityChangedDebounceTimer.schedule(this.onLegVisibilityChangedDebounced, 0);
            };
            /** Called 1 frame after any leg visibility changes. */
            this.onLegVisibilityChangedDebounced = () => {
                for (const [segmentData] of this._segmentDataMap) {
                    const segment = segmentData.segment;
                    let foundVisibleLeg = false;
                    let foundHiddenAirwayLeg = false;
                    let foundActiveLeg = false;
                    for (const leg of segment.legs) {
                        const legListData = this._legDataMap.get(this.store.legMap.get(leg));
                        if (legListData.isVisible.get() && !foundVisibleLeg) {
                            foundVisibleLeg = true;
                            legListData.isFirstVisibleLegInSegment.set(true);
                        }
                        else {
                            legListData.isFirstVisibleLegInSegment.set(false);
                        }
                        if (legListData.legData.isActiveLeg.get()) {
                            foundActiveLeg = true;
                        }
                        if (foundActiveLeg && legListData.isVisible.get() === false && legListData.legData.isVisibleLegType == true && legListData.legData.isInAirwaySegment.get()) {
                            foundHiddenAirwayLeg = true;
                        }
                        if (legListData.legData.isLastLegInSegment.get() && foundHiddenAirwayLeg) {
                            legListData.hasHiddenAirwayLegsBefore.set(true);
                        }
                        else {
                            legListData.hasHiddenAirwayLegsBefore.set(false);
                        }
                    }
                }
                this.updateFromToLegListIndexes();
            };
            // Removes "Add Enroute Waypoint" item when Done is clicked.
            this.subs.push(this.store.addEnrouteWaypointButtonIsVisible.sub(isVisible => {
                if (!isVisible && this.addEnrouteWaypointData) {
                    // TODO Don't remove it, jsut make it not visible
                    this._dataList.removeItem(this.addEnrouteWaypointData);
                    delete this.addEnrouteWaypointData;
                }
            }));
            this.subs.push(this.store.beforeFlightPlanLoaded.on(() => this.clearData()));
            this.subs.push(this.store.flightPlanLegsChanged.on(() => this.updateFromToLegListIndexes()));
            this.subs.push(this.store.flightPlanLegsChanged.on(() => this.onLegVisibilityChanged()));
            this.subs.push(this.store.segmentAdded.on((_, segData) => this.handleSegmentAdded(segData)));
            this.subs.push(this.store.segmentInserted.on((_, segData) => this.handleSegmentInserted(segData)));
            this.subs.push(this.store.segmentRemoved.on((_, [segData, segIndex]) => this.handleSegmentRemoved(segData, segIndex)));
            this.subs.push(this.store.segmentChanged.on(() => this.handleSegmentChanged()));
            this.subs.push(this.store.legAdded.on((_, [legData, segIndex, segLegIndex]) => this.handleLegAdded(legData, segIndex, segLegIndex)));
            this.subs.push(this.store.legRemoved.on((_, legData) => this.handleLegRemoved(legData)));
            this.subs.push(this.store.fromLeg.sub(() => this.updateFromToLegListIndexes()));
            this.subs.push(this.store.toLeg.sub(() => this.updateFromToLegListIndexes()));
            this.subs.push(this.dataList.sub(() => this.updateFromToLegListIndexes()));
            this.updateFromToLegListIndexes();
        }
        /** Handles the flight plan loaded event. */
        clearData() {
            this._dataList.clear();
            this.segments = [];
            for (const [, segmentListData] of this.segmentDataMap) {
                this.removeSegmentListData(segmentListData);
            }
            this._segmentDataMap.clear();
            for (const [, legListData] of this.legDataMap) {
                this.removeLegListData(legListData);
            }
            this._legDataMap.clear();
            this.legVisibilitySubsMap.clear();
            delete this.addEnrouteWaypointData;
        }
        /**
         * Handles the segment added event.
         * @param newSegData The new segment data.
         * @throws Error when the segment being added already exists.
         */
        handleSegmentAdded(newSegData) {
            // In theory, added means append to end of flight plan
            // Is only used when intializing the flight plan, or recreating it after deleting it
            const segment = newSegData.segment;
            if (segment.airway !== undefined && this.loadNewAirwaysCollapsed.get() === true) {
                this.collapsedAirwaySegments.add(segment);
            }
            const newSegmentListData = new FlightPlanSegmentListData(newSegData, this.store, this);
            this.segments[segment.segmentIndex] = newSegmentListData;
            this._segmentDataMap.set(newSegData, newSegmentListData);
            this._dataList.insert(newSegmentListData);
            // Add the "Add Enroute Waypoint" list item
            if (segment.segmentType === msfssdk.FlightPlanSegmentType.Enroute) {
                if (this.addEnrouteWaypointData) {
                    // Move it to the end
                    this._dataList.removeItem(this.addEnrouteWaypointData);
                    this._dataList.insert(this.addEnrouteWaypointData);
                }
                else {
                    this.addEnrouteWaypointData = {
                        type: 'addEnrouteWaypointButton',
                        isVisible: msfssdk.Subject.create(true),
                    };
                    this._dataList.insert(this.addEnrouteWaypointData);
                }
                this.store.addEnrouteWaypointButtonIsVisible.set(true);
            }
            this.updateSegmentVisibility();
            // this.ensureMatchesFlightPlan();
        }
        /**
         * Handles the segment inserted event.
         * @param newSegData The new segment data.
         */
        handleSegmentInserted(newSegData) {
            const segment = newSegData.segment;
            const { segmentIndex } = segment;
            if (segment.airway !== undefined && this.loadNewAirwaysCollapsed.get() === true) {
                this.collapsedAirwaySegments.add(segment);
            }
            let listIndex;
            if (this._dataList.length === 0) {
                listIndex = 0;
            }
            else if (segmentIndex === 0) {
                listIndex = 0;
            }
            else if (!this.segments[segmentIndex]) {
                // TODO Needs to account for length of segment (this block might not actually ever get used)
                console.error('TODO Need to account for length of segment');
                listIndex = this._dataList.getArray().indexOf(this.segments[segmentIndex - 1]) + 1;
            }
            else {
                listIndex = this._dataList.getArray().indexOf(this.segments[segmentIndex]);
                const newSegmentIsEnroute = segment.segmentType === msfssdk.FlightPlanSegmentType.Enroute;
                // Make sure to take the "Add Enroute Waypoint" list item into account
                // It sits at the end of the last enroute segment
                if (newSegmentIsEnroute && this._dataList.get(listIndex - 1).type === 'addEnrouteWaypointButton') {
                    listIndex--;
                }
            }
            const newSegmentListData = new FlightPlanSegmentListData(newSegData, this.store, this);
            this.segments.splice(segmentIndex, 0, newSegmentListData);
            this._segmentDataMap.set(newSegData, newSegmentListData);
            this._dataList.insert(newSegmentListData, listIndex);
            this.updateSegmentVisibility();
            // this.ensureMatchesFlightPlan();
        }
        /**
         * Handles the segment removed event.
         * @param segData The segment data to remove.
         * @param segmentIndex The index of the segment being removed.
         * @throws Error when the segment being removed does not exist.
         */
        handleSegmentRemoved(segData, segmentIndex) {
            this.segments.splice(segmentIndex, 1);
            const segListData = this._segmentDataMap.get(segData);
            if (segListData) {
                this.removeSegmentListData(segListData);
            }
            this._dataList.getArray().slice().forEach(item => {
                if (item.type === 'leg' && item.legData.segment === segData.segment) {
                    this.removeLegListData(item);
                }
            });
            this.updateSegmentVisibility();
            // this.ensureMatchesFlightPlan();
        }
        /**
         * Removes a segment list data and destroys it.
         * @param segmentListData The segment list data.
         */
        removeSegmentListData(segmentListData) {
            this._dataList.removeItem(segmentListData);
            this._segmentDataMap.delete(segmentListData.segmentData);
            this.collapsedAirwaySegments.delete(segmentListData.segmentData.segment);
            segmentListData.destroy();
        }
        /**
         * Handles the segment changed event.
         * @throws Error when the segment being removed does not exist.
         */
        handleSegmentChanged() {
            this.updateSegmentVisibility();
            // this.ensureMatchesFlightPlan();
        }
        /**
         * Handles a new leg.
         * @param newLegData The new leg data.
         * @param segmentIndex The segment index.
         * @param segmentLegIndex The segment leg index.
         */
        handleLegAdded(newLegData, segmentIndex, segmentLegIndex) {
            const segmentListData = this.segments[segmentIndex];
            const segListIndex = this._dataList.getArray().indexOf(segmentListData);
            const newLegListIndex = segListIndex + segmentLegIndex + 1;
            const newLegListData = new FlightPlanLegListData(newLegData, segmentListData, this.store, this.unitsSettingManager);
            this.legVisibilitySubsMap.set(newLegData.leg, newLegListData.isVisible.sub(this.onLegVisibilityChanged));
            this._legDataMap.set(newLegData, newLegListData);
            this._dataList.insert(newLegListData, newLegListIndex);
            this.updateSegmentVisibility();
            // this.ensureMatchesFlightPlan();
        }
        /**
         * Handles a leg being removed.
         * @param legData The leg data to remove.
         */
        handleLegRemoved(legData) {
            const legListData = this._legDataMap.get(legData);
            if (legListData) {
                this.removeLegListData(legListData);
            }
            this.updateSegmentVisibility();
            // this.ensureMatchesFlightPlan();
        }
        /**
         * Removes a leg list data object and destroys it.
         * @param legListData The leg list data.
         */
        removeLegListData(legListData) {
            var _a;
            this._legDataMap.delete(legListData.legData);
            this._dataList.removeItem(legListData);
            (_a = this.legVisibilitySubsMap.get(legListData.legData.leg)) === null || _a === void 0 ? void 0 : _a.destroy();
            this.legVisibilitySubsMap.delete(legListData.legData.leg);
            legListData.destroy();
        }
        /**
         * Gets the leg list item with a given segment index and segment leg index.
         * @param segmentIndex The index of the segment that the leg is in.
         * @param segmentLegIndex The index of the leg in the segment.
         * @returns The leg list data.
         * @throws Error in case it breaks.
         */
        getLegListItemFromIndex(segmentIndex, segmentLegIndex) {
            const legListIndex = this.getListIndexFromLegIndex(segmentIndex, segmentLegIndex);
            const item = this._dataList.get(legListIndex);
            if (item.type !== 'leg') {
                throw new Error('getLegListItemFromIndex got the wrong list item: ' + JSON.stringify({ segmentIndex, segmentLegIndex, item }));
            }
            return item;
        }
        /**
         * Gets the leg list index with a given segment index and segment leg index.
         * @param segmentIndex The index of the segment that the leg is in.
         * @param segmentLegIndex The index of the leg in the segment.
         * @returns The list index of the leg.
         */
        getListIndexFromLegIndex(segmentIndex, segmentLegIndex) {
            const segmentListItem = this.segments[segmentIndex];
            const segListIndex = this._dataList.getArray().indexOf(segmentListItem);
            return segListIndex + segmentLegIndex + 1;
        }
        /**
         * Gets the leg list index with a given leg.
         * @param leg The leg.
         * @returns The list index of the leg.
         */
        getListIndexFromLeg(leg) {
            const item = this.dataList.getArray().find(x => x.type === 'leg' && x.legData.leg === leg);
            return this.dataList.getArray().indexOf(item);
        }
        /**
         * Converts a true list index to a visible one, which takes hidden items into acount.
         * @param listIndex The true list index.
         * @returns The visible list index of the leg.
         */
        getVisibleListIndexFromListIndex(listIndex) {
            const list = this._dataList.getArray();
            let hiddenItemsBeforeListIndex = 0;
            for (let i = 0; i < listIndex; i++) {
                const item = list[i];
                if (item.isVisible.get() === false) {
                    hiddenItemsBeforeListIndex++;
                }
            }
            return listIndex - hiddenItemsBeforeListIndex;
        }
        /** Iterates through the segments and updates their visiblity. */
        updateSegmentVisibility() {
            for (const [segmentData, segmentListData] of this._segmentDataMap) {
                segmentListData.isVisible.set(this.shouldSegmentBeVisible(segmentData.segment, segmentData.segment.segmentIndex));
            }
        }
        /**
         * Determines if a segment should be visible in the flight plan list.
         * @param segment The segment to check.
         * @param segmentIndex The segment index of the given segment.
         * @returns Whether a segment should be visible in the flight plan list.
         */
        shouldSegmentBeVisible(segment, segmentIndex) {
            /*
             * enroute segment list item is only visible if:
             * a. it is the first normal enroute segment with legs in it
             * b. it is an airway segment
            */
            if (segment.segmentType === msfssdk.FlightPlanSegmentType.Enroute) {
                if (segment.airway !== undefined) {
                    return true;
                }
                else if (segmentIndex <= this.getIndexOfFirstNormalEnrouteSegment() && segment.legs.length > 0) {
                    return true;
                }
                else {
                    return false;
                }
            }
            else {
                return true;
            }
        }
        /**
         * Gets the index of the first normal (non-airway) enroute segment.
         * @returns The index of the first normal (non-airway) enroute segment.
         */
        getIndexOfFirstNormalEnrouteSegment() {
            // TODO Should this also check if it has legs in it? Or is that handled somewhere else?
            for (const segment of this.fms.getFlightPlan(this.planIndex).segments()) {
                if (segment.segmentType === msfssdk.FlightPlanSegmentType.Enroute && segment.airway === undefined) {
                    return segment.segmentIndex;
                }
            }
            return -1;
        }
        /** Celans up subscriptions. */
        destroy() {
            this.subs.forEach(sub => sub.destroy());
            this.clearData();
            this.legVisibilityChangedDebounceTimer.clear();
        }
    }

    /* eslint-disable @typescript-eslint/no-non-null-assertion */
    /** Generates the rows to be used in the flight plan text inset. */
    class FlightPlanTextUpdater {
        /**
         * Creates a new FlightPlanTextUpdater.
         * @param store The flight plan store.
         * @param flightPlanListManager The list manager to use.
         */
        constructor(store, flightPlanListManager) {
            this.store = store;
            this.flightPlanListManager = flightPlanListManager;
            this.dataListArray = this.flightPlanListManager.dataList.getArray();
        }
        /**
         * Generates the data for the flight plan text inset.
         * @param topRow Reference to the leg or segment list data that should be in the top row.
         * @returns the data for the flight plan text inset.
         */
        getUpdateData(topRow) {
            const rows = this.getRows(topRow);
            const isDirectToRandomActive = this.store.isDirectToRandomActiveWithHold.get();
            const directToRandomLegListData = this.store.directToRandomLegListData.get();
            const directToRandomHoldLegListData = this.store.directToRandomHoldLegListData.get();
            const showOffroute = isDirectToRandomActive && directToRandomLegListData;
            const showOffrouteWithHold = showOffroute && isDirectToRandomActive === 'with-hold' && directToRandomHoldLegListData;
            if (showOffrouteWithHold) {
                rows.unshift(directToRandomHoldLegListData);
                delete rows[5];
                rows.unshift(directToRandomLegListData);
                delete rows[5];
            }
            else if (showOffroute) {
                rows.unshift(directToRandomLegListData);
                delete rows[5];
            }
            const fromLeg = this.store.fromLeg.get();
            const fromLegData = fromLeg ? this.store.legMap.get(fromLeg) : undefined;
            const fromLegListData = fromLegData ? this.flightPlanListManager.legDataMap.get(fromLegData) : undefined;
            // If undefined, we want to show the direct to arrow, else the arrow should come from off screen
            const fromIndex = showOffroute
                ? undefined
                : fromLeg === undefined
                    ? undefined
                    : fromLegListData
                        ? rows.indexOf(fromLegListData)
                        : undefined;
            const toLeg = this.store.toLeg.get();
            const toLegListData = toLeg ? this.flightPlanListManager.legDataMap.get(toLeg) : undefined;
            // If undefined, we want to show no arrow, else the arrow should point off screen
            const toIndex = (showOffrouteWithHold && (directToRandomHoldLegListData === null || directToRandomHoldLegListData === void 0 ? void 0 : directToRandomHoldLegListData.legData.isActiveLeg.get()))
                ? 1
                : showOffroute
                    ? 0
                    : toLeg === undefined
                        ? undefined
                        : toLegListData
                            ? rows.indexOf(toLegListData)
                            : undefined;
            return {
                fromIndex,
                // Setting it to 5 will make the arrow point off screen through the bottom
                toIndex: toIndex === -1 ? 5 : toIndex,
                rows,
            };
        }
        /**
         * Gets the rows. If no topRow, will put active leg in center, or just start at the top of the list.
         * @param topRow What to use as the top row.
         * @returns the rows.
         */
        getRows(topRow) {
            const toLeg = this.store.toLeg.get();
            if (topRow) {
                return this.getRowsFromTopRow(topRow);
            }
            else if (!toLeg) {
                return this.getRowsWhenNoToLeg();
            }
            else {
                return this.getRowsAroundToLeg(toLeg);
            }
        }
        /**
         * Gets rows using a top row.
         * @param topRow the top row data.
         * @returns the rows.
         */
        getRowsFromTopRow(topRow) {
            const rows = [];
            let foundTopRow = false;
            const filteredList = this.dataListArray.filter(x => FlightPlanTextUpdater.shouldIgnoreItem(x, this.store.originFacility.get(), this.store.destinationFacility.get()) === false);
            for (const item of filteredList) {
                if (item === topRow) {
                    foundTopRow = true;
                }
                if (foundTopRow) {
                    rows.push(item);
                }
                if (rows.length === 5) {
                    break;
                }
            }
            return rows;
        }
        /**
         * Gets rows when there is no to leg, it will just pull the first 5 items from the list.
         * @returns the rows.
         */
        getRowsWhenNoToLeg() {
            const rows = [];
            const filteredList = this.dataListArray.filter(x => FlightPlanTextUpdater.shouldIgnoreItem(x, this.store.originFacility.get(), this.store.destinationFacility.get()) === false);
            for (const item of filteredList) {
                rows.push(item);
                if (rows.length === 5) {
                    break;
                }
            }
            return rows;
        }
        /**
         * Gets rows with the active leg in the center.
         * @param toLeg The active leg.
         * @returns the rows.
         */
        getRowsAroundToLeg(toLeg) {
            let rows = [];
            let foundToLeg = false;
            const filteredList = this.dataListArray.filter(x => FlightPlanTextUpdater.shouldIgnoreItem(x, this.store.originFacility.get(), this.store.destinationFacility.get()) === false);
            // Add rows until we find the toLeg
            // Then slice the rows to leave the toLeg with the 2 rows behind it
            // Then keep adding rows until we have 5 rows or reach the end
            for (const item of filteredList) {
                rows.push(item);
                if (item.type === 'leg' && item.legData === toLeg) {
                    foundToLeg = true;
                    const toLegRowIndex = rows.length - 1;
                    const rowsAfterToLeg = filteredList.length - toLegRowIndex - 1;
                    const behindRowCount = Math.max(2, 4 - rowsAfterToLeg);
                    const startIndex = Math.max(0, toLegRowIndex - behindRowCount);
                    // Cut off the start of the rows to leave 2 rows before the toLeg
                    rows = rows.slice(startIndex, toLegRowIndex + 1);
                }
                if (foundToLeg && rows.length === 5) {
                    break;
                }
            }
            return rows;
        }
        /**
         * Whether an item should be left out of the text rows.
         * @param item the item to check.
         * @param originFacility The current origin facility.
         * @param destinationFacility The current destination facility.
         * @returns True if item should be ignored.
         */
        static shouldIgnoreItem(item, originFacility, destinationFacility) {
            if (item.isVisible.get() !== true) {
                return true;
            }
            if (item.type === 'addEnrouteWaypointButton') {
                return true;
            }
            if (item.type === 'segment') {
                // Hide departure segment if no origin
                if (item.segmentData.segment.segmentType === msfssdk.FlightPlanSegmentType.Departure && originFacility === undefined) {
                    return true;
                }
                // Hide destination segment if no destination
                if (item.segmentData.segment.segmentType === msfssdk.FlightPlanSegmentType.Destination && destinationFacility === undefined) {
                    return true;
                }
            }
            return false;
        }
        /** Destroys subs and comps. */
        destroy() {
            // noop
        }
    }

    const DISTANCE_FORMATTER = msfssdk.NumberFormatter.create({ precision: 0.1, maxDigits: 3, forceDecimalZeroes: true, nanString: '____' });
    const BEARING_FORMATTER = msfssdk.NumberFormatter.create({ precision: 1, pad: 3, nanString: '___' });
    const FUEL_FORMATTER = msfssdk.NumberFormatter.create({ precision: 1, nanString: '_____' });
    const DATE_TIME_FORMAT_SETTING_MAP = {
        [garminsdk.DateTimeFormatSettingMode.Local12]: garminsdk.TimeDisplayFormat.Local12,
        [garminsdk.DateTimeFormatSettingMode.Local24]: garminsdk.TimeDisplayFormat.Local24,
        [garminsdk.DateTimeFormatSettingMode.UTC]: garminsdk.TimeDisplayFormat.UTC
    };
    /** The FlightPlanTextRow component. */
    class FlightPlanTextRow extends msfssdk.DisplayComponent {
        constructor() {
            super(...arguments);
            this.rowData = this.props.data.map(x => x === null || x === void 0 ? void 0 : x.rows[this.props.index]);
            this.isSelected = msfssdk.MappedSubject.create(([rowData, selectedRow]) => {
                return rowData && rowData === selectedRow;
            }, this.rowData, this.props.selectedRow);
            this.name = msfssdk.Subject.create('');
            // Segment
            this.segmentListData = msfssdk.Subject.create(undefined);
            this.segmentListDataPipes = [];
            // Approach
            this.approach = msfssdk.Subject.create(undefined);
            this.approachAirport = msfssdk.Subject.create(undefined);
            this.approachPrefix = msfssdk.Subject.create('');
            // Leg
            this.legListData = msfssdk.Subject.create(undefined);
            this.legDefinition = this.legListData.map(x => x === null || x === void 0 ? void 0 : x.legData.leg);
            this.isAirwayLeg = msfssdk.Subject.create(false);
            this.isActiveLeg = msfssdk.Subject.create(false);
            this.isHeadingLeg = this.legListData.map(x => !!(x === null || x === void 0 ? void 0 : x.legData.isHeadingLeg));
            this.isHoldLeg = this.legListData.map(x => !!(x === null || x === void 0 ? void 0 : x.legData.isHoldLeg));
            this.isHoldTimeLeg = this.legListData.map(x => !!((x === null || x === void 0 ? void 0 : x.legData.isHoldLeg) && x.legData.leg.leg.distanceMinutes));
            this.isFirstLegInPlan = msfssdk.Subject.create(false);
            this.isDmeArcLeg = this.legListData.map(x => (x === null || x === void 0 ? void 0 : x.legData.leg.leg.type) === msfssdk.LegType.AF);
            this.fuelRemaining = msfssdk.NumberUnitSubject.create(msfssdk.UnitType.GALLON_FUEL.createNumber(NaN));
            this.estimatedTimeEnroute = msfssdk.NumberUnitSubject.create(msfssdk.UnitType.SECOND.createNumber(NaN));
            this.estimatedTimeEnrouteCumulative = msfssdk.NumberUnitSubject.create(msfssdk.UnitType.SECOND.createNumber(NaN));
            this.eteFinal = msfssdk.NumberUnitSubject.create(msfssdk.UnitType.SECOND.createNumber(NaN));
            this.estimatedTimeOfArrival = msfssdk.Subject.create(NaN);
            this.airwayExitText = msfssdk.Subject.create('');
            this.legListDataPipes = [];
            // Leg altitude
            this.isAltitudeCyan = msfssdk.Subject.create(false);
            this.altDescDisplay = msfssdk.Subject.create(msfssdk.AltitudeRestrictionType.Unused);
            this.isAltitudeEditedDisplay = msfssdk.Subject.create(false);
            this.isAltitudeInvalidDisplay = msfssdk.Subject.create(false);
            this.altitude1Display = msfssdk.NumberUnitSubject.create(msfssdk.UnitType.METER.createNumber(NaN));
            this.altitude2Display = msfssdk.NumberUnitSubject.create(msfssdk.UnitType.METER.createNumber(NaN));
            this.displayAltitude1AsFlightLevelDisplay = msfssdk.Subject.create(false);
            this.displayAltitude2AsFlightLevelDisplay = msfssdk.Subject.create(false);
            this.isAltitudeVisible = msfssdk.Subject.create(false);
            this.legSuffix = msfssdk.Subject.create('');
            // Leg data fields
            this.displayDtk = msfssdk.BasicNavAngleSubject.create(msfssdk.BasicNavAngleUnit.create(true).createNumber(NaN));
            this.dtkString = msfssdk.Subject.create('');
            this.distanceString = msfssdk.Subject.create('');
            this.displayDistance = msfssdk.NumberUnitSubject.create(msfssdk.UnitType.METER.createNumber(NaN));
            this.distanceCumulative = msfssdk.NumberUnitSubject.create(msfssdk.UnitType.METER.createNumber(NaN));
            this.distanceFinal = msfssdk.NumberUnitSubject.create(msfssdk.UnitType.METER.createNumber(NaN));
            this.cumulativePipes = [];
            this.timeFormat = this.props.dateTimeSettingManager.getSetting('dateTimeFormat').map(setting => {
                var _a;
                return (_a = DATE_TIME_FORMAT_SETTING_MAP[setting]) !== null && _a !== void 0 ? _a : garminsdk.TimeDisplayFormat.UTC;
            });
            this.classList = msfssdk.SetSubject.create(['flight-plan-text-row']);
            this.subs = [];
        }
        /** @inheritdoc */
        onAfterRender() {
            this.subs.push(this.props.data.sub(data => {
                const row = data === null || data === void 0 ? void 0 : data.rows[this.props.index];
                this.legListData.set((row === null || row === void 0 ? void 0 : row.type) === 'leg' ? row : undefined);
                this.segmentListData.set((row === null || row === void 0 ? void 0 : row.type) === 'segment' ? row : undefined);
                const isApproach = (row === null || row === void 0 ? void 0 : row.type) === 'segment' && row.segmentData.segment.segmentType === msfssdk.FlightPlanSegmentType.Approach;
                this.classList.toggle('leg', (row === null || row === void 0 ? void 0 : row.type) === 'leg');
                this.classList.toggle('segment', (row === null || row === void 0 ? void 0 : row.type) === 'segment' && !isApproach);
                this.classList.toggle('approach', isApproach);
                this.classList.toggle('selected', !!(row && row === this.props.selectedRow.get()));
                this.classList.toggle('direct-to-random-leg', (row === null || row === void 0 ? void 0 : row.type) === 'leg' && row.legData.isDirectToRandom);
                this.classList.toggle('hidden', !row);
            }, true));
            this.segmentListData.sub(segmentListData => {
                this.segmentListDataPipes.forEach(x => x.destroy());
                this.segmentListDataPipes.length = 0;
                if (segmentListData) {
                    const segment = segmentListData.segmentData.segment;
                    if (segment.segmentType === msfssdk.FlightPlanSegmentType.Departure) {
                        this.segmentListDataPipes.push(this.props.store.departureTextOneLine.pipe(this.name));
                    }
                    else if (segment.segmentType === msfssdk.FlightPlanSegmentType.Arrival) {
                        this.segmentListDataPipes.push(this.props.store.arrivalStringFull.pipe(this.name));
                    }
                    else if (segment.segmentType === msfssdk.FlightPlanSegmentType.Destination) {
                        this.segmentListDataPipes.push(this.props.store.destinationString.pipe(this.name));
                    }
                    else if (segment.segmentType === msfssdk.FlightPlanSegmentType.Approach) {
                        this.segmentListDataPipes.push(this.props.store.approachProcedure.pipe(this.approach));
                        this.segmentListDataPipes.push(this.props.store.destinationFacility.pipe(this.approachAirport));
                        this.segmentListDataPipes.push(this.props.store.approachStringPrefix.pipe(this.approachPrefix));
                    }
                    else if (segment.airway !== undefined) {
                        this.segmentListDataPipes.push(segmentListData.airwayText.pipe(this.name));
                    }
                    else {
                        this.name.set('Enroute');
                    }
                }
                else {
                    this.resetSegmentData();
                }
            }, true);
            this.legListData.sub(legListData => {
                this.legListDataPipes.forEach(x => x.destroy());
                this.legListDataPipes.length = 0;
                if (legListData) {
                    const leg = legListData.legData.leg;
                    this.legListDataPipes.push(legListData.legData.isInAirwaySegment.pipe(this.isAirwayLeg));
                    this.legListDataPipes.push(legListData.legData.isActiveLeg.pipe(this.isActiveLeg));
                    this.legListDataPipes.push(legListData.legData.isAltitudeCyan.pipe(this.isAltitudeCyan));
                    this.legListDataPipes.push(legListData.legData.altDescDisplay.pipe(this.altDescDisplay));
                    this.legListDataPipes.push(legListData.legData.isAltitudeEditedDisplay.pipe(this.isAltitudeEditedDisplay));
                    this.legListDataPipes.push(legListData.legData.isAltitudeInvalidDisplay.pipe(this.isAltitudeInvalidDisplay));
                    this.legListDataPipes.push(legListData.legData.altitude1Display.pipe(this.altitude1Display));
                    this.legListDataPipes.push(legListData.legData.altitude2Display.pipe(this.altitude2Display));
                    this.legListDataPipes.push(legListData.legData.displayAltitude1AsFlightLevelDisplay.pipe(this.displayAltitude1AsFlightLevelDisplay));
                    this.legListDataPipes.push(legListData.legData.displayAltitude2AsFlightLevelDisplay.pipe(this.displayAltitude2AsFlightLevelDisplay));
                    this.legListDataPipes.push(legListData.legData.isAltitudeVisible.pipe(this.isAltitudeVisible));
                    this.legListDataPipes.push(legListData.legData.fuelRemaining.pipe(this.fuelRemaining));
                    this.legListDataPipes.push(legListData.displayEte.pipe(this.estimatedTimeEnroute));
                    this.legListDataPipes.push(legListData.legData.estimatedTimeEnrouteCumulative.pipe(this.estimatedTimeEnrouteCumulative));
                    this.legListDataPipes.push(legListData.legData.estimatedTimeOfArrival.pipe(this.estimatedTimeOfArrival));
                    this.legListDataPipes.push(legListData.airwayExitText.pipe(this.airwayExitText));
                    this.legListDataPipes.push(legListData.airwayExitText.pipe(this.name));
                    this.legListDataPipes.push(legListData.legData.isFirstLegInPlan.pipe(this.isFirstLegInPlan));
                    this.legSuffix.set(garminsdk.FmsUtils.getSequenceLegFixTypeSuffix(legListData.legData.leg, false));
                    // DTK
                    if (legListData.legData.isHeadingLeg) {
                        this.legListDataPipes.push(legListData.legData.isBehindActiveLeg.sub(isBehind => {
                            if (isBehind) {
                                this.displayDtk.set(NaN);
                            }
                            else {
                                this.displayDtk.set(legListData.legData.courseRounded);
                            }
                        }, true));
                    }
                    else if (legListData.legData.isHoldLeg) {
                        this.name.set('HOLD');
                        this.legListDataPipes.push(legListData.displayDtk.pipe(this.displayDtk));
                        // TODO DME ARC
                        // } else if (leg.leg.type === LegType.AF) {
                        //   this.name.set('DME ARC');
                        //   this.dtkString.set(ICAO.getIdent(leg.leg.originIcao));
                        //   // The other part is in the render method
                        //   // this.superLabelAfter.set(' Arc ' + ICAO.getIdent(leg.leg.originIcao));
                    }
                    else {
                        this.legListDataPipes.push(legListData.displayDtk.pipe(this.displayDtk));
                    }
                    // DIS
                    if (legListData.legData.isHoldLeg) {
                        if (leg.leg.distanceMinutes) {
                            const seconds = Math.round(leg.leg.distance * 60);
                            const minutesPart = Math.floor(seconds / 60);
                            const secondsPart = seconds - minutesPart * 60;
                            // TODO Should count up when in the hold
                            this.distanceString.set(`${minutesPart.toFixed(0).padStart(2, '0')}:${secondsPart.toFixed(0).padStart(2, '0')}`);
                        }
                        else {
                            this.distanceFinal.set(leg.leg.distance);
                        }
                    }
                    else {
                        this.legListDataPipes.push(legListData.displayDistance.pipe(this.displayDistance));
                        this.legListDataPipes.push(legListData.legData.distanceCumulative.pipe(this.distanceCumulative));
                    }
                }
                else {
                    this.resetLegData();
                }
            }, true);
            this.isAirwayLeg.sub(isAirwayLeg => {
                this.classList.toggle('airway-leg', isAirwayLeg);
            }, true);
            this.isActiveLeg.sub(isActive => {
                this.classList.toggle('active-leg', isActive);
            }, true);
            this.isHeadingLeg.sub(isHeadingLeg => {
                this.classList.toggle('hdg', isHeadingLeg);
            }, true);
            this.isHoldLeg.sub(isHoldLeg => {
                this.classList.toggle('hold', isHoldLeg);
            }, true);
            this.isHoldTimeLeg.sub(isHoldTimeLeg => {
                this.classList.toggle('hold-time', isHoldTimeLeg);
            }, true);
            this.isFirstLegInPlan.sub(isFirstLegInPlan => {
                this.classList.toggle('first-leg', isFirstLegInPlan);
            }, true);
            this.isDmeArcLeg.sub(isDmeArcLeg => {
                this.classList.toggle('dme-arc', isDmeArcLeg);
            }, true);
            this.isAltitudeVisible.sub(isVisible => {
                this.classList.toggle('show-altitude', isVisible);
            }, true);
            this.isSelected.sub(isSelected => {
                this.classList.toggle('selected', !!isSelected);
            }, true);
            this.airwayExitText.sub(airwayExitText => {
                this.classList.toggle('use-airway-exit', !!airwayExitText);
            }, true);
            this.subs.push(this.props.mapInsetTextCumulativeSetting.sub(cumulative => {
                this.cumulativePipes.forEach(x => x.destroy());
                if (cumulative) {
                    this.cumulativePipes.push(this.distanceCumulative.pipe(this.distanceFinal));
                    this.cumulativePipes.push(this.estimatedTimeEnrouteCumulative.pipe(this.eteFinal));
                }
                else {
                    this.cumulativePipes.push(this.displayDistance.pipe(this.distanceFinal));
                    this.cumulativePipes.push(this.estimatedTimeEnroute.pipe(this.eteFinal));
                }
            }, true));
        }
        /**
         * Resets this row's segment data.
         */
        resetSegmentData() {
            this.approach.set(undefined);
            this.approachAirport.set(undefined);
            this.approachPrefix.set('');
        }
        /**
         * Resets this row's leg data.
         */
        resetLegData() {
            this.isAirwayLeg.set(false);
            this.isActiveLeg.set(false);
            this.isAltitudeCyan.set(false);
            this.altDescDisplay.set(msfssdk.AltitudeRestrictionType.Unused);
            this.isAltitudeEditedDisplay.set(false);
            this.isAltitudeInvalidDisplay.set(false);
            this.altitude1Display.set(NaN);
            this.altitude2Display.set(NaN);
            this.displayAltitude1AsFlightLevelDisplay.set(false);
            this.displayAltitude2AsFlightLevelDisplay.set(false);
            this.isAltitudeVisible.set(false);
            this.fuelRemaining.set(NaN);
            this.estimatedTimeEnroute.set(NaN);
            this.estimatedTimeEnrouteCumulative.set(NaN);
            this.estimatedTimeOfArrival.set(NaN);
            this.airwayExitText.set('');
            this.isFirstLegInPlan.set(false);
            this.legSuffix.set('');
            this.displayDtk.set(NaN);
            this.displayDistance.set(NaN);
            this.distanceCumulative.set(NaN);
            this.distanceString.set('');
            this.distanceFinal.set(NaN);
        }
        /** @inheritdoc */
        render() {
            return (msfssdk.FSComponent.buildComponent("div", { class: this.classList },
                msfssdk.FSComponent.buildComponent("div", { class: "name" },
                    msfssdk.FSComponent.buildComponent("span", { class: "normal-name" }, this.name),
                    msfssdk.FSComponent.buildComponent("span", { class: "leg-name" },
                        msfssdk.FSComponent.buildComponent(LegNameDisplay, { leg: this.legDefinition }),
                        msfssdk.FSComponent.buildComponent("span", { class: "leg-suffix" }, this.legSuffix)),
                    msfssdk.FSComponent.buildComponent(garminsdk.ApproachNameDisplay, { approach: this.approach, airport: this.approachAirport, prefix: this.approachPrefix })),
                msfssdk.FSComponent.buildComponent("div", { class: "hdg data-field" }, "hdg"),
                msfssdk.FSComponent.buildComponent("div", { class: "dtk data-field" },
                    msfssdk.FSComponent.buildComponent(garminsdk.BearingDisplay, { class: "bearing-display", value: this.displayDtk, formatter: BEARING_FORMATTER, displayUnit: this.props.unitsSettingManager.navAngleUnits }),
                    msfssdk.FSComponent.buildComponent("span", { class: "dtk-string" }, this.dtkString)),
                msfssdk.FSComponent.buildComponent("div", { class: "distance data-field" },
                    msfssdk.FSComponent.buildComponent(garminsdk.NumberUnitDisplay, { class: "distance-display", value: this.distanceFinal, formatter: DISTANCE_FORMATTER, displayUnit: this.props.unitsSettingManager.distanceUnitsLarge }),
                    msfssdk.FSComponent.buildComponent("span", { class: "distance-string" }, this.distanceString)),
                msfssdk.FSComponent.buildComponent("div", { class: "altitude data-field" },
                    msfssdk.FSComponent.buildComponent(AltitudeConstraintDisplay, { altDesc: this.altDescDisplay, isEdited: this.isAltitudeEditedDisplay, isInvalid: this.isAltitudeInvalidDisplay, altitude1: this.altitude1Display, altitude2: this.altitude2Display, displayAltitude1AsFlightLevel: this.displayAltitude1AsFlightLevelDisplay, displayAltitude2AsFlightLevel: this.displayAltitude2AsFlightLevelDisplay, isCyan: this.isAltitudeCyan })),
                msfssdk.FSComponent.buildComponent(garminsdk.NumberUnitDisplay, { class: "fuel data-field", value: this.fuelRemaining, formatter: FUEL_FORMATTER, displayUnit: this.props.unitsSettingManager.fuelUnits }),
                msfssdk.FSComponent.buildComponent(msfssdk.DurationDisplay, {
                    class: "ete data-field", value: this.eteFinal, options: {
                        format: msfssdk.DurationDisplayFormat.hh_mm_or_mm_ss,
                        delim: msfssdk.DurationDisplayDelim.ColonOrCross,
                        pad: 2,
                        nanString: '__:__',
                    }
                }),
                msfssdk.FSComponent.buildComponent(garminsdk.TimeDisplay, { class: "eta data-field", time: this.estimatedTimeOfArrival, format: this.timeFormat, localOffset: this.props.dateTimeSettingManager.getSetting('dateTimeLocalOffset') })));
        }
        /** Destroys subs and comps. */
        destroy() {
            this.rowData.destroy();
            this.isSelected.destroy();
            this.timeFormat.destroy();
            this.subs.forEach(sub => { sub.destroy(); });
            this.segmentListDataPipes.forEach(pipe => { pipe.destroy(); });
            this.legListDataPipes.forEach(pipe => { pipe.destroy(); });
        }
    }

    /** The FlightPlanTextFromToArrow component. */
    class FlightPlanTextFromToArrow extends msfssdk.DisplayComponent {
        constructor() {
            super(...arguments);
            this.rootStyle = msfssdk.ObjectSubject.create({ height: '', 'margin-top': '', 'margin-left': '' });
            this.path = msfssdk.MappedSubject.create(([fromIndex, toIndex]) => {
                if (toIndex === undefined || toIndex < 0 || (fromIndex !== undefined && fromIndex < 0 && toIndex > 4)) {
                    return '';
                }
                if (fromIndex === undefined) {
                    const marginTopPx = (toIndex * this.props.listItemHeightPx) + 0;
                    this.rootStyle.set('height', '50px');
                    this.rootStyle.set('margin-top', marginTopPx.toFixed(0));
                    this.rootStyle.set('margin-left', '0px');
                    return 'M 5 9 L 5 14 l 10 0 l 0 5 l 8 -8 l -8 -7 l 0 5 Z';
                }
                const distance = toIndex - fromIndex;
                const longPart = (distance * this.props.listItemHeightPx) + 8;
                const marginTopPx = fromIndex * this.props.listItemHeightPx;
                this.rootStyle.set('height', (longPart + 100).toFixed(0));
                this.rootStyle.set('margin-top', marginTopPx.toFixed(0));
                this.rootStyle.set('margin-left', '0px');
                // The first part of the path is the FROM part of the arrow
                // The second part is the TO part with the arrow head
                // The second part is realtively positioned, so we only have to changing 1 Y value to stretch the whole arrow
                return `M 9 18 c 0 -4 0 -4 3 -4 l 11 0 l 0 -5 L 10 9 c -6 0 -6 0 -6 6 L 4 ${longPart} c 0 6 0 6 6 6 l 5 0 l 0 5 l 8 -8 l -8 -7 l 0 5 c -6 0 -6 0 -6 -4 Z`;
            }, this.props.fromIndex, this.props.toIndex);
        }
        /** @inheritdoc */
        render() {
            return (msfssdk.FSComponent.buildComponent("svg", { class: "flight-plan-text-from-to-arrow", style: this.rootStyle },
                msfssdk.FSComponent.buildComponent("path", { d: this.path, fill: "magenta" })));
        }
        /** Destroys subs and comps. */
        destroy() {
            this.path.destroy();
        }
    }

    /* eslint-disable @typescript-eslint/no-non-null-assertion */
    /** The FlightPlanTextPanel component. */
    class FlightPlanTextPanel extends msfssdk.DisplayComponent {
        constructor() {
            super(...arguments);
            this.unitsSettingManager = garminsdk.UnitsUserSettings.getManager(this.props.bus);
            this.dateTimeSettingManager = garminsdk.DateTimeUserSettings.getManager(this.props.bus);
            this.lastUpdate = msfssdk.Subject.create(undefined);
            this.clock = this.props.bus.getSubscriber().on('realTime').atFrequency(1 / 2).handle(() => this.update(), true);
            this.flightPlanTextUpdater = new FlightPlanTextUpdater(this.props.flightPlanStore, this.props.flightPlanListManager);
            this.topRow = msfssdk.Subject.create(undefined);
            this.selectedRow = msfssdk.Subject.create(undefined);
            this.legOrCum = this.props.mapInsetTextCumulativeSetting.map(x => x ? 'CUM' : 'Leg');
            this.classList = msfssdk.SetSubject.create(['flight-plan-text-panel', 'pane-inset-panel']);
            this.isResumed = false;
        }
        /** @inheritdoc */
        onAfterRender() {
            this.directToRandomSub = this.props.flightPlanStore.isDirectToRandomActive.sub(() => this.update(), false, true);
        }
        /**
         * When a flight plan text update event is received.
         * @param event The event.
         */
        onFlightPlanTextInsetEvent(event) {
            this.processEvent(event);
            this.update();
        }
        /**
         * Handles the update event.
         * @param event The event.
         */
        processEvent(event) {
            const plan = this.props.flightPlanStore.fms.getFlightPlan(this.props.flightPlanStore.planIndex);
            // Collapsed segment
            if (event.collapsedSegmentIndexes !== undefined) {
                const collapsedSegments = event.collapsedSegmentIndexes.map(x => plan.tryGetSegment(x));
                this.props.flightPlanListManager.collapsedAirwaySegments.set(collapsedSegments.filter(x => !!x));
            }
            // Top row
            if (event.topRowSegmentIndex === -1) {
                this.topRow.set(undefined);
            }
            else if (event.topRowSegmentLegIndex === -1) {
                const segment = plan.tryGetSegment(event.topRowSegmentIndex);
                if (!segment) {
                    this.topRow.set(undefined);
                    return;
                }
                const segmentData = this.props.flightPlanStore.segmentMap.get(segment);
                const segmentListData = this.props.flightPlanListManager.segmentDataMap.get(segmentData);
                this.topRow.set(segmentListData);
            }
            else {
                const leg = plan.tryGetLeg(event.topRowSegmentIndex, event.topRowSegmentLegIndex);
                if (!leg) {
                    this.topRow.set(undefined);
                    return;
                }
                const legData = this.props.flightPlanStore.legMap.get(leg);
                const legListData = this.props.flightPlanListManager.legDataMap.get(legData);
                this.topRow.set(legListData);
            }
            // Selected row
            if (event.selectedSegmentIndex === -1) {
                this.selectedRow.set(undefined);
            }
            else if (event.selectedSegmentLegIndex === -1) {
                const segment = plan.tryGetSegment(event.selectedSegmentIndex);
                if (!segment) {
                    this.selectedRow.set(undefined);
                    return;
                }
                const segmentData = this.props.flightPlanStore.segmentMap.get(segment);
                const segmentListData = this.props.flightPlanListManager.segmentDataMap.get(segmentData);
                this.selectedRow.set(segmentListData);
            }
            else {
                const leg = plan.tryGetLeg(event.selectedSegmentIndex, event.selectedSegmentLegIndex);
                if (!leg) {
                    this.selectedRow.set(undefined);
                    return;
                }
                const legData = this.props.flightPlanStore.legMap.get(leg);
                const legListData = this.props.flightPlanListManager.legDataMap.get(legData);
                this.selectedRow.set(legListData);
            }
        }
        /** Resumes the text panel. */
        resume() {
            var _a;
            this.isResumed = true;
            this.clock.resume(true);
            (_a = this.directToRandomSub) === null || _a === void 0 ? void 0 : _a.resume();
        }
        /** Pauses the text panel. */
        pause() {
            var _a;
            this.isResumed = false;
            this.clock.pause();
            (_a = this.directToRandomSub) === null || _a === void 0 ? void 0 : _a.pause();
        }
        /** Gets the latest text from the text updater so the rows can update. */
        update() {
            if (!this.isResumed) {
                return;
            }
            const update = this.flightPlanTextUpdater.getUpdateData(this.topRow.get());
            this.lastUpdate.set(update);
            const firstRow = update.rows[0];
            const secondRow = update.rows[1];
            const isDirectToRandom = firstRow && firstRow.type === 'leg' && firstRow.legData.isDirectToRandom;
            const isDirectToRandomWithHold = secondRow && secondRow.type === 'leg' && secondRow.legData.isDirectToRandom;
            this.classList.toggle('direct-to-random', !!isDirectToRandom);
            this.classList.toggle('direct-to-random-with-hold', !!isDirectToRandomWithHold);
        }
        /** @inheritdoc */
        render() {
            return (msfssdk.FSComponent.buildComponent("div", { class: this.classList },
                msfssdk.FSComponent.buildComponent("div", { class: "pane-inset-panel-title" }, "Active Flight Plan"),
                msfssdk.FSComponent.buildComponent("div", { class: "column-headers" },
                    msfssdk.FSComponent.buildComponent("div", { class: "dtk" }, "DTK"),
                    msfssdk.FSComponent.buildComponent("div", { class: "distance" },
                        msfssdk.FSComponent.buildComponent("div", null, this.legOrCum),
                        msfssdk.FSComponent.buildComponent("div", null, "DIS")),
                    msfssdk.FSComponent.buildComponent("div", { class: "altitude" }, "ALT"),
                    msfssdk.FSComponent.buildComponent("div", { class: "fuel" },
                        msfssdk.FSComponent.buildComponent("div", null, "Fuel"),
                        msfssdk.FSComponent.buildComponent("div", null, "REM")),
                    msfssdk.FSComponent.buildComponent("div", { class: "ete" },
                        msfssdk.FSComponent.buildComponent("div", null, this.legOrCum),
                        msfssdk.FSComponent.buildComponent("div", null, "ETE")),
                    msfssdk.FSComponent.buildComponent("div", { class: "eta" }, "ETA")),
                msfssdk.FSComponent.buildComponent("div", { class: "direct-to-random-label" },
                    "Offroute ",
                    msfssdk.StringUtils.DIRECT_TO),
                msfssdk.FSComponent.buildComponent("div", { class: "header-line" }),
                msfssdk.FSComponent.buildComponent("div", { class: "direct-to-random-line" }),
                msfssdk.FSComponent.buildComponent("div", { class: "text-rows" },
                    [0, 1, 2, 3, 4].map(index => (msfssdk.FSComponent.buildComponent(FlightPlanTextRow, { index: index, bus: this.props.bus, store: this.props.flightPlanStore, unitsSettingManager: this.unitsSettingManager, dateTimeSettingManager: this.dateTimeSettingManager, data: this.lastUpdate, selectedRow: this.selectedRow, mapInsetTextCumulativeSetting: this.props.mapInsetTextCumulativeSetting }))),
                    msfssdk.FSComponent.buildComponent(FlightPlanTextFromToArrow, { fromIndex: this.lastUpdate.map(x => x === null || x === void 0 ? void 0 : x.fromIndex), toIndex: this.lastUpdate.map(x => x === null || x === void 0 ? void 0 : x.toIndex), listItemHeightPx: 36 }))));
        }
        /** Destroys subs and comps. */
        destroy() {
            var _a;
            this.clock.destroy();
            this.flightPlanTextUpdater.destroy();
            this.legOrCum.destroy();
            (_a = this.directToRandomSub) === null || _a === void 0 ? void 0 : _a.destroy();
        }
    }

    /* eslint-disable @typescript-eslint/no-non-null-assertion */
    /** The FlightPlanTextInset component. */
    class FlightPlanTextInset extends DisplayPaneInsetView {
        constructor() {
            super(...arguments);
            this.textPanelRef = msfssdk.FSComponent.createRef();
            this.vnavProfilePanelRef = msfssdk.FSComponent.createRef();
            this.displayPaneSizeMode = msfssdk.Subject.create(exports.DisplayPaneSizeMode.Hidden);
            this.classList = msfssdk.SetSubject.create(['flight-plan-text-inset']);
        }
        /** @inheritdoc */
        onAfterRender() {
            this.displayPaneSizeMode.sub(mode => {
                this.classList.toggle('show-vnav-box', mode === exports.DisplayPaneSizeMode.Full);
            }, true);
        }
        /** @inheritdoc */
        onResume(size, width, height) {
            var _a;
            this.displayPaneSizeMode.set(size);
            this.textPanelRef.instance.resume();
            (_a = this.vnavProfilePanelRef.getOrDefault()) === null || _a === void 0 ? void 0 : _a.resume();
        }
        /** @inheritdoc */
        onPause() {
            var _a;
            this.textPanelRef.instance.pause();
            (_a = this.vnavProfilePanelRef.getOrDefault()) === null || _a === void 0 ? void 0 : _a.pause();
        }
        /** @inheritdoc */
        onResize(size, width, height) {
            this.displayPaneSizeMode.set(size);
        }
        /**
         * Handles the flight plan text update event.
         * @param event The event.
         */
        onFlightPlanTextInsetEvent(event) {
            var _a;
            (_a = this.textPanelRef.getOrDefault()) === null || _a === void 0 ? void 0 : _a.onFlightPlanTextInsetEvent(event);
        }
        /** @inheritdoc */
        render() {
            return (msfssdk.FSComponent.buildComponent("div", { class: this.classList },
                msfssdk.FSComponent.buildComponent(FlightPlanTextPanel, { ref: this.textPanelRef, bus: this.props.bus, flightPlanStore: this.props.flightPlanStore, flightPlanListManager: this.props.flightPlanListManager, mapInsetTextCumulativeSetting: this.props.mapInsetTextCumulativeSetting }),
                !this.isPfd &&
                msfssdk.FSComponent.buildComponent(CurrentVnavProfilePanel, { ref: this.vnavProfilePanelRef, bus: this.props.bus, fms: this.props.flightPlanStore.fms, planIndex: this.props.flightPlanStore.planIndex, store: this.props.flightPlanStore, vnavDataProvider: this.props.vnavDataProvider })));
        }
        /** Destroys subs and comps. */
        destroy() {
            var _a, _b;
            (_a = this.textPanelRef.getOrDefault()) === null || _a === void 0 ? void 0 : _a.destroy();
            (_b = this.vnavProfilePanelRef.getOrDefault()) === null || _b === void 0 ? void 0 : _b.destroy();
        }
    }


    ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //ADDED BY MARWAN TO DRAW VSD
    class HJETVsdContents extends msfssdk.DisplayComponent {
        constructor() {
            super(...arguments);

            this.unitsSettingManager = garminsdk.UnitsUserSettings.getManager(this.props.bus);
            this.dateTimeSettingManager = garminsdk.DateTimeUserSettings.getManager(this.props.bus);
            this.lastUpdate = msfssdk.Subject.create(undefined);
            this.clock = this.props.bus.getSubscriber().on('realTime').atFrequency(1 / 2).handle(() => this.update(), true);
            this.flightPlanTextUpdater = new FlightPlanTextUpdater(this.props.flightPlanStore, this.props.flightPlanListManager);
            this.classList = msfssdk.SetSubject.create(['flight-plan-vsd-panel', 'pane-inset-panel']);
            this.isResumed = false;

            this.initializeAll = false;
            this.updatedFreq = 200
            this.updateSub = this.props.bus.getSubscriber().on('simTime').whenChangedBy(this.updatedFreq).handle(this.updateInstruments.bind(this));;

            this.paneIndex = this.props.paneIndex
            this.index = this.props.paneIndex

            this.ranOnce = false


            //initialize VSD variables
            this.flighPlanWaypoints = []
            this.zoomLevelsArray = [250 / 6067, 500 / 6067, 750 / 6067, 1000 / 6067, 0.25, 0.5, 0.75, 1, 1.5, 2.5, 4, 5, 7.5, 10, 15, 25, 40, 50, 75, 100, 150, 250, 400, 500, 750, 1000]
            this.fpaSteps = [11, 9.3, 9.2, 9.0, 8.4, 7.7, 6.5, 6.0, 5.4, 4.7, 4.46, 4.16, 3.8, 3.25, 3.25, 3.25, 3.25]
            this.initFpaSteps = [11, 10.4, 9.8, 9.3, 8.6, 7.9, 7.3, 6.6, 5.9, 5.3, 4.80, 4.3, 3.9, 3.46, 3.0, 2.9, 2.9]
            this.zoomFactor = 1
            this.maxHorizontalNM = this.zoomLevelsArray[16]
            this.maxHorizontalNM_LF = 0;
            this.minHorizontalNM = 0
            this.verticalStepNumber = 50
            this.verticalStepPixels = 55
            this.minVerticalPixel = 290
            this.maxVerticalPixel = -2288
            this.maxHorizontalPixels = 1228
            this.minHorizontalPixels = 232
            this.minVerticalFT = 0
            this.maxVerticalFT = Math.round(this.minVerticalFT + 600 * 8.33333 * this.maxHorizontalNM)
            this.verticalStepFT = (this.maxVerticalFT - this.minVerticalFT) / this.verticalStepNumber
            this.horScale = (this.maxHorizontalPixels - this.minHorizontalPixels) / (this.maxHorizontalNM - this.minHorizontalNM) / 2 //pixel perNM
            this.verticalBound = 500
            this.verticalScale = (this.maxVerticalPixel - this.minVerticalPixel) / (this.maxVerticalFT - this.minVerticalFT)
            this.selectedAlt = SimVar.GetSimVarValue("L:HJET_AP_ALT_VAR", "number")
            this.gardPixelHeight = -1 * this.airplaneAltitude * this.verticalScale
            this.initialVnavCommulativeDist = 0;
            this.vNavState = {}
            this.frameCounter = 0
            this.todCirclesArray = []
            this.altCaptureBool_LF = false;
            this.dummyBehindDistance = 0
            this.vnavActivePhase = "Climb"
            this.existinlinesarray = []
        }
        /** @inheritdoc */
        onAfterRender() {

            if (!this.ranOnce) {
                this.index = this.props.paneIndex
                this.generateFlightPlanWaypoints()
                this.buildVNAVdisplay()
                this.drawAltBug()
                this.buildWayPointMap()
                this.buildLoadingScreen()
                this.ranOnce
            }
            this.paneData = this.props.bus.getSubscriber().on("display_pane_view_event").handle(this.dealWithMapChange.bind(this))
            this.props.bus.getSubscriber().on(`mapRangeIndex`).handle(e => {
                console.log(`map range is `, e, `map range`)
            })

            this.wtMaxNm = this.props.mapRangeModule.nominalRange.value._number

            const fpl = this.props.bus.getSubscriber();
            // While these events and classes were refactored to handle more that one plan, in the case of the bottom target path calculator,
            // I have inhibited processing anything but plan index 0.
            // fpl.on('fplCreated').handle(e => e.planIndex === 0 && this.createVerticalPlan(e.planIndex));
            // fpl.on('fplCopied').handle(e => e.targetPlanIndex === 0 && this.onPlanChanged(e.targetPlanIndex));
            fpl.on('fplLoaded').handle(e => { this.rebuildWaypointMap(); console.log("fplLoaded", e) });
            fpl.on('fplLegChange').handle(e => { this.rebuildWaypointMap(); console.log("fplLegChange", e) });
            fpl.on('fplSegmentChange').handle(e => { this.rebuildWaypointMap(); console.log("fplSegmentChange", e) });
            fpl.on('fplIndexChanged').handle(e => { this.rebuildWaypointMap(); console.log("fplIndexChanged", e) });
            //  fpl.on('fplCalculated').handle(e=>{this.rebuildWaypointMap();console.log("fplCalculated",e)});
            fpl.on('vnav_path_calculated').handle(e => { this.rebuildWaypointMap(); console.log("vnav_path_calculated", e) });
            let fmaData = this.props.bus.getSubscriber().on('fma_data').handle(e => this.getApState(e))
            this.initializeAll = true;
        }
        /**
         * When a flight plan text update event is received.
         * @param event The event.
         */
        onFlightPlanTextInsetEvent(event) {
            this.processEvent(event);
            this.update();
        }

        getApState(data) {
            console.log("AP STATE is ", data)
            if (data.vnavState == 1) {
                SimVar.SetSimVarValue("L:VNAV_ARMED", "bool", true)
            } else {
                SimVar.SetSimVarValue("L:VNAV_ARMED", "bool", false)
            }

            if (data.vnavState == 2) {
                SimVar.SetSimVarValue("L:VNAV_ACTIVE", "bool", true)
            } else {
                SimVar.SetSimVarValue("L:VNAV_ACTIVE", "bool", false)
            }

            //this.initialAlt = data.altitideCaptureValue
            this.calculateInitialVnavAlt()
        }
        /**
         * Handles the update event.
         * @param event The event.
         */
        processEvent(event) {
            const plan = this.props.flightPlanStore.fms.getFlightPlan(this.props.flightPlanStore.planIndex);

        }
        /** Resumes the text panel. */
        resume() {
            var _a;
            this.isResumed = true;
            this.clock.resume(true);
            (_a = this.directToRandomSub) === null || _a === void 0 ? void 0 : _a.resume();
        }
        /** Pauses the text panel. */
        pause() {
            var _a;
            this.isResumed = false;
            this.clock.pause();
            (_a = this.directToRandomSub) === null || _a === void 0 ? void 0 : _a.pause();
        }
        /** Gets the latest text from the text updater so the rows can update. */
        update() {
            if (!this.isResumed) {
                return;
            }


        }

        dealWithMapChange(event) {
            console.log(event, this.paneIndex)
            if (this.paneIndex != event.displayPaneIndex) {
                return;
            }
            console.log(this.props)

            if (event.eventType == "display_pane_map_range_dec" || event.eventType == "display_pane_map_range_inc") {

                this.showloadingScreen();
                const timer1 = setTimeout(() => {
                    let elements = document.getElementsByClassName("graduationGroup")
                    for (let i = 0; i < elements.length; i++) {
                        elements[i].parentNode.removeChild(elements[i])
                    }
                    this.wtMaxNm = this.props.mapRangeModule.nominalRange.value._number
                    //  console.log("this.wtMaxNm", this.wtMaxNm, "event", event)
                    this.maxHorizontalNM = Math.min(Math.max(this.wtMaxNm * 1, 5), 250)

                    this.maxVerticalFT = Math.round(this.minVerticalFT + 600 * 8.33333 * this.maxHorizontalNM)
                    this.minVerticalFT = 0
                    this.verticalStepFT = (this.maxVerticalFT - this.minVerticalFT) / this.verticalStepNumber
                    this.horScale = ((this.maxHorizontalPixels - this.minHorizontalPixels) / (this.maxHorizontalNM - this.minHorizontalNM)) / 2 //pixel perNM
                    this.verticalScale = Math.round((this.maxVerticalPixel - this.minVerticalPixel) / (this.maxVerticalFT - this.minVerticalFT) * 10000) / 10000
                    this.buildVNAVdisplay()
                    this.drawAltBug()
                    this.rebuildWaypointMap()
                }, 100);

            }
        }

        updateInstruments() {
            if (!this.initializeAll) {
                return;
            }
            if (this.initializeAll) {
            }
            this.selectedAlt = SimVar.GetSimVarValue("L:HJET_AP_ALT_VAR", "number")
            this.airplaneAltitude = SimVar.GetSimVarValue("INDICATED ALTITUDE", "feet");
            if (this.graduationGroup) {
                this.gardPixelHeight = -1 * this.airplaneAltitude * this.verticalScale
                this.graduationGroup.setAttribute("transform", "translate(0," + this.gardPixelHeight + ")")
            }
            this.movableBugContainer.setAttribute("transform", "translate(117," + (this.getAltPixels(this.selectedAlt - 25) + this.gardPixelHeight) + ') scale(0.3,0.6) rotate(180)')
            this.dashedLineAlt.setAttribute("y1", (this.getAltPixels(this.selectedAlt - 25) + this.gardPixelHeight))
            this.dashedLineAlt.setAttribute("y2", (this.getAltPixels(this.selectedAlt - 25) + this.gardPixelHeight))
            this.airplaneIcon.setAttribute("transform", "translate(117 ,0) scale(0.95,1)")
            this.vBodyY = SimVar.GetSimVarValue("VELOCITY WORLD Y", "feet per second") * this.verticalScale
            this.vBodyZ = SimVar.GetSimVarValue("VELOCITY BODY Z", "feet per second") * 0.000164579 * this.horScale
            this.vVectorY = (this.vBodyY != 0) ? Math.atan(this.vBodyY / this.vBodyZ) * 180 / 3.141592 : 0;
            this.fpaAngle = this.vVectorY;
            this.airplaneAltitude = SimVar.GetSimVarValue("INDICATED ALTITUDE", "feet");
            this.realFpaAngle = (SimVar.GetSimVarValue("VELOCITY WORLD Y", "feet per second") != 0) ? Math.atan(SimVar.GetSimVarValue("VELOCITY WORLD Y", "feet per second") / SimVar.GetSimVarValue("VELOCITY BODY Z", "feet per second")) * 180 / 3.141592 : 0;
            SimVar.SetSimVarValue("L:HJET_AIRCRAFT_FPA", "NUMBER", this.realFpaAngle)
            if (this.vBodyZ >= 0.01) {
                // this.fpaLine.setAttribute("transform","rotate("+this.fpaAngle*1+',238,282)')
                this.fpaLine.setAttribute("transform", "rotate(" + this.fpaAngle * 1 + ',238,282)')
            } else {
                this.fpaLine.setAttribute("transform", "rotate(" + 0 + ',238,282)')
            }

            this.fpaLine.setAttribute("width", 10 * this.horScale)

            this.generateFlightPlanWaypoints()

        }
        checkIfAltCaptured() {


            let vnavPhase = SimVar.GetSimVarValue("L:HJET_VNAV_PHASE", "number")

            this.altCaptureBool = SimVar.GetSimVarValue("AUTOPILOT ALTITUDE LOCK", "bool")
            if (this.altCaptureBool != this.altCaptureBool_LF) {
                this.calculateInitialVnavAlt(true, 4)
                this.altCaptureBool_LF = this.altCaptureBool
                return;
            }


        }

        buildLoadingScreen() {
            this.rootContainer = document.getElementById("vsdContentsRoot" + this.index)

            this.LoadingRoot = document.createElementNS(Avionics.SVG.NS, "svg");
            this.LoadingRoot.setAttribute("width", "100%");
            this.LoadingRoot.setAttribute("height", "100%");
            this.LoadingRoot.setAttribute("viewBox", "0 0 1299 500");
            this.LoadingRoot.setAttribute("id", "loadingSVG" + this.index)
            this.LoadingRoot.setAttribute("class", "loadingSVG" + this.index)

            this.LoadingRoot.setAttribute("style", "position:absolute; left:-10px")
            this.rootContainer.appendChild(this.LoadingRoot)

            this.loadingContainer = document.createElementNS(Avionics.SVG.NS, "g");
            this.loadingbackgroundRect = document.createElementNS(Avionics.SVG.NS, "rect")
            this.loadingbackgroundRect.setAttribute("id", "loading!" + this.index)
            this.loadingbackgroundRect.setAttribute("width", 2000)
            this.loadingbackgroundRect.setAttribute("height", 680)
            this.loadingbackgroundRect.setAttribute("x", 5)
            this.loadingbackgroundRect.setAttribute("y", 50)
            this.loadingbackgroundRect.setAttribute("fill", "black")
            this.loadingContainer.appendChild(this.loadingbackgroundRect);
            this.loadingtext = document.createElementNS(Avionics.SVG.NS, "text");
            this.loadingtext.setAttribute("x", "880");
            this.loadingtext.setAttribute("y", "250");
            this.loadingtext.setAttribute("fill", "grey");
            this.loadingtext.setAttribute("font-size", "50");
            this.loadingtext.setAttribute("transform", " scale(0.7,1)");
            this.loadingtext.setAttribute("font-family", "HDJTnumeralBold");
            this.loadingtext.setAttribute("text-anchor", "middle");
            this.loadingtext.textContent = "LOADING...";
            this.loadingContainer.appendChild(this.loadingtext);
            this.loadingContainer.setAttribute("display", "none");
            this.LoadingRoot.appendChild(this.loadingContainer)
        }

        buildVNAVdisplay() {

            let elements = document.getElementsByClassName("mainSVG" + this.index)
            if (elements) {
                for (let i = 0; i < elements.length; i++) {
                    elements[i].parentNode.removeChild(elements[i])
                }
            }

            this.rootContainer = document.getElementById("vsdContentsRoot" + this.index)

            let existing = document.getElementById("mainSVG" + this.index)

            if (!existing) {

                this.root = document.createElementNS(Avionics.SVG.NS, "svg");
                this.root.setAttribute("width", "100%");
                this.root.setAttribute("height", "100%");
                this.root.setAttribute("viewBox", "0 0 1299 500");
                this.root.setAttribute("id", "mainSVG" + this.index)
                this.root.setAttribute("class", "mainSVG" + this.index)

                this.root.setAttribute("style", "position:absolute; left:-20px")
                this.rootContainer.insertBefore(this.root, this.rootContainer.firstChild)
            }


            let centerX = 105
            this.gradTextsArray = []
            this.graduationGroup = document.createElementNS(Avionics.SVG.NS, "g");
            this.graduationGroup.setAttribute("id", "graduationGroup" + this.index)
            this.graduationGroup.setAttribute("class", "graduationGroup" + this.index)
            this.root.insertBefore(this.graduationGroup, this.root.firstChild)
            for (let i = -this.verticalStepNumber; i <= 0; i++) {
                //ticks
                let gradAlt = this.getAltPixels(-i * this.verticalStepFT + this.minVerticalFT)
                let grad = document.createElementNS(Avionics.SVG.NS, "rect");
                grad.setAttribute("x", i % 2 == 0 ? centerX : centerX + 8.5);
                grad.setAttribute("y", gradAlt);
                grad.setAttribute("height", "5");
                grad.setAttribute("width", i % 2 == 0 ? "17" : "8.5");
                grad.setAttribute("fill", "white");
                this.graduationGroup.appendChild(grad);
                //text
                let textGrad = document.createElementNS(Avionics.SVG.NS, "text");
                textGrad.setAttribute("x", centerX - 1);
                textGrad.setAttribute("y", gradAlt + 10);
                textGrad.setAttribute("fill", "white");
                textGrad.setAttribute("font-size", "25");
                textGrad.setAttribute("font-family", "HDJTnumeral");
                textGrad.setAttribute("text-anchor", "end");
                textGrad.textContent = i % 2 == 0 ? (-i * this.verticalStepFT + this.minVerticalFT).toFixed(0) : ""
                this.gradTextsArray.push(textGrad)
                this.graduationGroup.appendChild(textGrad);
            }
            let defs = document.createElementNS(Avionics.SVG.NS, "defs");
            let groundGradient = document.createElementNS(Avionics.SVG.NS, "linearGradient");
            this.graduationGroup.appendChild(defs)
            var stops = [
                {
                    "color": "#4e3823",
                    "offset": "0%"
                }, {
                    "color": "#bc8245",
                    "offset": "100%"
                }
            ];
            for (var i = 0, length = stops.length; i < length; i++) {
                var stop = document.createElementNS(Avionics.SVG.NS, 'stop');
                stop.setAttribute('offset', stops[i].offset);
                stop.setAttribute('stop-color', stops[i].color);
                groundGradient.appendChild(stop);
            }
            groundGradient.id = 'groundGradient';
            groundGradient.setAttribute('x1', '0');
            groundGradient.setAttribute('x2', '0');
            groundGradient.setAttribute('y1', '0');
            groundGradient.setAttribute('y2', '1');
            defs.appendChild(groundGradient);
            let gourundPoly = document.createElementNS(Avionics.SVG.NS, "rect");
            gourundPoly.setAttribute("x", 122);
            gourundPoly.setAttribute("y", this.getAltPixels(0));
            gourundPoly.setAttribute("height", 500);
            gourundPoly.setAttribute("width", 1299);
            gourundPoly.setAttribute("fill", "url(#groundGradient)");
            this.graduationGroup.appendChild(gourundPoly)
            this.showgraduationGroup()
        }

        showgraduationGroup() {
            this.graduationGroup.setAttribute("display", "")
        }
        getAltPixels(altFeet) {
            let altPixels = (altFeet - this.minVerticalFT) * this.verticalScale + this.minVerticalPixel
            return altPixels
        }
        getHorPixels(distance) {
            let horPixels = (this.horScale * distance) + this.minHorizontalPixels
            return horPixels
        }
        drawAltBug() {

            let centerYAlt = 0
            let centerX = 105
            //dasher horizontal line
            this.dashedLineAlt = document.createElementNS(Avionics.SVG.NS, "line");
            this.dashedLineAlt.setAttribute("x1", "117")
            this.dashedLineAlt.setAttribute("y1", centerYAlt)
            this.dashedLineAlt.setAttribute("x2", "1299")
            this.dashedLineAlt.setAttribute("y2", centerYAlt)
            this.dashedLineAlt.setAttribute("stroke-width", "3")
            this.dashedLineAlt.setAttribute("stroke", "grey")
            this.dashedLineAlt.setAttribute("stroke-dasharray", "20,12")
            // selected alt bug
            this.selectedAltitudeBug = document.createElementNS(Avionics.SVG.NS, "polygon");
            this.selectedAltitudeBug.setAttribute("points", "-20, " + (centerYAlt - 30) + " 20, " + (centerYAlt - 30) + " 20, " + (centerYAlt - 10) + " 5, " + centerYAlt + " 20, " + (centerYAlt + 10) + " 20, " + (centerYAlt + 30) + " -20, " + (centerYAlt + 30));
            this.selectedAltitudeBug.setAttribute("fill", "#36c8d2");
            this.movableBugContainer = document.createElementNS(Avionics.SVG.NS, "g");
            this.movableBugContainer.appendChild(this.selectedAltitudeBug);
            this.root.appendChild(this.dashedLineAlt);
            this.root.appendChild(this.movableBugContainer);
            this.movableBugContainer.setAttribute("transform", "translate(117," + this.getAltPixels(this.selectedAlt) + ') scale(0.3,0.6) rotate(180)')
            this.airplaneIcon = document.createElementNS(Avionics.SVG.NS, "path");
            this.airplaneIcon.setAttribute("d", "M 89.21 273.36 C 92.39 273.36 98.9 274.22 102.44 278.07 C 103.8 279.55 116.6 279.79 118.99 282.18 C 121.64 284.83 114.26 288.64 102.98 289.44 C 90.67 290.32 52.16 292.61 45.22 290.43 C 33.17 286.65 16.5 281.2 18.06 278.59 L 6.66 256.7 L 20.84 256.7 L 45.44 274.18 C 45.47 274.15 77.73 273.36 89.21 273.36 Z")
            this.airplaneIcon.setAttribute("fill", "white")
            // this.airplaneIcon.setAttribute("transform","translate(117 ," +(this.getAltPixels(this.airplaneAltitude) - 282)+") scale(0.95,1)")
            this.airplaneIcon.setAttribute("transform", "translate(117 ,0) scale(0.95,1)")
            this.root.appendChild(this.airplaneIcon);
            //fpa line
            this.fpaLine = document.createElementNS(Avionics.SVG.NS, "rect");
            this.fpaLine.setAttribute("height", 7)
            this.fpaLine.setAttribute("width", this.getHorPixels(2))
            this.fpaLine.setAttribute("y", 282)
            this.fpaLine.setAttribute("x", 238)
            this.fpaLine.setAttribute("fill", "blue")
            this.fpaLine.setAttribute("stroke", "blue")
            // this.fpaLine.setAttribute("transform","rotate("+this.fpaAngle*-1+',238,' +(this.getAltPixels(this.airplaneAltitude)+2)+")")
            this.fpaLine.setAttribute("transform", "translate(117 , - 282)) scale(0.95,1)")

            this.root.appendChild(this.fpaLine)
            //main line left
            let aspectRatio = 0.3849
            let mainline = document.createElementNS(Avionics.SVG.NS, "rect");
            mainline.setAttribute("height", 415)
            mainline.setAttribute("width", 5)
            mainline.setAttribute("y", 85)
            mainline.setAttribute("x", centerX + 17)
            mainline.setAttribute("fill", "white")
            this.root.appendChild(mainline);

            this.selectedAltitudeFixedBug = document.createElementNS(Avionics.SVG.NS, "polygon");
            this.selectedAltitudeFixedBug.setAttribute("points", "10,-90 20,-90 20,-80 15,-75 20,-70 20,-60 10,-60 ");
            this.selectedAltitudeFixedBug.setAttribute("fill", "#67f8f1");
            this.selectedAltitudeFixedBug.setAttribute("transform", "translate (30,115) scale(-0.9,1)");
            this.selectedAltText = document.createElementNS(Avionics.SVG.NS, "text");
            this.selectedAltText.setAttribute("x", "170");
            this.selectedAltText.setAttribute("y", "50");
            this.selectedAltText.setAttribute("fill", "#36c8d2");
            this.selectedAltText.setAttribute("font-size", "32");
            this.selectedAltText.setAttribute("transform", " scale(0.8,1)");
            this.selectedAltText.setAttribute("font-family", "HDJTnumeralBold");
            this.selectedAltText.setAttribute("text-anchor", "end");
            this.selectedAltText.textContent = "10000";
            let backgroundRecatngleText = document.createElementNS(Avionics.SVG.NS, "rect");
            backgroundRecatngleText.setAttribute("x", 10);
            backgroundRecatngleText.setAttribute("y", 20);
            backgroundRecatngleText.setAttribute("height", 50);
            backgroundRecatngleText.setAttribute("width", 140);
            backgroundRecatngleText.setAttribute("fill", "black");
            this.root.appendChild(backgroundRecatngleText);
            this.root.appendChild(this.selectedAltText);
            this.root.appendChild(this.selectedAltitudeFixedBug);

        }

        showloadingScreen() {
            console.log("show loading screen")
            this.loadingContainer.setAttribute("display", "");
            const timer = setTimeout(() => {
                this.hideLoadingScreen()
            }, 1000);

        }
        hideLoadingScreen() {
            console.log("hide loading screen")
            this.loadingContainer.setAttribute("display", "none");

        }
        async rebuildWaypointMap(a = 0) {
            this.showloadingScreen()
            const timer1 = setTimeout(() => {
                console.log("rebuild way point map is triggered by  " + a)
                let element = document.getElementById("waypointContainer" + this.index);
                if (element) { element.parentNode.removeChild(element); }
                let element2 = document.getElementById("wpNamesContainer" + this.index);
                if (element2) { element2.parentNode.removeChild(element2); }
                this.existinlinesarray = []
                this.buildWayPointMap()
            }, 800)
        }
        async buildWayPointMap() {
            if (!this.graduationGroup) {
                return;
            }
            console.log("waypointMapBuilt")
            this.waypointMapArray = []
            let existingWaypointNamesContainer = document.getElementById("wpNamesContainer" + this.index)
            let existingWaypointContainer = document.getElementById("waypointContainer" + this.index)
            if (!existingWaypointContainer) {
                this.waypointMapContainer = document.createElementNS(Avionics.SVG.NS, "g");
                this.waypointMapContainer.id = "waypointContainer" + this.index
                this.graduationGroup.appendChild(this.waypointMapContainer)
            }
            if (!existingWaypointNamesContainer) {
                this.wpNamesContainer = document.createElementNS(Avionics.SVG.NS, "g");
                this.wpNamesContainer.id = "wpNamesContainer" + this.index
                this.root.appendChild(this.wpNamesContainer)
            }
            for (let i = 0; i < this.flighPlanWaypoints.length; i++) {
                this.waypointMapArray.push(this.flighPlanWaypoints[i])
                if (!this.flighPlanWaypoints[i].HIDDEN && this.flighPlanWaypoints[i].ICAO != "removed") {
                    let wpAlt = this.getAltPixels(this.flighPlanWaypoints[i].ALT)
                    let wpDist = this.getHorPixels(this.flighPlanWaypoints[i].CommulativeDistance)
                    let wpAlt1;
                    let wpAlt2;
                    let autoloaded = this.flighPlanWaypoints[i].AUTOLOADED
                    let color = "cyan"
                    if (autoloaded) {
                        color = "magenta"
                    }

                    if (this.flighPlanWaypoints[i].ALT1) {
                        wpAlt1 = this.getAltPixels(this.flighPlanWaypoints[i].ALT1)
                    }
                    if (this.flighPlanWaypoints[i].ALT2) {
                        wpAlt2 = this.getAltPixels(this.flighPlanWaypoints[i].ALT2)
                    }
                    let verticalDashedWP = document.createElementNS(Avionics.SVG.NS, "line");
                    verticalDashedWP.setAttribute("x1", wpDist.toFixed(0)) //control ok
                    verticalDashedWP.setAttribute("y1", 0)
                    verticalDashedWP.setAttribute("x2", wpDist.toFixed(0)) //control
                    verticalDashedWP.setAttribute("y2", 500)
                    verticalDashedWP.setAttribute("stroke-width", "2")
                    verticalDashedWP.setAttribute("stroke", "grey")
                    verticalDashedWP.setAttribute("stroke-dasharray", "20,12")
                    let wpTriangle1
                    let wpTriangle2
                    let wpTriangle
                    if (wpAlt1) {
                        wpTriangle1 = document.createElementNS(Avionics.SVG.NS, "polygon");
                        wpTriangle1.setAttribute("points", "-8,0 0,-16 8,0");
                        wpTriangle1.setAttribute("stroke", this.flighPlanWaypoints[i].DESIGNATED ? color : "white")
                        wpTriangle1.setAttribute("stroke-width", "3")
                        wpTriangle1.setAttribute("transform", "translate(" + wpDist.toFixed(0) + "," + (wpAlt1 + 16).toFixed(0) + ")")  //control ok
                        this.waypointMapContainer.appendChild(wpTriangle1)
                    }
                    if (wpAlt2) {
                        wpTriangle2 = document.createElementNS(Avionics.SVG.NS, "polygon");
                        wpTriangle2.setAttribute("points", "-8,0 0,16 8,0");
                        wpTriangle2.setAttribute("stroke", this.flighPlanWaypoints[i].DESIGNATED ? color : "white")
                        wpTriangle2.setAttribute("stroke-width", "3")
                        wpTriangle2.setAttribute("transform", "translate(" + wpDist.toFixed(0) + "," + (wpAlt2 - 16).toFixed(0) + ")")  //control ok
                        this.waypointMapContainer.appendChild(wpTriangle2)
                    }
                    if (!wpAlt1 && !wpAlt2 && this.flighPlanWaypoints[i].ALT) {
                        wpTriangle = document.createElementNS(Avionics.SVG.NS, "polygon");
                        wpTriangle.setAttribute("points", "-8,0 0,-16 8,0");
                        wpTriangle.setAttribute("stroke", this.flighPlanWaypoints[i].DESIGNATED ? color : "white")
                        wpTriangle.setAttribute("stroke-width", "3")
                        wpTriangle.setAttribute("transform", "translate(" + wpDist.toFixed(0) + "," + (wpAlt + 16).toFixed(0) + ")")  //control ok
                        this.waypointMapContainer.appendChild(wpTriangle)
                    }
                    let wpName = document.createElementNS(Avionics.SVG.NS, "text");
                    wpName.setAttribute("x", wpDist.toFixed(0)); //control
                    wpName.setAttribute("y", 40);
                    wpName.setAttribute("fill", "magenta");
                    wpName.setAttribute("font-size", "20");
                    wpName.setAttribute("font-family", "HDJTnumeral");
                    wpName.setAttribute("text-anchor", "middle");
                    wpName.textContent = " " + this.flighPlanWaypoints[i].ICAO + " " //control
                    this.wpNamesContainer.appendChild(verticalDashedWP)
                    this.wpNamesContainer.appendChild(wpName)
                    let namePlateRect = document.createElementNS(Avionics.SVG.NS, "rect");
                    this.wpNamesContainer.appendChild(namePlateRect);
                    let widtha = wpName.clientWidth
                    namePlateRect.setAttribute("height", 30)
                    namePlateRect.setAttribute("width", widtha + 4) //control
                    namePlateRect.setAttribute("y", 17)
                    namePlateRect.setAttribute("x", wpDist.toFixed(0) - (widtha + 4) / 2) //control
                    namePlateRect.setAttribute("fill", "black")
                    namePlateRect.setAttribute("stroke", "grey")
                    namePlateRect.setAttribute("stroke-width", "3")
                    let wpName2 = document.createElementNS(Avionics.SVG.NS, "text");
                    this.wpNamesContainer.appendChild(wpName2);
                    wpName2.setAttribute("x", wpDist.toFixed(0)); //control ok
                    wpName2.setAttribute("y", 40);
                    wpName2.setAttribute("fill", "magenta");
                    wpName2.setAttribute("font-size", "20");
                    wpName2.setAttribute("font-family", "HDJTnumeral");
                    wpName2.setAttribute("text-anchor", "middle");
                    wpName2.textContent = " " + this.flighPlanWaypoints[i].ICAO + " " //control


                    //this.graduationGroup.appendChild(waypointMapContainer)

                    /////////
                    if (this.flighPlanWaypoints[i].DESIGNATED && (this.flighPlanWaypoints[i].ALT != -300000 || this.flighPlanWaypoints[i].ALT1 != -300000 || this.flighPlanWaypoints[i].ALT2 != -300000)) {
                        let designatedAlt = document.createElementNS(Avionics.SVG.NS, "text");
                        designatedAlt.setAttribute("x", wpDist.toFixed(0)); //control
                        designatedAlt.setAttribute("y", 90);
                        designatedAlt.setAttribute("fill", "magenta");
                        designatedAlt.setAttribute("font-size", "20");
                        designatedAlt.setAttribute("font-family", "HDJTnumeral");
                        designatedAlt.setAttribute("text-anchor", "middle");
                        if (this.flighPlanWaypoints[i].ALT1) {
                            designatedAlt.textContent = " " + this.flighPlanWaypoints[i].ALT1 + " FT"
                        }
                        if (this.flighPlanWaypoints[i].ALT2) {
                            designatedAlt.textContent = " " + this.flighPlanWaypoints[i].ALT2 + " FT"
                        }
                        if (!this.flighPlanWaypoints[i].ALT1 && !this.flighPlanWaypoints[i].ALT2 && this.flighPlanWaypoints[i].ALT) {
                            designatedAlt.textContent = " " + this.flighPlanWaypoints[i].ALT + " FT" //control
                        }
                        this.wpNamesContainer.appendChild(designatedAlt)
                        let designatedPlateRect = document.createElementNS(Avionics.SVG.NS, "rect");
                        designatedPlateRect.setAttribute("height", 30)
                        let widthb = designatedAlt.clientWidth
                        designatedPlateRect.setAttribute("width", widthb + 4) //control ok
                        designatedPlateRect.setAttribute("y", 67)
                        designatedPlateRect.setAttribute("x", wpDist.toFixed(0) - (widthb + 4) / 2) //control   ok
                        designatedPlateRect.setAttribute("fill", "black")
                        designatedPlateRect.setAttribute("stroke-width", "3")
                        this.wpNamesContainer.appendChild(designatedPlateRect)
                        let designatedAlt2 = document.createElementNS(Avionics.SVG.NS, "text");
                        designatedAlt2.setAttribute("x", wpDist.toFixed(0)); //control ok
                        designatedAlt2.setAttribute("y", 90);
                        designatedAlt2.setAttribute("fill", color);
                        designatedAlt2.setAttribute("font-size", "20");
                        designatedAlt2.setAttribute("font-family", "HDJTnumeral");
                        designatedAlt2.setAttribute("text-anchor", "middle");
                        if (this.flighPlanWaypoints[i].ALT1) {
                            designatedAlt2.textContent = " " + this.flighPlanWaypoints[i].ALT1 + " FT"
                        }
                        if (this.flighPlanWaypoints[i].ALT2) {
                            designatedAlt2.textContent = " " + this.flighPlanWaypoints[i].ALT2 + " FT"
                        }
                        if (!this.flighPlanWaypoints[i].ALT1 && !this.flighPlanWaypoints[i].ALT2 && this.flighPlanWaypoints[i].ALT) {
                            designatedAlt2.textContent = " " + this.flighPlanWaypoints[i].ALT + " FT" //control
                        }
                        this.wpNamesContainer.appendChild(designatedAlt2)
                        let bottomline
                        let topline
                        if (wpAlt1) {
                            bottomline = document.createElementNS(Avionics.SVG.NS, "rect");
                            bottomline.setAttribute("height", 1)
                            bottomline.setAttribute("width", widthb + 4) //control
                            bottomline.setAttribute("y", 100)
                            bottomline.setAttribute("x", wpDist.toFixed(0) - (widthb + 4) / 2) //control
                            bottomline.setAttribute("fill", color)
                            bottomline.setAttribute("stroke", color)
                            bottomline.setAttribute("stroke-width", "1")
                            this.wpNamesContainer.appendChild(bottomline)
                        }
                        if (wpAlt2) {
                            topline = document.createElementNS(Avionics.SVG.NS, "rect");
                            topline.setAttribute("height", 1)
                            topline.setAttribute("width", widthb + 4) //control
                            topline.setAttribute("y", 60)
                            topline.setAttribute("x", wpDist.toFixed(0) - (widthb + 4) / 2) //control
                            topline.setAttribute("fill", color)
                            topline.setAttribute("stroke", color)
                            topline.setAttribute("stroke-width", "1")
                            this.wpNamesContainer.appendChild(topline)
                        }
                        if (!wpAlt2 && !wpAlt1 && wpAlt && this.flighPlanWaypoints[i].ALT) {
                            bottomline = document.createElementNS(Avionics.SVG.NS, "rect");
                            bottomline.setAttribute("height", 1)
                            bottomline.setAttribute("width", widthb + 4) //control
                            bottomline.setAttribute("y", 100)
                            bottomline.setAttribute("x", wpDist.toFixed(0) - (widthb + 4) / 2) //control
                            bottomline.setAttribute("fill", color)
                            bottomline.setAttribute("stroke", color)
                            bottomline.setAttribute("stroke-width", "1")
                            this.wpNamesContainer.appendChild(bottomline)
                            topline = document.createElementNS(Avionics.SVG.NS, "rect");
                            topline.setAttribute("height", 1)
                            topline.setAttribute("width", widthb + 4) //control
                            topline.setAttribute("y", 60)
                            topline.setAttribute("x", wpDist.toFixed(0) - (widthb + 4) / 2) //control
                            topline.setAttribute("fill", color)
                            topline.setAttribute("stroke", color)
                            topline.setAttribute("stroke-width", "1")
                            this.wpNamesContainer.appendChild(topline)
                        }
                        this.waypointMapArray[i].designatedAltRect = designatedPlateRect //ok
                        this.waypointMapArray[i].designatedAltPlacement = designatedAlt //ok
                        this.waypointMapArray[i].designatedAltPlacementWidth = designatedAlt.clientWidth //ok
                        this.waypointMapArray[i].designatedAltText = designatedAlt2 // ok
                        this.waypointMapArray[i].bottomline = bottomline
                        this.waypointMapArray[i].topline = topline
                    }
                    this.waypointMapArray[i].trianlge = wpTriangle  //ok
                    this.waypointMapArray[i].trianlge1 = wpTriangle1  //ok
                    this.waypointMapArray[i].trianlge2 = wpTriangle2  //ok
                    this.waypointMapArray[i].line = verticalDashedWP // ok
                    this.waypointMapArray[i].text = wpName2 //ok
                    this.waypointMapArray[i].placement = wpName //ok
                    this.waypointMapArray[i].placementWidth = wpName.clientWidth
                    this.waypointMapArray[i].placard = namePlateRect
                }
                if (this.debugmode) {
                    console.log(this.waypointMapArray)
                }
            }
            if (!this.allWaypointsWithPsudoArray) {
                return
            }
        }

        generateFlightPlanWaypoints() {
            this.frameCounter++
            if (this.frameCounter % 100 == 0) {
                SimVar.SetSimVarValue("K:HEADING_GYRO_SET", "number", 1)
            }
            this.flighPlanWaypoints = []

            let wtLegs = [];
            let wtVnavPlan = []
            let activePlanIndex = this.props.flightPlanStore.fms.flightPlanner._activePlanIndex
            let activeVerticalPlanIndex = this.props.flightPlanStore.fms.verticalPathCalculator.primaryPlanIndex
            this.distanceToActive = this.props.flightPlanStore.fms.lnavLegDistanceRemaining.value;
            this.activeIndex = this.props.flightPlanStore.fms.lnavTrackedLegIndex.value
            if (!this.props.flightPlanStore.fms.flightPlanner.flightPlans[activePlanIndex]) {
                SimVar.SetSimVarValue("L:HJET_LFE", "number", 99000)
                return;

            }

            this.vnavActivePhase = this.props.vnavDataProvider.vnavFlightPhase.value

            //Define WT arrays for segments and constraints
            let segmentsArray = this.props.flightPlanStore.fms.flightPlanner.flightPlans[activePlanIndex].planSegments
            let constraintsArray = this.props.flightPlanStore.fms.verticalPathCalculator.verticalFlightPlans[activeVerticalPlanIndex].constraints

            //get destination index
            let plan = this.props.flightPlanStore.fms.flightPlanner.flightPlans[activePlanIndex]

            let lnavIndex = this.props.flightPlanStore.fms.lnavTrackedLegIndex.value
            let firstDescentConstraint = this.props.flightPlanStore.fms.verticalPathCalculator.verticalFlightPlans[activeVerticalPlanIndex].firstDescentConstraintLegIndex
            let vnavTodDistance = this.props.vnavDataProvider.vnavTodDistance.value

            if (firstDescentConstraint >= 0
                && (lnavIndex > firstDescentConstraint
                    || vnavTodDistance <= 10) && vnavTodDistance) {
                //console.log("descending phase now")
                this.vnavActivePhase = "Descent";
            } else {
                this.vnavActivePhase = "Climb"
            }

            //combine All segments into one array
            for (let i = 0; i < segmentsArray.length; i++) {
                wtLegs = wtLegs.concat(segmentsArray[i].legs)
            }
            if (this.frameCounter % 25 == 0) {
                //  console.log("wtLegs", wtLegs, this.props)

                //console.log(lnavIndex,firstDescentConstraint,vnavTodDistance,this.vnavActivePhase,"this.vnavActivePhase","VALUES","vnavFlightPhase",this.props.vnavDataProvider.vnavFlightPhase.value,"phase",this.props.vnavDataProvider.phase.value)
            }

            // get destination leg
            let lastLeg = wtLegs.slice().reverse().find(e => e.flags != 2)
            if (lastLeg && plan.length > 1) {
                SimVar.SetSimVarValue("L:HJET_LFE", "number", lastLeg.leg.altitude1 * 3.28084)
            }


            //build vnav waypoints to draw from WT combined legs array
            for (let i = 0; i < wtLegs.length; i++) {
                let object = { ICAO: "TEST1", ALT: null, CommulativeDistance: 10, DESIGNATED: true, freezeInitAltCapture: false, ignoreAltConstraint: false, criticalPoint: false }

                //check if restriction:
                if (!wtLegs[i].calculated || wtLegs[i].calculated.cumulativeDistanceWithTransitions == undefined || !wtLegs[this.activeIndex] || !wtLegs[this.activeIndex].calculated || wtLegs[this.activeIndex].calculated.cumulativeDistanceWithTransitions == undefined) {
                    console.log("error at index", i)
                    continue;
                }

                //skip if missed approach
                if (wtLegs[i].flags == 2) {
                    continue;
                }

                //populate distances in HJET format
                if (i == this.activeIndex) {
                    object.ACTIVENAVPOINT = true
                    object.CommulativeDistance = this.distanceToActive
                } else if (i > this.activeIndex) {
                    object.ACTIVENAVPOINT = false;
                    object.CommulativeDistance = wtLegs[i].calculated.cumulativeDistanceWithTransitions * 0.000539957 - wtLegs[this.activeIndex].calculated.cumulativeDistanceWithTransitions * 0.000539957 + this.distanceToActive

                } else if (i < this.activeIndex) {
                    object.ACTIVENAVPOINT = false;
                    object.CommulativeDistance = this.distanceToActive - wtLegs[i].calculated.cumulativeDistanceWithTransitions * 0.000539957 - wtLegs[this.activeIndex].calculated.cumulativeDistanceWithTransitions * 0.000539957
                }

                //Fill waypoint attributes in HJET format
                object.ICAO = wtLegs[i].name;
                object.DESIGNATED = true;
                object.PATHDISTANCE = wtLegs[i].calculated.cumulativeDistanceWithTransitions * 0.000539957
                object.PHASE = wtLegs[i].verticalData.phase
                let equivalentConstraintData = constraintsArray.find(e => e.name == wtLegs[i].name && e.type != "missed")
                if (equivalentConstraintData) {
                    object.ISTARGET = equivalentConstraintData.isTarget
                    object.TARGETALT = equivalentConstraintData.targetAltitude * 3.28084
                    object.DescenttFPA = equivalentConstraintData.fpa
                }

                //assign constraints in HJET format
                if (wtLegs[i].verticalData.altDesc == 0) {
                    object.RESTRICTIONTYPE = "none"
                    if (wtLegs[i] == lastLeg || i == 0) {
                        object.RESTRICTIONTYPE = "AT"
                        object.ALT1 = Math.round(wtLegs[i].leg.altitude1 * 3.28084)
                        object.ALT2 = Math.round(wtLegs[i].leg.altitude1 * 3.28084)
                        object.ALT = Math.round(wtLegs[i].leg.altitude1 * 3.28084)
                    }
                } else if (wtLegs[i].verticalData.altDesc == 1) {
                    object.RESTRICTIONTYPE = "AT"
                    object.ALT1 = Math.round(wtLegs[i].verticalData.altitude1 * 3.28084)
                    object.ALT2 = Math.round(wtLegs[i].verticalData.altitude1 * 3.28084)
                    object.ALT = Math.round(wtLegs[i].verticalData.altitude1 * 3.28084)
                } else if (wtLegs[i].verticalData.altDesc == 2) {
                    object.ALT1 = Math.round(wtLegs[i].verticalData.altitude1 * 3.28084)
                    object.ALT2 = null
                    object.RESTRICTIONTYPE = "ATABOVE"
                } else if (wtLegs[i].verticalData.altDesc == 3) {
                    object.ALT1 = null
                    object.ALT2 = Math.round(wtLegs[i].verticalData.altitude1 * 3.28084)
                    object.RESTRICTIONTYPE = "ATBELOW"
                } else if (wtLegs[i].verticalData.altDesc == 4) {
                    object.ALT1 = Math.round(wtLegs[i].verticalData.altitude2 * 3.28084)
                    object.ALT2 = Math.round(wtLegs[i].verticalData.altitude1 * 3.28084)
                    object.RESTRICTIONTYPE = "BETWEEN"
                }

                this.flighPlanWaypoints.push(object)

            }

            // console.log("this.flighPlanWaypoints", this.flighPlanWaypoints)
            this.checkIfAltCaptured()
            this.updateWaypointMap()
            this.addPseudoPointsToWaypoint()
            this.getVnavState()
            this.renderVnavLines()


            function descending(a, b) {
                return a.distance - b.distance
            }
        }

        updateWaypointMap() {
            if (!this.waypointMapArray) {
                return
            }
            if (!this.waypointMapArray.length > 0) {
                return
            }
            for (let i = 0; i < this.flighPlanWaypoints.length; i++) {
                let wpAlt = this.getAltPixels(this.flighPlanWaypoints[i].ALT)
                let wpDist = this.getHorPixels(this.flighPlanWaypoints[i].CommulativeDistance)
                let wpAlt1 = this.getAltPixels(this.flighPlanWaypoints[i].ALT1)
                let wpAlt2 = this.getAltPixels(this.flighPlanWaypoints[i].ALT2)
                if (!this.waypointMapArray[i]) {
                    continue;
                }
                if (this.waypointMapArray[i].bottomline) {
                    this.waypointMapArray[i].bottomline.setAttribute("x", wpDist.toFixed(0) - (this.waypointMapArray[i].designatedAltPlacementWidth + 4) / 2)
                    this.waypointMapArray[i].bottomline.setAttribute("width", this.waypointMapArray[i].designatedAltPlacementWidth + 4)
                }
                if (this.waypointMapArray[i].topline) {
                    this.waypointMapArray[i].topline.setAttribute("x", wpDist.toFixed(0) - (this.waypointMapArray[i].designatedAltPlacementWidth + 4) / 2)
                    this.waypointMapArray[i].topline.setAttribute("width", this.waypointMapArray[i].designatedAltPlacementWidth + 4)
                }
                if (this.waypointMapArray[i].designatedAltPlacement) {
                    this.waypointMapArray[i].designatedAltPlacement.setAttribute("x", wpDist.toFixed(0));
                }
                if (this.waypointMapArray[i].designatedAltRect) {
                    this.waypointMapArray[i].designatedAltRect.setAttribute("x", wpDist.toFixed(0) - (this.waypointMapArray[i].designatedAltPlacementWidth + 4) / 2)
                    this.waypointMapArray[i].designatedAltRect.setAttribute("width", this.waypointMapArray[i].designatedAltPlacementWidth + 4)
                }
                if (this.waypointMapArray[i].designatedAltText) {
                    this.waypointMapArray[i].designatedAltText.setAttribute("x", wpDist.toFixed(0));
                }
                if (this.waypointMapArray[i].trianlge) {
                    this.waypointMapArray[i].trianlge.setAttribute("transform", "translate(" + wpDist.toFixed(0) + "," + (wpAlt + 16).toFixed(0) + ")")
                }
                if (this.waypointMapArray[i].trianlge1) {
                    this.waypointMapArray[i].trianlge1.setAttribute("transform", "translate(" + wpDist.toFixed(0) + "," + (wpAlt1 + 16).toFixed(0) + ")")
                }
                if (this.waypointMapArray[i].trianlge2) {
                    this.waypointMapArray[i].trianlge2.setAttribute("transform", "translate(" + wpDist.toFixed(0) + "," + (wpAlt2 - 16).toFixed(0) + ")")
                }
                if (this.waypointMapArray[i].line) {
                    this.waypointMapArray[i].line.setAttribute("x1", wpDist.toFixed(0))
                    this.waypointMapArray[i].line.setAttribute("x2", wpDist.toFixed(0))
                }
                if (this.waypointMapArray[i].text) {
                    this.waypointMapArray[i].text.setAttribute("x", wpDist.toFixed(0));
                }
                if (this.waypointMapArray[i].placement) {
                    this.waypointMapArray[i].placement.setAttribute("x", wpDist.toFixed(0));
                }
                if (this.waypointMapArray[i].placard) {
                    this.waypointMapArray[i].placard.setAttribute("x", wpDist.toFixed(0) - (this.waypointMapArray[i].placementWidth + 4) / 2)
                }
            }
            for (let i = 0; i <= this.todCirclesArray.length - 1; i++) {
                let existsinpseudoArray = this.allWaypointsWithPsudoArray.find((e) => e.ICAO == this.todCirclesArray[i].id)
                if (!existsinpseudoArray || existsinpseudoArray.ignoreAltConstraint == true) {
                    let elem = document.getElementById(this.todCirclesArray[i].id)
                    if (elem) {

                        elem.parentNode.removeChild(elem)
                        this.todCirclesArray = this.todCirclesArray.filter(e => e.id != this.todCirclesArray[i].id)
                    }
                }
            }
            for (let i = 0; i <= this.allWaypointsWithPsudoArray.length - 1; i++) {

                if (((this.allWaypointsWithPsudoArray[i].TYPE == "TOD" || this.allWaypointsWithPsudoArray[i].TYPE == "TODs") && this.allWaypointsWithPsudoArray[i].ignoreAltConstraint != true)) {
                    let existingTODelement = document.getElementById(this.allWaypointsWithPsudoArray[i].ICAO)
                    if (existingTODelement) {
                        this.updateTOD(existingTODelement, this.allWaypointsWithPsudoArray[i].CommulativeDistance, this.allWaypointsWithPsudoArray[i].ALT, this.allWaypointsWithPsudoArray[i].ICAO)
                    } else {
                        let todContainer = document.createElementNS(Avionics.SVG.NS, "g");
                        todContainer.id = this.allWaypointsWithPsudoArray[i].ICAO
                        let todCircle = document.createElementNS(Avionics.SVG.NS, "circle");
                        todCircle.id = "todCircle" + this.allWaypointsWithPsudoArray[i].ICAO + this.index
                        todCircle.setAttribute("cx", this.getHorPixels(this.allWaypointsWithPsudoArray[i].CommulativeDistance)) //control
                        todCircle.setAttribute("cy", this.getAltPixels(this.allWaypointsWithPsudoArray[i].ALT)) //control
                        todCircle.setAttribute("r", "10")
                        todCircle.setAttribute("fill", "transparent")
                        todCircle.setAttribute("stroke", "grey")
                        todCircle.setAttribute("stroke-width", "3")
                        let TODtext = document.createElementNS(Avionics.SVG.NS, "text");
                        TODtext.id = "todText" + this.allWaypointsWithPsudoArray[i].ICAO + this.index
                        TODtext.setAttribute("x", this.getHorPixels(this.allWaypointsWithPsudoArray[i].CommulativeDistance)); //control
                        TODtext.setAttribute("y", this.getAltPixels(this.allWaypointsWithPsudoArray[i].ALT) - 30); //control
                        TODtext.setAttribute("fill", "grey");
                        TODtext.setAttribute("font-size", "25");
                        TODtext.setAttribute("font-family", "HDJTnumeral");
                        TODtext.setAttribute("text-anchor", "middle");
                        TODtext.textContent = this.allWaypointsWithPsudoArray[i].TYPE == "TOD" || "TODs" ? "TOD" : "TOC"
                        todContainer.appendChild(todCircle)
                        todContainer.appendChild(TODtext)
                        this.waypointMapContainer.appendChild(todContainer)
                        let existing = this.todCirclesArray.find(e => e.id === todContainer.id)
                        if (!existing) {

                            this.todCirclesArray.push(todContainer)
                        }
                    }
                }
            }
            if (this.debugmode) {
                console.log(this.waypointMapArray)
            }

        }
        updateTOD(existingTODelement, dist, alt, parent) {
            let todCircle = document.getElementById("todCircle" + parent + this.index)
            let TODtext = document.getElementById("todText" + parent + this.index)
            todCircle.setAttribute("cx", this.getHorPixels(dist)) //control
            todCircle.setAttribute("cy", this.getAltPixels(alt)) //control
            TODtext.setAttribute("x", this.getHorPixels(dist)); //control
            TODtext.setAttribute("y", this.getAltPixels(alt) - 30); //control
        }
        async calculateInitialVnavAlt(captureCurrentAlt = true, calledby) {

            // console.log("alt is captured ", Date.now(), "initial alt", this.initialAlt, "Called by", calledby)

            if (!this.flighPlanWaypoints.length > 1 || !this.activeIndex || this.distanceToActive == undefined) {
                return;
            }

            // this.initialVnavCommulativeDist = this.flighPlanWaypoints[this.activeIndex].PATHDISTANCE - this.distanceToActive

            this.initialVnavCommulativeDist = -0.5

            SimVar.SetSimVarValue("L:HJET_VNAV_PHASE_INIT_ALT", "number", this.initialAlt)


        }


        async getVnavState() {
            if (this.suspend == true) {
                console.log("returned due to suspend")
                return;

            }
            if (!this.vnavValid || !this.allWaypointsWithPsudoArray.length > 0) {
                SimVar.SetSimVarValue("L:HJET_VNAV_STATE", "number", 999)
                SimVar.SetSimVarValue("L:HJET_IS_AT_TOD", "bool", false)
                SimVar.SetSimVarValue("L:HJET_IS_APPORACHING_TOD", "bool", false)
                return
            }

            let index = this.allWaypointsWithPsudoArray.findIndex((element) => element.ICAO == "acftPosInit")

            this.destinationWPLF = this.destinationWP
            this.destinationWP = this.allWaypointsWithPsudoArray.find((element) => element.ALT
                && element.DESIGNATED
                && element.CommulativeDistance > 0
                && element.ICAO != "acftPosCurrent"
                && element.ICAO != "acftPosInit"
                && element.TYPE != "CLIMBFINAL"
                && element.TYPE != "CLIMB"
                && element.criticalPoint == true
                || ((element.TYPE == "TOD" || element.TYPE == "TOC" || element.TYPE == "BOD" || element.TYPE == "TODs") && element.CommulativeDistance > 0))
            this.activeVnavWaypoint = this.allWaypointsWithPsudoArray.find((element) => element.DESIGNATED && element.CommulativeDistance > 0 && element.ICAO != "acftPosCurrent" && element.ICAO != "acftPosInit" && element.TYPE != "CLIMBMAX" && element.TYPE != "CLIMB" && element.TYPE != "BOD" && (element.ignoreAltConstraint != true || element.criticalPoint == true))
            if (!this.destinationWP) {
                this.destinationWP = this.allWaypointsWithPsudoArray.find((element) => element.ICAO == "endPoint")
            }
            if (!this.destinationWP) {
                return;
            }
            if (this.destinationWPLF && this.destinationWPLF.ICAO != this.destinationWP.ICAO) {
                // this.calculateInitialVnavAlt(false,"5")

            }
            this.cruisingAlt = this.getcruisingAlt(this.activeVnavWaypoint)
            // let originWP = this.allWaypointsWithPsudoArray.find((element) => element.ICAO == "acftPosCurrent")
            let originWP = this.allWaypointsWithPsudoArray[index]
            if (!originWP) {
                return;
            }
            this.activeVpathindex = this.allWaypointsWithPsudoArray.findIndex((element) => element == this.destinationWP)
            if (originWP && originWP.FPA) {
                this.activeVnavFPA = Math.min(originWP.FPA, -3)
            }


            SimVar.SetSimVarValue("L:HJET_VNAV_ISNEXTWP_RUNWAY", "bool", this.destinationWP.TYPE == "WT_Runway_Destination" && this.destinationWP.ACTIVENAVPOINT ? true : false)
            let vnavPhase;
            let apVerticalMode = SimVar.GetSimVarValue("L:HJET_VERTIVAL_AP_INDEX", "number")
            if (originWP.ALT - this.destinationWP.ALT < 0) {
                vnavPhase = 1
                await SimVar.SetSimVarValue("L:HJET_VNAV_CLIMB_ALT", "number", this.destinationWP.ALT)
            } else if (originWP.ALT - this.destinationWP.ALT > 0) {
                await SimVar.SetSimVarValue("L:HJET_VNAV_CLIMB_ALT", "number", this.destinationWP.ALT)
                vnavPhase = -1
            }
            else if (originWP.ALT - this.destinationWP.ALT == 0) {
                vnavPhase = 0
                await SimVar.SetSimVarValue("L:HJET_VNAV_CLIMB_ALT", "number", this.destinationWP.ALT)
            } else {
                vnavPhase = 999
                await SimVar.SetSimVarValue("L:HJET_VNAV_CLIMB_ALT", "number", SimVar.GetSimVarValue("L:HJET_AP_ALT_VAR", "number"))
            }
            await SimVar.SetSimVarValue("L:HJET_VNAV_STATE", "number", vnavPhase)


            this.vNavState_LF = this.vNavState
            this.vNavState = {
                initialAlt: this.initialAlt, cruisingAlt: this.cruisingAlt, originWP: originWP, destinationWP: this.destinationWP, state: vnavPhase, nextIndexinVplan: this.activeVpathindex, APVerticaMode: apVerticalMode, APverticalSpeed: Simplane.getVerticalSpeed(), climbAlt: SimVar.GetSimVarValue("L:HJET_VNAV_CLIMB_ALT", "number")
                , vNavWPts: this.allWaypointsWithPsudoArray, activeFPA: this.activeVnavFPA, fpaToNextWP: this.fpaToNextWP, verticalSpeedRequired: this.verticalSpeedRequired
            }

            if (this.vNavState_LF.state != this.vNavState.state) {
                console.log("Vphase has changed", "preveious frame", this.vNavState_LF, "this frame", this.vNavState)
            }
        }

        getNextTargetWaypoint() {

            if (this.vnavActivePhase == "Descent") {
                this.dummyBehindDistance = 0
                let wp = this.waypointsToDraw.find(e => e.ISTARGET == true && e.PHASE == "Descent" && e.CommulativeDistance > 0 && e.ALT < this.airplaneAltitude)
                if (!wp) {
                    this.dummyBehindDistance = 0
                    return this.airplaneAltitude;

                }
                let endAlt = wp.ALT
                let endDist = wp.CommulativeDistance

                let descentFpa = wp.DescenttFPA * -1

                let altitudeOfDescentPathBehindAircraft = endAlt - (endDist * 6076.12 - (this.dummyBehindDistance * 6076.12)) * Math.tan(descentFpa * Math.PI / 180)

                //     endAlt - (endDist * 6076.12 -todDist*6076.12)*Math.tan(decentFPA * Math.PI / 180)   = startAlt

                return altitudeOfDescentPathBehindAircraft
            } else {
                this.dummyBehindDistance = 0
                return this.airplaneAltitude
            }
        }

        addPseudoPointsToWaypoint() {
            if (this.suspend == true) {
                console.log("returned from add Pseudo due to suspend")
                return;

            }


            this.allWaypointsWithPsudoArray = []
            let aircraftCurrentPosPoint;
            //get index of ultimate wp in flightplanwaypoints
            let _ultimateWP;
            if (this.ultimateWP) {
                _ultimateWP = this.flighPlanWaypoints.find((e) => e.ICAO == this.ultimateWP)
            } else {
                _ultimateWP = this.flighPlanWaypoints.find((e) => e.DESIGNATED)
            }
            this.waypointsToDraw = this.flighPlanWaypoints.filter(function (e) {
                return ((e.ALT != -300000 || e.ALT1 != -300000 || e.ALT2 != -300000) && e.DESIGNATED && e.CommulativeDistance > 0 && e.ICAO != "removed" && e.ICAO != "")
            });

            if (this.waypointsToDraw.length > 0) {
                this.vnavValid = true
            } else {
                this.vnavValid = false
                return
            }

            if (!this.flighPlanWaypoints[this.activeIndex]) {
                return
            }
            if (!this.flighPlanWaypoints[this.activeIndex].PATHDISTANCE) {
                return
            }
            let currentAPindex = SimVar.GetSimVarValue("L:HJET_VERTIVAL_AP_INDEX", "number")
            if (this.waypointsToDraw.length > 0) {
                if (this.flighPlanWaypoints[this.activeIndex]) {
                    let aircraftInitPosPoint = { ICAO: "acftPosInit", ALT: this.initialAlt, CommulativeDistance: this.dummyBehindDistance, HIDDEN: false, DESIGNATED: true, criticalPoint: true }
                    aircraftCurrentPosPoint = { ICAO: "acftPosCurrent", ALT: this.airplaneAltitude, CommulativeDistance: this.flighPlanWaypoints[this.activeIndex].PATHDISTANCE - this.distanceToActive + this.distanceToActive - this.flighPlanWaypoints[this.activeIndex].PATHDISTANCE, HIDDEN: false, DESIGNATED: true, TYPE: "CLIMB" }
                    this.waypointsToDraw.push(aircraftInitPosPoint)
                    this.waypointsToDraw.push(aircraftCurrentPosPoint)
                    this.waypointsToDraw.sort(descending)
                }
                this.waypointsToDraw.sort(descending)
                // this.insertTOC();
                if ((currentAPindex == 2 || currentAPindex == 5) && !SimVar.GetSimVarValue("L:VNAV_ACTIVE", "bool")) {
                    this.addMaxClimGradient(false)
                    this.waypointsToDraw.sort(descending)
                    let tocpointMax = this.waypointsToDraw.slice().reverse().find(e => (e.TYPE === "TOC") && e.CommulativeDistance > 0)
                    if (tocpointMax) {
                        for (let i = 0; i < this.waypointsToDraw.length; i++) {
                            if (this.waypointsToDraw[i] && this.waypointsToDraw[i].CommulativeDistance < tocpointMax.CommulativeDistance && this.waypointsToDraw[i].ICAO != "acftPosCurrent" && this.waypointsToDraw[i].ICAO != "acftPosInit" && this.waypointsToDraw[i].TYPE != "CLIMBMAX") {
                                this.waypointsToDraw[i].criticalPoint = false;
                                this.waypointsToDraw[i].ignoreAltConstraint = true
                                this.waypointsToDraw[i].freezeInitAltCapture = true
                            }
                        }

                    }
                } else {
                    this.addMaxClimGradient(true)
                    this.waypointsToDraw.sort(descending)
                }

                let endOfDecentPoint = this.GetEndOfDecent()

                if (currentAPindex != 2 && currentAPindex != 5 || SimVar.GetSimVarValue("L:VNAV_ACTIVE", "bool")) {
                    this.reviseAltRestrictionsBasedOnMaxClimbGradient(endOfDecentPoint)
                    this.waypointsToDraw.sort(descending)
                }
                let tocPoint;

                tocPoint = this.waypointsToDraw.slice().reverse().find(e => (e.TYPE === "TOC") && e.CommulativeDistance > 0)

                if (tocPoint) {
                    for (let i = 0; i < this.waypointsToDraw.length; i++) {
                        if ((this.waypointsToDraw[i] && this.waypointsToDraw[i].ALT > tocPoint.ALT || (this.waypointsToDraw[i].PHASE == "Climb" && this.waypointsToDraw[i].CommulativeDistance > tocPoint.CommulativeDistance)) && this.waypointsToDraw[i].ICAO != "acftPosCurrent" && this.waypointsToDraw[i].ICAO != "acftPosInit") {
                            this.waypointsToDraw[i].criticalPoint = false;
                            this.waypointsToDraw[i].ignoreAltConstraint = true
                            this.waypointsToDraw[i].freezeInitAltCapture = true
                        }
                    }


                } else {
                    this.locateTOC(null)
                }
                let startOfDecentPoint = this.GetHighestWaypointDecent()
                let indexOfstartOfDecentPoint = this.waypointsToDraw.findIndex(e => e === startOfDecentPoint)
                if (!startOfDecentPoint) {
                    return;
                }

                let indexOfendOfDecentPoint = this.waypointsToDraw.findIndex(e => e === endOfDecentPoint)
                this.applyWTDescentRestrictions(startOfDecentPoint)
                //  this.addDecentGradient(startOfDecentPoint, endOfDecentPoint)
                //  this.waypointsToDraw.sort(descending)
                // this.reviseAltRestrictionsBasedOnDecentGradient(startOfDecentPoint, endOfDecentPoint, indexOfstartOfDecentPoint)

                this.waypointsToDraw.sort(descending)
                this.removeSteepPoints()
                // this.addBod(startOfDecentPoint)
                this.waypointsToDraw.sort(descending)

                this.checkifTODshouldExist()
                let commdist = this.flighPlanWaypoints[this.activeIndex].PATHDISTANCE
                if (!commdist) {
                    return;
                }
                // aircraftCurrentPosPoint = { ICAO: "acftPosCurrent", ALT: this.airplaneAltitude, CommulativeDistance: flighPlanWaypoints[this.activeIndex].PATHDISTANCE - this.distanceToActive + this.distanceToActive - flighPlanWaypoints[this.activeIndex].PATHDISTANCE, HIDDEN: false, DESIGNATED: true, TYPE: "CLIMB", criticalPoint: true }
                let existingCurrentPoint = this.waypointsToDraw.find(e => e.ICAO == "acftPosCurrent")
                if (!existingCurrentPoint) {
                    this.waypointsToDraw.push(aircraftCurrentPosPoint)
                }
                this.waypointsToDraw.sort(descending)
                this.allWaypointsWithPsudoArray.push(...this.waypointsToDraw);
                this.allWaypointsWithPsudoArray.sort(descending)
            }
            this.allWaypointsWithPsudoArray.sort(descending)
            this.initialAlt = this.getNextTargetWaypoint() ? this.getNextTargetWaypoint() : this.airplaneAltitude


            SimVar.SetSimVarValue("L:HJET_AIRCRAFT_CURRENT_POS", "NUMBER", aircraftCurrentPosPoint.CommulativeDistance)

            if (this.frameCounter % 25 == 0) {
                console.log("allWaypointsWithPsudoArray", this.allWaypointsWithPsudoArray)
            }
            function descending(a, b) {
                return a.CommulativeDistance - b.CommulativeDistance
            }

        }
        clamp(value, min, max) {
            return Math.min(Math.max(value, min), max)
        }

        applyWTDescentRestrictions(startOfDecentPoint) {
            let firstDescentLeg = this.waypointsToDraw.find(e => e.PHASE == "Descent")
            for (let i = 0; i < this.waypointsToDraw.length; i++) {
                let thisWp = this.waypointsToDraw[i]
                if (thisWp.ISTARGET && thisWp.PHASE == "Descent") {
                    thisWp.criticalPoint = true
                    thisWp.ALT = thisWp.TARGETALT
                    thisWp.ignoreAltConstraint = false;
                    thisWp.freezeInitAltCapture = false;
                }
                if (!thisWp.ISTARGET && thisWp.PHASE == "Descent") {
                    thisWp.criticalPoint = false
                    thisWp.ALT = thisWp.TARGETALT
                    thisWp.ignoreAltConstraint = true;
                    thisWp.freezeInitAltCapture = true;
                }

            }
            let criticalPointsArray = this.waypointsToDraw.filter(e => e.PHASE == "Descent" && e.ISTARGET)
            let tocPoint = startOfDecentPoint
            criticalPointsArray.push(tocPoint)
            criticalPointsArray.sort(this.descending)

            for (let i = criticalPointsArray.length - 1; i >= 0; i--) {
                let decentFPA = criticalPointsArray[i].DescenttFPA * -1
                if (!criticalPointsArray[i - 1] || !criticalPointsArray[i] || (criticalPointsArray[i - 1].ALT < criticalPointsArray[i].ALT)) {
                    continue;
                }
                let startAlt = criticalPointsArray[i - 1].ALT
                let endAlt = criticalPointsArray[i].ALT
                let endDist = criticalPointsArray[i].CommulativeDistance

                if (endAlt >= startAlt) {
                    continue;
                }

                let todDist = (endDist * 6076.12 - ((endAlt - startAlt) / Math.tan(decentFPA * Math.PI / 180))) / 6076.12

                let todPoint = { ICAO: "TOD" + criticalPointsArray[i - 1].ICAO + this.index, ALT: startAlt, CommulativeDistance: todDist + 0.05, DESIGNATED: true, ignoreAltConstraint: false, freezeInitAltCapture: false, TYPE: "TODs" }

                let exisingTOD = this.waypointsToDraw.find(e => e.ICAO === todPoint.ICAO && e.CommulativeDistance > 1)

                if (!exisingTOD) {
                    if (todDist - criticalPointsArray[i - 1].CommulativeDistance > 1) {

                        this.waypointsToDraw.push(todPoint)
                    }
                } else {
                    exisingTOD = todPoint;
                }
            }
        }
        descending(a, b) {
            return a.CommulativeDistance - b.CommulativeDistance
        }

        async addDecentGradient(startOfDecentPoint, endOfDecentPoint) {
            let startAlt = startOfDecentPoint.ALT
            let endAlt = endOfDecentPoint.ALT
            let endDist = endOfDecentPoint.CommulativeDistance
            let decentFPA = -3
            let todDist = (endDist * 6076.12 - ((endAlt - startAlt) / Math.tan(decentFPA * Math.PI / 180))) / 6076.12
            if (todDist <= startOfDecentPoint.CommulativeDistance) {
                todDist = startOfDecentPoint.CommulativeDistance
            }
            let todPoint = { ICAO: "TOD", ALT: startAlt, CommulativeDistance: todDist, DESIGNATED: true, ignoreAltConstraint: false, freezeInitAltCapture: false, TYPE: "TOD" }
            this.waypointsToDraw.push(todPoint)
        }

        async reviseAltRestrictionsBasedOnDecentGradient(startOfDecentPoint, endOfDecentPoint) {

            let finalpoint = endOfDecentPoint;
            let indexOfstartOfDecentPoint = this.waypointsToDraw.findIndex(e => e === startOfDecentPoint)
            let indexofendOfDecentPoint = this.waypointsToDraw.findIndex(e => e === endOfDecentPoint)
            if (indexofendOfDecentPoint != -1) {
                this.waypointsToDraw[indexOfstartOfDecentPoint].criticalPoint = true;
                this.waypointsToDraw[indexofendOfDecentPoint].criticalPoint = true;
            }

            let prevCriticalPoint
            let criticalPointsArray = this.waypointsToDraw.filter(e => e.criticalPoint && e.CommulativeDistance >= startOfDecentPoint.CommulativeDistance && e.ICAO)
            criticalPointsArray.sort(descending)

            for (let i = criticalPointsArray.length - 1; i >= 0; i--) {


                let pointInWaypointArray = this.waypointsToDraw.findIndex(e => e === criticalPointsArray[i])
                //let thisWp = pointInWaypointArray

                let pervClimbPoint = criticalPointsArray[i]
                let nextClimbPoint = criticalPointsArray[i - 1]
                let indexOfNextPoint = this.waypointsToDraw.findIndex(e => e === nextClimbPoint)
                let indexofPrevPoint = this.waypointsToDraw.findIndex(e => e === pervClimbPoint)

                if (!finalpoint) {
                    return;
                }
                if (!pervClimbPoint || !nextClimbPoint) {
                    continue;
                }

                for (let j = indexofPrevPoint; j >= indexOfNextPoint; j--) {
                    let waypointsToDraw_LF = []
                    waypointsToDraw_LF.push(...this.waypointsToDraw)
                    let thisWp = waypointsToDraw_LF[j]
                    if (thisWp.TYPE == "TOD" || thisWp.TYPE == "TOC" || thisWp.PHASE == "Climb" || thisWp == pervClimbPoint || thisWp == nextClimbPoint) {
                        continue;
                    }
                    let isCritical = waypointsToDraw_LF[j].criticalPoint
                    let fpa = -3

                    if (fpa != undefined) {
                        let altProjectionOnGradient = Math.min((thisWp.CommulativeDistance - pervClimbPoint.CommulativeDistance) * 6067.12 * Math.tan(fpa * Math.PI / 180) + pervClimbPoint.ALT, nextClimbPoint.ALT)
                        if (thisWp.RESTRICTIONTYPE == "AT") {
                            this.waypointsToDraw[j].freezeInitAltCapture = false
                            this.waypointsToDraw[j].ignoreAltConstraint = false
                            this.waypointsToDraw[j].criticalPoint = true;
                        } else if (thisWp.RESTRICTIONTYPE == "ATABOVE" && altProjectionOnGradient >= thisWp.ALT1) {
                            this.waypointsToDraw[j].ALT = altProjectionOnGradient
                            this.waypointsToDraw[j].freezeInitAltCapture = true
                            this.waypointsToDraw[j].ignoreAltConstraint = true
                        } else if (thisWp.RESTRICTIONTYPE == "ATABOVE" && altProjectionOnGradient < thisWp.ALT1) {
                            this.waypointsToDraw[j].ALT = this.waypointsToDraw[j].ALT1
                            this.waypointsToDraw[j].freezeInitAltCapture = false
                            this.waypointsToDraw[j].ignoreAltConstraint = false
                            this.waypointsToDraw[j].criticalPoint = true;
                        } else if (thisWp.RESTRICTIONTYPE == "ATBELOW" && altProjectionOnGradient > thisWp.ALT2) {
                            this.waypointsToDraw[j].ALT = this.waypointsToDraw[j].ALT2
                            this.waypointsToDraw[j].freezeInitAltCapture = false
                            this.waypointsToDraw[j].ignoreAltConstraint = false
                            this.waypointsToDraw[j].criticalPoint = true;
                        } else if (thisWp.RESTRICTIONTYPE == "ATBELOW" && altProjectionOnGradient < thisWp.ALT2) {
                            this.waypointsToDraw[j].ALT = altProjectionOnGradient
                            this.waypointsToDraw[j].freezeInitAltCapture = true
                            this.waypointsToDraw[j].ignoreAltConstraint = true
                        } else if (thisWp.RESTRICTIONTYPE == "BETWEEN" && altProjectionOnGradient < thisWp.ALT2 && altProjectionOnGradient > thisWp.ALT1) {
                            this.waypointsToDraw[j].ALT = altProjectionOnGradient
                            this.waypointsToDraw[j].freezeInitAltCapture = true
                            this.waypointsToDraw[j].ignoreAltConstraint = true
                        } else if (thisWp.RESTRICTIONTYPE == "BETWEEN" && altProjectionOnGradient < thisWp.ALT1) {
                            this.waypointsToDraw[j].ALT = this.waypointsToDraw[j].ALT1
                            this.waypointsToDraw[j].freezeInitAltCapture = false
                            this.waypointsToDraw[j].ignoreAltConstraint = false
                            this.waypointsToDraw[j].criticalPoint = true;
                        } else if (thisWp.RESTRICTIONTYPE == "BETWEEN" && altProjectionOnGradient > thisWp.ALT2) {
                            this.waypointsToDraw[j].ALT = this.waypointsToDraw[j].ALT2
                            this.waypointsToDraw[j].freezeInitAltCapture = false
                            this.waypointsToDraw[j].ignoreAltConstraint = false
                            this.waypointsToDraw[j].criticalPoint = true;
                        }

                        if (this.waypointsToDraw[j].ALT >= startOfDecentPoint.ALT && this.waypointsToDraw[j].ICAO != "acftPosCurrent" && this.waypointsToDraw[j].ICAO != "acftPosInit" && this.waypointsToDraw[j].TYPE != "TODs") {
                            this.waypointsToDraw[j].freezeInitAltCapture = true
                            this.waypointsToDraw[j].ignoreAltConstraint = true
                            this.waypointsToDraw[j].criticalPoint = false;
                        }

                        if (this.waypointsToDraw[j].criticalPoint == true && !isCritical) {


                            this.reviseAltRestrictionsBasedOnDecentGradient(startOfDecentPoint, endOfDecentPoint)
                            break;

                        }
                    }
                }

            }
            let test2


            this.updateDecentGradient(startOfDecentPoint)
            let test
            this.waypointsToDraw.sort(descending)
            function descending(a, b) {
                return a.CommulativeDistance - b.CommulativeDistance
            }
        }
        async updateDecentGradient(startOfDecentPoint) {
            //add Bod
            let criticalPointsArray = this.waypointsToDraw.filter(e => e.criticalPoint == true && e.ignoreAltConstraint != true && e.TYPE != "TOCEND" && e.CommulativeDistance >= startOfDecentPoint.CommulativeDistance && e.ICAO || e.ICAO == "acftPosInit")

            for (let i = criticalPointsArray.length - 1; i >= 0; i--) {
                let decentFPA = -3
                if (!criticalPointsArray[i - 1] || !criticalPointsArray[i] || (criticalPointsArray[i - 1].ALT < criticalPointsArray[i].ALT)) {
                    continue;
                }
                let actualFPA = this.getFPAfromPointsDegree(criticalPointsArray[i], criticalPointsArray[i - 1])
                if (actualFPA >= 0) {
                    let indexinWP = this.waypointsToDraw.findIndex(e => e === criticalPointsArray[i - 1])
                    if (indexinWP) {
                        this.waypointsToDraw[indexinWP].ignoreAltConstraint = true
                        this.waypointsToDraw[indexinWP].freezeInitAltCapture = true
                    }

                }

                let deltadist = criticalPointsArray[i - 1].CommulativeDistance - criticalPointsArray[i].CommulativeDistance
                if (actualFPA > -0.2 && deltadist < 5) {

                    continue;
                }
                let startAlt = criticalPointsArray[i - 1].ALT
                let endAlt = criticalPointsArray[i].ALT
                let endDist = criticalPointsArray[i].CommulativeDistance
                let todDist = (endDist * 6076.12 - ((endAlt - startAlt) / Math.tan(decentFPA * Math.PI / 180))) / 6076.12

                let todPoint = { ICAO: "TOD" + criticalPointsArray[i - 1].ICAO, ALT: startAlt, CommulativeDistance: todDist, DESIGNATED: true, ignoreAltConstraint: false, freezeInitAltCapture: false, TYPE: "TODs" }

                let exisingTOD = this.waypointsToDraw.find(e => e.ICAO === todPoint.ICAO)

                if (!exisingTOD) {
                    if (todDist - criticalPointsArray[i - 1].CommulativeDistance > 1) {

                        this.waypointsToDraw.push(todPoint)
                    }
                } else {
                    exisingTOD = todPoint;
                }

            }


            // let existingInitialTOD = this.waypointsToDraw.find(e => e.TYPE == "TOD")

            let tempArray = this.waypointsToDraw.filter(e => e.TYPE != "TOD")
            tempArray.sort(descending)
            this.waypointsToDraw = []
            this.waypointsToDraw.push(...tempArray)
            // let finalTodPoint = this.waypointsToDraw.find(e => e.TYPE == "TODs")
            // if (finalTodPoint) {
            //     finalTodPoint.TYPE = "TOD"
            // }

            function descending(a, b) {
                return a.CommulativeDistance - b.CommulativeDistance
            }
        }


        async removeSteepPoints() {
            let tocPoint;

            tocPoint = this.waypointsToDraw.slice().reverse().find(e => (e.TYPE === "TOC") && e.CommulativeDistance > 0)
            let criticalArray = this.waypointsToDraw.filter(e => e.criticalPoint == true || e.ignoreAltConstraint != true)

            if (tocPoint) {
                for (let i = 0; i < criticalArray.length; i++) {
                    let thisWp = criticalArray[i]
                    let nextWp = criticalArray[i + 1]
                    if (thisWp && nextWp) {
                        let fpaToNextWP = this.getFPAfromPointsDegree(thisWp, nextWp)
                        if (fpaToNextWP < -6) {
                            nextWp.freezeInitAltCapture = true;
                            nextWp.ignoreAltConstraint = true;
                            nextWp.criticalPoint = false;
                        }
                    }
                }


            }
        }

        async addBod(startOfDecentPoint) {
            let relevantArray = this.waypointsToDraw.filter(e => e.criticalPoint == true && e.ICAO != "acftposcurrent" || e.TYPE == "TODs")
            let bodOffset = 2
            let indexOfStartPointinRelevantArray = relevantArray.findIndex(e => e === startOfDecentPoint)

            for (let i = relevantArray.length; i > indexOfStartPointinRelevantArray; i--) {

                let thisPoint = relevantArray[i]
                let nextpoint = relevantArray[i + 1]
                let previousPoint = relevantArray[i - 1]
                if (nextpoint
                    && nextpoint.ALT
                    && previousPoint
                    && previousPoint.ALT
                    && thisPoint.ALT - nextpoint.ALT < 200 && thisPoint.ALT - nextpoint.ALT >= 0
                    && previousPoint.ALT - thisPoint.ALT > 500
                    && nextpoint.TYPE != "final"
                    && thisPoint.TYPE != "WT_Runway_Destination"
                    && nextpoint.CommulativeDistance - thisPoint.CommulativeDistance > 1) {
                    let BodPoint = { ICAO: "BOD" + i, ALT: thisPoint.ALT, CommulativeDistance: thisPoint.CommulativeDistance - bodOffset, DESIGNATED: true, ignoreAltConstraint: false, freezeInitAltCapture: false, TYPE: "BOD", owner: thisPoint.ICAO }

                    let existingBod = relevantArray.find(e => e.ICAO == "BOD" && e.owner && e.owner == thisPoint.ICAO)
                    if (!existingBod) {

                        this.waypointsToDraw.push(BodPoint)
                        this.waypointsToDraw.sort(descending)
                        let todsToModify = this.waypointsToDraw.slice().reverse().find(e => (e.TYPE == "TODs" && e.CommulativeDistance < BodPoint.CommulativeDistance + bodOffset) || (e.TYPE == "TOD" && e.CommulativeDistance < BodPoint.CommulativeDistance + bodOffset))
                        if (todsToModify) {
                            todsToModify.CommulativeDistance = todsToModify.CommulativeDistance - bodOffset
                        }
                    }
                }
            }
            function descending(a, b) {
                return a.CommulativeDistance - b.CommulativeDistance
            }
        }
        async addMaxClimGradient(isVnav) {
            let currentAPindex = SimVar.GetSimVarValue("L:HJET_VERTIVAL_AP_INDEX", "number")
            let vnavAlt = SimVar.GetSimVarValue("L:HJET_VNAV_CLIMB_ALT", "number")
            let apAlt = SimVar.GetSimVarValue("L:HJET_AP_ALT_VAR", "number")

            if (apAlt - this.airplaneAltitude < 10) {
                return;
            }
            //let point2=Math.max(...this.waypointMapArray.slice().reverse().map(o => o.ALT))
            let point2;
            if (!isVnav) {
                point2 = { ALT: apAlt, CommulativeDistance: 1000 }
            } else {
                let altToselect = this.getAltToSelect()

                point2 = { ALT: apAlt, CommulativeDistance: 1000 }
            }

            let point1 = { ICAO: "acftPosCurrent", ALT: this.airplaneAltitude, CommulativeDistance: this.flighPlanWaypoints[this.activeIndex].PATHDISTANCE - this.distanceToActive + this.distanceToActive - this.flighPlanWaypoints[this.activeIndex].PATHDISTANCE, HIDDEN: false, DESIGNATED: true, TYPE: "CLIMB", criticalPoint: true }
            // console.log("highest way point", point2)
            if (!point1 || !point2) {
                return
            }

            let estimatedInitFpa = this.initFpaSteps[this.getFPAfromPreviousAlt(this.airplaneAltitude)]
            let actualFPA = this.realFpaAngle
            let factor = actualFPA / estimatedInitFpa
            let onGround = SimVar.GetSimVarValue("SIM ON GROUND", "boolean");
            if (!onGround) {
                factor = this.clamp(factor, 0.75, 1.35)
            } else {
                factor = 1
            }
            this.fpaSteps = this.initFpaSteps.map(e => e * factor)
            let fpaAlts = [2000, 4000, 6000, 8000, 10000, 12000, 14000, 16000, 18000, 20000, 22000, 24000, 26000, 28000, 30000]
            let stepsNM = 2
            if (point1.ALT - point2.ALT < -50) {
                let steps = Math.min(Math.round((point2.CommulativeDistance - point1.CommulativeDistance) / stepsNM), 100)
                let previousAlt
                for (let j = 1; j <= steps; j++) {
                    let pseudoPointObject = { ICAO: "TODoooo", ALT: 0, CommulativeDistance: 0, HIDDEN: false, DESIGNATED: true }
                    let pseudoPointObject2 = { ICAO: "TODoooo", ALT: 0, CommulativeDistance: 0, HIDDEN: false, DESIGNATED: true }
                    pseudoPointObject.ICAO = "ClimbPoint max" + " " + j
                    // let factorN = this.clamp(stepsNM * (j / steps), 0.2, 2)
                    pseudoPointObject.CommulativeDistance = j * stepsNM + point1.CommulativeDistance
                    previousAlt = previousAlt ? previousAlt : point1.ALT
                    pseudoPointObject.previousAlt = previousAlt;
                    pseudoPointObject.ALT = this.getClimbGradientIndex(point1, point2, this.fpaSteps, fpaAlts, j, previousAlt, pseudoPointObject.CommulativeDistance, stepsNM)

                    if (Math.abs(pseudoPointObject.ALT - point2.ALT) <= 300) {
                        pseudoPointObject.ALT = point2.ALT
                    }

                    pseudoPointObject.ALT = Math.min(pseudoPointObject.ALT, point2.ALT)
                    if (isNaN(pseudoPointObject.ALT)) {
                        continue
                    }
                    previousAlt = pseudoPointObject.ALT;
                    pseudoPointObject.parent1 = point1.ICAO
                    pseudoPointObject.parent2 = point2.ICAO
                    pseudoPointObject.TYPE = "CLIMBMAX"
                    if (pseudoPointObject.ALT == point2.ALT) {
                        pseudoPointObject.TYPE = "TOC"
                        pseudoPointObject.ICAO = "TOC"
                        pseudoPointObject.function = "max gradient"
                        pseudoPointObject.criticalPoint = true
                        pseudoPointObject.ignoreAltConstraint = false
                        pseudoPointObject.freezeInitAltCapture = false
                        this.waypointsToDraw.push(pseudoPointObject)
                        this.insertTOC(pseudoPointObject.CommulativeDistance, pseudoPointObject.ALT)


                        break;
                    }
                    this.waypointsToDraw.push(pseudoPointObject)
                }
            }
        }

        async reviseAltRestrictionsBasedOnMaxClimbGradient(endOfDecentPoint) {

            let apAlt = SimVar.GetSimVarValue("L:HJET_AP_ALT_VAR", "number")
            if (apAlt - this.airplaneAltitude < 10) {
                return;
            }
            let endpoint = { ALT: apAlt, CommulativeDistance: 2000, criticalPoint: true }
            this.waypointsToDraw.push(endpoint)
            this.waypointsToDraw.sort(descending)

            for (let j = 0; j <= this.waypointsToDraw.length - 1; j++) {


                let waypointsToDraw_LF = []
                waypointsToDraw_LF.push(...this.waypointsToDraw)
                let thisWp = waypointsToDraw_LF[j]
                let nextClimbPoint = this.waypointsToDraw.find(e => (e.criticalPoint == true || e.TYPE == "CLIMBMAX" || e.TYPE == "CLIMB" || !e.ICAO) && e.CommulativeDistance > thisWp.CommulativeDistance)
                let pervClimbPoint = this.waypointsToDraw.slice().reverse().find(e => e.criticalPoint == true && e.CommulativeDistance < thisWp.CommulativeDistance)
                if (!pervClimbPoint || !nextClimbPoint || thisWp.TYPE == "CLIMBMAX" || thisWp.TYPE == "CLIMB" || thisWp.TYPE == "TOC" || thisWp.PHASE == "Descent" || (!thisWp.ALT1 && !thisWp.ALT2)) {
                    continue;
                }

                let isCritical = waypointsToDraw_LF[j].criticalPoint
                let fpa = this.getFPAfromleg(pervClimbPoint.CommulativeDistance, pervClimbPoint.ALT, nextClimbPoint.CommulativeDistance, nextClimbPoint.ALT)
                if (fpa != undefined) {
                    let altProjectionOnGradient = Math.min((thisWp.CommulativeDistance - pervClimbPoint.CommulativeDistance) * 6067.12 * Math.tan(fpa * Math.PI / 180) + pervClimbPoint.ALT, nextClimbPoint.ALT)
                    if (thisWp.RESTRICTIONTYPE == "AT") {
                        this.waypointsToDraw[j].freezeInitAltCapture = false
                        this.waypointsToDraw[j].ignoreAltConstraint = false
                        this.waypointsToDraw[j].criticalPoint = true;
                    } else if (thisWp.RESTRICTIONTYPE == "ATABOVE" && altProjectionOnGradient >= thisWp.ALT1 && thisWp.ALT1) {
                        this.waypointsToDraw[j].ALT = altProjectionOnGradient
                        this.waypointsToDraw[j].freezeInitAltCapture = true
                        this.waypointsToDraw[j].ignoreAltConstraint = true
                    } else if (thisWp.RESTRICTIONTYPE == "ATABOVE" && altProjectionOnGradient < thisWp.ALT1) {
                        this.waypointsToDraw[j].ALT = this.waypointsToDraw[j].ALT1
                        this.waypointsToDraw[j].freezeInitAltCapture = false
                        this.waypointsToDraw[j].ignoreAltConstraint = false
                        this.waypointsToDraw[j].criticalPoint = true;
                    } else if (thisWp.RESTRICTIONTYPE == "ATBELOW" && altProjectionOnGradient > thisWp.ALT2 && thisWp.ALT2) {
                        this.waypointsToDraw[j].ALT = this.waypointsToDraw[j].ALT2
                        this.waypointsToDraw[j].freezeInitAltCapture = false
                        this.waypointsToDraw[j].ignoreAltConstraint = false
                        this.waypointsToDraw[j].criticalPoint = true;
                    } else if (thisWp.RESTRICTIONTYPE == "ATBELOW" && altProjectionOnGradient < thisWp.ALT2) {
                        this.waypointsToDraw[j].ALT = altProjectionOnGradient
                        this.waypointsToDraw[j].freezeInitAltCapture = true
                        this.waypointsToDraw[j].ignoreAltConstraint = true
                    } else if (thisWp.RESTRICTIONTYPE == "BETWEEN" && altProjectionOnGradient < thisWp.ALT2 && altProjectionOnGradient > thisWp.ALT1) {
                        this.waypointsToDraw[j].ALT = altProjectionOnGradient
                        this.waypointsToDraw[j].freezeInitAltCapture = true
                        this.waypointsToDraw[j].ignoreAltConstraint = true
                    } else if (thisWp.RESTRICTIONTYPE == "BETWEEN" && altProjectionOnGradient < thisWp.ALT1 && thisWp.ALT1) {
                        this.waypointsToDraw[j].ALT = this.waypointsToDraw[j].ALT1
                        this.waypointsToDraw[j].freezeInitAltCapture = false
                        this.waypointsToDraw[j].ignoreAltConstraint = false
                        this.waypointsToDraw[j].criticalPoint = true;
                    } else if (thisWp.RESTRICTIONTYPE == "BETWEEN" && altProjectionOnGradient > thisWp.ALT2 && thisWp.ALT2) {
                        this.waypointsToDraw[j].ALT = this.waypointsToDraw[j].ALT2
                        this.waypointsToDraw[j].freezeInitAltCapture = false
                        this.waypointsToDraw[j].ignoreAltConstraint = false
                        this.waypointsToDraw[j].criticalPoint = true;
                    }
                    let toc = this.waypointsToDraw.slice().reverse().find(e => e.TYPE == "TOC")
                    if (toc && this.waypointsToDraw[j].ALT > toc.ALT) {
                        this.waypointsToDraw[j].ALT = this.waypointsToDraw[j].ALT2
                        this.waypointsToDraw[j].freezeInitAltCapture = true
                        this.waypointsToDraw[j].ignoreAltConstraint = true
                        this.waypointsToDraw[j].criticalPoint = false;
                    }


                    if (this.waypointsToDraw[j].criticalPoint == true && !isCritical) {

                        this.updateMaxGradient(endOfDecentPoint)
                        this.reviseAltRestrictionsBasedOnMaxClimbGradient(endOfDecentPoint)
                        break;

                    }
                }
            }

            this.waypointsToDraw.sort(descending)
            function descending(a, b) {
                return a.CommulativeDistance - b.CommulativeDistance
            }
        }


        getAltToSelect() {
            let apAlt = SimVar.GetSimVarValue("L:HJET_AP_ALT_VAR", "number")
            let relevantAltArray = this.waypointsToDraw.filter(e => e.CommulativeDistance > 0)
            let testAlt1 = relevantAltArray.filter(o => o.ALT1)
            let test1Alt = relevantAltArray.filter(o => o.ALT)
            let highestAlt = Math.max(...test1Alt.slice().reverse().map(o => o.ALT))

            let highestAlt1 = Math.max(...testAlt1.slice().reverse().map(o => o.ALT1))

            let altToselect = Math.max(...[highestAlt, highestAlt1, apAlt])
            return altToselect;
        }
        async updateMaxGradient(endOfDecentPoint) {
            let tempArray1 = this.waypointsToDraw.filter(e => e.TYPE != "CLIMB" && e.TYPE != "TOC" || e.ICAO == "acftPosCurrent" || e.ICAO == "acftPosInit")
            this.waypointsToDraw = []
            this.waypointsToDraw.push(...tempArray1)

            let finalpoint = this.waypointsToDraw[this.waypointsToDraw.length - 1]
            let criticalPointsArray = this.waypointsToDraw.filter(e => e.criticalPoint == true && e.CommulativeDistance <= finalpoint.CommulativeDistance && e.TYPE != "TOC" || e.ICAO == "acftPosCurrent")
            let apAlt = SimVar.GetSimVarValue("L:HJET_AP_ALT_VAR", "number")
            let endpoint = { ALT: apAlt, CommulativeDistance: 2000 }

            criticalPointsArray.sort(descending)
            for (let i = 0; i < criticalPointsArray.length; i++) {
                let point1 = criticalPointsArray[i]
                let point2 = criticalPointsArray[i + 1]

                if (!point1 || !point2) {
                    continue
                }
                let actualFPA = this.getFPAfromPointsDegree(criticalPointsArray[i], criticalPointsArray[i + 1])
                if (actualFPA > 11) {
                    continue;
                }

                let previousAlt
                if (point1.ALT - point2.ALT < -100) {

                    let estimatedInitFpa = this.initFpaSteps[this.getFPAfromPreviousAlt(point1.ALT)]
                    let actualFPA = this.realFpaAngle
                    let factor = actualFPA / estimatedInitFpa
                    let onGround = SimVar.GetSimVarValue("SIM ON GROUND", "boolean");
                    if (!onGround) {
                        factor = this.clamp(factor, 0.75, 1.35)
                    } else {
                        factor = 1
                    }

                    let stepsNM = 2

                    this.fpaSteps = this.initFpaSteps.map(e => e * factor)
                    let fpaAlts = [2000, 4000, 6000, 8000, 10000, 12000, 14000, 16000, 18000, 20000, 22000, 24000, 26000, 28000, 30000]

                    let steps = Math.min(Math.round((point2.CommulativeDistance - point1.CommulativeDistance) / stepsNM), 100)
                    let previousAlt
                    for (let j = 1; j <= steps; j++) {
                        let pseudoPointObject = { ICAO: "TODoooo", ALT: 0, CommulativeDistance: 0, HIDDEN: false, DESIGNATED: true }
                        let pseudoPointObject2 = { ICAO: "TODoooo", ALT: 0, CommulativeDistance: 0, HIDDEN: false, DESIGNATED: true }

                        pseudoPointObject.ICAO = "ClimbPoint REVISED" + " " + j + " " + i
                        let factorN = this.clamp(stepsNM * (j / steps), 0.2, 2)
                        pseudoPointObject.CommulativeDistance = j * stepsNM + point1.CommulativeDistance
                        previousAlt = previousAlt ? previousAlt : point1.ALT
                        pseudoPointObject.previousAlt = previousAlt;
                        pseudoPointObject.ALT = this.getClimbGradientIndex(point1, point2, this.fpaSteps, fpaAlts, j, previousAlt, pseudoPointObject.CommulativeDistance, stepsNM)
                        if (Math.abs(pseudoPointObject.ALT - point2.ALT) <= 300) {
                            pseudoPointObject.ALT = point2.ALT
                        }
                        pseudoPointObject.ALT = Math.min(pseudoPointObject.ALT, point2.ALT)
                        if (isNaN(pseudoPointObject.ALT)) {
                            continue
                        }
                        previousAlt = pseudoPointObject.ALT;
                        pseudoPointObject.parent1 = point1.ICAO
                        pseudoPointObject.parent2 = point2.ICAO
                        pseudoPointObject.TYPE = "CLIMB"
                        if (pseudoPointObject.ALT == point2.ALT) {
                            let existingPoint = this.waypointsToDraw.find(e => e.ICAO === "TOC" + j + " " + i)
                            pseudoPointObject2.TYPE = "TOC"
                            pseudoPointObject2.ALT = pseudoPointObject.ALT
                            pseudoPointObject2.CommulativeDistance = pseudoPointObject.CommulativeDistance
                            pseudoPointObject2.ICAO = "TOC" + j + " " + i
                            pseudoPointObject2.function = "update"
                            pseudoPointObject2.criticalPoint = true
                            pseudoPointObject2.ignoreAltConstraint = false
                            pseudoPointObject2.freezeInitAltCapture = false
                            if (!existingPoint && pseudoPointObject2.CommulativeDistance < point2.CommulativeDistance) {
                                this.waypointsToDraw.push(pseudoPointObject2)
                            }
                            this.insertTOC(pseudoPointObject2.CommulativeDistance, pseudoPointObject2.ALT)
                            break;

                        }
                        let existingPoints = this.waypointsToDraw.find(e => e.ICAO === pseudoPointObject.ICAO)
                        if (!existingPoints && pseudoPointObject.CommulativeDistance < point2.CommulativeDistance) {
                            this.waypointsToDraw.push(pseudoPointObject)
                        }
                    }

                }

            }
            let tempArray = this.waypointsToDraw.filter(e => e.ICAO != "TOC" && e.TYPE != "CLIMBMAX" && e.CommulativeDistance <= endOfDecentPoint.CommulativeDistance)

            tempArray.sort(descending)
            this.waypointsToDraw = []
            this.waypointsToDraw.push(...tempArray)

            function descending(a, b) {
                return a.CommulativeDistance - b.CommulativeDistance
            }
        }

        checkifTODshouldExist() {
            let exisingTOD = this.waypointsToDraw.find(e => e.ICAO == "TOD")
            let exisingTODIndex = this.waypointsToDraw.findIndex(e => e.ICAO == "TOD")
            let highestPoint = this.GetHighestWaypointDecent()
            if (exisingTOD && exisingTOD.ALT && exisingTOD.ALT < highestPoint.ALT) {
                //   this.waypointsToDraw[exisingTODIndex].ignoreAltConstraint = true;
                //  this.waypointsToDraw[exisingTODIndex].freezeInitAltCapture = true;
            }
        }
        locateTOC(tocPoint) {
            if (!this.vNavState) {
                this.insertTOC(null, null)
                return;
            }
            if (this.vNavState.state == -1 || !tocPoint) {
                this.insertTOC(null, null)
                return;
            }
            let tocALT = this.cruisingAlt
            let tocDist;
            let prevPoint
            let nextpoint
            let fpa
            for (let i = 0; i < this.allWaypointsWithPsudoArray.length; i++) {
                prevPoint = this.allWaypointsWithPsudoArray[i]
                nextpoint = this.allWaypointsWithPsudoArray[i + 1]
                if (!prevPoint || !nextpoint || nextpoint.CommulativeDistance < 0) {
                    continue
                }
                if (tocALT > prevPoint.ALT && tocALT <= nextpoint.ALT) {
                    fpa = this.fpaSteps[this.getFPAfromPreviousAlt(prevPoint.ALT)]
                    tocDist = prevPoint.CommulativeDistance + ((tocALT - prevPoint.ALT) / Math.tan(fpa * Math.PI / 180)) / 6076.12
                    break;
                }
            }
        }

        getClimbGradientIndex(point1, point2, fpaSteps, fpaAlts, j, previousAlt, commulativeDistance, stepsNM) {
            let fpa;
            let a = this.getFPAlimits(previousAlt).a
            let b = this.getFPAlimits(previousAlt).b

            let fpaA = this.fpaSteps[this.getFPAfromPreviousAlt(a)]
            let fpaB = this.fpaSteps[this.getFPAfromPreviousAlt(b)]
            let factor = (b - previousAlt) / (b - a)

            fpa = fpaB + (fpaA - fpaB) * factor
            let finalAlt = previousAlt + Math.tan(fpa * Math.PI / 180) * stepsNM * 6076.12
            // if (commulativeDistance < this.activeVnavWaypoint.CommulativeDistance && finalAlt > this.activeVnavWaypoint.ALT) {
            //     // finalAlt=activeVnavWaypoint.ALT
            // }
            return finalAlt
        }
        getFPAfromPreviousAlt(previousAlt) {
            if (previousAlt < 2000) {
                return 0;
            }
            if (previousAlt < 4000) {
                return 1;
            }
            if (previousAlt < 6000) {
                return 2;
            }
            if (previousAlt < 8000) {
                return 3;
            }
            if (previousAlt < 10000) {
                return 4;
            }
            if (previousAlt < 12000) {
                return 5;
            }
            if (previousAlt < 14000) {
                return 6;
            }
            if (previousAlt < 16000) {
                return 7;
            }
            if (previousAlt < 18000) {
                return 8;
            }
            if (previousAlt < 20000) {
                return 9;
            }
            if (previousAlt < 22000) {
                return 10;
            }
            if (previousAlt < 24000) {
                return 11;
            }
            if (previousAlt < 26000) {
                return 12;
            }
            if (previousAlt < 28000) {
                return 13;
            }
            if (previousAlt < 30000) {
                return 14;
            }
            if (previousAlt <= 60000) {
                return 15;
            }
        }

        getFPAlimits(previousAlt) {
            if (previousAlt < 2000) {
                return { a: 0, b: 2000 };
            }
            if (previousAlt < 4000) {
                return { a: 2000, b: 4000 };
            }
            if (previousAlt < 6000) {
                return { a: 4000, b: 6000 };
            }
            if (previousAlt < 8000) {
                return { a: 6000, b: 8000 };
            }
            if (previousAlt < 10000) {
                return { a: 8000, b: 10000 };
            }
            if (previousAlt < 12000) {
                return { a: 10000, b: 12000 };
            }
            if (previousAlt < 14000) {
                return { a: 12000, b: 14000 };
            }
            if (previousAlt < 16000) {
                return { a: 14000, b: 16000 };
            }
            if (previousAlt < 18000) {
                return { a: 16000, b: 18000 };
            }
            if (previousAlt < 20000) {
                return { a: 18000, b: 20000 };
            }
            if (previousAlt < 22000) {
                return { a: 20000, b: 22000 };
            }
            if (previousAlt < 24000) {
                return { a: 22000, b: 24000 };
            }
            if (previousAlt < 26000) {
                return { a: 24000, b: 26000 };
            }
            if (previousAlt < 28000) {
                return { a: 16000, b: 28000 };
            }
            if (previousAlt < 30000) {
                return { a: 28000, b: 30000 };
            }
            if (previousAlt <= 60000) {
                return { a: 30000, b: 60000 };
            }
        }
        GetEndOfDecent() {
            for (let i = this.waypointsToDraw.length - 1; i >= 0; i--) {
                let point = this.waypointsToDraw[i]
                let pointAlt = this.waypointsToDraw[i].ALT
                if (point && pointAlt && point.TYPE != "final" && point.TYPE != "TOCEND" && point.ICAO) {
                    return point
                }
            }
        }
        GetHighestWaypointIndex() {
            let tocPoint;
            let todpoint;
            tocPoint = this.waypointsToDraw.find(e => e.ICAO === "TOC")
            todpoint = this.waypointsToDraw.find(e => e.TYPE === "TOD")
            if (todpoint) {
                return todpoint
            }
            if (!todpoint && tocPoint) {
                //return tocPoint
            }
            var highestWaypoitintAlt = 0;
            var highestWaypoitintIndex = 0;
            for (let i = 0; i < this.waypointsToDraw.length; i++) {
                if (this.waypointsToDraw[i].DESIGNATED == true
                    && this.waypointsToDraw[i].ALT != -300000
                    && this.waypointsToDraw[i].ICAO != "acftPosInit"
                    && this.waypointsToDraw[i].ICAO != "acftPosCurrent" && this.waypointsToDraw[i].TYPE != "CLIMB"
                    && (this.waypointsToDraw[i].RESTRICTIONTYPE == "AT" || this.waypointsToDraw[i].RESTRICTIONTYPE == "ATBELOW")
                ) {
                    if (this.waypointsToDraw[i].ALT > highestWaypoitintAlt) {
                        highestWaypoitintAlt = this.waypointsToDraw[i].ALT
                        highestWaypoitintIndex = i;
                    }
                    else {
                        highestWaypoitintAlt = highestWaypoitintAlt
                        highestWaypoitintIndex = highestWaypoitintIndex
                    }
                }
            }
            if (highestWaypoitintIndex < this.waypointsToDraw.length - 1 && highestWaypoitintIndex >= 0) {
                // this.waypointsToDraw[highestWaypoitintIndex].criticalPoint = true;
                return this.waypointsToDraw[highestWaypoitintIndex]
            } else {
                return null
            }
        }
        GetHighestWaypointDecent() {
            let toc = this.waypointsToDraw.slice().reverse().find(e => e.TYPE == "TOC")
            if (toc) {
                return toc;
            }
            // if(firstStarOrApprPoint && (firstStarOrApprPoint.ALT||firstStarOrApprPoint.ALT)){

            // return firstStarOrApprPoint
            // }
            let highestPointDecent;
            let highestPointDecentAlt = 0;
            for (let i = this.waypointsToDraw.length - 1; i >= 0; i--) {
                let point = this.waypointsToDraw[i]
                let pointAlt = this.waypointsToDraw[i].ALT
                if (point && pointAlt && pointAlt > highestPointDecentAlt && point.ICAO != "TOCEND" && point.TYPE != "CLIMB" && point.ICAO) {
                    highestPointDecent = this.waypointsToDraw[i]
                    highestPointDecentAlt = this.waypointsToDraw[i].ALT
                }
            }
            return highestPointDecent;
        }
        getcruisingAlt(nextWPT) {
            let deginatedArray = this.allWaypointsWithPsudoArray.filter(function (e) {
                return (e.CommulativeDistance > 0 && e.DESIGNATED && e.TYPE != "TOD" && e.ICAO != "TOC")
            });
            let nextWP = nextWPT
            let apMode = SimVar.GetSimVarValue("L:HJET_VERTIVAL_AP_INDEX", "number")
            let vnavState = SimVar.GetSimVarValue("L:HJET_VNAV_STATE", "number")
            var maxAltPlan

            let relevantPoint = this.allWaypointsWithPsudoArray.find(e => (e.ignoreAltConstraint != true || e.criticalPoint) && e.CommulativeDistance > 0 && e.TYPE != "CLIMB" && e.TYPE != "CLIMBMAX")
            if (relevantPoint && relevantPoint.CommulativeDistance > 0.01) {
                nextWP = relevantPoint
            }
            if (nextWP) {
                maxAltPlan = nextWP.ALT
            } else {
                maxAltPlan = this.GetHighestWaypointIndex()
            }
            var selectedAltAP = SimVar.GetSimVarValue("L:HJET_AP_ALT_VAR", "number")
            var aircraftindicatedAlt = SimVar.GetSimVarValue("INDICATED ALTITUDE", "feet")
            var cruisingAlt = maxAltPlan
            if (apMode == 1) {
                cruisingAlt = maxAltPlan <= selectedAltAP ? maxAltPlan : selectedAltAP
            } else if (apMode == 11) {
                cruisingAlt = maxAltPlan
            } else if (apMode == 6) {
                cruisingAlt = maxAltPlan >= selectedAltAP ? maxAltPlan : selectedAltAP
            }
            else if ((apMode == 2 || apMode == 5 || apMode == 10 || apMode == 3)) {
                cruisingAlt = selectedAltAP
            } else {
                cruisingAlt = cruisingAlt
            }
            if (true) {
                // console.log("maxAltPlan", maxAltPlan, "selectedAltAP", selectedAltAP, "aircraftindicatedAlt", aircraftindicatedAlt, "cruisingAlt", cruisingAlt, "nextWP", nextWP)
            }
            return cruisingAlt
        }
        getFPAfromleg(point1Dist, point1Alt, point2Dist, point2Alt, consoled = false) {
            let deltaAltFeet = (point2Alt - point1Alt)
            let deltaDistNM = point2Dist - point1Dist
            //deltaDistNM=deltaDistNM<0.4? 0.4:deltaDistNM
            let deltaDistFeet = deltaDistNM * 6076.12
            if (consoled) {
                //console.log("deltaDistNM",deltaDistNM,"deltaAltFeet",deltaAltFeet,"final FPA",Math.atan(deltaAltFeet / deltaDistFeet) * 180 / Math.PI)
            }
            return Math.atan(deltaAltFeet / deltaDistFeet) * 180 / Math.PI
        }
        getFPAfromPointsDegree(origin, destination, consoled = false) {
            let point1Alt = origin.ALT
            let point1Dist = origin.CommulativeDistance
            let point2Alt = destination.ALT
            let point2Dist = destination.CommulativeDistance

            let deltaAltFeet = (point2Alt - point1Alt)
            let deltaDistNM = point2Dist - point1Dist
            //deltaDistNM=deltaDistNM<0.4? 0.4:deltaDistNM
            let deltaDistFeet = deltaDistNM * 6076.12
            if (consoled) {
                //console.log("deltaDistNM",deltaDistNM,"deltaAltFeet",deltaAltFeet,"final FPA",Math.atan(deltaAltFeet / deltaDistFeet) * 180 / Math.PI)
            }
            return Math.atan(deltaAltFeet / deltaDistFeet) * 180 / Math.PI
        }
        insertTOC(tocDist, tocALT) {
            let existingTOC = document.getElementById("tocElement" + this.index)
            let tocInArray = this.waypointsToDraw.find(e => e.TYPE == "TOC")
            if (!this.vNavState) {
                return
            }

            if ((existingTOC && existingTOC.parentNode) && (!tocDist || !tocALT || !tocInArray || tocDist < 0.5) || this.vNavState == -1) {
                existingTOC.parentNode.removeChild(existingTOC)
                return;
            }

            this.tocPseudoDistance = tocDist
            if (existingTOC) {
                this.updateTOC(existingTOC, tocALT, tocDist)
            } else if (tocInArray && !existingTOC) {
                this.tOCcontainer = document.createElementNS(Avionics.SVG.NS, "g");
                this.tOCcontainer.id = "tocElement" + this.index
                let tocCircle = document.createElementNS(Avionics.SVG.NS, "circle");
                tocCircle.id = "tocElementCircle" + this.index
                tocCircle.setAttribute("cx", this.getHorPixels(tocDist))
                tocCircle.setAttribute("cy", this.getAltPixels(tocALT))
                tocCircle.setAttribute("r", "10")
                tocCircle.setAttribute("fill", "transparent")
                tocCircle.setAttribute("stroke", "grey")
                tocCircle.setAttribute("stroke-width", "3")
                let toctext = document.createElementNS(Avionics.SVG.NS, "text");
                toctext.id = "tocElementText" + this.index
                toctext.setAttribute("x", this.getHorPixels(tocDist));
                toctext.setAttribute("y", this.getAltPixels(tocALT) - 30);
                toctext.setAttribute("fill", "grey");
                toctext.setAttribute("font-size", "25");
                toctext.setAttribute("font-family", "HDJTnumeral");
                toctext.setAttribute("text-anchor", "middle");
                toctext.textContent = "TOC"
                this.tOCcontainer.appendChild(tocCircle)
                this.tOCcontainer.appendChild(toctext)
                if (this.waypointMapContainer) {
                    this.waypointMapContainer.appendChild(this.tOCcontainer)
                }
            }

        }
        updateTOC(existingTOC, point2Alt, tocDist) {
            if (!existingTOC || !point2Alt || !tocDist) {
                return;
            }


            let tocCircle = document.getElementById("tocElementCircle" + this.index)
            let tocTextelement = document.getElementById("tocElementText" + this.index)
            tocCircle.setAttribute("cx", this.getHorPixels(tocDist))
            tocCircle.setAttribute("cy", this.getAltPixels(point2Alt))
            tocTextelement.setAttribute("x", this.getHorPixels(tocDist));
            tocTextelement.setAttribute("y", this.getAltPixels(point2Alt) - 30);

        }
        async renderVnavLines() {
            if (!this.vNavState || !this.allWaypointsWithPsudoArray.length > 0) {
                return
            }
            if (this.vnavValid) {
                let pointToSkip
                let distanceToskip
                if (this.vNavState.state == 1) {
                    pointToSkip = this.allWaypointsWithPsudoArray.find(e => e.ICAO == "acftPosInit");
                    distanceToskip = Math.min(this.allWaypointsWithPsudoArray.find(e => e.ICAO == "acftPosCurrent").CommulativeDistance, 0)
                } else if (this.vNavState.state == -1) {
                    pointToSkip = this.allWaypointsWithPsudoArray.find(e => e.ICAO == "acftPosCurrent");
                    distanceToskip = Math.min(this.allWaypointsWithPsudoArray.find(e => e.ICAO == "acftPosInit").CommulativeDistance, 0)

                } else {
                    pointToSkip = this.allWaypointsWithPsudoArray.find(e => e.ICAO == "acftPosInit");
                    distanceToskip = Math.min(this.allWaypointsWithPsudoArray.find(e => e.ICAO == "acftPosCurrent").CommulativeDistance, 0)
                }

                let ClimbPointToSkipArray = this.allWaypointsWithPsudoArray.filter((item) => item.ICAO !== pointToSkip.ICAO)
                let filteredallWaypointsWithPsudoArray = this.allWaypointsWithPsudoArray.filter((item) => item.ALT && item.ICAO != pointToSkip.ICAO && item.ignoreAltConstraint != true && item.CommulativeDistance >= distanceToskip)
                let filteredActiveVpathIndex = filteredallWaypointsWithPsudoArray.findIndex(element => element == this.allWaypointsWithPsudoArray[this.activeVpathindex])

                if (this.existinlinesarray) {

                    for (let i = 0; i < this.existinlinesarray.length; i++) {
                        let point1Exist = filteredallWaypointsWithPsudoArray.findIndex((element) => element.ICAO == this.existinlinesarray[i].parent1)
                        let point2Exist = filteredallWaypointsWithPsudoArray.findIndex((element) => element.ICAO == this.existinlinesarray[i].parent2)
                        //
                        if (!point1Exist || !point2Exist) {
                            this.existinlinesarray[i].shouldBeDeleted = true
                            this.existinlinesarray.filter((e) => e == this.existinlinesarray[i])
                        } else {
                            this.existinlinesarray[i].shouldBeDeleted = false
                        }
                        if (point1Exist - point2Exist == -1) {
                            this.existinlinesarray[i].shouldBeDeleted = false
                        } else {
                            this.existinlinesarray[i].shouldBeDeleted = true
                        }
                    }
                }
                for (let i = 0; i < filteredallWaypointsWithPsudoArray.length - 1; i++) {
                    let point1 = filteredallWaypointsWithPsudoArray[i]
                    let point2 = filteredallWaypointsWithPsudoArray[i + 1]
                    let point1Alt = point1.ALT
                    let point2Alt = point2.ALT
                    let point1Dist = point1.CommulativeDistance;
                    let point2Dist = point2.CommulativeDistance;
                    let existingLine
                    let existinglineObject
                    if (!point1 || !point2 || !point1Alt || !point2Alt || point1Dist == undefined || !point2Dist) {
                        continue
                    }
                    if (this.existinlinesarray) {
                        existinglineObject = this.existinlinesarray.find(element => element.id == point1.ICAO + point2.ICAO + "-line" + this.index)
                        if (existinglineObject && existinglineObject.lineElement) {
                            existingLine = existinglineObject.lineElement
                        }
                    }
                    if (existinglineObject) {
                        if (!existinglineObject.shouldBeDeleted) {
                            existingLine.setAttribute("x1", this.getHorPixels(point1Dist))
                            existingLine.setAttribute("y1", this.getAltPixels(point1Alt))
                            existingLine.setAttribute("x2", this.getHorPixels(point2Dist))
                            existingLine.setAttribute("y2", this.getAltPixels(point2Alt))
                            existingLine.setAttribute("stroke", i < filteredActiveVpathIndex ? "magenta" : "white")
                        }
                    } else if (!existinglineObject) {
                        let createdLineObject = { lineElement: null, id: null, parent1: null, parent2: null };
                        let linec = document.createElementNS(Avionics.SVG.NS, "line");
                        linec.id = point1.ICAO + point2.ICAO + "-line" + this.index
                        linec.setAttribute("x1", this.getHorPixels(point1Dist))
                        linec.setAttribute("y1", this.getAltPixels(point1Alt))
                        linec.setAttribute("x2", this.getHorPixels(point2Dist))
                        linec.setAttribute("y2", this.getAltPixels(point2Alt))
                        linec.setAttribute("stroke-width", "7")
                        linec.setAttribute("stroke", i < filteredActiveVpathIndex ? "magenta" : "white")
                        createdLineObject.lineElement = linec
                        createdLineObject.id = point1.ICAO + point2.ICAO + "-line" + this.index
                        createdLineObject.parent1 = point1.ICAO
                        createdLineObject.parent2 = point2.ICAO
                        createdLineObject.parent1ALT = point1.ALT
                        createdLineObject.parent2ALT = point1.ALT
                        // createdLineObject.shouldBeDeleted=false
                        this.existinlinesarray.push(createdLineObject)
                        if (this.waypointMapContainer) {
                            this.waypointMapContainer.appendChild(linec);
                        }
                    }
                }
                //delete 
                for (let i = 0; i < this.existinlinesarray.length; i++) {
                    if (this.existinlinesarray[i].shouldBeDeleted == true) {
                        let elem = document.getElementById(this.existinlinesarray[i].id)
                        if (elem) { elem.parentNode.removeChild(elem) }
                    }
                }
                let a = this.existinlinesarray.filter(element => element.shouldBeDeleted != true);
                this.existinlinesarray = [...a]
            }
        }
        updateLine(existingLine, point1Alt, point2Alt, point1Dist, point2Dist, i) {
            existingLine.setAttribute("x1", this.getHorPixels(point1Dist))
            existingLine.setAttribute("y1", this.getAltPixels(point1Alt))
            existingLine.setAttribute("x2", this.getHorPixels(point2Dist))
            existingLine.setAttribute("y2", this.getAltPixels(point2Alt))
            existingLine.setAttribute("stroke", i < this.activeVpathindex ? "magenta" : "white")
        }

        /** @inheritdoc */
        render() {
            return (msfssdk.FSComponent.buildComponent("div", { class: this.classList, id: "vsdContentsRoot" + this.index },
                msfssdk.FSComponent.buildComponent("div", { class: "pane-inset-panel-title" }, "Vertical Situation Display"),
            ))
        }
        /** Destroys subs and comps. */
        destroy() {
            var _a;
            this.clock.destroy();
            this.flightPlanTextUpdater.destroy();
            this.legOrCum.destroy();
            this.root.destroy()
                (_a = this.directToRandomSub) === null || _a === void 0 ? void 0 : _a.destroy();
        }
    }


    class HJETVSD extends DisplayPaneInsetView {
        constructor() {
            super(...arguments);
            this.VSDPanelRef = msfssdk.FSComponent.createRef();
            this.vnavProfilePanelRef = msfssdk.FSComponent.createRef();
            this.displayPaneSizeMode = msfssdk.Subject.create(exports.DisplayPaneSizeMode.Hidden);
            this.classList = msfssdk.SetSubject.create(['vertical-situation-display-inset']);
        }
        /** @inheritdoc */
        onAfterRender() {
            this.displayPaneSizeMode.sub(mode => {
                console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!mode", mode)
                this.classList.toggle('show-vnav-box', mode === exports.DisplayPaneSizeMode.Full);
            }, true);
        }
        /** @inheritdoc */
        onResume(size, width, height) {
            console.log("vsd resuming")
            var _a;
            this.displayPaneSizeMode.set(size);
            this.VSDPanelRef.instance.resume();
            (_a = this.vnavProfilePanelRef.getOrDefault()) === null || _a === void 0 ? void 0 : _a.resume();
        }
        /** @inheritdoc */
        onPause() {
            var _a;
            this.VSDPanelRef.instance.pause();
            (_a = this.vnavProfilePanelRef.getOrDefault()) === null || _a === void 0 ? void 0 : _a.pause();
        }
        /** @inheritdoc */
        onResize(size, width, height) {
            console.log("vsd resuming")
            this.displayPaneSizeMode.set(size);
        }
        /**
         * Handles the flight plan text update event.
         * @param event The event.
         */
        onFlightPlanTextInsetEvent(event) {
            var _a;
            (_a = this.VSDPanelRef.getOrDefault()) === null || _a === void 0 ? void 0 : _a.onFlightPlanTextInsetEvent(event);
        }
        /** @inheritdoc */
        render() {
            return (msfssdk.FSComponent.buildComponent("div", { class: this.classList },
                msfssdk.FSComponent.buildComponent(HJETVsdContents, { ref: this.VSDPanelRef, bus: this.props.bus, flightPlanStore: this.props.flightPlanStore, flightPlanListManager: this.props.flightPlanListManager, mapInsetTextCumulativeSetting: this.props.mapInsetTextCumulativeSetting, vnavDataProvider: this.props.vnavDataProvider, vnavManager: this.vnavManager, mapRangeModule: this.props.mapRangeModule, paneIndex: this.props.paneIndex }),
                !this.isPfd &&
                msfssdk.FSComponent.buildComponent(CurrentVnavProfilePanel, { ref: this.vnavProfilePanelRef, bus: this.props.bus, fms: this.props.flightPlanStore.fms, planIndex: this.props.flightPlanStore.planIndex, store: this.props.flightPlanStore, vnavDataProvider: this.props.vnavDataProvider })));
        }
        /** Destroys subs and comps. */
        destroy() {
            var _a, _b;
            (_a = this.VSDPanelRef.getOrDefault()) === null || _a === void 0 ? void 0 : _a.destroy();
            (_b = this.vnavProfilePanelRef.getOrDefault()) === null || _b === void 0 ? void 0 : _b.destroy();
        }
    }


    ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    /* eslint-disable @typescript-eslint/no-non-null-assertion */
    /**
     * Navigation map pane inset modes.
     */
    var NavigationMapPaneInsetMode;
    (function (NavigationMapPaneInsetMode) {
        NavigationMapPaneInsetMode["None"] = "None";
        NavigationMapPaneInsetMode["VertSituationDisplay"] = "VertSituationDisplay";
        NavigationMapPaneInsetMode["FlightPlanText"] = "FlightPlanText";
        NavigationMapPaneInsetMode["FlightPlanProgress"] = "FlightPlanProgress";
    })(NavigationMapPaneInsetMode || (NavigationMapPaneInsetMode = {}));
    /**
     * A display pane view which displays a navigation map.
     */
    class NavigationMapPaneView extends DisplayPaneView {
        constructor() {
            super(...arguments);
            this.flightPlanTextInset = msfssdk.FSComponent.createRef();
            this.hjetVsdInset = msfssdk.FSComponent.createRef(); // marwan:added
            this.insetModeToViewMap = {
                [NavigationMapPaneInsetMode.FlightPlanText]: this.flightPlanTextInset,
                [NavigationMapPaneInsetMode.VertSituationDisplay]: this.hjetVsdInset, //marwan:added
            };
            this.rootCssClass = msfssdk.SetSubject.create(['nav-map-pane']);
            this.displayPaneSizeMode = msfssdk.Subject.create(exports.DisplayPaneSizeMode.Hidden);
            this.paneSize = msfssdk.Vec2Math.create(100, 100);
            this.mapSize = msfssdk.Vec2Subject.create(msfssdk.Vec2Math.create(100, 100));
            this.mapSettingManager = MapUserSettings.getDisplayPaneManager(this.props.bus, this.props.index);
            this.drawEntirePrimaryPlan = msfssdk.Subject.create(false);
            this.compiledMap = msfssdk.MapSystemBuilder.create(this.props.bus)
                .with(MapBuilder.navMap, Object.assign(Object.assign({
                    bingId: `pane_map_${this.props.index}`, bingDelay: BingUtils.getBindDelayForPane(this.props.index), dataUpdateFreq: NavigationMapPaneView.DATA_UPDATE_FREQ, rangeRingOptions: {
                        showLabel: true
                    }, rangeCompassOptions: {
                        showLabel: true,
                        showHeadingBug: true,
                        bearingTickMajorLength: 10,
                        bearingTickMinorLength: 5,
                        bearingLabelFont: 'DejaVuSans-SemiBold',
                        bearingLabelFontSize: 17
                    }, flightPlanner: this.props.flightPlanner, supportFlightPlanFocus: true, drawEntirePlan: this.drawEntirePrimaryPlan, nominalFocusMargins: msfssdk.VecNMath.create(4, 40, 40, 40, 40)
                }, MapBuilder.ownAirplaneIconOptions(this.props.config)), {
                    trafficSystem: this.props.trafficSystem, trafficIconOptions: {
                        iconSize: 30,
                        font: 'DejaVuSans-SemiBold',
                        fontSize: 14
                    }, pointerBoundsOffset: msfssdk.VecNMath.create(4, 0.1, 0.1, 0.1, 0.1), pointerInfoSize: garminsdk.MapPointerInfoLayerSize.Full, miniCompassImgSrc: MapBuilder.miniCompassIconSrc(), relativeTerrainStatusIndicatorIconPath: MapBuilder.relativeTerrainIconSrc(), settingManager: this.mapSettingManager, unitsSettingManager: garminsdk.UnitsUserSettings.getManager(this.props.bus), trafficSettingManager: garminsdk.TrafficUserSettings.getManager(this.props.bus), iauIndex: MapBuilder.getIauIndexForDisplayPane(this.props.index), iauSettingManager: this.props.iauSettingManager
                }))
                .withProjectedSize(this.mapSize)
                .build('common-map nav-map');
            this.mapRangeModule = this.compiledMap.context.model.getModule(garminsdk.GarminMapKeys.Range);
            this.mapPointerModule = this.compiledMap.context.model.getModule(garminsdk.GarminMapKeys.Pointer);
            this.mapFocusModule = this.compiledMap.context.model.getModule(garminsdk.GarminMapKeys.FlightPlanFocus);
            this.mapPointerController = this.compiledMap.context.getController(garminsdk.GarminMapKeys.Pointer);
            this.mapRangeController = this.compiledMap.context.getController(garminsdk.GarminMapKeys.Range);
            this.mapPointerActiveSetting = DisplayPanesUserSettings.getDisplayPaneManager(this.props.bus, this.props.index).getSetting('displayPaneMapPointerActive');
            this.focusedPlanIndex = -1;
            this.focusedPlanName = msfssdk.Subject.create('');
            this.setFocusOpId = 0;
            this.mapInsetModeSetting = this.mapSettingManager.getSetting('mapInsetMode');
            this.mapInsetTextCumulativeSetting = this.mapSettingManager.getSetting('mapInsetTextCumulative');
            this.insetMode = msfssdk.Subject.create(NavigationMapPaneInsetMode.None);
        }
        /** @inheritdoc */
        onAfterRender() {
            this._title.set('Navigation Map');
            this.compiledMap.ref.instance.sleep();
            this.pointerActivePipe = this.mapPointerModule.isActive.pipe(this.mapPointerActiveSetting, true);
            this.planNameTitlePipe = this.focusedPlanName.pipe(this._title, name => `Flight Plan – ${name}`, true);
            const sub = this.props.bus.getSubscriber();
            this.planNameSetSub = sub.on('fplUserDataSet').handle(e => {
                if (e.planIndex === this.focusedPlanIndex && e.key === 'name') {
                    this.focusedPlanName.set(G3000FPLUtils.getFlightPlanDisplayName(this.props.flightPlanner.getFlightPlan(this.focusedPlanIndex)));
                }
            });
            this.planNameDeleteSub = sub.on('fplUserDataDelete').handle(e => {
                if (e.planIndex === this.focusedPlanIndex && e.key === 'name') {
                    this.focusedPlanName.set(G3000FPLUtils.getFlightPlanDisplayName(this.props.flightPlanner.getFlightPlan(this.focusedPlanIndex)));
                }
            });
            this.planOriginDestSub = sub.on('fplOriginDestChanged').handle(e => {
                if (e.planIndex === this.focusedPlanIndex) {
                    this.focusedPlanName.set(G3000FPLUtils.getFlightPlanDisplayName(this.props.flightPlanner.getFlightPlan(this.focusedPlanIndex)));
                }
            });
            this.mapInsetSettingModeSub = this.mapInsetModeSetting.sub(mode => {
                switch (mode) {
                    case exports.MapInsetSettingMode.VertSituationDisplay:
                        this.insetMode.set(NavigationMapPaneInsetMode.VertSituationDisplay);
                        break;
                    case exports.MapInsetSettingMode.FlightPlanText:
                        this.insetMode.set(NavigationMapPaneInsetMode.FlightPlanText);
                        break;
                    case exports.MapInsetSettingMode.FlightPlanProgress:
                        this.insetMode.set(NavigationMapPaneInsetMode.FlightPlanProgress);
                        break;
                    default:
                        this.insetMode.set(NavigationMapPaneInsetMode.None);
                }
            }, false, true);
            this.insetMode.sub(this.onInsetModeChanged.bind(this), true);
        }
        /**
         * Responds to when this pane's inset mode changes.
         * @param mode The new inset mode.
         */
        onInsetModeChanged(mode) {
            var _a, _b, _c, _d;
            this.updateMapSize();
            this.rootCssClass.toggle('nav-map-pane-inset-none', mode === NavigationMapPaneInsetMode.None);
            this.rootCssClass.toggle('nav-map-pane-inset-vsd', mode === NavigationMapPaneInsetMode.VertSituationDisplay);
            this.rootCssClass.toggle('nav-map-pane-inset-fpl', mode === NavigationMapPaneInsetMode.FlightPlanText);
            this.rootCssClass.toggle('nav-map-pane-inset-fpr', mode === NavigationMapPaneInsetMode.FlightPlanProgress);
            (_a = this.activeInsetView) === null || _a === void 0 ? void 0 : _a.onPause();
            this.activeInsetView = (_c = (_b = this.insetModeToViewMap[mode]) === null || _b === void 0 ? void 0 : _b.getOrDefault()) !== null && _c !== void 0 ? _c : undefined;
            (_d = this.activeInsetView) === null || _d === void 0 ? void 0 : _d.onResume(this.displayPaneSizeMode.get(), this.paneSize[0], this.paneSize[1]);
        }
        /**
         * Updates the size of this pane's map.
         */
        updateMapSize() {
            switch (this.insetMode.get()) {
                case NavigationMapPaneInsetMode.VertSituationDisplay:
                    this.mapSize.set(this.paneSize[0], this.isPfd ? NavigationMapPaneView.VSD_MAP_HEIGHT_PFD : NavigationMapPaneView.VSD_MAP_HEIGHT_MFD);
                    break;
                case NavigationMapPaneInsetMode.FlightPlanText:
                    this.mapSize.set(this.paneSize[0], NavigationMapPaneView.FLIGHT_PLAN_TEXT_MAP_HEIGHT);
                    break;
                default:
                    this.mapSize.set(this.paneSize);
            }
        }
        /** @inheritdoc */
        onResume(size, width, height) {
            var _a, _b, _c;
            this.displayPaneSizeMode.set(size);
            msfssdk.Vec2Math.set(width, height, this.paneSize);
            this.updateMapSize();
            (_a = this.mapInsetSettingModeSub) === null || _a === void 0 ? void 0 : _a.resume(true);
            this.compiledMap.ref.instance.wake();
            (_b = this.pointerActivePipe) === null || _b === void 0 ? void 0 : _b.resume(true);
            (_c = this.activeInsetView) === null || _c === void 0 ? void 0 : _c.onResume(size, width, height);
        }
        /** @inheritdoc */
        onPause() {
            var _a, _b, _c;
            (_a = this.mapInsetSettingModeSub) === null || _a === void 0 ? void 0 : _a.pause();
            this.mapPointerController.setPointerActive(false);
            this.compiledMap.ref.instance.sleep();
            (_b = this.pointerActivePipe) === null || _b === void 0 ? void 0 : _b.pause();
            this.mapPointerActiveSetting.value = false;
            (_c = this.activeInsetView) === null || _c === void 0 ? void 0 : _c.onPause();
        }
        /** @inheritdoc */
        onResize(size, width, height) {
            var _a;
            this.displayPaneSizeMode.set(size);
            msfssdk.Vec2Math.set(width, height, this.paneSize);
            this.updateMapSize();
            (_a = this.activeInsetView) === null || _a === void 0 ? void 0 : _a.onResize(size, width, height);
        }
        /** @inheritdoc */
        onUpdate(time) {
            var _a;
            this.compiledMap.ref.instance.update(time);
            (_a = this.activeInsetView) === null || _a === void 0 ? void 0 : _a.onUpdate(time);
        }
        /** @inheritdoc */
        onEvent(event) {
            var _a;
            switch (event.eventType) {
                case 'display_pane_map_range_inc':
                    this.changeRangeIndex(1);
                    break;
                case 'display_pane_map_range_dec':
                    this.changeRangeIndex(-1);
                    break;
                case 'display_pane_map_pointer_active_set':
                    this.mapPointerController.setPointerActive(event.eventData);
                    break;
                case 'display_pane_map_pointer_active_toggle':
                    this.mapPointerController.togglePointerActive();
                    break;
                case 'display_pane_map_pointer_move': {
                    if (this.mapPointerModule.isActive.get()) {
                        const eventData = event.eventData;
                        this.mapPointerController.movePointer(eventData[0], eventData[1]);
                    }
                    break;
                }
                case 'display_pane_nav_map_fpl_focus_set':
                    this.setFlightPlanFocus(event.eventData);
                    break;
                case 'display_pane_nav_map_text_inset_update':
                    (_a = this.flightPlanTextInset.getOrDefault()) === null || _a === void 0 ? void 0 : _a.onFlightPlanTextInsetEvent(event.eventData);
                    break;
            }
        }
        /**
         * Changes this view's map range index.
         * @param delta The change in index to apply.
         */
        changeRangeIndex(delta) {
            const oldIndex = this.mapRangeModule.nominalRangeIndex.get();
            const newIndex = this.mapRangeController.changeRangeIndex(delta);
            if (newIndex !== oldIndex) {
                this.mapPointerController.targetPointer();
            }
        }
        /**
         * Sets the flight plan focus for this view's map.
         * @param data Data defining the flight plan focus to set.
         */
        async setFlightPlanFocus(data) {
            var _a, _b;
            (_a = this.planNameTitlePipe) === null || _a === void 0 ? void 0 : _a.pause();
            if (data.planIndex < 0 || !this.props.flightPlanner.hasFlightPlan(data.planIndex)) {
                this.focusedPlanIndex = -1;
                this.drawEntirePrimaryPlan.set(false);
                this.mapFocusModule.planHasFocus.set(false);
                this.mapFocusModule.focus.set(null);
                this._title.set('Navigation Map');
                return;
            }
            // TODO: Support standby flight plan
            const plan = this.props.flightPlanner.getFlightPlan(data.planIndex);
            this.focusedPlanIndex = data.planIndex;
            let focus = Array.from(plan.legs(false, data.globalLegIndexStart, data.globalLegIndexEnd));
            if (focus.length === 0) {
                focus = null;
            }
            this.drawEntirePrimaryPlan.set(data.planIndex === garminsdk.Fms.PRIMARY_PLAN_INDEX);
            this.mapFocusModule.focus.set(focus);
            this.mapFocusModule.planHasFocus.set(data.planIndex === garminsdk.Fms.PRIMARY_PLAN_INDEX);
            const opId = ++this.setFocusOpId;
            const name = await this.getFlightPlanFocusName(plan, data.segmentIndex, data.globalLegIndex);
            if (opId !== this.setFocusOpId) {
                return;
            }
            if (typeof name === 'string') {
                this.focusedPlanName.set(name);
                (_b = this.planNameTitlePipe) === null || _b === void 0 ? void 0 : _b.resume(true);
            }
            else {
                this._title.set((msfssdk.FSComponent.buildComponent("div", { class: 'nav-map-title' },
                    msfssdk.FSComponent.buildComponent("span", null, "FlightPlan \u2013 "),
                    name)));
            }
        }
        /**
         * Gets the name of a flight plan focus. The name is represented as a string containing the name of the flight plan
         * if the focus has no associated segment or leg, or as a VNode if there is the focus does have an associated segment
         * or leg.
         * @param plan The focused flight plan.
         * @param segmentIndex The index of the flight plan segment associated with the focus, or `-1` if there is no
         * associated segment.
         * @param globalLegIndex The index of the first flight plan leg in the focus, or `-1` if the focus is empty.
         * @returns A Promise which will be fulfilled with the name of the specified flight plan focus.
         */
        async getFlightPlanFocusName(plan, segmentIndex, globalLegIndex) {
            const segment = plan.tryGetSegment(segmentIndex);
            const leg = plan.tryGetLeg(globalLegIndex);
            if (segment === null && leg === null) {
                return G3000FPLUtils.getFlightPlanDisplayName(plan);
            }
            if (segment !== null) {
                switch (segment.segmentType) {
                    case msfssdk.FlightPlanSegmentType.Departure:
                        if (plan.procedureDetails.departureIndex >= 0
                            && plan.procedureDetails.departureFacilityIcao !== undefined
                            && msfssdk.ICAO.isFacility(plan.procedureDetails.departureFacilityIcao, msfssdk.FacilityType.Airport)) {
                            const airport = await this.props.facLoader.getFacility(msfssdk.FacilityType.Airport, plan.procedureDetails.departureFacilityIcao);
                            return (msfssdk.FSComponent.buildComponent("div", null, garminsdk.FmsUtils.getDepartureNameAsString(airport, airport.departures[plan.procedureDetails.departureIndex], plan.procedureDetails.departureTransitionIndex, plan.procedureDetails.originRunway)));
                        }
                        else if (plan.originAirport !== undefined && msfssdk.ICAO.isFacility(plan.originAirport, msfssdk.FacilityType.Airport)) {
                            return (msfssdk.FSComponent.buildComponent("div", null, msfssdk.ICAO.getIdent(plan.originAirport)));
                        }
                        break;
                    case msfssdk.FlightPlanSegmentType.Enroute:
                        if (segment.airway !== undefined) {
                            return (msfssdk.FSComponent.buildComponent("div", null, segment.airway));
                        }
                        break;
                    case msfssdk.FlightPlanSegmentType.Arrival:
                        if (plan.procedureDetails.arrivalIndex >= 0
                            && plan.procedureDetails.arrivalFacilityIcao !== undefined
                            && msfssdk.ICAO.isFacility(plan.procedureDetails.arrivalFacilityIcao, msfssdk.FacilityType.Airport)) {
                            const airport = await this.props.facLoader.getFacility(msfssdk.FacilityType.Airport, plan.procedureDetails.arrivalFacilityIcao);
                            return (msfssdk.FSComponent.buildComponent("div", null, garminsdk.FmsUtils.getArrivalNameAsString(airport, airport.arrivals[plan.procedureDetails.arrivalIndex], plan.procedureDetails.arrivalTransitionIndex, plan.procedureDetails.arrivalRunway)));
                        }
                        break;
                    case msfssdk.FlightPlanSegmentType.Approach:
                        if (plan.procedureDetails.approachFacilityIcao !== undefined
                            && msfssdk.ICAO.isFacility(plan.procedureDetails.approachFacilityIcao, msfssdk.FacilityType.Airport)) {
                            const airport = await this.props.facLoader.getFacility(msfssdk.FacilityType.Airport, plan.procedureDetails.approachFacilityIcao);
                            const approach = garminsdk.FmsUtils.getApproachFromPlan(plan, airport);
                            if (approach !== undefined) {
                                return (msfssdk.FSComponent.buildComponent(garminsdk.ApproachNameDisplay, { approach: approach, airport: airport, useZeroWithSlash: true }));
                            }
                        }
                        break;
                    case msfssdk.FlightPlanSegmentType.Destination:
                        if (plan.destinationAirport !== undefined && msfssdk.ICAO.isFacility(plan.destinationAirport, msfssdk.FacilityType.Airport)) {
                            return (msfssdk.FSComponent.buildComponent("div", null, msfssdk.ICAO.getIdent(plan.destinationAirport)));
                        }
                        break;
                }
            }
            else {
                const prevLeg = plan.tryGetLeg(globalLegIndex - 1);
                return (msfssdk.FSComponent.buildComponent("div", null,
                    prevLeg !== null && (msfssdk.FSComponent.buildComponent(msfssdk.FSComponent.Fragment, null,
                        this.getLegName(prevLeg),
                        msfssdk.FSComponent.buildComponent("span", null, "/"))),
                    this.getLegName(leg)));
            }
            return G3000FPLUtils.getFlightPlanDisplayName(plan);
        }
        /**
         * Gets the displayed name of a flight plan leg as part of a flight plan focus.
         * @param leg A flight plan leg.
         * @returns The displayed name of the specified flight plan leg as part of a flight plan focus, as a VNode.
         */
        getLegName(leg) {
            var _a;
            switch (leg.leg.type) {
                case msfssdk.LegType.HF:
                case msfssdk.LegType.HM:
                case msfssdk.LegType.HA:
                case msfssdk.LegType.PI:
                    return msfssdk.FSComponent.buildComponent("span", null, msfssdk.ICAO.getIdent(leg.leg.fixIcao));
                case msfssdk.LegType.CA:
                case msfssdk.LegType.VA:
                    return msfssdk.FSComponent.buildComponent(msfssdk.FSComponent.Fragment, null,
                        msfssdk.FSComponent.buildComponent("span", null, msfssdk.UnitType.METER.convertTo(leg.leg.altitude1, msfssdk.UnitType.FOOT).toFixed(0)),
                        msfssdk.FSComponent.buildComponent("span", { class: 'numberunit-unit-small' }, "FT"));
                default:
                    return msfssdk.FSComponent.buildComponent("span", null, (_a = leg.name) !== null && _a !== void 0 ? _a : msfssdk.ICAO.getIdent(leg.leg.fixIcao));
            }
        }
        /** @inheritdoc */
        render() {
            return (msfssdk.FSComponent.buildComponent("div", { class: this.rootCssClass },
                this.compiledMap.map,
                msfssdk.FSComponent.buildComponent("div", { class: "nav-map-pane-inset-container" },
                    msfssdk.FSComponent.buildComponent("div", { class: "vertical-situation-display-inset" }),
                    msfssdk.FSComponent.buildComponent(HJETVSD, { ref: this.hjetVsdInset, index: this.props.index, bus: this.props.bus, flightPlanStore: this.props.flightPlanStore, flightPlanListManager: this.props.flightPlanListManager, mapRangeModule: this.mapRangeModule, vnavDataProvider: this.props.vnavDataProvider, paneIndex: this.props.index }), //added by marwan
                    msfssdk.FSComponent.buildComponent(FlightPlanTextInset, { ref: this.flightPlanTextInset, index: this.props.index, bus: this.props.bus, flightPlanStore: this.props.flightPlanStore, flightPlanListManager: this.props.flightPlanListManager, mapInsetTextCumulativeSetting: this.mapInsetTextCumulativeSetting, vnavDataProvider: this.props.vnavDataProvider }),
                    msfssdk.FSComponent.buildComponent("div", { class: "flight-plan-progress-inset" }, "Flight Plan Progress Not Available"))));
        }
        /** @inheritdoc */
        destroy() {
            var _a, _b, _c, _d, _e, _f;
            this.compiledMap.ref.instance.destroy();
            (_a = this.pointerActivePipe) === null || _a === void 0 ? void 0 : _a.destroy();
            (_b = this.planNameSetSub) === null || _b === void 0 ? void 0 : _b.destroy();
            (_c = this.planNameDeleteSub) === null || _c === void 0 ? void 0 : _c.destroy();
            (_d = this.planOriginDestSub) === null || _d === void 0 ? void 0 : _d.destroy();
            (_e = this.mapInsetSettingModeSub) === null || _e === void 0 ? void 0 : _e.destroy();
            (_f = this.flightPlanTextInset.getOrDefault()) === null || _f === void 0 ? void 0 : _f.destroy();
            super.destroy();
        }
    }
    NavigationMapPaneView.DATA_UPDATE_FREQ = 30; // Hz
    NavigationMapPaneView.VSD_MAP_HEIGHT_PFD = 488;
    NavigationMapPaneView.VSD_MAP_HEIGHT_MFD = 458;
    NavigationMapPaneView.FLIGHT_PLAN_TEXT_MAP_HEIGHT = 508;

    /**
     * Types of selections for a nearest pane.
     */
    exports.NearestPaneSelectionType = void 0;
    (function (NearestPaneSelectionType) {
        NearestPaneSelectionType["Airport"] = "Airport";
        NearestPaneSelectionType["Intersection"] = "Intersection";
        NearestPaneSelectionType["Vor"] = "Vor";
        NearestPaneSelectionType["Ndb"] = "Ndb";
        NearestPaneSelectionType["User"] = "User";
        NearestPaneSelectionType["Weather"] = "Weather";
    })(exports.NearestPaneSelectionType || (exports.NearestPaneSelectionType = {}));

    /**
     * A display pane view which displays a nearest map.
     */
    class NearestPaneView extends DisplayPaneView {
        constructor() {
            super(...arguments);
            this.size = msfssdk.Vec2Subject.create(msfssdk.Vec2Math.create(100, 100));
            this.facWaypointCache = garminsdk.GarminFacilityWaypointCache.getCache(this.props.bus);
            this.mapSettingManager = MapUserSettings.getDisplayPaneManager(this.props.bus, this.props.index);
            this.compiledMap = msfssdk.MapSystemBuilder.create(this.props.bus)
                .with(MapBuilder.nearestMap, Object.assign(Object.assign({
                    bingId: `pane_map_${this.props.index}`, bingDelay: BingUtils.getBindDelayForPane(this.props.index), dataUpdateFreq: NearestPaneView.DATA_UPDATE_FREQ, includeRunwayOutlines: true, rangeRingOptions: {
                        showLabel: true
                    }, rangeCompassOptions: {
                        showLabel: true,
                        showHeadingBug: true,
                        bearingTickMajorLength: 10,
                        bearingTickMinorLength: 5,
                        bearingLabelFont: 'DejaVuSans-SemiBold',
                        bearingLabelFontSize: 17
                    }, flightPlanner: this.props.flightPlanner
                }, MapBuilder.ownAirplaneIconOptions(this.props.config)), {
                    trafficSystem: this.props.trafficSystem, trafficIconOptions: {
                        iconSize: 30,
                        font: 'DejaVuSans-SemiBold',
                        fontSize: 14
                    }, pointerBoundsOffset: msfssdk.VecNMath.create(4, 0.1, 0.1, 0.1, 0.1), pointerInfoSize: garminsdk.MapPointerInfoLayerSize.Full, miniCompassImgSrc: MapBuilder.miniCompassIconSrc(), includeTerrainScale: false, settingManager: this.mapSettingManager, unitsSettingManager: garminsdk.UnitsUserSettings.getManager(this.props.bus), trafficSettingManager: garminsdk.TrafficUserSettings.getManager(this.props.bus), iauIndex: MapBuilder.getIauIndexForDisplayPane(this.props.index), iauSettingManager: this.props.iauSettingManager
                }))
                .withProjectedSize(this.size)
                .build('common-map nearest-map');
            this.mapRangeModule = this.compiledMap.context.model.getModule(garminsdk.GarminMapKeys.Range);
            this.mapWptHighlightModule = this.compiledMap.context.model.getModule(garminsdk.GarminMapKeys.WaypointHighlight);
            this.mapPointerModule = this.compiledMap.context.model.getModule(garminsdk.GarminMapKeys.Pointer);
            this.mapPointerController = this.compiledMap.context.getController(garminsdk.GarminMapKeys.Pointer);
            this.mapRangeController = this.compiledMap.context.getController(garminsdk.GarminMapKeys.Range);
            this.mapNrstRTRController = this.compiledMap.context.getController(garminsdk.GarminMapKeys.Nearest);
            this.mapPointerActiveSetting = DisplayPanesUserSettings.getDisplayPaneManager(this.props.bus, this.props.index).getSetting('displayPaneMapPointerActive');
            // Map projection parameters are not fully initialized until after the first time the map is updated, so we flag the
            // map as not ready until the first update is finished.
            this.isReady = false;
            this.isReadyResolveQueue = [];
            this.isReadyRejectQueue = [];
            this.setWaypointOpId = 0;
        }
        /** @inheritdoc */
        onAfterRender() {
            this.compiledMap.ref.instance.sleep();
            this.pointerActivePipe = this.mapPointerModule.isActive.pipe(this.mapPointerActiveSetting, true);
        }
        /** @inheritdoc */
        onResume(size, width, height) {
            var _a;
            this.size.set(width, height);
            this.compiledMap.ref.instance.wake();
            (_a = this.pointerActivePipe) === null || _a === void 0 ? void 0 : _a.resume(true);
        }
        /** @inheritdoc */
        onPause() {
            var _a;
            this.mapPointerController.setPointerActive(false);
            this.compiledMap.ref.instance.sleep();
            (_a = this.pointerActivePipe) === null || _a === void 0 ? void 0 : _a.pause();
            this.mapPointerActiveSetting.value = false;
        }
        /** @inheritdoc */
        onResize(size, width, height) {
            this.size.set(width, height);
        }
        /** @inheritdoc */
        onUpdate(time) {
            this.compiledMap.ref.instance.update(time);
            if (!this.isReady) {
                this.isReadyResolveQueue.forEach(resolve => resolve());
                this.isReadyResolveQueue.length = 0;
                this.isReadyRejectQueue.length = 0;
                this.isReady = true;
            }
        }
        /** @inheritdoc */
        onEvent(event) {
            switch (event.eventType) {
                case 'display_pane_map_range_inc':
                    this.changeRangeIndex(1);
                    break;
                case 'display_pane_map_range_dec':
                    this.changeRangeIndex(-1);
                    break;
                case 'display_pane_map_pointer_active_set':
                    this.mapPointerController.setPointerActive(event.eventData);
                    break;
                case 'display_pane_map_pointer_active_toggle':
                    this.mapPointerController.togglePointerActive();
                    break;
                case 'display_pane_map_pointer_move': {
                    if (this.mapPointerModule.isActive.get()) {
                        const eventData = event.eventData;
                        this.mapPointerController.movePointer(eventData[0], eventData[1]);
                    }
                    break;
                }
                case 'display_pane_nearest_set':
                    this.setWaypoint(event.eventData);
                    break;
            }
        }
        /**
         * Changes this view's map range index.
         * @param delta The change in index to apply.
         */
        changeRangeIndex(delta) {
            const oldIndex = this.mapRangeModule.nominalRangeIndex.get();
            const newIndex = this.mapRangeController.changeRangeIndex(delta);
            if (newIndex !== oldIndex) {
                this.mapPointerController.targetPointer();
            }
        }
        /**
         * Sets the selected waypoint.
         * @param selectionData Data describing the selected waypoint.
         */
        async setWaypoint(selectionData) {
            var _a;
            this._title.set((_a = NearestPaneView.TITLE_TEXT[selectionData.type]) !== null && _a !== void 0 ? _a : '');
            if (!msfssdk.ICAO.isFacility(selectionData.icao)) {
                this.mapWptHighlightModule.waypoint.set(null);
                return;
            }
            const opId = ++this.setWaypointOpId;
            const [facility] = await Promise.all([
                this.props.facLoader.getFacility(msfssdk.ICAO.getFacilityType(selectionData.icao), selectionData.icao),
                this.awaitReady()
            ]);
            if (opId !== this.setWaypointOpId) {
                return;
            }
            const waypoint = this.facWaypointCache.get(facility);
            this.mapWptHighlightModule.waypoint.set(waypoint);
            if (selectionData.resetRange) {
                this.mapNrstRTRController.trySetRangeForWaypoint();
            }
        }
        /**
         * Waits until this view's map is ready to target selected waypoints.
         * @returns A Promise which will be fulfilled when this view's map is ready to target selected waypoints, or
         * rejected if this view is destroyed before the map is ready.
         */
        awaitReady() {
            if (this.isReady) {
                return Promise.resolve();
            }
            else {
                return new Promise((resolve, reject) => {
                    this.isReadyResolveQueue.push(resolve);
                    this.isReadyRejectQueue.push(reject);
                });
            }
        }
        /** @inheritdoc */
        render() {
            return (this.compiledMap.map);
        }
        /** @inheritdoc */
        destroy() {
            var _a;
            this.isReadyRejectQueue.forEach(reject => reject('NearestPaneView: view was destroyed'));
            this.isReadyResolveQueue.length = 0;
            this.isReadyRejectQueue.length = 0;
            this.compiledMap.ref.instance.destroy();
            (_a = this.pointerActivePipe) === null || _a === void 0 ? void 0 : _a.destroy();
            super.destroy();
        }
    }
    NearestPaneView.DATA_UPDATE_FREQ = 30; // Hz
    NearestPaneView.TITLE_TEXT = {
        [exports.NearestPaneSelectionType.Airport]: 'Nearest Airport',
        [exports.NearestPaneSelectionType.Vor]: 'Nearest VOR',
        [exports.NearestPaneSelectionType.Ndb]: 'Nearest NDB',
        [exports.NearestPaneSelectionType.Intersection]: 'Nearest Intersection',
        [exports.NearestPaneSelectionType.User]: 'Nearest User Wpt',
        [exports.NearestPaneSelectionType.Weather]: 'Nearest Weather'
    };

    /**
     * A display pane view which displays a procedure preview.
     */
    class ProcedurePreviewPaneView extends DisplayPaneView {
        constructor() {
            super(...arguments);
            this.size = msfssdk.Vec2Subject.create(msfssdk.Vec2Math.create(100, 100));
            this.mapSettingManager = MapUserSettings.getDisplayPaneManager(this.props.bus, this.props.index);
            this.compiledMap = msfssdk.MapSystemBuilder.create(this.props.bus)
                .with(MapBuilder.procMap, Object.assign(Object.assign({
                    bingId: `pane_map_${this.props.index}`, bingDelay: BingUtils.getBindDelayForPane(this.props.index), dataUpdateFreq: ProcedurePreviewPaneView.DATA_UPDATE_FREQ, nominalFocusMargins: msfssdk.VecNMath.create(4, 40, 40, 40, 40), rangeRingOptions: {
                        showLabel: true
                    }
                }, MapBuilder.ownAirplaneIconOptions(this.props.config)), { pointerBoundsOffset: msfssdk.VecNMath.create(4, 0.1, 0.1, 0.1, 0.1), pointerInfoSize: garminsdk.MapPointerInfoLayerSize.Full, miniCompassImgSrc: MapBuilder.miniCompassIconSrc(), settingManager: this.mapSettingManager, unitsSettingManager: garminsdk.UnitsUserSettings.getManager(this.props.bus), iauIndex: MapBuilder.getIauIndexForDisplayPane(this.props.index), iauSettingManager: this.props.iauSettingManager }))
                .withProjectedSize(this.size)
                .build('common-map proc-map');
            this.mapRangeModule = this.compiledMap.context.model.getModule(garminsdk.GarminMapKeys.Range);
            this.mapProcPreviewModule = this.compiledMap.context.model.getModule(garminsdk.GarminMapKeys.ProcedurePreview);
            this.mapFocusModule = this.compiledMap.context.model.getModule(garminsdk.GarminMapKeys.FlightPlanFocus);
            this.mapPointerModule = this.compiledMap.context.model.getModule(garminsdk.GarminMapKeys.Pointer);
            this.mapPointerController = this.compiledMap.context.getController(garminsdk.GarminMapKeys.Pointer);
            this.mapRangeController = this.compiledMap.context.getController(garminsdk.GarminMapKeys.Range);
            this.mapPointerActiveSetting = DisplayPanesUserSettings.getDisplayPaneManager(this.props.bus, this.props.index).getSetting('displayPaneMapPointerActive');
            // Map projection parameters are not fully initialized until after the first time the map is updated, so we flag the
            // map as not ready until the first update is finished.
            this.isReady = false;
            this.isReadyResolveQueue = [];
            this.isReadyRejectQueue = [];
            this.setProcedureOpId = 0;
        }
        /** @inheritdoc */
        onAfterRender() {
            this.compiledMap.ref.instance.sleep();
            this.pointerActivePipe = this.mapPointerModule.isActive.pipe(this.mapPointerActiveSetting, true);
        }
        /** @inheritdoc */
        onResume(size, width, height) {
            var _a;
            this.size.set(width, height);
            this.compiledMap.ref.instance.wake();
            (_a = this.pointerActivePipe) === null || _a === void 0 ? void 0 : _a.resume(true);
        }
        /** @inheritdoc */
        onPause() {
            var _a;
            this.mapPointerController.setPointerActive(false);
            this.compiledMap.ref.instance.sleep();
            (_a = this.pointerActivePipe) === null || _a === void 0 ? void 0 : _a.pause();
            this.mapPointerActiveSetting.value = false;
        }
        /** @inheritdoc */
        onResize(size, width, height) {
            this.size.set(width, height);
        }
        /** @inheritdoc */
        onUpdate(time) {
            this.compiledMap.ref.instance.update(time);
            if (!this.isReady) {
                this.isReadyResolveQueue.forEach(resolve => resolve());
                this.isReadyResolveQueue.length = 0;
                this.isReadyRejectQueue.length = 0;
                this.isReady = true;
            }
        }
        /** @inheritdoc */
        onEvent(event) {
            switch (event.eventType) {
                case 'display_pane_map_range_inc':
                    this.changeRangeIndex(1);
                    break;
                case 'display_pane_map_range_dec':
                    this.changeRangeIndex(-1);
                    break;
                case 'display_pane_map_pointer_active_set':
                    this.mapPointerController.setPointerActive(event.eventData);
                    break;
                case 'display_pane_map_pointer_active_toggle':
                    this.mapPointerController.togglePointerActive();
                    break;
                case 'display_pane_map_pointer_move': {
                    if (this.mapPointerModule.isActive.get()) {
                        const eventData = event.eventData;
                        this.mapPointerController.movePointer(eventData[0], eventData[1]);
                    }
                    break;
                }
                case 'display_pane_procedure_preview_set':
                    this.setProcedure(event.eventData);
                    break;
            }
        }
        /**
         * Changes this view's map range index.
         * @param delta The change in index to apply.
         */
        changeRangeIndex(delta) {
            const oldIndex = this.mapRangeModule.nominalRangeIndex.get();
            const newIndex = this.mapRangeController.changeRangeIndex(delta);
            if (newIndex !== oldIndex) {
                this.mapPointerController.targetPointer();
            }
        }
        /**
         * Sets the previewed procedure.
         * @param procedureData Data describing the previewed procedure.
         */
        async setProcedure(procedureData) {
            if (!msfssdk.ICAO.isFacility(procedureData.airportIcao)
                || msfssdk.ICAO.getFacilityType(procedureData.airportIcao) !== msfssdk.FacilityType.Airport
                || (procedureData.procedureIndex < 0 && procedureData.type !== garminsdk.ProcedureType.VISUALAPPROACH)) {
                this.clearProcedure();
                return;
            }
            const opId = ++this.setProcedureOpId;
            const [airport] = await Promise.all([
                this.props.fms.facLoader.getFacility(msfssdk.FacilityType.Airport, procedureData.airportIcao),
                this.awaitReady()
            ]);
            if (opId !== this.setProcedureOpId) {
                return;
            }
            const oneWayRunway = procedureData.runwayDesignation === ''
                ? undefined
                : msfssdk.RunwayUtils.matchOneWayRunwayFromDesignation(airport, procedureData.runwayDesignation);
            if (procedureData.type === garminsdk.ProcedureType.VISUALAPPROACH && oneWayRunway === undefined) {
                this.clearProcedure();
                return;
            }
            const runwayNumber = oneWayRunway === null || oneWayRunway === void 0 ? void 0 : oneWayRunway.direction;
            const runwayDesignator = oneWayRunway === null || oneWayRunway === void 0 ? void 0 : oneWayRunway.runwayDesignator;
            const previewPlan = await this.props.fms.buildProcedurePreviewPlan(this.props.flightPathCalculator, airport, procedureData.type, procedureData.procedureIndex, procedureData.transitionIndex, oneWayRunway, procedureData.runwayTransitionIndex, runwayNumber, runwayDesignator);
            if (opId !== this.setProcedureOpId) {
                return;
            }
            let title;
            switch (procedureData.type) {
                case garminsdk.ProcedureType.DEPARTURE:
                    title = `Departure – ${garminsdk.FmsUtils.getDepartureNameAsString(airport, airport.departures[procedureData.procedureIndex], procedureData.transitionIndex, oneWayRunway)}`;
                    break;
                case garminsdk.ProcedureType.ARRIVAL:
                    title = `Arrival – ${garminsdk.FmsUtils.getArrivalNameAsString(airport, airport.arrivals[procedureData.procedureIndex], procedureData.transitionIndex, oneWayRunway)}`;
                    break;
                case garminsdk.ProcedureType.APPROACH:
                    title = (msfssdk.FSComponent.buildComponent(garminsdk.ApproachNameDisplay, { approach: airport.approaches[procedureData.procedureIndex], airport: airport, prefix: 'Approach \u2013 ' }));
                    break;
                case garminsdk.ProcedureType.VISUALAPPROACH: {
                    title = (msfssdk.FSComponent.buildComponent(garminsdk.ApproachNameDisplay
                        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                        , {
                            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                            approach: garminsdk.FmsUtils.buildEmptyVisualApproach(oneWayRunway), airport: airport, prefix: 'Approach \u2013 '
                        }));
                    break;
                }
                default:
                    title = '';
            }
            this._title.set(title);
            this.mapProcPreviewModule.procedureType.set(procedureData.type);
            this.mapProcPreviewModule.procedurePlan.set(previewPlan);
            this.mapFocusModule.focus.set([...previewPlan.legs()]);
        }
        /**
         * Clears the previewed procedure.
         */
        clearProcedure() {
            this._title.set('');
            this.mapProcPreviewModule.procedureType.set(garminsdk.ProcedureType.DEPARTURE);
            this.mapProcPreviewModule.procedurePlan.set(null);
            this.mapFocusModule.focus.set(null);
        }
        /**
         * Waits until this view's map is ready to preview procedures.
         * @returns A Promise which will be fulfilled when this view's map is ready to preview procedures, or rejected if
         * this view is destroyed before the map is ready.
         */
        awaitReady() {
            if (this.isReady) {
                return Promise.resolve();
            }
            else {
                return new Promise((resolve, reject) => {
                    this.isReadyResolveQueue.push(resolve);
                    this.isReadyRejectQueue.push(reject);
                });
            }
        }
        /** @inheritdoc */
        render() {
            return (this.compiledMap.map);
        }
        /** @inheritdoc */
        destroy() {
            var _a;
            this.isReadyRejectQueue.forEach(reject => reject('ProcedurePreviewPaneView: view was destroyed'));
            this.isReadyResolveQueue.length = 0;
            this.isReadyRejectQueue.length = 0;
            this.compiledMap.ref.instance.destroy();
            (_a = this.pointerActivePipe) === null || _a === void 0 ? void 0 : _a.destroy();
            super.destroy();
        }
    }
    ProcedurePreviewPaneView.DATA_UPDATE_FREQ = 30; // Hz

    /**
     * A display pane view which displays a traffic map.
     */
    class TrafficMapPaneView extends DisplayPaneView {
        constructor() {
            super(...arguments);
            this.size = msfssdk.Vec2Subject.create(msfssdk.Vec2Math.create(100, 100));
            this.rangeEndpoints = msfssdk.VecNSubject.create(msfssdk.VecNMath.create(4, 0.5, 0.5, 0.5, 0.95));
            this.trafficSettingManager = garminsdk.TrafficUserSettings.getManager(this.props.bus);
            this.mapSettingManager = MapUserSettings.getDisplayPaneManager(this.props.bus, this.props.index);
            this.compiledMap = msfssdk.MapSystemBuilder.create(this.props.bus)
                .with(MapBuilder.trafficMap, Object.assign(Object.assign({
                    trafficSystem: this.props.trafficSystem, dataUpdateFreq: TrafficMapPaneView.DATA_UPDATE_FREQ, rangeEndpoints: this.rangeEndpoints, trafficIconOptions: {
                        iconSize: 52,
                        font: 'DejaVuSans-SemiBold',
                        fontSize: 24
                    }, rangeRingOptions: {
                        outerLabelRadial: this.props.config.trafficRangeLabelRadial,
                        innerLabelRadial: this.props.config.trafficRangeLabelRadial,
                        innerStrokeWidth: this.props.config.trafficRangeInnerRingShow ? undefined : 0,
                        innerMinorTickSize: this.props.config.trafficRangeInnerRingShow ? 0 : undefined
                    }, flightPlanner: this.props.flightPlanner
                }, MapBuilder.ownAirplaneIconOptions(this.props.config, false)), { miniCompassImgSrc: MapBuilder.miniCompassIconSrc(), trafficSettingManager: this.trafficSettingManager, mapRangeSettingManager: this.mapSettingManager, unitsSettingManager: garminsdk.UnitsUserSettings.getManager(this.props.bus), iauIndex: MapBuilder.getIauIndexForDisplayPane(this.props.index), iauSettingManager: this.props.iauSettingManager }))
                .withProjectedSize(this.size)
                .build('traffic-map');
            this.mapRangeController = this.compiledMap.context.getController(garminsdk.GarminMapKeys.TrafficRange);
        }
        /** @inheritdoc */
        onAfterRender() {
            this._title.set('Traffic Map');
            this.compiledMap.ref.instance.sleep();
        }
        /** @inheritdoc */
        onResume(size, width, height) {
            this.updateSize(width, height);
            this.compiledMap.ref.instance.wake();
        }
        /** @inheritdoc */
        onPause() {
            this.compiledMap.ref.instance.sleep();
        }
        /** @inheritdoc */
        onResize(size, width, height) {
            this.updateSize(width, height);
        }
        /**
         * Updates the size of the map.
         * @param width The width of the map, in pixels.
         * @param height The height of the map, in pixels.
         */
        updateSize(width, height) {
            this.size.set(width, height);
            // To not overflow the range rings, we need to set range endpoints based on the shortest dimension
            if (width >= height) {
                this.rangeEndpoints.set(0.5, 0.5, 0.5, 0.95);
            }
            else {
                this.rangeEndpoints.set(0.5, 0.5, 0.95, 0.5);
            }
        }
        /** @inheritdoc */
        onUpdate(time) {
            this.compiledMap.ref.instance.update(time);
        }
        /** @inheritdoc */
        onEvent(event) {
            switch (event.eventType) {
                case 'display_pane_map_range_inc':
                    this.mapRangeController.changeRangeIndex(1);
                    return;
                case 'display_pane_map_range_dec':
                    this.mapRangeController.changeRangeIndex(-1);
                    return;
            }
        }
        /** @inheritdoc */
        render() {
            return (this.compiledMap.map);
        }
        /** @inheritdoc */
        destroy() {
            super.destroy();
            this.compiledMap.ref.instance.destroy();
        }
    }
    TrafficMapPaneView.DATA_UPDATE_FREQ = 30; // Hz

    /**
     * A display pane view which displays a waypoint information map.
     */
    class WaypointInfoPaneView extends DisplayPaneView {
        constructor() {
            super(...arguments);
            this.size = msfssdk.Vec2Subject.create(msfssdk.Vec2Math.create(100, 100));
            this.facWaypointCache = garminsdk.GarminFacilityWaypointCache.getCache(this.props.bus);
            this.mapSettingManager = MapUserSettings.getDisplayPaneManager(this.props.bus, this.props.index);
            this.compiledMap = msfssdk.MapSystemBuilder.create(this.props.bus)
                .with(MapBuilder.waypointMap, Object.assign(Object.assign({
                    bingId: `pane_map_${this.props.index}`, bingDelay: BingUtils.getBindDelayForPane(this.props.index), dataUpdateFreq: WaypointInfoPaneView.DATA_UPDATE_FREQ, supportAirportAutoRange: true, airportAutoRangeMargins: msfssdk.VecNMath.create(4, 40, 40, 40, 40), includeRunwayOutlines: true, rangeRingOptions: {
                        showLabel: true
                    }
                }, MapBuilder.ownAirplaneIconOptions(this.props.config)), { pointerBoundsOffset: msfssdk.VecNMath.create(4, 0.1, 0.1, 0.1, 0.1), pointerInfoSize: garminsdk.MapPointerInfoLayerSize.Full, miniCompassImgSrc: MapBuilder.miniCompassIconSrc(), includeDetailIndicator: true, showDetailIndicatorTitle: true, settingManager: this.mapSettingManager, unitsSettingManager: garminsdk.UnitsUserSettings.getManager(this.props.bus), iauIndex: MapBuilder.getIauIndexForDisplayPane(this.props.index), iauSettingManager: this.props.iauSettingManager }))
                .withProjectedSize(this.size)
                .build('common-map wpt-map');
            this.mapRangeModule = this.compiledMap.context.model.getModule(garminsdk.GarminMapKeys.Range);
            this.mapWptSelectionModule = this.compiledMap.context.model.getModule(garminsdk.GarminMapKeys.WaypointSelection);
            this.mapPointerModule = this.compiledMap.context.model.getModule(garminsdk.GarminMapKeys.Pointer);
            this.mapPointerController = this.compiledMap.context.getController(garminsdk.GarminMapKeys.Pointer);
            this.mapRangeController = this.compiledMap.context.getController(garminsdk.GarminMapKeys.Range);
            this.mapWptRTRController = this.compiledMap.context.getController(garminsdk.GarminMapKeys.WaypointRTR);
            this.mapPointerActiveSetting = DisplayPanesUserSettings.getDisplayPaneManager(this.props.bus, this.props.index).getSetting('displayPaneMapPointerActive');
            // Map projection parameters are not fully initialized until after the first time the map is updated, so we flag the
            // map as not ready until the first update is finished.
            this.isReady = false;
            this.isReadyResolveQueue = [];
            this.isReadyRejectQueue = [];
            this.setWaypointOpId = 0;
        }
        /** @inheritdoc */
        onAfterRender() {
            this.compiledMap.ref.instance.sleep();
            this.mapRangeController.setRangeIndex(WaypointInfoPaneView.DEFAULT_RANGE_INDEX);
            this.pointerActivePipe = this.mapPointerModule.isActive.pipe(this.mapPointerActiveSetting, true);
        }
        /** @inheritdoc */
        onResume(size, width, height) {
            var _a;
            this.size.set(width, height);
            this.compiledMap.ref.instance.wake();
            (_a = this.pointerActivePipe) === null || _a === void 0 ? void 0 : _a.resume(true);
        }
        /** @inheritdoc */
        onPause() {
            var _a;
            this.mapPointerController.setPointerActive(false);
            this.compiledMap.ref.instance.sleep();
            (_a = this.pointerActivePipe) === null || _a === void 0 ? void 0 : _a.pause();
            this.mapPointerActiveSetting.value = false;
        }
        /** @inheritdoc */
        onResize(size, width, height) {
            this.size.set(width, height);
        }
        /** @inheritdoc */
        onUpdate(time) {
            this.compiledMap.ref.instance.update(time);
            if (!this.isReady) {
                this.isReadyResolveQueue.forEach(resolve => resolve());
                this.isReadyResolveQueue.length = 0;
                this.isReadyRejectQueue.length = 0;
                this.isReady = true;
            }
        }
        /** @inheritdoc */
        onEvent(event) {
            switch (event.eventType) {
                case 'display_pane_map_range_inc':
                    this.changeRangeIndex(1);
                    break;
                case 'display_pane_map_range_dec':
                    this.changeRangeIndex(-1);
                    break;
                case 'display_pane_map_pointer_active_set':
                    this.mapPointerController.setPointerActive(event.eventData);
                    break;
                case 'display_pane_map_pointer_active_toggle':
                    this.mapPointerController.togglePointerActive();
                    break;
                case 'display_pane_map_pointer_move': {
                    if (this.mapPointerModule.isActive.get()) {
                        const eventData = event.eventData;
                        this.mapPointerController.movePointer(eventData[0], eventData[1]);
                    }
                    break;
                }
                case 'display_pane_waypoint_info_set':
                    this.setWaypoint(event.eventData);
                    break;
            }
        }
        /**
         * Changes this view's map range index.
         * @param delta The change in index to apply.
         */
        changeRangeIndex(delta) {
            const oldIndex = this.mapRangeModule.nominalRangeIndex.get();
            const newIndex = this.mapRangeController.changeRangeIndex(delta);
            if (newIndex !== oldIndex) {
                this.mapPointerController.targetPointer();
            }
        }
        /**
         * Sets the selected waypoint.
         * @param selectionData Data describing the selected waypoint.
         */
        async setWaypoint(selectionData) {
            var _a, _b;
            if (!msfssdk.ICAO.isFacility(selectionData.icao)) {
                this.clearWaypoint();
                return;
            }
            const opId = ++this.setWaypointOpId;
            const [facility] = await Promise.all([
                this.props.facLoader.getFacility(msfssdk.ICAO.getFacilityType(selectionData.icao), selectionData.icao),
                this.awaitReady()
            ]);
            if (opId !== this.setWaypointOpId) {
                return;
            }
            let runway = null;
            if (msfssdk.FacilityUtils.isFacilityType(facility, msfssdk.FacilityType.Airport)) {
                runway = (_a = facility.runways[selectionData.runwayIndex]) !== null && _a !== void 0 ? _a : null;
            }
            const waypoint = this.facWaypointCache.get(facility);
            this._title.set((_b = WaypointInfoPaneView.TITLE_TEXT[msfssdk.ICAO.getFacilityType(facility.icao)]) !== null && _b !== void 0 ? _b : '');
            this.mapWptSelectionModule.waypoint.set(waypoint);
            this.mapWptSelectionModule.runway.set(runway);
            if (selectionData.resetRange) {
                this.resetRange();
            }
        }
        /**
         * Clears the selected waypoint.
         */
        clearWaypoint() {
            this._title.set('');
            this.mapWptSelectionModule.waypoint.set(null);
            this.mapWptSelectionModule.runway.set(null);
        }
        /**
         * Resets this view's map range index.
         */
        resetRange() {
            if (this.mapWptSelectionModule.waypoint.get() instanceof garminsdk.AirportWaypoint) {
                this.mapWptRTRController.tryTargetWaypoint(true);
            }
            else {
                this.mapRangeController.setRangeIndex(WaypointInfoPaneView.DEFAULT_RANGE_INDEX);
            }
        }
        /**
         * Waits until this view's map is ready to target selected waypoints.
         * @returns A Promise which will be fulfilled when this view's map is ready to target selected waypoints, or
         * rejected if this view is destroyed before the map is ready.
         */
        awaitReady() {
            if (this.isReady) {
                return Promise.resolve();
            }
            else {
                return new Promise((resolve, reject) => {
                    this.isReadyResolveQueue.push(resolve);
                    this.isReadyRejectQueue.push(reject);
                });
            }
        }
        /** @inheritdoc */
        render() {
            return (this.compiledMap.map);
        }
        /** @inheritdoc */
        destroy() {
            var _a;
            this.isReadyRejectQueue.forEach(reject => reject('WaypointInfoPaneView: view was destroyed'));
            this.isReadyResolveQueue.length = 0;
            this.isReadyRejectQueue.length = 0;
            this.compiledMap.ref.instance.destroy();
            (_a = this.pointerActivePipe) === null || _a === void 0 ? void 0 : _a.destroy();
            super.destroy();
        }
    }
    WaypointInfoPaneView.DATA_UPDATE_FREQ = 30; // Hz
    WaypointInfoPaneView.DEFAULT_RANGE_INDEX = 14; // 7.5 nm / 15 km
    WaypointInfoPaneView.TITLE_TEXT = {
        [msfssdk.FacilityType.Airport]: 'Airport Information',
        [msfssdk.FacilityType.VOR]: 'VOR Information',
        [msfssdk.FacilityType.NDB]: 'NDB Information',
        [msfssdk.FacilityType.Intersection]: 'Intersection Information',
        [msfssdk.FacilityType.USR]: 'User Wpt Information'
    };

    /**
     * Utility class for retrieving G3000 weather map user setting managers.
     */
    class WeatherMapUserSettings {
        /**
         * Retrieves a manager for all true weather map settings.
         * @param bus The event bus.
         * @returns A manager for all true weather map settings.
         */
        static getMasterManager(bus) {
            var _a;
            return (_a = WeatherMapUserSettings.masterInstance) !== null && _a !== void 0 ? _a : (WeatherMapUserSettings.masterInstance = new msfssdk.DefaultUserSettingManager(bus, [
                ...WeatherMapUserSettings.getDisplayPaneSettingDefs(exports.DisplayPaneIndex.LeftPfd),
                ...WeatherMapUserSettings.getDisplayPaneSettingDefs(exports.DisplayPaneIndex.LeftMfd),
                ...WeatherMapUserSettings.getDisplayPaneSettingDefs(exports.DisplayPaneIndex.RightMfd),
                ...WeatherMapUserSettings.getDisplayPaneSettingDefs(exports.DisplayPaneIndex.RightPfd)
            ]));
        }
        /**
         * Retrieves a manager for aliased weather map settings for a single display pane.
         * @param bus The event bus.
         * @param index The index of the display pane.
         * @returns A manager for aliased weather map settings for the specified display pane.
         */
        static getDisplayPaneManager(bus, index) {
            var _a;
            var _b;
            return (_a = (_b = WeatherMapUserSettings.displayPaneInstances)[index]) !== null && _a !== void 0 ? _a : (_b[index] = WeatherMapUserSettings.getMasterManager(bus).mapTo(WeatherMapUserSettings.getDisplayPaneAliasMap(index)));
        }
        /**
         * Gets the default values for a full set of aliased weather map settings.
         * @returns The default values for a full set of aliased weather map settings.
         */
        static getDefaultValues() {
            return {
                ['weatherMapRangeIndex']: 11,
                ['weatherMapOrientation']: garminsdk.WeatherMapOrientationSettingMode.HeadingUp,
            };
        }
        /**
         * Gets an array of definitions for true map settings for a single display pane.
         * @param index The index of the display pane.
         * @returns An array of definitions for true map settings for the specified display pane.
         */
        static getDisplayPaneSettingDefs(index) {
            const values = WeatherMapUserSettings.getDefaultValues();
            return Object.keys(values).map(name => {
                return {
                    name: `${name}_${index}`,
                    defaultValue: values[name]
                };
            });
        }
        /**
         * Gets a setting name alias mapping for a display pane.
         * @param index The index of the display pane.
         * @returns A setting name alias mapping for the specified display pane.
         */
        static getDisplayPaneAliasMap(index) {
            const map = {};
            for (const name of garminsdk.WeatherMapUserSettingsUtils.SETTING_NAMES) {
                map[name] = `${name}_${index}`;
            }
            return map;
        }
    }
    WeatherMapUserSettings.displayPaneInstances = [];
    /**
     * Utility class for retrieving G3000 Connext weather map user setting managers.
     */
    class ConnextMapUserSettings {
        /**
         * Retrieves a manager for all true Connext weather map settings.
         * @param bus The event bus.
         * @returns A manager for all true Connext weather map settings.
         */
        static getMasterManager(bus) {
            var _a;
            return (_a = ConnextMapUserSettings.masterInstance) !== null && _a !== void 0 ? _a : (ConnextMapUserSettings.masterInstance = new msfssdk.DefaultUserSettingManager(bus, [
                ...ConnextMapUserSettings.getDisplayPaneSettingDefs(exports.DisplayPaneIndex.LeftPfd),
                ...ConnextMapUserSettings.getDisplayPaneSettingDefs(exports.DisplayPaneIndex.LeftMfd),
                ...ConnextMapUserSettings.getDisplayPaneSettingDefs(exports.DisplayPaneIndex.RightMfd),
                ...ConnextMapUserSettings.getDisplayPaneSettingDefs(exports.DisplayPaneIndex.RightPfd)
            ]));
        }
        /**
         * Retrieves a manager for aliased Connext weather map settings for a single display pane.
         * @param bus The event bus.
         * @param index The index of the display pane.
         * @returns A manager for aliased Connext weather map settings for the specified display pane.
         */
        static getDisplayPaneManager(bus, index) {
            var _a;
            var _b;
            return (_a = (_b = ConnextMapUserSettings.displayPaneInstances)[index]) !== null && _a !== void 0 ? _a : (_b[index] = ConnextMapUserSettings.getMasterManager(bus).mapTo(ConnextMapUserSettings.getDisplayPaneAliasMap(index)));
        }
        /**
         * Retrieves a manager for aliased combined Connext weather map settings for a single display pane.
         * @param bus The event bus.
         * @param index The index of the display pane.
         * @returns A manager for aliased combined Connext weather map settings for the specified display pane.
         */
        static getDisplayPaneCombinedManager(bus, index) {
            var _a;
            var _b;
            return (_a = (_b = ConnextMapUserSettings.displayPaneCombinedInstances)[index]) !== null && _a !== void 0 ? _a : (_b[index] = new ConnextMapCombinedSettingManager(MapUserSettings.getDisplayPaneManager(bus, index), WeatherMapUserSettings.getDisplayPaneManager(bus, index), ConnextMapUserSettings.getDisplayPaneManager(bus, index)).mapTo(ConnextMapUserSettings.getCombinedAliasMap()));
        }
        /**
         * Gets the default values for a full set of aliased Connext weather map settings.
         * @returns The default values for a full set of aliased Connext weather map settings.
         */
        static getDefaultValues() {
            return {
                ['connextMapRadarOverlayShow']: true,
                ['connextMapRadarOverlayRangeIndex']: 27 // 1000 NM/2000 km
            };
        }
        /**
         * Gets an array of definitions for true map settings for a single display pane.
         * @param index The index of the display pane.
         * @returns An array of definitions for true map settings for the specified display pane.
         */
        static getDisplayPaneSettingDefs(index) {
            const values = ConnextMapUserSettings.getDefaultValues();
            return Object.keys(values).map(name => {
                return {
                    name: `${name}_${index}`,
                    defaultValue: values[name]
                };
            });
        }
        /**
         * Gets a setting name alias mapping for a display pane.
         * @param index The index of the display pane.
         * @returns A setting name alias mapping for the specified display pane.
         */
        static getDisplayPaneAliasMap(index) {
            const map = {};
            for (const name of garminsdk.WeatherMapUserSettingsUtils.CONNEXT_SETTING_NAMES) {
                map[name] = `${name}_${index}`;
            }
            return map;
        }
        /**
         * Gets a combined setting name alias mapping.
         * @returns A combined setting name alias mapping.
         */
        static getCombinedAliasMap() {
            const map = {};
            for (const name in G3000WeatherMapUserSettingsUtils.CONNEXT_DELEGATE_MAP) {
                map[name] = G3000WeatherMapUserSettingsUtils.CONNEXT_DELEGATE_MAP[name];
            }
            return map;
        }
    }
    ConnextMapUserSettings.displayPaneInstances = [];
    ConnextMapUserSettings.displayPaneCombinedInstances = [];
    /**
     * A utility class for working with G3000 weather map user settings.
     */
    class G3000WeatherMapUserSettingsUtils {
    }
    /** An array of all G3000 combined Connext weather map user setting names. */
    G3000WeatherMapUserSettingsUtils.CONNEXT_COMBINED_SETTING_NAMES = [
        ...garminsdk.MapUserSettingsUtils.SETTING_NAMES,
        'weatherMapRangeIndex',
        'weatherMapOrientation',
        'connextMapRadarOverlayShow',
        'connextMapRadarOverlayRangeIndex'
    ];
    /** A mapping of delegated Connext weather map user settings to the user setting to which each is delegated. */
    G3000WeatherMapUserSettingsUtils.CONNEXT_DELEGATE_MAP = {
        'mapRangeIndex': 'weatherMapRangeIndex',
        'mapNexradShow': 'connextMapRadarOverlayShow',
        'mapNexradRangeIndex': 'connextMapRadarOverlayRangeIndex',
    };
    /**
     * A manager for combined Connext weather map, weather map, and general map user settings.
     */
    class ConnextMapCombinedSettingManager {
        /**
         * Constructor.
         * @param mapSettingManager A manager for the general map user settings used by this combined manager.
         * @param weatherMapSettingManager A manager for the weather map user settings used by this combined manager.
         * @param connextMapSettingManager A manager for the Connext weather map user settings used by this combined manager.
         */
        constructor(mapSettingManager, weatherMapSettingManager, connextMapSettingManager) {
            this.mapSettingManager = mapSettingManager;
            this.weatherMapSettingManager = weatherMapSettingManager;
            this.connextMapSettingManager = connextMapSettingManager;
        }
        /** @inheritdoc */
        tryGetSetting(name) {
            var _a, _b;
            return (_b = (_a = this.mapSettingManager.tryGetSetting(name)) !== null && _a !== void 0 ? _a : this.weatherMapSettingManager.tryGetSetting(name)) !== null && _b !== void 0 ? _b : this.connextMapSettingManager.tryGetSetting(name);
        }
        /** @inheritdoc */
        getSetting(name) {
            const setting = this.tryGetSetting(name);
            if (!setting) {
                throw new Error(`ConnextMapCombinedSettingManager: Could not find setting with name ${name}`);
            }
            return setting;
        }
        /** @inheritdoc */
        whenSettingChanged(name) {
            if (this.mapSettingManager.tryGetSetting(name)) {
                return this.mapSettingManager.whenSettingChanged(name);
            }
            if (this.weatherMapSettingManager.tryGetSetting(name)) {
                return this.weatherMapSettingManager.whenSettingChanged(name);
            }
            if (this.connextMapSettingManager.tryGetSetting(name)) {
                return this.connextMapSettingManager.whenSettingChanged(name);
            }
            throw new Error(`ConnextMapCombinedSettingManager: Could not find setting with name ${name}`);
        }
        /** @inheritdoc */
        getAllSettings() {
            return [
                ...this.mapSettingManager.getAllSettings(),
                ...this.weatherMapSettingManager.getAllSettings(),
                ...this.connextMapSettingManager.getAllSettings()
            ];
        }
        /** @inheritdoc */
        mapTo(map) {
            return new msfssdk.MappedUserSettingManager(this, map);
        }
    }

    /**
     * A display pane view which displays a Connext weather map.
     */
    class ConnextWeatherPaneView extends DisplayPaneView {
        constructor() {
            super(...arguments);
            this.size = msfssdk.Vec2Subject.create(msfssdk.Vec2Math.create(100, 100));
            this.mapSettingManager = ConnextMapUserSettings.getDisplayPaneCombinedManager(this.props.bus, this.props.index);
            this.compiledMap = msfssdk.MapSystemBuilder.create(this.props.bus)
                .with(MapBuilder.connextMap, Object.assign(Object.assign({
                    bingId: `pane_map_${this.props.index}`, bingDelay: BingUtils.getBindDelayForPane(this.props.index), dataUpdateFreq: ConnextWeatherPaneView.DATA_UPDATE_FREQ, includeRunwayOutlines: false, rangeRingOptions: {
                        showLabel: true
                    }, rangeCompassOptions: {
                        showLabel: true,
                        showHeadingBug: true,
                        bearingTickMajorLength: 10,
                        bearingTickMinorLength: 5,
                        bearingLabelFont: 'DejaVuSans-SemiBold',
                        bearingLabelFontSize: 17
                    }, flightPlanner: this.props.flightPlanner
                }, MapBuilder.ownAirplaneIconOptions(this.props.config)), { pointerBoundsOffset: msfssdk.VecNMath.create(4, 0.1, 0.1, 0.1, 0.1), pointerInfoSize: garminsdk.MapPointerInfoLayerSize.Full, miniCompassImgSrc: MapBuilder.miniCompassIconSrc(), settingManager: this.mapSettingManager, unitsSettingManager: garminsdk.UnitsUserSettings.getManager(this.props.bus), iauIndex: MapBuilder.getIauIndexForDisplayPane(this.props.index), iauSettingManager: this.props.iauSettingManager }))
                .withProjectedSize(this.size)
                .build('common-map connext-map');
            this.mapRangeModule = this.compiledMap.context.model.getModule(garminsdk.GarminMapKeys.Range);
            this.mapPointerModule = this.compiledMap.context.model.getModule(garminsdk.GarminMapKeys.Pointer);
            this.mapPointerController = this.compiledMap.context.getController(garminsdk.GarminMapKeys.Pointer);
            this.mapRangeController = this.compiledMap.context.getController(garminsdk.GarminMapKeys.Range);
            this.mapPointerActiveSetting = DisplayPanesUserSettings.getDisplayPaneManager(this.props.bus, this.props.index).getSetting('displayPaneMapPointerActive');
        }
        /** @inheritdoc */
        onAfterRender() {
            this._title.set('Connext Weather');
            this.compiledMap.ref.instance.sleep();
            this.pointerActivePipe = this.mapPointerModule.isActive.pipe(this.mapPointerActiveSetting, true);
        }
        /** @inheritdoc */
        onResume(size, width, height) {
            var _a;
            this.size.set(width, height);
            this.compiledMap.ref.instance.wake();
            (_a = this.pointerActivePipe) === null || _a === void 0 ? void 0 : _a.resume(true);
        }
        /** @inheritdoc */
        onPause() {
            var _a;
            this.mapPointerController.setPointerActive(false);
            this.compiledMap.ref.instance.sleep();
            (_a = this.pointerActivePipe) === null || _a === void 0 ? void 0 : _a.pause();
            this.mapPointerActiveSetting.value = false;
        }
        /** @inheritdoc */
        onResize(size, width, height) {
            this.size.set(width, height);
        }
        /** @inheritdoc */
        onUpdate(time) {
            this.compiledMap.ref.instance.update(time);
        }
        /** @inheritdoc */
        onEvent(event) {
            switch (event.eventType) {
                case 'display_pane_map_range_inc':
                    this.changeRangeIndex(1);
                    break;
                case 'display_pane_map_range_dec':
                    this.changeRangeIndex(-1);
                    break;
                case 'display_pane_map_pointer_active_set':
                    this.mapPointerController.setPointerActive(event.eventData);
                    break;
                case 'display_pane_map_pointer_active_toggle':
                    this.mapPointerController.togglePointerActive();
                    break;
                case 'display_pane_map_pointer_move': {
                    if (this.mapPointerModule.isActive.get()) {
                        const eventData = event.eventData;
                        this.mapPointerController.movePointer(eventData[0], eventData[1]);
                    }
                    break;
                }
            }
        }
        /**
         * Changes this view's map range index.
         * @param delta The change in index to apply.
         */
        changeRangeIndex(delta) {
            const oldIndex = this.mapRangeModule.nominalRangeIndex.get();
            const newIndex = this.mapRangeController.changeRangeIndex(delta);
            if (newIndex !== oldIndex) {
                this.mapPointerController.targetPointer();
            }
        }
        /** @inheritdoc */
        render() {
            return (this.compiledMap.map);
        }
        /** @inheritdoc */
        destroy() {
            var _a;
            this.compiledMap.ref.instance.destroy();
            (_a = this.pointerActivePipe) === null || _a === void 0 ? void 0 : _a.destroy();
            super.destroy();
        }
    }
    ConnextWeatherPaneView.DATA_UPDATE_FREQ = 30; // Hz

    /**
     * Utility class for retrieving G3000 weather radar user setting managers.
     */
    class WeatherRadarUserSettings {
        /**
         * Retrieves a manager for all true weather radar settings.
         * @param bus The event bus.
         * @returns A manager for all true weather radar settings.
         */
        static getMasterManager(bus) {
            var _a;
            return (_a = WeatherRadarUserSettings.masterInstance) !== null && _a !== void 0 ? _a : (WeatherRadarUserSettings.masterInstance = new msfssdk.DefaultUserSettingManager(bus, [
                { name: 'wxrActive', defaultValue: false },
                ...WeatherRadarUserSettings.getDisplayPaneSettingDefs(exports.DisplayPaneIndex.LeftPfd),
                ...WeatherRadarUserSettings.getDisplayPaneSettingDefs(exports.DisplayPaneIndex.LeftMfd),
                ...WeatherRadarUserSettings.getDisplayPaneSettingDefs(exports.DisplayPaneIndex.RightMfd),
                ...WeatherRadarUserSettings.getDisplayPaneSettingDefs(exports.DisplayPaneIndex.RightPfd)
            ]));
        }
        /**
         * Retrieves a manager for aliased weather radar settings for a single display pane.
         * @param bus The event bus.
         * @param index The index of the display pane.
         * @returns A manager for aliased weather radar settings for the specified display pane.
         */
        static getDisplayPaneManager(bus, index) {
            var _a;
            var _b;
            return (_a = (_b = WeatherRadarUserSettings.displayPaneInstances)[index]) !== null && _a !== void 0 ? _a : (_b[index] = WeatherRadarUserSettings.getMasterManager(bus).mapTo(WeatherRadarUserSettings.getDisplayPaneAliasMap(index)));
        }
        /**
         * Gets the default values for a full set of aliased display pane-specific weather radar settings.
         * @returns The default values for a full set of aliased display pane-specific weather radar settings.
         */
        static getDisplayPaneDefaultValues() {
            return {
                ['wxrOperatingMode']: garminsdk.WeatherRadarOperatingMode.Standby,
                ['wxrScanMode']: garminsdk.WeatherRadarScanMode.Horizontal,
                ['wxrRangeIndex']: 1,
                ['wxrShowBearingLine']: false,
                ['wxrShowTiltLine']: false
            };
        }
        /**
         * Gets an array of definitions for true weather radar settings specific to a single display pane.
         * @param index The index of the display pane.
         * @returns An array of definitions for true weather radar settings specific to the specified display pane.
         */
        static getDisplayPaneSettingDefs(index) {
            const values = WeatherRadarUserSettings.getDisplayPaneDefaultValues();
            return Object.keys(values).map(name => {
                return {
                    name: `${name}_${index}`,
                    defaultValue: values[name]
                };
            });
        }
        /**
         * Gets a setting name alias mapping for a display pane.
         * @param index The index of the display pane.
         * @returns A setting name alias mapping for the specified display pane.
         */
        static getDisplayPaneAliasMap(index) {
            const map = {};
            for (const name of WeatherRadarUserSettings.INDEXED_SETTING_NAMES) {
                map[name] = `${name}_${index}`;
            }
            return map;
        }
    }
    WeatherRadarUserSettings.INDEXED_SETTING_NAMES = [
        'wxrOperatingMode',
        'wxrScanMode',
        'wxrRangeIndex',
        'wxrShowBearingLine',
        'wxrShowTiltLine'
    ];
    WeatherRadarUserSettings.displayPaneInstances = [];

    /**
     * Utility class for working with weather radar ranges.
     */
    class WeatherRadarRange {
    }
    /** The range array for G3000 weather radar displays. */
    WeatherRadarRange.RANGE_ARRAY = [
        10,
        20,
        40,
        60,
        80,
        120,
        160,
        240,
        320
    ].map(range => msfssdk.UnitType.NMILE.createNumber(range).readonly);

    /**
     * A display pane view which displays a weather radar.
     */
    class WeatherRadarPaneView extends DisplayPaneView {
        constructor() {
            super(...arguments);
            this.radarRef = msfssdk.FSComponent.createRef();
            this.modeIndicatorCssClass = msfssdk.SetSubject.create(['weather-radar-indicator', 'weather-radar-indicator-mode']);
            this.scaleIndicatorCssClass = msfssdk.SetSubject.create(['weather-radar-indicator', 'weather-radar-indicator-scale']);
            this.bannerCssClass = msfssdk.SetSubject.create(['weather-radar-standby']);
            this.size = msfssdk.Vec2Subject.create(msfssdk.Vec2Math.create(100, 100));
            this.horizontalScanPadding = msfssdk.Subject.create(WeatherRadarPaneView.HORIZ_SCAN_PADDING[exports.DisplayPaneSizeMode.Full]);
            this.verticalScanPadding = msfssdk.Subject.create(WeatherRadarPaneView.VERT_SCAN_PADDING[exports.DisplayPaneSizeMode.Full]);
            this.weatherRadarSettingManager = WeatherRadarUserSettings.getDisplayPaneManager(this.props.bus, this.props.index);
            this.rangeSetting = this.weatherRadarSettingManager.getSetting('wxrRangeIndex');
            this.range = this.rangeSetting.map(index => {
                var _a;
                return (_a = WeatherRadarRange.RANGE_ARRAY[index]) !== null && _a !== void 0 ? _a : WeatherRadarRange.RANGE_ARRAY[0];
            });
            this.modeIndicatorText = msfssdk.Subject.create('');
            this.bannerText = msfssdk.Subject.create('');
            this.modeState = msfssdk.MappedSubject.create(this.weatherRadarSettingManager.getSetting('wxrActive'), this.weatherRadarSettingManager.getSetting('wxrOperatingMode'));
        }
        /** @inheritdoc */
        onAfterRender() {
            this._title.set('Weather Radar');
            this.radarRef.instance.sleep();
            this.modeState.pause();
            this.modeState.sub(([isActive, operatingMode]) => {
                let bannerText;
                let showScale = false;
                if (isActive) {
                    this.modeIndicatorText.set(WeatherRadarPaneView.OPERATING_MODE_TEXT[operatingMode]);
                    switch (operatingMode) {
                        case garminsdk.WeatherRadarOperatingMode.Standby:
                            bannerText = 'STANDBY';
                            break;
                        case garminsdk.WeatherRadarOperatingMode.Weather:
                            showScale = true;
                            break;
                    }
                }
                else {
                    this.modeIndicatorText.set('Off');
                    bannerText = 'OFF';
                }
                this.scaleIndicatorCssClass.toggle('hidden', !showScale);
                if (bannerText === undefined) {
                    this.bannerCssClass.add('hidden');
                }
                else {
                    this.bannerCssClass.delete('hidden');
                    this.bannerText.set(bannerText);
                }
            }, true);
        }
        /** @inheritdoc */
        onResume(size, width, height) {
            this.updateSize(size, width, height);
            this.radarRef.instance.wake();
            this.modeState.resume();
        }
        /** @inheritdoc */
        onPause() {
            this.radarRef.instance.sleep();
            this.modeState.pause();
        }
        /** @inheritdoc */
        onResize(size, width, height) {
            this.updateSize(size, width, height);
        }
        /**
         * Updates the size of the weather radar display.
         * @param size The size of this view's parent pane.
         * @param width The width of the weather radar, in pixels.
         * @param height The height of the weather radar, in pixels.
         */
        updateSize(size, width, height) {
            this.size.set(width, height);
            if (size !== exports.DisplayPaneSizeMode.Hidden) {
                this.horizontalScanPadding.set(WeatherRadarPaneView.HORIZ_SCAN_PADDING[size]);
                this.verticalScanPadding.set(WeatherRadarPaneView.VERT_SCAN_PADDING[size]);
            }
        }
        /** @inheritdoc */
        onUpdate() {
            this.radarRef.instance.update();
        }
        /** @inheritdoc */
        onEvent(event) {
            switch (event.eventType) {
                case 'display_pane_map_range_inc':
                    this.changeRangeIndex(1);
                    return;
                case 'display_pane_map_range_dec':
                    this.changeRangeIndex(-1);
                    return;
            }
        }
        /**
         * Changes this pane's weather radar range index setting.
         * @param delta The change in index to apply.
         */
        changeRangeIndex(delta) {
            const currentIndex = this.rangeSetting.value;
            const newIndex = msfssdk.MathUtils.clamp(currentIndex + delta, 0, WeatherRadarRange.RANGE_ARRAY.length - 1);
            this.rangeSetting.value = newIndex;
        }
        /** @inheritdoc */
        render() {
            return (msfssdk.FSComponent.buildComponent("div", { class: 'weather-radar-pane' },
                msfssdk.FSComponent.buildComponent("svg", null,
                    msfssdk.FSComponent.buildComponent("defs", null,
                        msfssdk.FSComponent.buildComponent("linearGradient", { id: 'weather-radar-reference-line-gradient', x1: '0%', y1: '0%', x2: '0%', y2: '100%' },
                            msfssdk.FSComponent.buildComponent("stop", { offset: '0%', "stop-color": 'cyan', "stop-opacity": '0' }),
                            msfssdk.FSComponent.buildComponent("stop", { offset: '25%', "stop-color": 'cyan', "stop-opacity": '0.25' }),
                            msfssdk.FSComponent.buildComponent("stop", { offset: '50%', "stop-color": 'cyan', "stop-opacity": '1' }),
                            msfssdk.FSComponent.buildComponent("stop", { offset: '75%', "stop-color": 'cyan', "stop-opacity": '0.25' }),
                            msfssdk.FSComponent.buildComponent("stop", { offset: '100%', "stop-color": 'cyan', "stop-opacity": '0' })))),
                msfssdk.FSComponent.buildComponent(garminsdk.WeatherRadar, { ref: this.radarRef, bingId: `pane_map_${this.props.index}`, bus: this.props.bus, operatingMode: this.weatherRadarSettingManager.getSetting('wxrOperatingMode'), scanMode: this.weatherRadarSettingManager.getSetting('wxrScanMode'), horizontalScanAngularWidth: this.props.config.horizontalScanWidth, verticalScanAngularWidth: 60, range: this.range, rangeUnit: msfssdk.UnitType.NMILE, size: this.size, showBearingLine: this.weatherRadarSettingManager.getSetting('wxrShowBearingLine'), showTiltLine: this.weatherRadarSettingManager.getSetting('wxrShowTiltLine'), colors: this.props.config.supportExtendedColors ? garminsdk.WeatherRadarUtils.extendedColors() : garminsdk.WeatherRadarUtils.standardColors(), gain: msfssdk.Subject.create(0), isDataFailed: msfssdk.Subject.create(false), horizontalScanPadding: this.horizontalScanPadding, verticalScanPadding: this.verticalScanPadding, verticalRangeLineExtend: 30 },
                    msfssdk.FSComponent.buildComponent("div", { class: this.modeIndicatorCssClass }, this.modeIndicatorText),
                    this.renderColorScale(),
                    msfssdk.FSComponent.buildComponent("div", { class: this.bannerCssClass }, this.bannerText))));
        }
        /**
         * Renders this pane's color scale.
         * @returns This pane's color scale, as a VNode.
         */
        renderColorScale() {
            return (msfssdk.FSComponent.buildComponent("div", { class: this.scaleIndicatorCssClass },
                msfssdk.FSComponent.buildComponent("div", { class: 'weather-radar-indicator-scale-title' }, "Scale"),
                this.props.config.supportExtendedColors ? this.renderExtendedColors() : this.renderStandardColors()));
        }
        /**
         * Renders the standard 3-color scale bar and labels.
         * @returns The standard 3-color scale bar and labels, as a VNode.
         */
        renderStandardColors() {
            return (msfssdk.FSComponent.buildComponent("div", { class: 'weather-radar-indicator-scale-main weather-radar-indicator-scale-main-standard' },
                msfssdk.FSComponent.buildComponent("div", { class: 'weather-radar-indicator-scale-standard-row' },
                    msfssdk.FSComponent.buildComponent("div", { class: 'weather-radar-indicator-scale-color', style: 'background: #ff0000;' }),
                    msfssdk.FSComponent.buildComponent("div", { class: 'weather-radar-indicator-scale-label weather-radar-indicator-scale-label-heavy' }, "Heavy")),
                msfssdk.FSComponent.buildComponent("div", { class: 'weather-radar-indicator-scale-standard-row' },
                    msfssdk.FSComponent.buildComponent("div", { class: 'weather-radar-indicator-scale-color', style: 'background: #ffff00;' })),
                msfssdk.FSComponent.buildComponent("div", { class: 'weather-radar-indicator-scale-standard-row' },
                    msfssdk.FSComponent.buildComponent("div", { class: 'weather-radar-indicator-scale-color', style: 'background: #00ff00;' }),
                    msfssdk.FSComponent.buildComponent("div", { class: 'weather-radar-indicator-scale-label weather-radar-indicator-scale-label-light' }, "Light")),
                msfssdk.FSComponent.buildComponent("div", { class: 'weather-radar-indicator-scale-standard-row' },
                    msfssdk.FSComponent.buildComponent("div", { class: 'weather-radar-indicator-scale-color', style: 'background: #000000;' }))));
        }
        /**
         * Renders the extended 16-color scale bar and labels.
         * @returns The extended 16-color scale bar and labels, as a VNode.
         */
        renderExtendedColors() {
            return (msfssdk.FSComponent.buildComponent("div", { class: 'weather-radar-indicator-scale-main weather-radar-indicator-scale-main-extended' },
                msfssdk.FSComponent.buildComponent("div", { class: 'weather-radar-indicator-scale-extended-bar' },
                    msfssdk.FSComponent.buildComponent("div", { class: 'weather-radar-indicator-scale-color', style: 'background: #870087;' }),
                    msfssdk.FSComponent.buildComponent("div", { class: 'weather-radar-indicator-scale-color', style: 'background: #b228c3;' }),
                    msfssdk.FSComponent.buildComponent("div", { class: 'weather-radar-indicator-scale-color', style: 'background: #dd50ff;' }),
                    msfssdk.FSComponent.buildComponent("div", { class: 'weather-radar-indicator-scale-color', style: 'background: #960000;' }),
                    msfssdk.FSComponent.buildComponent("div", { class: 'weather-radar-indicator-scale-color', style: 'background: #b90000;' }),
                    msfssdk.FSComponent.buildComponent("div", { class: 'weather-radar-indicator-scale-color', style: 'background: #dc0000;' }),
                    msfssdk.FSComponent.buildComponent("div", { class: 'weather-radar-indicator-scale-color', style: 'background: #ff0000;' }),
                    msfssdk.FSComponent.buildComponent("div", { class: 'weather-radar-indicator-scale-color', style: 'background: #e59200;' }),
                    msfssdk.FSComponent.buildComponent("div", { class: 'weather-radar-indicator-scale-color', style: 'background: #eeb600;' }),
                    msfssdk.FSComponent.buildComponent("div", { class: 'weather-radar-indicator-scale-color', style: 'background: #f6db00;' }),
                    msfssdk.FSComponent.buildComponent("div", { class: 'weather-radar-indicator-scale-color', style: 'background: #ffff00;' }),
                    msfssdk.FSComponent.buildComponent("div", { class: 'weather-radar-indicator-scale-color', style: 'background: #307a00;' }),
                    msfssdk.FSComponent.buildComponent("div", { class: 'weather-radar-indicator-scale-color', style: 'background: #249b00;' }),
                    msfssdk.FSComponent.buildComponent("div", { class: 'weather-radar-indicator-scale-color', style: 'background: #18bd00;' }),
                    msfssdk.FSComponent.buildComponent("div", { class: 'weather-radar-indicator-scale-color', style: 'background: #0cde00;' }),
                    msfssdk.FSComponent.buildComponent("div", { class: 'weather-radar-indicator-scale-color', style: 'background: #00ff00;' }),
                    msfssdk.FSComponent.buildComponent("div", { class: 'weather-radar-indicator-scale-color weather-radar-indicator-scale-color-black', style: 'background: #000000;' })),
                msfssdk.FSComponent.buildComponent("div", { class: 'weather-radar-indicator-scale-extended-label-container' },
                    msfssdk.FSComponent.buildComponent("div", { class: 'weather-radar-indicator-scale-label weather-radar-indicator-scale-label-heavy' }, "Heavy"),
                    msfssdk.FSComponent.buildComponent("div", { class: 'weather-radar-indicator-scale-label weather-radar-indicator-scale-label-light' }, "Light"))));
        }
        /** @inheritdoc */
        destroy() {
            var _a;
            (_a = this.radarRef.getOrDefault()) === null || _a === void 0 ? void 0 : _a.destroy();
            super.destroy();
        }
    }
    WeatherRadarPaneView.HORIZ_SCAN_PADDING = {
        [exports.DisplayPaneSizeMode.Full]: msfssdk.VecNMath.create(4, 25, 40, 25, 90),
        [exports.DisplayPaneSizeMode.Half]: msfssdk.VecNMath.create(4, 25, 40, 25, 295),
    };
    WeatherRadarPaneView.VERT_SCAN_PADDING = {
        [exports.DisplayPaneSizeMode.Full]: msfssdk.VecNMath.create(4, 20, 40, 175, 185),
        [exports.DisplayPaneSizeMode.Half]: msfssdk.VecNMath.create(4, 10, 40, 175, 185),
    };
    WeatherRadarPaneView.OPERATING_MODE_TEXT = {
        [garminsdk.WeatherRadarOperatingMode.Standby]: 'Standby',
        [garminsdk.WeatherRadarOperatingMode.Weather]: 'Weather'
    };

    /**
     * Sources of FMS-computed speed targets.
     */
    exports.FmsSpeedTargetSource = void 0;
    (function (FmsSpeedTargetSource) {
        /** No source. Used when FMS has no computed speed target. */
        FmsSpeedTargetSource["None"] = "None";
        /** Speed target is derived from aircraft configuration limits (flaps, gear, etc). */
        FmsSpeedTargetSource["Configuration"] = "Configuration";
        /** Speed target is derived from departure terminal speed limits. */
        FmsSpeedTargetSource["Departure"] = "Departure";
        /** Speed target is derived from arrival terminal speed limits. */
        FmsSpeedTargetSource["Arrival"] = "Arrival";
        /** Speed target is derived from user-defined altitude speed limits (e.g. 250 knots below 10000 feet). */
        FmsSpeedTargetSource["Altitude"] = "Altitude";
        /** Speed target is derived from speed constraints in the flight plan. */
        FmsSpeedTargetSource["Constraint"] = "Constraint";
        /** Speed target is derived from user-defined performance schedules. */
        FmsSpeedTargetSource["ClimbSchedule"] = "ClimbSchedule";
        /** Speed target is derived from user-defined performance schedules. */
        FmsSpeedTargetSource["CruiseSchedule"] = "CruiseSchedule";
        /** Speed target is derived from user-defined performance schedules. */
        FmsSpeedTargetSource["DescentSchedule"] = "DescentSchedule";
    })(exports.FmsSpeedTargetSource || (exports.FmsSpeedTargetSource = {}));

    /**
     * A default implementation of {@link FmsSpeedTargetDataProvider}.
     */
    class DefaultFmsSpeedTargetDataProvider {
        /**
         * Constructor.
         * @param bus The event bus.
         * @param fmsSpeedSettingManager A manager for FMS speed user settings.
         */
        constructor(bus, fmsSpeedSettingManager) {
            this.bus = bus;
            this.fmsSpeedSettingManager = fmsSpeedSettingManager;
            this.targetIas = msfssdk.ConsumerSubject.create(null, -1);
            this.targetMach = msfssdk.ConsumerSubject.create(null, -1);
            this.targetIsMach = msfssdk.ConsumerSubject.create(null, false);
            this.targetSource = msfssdk.ConsumerSubject.create(null, exports.FmsSpeedTargetSource.None);
            this.maxIas = msfssdk.ConsumerSubject.create(null, -1);
            this.maxMach = msfssdk.ConsumerSubject.create(null, -1);
            this.maxIsMach = msfssdk.ConsumerSubject.create(null, false);
            this.maxSource = msfssdk.ConsumerSubject.create(null, exports.FmsSpeedTargetSource.None);
            this.userIas = this.fmsSpeedSettingManager.getSetting('fmsSpeedUserTargetIas');
            this.userMach = this.fmsSpeedSettingManager.getSetting('fmsSpeedUserTargetMach');
            this.userIsMach = this.fmsSpeedSettingManager.getSetting('fmsSpeedUserTargetIsMach');
            this._hasComputedTargetSpeed = msfssdk.MappedSubject.create(([ias, mach, isMach]) => (isMach ? mach : ias) >= 0, this.targetIas, this.targetMach, this.targetIsMach);
            this.tempSpeedValue = {
                value: -1,
                unit: msfssdk.SpeedUnit.IAS
            };
            this._nominalComputedTargetSpeed = msfssdk.Subject.create({ value: 0, unit: msfssdk.SpeedUnit.IAS }, DefaultFmsSpeedTargetDataProvider.SPEED_VALUE_EQUALITY, DefaultFmsSpeedTargetDataProvider.SPEED_VALUE_MUTATOR);
            /** @inheritdoc */
            this.nominalComputedTargetSpeed = this._nominalComputedTargetSpeed;
            this._nominalComputedTargetSpeedSource = msfssdk.Subject.create(exports.FmsSpeedTargetSource.None);
            /** @inheritdoc */
            this.nominalComputedTargetSpeedSource = this._nominalComputedTargetSpeedSource;
            this._isUserTargetSpeedActive = msfssdk.MappedSubject.create(([hasTarget, userIas, userMach, userIsMach]) => hasTarget && (userIsMach ? userMach : userIas) >= 0, this._hasComputedTargetSpeed, this.userIas, this.userMach, this.userIsMach);
            /** @readonly */
            this.isUserTargetSpeedActive = this._isUserTargetSpeedActive;
            this._nominalUserTargetSpeed = msfssdk.Subject.create({ value: 0, unit: msfssdk.SpeedUnit.IAS }, DefaultFmsSpeedTargetDataProvider.SPEED_VALUE_EQUALITY, DefaultFmsSpeedTargetDataProvider.SPEED_VALUE_MUTATOR);
            /** @inheritdoc */
            this.nominalUserTargetSpeed = this._nominalUserTargetSpeed;
            this.isInit = false;
            this.isAlive = true;
            this.isPaused = false;
        }
        /**
         * Initializes this data provider. Once initialized, this data provider will continuously update its data until
         * paused or destroyed.
         * @param paused Whether to initialize this data provider as paused. If `true`, this data provider will provide an
         * initial set of data but will not update the provided data until it is resumed. Defaults to `false`.
         * @throws Error if this data provider is dead.
         */
        init(paused = false) {
            if (!this.isAlive) {
                throw new Error('DefaultFmsSpeedTargetDataProvider: cannot initialize a dead provider');
            }
            if (this.isInit) {
                return;
            }
            this.isInit = true;
            this.isPaused = paused;
            const sub = this.bus.getSubscriber();
            this.targetIas.setConsumer(sub.on('fms_speed_computed_target_ias'));
            this.targetMach.setConsumer(sub.on('fms_speed_computed_target_mach'));
            this.targetIsMach.setConsumer(sub.on('fms_speed_computed_target_is_mach'));
            this.targetSource.setConsumer(sub.on('fms_speed_computed_target_source'));
            this.maxIas.setConsumer(sub.on('fms_speed_computed_max_ias'));
            this.maxMach.setConsumer(sub.on('fms_speed_computed_max_mach'));
            this.maxIsMach.setConsumer(sub.on('fms_speed_computed_max_is_mach'));
            this.maxSource.setConsumer(sub.on('fms_speed_computed_max_source'));
            const speedValuePipeFunc = (to, [ias, mach, isMach]) => {
                if (isMach) {
                    this.tempSpeedValue.value = mach;
                    this.tempSpeedValue.unit = msfssdk.SpeedUnit.MACH;
                }
                else {
                    this.tempSpeedValue.value = ias;
                    this.tempSpeedValue.unit = msfssdk.SpeedUnit.IAS;
                }
                to.set(this.tempSpeedValue);
            };
            const targetPipe = msfssdk.MappedSubject.create(this.targetIas, this.targetMach, this.targetIsMach).sub(speedValuePipeFunc.bind(this, this._nominalComputedTargetSpeed), false, true);
            const maxPipe = msfssdk.MappedSubject.create(this.maxIas, this.maxMach, this.maxIsMach).sub(speedValuePipeFunc.bind(this, this._nominalComputedTargetSpeed), false, true);
            const targetSourcePipe = this.targetSource.pipe(this._nominalComputedTargetSpeedSource, true);
            const maxSourcePipe = this.maxSource.pipe(this._nominalComputedTargetSpeedSource, true);
            this._hasComputedTargetSpeed.sub(hasTarget => {
                if (hasTarget) {
                    maxPipe.pause();
                    maxSourcePipe.pause();
                    targetPipe.resume(true);
                    targetSourcePipe.resume(true);
                }
                else {
                    targetPipe.pause();
                    targetSourcePipe.pause();
                    maxPipe.resume(true);
                    maxSourcePipe.resume(true);
                }
            }, true);
            const userPipe = msfssdk.MappedSubject.create(this.userIas, this.userMach, this.userIsMach).sub(speedValuePipeFunc.bind(this, this._nominalUserTargetSpeed), false, true);
            this._isUserTargetSpeedActive.sub(isActive => {
                if (isActive) {
                    userPipe.resume(true);
                }
                else {
                    userPipe.pause();
                    this.tempSpeedValue.value = -1;
                    this.tempSpeedValue.unit = msfssdk.SpeedUnit.IAS;
                    this._nominalUserTargetSpeed.set(this.tempSpeedValue);
                }
            }, true);
            if (paused) {
                this.pause();
            }
        }
        /**
         * Resumes this data provider. Once resumed, this data provider will continuously update its data until paused or
         * destroyed.
         * @throws Error if this data provider is dead.
         */
        resume() {
            if (!this.isAlive) {
                throw new Error('DefaultFmsSpeedTargetDataProvider: cannot resume a dead provider');
            }
            if (!this.isPaused) {
                return;
            }
            this.isPaused = false;
            this.targetIas.resume();
            this.targetMach.resume();
            this.targetIsMach.resume();
            this.targetSource.resume();
            this.maxIas.resume();
            this.maxMach.resume();
            this.maxIsMach.resume();
            this.maxSource.resume();
        }
        /**
         * Pauses this data provider. Once paused, this data provider will not update its data until it is resumed.
         * @throws Error if this data provider is dead.
         */
        pause() {
            if (!this.isAlive) {
                throw new Error('DefaultFmsSpeedTargetDataProvider: cannot pause a dead provider');
            }
            if (this.isPaused) {
                return;
            }
            this.targetIas.pause();
            this.targetMach.pause();
            this.targetIsMach.pause();
            this.targetSource.pause();
            this.maxIas.pause();
            this.maxMach.pause();
            this.maxIsMach.pause();
            this.maxSource.pause();
        }
        /**
         * Destroys this data provider. Once destroyed, this data provider will no longer update its provided data, and can
         * no longer be paused or resumed.
         */
        destroy() {
            this.isAlive = false;
            this.targetIas.destroy();
            this.targetMach.destroy();
            this.targetIsMach.destroy();
            this.targetSource.destroy();
            this.maxIas.destroy();
            this.maxMach.destroy();
            this.maxIsMach.destroy();
            this.maxSource.destroy();
        }
    }
    DefaultFmsSpeedTargetDataProvider.SPEED_VALUE_EQUALITY = (a, b) => a.value === b.value && a.unit === b.unit;
    DefaultFmsSpeedTargetDataProvider.SPEED_VALUE_MUTATOR = (oldVal, newVal) => {
        oldVal.value = newVal.value;
        oldVal.unit = newVal.unit;
    };

    /** Simvars to publish. */
    var FuelTotalizerSimVars;
    (function (FuelTotalizerSimVars) {
        FuelTotalizerSimVars["Burned"] = "L:WT3000_Fuel_Burned";
        FuelTotalizerSimVars["Remaining"] = "L:WT3000_Fuel_Remaining";
    })(FuelTotalizerSimVars || (FuelTotalizerSimVars = {}));
    /**
     * A publisher for fuel totalizer events.
     */
    class FuelTotalizerSimVarPublisher extends msfssdk.SimVarPublisher {
        // eslint-disable-next-line jsdoc/require-jsdoc
        constructor(bus) {
            super(FuelTotalizerSimVarPublisher.simvars, bus);
        }
    }
    FuelTotalizerSimVarPublisher.simvars = new Map([
        ['fuel_totalizer_burned', { name: FuelTotalizerSimVars.Burned, type: msfssdk.SimVarValueType.GAL }],
        ['fuel_totalizer_remaining', { name: FuelTotalizerSimVars.Remaining, type: msfssdk.SimVarValueType.GAL }],
    ]);
    /** An instrument that tracks fuel state for use by the G3000. */
    class FuelTotalizer {
        // eslint-disable-next-line jsdoc/require-jsdoc
        constructor(bus) {
            this.fuelRemaining = 0;
            this.fuelBurned = 0;
            this.priorRawQty = 0;
            bus.getSubscriber().on('fuel_totalizer_set_remaining').handle(amount => {
                this.fuelRemaining = amount;
                this.fuelBurned = 0;
                SimVar.SetSimVarValue(FuelTotalizerSimVars.Burned, msfssdk.SimVarValueType.GAL, this.fuelBurned);
                SimVar.SetSimVarValue(FuelTotalizerSimVars.Remaining, msfssdk.SimVarValueType.GAL, this.fuelRemaining);
            });
        }
        /** Initialize the instrument. */
        init() { }
        /** Perform events for the update loop. */
        onUpdate() {
            const currentRawQty = SimVar.GetSimVarValue('FUEL TOTAL QUANTITY', msfssdk.SimVarValueType.GAL);
            if (currentRawQty < this.priorRawQty) {
                const burned = this.priorRawQty - currentRawQty;
                this.fuelBurned += burned;
                this.fuelRemaining -= burned;
                SimVar.SetSimVarValue(FuelTotalizerSimVars.Burned, msfssdk.SimVarValueType.GAL, this.fuelBurned);
                SimVar.SetSimVarValue(FuelTotalizerSimVars.Remaining, msfssdk.SimVarValueType.GAL, this.fuelRemaining);
            }
            this.priorRawQty = currentRawQty;
        }
    }

    /**
     * Setting modes for angle of attack indicator display.
     */
    exports.AoaIndicatorDisplaySettingMode = void 0;
    (function (AoaIndicatorDisplaySettingMode) {
        AoaIndicatorDisplaySettingMode["Off"] = "Off";
        AoaIndicatorDisplaySettingMode["On"] = "On";
        AoaIndicatorDisplaySettingMode["Auto"] = "Auto";
    })(exports.AoaIndicatorDisplaySettingMode || (exports.AoaIndicatorDisplaySettingMode = {}));
    /**
     * Setting modes for wind display options.
     */
    exports.WindDisplaySettingMode = void 0;
    (function (WindDisplaySettingMode) {
        WindDisplaySettingMode["Off"] = "Off";
        WindDisplaySettingMode["Option1"] = "Option1";
        WindDisplaySettingMode["Option2"] = "Option2";
        WindDisplaySettingMode["Option3"] = "Option3";
    })(exports.WindDisplaySettingMode || (exports.WindDisplaySettingMode = {}));
    /**
     * Setting modes for PFD map layout.
     */
    exports.PfdMapLayoutSettingMode = void 0;
    (function (PfdMapLayoutSettingMode) {
        PfdMapLayoutSettingMode["Off"] = "Off";
        PfdMapLayoutSettingMode["Inset"] = "Inset";
        PfdMapLayoutSettingMode["Hsi"] = "Hsi";
        PfdMapLayoutSettingMode["Traffic"] = "Traffic";
    })(exports.PfdMapLayoutSettingMode || (exports.PfdMapLayoutSettingMode = {}));
    /**
     * Bearing pointer source modes.
     */
    exports.PfdBearingPointerSource = void 0;
    (function (PfdBearingPointerSource) {
        PfdBearingPointerSource["None"] = "None";
        PfdBearingPointerSource["Nav1"] = "Nav1";
        PfdBearingPointerSource["Nav2"] = "Nav2";
        PfdBearingPointerSource["Fms1"] = "Fms1";
        PfdBearingPointerSource["Fms2"] = "Fms2";
        PfdBearingPointerSource["Adf1"] = "Adf1";
        PfdBearingPointerSource["Adf2"] = "Adf2";
    })(exports.PfdBearingPointerSource || (exports.PfdBearingPointerSource = {}));
    /**
     * Utility class for retrieving PFD user setting managers.
     */
    class PfdUserSettings {
        /**
         * Retrieves a manager for all true PFD settings.
         * @param bus The event bus.
         * @returns A manager for all true PFD settings.
         */
        static getMasterManager(bus) {
            var _a;
            return (_a = PfdUserSettings.masterInstance) !== null && _a !== void 0 ? _a : (PfdUserSettings.masterInstance = new msfssdk.DefaultUserSettingManager(bus, [
                ...PfdUserSettings.getIndexedSettingDefs(1),
                ...PfdUserSettings.getIndexedSettingDefs(2),
                ...PfdUserSettings.getNonIndexedSettingDefs()
            ]));
        }
        /**
         * Retrieves a manager for aliased PFD settings for a single PFD.
         * @param bus The event bus.
         * @param index The index of the PFD.
         * @returns A manager for aliased PFD settings for the specified PFD.
         */
        static getAliasedManager(bus, index) {
            var _a;
            var _b;
            return (_a = (_b = PfdUserSettings.aliasedInstances)[index]) !== null && _a !== void 0 ? _a : (_b[index] = PfdUserSettings.getMasterManager(bus).mapTo(PfdUserSettings.getAliasMap(index)));
        }
        /**
         * Gets an array of definitions for true PFD settings for a single PFD.
         * @param index The index of the display pane.
         * @returns An array of definitions for true PFD settings for the specified PFD.
         */
        static getIndexedSettingDefs(index) {
            const values = PfdUserSettings.getIndexedDefaultValues();
            return Object.keys(values).map(name => {
                return {
                    name: `${name}_${index}`,
                    defaultValue: values[name]
                };
            });
        }
        /**
         * Gets an array of definitions for non-indexed PFD settings.
         * @returns An array of definitions for non-indexed PFD settings.
         */
        static getNonIndexedSettingDefs() {
            const values = PfdUserSettings.getNonIndexedDefaultValues();
            return Object.keys(values).map(name => {
                return {
                    name,
                    defaultValue: values[name]
                };
            });
        }
        /**
         * Gets the default values for a full set of aliased indexed PFD settings.
         * @returns The default values for a full set of aliased indexed PFD settings.
         */
        static getIndexedDefaultValues() {
            return {
                'svtEnabled': false,
                'svtDisabledFpmShow': false,
                'svtHeadingLabelShow': true,
                'svtAirportSignShow': false,
                'svtPathwaysShow': false,
                'svtTrafficShow': false,
                'altimeterBaroMetric': false,
                'aoaDisplayMode': exports.AoaIndicatorDisplaySettingMode.Auto,
                'windDisplayMode': exports.WindDisplaySettingMode.Off,
                'pfdMapLayout': exports.PfdMapLayoutSettingMode.Off,
                'pfdBearingPointer1Source': exports.PfdBearingPointerSource.None,
                'pfdBearingPointer2Source': exports.PfdBearingPointerSource.None
            };
        }
        /**
         * Gets the default values for all non-indexed PFD settings.
         * @returns The default values for all non-indexed PFD settings.
         */
        static getNonIndexedDefaultValues() {
            return {
                'altMetric': false
            };
        }
        /**
         * Gets a setting name alias mapping for a PFD.
         * @param index The index of the PFD.
         * @returns A setting name alias mapping for the specified PFD.
         */
        static getAliasMap(index) {
            const map = {};
            for (const name of PfdUserSettings.INDEXED_SETTING_NAMES) {
                map[name] = `${name}_${index}`;
            }
            return map;
        }
    }
    PfdUserSettings.INDEXED_SETTING_NAMES = [
        'svtEnabled',
        'svtDisabledFpmShow',
        'svtHeadingLabelShow',
        'svtAirportSignShow',
        'svtPathwaysShow',
        'svtTrafficShow',
        'altimeterBaroMetric',
        'aoaDisplayMode',
        'windDisplayMode',
        'pfdMapLayout',
        'pfdBearingPointer1Source',
        'pfdBearingPointer2Source'
    ];
    PfdUserSettings.aliasedInstances = [];

    /**
     * Utility class for creating nav source name formatters.
     */
    class NavSourceFormatter {
        /**
         * Creates a function which generates formatted nav source names.
         * @param gpsName The name to use for GPS-type nav sources.
         * @param showGpsIndex Whether to show the index for GPS-type nav sources.
         * @param showDmeIndex Whether to show the index for DME-type nav sources.
         * @param showAdfIndex Whether to show the index for ADF-type nav sources.
         * @returns A function which generates formatted nav source names.
         */
        static create(gpsName, showGpsIndex, showDmeIndex, showAdfIndex) {
            const names = {
                ['NAV1']: 'NAV1',
                ['NAV2']: 'NAV2',
                ['DME1']: `DME${showDmeIndex ? '1' : ''}`,
                ['DME2']: `DME${showDmeIndex ? '2' : ''}`,
                ['ADF1']: `ADF${showAdfIndex ? '1' : ''}`,
                ['ADF2']: `ADF${showAdfIndex ? '2' : ''}`,
                ['FMS1']: `${gpsName}${showGpsIndex ? '1' : ''}`,
                ['FMS2']: `${gpsName}${showGpsIndex ? '2' : ''}`,
            };
            return (sourceName) => {
                var _a;
                return (_a = names[sourceName]) !== null && _a !== void 0 ? _a : '';
            };
        }
        /**
         * Creates a function which generates formatted nav source names for nav sources.
         * @param gpsName The name to use for GPS-type nav sources.
         * @param showGpsIndex Whether to show the index for GPS-type nav sources.
         * @param showDmeIndex Whether to show the index for DME-type nav sources.
         * @param showAdfIndex Whether to show the index for ADF-type nav sources.
         * @returns A function which generates formatted nav source names for nav sources.
         */
        static createForSource(gpsName, showGpsIndex, showDmeIndex, showAdfIndex) {
            const formatter = NavSourceFormatter.create(gpsName, showGpsIndex, showDmeIndex, showAdfIndex);
            return (source) => {
                return formatter(source.name);
            };
        }
        /**
         * Creates a function which generates formatted nav source names for nav indicators.
         * @param gpsName The name to use for GPS-type nav sources.
         * @param showGpsIndex Whether to show the index for GPS-type nav sources.
         * @param showDmeIndex Whether to show the index for DME-type nav sources.
         * @param showAdfIndex Whether to show the index for ADF-type nav sources.
         * @param showNavType Whether to show the navaid type (VOR vs LOC) for NAV-type nav sources. If `false`, `'NAV'` will
         * be used as the name for all NAV-type sources.
         * @returns A function which generates formatted nav source names for nav indicators.
         */
        static createForIndicator(gpsName, showGpsIndex, showDmeIndex, showAdfIndex, showNavType) {
            const formatter = NavSourceFormatter.create(gpsName, showGpsIndex, showDmeIndex, showAdfIndex);
            if (showNavType) {
                return (indicator) => {
                    const source = indicator.source.get();
                    if (source === null) {
                        return '';
                    }
                    if (source.getType() === msfssdk.NavSourceType.Nav && source.index < 3) {
                        return `${indicator.isLocalizer.get() === true ? 'LOC' : 'VOR'}${source.index}`;
                    }
                    else {
                        return formatter(source.name);
                    }
                };
            }
            else {
                return (indicator) => {
                    const source = indicator.source.get();
                    if (source === null) {
                        return '';
                    }
                    return formatter(source.name);
                };
            }
        }
        /**
         * Creates a function which generates formatted nav source names for nav sources.
         * @param gpsName The name to use for GPS-type nav sources.
         * @param showGpsIndex Whether to show the index for GPS-type nav sources.
         * @param showDmeIndex Whether to show the index for DME-type nav sources.
         * @param showAdfIndex Whether to show the index for ADF-type nav sources.
         * @returns A function which generates formatted nav source names for nav sources.
         */
        static createForBearingPointerSetting(gpsName, showGpsIndex, showDmeIndex, showAdfIndex) {
            const map = {
                [exports.PfdBearingPointerSource.Nav1]: 'NAV1',
                [exports.PfdBearingPointerSource.Nav2]: 'NAV2',
                [exports.PfdBearingPointerSource.Fms1]: 'FMS1',
                [exports.PfdBearingPointerSource.Fms2]: 'FMS2',
                [exports.PfdBearingPointerSource.Adf1]: 'ADF1',
                [exports.PfdBearingPointerSource.Adf2]: 'ADF2',
            };
            const formatter = NavSourceFormatter.create(gpsName, showGpsIndex, showDmeIndex, showAdfIndex);
            return (bearingPointerSource) => {
                return bearingPointerSource === exports.PfdBearingPointerSource.None ? 'OFF' : formatter(map[bearingPointerSource]);
            };
        }
    }

    /**
     * Standard G3000 names for backplane instruments and publishers.
     */
    exports.InstrumentBackplaneNames = void 0;
    (function (InstrumentBackplaneNames) {
        InstrumentBackplaneNames["Adc"] = "Adc";
        InstrumentBackplaneNames["Ahrs"] = "Ahrs";
        InstrumentBackplaneNames["Alert"] = "Alert";
        InstrumentBackplaneNames["Autopilot"] = "Autopilot";
        InstrumentBackplaneNames["AutopilotRadioNav"] = "AutopilotRadioNav";
        InstrumentBackplaneNames["Base"] = "Base";
        InstrumentBackplaneNames["Clock"] = "Clock";
        InstrumentBackplaneNames["ControlSurfaces"] = "ControlSurfaces";
        InstrumentBackplaneNames["Eis"] = "Eis";
        InstrumentBackplaneNames["Electrical"] = "Electrical";
        InstrumentBackplaneNames["Engine"] = "Engine";
        InstrumentBackplaneNames["FuelTotalizer"] = "FuelTotalizer";
        InstrumentBackplaneNames["GarminNav"] = "GarminNav";
        InstrumentBackplaneNames["Gnss"] = "Gnss";
        InstrumentBackplaneNames["HEvents"] = "HEvents";
        InstrumentBackplaneNames["LNav"] = "LNav";
        InstrumentBackplaneNames["LNavData"] = "LNavData";
        InstrumentBackplaneNames["Minimums"] = "Minimums";
        InstrumentBackplaneNames["NavCom"] = "NavCom";
        InstrumentBackplaneNames["NavEvents"] = "NavEvents";
        InstrumentBackplaneNames["NavProc"] = "NavProc";
        InstrumentBackplaneNames["Pressurization"] = "Pressurization";
        InstrumentBackplaneNames["Sound"] = "Sound";
        InstrumentBackplaneNames["Timer"] = "Timer";
        InstrumentBackplaneNames["Traffic"] = "Traffic";
        InstrumentBackplaneNames["VNav"] = "VNav";
        InstrumentBackplaneNames["WeightFuel"] = "WeightFuel";
        InstrumentBackplaneNames["Xpdr"] = "Xpdr";
    })(exports.InstrumentBackplaneNames || (exports.InstrumentBackplaneNames = {}));

    /**
     * An array of all existing user waypoints. Each instance of this class is automatically updated to contain all
     * existing user waypoints in the order in which they were added.
     */
    class ExistingUserWaypointsArray extends msfssdk.AbstractSubscribableArray {
        /**
         * Constructor.
         * @param facRepo The facility repository.
         * @param bus The event bus.
         * @param facWaypointCache A cache from which to retrieve facility waypoints.
         */
        constructor(facRepo, bus, facWaypointCache) {
            super();
            this.facWaypointCache = facWaypointCache;
            this._array = [];
            facRepo.forEach(facility => { this._array.push(facWaypointCache.get(facility)); }, [msfssdk.FacilityType.USR]);
            const sub = bus.getSubscriber();
            this.facRepoSubs = [
                sub.on('facility_added').handle(facility => { msfssdk.FacilityUtils.isFacilityType(facility, msfssdk.FacilityType.USR) && this.onFacilityAdded(facility); }),
                sub.on('facility_removed').handle(facility => { msfssdk.FacilityUtils.isFacilityType(facility, msfssdk.FacilityType.USR) && this.onFacilityRemoved(facility); })
            ];
        }
        /** @inheritdoc */
        get length() {
            return this._array.length;
        }
        /** @inheritdoc */
        getArray() {
            return this._array;
        }
        /**
         * Responds to when a user facility is added.
         * @param facility The added facility.
         */
        onFacilityAdded(facility) {
            const waypoint = this.facWaypointCache.get(facility);
            this._array.push(waypoint);
            this.notify(this._array.length - 1, msfssdk.SubscribableArrayEventType.Added, waypoint);
        }
        /**
         * Responds to when a user facility is removed.
         * @param facility The removed facility.
         */
        onFacilityRemoved(facility) {
            const index = this._array.findIndex(waypoint => waypoint.facility.get().icao === facility.icao);
            if (index >= 0) {
                this.notify(index, msfssdk.SubscribableArrayEventType.Removed, this._array.splice(index, 1)[0]);
            }
        }
        /**
         * Destroys this array. Once destroyed, the state of the array will no longer reflect all existing user waypoints.
         */
        destroy() {
            this.facRepoSubs.forEach(sub => { sub.destroy(); });
        }
    }

    /**
     * An abstract implementation of {@link NavBase}.
     */
    class AbstractNavBase {
        constructor() {
            /** @inheritdoc */
            this.ident = msfssdk.Subject.create(null);
            /** @inheritdoc */
            this.signalStrength = msfssdk.Subject.create(null);
            /** @inheritdoc */
            this.bearing = msfssdk.Subject.create(null);
            /** @inheritdoc */
            this.distance = msfssdk.Subject.create(null);
            /** @inheritdoc */
            this.course = msfssdk.Subject.create(null);
            /** @inheritdoc */
            this.localizerCourse = msfssdk.Subject.create(null);
            // This is a hacky way to get a mutable subscribable to support both input and output type GeoPointInterface | null
            // without requiring a new GeoPoint object be created with every call to .set(). We maintain two instances of
            // GeoPoint, and when we detect that a new non-null input is different from the current value, we swap the two
            // GeoPoint instances, making sure that the incoming instance is set equal to the input. If an input is equal to the
            // value, we leave the GeoPoint instances in place. Because ComputedSubject uses strict equality checks, this ensures
            // that subscribers will be notified if and only if the input is different from the current value.
            this._locationRefs = [new msfssdk.GeoPoint(0, 0), new msfssdk.GeoPoint(0, 0)];
            this._locationRefPointer = 0;
            /** @inheritdoc */
            this.location = msfssdk.ComputedSubject.create(null, input => {
                if (input === null) {
                    return null;
                }
                else {
                    if (this._locationRefs[this._locationRefPointer].equals(input)) {
                        return this._locationRefs[this._locationRefPointer];
                    }
                    else {
                        this._locationRefPointer = (this._locationRefPointer + 1) % 2;
                        return this._locationRefs[this._locationRefPointer].set(input);
                    }
                }
            });
            /** @inheritdoc */
            this.isLocalizer = msfssdk.Subject.create(null);
            /** @inheritdoc */
            this.hasNav = msfssdk.Subject.create(null);
            /** @inheritdoc */
            this.hasDme = msfssdk.Subject.create(null);
            /** @inheritdoc */
            this.hasLocalizer = msfssdk.Subject.create(null);
            /** @inheritdoc */
            this.hasGlideSlope = msfssdk.Subject.create(null);
            /** @inheritdoc */
            this.activeFrequency = msfssdk.Subject.create(null);
            /** @inheritdoc */
            this.toFrom = msfssdk.Subject.create(null);
            /** @inheritdoc */
            this.lateralDeviation = msfssdk.Subject.create(null);
            /** @inheritdoc */
            this.lateralDeviationScale = msfssdk.Subject.create(null);
            /** @inheritdoc */
            this.lateralDeviationScalingMode = msfssdk.Subject.create(null);
            /** @inheritdoc */
            this.verticalDeviation = msfssdk.Subject.create(null);
            /** @inheritdoc */
            this.verticalDeviationScale = msfssdk.Subject.create(null);
            this.fields = new Map([
                ['ident', this.ident],
                ['signalStrength', this.signalStrength],
                ['bearing', this.bearing],
                ['distance', this.distance],
                ['course', this.course],
                ['localizerCourse', this.localizerCourse],
                ['location', this.location],
                ['isLocalizer', this.isLocalizer],
                ['hasDme', this.hasDme],
                ['hasNav', this.hasNav],
                ['hasLocalizer', this.hasLocalizer],
                ['hasGlideSlope', this.hasGlideSlope],
                ['activeFrequency', this.activeFrequency],
                ['toFrom', this.toFrom],
                ['lateralDeviation', this.lateralDeviation],
                ['lateralDeviationScale', this.lateralDeviationScale],
                ['lateralDeviationScalingMode', this.lateralDeviationScalingMode],
                ['verticalDeviation', this.verticalDeviation],
                ['verticalDeviationScale', this.verticalDeviationScale],
            ]);
        }
        /**
         * Sets all fields to `null`.
         */
        clearAll() {
            for (const field of this.fields.values()) {
                field.set(null);
            }
        }
    }

    /* eslint-disable @typescript-eslint/ban-types */
    /**
     * A basic implementation of {@link NavIndicator} whose data is derived directly from its source.
     */
    class BasicNavIndicator extends AbstractNavBase {
        /**
         * Creates a new instance of BasicNavIndicator.
         * @param navSources The possible nav sources from which this indicator can derive data.
         * @param sourceName The initial source to use, if any.
         */
        constructor(navSources, sourceName = null) {
            super();
            this.navSources = navSources;
            this._source = msfssdk.Subject.create(null);
            /** @inheritdoc */
            this.source = this._source;
            this.sourceSubs = [];
            this.setSource(sourceName);
        }
        /** @inheritdoc */
        setSource(sourceName) {
            const oldSource = this.source.get();
            if (oldSource && oldSource.name === sourceName) {
                return;
            }
            if (oldSource === null && sourceName === null) {
                return;
            }
            const newSource = (sourceName ? this.navSources.get(sourceName) : null);
            this._source.set(newSource);
            this.updateFromSource(this._source.get(), oldSource);
        }
        /**
         * Updates this nav indicator from a new source.
         * @param newSource The new nav source.
         * @param oldSource The old nav source.
         */
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        updateFromSource(newSource, oldSource) {
            this.sourceSubs.forEach(sub => { sub.destroy(); });
            this.sourceSubs.length = 0;
            if (newSource) {
                this.fields.forEach((field, key) => {
                    this.sourceSubs.push(newSource[key].pipe(field));
                });
            }
            else {
                this.clearAll();
            }
        }
    }
    /** Holds the nav indicators. */
    class NavIndicators {
        /** NavIndicators constructor.
         * @param indicators The nav indicators to hold. */
        constructor(indicators = new Map()) {
            this.indicators = indicators;
        }
        /** Gets a nav indicator.
         * @param key The name of the indicator to get.
         * @returns The indicator.
         * @throws Error if indicator not found.
         */
        get(key) {
            const indicator = this.indicators.get(key);
            if (!indicator) {
                throw new Error('no nav indicator exists with given key: ' + key);
            }
            else {
                return indicator;
            }
        }
    }

    /* eslint-disable @typescript-eslint/ban-types */
    /** The names of the available nav sources in the G3000 for the course needle. */
    const courseNeedleNavSourceNames = [
        'FMS1',
        'NAV1',
        'NAV2',
    ];
    /**
     * An active navigation source nav indicator.
     */
    class G3000ActiveSourceNavIndicator extends BasicNavIndicator {
        /** NavIndicator constructor.
         * @param navSources The possible nav sources that could be pointed to.
         * @param bus The bus.
         * @param index The index of this indicator's active nav source.
         */
        constructor(navSources, bus, index) {
            super(navSources, 'NAV1');
            this.bus = bus;
            this.navSource = msfssdk.ConsumerSubject.create(this.bus.getSubscriber().on(`active_nav_source_${index}`), garminsdk.ActiveNavSource.Nav1);
            this.navSource.sub(source => {
                switch (source) {
                    case garminsdk.ActiveNavSource.Nav1:
                        this.setSource('NAV1');
                        break;
                    case garminsdk.ActiveNavSource.Nav2:
                        this.setSource('NAV2');
                        break;
                    case garminsdk.ActiveNavSource.Gps1:
                    case garminsdk.ActiveNavSource.Gps2:
                        // TODO: support multiple FMS sources
                        this.setSource('FMS1');
                        break;
                }
            }, true);
        }
    }
    /**
     * A provider of approach preview data.
     */
    class G3000ApproachPreviewDataProvider {
        /**
         * NavIndicator constructor.
         * @param navSources The possible nav sources that could be pointed to.
         * @param bus The bus.
         */
        constructor(navSources, bus) {
            this.navSources = navSources;
            this._source = msfssdk.Subject.create(null);
            /**
             * The navigation source from which approach preview data is derived, or `null` if approach preview data is not
             * available.
             */
            this.source = this._source;
            this.approachDetails = msfssdk.ConsumerSubject.create(null, {
                isLoaded: false,
                type: ApproachType.APPROACH_TYPE_UNKNOWN,
                isRnpAr: false,
                bestRnavType: msfssdk.RnavTypeFlags.None,
                rnavTypeFlags: msfssdk.RnavTypeFlags.None,
                isCircling: false,
                isVtf: false,
                frequency: 0
            }, garminsdk.FmsUtils.approachDetailsEquals);
            this.flightPhase = msfssdk.ConsumerSubject.create(null, {
                isApproachActive: false,
                isPastFaf: false,
                isInMissedApproach: false
            }, garminsdk.FmsUtils.flightPhaseEquals);
            this.activeNavSource = msfssdk.ConsumerSubject.create(null, garminsdk.ActiveNavSource.Nav1);
            this.isNav1TunedToApproachFreq = msfssdk.MappedSubject.create(([approachDetails, activeFreq]) => {
                return approachDetails.frequency !== 0 && activeFreq !== null && Math.round(approachDetails.frequency * 100) === Math.round(activeFreq * 100);
            }, this.approachDetails, this.navSources.get('NAV1').activeFrequency).pause();
            this.isNav2TunedToApproachFreq = msfssdk.MappedSubject.create(([approachDetails, activeFreq]) => {
                return approachDetails.frequency !== 0 && activeFreq !== null && Math.round(approachDetails.frequency * 100) === Math.round(activeFreq * 100);
            }, this.approachDetails, this.navSources.get('NAV2').activeFrequency).pause();
            const sub = bus.getSubscriber();
            this.activeNavSource.setConsumer(sub.on('active_nav_source_1'));
            this.approachDetails.setConsumer(sub.on('fms_approach_details'));
            this.flightPhase.setConsumer(sub.on('fms_flight_phase'));
            const tuneState = msfssdk.MappedSubject.create(this.isNav1TunedToApproachFreq, this.isNav2TunedToApproachFreq);
            const tuneStateSub = tuneState.sub(([isNav1Tuned, isNav2Tuned]) => {
                if (isNav1Tuned) {
                    this._source.set('NAV1');
                }
                else if (isNav2Tuned) {
                    this._source.set('NAV2');
                }
                else {
                    this._source.set(null);
                }
            }, false, true);
            const flightPhaseSub = this.flightPhase.sub(flightPhase => {
                if (flightPhase.isApproachActive && !flightPhase.isInMissedApproach) {
                    this.isNav1TunedToApproachFreq.resume();
                    this.isNav2TunedToApproachFreq.resume();
                    tuneStateSub.resume(true);
                }
                else {
                    tuneStateSub.pause();
                    this.isNav1TunedToApproachFreq.pause();
                    this.isNav2TunedToApproachFreq.pause();
                    this._source.set(null);
                }
            }, false, true);
            this.activeNavSource.sub(source => {
                if (source === garminsdk.ActiveNavSource.Gps1 || source === garminsdk.ActiveNavSource.Gps2) {
                    flightPhaseSub.resume(true);
                }
                else {
                    flightPhaseSub.pause();
                    tuneStateSub.pause();
                    this._source.set(null);
                }
            }, true);
        }
    }
    /**
     * An approach preview (LOC and glideslope) nav indicator.
     */
    class G3000ApproachPreviewNavIndicator extends BasicNavIndicator {
        /**
         * Constructor.
         * @param navSources The possible nav sources that could be pointed to.
         * @param dataProvider A provider of approach preview data.
         */
        constructor(navSources, dataProvider) {
            super(navSources, null);
            dataProvider.source.sub(source => { this.setSource(source); });
        }
    }
    /**
     * A bearing pointer nav indicator.
     */
    class G3000BearingPointerNavIndicator extends BasicNavIndicator {
        /** @inheritdoc */
        constructor(navSources, bus, index, settingManager) {
            super(navSources);
            this.ppos = msfssdk.GeoPointSubject.create(new msfssdk.GeoPoint(0, 0));
            const gnss = bus.getSubscriber();
            this.pposSub = gnss.on('gps-position').handle(lla => {
                this.ppos.set(lla.lat, lla.long);
            }, true);
            this.gpsDisState = msfssdk.MappedSubject.create(this.ppos, this.location);
            this.disSub = this.gpsDisState.sub(([ppos, location]) => {
                if (location === null) {
                    this.distance.set(null);
                }
                else {
                    this.distance.set(msfssdk.UnitType.GA_RADIAN.convertTo(ppos.distance(location), msfssdk.UnitType.NMILE));
                }
            }, false, true);
            this.freqIdentPipe = this.activeFrequency.pipe(this.ident, freq => freq === null ? null : G3000BearingPointerNavIndicator.ADF_FREQ_FORMATTER(freq * 1000), true);
            const sourceSetting = settingManager.getSetting(`pfdBearingPointer${index}Source`);
            sourceSetting.sub(source => {
                switch (source) {
                    case exports.PfdBearingPointerSource.Nav1:
                        this.setSource('NAV1');
                        break;
                    case exports.PfdBearingPointerSource.Nav2:
                        this.setSource('NAV2');
                        break;
                    case exports.PfdBearingPointerSource.Fms1:
                        this.setSource('FMS1');
                        break;
                    case exports.PfdBearingPointerSource.Fms2:
                        this.setSource('FMS2');
                        break;
                    case exports.PfdBearingPointerSource.Adf1:
                        this.setSource('ADF1');
                        break;
                    case exports.PfdBearingPointerSource.Adf2:
                        this.setSource('ADF2');
                        break;
                    default:
                        this.setSource(null);
                }
            }, true);
        }
        /** @inheritdoc */
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        updateFromSource(newSource, oldSource) {
            this.sourceSubs.forEach(sub => { sub.destroy(); });
            this.sourceSubs.length = 0;
            if (newSource) {
                // Bearing pointers always derive their distance information from GPS data. Therefore we need to
                // override the source's distance information if the source is NAV or ADF.
                // Additionally, for bearing pointers the IDENT of an ADF source is its active frequency, so we need to
                // override the source's ident information with the active frequency.
                const sourceType = newSource.getType();
                let exclude = G3000BearingPointerNavIndicator.EMPTY_FILTER;
                if (sourceType === msfssdk.NavSourceType.Gps) {
                    this.pposSub.pause();
                    this.disSub.pause();
                }
                else {
                    if (sourceType === msfssdk.NavSourceType.Adf) {
                        exclude = G3000BearingPointerNavIndicator.ADF_FILTER;
                    }
                    else {
                        exclude = G3000BearingPointerNavIndicator.NAV_FILTER;
                    }
                    this.pposSub.resume(true);
                    this.disSub.resume(true);
                }
                this.fields.forEach((field, key) => {
                    if (!exclude.includes(key)) {
                        this.sourceSubs.push(newSource[key].pipe(field));
                    }
                });
                if (sourceType === msfssdk.NavSourceType.Adf) {
                    this.freqIdentPipe.resume(true);
                }
                else {
                    this.freqIdentPipe.pause();
                }
            }
            else {
                this.pposSub.pause();
                this.disSub.pause();
                this.freqIdentPipe.pause();
                this.clearAll();
            }
        }
    }
    G3000BearingPointerNavIndicator.ADF_FREQ_FORMATTER = msfssdk.RadioFrequencyFormatter.createAdf('');
    G3000BearingPointerNavIndicator.EMPTY_FILTER = [];
    G3000BearingPointerNavIndicator.NAV_FILTER = ['distance'];
    G3000BearingPointerNavIndicator.ADF_FILTER = ['distance', 'ident'];
    /**
     * A Nav info nav indicator.
     */
    class G3000NavInfoNavIndicator extends BasicNavIndicator {
        /**
         * Constructor.
         * @param navSources The possible nav sources that could be pointed to.
         * @param bus The event bus.
         * @param index The index of the active nav source associated with this indicator.
         * @param previewDataProvider A provider of approach preview data.
         */
        constructor(navSources, bus, index, previewDataProvider) {
            super(navSources, null);
            this.bus = bus;
            this._isPreview = msfssdk.Subject.create(false);
            /** Whether this indicator is in preview mode. */
            this.isPreview = this._isPreview;
            this.previewSourceSub = previewDataProvider.source.sub(source => { this.setSource(source); }, false, true);
            this.bus.getSubscriber().on(`active_nav_source_${index}`).whenChanged().handle(activeNavSource => {
                const source = G3000NavInfoNavIndicator.SOURCE_MAP[activeNavSource];
                if (source === null) {
                    this._isPreview.set(true);
                    this.previewSourceSub.resume(true);
                }
                else {
                    this._isPreview.set(false);
                    this.previewSourceSub.pause();
                    this.setSource(source);
                }
            });
        }
    }
    G3000NavInfoNavIndicator.SOURCE_MAP = {
        [garminsdk.ActiveNavSource.Nav1]: 'NAV1',
        [garminsdk.ActiveNavSource.Nav2]: 'NAV2',
        [garminsdk.ActiveNavSource.Gps1]: null,
        [garminsdk.ActiveNavSource.Gps2]: null
    };
    /**
     * A DME info nav indicator.
     */
    class G3000DmeInfoNavIndicator extends BasicNavIndicator {
        /**
         * Constructor.
         * @param navSources The possible nav sources that could be pointed to.
         * @param bus The event bus.
         * @param index The index of the active nav source associated with this indicator.
         * @param dmeRadioCount The number of supported DME radios.
         * @param previewDataProvider A provider of approach preview data.
         */
        constructor(navSources, bus, index, dmeRadioCount, previewDataProvider) {
            super(navSources, null);
            this.bus = bus;
            this._isPreview = msfssdk.Subject.create(false);
            /** Whether this indicator is in preview mode. */
            this.isPreview = this._isPreview;
            if (dmeRadioCount > 0) {
                const activeNavSourceMap = {
                    [garminsdk.ActiveNavSource.Nav1]: 'DME1',
                    [garminsdk.ActiveNavSource.Nav2]: dmeRadioCount > 1 ? 'DME2' : 'DME1',
                    [garminsdk.ActiveNavSource.Gps1]: null,
                    [garminsdk.ActiveNavSource.Gps2]: null
                };
                const previewSourceMap = {
                    ['NAV1']: 'DME1',
                    ['NAV2']: dmeRadioCount > 1 ? 'DME2' : 'DME1'
                };
                this.previewSourceSub = previewDataProvider.source.sub(source => { this.setSource(source === null ? null : previewSourceMap[source]); });
                this.bus.getSubscriber().on(`active_nav_source_${index}`).whenChanged().handle(activeNavSource => {
                    const source = activeNavSourceMap[activeNavSource];
                    if (source === null) {
                        this._isPreview.set(true);
                        this.previewSourceSub.resume(true);
                    }
                    else {
                        this._isPreview.set(false);
                        this.previewSourceSub.pause();
                        this.setSource(source);
                    }
                });
            }
        }
    }

    /** Represents an ADF radio, subscribes to the ADF SimVars. */
    class AdfRadioSource extends AbstractNavBase {
        /**
         * Constructor.
         * @param bus The event bus.
         * @param name The name of this source.
         * @param index The index of this source.
         */
        constructor(bus, name, index) {
            super();
            this.name = name;
            this.index = index;
            const navProcSimVarsSubscriber = bus.getSubscriber();
            this.signal = msfssdk.ConsumerSubject.create(navProcSimVarsSubscriber.on(`adf_signal_${index}`), 0);
            this.relativeBearing = msfssdk.ConsumerSubject.create(navProcSimVarsSubscriber.on(`adf_bearing_${index}`), 0);
            const tempLocation = new msfssdk.GeoPoint(0, 0);
            // Pretty sure there is no NDB at {0 N, 0 E}, so we can safely assume if we ever get that data from the sim there
            // is no valid tuned station.
            navProcSimVarsSubscriber.on(`adf_lla_${index}`).handle(val => {
                if (val.lat === 0 && val.long === 0) {
                    this.location.set(null);
                }
                else {
                    this.location.set(tempLocation.set(val.lat, val.long));
                }
            });
            const ahrs = bus.getSubscriber();
            this.heading = msfssdk.ConsumerSubject.create(ahrs.on('hdg_deg'), 0);
            const navComSimVarsSubscriber = bus.getSubscriber();
            navComSimVarsSubscriber.on(`adf_active_frequency_${index}`).handle(val => { this.activeFrequency.set(val); });
            const bearing = msfssdk.MappedSubject.create(([relativeBearing, heading]) => {
                return msfssdk.NavMath.normalizeHeading(relativeBearing + heading);
            }, this.relativeBearing, this.heading).pause();
            this.signal.pipe(this.signalStrength);
            const bearingPipe = bearing.pipe(this.bearing, true);
            this.signal.sub(signal => {
                if (signal > 0) {
                    bearing.resume();
                    bearingPipe.resume(true);
                }
                else {
                    bearing.pause();
                    bearingPipe.pause();
                    this.bearing.set(null);
                }
            }, true);
        }
        /** @inheritdoc */
        getType() {
            return msfssdk.NavSourceType.Adf;
        }
    }

    /* eslint-disable @typescript-eslint/no-non-null-assertion */
    /** Represents a GPS/FMS source, subscribes to the custom FMS LVars. */
    class GpsSource extends AbstractNavBase {
        /**
         * Constructor.
         * @param bus The event bus.
         * @param name The name of this source.
         * @param index The index of this source.
         */
        constructor(bus, name, index) {
            super();
            this.name = name;
            this.index = index;
            const lnav = bus.getSubscriber();
            this.lnavIsTracking = msfssdk.ConsumerSubject.create(lnav.on('lnav_is_tracking'), false);
            this.lnavIdent = msfssdk.ConsumerSubject.create(lnav.on('lnavdata_waypoint_ident'), '').pause();
            this.lnavBrgMag = msfssdk.ConsumerSubject.create(lnav.on('lnavdata_waypoint_bearing_mag'), 0).pause();
            this.lnavDis = msfssdk.ConsumerSubject.create(lnav.on('lnavdata_waypoint_distance'), 0).pause();
            this.lnavDtkMag = msfssdk.ConsumerSubject.create(lnav.on('lnavdata_dtk_mag'), 0).pause();
            this.lnavXtk = msfssdk.ConsumerSubject.create(lnav.on('lnavdata_xtk'), 0).pause();
            this.lnavCdiScale = msfssdk.ConsumerSubject.create(lnav.on('lnavdata_cdi_scale'), 0);
            this.lnavCdiScale.pipe(this.lateralDeviationScale);
            lnav.on('lnavdata_cdi_scale_label').handle(cdiScale => { this.lateralDeviationScalingMode.set(cdiScale); });
            const lateralDeviation = msfssdk.MappedSubject.create(([xtk, scale]) => {
                return scale !== 0 ? -xtk / scale : null;
            }, this.lnavXtk, this.lnavCdiScale).pause();
            const identPipe = this.lnavIdent.pipe(this.ident, true);
            const bearingPipe = this.lnavBrgMag.pipe(this.bearing, true);
            const distancePipe = this.lnavDis.pipe(this.distance, true);
            const dtkPipe = this.lnavDtkMag.pipe(this.course, true);
            const lateralDeviationPipe = lateralDeviation.pipe(this.lateralDeviation, true);
            this.lnavIsTracking.sub(isTracking => {
                if (isTracking) {
                    this.lnavIdent.resume();
                    this.lnavBrgMag.resume();
                    this.lnavDis.resume();
                    this.lnavDtkMag.resume();
                    this.lnavXtk.resume();
                    lateralDeviation.resume();
                    identPipe.resume(true);
                    bearingPipe.resume(true);
                    distancePipe.resume(true);
                    dtkPipe.resume(true);
                    lateralDeviationPipe.resume(true);
                    this.signalStrength.set(1);
                }
                else {
                    this.signalStrength.set(0);
                    this.lnavIdent.pause();
                    this.lnavBrgMag.pause();
                    this.lnavDis.pause();
                    this.lnavDtkMag.pause();
                    this.lnavXtk.pause();
                    lateralDeviation.pause();
                    identPipe.pause();
                    bearingPipe.pause();
                    distancePipe.pause();
                    dtkPipe.pause();
                    lateralDeviationPipe.pause();
                    this.ident.set(null);
                    this.bearing.set(null);
                    this.distance.set(null);
                    this.course.set(null);
                    this.lateralDeviation.set(null);
                }
            }, true);
            const vnav = bus.getSubscriber();
            this.gpAvailable = msfssdk.ConsumerSubject.create(vnav.on('gp_available'), false);
            this.gpDeviation = msfssdk.ConsumerSubject.create(vnav.on('gp_vertical_deviation'), 0);
            this.gpScale = msfssdk.ConsumerSubject.create(vnav.on('gp_gsi_scaling'), 0);
            this.gpScale.pipe(this.verticalDeviationScale, scale => scale <= 0 ? null : scale);
            const verticalDeviation = msfssdk.MappedSubject.create(([gpDeviation, scale]) => {
                return scale !== 0 ? gpDeviation / scale : null;
            }, this.gpDeviation, this.gpScale).pause();
            const verticalDeviationPipe = verticalDeviation.pipe(this.verticalDeviation, true);
            this.gpAvailable.sub(isGpAvailable => {
                if (isGpAvailable) {
                    verticalDeviation.resume();
                    verticalDeviationPipe.resume(true);
                }
                else {
                    verticalDeviation.pause();
                    verticalDeviationPipe.pause();
                    this.verticalDeviation.set(null);
                }
            }, true);
        }
        /** @inheritdoc */
        getType() {
            return msfssdk.NavSourceType.Gps;
        }
    }

    /* eslint-disable @typescript-eslint/no-non-null-assertion */
    /** Represents a NAV radio, subscribes to the NAV SimVars. */
    class NavRadioNavSource extends AbstractNavBase {
        /**
         * Constructor.
         * @param bus The event bus.
         * @param name The name of this source.
         * @param index The index of this source.
         */
        constructor(bus, name, index) {
            super();
            this.name = name;
            this.index = index;
            this.hasSignal = this.signalStrength.map(signalStrength => signalStrength !== null && signalStrength > 0);
            this.glideSlopeErrorDegrees = msfssdk.Subject.create(0);
            this.navLocalizerCrsRad = msfssdk.Subject.create(0);
            this.navCdi = msfssdk.Subject.create(0);
            this.navRadial = msfssdk.Subject.create(0);
            this.updateIsLocalizer = () => {
                var _a;
                const navHasLocalizer = this.hasLocalizer.get();
                const _isLocalizerFrequency = msfssdk.RadioUtils.isLocalizerFrequency((_a = this.activeFrequency.get()) !== null && _a !== void 0 ? _a : 0);
                this.isLocalizer.set(navHasLocalizer || _isLocalizerFrequency);
            };
            this.updateLocalizerCourse = () => {
                this.localizerCourse.set(this.hasLocalizer.get()
                    ? this.navLocalizerCrsRad.get() * Avionics.Utils.RAD2DEG
                    : null);
            };
            this.updateVerticalDeviation = () => {
                this.verticalDeviation.set(this.getVerticalDeviation());
            };
            this.updateLateralDeviation = () => {
                this.lateralDeviation.set(this.getLateralDeviation());
            };
            const navProcSimVarsSubscriber = bus.getSubscriber();
            navProcSimVarsSubscriber.on(`nav_signal_${index}`).handle(val => { this.signalStrength.set(val); });
            navProcSimVarsSubscriber.on(`nav_has_dme_${index}`).handle(val => { this.hasDme.set(val); });
            navProcSimVarsSubscriber.on(`nav_has_nav_${index}`).handle(val => { this.hasNav.set(val); });
            navProcSimVarsSubscriber.on(`nav_ident_${index}`).handle(val => { this.ident.set(val); });
            navProcSimVarsSubscriber.on(`nav_localizer_${index}`).handle(val => { this.hasLocalizer.set(val); });
            navProcSimVarsSubscriber.on(`nav_localizer_crs_${index}`).handle(val => { this.navLocalizerCrsRad.set(val); });
            navProcSimVarsSubscriber.on(`nav_gs_error_${index}`).handle(val => { this.glideSlopeErrorDegrees.set(val); });
            navProcSimVarsSubscriber.on(`nav_glideslope_${index}`).handle(val => { this.hasGlideSlope.set(val); });
            navProcSimVarsSubscriber.on(`nav_obs_${index}`).handle(val => { this.course.set(val); });
            navProcSimVarsSubscriber.on(`nav_cdi_${index}`).handle(val => { this.navCdi.set(val); });
            navProcSimVarsSubscriber.on(`nav_to_from_${index}`).handle(val => { this.toFrom.set(val); });
            const navComSimVarsSubscriber = bus.getSubscriber();
            navComSimVarsSubscriber.on(`nav_active_frequency_${index}`).handle(val => { this.activeFrequency.set(val); });
            this.dmePipe = navProcSimVarsSubscriber.on(`nav_dme_${index}`).handle(val => { this.distance.set(val); }, true);
            this.bearingPipe = navProcSimVarsSubscriber.on(`nav_radial_${index}`).handle(val => { this.bearing.set((val + 180) % 360); }, true);
            this.vorLla = msfssdk.ConsumerSubject.create(navProcSimVarsSubscriber.on(`nav_lla_${index}`), new LatLongAlt(0, 0), (a, b) => {
                return a.lat === b.lat && a.long === b.long;
            }).pause();
            this.dmeLla = msfssdk.ConsumerSubject.create(navProcSimVarsSubscriber.on(`nav_dme_lla_${index}`), new LatLongAlt(0, 0), (a, b) => {
                return a.lat === b.lat && a.long === b.long;
            }).pause();
            const tempLocation = new msfssdk.GeoPoint(0, 0);
            // Pretty sure there is no VOR at {0 N, 0 E}, so we can safely assume if we ever get that data from the sim there
            // is no valid tuned station.
            const vorLlaPipe = this.vorLla.pipe(this.location, lla => {
                if (lla.lat === 0 && lla.long === 0) {
                    return null;
                }
                else {
                    return tempLocation.set(lla.lat, lla.long);
                }
            }, true);
            const dmeLlaPipe = this.dmeLla.pipe(this.location, lla => {
                if (lla.lat === 0 && lla.long === 0) {
                    return null;
                }
                else {
                    return tempLocation.set(lla.lat, lla.long);
                }
            }, true);
            const locationState = msfssdk.CombinedSubject.create(this.hasLocalizer, this.hasNav, this.hasDme);
            locationState.sub(([hasLoc, hasNav, hasDme]) => {
                if (hasLoc || hasNav) {
                    this.dmeLla.pause();
                    dmeLlaPipe.pause();
                    this.vorLla.resume();
                    vorLlaPipe.resume(true);
                }
                else if (hasDme) {
                    this.vorLla.pause();
                    vorLlaPipe.pause();
                    this.dmeLla.resume();
                    dmeLlaPipe.resume(true);
                }
                else {
                    this.vorLla.pause();
                    vorLlaPipe.pause();
                    this.dmeLla.pause();
                    dmeLlaPipe.pause();
                    this.location.set(null);
                }
            }, true);
            // Distance
            msfssdk.CombinedSubject.create(this.hasDme, this.hasSignal).sub(([hasDme, hasSignal]) => {
                if (hasDme !== null && hasDme && hasSignal) {
                    this.dmePipe.resume(true);
                }
                else {
                    this.dmePipe.pause();
                    this.distance.set(null);
                }
            }, true);
            // Bearing
            msfssdk.CombinedSubject.create(this.hasNav, this.hasSignal).sub(([hasNav, hasSignal]) => {
                if (hasNav !== null && hasNav && hasSignal) {
                    this.bearingPipe.resume(true);
                }
                else {
                    this.bearingPipe.pause();
                    this.bearing.set(null);
                }
            }, true);
            this.hasLocalizer.sub(this.updateIsLocalizer);
            this.activeFrequency.sub(this.updateIsLocalizer);
            this.hasLocalizer.sub(this.updateLocalizerCourse);
            this.navLocalizerCrsRad.sub(this.updateLocalizerCourse);
            this.hasGlideSlope.sub(this.updateVerticalDeviation);
            this.glideSlopeErrorDegrees.sub(this.updateVerticalDeviation);
            this.navCdi.sub(this.updateLateralDeviation);
            this.hasNav.sub(this.updateLateralDeviation);
        }
        /** @inheritdoc */
        getType() {
            return msfssdk.NavSourceType.Nav;
        }
        /** @returns Deviation is in degrees, and standard glideslope is 1.4 degrees thick,
         * so the vdev indicator will max out when 0.7 degrees off the GS */
        getVerticalDeviation() {
            if (!this.hasGlideSlope.get()) {
                return null;
            }
            else {
                return -this.glideSlopeErrorDegrees.get() / 0.7;
            }
        }
        /** @returns Deviation is in degrees, and standard glideslope is 1.4 degrees thick,
         * so the vdev indicator will max out when 0.7 degrees off the GS */
        getLateralDeviation() {
            if (!this.hasNav.get()) {
                return null;
            }
            else {
                // The NAV CDI simvar holds the deviation as a range from -127 to 127
                return this.navCdi.get() / 127;
            }
        }
    }

    // TODO Does this need to be an instrument?
    /** Holds the available Nav Sources that NavIndicators can use. */
    class NavSources {
        /** NavSources constructor.
         * @param sources The nav sources. */
        constructor(...sources) {
            this.sources = sources;
        }
        /** Gets a nav source.
         * @param name Name of source.
         * @returns The source.
         * @throws Error if name not found.
         */
        get(name) {
            const indicator = this.sources.find(x => x.name === name);
            if (!indicator) {
                throw new Error('no nav source exists with given name: ' + name);
            }
            else {
                return indicator;
            }
        }
    }

    /**
     * Auto slews OBS when a NavSource is tuned to a localizer.
     */
    class ObsAutoSlew {
        /** Creates an ObsAutoSlew instance which will subscribe to a
         * given NavSource, and auto slew OBS to the localizer course.
         * @param navSource The NavSource to listen to.
         */
        constructor(navSource) {
            this.navSource = navSource;
            /** The user may change the course manually after slewing, this is fine.
             * It won't affect guidance or the deviation indicators. */
            this.trySlewObs = () => {
                const course = this.navSource.localizerCourse.get();
                if (this.navSource.hasLocalizer.get() && course !== null) {
                    SimVar.SetSimVarValue(`K:VOR${this.navSource.index}_SET`, 'number', Math.round(course));
                }
            };
            navSource.localizerCourse.sub(this.trySlewObs);
            navSource.isLocalizer.sub(this.trySlewObs);
        }
    }

    /**
     * A G3000 nearest facilities context. Maintains search subscriptions for the nearest airports, VORs, NDBs,
     * intersections, and user waypoints to the airplane's position.
     */
    class G3000NearestContext {
        /**
         * Constructor.
         * @param facilityLoader A facility loader.
         * @param bus The event bus.
         * @param context This context's child {@link AdaptiveNearestContext}.
         * @param fmsPosIndex The index of the FMS geo-positioning system used by this context to get the airplane's
         * position.
         * @param ppos A GeoPointSubject to update with the airplane's position.
         */
        constructor(facilityLoader, bus, context, fmsPosIndex, ppos) {
            this.bus = bus;
            this.context = context;
            this.ppos = ppos;
            /** The nearest airports. */
            this.airports = this.context.airports;
            /** The nearest VOR stations. */
            this.vors = this.context.vors;
            /** The nearest intersections. */
            this.intersections = this.context.intersections;
            /** The nearest NDB stations. */
            this.ndbs = this.context.ndbs;
            /** The nearest USR facilities. */
            this.usrs = this.context.usrs;
            this._updateEvent = new msfssdk.SubEvent();
            /** A subscribable event which fires when this context is updated. */
            this.updateEvent = this._updateEvent;
            this.nearestAirportSettingManager = garminsdk.NearestAirportUserSettings.getManager(this.bus);
            this.comRadioSettingManager = garminsdk.ComRadioUserSettings.getManager(this.bus);
            this.nearestAirportFilterState = msfssdk.MappedSubject.create(this.nearestAirportSettingManager.getSetting('nearestAptRunwayLength'), this.nearestAirportSettingManager.getSetting('nearestAptRunwaySurfaceTypes'));
            this.fmsPosMode = msfssdk.ConsumerSubject.create(null, garminsdk.FmsPositionMode.None);
            this.fmsPosIndex = msfssdk.SubscribableUtils.toSubscribable(fmsPosIndex, true);
            const sub = this.bus.getSubscriber();
            this.fmsPosIndex.sub(index => {
                var _a;
                (_a = this.pposSub) === null || _a === void 0 ? void 0 : _a.destroy();
                this.fmsPosMode.setConsumer(sub.on(`fms_pos_mode_${index}`));
                this.pposSub = sub.on(`fms_pos_gps-position_${index}`).handle(lla => { this.ppos.set(lla.lat, lla.long); });
            }, true);
            this.weather = new msfssdk.AdaptiveNearestSubscription(new msfssdk.NearestAirportSubscription(facilityLoader), 200);
            this.weather.start();
            context.maxAirports = 25;
            context.maxVors = 25;
            context.maxIntersections = 25;
            context.maxNdbs = 25;
            context.maxUsrs = 25;
            context.maxAirportsAbsolute = 200;
            context.maxVorsAbsolute = 25;
            context.maxIntersectionsAbsolute = 200;
            context.maxNdbsAbsolute = 25;
            context.maxUsrsAbsolute = 25;
            context.airportRadius = 200;
            context.vorRadius = 200;
            context.intersectionRadius = 200;
            context.ndbRadius = 200;
            context.usrRadius = 200;
            this.initFilters();
        }
        /**
         * Initializes the filters on this context's searches.
         */
        async initFilters() {
            await Promise.all([
                this.context.airports.awaitStart(),
                this.context.vors.awaitStart(),
                this.context.intersections.awaitStart(),
                this.weather.awaitStart()
            ]);
            this.context.vors.innerSubscription.setVorFilter(msfssdk.BitFlags.union(msfssdk.BitFlags.createFlag(msfssdk.VorClass.LowAlt), msfssdk.BitFlags.createFlag(msfssdk.VorClass.HighAlt), msfssdk.BitFlags.createFlag(msfssdk.VorClass.Terminal)), msfssdk.BitFlags.union(msfssdk.BitFlags.createFlag(msfssdk.VorType.VOR), msfssdk.BitFlags.createFlag(msfssdk.VorType.VORDME), msfssdk.BitFlags.createFlag(msfssdk.VorType.TACAN), msfssdk.BitFlags.createFlag(msfssdk.VorType.VORTAC)));
            this.nearestAirportFilterState.sub(([runwayLength, runwaySurfaceCategories]) => {
                const minLengthMeters = msfssdk.UnitType.FOOT.convertTo(runwayLength - 0.1, msfssdk.UnitType.METER);
                this.context.airports.innerSubscription.setExtendedFilters(~0, ~0, ~0, minLengthMeters);
                this.context.airports.innerSubscription.setFilterCb(facility => {
                    for (let i = 0; i < facility.runways.length; i++) {
                        const runway = facility.runways[i];
                        if (msfssdk.BitFlags.isAny(msfssdk.RunwayUtils.getSurfaceCategory(runway), runwaySurfaceCategories) && runway.length >= minLengthMeters) {
                            return true;
                        }
                    }
                    return false;
                });
            }, true);
            this.comRadioSettingManager.getSetting('comRadioSpacing').sub(mode => {
                const checkFunc = mode === garminsdk.ComRadioSpacingSettingMode.Spacing8_33Khz ? undefined : msfssdk.RadioUtils.isCom25Frequency;
                this.weather.innerSubscription.setFilterCb(facility => {
                    for (let i = 0; i < facility.frequencies.length; i++) {
                        const frequency = facility.frequencies[i];
                        const type = frequency.type;
                        if ((type === msfssdk.FacilityFrequencyType.ATIS || type === msfssdk.FacilityFrequencyType.ASOS || type === msfssdk.FacilityFrequencyType.AWOS)
                            && (checkFunc === undefined || checkFunc(frequency.freqMHz))) {
                            return true;
                        }
                    }
                    return false;
                });
            }, true);
            this.context.intersections.innerSubscription.setFilterDupTerminal(true);
        }
        /**
         * Gets the airport region letter to use for the first character in waypoint inputs.
         * @returns The airport region letter.
         */
        getRegionLetter() {
            return this.context.getRegionLetter();
        }
        /**
         * Gets the nearest facility for a given type.
         * @param facilityType The type of facility.
         * @returns The nearest facility for a given type.
         */
        getNearest(facilityType) {
            return this.context.getNearest(facilityType);
        }
        /**
         * Updates this context.
         */
        async update() {
            if (this.fmsPosMode.get() === garminsdk.FmsPositionMode.None) {
                return;
            }
            const ppos = this.ppos.get();
            await Promise.all([
                this.context.update(),
                this.weather.update(ppos.lat, ppos.lon, msfssdk.UnitType.NMILE.convertTo(200, msfssdk.UnitType.METER), 25)
            ]);
            this._updateEvent.notify(this);
        }
        /**
         * Gets the G3000NearestContext instance on the local instrument.
         * @returns A Promise which will be fulfilled with the G3000NearestContext instance on the local instrument once
         * it is initialized.
         */
        static getInstance() {
            if (G3000NearestContext.INSTANCE !== undefined) {
                return Promise.resolve(G3000NearestContext.INSTANCE);
            }
            return new Promise(resolve => { this.instancePromiseResolves.push(resolve); });
        }
        /**
         * Initializes and returns the G3000NearestContext instance on the local instrument. If the instance is already
         * initialized, this method returns the instance without performing any other actions.
         * @param facilityLoader A facility loader.
         * @param bus The event bus.
         * @param fmsPosIndex The index of the FMS geo-positioning system used by the context to get the airplane's position.
         * @returns The initialized G3000NearestContext instance on the local instrument.
         */
        static initializeInstance(facilityLoader, bus, fmsPosIndex) {
            if (G3000NearestContext.INSTANCE !== undefined) {
                return G3000NearestContext.INSTANCE;
            }
            const ppos = msfssdk.GeoPointSubject.create(new msfssdk.GeoPoint(0, 0));
            msfssdk.AdaptiveNearestContext.initialize(facilityLoader, bus, ppos);
            const instance = G3000NearestContext.INSTANCE = new G3000NearestContext(facilityLoader, bus, msfssdk.AdaptiveNearestContext.getInstance(), fmsPosIndex, ppos);
            this.instancePromiseResolves.forEach(resolve => { resolve(instance); });
            this.instancePromiseResolves.length = 0;
            return instance;
        }
    }
    G3000NearestContext.instancePromiseResolves = [];

    /**
     * A basic implementation of {@link NearestWaypointEntry}.
     */
    class BasicNearestWaypointEntry {
        /**
         * Constructor.
         * @param waypoint This data item's waypoint.
         * @param ppos The current airplane position.
         * @param planeHeading The current true heading of the airplane, in degrees.
         */
        constructor(waypoint, ppos, planeHeading) {
            this.waypoint = waypoint;
            this.store = new garminsdk.WaypointInfoStore(waypoint, ppos);
            this._relativeBearing = msfssdk.MappedSubject.create(([bearing, heading]) => bearing.number - heading, msfssdk.SubscribableUtils.NUMERIC_NAN_EQUALITY, this.store.bearing, planeHeading);
            this.relativeBearing = this._relativeBearing;
        }
        /** @inheritdoc */
        destroy() {
            this.store.destroy();
            this._relativeBearing.destroy();
        }
    }
    /**
     * An array of nearest waypoints backed by a nearest facilities subscription. Supports GPS data integrity state so that
     * the array will be empty when no GPS position is available. Also supports pausing and resuming automatic updates
     * from the backing nearest facilities subscription.
     */
    class NearestWaypointArray {
        /**
         * Constructor.
         * @param bus The event bus.
         * @param waypointEntryFactory A function which creates nearest waypoint entries for this array.
         * @param isGpsDataFailed Whether GPS data is in a failed state.
         * @param gpsFailClearDelay The delay, in milliseconds, after GPS data enters a failed state before this array is
         * cleared of all waypoints.
         */
        constructor(bus, waypointEntryFactory, isGpsDataFailed, gpsFailClearDelay) {
            this.bus = bus;
            this.waypointEntryFactory = waypointEntryFactory;
            this.isGpsDataFailed = isGpsDataFailed;
            this.gpsFailClearDelay = gpsFailClearDelay;
            this.facWaypointCache = garminsdk.GarminFacilityWaypointCache.getCache(this.bus);
            this.array = msfssdk.ArraySubject.create();
            this.gpsFailDebounceTimer = new msfssdk.DebounceTimer();
            this.isAlive = true;
            this.isInit = false;
            this.isPaused = true;
        }
        /** @inheritdoc */
        get length() {
            return this.array.length;
        }
        /**
         * Initializes this array.
         * @param nearestSubscription The nearest facility subscription that will provide this array's nearest waypoint data.
         * @param paused Whether the array should be paused when initialized.
         * @throws Error if this array has been destroyed.
         */
        init(nearestSubscription, paused = false) {
            if (!this.isAlive) {
                throw new Error('NearestWaypointArray: cannot initialize a dead array');
            }
            if (this.isInit) {
                return;
            }
            this.isInit = true;
            this.isPaused = paused;
            this.nearestSubscription = nearestSubscription;
            // Because the order of the facilities provided by the nearest subscription is not really meaningful, we will
            // not worry about preserving order. This will allow us to optimize array reconciliation during resume operations.
            const nearestFacilitiesSub = this.nearestFacilitiesSub = nearestSubscription.sub((index, type, item) => {
                var _a, _b;
                switch (type) {
                    case msfssdk.SubscribableArrayEventType.Added:
                        if (item !== undefined) {
                            if (Array.isArray(item)) {
                                for (let i = 0; i < item.length; i++) {
                                    this.insertEntryForFacility(item[i]);
                                }
                            }
                            else {
                                this.insertEntryForFacility(item);
                            }
                        }
                        break;
                    case msfssdk.SubscribableArrayEventType.Removed:
                        if (item !== undefined) {
                            if (Array.isArray(item)) {
                                for (let i = 0; i < item.length; i++) {
                                    (_a = this.removeEntryForFacility(item[i])) === null || _a === void 0 ? void 0 : _a.destroy();
                                }
                            }
                            else {
                                (_b = this.removeEntryForFacility(item)) === null || _b === void 0 ? void 0 : _b.destroy();
                            }
                        }
                        break;
                    case msfssdk.SubscribableArrayEventType.Cleared:
                        this.clearArray();
                        break;
                }
            }, false, true);
            this.isGpsDataFailedSub = this.isGpsDataFailed.sub(isFailed => {
                if (isFailed) {
                    nearestFacilitiesSub.pause();
                    if (this.array.length > 0) {
                        this.gpsFailDebounceTimer.schedule(() => {
                            this.clearArray();
                        }, this.gpsFailClearDelay);
                    }
                }
                else {
                    this.gpsFailDebounceTimer.clear();
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    this.reconcileArray(this.nearestSubscription.getArray());
                    nearestFacilitiesSub.resume();
                }
            }, !this.isPaused, this.isPaused);
        }
        /**
         * Resumes this array. Once resumed, this array will automatically update its contents until it is paused or
         * destroyed.
         * @throws Error if this array has been destroyed.
         */
        resume() {
            var _a;
            if (!this.isAlive) {
                throw new Error('NearestWaypointArray: cannot resume a dead array');
            }
            if (!this.isInit || !this.isPaused) {
                return;
            }
            this.isPaused = false;
            (_a = this.isGpsDataFailedSub) === null || _a === void 0 ? void 0 : _a.resume(true);
        }
        /**
         * Pauses this array. Once paused, this array's contents will no longer automatically update until it is resumed.
         * @throws Error if this array has been destroyed.
         */
        pause() {
            var _a, _b;
            if (!this.isAlive) {
                throw new Error('NearestWaypointArray: cannot pause a dead array');
            }
            if (!this.isInit || this.isPaused) {
                return;
            }
            this.isPaused = true;
            (_a = this.isGpsDataFailedSub) === null || _a === void 0 ? void 0 : _a.pause();
            (_b = this.nearestFacilitiesSub) === null || _b === void 0 ? void 0 : _b.pause();
        }
        /** @inheritdoc */
        get(index) {
            return this.array.get(index);
        }
        /** @inheritdoc */
        tryGet(index) {
            return this.array.tryGet(index);
        }
        /** @inheritdoc */
        getArray() {
            return this.array.getArray();
        }
        /** @inheritdoc */
        sub(handler, initialNotify, paused) {
            return this.array.sub(handler, initialNotify, paused);
        }
        /** @inheritdoc */
        unsub(handler) {
            this.array.unsub(handler);
        }
        /**
         * Inserts an entry for a facility into this array. The entry will not be inserted if the facility is already
         * represented in this array.
         * @param facility The facility for which to insert an entry.
         */
        insertEntryForFacility(facility) {
            const index = this.array.getArray().findIndex(entry => entry.waypoint.facility.get().icao === facility.icao);
            if (index < 0) {
                this.array.insert(this.waypointEntryFactory(this.facWaypointCache.get(facility)));
            }
        }
        /**
         * Removes an entry for a facility from this array.
         * @param facility The facility for which to remove an entry.
         * @returns The entry that was removed, or `undefined` if the specified facility is not represented in this array.
         */
        removeEntryForFacility(facility) {
            const index = this.array.getArray().findIndex(entry => entry.waypoint.facility.get().icao === facility.icao);
            if (index < 0) {
                return undefined;
            }
            const removed = this.array.get(index);
            this.array.removeAt(index);
            return removed;
        }
        /**
         * Reconciles this array with the array provided by its nearest facilities subscription.
         * @param facilityArray The array provided by this arrya's nearest facilities subscription.
         */
        reconcileArray(facilityArray) {
            const toInclude = new Map();
            for (let i = 0; i < facilityArray.length; i++) {
                toInclude.set(facilityArray[i].icao, facilityArray[i]);
            }
            for (let i = 0; i < this.array.length; i++) {
                const entry = this.array.get(i);
                const icao = entry.waypoint.facility.get().icao;
                if (toInclude.has(entry.waypoint.facility.get().icao)) {
                    toInclude.delete(icao);
                }
                else {
                    this.array.removeAt(i);
                }
            }
            for (const facility of toInclude.values()) {
                this.array.insert(this.waypointEntryFactory(this.facWaypointCache.get(facility)));
            }
        }
        /**
         * Clears this page's nearest waypoint data item array.
         */
        clearArray() {
            const array = this.array.getArray();
            for (let i = 0; i < array.length; i++) {
                array[i].destroy();
            }
            this.array.clear();
        }
        /**
         * Destroys this array. Once this array is destroyed, it will be emptied and will no longer automatically update
         * its contents and cannot be paused or resumed.
         */
        destroy() {
            var _a, _b;
            this.isAlive = false;
            (_a = this.nearestFacilitiesSub) === null || _a === void 0 ? void 0 : _a.destroy();
            (_b = this.isGpsDataFailedSub) === null || _b === void 0 ? void 0 : _b.destroy();
            this.clearArray();
        }
    }

    /**
     * Simvars related to weight and fuel calculations.
     */
    exports.WeightFuelSimVars = void 0;
    (function (WeightFuelSimVars) {
        WeightFuelSimVars["FobWeight"] = "L:WTG3000_Weight_Fuel_Fob_Weight";
        WeightFuelSimVars["AircraftWeight"] = "L:WTG3000_Weight_Fuel_Aircraft_Weight";
        WeightFuelSimVars["LandingFuel"] = "L:WTG3000_Weight_Fuel_Landing_Fuel";
        WeightFuelSimVars["LandingWeight"] = "L:WTG3000_Weight_Fuel_Landing_Weight";
        WeightFuelSimVars["HoldingFuel"] = "L:WTG3000_Weight_Fuel_Holding_Fuel";
    })(exports.WeightFuelSimVars || (exports.WeightFuelSimVars = {}));
    /**
     * A publisher for weight and fuel data.
     */
    class WeightFuelPublisher extends msfssdk.SimVarPublisher {
        /**
         * Creates an instance of an AntiIcePublisher.
         * @param bus The event bus to use with this instance.
         */
        constructor(bus) {
            super(WeightFuelPublisher.simvars, bus);
        }
    }
    WeightFuelPublisher.simvars = new Map([
        ['weightfuel_fob_weight', { name: exports.WeightFuelSimVars.FobWeight, type: msfssdk.SimVarValueType.Pounds }],
        ['weightfuel_aircraft_weight', { name: exports.WeightFuelSimVars.AircraftWeight, type: msfssdk.SimVarValueType.Pounds }],
        ['weightfuel_landing_fuel', { name: exports.WeightFuelSimVars.LandingFuel, type: msfssdk.SimVarValueType.Pounds }],
        ['weightfuel_landing_weight', { name: exports.WeightFuelSimVars.LandingWeight, type: msfssdk.SimVarValueType.Pounds }],
        ['weightfuel_holding_fuel', { name: exports.WeightFuelSimVars.HoldingFuel, type: msfssdk.SimVarValueType.Pounds }],
    ]);

    /**
     * Types of G3000 radios.
     */
    exports.G3000RadioType = void 0;
    (function (G3000RadioType) {
        G3000RadioType["Nav"] = "Nav";
        G3000RadioType["Com"] = "Com";
        G3000RadioType["Adf"] = "Adf";
        G3000RadioType["Dme"] = "Dme";
    })(exports.G3000RadioType || (exports.G3000RadioType = {}));
    /**
     * COM radio receive/monitor modes.
     */
    exports.ComRadioReceiveMode = void 0;
    (function (ComRadioReceiveMode) {
        /** Only the transmitting radio is set to receive/monitor. */
        ComRadioReceiveMode["TransmitOnly"] = "TransmitOnly";
        /** Both COM1 and COM2 are set to receive/monitor. */
        ComRadioReceiveMode["Both"] = "Both";
    })(exports.ComRadioReceiveMode || (exports.ComRadioReceiveMode = {}));

    /**
     * A utility class for working with G3000 radios.
     */
    class G3000RadioUtils {
        /**
         * Gets the type of a radio.
         * @param radio A radio.
         * @returns The type of the specified radio.
         * @throws Error if `radio` is not a valid radio.
         */
        static getRadioType(radio) {
            switch (radio) {
                case 'NAV1':
                case 'NAV2':
                    return exports.G3000RadioType.Nav;
                case 'COM1':
                case 'COM2':
                case 'COM3':
                    return exports.G3000RadioType.Com;
                case 'ADF1':
                case 'ADF2':
                    return exports.G3000RadioType.Adf;
                case 'DME1':
                case 'DME2':
                    return exports.G3000RadioType.Dme;
                default:
                    throw new Error(`G3000RadioUtils: unrecognized radio type ${radio}`);
            }
        }
        /**
         * Checks if a radio is of a certain type.
         * @param radio The radio to check.
         * @param type The radio type to check.
         * @returns Whether the specified radio is of the specified type.
         * @throws Error if `radio` is not a valid radio.
         */
        static isRadioType(radio, type) {
            return G3000RadioUtils.getRadioType(radio) === type;
        }
        /**
         * Gets the sim radio type of a radio.
         * @param radio A radio.
         * @returns The sim radio type of the specified radio.
         * @throws Error if `radio` is not a valid radio.
         */
        static getSimRadioType(radio) {
            switch (radio) {
                case 'NAV1':
                case 'NAV2':
                    return msfssdk.RadioType.Nav;
                case 'COM1':
                case 'COM2':
                case 'COM3':
                    return msfssdk.RadioType.Com;
                case 'ADF1':
                case 'ADF2':
                    return msfssdk.RadioType.Adf;
                case 'DME1':
                case 'DME2':
                    return msfssdk.RadioType.Nav;
                default:
                    throw new Error(`G3000RadioUtils: unrecognized radio type ${radio}`);
            }
        }
        /**
         * Creates a function which formats radio names.
         * @param adfCount The number of ADF radios supported by the airplane.
         * @param dmeCount The number of DME radios supported by the airplane.
         * @returns A function which formats radio names.
         */
        static radioNameFormatter(adfCount, dmeCount) {
            return (radio) => {
                switch (radio) {
                    case 'ADF1':
                        return adfCount > 1 ? radio : 'ADF';
                    case 'DME1':
                        return dmeCount > 1 ? radio : 'DME';
                    default:
                        return radio;
                }
            };
        }
        /**
         * Sets the transmitting COM radio.
         * @param radio The com radio to set as transmitting.
         * @returns A Promise which is fulfilled when the command to set the transmitting radio has been sent.
         */
        static setComRadioTransmitting(radio) {
            return SimVar.SetSimVarValue('K:PILOT_TRANSMITTER_SET', msfssdk.SimVarValueType.Number, radio === 'COM1' ? 0 : 1);
        }
        /**
         * Sets the receiving state of a COM radio.
         * @param radio The radio to set the receiving state of.
         * @param receive The receiving state to set.
         * @returns A Promise which is fulfilled when the command to set the receiving state has been sent.
         */
        static setComRadioReceiveState(radio, receive) {
            return SimVar.SetSimVarValue(`K:${radio}_RECEIVE_SELECT`, msfssdk.SimVarValueType.Number, receive ? 1 : 0);
        }
        /**
         * Sets a standby radio frequency.
         * @param radio The radio for which to set the frequency.
         * @param frequencyHz The frequency to set, in hertz.
         * @returns A Promise which is fulfilled when the command to set the frequency has been sent.
         */
        static setStandbyRadioFrequency(radio, frequencyHz) {
            switch (radio) {
                case 'NAV1':
                    return SimVar.SetSimVarValue('K:NAV1_STBY_SET_HZ', msfssdk.SimVarValueType.Number, frequencyHz);
                case 'NAV2':
                    return SimVar.SetSimVarValue('K:NAV2_STBY_SET_HZ', msfssdk.SimVarValueType.Number, frequencyHz);
                case 'COM1':
                    return SimVar.SetSimVarValue('K:COM_STBY_RADIO_SET_HZ', msfssdk.SimVarValueType.Number, frequencyHz);
                case 'COM2':
                    return SimVar.SetSimVarValue('K:COM2_STBY_RADIO_SET_HZ', msfssdk.SimVarValueType.Number, frequencyHz);
                case 'COM3':
                    return SimVar.SetSimVarValue('K:COM3_STBY_RADIO_SET_HZ', msfssdk.SimVarValueType.Number, frequencyHz);
                case 'ADF1':
                    return SimVar.SetSimVarValue('K:ADF_STBY_SET', msfssdk.SimVarValueType.Number, Avionics.Utils.make_adf_bcd32(frequencyHz));
                case 'ADF2':
                    return SimVar.SetSimVarValue('K:ADF2_STBY_SET', msfssdk.SimVarValueType.Number, Avionics.Utils.make_adf_bcd32(frequencyHz));
            }
        }
        /**
         * Swaps active and standby radio frequencies.
         * @param radio The radio whose frequencies are to be swapped.
         * @returns A Promise which is fulfilled when the command to swap frequencies has been sent.
         */
        static swapRadioFrequency(radio) {
            return SimVar.SetSimVarValue(`K:${radio}_RADIO_SWAP`, msfssdk.SimVarValueType.Number, 0);
        }
        /**
         * Increments or decrements a radio's volume.
         * @param radio The radio to adjust the volume of.
         * @param dir Whether to increment or decrement the volume.
         * @returns A Promise which is fulfilled when the command to change the volume has been sent.
         */
        static changeRadioVolume(radio, dir) {
            let radioName;
            switch (radio) {
                case 'ADF1':
                    radioName = 'ADF';
                    break;
                case 'DME1':
                    radioName = 'NAV3';
                    break;
                case 'DME2':
                    radioName = 'NAV4';
                    break;
                default:
                    radioName = radio;
            }
            return SimVar.SetSimVarValue(`K:${radioName}_VOLUME_${dir}`, msfssdk.SimVarValueType.Number, 0);
        }
        /**
         * Increments or decrements a radio's frequency.
         * @param radio The radio to adjust the frequency of.
         * @param freqComponent Whether to adjust the MHz (WHOLE) or kHz (FRACT) component of the frequency.
         * @param dir Whether to increment or decrement the frequency.
         * @returns A Promise which is fulfilled when the command to change the frequency has been sent.
         */
        static changeRadioFrequency(radio, freqComponent, dir) {
            if (G3000RadioUtils.isRadioType(radio, exports.G3000RadioType.Adf)) {
                const freq = SimVar.GetSimVarValue(`ADF STANDBY FREQUENCY:${radio === 'ADF1' ? 1 : 2}`, 'hertz');
                if (freqComponent === 'WHOLE') {
                    // The sim will wrap from 1800 -> 100 Hz, but we want the wrap to be 1800 -> 190.
                    if (freq >= 1799e3 && dir === 'INC') {
                        const fractPart = Math.floor((freq % 1000) / 500) * 500;
                        return G3000RadioUtils.setStandbyRadioFrequency(radio, 190e3 + fractPart);
                    }
                    else if (freq <= 191e3 && dir === 'DEC') {
                        const fractPart = Math.floor((freq % 1000) / 500) * 500;
                        return G3000RadioUtils.setStandbyRadioFrequency(radio, 1799e3 + fractPart);
                    }
                    else {
                        return SimVar.SetSimVarValue(`K:${radio}_WHOLE_${dir}`, msfssdk.SimVarValueType.Number, 0);
                    }
                }
                else {
                    // The FRACT/TENTHS INC/DEC key events change frequency by 100 Hz, but we want to change by 500 Hz, so we have
                    // to do it manually.
                    const kHzPart = Math.floor(freq / 1000) * 1000;
                    const newFreq = kHzPart + (Math.floor((freq % 1000) / 500) + 1) % 2 * 500;
                    return G3000RadioUtils.setStandbyRadioFrequency(radio, newFreq);
                }
            }
            else {
                return SimVar.SetSimVarValue(`K:${radio === 'COM1' ? 'COM' : radio}_RADIO_${freqComponent}_${dir}`, msfssdk.SimVarValueType.Number, 0);
            }
        }
    }

    /**
     * An aliased map user setting manager which can switch the true settings from which its aliased settings are sourced.
     * The supported sources are:
     * * Each set of display pane settings.
     */
    class DisplayPanesAliasedUserSettingManager {
        /**
         * Constructor.
         * @param bus The event bus.
         */
        constructor(bus) {
            this.displayPaneManagers = DisplayPaneUtils.ALL_INDEXES.map(index => DisplayPanesUserSettings.getDisplayPaneManager(bus, index));
            this.aliasedManager = new msfssdk.AliasedUserSettingManager(bus, [
                {
                    name: 'displayPaneVisible',
                    defaultValue: true
                },
                {
                    name: 'displayPaneView',
                    defaultValue: exports.DisplayPaneViewKeys.NavigationMap
                },
                {
                    name: 'displayPaneDesignatedView',
                    defaultValue: exports.DisplayPaneViewKeys.NavigationMap
                },
                {
                    name: 'displayPaneDesignatedWeatherView',
                    defaultValue: exports.DisplayPaneViewKeys.WeatherMap
                },
                {
                    name: 'displayPaneController',
                    defaultValue: -1
                },
                {
                    name: 'displayPaneHalfSizeOnly',
                    defaultValue: false
                },
                {
                    name: 'displayPaneMapPointerActive',
                    defaultValue: false
                }
            ]);
        }
        /**
         * Switches the source of this manager's settings to a set of display pane settings.
         * @param index The index of the display pane.
         * @returns Itself.
         */
        useDisplayPaneSettings(index) {
            this.aliasedManager.useAliases(this.displayPaneManagers[index], DisplayPanesAliasedUserSettingManager.EMPTY_MAP);
            return this;
        }
        /** @inheritdoc */
        tryGetSetting(name) {
            return this.aliasedManager.tryGetSetting(name);
        }
        /** @inheritdoc */
        getSetting(name) {
            return this.aliasedManager.getSetting(name);
        }
        /** @inheritdoc */
        whenSettingChanged(name) {
            return this.aliasedManager.whenSettingChanged(name);
        }
        /** @inheritdoc */
        getAllSettings() {
            return this.aliasedManager.getAllSettings();
        }
        /** @inheritdoc */
        mapTo(map) {
            return this.aliasedManager.mapTo(map);
        }
    }
    DisplayPanesAliasedUserSettingManager.EMPTY_MAP = {};

    /**
     * A manager for FMS speed user settings.
     */
    class FmsSpeedUserSettingManager {
        /**
         * Constructor.
         * @param bus The event bus.
         * @param fmsSpeedsConfig Definitions for each aircraft configuration speed limit for which to create
         * a setting.
         */
        constructor(bus, fmsSpeedsConfig) {
            const minIas = fmsSpeedsConfig.generalLimits.minimumIas;
            const maxIas = fmsSpeedsConfig.generalLimits.maximumIas;
            const minMach = fmsSpeedsConfig.generalLimits.minimumMach;
            const maxMach = fmsSpeedsConfig.generalLimits.maximumMach;
            this.configurationSpeedDefinitions = Array.from(fmsSpeedsConfig.configurationSpeeds);
            // Get default climb/cruise/descent schedule values.
            let defaultClimbScheduleIndex = 0;
            let defaultClimbIas = 0.25 * minIas + 0.75 * maxIas;
            let defaultClimbMach = 0.25 * minMach + 0.75 * maxMach;
            let defaultCruiseScheduleIndex = 0;
            let defaultCruiseIas = 0.5 * minIas + 0.5 * maxIas;
            let defaultCruiseMach = 0.1 * minMach + 0.9 * maxMach;
            let defaultDescentScheduleIndex = 0;
            let defaultDescentIas = 0.25 * minIas + 0.75 * maxIas;
            let defaultDescentMach = 0.25 * minMach + 0.75 * maxMach;
            let defaultDescentFpa = -3;
            this.climbSchedules = [
                { type: 'climb', name: '', ias: defaultClimbIas, mach: defaultClimbMach, isDefault: false },
                ...fmsSpeedsConfig.climbSchedules,
                { type: 'climb', name: 'Pilot-Defined Climb', ias: 0, mach: 0, isDefault: false }
            ];
            this.cruiseSchedules = [
                { type: 'cruise', name: '', ias: defaultCruiseIas, mach: defaultCruiseMach, isDefault: false },
                ...fmsSpeedsConfig.cruiseSchedules,
                { type: 'cruise', name: 'Pilot-Defined Cruise', ias: 0, mach: 0, isDefault: false }
            ];
            this.descentSchedules = [
                { type: 'descent', name: '', ias: defaultDescentIas, mach: defaultDescentMach, fpa: -3, isDefault: false },
                ...fmsSpeedsConfig.descentSchedules,
                { type: 'descent', name: 'Pilot-Defined Descent', ias: 0, mach: 0, fpa: 0, isDefault: false }
            ];
            defaultClimbScheduleIndex = this.climbSchedules.findIndex(schedule => schedule.isDefault);
            if (defaultClimbScheduleIndex >= 0) {
                const defaultClimbSchedule = this.climbSchedules[defaultClimbScheduleIndex];
                defaultClimbIas = defaultClimbSchedule.ias;
                defaultClimbMach = defaultClimbSchedule.mach;
            }
            defaultCruiseScheduleIndex = this.cruiseSchedules.findIndex(schedule => schedule.isDefault);
            if (defaultCruiseScheduleIndex >= 0) {
                const defaultCruiseSchedule = this.cruiseSchedules[defaultCruiseScheduleIndex];
                defaultCruiseIas = defaultCruiseSchedule.ias;
                defaultCruiseMach = defaultCruiseSchedule.mach;
            }
            defaultDescentScheduleIndex = this.descentSchedules.findIndex(schedule => schedule.isDefault);
            if (defaultDescentScheduleIndex >= 0) {
                const defaultDescentSchedule = this.descentSchedules[defaultDescentScheduleIndex];
                defaultDescentIas = defaultDescentSchedule.ias;
                defaultDescentMach = defaultDescentSchedule.mach;
                defaultDescentFpa = defaultDescentSchedule.fpa;
            }
            // Init setting definitions.
            const settingDefs = [
                // ---- Configuration limits ----
                ...this.configurationSpeedDefinitions.map((def, index) => {
                    return {
                        name: `fmsSpeedConfigurationLimit_${index}`,
                        defaultValue: def.defaultValue
                    };
                }),
                // ---- Climb schedule ----
                {
                    name: 'fmsSpeedClimbScheduleIndex',
                    defaultValue: defaultClimbScheduleIndex
                },
                {
                    name: 'fmsSpeedClimbIas',
                    defaultValue: defaultClimbIas
                },
                {
                    name: 'fmsSpeedClimbMach',
                    defaultValue: defaultClimbMach
                },
                {
                    name: 'fmsSpeedPilotClimbIas',
                    defaultValue: defaultClimbIas
                },
                {
                    name: 'fmsSpeedPilotClimbMach',
                    defaultValue: defaultClimbMach
                },
                // ---- Cruise schedule ---
                {
                    name: 'fmsSpeedCruiseScheduleIndex',
                    defaultValue: defaultClimbScheduleIndex
                },
                {
                    name: 'fmsSpeedCruiseIas',
                    defaultValue: defaultCruiseIas
                },
                {
                    name: 'fmsSpeedCruiseMach',
                    defaultValue: defaultCruiseMach
                },
                {
                    name: 'fmsSpeedPilotCruiseIas',
                    defaultValue: defaultCruiseIas
                },
                {
                    name: 'fmsSpeedPilotCruiseMach',
                    defaultValue: defaultCruiseMach
                },
                // ---- Descent schedule ---
                {
                    name: 'fmsSpeedDescentScheduleIndex',
                    defaultValue: defaultClimbScheduleIndex
                },
                {
                    name: 'fmsSpeedDescentIas',
                    defaultValue: defaultDescentIas
                },
                {
                    name: 'fmsSpeedDescentMach',
                    defaultValue: defaultDescentMach
                },
                {
                    name: 'fmsSpeedDescentFpa',
                    defaultValue: defaultDescentFpa
                },
                {
                    name: 'fmsSpeedPilotDescentIas',
                    defaultValue: defaultDescentIas
                },
                {
                    name: 'fmsSpeedPilotDescentMach',
                    defaultValue: defaultDescentMach
                },
                {
                    name: 'fmsSpeedPilotDescentFpa',
                    defaultValue: defaultDescentFpa
                },
                // ---- Altitude speed limits ---
                {
                    name: 'fmsSpeedClimbAltitudeCeiling',
                    defaultValue: 10000
                },
                {
                    name: 'fmsSpeedClimbAltitudeLimit',
                    defaultValue: msfssdk.MathUtils.clamp(250, minIas, maxIas)
                },
                {
                    name: 'fmsSpeedDescentAltitudeCeiling',
                    defaultValue: 10000
                },
                {
                    name: 'fmsSpeedDescentAltitudeLimit',
                    defaultValue: msfssdk.MathUtils.clamp(250, minIas, maxIas)
                },
                // ---- Terminal area speed limits ---
                {
                    name: 'fmsSpeedDepartureCeiling',
                    defaultValue: 2500
                },
                {
                    name: 'fmsSpeedDepartureRadius',
                    defaultValue: 4
                },
                {
                    name: 'fmsSpeedDepartureLimit',
                    defaultValue: msfssdk.MathUtils.clamp(200, minIas, maxIas)
                },
                {
                    name: 'fmsSpeedArrivalCeiling',
                    defaultValue: 3000
                },
                {
                    name: 'fmsSpeedArrivalRadius',
                    defaultValue: 10
                },
                {
                    name: 'fmsSpeedArrivalLimit',
                    defaultValue: msfssdk.MathUtils.clamp(200, minIas, maxIas)
                },
                // ---- User speed override ---
                {
                    name: 'fmsSpeedUserTargetIas',
                    defaultValue: -1
                },
                {
                    name: 'fmsSpeedUserTargetMach',
                    defaultValue: -1
                },
                {
                    name: 'fmsSpeedUserTargetIsMach',
                    defaultValue: false
                }
            ];
            this.manager = new msfssdk.DefaultUserSettingManager(bus, settingDefs);
        }
        /** @inheritdoc */
        tryGetSetting(name) {
            return this.manager.tryGetSetting(name);
        }
        /** @inheritdoc */
        getSetting(name) {
            return this.manager.getSetting(name);
        }
        /** @inheritdoc */
        whenSettingChanged(name) {
            return this.manager.whenSettingChanged(name);
        }
        /** @inheritdoc */
        getAllSettings() {
            return this.manager.getAllSettings();
        }
        /** @inheritdoc */
        mapTo(map) {
            return this.manager.mapTo(map);
        }
    }

    /**
     * Utility class for retrieving G3000 COM radio user settings managers.
     */
    class G3000ComRadioUserSettings {
        /**
         * Retrieves a manager for G3000 COM radio settings.
         * @param bus The event bus.
         * @returns A manager for G3000 COM radio settings.
         */
        static getManager(bus) {
            var _a;
            return (_a = G3000ComRadioUserSettings.INSTANCE) !== null && _a !== void 0 ? _a : (G3000ComRadioUserSettings.INSTANCE = new msfssdk.DefaultUserSettingManager(bus, [
                {
                    name: 'comRadioSpacing',
                    defaultValue: garminsdk.ComRadioSpacingSettingMode.Spacing25Khz
                },
                {
                    name: 'comRadioTransmit',
                    defaultValue: 'COM1',
                },
                {
                    name: 'comRadio1ReceiveMode',
                    defaultValue: exports.ComRadioReceiveMode.TransmitOnly,
                },
                {
                    name: 'comRadio2ReceiveMode',
                    defaultValue: exports.ComRadioReceiveMode.TransmitOnly,
                }
            ]));
        }
    }

    /**
     * Types of map user setting sync.
     */
    exports.MapSettingSync = void 0;
    (function (MapSettingSync) {
        /** No synchronization. */
        MapSettingSync["None"] = "None";
        /** Synchronizes onside display panes. */
        MapSettingSync["Onside"] = "Onside";
        /** Synchronizes all display panes. */
        MapSettingSync["All"] = "All";
    })(exports.MapSettingSync || (exports.MapSettingSync = {}));
    /**
     * Utility class for retrieving G3000 synced map user setting managers.
     */
    class MapSettingSyncUserSettings {
        /**
         * Retrieves a manager for map setting sync user settings.
         * @param bus The event bus.
         * @returns A manager for map setting sync user settings.
         */
        static getManager(bus) {
            var _a;
            return (_a = MapSettingSyncUserSettings.instance) !== null && _a !== void 0 ? _a : (MapSettingSyncUserSettings.instance = new msfssdk.DefaultUserSettingManager(bus, [
                {
                    name: 'mapUserSettingSyncLeft',
                    defaultValue: exports.MapSettingSync.None
                },
                {
                    name: 'mapUserSettingSyncRight',
                    defaultValue: exports.MapSettingSync.None
                }
            ]));
        }
    }

    /**
     * Utility class for retrieving MFD navigation data bar user setting managers.
     */
    class MfdNavDataBarUserSettings {
        /**
         * Retrieves a manager for MFD navigation data bar user settings.
         * @param bus The event bus.
         * @returns a manager for MFD navigation data bar user settings.
         */
        static getManager(bus) {
            var _a;
            return (_a = MfdNavDataBarUserSettings.INSTANCE) !== null && _a !== void 0 ? _a : (MfdNavDataBarUserSettings.INSTANCE = garminsdk.NavDataBarUserSettings.createManager(bus, [
                garminsdk.NavDataFieldType.GroundSpeed,
                garminsdk.NavDataFieldType.DesiredTrack,
                garminsdk.NavDataFieldType.GroundTrack,
                garminsdk.NavDataFieldType.TimeToWaypoint,
                garminsdk.NavDataFieldType.BearingToWaypoint,
                garminsdk.NavDataFieldType.DistanceToWaypoint,
                garminsdk.NavDataFieldType.TimeOfWaypointArrival,
                garminsdk.NavDataFieldType.TimeOfDestinationArrival
            ]));
        }
    }

    /** Weight and Fuel user settings. */
    /** Utility class for retrieving weight and fuel user settings managers. */
    class WeightFuelUserSettings extends msfssdk.DefaultUserSettingManager {
        /**
         * Gets an instance of the weight and fuel user settings manager.
         * @param bus The event bus.
         * @returns An instance of the weight and fuel user settings manager.
         */
        static getManager(bus) {
            var _a;
            return (_a = WeightFuelUserSettings.INSTANCE) !== null && _a !== void 0 ? _a : (WeightFuelUserSettings.INSTANCE = new WeightFuelUserSettings(bus, [
                {
                    name: 'weightFuelBasicEmpty',
                    defaultValue: -1,
                },
                {
                    name: 'weightFuelCrewStores',
                    defaultValue: 0,
                },
                {
                    name: 'weightFuelNumberPax',
                    defaultValue: 0,
                },
                {
                    name: 'weightFuelAvgPax',
                    defaultValue: 0,
                },
                {
                    name: 'weightFuelCargo',
                    defaultValue: 0,
                },
                {
                    name: 'weightFuelInitialFob',
                    defaultValue: -1,
                },
                {
                    name: 'weightFuelReserves',
                    defaultValue: 0,
                },
                {
                    name: 'weightFuelEstHoldingTime',
                    defaultValue: 0,
                },
                {
                    name: 'weightFuelBasicOperating',
                    defaultValue: 0,
                },
                {
                    name: 'weightFuelTotalPassenger',
                    defaultValue: 0,
                },
                {
                    name: 'weightFuelZeroFuel',
                    defaultValue: 0,
                }
            ]));
        }
    }

    /**
     * Utility class for retrieving and working with TOLD (takeoff/landing) performance calculation user settings managers.
     */
    class ToldUserSettings extends msfssdk.DefaultUserSettingManager {
        /**
         * Gets an instance of the TOLD (takeoff/landing) performance calculation user settings manager.
         * @param bus The event bus.
         * @returns An instance of the TOLD (takeoff/landing) performance calculation user settings manager.
         */
        static getManager(bus) {
            var _a;
            return (_a = ToldUserSettings.INSTANCE) !== null && _a !== void 0 ? _a : (ToldUserSettings.INSTANCE = new ToldUserSettings(bus, [
                {
                    name: 'toldDatabaseVersion',
                    defaultValue: ''
                },
                {
                    name: 'toldEnabled',
                    defaultValue: false
                },
                // ---- Takeoff ----
                {
                    name: 'toldOriginIcao',
                    defaultValue: ''
                },
                {
                    name: 'toldTakeoffWeight',
                    defaultValue: -1
                },
                {
                    name: 'toldTakeoffRunwaySurface',
                    defaultValue: exports.ToldRunwaySurfaceCondition.Dry
                },
                {
                    name: 'toldTakeoffWindDirection',
                    defaultValue: -1
                },
                {
                    name: 'toldTakeoffWindSpeed',
                    defaultValue: -1
                },
                {
                    name: 'toldTakeoffTemperature',
                    defaultValue: Number.MIN_SAFE_INTEGER
                },
                {
                    name: 'toldTakeoffCanUseRat',
                    defaultValue: false
                },
                {
                    name: 'toldTakeoffUseRat',
                    defaultValue: false
                },
                {
                    name: 'toldTakeoffPressure',
                    defaultValue: -1
                },
                {
                    name: 'toldTakeoffRunwayLength',
                    defaultValue: -1
                },
                {
                    name: 'toldTakeoffRunwayElevation',
                    defaultValue: Number.MIN_SAFE_INTEGER
                },
                {
                    name: 'toldTakeoffRunwayHeading',
                    defaultValue: -1
                },
                {
                    name: 'toldTakeoffRunwayGradient',
                    defaultValue: Number.MIN_SAFE_INTEGER
                },
                {
                    name: 'toldTakeoffPressureAltitude',
                    defaultValue: 0
                },
                {
                    name: 'toldTakeoffFlapsIndex',
                    defaultValue: 0
                },
                {
                    name: 'toldTakeoffFlapsIndexDefault',
                    defaultValue: -1
                },
                {
                    name: 'toldTakeoffAntiIceOn',
                    defaultValue: false
                },
                {
                    name: 'toldTakeoffThrustReversers',
                    defaultValue: false
                },
                {
                    name: 'toldTakeoffFactor',
                    defaultValue: 100
                },
                {
                    name: 'toldTakeoffRolling',
                    defaultValue: false
                },
                {
                    name: 'toldTakeoffRollingDefault',
                    defaultValue: -1
                },
                {
                    name: 'toldTakeoffCalcResult',
                    defaultValue: ''
                },
                {
                    name: 'toldTakeoffVSpeedsAccepted',
                    defaultValue: false
                },
                // ---- Landing ----
                {
                    name: 'toldDestinationDefaultApplied',
                    defaultValue: false
                },
                {
                    name: 'toldDestinationIcao',
                    defaultValue: ''
                },
                {
                    name: 'toldLandingCanUsePredictedWeight',
                    defaultValue: false
                },
                {
                    name: 'toldLandingUsePredictedWeight',
                    defaultValue: false
                },
                {
                    name: 'toldLandingWeight',
                    defaultValue: -1
                },
                {
                    name: 'toldLandingRunwaySurface',
                    defaultValue: exports.ToldRunwaySurfaceCondition.Dry
                },
                {
                    name: 'toldLandingWindDirection',
                    defaultValue: -1
                },
                {
                    name: 'toldLandingWindSpeed',
                    defaultValue: -1
                },
                {
                    name: 'toldLandingTemperature',
                    defaultValue: Number.MIN_SAFE_INTEGER
                },
                {
                    name: 'toldLandingPressure',
                    defaultValue: -1
                },
                {
                    name: 'toldLandingRunwayLength',
                    defaultValue: -1
                },
                {
                    name: 'toldLandingRunwayElevation',
                    defaultValue: Number.MIN_SAFE_INTEGER
                },
                {
                    name: 'toldLandingRunwayHeading',
                    defaultValue: -1
                },
                {
                    name: 'toldLandingRunwayGradient',
                    defaultValue: Number.MIN_SAFE_INTEGER
                },
                {
                    name: 'toldLandingPressureAltitude',
                    defaultValue: 0
                },
                {
                    name: 'toldLandingFlapsIndex',
                    defaultValue: 0
                },
                {
                    name: 'toldLandingFlapsIndexDefault',
                    defaultValue: -1
                },
                {
                    name: 'toldLandingAntiIceOn',
                    defaultValue: false
                },
                {
                    name: 'toldLandingThrustReversers',
                    defaultValue: false
                },
                {
                    name: 'toldLandingFactor',
                    defaultValue: 100
                },
                {
                    name: 'toldLandingFactorDefault',
                    defaultValue: -1
                },
                {
                    name: 'toldLandingAutothrottleOn',
                    defaultValue: false
                },
                {
                    name: 'toldLandingCalcResult',
                    defaultValue: ''
                },
                {
                    name: 'toldLandingVSpeedsAccepted',
                    defaultValue: false
                }
            ]));
        }
        /**
         * Parses a takeoff performance result object from a string.
         * @param resultString The stringified result object.
         * @returns The takeoff performance result object parsed from the specified string, or `undefined` if the string
         * does not define such an object.
         */
        static parseTakeoffResultString(resultString) {
            if (resultString === '') {
                return undefined;
            }
            try {
                const result = JSON.parse(resultString);
                if (typeof result !== 'object') {
                    return undefined;
                }
                if (typeof result.runwayLengthAvailable === 'number'
                    && typeof result.runwayLengthRequired === 'number'
                    && typeof result.maxRunwayWeight === 'number'
                    && typeof result.maxWeight === 'number'
                    && typeof result.limitsExceeded === 'number'
                    && Array.isArray(result.vSpeeds)
                    && result.vSpeeds.every(el => typeof el === 'object' && typeof el.name === 'string' && typeof el.value === 'number')) {
                    return result;
                }
            }
            catch (_a) {
                // noop
            }
            return undefined;
        }
        /**
         * Parses a landing performance result object from a string.
         * @param resultString The stringified result object.
         * @returns The landing performance result object parsed from the specified string, or `undefined` if the string
         * does not define such an object.
         */
        static parseLandingResultString(resultString) {
            if (resultString === '') {
                return undefined;
            }
            try {
                const result = JSON.parse(resultString);
                if (typeof result !== 'object') {
                    return undefined;
                }
                if (typeof result.runwayLengthAvailable === 'number'
                    && typeof result.runwayLengthRequiredRef === 'number'
                    && typeof result.maxRunwayWeight === 'number'
                    && typeof result.maxWeight === 'number'
                    && typeof result.limitsExceeded === 'number'
                    && Array.isArray(result.vSpeeds)
                    && result.vSpeeds.every(el => typeof el === 'object' && typeof el.name === 'string' && typeof el.value === 'number')) {
                    return result;
                }
            }
            catch (_a) {
                // noop
            }
            return undefined;
        }
    }

    /**
     * A manager for G3000 user settings that are saved and persistent across flight sessions.
     */
    class G3000UserSettingSaveManager extends msfssdk.UserSettingSaveManager {
        /**
         * Constructor.
         * @param bus The event bus.
         * @param pluginSettings Additional settings to manage defined by plugins.
         * @param fmsSpeedSettingManager A setting manager for FMS speed user settings, or `undefined` if FMS speed is not
         * supported.
         * @param supportTold Whether takeoff/landing performance (TOLD) calculations are supported.
         */
        constructor(bus, pluginSettings, fmsSpeedSettingManager, supportTold) {
            var _a;
            super([
                ...PfdUserSettings.getMasterManager(bus).getAllSettings().filter(setting => {
                    return G3000UserSettingSaveManager.PFD_SETTINGS.some(value => setting.definition.name.startsWith(value));
                }),
                ...MapUserSettings.getMasterManager(bus).getAllSettings(),
                ...MapSettingSyncUserSettings.getManager(bus).getAllSettings(),
                ...WeatherMapUserSettings.getMasterManager(bus).getAllSettings(),
                ...ConnextMapUserSettings.getMasterManager(bus).getAllSettings(),
                ...garminsdk.TrafficUserSettings.getManager(bus).getAllSettings().filter(setting => {
                    return msfssdk.ArrayUtils.includes(G3000UserSettingSaveManager.TRAFFIC_SETTINGS, setting.definition.name);
                }),
                ...MfdNavDataBarUserSettings.getManager(bus).getAllSettings(),
                ...garminsdk.DateTimeUserSettings.getManager(bus).getAllSettings(),
                ...garminsdk.NearestAirportUserSettings.getManager(bus).getAllSettings(),
                ...garminsdk.UnitsUserSettings.getManager(bus).getAllSettings(),
                ...WeightFuelUserSettings.getManager(bus).getAllSettings().filter(setting => {
                    return msfssdk.ArrayUtils.includes(G3000UserSettingSaveManager.WEIGHT_FUEL_SETTINGS, setting.definition.name);
                }),
                ...DisplayPanesUserSettings.getMasterManager(bus).getAllSettings().filter(setting => {
                    return msfssdk.ArrayUtils.includes(G3000UserSettingSaveManager.DISPLAY_PANE_SETTINGS, setting.definition.name);
                }),
                ...((_a = fmsSpeedSettingManager === null || fmsSpeedSettingManager === void 0 ? void 0 : fmsSpeedSettingManager.getAllSettings().filter(setting => {
                    return !msfssdk.ArrayUtils.includes(G3000UserSettingSaveManager.FMS_SPEED_EXCLUDE_SETTINGS, setting.definition.name);
                })) !== null && _a !== void 0 ? _a : []),
                ...(supportTold
                    ? ToldUserSettings.getManager(bus).getAllSettings().filter(setting => {
                        return msfssdk.ArrayUtils.includes(G3000UserSettingSaveManager.TOLD_SETTINGS, setting.definition.name);
                    })
                    : []),
                ...pluginSettings
            ], bus);
        }
    }
    G3000UserSettingSaveManager.PFD_SETTINGS = [
        'aoaDisplayMode',
        'windDisplayMode',
        'pfdMapLayout',
        'altMetric',
        'altimeterBaroMetric',
        'svtEnabled',
        'svtDisabledFpmShow',
        'svtHeadingLabelShow',
        //added by marwan for persistance 
        'pfdBearingPointer2Source_1',
        'pfdBearingPointer2Source_2',
        'pfdBearingPointer1Source_1',
        'pfdBearingPointer1Source_2',
        /////////

        // ---- The following settings are not currently used. ----
        // 'svtAirportSignShow',
        // 'svtPathwaysShow',
        // 'svtTrafficShow'
    ];
    G3000UserSettingSaveManager.TRAFFIC_SETTINGS = [
        'trafficAltitudeMode',
        'trafficAltitudeRelative',
        'trafficMotionVectorMode',
        'trafficMotionVectorLookahead'
    ];
    G3000UserSettingSaveManager.WEIGHT_FUEL_SETTINGS = [
        'weightFuelBasicEmpty',
        'weightFuelCrewStores',
        'weightFuelNumberPax',
        'weightFuelAvgPax',
        'weightFuelReserves',
        'weightFuelEstHoldingTime'
    ];
    G3000UserSettingSaveManager.DISPLAY_PANE_SETTINGS = [
        `displayPaneVisible_${exports.DisplayPaneIndex.LeftPfd}`,
        `displayPaneVisible_${exports.DisplayPaneIndex.RightPfd}`
        //added by marwan for persistance 
        , 'displayPaneView_1'
        , 'displayPaneView_2'
        , 'displayPaneView_3'
        , 'displayPaneView_4'
    ];
    G3000UserSettingSaveManager.FMS_SPEED_EXCLUDE_SETTINGS = [
        'fmsSpeedUserTargetIas',
        'fmsSpeedUserTargetMach',
        'fmsSpeedUserTargetIsMach'
    ];
    G3000UserSettingSaveManager.TOLD_SETTINGS = [
        'toldTakeoffFlapsIndexDefault',
        'toldTakeoffRollingDefault',
        'toldLandingFlapsIndexDefault',
        'toldLandingFactorDefault'
    ];

    /**
     * A manager for IAU user settings.
     */
    class IauUserSettingManager {
        /**
         * Constructor.
         * @param bus The event bus.
         * @param iauDefsConfig A configuration object which defines IAU options.
         */
        constructor(bus, iauDefsConfig) {
            this.aliasedManagers = [];
            const settingDefs = [];
            this.iauCount = iauDefsConfig.count;
            for (let i = 1; i <= iauDefsConfig.count; i++) {
                const def = iauDefsConfig.definitions[i];
                settingDefs.push({
                    name: `iauAdcIndex_${i}`,
                    defaultValue: def.defaultAdcIndex
                }, {
                    name: `iauAhrsIndex_${i}`,
                    defaultValue: def.defaultAhrsIndex
                });
            }
            this.manager = new msfssdk.DefaultUserSettingManager(bus, settingDefs);
            for (let i = 1; i <= iauDefsConfig.count; i++) {
                this.aliasedManagers[i] = this.manager.mapTo(IauUserSettingManager.getAliasMap(i));
            }
        }
        /** @inheritdoc */
        tryGetSetting(name) {
            return this.manager.tryGetSetting(name);
        }
        /** @inheritdoc */
        getSetting(name) {
            return this.manager.getSetting(name);
        }
        /** @inheritdoc */
        whenSettingChanged(name) {
            return this.manager.whenSettingChanged(name);
        }
        /** @inheritdoc */
        getAllSettings() {
            return this.manager.getAllSettings();
        }
        /** @inheritdoc */
        mapTo(map) {
            return this.manager.mapTo(map);
        }
        /**
         * Gets a manager for aliased IAU user settings for an indexed IAU.
         * @param index The index of the IAU for which to get an aliased setting manager.
         * @returns A manager for aliased IAU user settings for the specified IAU.
         * @throws RangeError if `index` is less than 1 or greater than the number of IAUs supported by this manager.
         */
        getAliasedManager(index) {
            if (index < 1 || index > this.iauCount) {
                throw new RangeError();
            }
            return this.aliasedManagers[index];
        }
        /**
         * Gets a setting name alias mapping for an IAU.
         * @param index The index of the IAU.
         * @returns A setting name alias mapping for the specified IAU.
         */
        static getAliasMap(index) {
            const map = {};
            for (const name of IauUserSettingManager.INDEXED_SETTING_NAMES) {
                map[name] = `${name}_${index}`;
            }
            return map;
        }
    }
    IauUserSettingManager.INDEXED_SETTING_NAMES = [
        'iauAdcIndex',
        'iauAhrsIndex'
    ];

    /**
     * An aliased map user setting manager which can switch the true settings from which its aliased settings are sourced.
     * The supported sources are:
     * * Each set of display pane map settings.
     * * Each set of PFD map settings.
     */
    class MapAliasedUserSettingManager {
        /**
         * Constructor.
         * @param bus The event bus.
         */
        constructor(bus) {
            this.displayPaneManagers = {
                [exports.DisplayPaneIndex.LeftPfd]: MapUserSettings.getDisplayPaneManager(bus, exports.DisplayPaneIndex.LeftPfd),
                [exports.DisplayPaneIndex.LeftMfd]: MapUserSettings.getDisplayPaneManager(bus, exports.DisplayPaneIndex.LeftMfd),
                [exports.DisplayPaneIndex.RightMfd]: MapUserSettings.getDisplayPaneManager(bus, exports.DisplayPaneIndex.RightMfd),
                [exports.DisplayPaneIndex.RightPfd]: MapUserSettings.getDisplayPaneManager(bus, exports.DisplayPaneIndex.RightPfd),
            };
            this.pfdManagers = {
                [1]: MapUserSettings.getPfdManager(bus, 1),
                [2]: MapUserSettings.getPfdManager(bus, 2)
            };
            this.aliasedManager = new msfssdk.AliasedUserSettingManager(bus, MapUserSettings.getAliasedSettingDefs());
        }
        /**
         * Switches the source of this manager's settings to a set of display pane map settings.
         * @param index The index of the display pane.
         */
        useDisplayPaneSettings(index) {
            this.aliasedManager.useAliases(this.displayPaneManagers[index], MapAliasedUserSettingManager.EMPTY_MAP);
        }
        /**
         * Switches the source of this manager's settings to a set of PFD map settings.
         * @param index The index of the PFD.
         */
        usePfdSettings(index) {
            this.aliasedManager.useAliases(this.pfdManagers[index], MapAliasedUserSettingManager.EMPTY_MAP);
        }
        /** @inheritdoc */
        tryGetSetting(name) {
            return this.aliasedManager.tryGetSetting(name);
        }
        /** @inheritdoc */
        getSetting(name) {
            return this.aliasedManager.getSetting(name);
        }
        /** @inheritdoc */
        whenSettingChanged(name) {
            return this.aliasedManager.whenSettingChanged(name);
        }
        /** @inheritdoc */
        getAllSettings() {
            return this.aliasedManager.getAllSettings();
        }
        /** @inheritdoc */
        mapTo(map) {
            return this.aliasedManager.mapTo(map);
        }
    }
    MapAliasedUserSettingManager.EMPTY_MAP = {};

    /**
     * Utility class for retrieving NAV radio audio monitoring user setting managers.
     */
    class NavRadioMonitorUserSettings {
        /**
         * Retrieves a manager for NAV radio audio monitoring user settings.
         * @param bus The event bus.
         * @returns A manager for NAV radio audio monitoring user settings.
         */
        static getManager(bus) {
            var _a;
            return (_a = NavRadioMonitorUserSettings.INSTANCE) !== null && _a !== void 0 ? _a : (NavRadioMonitorUserSettings.INSTANCE = new msfssdk.DefaultUserSettingManager(bus, [
                {
                    name: 'navRadioMonitorSelected1',
                    defaultValue: false
                },
                {
                    name: 'navRadioMonitorIdentEnabled1',
                    defaultValue: false
                },
                {
                    name: 'navRadioMonitorSelected2',
                    defaultValue: false
                },
                {
                    name: 'navRadioMonitorIdentEnabled2',
                    defaultValue: false
                }
            ]));
        }
    }

    /**
     * A manager for reference V-speed user settings.
     */
    class VSpeedUserSettingManager {
        /**
         * Constructor.
         * @param bus The event bus.
         * @param vSpeedGroups Definitions for each reference V-speed for which to create settings, organized into groups.
         */
        constructor(bus, vSpeedGroups) {
            const groupsCopy = new Map();
            const settingDefs = [];
            for (const group of vSpeedGroups.values()) {
                switch (group.type) {
                    case exports.VSpeedGroupType.Takeoff:
                        groupsCopy.set(group.type, {
                            type: group.type,
                            vSpeedDefinitions: Array.from(group.vSpeedDefinitions),
                            maxIas: group.maxIas
                        });
                        break;
                    case exports.VSpeedGroupType.Configuration:
                        groupsCopy.set(group.type, {
                            type: group.type,
                            vSpeedDefinitions: Array.from(group.vSpeedDefinitions),
                            maxAltitude: group.maxAltitude
                        });
                        break;
                    default:
                        groupsCopy.set(group.type, {
                            type: group.type,
                            vSpeedDefinitions: Array.from(group.vSpeedDefinitions)
                        });
                }
                for (const vSpeed of group.vSpeedDefinitions) {
                    settingDefs.push({
                        name: `vSpeedShow_${vSpeed.name}`,
                        defaultValue: false
                    }, {
                        name: `vSpeedDefaultValue_${vSpeed.name}`,
                        defaultValue: vSpeed.defaultValue
                    }, {
                        name: `vSpeedUserValue_${vSpeed.name}`,
                        defaultValue: -1
                    }, {
                        name: `vSpeedFmsValue_${vSpeed.name}`,
                        defaultValue: -1
                    }, {
                        name: `vSpeedFmsConfigMiscompare_${vSpeed.name}`,
                        defaultValue: false
                    });
                }
            }
            this.vSpeedGroups = groupsCopy;
            this.manager = new msfssdk.DefaultUserSettingManager(bus, settingDefs);
        }
        /** @inheritdoc */
        tryGetSetting(name) {
            return this.manager.tryGetSetting(name);
        }
        /** @inheritdoc */
        getSetting(name) {
            return this.manager.getSetting(name);
        }
        /** @inheritdoc */
        whenSettingChanged(name) {
            return this.manager.whenSettingChanged(name);
        }
        /** @inheritdoc */
        getAllSettings() {
            return this.manager.getAllSettings();
        }
        /** @inheritdoc */
        mapTo(map) {
            return this.manager.mapTo(map);
        }
    }

    /**
     * Utility class for creating softkey H event mapping functions.
     */
    class SoftKeyHEventMap {
        /**
         * Creates a function which maps H events to softkey indexes for a PFD instrument. The function returns the index
         * of the softkey that was pressed for softkey press H events, and `undefined` for all other H events.
         * @param prefix The prefix of softkey press H events for the softkey bar's parent PFD instrument.
         * @param side The side on which the softkey bar is placed on the PFD in split mode.
         * @param isInSplitMode Whether the softkey bar's parent PFD is in split mode.
         * @returns A function which maps H events to softkey indexes for a PFD instrument.
         */
        static create(prefix, side, isInSplitMode) {
            const fullPrefix = `${prefix}_SOFTKEYS_`;
            const splitModeMin = side === 'left' ? 0 : 5;
            return (hEvent) => {
                if (hEvent.startsWith(fullPrefix)) {
                    const rawIndex = Number(hEvent.substring(fullPrefix.length)) - 1;
                    if (!isNaN(rawIndex)) {
                        let min, max;
                        if (isInSplitMode.get()) {
                            min = splitModeMin;
                            max = min + SoftKeyHEventMap.SPLIT_MODE_SOFTKEY_COUNT;
                        }
                        else {
                            min = 0;
                            max = garminsdk.SoftKeyMenu.SOFTKEY_COUNT;
                        }
                        if (rawIndex >= min && rawIndex < max) {
                            return rawIndex - min;
                        }
                    }
                }
                return undefined;
            };
        }
    }
    SoftKeyHEventMap.SPLIT_MODE_SOFTKEY_COUNT = 7;

    /** A set of functions for modifying a flight plan in the simplest way possible. */
    class TestingUtils {
        /**
         * Sets the origin for the flight plan.
         * @param fms The FMS.
         * @param ident The ICAO to set, like 'KDEN'.
         * @returns The origin facility.
         */
        static async setOrigin(fms, ident) {
            const originResults = await fms.facLoader.searchByIdent(msfssdk.FacilitySearchType.Airport, ident, 1);
            if (originResults && originResults.length === 1) {
                const origin = await fms.facLoader.getFacility(msfssdk.FacilityType.Airport, originResults[0]);
                if (origin) {
                    fms.setOrigin(origin);
                    return origin;
                }
            }
            throw new Error('error setting origin');
        }
        /**
         * Sets the origin for the flight plan.
         * @param fms The FMS.
         * @param origin The origin facility. Get this by calling setOrigin first.
         * @param runwayName The runway to set, like '34L'.
         * @returns The runway.
         * @throws Error if runway couldn't be found with given inputs.
         */
        static setOriginRunway(fms, origin, runwayName) {
            const runwayNumber = parseInt(runwayName.replace(/[A-Za-z]*/g, ''));
            const runwayDesignationLetter = runwayName.replace(/\d*/g, '');
            const runwayDesignationNumber = runwayDesignationLetter === 'L' ? 1 : runwayDesignationLetter === 'R' ? 2 : 0;
            const runwayNameString = msfssdk.RunwayUtils.getRunwayNameString(runwayNumber, runwayDesignationNumber);
            const runway = msfssdk.RunwayUtils.matchOneWayRunwayFromDesignation(origin, runwayNameString);
            if (runway) {
                fms.setOrigin(origin, runway);
                return runway;
            }
            else {
                throw new Error('error setting runway');
            }
        }
        /**
         * Sets the destination for the flight plan.
         * @param fms The FMS.
         * @param ident The ICAO to set, like 'KCOS'.
         * @returns The destination facility.
         */
        static async setDestination(fms, ident) {
            const results = await fms.facLoader.searchByIdent(msfssdk.FacilitySearchType.Airport, ident, 1);
            if (results && results.length === 1) {
                const destination = await fms.facLoader.getFacility(msfssdk.FacilityType.Airport, results[0]);
                if (destination) {
                    fms.setDestination(destination);
                    return destination;
                }
            }
            throw new Error('error setting destination');
        }
        /**
         * Removes the origin.
         * @param fms The FMS.
         */
        static removeOrigin(fms) {
            fms.setOrigin(undefined);
        }
        /**
         * Removes the destination.
         * @param fms The FMS.
         */
        static removeDestination(fms) {
            fms.setDestination(undefined);
        }
        /**
         * Sets the destination for the flight plan.
         * @param fms The FMS.
         * @param ident The ident to search for.
         * @param segmentIndex The index of the segment to add the waypoint to.
         * @param segmentLegIndex The index inside the segment to insert the waypoint at (if none, append).
         * @returns The destination facility.
         */
        static async insertWaypoint(fms, ident, segmentIndex, segmentLegIndex) {
            const facility = await this.findNearestFacilityFromIdent(fms, ident);
            fms.insertWaypoint(segmentIndex, facility, segmentLegIndex);
            return facility;
        }
        /**
         * Sets the destination for the flight plan.
         * @param fms The FMS.
         * @param airwayName The name of the airway.
         * @param entryIdent The ident for the airway entry.
         * @param exitIdent The ident for the airway exit.
         * @param segmentIndex The index of the segment to add the waypoint to.
         * @param segmentLegIndex The index inside the segment to insert the waypoint at (if none, append).
         * @returns The destination facility.
         */
        static async insertAirway(fms, airwayName, entryIdent, exitIdent, segmentIndex, segmentLegIndex) {
            const entryFacility = await this.findNearestIntersectionFromIdent(fms, entryIdent);
            const exitFacility = await this.findNearestIntersectionFromIdent(fms, exitIdent);
            const airway = await this.getAirwayFromLeg(fms, entryFacility.icao, airwayName);
            fms.insertAirwaySegment(airway, entryFacility, exitFacility, segmentIndex, segmentLegIndex);
            return [airway, entryFacility, exitFacility];
        }
        /**
         * Checks for an airway at a leg and returns the airway.
         * @param fms The Fms.
         * @param entryIdent The icao of the entry to check.
         * @param airwayName The airway to search for.
         * @returns The airway object.
         */
        static async getAirwayFromLeg(fms, entryIdent, airwayName) {
            const facility = await fms.facLoader.getFacility(msfssdk.FacilityType.Intersection, entryIdent);
            if (facility) {
                const matchedRoute = facility.routes.find((r) => r.name === airwayName);
                if (matchedRoute) {
                    const airway = await fms.facLoader.getAirway(matchedRoute.name, matchedRoute.type, entryIdent);
                    return airway;
                }
            }
            throw new Error('airway not found: ' + JSON.stringify({ icao: entryIdent, airwayName }));
        }
        /**
         * Searches for facilities matching ident, returns the nearest one.
         * @param fms The FMS.
         * @param ident The intersection ident to search for.
         * @returns The selected facility.
         */
        static async findNearestIntersectionFromIdent(fms, ident) {
            return this.findNearestFacilityFromIdent(fms, ident, msfssdk.FacilitySearchType.Intersection);
        }
        /**
         * Searches for facilities matching ident, returns the nearest one.
         * @param fms The FMS.
         * @param ident The ident to search for.
         * @param facilityType The facility type to search for.
         * @returns The selected facility.
         */
        static async findNearestFacilityFromIdent(fms, ident, facilityType = msfssdk.FacilitySearchType.All) {
            const ppos = fms.ppos;
            const referencePos = new msfssdk.GeoPoint(0, 0).set(ppos.lat, ppos.lon);
            let selectedFacility = null;
            const results = await fms.facLoader.searchByIdent(facilityType, ident);
            if (results) {
                const foundFacilities = [];
                // get facilities for results
                for (let i = 0; i < results.length; i++) {
                    const icao = results[i];
                    const facIdent = msfssdk.ICAO.getIdent(icao);
                    if (facIdent === ident) {
                        const fac = await fms.facLoader.getFacility(msfssdk.ICAO.getFacilityType(icao), icao);
                        foundFacilities.push(fac);
                    }
                }
                if (foundFacilities.length > 1) {
                    foundFacilities.sort((a, b) => referencePos.distance(a) - referencePos.distance(b));
                    selectedFacility = foundFacilities[0];
                }
                else if (foundFacilities.length === 1) {
                    selectedFacility = foundFacilities[0];
                }
            }
            if (selectedFacility) {
                return selectedFacility;
            }
            else {
                throw new Error('facility not found with given ident: ' + ident);
            }
        }
        /**
         * Loads a departure.
         * @param fms The FMS.
         * @param origin The origin facility. Get this by calling setOrigin first.
         * @param departureName The departure name, like 'BAYLR6'.
         * @param runwayName The name of the runway, like '34L'.
         * @param transitionName The name of the enroute transition, like 'HBU'.
         * @throws Error if something couldn't be found with given inputs.
         */
        static loadDeparture(fms, origin, departureName, runwayName, transitionName) {
            // TODO enroute transition
            const departure = origin.departures.find(x => x.name.toUpperCase() === departureName.toUpperCase());
            if (!departure) {
                throw new Error('could not find departure procedure matching string: ' + departureName
                    + '. Possible departures: ' + JSON.stringify(origin.departures.map(x => x.name)));
            }
            const departureIndex = origin.departures.indexOf(departure);
            let transition;
            let transitionIndex = -1;
            if (transitionName) {
                transition = departure.enRouteTransitions.find(x => x.name.toUpperCase() === transitionName.toUpperCase());
                if (!transition) {
                    throw new Error('could not find enroute transition matching string: ' + transitionName
                        + '. Possible enroute transitions: ' + JSON.stringify(departure.enRouteTransitions.map(x => x.name)));
                }
                transitionIndex = departure.enRouteTransitions.indexOf(transition);
            }
            const runwayNumber = parseInt(runwayName.replace(/[A-Za-z]*/g, ''));
            const runwayDesignationLetter = runwayName.replace(/\d*/g, '');
            const runwayDesignationNumber = runwayDesignationLetter === 'L' ? 1 : runwayDesignationLetter === 'R' ? 2 : 0;
            const departureRunwayIndex = departure.runwayTransitions.findIndex(x => x.runwayNumber === runwayNumber && x.runwayDesignation === runwayDesignationNumber);
            if (departureRunwayIndex === -1) {
                throw new Error('could not find departureRunwayIndex matching inputs: ' + JSON.stringify({ runwayName, departureName })
                    + '. Possible runways: ' + JSON.stringify(departure.runwayTransitions.map(x => ({ runwayNumber: x.runwayNumber, runwayDesignation: x.runwayDesignation }))));
            }
            const runwayNameString = msfssdk.RunwayUtils.getRunwayNameString(runwayNumber, runwayDesignationNumber);
            const runway = msfssdk.RunwayUtils.matchOneWayRunwayFromDesignation(origin, runwayNameString);
            fms.insertDeparture(origin, departureIndex, departureRunwayIndex, transitionIndex, runway);
        }
        /**
         * Loads an arrival.
         * @param fms The FMS.
         * @param destination The destination facility. Get this by calling setDestination first.
         * @param arrivalName The name of the arrival, like 'DBRY4'.
         * @param transitionName The name of the arrival transition, like 'ALS'.
         * @param runwayTransitionName The name of the arrival runway transition, like '17R'.
         * @throws Error if something couldn't be found with given inputs.
         */
        static loadArrival(fms, destination, arrivalName, transitionName, runwayTransitionName) {
            const arrival = destination.arrivals.find(x => x.name.toUpperCase() === arrivalName.toUpperCase());
            if (!arrival) {
                throw new Error('could not find arrival procedure matching string: ' + arrivalName
                    + '. Possible arrivals: ' + JSON.stringify(destination.arrivals.map(x => x.name)));
            }
            const arrivalIndex = destination.arrivals.indexOf(arrival);
            let transition;
            let transitionIndex = -1;
            if (transitionName) {
                transition = arrival.enRouteTransitions.find(x => x.name.toUpperCase() === transitionName.toUpperCase());
                if (!transition) {
                    throw new Error('could not find arrival transition matching string: ' + transitionName
                        + '. Possible arrival transitions: ' + JSON.stringify(arrival.enRouteTransitions.map(x => x.name)));
                }
                transitionIndex = arrival.enRouteTransitions.indexOf(transition);
            }
            let runwayTransition;
            let runwayTransitionIndex = -1;
            if (runwayTransitionName) {
                runwayTransition = arrival.runwayTransitions.find(x => {
                    return msfssdk.RunwayUtils.getRunwayNameString(x.runwayNumber, x.runwayDesignation).toUpperCase() === runwayTransitionName.toUpperCase();
                });
                if (!runwayTransition) {
                    throw new Error('could not find arrival runway transition matching string: ' + runwayTransitionName
                        + '. Possible arrival runway transitions: '
                        + JSON.stringify(arrival.runwayTransitions.map(x => msfssdk.RunwayUtils.getRunwayNameString(x.runwayNumber, x.runwayDesignation))));
                }
                runwayTransitionIndex = arrival.runwayTransitions.indexOf(runwayTransition);
            }
            fms.insertArrival(destination, arrivalIndex, runwayTransitionIndex, transitionIndex);
        }
        /**
         * Loads an approach.
         * @param fms The FMS.
         * @param destination The destination facility. Get this by calling setDestination first.
         * @param approachName The name of the approach, like 'ILS 17L'.
         * @param transitionName The name of the approach transition, like 'BRK' or 'ADANE'.
         * @throws Error if something couldn't be found with given inputs.
         */
        static async loadApproach(fms, destination, approachName, transitionName) {
            const approach = destination.approaches.find(x => x.name.toUpperCase().replace(/\s/g, '') === approachName.toUpperCase().replace(/\s/g, ''));
            if (!approach) {
                throw new Error('could not find approach procedure matching string: ' + approachName
                    + '. Possible approachs: ' + JSON.stringify(destination.approaches.map(x => x.name)));
            }
            const approachIndex = destination.approaches.indexOf(approach);
            let transition;
            let transitionIndex = -1;
            if (transitionName) {
                transition = approach.transitions.find(x => x.name.toUpperCase() === transitionName.toUpperCase());
                if (!transition) {
                    throw new Error('could not find approach transition matching string: ' + transitionName
                        + '. Possible approach transitions: ' + JSON.stringify(approach.transitions.map(x => x.name)));
                }
                transitionIndex = approach.transitions.indexOf(transition);
            }
            await fms.insertApproach(destination, approachIndex, transitionIndex);
        }
        /**
         * Creates a direct to random to the given ident.
         * @param fms The Fms.
         * @param ident The ident.
         * @param course The magnetic course for the Direct To. If undefined, the Direct To will be initiated from the
         * airplane's present position.
         * @returns The facility matching the ident.
         */
        static async directToRandom(fms, ident, course) {
            const fac = await this.findNearestFacilityFromIdent(fms, ident);
            fms.createDirectToRandom(fac.icao, course);
            return fac;
        }
    }

    /**
     * A testing class for creating dev flight plans.
     */
    class DevPlan {
        /**
         * Temp code to setup a dev flight plan for testing.
         * @param fms The fms instance to use.
         */
        static async setupDevPlan(fms) {
            // await Wait.awaitDelay(2000);
            // const origin = await TestingUtils.setOrigin(fms, 'KDEN');
            // await Wait.awaitDelay(2000);
            // await TestingUtils.setOriginRunway(fms, origin, '34L');
            // await Wait.awaitDelay(2000);
            // await TestingUtils.loadDeparture(fms, origin, 'BAYLR6', '34L', 'HBU');
            // await Wait.awaitDelay(2000);
            // await TestingUtils.insertWaypoint(fms, 'ALADN', 1);
            // await Wait.awaitDelay(2000);
            // await TestingUtils.insertWaypoint(fms, 'GENIE', 1);
            // await Wait.awaitDelay(2000);
            // await TestingUtils.insertWaypoint(fms, 'JAFAR', 1);
            // await Wait.awaitDelay(2000);
            // await TestingUtils.insertWaypoint(fms, 'ALADN', 1, 1);
            // await Wait.awaitDelay(2000);
            // await TestingUtils.insertAirway(fms, 'V159', 'ALADN', 'MAMBO', 1, 1);
            await msfssdk.Wait.awaitDelay(2000);
            const destination = await TestingUtils.setDestination(fms, 'KCOS');
            // await Wait.awaitDelay(2000);
            // fms.activateLeg(0, 1);
            // await Wait.awaitDelay(2000);
            // fms.activateLeg(0, 2);
            // await Wait.awaitDelay(2000);
            // await TestingUtils.loadArrival(fms, destination, 'DBRY4', 'ALS');
            await msfssdk.Wait.awaitDelay(2000);
            await TestingUtils.loadApproach(fms, destination, 'ILS 17L', 'ADANE');
            // await Wait.awaitDelay(2000);
            // await TestingUtils.removeOrigin(fms);
            // await Wait.awaitDelay(2000);
            // Direct to AWONE
            // fms.createDirectToExisting(3, 2);
            // await Wait.awaitDelay(2000);
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            // console.log(fms.getPrimaryFlightPlan().planSegments);
        }
    }

    /**
     * A utility class containing information about the current G3000 software version.
     */
    class G3000Version {
    }
    /** The current version string. */
    G3000Version.VERSION = 'WT1.0.6';
    /** The release date of the current version, as a UNIX timestamp in milliseconds. */
    G3000Version.VERSION_DATE = Date.parse('2023-01-07');

    /**
     * A G3000 BaseInstrument.
     */
    class WTG3000BaseInstrument extends msfssdk.FsBaseInstrument {
        /**
         * Sets this instrument's checklist highlight layer element.
         * @param element The checklist highlight layer element.
         */
        setHighlightElement(element) {
            this.highlightSvg = element;
        }
        /** @inheritdoc */
        onPowerOn() {
            super.onPowerOn();
            this.fsInstrument.onPowerOn();
        }
        /** @inheritdoc */
        onShutDown() {
            super.onShutDown();
            this.fsInstrument.onPowerOff();
        }
    }

    /// <reference types="msfstypes/js/avionics" />
    /**
     * A common instrument for the G3000.
     */
    class WTG3000FsInstrument {
        /**
         * Constructor.
         * @param instrumentType The type of this instrument.
         * @param instrument This instrument's parent BaseInstrument.
         * @param config This instrument's general configuration object.
         */
        constructor(instrumentType, instrument, config) {
            this.instrumentType = instrumentType;
            this.instrument = instrument;
            this.config = config;
            this.isInstrumentPowered = false;
            this.isPowerValid = false;
            this.isPowered = undefined;
            this.bootTimer = new msfssdk.DebounceTimer();
            this.bus = new msfssdk.EventBus();
            this.facRepo = msfssdk.FacilityRepository.getRepository(this.bus);
            this.facLoader = new msfssdk.FacilityLoader(this.facRepo);
            this.hEventPublisher = new msfssdk.HEventPublisher(this.bus);
            this.flightPathCalculator = new msfssdk.FlightPathCalculator(this.facLoader, {
                defaultClimbRate: 300,
                defaultSpeed: 50,
                bankAngle: [[10, 60], [40, 300]],
                holdBankAngle: null,
                courseReversalBankAngle: null,
                turnAnticipationBankAngle: [[10, 60], [15, 100]],
                maxBankAngle: this.config.fms.flightPathOptions.maxBankAngle,
                airplaneSpeedMode: msfssdk.FlightPathAirplaneSpeedMode.TrueAirspeedPlusWind
            }, this.bus);
            this.flightPlanner = msfssdk.FlightPlanner.getPlanner(this.bus, this.flightPathCalculator);
            this.verticalPathCalculator = new msfssdk.SmoothingPathCalculator(this.bus, this.flightPlanner, garminsdk.Fms.PRIMARY_PLAN_INDEX, {
                defaultFpa: 3,
                maxFpa: 6,
                isLegEligible: garminsdk.GarminVNavUtils.isLegVNavEligible,
                shouldUseConstraint: garminsdk.GarminVNavUtils.shouldUseConstraint,
                invalidateClimbConstraint: garminsdk.GarminVNavUtils.invalidateClimbConstraint,
                invalidateDescentConstraint: garminsdk.GarminVNavUtils.invalidateDescentConstraint
            });
            this.speedConstraintStore = new garminsdk.GarminSpeedConstraintStore(this.bus, this.flightPlanner);
            this.fms = new garminsdk.Fms(this.instrumentType === 'MFD', this.bus, this.flightPlanner, this.verticalPathCalculator, this.config.vnav.advanced, undefined, this.config.fms.approach.visualApproachOptions);
            this.avionicsStatusClient = new AvionicsStatusClient(this.instrumentType, this.instrument.instrumentIndex, this.bus);
            this.avionicsStatusEventClient = new AvionicsStatusEventClient(this.avionicsStatusClient.uid, this.bus);
            this.avionicsStatusSimVar = `L:WTG3000_${this.avionicsStatusClient.uid}_Avionics_Status`;
            this.backplane = new msfssdk.InstrumentBackplane();
            this.clock = new msfssdk.Clock(this.bus);
            this.baseInstrumentPublisher = new msfssdk.BaseInstrumentPublisher(this.instrument, this.bus);
            this.adcPublisher = new msfssdk.AdcPublisher(this.bus, this.config.sensors.adcDefinitions.slice(1, this.config.sensors.adcCount + 1).reduce((prev, curr) => Math.max(prev, curr.airspeedIndicatorIndex), 1), this.config.iauDefs.definitions.slice(1).reduce((prev, curr) => Math.max(prev, curr.altimeterIndex), 1));
            this.ahrsPublisher = new msfssdk.AhrsPublisher(this.bus, this.config.sensors.ahrsDefinitions.slice(1, this.config.sensors.ahrsCount + 1).reduce((prev, curr) => Math.max(prev, curr.attitudeIndicatorIndex), 1), this.config.sensors.ahrsDefinitions.slice(1, this.config.sensors.ahrsCount + 1).reduce((prev, curr) => Math.max(prev, curr.directionIndicatorIndex), 1));
            this.gnssPublisher = new msfssdk.GNSSPublisher(this.bus);
            this.garminNavPublisher = new garminsdk.GarminNavSimVarPublisher(this.bus);
            this.lNavPublisher = new msfssdk.LNavSimVarPublisher(this.bus);
            this.lNavDataPublisher = new garminsdk.LNavDataSimVarPublisher(this.bus);
            this.vNavPublisher = new msfssdk.VNavSimVarPublisher(this.bus);
            this.minimumsPublisher = new msfssdk.MinimumsSimVarPublisher(this.bus);
            this.navEventsPublisher = new garminsdk.NavEventsPublisher(this.bus);
            this.eisPublisher = new msfssdk.EISPublisher(this.bus);
            this.controlSurfacesPublisher = new msfssdk.ControlSurfacesPublisher(this.bus, 3);
            this.timerPublisher = new msfssdk.FlightTimerPublisher(this.bus, 2);
            this.soundPublisher = new msfssdk.SoundPublisher(this.bus);
            this.fuelTotalizerPublisher = new FuelTotalizerSimVarPublisher(this.bus);
            this.weightFuelPublisher = new WeightFuelPublisher(this.bus);
            this.soundServer = new msfssdk.SoundServer(this.bus, this.soundPublisher, this.instrument);
            this.apInstrument = new msfssdk.AutopilotInstrument(this.bus);
            this.systems = [];
            this.minimumsDataProvider = new garminsdk.DefaultMinimumsDataProvider(this.bus, this.config.sensors.hasRadarAltimeter);
            this.casPowerStateManager = new CasPowerStateManager(this.bus);
            /** Whether this instrument has started updating. */
            this.haveUpdatesStarted = false;
            this.backplane.addInstrument(exports.InstrumentBackplaneNames.Clock, this.clock);
            this.backplane.addInstrument(exports.InstrumentBackplaneNames.Autopilot, this.apInstrument);
            this.backplane.addPublisher(exports.InstrumentBackplaneNames.Base, this.baseInstrumentPublisher);
            this.backplane.addPublisher(exports.InstrumentBackplaneNames.HEvents, this.hEventPublisher);
            this.backplane.addPublisher(exports.InstrumentBackplaneNames.Adc, this.adcPublisher);
            this.backplane.addPublisher(exports.InstrumentBackplaneNames.Ahrs, this.ahrsPublisher);
            this.backplane.addPublisher(exports.InstrumentBackplaneNames.Gnss, this.gnssPublisher);
            this.backplane.addPublisher(exports.InstrumentBackplaneNames.GarminNav, this.garminNavPublisher);
            this.backplane.addPublisher(exports.InstrumentBackplaneNames.LNav, this.lNavPublisher);
            this.backplane.addPublisher(exports.InstrumentBackplaneNames.LNavData, this.lNavDataPublisher);
            this.backplane.addPublisher(exports.InstrumentBackplaneNames.VNav, this.vNavPublisher);
            this.backplane.addPublisher(exports.InstrumentBackplaneNames.Minimums, this.minimumsPublisher);
            this.backplane.addPublisher(exports.InstrumentBackplaneNames.NavEvents, this.navEventsPublisher);
            this.backplane.addPublisher(exports.InstrumentBackplaneNames.Eis, this.eisPublisher);
            this.backplane.addPublisher(exports.InstrumentBackplaneNames.ControlSurfaces, this.controlSurfacesPublisher);
            this.backplane.addPublisher(exports.InstrumentBackplaneNames.Timer, this.timerPublisher);
            this.backplane.addPublisher(exports.InstrumentBackplaneNames.Sound, this.soundPublisher);
            this.backplane.addPublisher(exports.InstrumentBackplaneNames.FuelTotalizer, this.fuelTotalizerPublisher);
            this.backplane.addPublisher(exports.InstrumentBackplaneNames.WeightFuel, this.weightFuelPublisher);
            this.iauSettingManager = this.createIauUserSettingManager(config);
            this.vSpeedSettingManager = this.createVSpeedUserSettingManager(config);
            this.fmsSpeedsSettingManager = this.createFmsSpeedUserSettingManager(config);
            // force enable animations
            document.documentElement.classList.add('animationsEnabled');
            // Wait until game has entered briefing or in-game mode before initializing the avionics status client. This
            // ensures that we do not publish any statuses based on erroneous power states.
            msfssdk.Wait.awaitSubscribable(msfssdk.GameStateProvider.get(), gameState => gameState === GameState.briefing || gameState === GameState.ingame, true).then(async () => {
                this.isPowerValid = true;
                this.avionicsStatusClient.init();
                this.avionicsStatusEventClient.init();
                // Wait until updates have started before initializing the power state because instrument power is not
                // initialized until the first update.
                await msfssdk.Wait.awaitCondition(() => this.haveUpdatesStarted);
                if (this.isPowered === undefined) {
                    this.isPowered = this.isInstrumentPowered;
                    this.onPowerChanged(this.isPowered, undefined);
                }
            });
        }
        /**
         * Creates this instrument's avionics systems. This method should be called after `this.iauIndex` has been defined.
         */
        createSystems() {
            const altimeterIndex = this.config.iauDefs.definitions[this.iauIndex].altimeterIndex;
            const adcSystems = this.config.sensors.adcDefinitions.slice(1, this.config.sensors.adcCount + 1).map((def, index) => {
                return new garminsdk.AdcSystem(index + 1, this.bus, def.airspeedIndicatorIndex, altimeterIndex, def.electricity);
            });
            // Garmin GMUs seem to always be powered directly from their parent AHRS systems.
            const magnetometers = this.config.sensors.ahrsDefinitions.slice(1, this.config.sensors.ahrsCount + 1).map((def, index) => {
                return new garminsdk.MagnetometerSystem(index + 1, this.bus, def.electricity);
            });
            const ahrsSystems = this.config.sensors.ahrsDefinitions.slice(1, this.config.sensors.ahrsCount + 1).map((def, index) => {
                return new garminsdk.AhrsSystem(index + 1, this.bus, def.attitudeIndicatorIndex, def.directionIndicatorIndex, def.electricity);
            });
            const gpsSystems = [];
            const fmsPosSystems = [];
            this.gpsReceiverSelector = new garminsdk.GpsReceiverSelector(this.bus, Array.from({ length: this.config.iauDefs.count }, (v, index) => index + 1), Math.min(this.iauIndex, this.config.iauDefs.count));
            for (let index = 1; index <= this.config.iauDefs.count; index++) {
                const iau = this.config.iauDefs.definitions[index];
                gpsSystems.push(new garminsdk.GpsReceiverSystem(index, this.bus, new msfssdk.GPSSatComputer(index, this.bus, 'coui://html_ui/Pages/VCockpit/Instruments/NavSystems/TTX/WTG3000/Assets/Data/gps_ephemeris.json', 'coui://html_ui/Pages/VCockpit/Instruments/NavSystems/TTX/WTG3000/Assets/Data/gps_sbas.json', 5000, Object.values(msfssdk.SBASGroupName), this.instrumentType === 'MFD' ? 'primary' : 'replica'), iau.gpsDefinition.electricity));
                fmsPosSystems.push(new garminsdk.FmsPositionSystem(index, this.bus, this.gpsReceiverSelector.selectedIndex, this.iauSettingManager.getAliasedManager(index).getSetting('iauAdcIndex'), this.iauSettingManager.getAliasedManager(index).getSetting('iauAhrsIndex'), undefined, undefined, iau.fmsPosDefinition.electricity));
            }
            this.gpsReceiverSelector.init();
            this.systems.push(...magnetometers, ...adcSystems, ...ahrsSystems, ...gpsSystems, ...fmsPosSystems, new garminsdk.AoaSystem(1, this.bus, this.config.sensors.aoaDefinition.electricity), new garminsdk.MarkerBeaconSystem(1, this.bus, this.config.sensors.markerBeaconDefinition.electricity));
            if (this.config.sensors.radarAltimeterDefinition !== undefined) {
                this.systems.push(new garminsdk.RadarAltimeterSystem(1, this.bus, this.config.sensors.radarAltimeterDefinition.electricity));
            }
        }
        /**
         * Creates a manager for IAU user settings defined by a configuration object.
         * @param config A general configuration object.
         * @returns A manager for IAU user settings defined by the specified configuration object.
         */
        createIauUserSettingManager(config) {
            return new IauUserSettingManager(this.bus, config.iauDefs);
        }
        /**
         * Creates a manager for reference V-speed user settings defined by a configuration object.
         * @param config A general configuration object.
         * @returns A manager for reference V-speed user settings defined by the specified configuration object.
         */
        createVSpeedUserSettingManager(config) {
            return new VSpeedUserSettingManager(this.bus, config.vSpeedGroups);
        }
        /**
         * Creates a manager for reference V-speed user settings defined by a configuration object.
         * @param config A general configuration object.
         * @returns A manager for reference V-speed user settings defined by the specified configuration object.
         */
        createFmsSpeedUserSettingManager(config) {
            return config.vnav.fmsSpeeds === undefined ? undefined : new FmsSpeedUserSettingManager(this.bus, config.vnav.fmsSpeeds);
        }
        /**
         * Initializes this instrument's avionics status listener. Once intialized, the listener will call this instrument's
         * `onAvionicsStatusChanged()` method as appropriate.
         */
        initAvionicsStatusListener() {
            this.bus.getSubscriber().on(`avionics_status_${this.avionicsStatusClient.uid}`).handle(this.onAvionicsStatusChanged.bind(this));
        }
        /** @inheritdoc */
        Update() {
            this.haveUpdatesStarted = true;
            this.backplane.onUpdate();
            this.updateSystems();
        }
        /**
         * Updates this instrument's systems.
         */
        updateSystems() {
            for (let i = 0; i < this.systems.length; i++) {
                this.systems[i].onUpdate();
            }
        }
        /** @inheritdoc */
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        onInteractionEvent(args) {
            this.hEventPublisher.dispatchHEvent(args[0]);
        }
        /** @inheritdoc */
        onFlightStart() {
            // TODO
        }
        /** @inheritdoc */
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        onGameStateChanged(oldState, newState) {
            // TODO
        }
        /** @inheritdoc */
        onSoundEnd(soundEventId) {
            this.soundServer.onSoundEnd(soundEventId);
        }
        /**
         * A callback which is executed when this instrument transitions from a power-off to power-on state.
         */
        onPowerOn() {
            this.isInstrumentPowered = true;
            if (this.isPowerValid) {
                const old = this.isPowered;
                this.isPowered = true;
                if (old !== true) {
                    this.onPowerChanged(true, old);
                }
            }
        }
        /**
         * A callback which is executed when this instrument transitions from a power-on to power-off state.
         */
        onPowerOff() {
            this.isInstrumentPowered = false;
            if (this.isPowerValid) {
                const old = this.isPowered;
                this.isPowered = false;
                if (old !== false) {
                    this.onPowerChanged(false, old);
                }
            }
        }
        /**
         * Responds to when this instrument's power state changes.
         * @param current The current power state.
         * @param previous The previous power state, or `undefined` if the previous state was invalid.
         */
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        onPowerChanged(current, previous) {
            if (current) {
                if (previous === undefined) {
                    // The instrument started in a powered state, so we skip bootup and set the status to ON.
                    this.bootTimer.clear();
                    this.avionicsStatusClient.setStatus(exports.AvionicsStatus.On);
                }
                else {
                    // The instrument transitioned from an unpowered to a powered state, so perform bootup.
                    this.avionicsStatusClient.setStatus(exports.AvionicsStatus.Booting);
                    this.bootTimer.schedule(this.onBootFinished.bind(this), this.getBootDuration());
                }
            }
            else {
                this.bootTimer.clear();
                this.avionicsStatusClient.setStatus(exports.AvionicsStatus.Off);
            }
        }
        /**
         * Responds to when this instrument is finished booting.
         */
        onBootFinished() {
            this.avionicsStatusClient.setStatus(exports.AvionicsStatus.On);
        }
        /**
         * Responds to when the avionics status of this instrument changes.
         * @param event The event describing the avionics status change.
         */
        onAvionicsStatusChanged(event) {
            SimVar.SetSimVarValue(this.avionicsStatusSimVar, msfssdk.SimVarValueType.Number, event.current);
        }
    }

    Object.defineProperty(exports, 'ApproachNameDisplay', {
        enumerable: true,
        get: function () { return garminsdk.ApproachNameDisplay; }
    });
    Object.defineProperty(exports, 'BearingDisplay', {
        enumerable: true,
        get: function () { return garminsdk.BearingDisplay; }
    });
    Object.defineProperty(exports, 'GarminLatLonDisplay', {
        enumerable: true,
        get: function () { return garminsdk.LatLonDisplay; }
    });
    Object.defineProperty(exports, 'MapRangeDisplay', {
        enumerable: true,
        get: function () { return garminsdk.MapRangeDisplay; }
    });
    Object.defineProperty(exports, 'MapRangeValueDisplay', {
        enumerable: true,
        get: function () { return garminsdk.MapRangeValueDisplay; }
    });
    Object.defineProperty(exports, 'NumberUnitDisplay', {
        enumerable: true,
        get: function () { return garminsdk.NumberUnitDisplay; }
    });
    Object.defineProperty(exports, 'TimeDisplay', {
        enumerable: true,
        get: function () { return garminsdk.TimeDisplay; }
    });
    Object.defineProperty(exports, 'ToggleStatusBar', {
        enumerable: true,
        get: function () { return garminsdk.ToggleStatusBar; }
    });
    exports.AbstractNavBase = AbstractNavBase;
    exports.AdfRadioSource = AdfRadioSource;
    exports.AltitudeConstraintDisplay = AltitudeConstraintDisplay;
    exports.AutopilotConfig = AutopilotConfig;
    exports.AvionicsConfig = AvionicsConfig;
    exports.AvionicsStatusClient = AvionicsStatusClient;
    exports.AvionicsStatusEventClient = AvionicsStatusEventClient;
    exports.AvionicsStatusManager = AvionicsStatusManager;
    exports.AvionicsStatusUtils = AvionicsStatusUtils;
    exports.BasicNavIndicator = BasicNavIndicator;
    exports.BasicNearestWaypointEntry = BasicNearestWaypointEntry;
    exports.BingUtils = BingUtils;
    exports.CAS = CAS;
    exports.CASConfig = CASConfig;
    exports.CASMessageCount = CASMessageCount;
    exports.CasPowerStateManager = CasPowerStateManager;
    exports.ConnextMapUserSettings = ConnextMapUserSettings;
    exports.ConnextWeatherPaneView = ConnextWeatherPaneView;
    exports.DefaultConfigFactory = DefaultConfigFactory;
    exports.DefaultFmsSpeedTargetDataProvider = DefaultFmsSpeedTargetDataProvider;
    exports.DevPlan = DevPlan;
    exports.DisplayPane = DisplayPane;
    exports.DisplayPaneContainer = DisplayPaneContainer;
    exports.DisplayPaneUtils = DisplayPaneUtils;
    exports.DisplayPaneView = DisplayPaneView;
    exports.DisplayPaneViewFactory = DisplayPaneViewFactory;
    exports.DisplayPanesAliasedUserSettingManager = DisplayPanesAliasedUserSettingManager;
    exports.DisplayPanesController = DisplayPanesController;
    exports.DisplayPanesUserSettings = DisplayPanesUserSettings;
    exports.DynamicList = DynamicList;
    exports.ExistingUserWaypointsArray = ExistingUserWaypointsArray;
    exports.FlightPlanLegData = FlightPlanLegData;
    exports.FlightPlanLegListData = FlightPlanLegListData;
    exports.FlightPlanListManager = FlightPlanListManager;
    exports.FlightPlanSegmentData = FlightPlanSegmentData;
    exports.FlightPlanSegmentListData = FlightPlanSegmentListData;
    exports.FlightPlanStore = FlightPlanStore;
    exports.FlightPlanTextUpdater = FlightPlanTextUpdater;
    exports.FmsAirframeSpeedLimitConfig = FmsAirframeSpeedLimitConfig;
    exports.FmsApproachConfig = FmsApproachConfig;
    exports.FmsConfig = FmsConfig;
    exports.FmsSpeedUserSettingManager = FmsSpeedUserSettingManager;
    exports.FmsSpeedsConfig = FmsSpeedsConfig;
    exports.FpaDisplay = FpaDisplay;
    exports.FuelTotalizer = FuelTotalizer;
    exports.FuelTotalizerSimVarPublisher = FuelTotalizerSimVarPublisher;
    exports.G3000ActiveSourceNavIndicator = G3000ActiveSourceNavIndicator;
    exports.G3000ApproachPreviewDataProvider = G3000ApproachPreviewDataProvider;
    exports.G3000ApproachPreviewNavIndicator = G3000ApproachPreviewNavIndicator;
    exports.G3000Autopilot = G3000Autopilot;
    exports.G3000BearingPointerNavIndicator = G3000BearingPointerNavIndicator;
    exports.G3000CASDisplay = G3000CASDisplay;
    exports.G3000ComRadioUserSettings = G3000ComRadioUserSettings;
    exports.G3000DmeInfoNavIndicator = G3000DmeInfoNavIndicator;
    exports.G3000FPLUtils = G3000FPLUtils;
    exports.G3000FilePaths = G3000FilePaths;
    exports.G3000FmsUtils = G3000FmsUtils;
    exports.G3000MapRunwayDesignationImageCache = G3000MapRunwayDesignationImageCache;
    exports.G3000MapUserSettingUtils = G3000MapUserSettingUtils;
    exports.G3000NavInfoNavIndicator = G3000NavInfoNavIndicator;
    exports.G3000NearestContext = G3000NearestContext;
    exports.G3000RadioUtils = G3000RadioUtils;
    exports.G3000UserSettingSaveManager = G3000UserSettingSaveManager;
    exports.G3000Version = G3000Version;
    exports.G3000WeatherMapUserSettingsUtils = G3000WeatherMapUserSettingsUtils;
    exports.GpsSatelliteData = GpsSatelliteData;
    exports.GpsSource = GpsSource;
    exports.GpsStatusDataProvider = GpsStatusDataProvider;
    exports.GpsStatusPane = GpsStatusPane;
    exports.IauConfig = IauConfig;
    exports.IauDefsConfig = IauDefsConfig;
    exports.IauUserSettingManager = IauUserSettingManager;
    exports.LegNameDisplay = LegNameDisplay;
    exports.LookupTableConfig = LookupTableConfig;
    exports.MapAliasedUserSettingManager = MapAliasedUserSettingManager;
    exports.MapBuilder = MapBuilder;
    exports.MapConfig = MapConfig;
    exports.MapDataIntegrityController = MapDataIntegrityController;
    exports.MapPointerJoystickHandler = MapPointerJoystickHandler;
    exports.MapRangeSettingDisplay = MapRangeSettingDisplay;
    exports.MapSettingSyncUserSettings = MapSettingSyncUserSettings;
    exports.MapUserSettings = MapUserSettings;
    exports.MapWaypointIconImageCache = MapWaypointIconImageCache;
    exports.MfdNavDataBarUserSettings = MfdNavDataBarUserSettings;
    exports.NavIndicators = NavIndicators;
    exports.NavRadioMonitorUserSettings = NavRadioMonitorUserSettings;
    exports.NavRadioNavSource = NavRadioNavSource;
    exports.NavSourceFormatter = NavSourceFormatter;
    exports.NavSources = NavSources;
    exports.NavigationMapPaneView = NavigationMapPaneView;
    exports.NearestPaneView = NearestPaneView;
    exports.NearestWaypointArray = NearestWaypointArray;
    exports.NumericConstantConfig = NumericConstantConfig;
    exports.NumericMaxConfig = NumericMaxConfig;
    exports.NumericMinConfig = NumericMinConfig;
    exports.ObsAutoSlew = ObsAutoSlew;
    exports.PerformanceConfig = PerformanceConfig;
    exports.PfdUserSettings = PfdUserSettings;
    exports.ProcedurePreviewPaneView = ProcedurePreviewPaneView;
    exports.RadiosConfig = RadiosConfig;
    exports.SensorsConfig = SensorsConfig;
    exports.SimpleAltitudeConstraintDisplay = SimpleAltitudeConstraintDisplay;
    exports.SoftKeyHEventMap = SoftKeyHEventMap;
    exports.SpeedConfig = SpeedConfig;
    exports.SpeedConstraintDisplay = SpeedConstraintDisplay;
    exports.TestingUtils = TestingUtils;
    exports.ToldConfig = ToldConfig;
    exports.ToldUserSettings = ToldUserSettings;
    exports.TrafficConfig = TrafficConfig;
    exports.TrafficMapPaneView = TrafficMapPaneView;
    exports.VNavConfig = VNavConfig;
    exports.VSpeedConfig = VSpeedConfig;
    exports.VSpeedGroupConfig = VSpeedGroupConfig;
    exports.VSpeedUserSettingManager = VSpeedUserSettingManager;
    exports.VnavProfileStore = VnavProfileStore;
    exports.WTG3000BaseInstrument = WTG3000BaseInstrument;
    exports.WTG3000FsInstrument = WTG3000FsInstrument;
    exports.WaypointInfoPaneView = WaypointInfoPaneView;
    exports.WeatherMapUserSettings = WeatherMapUserSettings;
    exports.WeatherRadarPaneView = WeatherRadarPaneView;
    exports.WeatherRadarRange = WeatherRadarRange;
    exports.WeatherRadarUserSettings = WeatherRadarUserSettings;
    exports.WeightFuelPublisher = WeightFuelPublisher;
    exports.WeightFuelUserSettings = WeightFuelUserSettings;
    exports.courseNeedleNavSourceNames = courseNeedleNavSourceNames;

    return exports;

})({}, msfssdk, garminsdk);
