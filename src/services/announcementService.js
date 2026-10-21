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
export async function fetchAnnouncements({ page = 1, limit = 50, authorRole, authorRoles, department, year, section } = {}) {
  const token = await getAuthToken();
  const apiBase = getApiBaseUrl();

  const queryParams = new URLSearchParams();
  if (page) queryParams.append('page', page);
  if (limit) queryParams.append('limit', limit);
  const roles = authorRole || authorRoles;
  if (roles) {
    queryParams.append('authorRoles', Array.isArray(roles) ? roles.join(',') : roles);
  }
  if (department) queryParams.append('department', department);
  if (year) queryParams.append('year', year);
  if (section) queryParams.append('section', section);

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
      throw new Error('Unable to connect to the backend API server. Please verify the Express backend is running (e.g. node server.js) and accessible.', { cause: netErr });
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
      throw new Error('Unable to connect to the backend API server. Please verify the Express backend is running (e.g. node server.js) and accessible.', { cause: netErr });
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
 * @param {Array<object>} [params.attachments=[]] - Announcement attachments (PDFs, images).
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
  category = 'general',
  attachments = []
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
    category: category?.trim() || 'general',
    attachments: Array.isArray(attachments) ? attachments : []
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
      throw new Error('Unable to connect to the backend API server. Please verify the Express backend is running (e.g. node server.js) and accessible.', { cause: netErr });
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
      throw new Error('Unable to connect to the backend API server. Please verify the Express backend is running (e.g. node server.js) and accessible.', { cause: netErr });
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

/**
 * Normalizes an announcement timestamp into epoch milliseconds.
 * Strictly rejects non-finite values (NaN, Infinity, -Infinity) and malformed objects.
 * Accurately handles:
 * - ISO strings / date strings
 * - Epoch millisecond numbers / numeric strings
 * - Firestore Timestamp instances (with .toMillis() or .toDate())
 * - Serialized Firestore Timestamp JSON ({ _seconds, _nanoseconds } or { seconds, nanoseconds })
 * - Missing or invalid timestamps (safely returns 0 to prevent NaN comparison)
 *
 * @param {any} val
 * @returns {number} Epoch milliseconds (integer >= 0)
 */
export function normalizeAnnouncementTimestamp(val) {
  if (val === null || val === undefined) return 0;

  // Direct number: reject NaN, Infinity, -Infinity, negative numbers
  if (typeof val === 'number') {
    return Number.isFinite(val) && val > 0 ? Math.floor(val) : 0;
  }

  // Date instance
  if (val instanceof Date) {
    const ms = val.getTime();
    return Number.isFinite(ms) && ms > 0 ? Math.floor(ms) : 0;
  }

  // Firestore Timestamp instance with toMillis()
  if (typeof val.toMillis === 'function') {
    try {
      const ms = val.toMillis();
      return typeof ms === 'number' && Number.isFinite(ms) && ms > 0 ? Math.floor(ms) : 0;
    } catch {
      // Fallback
    }
  }

  // Firestore Timestamp instance with toDate()
  if (typeof val.toDate === 'function') {
    try {
      const d = val.toDate();
      const ms = d instanceof Date ? d.getTime() : new Date(d).getTime();
      return typeof ms === 'number' && Number.isFinite(ms) && ms > 0 ? Math.floor(ms) : 0;
    } catch {
      // Fallback
    }
  }

  // Serialized Firestore Timestamp objects: { _seconds, _nanoseconds } or { seconds, nanoseconds }
  if (typeof val === 'object') {
    const secs = val._seconds !== undefined ? val._seconds : val.seconds;
    const nanos = val._nanoseconds !== undefined ? val._nanoseconds : val.nanoseconds;
    if (typeof secs === 'number' && Number.isFinite(secs) && secs > 0) {
      const nanosMs = typeof nanos === 'number' && Number.isFinite(nanos) && nanos > 0 ? Math.floor(nanos / 1e6) : 0;
      const ms = secs * 1000 + nanosMs;
      return Number.isFinite(ms) && ms > 0 ? Math.floor(ms) : 0;
    }
    return 0;
  }

  // String handling
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return 0;

    // Check for stringified non-finite tokens
    const lower = trimmed.toLowerCase();
    if (lower === 'nan' || lower === 'infinity' || lower === '+infinity' || lower === '-infinity') {
      return 0;
    }

    // Pure numeric digit string (e.g. "1712345678000")
    if (/^\d+$/.test(trimmed)) {
      const num = Number(trimmed);
      return Number.isFinite(num) && num > 0 ? Math.floor(num) : 0;
    }

    // Parse ISO / Date string
    const parsed = new Date(trimmed).getTime();
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
  }

  return 0;
}

