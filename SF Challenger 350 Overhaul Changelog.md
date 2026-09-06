# challenger 350 overhaul - beta 0.3.0

heads up before anything else: this is a beta and its going to 3 people, not the public. stuff in here is stable enough to fly but the known issues list at the bottom is real, please read it so nobody reports the same 4 things i already know about.

quick context on why this mod exists. the simfed 350 is a port, not a build. once you start digging its pretty obvious a lot of it is still whatever aircraft it came from, especially in the FMC where basically every weight was still the donor's numbers. so a lot of this isnt "tuning", its just putting the right aircraft's values in.

it went from unflyable to acceptable. its not finished.

---

## the big ones

**thrust.** this was the cornerstone issue and it made the plane miserable. climb performance fell apart with altitude, you'd get above the 20s and it just stopped going up. turned out `inlet_area` was set to 3, which inflates ram drag so hard the engines lose most of their net thrust as you climb. so dropped it to 2.0.

climb to cruise went from **46 minutes to 14**. the thrust lapse exponent went from sigma^1.47 to sigma^0.82, which is actually in the range a real turbofan does.

**the avionics were loading the wrong files.** `PANEL.cfg` was pointing the PFD and both FMCs at the base game's WT21 folder instead of the ones that ship with the plane. this one thing was the root cause of most of the avionics bugs, and it wasted a stupid amount of my time because i kept fixing FMC.js and nothing changed on screen. repointed all three, plus fixed the script import paths inside WT21_PFD.html and WT21_FMC.html which had the same problem.

if you only test one thing, test the FMC. it should be a different aircraft now.

**wing drop.** the wing had `wing_twist = 0`, so no washout at all, so both wingtips stalled at the same time and it would just straight up stall a wing on takeoff and then you recreate a mayday disaster episode (i love those). set it to -4.

**the lift curve was wrong** and thats what was making the takeoff roll so long. rewrote `lift_coef_aoa_table`. rotation now happens where it should, hitting 128kt on the numbers with weights, this is still being worked on!!

**CG.** empty CG was too far forward and passengers dragged it further forward, so the plane was nose heavy at basically every realistic loading. moved `empty_weight_CG_position` back and moved all the cabin and baggage stations aft 5.4ft. now sits around 30.5 %MAC loaded, which is where it should be.

this version DOES NOT have the TCAS FAIL fix fully implemented yet, its on my own testing version as it involves the FMC and the MFD.
---

## everything else being shipped

**flight_model.cfg**
- `wing_twist` 0 -> -4
- `lift_coef_aoa_table` rewritten, stall angle and lift slope
- `empty_weight_CG_position` -5.75 -> -5.99
- `station_load.2` through `.11` moved aft 5.4ft (all 8 pax + both baggage)
- `flaps_up_stall_speed` 122 -> 130, `full_flaps_stall_speed` 105 -> 106
- `max_castering_angle` 3.141593 -> 0. the nosewheel was set to fully free castering, which is not a thing this aircraft does
- `auto_spoiler_available` 0 -> 1

**engines.cfg**
- `inlet_area` 3 -> 2.0

**systems.cfg**
- autopilot `max_pitch` 25 -> 20

**cockpit.cfg**
- `take_off_speed_min_weight` 10900 -> 23389
- `take_off_speed_max_weight` 17900 -> 40600
- (both of those were still the cj4'sweight range)

**AntiIce.xml**
- the entire probe and engine anti-ice block was commented out in the shipped file. PROBES_L, PROBES_R, ENG_L, ENG_R, all of it just disabled. uncommented it

**panel/PANEL.cfg**
- PFD and both FMCs repointed to the aircraft's own WT21 files

**panel/panel.xml**
- added the VNAV mach limit block to both FMCs and the PFD, max 0.83. overspeed was going at around .787

**WT21_PFD.html / WT21_FMC.html**
- script import paths fixed, same wrong-folder problem as PANEL.cfg
- PFD was also missing its wtg3000common stylesheet

**FMC.js**
- BOW 9860 -> 23389
- MTOW 17110 -> 40600 (5 places)
- MLW 15660 -> 34150 (5 places)
- climb IAS 240 -> 250, climb and cruise mach -> 0.80
- flap options are 0/10/20 now instead of whatever was there
- runway identifier actually displays instead of being blank
- BOW entry field was capped too low to even type the real BOW in, raised to 30000

**lunar plugin**
- MTOW/MLW brought in line with the above

---

## known issues, please dont report these

- **takeoff perf page gives VR about 44kt high.** im rebuilding it off real departure data, its next on the list
- **thrust per N1 is still roughly 30% low.** the lapse with altitude is fixed but the absolute number isnt. you'll need about 99% N1 up high where the real aircraft climbs at 85-86%. so it climbs now, it just does it at a silly N1
- **lunar's PERF INIT and the DEFAULTS acars pages dont attach for some reason.** side effect of making the plane load its own FMC. FPLN RECALL and datalink weather (i think datalink weather, i know for sure FPLN recall works. haven't tested with beyondatc, sayintentions, or vats.) do work. i know why and roughly how to fix it
- **PFD and MFD have cosmetic scaling inaccuracies.** known, low priority, will work on after the main issues are fixed
- **reverse thrust vs idle N1.** correct idle N1 breaks the reversers and working reversers need a wrong idle N1. gonna look deeper into this to fix the logic hopefully
- **no N1 sync between engines**

## if you're on msfs 2024

it loads and flies, but **2024 changed the flight model** and the handling will not match what i tuned FOR NOW. stall behaviour and pitch attitude are different in 2024 on identical files.

so if you're on 2024, **tell me** and please dont report handling stuff yet, itll send me looking at things that arent bugs. what IS useful from 2024 is the avionics: does the FMC come up, are the weights right, does the runway show, does overspeed still happen at incorrect mach speeds (.787 or so when it should be at .83). that stuff should port over fine and i eventually will check myself later.

---

## install

two folders, both go in Community:

```
simfederation-aircraft-challenger-350-overhaul/
lunar-challenger-350/
```

the overhaul folder only contains changed files, it sits on top of the base simfed 350. you still need that installed.