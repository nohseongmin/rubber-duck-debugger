'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { _electron: electron } = require('playwright-core');

async function checkInstalledDuck(executablePath) {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'installed-duck-'));
  let app;
  try {
    app = await electron.launch({ executablePath, args: [`--user-data-dir=${profile}`] });
    const window = await app.firstWindow();
    const image = window.locator('#duck-img');
    await image.waitFor({ state: 'visible' });
    await window.waitForFunction(() => document.querySelector('#duck-img')?.naturalWidth > 0);
    assert.equal(await window.evaluate(() => document.visibilityState), 'visible');
    const bubble = window.locator('#bubble.show');
    assert.equal(await bubble.count(), 0, 'The speech bubble should appear in response to the click');
    // The duck bobs continuously. Click its center as a user would while it moves.
    const bounds = await image.boundingBox();
    assert.ok(bounds, 'The duck needs a visible click target');
    await window.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await bubble.waitFor({ state: 'visible' });
    assert.ok((await bubble.innerText()).trim(), 'Clicking the duck must show a phrase');
  } finally {
    try {
      await app?.close();
    } finally {
      await fs.rm(profile, { recursive: true, force: true, maxRetries: 5 });
    }
  }
}

checkInstalledDuck(process.argv[2]).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
