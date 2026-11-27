'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('projects-category-digital-art.js', 'utf8');
const start = source.indexOf('function bindOrganic(root)');
const end = source.indexOf('\nfunction afterimageMarkup', start);
assert.ok(start >= 0 && end > start, 'Organic Errors binder could not be located');
const organic = source.slice(start, end);
assert.match(organic, /const lowResourceMotion=Boolean/, 'Organic Errors must detect low-resource/coarse-pointer devices');
assert.match(organic, /const membraneSamples=lowResourceMotion\?144:220/, 'Mobile membrane sampling should be reduced while desktop detail stays unchanged');
assert.match(organic, /t-lastOrganicPaint<1\/30/, 'Organic mobile renderer must cap paints at 30 FPS');
assert.match(organic, /if\(!initial&&paused\)return/, 'Paused Organic Errors must stop repainting');
const phaseIndex = organic.indexOf("phase+=dt*");
const pauseIndex = organic.indexOf("if(!initial&&paused)return");
const capIndex = organic.indexOf("t-lastOrganicPaint<1/30");
assert.ok(phaseIndex >= 0 && pauseIndex > phaseIndex && capIndex > phaseIndex,
  'Organic animation phase must advance before paint throttling so simulation time is not skipped');
console.log('Organic Errors adaptive rendering audit passed.');
