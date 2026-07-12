# 🦆 Rubber Duck Debugger

<p align="center"><a href="README.md">한국어</a> | <b>English</b></p>

<p align="center">
  <img src="assets/demo.gif" alt="Rubber Duck Debugger demo — click the duck to hear it quack!" width="480">
</p>

<p align="center">
  A rubber-duck-debugging desktop pet. It floats on your desktop and <b>quacks with a speech bubble when you click it</b>.<br>
  Always-on-top like Steam's Bongo Cat, with a <b>fully customizable image / GIF / phrases / sound</b>.
</p>

<p align="center">
  <a href="https://github.com/nohseongmin/rubber-duck-debugger/releases/latest"><img src="https://img.shields.io/github/v/release/nohseongmin/rubber-duck-debugger?color=ffcf33&label=release" alt="release"></a>
  <img src="https://img.shields.io/badge/platform-Windows%20x64-0078D6" alt="platform">
  <a href="LICENSE"><img src="https://img.shields.io/github/license/nohseongmin/rubber-duck-debugger" alt="license"></a>
  <a href="https://github.com/nohseongmin/rubber-duck-debugger/stargazers"><img src="https://img.shields.io/github/stars/nohseongmin/rubber-duck-debugger?style=social" alt="stars"></a>
</p>

<p align="center">
  <a href="https://github.com/nohseongmin/rubber-duck-debugger/releases/latest/download/RubberDuckDebugger-Setup-0.1.0.exe"><b>⬇️ Download installer (Windows)</b></a>
</p>

> Rubber duck debugging: a classic developer technique — explaining your stuck code line by line to a rubber duck until you spot the bug yourself.

## ✨ Features

- **Lives on your desktop**: transparent, frameless, always-on-top. Only the duck shows — no window box.
- **Click to quack**: left-click the duck for a synthesized "quack" + a random-phrase speech bubble + a squish animation.
- **Right-click menu**: right-click the duck → Move / Settings / GitHub / Close.
- **Move mode**: pick "Move" from the menu and a dashed outline appears — grab and drag to reposition, then `Done` or `Esc` (position auto-saved). Clicking (quack) and moving are separate, so nothing feels ambiguous.
- **Global hotkey**: press your configured shortcut (default `Ctrl+Shift+D`) to make the duck quack from anywhere, even while another app is focused.
- **Click-through**: everywhere except the duck is click-through, so your desktop icons stay usable.
- **Fully customizable**: character (built-in duck / emoji / your own image or **GIF** / size), speech phrases, sound (synthesized quack or your own file / volume), and bubble duration — all in the settings window.
- **Tray app**: the tray menu offers Test quack / Settings / Open GitHub / Quit.

> A default character (transparent rubber-duck image) is bundled, and the default "quack" is synthesized in real time with the Web Audio API (no audio file shipped). Swap in your own image / GIF / emoji / sound from Settings. Asset details in [CREDITS.md](CREDITS.md).

## 🚀 Run from source

```bash
# 1) Install dependencies
npm install

# 2) Start
npm start
```

The duck appears at the bottom-right of your screen. Click it → quack! Open settings from the tray icon → "Settings…".

> Icons (`assets/icon.png`, `assets/tray.png`) are included in the repo. To regenerate them, run `npm run gen-icons` (pure Node, placeholder icons).

### Build an installer

```bash
npm run dist
```

`electron-builder` produces installers for Windows (nsis) / macOS (dmg) / Linux (AppImage), output to `dist/`.

## 🧩 Tech stack

- **Electron** — main process (Node) + renderer (HTML/CSS/JS)
- **Web Audio API** — dependency-free real-time "quack" synthesis
- **Self-contained JSON settings** — `userData/config.json` (no external store)
- **Pure-Node PNG generator** — `scripts/gen-icons.js` (no binary assets committed)
- **electron-builder** — cross-platform packaging

## 📁 Project structure

```
rubber-duck-debugger/
├─ src/
│  ├─ main.js          # Electron main: windows, tray, IPC, settings
│  ├─ preload.js       # whitelisted IPC bridge (contextIsolation)
│  ├─ config.js        # settings defaults + JSON load/save
│  ├─ duck/            # duck widget (transparent window): index.html, duck.css, duck.js
│  └─ settings/        # settings window: index.html, settings.css, settings.js
├─ scripts/
│  └─ gen-icons.js     # icon PNG generator
├─ assets/             # duck image, icons, demo gif
└─ package.json
```

## 🔐 Security

- Renderer runs with `contextIsolation: true`, `nodeIntegration: false` — only the whitelisted preload IPC is exposed.
- CSP blocks remote scripts (`script-src 'self'`); only local files are loaded.
- **No** network calls, logins, or data collection. All settings stay local.

## 🗺️ Roadmap

- **v0.2** — idle bob / sprite animation, occasional self-triggered quacks
- **v0.3** — skin-pack format (zip: image + sound + phrases) import, multiple ducks, keystroke reactions
- **v1.0** — paid skin/sound packs, auto-update, code signing, Steam release

## 📄 License

Code is MIT. The default "quack" is synthesized in code and the character image is a project-owned asset, so there are currently no bundled third-party assets requiring attribution. Asset details in [CREDITS.md](CREDITS.md).
