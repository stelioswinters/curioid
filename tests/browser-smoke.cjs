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

    // Open and close every catalogue project, not just one representative per category.
    const projectsToOpen = await page.locator('#categorySections [data-category-section]').evaluateAll(sections =>
      sections.flatMap(section => Array.from(section.querySelectorAll('.room-window[data-room]'), room => ({
        category: section.dataset.categorySection,
        project: room.dataset.room
      })))
    );
    assert.ok(projectsToOpen.length >= 59, 'Expected at least 59 catalogue projects, found ' + projectsToOpen.length);

    for (const { category, project } of projectsToOpen) {
      await page.locator('[data-category="' + category + '"]').click();
      const room = page.locator('#room-' + project);
      await room.locator('.room-heading').click();
      await page.waitForFunction(id => {
        const node = document.getElementById('room-' + id);
        return node?.dataset.loaded === 'true' || Boolean(node?.querySelector('.project-load-error'));
      }, project, { timeout: 90000 });
      assert.equal(await room.getAttribute('data-loaded'), 'true', project + ' failed to mount');

      // Some desktops show a first-use security note after mounting.
      const notesDialog = page.locator('#curioid-important-notes');
      if (await notesDialog.count() && await notesDialog.evaluate(node => node.open)) {
        const acknowledge = notesDialog.getByText(/got it/i).last();
        if (await acknowledge.count()) await acknowledge.click();
        else await notesDialog.locator('button').last().click();
        await notesDialog.waitFor({ state: 'hidden', timeout: 10000 });
      }
      await room.locator('.room-heading').click();
      await page.waitForFunction(id => document.getElementById('room-' + id)?.dataset.loaded === 'false', project);
    }
    console.log('Mounted and cleanly closed ' + projectsToOpen.length + ' catalogue projects.');

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
    const healthRun = dialog.locator('[data-health-run]');
    assert.equal(await healthRun.count(), 1);
    await healthRun.click();
    await page.waitForFunction(() => {
      const button = document.querySelector('#siteControlCenter [data-health-run]');
      const state = document.querySelector('#siteControlCenter [data-health-state]')?.textContent?.trim();
      return button && button.getAttribute('data-running') !== 'true'
        && state && !['NOT RUN', 'CHECKING'].includes(state);
    }, null, { timeout: 180000 });
    const healthRows = await dialog.locator('[data-health-results] li').count();
    const healthDetails = await dialog.locator('[data-health-results] li').evaluateAll(nodes =>
      nodes.map(node => ({ state: node.dataset.state, label: node.querySelector('b')?.innerText, detail: node.querySelector('span')?.innerText }))
    );
    console.log('Health Check state:', await dialog.locator('[data-health-state]').innerText());
    console.log('Health Check status:', await dialog.locator('[data-health-status]').innerText());
    console.log('Health Check rows:', JSON.stringify(healthDetails));
    assert.ok(healthRows >= 1, 'Health Check did not produce any diagnostic results.');
    assert.ok(await healthRun.getAttribute('href')?.startsWith('blob:'),
      'Health Check did not prepare its local TXT report.');
    assert.ok(await healthRun.getAttribute('download'), 'Health Check report has no download filename.');
    console.log('Health Check completed ' + healthRows + ' diagnostics; state: ' +
      await dialog.locator('[data-health-state]').innerText());
    await dialog.locator('[data-health-details-summary]').click();
    assert.ok(await dialog.locator('[data-health-details]').getAttribute('open') !== null,
      'Health Check detailed results did not expand.');
    await dialog.locator('[data-control-close]').click();
    await dialog.waitFor({ state: 'hidden' });

    // Small viewport: no horizontal page overflow and key controls remain reachable.
    await page.setViewportSize({ width: 360, height: 800 });
    await page.reload({ waitUntil: 'networkidle', timeout: 60000 });
    for (const width of [320, 360, 375, 414, 560, 768, 900, 1024, 1365]) {
      await page.setViewportSize({ width, height: 800 });
      const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        document: document.documentElement.scrollWidth
      }));
      assert.ok(dimensions.document <= dimensions.viewport + 2,
        'Horizontal overflow at ' + width + 'px: ' + JSON.stringify(dimensions));
    }
    await page.setViewportSize({ width: 360, height: 800 });
    const menuToggle = page.locator('#menuToggle');
    if (await menuToggle.getAttribute('aria-expanded') !== 'true') await menuToggle.click();
    assert.equal(await menuToggle.getAttribute('aria-expanded'), 'true');
    await menuToggle.click();
    assert.equal(await menuToggle.getAttribute('aria-expanded'), 'false');

    if (failures.length) throw new Error('Browser errors:\\n' + failures.join('\\n'));
    console.log('CURIOID browser smoke tests passed: all catalogue projects, 7 collections, search, Control Panel, 9 viewport widths and mobile menu.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
