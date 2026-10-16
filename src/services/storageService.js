import { auth } from '../firebase/config.js';

/**
 * Returns the configured Express backend base URL.
 * Defaults to http://localhost:3001 in local development.
 * In a production reverse-proxy environment, VITE_API_BASE_URL can be set to '' or the production origin.
 */
export function getApiBaseUrl() {
  const envUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) || '';
  if (envUrl) {
    return envUrl.replace(/\/$/, '');
  }
  return 'http://localhost:3001';
}

/**
 * Obtains a fresh Firebase ID token for the currently authenticated user.
 *
 * @returns {Promise<string>} Fresh Firebase Auth ID token.
 * @throws {Error} If user is not authenticated.
 */
async function getAuthToken() {
  const user = auth?.currentUser;
  if (!user) {
    throw new Error('You must be signed in to access storage settings.');
  }
  return await user.getIdToken(true);
}

/**
 * Fetches the current storage integration status for the authenticated teacher.
 * Reaches the trusted backend endpoint GET /api/storage/status.
 *
 * @returns {Promise<{ success: boolean, connected: boolean, provider?: string, accountEmail?: string, accountName?: string, status?: string, connectedAt?: string, updatedAt?: string, tokenExpiresAt?: number }>}
 */
export async function getStorageStatus() {
  const token = await getAuthToken();
  const apiBase = getApiBaseUrl();

  const response = await fetch(`${apiBase}/api/storage/status`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error(errorBody.error || `Failed to fetch storage status (${response.status})`);
  }

  return await response.json();
}

/**
 * Requests a genuine Google OAuth 2.0 authorization URL from the backend.
 * Reaches GET /api/storage/google/auth-url.
 *
 * @returns {Promise<{ success: boolean, url: string, provider: string }>}
 */
export async function getGoogleAuthUrl() {
  const token = await getAuthToken();
  const apiBase = getApiBaseUrl();

  const response = await fetch(`${apiBase}/api/storage/google/auth-url`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error(errorBody.error || `Failed to initiate Google Drive connection (${response.status})`);
  }

  return await response.json();
}

/**
 * Disconnects the teacher's cloud storage integration.
 * Reaches POST /api/storage/disconnect.
 *
 * @returns {Promise<{ success: boolean, revoked: boolean, message: string }>}
 */
export async function disconnectStorage() {
  const token = await getAuthToken();
  const apiBase = getApiBaseUrl();

  const response = await fetch(`${apiBase}/api/storage/disconnect`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error(errorBody.error || `Failed to disconnect Google Drive (${response.status})`);
  }

  return await response.json();
}

/**
 * Uploads an assignment PDF to the teacher's private Google Drive via the Stage 5C backend.
 * Reaches POST /api/assignments/upload.
 *
 * @param {Object} params
 * @param {File|Blob} params.file - The PDF file
 * @param {string} params.title - Assignment title
 * @param {string} params.department - Academic branch / department
 * @param {string} params.year - Academic year (e.g. "3rd Year")
 * @param {string} params.section - Class section (e.g. "Section C" or "CSE-A")
 * @param {string} params.dueDate - Due date string (YYYY-MM-DD or ISO)
 * @param {string} [params.description] - Optional description
 * @param {string} [params.idempotencyKey] - Optional client-side idempotency key
 * @returns {Promise<{ success: boolean, assignment: Object }>}
 */
