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
 * @param {string|Array<string>} [options.authorRole]
 * @param {string|Array<string>} [options.authorRoles]
 * @returns {Promise<{ success: boolean, announcements: Array<object>, pagination: object }>}
 */
export async function fetchAnnouncements({ page = 1, limit = 50, authorRole, authorRoles } = {}) {
  const token = await getAuthToken();
  const apiBase = getApiBaseUrl();

  const queryParams = new URLSearchParams();
  if (page) queryParams.append('page', page);
  if (limit) queryParams.append('limit', limit);
  const roles = authorRole || authorRoles;
  if (roles) {
    queryParams.append('authorRoles', Array.isArray(roles) ? roles.join(',') : roles);
  }

  let response;
  try {
    response = await fetch(`${apiBase}/api/announcements?${queryParams.toString()}`, {
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
 * Fetches dashboard announcements strictly limited to Director and HOD announcements.
 *
 * @param {object} [options={}]
 * @param {number} [options.limit=4] - Maximum items to retrieve (default 4).
 * @returns {Promise<{ success: boolean, announcements: Array<object>, pagination: object }>}
 */
export async function fetchDashboardAnnouncements({ limit = 4 } = {}) {
  const token = await getAuthToken();
  const apiBase = getApiBaseUrl();

  let response;
  try {
    response = await fetch(`${apiBase}/api/announcements/dashboard?limit=${encodeURIComponent(limit)}`, {
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

    throw new Error(errorData?.error || `Failed to fetch dashboard announcements (${response.status})`);
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

  const result = await response.json();

  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('sangam:announcement-published', { detail: result.announcement }));
    } catch {
      // Non-browser or custom environment fallback
    }
  }

  return result;
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

export const ANNOUNCEMENT_THEMES = [
  {
    color: '#F5B8D8',
    tagBg: '#E4A3C5',
    mutedColor: '#6E4E60',
    icon: 'knot'
  },
  {
    color: '#C4D4F2',
    tagBg: '#AEC2E8',
    mutedColor: '#4A5974',
    icon: 'stethoscope'
  },
  {
    color: '#C4B5FD',
    tagBg: '#B39DF8',
    mutedColor: '#4C1D95',
    icon: 'video'
  },
  {
    color: '#A7B868',
    tagBg: '#94A753',
    mutedColor: '#465124',
    icon: 'report'
  }
];

/**
 * Checks if a role string belongs to Director or HOD.
 */
export function isDirectorOrHodRole(role) {
  if (!role || typeof role !== 'string') return false;
  const r = role.toLowerCase().trim();
  return (
    r === 'director' ||
    r === 'admin' ||
    r === 'hod' ||
    r === 'head_of_department' ||
    r === 'head of department'
  );
}

/**
 * Checks if an announcement was published by a Director or HOD using authoritative role.
 */
export function isDirectorOrHodAnnouncement(announcement) {
  if (!announcement || typeof announcement !== 'object') return false;
  return isDirectorOrHodRole(announcement.authorRole);
}

/**
 * Filters announcements strictly to Director and HOD announcements, sorted newest first.
 */
export function filterEligibleDashboardAnnouncements(announcements) {
  if (!Array.isArray(announcements)) return [];
  return announcements
    .filter(isDirectorOrHodAnnouncement)
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

/**
 * Filters announcements by date period (Today, Tomorrow, This Week).
 */
export function filterAnnouncementsByPeriod(items, period) {
  if (!period || !Array.isArray(items) || period === 'All') return items || [];

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
  const endOfTomorrow = new Date(endOfToday.getTime() + 24 * 60 * 60 * 1000);

  const dayOfWeek = now.getDay();
  const distanceToMonday = (dayOfWeek + 6) % 7;
  const startOfWeek = new Date(startOfToday.getTime() - distanceToMonday * 24 * 60 * 60 * 1000);
  const endOfWeek = new Date(startOfWeek.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);

  return items.filter(item => {
    const rawDate = item.createdAt || item.date;
    if (!rawDate) return false;
    const d = new Date(rawDate);
    if (isNaN(d.getTime())) return false;

    if (period === 'Today') {
      return d >= startOfToday && d <= endOfToday;
    }
    if (period === 'Tomorrow') {
      return d >= startOfTomorrow && d <= endOfTomorrow;
    }
    if (period === 'This Week') {
      return d >= startOfWeek && d <= endOfWeek;
    }
    return true;
  });
}

/**
 * Maps a raw announcement record to the exact visual structure required by the dashboard panel.
 */
export function mapAnnouncementToPanelItem(ann, index = 0) {
  if (!ann || typeof ann !== 'object') return null;
  const theme = ANNOUNCEMENT_THEMES[index % ANNOUNCEMENT_THEMES.length];

  const authorRole = String(ann.authorRole || '').toLowerCase().trim();
  const isDirector = authorRole === 'director' || authorRole === 'admin';
  const isHod = authorRole === 'hod' || authorRole === 'head_of_department' || authorRole === 'head of department';

  let formattedTime = ann.time;
  let formattedDate = ann.checkedDate;
  if (ann.createdAt) {
    try {
      const d = new Date(ann.createdAt);
      if (!isNaN(d.getTime())) {
        if (!formattedTime) {
          const hours = d.getHours();
          const minutes = String(d.getMinutes()).padStart(2, '0');
          const ampm = hours >= 12 ? 'PM' : 'AM';
          const hr12 = String(hours % 12 || 12).padStart(2, '0');
          formattedTime = `${hr12} : ${minutes} ${ampm}`;
        }
        if (!formattedDate) {
          const months = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
          ];
          formattedDate = `on ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
        }
      }
    } catch {
      // Fallback
    }
  }

  let badgeCode = ann.badgeCode;
  if (!badgeCode) {
    if (isDirector) badgeCode = 'DIRECTOR';
    else if (isHod) badgeCode = 'HOD';
    else badgeCode = 'OFFICIAL';
  }

  let demographics = ann.demographics;
  if (!demographics) {
    const roleTitle = isDirector ? 'Director Office' : (isHod ? 'Head of Department' : 'Official');
    const scopeDesc = ann.scopeType === 'institution'
      ? 'Institution Broadcast'
      : (ann.department ? `${ann.department} Dept` : 'Campus Notice');
    demographics = `${roleTitle} • ${scopeDesc}`;
  }

  let tags = ann.tags;
  if (!Array.isArray(tags) || tags.length === 0) {
    tags = [];
    if (ann.priority === 'urgent') tags.push('Urgent');
    if (ann.scopeType) tags.push(ann.scopeType.charAt(0).toUpperCase() + ann.scopeType.slice(1));
    if (ann.category && ann.category !== 'general') {
      tags.push(ann.category.charAt(0).toUpperCase() + ann.category.slice(1));
    }
    if (tags.length === 0) tags.push('Official');
  }

  let prescriptions = ann.prescriptions;
  if (!Array.isArray(prescriptions) || prescriptions.length === 0) {
    if (ann.content) {
      const lines = ann.content.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length > 1) {
        prescriptions = lines.slice(0, 3);
      } else {
        prescriptions = [ann.content.slice(0, 180)];
      }
    } else {
      prescriptions = ['Review the published guidelines.'];
    }
  }

  return {
    id: ann.id || `ann-${index}`,
    name: ann.title || ann.name || 'Official Announcement',
    subtitle: ann.subtitle || (ann.priority === 'urgent' ? 'Priority Notice' : (ann.category || 'General Notice')),
    time: formattedTime || '09 : 00 AM',
    color: ann.color || theme.color,
    tagBg: ann.tagBg || theme.tagBg,
    mutedColor: ann.mutedColor || theme.mutedColor,
    icon: ann.icon || theme.icon,
    badgeCode,
    demographics,
    tags,
    checkedBy: ann.checkedBy || ann.authorName || (isDirector ? 'Director' : 'HOD'),
    checkedDate: formattedDate || 'Recently',
    refCode: ann.refCode || (ann.id ? `#${String(ann.id).replace(/^ann_/, '').slice(0, 8).toUpperCase()}` : '#REF-OFFICIAL'),
    observation: ann.observation || ann.content || ann.title || 'Official notice from college administration.',
    prescriptions,
    authorRole: ann.authorRole,
    institution: ann.institution,
    department: ann.department,
    createdAt: ann.createdAt
  };
}

export default {
  getApiBaseUrl,
  getAuthToken,
  fetchAnnouncements,
  fetchDashboardAnnouncements,
  postAnnouncement,
  fetchAnnouncementById,
  isDirectorOrHodRole,
  isDirectorOrHodAnnouncement,
  filterEligibleDashboardAnnouncements,
  filterAnnouncementsByPeriod,
  mapAnnouncementToPanelItem,
  ANNOUNCEMENT_THEMES
};

