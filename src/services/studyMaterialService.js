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

/**
 * Fetches files in the teacher's Google Drive folder for an assigned subject.
 * Returns the folder info and array of Drive files enriched with publication status.
 *
 * @param {string} subjectId - Assigned subject ID
 * @returns {Promise<{ success: boolean, folderId: string, folderName: string, files: Array<object> }>}
 */
export async function fetchDriveSubjectFiles(subjectId) {
  if (!subjectId || typeof subjectId !== 'string' || !subjectId.trim()) {
    throw new Error('subjectId is required to fetch Drive subject files.');
  }

  const token = await getAuthToken();
  const apiBase = getApiBaseUrl();

  const url = `${apiBase}/api/study-materials/drive/files?subjectId=${encodeURIComponent(subjectId.trim())}`;

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
    await handleApiError(response, 'Failed to fetch Drive subject files.');
  }

  return await response.json();
}

/**
 * Uploads a draft PDF directly to the teacher's subject folder in Google Drive.
 * Does not create a study_materials document, so the file remains completely private.
 *
 * @param {string} subjectId - Target subject ID
 * @param {File|Blob} file - PDF file to upload (max 25MB)
 * @returns {Promise<object>} Uploaded file metadata from Google Drive
 */
export async function uploadToDriveFolder(subjectId, file) {
  if (!subjectId || typeof subjectId !== 'string' || !subjectId.trim()) {
    throw new Error('subjectId is required for Drive upload.');
  }

  if (!file) {
    throw new Error('File is required for Drive upload.');
  }

  const fileName = file.name || 'document.pdf';
  if (!fileName.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
    const error = new Error('Only PDF documents (.pdf) can be uploaded to the Drive library.');
    error.code = 'INVALID_FILE_TYPE';
    throw error;
  }

  if (file.size > MAX_STUDY_MATERIAL_FILE_SIZE) {
    const error = new Error(`File size (${(file.size / (1024 * 1024)).toFixed(1)}MB) exceeds the maximum allowed limit of 25MB.`);
    error.code = 'FILE_TOO_LARGE';
    error.statusCode = 413;
    throw error;
  }

  const token = await getAuthToken();
  const apiBase = getApiBaseUrl();

  const formData = new FormData();
  formData.append('file', file, fileName);
  formData.append('subjectId', subjectId.trim());

  let response;
  try {
    response = await fetch(`${apiBase}/api/study-materials/drive/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });
  } catch (netErr) {
    throw new Error('Unable to connect to the backend server. Please verify the Express backend is running.');
  }

  if (!response.ok) {
    await handleApiError(response, 'Failed to upload file to Google Drive.');
  }

  const data = await response.json();
  return data.file;
}

/**
 * Publishes an existing Google Drive file as a study material without duplicating it.
 *
 * @param {object} payload
 * @param {string} payload.subjectId - Assigned subject ID
 * @param {string} payload.driveFileId - Google Drive file ID
 * @param {string} [payload.title] - Optional display title (defaults to Drive filename)
 * @param {string} [payload.scope='year'] - 'year' or 'section'
 * @param {string} [payload.section] - Specific section if scope === 'section'
 * @param {string} [payload.category='Lecture Notes'] - Category
 * @param {string} [payload.description] - Description
 * @param {boolean} [payload.isYearWide] - Alternative flag for year-wide scope
 * @returns {Promise<object>} Created study material record
 */
export async function publishFromDriveFile({
  subjectId,
  driveFileId,
  title,
  scope = 'year',
  section = null,
  category = 'Lecture Notes',
  description = '',
  isYearWide
} = {}) {
  if (!subjectId || typeof subjectId !== 'string' || !subjectId.trim()) {
    throw new Error('subjectId is required to publish from Google Drive.');
  }

  if (!driveFileId || typeof driveFileId !== 'string' || !driveFileId.trim()) {
    throw new Error('driveFileId is required to publish from Google Drive.');
  }

  const token = await getAuthToken();
  const apiBase = getApiBaseUrl();

  const bodyPayload = {
    subjectId: subjectId.trim(),
    driveFileId: driveFileId.trim(),
    title: (title || '').trim(),
    scope,
    section: section ? section.trim() : null,
    category: (category || 'Lecture Notes').trim(),
    description: (description || '').trim(),
    isYearWide: isYearWide !== undefined ? Boolean(isYearWide) : scope === 'year'
  };

  let response;
  try {
    response = await fetch(`${apiBase}/api/study-materials/publish-from-drive`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(bodyPayload)
    });
  } catch (netErr) {
    throw new Error('Unable to connect to the backend server. Please verify the Express backend is running.');
  }

  if (!response.ok) {
    await handleApiError(response, 'Failed to publish Drive file as study material.');
  }

  const data = await response.json();
  return data.material;
}

/**
 * Formats a file size in bytes to a human-readable string.
 *
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted size (e.g. '1.5 MB', '500.0 KB', '0 B')
 */
export function formatFileSize(bytes) {
  if (!bytes || isNaN(bytes)) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Formats an ISO date string to a human-readable date.
 *
 * @param {string} isoString - ISO date string
 * @returns {string} Formatted date (e.g. 'Oct 19, 2026') or '—'
 */
export function formatDate(isoString) {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  } catch {
    return '—';
  }
}

/**
 * Fetches full study material history and archive for authorized faculty and directors.
 *
 * @param {object} [filters={}]
 * @param {string} [filters.subjectId]
 * @param {string} [filters.department]
 * @param {string} [filters.year]
 * @param {string} [filters.section]
 * @returns {Promise<Array<object>>} List of historical/archived study materials.
 */
export async function fetchStudyMaterialHistory({
  subjectId,
  department,
  year,
  section
} = {}) {
  const token = await getAuthToken();
  const apiBase = getApiBaseUrl();

  const queryParams = new URLSearchParams();
  if (subjectId) queryParams.append('subjectId', subjectId);
  if (department && department !== 'All Departments') queryParams.append('department', department);
  if (year && year !== 'All Years') queryParams.append('year', year);
  if (section && section !== 'All Sections') queryParams.append('section', section);

  const url = `${apiBase}/api/study-materials/history${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;

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
    await handleApiError(response, 'Failed to fetch study material history.');
  }

  const data = await response.json();
  return data.history || [];
}

/**
 * Fetches sanitized unavailable/archived study materials for authenticated students.
 *
 * @param {object} [filters={}]
 * @param {string} [filters.subjectId]
 * @param {string} [filters.department]
 * @param {string} [filters.year]
 * @param {string} [filters.section]
 * @returns {Promise<Array<object>>} List of archived materials for student's scope.
 */
export async function fetchStudentStudyMaterialHistory({
  subjectId,
  department,
  year,
  section
} = {}) {
  const token = await getAuthToken();
  const apiBase = getApiBaseUrl();

  const queryParams = new URLSearchParams();
  if (subjectId) queryParams.append('subjectId', subjectId);
  if (department && department !== 'All Departments') queryParams.append('department', department);
  if (year && year !== 'All Years') queryParams.append('year', year);
  if (section && section !== 'All Sections') queryParams.append('section', section);

  const url = `${apiBase}/api/study-materials/student-history${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;

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
    await handleApiError(response, 'Failed to fetch student study material history.');
  }

  const data = await response.json();
  return data.history || [];
}

/**
 * Resolves a unified status descriptor for study materials across lifecycle states.
 *
 * @param {object} material
 * @returns {{ label: string, color: string, code: string, description: string }}
 */
export function getMaterialDisplayStatus(material) {
  if (!material) return { label: 'Unknown', color: 'slate', code: 'unknown', description: 'Status unknown' };

  if (material.status === 'unavailable') {
    if (material.availabilityStatus === 'deleted') {
      return {
        label: 'Deleted from Google Drive',
        color: 'rose',
        code: 'deleted',
        description: 'Original file was deleted from Google Drive. Material is permanently unavailable.'
      };
    }
    if (material.availabilityStatus === 'trashed') {
      return {
        label: 'In Google Drive trash',
        color: 'amber',
        code: 'trashed',
        description: 'Original file is in Google Drive trash. Inaccessible until restored.'
      };
    }
    if (material.availabilityStatus === 'revoked') {
      return {
        label: 'Drive access revoked',
        color: 'orange',
        code: 'revoked',
        description: 'Google Drive authorization was revoked. Inaccessible until reconnected.'
      };
    }
    return {
      label: 'Unavailable',
      color: 'slate',
      code: 'unavailable',
      description: material.unavailableReason || 'File is currently unavailable.'
    };
  }

  if (material.isPublished) {
    return {
      label: 'Published',
      color: 'emerald',
      code: 'published',
      description: 'Active and available for students to download.'
    };
  }

  return {
    label: 'Unpublished',
    color: 'slate',
    code: 'unpublished',
    description: 'Deliberately unpublished by faculty. File remains intact in Google Drive.'
  };
}

