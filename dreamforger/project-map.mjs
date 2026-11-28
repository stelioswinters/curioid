const TYPES = new Set(['idea', 'question', 'experiment', 'decision', 'output', 'note']);
const STATUSES = new Set(['open', 'active', 'done', 'blocked']);
export const PROJECT_MAP_EDGE_TYPES = Object.freeze(['leads-to', 'informs', 'tests', 'blocks', 'depends-on', 'derived-from', 'delivers']);
const EDGE_TYPES = new Set(PROJECT_MAP_EDGE_TYPES);
const bounded = (value, fallback, max) => String(value ?? fallback).slice(0, max);
const safeId = (value, fallback) => bounded(value, fallback, 80).replace(/[^a-zA-Z0-9_-]/g, '') || fallback;
const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function normalizeProjectMapNode(node, index = 0) {
  const id = safeId(node?.id, `node-${index}`);
  const incoming = Array.isArray(node?.connections) && node.connections.length
    ? node.connections
    : node?.connectsTo ? [{ target: node.connectsTo, type: 'leads-to' }] : [];
  const connections = [];
  const seen = new Set();
  for (const edge of incoming.slice(0, 8)) {
    const target = safeId(edge?.target ?? edge?.to, '');
    const type = EDGE_TYPES.has(edge?.type) ? edge.type : 'leads-to';
    const key = target;
    if (!target || target === id || seen.has(key)) continue;
    seen.add(key);
    connections.push({ target, type });
  }
  return {
    id,
    type: TYPES.has(node?.type) ? node.type : 'note',
    title: bounded(node?.title, 'Untitled element', 80),
    body: bounded(node?.body, '', 420),
    x: Math.max(20, Math.min(1160, finite(node?.x, 60 + (index % 3) * 340))),
    y: Math.max(20, Math.min(6000, finite(node?.y, 60 + Math.floor(index / 3) * 220))),
    connections,
    // Compatibility alias for 0.6.0 projects and older exports.
    connectsTo: connections[0]?.target || '',
    status: STATUSES.has(node?.status) ? node.status : 'open',
    groupId: bounded(node?.groupId, '', 80),
    taskIds: Array.isArray(node?.taskIds) ? [...new Set(node.taskIds.filter(x => typeof x === 'string').slice(0, 8))] : [],
    assetIds: Array.isArray(node?.assetIds) ? [...new Set(node.assetIds.filter(x => typeof x === 'string').slice(0, 12))] : []
  };
}

export function createStarterProjectMap(item = {}) {
  const blueprint = item?.blueprint || {};
  return [
    { id: 'map-premise', type: 'idea', title: 'The central idea', body: blueprint.premise || item.description || 'What is the thing we are making?', x: 70, y: 90, connections: [{ target: 'map-audience', type: 'leads-to' }, { target: 'map-test', type: 'informs' }], connectsTo: 'map-audience', status: 'active' },
    { id: 'map-audience', type: 'question', title: 'Who is it for?', body: blueprint.audience || item.brief?.audience || 'Name the people this should matter to.', x: 390, y: 70, connections: [{ target: 'map-test', type: 'leads-to' }], connectsTo: 'map-test', status: 'open' },
    { id: 'map-test', type: 'experiment', title: 'First reality check', body: blueprint.firstTest || blueprint.nextStep || 'What is the smallest useful test?', x: 720, y: 180, connections: [{ target: 'map-output', type: 'tests' }], connectsTo: 'map-output', status: 'open' },
    { id: 'map-output', type: 'output', title: 'What good looks like', body: blueprint.successMetric || 'A clear, useful result that can be shown to someone.', x: 1050, y: 100, connections: [], connectsTo: '', status: 'open' }
  ];
}

export function normalizeProjectMap(nodes, creation) {
  const source = Array.isArray(nodes) ? nodes.slice(0, 40) : createStarterProjectMap(creation);
  const seen = new Set();
  const clean = source.map((node, index) => {
    const item = normalizeProjectMapNode(node, index);
    if (seen.has(item.id)) item.id = `node-${index}-${item.id}`;
    seen.add(item.id);
    return item;
  });
  const ids = new Set(clean.map(node => node.id));
  for (const node of clean) {
    node.connections = node.connections.filter(edge => edge.target !== node.id && ids.has(edge.target));
    node.connectsTo = node.connections[0]?.target || '';
  }
  return clean;
}

export function arrangeProjectMap(nodes) {
  return nodes.map((node, index) => ({
    ...node,
    x: 55 + (index % 4) * 330,
    y: 55 + Math.floor(index / 4) * 235
  }));
}

export function projectMapHeight(nodes) {
  return Math.max(900, ...nodes.map(node => node.y + 520));
}


/** Detect malformed map fields that normalization would drop or rewrite. */
export function hasProjectMapNormalizationLoss(nodes) {
  if (nodes == null) return false; // missing maps are migrated with a starter map
  if (!Array.isArray(nodes) || nodes.length > 40) return true;
  const allowedTypes = new Set(['idea','question','experiment','decision','output','note']);
  const allowedStatuses = new Set(['open','active','done','blocked']);
  const ids = nodes.map(node => node?.id);
  if (ids.some(id => typeof id !== 'string' || !id || id.length > 80 || !/^[a-zA-Z0-9_-]+$/.test(id))) return true;
  if (new Set(ids).size !== ids.length) return true;
  const idSet = new Set(ids);
  for (const node of nodes) {
    if (!node || typeof node !== 'object' || Array.isArray(node) || !allowedTypes.has(node.type) || !allowedStatuses.has(node.status)) return true;
    if (Object.keys(node).some(key => !['id','type','title','body','x','y','connections','connectsTo','status','groupId','taskIds','assetIds'].includes(key))) return true;
    if (node.groupId != null && (typeof node.groupId !== 'string' || node.groupId.length > 80)) return true;
    if (node.taskIds != null && (!Array.isArray(node.taskIds) || node.taskIds.length > 8 || node.taskIds.some(x => typeof x !== 'string'))) return true;
    if (node.assetIds != null && (!Array.isArray(node.assetIds) || node.assetIds.length > 12 || node.assetIds.some(x => typeof x !== 'string'))) return true;
    if (typeof node.title !== 'string' || node.title.length > 80 || (node.body != null && (typeof node.body !== 'string' || node.body.length > 420))) return true;
    if (node.x != null && (!Number.isFinite(Number(node.x)) || Number(node.x) < 20 || Number(node.x) > 1160)) return true;
    if (node.y != null && (!Number.isFinite(Number(node.y)) || Number(node.y) < 20 || Number(node.y) > 6000)) return true;
    const edges = Array.isArray(node.connections) && node.connections.length ? node.connections : node.connectsTo ? [{target:node.connectsTo,type:'leads-to'}] : [];
    if (edges.length > 8) return true;
    const targets = new Set();
    for (const edge of edges) {
      if (!edge || typeof edge !== 'object' || Array.isArray(edge) || Object.keys(edge).some(key => !['target','type'].includes(key))) return true;
      if (typeof edge.target !== 'string' || !idSet.has(edge.target) || edge.target === node.id || targets.has(edge.target) || !EDGE_TYPES.has(edge.type || 'leads-to')) return true;
      targets.add(edge.target);
    }
  }
  return false;
}
