# D10 Success Sound Player

A Foundry VTT add-on module for the **World of Darkness 20th Edition** system, synchronized with **Dice So Nice!**.

## Features

- Plays a distinct sound for 1–10 successes and 11+ successes.
- Separate sounds for failure and botch.
- Optional exceptional-success sound and threshold.
- Browse for a folder and individual audio files in Foundry's FilePicker.
- Per-client volume and playback settings.
- Option to play only sounds for your own rolls.
- Plays after Dice So Nice! reports that the 3D roll has completed.

## Requirements

- Foundry VTT 12–14 (manifest declares minimum 12, verified 14).
- World of Darkness 20th Edition system (`worldofdarkness`).
- Dice So Nice! module (`dice-so-nice`).

## Installation

1. Unzip `d10-success-sound-player` into `Data/modules/`.
2. The resulting path must be `Data/modules/d10-success-sound-player/module.json`.
3. Start or reload your world.
4. Open **Game Settings → Manage Modules**.
5. Enable **D10 Success Sound Player** and reload.
6. As GM, open **Game Settings → Module Settings → D10 Success Sound Player → Configure sounds**.
7. Choose the root sound folder and individual audio files, then save.
8. All connected players will use the same world configuration automatically; they do not need to run a macro or configure anything.

## Sound files

No sound effects are bundled. Select your own `.wav`, `.mp3`, or other browser-supported audio files using the file picker.

Suggested server folder: `Data/sounds/wod20/`. In the module settings, enter/select it as `sounds/wod20` (do not include the leading `Data/`). Foundry audio paths are relative to the public Data directory.

## Settings

Settings are world-scoped. The GM chooses the root folder, sound files, and volume once; every connected client reads the same configuration and plays the audio locally. The `Only rolls made by me` option, if enabled, limits each client's playback to messages authored by that client. Leave it disabled if everyone should hear sounds for everyone's rolls.

## Compatibility notes

- The module listens to Dice So Nice!'s `diceSoNiceRollComplete` hook, which fires after the dice animation has finished.
- It currently recognizes WoD20 chat cards containing `.wod20-roll` and result elements matching `.tray-roll-area .tray-success-area`.
- Botch/failure labels are read from the WoD20 localization keys `wod.dice.botch` and `wod.dice.fail`, with English text fallbacks.
- WoD20's rendered chat markup can change between system releases. If a particular roll type is not detected, inspect its chat card markup and adjust `findWoD20ResultAreas()` / `parseWoD20Outcome()` in `scripts/main.js`.

## Troubleshooting

- Confirm both WoD20 and Dice So Nice! are active.
- In the sound field, use the exact path returned by Foundry FilePicker. For files in `Data/sounds/wod20/`, the path should look like `sounds/wod20/example.mp3`, not `Data/sounds/wod20/example.mp3`.
- Do not enter a server OS path such as `/home/foundry/...`; Foundry expects a public-directory-relative path or a valid hosted URL.
- Use the play buttons in the configuration window; the browser console logs the exact path being played.
- Use the play buttons in the configuration window to test selected files.
- Check the browser console for messages beginning with `d10-success-sound-player`.

## License

MIT. This is an independent community module and is not affiliated with the WoD20 system author or the Dice So Nice! developers.


### Version 1.2.0 rename
- Module renamed to **D10 Success Sound Player** (id `d10-success-sound-player`).
- Because the module id changed, settings saved under the old id are not carried over. Reconfigure the sound folder and files once.

### Version 1.1.4 scroll and file browser fix
- The settings window now has a fixed height and a scrollable body.
- Browse buttons use direct click handlers and report the real error if the file browser cannot open.

### Version 1.1.3 settings window fix
- Rewrote the configuration window on ApplicationV2 (Foundry v12+), replacing the deprecated FormApplication.
- Fixed the settings template (single root element, no nested form) so the window no longer opens empty.
- FilePicker now works on both v12 and v13+.

### Version 1.1.2 audio API fix
Uses Foundry's namespaced `foundry.audio.AudioHelper.play` API instead of assuming the legacy global `AudioHelper` exists. Falls back to `game.audio.play` where the static helper is unavailable.
