import { auth } from '../firebase/config.js';

export const MAX_STUDY_MATERIAL_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

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
 * Fetches study materials matching the authenticated caller's academic scope and role.
 *
 * @param {object} [filters={}]
 * @param {string} [filters.subjectId]
 * @param {string} [filters.department]
 * @param {string} [filters.year]
 * @param {string} [filters.section]
 * @param {string} [filters.category]
 * @param {string} [filters.scope]
 * @returns {Promise<Array<object>>} List of study materials.
 */
export async function fetchStudyMaterials({
  subjectId,
  department,
  year,
  section,
  category,
  scope
} = {}) {
  const token = await getAuthToken();
  const apiBase = getApiBaseUrl();

  const queryParams = new URLSearchParams();
  if (subjectId) queryParams.append('subjectId', subjectId);
  if (department && department !== 'All Departments') queryParams.append('department', department);
  if (year && year !== 'All Years') queryParams.append('year', year);
  if (section && section !== 'All Sections') queryParams.append('section', section);
  if (category && category !== 'All') queryParams.append('category', category);
  if (scope) queryParams.append('scope', scope);

  const url = `${apiBase}/api/study-materials${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;

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
    await handleApiError(response, 'Failed to fetch study materials.');
  }

  const data = await response.json();
  return data.materials || [];
}

/**
 * Uploads a study material file directly to the teacher's connected Google Drive via backend.
 * Every upload starts unpublished (isPublished: false) by default.
 *
 * @param {object} params
 * @param {File|Blob} params.file - File object to upload
 * @param {string} params.title - Title of study material (2-150 chars)
 * @param {string} params.subjectId - Assigned subject ID
 * @param {string} params.department - Academic department
 * @param {string} params.year - Academic year
 * @param {string} params.scope - 'year' or 'section'
 * @param {string} [params.section] - Section name if scope === 'section'
 * @param {string} [params.category='Lecture Notes'] - Category
 * @param {string} [params.description] - Optional description
 * @param {boolean} [params.isPublished=false] - Publication status (default false)
 * @returns {Promise<object>} Created study material record
 */
export async function uploadStudyMaterial({
  file,
  title,
  subjectId,
  department,
  year,
  scope = 'year',
  section = null,
  category = 'Lecture Notes',
  description = '',
  isPublished = false
}) {
  if (!file) {
    throw new Error('File is required for study material upload.');
  }

  if (file.size > MAX_STUDY_MATERIAL_FILE_SIZE) {
    const error = new Error(`File size (${(file.size / (1024 * 1024)).toFixed(1)}MB) exceeds the maximum allowed limit of 25MB.`);
    error.code = 'FILE_TOO_LARGE';
    error.statusCode = 413;
    throw error;
  }

  if (!title || title.trim().length < 2) {
    throw new Error('Title must be at least 2 characters.');
  }

  if (!subjectId) {
    throw new Error('Please select an assigned subject for this study material.');
  }

  if (!department) {
    throw new Error('Department is required.');
  }

  if (!year) {
    throw new Error('Academic year is required.');
  }

  if (scope === 'section' && !section) {
    throw new Error('A specific section must be selected when scope is section-specific.');
  }

  const token = await getAuthToken();
  const apiBase = getApiBaseUrl();

  const formData = new FormData();
  formData.append('file', file);
  formData.append('title', title.trim());
  formData.append('subjectId', subjectId.trim());
  formData.append('department', department.trim());
  formData.append('year', year.trim());
  formData.append('scope', scope);
  if (section) {
    formData.append('section', section.trim());
  }
  formData.append('category', (category || 'Lecture Notes').trim());
  if (description) {
    formData.append('description', description.trim());
  }
  // Enforce unpublished state for new uploads
  formData.append('isPublished', String(Boolean(isPublished)));

  let response;
  try {
    response = await fetch(`${apiBase}/api/study-materials/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
        // Notice: Do NOT set Content-Type header when using FormData; fetch sets boundary automatically
      },
      body: formData
    });
  } catch (netErr) {
    throw new Error('Unable to connect to the backend server. Please verify the Express backend is running.');
  }

  if (!response.ok) {
    await handleApiError(response, 'Failed to upload study material.');
  }

  const data = await response.json();
  return data.material;
}

/**
 * Downloads a study material file through the authenticated backend proxy streaming.
 * Automatically initiates browser download using a temporary anchor element.
 *
 * @param {object} params
 * @param {string} params.materialId - Target material ID
 * @param {string} [params.fileName='study_material.pdf'] - Suggested file name
 * @returns {Promise<void>}
 */
export async function downloadStudyMaterialFile({ materialId, fileName = 'study_material.pdf' }) {
  const token = await getAuthToken();
  const apiBase = getApiBaseUrl();

  let response;
  try {
    response = await fetch(`${apiBase}/api/study-materials/${encodeURIComponent(materialId)}/download`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
  } catch (netErr) {
    throw new Error('Unable to connect to the backend server. Please verify the Express backend is running.');
  }

  if (!response.ok) {
    await handleApiError(response, 'Failed to download study material file.');
  }

  const blob = await response.blob();
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(objectUrl);
}

/**
 * Toggles the publication status of a study material (publish / unpublish).
 *
 * @param {object} params
 * @param {string} params.materialId - Target material ID
 * @param {boolean} params.isPublished - Target publication state
 * @returns {Promise<object>} Updated material
 */
export async function setStudyMaterialPublishStatus({ materialId, isPublished }) {
  const token = await getAuthToken();
  const apiBase = getApiBaseUrl();

  let response;
  try {
    response = await fetch(`${apiBase}/api/study-materials/${encodeURIComponent(materialId)}/publish`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ isPublished: Boolean(isPublished) })
    });
  } catch (netErr) {
    throw new Error('Unable to connect to the backend server. Please verify the Express backend is running.');
  }

  if (!response.ok) {
    await handleApiError(response, 'Failed to update publication status.');
  }

  const data = await response.json();
  return data.material;
}

/**
 * Convenience method to unpublish a study material immediately.
 *
 * @param {string} materialId - Target material ID
 * @returns {Promise<object>} Updated material
 */
export async function unpublishStudyMaterial(materialId) {
  return await setStudyMaterialPublishStatus({ materialId, isPublished: false });
}

/**
 * Deletes study material metadata record safely.
 * Note: Does not delete the original file in Google Drive.
 *
 * @param {string} materialId - Target material ID
 * @returns {Promise<object>} Result confirmation
 */
export async function deleteStudyMaterial(materialId) {
  const token = await getAuthToken();
  const apiBase = getApiBaseUrl();

  let response;
  try {
    response = await fetch(`${apiBase}/api/study-materials/${encodeURIComponent(materialId)}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
  } catch (netErr) {
    throw new Error('Unable to connect to the backend server. Please verify the Express backend is running.');
  }

  if (!response.ok) {
    await handleApiError(response, 'Failed to delete study material.');
  }

  return await response.json();
}
