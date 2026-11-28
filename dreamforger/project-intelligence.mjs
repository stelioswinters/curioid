/** Deterministic, explainable project diagnostics. Suggestions never mutate project data. */
export function analyzeProject(project) {
  const nodes = Array.isArray(project?.canvasNodes) ? project.canvasNodes : [];
  const tasks = Array.isArray(project?.tasks) ? project.tasks : [];
  const assets = Array.isArray(project?.assets) ? project.assets : [];
  const nodeIds = new Set(nodes.map(node => node.id));
  const incoming = new Set();
  const outgoing = new Map(nodes.map(node => [node.id, (node.connections || []).filter(edge => nodeIds.has(edge.target))]));
  for (const edges of outgoing.values()) for (const edge of edges) incoming.add(edge.target);
  const linkedTasks = new Set(nodes.flatMap(node => node.taskIds || []));
  const linkedAssets = new Set(nodes.flatMap(node => node.assetIds || []));
  const evidenceAssets = new Set(assets.filter(asset => asset.kind === 'evidence').map(asset => asset.id));
  const findings = [];
  const add = (id, severity, title, detail, refs = []) => findings.push({ id, severity, title, detail, refs });

  const isolated = nodes.filter(node => !(outgoing.get(node.id) || []).length && !incoming.has(node.id));
  if (isolated.length) add('isolated-nodes', 'info', `${isolated.length} isolated map element${isolated.length === 1 ? '' : 's'}`, 'These elements are not connected to the rest of the project map.', isolated.map(node => node.id));

  const openQuestions = nodes.filter(node => node.type === 'question' && node.status !== 'done' && !(outgoing.get(node.id) || []).some(edge => edge.type === 'tests' || edge.type === 'leads-to'));
  if (openQuestions.length) add('untested-questions', 'attention', `${openQuestions.length} question${openQuestions.length === 1 ? '' : 's'} without a test path`, 'Turn an open question into an experiment or connect it to a test.', openQuestions.map(node => node.id));

  const untestedExperiments = nodes.filter(node => node.type === 'experiment' && node.status !== 'done' && !(node.assetIds || []).some(id => evidenceAssets.has(id)) && !(outgoing.get(node.id) || []).some(edge => edge.type === 'delivers' || edge.type === 'informs'));
  if (untestedExperiments.length) add('experiments-without-evidence', 'attention', `${untestedExperiments.length} experiment${untestedExperiments.length === 1 ? '' : 's'} without evidence`, 'Attach an evidence reference or connect the experiment to what it informs or delivers.', untestedExperiments.map(node => node.id));

  const unlinkedTasks = tasks.filter(task => !linkedTasks.has(task.id));
  if (unlinkedTasks.length) add('unmapped-tasks', 'info', `${unlinkedTasks.length} production task${unlinkedTasks.length === 1 ? '' : 's'} not mapped`, 'Link tasks to the ideas, experiments or outputs they move forward.', unlinkedTasks.map(task => task.id));

  const unusedAssets = assets.filter(asset => !linkedAssets.has(asset.id));
  if (unusedAssets.length) add('unused-assets', 'info', `${unusedAssets.length} asset reference${unusedAssets.length === 1 ? '' : 's'} not connected`, 'Connect references to the map elements they support.', unusedAssets.map(asset => asset.id));

  const blocked = nodes.filter(node => node.status === 'blocked');
  if (blocked.length) add('blocked-elements', 'attention', `${blocked.length} blocked map element${blocked.length === 1 ? '' : 's'}`, 'Review the blocker and its incoming or outgoing dependencies.', blocked.map(node => node.id));

  const outputNodes = nodes.filter(node => node.type === 'output');
  const hasOutputPath = nodes.some(node => node.type === 'experiment' && (outgoing.get(node.id) || []).some(edge => edge.type === 'delivers' && outputNodes.some(output => output.id === edge.target)));
  if (nodes.some(node => node.type === 'experiment') && outputNodes.length && !hasOutputPath) add('no-experiment-output-link', 'attention', 'No experiment is linked to an output', 'Connect a useful experiment to the output it is intended to produce.', nodes.filter(node => node.type === 'experiment').map(node => node.id));

  const severityRank = { attention: 0, info: 1 };
  findings.sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || a.title.localeCompare(b.title));
  return {
    totals: { nodes: nodes.length, tasks: tasks.length, assets: assets.length, findings: findings.length, attention: findings.filter(item => item.severity === 'attention').length },
    findings
  };
}
