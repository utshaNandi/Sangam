import { auth } from '../firebase/config.js';

/**
 * Returns the configured Express backend base URL.
 * - In production Vite builds, returns '' to ensure same-origin relative URLs on Vercel.
 * - In browser environments (both local development via Vite proxy and production), returns ''.
 * - In Node.js / test environments (where window is undefined), returns 'http://localhost:3001'.
 * - If VITE_API_BASE_URL is explicitly configured, it is honored.
 */
export function getApiBaseUrl() {
  const envUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL);
  if (typeof envUrl === 'string' && envUrl.trim() !== '') {
    return envUrl.trim().replace(/\/$/, '');
  }
  if (typeof import.meta !== 'undefined' && import.meta.env?.PROD) {
    return '';
  }
  if (typeof window !== 'undefined') {
    return '';
  }
  return 'http://localhost:3001';
}

/**
 * Obtains a fresh Firebase ID token for the currently authenticated user.
 *
 * @returns {Promise<string>} Fresh Firebase Auth ID token.
 * @throws {Error} If user is not authenticated.
 */
export async function getAuthToken() {
  let user = auth?.currentUser;

  if (!user && auth && typeof auth.onAuthStateChanged === 'function') {
    user = await new Promise((resolve) => {
      const unsubscribe = auth.onAuthStateChanged((u) => {
        if (typeof unsubscribe === 'function') unsubscribe();
        resolve(u);
      });
      setTimeout(() => resolve(null), 2500);
    });
  }

  if (!user) {
    throw new Error('You must be signed in to perform this action. Please refresh or sign in again.');
  }

  return await user.getIdToken();
}

/**
 * Parses error response payload and throws a structured Error.
 */
async function handleApiError(response, defaultMsg) {
  let errorData = null;
  try {
    errorData = await response.json();
  } catch {
    // Non-JSON response (e.g. HTML 404, 502/503 from reverse proxy)
  }

  let message = errorData?.error || errorData?.message;
  if (!message) {
    if (response.status === 404) {
      message = `${defaultMsg} Backend endpoint was not found (HTTP 404). Please ensure the backend server is running and up-to-date.`;
    } else if (response.status === 401) {
      message = `${defaultMsg} Authentication required or session expired (HTTP 401).`;
    } else if (response.status === 403) {
      message = `${defaultMsg} Access denied: You do not have permission for this action (HTTP 403).`;
    } else if (response.status === 409) {
      message = `${defaultMsg} A conflict occurred or the record already exists (HTTP 409).`;
    } else if (response.status >= 500) {
      message = `${defaultMsg} Backend server encountered an error (HTTP ${response.status}).`;
    } else {
      message = `${defaultMsg} (HTTP ${response.status})`;
    }
  }

  const error = new Error(message);
  error.code = errorData?.code || (response.status === 404 ? 'NOT_FOUND' : 'API_ERROR');
  error.statusCode = response.status;
  error.data = errorData;
  throw error;
}

/**
 * Fetches curriculum subjects filtered by academic scope.
 *
 * @param {object} [filters={}]
 * @param {string} [filters.department]
 * @param {string} [filters.year]
 * @param {string} [filters.institution]
 * @returns {Promise<Array<object>>} List of subject records.
 */
export async function fetchSubjects({ department, year, institution } = {}) {
  const token = await getAuthToken();
  const apiBase = getApiBaseUrl();

  const queryParams = new URLSearchParams();
  if (department && department !== 'All Departments') queryParams.append('department', department);
  if (year && year !== 'All Years') queryParams.append('year', year);
  if (institution) queryParams.append('institution', institution);

  const url = `${apiBase}/api/subjects${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;

  let response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
  } catch (netErr) {
    throw new Error('Unable to connect to the backend server. Please verify the Express backend is running.');
  }

  if (!response.ok) {
    await handleApiError(response, 'Failed to fetch curriculum subjects.');
  }

  const data = await response.json();
  return data.subjects || [];
}

/**
 * Creates a new curriculum subject.
 *
 * @param {object} params
 * @param {string} params.name - Subject name
 * @param {string} params.code - Subject code
 * @param {string} params.department - Department name
 * @param {string} params.year - Academic year
 * @param {string} [params.description] - Subject description
 * @param {string} [params.institution] - Institution name
 * @returns {Promise<object>} Created subject record.
 */
export async function createSubject({ name, code, department, year, description, institution }) {
  const token = await getAuthToken();
  const apiBase = getApiBaseUrl();

  let response;
  try {
    response = await fetch(`${apiBase}/api/subjects`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name,
        code,
        department,
        year,
        description,
        institution
      })
    });
  } catch (netErr) {
    throw new Error('Unable to connect to the backend server. Please verify the Express backend is running.');
  }

  if (!response.ok) {
    await handleApiError(response, 'Failed to create subject.');
  }

  const data = await response.json();
  return data.subject;
}

/**
 * Updates an existing curriculum subject.
 *
 * @param {string} subjectId - Target subject ID
 * @param {object} updates
 * @param {string} updates.name - Updated subject name
 * @param {string} [updates.code] - Updated subject code
 * @param {string} [updates.description] - Updated subject description
 * @returns {Promise<object>} Updated subject record.
 */
export async function updateSubject(subjectId, { name, code, description }) {
  const token = await getAuthToken();
  const apiBase = getApiBaseUrl();

  let response;
  try {
    response = await fetch(`${apiBase}/api/subjects/${encodeURIComponent(subjectId)}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name,
        code,
        description
      })
    });
  } catch (netErr) {
    throw new Error('Unable to connect to the backend server. Please verify the Express backend is running.');
  }

  if (!response.ok) {
    await handleApiError(response, 'Failed to update subject.');
  }

  const data = await response.json();
  return data.subject;
}

