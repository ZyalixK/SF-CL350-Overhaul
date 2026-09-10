# SF-CL350-Overhaul: Sim Federation Challenger 350 Community Mod

This is the official repository for the ZyalixKBMD (Kaydence) & Drag_Required (Dillan) SimFederation Challenger 350 Mod Project. This is a collaborative, community-driven improvement mod designed to overhaul the aircraft's systems and flight model for Microsoft Flight Simulator. 

we ship a package for both **MSFS 2020** and **MSFS 2024**. theyre identical apart from the
package title and one panel config block.

**if youre on 2024:** it loads and flies, but 2024 changed the flight model and the handling wont
match what i tuned. stall behaviour and pitch attitude are different on identical files. so please
dont report handling stuff yet, itll send me looking at things that arent bugs. tell me youre on
2024 when you report anything. what IS useful from 2024 is the avionics, that should port fine.

## ⚠️ Requirements & Copyright Disclaimer
**You must legally own the Sim Federation Challenger 350 to use this mod.** 

This project is strictly a **freeware configuration and logic modification**. This repository DOES NOT contain any proprietary assets, including:
* ❌ 3D Model files (`.gltf`, `.bin`)
* ❌ Texture assets (`.dds`, `.png`)
* ❌ Sound/Wwise soundbanks (`.pck`, `.BNK`) — *UNLESS YOU ARE A SOUND DEVELOPER HOPING TO COLLAB!*

Any Pull Request containing proprietary assets from Simfederation will be closed immediately. 

## 🛠️ Features (Planned & Implemented)

**done**
* [x] **flight model.** thrust lapse, lift curve, wing washout, CG and station loading rebuilt off
      real 350 numbers instead of whatever aircraft this was ported from.
* [x] **avionics load path.** the PFD and both FMCs were loading the base game's WT21 files instead
      of the plane's own. that one thing was behind most of the avionics bugs.
  [x] complete avionics overhaul
* [x] **EICAS and CAS.** live engine indication, and a CAS list with real triggers, tier colours,
      arrival order and flight phase inhibits.
* [x] **synoptic pages.** electrical, ECS, anti-ice, fuel, hydraulics, flight controls.
* [x] **thrust reversers.** door sequencing, the interlock balk, REV annunciation, and a fadec
      limit that falls as you slow down.
* [x] **speed protection.** barber pole that follows flaps and gear, plus mach hold.

**still to do**
* [ ] absolute thrust per N1. the lapse with altitude is fixed but the absolute number isnt, so
      you'll need about 99% N1 up high where the real aircraft climbs at 85-86%.
* [ ] 2024 handling.
* [ ] and more

## 📥 Installation & Releases

**you need the Sim Federation Challenger 350 installed first.** this mod doesnt contain the
aircraft, its a set of replacement config and logic files that sit on top of it.

grab the release for your sim off the Releases page, then drop these in `Community`:

```
simfederation-aircraft-challenger-350-overhaul/        <- MSFS 2020
lunar-challenger-350/
```

```
simfederation-aircraft-challenger-350-overhaul-2024/   <- MSFS 2024
```

install the overhaul folder for **one** sim, not both. `lunar-challenger-350` you need either way,
thats the FMC plugin.

few things before you fly it:

* it spawns cold and dark. right battery on before left, that stops an uncommanded APU start.
* read the known issues in the [CHANGELOG](CHANGELOG.md) before reporting anything.

dont download the source as a ZIP and expect it to work. the Releases page has the built package
with a proper `layout.json`, the repo doesnt.

To see what we are working on and track our version history, check out our [CHANGELOG](CHANGELOG.md).

## 🤝 Contributing
We welcome contributions! If you are a developer, pilot, or modder who wants to help improve this aircraft, please read our [CONTRIBUTING](CONTRIBUTING.md) for our full Git branching and file restriction guidelines.

**Quick Collaboration Links:**
* **Reporting Bugs:** Please use our [Issue Template](ISSUE_TEMPLATE.md) to report bugs or request features in the Issues tab.
* **Submitting Code:** Review our [Pull Request Template](PULL_REQUEST_TEMPLATE.md) and ensure you have run the layout generator before submitting any changes.
* **Known Issues:** Check our [Current Issues/Problems](PROBLEM-LIST.md) to see what bugs we are currently aware of and actively fixing.

## 🏆 Credits & Contributors
This community improvement mod is a collaborative effort. 
* [**@ZyalixK**](https://github.com/ZyalixK) - Project Lead - [Flightsim.to Profile](https://flightsim.to/profile/Kaydence)
* [**@dillan4561 (Drag_Required)**](https://github.com/dillan4561) - Co-Developer - [Flightsim.to Profile](https://flightsim.to/profile/Drag_Required)

For a full list of acknowledgements regarding the original aircraft and Microsoft/Working Title avionics logic, please see our [CREDITS FILE](CREDITS.md).

## ⚖️ License
This project is licensed under the **GNU General Public License Version 3** (see the full [LICENSE](LICENSE) file). 
Everyone is permitted to copy and distribute verbatim copies of this license document, but changing it is not allowed. The GNU General Public License is intended to guarantee your freedom to share and change all versions of a program; to make sure it remains free software for all its users.
