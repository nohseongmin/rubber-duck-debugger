# Credits

Where the bundled assets come from. Nothing in here needs third-party attribution at the moment: the quack is generated in code, and the artwork belongs to the project.

## Sound

The default quack is synthesized at runtime with the Web Audio API, so no audio file ships with the app. You can point the settings at your own sound instead.

## Artwork

- `assets/duck.png` is the rubber duck character, made by the project owner with an AI image tool. Transparent background, and the owner holds the rights to it, commercial use included.
- `assets/icon.png` and `assets/tray.png` are the app and tray icons, resized from `duck.png`.

## Emoji

Setting the character to an emoji draws a Unicode glyph with the system font. No image is bundled for that.

---

If you swap in a different sound and want to ship it with the repo, look for CC0 or CC-BY material. [Freesound](https://freesound.org/) filtered to CC0 and [Pixabay](https://pixabay.com/sound-effects/) are both reasonable places to start. Licences that allow commercial use but forbid redistributing the file on its own don't work for an open repository.