/**
 * Safely deletes a curriculum subject.
 *
 * @param {string} subjectId - Target subject ID
 * @returns {Promise<object>} Result confirmation.
 */
export async function deleteSubject(subjectId) {
  const token = await getAuthToken();
  const apiBase = getApiBaseUrl();

  let response;
  try {
    response = await fetch(`${apiBase}/api/subjects/${encodeURIComponent(subjectId)}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
  } catch (netErr) {
    throw new Error('Unable to connect to the backend server. Please verify the Express backend is running.');
  }

  if (!response.ok) {
    await handleApiError(response, 'Failed to delete subject.');
  }

  return await response.json();
}

/**
 * Fetches teacher-subject assignments with optional filters.
 *
 * @param {object} [filters={}]
 * @param {string} [filters.subjectId]
 * @param {string} [filters.teacherUid]
 * @param {string} [filters.department]
 * @param {string} [filters.year]
 * @param {string} [filters.section]
 * @returns {Promise<Array<object>>} List of teacher-subject assignments.
 */
export async function fetchTeacherSubjectAssignments({ subjectId, teacherUid, department, year, section } = {}) {
  const token = await getAuthToken();
  const apiBase = getApiBaseUrl();

  const queryParams = new URLSearchParams();
  if (subjectId) queryParams.append('subjectId', subjectId);
  if (teacherUid) queryParams.append('teacherUid', teacherUid);
  if (department && department !== 'All Departments') queryParams.append('department', department);
  if (year && year !== 'All Years') queryParams.append('year', year);
  if (section && section !== 'All Sections') queryParams.append('section', section);

  const url = `${apiBase}/api/subjects/assignments${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;

  let response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
  } catch (netErr) {
    throw new Error('Unable to connect to the backend server. Please verify the Express backend is running.');
  }

  if (!response.ok) {
    await handleApiError(response, 'Failed to fetch teacher subject assignments.');
  }

  const data = await response.json();
  return data.assignments || [];
}

/**
 * Assigns an authorized faculty member to teach a subject.
 *
 * @param {object} params
 * @param {string} params.subjectId - Target subject ID
 * @param {string} params.assignedTeacherUid - Target faculty UID
 * @param {string} [params.section=null] - Specific section or null for year-wide
 * @returns {Promise<object>} Created or existing assignment record.
 */
export async function assignTeacherToSubject({ subjectId, assignedTeacherUid, section = null }) {
  const token = await getAuthToken();
  const apiBase = getApiBaseUrl();

  let response;
  try {
    response = await fetch(`${apiBase}/api/subjects/assignments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        subjectId,
        assignedTeacherUid,
        section: section || null
      })
    });
  } catch (netErr) {
    throw new Error('Unable to connect to the backend server. Please verify the Express backend is running.');
  }

  if (!response.ok) {
    await handleApiError(response, 'Failed to assign teacher to subject.');
  }

  const data = await response.json();
  return data.assignment;
}

/**
 * Revokes a teacher-subject assignment.
 *
 * @param {string} assignmentId - Target assignment ID
 * @returns {Promise<object>} Result confirmation.
 */
export async function deleteTeacherSubjectAssignment(assignmentId) {
  const token = await getAuthToken();
  const apiBase = getApiBaseUrl();

  let response;
  try {
    response = await fetch(`${apiBase}/api/subjects/assignments/${encodeURIComponent(assignmentId)}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
  } catch (netErr) {
    throw new Error('Unable to connect to the backend server. Please verify the Express backend is running.');
  }

  if (!response.ok) {
    await handleApiError(response, 'Failed to revoke teacher subject assignment.');
  }

  return await response.json();
}

/**
 * Fetches all curriculum subjects assigned to the currently authenticated faculty member.
 *
 * @returns {Promise<Array<object>>} List of assignment records.
 */
export async function fetchMyAssignedSubjects() {
  const token = await getAuthToken();
  const apiBase = getApiBaseUrl();

  let response;
  try {
    response = await fetch(`${apiBase}/api/subjects/my-subjects`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
  } catch (netErr) {
    throw new Error('Unable to connect to the backend server. Please verify the Express backend is running.');
  }

  if (!response.ok) {
    await handleApiError(response, 'Failed to fetch assigned subjects.');
  }

  const data = await response.json();
  return data.assignments || [];
}
