(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  // Expanded library of instruments and sound effects categorized
  const soundLibrary = [
    { category: 'Kicks', id: 'kick', name: 'Dark Boom-Bap Kick' },
    { category: 'Kicks', id: 'heavykick', name: 'Heavy Sub Kick' },
    { category: 'Kicks', id: 'subkick', name: 'Sub-Zero 808 Kick' },
    { category: 'Kicks', id: 'dustykick', name: 'Rusty Vinyl Kick' },
    { category: 'Kicks', id: 'punchkick', name: 'Punchy Analog Kick' },
    { category: 'Kicks', id: 'deep909', name: 'Deep 909 Kick' },
    { category: 'Kicks', id: 'hardcorekick', name: 'Hardcore Industrial Kick' },
    { category: 'Snares', id: 'snare', name: 'Dust Snare' },
    { category: 'Snares', id: 'crunchysnare', name: 'Rusty Lo-Fi Snare' },
    { category: 'Snares', id: 'rim', name: 'Dry Rimshot' },
    { category: 'Snares', id: 'hardsnare', name: 'Aggressive Street Snare' },
    { category: 'Snares', id: 'clapsnare', name: 'Layered Clap Snare' },
    { category: 'Snares', id: 'snappyrim', name: 'Snappy Electro Rim' },
    { category: 'Snares', id: 'gatedsnare', name: 'Gated 80s Snare' },
    { category: 'Hi-Hats', id: 'closedhat', name: 'Closed Hi-Hat' },
    { category: 'Hi-Hats', id: 'openhat', name: 'Open Hi-Hat' },
    { category: 'Hi-Hats', id: 'shakerhat', name: 'Lo-Fi Shaker Hat' },
    { category: 'Hi-Hats', id: 'tighthat', name: 'Tight Trap Hat' },
    { category: 'Hi-Hats', id: 'pedalhat', name: 'Pedal Hi-Hat' },
    { category: 'Hi-Hats', id: 'splashhat', name: 'Splash Hat FX' },
    { category: 'Basses & Subs', id: 'sub', name: 'Dark Sub Bass' },
    { category: 'Basses & Subs', id: 'reese', name: 'Reese Bass Slide' },
    { category: 'Basses & Subs', id: 'distortsub', name: 'Distorted 808 Bass' },
    { category: 'Basses & Subs', id: 'acidbass', name: 'Acid Squelch Bass' },
    { category: 'Basses & Subs', id: 'wubsub', name: 'Wub Modulated Bass' },
    { category: 'Atmospheres & FX', id: 'vinyl', name: 'Vinyl Dust & Crackle' },
    { category: 'Atmospheres & FX', id: 'drone', name: 'Dark Dissonant Drone' },
    { category: 'Atmospheres & FX', id: 'metal', name: 'Industrial Metal Hit' },
    { category: 'Atmospheres & FX', id: 'impact', name: 'Low Cinematic Impact' },
    { category: 'Atmospheres & FX', id: 'reverse', name: 'Reversed Noise Swell' },
    { category: 'Atmospheres & FX', id: 'tape', name: 'Dark Tape Stop' },
    { category: 'Atmospheres & FX', id: 'scratch', name: 'Vinyl Scratch FX' },
    { category: 'Atmospheres & FX', id: 'gunshot', name: 'Grime Gunshot FX' },
    { category: 'Atmospheres & FX', id: 'stab', name: 'Dark Horror Synth Stab' },
    { category: 'Atmospheres & FX', id: 'laser', name: 'Retro Sci-Fi Laser' },
    { category: 'Atmospheres & FX', id: 'bell', name: 'Mystic Temple Bell' }
  ];

  const padAssignments = [
    'kick', 'snare', 'closedhat', 'sub',
    'rim', 'openhat', 'metal', 'vinyl',
    'drone', 'impact', 'reverse', 'tape'
  ];

  let editMode = false;
  let activePadIndexForEditing = null;
  let selectedSoundIdInModal = null;
  let tempo = 88;

  // Web Audio Context Engine
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  let audioContext = null;
  let masterGain = null;
  let noiseBuffers = new Map();

  const initAudio = async () => {
    if (!AudioContextClass) throw new Error('Web Audio is not supported in this browser. Try an up-to-date browser with audio enabled.');
    if (!audioContext) {
      audioContext = new AudioContextClass();
      masterGain = audioContext.createGain();
      masterGain.gain.value = 0.75;
      
      const compressor = audioContext.createDynamicsCompressor();
      compressor.threshold.value = -14;
      compressor.ratio.value = 4.0;
      
      masterGain.connect(compressor);
      compressor.connect(audioContext.destination);
    }
    if (audioContext.state === 'suspended') await audioContext.resume();
  };

  const getNoiseBuffer = (kind, duration) => {
    const key = `${kind}-${duration}`;
    if (noiseBuffers.has(key)) return noiseBuffers.get(key);
    const length = Math.max(1, Math.floor(audioContext.sampleRate * duration));
    const buffer = audioContext.createBuffer(1, length, audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    let previous = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      if (kind === 'vinyl') {
        const dust = previous * 0.76 + white * 0.24;
        const pop = Math.random() > 0.9965 ? (Math.random() * 2 - 1) * 0.78 : 0;
        data[i] = dust * 0.065 + pop;
        previous = dust;
      } else {
        data[i] = white;
      }
    }
    noiseBuffers.set(key, buffer);
    return buffer;
  };

  const playSoundEngine = (type, requestedTime = audioContext.currentTime) => {
    const now = Math.max(audioContext.currentTime, requestedTime);
    const voice = audioContext.createGain();
    voice.connect(masterGain);

    const noise = (kind, duration, target = voice) => {
      const source = audioContext.createBufferSource();
      source.buffer = getNoiseBuffer(kind, duration);
      source.connect(target);
      source.start(now);
      source.stop(now + duration);
      return source;
    };

    const osc = (wave, freqStart, freqEnd, duration, level, target = voice) => {
      const o = audioContext.createOscillator();
      const a = audioContext.createGain();
      o.type = wave;
      o.frequency.setValueAtTime(freqStart, now);
      if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(15, freqEnd), now + duration);
      a.gain.setValueAtTime(level, now);
      a.gain.exponentialRampToValueAtTime(0.001, now + duration);
      o.connect(a).connect(target);
      o.start(now);
      o.stop(now + duration + 0.02);
      return o;
    };

    switch (type) {
      case 'kick':
      case 'heavykick':
      case 'dustykick':
      case 'punchkick':
        osc('sine', 120, 28, 0.32, 0.95);
        break;
      case 'subkick':
      case 'distortsub':
      case 'deep909':
        osc('sine', 95, 18, 0.45, 1.0);
        break;
      case 'hardcorekick':
        osc('square', 140, 40, 0.25, 0.8);
        break;
      case 'snare':
      case 'crunchysnare':
      case 'hardsnare':
      case 'clapsnare':
      case 'gatedsnare':
      {
        const f = audioContext.createBiquadFilter();
        f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 0.9;
        noise('white', 0.2, f); f.connect(voice);
        osc('triangle', 180, 80, 0.12, 0.3);
        break;
      }
      case 'rim':
      case 'snappyrim':
        osc('sine', 320, 200, 0.05, 0.45);
        break;
      case 'closedhat':
      case 'shakerhat':
      case 'tighthat':
      case 'pedalhat':
      {
        const f = audioContext.createBiquadFilter();
        f.type = 'highpass'; f.frequency.value = 7000;
        const a = audioContext.createGain();
        a.gain.setValueAtTime(0.15, now); a.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        noise('white', 0.05, f); f.connect(a).connect(voice);
        break;
      }
      case 'openhat':
      case 'splashhat':
      {
        const f = audioContext.createBiquadFilter();
        f.type = 'highpass'; f.frequency.value = 5000;
        const a = audioContext.createGain();
        a.gain.setValueAtTime(0.2, now); a.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        noise('white', 0.25, f); f.connect(a).connect(voice);
        break;
      }
      case 'sub':
      case 'reese':
        osc('sawtooth', 44, 40, 0.6, 0.3);
        osc('sine', 44, 40, 0.6, 0.7);
        break;
      case 'acidbass':
        osc('sawtooth', 120, 50, 0.3, 0.5);
        break;
      case 'wubsub':
        osc('sine', 70, 35, 0.5, 0.8);
        break;
      case 'metal':
        osc('sawtooth', 400, 390, 0.4, 0.2);
        osc('sawtooth', 880, 870, 0.3, 0.15);
        break;
      case 'vinyl':
      case 'scratch':
      {
        const f = audioContext.createBiquadFilter();
        f.type = 'bandpass'; f.frequency.value = 2000;
        noise('vinyl', 0.4, f); f.connect(voice);
        break;
      }
      case 'drone':
        osc('sawtooth', 55, 52, 0.9, 0.25);
        break;
      case 'impact':
      case 'gunshot':
        osc('sine', 60, 20, 0.6, 0.5);
        break;
      case 'reverse':
      {
        const a = audioContext.createGain();
        a.gain.setValueAtTime(0.001, now); a.gain.linearRampToValueAtTime(0.25, now + 0.5);
        noise('white', 0.6, a);
        break;
      }
      case 'tape':
      case 'stab':
        osc('sawtooth', 200, 30, 0.5, 0.4);
        break;
      case 'laser':
        osc('sine', 800, 100, 0.25, 0.4);
        break;
      case 'bell':
        osc('sine', 1200, 1190, 0.8, 0.3);
        break;
      default:
        osc('sine', 200, 100, 0.2, 0.4);
        break;
    }
  };

  const STEPS_PER_BAR = 16;
  let loopGrid = Array.from({ length: STEPS_PER_BAR }, () => new Set());
  let isPlaying = false;
  let isRecording = true;
  let step = 0;
  let barCount = 1;
  let schedulerTimer = null;
  let nextNoteTime = 0;

  // Live recording variables
  let isLiveRecording = false;
  let mediaStreamDestination = null;
  let mediaRecorder = null;
  let recordedChunks = [];
  let recordingTimeout = null;
  let pendingRecordingBlob = null;

  const stepStrip = $('#stepStrip');
  const mpcStatus = $('#mpcStatus');
  const mpcModeLabel = $('#mpcModeLabel');
  const tempoDisplay = $('#tempoDisplay');
  const mpcLed = $('#mpcLed');
  const mpcRecLed = $('#mpcRecLed');
  const loopToggle = $('#loopToggle');
  const recToggle = $('#recToggle');
  const editModeToggle = $('#editModeToggle');
  const liveRecordBtn = $('#liveRecordBtn');
  const clearBtn = $('#clearBtn');
  const tempoSlider = $('#tempoSlider');
  const tempoReadout = $('#tempoReadout');

  const stepPips = [];
  for (let i = 0; i < STEPS_PER_BAR; i++) {
    const pip = document.createElement('div');
    pip.className = 'step-pip';
    pip.dataset.step = i;
    pip.addEventListener('click', () => {
      loopGrid[i].clear();
      renderStepVisuals(isPlaying ? step : -1);
      setSamplerStatus(`CLEARED STEP ${String(i + 1).padStart(2, '0')}`);
    });
    stepStrip.appendChild(pip);
    stepPips.push(pip);
  }

  const syncPadBadges = () => {
    const activeTypes = new Set();
    loopGrid.forEach(set => set.forEach(t => activeTypes.add(t)));
    $$('.pad').forEach((pad, idx) => {
      const soundId = padAssignments[idx];
      pad.classList.toggle('has-seq', activeTypes.has(soundId));
    });
  };

  const renderStepVisuals = (activeStep = -1) => {
    stepPips.forEach((pip, idx) => {
      pip.classList.toggle('has-note', loopGrid[idx].size > 0);
      pip.classList.toggle('is-current', isPlaying && idx === activeStep);
    });
    syncPadBadges();
  };

  const setSamplerStatus = (msg) => {
    if (mpcStatus) mpcStatus.textContent = msg;
  };

  const updateTempoUI = () => {
    if (tempoSlider) tempoSlider.value = tempo;
    if (tempoReadout) tempoReadout.textContent = tempo;
    if (tempoDisplay) tempoDisplay.textContent = `16-STEP SEQUENCER // ${tempo} BPM`;
  };

  const setMode = (mode) => {
    if (mode === 'edit') {
      editMode = !editMode;
      if (editMode) isRecording = false;
    } else if (mode === 'rec') {
      isRecording = !isRecording;
      if (isRecording && editMode) editMode = false;
    }
    syncTransportUI();
    setSamplerStatus(
      editMode ? 'EDIT MODE ACTIVE: CLICK ANY PAD TO ASSIGN SOUND' :
      isRecording ? 'OVERDUB REC ARMED' : 'OVERDUB REC OFF'
    );
  };

  const syncTransportUI = () => {
    mpcLed?.classList.toggle('active', isPlaying);
    mpcRecLed?.classList.toggle('active', isRecording || isLiveRecording);
    
    if (loopToggle) {
      loopToggle.classList.toggle('playing', isPlaying);
      loopToggle.textContent = isPlaying ? 'Stop Loop' : 'Play Loop';
      loopToggle.disabled = isLiveRecording;
    }
    if (recToggle) {
      recToggle.classList.toggle('recording', isRecording);
      recToggle.textContent = isRecording ? 'Overdub: ON' : 'Overdub: OFF';
      recToggle.disabled = editMode || isLiveRecording;
    }
    if (editModeToggle) {
      editModeToggle.classList.toggle('edit-mode-active', editMode);
      editModeToggle.textContent = editMode ? 'Edit: ON' : 'Edit: OFF';
      editModeToggle.disabled = isLiveRecording;
    }
    if (liveRecordBtn) {
      liveRecordBtn.classList.toggle('recording', isLiveRecording);
      liveRecordBtn.textContent = isLiveRecording ? 'Stop Rec' : 'Live Rec';
    }
    if (mpcModeLabel) {
      mpcModeLabel.textContent = editMode ? 'MODE: SOUND CUSTOMIZER (CLICK ANY PAD)' : `MODE: STANDARD // BAR ${String(barCount).padStart(2, '0')}`;
    }
  };

  const flashPadElement = (padEl, delayMs = 0) => {
    if (!padEl) return;
    window.setTimeout(() => {
      padEl.classList.add('hit');
      window.setTimeout(() => padEl.classList.remove('hit'), 120);
    }, Math.max(0, delayMs));
  };

  const getNearestQuantizedStep = () => {
    if (!isPlaying || !audioContext) return step;
    const secondsPerStep = 60 / tempo / 4;
    const remainder = nextNoteTime - audioContext.currentTime;
    if (remainder < secondsPerStep * 0.35) return step;
    return (step - 1 + STEPS_PER_BAR) % STEPS_PER_BAR;
  };

  const handlePadInteraction = async (padIndex) => {
    try {
      await initAudio();
      const soundId = padAssignments[padIndex];
      playSoundEngine(soundId);
      const padEl = $(`.pad[data-index="${padIndex}"]`);
      flashPadElement(padEl);

      if (editMode) {
        openSoundModal(padIndex);
        return;
      }

      if (isPlaying && isRecording) {
        const targetStep = getNearestQuantizedStep();
        if (loopGrid[targetStep].has(soundId)) {
          loopGrid[targetStep].delete(soundId);
          setSamplerStatus(`REMOVED ${soundId.toUpperCase()} @ STEP ${String(targetStep + 1).padStart(2, '0')}`);
        } else {
          loopGrid[targetStep].add(soundId);
          setSamplerStatus(`RECORDED ${soundId.toUpperCase()} -> STEP ${String(targetStep + 1).padStart(2, '0')}`);
        }
        renderStepVisuals(step);
      } else {
        setSamplerStatus(`PAD HIT: ${soundId.toUpperCase()}`);
      }
    } catch (e) {
      setSamplerStatus('AUDIO READY REQUIRED');
    }
  };

  $$('.pad').forEach(pad => {
    const idx = parseInt(pad.dataset.index, 10);
    pad.addEventListener('click', () => handlePadInteraction(idx));
  });

  // Sound Selection Modal Logic
  const soundModal = $('#soundModal');
  const modalTitle = $('#modalTitle');
  const modalClose = $('#modalClose');
  const soundSearch = $('#soundSearch');
  const soundListContainer = $('#soundListContainer');
  const modalSelectBtn = $('#modalSelectBtn');

  const openSoundModal = (padIndex) => {
    activePadIndexForEditing = padIndex;
    modalTitle.textContent = `Assign Sound to Pad ${padIndex + 1}`;
    soundSearch.value = '';
    selectedSoundIdInModal = padAssignments[padIndex];
    renderSoundList('');
    soundModal.classList.add('is-open');
    soundModal.setAttribute('aria-hidden', 'false');
  };

  const closeSoundModal = () => {
    soundModal.classList.remove('is-open');
    soundModal.setAttribute('aria-hidden', 'true');
    activePadIndexForEditing = null;
    selectedSoundIdInModal = null;
  };

  const renderSoundList = (filterText = '') => {
    soundListContainer.innerHTML = '';
    const filtered = soundLibrary.filter(s => s.name.toLowerCase().includes(filterText.toLowerCase()) || s.category.toLowerCase().includes(filterText.toLowerCase()));
    
    const categories = {};
    filtered.forEach(s => {
      if (!categories[s.category]) categories[s.category] = [];
      categories[s.category].push(s);
    });

    for (const [cat, sounds] of Object.entries(categories)) {
      const catTitle = document.createElement('div');
      catTitle.className = 'sound-category-title';
      catTitle.textContent = cat;
      soundListContainer.appendChild(catTitle);

      sounds.forEach(snd => {
        const row = document.createElement('div');
        row.className = `sound-item-row ${selectedSoundIdInModal === snd.id ? 'selected' : ''}`;
        const nameLabel = document.createElement('span');
        nameLabel.textContent = String(snd.name || 'Untitled sound');
        const categoryLabel = document.createElement('span');
        categoryLabel.textContent = String(snd.category || 'Uncategorised');
        categoryLabel.style.fontSize = '0.65rem';
        categoryLabel.style.color = 'var(--muted)';
        row.replaceChildren(nameLabel, categoryLabel);
        row.addEventListener('click', () => {
          selectedSoundIdInModal = snd.id;
          playSoundEngine(snd.id);
          $$('.sound-item-row', soundListContainer).forEach(r => r.classList.remove('selected'));
          row.classList.add('selected');
        });
        soundListContainer.appendChild(row);
      });
    }
  };

  soundSearch?.addEventListener('input', (e) => renderSoundList(e.target.value));
  modalClose?.addEventListener('click', closeSoundModal);
  soundModal?.addEventListener('click', (e) => { if (e.target === soundModal) closeSoundModal(); });

  modalSelectBtn?.addEventListener('click', () => {
    if (activePadIndexForEditing !== null && selectedSoundIdInModal !== null) {
      padAssignments[activePadIndexForEditing] = selectedSoundIdInModal;
      const padEl = $(`.pad[data-index="${activePadIndexForEditing}"]`);
      const matchedSnd = soundLibrary.find(s => s.id === selectedSoundIdInModal);
      if (padEl && matchedSnd) {
        padEl.dataset.sound = matchedSnd.id;
        padEl.querySelector('span').textContent = matchedSnd.name.toUpperCase();
      }
      setSamplerStatus(`ASSIGNED NEW SOUND TO PAD ${activePadIndexForEditing + 1}`);
      syncPadBadges();
    }
    closeSoundModal();
  });

  const scheduleStep = (scheduledTime, currentStep) => {
    const events = loopGrid[currentStep];
    if (events && events.size > 0) {
      events.forEach(soundType => playSoundEngine(soundType, scheduledTime));
    }
    const msDelay = Math.max(0, (scheduledTime - audioContext.currentTime) * 1000);
    window.setTimeout(() => {
      if (isPlaying) renderStepVisuals(currentStep);
    }, msDelay);
  };

  const scheduler = () => {
    if (!audioContext) return;
    const lookAhead = 0.12;
    const secondsPerStep = 60 / tempo / 4;
    while (nextNoteTime < audioContext.currentTime + lookAhead) {
      scheduleStep(nextNoteTime, step);
      nextNoteTime += secondsPerStep;
      step = (step + 1) % STEPS_PER_BAR;
      if (step === 0) {
        barCount++;
        syncTransportUI();
      }
    }
  };

  const stopLoop = () => {
    if (schedulerTimer !== null) window.clearInterval(schedulerTimer);
    schedulerTimer = null;
    isPlaying = false;
    renderStepVisuals(-1);
    syncTransportUI();
    setSamplerStatus('LOOP STOPPED');
  };

  loopToggle?.addEventListener('click', async () => {
    if (isPlaying) {
      stopLoop();
      return;
    }
    try {
      await initAudio();
      step = 0;
      barCount = 1;
      isPlaying = true;
      nextNoteTime = audioContext.currentTime + 0.05;
      syncTransportUI();
      setSamplerStatus('PLAYING LOOP...');
      scheduler();
      schedulerTimer = window.setInterval(scheduler, 25);
    } catch (e) {
      isPlaying = false;
      syncTransportUI();
      setSamplerStatus('AUDIO ERROR');
    }
  });

  recToggle?.addEventListener('click', () => setMode('rec'));
  editModeToggle?.addEventListener('click', () => setMode('edit'));

  clearBtn?.addEventListener('click', () => {
    loopGrid = Array.from({ length: STEPS_PER_BAR }, () => new Set());
    renderStepVisuals(isPlaying ? step : -1);
    setSamplerStatus('ALL MUSIC CLEARED FROM SEQUENCER');
  });

  // BPM Slider Real-time Handler
  tempoSlider?.addEventListener('input', (e) => {
    tempo = parseInt(e.target.value, 10);
    updateTempoUI();
  });

  // Live Recording Logic
  const recPopup = $('#recPopup');
  const recDownloadBtn = $('#recDownloadBtn');
  const recDiscardBtn = $('#recDiscardBtn');

  const startLiveRecording = async () => {
    try {
      if (typeof MediaRecorder === 'undefined') throw new Error('Live recording is not supported in this browser. The groove box can still play and sequence sounds.');
      await initAudio();
      if (!audioContext) return;

      if (!mediaStreamDestination) {
        mediaStreamDestination = audioContext.createMediaStreamDestination();
        masterGain.connect(mediaStreamDestination);
      }

      recordedChunks = [];
      const preferred = ['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/ogg'];
      const mimeType = preferred.find(type => MediaRecorder.isTypeSupported?.(type));
      mediaRecorder = new MediaRecorder(mediaStreamDestination.stream, mimeType ? { mimeType } : {});

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) recordedChunks.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: 'audio/webm' });
        pendingRecordingBlob = blob;
        recPopup.classList.add('is-open');
        recPopup.setAttribute('aria-hidden', 'false');
        setSamplerStatus('RECORDING STOPPED - CHOOSE ACTION');
      };

      mediaRecorder.start();
      isLiveRecording = true;
      syncTransportUI();
      setSamplerStatus('LIVE RECORDING ACTIVE... PLAY YOUR MUSIC!');

      recordingTimeout = window.setTimeout(() => {
        if (isLiveRecording) stopLiveRecording();
      }, 3600000);

    } catch (e) {
      setSamplerStatus('LIVE RECORDING NOT SUPPORTED');
    }
  };

  const stopLiveRecording = () => {
    if (recordingTimeout) window.clearTimeout(recordingTimeout);
    if (isPlaying) stopLoop();
    if (mediaRecorder && isLiveRecording) {
      mediaRecorder.stop();
    }
    isLiveRecording = false;
    syncTransportUI();
  };

  liveRecordBtn?.addEventListener('click', () => {
    if (isLiveRecording) {
      stopLiveRecording();
    } else {
      startLiveRecording();
    }
  });

  recDownloadBtn?.addEventListener('click', () => {
    if (pendingRecordingBlob) {
      const url = URL.createObjectURL(pendingRecordingBlob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `d4rk-l00p3r-recording-${Date.now()}.webm`;
      document.body.appendChild(a);
      a.click();
      window.setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
      setSamplerStatus('RECORDING DOWNLOADED SUCCESSFULLY');
    }
    pendingRecordingBlob = null;
    recPopup.classList.remove('is-open');
    recPopup.setAttribute('aria-hidden', 'true');
  });

  recDiscardBtn?.addEventListener('click', () => {
    pendingRecordingBlob = null;
    recPopup.classList.remove('is-open');
    recPopup.setAttribute('aria-hidden', 'true');
    setSamplerStatus('RECORDING DISCARDED');
  });

  renderStepVisuals(-1);
  syncTransportUI();
  updateTempoUI();

  window.addEventListener('message', event => {
    if (event.source !== window.parent || event.data?.type !== 'CURIOID_APP_DISPOSE') return;
    try { stopLoop(); } catch (_) {}
    try { if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop(); } catch (_) {}
    try { mediaStreamDestination?.stream?.getTracks?.().forEach(track => track.stop()); } catch (_) {}
    try { audioContext?.close?.(); } catch (_) {}
  });
})();
