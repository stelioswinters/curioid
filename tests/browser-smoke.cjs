const { chromium } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const failures = [];
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  page.on('pageerror', error => failures.push('pageerror: ' + error.message));
  page.on('console', message => { if (message.type() === 'error') failures.push('console: ' + message.text()); });
  page.on('requestfailed', request => failures.push('request failed: ' + request.url() + ' (' + request.failure()?.errorText + ')'));

  try {
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForFunction(() => document.querySelectorAll('[data-category]').length === 7);
    assert.match(await page.title(), /CURIOID/i);
    assert.equal(await page.locator('meta[name="curioid-release"]').getAttribute('content'), 'v1.344');
    assert.equal(await page.locator('[data-category]').count(), 7);

    // Every collection must switch to its own view and expose a non-empty catalogue.
    await page.locator('#browseCollections > summary').click();
    for (const category of await page.locator('[data-category]').evaluateAll(nodes => nodes.map(node => node.dataset.category))) {
      await page.locator('[data-category="' + category + '"]').click();
      await page.waitForFunction(id => {
        const section = document.querySelector('#categorySections [data-category-section="' + id + '"]');
        return section && !section.hidden;
      }, category);
      assert.ok(await page.locator('#categorySections .category-section:not([hidden])').count() >= 1, category + ' did not render');
    }

    // Exercise every lazy category bundle and each independent desktop at least once.
    const projectsToOpen = [
      ['operating-systems', 'dead-interface'],
      ['operating-systems', 'food-alchemy'],
      ['operating-systems', 'echonoise-os'],
      ['operating-systems', 'umbra-os'],
      ['operating-systems', 'aura-synthesis'],
      ['operating-systems', 'aether-os'],
      ['operating-systems', 'sandbox-os'],
      ['strange-archives', 'museum-almost'],
      ['web-experiments', 'kineta-hyperion'],
      ['tiny-games', 'curioids'],
      ['digital-art', 'chroma-loom'],
      ['sound-motion', 'dark-looper'],
      ['creative-tools', 'vanta-deck']
    ];
    for (const [category, project] of projectsToOpen) {
      await page.locator('[data-category="' + category + '"]').click();
      const room = page.locator('#room-' + project);
      await room.locator('.room-heading').click();
      await page.waitForFunction(id => {
        const node = document.getElementById('room-' + id);
        return node?.dataset.loaded === 'true' || Boolean(node?.querySelector('.project-load-error'));
      }, project, { timeout: 90000 });
      assert.equal(await room.getAttribute('data-loaded'), 'true', project + ' failed to mount');
      await room.locator('.room-heading').click();
      await page.waitForFunction(id => document.getElementById('room-' + id)?.dataset.loaded === 'false', project);
    }

    // Search should filter the catalogue and clear should restore it.
    const search = page.locator('#projectSearch');
    await search.fill('music');
    await page.waitForTimeout(250);
    assert.ok(await page.locator('#categorySections').isVisible());
    assert.ok(await page.locator('#categorySections .room-window:not([hidden])').count() > 0, 'Search returned no music matches');
    await page.locator('#clearProjectSearch').click();
    await search.fill('');
    await page.waitForTimeout(150);

    // Control Panel must open, expose its health tools, and close cleanly.
    await page.locator('#openControlCenter').click();
    const dialog = page.locator('#siteControlCenter');
    await dialog.waitFor({ state: 'visible' });
    assert.ok(await dialog.locator('[data-control-runtime]').count());
    assert.ok(await dialog.locator('[data-health-run]').count());
    await dialog.locator('[data-control-close]').click();
    await dialog.waitFor({ state: 'hidden' });

    // Small viewport: no horizontal page overflow and key controls remain reachable.
    await page.setViewportSize({ width: 360, height: 800 });
    await page.reload({ waitUntil: 'networkidle', timeout: 60000 });
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth
    }));
    assert.ok(dimensions.document <= dimensions.viewport + 2,
      'Horizontal overflow at 360px: ' + JSON.stringify(dimensions));
    const menuToggle = page.locator('#menuToggle');
    if (await menuToggle.getAttribute('aria-expanded') !== 'true') await menuToggle.click();
    assert.equal(await menuToggle.getAttribute('aria-expanded'), 'true');
    await menuToggle.click();
    assert.equal(await menuToggle.getAttribute('aria-expanded'), 'false');

    if (failures.length) throw new Error('Browser errors:\\n' + failures.join('\\n'));
    console.log('CURIOID browser smoke tests passed: release, 7 collections, search, Control Panel, mobile overflow and menu.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
