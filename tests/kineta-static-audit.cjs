'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('projects-category-web-experiments.js', 'utf8');
const start = source.indexOf('  function stepLife() {');
const end = source.indexOf('\n  function renderLife()', start);
assert.ok(start >= 0 && end > start, 'KINETA Cellular Life step/render functions could not be located');
const stepBody = source.slice(start, end);
assert.doesNotMatch(stepBody, /\b(?:render|updateHud)\s*\(/,
  'KINETA stepLife must not repaint the canvas or update the DOM for every simulation tick');
assert.match(source, /else if\s*\(mode\s*===\s*'life'\)[\s\S]{0,260}?stepLife\(\)/,
  'KINETA animation loop no longer advances Cellular Life');
assert.match(source, /if\s*\(!lastRenderAt\s*\|\|\s*now\s*-\s*lastRenderAt\s*>=\s*renderInterval\)[\s\S]{0,180}?render\(\)/,
  'KINETA frame-rate-limited paint gate is missing');
console.log('KINETA performance audit passed: simulation ticks update state; the capped animation loop owns canvas painting and HUD refresh.');
