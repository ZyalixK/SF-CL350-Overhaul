# Contributing to the SF-CL350-Overhaul Project

Thank you for your interest in contributing to the Sim Federation Challenger 350 Improvement Mod!

To keep our repository clean, legal, and easy to collaborate on, please follow these guidelines when submitting changes.

---

## 🚨 Copyright & File Restrictions

This project is strictly a **freeware configuration and logic modification**.

**DO NOT submit or push any of the following proprietary assets:**
* ❌ 3D Model files (`.gltf`, `.bin`)
* ❌ Texture assets (`.dds`, `.png`)
* ❌ Sound/Wwise soundbanks (`.pck`, `.BNK`) [UNLESS YOU ARE A SOUND DEVELOPER HOPING TO COLLAB!]

Any Pull Request containing proprietary assets from Simfederation will be closed.

---

## 🛠️ Development Workflow

1. **Work in a Branch:** Never push code directly to `main`. Create a feature branch named after your task (e.g., `feature/flight-model-tweak` or `fix/autopilot-xml`).
2. **Use EditorConfig:** Ensure your code editor respects the `.editorconfig` rules to maintain clean line formatting and index (if you use VSCode, make sure to get the "EditorConfig for VS Code" extension)
3. **Run the Layout Generator:** Before submitting a Pull Request, run `MSFSLayoutGenerator.exe` to update `layout.json` with your file changes.
4. **Test in Simulator:** Always load the aircraft in MSFS to confirm it spawns correctly and functions without throwing gauge/system errors.

---

## 📝 Submitting Pull Requests (PRs)

* Open a Pull Request from your feature branch to `main`.
* Include a clear description of what files were changed and what behavior was improved or fixed, and add appropriate labels.
* Link the PR to a relevant issue if applicable (e.g., `Fixes #3`).
* Wait for code review approval before merges.
