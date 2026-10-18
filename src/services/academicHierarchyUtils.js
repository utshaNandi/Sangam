/**
 * Academic Hierarchy Utilities
 * Helpers for canonical department resolution and hierarchy navigation.
 */

/**
 * Resolves the canonical department name for Director subject management from an academic path.
 *
 * @param {Array<string>} path - Academic space path: [institution, programme, branch, specialization?, year?]
 * @returns {string} Canonical department name
 */
export function getCanonicalDepartmentFromPath(path) {
  if (!Array.isArray(path) || path.length === 0) return 'Computer Science';

  const prog = path[1] || '';
  const branch = path[2] || '';
  const spec = path[3] || '';

  // 1. Direct branch mappings
  if (branch === 'CSE') {
    if (spec === 'AI') return 'CSE AI';
    return 'Computer Science';
  }
  if (branch === 'ME') return 'Mechanical Engineering';
  if (branch === 'CE') return 'Civil Engineering';
  if (branch === 'BT') return 'Biotechnology';
  if (branch === 'ESE' || branch === 'ECE') return 'Electronics & Communication';
  if (branch === 'EE') return 'Electrical Engineering';
  if (branch === 'IT') return 'Information Technology';

  // 2. Programme-based mappings
  if (prog === 'BBA' || prog === 'MBA') return 'Management';
  if (prog === 'BCA') return 'Computer Science';

  return branch || prog || 'Computer Science';
}
