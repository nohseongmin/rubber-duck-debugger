# Rubber Duck Debugger 🦆

<p align="center">
  <img src="assets/demo.gif" alt="Clicking the duck makes it quack" width="480">
</p>

<p align="center">
  A rubber duck that sits on your desktop and quacks when you click it.<br>
  Transparent, always on top, and you can swap it for any image, GIF, sound or set of phrases.
</p>

<p align="center">
  <a href="https://github.com/nohseongmin/rubber-duck-debugger/releases/latest"><img src="https://img.shields.io/github/v/release/nohseongmin/rubber-duck-debugger?color=ffcf33&label=release" alt="release"></a>
  <img src="https://img.shields.io/badge/platform-Windows%20x64-0078D6" alt="platform">
  <a href="LICENSE"><img src="https://img.shields.io/github/license/nohseongmin/rubber-duck-debugger" alt="license"></a>
  <a href="https://github.com/nohseongmin/rubber-duck-debugger/stargazers"><img src="https://img.shields.io/github/stars/nohseongmin/rubber-duck-debugger?style=social" alt="stars"></a>
</p>

<p align="center">
  <a href="https://github.com/nohseongmin/rubber-duck-debugger/releases/latest/download/RubberDuckDebugger-Setup.exe"><b>⬇️ Download for Windows</b></a><br>
  <sub>One installer. No Node, no build step.</sub>
</p>

Rubber duck debugging is the old trick of explaining your broken code out loud, line by line, to a rubber duck, and working out the answer yourself somewhere in the middle of it. This is the duck. It doesn't understand any of what you say. It just quacks.

## What it does

The window is transparent and stays on top, so there's no frame around the duck. Click it and it quacks, squishes, and pops up a speech bubble with one of your lines. Leave it alone and it drifts up and down, and every so often it says something by itself. That one is silent by default, so it won't cut across whatever you're doing.

Everything except the duck is click-through. Your desktop icons carry on working as if it weren't there.

Moving it is its own mode, on purpose. Right-click, pick Move, and a dashed outline appears; drag the duck somewhere else, then press Done or Esc. The first version told a click from a drag by how far the mouse had travelled, and it ate about half the quacks. Separating the two fixed it.

Global hotkeys can quack, switch to the next skin, hide the duck or open settings, and they work while another app has focus. Nothing is bound to begin with. You pick the keys, so the app can't quietly take a shortcut you were already using.

## Install

1. Grab **[RubberDuckDebugger-Setup.exe](https://github.com/nohseongmin/rubber-duck-debugger/releases/latest/download/RubberDuckDebugger-Setup.exe)** and run it.
2. Windows will complain about an unknown publisher, because the build isn't signed. Click **More info → Run anyway**.
3. The duck turns up in the bottom-right corner. Left-click to hear it. Right-click it, or use the tray icon, for settings and quit.

Windows x64 only for now. Later versions go up on the [releases page](https://github.com/nohseongmin/rubber-duck-debugger/releases); there's no auto-update yet.

## Settings

<p align="center">
  <img src="assets/shot-settings.png" alt="The settings window" width="820">
</p>

One window, no tabs. Choose the character (the bundled duck, an emoji, or your own image or GIF) and how big it should be. Write the lines it says, one per line, and it picks one at random. You can replace the quack with your own sound file, set how often the duck talks to itself, and switch off the idle bobbing if it distracts you. Starting with Windows is in there too, off unless you turn it on.

## Skin packs

<p align="center">
  <img src="assets/shot-skins.png" alt="The bundled duck next to the Pinky Duck skin" width="820">
</p>

A skin carries the character, sound, phrases and bubble colours in one file, so changing the whole look is a single click instead of six settings. The sample in [`skins/`](skins/) is the pink duck above.

A pack is a zip holding a `skin.json` and whatever that file points at, renamed to `.rduck`. Import it from Settings → Skin.

```
my-skin.rduck
├─ skin.json
├─ char.webp     # png / gif / apng / webp — animated files work
└─ quack.mp3     # optional; without it the duck uses the built-in synth quack
```

```json
{
  "formatVersion": 1,
  "id": "my-skin",
  "name": "My Skin",
  "author": "you",
  "version": "1.0.0",
  "character": { "image": "char.webp", "size": 130 },
  "sound":     { "file": "quack.mp3", "volume": 0.6 },
  "phrases":   ["Quack!", "Read that line again"],
  "bubble":    { "textColor": "#5a1040", "bgColor": "#ffe3f1" }
}
```

Only `id` and `character.image` have to be there. Anything you leave out falls back to the app's own defaults.

Nothing inside a pack ever runs. It's images, audio and one JSON file. Importing checks for paths that climb out of the folder, oversized files, zip bombs and a broken manifest, then unpacks only the extensions on the allowlist. That code is in [`src/skins.js`](src/skins.js), and [`test/skins.test.js`](test/skins.test.js) covers it.

## Running from source

```bash
npm install
npm start        # run it
npm test         # config and skin-import tests
npm run dist     # build installers into dist/
```

An Electron app: main process in `src/main.js`, duck window in `src/duck/`, settings window in `src/settings/`. Settings are a JSON file under `userData/`, and imported skins land next to it. The default quack is generated with the Web Audio API rather than shipped as audio, which is why there's no sound file in the repo.

## Privacy

There's no network code in the app. No account, nothing phoned home. The renderer runs with `contextIsolation` on and `nodeIntegration` off, it can only reach the main process through the short allowlist in `src/preload.js`, and a CSP stops it loading anything remote.

## Roadmap

- More than one duck at once
- Somewhere to find community skin packs that isn't "someone posted a zip"
- Auto-update, and a signed build so Windows stops warning about it

## License

MIT. The quack is generated in code and the artwork belongs to the project, so there's nothing third-party to credit. Details in [CREDITS.md](CREDITS.md).
