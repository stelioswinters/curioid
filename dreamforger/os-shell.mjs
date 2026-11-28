/** First-party application registry for the DREAMFORGER desktop shell. */
export const OS_APPS = Object.freeze([
  { id: 'home', name: 'Desktop', description: 'Your creative starting point and recent work.', category: 'Workspace', icon: '⌂', keywords: ['home', 'desktop', 'start'] },
  { id: 'forge', name: 'Concept Forge', description: 'Generate, compare and develop original directions.', category: 'Create', icon: '✳', keywords: ['ideas', 'generate', 'concept', 'invent'] },
  { id: 'studio', name: 'Studio', description: 'Develop a project, map, prototype and production plan.', category: 'Create', icon: '▦', keywords: ['project', 'map', 'prototype', 'tasks'] },
  { id: 'explore', name: 'Discovery Field', description: 'Browse and remix experimental starting points.', category: 'Create', icon: '◈', keywords: ['discover', 'explore', 'remix'] },
  { id: 'archive', name: 'Archive', description: 'Find, revisit, export and preserve creations.', category: 'Library', icon: '▤', keywords: ['saved', 'creations', 'export'] },
  { id: 'files', name: 'Files', description: 'Browse local Studio projects and archived creations.', category: 'Library', icon: '▧', keywords: ['documents', 'projects', 'records', 'workspace'] },
  { id: 'system', name: 'System Monitor', description: 'Inspect local storage, diagnostics and system health.', category: 'System', icon: '⌘', keywords: ['settings', 'health', 'storage', 'diagnostics'] }
]);

export function searchOSApps(query = '', apps = OS_APPS) {
  const terms = String(query).normalize('NFKC').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [...apps];
  return apps.filter(app => {
    const haystack = [app.name, app.description, app.category, ...(app.keywords || [])].join(' ').normalize('NFKC').toLocaleLowerCase();
    return terms.every(term => haystack.includes(term));
  });
}

export function getOSApp(id, apps = OS_APPS) {
  return apps.find(app => app.id === id) || null;
}
