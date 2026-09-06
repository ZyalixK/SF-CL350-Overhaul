

const CAS_CATALOGUE = [
 {
  "id": "W1",
  "text": "APU FIRE",
  "tier": "warning",
  "inhibit": "-",
  "side": null,
  "aural": "Triple Chime",
  "voice": "\"APU FIRE\""
 },
 {
  "id": "W2",
  "text": "APU OVERTEMP",
  "tier": "warning",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Triple Chime",
  "voice": "None"
 },
 {
  "id": "W3-L",
  "text": "L BATT OVERHEAT",
  "tier": "warning",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": "Triple Chime",
  "voice": "None",
  "tone": true
 },
 {
  "id": "W3-R",
  "text": "R BATT OVERHEAT",
  "tier": "warning",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": "Triple Chime",
  "voice": "None",
  "tone": true
 },
 {
  "id": "W4",
  "text": "ESSENTIAL POWER ONLY",
  "tier": "warning",
  "inhibit": "-",
  "side": null,
  "aural": "Triple Chime",
  "voice": "None",
  "tone": true
 },
 {
  "id": "W5-L",
  "text": "L BLEED LEAK",
  "tier": "warning",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": "Triple Chime",
  "voice": "None"
 },
 {
  "id": "W5-R",
  "text": "R BLEED LEAK",
  "tier": "warning",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": "Triple Chime",
  "voice": "None"
 },
 {
  "id": "W6",
  "text": "CABIN ALTITUDE",
  "tier": "warning",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "None (only warning with no chime)",
  "voice": "\"CABIN ALTITUDE\" — *replaces* the triple chime"
 },
 {
  "id": "W7",
  "text": "CABIN DELTA P",
  "tier": "warning",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Triple Chime",
  "voice": "None"
 },
 {
  "id": "W8",
  "text": "CARGO SMOKE",
  "tier": "warning",
  "inhibit": "-",
  "side": null,
  "aural": "Triple Chime",
  "voice": "None",
  "tone": true
 },
 {
  "id": "W9",
  "text": "CONFIG AILERON TRIM",
  "tier": "warning",
  "inhibit": "-",
  "side": null,
  "aural": "Triple Chime",
  "voice": "\"CONFIGURATION\""
 },
 {
  "id": "W10",
  "text": "CONFIG AUTOPILOT",
  "tier": "warning",
  "inhibit": "-",
  "side": null,
  "aural": "Triple Chime",
  "voice": "\"CONFIGURATION\""
 },
 {
  "id": "W11",
  "text": "CONFIG FLAPS",
  "tier": "warning",
  "inhibit": "-",
  "side": null,
  "aural": "Triple Chime",
  "voice": "\"CONFIGURATION\""
 },
 {
  "id": "W12",
  "text": "CONFIG RUDDER TRIM",
  "tier": "warning",
  "inhibit": "-",
  "side": null,
  "aural": "Triple Chime",
  "voice": "\"CONFIGURATION\""
 },
 {
  "id": "W13",
  "text": "CONFIG SPOILERS",
  "tier": "warning",
  "inhibit": "-",
  "side": null,
  "aural": "Triple Chime",
  "voice": "\"CONFIGURATION\""
 },
 {
  "id": "W14",
  "text": "CONFIG STAB TRIM",
  "tier": "warning",
  "inhibit": "-",
  "side": null,
  "aural": "Triple Chime",
  "voice": "\"CONFIGURATION\""
 },
 {
  "id": "W15",
  "text": "GEAR",
  "tier": "warning",
  "inhibit": "-",
  "side": null,
  "aural": "Triple Chime",
  "voice": "\"GEAR\""
 },
 {
  "id": "W16",
  "text": "GEAR BAY OVHT",
  "tier": "warning",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Triple Chime",
  "voice": "None",
  "tone": true
 },
 {
  "id": "W17-L",
  "text": "L ENG OIL PRESS LOW",
  "tier": "warning",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": "Triple Chime",
  "voice": "None",
  "tone": true
 },
 {
  "id": "W17-R",
  "text": "R ENG OIL PRESS LOW",
  "tier": "warning",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": "Triple Chime",
  "voice": "None",
  "tone": true
 },
 {
  "id": "W18-L",
  "text": "L ENGINE EXCEEDANCE",
  "tier": "warning",
  "inhibit": "-",
  "side": "L",
  "aural": "Triple Chime",
  "voice": "None",
  "tone": true
 },
 {
  "id": "W18-R",
  "text": "R ENGINE EXCEEDANCE",
  "tier": "warning",
  "inhibit": "-",
  "side": "R",
  "aural": "Triple Chime",
  "voice": "None",
  "tone": true
 },
 {
  "id": "W19-L",
  "text": "L ENGINE FIRE",
  "tier": "warning",
  "inhibit": "-",
  "side": "L",
  "aural": "Triple Chime",
  "voice": "\"LEFT (RIGHT) ENGINE FIRE\""
 },
 {
  "id": "W19-R",
  "text": "R ENGINE FIRE",
  "tier": "warning",
  "inhibit": "-",
  "side": "R",
  "aural": "Triple Chime",
  "voice": "\"LEFT (RIGHT) ENGINE FIRE\""
 },
 {
  "id": "W20",
  "text": "HYD PRESS LOW",
  "tier": "warning",
  "inhibit": "-",
  "side": null,
  "aural": "Triple Chime",
  "voice": "None",
  "tone": true
 },
 {
  "id": "W21",
  "text": "NORM BRAKES FAIL",
  "tier": "warning",
  "inhibit": "TO",
  "side": null,
  "aural": "Triple Chime",
  "voice": "\"NORMAL BRAKES FAIL\""
 },
 {
  "id": "W22",
  "text": "PACK LEAK",
  "tier": "warning",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Triple Chime",
  "voice": "None"
 },
 {
  "id": "W23",
  "text": "PARK/EMER BRAKE ON",
  "tier": "warning",
  "inhibit": "-",
  "side": null,
  "aural": "Triple Chime",
  "voice": "\"CONFIGURATION\"",
  "tone": true
 },
 {
  "id": "W24",
  "text": "PITCH DISCONNECT",
  "tier": "warning",
  "inhibit": "-",
  "side": null,
  "aural": "Triple Chime",
  "voice": "\"CONFIGURATION\""
 },
 {
  "id": "W25-L",
  "text": "L PYLON BLEED LEAK",
  "tier": "warning",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": "Triple Chime",
  "voice": "None"
 },
 {
  "id": "W25-R",
  "text": "R PYLON BLEED LEAK",
  "tier": "warning",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": "Triple Chime",
  "voice": "None"
 },
 {
  "id": "W26-L",
  "text": "L REVERSER UNSAFE",
  "tier": "warning",
  "inhibit": "-",
  "side": "L",
  "aural": "Triple Chime",
  "voice": "None",
  "tone": true
 },
 {
  "id": "W26-R",
  "text": "R REVERSER UNSAFE",
  "tier": "warning",
  "inhibit": "-",
  "side": "R",
  "aural": "Triple Chime",
  "voice": "None",
  "tone": true
 },
 {
  "id": "W27",
  "text": "ROLL DISCONNECT",
  "tier": "warning",
  "inhibit": "-",
  "side": null,
  "aural": "Triple Chime",
  "voice": "\"CONFIGURATION\""
 },
 {
  "id": "W28",
  "text": "TRIM AIR LEAK",
  "tier": "warning",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Triple Chime",
  "voice": "None"
 },
 {
  "id": "W29",
  "text": "WING ANTI-ICE LEAK",
  "tier": "warning",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Triple Chime",
  "voice": "None"
 },
 {
  "id": "W30-L",
  "text": "L WING OVERHEAT",
  "tier": "warning",
  "inhibit": "-",
  "side": "L",
  "aural": "Triple Chime",
  "voice": "None"
 },
 {
  "id": "W30-R",
  "text": "R WING OVERHEAT",
  "tier": "warning",
  "inhibit": "-",
  "side": "R",
  "aural": "Triple Chime",
  "voice": "None"
 },
 {
  "id": "C1",
  "text": "AFCS MESSAGES FAIL",
  "tier": "caution",
  "inhibit": "TO",
  "side": null,
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C2",
  "text": "AFT EQPT BAY DOOR",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C3",
  "text": "AIR COND TEMP FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C4",
  "text": "AIR COND TEMP HIGH",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C5-1",
  "text": "AIR DATA 1 FAULT",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "1",
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C5-2",
  "text": "AIR DATA 2 FAULT",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "2",
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C6-L",
  "text": "L AOA VANE HEAT FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C6-R",
  "text": "R AOA VANE HEAT FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C7",
  "text": "AP HOLDING LWD",
  "tier": "caution",
  "inhibit": "TO",
  "side": null,
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C8",
  "text": "AP HOLDING RWD",
  "tier": "caution",
  "inhibit": "TO",
  "side": null,
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C9",
  "text": "AP HOLDING NOSE DOWN",
  "tier": "caution",
  "inhibit": "TO",
  "side": null,
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C10",
  "text": "AP HOLDING NOSE UP",
  "tier": "caution",
  "inhibit": "TO",
  "side": null,
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C11",
  "text": "AP STAB TRIM FAIL",
  "tier": "caution",
  "inhibit": "TO",
  "side": null,
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C12",
  "text": "APU BLEED ALT LIMIT",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C13",
  "text": "APU FAULT",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C14",
  "text": "APU FIRE DET FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C15",
  "text": "APU FUEL SOV FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C16",
  "text": "APU GEN FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C17",
  "text": "APU GEN OVERLOAD",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C18",
  "text": "APU OIL PRESS LOW",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C19",
  "text": "APU OIL TEMP HIGH",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C20",
  "text": "APU OVERSPEED",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C21",
  "text": "APU SHUTDOWN",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C22",
  "text": "APU STARTER FAIL ON",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C23",
  "text": "AUTO PRESS FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C24",
  "text": "AUX HYD TEMP HIGH",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C25-L",
  "text": "L BATT FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C25-R",
  "text": "R BATT FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C26",
  "text": "BATTERY BAY DOOR",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C27-L",
  "text": "L BLEED FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C27-R",
  "text": "R BLEED FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C28-L",
  "text": "L BLEED LOOP FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C28-R",
  "text": "R BLEED LOOP FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C29",
  "text": "BRAKE FAULT",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C30",
  "text": "CABIN ALTITUDE",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C31",
  "text": "CABIN PRESS FAULT",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C32",
  "text": "CARGO DOOR",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C33",
  "text": "CARGO SMOKE DET FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C34",
  "text": "CPLT BRAKE FAULT",
  "tier": "caution",
  "inhibit": "TO",
  "side": null,
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C35",
  "text": "DITCHING NOT AVAIL",
  "tier": "caution",
  "inhibit": "-",
  "side": null,
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C36",
  "text": "EFIS COMPARATOR INOP",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C37",
  "text": "EFIS MISCOMPARE",
  "tier": "caution",
  "inhibit": "-",
  "side": null,
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C38",
  "text": "ELECTRICAL FAULT",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C39",
  "text": "ELEVATOR SPLIT",
  "tier": "caution",
  "inhibit": "-",
  "side": null,
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C40",
  "text": "ELT ON",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C41",
  "text": "EMER LIGHTS OFF",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C42",
  "text": "EMER LIGHTS ON",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C43",
  "text": "EMERGENCY EXIT",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C44-L",
  "text": "L ENG ANTI-ICE FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C44-R",
  "text": "R ENG ANTI-ICE FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C45-L",
  "text": "L ENG DSPL MISCOMP",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C45-R",
  "text": "R ENG DSPL MISCOMP",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C46-L",
  "text": "L ENG FUEL SOV FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C46-R",
  "text": "R ENG FUEL SOV FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C47-L",
  "text": "L ENG OIL PRESS HIGH",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C47-R",
  "text": "R ENG OIL PRESS HIGH",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C48-L",
  "text": "L OIL TEMP HIGH",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C48-R",
  "text": "R OIL TEMP HIGH",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C49-L",
  "text": "L ENGINE FLAMEOUT",
  "tier": "caution",
  "inhibit": "-",
  "side": "L",
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C49-R",
  "text": "R ENGINE FLAMEOUT",
  "tier": "caution",
  "inhibit": "-",
  "side": "R",
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C50-L",
  "text": "L ENGINE VIBRATION",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C50-R",
  "text": "R ENGINE VIBRATION",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C51",
  "text": "ENGINES FUEL BYPASS",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C52",
  "text": "EQPT RACK TEMP HIGH",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C53-L",
  "text": "L ESS BUS FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C53-R",
  "text": "R ESS BUS FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C54-L",
  "text": "L FADEC FAIL",
  "tier": "caution",
  "inhibit": "TO",
  "side": "L",
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C54-R",
  "text": "R FADEC FAIL",
  "tier": "caution",
  "inhibit": "TO",
  "side": "R",
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C55",
  "text": "FD MODE CHANGE",
  "tier": "caution",
  "inhibit": "TO",
  "side": null,
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C56-L",
  "text": "L FIRE DET FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C56-R",
  "text": "R FIRE DET FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C57",
  "text": "FIRE SYS FAULT",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C58",
  "text": "FIREX APU SQUIB FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C59",
  "text": "FLAPS FAIL",
  "tier": "caution",
  "inhibit": "TO",
  "side": null,
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C60",
  "text": "FLAPS FAULT",
  "tier": "caution",
  "inhibit": "TO",
  "side": null,
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C61",
  "text": "FLAPS NORM PRESS LOW",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C62",
  "text": "FLT SPOILERS DEPLOY",
  "tier": "caution",
  "inhibit": "TO",
  "side": null,
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C63",
  "text": "FLT SPOILERS FAIL",
  "tier": "caution",
  "inhibit": "-",
  "side": null,
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C64",
  "text": "FLT SPOILERS FAULT",
  "tier": "caution",
  "inhibit": "-",
  "side": null,
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C65-L",
  "text": "L FUEL COLLECTOR LOW",
  "tier": "caution",
  "inhibit": "-",
  "side": "L",
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C65-R",
  "text": "R FUEL COLLECTOR LOW",
  "tier": "caution",
  "inhibit": "-",
  "side": "R",
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C66",
  "text": "FUEL IMBALANCE",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C67-L",
  "text": "L FUEL PRESSURE LOW",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C67-R",
  "text": "R FUEL PRESSURE LOW",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C68-L",
  "text": "L FUEL PUMP FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C68-R",
  "text": "R FUEL PUMP FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C69",
  "text": "FUEL QUANTITY FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C70",
  "text": "FUEL QUANTITY LOW",
  "tier": "caution",
  "inhibit": "TO",
  "side": null,
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C71",
  "text": "GEAR BAY DET FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C72",
  "text": "GEAR DISAGREE",
  "tier": "caution",
  "inhibit": "-",
  "side": null,
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C73",
  "text": "GEAR SYS FAIL",
  "tier": "caution",
  "inhibit": "TO",
  "side": null,
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C74-L",
  "text": "L GEN FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C74-R",
  "text": "R GEN FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C75-L",
  "text": "L GEN OVERLOAD",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C75-R",
  "text": "R GEN OVERLOAD",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C76",
  "text": "GND SPLRS NOT ARMED",
  "tier": "caution",
  "inhibit": "TO",
  "side": null,
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C77",
  "text": "GND SPOILERS FAIL",
  "tier": "caution",
  "inhibit": "TO",
  "side": null,
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C78-L",
  "text": "L HYD PRESS LOW",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C78-R",
  "text": "R HYD PRESS LOW",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C79",
  "text": "HYD PTU FAIL",
  "tier": "caution",
  "inhibit": "-",
  "side": null,
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C80-L",
  "text": "L HYD SOV FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C80-R",
  "text": "R HYD SOV FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C81-L",
  "text": "L HYD TEMP HIGH",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C81-R",
  "text": "R HYD TEMP HIGH",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C82-L",
  "text": "L IAPS FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C82-R",
  "text": "R IAPS FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C83",
  "text": "ICE DETECTED",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C84",
  "text": "ICE DETECTOR FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C85-L",
  "text": "L INBD BRAKE FAIL",
  "tier": "caution",
  "inhibit": "TO",
  "side": "L",
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C85-R",
  "text": "R INBD BRAKE FAIL",
  "tier": "caution",
  "inhibit": "TO",
  "side": "R",
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C86",
  "text": "INBD BRAKE PRESS LO",
  "tier": "caution",
  "inhibit": "TO",
  "side": null,
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C87",
  "text": "INBD BRAKES FAIL",
  "tier": "caution",
  "inhibit": "TO",
  "side": null,
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C88",
  "text": "MACH TRIM FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C89-L",
  "text": "L MAIN BUS FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C89-R",
  "text": "R MAIN BUS FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C90",
  "text": "NOSE GEAR DOOR",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C91",
  "text": "NWS FAIL",
  "tier": "caution",
  "inhibit": "TO",
  "side": null,
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C92",
  "text": "NWS LIMIT EXCEEDED",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C93-L",
  "text": "L OUTBD BRAKE FAIL",
  "tier": "caution",
  "inhibit": "TO",
  "side": "L",
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C93-R",
  "text": "R OUTBD BRAKE FAIL",
  "tier": "caution",
  "inhibit": "TO",
  "side": "R",
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C94",
  "text": "OUTBD BRAKE PRESS LO",
  "tier": "caution",
  "inhibit": "TO",
  "side": null,
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C95",
  "text": "OUTBD BRAKES FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C96",
  "text": "OXYGEN QUANTITY LOW",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C97",
  "text": "OXYGEN VALVE CLOSED",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C98",
  "text": "PACK FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C99",
  "text": "PACK LEAK",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C100",
  "text": "PACK LOOP FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C101",
  "text": "PACK TEMP HIGH",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C102",
  "text": "PASSENGER DOOR",
  "tier": "caution",
  "inhibit": "LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C103",
  "text": "PAX OXYGEN AUTO FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C104-L",
  "text": "L PITOT HEAT FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C104-R",
  "text": "R PITOT HEAT FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C105",
  "text": "PFD X-TALK FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C106",
  "text": "PARK/EMER BRAKE ON",
  "tier": "caution",
  "inhibit": "TO",
  "side": null,
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C107",
  "text": "PK/EMER BRK PRESS LO",
  "tier": "caution",
  "inhibit": "TO",
  "side": null,
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C108",
  "text": "PLT BRAKE FAULT",
  "tier": "caution",
  "inhibit": "TO",
  "side": null,
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C109",
  "text": "PRI STAB TRIM FAIL",
  "tier": "caution",
  "inhibit": "-",
  "side": null,
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C110-L",
  "text": "L PROBE HEAT OFF",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C110-R",
  "text": "R PROBE HEAT OFF",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C111-L",
  "text": "L PYLON LOOP FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C111-R",
  "text": "R PYLON LOOP FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C112-L",
  "text": "L REVERSER FAIL",
  "tier": "caution",
  "inhibit": "TO",
  "side": "L",
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C112-R",
  "text": "R REVERSER FAIL",
  "tier": "caution",
  "inhibit": "TO",
  "side": "R",
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C113",
  "text": "ROLL SPOILERS FAIL",
  "tier": "caution",
  "inhibit": "-",
  "side": null,
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C114",
  "text": "ROLL SPOILERS FAULT",
  "tier": "caution",
  "inhibit": "-",
  "side": null,
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C115",
  "text": "ROLL SPOILERS OFF",
  "tier": "caution",
  "inhibit": "-",
  "side": null,
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C116",
  "text": "RUDDER LIMITER FAIL",
  "tier": "caution",
  "inhibit": "-",
  "side": null,
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C117-L",
  "text": "L START ABORTED",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C117-R",
  "text": "R START ABORTED",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C118",
  "text": "SEC STAB TRIM FAIL",
  "tier": "caution",
  "inhibit": "-",
  "side": null,
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C119",
  "text": "SPOILERS FAIL",
  "tier": "caution",
  "inhibit": "-",
  "side": null,
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C120",
  "text": "SPOILERS FAULT",
  "tier": "caution",
  "inhibit": "-",
  "side": null,
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C121",
  "text": "STALL PROTECT FAIL",
  "tier": "caution",
  "inhibit": "-",
  "side": null,
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C122",
  "text": "STALL PUSHER OFF",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C124-L",
  "text": "L STARTER FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C124-R",
  "text": "R STARTER FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C125-L",
  "text": "L STARTER FAIL ON",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C125-R",
  "text": "R STARTER FAIL ON",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C126",
  "text": "STBY PITOT HEAT FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C127-L",
  "text": "L STBY STAT HT FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C127-R",
  "text": "R STBY STAT HT FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C128",
  "text": "TRIM AIR FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C129",
  "text": "TRIM AIR LOOP FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C130-L",
  "text": "L WINDOW HEAT FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C130-R",
  "text": "R WINDOW HEAT FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C131-L",
  "text": "L WING A/ICE FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C131-R",
  "text": "R WING A/ICE FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C132",
  "text": "WING A/ICE LOOP FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C133-L",
  "text": "L WING A/I PRESS HI",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C133-R",
  "text": "R WING A/I PRESS HI",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C134",
  "text": "WING ANTI-ICE FAULT",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C135",
  "text": "WING FUEL TEMP LOW",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C136-L",
  "text": "L WSHLD HEAT FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C136-R",
  "text": "R WSHLD HEAT FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C137",
  "text": "WOW FAIL",
  "tier": "caution",
  "inhibit": "TO",
  "side": null,
  "aural": "Single Chime",
  "voice": null,
  "tone": true
 },
 {
  "id": "C138",
  "text": "XBLEED FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "C139",
  "text": "YAW DAMPER FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": "Single Chime",
  "voice": null
 },
 {
  "id": "A1",
  "text": "IAPS FAN FAULT",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "A2",
  "text": "ACARS MESSAGE",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "A3",
  "text": "AFIS MESSAGE",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "A4",
  "text": "AIR COND FAULT",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "A5-L",
  "text": "L AOA CASE HEAT FAIL",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": null,
  "voice": null
 },
 {
  "id": "A5-R",
  "text": "R AOA CASE HEAT FAIL",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": null,
  "voice": null
 },
 {
  "id": "A6",
  "text": "APU FAULT",
  "tier": "advisory",
  "inhibit": "-",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "A7",
  "text": "APU SHUTDOWN",
  "tier": "advisory",
  "inhibit": "-",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "A8-L",
  "text": "L AUX BUS FAIL",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": null,
  "voice": null
 },
 {
  "id": "A8-R",
  "text": "R AUX BUS FAIL",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": null,
  "voice": null
 },
 {
  "id": "A9-L",
  "text": "L AUX BUS OFF",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": null,
  "voice": null
 },
 {
  "id": "A9-R",
  "text": "R AUX BUS OFF",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": null,
  "voice": null
 },
 {
  "id": "A10",
  "text": "AUX HYD PUMP FAIL ON",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "A11",
  "text": "AUX HYD SYS FAIL",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "A12",
  "text": "CABIN ALT WARN HIGH",
  "tier": "advisory",
  "inhibit": "-",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "A13",
  "text": "CABIN CALL",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": null,
  "voice": null,
  "tone": true
 },
 {
  "id": "A14-L",
  "text": "L BLEED FAULT",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": null,
  "voice": null
 },
 {
  "id": "A14-R",
  "text": "R BLEED FAULT",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": null,
  "voice": null
 },
 {
  "id": "A15",
  "text": "CVR FAIL",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "A16",
  "text": "DCU FAULT",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "A17",
  "text": "DOWNLOAD FADEC",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "A18",
  "text": "ELECTRICAL FAULT",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": null,
  "voice": null,
  "tone": true
 },
 {
  "id": "A19-L",
  "text": "L ENG A/ICE FAIL ON",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": null,
  "voice": null
 },
 {
  "id": "A19-R",
  "text": "R ENG A/ICE FAIL ON",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": null,
  "voice": null
 },
 {
  "id": "A20-L",
  "text": "L ENG IGN FAULT",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": null,
  "voice": null
 },
 {
  "id": "A20-R",
  "text": "R ENG IGN FAULT",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": null,
  "voice": null
 },
 {
  "id": "A21-L",
  "text": "L ENGINE FAULT",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": null,
  "voice": null
 },
 {
  "id": "A21-R",
  "text": "R ENGINE FAULT",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": null,
  "voice": null
 },
 {
  "id": "A22-L",
  "text": "L ENG FUEL TEMP LOW",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": null,
  "voice": null
 },
 {
  "id": "A22-R",
  "text": "R ENG FUEL TEMP LOW",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": null,
  "voice": null
 },
 {
  "id": "A23-L",
  "text": "L ENGINE FUEL BYPASS",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": null,
  "voice": null
 },
 {
  "id": "A23-R",
  "text": "R ENGINE FUEL BYPASS",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": null,
  "voice": null
 },
 {
  "id": "A24-L",
  "text": "L ENGINE MINOR FAULT",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": null,
  "voice": null
 },
 {
  "id": "A24-R",
  "text": "R ENGINE MINOR FAULT",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": null,
  "voice": null
 },
 {
  "id": "A25-L",
  "text": "L ENGINE OIL BYPASS",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": null,
  "voice": null
 },
 {
  "id": "A25-R",
  "text": "R ENGINE OIL BYPASS",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": null,
  "voice": null
 },
 {
  "id": "A26-L",
  "text": "L ENGINE OIL CHIP",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": null,
  "voice": null
 },
 {
  "id": "A26-R",
  "text": "R ENGINE OIL CHIP",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": null,
  "voice": null
 },
 {
  "id": "A27-L",
  "text": "L ENG THRUST FAULT",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": null,
  "voice": null
 },
 {
  "id": "A27-R",
  "text": "R ENG THRUST FAULT",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": null,
  "voice": null
 },
 {
  "id": "A28-L",
  "text": "L ENG VIBRATION FAIL",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": null,
  "voice": null
 },
 {
  "id": "A28-R",
  "text": "R ENG VIBRATION FAIL",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": null,
  "voice": null
 },
 {
  "id": "A29",
  "text": "ENG SYNC/M-HOLD FAIL",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "A30",
  "text": "EQPT RACK COOL FAULT",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "A31-L",
  "text": "L ESS BUS OFF",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": null,
  "voice": null
 },
 {
  "id": "A31-R",
  "text": "R ESS BUS OFF",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": null,
  "voice": null
 },
 {
  "id": "A32",
  "text": "FAX RECEIVED",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "A33-1",
  "text": "FD 1 FAIL",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "1",
  "aural": null,
  "voice": null
 },
 {
  "id": "A33-2",
  "text": "FD 2 FAIL",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "2",
  "aural": null,
  "voice": null
 },
 {
  "id": "A34",
  "text": "FDR FAIL",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "A35",
  "text": "FDR FAULT",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "A36",
  "text": "FIRE SYS FAULT",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": null,
  "voice": null,
  "tone": true
 },
 {
  "id": "A37-1",
  "text": "FIREX BTL 1 FAULT",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "1",
  "aural": null,
  "voice": null
 },
 {
  "id": "A37-2",
  "text": "FIREX BTL 2 FAULT",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "2",
  "aural": null,
  "voice": null
 },
 {
  "id": "A38-1",
  "text": "FIREX BTL 1 LOW",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "1",
  "aural": null,
  "voice": null
 },
 {
  "id": "A38-2",
  "text": "FIREX BTL 2 LOW",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "2",
  "aural": null,
  "voice": null
 },
 {
  "id": "A39",
  "text": "FLAPS RATE LOW",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "A40-L",
  "text": "L FUEL EJECTOR FAIL",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": null,
  "voice": null
 },
 {
  "id": "A40-R",
  "text": "R FUEL EJECTOR FAIL",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": null,
  "voice": null
 },
 {
  "id": "A41",
  "text": "FUEL GRAV XFLOW FAIL",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "A42-L",
  "text": "L FUEL PUMP ON",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": null,
  "voice": null
 },
 {
  "id": "A42-R",
  "text": "R FUEL PUMP ON",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": null,
  "voice": null
 },
 {
  "id": "A43",
  "text": "FUEL QUANTITY FAULT",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "A44",
  "text": "FUEL XFER FAIL",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "A45-L",
  "text": "L HYD DC PUMP FAIL",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": null,
  "voice": null
 },
 {
  "id": "A45-R",
  "text": "R HYD DC PUMP FAIL",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": null,
  "voice": null
 },
 {
  "id": "A46-L",
  "text": "L HYD ENG PUMP FAIL",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": null,
  "voice": null
 },
 {
  "id": "A46-R",
  "text": "R HYD ENG PUMP FAIL",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": null,
  "voice": null
 },
 {
  "id": "A47-L",
  "text": "L HYD SOV CLOSED",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": null,
  "voice": null
 },
 {
  "id": "A47-R",
  "text": "R HYD SOV CLOSED",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": null,
  "voice": null
 },
 {
  "id": "A48",
  "text": "ICE DETECTED",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "A49",
  "text": "ICE DETECTOR FAULT",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "A50",
  "text": "LAV CALL",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": null,
  "voice": null,
  "tone": true
 },
 {
  "id": "A51-L",
  "text": "L MAIN BUS OFF",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": null,
  "voice": null
 },
 {
  "id": "A51-R",
  "text": "R MAIN BUS OFF",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": null,
  "voice": null
 },
 {
  "id": "A52",
  "text": "MANUAL PRESS FAIL",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "A53",
  "text": "MFD X-TALK FAIL",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "A54",
  "text": "NWS FAULT",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "A55",
  "text": "PACK COOL AIR FAIL",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "A56-L",
  "text": "L PROBE HT CTLR FAIL",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": null,
  "voice": null
 },
 {
  "id": "A56-R",
  "text": "R PROBE HT CTLR FAIL",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": null,
  "voice": null
 },
 {
  "id": "A57",
  "text": "PROX SYS FAULT",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "A58",
  "text": "RAM AIR FAIL",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "A59",
  "text": "RDC FAULT",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "A60",
  "text": "RUDDER LIMITER FAULT",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "A61",
  "text": "SELCAL DATALINK",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "A62-1",
  "text": "SELCAL HF 1",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "1",
  "aural": null,
  "voice": null
 },
 {
  "id": "A62-2",
  "text": "SELCAL HF 2",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "2",
  "aural": null,
  "voice": null
 },
 {
  "id": "A63-1",
  "text": "SELCAL VHF 1",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "1",
  "aural": null,
  "voice": null
 },
 {
  "id": "A63-2",
  "text": "SELCAL VHF 2",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "2",
  "aural": null,
  "voice": null
 },
 {
  "id": "A63-3",
  "text": "SELCAL VHF 3",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "3",
  "aural": null,
  "voice": null
 },
 {
  "id": "A64",
  "text": "SPOILERS FAULT",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": null,
  "voice": null,
  "tone": true
 },
 {
  "id": "A65",
  "text": "STAB TRIM FAULT",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "A66",
  "text": "STALL PROTECT FAULT",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "A67-L",
  "text": "L STALL SHAKER FAIL",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "L",
  "aural": null,
  "voice": null
 },
 {
  "id": "A67-R",
  "text": "R STALL SHAKER FAIL",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": "R",
  "aural": null,
  "voice": null
 },
 {
  "id": "A68",
  "text": "STALL WARN BASIC",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "A69",
  "text": "STBY INST BATT FAULT",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "A70",
  "text": "TAT HEAT FAIL",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "A71",
  "text": "TAWS BASIC FAIL",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "A72",
  "text": "TAWS SYSTEM FAIL",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "A73",
  "text": "TAWS TERR FAIL",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "A74",
  "text": "TAWS TERR NOT AVAIL",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "A75",
  "text": "TAWS WINDSHEAR FAIL",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "A76",
  "text": "WING ANTI-ICE FAULT",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "A77",
  "text": "WING SOURCE-XBLEED",
  "tier": "advisory",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "S1",
  "text": "AIR COND MAN TEMP ON",
  "tier": "status",
  "inhibit": "-",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "S2",
  "text": "AIR SOURCE OFF",
  "tier": "status",
  "inhibit": "-",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "S3",
  "text": "APU GEN OFF",
  "tier": "status",
  "inhibit": "-",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "S4-A",
  "text": "AURAL WARN A MUTED",
  "tier": "status",
  "inhibit": "-",
  "side": "A",
  "aural": null,
  "voice": null
 },
 {
  "id": "S4-B",
  "text": "AURAL WARN B MUTED",
  "tier": "status",
  "inhibit": "-",
  "side": "B",
  "aural": null,
  "voice": null
 },
 {
  "id": "S5",
  "text": "AUTO APR OFF",
  "tier": "status",
  "inhibit": "-",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "S6",
  "text": "AUTOPILOT DISCONNECT",
  "tier": "status",
  "inhibit": "-",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "S7-L",
  "text": "L BATT OFF",
  "tier": "status",
  "inhibit": "-",
  "side": "L",
  "aural": null,
  "voice": null
 },
 {
  "id": "S7-R",
  "text": "R BATT OFF",
  "tier": "status",
  "inhibit": "-",
  "side": "R",
  "aural": null,
  "voice": null
 },
 {
  "id": "S8",
  "text": "BLEED OFF",
  "tier": "status",
  "inhibit": "-",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "S9",
  "text": "BUS TIE MAN OPEN",
  "tier": "status",
  "inhibit": "-",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "S10",
  "text": "CARGO DOOR",
  "tier": "status",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "S11",
  "text": "DITCHING ON",
  "tier": "status",
  "inhibit": "-",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "S12",
  "text": "EMER DEPRESS ON",
  "tier": "status",
  "inhibit": "-",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "S13-L",
  "text": "L ENG ANTI-ICE ON",
  "tier": "status",
  "inhibit": "-",
  "side": "L",
  "aural": null,
  "voice": null
 },
 {
  "id": "S13-R",
  "text": "R ENG ANTI-ICE ON",
  "tier": "status",
  "inhibit": "-",
  "side": "R",
  "aural": null,
  "voice": null
 },
 {
  "id": "S14",
  "text": "ENG ANTI-ICE ON",
  "tier": "status",
  "inhibit": "-",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "S15-L",
  "text": "L ENG FUEL SOV CLSD",
  "tier": "status",
  "inhibit": "-",
  "side": "L",
  "aural": null,
  "voice": null
 },
 {
  "id": "S15-R",
  "text": "R ENG FUEL SOV CLSD",
  "tier": "status",
  "inhibit": "-",
  "side": "R",
  "aural": null,
  "voice": null
 },
 {
  "id": "S16-L",
  "text": "L ENGINE SHUTDOWN",
  "tier": "status",
  "inhibit": "-",
  "side": "L",
  "aural": null,
  "voice": null
 },
 {
  "id": "S16-R",
  "text": "R ENGINE SHUTDOWN",
  "tier": "status",
  "inhibit": "-",
  "side": "R",
  "aural": null,
  "voice": null
 },
 {
  "id": "S17",
  "text": "FIRE SYS IN TEST",
  "tier": "status",
  "inhibit": "-",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "S18",
  "text": "FIRE SYS TEST OK",
  "tier": "status",
  "inhibit": "-",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "S19",
  "text": "FUEL BALANCED",
  "tier": "status",
  "inhibit": "-",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "S20",
  "text": "FUEL GRAV XFLOW OPEN",
  "tier": "status",
  "inhibit": "-",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "S21-L",
  "text": "L FUEL PUMP OFF",
  "tier": "status",
  "inhibit": "-",
  "side": "L",
  "aural": null,
  "voice": null
 },
 {
  "id": "S21-R",
  "text": "R FUEL PUMP OFF",
  "tier": "status",
  "inhibit": "-",
  "side": "R",
  "aural": null,
  "voice": null
 },
 {
  "id": "S22-L",
  "text": "L FUEL PUMP ON",
  "tier": "status",
  "inhibit": "-",
  "side": "L",
  "aural": null,
  "voice": null
 },
 {
  "id": "S22-R",
  "text": "R FUEL PUMP ON",
  "tier": "status",
  "inhibit": "-",
  "side": "R",
  "aural": null,
  "voice": null
 },
 {
  "id": "S23",
  "text": "FUEL XFER OPEN",
  "tier": "status",
  "inhibit": "-",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "S24-L",
  "text": "L GEN OFF",
  "tier": "status",
  "inhibit": "-",
  "side": "L",
  "aural": null,
  "voice": null
 },
 {
  "id": "S24-R",
  "text": "R GEN OFF",
  "tier": "status",
  "inhibit": "-",
  "side": "R",
  "aural": null,
  "voice": null
 },
 {
  "id": "S25",
  "text": "GND SPOILERS OFF",
  "tier": "status",
  "inhibit": "-",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "S26",
  "text": "HYD PUMP NOT AUTO",
  "tier": "status",
  "inhibit": "-",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "S27-L",
  "text": "L HYD SOV CLOSED",
  "tier": "status",
  "inhibit": "-",
  "side": "L",
  "aural": null,
  "voice": null
 },
 {
  "id": "S27-R",
  "text": "R HYD SOV CLOSED",
  "tier": "status",
  "inhibit": "-",
  "side": "R",
  "aural": null,
  "voice": null
 },
 {
  "id": "S28",
  "text": "MANUAL PRESS ON",
  "tier": "status",
  "inhibit": "-",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "S29",
  "text": "NWS OFF",
  "tier": "status",
  "inhibit": "-",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "S30",
  "text": "PACK ONLY",
  "tier": "status",
  "inhibit": "-",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "S31",
  "text": "PARK/EMER BRAKE ON",
  "tier": "status",
  "inhibit": "-",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "S32",
  "text": "PASSENGER DOOR",
  "tier": "status",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "S33",
  "text": "PAX OXYGEN OFF",
  "tier": "status",
  "inhibit": "-",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "S34",
  "text": "PAX OXYGEN ON",
  "tier": "status",
  "inhibit": "-",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "S35",
  "text": "PITCH DISCONNECT",
  "tier": "status",
  "inhibit": "-",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "S36",
  "text": "PROBE HEAT TEST OK",
  "tier": "status",
  "inhibit": "-",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "S37",
  "text": "RAM AIR ON",
  "tier": "status",
  "inhibit": "-",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "S38-L",
  "text": "L REVERSER INOP",
  "tier": "status",
  "inhibit": "-",
  "side": "L",
  "aural": null,
  "voice": null
 },
 {
  "id": "S38-R",
  "text": "R REVERSER INOP",
  "tier": "status",
  "inhibit": "-",
  "side": "R",
  "aural": null,
  "voice": null
 },
 {
  "id": "S39",
  "text": "ROLL DISCONNECT",
  "tier": "status",
  "inhibit": "-",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "S40",
  "text": "ROLL SPOILERS OFF",
  "tier": "status",
  "inhibit": "-",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "S41",
  "text": "RUD LIMITER IN TEST",
  "tier": "status",
  "inhibit": "-",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "S42",
  "text": "SEC STAB TRIM ON",
  "tier": "status",
  "inhibit": "-",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "S43",
  "text": "STAB TRIM OFF",
  "tier": "status",
  "inhibit": "-",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "S44",
  "text": "STBY INST OFF",
  "tier": "status",
  "inhibit": "-",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "S45",
  "text": "TAWS FLAPS OFF",
  "tier": "status",
  "inhibit": "-",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "S46",
  "text": "TAWS GS WARN OFF",
  "tier": "status",
  "inhibit": "-",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "S47",
  "text": "TAWS TERR OFF",
  "tier": "status",
  "inhibit": "-",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "S48",
  "text": "TRIM AIR ONLY",
  "tier": "status",
  "inhibit": "-",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "S49",
  "text": "WING ANTI-ICE ON",
  "tier": "status",
  "inhibit": "-",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "S50",
  "text": "WING/ENG ANTI-ICE ON",
  "tier": "status",
  "inhibit": "-",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "S51",
  "text": "WING SOURCE-XBLEED",
  "tier": "status",
  "inhibit": "-",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "S52",
  "text": "YAW DAMPER OFF",
  "tier": "status",
  "inhibit": "-",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "S53",
  "text": "XBLEED OPEN",
  "tier": "status",
  "inhibit": "-",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "X1",
  "text": "ELEC HYD GEN FAIL",
  "tier": "caution",
  "inhibit": "TO/LAND",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "X2",
  "text": "ELEC HYD GEN ON",
  "tier": "status",
  "inhibit": "-",
  "side": null,
  "aural": null,
  "voice": null
 },
 {
  "id": "X3-L",
  "text": "L ENG OIL TEMP HIGH",
  "tier": "caution",
  "inhibit": "-",
  "side": "L",
  "aural": null,
  "voice": null,
  "inhibitAssumed": true
 },
 {
  "id": "X4-R",
  "text": "R ENG OIL TEMP HIGH",
  "tier": "caution",
  "inhibit": "-",
  "side": "R",
  "aural": null,
  "voice": null,
  "inhibitAssumed": true
 },
 {
  "id": "X5",
  "text": "ENG MACH HOLD FAIL",
  "tier": "advisory",
  "inhibit": "-",
  "side": null,
  "aural": null,
  "voice": null,
  "inhibitAssumed": true
 },
 {
  "id": "X6",
  "text": "ENGINE SYNC FAIL",
  "tier": "advisory",
  "inhibit": "-",
  "side": null,
  "aural": null,
  "voice": null,
  "inhibitAssumed": true
 },
 {
  "id": "X7-L",
  "text": "L ENGINE ANTI-ICE FAULT",
  "tier": "advisory",
  "inhibit": "-",
  "side": "L",
  "aural": null,
  "voice": null,
  "inhibitAssumed": true
 },
 {
  "id": "X8-R",
  "text": "R ENGINE ANTI-ICE FAULT",
  "tier": "advisory",
  "inhibit": "-",
  "side": "R",
  "aural": null,
  "voice": null,
  "inhibitAssumed": true
 }
];

const CAS_BY_KEY = (() => {
  const m = new Map();
  for (const e of CAS_CATALOGUE) { m.set(e.text + "\u0000" + e.tier, e); }
  return m;
})();

const CAS_WARNED = new Set();
function casEntry(text, tier) {
  const e = CAS_BY_KEY.get(text + "\u0000" + tier);
  if (!e && !CAS_WARNED.has(text + tier)) {
    CAS_WARNED.add(text + tier);
    console.warn("CAS: no catalogue entry for " + JSON.stringify(text) + " at tier " + tier);
  }
  return e || null;
}


function casInhibitFor(text, tier) {
  const e = casEntry(text, tier);
  return e ? e.inhibit : "-";
}

if (typeof module !== "undefined") { module.exports = { CAS_CATALOGUE, CAS_BY_KEY, casEntry, casInhibitFor }; }
