const string = (value, fallback = '', max = 1800) => String(value ?? fallback).slice(0, max);
const number = (value, fallback, min, max, integer = false) => {
  const parsed = Number(value);
  const safe = Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
  return integer ? Math.round(safe) : safe;
};

export function createCareerDefaults() {
  return {
    brief: { name: '', client: '', problem: '', audience: '', deliverables: '', constraints: '', success: '', timeline: '', assumptions: '' },
    quote: { currency: 'EUR', hours: 20, rate: 35, expenses: 50, revisions: 2, revisionHours: 2, contingency: 10, tax: 0 },
    validation: { concept: '', assumption: '', audience: '', method: 'interviews', sample: 5, signal: '', decision: '' },
    matrix: {
      criteria: [{ name: 'User value', weight: 5 }, { name: 'Feasibility', weight: 4 }, { name: 'Cost', weight: 3 }, { name: 'Differentiation', weight: 3 }],
      options: [{ name: 'Option A', scores: [4, 3, 3, 4] }, { name: 'Option B', scores: [3, 5, 4, 3] }, { name: 'Option C', scores: [5, 2, 2, 5] }]
    },
    case: { title: '', role: '', context: '', challenge: '', process: '', decisions: '', outcome: '', reflection: '' }
  };
}

export function normalizeCareerData(input) {
  const defaults = createCareerDefaults();
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const out = createCareerDefaults();
  for (const section of ['brief', 'validation', 'case']) {
    const values = source[section];
    if (!values || typeof values !== 'object' || Array.isArray(values)) continue;
    for (const [key, fallback] of Object.entries(defaults[section])) {
      if (typeof values[key] === 'string') out[section][key] = string(values[key], fallback, section === 'brief' ? 1800 : 1800);
    }
  }
  const methods = new Set(['interviews', 'usability', 'landing-page', 'prototype', 'concierge', 'desk-research']);
  out.validation.sample = number(source.validation?.sample, 5, 1, 500, true);
  out.validation.method = methods.has(source.validation?.method) ? source.validation.method : 'interviews';
  if (source.quote && typeof source.quote === 'object' && !Array.isArray(source.quote)) {
    const q = source.quote;
    out.quote.currency = ['EUR', 'USD', 'GBP', 'CAD', 'AUD'].includes(q.currency) ? q.currency : 'EUR';
    for (const [key, fallback] of Object.entries(defaults.quote)) {
      if (key === 'currency') continue;
      const limit = key === 'tax' || key === 'contingency' ? 100 : key === 'revisions' ? 100 : 10000000;
      out.quote[key] = number(q[key], fallback, 0, limit, ['revisions'].includes(key));
    }
  }
  if (source.matrix && typeof source.matrix === 'object' && !Array.isArray(source.matrix)) {
    const m = source.matrix;
    if (Array.isArray(m.criteria)) {
      out.matrix.criteria = defaults.matrix.criteria.map((fallback, i) => {
        const item = m.criteria[i];
        return item && typeof item === 'object'
          ? { name: string(item.name, fallback.name, 60) || fallback.name, weight: number(item.weight, fallback.weight, 1, 5, true) }
          : { ...fallback };
      });
    }
    if (Array.isArray(m.options)) {
      out.matrix.options = defaults.matrix.options.map((fallback, i) => {
        const item = m.options[i];
        if (!item || typeof item !== 'object') return { ...fallback, scores: [...fallback.scores] };
        return {
          name: string(item.name, fallback.name, 60) || fallback.name,
          scores: Array.from({ length: 4 }, (_, j) => number(item.scores?.[j], fallback.scores[j], 0, 5, true))
        };
      });
    }
  }
  return out;
}


/** Detect source values that normalizeCareerData would truncate or discard. */
export function hasCareerNormalizationLoss(input) {
  if (input == null) return false;
  if (!input || typeof input !== 'object' || Array.isArray(input)) return true;
  const allowedTopLevel = ['brief','quote','validation','matrix','case'];
  if (Object.keys(input).some(key => !allowedTopLevel.includes(key))) return true;
  const allowedSectionKeys = {
    brief: ['name','client','problem','audience','deliverables','constraints','success','timeline','assumptions'],
    validation: ['concept','assumption','audience','method','sample','signal','decision'],
    case: ['title','role','context','challenge','process','decisions','outcome','reflection']
  };
  const stringSections = {
    brief: allowedSectionKeys.brief,
    validation: ['concept','assumption','audience','signal','decision'],
    case: allowedSectionKeys.case
  };
  for (const [section, keys] of Object.entries(allowedSectionKeys)) {
    const values = input[section];
    if (values != null && (!values || typeof values !== 'object' || Array.isArray(values))) return true;
    if (values && Object.keys(values).some(key => !keys.includes(key))) return true;
  }
  for (const [section, keys] of Object.entries(stringSections)) {
    const values = input[section];
    for (const key of keys) if (values?.[key] != null && (typeof values[key] !== 'string' || values[key].length > 1800)) return true;
  }
  const allowedMethods = new Set(['interviews','usability','landing-page','prototype','concierge','desk-research']);
  if (input.validation?.method != null && !allowedMethods.has(input.validation.method)) return true;
  if (input.validation?.sample != null && (!Number.isFinite(Number(input.validation.sample)) || Number(input.validation.sample) < 1 || Number(input.validation.sample) > 500)) return true;
  if (input.quote != null) {
    if (!input.quote || typeof input.quote !== 'object' || Array.isArray(input.quote)) return true;
    if (Object.keys(input.quote).some(key => !['currency','hours','rate','expenses','revisions','revisionHours','contingency','tax'].includes(key))) return true;
    if (input.quote.currency != null && !['EUR','USD','GBP','CAD','AUD'].includes(input.quote.currency)) return true;
    for (const [key, max] of Object.entries({hours:10000000,rate:10000000,expenses:10000000,revisions:100,revisionHours:10000000,contingency:100,tax:100})) {
      const value = input.quote[key];
      if (value != null && (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > max)) return true;
    }
  }
  if (input.matrix != null) {
    if (!input.matrix || typeof input.matrix !== 'object' || Array.isArray(input.matrix)) return true;
    if (Object.keys(input.matrix).some(key => !['criteria','options'].includes(key))) return true;
    if (Array.isArray(input.matrix.criteria)) {
      if (input.matrix.criteria.length > 4) return true;
      for (const item of input.matrix.criteria) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return true;
        if (Object.keys(item).some(key => !['name','weight'].includes(key))) return true;
        if (item.name != null && (typeof item.name !== 'string' || item.name.length > 60)) return true;
        if (item.weight != null && (!Number.isFinite(Number(item.weight)) || Number(item.weight) < 1 || Number(item.weight) > 5)) return true;
      }
    }
    if (Array.isArray(input.matrix.options)) {
      if (input.matrix.options.length > 3) return true;
      for (const item of input.matrix.options) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return true;
        if (Object.keys(item).some(key => !['name','scores'].includes(key))) return true;
        if (item?.name != null && (typeof item.name !== 'string' || item.name.length > 60)) return true;
        if (Array.isArray(item?.scores) && item.scores.length > 4) return true;
        if (item?.scores != null && !Array.isArray(item.scores)) return true;
        if (Array.isArray(item?.scores) && item.scores.some(value => !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 5)) return true;
      }
    }
  }
  return false;
}