/**
 * Formats a Date object following Sangam's DD/MM/YY date convention (e.g., 12/12/24).
 */
export function formatSangamDate(date = new Date()) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

/**
 * Maps an authoritative backend announcement record into the visual item structure
 * expected by AnnouncementPage.
 */
export function mapBackendAnnouncementToItem(ann) {
  if (!ann) return null;

  const role = String(ann.authorRole || '').toLowerCase().trim();
  const isDirector = role === 'director' || role === 'admin';
  const isHod = role === 'hod' || role === 'head_of_department' || role === 'head of department';
  const isTeacher = role === 'faculty' || role === 'teacher';

  let senderRole = 'Official';
  if (isDirector) {
    senderRole = 'Dean of Academic Affairs';
  } else if (isHod) {
    senderRole = 'Head of Department';
  } else if (isTeacher) {
    senderRole = 'Faculty Member';
  }

  // Format date DD/MM/YY
  let formattedDate = '-';
  if (ann.createdAt !== undefined && ann.createdAt !== null) {
    try {
      const ms = normalizeAnnouncementTimestamp(ann.createdAt);
      if (ms > 0) {
        formattedDate = formatSangamDate(new Date(ms));
      } else if (typeof ann.createdAt === 'string' && ann.createdAt.trim()) {
        formattedDate = ann.createdAt.trim();
      }
    } catch {
      formattedDate = ann.timestamp || '-';
    }
  } else if (ann.timestamp) {
    formattedDate = ann.timestamp;
  }

  // Map category to Title Case ('Academic' | 'Routine' | 'General')
  let category = 'General';
  const rawCat = (ann.category || '').toLowerCase().trim();
  if (rawCat === 'academic') category = 'Academic';
  else if (rawCat === 'routine') category = 'Routine';
  else if (rawCat === 'general') category = 'General';

  // Map status
  let status = 'Active';
  if (ann.priority === 'urgent') {
    status = 'Important';
  } else if (ann.status && ['Unread', 'Important', 'Active', 'Pinned', 'Routine'].includes(ann.status)) {
    status = ann.status;
  } else if (isDirector) {
    status = 'Important';
  }

  // Default avatar fallback
  const senderAvatar =
    ann.authorAvatar ||
    ann.senderAvatar ||
    (isDirector
      ? 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80'
      : isHod
      ? 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=120&auto=format&fit=crop&q=80'
      : 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120&auto=format&fit=crop&q=80');

  return {
    id: ann.id,
    senderName: ann.authorName || ann.senderName || (isDirector ? 'Director Office' : isHod ? 'Head of Department' : 'Faculty Member'),
    senderRole,
    senderEmail: ann.authorEmail || ann.senderEmail || '',
    senderAvatar,
    timestamp: formattedDate,
    dueDate: ann.dueDate || '-',
    subject: ann.title || ann.subject || 'Announcement',
    message: ann.content || ann.message || '',
    category,
    status,
    isSaved: Boolean(ann.isSaved),
    attachments: ann.attachments || (ann.attachment ? [ann.attachment] : []),
    createdAt: ann.createdAt,
    authorUid: ann.authorUid,
    authorRole: ann.authorRole,
    scopeType: ann.scopeType,
    department: ann.department,
    year: ann.year,
    section: ann.section
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
  mapBackendAnnouncementToItem,
  formatSangamDate,
  normalizeAnnouncementTimestamp,
  ANNOUNCEMENT_THEMES
};

