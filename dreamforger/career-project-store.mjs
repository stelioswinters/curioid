import { normalizeCareerData } from './career-data.mjs';

const isRecord = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const cloneJson = value => JSON.parse(JSON.stringify(value));

/** Find a project record by id in either the current library wrapper or a single-project export. */
export function findCareerProject(workspace, projectId) {
  if (!isRecord(workspace) || typeof projectId !== 'string' || !projectId) return null;
  if (workspace.format === 'dreamforge-studio-library' && workspace.version === 1 && Array.isArray(workspace.projects)) {
    return workspace.projects.find(project => isRecord(project) && project.id === projectId) || null;
  }
  if (workspace.format === 'dreamforge-studio' && workspace.version === 1 && workspace.id === projectId) return workspace;
  return null;
}

/**
 * Return a cloned workspace with career data attached to exactly one project.
 * The caller should write the result only after this function succeeds.
 */
export function updateCareerProject(workspace, projectId, careerData, updatedAt = new Date().toISOString()) {
  if (!isRecord(workspace) || typeof projectId !== 'string' || !projectId) return null;
  let copy;
  try { copy = cloneJson(workspace); } catch { return null; }
  const project = findCareerProject(copy, projectId);
  if (!project) return null;
  project.career = normalizeCareerData(careerData);
  project.updatedAt = Number.isFinite(Date.parse(updatedAt)) ? new Date(updatedAt).toISOString() : new Date().toISOString();
  return copy;
}

/** Return a safe, normalized project-specific draft without mutating its workspace. */
export function readCareerProject(workspace, projectId) {
  const project = findCareerProject(workspace, projectId);
  return project && isRecord(project.career) ? normalizeCareerData(project.career) : null;
}
