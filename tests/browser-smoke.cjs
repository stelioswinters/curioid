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
        return Array.from(root.querySelectorAll(selector)).filter(node => node.getClientRects().length && !node.closest('[aria-hidden="true"]')).filter(node => {
          const labelledBy = (node.getAttribute('aria-labelledby') || '').trim().split(/\\s+/).filter(Boolean);
          const labelledByText = labelledBy.map(id => root.ownerDocument.getElementById(id)?.textContent || '').join(' ').trim();
          return !((node.getAttribute('aria-label') || '').trim() || labelledByText ||
            (['button', 'a', 'summary'].includes(node.tagName.toLowerCase()) && node.textContent?.trim()) ||
            node.getAttribute('title')?.trim() || node.labels?.length || node.closest('label') ||
            (['button', 'submit', 'reset', 'image'].includes(String(node.type || '').toLowerCase()) && node.value));
        }).map(node => ({
          tag: node.tagName.toLowerCase(),
          type: node.getAttribute('type') || '',
          parent: (node.parentElement?.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 180),
          grandparent: (node.parentElement?.parentElement?.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 240),
          hidden: node.hidden || getComputedStyle(node).display === 'none' || getComputedStyle(node).visibility === 'hidden',
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
    const unlabeledProjectInputs = unlabeledProjectControls.filter(item => item.tag === 'input');
    console.log('Unlabeled project input context:', JSON.stringify(unlabeledProjectInputs));
    const standaloneAndLiveLabels = await page.evaluate(async () => {
      const selector = 'button,input:not([type="hidden"]),select,textarea,a[href],summary,[contenteditable="true"],[role="button"],[role="switch"],[role="tab"],[role="checkbox"],[role="radio"],[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"],[role="option"],[role="link"],[role="slider"],[role="spinbutton"],[role="combobox"],[role="listbox"],[role="treeitem"]';
      const findUnlabeled = (root, source) => Array.from(root.querySelectorAll(selector)).filter(node => !node.hidden && !node.closest('[aria-hidden="true"]')).filter(node => {
        const labelledBy = (node.getAttribute('aria-labelledby') || '').trim().split(/\\s+/).filter(Boolean);
        const labelledByText = labelledBy.map(id => root.getElementById?.(id)?.textContent || root.querySelector?.('#' + CSS.escape(id))?.textContent || '').join(' ').trim();
        return !((node.getAttribute('aria-label') || '').trim() || labelledByText ||
          (['button', 'a', 'summary'].includes(node.tagName.toLowerCase()) && node.textContent?.trim()) ||
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
    const remainingUnnamed = unlabeledProjectControls.length + standaloneAndLiveLabels.live.length + standaloneAndLiveLabels.standalone.length;
    assert.equal(remainingUnnamed, 0, 'Accessible-name audit found exposed controls without names: ' + JSON.stringify({ projects: unlabeledProjectControls, live: standaloneAndLiveLabels.live, standalone: standaloneAndLiveLabels.standalone }));

    // Three isolated browser workers exercise the failure-prone apps independently.
    const agentFailures = [];
    const installAudioProbe = async agentPage => {
      await agentPage.addInitScript(() => {
        const probe = window.__curioidAudioProbe = { context: null, oscillatorStarts: 0, bufferStarts: 0, analyser: null, routed: false };
        const NativeAudioContext = window.AudioContext || window.webkitAudioContext;
        if (NativeAudioContext) {
          const WrappedAudioContext = class extends NativeAudioContext {
            constructor(...args) {
              super(...args);
              probe.context = this;
            }
          };
          try { window.AudioContext = WrappedAudioContext; } catch (_) {}
          try { if (window.webkitAudioContext) window.webkitAudioContext = WrappedAudioContext; } catch (_) {}
        }
        const oscillatorStart = window.OscillatorNode?.prototype?.start;
        if (oscillatorStart) window.OscillatorNode.prototype.start = function (...args) {
          probe.oscillatorStarts++;
          return oscillatorStart.apply(this, args);
        };
        const bufferStart = window.AudioBufferSourceNode?.prototype?.start;
        if (bufferStart) window.AudioBufferSourceNode.prototype.start = function (...args) {
          probe.bufferStarts++;
          return bufferStart.apply(this, args);
        };
        const createAnalyser = NativeAudioContext?.prototype?.createAnalyser;
        if (createAnalyser) NativeAudioContext.prototype.createAnalyser = function (...args) {
          const analyser = createAnalyser.apply(this, args);
          analyser.fftSize = 2048;
          probe.analyser = analyser;
          return analyser;
        };
      });
    };
    const prepareAgent = async (agentName, viewport) => {
      const context = await browser.newContext({ viewport });
      const agentPage = await context.newPage();
      await installAudioProbe(agentPage);
      agentPage.on('pageerror', error => agentFailures.push(agentName + ' pageerror: ' + error.message));
      agentPage.on('console', message => { if (message.type() === 'error') agentFailures.push(agentName + ' console: ' + message.text()); });
      agentPage.on('requestfailed', request => agentFailures.push(agentName + ' request failed: ' + request.url() + ' (' + request.failure()?.errorText + ')'));
      await agentPage.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle', timeout: 60000 });
      await agentPage.locator('#browseCollections').evaluate(node => { node.open = true; });
      return { context, page: agentPage };
    };
    const openAgentRoom = async (agentPage, category, project) => {
      await agentPage.locator('[data-category="' + category + '"]').evaluate(node => node.click());
      const room = agentPage.locator('#room-' + project);
      await room.locator('.room-heading').click();
      await agentPage.waitForFunction(id => document.getElementById('room-' + id)?.dataset.loaded === 'true',
        project, { timeout: 90000 });
      const notes = agentPage.locator('#curioid-important-notes');
      if (await notes.count() && await notes.evaluate(node => node.open)) {
        const acknowledge = notes.getByText(/got it/i).last();
        if (await acknowledge.count()) await acknowledge.click();
        else await notes.locator('button').last().click();
        await notes.waitFor({ state: 'hidden', timeout: 10000 });
      }
      return room;
    };
    const audioOutputReport = async frame => frame.evaluate(async () => {
      const probe = window.__curioidAudioProbe || {};
      let maxRms = 0, maxPeak = 0, samplesRead = 0;
      const deadline = performance.now() + 900;
      while (performance.now() < deadline) {
        if (probe.analyser && probe.context?.state === 'running') {
          const samples = new Float32Array(probe.analyser.fftSize);
          probe.analyser.getFloatTimeDomainData(samples);
          let square = 0, peak = 0;
          for (const sample of samples) { square += sample * sample; peak = Math.max(peak, Math.abs(sample)); }
          maxRms = Math.max(maxRms, Math.sqrt(square / samples.length));
          maxPeak = Math.max(maxPeak, peak);
          samplesRead++;
        }
        await new Promise(resolve => setTimeout(resolve, 45));
      }
      return {
        context: probe.context?.state || 'missing',
        oscillators: probe.oscillatorStarts || 0,
        buffers: probe.bufferStarts || 0,
        rms: maxRms,
        peak: maxPeak,
        samplesRead,
        currentTime: probe.context?.currentTime ?? null,
        analyserCaptured: Boolean(probe.analyser)
      };
    });

    const runDarkLooperAgent = async () => {
      const agent = await prepareAgent('D4RK L00PER agent', { width: 1365, height: 900 });
      try {
        const room = await openAgentRoom(agent.page, 'sound-motion', 'dark-looper');
        const mountState = await room.evaluate(node => ({
          loaded: node.dataset.loaded,
          mountExists: Boolean(node.querySelector('.room-mount')),
          mountHtml: (node.querySelector('.room-mount')?.innerHTML || '').slice(0, 2500),
          iframeCount: node.querySelectorAll('iframe').length,
          embeddedCount: node.querySelectorAll('[data-curioid-embedded-shell]').length
        }));
        console.log('D4RK L00PER room mount:', JSON.stringify(mountState));
        const iframe = room.locator('.room-mount iframe.standalone-project-frame');
        await iframe.waitFor({ state: 'attached', timeout: 30000 });
        const frameHandle = await iframe.elementHandle();
        const frame = await frameHandle.contentFrame();
        assert.ok(frame, 'D4RK L00PER iframe did not create a browser frame.');
        await frame.waitForLoadState('domcontentloaded', { timeout: 30000 });
        await frame.locator('body[data-app="dark-looper"]').waitFor({ state: 'attached', timeout: 30000 });
        await frame.locator('#studio-looper:not([hidden])').waitFor({ state: 'visible', timeout: 30000 });
        await frame.locator('#padsGrid .pad').first().waitFor({ state: 'visible' });
        const iframeStatus = await frame.locator('#mpcStatus').innerText();
        assert.ok(iframeStatus.includes('READY'), 'D4RK L00PER did not finish its initialization: ' + iframeStatus);
        await frame.locator('.pad[data-index="0"]').click();
        await frame.waitForFunction(() => document.getElementById('mpcStatus')?.textContent.includes('PAD HIT: KICK'), null, { timeout: 10000 });
        const padAudio = await audioOutputReport(frame);
        assert.equal(padAudio.context, 'running', 'D4RK L00PER Web Audio did not enter the running state: ' + JSON.stringify(padAudio));
        assert.ok(padAudio.oscillators + padAudio.buffers > 0, 'D4RK L00PER did not schedule any sound nodes: ' + JSON.stringify(padAudio));
        assert.ok(padAudio.rms > 0.00001 || padAudio.peak > 0.0001, 'D4RK L00PER audio output was silent at the analyser: ' + JSON.stringify(padAudio));

        await frame.locator('#loopToggle').click();
        await frame.waitForFunction(() => document.getElementById('mpcStatus')?.textContent.includes('PLAYING LOOP'), null, { timeout: 10000 });
        assert.equal(await frame.locator('#loopToggle').getAttribute('aria-pressed'), 'true');
        await frame.locator('#loopToggle').click();
        await frame.waitForFunction(() => document.getElementById('mpcStatus')?.textContent.includes('LOOP STOPPED'), null, { timeout: 10000 });

        await frame.locator('#editModeToggle').click();
        await frame.locator('.pad[data-index="1"]').click();
        await frame.locator('#soundModal.is-open').waitFor({ state: 'visible' });
        await frame.locator('#soundSearch').fill('Deep 909');
        await frame.locator('.sound-item-row').first().click();
        await frame.locator('#modalSelectBtn').click();
        assert.match(await frame.locator('.pad[data-index="1"]').innerText(), /DEEP 909/i);
        await frame.locator('#editModeToggle').click();
        await frame.locator('#clearBtn').click();
        assert.ok((await frame.locator('#mpcStatus').innerText()).includes('ALL MUSIC CLEARED'));

        const liveRecordSupported = await frame.evaluate(() => typeof MediaRecorder === 'function');
        await frame.locator('#liveRecordBtn').click();
        if (liveRecordSupported) {
          await frame.waitForFunction(() => {
            const status = document.getElementById('mpcStatus')?.textContent || '';
            return status.includes('LIVE RECORDING ACTIVE') || status.includes('LIVE RECORDING NOT SUPPORTED');
          }, null, { timeout: 10000 });
          if ((await frame.locator('#mpcStatus').innerText()).includes('LIVE RECORDING ACTIVE')) {
            await frame.locator('#liveRecordBtn').click();
            await frame.locator('#recPopup.is-open').waitFor({ state: 'visible', timeout: 10000 });
            await frame.locator('#recDiscardBtn').click();
            assert.ok((await frame.locator('#mpcStatus').innerText()).includes('RECORDING DISCARDED'));
          }
        }
        console.log('D4RK L00PER agent: embedded page, verified script UI, pad, loop, stop, sound assignment, clear and recording path passed. Audio: ' + JSON.stringify(padAudio));
      } finally { await agent.context.close(); }
    };

    const runAdvancedVocalAgent = async () => {
      const agent = await prepareAgent('Advanced Phoneme Singer agent', { width: 1365, height: 900 });
      try {
        const room = await openAgentRoom(agent.page, 'operating-systems', 'echonoise-os');
        const eno = room.locator('.echonoise-os');
        await eno.waitFor({ state: 'visible' });
        await eno.locator('.eno-desktop-icons [data-eno-launch="vocal"]').click();
        const vocal = eno.locator('.eno-window[data-eno-window="vocal"]');
        await vocal.waitFor({ state: 'visible', timeout: 15000 });
        await vocal.locator('[data-eno-vocal-mode="singer"]').click();
        await vocal.locator('[data-eno-singer-panel]').waitFor({ state: 'visible' });
        const dictionaryStatus = vocal.locator('[data-eno-dict-status]');
        await agent.page.waitForFunction(() => {
          const node = document.querySelector('.echonoise-os [data-eno-window="vocal"] [data-eno-dict-status]');
          return node && /headwords|unavailable/i.test(node.textContent || '');
        }, null, { timeout: 30000 });
        const dictionaryResult = await dictionaryStatus.innerText();
        assert.match(dictionaryResult, /headwords/i, 'Advanced Phoneme Singer pronunciation dictionary failed: ' + dictionaryResult);
        await vocal.locator('[data-eno-lyrics]').fill('Hello, my little world.');
        await vocal.locator('[data-eno-action="generate-vocal"]').click();
        await agent.page.waitForFunction(() => {
          const editor = document.querySelector('.echonoise-os [data-eno-window="vocal"] [data-eno-phoneme-editor]');
          return Boolean(editor && editor.value.trim());
        }, null, { timeout: 30000 });
        const phonemes = await vocal.locator('[data-eno-phoneme-editor]').inputValue();
        assert.match(phonemes, /[A-Z]{1,3}[012]?/, 'Generated vocal line did not contain phonemes.');
        const pronunciationReport = await vocal.locator('[data-eno-pronunciation-report]').innerText();
        assert.match(pronunciationReport, /dictionary|custom phonemes/i,
          'Advanced singer fell back to estimated/unavailable pronunciations: ' + pronunciationReport);

        await vocal.locator('[data-eno-action="sing-vocal"]').click();
        await agent.page.waitForFunction(() =>
          (document.querySelector('.echonoise-os [data-eno-feedback]')?.textContent || '').includes('Phoneme Singer is playing'),
          null, { timeout: 15000 });
        const audio = await audioOutputReport(agent.page.mainFrame());
        assert.equal(audio.context, 'running', 'Advanced Phoneme Singer AudioContext is not running: ' + JSON.stringify(audio));
        assert.ok(audio.oscillators + audio.buffers > 0, 'Advanced Phoneme Singer scheduled no sound nodes: ' + JSON.stringify(audio));
        assert.ok(audio.rms > 0.00001 || audio.peak > 0.0001, 'Advanced Phoneme Singer produced no measurable audio signal: ' + JSON.stringify(audio));
        await vocal.locator('[data-eno-action="stop"]').click();

        const [phonemeExport] = await Promise.all([
          agent.page.waitForEvent('download'),
          vocal.locator('[data-eno-action="export-phonemes"]').click()
        ]);
        assert.match(phonemeExport.suggestedFilename(), /phoneme-sheet\.json$/i);
        const [midiExport] = await Promise.all([
          agent.page.waitForEvent('download'),
          vocal.locator('[data-eno-action="export-vocal-midi"]').click()
        ]);
        assert.match(midiExport.suggestedFilename(), /\.mid$/i);

        await vocal.locator('[data-eno-launch="voicebank"]').click();
        const voicebank = eno.locator('.eno-window[data-eno-window="voicebank"]');
        await voicebank.waitFor({ state: 'visible' });
        await voicebank.locator('[data-eno-alias-overrides]').fill('AA = aa\nK AE = k ae\nL IY = lee\nS = s');
        await voicebank.locator('[data-eno-action="save-aliases"]').click();
        assert.match(await eno.locator('[data-eno-feedback]').innerText(), /alias map saved/i);
        await voicebank.locator('[data-eno-action="clear-voicebank"]').click();
        console.log('Advanced Phoneme Singer agent: dictionary, generated phonemes, live audio signal, Stop, MIDI/phoneme exports and voicebank controls passed. Audio: ' + JSON.stringify(audio) + '; pronunciation: ' + dictionaryResult + '; line: ' + phonemes);
      } finally { await agent.context.close(); }
    };

    const runWindowLayoutAgent = async () => {
      const agent = await prepareAgent('Window layout agent', { width: 768, height: 900 });
      try {
        const room = await openAgentRoom(agent.page, 'operating-systems', 'echonoise-os');
        await agent.page.setViewportSize({ width: 360, height: 800 });
        const eno = room.locator('.echonoise-os');
        await eno.locator('[data-eno-start-toggle]').click();
        await eno.locator('[data-eno-start-menu] [data-eno-launch="vocal"]').click();
        const vocal = eno.locator('.eno-window[data-eno-window="vocal"]');
        await vocal.waitFor({ state: 'visible' });
        const bounds = await vocal.evaluate(node => {
          const layer = node.closest('.eno-window-layer');
          const a = node.getBoundingClientRect(), b = layer.getBoundingClientRect();
          return { window: { x: a.x, right: a.right, width: a.width }, layer: { x: b.x, right: b.right, width: b.width }, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth };
        });
        console.log('360px Echonoise window geometry:', JSON.stringify(bounds));
        assert.ok(bounds.window.x >= bounds.layer.x - 1 && bounds.window.right <= bounds.layer.right + 1,
          'Echonoise Vocal Synth window extends beyond its containing desktop at 360px: ' + JSON.stringify(bounds));
      } finally { await agent.context.close(); }
    };

    const agentResults = await Promise.allSettled([
      runDarkLooperAgent(),
      runAdvancedVocalAgent(),
      runWindowLayoutAgent()
    ]);
    const agentErrors = agentResults.filter(result => result.status === 'rejected').map(result => String(result.reason?.stack || result.reason));
    console.log('Simulated test-agent results:', JSON.stringify(agentResults.map((result, index) => ({
      agent: ['D4RK L00PER', 'Advanced Phoneme Singer', 'Window layout'][index],
      status: result.status,
      error: result.status === 'rejected' ? String(result.reason?.message || result.reason) : null
    }))));
    assert.deepEqual(agentErrors, [], 'Simulated test agents found failures:\n' + agentErrors.join('\n'));
    if (agentFailures.length) throw new Error('Simulated agent browser errors:\n' + agentFailures.join('\n'));

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
