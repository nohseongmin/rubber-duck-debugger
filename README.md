# Rubber Duck Debugger 🦆

<p align="center"><b>English</b> | <a href="README.ko.md">한국어</a></p>

<p align="center">
  <img src="assets/demo.gif" alt="Clicking the duck makes it quack" width="480">
</p>

<p align="center">
  A rubber duck that lives on your desktop and quacks when you click it.<br>
  Transparent, always on top, and you can swap the duck out for any image, GIF, sound or set of phrases.
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

Rubber duck debugging is the old habit of explaining your broken code out loud, one line at a time, to a rubber duck — and finding the bug yourself somewhere in the middle of the explanation. This is that duck. It doesn't understand a word you say, but it sits there and it quacks.

## What it does

The duck sits on top of your other windows with a transparent background, so there's no window frame around it — just a duck on your desktop. Click it and it quacks, squishes, and says something in a speech bubble. Left alone it drifts slowly up and down, and now and then it pipes up on its own. That one is silent by default; a bubble appears but nothing interrupts you.

The rest of the window is click-through, so your desktop icons keep working as if it weren't there.

Moving the duck is a separate mode, deliberately. Right-click it, pick Move, and a dashed outline appears — drag it where you want, then hit Done or Esc. In the first version a click and a drag were told apart by how far the mouse travelled, which meant half your quacks were swallowed by an accidental drag. Splitting the two fixed that.

Global hotkeys can trigger a quack, cycle to the next skin, hide or show the duck, or open settings, and they fire while another app has focus. None are set up front — the app shouldn't take a shortcut you were already using, so you pick them yourself.

Most of the rest is up to you in Settings: the character (the bundled duck, an emoji, or your own image or GIF), how big it is, what it says, what it sounds like, how often it talks to itself. If the bobbing bugs you, turn it off. There's also a switch to start the duck with Windows, off unless you ask for it.

## Install

1. Download **[RubberDuckDebugger-Setup.exe](https://github.com/nohseongmin/rubber-duck-debugger/releases/latest/download/RubberDuckDebugger-Setup.exe)** and run it.
2. Windows will warn you about an unknown publisher. The build isn't code-signed yet, so that's expected — click **More info → Run anyway**.
3. The duck shows up in the bottom-right corner. Left-click it to hear it. Right-click, or use the tray icon, for settings and quit.

Windows x64 for now. New versions go up on the [releases page](https://github.com/nohseongmin/rubber-duck-debugger/releases); there's no auto-update yet.

## Skin packs

A skin pack is a zip holding a `skin.json` and whatever that file points at, renamed to `.rduck`. Import one from Settings → Skin. There's a sample pack in [`skins/`](skins/) if you want to see the shape of it before making your own.

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

Only `id` and `character.image` are required. Leave anything else out and the app falls back to its own defaults.

Skins are assets, not code — nothing inside a pack is ever executed. On import the archive is checked for path traversal, oversized and zip-bomb payloads and a malformed manifest, and only allowlisted image and audio files get unpacked. The checks are in [`src/skins.js`](src/skins.js) and the tests covering them are in [`test/skins.test.js`](test/skins.test.js).

## Running from source

```bash
npm install
npm start        # run it
npm test         # skin import security tests
npm run dist     # build installers into dist/
```

It's an Electron app: main process in `src/main.js`, the duck window in `src/duck/`, the settings window in `src/settings/`. Settings live in a JSON file under `userData/`, and imported skins unpack alongside them. The default quack is synthesized with the Web Audio API instead of being shipped as an audio file, which is why there's no sound asset in the repo.

## Privacy

The app has no network code at all — no account, no telemetry, nothing sent anywhere. The renderer runs with `contextIsolation` on and `nodeIntegration` off, and it can only reach the main process through the short allowlist in `src/preload.js`. A CSP blocks it from loading anything remote.

## Roadmap

- More than one duck at a time
- A Steam release with Workshop support, so skins can be shared properly instead of passed around as files
- Auto-update, and a signed build so Windows stops complaining

## License

MIT. The quack is generated in code and the duck artwork belongs to the project, so there's nothing third-party to credit here — details in [CREDITS.md](CREDITS.md).
