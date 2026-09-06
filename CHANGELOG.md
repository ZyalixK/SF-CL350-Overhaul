# Changelog

All notable changes to the SF-CL350-Overhaul project will be documented in this file.

## FINAL RELEASE [1.0.0] - 2026-xx-xx
### Added
- placeholder
### Changed
- placeholder
### Fixed
- placeholder

## [0.3.0] - 2026-09-06
beta. going to a small test group, not public yet. read the known issues before reporting anything.

### Added
- CAS messages actually work now. real triggers, real tier colours, newest message at the top of
  its block, and the flight phase inhibits from the alert tables instead of everything showing all
  the time.
- synoptic pages read the actual aircraft: electrical, ECS, anti-ice, fuel, hydraulics, flight
  controls.
- thrust reversers. the doors run on a real timer, the levers are balked at reverse idle until the
  doors lock like the real thing, REV shows white then green on the N1 dials (amber if you pull
  them in the air), and the fadec readout blanks while the doors move then comes back showing max
  reverse N1.
- reverse N1 limit falls as you slow down, which is what the fadec does in the real aircraft.
- barber pole follows flaps and gear now. 0.2.0 gave it Vmo and Mmo, but there was still no
  overspeed warning at all past VFE or VLE. there is now.
- mach hold.
- engine start sequencing, flameout detection, engine sync.
- fire panel including the bottle discharge messages.
- copilot MCP buttons and the LWR menu.
- an MSFS 2024 package alongside the 2020 one.
- 46 automated test suites that run against the package before anything ships. they check CAS
  triggers, display geometry, reverse thrust, the electrical wiring, line endings and layout.json.

### Changed
- APU generator is wired to both main buses through two contactors now, which is how the real
  electrical system is split.
- reverse authority, `min_throttle_limit` -0.25 to -0.44, with a matching gain in the fadec so full
  lever travel actually reaches it.
- spawn states. trim, generators, bleeds, ground spoilers, lighting and emergency lights were all
  spawning in the wrong position.
- EICAS and PFD geometry measured off real cockpit frames: the preselect and constraint boxes, the
  baro and mach readouts, the EICAS column separators.
- stab trim gauge scale. what looked like a trim clamp at 4.5 was the aircraft's own nose down
  stop drawn on the wrong scale.

### Fixed
- reverse thrust did nothing at all. three separate bugs: a 100x unit mismatch so the reverse fadec
  mode never even engaged, a ground mode that grabbed every frame on the rollout, and a lever
  mapping that maxed out at a quarter of travel. doors and sound worked the whole time, which is
  why it looked like a tuning problem instead of dead code.
- APU generator couldnt power the aircraft or charge the batteries. it was on a single dead end bus
  on the left side, so the right side got nothing and both batteries drained on APU power.
- probe and engine anti-ice blocks were commented out in the shipped file.
- black PFDs, dead CDUs and MFDs showing placeholder numbers on MSFS 2024. the PFD and FMC pages
  were loading the avionics sdk out of the base games shared WT21 folder instead of the one this
  aircraft ships. 2020 finds it there, 2024 doesnt, and with no sdk the display scripts never run.
  the MFD always loaded the local copy, which is why it was the only one that half worked, and why
  this took three weeks to find. the other two do the same thing now.
- LOD popping on 2024. that was the 2024 manifest, not the model. it was carrying 2024 sdk build
  fields copied off another package. its a copy of the 2020 manifest now apart from the title.
- ICE DETECTED showing at cruise. it had a warm limit and no cold one, so it stayed on at FL410 in
  -56 sat where ice physically cant form. it needs supercooled liquid water and there isnt any
  below about -40. it also used the precip readout, which is a weather state and not a measurement
  at the aircraft, so it kept the message up above the cloud tops. cloud plus a real temperature
  window now.

## [0.2.0] - 2026-08-16
dillan's work merged in, gone through file by file against the stock package. tested by installing
straight over the base aircraft, not packaged.

### Added
- real Vmo and Mmo. 300 KIAS below 8,000 ft, 320 above, M0.83 above 29,475 ft. the stock schedule
  was the donor aircraft's, 260/305 and M0.77.
- `<PERF MENU` link on FMC INDEX 2/2, plus a handler so the PERF MENU keys actually go to the
  takeoff and approach ref pages.

### Changed
- PFD scaling and layout from dillan: flight director offsets, tape positions, font sizes, and the
  attitude cross pointer rule.
- `maximumMach` 0.8 to 0.83 in both copies of `wtg3000common.js`. the PFD loads the WT21 one, both
  get patched because theyre identical and either can get picked up.

### Fixed
- overspeed was going off around M0.787 instead of at Mmo. `calculateMachBarberSpeed` had the
  donor's M0.77 in three places.
- `WT21_FMC.html` line 18 pointed at an `msfssdk.js` path that doesnt exist in this package.

### Notes
- dillan's full map MFD mode is parked, not dropped. its good work and its waiting on a duplicate
  static method in `WT21_MFD.js` and someone confirming the CCP H-event names. going in a later
  release.

## [0.1.0] - 2026-08-16
alpha. first flyable build, tagged `Alpha`. repo was set up on 2026-07-24 and thats folded in here.

### Added
- repo setup, file structure for SimObjects and html_ui, project templates.

### Changed
- `inlet_area` 3 to 2.0. this was the cornerstone issue. it inflates ram drag so hard the engines
  lose most of their net thrust as you climb, so you'd get above the 20s and just stop going up.
  climb to cruise went from 46 minutes to 14 and the thrust lapse exponent went from sigma^1.47 to
  sigma^0.82, which is actually in the range a real turbofan does.
- `wing_twist` 0 to -4. no washout at all meant both wingtips stalled at the same time and it would
  straight up drop a wing on takeoff.
- `lift_coef_aoa_table` rewritten, stall angle and lift slope. thats what was making the takeoff
  roll so long.
- `empty_weight_CG_position` moved back and `station_load.2` through `.11` moved aft 5.4 ft, all 8
  pax and both baggage. sits around 30.5 %MAC loaded now, which is where it should be.
- `flaps_up_stall_speed` 122 to 130, `full_flaps_stall_speed` 105 to 106.
- `max_castering_angle` 3.141593 to 0. the nosewheel was set to fully free castering, which is not
  a thing this aircraft does.
- `auto_spoiler_available` 0 to 1.
- autopilot `max_pitch` 25 to 20.
- `take_off_speed_min_weight` and `take_off_speed_max_weight` 10900/17900 to 23389/40600. both of
  those were still the cj4's weight range.
- FMC weights. BOW 9860 to 23389, MTOW 17110 to 40600, MLW 15660 to 34150. climb IAS 240 to 250,
  climb and cruise mach to 0.80. flap options are 0/10/20 now.
- lunar plugin MTOW and MLW brought in line.

### Fixed
- `PANEL.cfg` was pointing the PFD and both FMCs at the base game's WT21 folder instead of the ones
  that ship with the plane. this one thing was the root cause of most of the avionics bugs, and it
  wasted a stupid amount of time because fixing FMC.js changed nothing on screen. the script import
  paths inside `WT21_PFD.html` and `WT21_FMC.html` had the same problem.
- PFD was missing its `wtg3000common` stylesheet.
- runway identifier was blank on the FMC.
- BOW entry field was capped too low to even type the real BOW in.