export async function uploadAssignmentPdf({
  file,
  title,
  department,
  year,
  section,
  dueDate,
  description = '',
  idempotencyKey = ''
}) {
  if (!file) {
    const err = new Error('Please select a PDF document to upload.');
    err.code = 'MISSING_FILE';
    throw err;
  }

  // Pre-validate MIME type and size in browser
  const isPdf = (file.type && file.type === 'application/pdf') || (file.name && file.name.toLowerCase().endsWith('.pdf'));
  if (!isPdf) {
    const err = new Error('Selected file must be a PDF document.');
    err.code = 'INVALID_MIME_TYPE';
    throw err;
  }

  if (file.size === 0) {
    const err = new Error('The selected PDF file is empty (0 bytes).');
    err.code = 'EMPTY_FILE';
    throw err;
  }

  const MAX_SIZE = 10 * 1024 * 1024; // 10MB
  if (file.size > MAX_SIZE) {
    const err = new Error('The selected PDF file exceeds the 10MB limit.');
    err.code = 'LIMIT_FILE_SIZE';
    throw err;
  }

  if (!title || !title.trim()) {
    const err = new Error('Assignment title is required.');
    err.code = 'VALIDATION_FAILED';
    throw err;
  }

  if (!dueDate) {
    const err = new Error('Due date is required.');
    err.code = 'VALIDATION_FAILED';
    throw err;
  }

  if (!department || !department.trim()) {
    const err = new Error('Department is required.');
    err.code = 'VALIDATION_FAILED';
    throw err;
  }

  if (!year || !year.trim()) {
    const err = new Error('Year is required.');
    err.code = 'VALIDATION_FAILED';
    throw err;
  }

  if (!section || !section.trim()) {
    const err = new Error('Section is required.');
    err.code = 'VALIDATION_FAILED';
    throw err;
  }

  const token = await getAuthToken();
  const apiBase = getApiBaseUrl();

  const formData = new FormData();
  formData.append('file', file);
  formData.append('title', title.trim());
  formData.append('department', department.trim());
  formData.append('year', year.trim());
  formData.append('section', section.trim());
  formData.append('dueDate', dueDate.trim());
  if (description) {
    formData.append('description', description.trim());
  }

  const headers = {
    Authorization: `Bearer ${token}`
  };

  if (idempotencyKey && typeof idempotencyKey === 'string' && idempotencyKey.trim()) {
    headers['X-Idempotency-Key'] = idempotencyKey.trim();
  }

  let response;
  try {
    response = await fetch(`${apiBase}/api/assignments/upload`, {
      method: 'POST',
      headers,
      body: formData
    });
  } catch (netErr) {
    const err = new Error(`Network error connecting to backend: ${netErr.message}`);
    err.code = 'SERVER_UNAVAILABLE';
    throw err;
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({
      error: `HTTP ${response.status}`,
      code: 'INTERNAL_ERROR'
    }));
    const err = new Error(errorBody.error || `Upload failed (${response.status})`);
    err.code = errorBody.code || `HTTP_${response.status}`;
    err.status = response.status;
    throw err;
  }

  return await response.json();
}

/**
 * Submits a student assignment PDF to the backend and teacher's connected Google Drive.
 * Reaches POST /api/submissions/upload.
 *
 * @param {Object} params
 * @param {File|Blob} params.file - The PDF file
 * @param {string} params.assignmentId - The assignment ID
 * @param {string} [params.idempotencyKey] - Optional client-side idempotency key
 * @returns {Promise<{ success: boolean, submission: Object, message: string }>}
 */
export async function submitStudentAssignment({
  file,
  assignmentId,
  idempotencyKey = ''
}) {
  if (!file) {
    const err = new Error('Please select a PDF document to submit.');
    err.code = 'MISSING_FILE';
    throw err;
  }

  // Pre-validate MIME type and extension in browser
  const isPdf = (file.type && file.type === 'application/pdf') || (file.name && file.name.toLowerCase().endsWith('.pdf'));
  if (!isPdf) {
    const err = new Error('Selected file must be a PDF document.');
    err.code = 'INVALID_MIME_TYPE';
    throw err;
  }

  if (file.size === 0) {
    const err = new Error('The selected PDF file is empty (0 bytes).');
    err.code = 'EMPTY_FILE';
    throw err;
  }

  const MAX_SIZE = 10 * 1024 * 1024; // 10MB
  if (file.size > MAX_SIZE) {
    const err = new Error('The selected PDF file exceeds the 10MB limit.');
    err.code = 'LIMIT_FILE_SIZE';
    throw err;
  }

  if (!assignmentId || !assignmentId.trim()) {
    const err = new Error('Assignment ID is required.');
    err.code = 'VALIDATION_FAILED';
    throw err;
  }

  const token = await getAuthToken();
  const apiBase = getApiBaseUrl();

  const formData = new FormData();
  formData.append('file', file);
  formData.append('assignmentId', assignmentId.trim());

  const headers = {
    Authorization: `Bearer ${token}`
  };

  if (idempotencyKey && typeof idempotencyKey === 'string' && idempotencyKey.trim()) {
    headers['X-Idempotency-Key'] = idempotencyKey.trim();
  }

  let response;
  try {
    response = await fetch(`${apiBase}/api/submissions/upload`, {
      method: 'POST',
      headers,
      body: formData
    });
  } catch (netErr) {
    const err = new Error(`Network error connecting to backend: ${netErr.message}`);
    err.code = 'SERVER_UNAVAILABLE';
    throw err;
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({
      error: `HTTP ${response.status}`,
      code: 'INTERNAL_ERROR'
    }));
    const err = new Error(errorBody.error || `Submission failed (${response.status})`);
    err.code = errorBody.code || `HTTP_${response.status}`;
    err.status = response.status;
    throw err;
  }

  return await response.json();
}

