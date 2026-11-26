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

    const unlabeledProjectControls = [];
    for (const { category, project } of projectsToOpen) {
      await page.locator('[data-category="' + category + '"]').click();
      const room = page.locator('#room-' + project);
      await room.locator('.room-heading').click();
      await page.waitForFunction(id => {
        const node = document.getElementById('room-' + id);
        return node?.dataset.loaded === 'true' || Boolean(node?.querySelector('.project-load-error'));
      }, project, { timeout: 90000 });
      assert.equal(await room.getAttribute('data-loaded'), 'true', project + ' failed to mount');
      const projectLabels = await room.locator('.room-mount').evaluate(root => {
        const selector = 'button,input:not([type="hidden"]),select,textarea,a[href],summary,[contenteditable="true"],[role="button"],[role="switch"],[role="tab"],[role="checkbox"],[role="radio"],[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"],[role="option"],[role="link"],[role="slider"],[role="spinbutton"],[role="combobox"],[role="listbox"],[role="treeitem"]';
        return Array.from(root.querySelectorAll(selector)).filter(node => {
          const labelledBy = (node.getAttribute('aria-labelledby') || '').trim().split(/\\s+/).filter(Boolean);
          const labelledByText = labelledBy.map(id => root.ownerDocument.getElementById(id)?.textContent || '').join(' ').trim();
          return !((node.getAttribute('aria-label') || '').trim() || labelledByText ||
            (['button', 'a'].includes(node.tagName.toLowerCase()) && node.textContent?.trim()) ||
            node.getAttribute('title')?.trim() || node.labels?.length || node.closest('label') ||
            (['button', 'submit', 'reset', 'image'].includes(String(node.type || '').toLowerCase()) && node.value));
        }).map(node => ({
          tag: node.tagName.toLowerCase(),
          type: node.getAttribute('type') || '',
          id: node.id || '',
          placeholder: node.getAttribute('placeholder') || '',
          title: node.getAttribute('title') || '',
          text: (node.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 100),
          aria: node.getAttribute('aria-label') || ''
        }));
      });
      unlabeledProjectControls.push(...projectLabels.map(item => ({ project, ...item })));

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
    console.log('Mounted-project controls without an explicit accessible name:', JSON.stringify(unlabeledProjectControls));
    const standaloneAndLiveLabels = await page.evaluate(async () => {
      const selector = 'button,input:not([type="hidden"]),select,textarea,a[href],summary,[contenteditable="true"],[role="button"],[role="switch"],[role="tab"],[role="checkbox"],[role="radio"],[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"],[role="option"],[role="link"],[role="slider"],[role="spinbutton"],[role="combobox"],[role="listbox"],[role="treeitem"]';
      const findUnlabeled = (root, source) => Array.from(root.querySelectorAll(selector)).filter(node => {
        const labelledBy = (node.getAttribute('aria-labelledby') || '').trim().split(/\\s+/).filter(Boolean);
        const labelledByText = labelledBy.map(id => root.getElementById?.(id)?.textContent || root.querySelector?.('#' + CSS.escape(id))?.textContent || '').join(' ').trim();
        return !((node.getAttribute('aria-label') || '').trim() || labelledByText ||
          (['button', 'a'].includes(node.tagName.toLowerCase()) && node.textContent?.trim()) ||
          node.getAttribute('title')?.trim() || node.labels?.length || node.closest('label') ||
          (['button', 'submit', 'reset', 'image'].includes(String(node.type || '').toLowerCase()) && node.value));
      }).map(node => ({ source, tag: node.tagName.toLowerCase(), type: node.getAttribute('type') || '',
        id: node.id || '', placeholder: node.getAttribute('placeholder') || '', title: node.getAttribute('title') || '',
        text: (node.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 100) }));
      const live = findUnlabeled(document, 'index.html');
      const standalone = [];
      for (const file of ['applications-tools-apps.html', 'music-audio-apps.html', 'chroma-loom.html', 'curioids.html']) {
        const response = await fetch(file, { cache: 'no-store' });
        if (!response.ok) throw new Error(file + ' returned HTTP ' + response.status);
        const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
        standalone.push(...findUnlabeled(doc, file));
      }
      return { live, standalone };
    });
    console.log('Live/standalone controls without an explicit accessible name:', JSON.stringify(standaloneAndLiveLabels));

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
      nodes.map(node => ({ state: node.dataset.state, label: node.querySelector('b')?.textContent, detail: node.querySelector('span')?.textContent }))
    );
    const healthReportHref = await healthRun.getAttribute('href');
    const healthReportFilename = await healthRun.getAttribute('download');
    console.log('Health Check state:', await dialog.locator('[data-health-state]').innerText());
    console.log('Health Check status:', await dialog.locator('[data-health-status]').innerText());
    console.log('Health Check rows:', JSON.stringify(healthDetails));
    const wholeSiteCensus = await page.evaluate(() => window.__CURIOID_HEALTH_WHOLE_SITE_CENSUS || null);
    const projectInterfaceIssues = await page.evaluate(() => window.__CURIOID_HEALTH_UI_CENSUS?.issues || null);
    console.log('Health Check whole-site census:', JSON.stringify(wholeSiteCensus));
    console.log('Health Check project interface issues:', JSON.stringify(projectInterfaceIssues));
    assert.ok(wholeSiteCensus && wholeSiteCensus.hardIssues === 0,
      'Health Check found hard site security/render issues: ' + JSON.stringify(wholeSiteCensus));
    assert.equal(projectInterfaceIssues?.unsandboxedFrames, 0,
      'A project template still contains an unapproved unsandboxed iframe.');
    assert.equal(projectInterfaceIssues?.renderFailures, 0, 'Project template render failures were detected.');
    assert.ok(healthRows >= 20, 'Health Check completed too few diagnostics: ' + healthRows + '; see diagnostic rows above.');
    assert.ok(healthReportHref?.startsWith('blob:'), 'Health Check did not prepare its local TXT report.');
    assert.ok(healthReportFilename, 'Health Check report has no download filename.');
    const healthReportText = await page.evaluate(async href => await (await fetch(href)).text(), healthReportHref);
    const detailsMarker = 'FULL TECHNICAL DETAILS\n----------------------\n';
    const detailsStart = healthReportText.indexOf(detailsMarker);
    const privacyStart = healthReportText.indexOf('\n\nPRIVACY', detailsStart);
    assert.ok(detailsStart >= 0 && privacyStart > detailsStart, 'Health Check report structure is incomplete.');
    const healthReport = JSON.parse(healthReportText.slice(detailsStart + detailsMarker.length, privacyStart));
    const hardFailures = healthReport.checks.filter(row => !row.ok && !row.warning);
    const warnings = healthReport.checks.filter(row => !row.ok && row.warning);
    console.log('Health Check completed ' + healthReport.checks.length + ' diagnostics.');
    console.log('Health Check hard failures:', JSON.stringify(hardFailures));
    console.log('Health Check warnings:', JSON.stringify(warnings));
    console.log('Health Check report link:', healthReportHref, healthReportFilename);

    // The diagnostic report can trigger a service-worker controller transition.
    // Use a fresh page for the mobile viewport checks so reload/activation cannot
    // invalidate the remaining browser tests.
    const mobilePage = await browser.newPage({ viewport: { width: 360, height: 800 } });
    mobilePage.on('pageerror', error => failures.push('mobile pageerror: ' + error.message));
    mobilePage.on('console', message => { if (message.type() === 'error') failures.push('mobile console: ' + message.text()); });
    mobilePage.on('requestfailed', request => failures.push('mobile request failed: ' + request.url() + ' (' + request.failure()?.errorText + ')'));
    await mobilePage.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle', timeout: 60000 });
    for (const width of [320, 360, 375, 414, 560, 768, 900, 1024, 1365]) {
      await mobilePage.setViewportSize({ width, height: 800 });
      const dimensions = await mobilePage.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        document: document.documentElement.scrollWidth
      }));
      assert.ok(dimensions.document <= dimensions.viewport + 2,
        'Horizontal overflow at ' + width + 'px: ' + JSON.stringify(dimensions));
    }
    await mobilePage.setViewportSize({ width: 360, height: 800 });
    const menuToggle = mobilePage.locator('#menuToggle');
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
