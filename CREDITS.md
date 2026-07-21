# Credits

Where the bundled assets come from. Nothing here currently requires third-party attribution: the quack is generated in code, and the artwork belongs to the project.

## Sound

The default quack is synthesized at runtime with the Web Audio API, so no audio file ships with the app. You can point the settings at your own sound file instead.

## Artwork

- `assets/duck.png` — the rubber duck character, made by the project owner with an AI image tool. Transparent background; the owner holds the rights, including commercial use.
- `assets/icon.png`, `assets/tray.png` — the app and tray icons, resized from `duck.png`.
- `scripts/gen-icons.js` can regenerate simple placeholder icons in pure Node if you'd rather not use the artwork.

## Emoji

Setting the character to an emoji renders a Unicode glyph with the system font. No image is bundled for that.

---

If you swap in a different sound and want to redistribute it with the repo, prefer CC0 or CC-BY material — [Freesound](https://freesound.org/) (filtered to CC0) and [Pixabay](https://pixabay.com/sound-effects/) are reasonable starting points. Licenses that forbid redistributing the file on its own don't work for an open repository, even when they allow commercial use.