/**
 * Fetches persisted submissions for the authenticated student.
 * Reaches GET /api/submissions/my-submissions.
 *
 * @returns {Promise<{ success: boolean, submissions: Array<Object> }>}
 */
export async function getStudentSubmissions() {
  const token = await getAuthToken();
  const apiBase = getApiBaseUrl();

  let response;
  try {
    response = await fetch(`${apiBase}/api/submissions/my-submissions`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
  } catch (netErr) {
    const err = new Error(`Network error connecting to backend: ${netErr.message}`);
    err.code = 'SERVER_UNAVAILABLE';
    throw err;
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error(errorBody.error || `Failed to fetch submissions (${response.status})`);
  }

  return await response.json();
}

/**
 * Fetches a single submission for a specific assignment for the authenticated student.
 * Reaches GET /api/submissions/assignment/:assignmentId.
 *
 * @param {string} assignmentId
 * @returns {Promise<{ success: boolean, submission: Object|null }>}
 */
export async function getAssignmentSubmission(assignmentId) {
  if (!assignmentId) {
    throw new Error('assignmentId is required.');
  }
  const token = await getAuthToken();
  const apiBase = getApiBaseUrl();

  let response;
  try {
    response = await fetch(`${apiBase}/api/submissions/assignment/${encodeURIComponent(assignmentId)}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
  } catch (netErr) {
    const err = new Error(`Network error connecting to backend: ${netErr.message}`);
    err.code = 'SERVER_UNAVAILABLE';
    throw err;
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error(errorBody.error || `Failed to fetch submission (${response.status})`);
  }

  return await response.json();
}

/**
 * Fetches assignments available to the authenticated student (or faculty).
 * Reaches GET /api/assignments.
 *
 * @returns {Promise<{ success: boolean, assignments: Array<Object> }>}
 */
export async function getStudentAssignments() {
  const token = await getAuthToken();
  const apiBase = getApiBaseUrl();

  let response;
  try {
    response = await fetch(`${apiBase}/api/assignments`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
  } catch (netErr) {
    const err = new Error(`Network error connecting to backend: ${netErr.message}`);
    err.code = 'SERVER_UNAVAILABLE';
    throw err;
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error(errorBody.error || `Failed to fetch assignments (${response.status})`);
  }

  return await response.json();
}

/**
 * Downloads the original teacher-uploaded assignment PDF file.
 * Reaches GET /api/assignments/:assignmentId/file.
 * Triggers a secure browser download with the original filename.
 *
 * @param {string} assignmentId - The assignment ID
 * @param {string} [suggestedFileName='assignment.pdf'] - Suggested filename for download
 * @returns {Promise<{ success: boolean, blob: Blob }>}
 */
export async function downloadAssignmentPdf(assignmentId, suggestedFileName = 'assignment.pdf') {
  if (!assignmentId) {
    throw new Error('assignmentId is required.');
  }

  const token = await getAuthToken();
  const apiBase = getApiBaseUrl();

  let response;
  try {
    response = await fetch(`${apiBase}/api/assignments/${encodeURIComponent(assignmentId)}/file`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
  } catch (netErr) {
    const err = new Error(`Network error connecting to backend: ${netErr.message}`);
    err.code = 'SERVER_UNAVAILABLE';
    throw err;
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    const err = new Error(errorBody.error || `Failed to download assignment PDF (${response.status})`);
    err.code = errorBody.code || `HTTP_${response.status}`;
    err.status = response.status;
    throw err;
  }

  const blob = await response.blob();

  // If in browser environment with window.URL, trigger download
  if (typeof window !== 'undefined' && window.URL && typeof document !== 'undefined') {
    const blobUrl = window.URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');
    downloadLink.href = blobUrl;
    downloadLink.download = suggestedFileName || 'assignment.pdf';
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    setTimeout(() => window.URL.revokeObjectURL(blobUrl), 10000);
  }

  return { success: true, blob };
}

/**
 * Fetches submissions for a specific assignment created/managed by authorized faculty.
 * Reaches GET /api/assignments/:assignmentId/submissions.
 *
 * @param {string} assignmentId
 * @param {string} [overrideToken=null]
 * @returns {Promise<{ success: boolean, assignment: Object, submissions: Array<Object>, totalSubmissions: number }>}
 */
export async function getAssignmentSubmissions(assignmentId, overrideToken = null) {
  if (!assignmentId) {
    throw new Error('assignmentId is required.');
  }
  const token = await getAuthToken(overrideToken);
  const apiBase = getApiBaseUrl();

  let response;
  try {
    response = await fetch(`${apiBase}/api/assignments/${encodeURIComponent(assignmentId)}/submissions`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
  } catch (netErr) {
    const err = new Error(`Network error connecting to backend: ${netErr.message}`);
    err.code = 'SERVER_UNAVAILABLE';
    throw err;
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    const err = new Error(errorBody.error || `Failed to fetch submissions (${response.status})`);
    err.code = errorBody.code || `HTTP_${response.status}`;
    err.status = response.status;
    throw err;
  }

  return await response.json();
}

/**
 * Downloads an individual student submission PDF file from Google Drive.
 * Reaches GET /api/submissions/:submissionId/file.
 * Triggers a secure browser download with the submission filename.
 *
 * @param {string} submissionId
 * @param {string} [suggestedFileName='submission.pdf']
 * @param {string} [overrideToken=null]
 * @returns {Promise<{ success: boolean, blob: Blob }>}
 */
export async function downloadSubmissionPdf(submissionId, suggestedFileName = 'submission.pdf', overrideToken = null) {
  if (!submissionId) {
    throw new Error('submissionId is required.');
  }
  const token = await getAuthToken(overrideToken);
  const apiBase = getApiBaseUrl();

  let response;
  try {
    response = await fetch(`${apiBase}/api/submissions/${encodeURIComponent(submissionId)}/file`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
  } catch (netErr) {
    const err = new Error(`Network error connecting to backend: ${netErr.message}`);
    err.code = 'SERVER_UNAVAILABLE';
    throw err;
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    const err = new Error(errorBody.error || `Failed to download submission PDF (${response.status})`);
    err.code = errorBody.code || `HTTP_${response.status}`;
    err.status = response.status;
    throw err;
  }

  const blob = await response.blob();

  if (typeof window !== 'undefined' && window.URL && typeof document !== 'undefined') {
    const blobUrl = window.URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');
    downloadLink.href = blobUrl;
    downloadLink.download = suggestedFileName || 'submission.pdf';
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    setTimeout(() => window.URL.revokeObjectURL(blobUrl), 10000);
  }

  return { success: true, blob };
}

/**
 * Fetches real active students for a section from the backend.
 * Reaches GET /api/students.
 *
 * @param {Object} params
 * @param {string} [params.department]
 * @param {string} [params.year]
 * @param {string} [params.section]
 * @param {string} [params.institution]
 * @param {string} [overrideToken=null]
 * @returns {Promise<{ success: boolean, students: Array<Object>, totalStudents: number }>}
 */
export async function getSectionStudents({ department, year, section, institution } = {}, overrideToken = null) {
  const token = await getAuthToken(overrideToken);
  const apiBase = getApiBaseUrl();

  const params = new URLSearchParams();
  if (department) params.set('department', department);
  if (year) params.set('year', year);
  if (section) params.set('section', section);
  if (institution) params.set('institution', institution);

  let response;
  try {
    response = await fetch(`${apiBase}/api/students?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
  } catch (netErr) {
    const err = new Error(`Network error connecting to backend: ${netErr.message}`);
    err.code = 'SERVER_UNAVAILABLE';
    throw err;
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    const err = new Error(errorBody.error || `Failed to fetch section students (${response.status})`);
    err.code = errorBody.code || `HTTP_${response.status}`;
    err.status = response.status;
    throw err;
  }

  return await response.json();
}

export default {
  getApiBaseUrl,
  getStorageStatus,
  getGoogleAuthUrl,
  disconnectStorage,
  uploadAssignmentPdf,
  submitStudentAssignment,
  getStudentSubmissions,
  getAssignmentSubmission,
  getStudentAssignments,
  downloadAssignmentPdf,
  getAssignmentSubmissions,
  downloadSubmissionPdf,
  getSectionStudents
};

