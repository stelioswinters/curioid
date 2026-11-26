(function () {
      if (window.__curioidAppDisposed) return;
      const app = document.getElementById('zt-app');
      if (!app) return;

      const state = {
        focus: 'overwhelm',
        style: 'calm',
        mins: '2',
        pcReport: '',
        lifeReport: '',
        breathTimeout: null,
        countdownInterval: null,
        remainingSec: 120,
        toastTimeout: null,
        inputRevision: 0,
        disposed: false
      };

      const trackingKeys = new Set([
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
        'fbclid', 'gclid', 'dclid', 'gbraid', 'wbraid', 'msclkid', 'mc_cid', 'mc_eid',
        'ref', 'ref_src'
      ]);

      const words = [
        'amber', 'anchor', 'atlas', 'beacon', 'breeze', 'canyon', 'cedar', 'cobalt',
        'comet', 'coral', 'crest', 'delta', 'ember', 'falcon', 'fjord', 'glacier',
        'harbor', 'horizon', 'indigo', 'kestrel', 'lantern', 'lotus', 'meadow', 'monolith',
        'nebula', 'north', 'obsidian', 'orbit', 'pebble', 'prism', 'quartz', 'raven',
        'ridge', 'river', 'saffron', 'summit', 'timber', 'valley', 'velvet', 'zenith'
      ];

      function byId(id) {
        return document.getElementById(id);
      }

      // Browser capability strings and diagnostic messages can vary by engine.
      // Escape every dynamic value before it enters this app's HTML templates.
      const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
      const safeRecommendationLevel = value => ['good','warn','bad'].includes(String(value)) ? String(value) : 'warn';

      function toast(msg) {
        const el = byId('zt-toast');
        if (!el) return;
        el.textContent = msg;
        el.classList.add('zt-visible');
        clearTimeout(state.toastTimeout);
        state.toastTimeout = setTimeout(() => el.classList.remove('zt-visible'), 2100);
      }

      function switchTab(tabName) {
        ['pc', 'life', 'tools'].forEach(name => {
          const panel = byId('zt-panel-' + name);
          const tabBtn = app.querySelector('[data-zt-tab="' + name + '"]');
          if (panel) panel.classList.toggle('zt-hidden', name !== tabName);
          if (tabBtn) tabBtn.classList.toggle('is-active', name === tabName);
        });
      }

      function setTestBg(bg, fg) {
        const pad = byId('zt-test-pad');
        if (!pad) return;
        pad.style.background = bg || '';
        pad.style.color = fg || '';
      }

      function measureRefresh(samples) {
        const target = samples || 36;
        return new Promise(resolve => {
          let frames = 0;
          let tStart = 0;
          function step(now) {
            if (!tStart) tStart = now;
            frames += 1;
            if (frames < target) {
              requestAnimationFrame(step);
            } else {
              const dt = Math.max(1, now - tStart);
              resolve(Math.max(1, Math.round(((frames - 1) * 1000) / dt)));
            }
          }
          requestAnimationFrame(step);
        });
      }

      function measureLoopLag() {
        return new Promise(resolve => {
          const t0 = performance.now();
          setTimeout(() => {
            resolve(Math.max(0, Math.round(performance.now() - t0 - 20)));
          }, 20);
        });
      }

      function runCpuBench() {
        const t0 = performance.now();
        let acc = 0;
        const loops = 1500000;
        for (let i = 1; i <= loops; i += 1) {
          acc += ((i * 2654435761) >>> 0) % 97;
        }
        const ms = Math.max(0.1, performance.now() - t0);
        return {
          kOpsPerMs: ((loops / ms) / 1000).toFixed(1),
          _keep: acc
        };
      }

      async function inspectWebGpu() {
        if (!navigator.gpu || typeof navigator.gpu.requestAdapter !== 'function') {
          return { ready: false, detail: 'Not exposed in this browser' };
        }
        try {
          const adapter = await navigator.gpu.requestAdapter();
          if (!adapter) return { ready: false, detail: 'No GPU adapter returned' };
          const device = await adapter.requestDevice();
          const hasCompute = typeof device.createComputePipeline === 'function';
          if (typeof device.destroy === 'function') device.destroy();
          return {
            ready: true,
            detail: hasCompute ? 'Adapter + Compute ready' : 'Adapter ready'
          };
        } catch {
          return { ready: false, detail: 'Unavailable in current context' };
        }
      }

      function inspectWebGl() {
        try {
          const canvas = document.createElement('canvas');
          const gl2 = canvas.getContext('webgl2');
          const gl = gl2 || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
          if (!gl) return { ok: false, api: 'None', renderer: 'Software / Disabled' };
          const dbg = gl.getExtension('WEBGL_debug_renderer_info');
          const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'WebGL Active';
          return { ok: true, api: gl2 ? 'WebGL2' : 'WebGL1', renderer: String(renderer) };
        } catch {
          return { ok: false, api: 'Restricted', renderer: 'Blocked by policy' };
        }
      }

      function inspectMediaAndDisplay() {
        const mm = window.matchMedia ? window.matchMedia.bind(window) : null;
        const hdr = mm ? mm('(dynamic-range: high)').matches : false;
        const p3 = mm ? mm('(color-gamut: p3)').matches : false;
        const dark = mm ? mm('(prefers-color-scheme: dark)').matches : true;
        const reducedMotion = mm ? mm('(prefers-reduced-motion: reduce)').matches : false;
        const webAudio = Boolean(window.AudioContext || window.webkitAudioContext);
        const gamut = p3 ? 'Wide (P3)' : 'Standard (sRGB)';
        return {
          hdr,
          gamut,
          dark,
          reducedMotion,
          webAudio,
          colorDepth: window.screen.colorDepth || 24
        };
      }

      async function runPcScan() {
        const btn = byId('zt-run-pc-btn');
        if (btn) {
          btn.disabled = true;
          btn.textContent = 'Running system & security scan...';
        }

        const [fps, lagMs, webgpu] = await Promise.all([
          measureRefresh(36),
          measureLoopLag(),
          inspectWebGpu()
        ]);
        if (state.disposed) return;
        const cpu = runCpuBench();
        const webgl = inspectWebGl();
        const media = inspectMediaAndDisplay();

        const cores = navigator.hardwareConcurrency || 'Unknown';
        const mem = navigator.deviceMemory ? navigator.deviceMemory + ' GB (cap)' : 'Not exposed';
        const dpr = window.devicePixelRatio || 1;
        const screenRes = window.screen.width + 'x' + window.screen.height;
        const viewRes = window.innerWidth + 'x' + window.innerHeight;
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local';
        const lang = navigator.language || 'Unknown';
        const conn = navigator.connection || {};
        const rtt = typeof conn.rtt === 'number' ? conn.rtt + ' ms' : 'N/A';
        const downlink = typeof conn.downlink === 'number' ? conn.downlink + ' Mbps' : 'N/A';
        const netType = conn.effectiveType ? String(conn.effectiveType).toUpperCase() : 'Standard';
        const saveData = Boolean(conn.saveData);

        const isSecure = Boolean(window.isSecureContext);
        const hasSubtle = Boolean(window.crypto && window.crypto.subtle);
        const hasRand = Boolean(window.crypto && typeof window.crypto.getRandomValues === 'function');
        const isolated = Boolean(window.crossOriginIsolated);
        const cookiesOn = Boolean(navigator.cookieEnabled);
        const dnt = navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true;

        let storageText = 'Unavailable';
        let storagePct = 0;
        let persisted = null;
        if (navigator.storage && typeof navigator.storage.estimate === 'function') {
          try {
            const est = await navigator.storage.estimate();
            const usedMB = (est.usage / (1024 * 1024)).toFixed(1);
            const quotaGB = (est.quota / (1024 * 1024 * 1024)).toFixed(1);
            storagePct = est.quota ? Math.round((est.usage / est.quota) * 100) : 0;
            storageText = usedMB + ' MB / ' + quotaGB + ' GB';
          } catch {}
        }
        if (navigator.storage && typeof navigator.storage.persisted === 'function') {
          try {
            persisted = await navigator.storage.persisted();
          } catch {}
        }

        if (state.disposed) return;

        // 1. Performance & Environment Score
        let perfScore = 100;
        const recs = [];

        if (!webgl.ok || /swiftshader|llvmpipe|software/i.test(webgl.renderer)) {
          perfScore -= 22;
          recs.push({
            level: 'bad',
            title: 'Software Graphics Detected - Enable Hardware Acceleration',
            body: 'Enable hardware/graphics acceleration in browser settings so video, canvases, and UI render on your GPU.'
          });
        } else {
          recs.push({
            level: 'good',
            title: webgl.api + ' Graphics Active',
            body: 'Renderer: ' + webgl.renderer + '.'
          });
        }

        recs.push({
          level: webgpu.ready ? 'good' : 'warn',
          title: webgpu.ready ? 'WebGPU Compute & Graphics Ready' : 'WebGPU Not Active',
          body: webgpu.ready
            ? webgpu.detail + ' - capable of modern browser GPU compute and shaders.'
            : webgpu.detail + ' - standard WebGL/CPU rendering remains available.'
        });

        if (fps < 50) {
          perfScore -= 14;
          recs.push({
            level: 'warn',
            title: 'Measured Refresh Rate Is ' + fps + ' Hz',
            body: 'Check battery-saver throttling or OS display refresh-rate settings if your display supports higher Hz.'
          });
        } else {
          recs.push({
            level: 'good',
            title: 'Steady Frame Pacing (' + fps + ' Hz measured)',
            body: 'Animation frame intervals are pacing smoothly.'
          });
        }

        if (lagMs > 45) {
          perfScore -= 10;
          recs.push({
            level: 'warn',
            title: 'Event-Loop Jitter (~' + lagMs + ' ms)',
            body: 'A heavy background tab or extension may be delaying browser tasks.'
          });
        }

        if (dpr > 1.75 && window.innerWidth < 1100) {
          perfScore -= 8;
          recs.push({
            level: 'warn',
            title: 'High Scaling (' + Math.round(dpr * 100) + '%) on ' + viewRes,
            body: 'Adjusting browser zoom (Ctrl/Cmd + - or 0) can increase usable workspace.'
          });
        }

        if (storagePct > 80) {
          perfScore -= 12;
          recs.push({
            level: 'bad',
            title: 'Site Storage Quota High (' + storagePct + '%)',
            body: 'Clear unused cached site data to keep offline web apps running smoothly.'
          });
        }

        perfScore = Math.max(30, perfScore);

        // 2. Web & Context Security Posture Score
        let secScore = 100;

        if (!isSecure) {
          secScore -= 35;
          recs.push({
            level: 'bad',
            title: 'Unencrypted / Non-Secure Context Detected',
            body: 'Pages loaded over plain HTTP lack transport encryption and restrict modern crypto APIs. Serve over HTTPS whenever possible.'
          });
        } else {
          recs.push({
            level: 'good',
            title: 'Secure Context Active (HTTPS / Localhost)',
            body: 'Transport security and restricted browser APIs are available in a secure context.'
          });
        }

        if (!hasSubtle || !hasRand) {
          secScore -= 25;
          recs.push({
            level: 'bad',
            title: 'Web Crypto APIs Restricted or Unavailable',
            body: 'Hardware-backed hashing and cryptographic randomness require a modern secure browser context.'
          });
        } else {
          recs.push({
            level: 'good',
            title: 'Web Crypto & CSPRNG Available',
            body: 'Local SHA-256 and cryptographic random generation are active in memory.'
          });
        }

        if (!isolated) {
          secScore -= 8;
          recs.push({
            level: 'warn',
            title: 'Cross-Origin Isolation Not Enabled on Page',
            body: 'Site isolation headers (COOP/COEP) are not active on this host, which is normal for standard static pages but limits high-resolution timers/SharedArrayBuffer.'
          });
        } else {
          recs.push({
            level: 'good',
            title: 'Cross-Origin Isolated Context',
            body: 'Stronger process/memory isolation is active for this document.'
          });
        }

        recs.push({
          level: 'warn',
          title: 'Browser Security Hygiene Checklist',
          body: 'Keep your browser and extensions updated, audit installed extensions (over-permissioned add-ons are a top browser risk), and use MFA/passkeys on critical accounts.'
        });

        secScore = Math.max(20, Math.min(100, secScore));

        const metrics = [
          { label: 'Security Context', value: isSecure ? 'Secure (HTTPS/Local)' : 'Non-Secure', sub: 'Crypto Subtle: ' + (hasSubtle ? 'Yes' : 'No') },
          { label: 'Origin Isolation', value: isolated ? 'Isolated' : 'Standard', sub: 'Cookies: ' + (cookiesOn ? 'Enabled' : 'Blocked') },
          { label: 'Display & Scaling', value: screenRes + ' @ ' + dpr + 'x', sub: 'Viewport: ' + viewRes },
          { label: 'Color & HDR', value: media.gamut, sub: (media.hdr ? 'HDR High' : 'SDR') + ' | ' + media.colorDepth + '-bit' },
          { label: 'Refresh & Loop Lag', value: fps + ' Hz', sub: 'Timer jitter: ~' + lagMs + ' ms' },
          { label: 'WebGPU Status', value: webgpu.ready ? 'Ready' : 'Fallback', sub: webgpu.detail },
          { label: 'WebGL & Renderer', value: webgl.api, sub: webgl.renderer },
          { label: 'CPU Bench & Cores', value: cpu.kOpsPerMs + 'k ops/ms', sub: cores + ' cores | RAM: ' + mem },
          { label: 'Network Profile', value: navigator.onLine ? netType + ' (' + rtt + ')' : 'Offline', sub: 'Downlink: ' + downlink + (saveData ? ' | Data Saver' : '') },
          { label: 'Storage & Persist', value: storagePct + '% Used', sub: storageText + (persisted !== null ? ' | Persist: ' + (persisted ? 'Yes' : 'No') : '') },
          { label: 'Audio & Motion', value: media.webAudio ? 'WebAudio Ready' : 'No Audio API', sub: 'Reduced Motion: ' + (media.reducedMotion ? 'On' : 'Off') },
          { label: 'Locale & Zone', value: lang, sub: tz + (dnt ? ' | Privacy Signal On' : '') }
        ];

        byId('zt-pc-score').textContent = perfScore + ' / 100';
        byId('zt-pc-summary').textContent =
          perfScore >= 85 ? 'Strong frame pacing, graphics, and browser responsiveness.' :
          perfScore >= 65 ? 'Solid baseline with a few quick tweaks available.' :
                            'Performance bottlenecks detected - see findings below.';

        byId('zt-sec-score').textContent = secScore + ' / 100';
        byId('zt-sec-summary').textContent =
          secScore >= 85 ? 'Secure context and cryptographic primitives verified.' :
          secScore >= 65 ? 'Baseline security active; review hardening notes below.' :
                           'Security warnings detected - check context & crypto status.';

        byId('zt-pc-metrics').innerHTML = metrics.map(m => (
          '<div class="zt-metric">' +
            '<div class="zt-kicker">' + escapeHTML(m.label) + '</div>' +
            '<div class="zt-metric-val">' + escapeHTML(m.value) + '</div>' +
            '<div class="zt-metric-sub">' + escapeHTML(m.sub) + '</div>' +
          '</div>'
        )).join('');

        byId('zt-pc-recs').innerHTML = recs.map(r => (
          '<div class="zt-rec ' + safeRecommendationLevel(r.level) + '">' +
            '<h4>' + escapeHTML(r.title) + '</h4>' +
            '<p>' + escapeHTML(r.body) + '</p>' +
          '</div>'
        )).join('');

        state.pcReport =
          'System, Security & Browser Report\n' +
          'Performance Score: ' + perfScore + '/100 | Security Score: ' + secScore + '/100\n\n' +
          metrics.map(m => '- ' + m.label + ': ' + m.value + ' (' + m.sub + ')').join('\n') +
          '\n\nFindings & Recommendations:\n' +
          recs.map(r => '* [' + r.level.toUpperCase() + '] ' + r.title + ': ' + r.body).join('\n');

        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Run Full System & Security Check';
        }
        byId('zt-pc-intro').classList.add('zt-hidden');
        byId('zt-pc-results').classList.remove('zt-hidden');
        toast('System & security scan complete.');
      }

      function generateLifePlan() {
        const energy = Number(byId('zt-q-energy').value);
        const load = Number(byId('zt-q-load').value);
        const mins = Number(state.mins);
        const focus = state.focus;
        const style = state.style;

        const recs = [];
        let headline = 'Focused Reset Plan';

        if (load >= 7 && energy <= 4) {
          headline = 'Low-Energy High-Load Recovery';
          recs.push({
            level: 'bad',
            title: 'Defer High-Stakes Choices First',
            body: 'High load and low energy narrow perspective. Park big decisions until after a physical reset.'
          });
        } else if (energy >= 7 && load <= 4) {
          headline = 'High-Readiness Momentum Window';
          recs.push({
            level: 'good',
            title: 'Lock In One High-Value Task',
            body: 'Readiness is strong - pick one clear outcome and run the timer without tab-hopping.'
          });
        }

        if (load >= 6) {
          recs.push({
            level: 'warn',
            title: '20-20-20 Eye & Shoulder Unwind',
            body: 'Look ~20 ft (6 m) away for 20 seconds, blink slowly, and drop your shoulders away from your ears.'
          });
        }

        const protocols = {
          overwhelm: {
            title: 'Pick One 5-Minute Starter Step',
            body: 'Write down open loops in one place, choose a single tiny first action, and close extra tabs.'
          },
          fatigue: {
            title: 'Water, Daylight & Paced Breath',
            body: 'Drink a glass of water, step toward natural light or fresh air, and run 4 cycles of the pacer below.'
          },
          decision: {
            title: '10-10-10 & Reversibility Check',
            body: 'Ask if this will matter in 10 months. If reversible, take a low-risk step instead of over-analyzing.'
          },
          posture: {
            title: 'Neck, Shoulder & Stand-Up Reset',
            body: 'Do slow shoulder rolls, gentle chin tucks, and stand up to stretch for 60-90 seconds.'
          },
          sleep: {
            title: 'Dim Lights & Offload Tomorrow',
            body: 'Lower room lights, warm your screen tone, and jot down tomorrow\'s first small step.'
          },
          creative: {
            title: 'Permission for a Rough Draft',
            body: 'Build a rough, imperfect sketch or prototype first - polish comes after momentum.'
          },
          money: {
            title: 'Spot Leaks & Pause Impulse Buys',
            body: 'Check recurring charges you rarely use and put non-essential buys on a 24-hour pause.'
          }
        };

        const chosen = protocols[focus] || protocols.overwhelm;
        const prefix =
          style === 'action' ? 'Do now: ' :
          style === 'structured' ? 'Step (' + mins + 'm): ' :
          '';

        recs.push({ level: 'good', title: chosen.title, body: prefix + chosen.body });
        recs.push({
          level: 'good',
          title: mins + '-Minute Timer Boundary',
          body: 'Use the countdown timer below as a clean start/stop block.'
        });

        state.remainingSec = mins * 60;
        updateTimerText();

        byId('zt-life-headline').textContent = headline;
        byId('zt-life-sub').textContent =
          'Energy ' + energy + '/10 | Load ' + load + '/10 | ' + mins + 'm window';

        byId('zt-life-recs').innerHTML = recs.map(r => (
          '<div class="zt-rec ' + safeRecommendationLevel(r.level) + '">' +
            '<h4>' + escapeHTML(r.title) + '</h4>' +
            '<p>' + escapeHTML(r.body) + '</p>' +
          '</div>'
        )).join('');

        state.lifeReport =
          headline + ' (Energy ' + energy + '/10, Load ' + load + '/10, ' + mins + 'm, Tone: ' + style + ')\n' +
          recs.map(r => '* ' + r.title + ': ' + r.body).join('\n');

        byId('zt-life-form').classList.add('zt-hidden');
        byId('zt-life-results').classList.remove('zt-hidden');
        toast('Plan generated.');
      }

      function stopBreath() {
        clearTimeout(state.breathTimeout);
        state.breathTimeout = null;
        const btn = byId('zt-breath-btn');
        if (btn) btn.textContent = 'Start Pacer';
      }

      function toggleBreath() {
        if (state.breathTimeout) {
          stopBreath();
          return;
        }
        const phases = [
          { text: 'Inhale gently (4s)', ms: 4000 },
          { text: 'Hold softly (4s)', ms: 4000 },
          { text: 'Exhale slowly (6s)', ms: 6000 }
        ];
        let idx = 0;
        let cycles = 0;
        const btn = byId('zt-breath-btn');
        const txt = byId('zt-breath-text');
        if (btn) btn.textContent = 'Stop';

        function next() {
          if (cycles >= 4) {
            stopBreath();
            if (txt) txt.textContent = '4 cycles complete';
            return;
          }
          const p = phases[idx];
          if (txt) txt.textContent = p.text;
          idx = (idx + 1) % phases.length;
          if (idx === 0) cycles += 1;
          state.breathTimeout = setTimeout(next, p.ms);
        }
        next();
      }

      function updateTimerText() {
        const el = byId('zt-timer-display');
        if (!el) return;
        const m = String(Math.floor(state.remainingSec / 60)).padStart(2, '0');
        const s = String(state.remainingSec % 60).padStart(2, '0');
        el.textContent = m + ':' + s;
      }

      function stopTimer() {
        clearInterval(state.countdownInterval);
        state.countdownInterval = null;
        const btn = byId('zt-timer-btn');
        if (btn) btn.textContent = 'Start';
      }

      function toggleTimer() {
        if (state.countdownInterval) {
          stopTimer();
          return;
        }
        if (state.remainingSec <= 0) state.remainingSec = Number(state.mins) * 60;
        const btn = byId('zt-timer-btn');
        if (btn) btn.textContent = 'Pause';
        state.countdownInterval = setInterval(() => {
          state.remainingSec -= 1;
          updateTimerText();
          if (state.remainingSec <= 0) {
            stopTimer();
            const disp = byId('zt-timer-display');
            if (disp) disp.textContent = '00:00 - Done';
            toast('Timer complete.');
          }
        }, 1000);
      }

      function resetTimer() {
        stopTimer();
        state.remainingSec = Number(state.mins) * 60;
        updateTimerText();
      }

      function cleanUrls() {
        const lines = byId('zt-url-input').value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        const seen = new Set();
        const out = [];
        for (const line of lines) {
          try {
            const u = new URL(line);
            for (const key of [...u.searchParams.keys()]) {
              const lower = key.toLowerCase();
              if (lower.startsWith('utm_') || trackingKeys.has(lower)) {
                u.searchParams.delete(key);
              }
            }
            const clean = u.toString();
            if (!seen.has(clean)) { seen.add(clean); out.push(clean); }
          } catch {
            if (!seen.has(line)) { seen.add(line); out.push(line); }
          }
        }
        byId('zt-url-output').value = out.join('\n');
        toast('Cleaned ' + out.length + ' link(s).');
      }

      function runBase64(mode) {
        const raw = byId('zt-url-input').value;
        try {
          if (mode === 'encode') {
            const bytes = new TextEncoder().encode(raw);
            let bin = '';
            for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
            byId('zt-url-output').value = btoa(bin);
          } else {
            const bin = atob(raw.trim());
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
            byId('zt-url-output').value = new TextDecoder().decode(bytes);
          }
          toast(mode === 'encode' ? 'Encoded to Base64.' : 'Decoded from Base64.');
        } catch {
          byId('zt-url-output').value = 'Invalid input for Base64 operation.';
        }
      }

      function textStats() {
        const raw = byId('zt-text-input').value;
        let wordCount = 0, inWord = false;
        for (const character of raw) {
          if (/\s/u.test(character)) inWord = false;
          else if (!inWord) { wordCount += 1; inWord = true; }
        }
        const charCount = raw.length;
        const minRead = Math.max(1, Math.ceil(wordCount / 220));
        const cleaned = raw.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
        byId('zt-text-output').value =
          'Words: ' + wordCount + ' | Chars: ' + charCount + ' | ~' + minRead + ' min read\n---\n' + cleaned;
      }

      function formatJson() {
        const raw = byId('zt-text-input').value.trim();
        try {
          byId('zt-text-output').value = JSON.stringify(JSON.parse(raw), null, 2);
          toast('Formatted JSON.');
        } catch (err) {
          byId('zt-text-output').value = 'Invalid JSON: ' + err.message;
        }
      }

      async function sha256Input() {
        const input = byId('zt-text-input');
        const output = byId('zt-text-output');
        if (!input || !output || state.disposed) return;
        const raw = String(input.value || '');
        if (raw.length > 2000000) {
          output.value = 'Input is too large. The maximum supported size is 2,000,000 characters.';
          return;
        }
        const revision = state.inputRevision;
        if (!window.crypto || !window.crypto.subtle) {
          output.value = 'crypto.subtle requires a secure context (HTTPS or localhost).';
          return;
        }
        const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
        if (state.disposed || revision !== state.inputRevision || !output.isConnected) return;
        const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
        output.value = 'SHA-256:\n' + hex;
        toast('Computed SHA-256 hash.');
      }

      function randInt(max) {
        if (!Number.isSafeInteger(max) || max < 1 || max > 0x100000000) throw new Error('Invalid random range.');
        const limit = Math.floor(0x100000000 / max) * max;
        const arr = new Uint32Array(1);
        do { window.crypto.getRandomValues(arr); } while (arr[0] >= limit);
        return arr[0] % max;
      }

      function makePassword(len) {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*_-+=';
        let out = '';
        for (let i = 0; i < len; i += 1) out += chars[randInt(chars.length)];
        byId('zt-pw-output').value = out;
        toast('Generated ' + len + '-character password.');
      }

      function makePassphrase(count) {
        const parts = [];
        for (let i = 0; i < count; i += 1) parts.push(words[randInt(words.length)]);
        parts.push(String(10 + randInt(90)));
        byId('zt-pw-output').value = parts.join('-');
        toast('Generated passphrase.');
      }

      function scoreOptions() {
        const a = byId('zt-opt-a-name').value.trim() || 'Option A';
        const b = byId('zt-opt-b-name').value.trim() || 'Option B';
        const sa = Number(byId('zt-a-up').value) + Number(byId('zt-a-ea').value) + Number(byId('zt-a-co').value);
        const sb = Number(byId('zt-b-up').value) + Number(byId('zt-b-ea').value) + Number(byId('zt-b-co').value);
        const out = byId('zt-decision-verdict');
        if (sa > sb) out.textContent = a + ' leads (' + sa + '/30 vs ' + sb + '/30)';
        else if (sb > sa) out.textContent = b + ' leads (' + sb + '/30 vs ' + sa + '/30)';
        else out.textContent = 'Tie (' + sa + '/30) - pick lower friction';
      }

      async function copyText(str) {
        if (!str) return;
        try {
          if (navigator.clipboard?.writeText && window.isSecureContext) {
            await navigator.clipboard.writeText(str);
          } else {
            const field = document.createElement('textarea');
            field.value = str;
            field.setAttribute('readonly', '');
            field.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
            document.body.appendChild(field);
            field.select();
            let copied = false;
            try { copied = document.execCommand('copy'); } finally { field.remove(); }
            if (!copied) throw new Error('Clipboard write was denied.');
          }
          toast('Copied to clipboard.');
        } catch {
          toast('Clipboard blocked by browser.');
        }
      }

      function downloadText(filename, content) {
        if (!content) return;
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 500);
        toast('Downloaded ' + filename + '.');
      }

      function wipeAll() {
        stopBreath();
        stopTimer();
        state.pcReport = '';
        state.lifeReport = '';
        setTestBg('', '');
        byId('zt-key-readout').textContent = 'Press any key on your keyboard while focused...';
        byId('zt-pc-results').classList.add('zt-hidden');
        byId('zt-pc-intro').classList.remove('zt-hidden');
        byId('zt-life-results').classList.add('zt-hidden');
        byId('zt-life-form').classList.remove('zt-hidden');
        byId('zt-q-energy').value = 5;
        byId('zt-q-load').value = 5;
        byId('zt-val-energy').textContent = '5 / 10';
        byId('zt-val-load').textContent = '5 / 10';
        ['zt-url-input', 'zt-url-output', 'zt-text-input', 'zt-text-output', 'zt-pw-output'].forEach(id => {
          byId(id).value = '';
        });
        byId('zt-decision-verdict').textContent = '';
        toast('Session data wiped.');
      }

      app.addEventListener('click', e => {
        const tabBtn = e.target.closest('[data-zt-tab]');
        if (tabBtn) {
          switchTab(tabBtn.getAttribute('data-zt-tab'));
          return;
        }

        const chip = e.target.closest('.zt-chip');
        if (chip) {
          const group = chip.closest('[data-zt-group]');
          if (group) {
            group.querySelectorAll('.zt-chip').forEach(c => c.classList.remove('is-selected'));
            chip.classList.add('is-selected');
            state[group.getAttribute('data-zt-group')] = chip.getAttribute('data-val');
          }
          return;
        }

        const bgBtn = e.target.closest('[data-zt-bg]');
        if (bgBtn) {
          setTestBg(bgBtn.getAttribute('data-zt-bg'), bgBtn.getAttribute('data-zt-fg'));
          return;
        }

        const copyBtn = e.target.closest('[data-zt-copy]');
        if (copyBtn) {
          const target = byId(copyBtn.getAttribute('data-zt-copy'));
          if (target) copyText(target.value);
          return;
        }

        const actBtn = e.target.closest('[data-zt-action]');
        if (!actBtn) return;

        const action = actBtn.getAttribute('data-zt-action');
        switch (action) {
          case 'scan-pc': runPcScan(); break;
          case 'copy-pc': copyText(state.pcReport); break;
          case 'dl-pc': downloadText('system-security-report.txt', state.pcReport); break;
          case 'plan-life': generateLifePlan(); break;
          case 'edit-life':
            stopBreath();
            stopTimer();
            byId('zt-life-results').classList.add('zt-hidden');
            byId('zt-life-form').classList.remove('zt-hidden');
            break;
          case 'copy-life': copyText(state.lifeReport); break;
          case 'dl-life': downloadText('personal-plan.txt', state.lifeReport); break;
          case 'toggle-breath': toggleBreath(); break;
          case 'toggle-timer': toggleTimer(); break;
          case 'reset-timer': resetTimer(); break;
          case 'clean-urls': cleanUrls(); break;
          case 'b64-enc': runBase64('encode'); break;
          case 'b64-dec': runBase64('decode'); break;
          case 'text-stats': textStats(); break;
          case 'fmt-json': formatJson(); break;
          case 'sha256': sha256Input(); break;
          case 'pw-18': makePassword(18); break;
          case 'pw-28': makePassword(28); break;
          case 'passphrase': makePassphrase(4); break;
          case 'score-opts': scoreOptions(); break;
          case 'wipe': wipeAll(); break;
        }
      });

      app.addEventListener('input', e => {
        const id = e.target.id;
        if (id === 'zt-text-input') state.inputRevision += 1;
        if (id === 'zt-q-energy') byId('zt-val-energy').textContent = e.target.value + ' / 10';
        else if (id === 'zt-q-load') byId('zt-val-load').textContent = e.target.value + ' / 10';
        else if (id === 'zt-a-up') byId('zt-a-up-lbl').textContent = e.target.value;
        else if (id === 'zt-a-ea') byId('zt-a-ea-lbl').textContent = e.target.value;
        else if (id === 'zt-a-co') byId('zt-a-co-lbl').textContent = e.target.value;
        else if (id === 'zt-b-up') byId('zt-b-up-lbl').textContent = e.target.value;
        else if (id === 'zt-b-ea') byId('zt-b-ea-lbl').textContent = e.target.value;
        else if (id === 'zt-b-co') byId('zt-b-co-lbl').textContent = e.target.value;
      });

      const onGlobalKeydown = e => {
        if (state.disposed) return;
        const readout = byId('zt-key-readout');
        if (!readout) return;
        const mods = [
          e.ctrlKey ? 'Ctrl' : '',
          e.altKey ? 'Alt' : '',
          e.shiftKey ? 'Shift' : '',
          e.metaKey ? 'Meta' : ''
        ].filter(Boolean);
        const combo = mods.length ? mods.join(' + ') + ' + ' + e.key : e.key;
        readout.textContent = 'Key: "' + combo + '" (code: ' + e.code + ')';
      };
      window.addEventListener('keydown', onGlobalKeydown);

      window.addEventListener('curioid-app-dispose', () => {
        state.disposed = true;
        state.inputRevision += 1;
        window.removeEventListener('keydown', onGlobalKeydown);
        clearTimeout(state.breathTimeout);
        clearInterval(state.countdownInterval);
        clearTimeout(state.toastTimeout);
        state.breathTimeout = state.countdownInterval = state.toastTimeout = null;
      }, { once: true });
    })();
