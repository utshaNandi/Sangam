import { auth } from '../firebase/config.js';

/**
 * Returns the configured Express backend base URL.
 * - In production Vite builds, returns '' to ensure same-origin relative URLs on Vercel and prevent localhost leakage.
 * - In browser environments (both local development via Vite proxy and production), returns '' to use relative routes.
 * - In Node.js / test environments (where window is undefined), returns 'http://localhost:3001'.
 * - If VITE_API_BASE_URL is explicitly configured, it is honored.
 */
export function getApiBaseUrl() {
  const envUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL);
  if (typeof envUrl === 'string' && envUrl.trim() !== '') {
    return envUrl.trim().replace(/\/$/, '');
  }
  // In production builds (statically evaluated by Vite build), return '' so no localhost URL leaks into dist/
  if (typeof import.meta !== 'undefined' && import.meta.env?.PROD) {
    return '';
  }
  // In browser environments, use relative URLs ('') so local dev uses Vite proxy and prod uses Vercel rewrites
  if (typeof window !== 'undefined') {
    return '';
  }
  // In Node.js / test runner environments (window is undefined), default to http://localhost:3001
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

  // If currentUser is not immediately populated (e.g. initial reload), wait briefly for onAuthStateChanged
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
    throw new Error('You must be signed in to access announcements. Please refresh or sign in again.');
  }

  return await user.getIdToken();
}

/**
 * Fetches scoped announcements for the authenticated user with pagination.
 *
 * @param {object} [options={}]
 * @param {number} [options.page=1]
 * @param {number} [options.limit=50]
 * @returns {Promise<{ success: boolean, announcements: Array<object>, pagination: object }>}
 */
export async function fetchAnnouncements({ page = 1, limit = 50 } = {}) {
  const token = await getAuthToken();
  const apiBase = getApiBaseUrl();

  let response;
  try {
    response = await fetch(`${apiBase}/api/announcements?page=${encodeURIComponent(page)}&limit=${encodeURIComponent(limit)}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
  } catch (netErr) {
    if (netErr?.message?.includes('Failed to fetch') || netErr?.name === 'TypeError') {
      throw new Error('Unable to connect to the backend API server. Please verify the Express backend is running (e.g. node server.js) and accessible.');
    }
    throw netErr;
  }

  if (!response.ok) {
    let errorData = null;
    try {
      errorData = await response.json();
    } catch {
      // Non-JSON response
    }

    if (response.status === 401) {
      throw new Error('Your session has expired or is invalid. Please sign in again.');
    }

    if (response.status === 403) {
      throw new Error(errorData?.error || 'Access denied: You do not have permission to view announcements.');
    }

    if (response.status === 502 || response.status === 503 || response.status === 504) {
      throw new Error('The backend API server is unreachable (502 Bad Gateway). Please verify that the Express backend is running (e.g. node server.js).');
    }

    throw new Error(errorData?.error || `Failed to fetch announcements (${response.status})`);
  }

  return await response.json();
}

/**
 * Publishes a new announcement via the backend API.
 * Sends strictly the fields required by the API.
 * Does NOT supply client role, teacher UID, or institution.
 *
 * @param {object} params
 * @param {string} params.title - Announcement title (1-200 chars).
 * @param {string} params.content - Announcement body (1-5000 chars).
 * @param {string} [params.scopeType='section'] - 'institution' | 'branch' | 'department' | 'year' | 'section'.
 * @param {string} params.department - Target department.
 * @param {string} params.year - Target year.
 * @param {string} params.section - Target section.
 * @param {string} [params.priority='normal'] - 'normal' | 'urgent'.
 * @param {string} [params.category='general'] - Announcement category.
 * @returns {Promise<{ success: boolean, message: string, announcement: object }>}
 */
export async function postAnnouncement({
  title,
  content,
  scopeType = 'section',
  department,
  year,
  section,
  priority = 'normal',
  category = 'general'
}) {
  const token = await getAuthToken();
  const apiBase = getApiBaseUrl();

  const payload = {
    title: title?.trim(),
    content: content?.trim(),
    scopeType,
    department: department?.trim(),
    year: year?.trim(),
    section: section?.trim(),
    priority: priority === 'urgent' ? 'urgent' : 'normal',
    category: category?.trim() || 'general'
  };

  let response;
  try {
    response = await fetch(`${apiBase}/api/announcements`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });
  } catch (netErr) {
    if (netErr?.message?.includes('Failed to fetch') || netErr?.name === 'TypeError') {
      throw new Error('Unable to connect to the backend API server. Please verify the Express backend is running (e.g. node server.js) and accessible.');
    }
    throw netErr;
  }

  if (!response.ok) {
    let errorData = null;
    try {
      errorData = await response.json();
    } catch {
      // Non-JSON response
    }

    if (response.status === 401) {
      throw new Error('Your session has expired. Please sign in again.');
    }

    if (response.status === 403) {
      throw new Error(errorData?.error || 'Forbidden: You are not authorized to post this announcement.');
    }

    if (response.status === 502 || response.status === 503 || response.status === 504) {
      throw new Error('The backend API server is unreachable (502 Bad Gateway). Please verify that the Express backend is running (e.g. node server.js).');
    }

    throw new Error(errorData?.error || `Failed to publish announcement (${response.status})`);
  }

  return await response.json();
}

/**
 * Fetches a single announcement by ID if authorized.
 *
 * @param {string} announcementId
 * @returns {Promise<{ success: boolean, announcement: object }>}
 */
export async function fetchAnnouncementById(announcementId) {
  const token = await getAuthToken();
  const apiBase = getApiBaseUrl();

  let response;
  try {
    response = await fetch(`${apiBase}/api/announcements/${encodeURIComponent(announcementId)}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
  } catch (netErr) {
    if (netErr?.message?.includes('Failed to fetch') || netErr?.name === 'TypeError') {
      throw new Error('Unable to connect to the backend API server. Please verify the Express backend is running (e.g. node server.js) and accessible.');
    }
    throw netErr;
  }

  if (!response.ok) {
    let errorData = null;
    try {
      errorData = await response.json();
    } catch {
      // Non-JSON response
    }

    if (response.status === 502 || response.status === 503 || response.status === 504) {
      throw new Error('The backend API server is unreachable (502 Bad Gateway). Please verify that the Express backend is running (e.g. node server.js).');
    }

    throw new Error(errorData?.error || `Failed to fetch announcement (${response.status})`);
  }

  return await response.json();
}

export default {
  getApiBaseUrl,
  getAuthToken,
  fetchAnnouncements,
  postAnnouncement,
  fetchAnnouncementById
};
