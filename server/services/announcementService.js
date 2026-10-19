import crypto from 'node:crypto';
import { getAdminFirestore } from '../config/firebaseAdmin.js';
import {
  CANONICAL_DEPARTMENT_MAP,
  isMatchingDepartment,
  isMatchingSection
} from './googleDriveService.js';

/**
 * Authoritatively compares two year strings (e.g. '1st Year' vs '1st Year', '1st' vs '1st Year', '1' vs '1st Year').
 *
 * @param {string} y1
 * @param {string} y2
 * @returns {boolean}
 */
export function isMatchingYear(y1, y2) {
  if (!y1 || !y2) return false;
  const s1 = String(y1).trim().toLowerCase();
  const s2 = String(y2).trim().toLowerCase();
  if (s1 === s2) return true;

  // Extract digits (e.g. 1 from '1st Year' or '1')
  const d1 = s1.match(/\d+/)?.[0];
  const d2 = s2.match(/\d+/)?.[0];
  if (d1 && d2 && d1 === d2) {
    return true;
  }
  return false;
}

/**
 * AnnouncementService
 *
 * Implements authoritative backend storage and role-based scoping for Sangam announcements.
 *
 * Enforces:
 * 1. Trusted Server-Side Profiles: Caller role, status, and institution are taken
 *    exclusively from the verified Firestore user profile, never client-supplied body.
 * 2. Active Account Check: Pending or inactive accounts are rejected with 403 Forbidden.
 * 3. Director Scope: May publish institution-wide, department-wide, department+year,
 *    or exact department+year+section announcements strictly within their authorized institution.
 * 4. Teacher Scope: May publish ONLY to sections with an active authorized allocation
 *    in teacher_allocations (supporting canonical department and section aliases).
 * 5. Student Scope: Strictly blocked from publishing. Reads are scoped strictly to their
 *    institution, department, year, and section, plus applicable institution-wide and department-wide announcements.
 * 6. Teacher Reads: Scoped to their institution, department, and authorized sections,
 *    plus applicable institution-wide announcements.
 * 7. Director Reads: Scoped to all announcements within their authorized institution.
 * 8. Pagination & Limit: Safe pagination metadata prevents unbounded memory consumption.
 */
export class AnnouncementService {
  constructor() {
    this.customDb = null;
  }

  getDb() {
    if (this.customDb) {
      return this.customDb;
    }
    const db = getAdminFirestore();
    if (!db) {
      throw new Error('Database is unavailable. Announcement operation failed closed.');
    }
    return db;
  }

  /**
   * Test-only helper to inject a mock Firestore database.
   * Strictly forbidden and fails closed in production.
   */
  setTestDb(mockDb) {
    const isTestEnv = (process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true');
    if (!isTestEnv) {
      throw new Error('SECURITY VIOLATION: setTestDb can only be called in test environment.');
    }
    this.customDb = mockDb;
  }

  /**
   * Loads and validates user profile from Firestore.
   * Enforces that the account exists and is active.
   *
   * @param {string} userId - Authenticated Firebase UID.
   * @returns {Promise<object>} Validated user profile.
   */
  async getValidatedUserProfile(userId) {
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      const err = new Error('Unauthorized: User identity could not be verified.');
      err.statusCode = 401;
      err.code = 'UNAUTHORIZED';
      throw err;
    }

    const db = this.getDb();
    const userSnap = await db.collection('users').doc(userId.trim()).get();

    if (!userSnap.exists) {
      const err = new Error('Forbidden: User profile not found.');
      err.statusCode = 403;
      err.code = 'USER_NOT_FOUND';
      throw err;
    }

    const userData = typeof userSnap.data === 'function' ? userSnap.data() : userSnap;
    const uid = userData.uid || userSnap.id;
    const status = (userData.status || '').toLowerCase().trim();
    const rawRole = (userData.role || '').toLowerCase().trim();

    // 1. Enforce active status: pending_approval or inactive users cannot publish or read
    if (status !== 'active') {
      const err = new Error('Forbidden: Account is pending approval or inactive.');
      err.statusCode = 403;
      err.code = 'ACCOUNT_INACTIVE';
      throw err;
    }

    // 2. Validate known role
    const normalizedRole = (rawRole === 'admin')
      ? 'director'
      : (rawRole === 'teacher'
        ? 'faculty'
        : (rawRole === 'head_of_department' || rawRole === 'head of department' || rawRole === 'hod')
          ? 'hod'
          : rawRole);
    if (!['director', 'hod', 'faculty', 'student'].includes(normalizedRole)) {
      const err = new Error(`Forbidden: Unrecognized account role '${userData.role}'.`);
      err.statusCode = 403;
      err.code = 'INVALID_ROLE';
      throw err;
    }

    return {
      ...userData,
      uid,
      role: normalizedRole
    };
  }

  /**
   * Authoritatively verifies whether a teacher has an active, authorized allocation
   * in teacher_allocations for the specified department, year, and section.
   *
   * @param {string} teacherUid
   * @param {string} department
   * @param {string} year
   * @param {string} section
   * @param {string} [institution=null]
   * @returns {Promise<boolean>}
   */
  async verifyTeacherAllocation(teacherUid, department, year, section, institution = null) {
    if (!teacherUid || !department || !year || !section) {
      return false;
    }

    const db = this.getDb();
    const coll = db.collection('teacher_allocations');

    // 1. Canonical doc ID: {teacherUid}_{department}_{year}_{section}
    const canonicalId = `${teacherUid}_${department}_${year}_${section}`;
    try {
      const snap = await coll.doc(canonicalId).get();
      if (snap.exists) {
        const data = typeof snap.data === 'function' ? snap.data() : snap;
        if (data && data.authorized === true) {
          if (!institution || !data.institution || data.institution === institution) {
            return true;
          }
        }
      }
    } catch {
      // Fallback to alias checks
    }

    // 2. Check canonical department aliases (e.g. Computer Science <-> CSE AI)
    const aliases = [];
    const canonicalDept = CANONICAL_DEPARTMENT_MAP[department] || department;
    for (const [alias, mapped] of Object.entries(CANONICAL_DEPARTMENT_MAP)) {
      if ((mapped === canonicalDept || alias === department) && alias !== department) {
        aliases.push(alias);
      }
    }

    for (const aliasDept of aliases) {
      const aliasId = `${teacherUid}_${aliasDept}_${year}_${section}`;
      try {
        const snap = await coll.doc(aliasId).get();
        if (snap.exists) {
          const data = typeof snap.data === 'function' ? snap.data() : snap;
          if (data && data.authorized === true) {
            if (!institution || !data.institution || data.institution === institution) {
              return true;
            }
          }
        }
      } catch {
        // Continue
      }
    }

    // 3. Legacy doc ID: {teacherUid}_{year}_{section}
    const legacyId = `${teacherUid}_${year}_${section}`;
    try {
      const snap = await coll.doc(legacyId).get();
      if (snap.exists) {
        const data = typeof snap.data === 'function' ? snap.data() : snap;
        if (data && data.authorized === true) {
          const deptMatches = !data.department || isMatchingDepartment(data.department, department);
          const instMatches = !institution || !data.institution || data.institution === institution;
          if (deptMatches && instMatches) {
            return true;
          }
        }
      }
    } catch {
      // Fallback to query
    }

    // 4. Query fallback: Query teacher_allocations where teacherUid matches
    try {
      if (typeof coll.where === 'function') {
        const qSnap = await coll.where('teacherUid', '==', teacherUid).get();
        const docs = qSnap.docs || [];
        for (const docSnap of docs) {
          const data = typeof docSnap.data === 'function' ? docSnap.data() : docSnap;
          if (data && data.authorized === true) {
            const yMatch = String(data.year).trim().toLowerCase() === String(year).trim().toLowerCase();
            const sMatch = isMatchingSection(data.section, section);
            const dMatch = !data.department || isMatchingDepartment(data.department, department);
            const iMatch = !institution || !data.institution || data.institution === institution;
            if (yMatch && sMatch && dMatch && iMatch) {
              return true;
            }
          }
        }
      }
    } catch {
      // Return false if unverified
    }

    return false;
  }

  /**
   * Loads all active, authorized allocations for a teacher.
   *
   * @param {string} teacherUid
   * @returns {Promise<Array<object>>}
   */
  async getTeacherActiveAllocations(teacherUid) {
    if (!teacherUid) return [];
    const db = this.getDb();
    const allocations = [];
    try {
      const coll = db.collection('teacher_allocations');
      if (typeof coll.where === 'function') {
        const snap = await coll.where('teacherUid', '==', teacherUid).get();
        if (snap && snap.forEach) {
          snap.forEach(docSnap => {
            const data = typeof docSnap.data === 'function' ? docSnap.data() : docSnap;
            if (data && data.authorized === true) {
              allocations.push(data);
            }
          });
        }
      }
    } catch (err) {
      console.warn('[AnnouncementService] Failed to load teacher allocations:', err.message);
    }
    return allocations;
  }

  /**
   * Publishes a new announcement with server-enforced role and scope validation.
   *
   * @param {object} params
   * @param {string} params.callerUid - Authenticated user ID.
   * @param {string} params.title - Announcement title (1-200 chars).
   * @param {string} params.content - Announcement body (1-5000 chars).
   * @param {string} params.scopeType - 'institution' | 'branch' | 'year' | 'section'.
   * @param {string} [params.department] - Target department (required for branch, year, and section).
   * @param {string} [params.year] - Target year (required for year and section).
   * @param {string} [params.section] - Target section (required for section).
   * @param {string} [params.priority='normal'] - 'normal' | 'urgent'.
   * @param {string} [params.category='general'] - Announcement category.
   * @returns {Promise<object>} The stored announcement record.
   */
  async createAnnouncement({
    callerUid,
    title,
    content,
    scopeType,
    department,
    year,
    section,
    priority = 'normal',
    category = 'general'
  }) {
    // 1. Basic field presence and length validation
    if (!title || typeof title !== 'string' || !title.trim()) {
      const err = new Error('title is required and cannot be empty.');
      err.statusCode = 400;
      err.code = 'INVALID_TITLE';
      throw err;
    }
    const cleanTitle = title.trim();
    if (cleanTitle.length > 200) {
      const err = new Error('title exceeds maximum allowed length of 200 characters.');
      err.statusCode = 400;
      err.code = 'TITLE_TOO_LONG';
      throw err;
    }

    if (!content || typeof content !== 'string' || !content.trim()) {
      const err = new Error('content is required and cannot be empty.');
      err.statusCode = 400;
      err.code = 'INVALID_CONTENT';
      throw err;
    }
    const cleanContent = content.trim();
    if (cleanContent.length > 5000) {
      const err = new Error('content exceeds maximum allowed length of 5000 characters.');
      err.statusCode = 400;
      err.code = 'CONTENT_TOO_LONG';
      throw err;
    }

    // Normalize scopeType ('department' -> 'branch')
    const rawScope = String(scopeType || '').trim().toLowerCase();
    const normalizedScope = rawScope === 'department' ? 'branch' : rawScope;

    if (!['institution', 'branch', 'year', 'section'].includes(normalizedScope)) {
      const err = new Error(`Invalid scopeType '${scopeType}'. Must be 'institution', 'branch', 'year', or 'section'.`);
      err.statusCode = 400;
      err.code = 'INVALID_SCOPE_TYPE';
      throw err;
    }

    // 2. Load verified, trusted server profile
    const profile = await this.getValidatedUserProfile(callerUid);
    const role = profile.role;
    const trustedInstitution = profile.institution || null;

    if (!trustedInstitution) {
      const err = new Error('Forbidden: User profile is not assigned to an authorized institution.');
      err.statusCode = 403;
      err.code = 'MISSING_INSTITUTION';
      throw err;
    }

    let targetDepartment = null;
    let targetYear = null;
    let targetSection = null;

    // 3. Enforce exact role-based publishing authorization
    if (role === 'student') {
      // Students cannot publish official announcements
      const err = new Error('Forbidden: Students cannot publish official announcements.');
      err.statusCode = 403;
      err.code = 'STUDENT_CANNOT_PUBLISH';
      throw err;
    }

    if (role === 'director') {
      // Director: may publish institution-wide, department-wide, department+year, or section-wide within their authorized institution
      if (normalizedScope === 'branch') {
        if (!department || typeof department !== 'string' || !department.trim()) {
          const err = new Error('department is required when publishing a department-wide announcement.');
          err.statusCode = 400;
          err.code = 'MISSING_DEPARTMENT';
          throw err;
        }
        targetDepartment = CANONICAL_DEPARTMENT_MAP[department.trim()] || department.trim();
      } else if (normalizedScope === 'year') {
        if (!department || typeof department !== 'string' || !department.trim()) {
          const err = new Error('department is required when publishing a department+year announcement.');
          err.statusCode = 400;
          err.code = 'MISSING_DEPARTMENT';
          throw err;
        }
        if (!year || typeof year !== 'string' || !year.trim()) {
          const err = new Error('year is required when publishing a department+year announcement.');
          err.statusCode = 400;
          err.code = 'MISSING_YEAR';
          throw err;
        }
        targetDepartment = CANONICAL_DEPARTMENT_MAP[department.trim()] || department.trim();
        targetYear = year.trim();
      } else if (normalizedScope === 'section') {
        if (!department || typeof department !== 'string' || !department.trim()) {
          const err = new Error('department is required for section announcements.');
          err.statusCode = 400;
          err.code = 'MISSING_DEPARTMENT';
          throw err;
        }
        if (!year || typeof year !== 'string' || !year.trim()) {
          const err = new Error('year is required for section announcements.');
          err.statusCode = 400;
          err.code = 'MISSING_YEAR';
          throw err;
        }
        if (!section || typeof section !== 'string' || !section.trim()) {
          const err = new Error('section is required for section announcements.');
          err.statusCode = 400;
          err.code = 'MISSING_SECTION';
          throw err;
        }
        targetDepartment = CANONICAL_DEPARTMENT_MAP[department.trim()] || department.trim();
        targetYear = year.trim();
        targetSection = section.trim();
      }
    } else if (role === 'faculty') {
      // Teacher: may publish ONLY to sections listed in their active authorized teacher_allocations
      if (normalizedScope !== 'section') {
        const err = new Error('Forbidden: Teachers can publish only to sections listed in their authorized allocations.');
        err.statusCode = 403;
        err.code = 'TEACHER_SCOPE_FORBIDDEN';
        throw err;
      }

      if (!department || typeof department !== 'string' || !department.trim()) {
        const err = new Error('department is required for section announcements.');
        err.statusCode = 400;
        err.code = 'MISSING_DEPARTMENT';
        throw err;
      }
      if (!year || typeof year !== 'string' || !year.trim()) {
        const err = new Error('year is required for section announcements.');
        err.statusCode = 400;
        err.code = 'MISSING_YEAR';
        throw err;
      }
      if (!section || typeof section !== 'string' || !section.trim()) {
        const err = new Error('section is required for section announcements.');
        err.statusCode = 400;
        err.code = 'MISSING_SECTION';
        throw err;
      }

      const cleanDept = department.trim();
      const cleanYear = year.trim();
      const cleanSec = section.trim();

      const isAllocated = await this.verifyTeacherAllocation(
        callerUid,
        cleanDept,
        cleanYear,
        cleanSec,
        trustedInstitution
      );

      if (!isAllocated) {
        const err = new Error(`Forbidden: You do not have an active authorized allocation for ${cleanDept} • ${cleanYear} • ${cleanSec}.`);
        err.statusCode = 403;
        err.code = 'UNAUTHORIZED_ALLOCATION';
        throw err;
      }

      targetDepartment = CANONICAL_DEPARTMENT_MAP[cleanDept] || cleanDept;
      targetYear = cleanYear;
      targetSection = cleanSec;
    }

    // 4. Generate unique document record
    const announcementId = `ann_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const nowIso = new Date().toISOString();

    const announcement = {
      id: announcementId,
      title: cleanTitle,
      content: cleanContent,
      scopeType: normalizedScope,
      institution: trustedInstitution,
      department: targetDepartment,
      year: targetYear,
      section: targetSection,
      authorUid: callerUid,
      authorName: profile.name || (profile.email ? profile.email.split('@')[0] : 'Staff'),
      authorRole: role,
      authorEmail: profile.email || '',
      priority: priority === 'urgent' ? 'urgent' : 'normal',
      category: typeof category === 'string' && category.trim() ? category.trim().toLowerCase() : 'general',
      createdAt: nowIso,
      updatedAt: nowIso
    };

    // 5. Persist to Firestore
    const db = this.getDb();
    await db.collection('announcements').doc(announcementId).set(announcement);

    return announcement;
  }

  /**
   * Retrieves announcements accessible to the caller with authoritative server-side scoping
   * and pagination.
   *
   * Query parameters like department or section CANNOT expand scope beyond what the server profile permits.
   *
   * @param {object} params
   * @param {string} params.callerUid - Authenticated user ID.
   * @param {number|string} [params.page=1] - 1-indexed page number.
   * @param {number|string} [params.limit=50] - Number of items per page (max 100).
   * @param {string|Array<string>} [params.authorRole] - Optional filter for author role(s).
   * @param {string|Array<string>} [params.authorRoles] - Optional filter for author role(s).
   * @returns {Promise<{ announcements: Array<object>, pagination: object }>}
   */
  async getAnnouncementsForUser({ callerUid, page = 1, limit = 50, authorRole, authorRoles }) {
    // 1. Load and validate server profile
    const profile = await this.getValidatedUserProfile(callerUid);
    const role = profile.role;
    const userInstitution = profile.institution;

    if (!userInstitution) {
      return {
        announcements: [],
        pagination: { page: 1, limit: 50, total: 0, totalPages: 0, hasMore: false }
      };
    }

    // 2. Sanitize pagination parameters
    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (parsedPage - 1) * parsedLimit;

    // 3. For faculty, load active authorized allocations
    let teacherAllocations = [];
    if (role === 'faculty') {
      teacherAllocations = await this.getTeacherActiveAllocations(callerUid);
    }

    // Parse authorRoles filter if specified (e.g. 'director,hod' or ['director', 'hod'])
    const rawFilter = authorRole || authorRoles;
    let allowedRoles = null;
    if (rawFilter) {
      if (Array.isArray(rawFilter)) {
        allowedRoles = rawFilter.map(r => String(r).toLowerCase().trim()).filter(Boolean);
      } else if (typeof rawFilter === 'string') {
        allowedRoles = rawFilter.split(',').map(r => r.toLowerCase().trim()).filter(Boolean);
      }
    }

    // 4. Query announcements from Firestore for user's institution
    const db = this.getDb();
    const coll = db.collection('announcements');
    let snap;

    if (typeof coll.where === 'function') {
      try {
        snap = await coll.where('institution', '==', userInstitution).get();
      } catch {
        snap = await coll.get();
      }
    } else {
      snap = await coll.get();
    }

    const matched = [];

    if (snap && snap.forEach) {
      snap.forEach(docSnap => {
        const ann = typeof docSnap.data === 'function' ? docSnap.data() : docSnap;
        if (!ann) return;
        ann.id = docSnap.id || ann.id;

        // Institution boundary is strictly enforced
        if (ann.institution !== userInstitution) return;

        // Scope check based on role
        if (this.isUserAuthorizedToRead(profile, ann, teacherAllocations)) {
          // If author role filter is specified, enforce trusted authorRole matching
          if (allowedRoles && allowedRoles.length > 0) {
            const annAuthorRole = String(ann.authorRole || '').toLowerCase().trim();
            const matchesRole = allowedRoles.some(filterRole => {
              if (filterRole === 'director' || filterRole === 'admin') {
                return annAuthorRole === 'director' || annAuthorRole === 'admin';
              }
              if (filterRole === 'hod' || filterRole === 'head_of_department') {
                return annAuthorRole === 'hod' || annAuthorRole === 'head_of_department' || annAuthorRole === 'head of department';
              }
              return annAuthorRole === filterRole;
            });
            if (!matchesRole) {
              return;
            }
          }
          matched.push(ann);
        }
      });
    }

    // 5. Sort newest first
    matched.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    // 6. Paginate results
    const total = matched.length;
    const paginated = matched.slice(offset, offset + parsedLimit);

    return {
      announcements: paginated,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total,
        totalPages: Math.ceil(total / parsedLimit) || 1,
        hasMore: offset + parsedLimit < total
      }
    };
  }

  /**
   * Specifically retrieves Director and HOD announcements for the dashboard,
   * enforcing server-side scoping and returning up to limit (default 4).
   *
   * @param {object} params
   * @param {string} params.callerUid - Authenticated user ID.
   * @param {number} [params.limit=4] - Max items to return.
   * @returns {Promise<{ announcements: Array<object>, pagination: object }>}
   */
  async getDashboardAnnouncements({ callerUid, limit = 4 }) {
    return this.getAnnouncementsForUser({
      callerUid,
      page: 1,
      limit,
      authorRoles: ['director', 'hod']
    });
  }

  /**
   * Retrieves a single announcement by ID, strictly enforcing that the caller
   * has authorized scope to view it.
   *
   * @param {object} params
   * @param {string} params.announcementId - Announcement doc ID.
   * @param {string} params.callerUid - Authenticated user ID.
   * @returns {Promise<object>} The announcement if in-scope.
   */
  async getAnnouncementById({ announcementId, callerUid }) {
    if (!announcementId || typeof announcementId !== 'string' || !announcementId.trim()) {
      const err = new Error('announcementId is required.');
      err.statusCode = 400;
      err.code = 'INVALID_ARGUMENT';
      throw err;
    }

    const profile = await this.getValidatedUserProfile(callerUid);
    const db = this.getDb();
    const docSnap = await db.collection('announcements').doc(announcementId.trim()).get();

    if (!docSnap.exists) {
      const err = new Error(`Announcement '${announcementId}' not found.`);
      err.statusCode = 404;
      err.code = 'ANNOUNCEMENT_NOT_FOUND';
      throw err;
    }

    const announcement = typeof docSnap.data === 'function' ? docSnap.data() : docSnap;
    announcement.id = docSnap.id;

    let allocations = [];
    if (profile.role === 'faculty') {
      allocations = await this.getTeacherActiveAllocations(callerUid);
    }

    const isAuthorized = this.isUserAuthorizedToRead(profile, announcement, allocations);
    if (!isAuthorized) {
      const err = new Error('Forbidden: You are not authorized to view this announcement.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN_SCOPE';
      throw err;
    }

    return announcement;
  }

  /**
   * Evaluates if a caller is authorized to read a specific announcement document.
   *
   * @param {object} profile - Caller's verified user profile.
   * @param {object} announcement - Stored announcement document.
   * @param {Array<object>} [teacherAllocations=[]] - Active allocations if caller is faculty.
   * @returns {boolean}
   */
  isUserAuthorizedToRead(profile, announcement, teacherAllocations = []) {
    if (!profile || !announcement) return false;

    // 1. Institution boundary: user must belong to the same institution
    if (!profile.institution || profile.institution !== announcement.institution) {
      return false;
    }

    const role = profile.role;
    const scopeType = announcement.scopeType;

    // 2. Director: sees all announcements within their authorized institution
    if (role === 'director') {
      return true;
    }

    // 2b. HOD: sees all announcements within their authorized institution and department
    if (role === 'hod') {
      if (scopeType === 'institution') return true;
      if (announcement.department && profile.department && isMatchingDepartment(profile.department, announcement.department)) {
        return true;
      }
      return false;
    }

    // 3. Institution-wide announcement: visible to all active users in that institution
    if (scopeType === 'institution') {
      return true;
    }

    // 4. Department-wide / Branch announcement:
    // Visible if user's department matches via canonical department alias (or teacher has active allocation in dept)
    if (scopeType === 'branch' || scopeType === 'department') {
      if (profile.department && announcement.department && isMatchingDepartment(profile.department, announcement.department)) {
        return true;
      }
      if (role === 'faculty' && teacherAllocations.length > 0) {
        return teacherAllocations.some(alloc => {
          if (alloc.authorized === false) return false;
          return alloc.department && announcement.department && isMatchingDepartment(alloc.department, announcement.department);
        });
      }
      return false;
    }

    // 5. Department + Year announcement:
    // Reaches all sections within that department and year
    if (scopeType === 'year') {
      if (role === 'student') {
        if (!profile.department || !announcement.department) return false;
        if (!isMatchingDepartment(profile.department, announcement.department)) return false;
        return isMatchingYear(profile.year, announcement.year);
      }

      if (role === 'faculty') {
        if (announcement.authorUid && announcement.authorUid === profile.uid) {
          return true;
        }
        if (profile.department && announcement.department && isMatchingDepartment(profile.department, announcement.department)) {
          if (profile.year && isMatchingYear(profile.year, announcement.year)) {
            return true;
          }
        }
        return teacherAllocations.some(alloc => {
          if (alloc.authorized === false) return false;
          const dMatch = !alloc.department || !announcement.department || isMatchingDepartment(alloc.department, announcement.department);
          const yMatch = !alloc.year || !announcement.year || isMatchingYear(alloc.year, announcement.year);
          return dMatch && yMatch;
        });
      }

      return false;
    }

    // 6. Section announcement:
    // Reaches only that exact section
    if (scopeType === 'section') {
      if (role === 'student') {
        // Students can ONLY read announcements matching their exact institution, branch, year, and section
        if (!profile.department || !announcement.department) return false;
        if (!isMatchingDepartment(profile.department, announcement.department)) return false;

        if (!isMatchingYear(profile.year, announcement.year)) return false;

        return isMatchingSection(profile.section, announcement.section);
      }

      if (role === 'faculty') {
        // Teachers see section announcements if they are the author OR allocated to that section
        if (announcement.authorUid && announcement.authorUid === profile.uid) {
          return true;
        }

        return teacherAllocations.some(alloc => {
          if (alloc.authorized === false) return false;
          const dMatch = !alloc.department || !announcement.department || isMatchingDepartment(alloc.department, announcement.department);
          const yMatch = !alloc.year || !announcement.year || isMatchingYear(alloc.year, announcement.year);
          const sMatch = !alloc.section || !announcement.section || isMatchingSection(alloc.section, announcement.section);
          return dMatch && yMatch && sMatch;
        });
      }
    }

    return false;
  }
}

/**
 * Evaluates whether a role string represents a Director or HOD.
 *
 * @param {string} role - User or author role string.
 * @returns {boolean}
 */
export function isDirectorOrHodRole(role) {
  if (!role || typeof role !== 'string') return false;
  const r = role.toLowerCase().trim();
  return r === 'director' || r === 'admin' || r === 'hod' || r === 'head_of_department' || r === 'head of department';
}

/**
 * Evaluates whether an announcement document was published by a Director or HOD.
 *
 * @param {object} announcement
 * @returns {boolean}
 */
export function isDirectorOrHodAnnouncement(announcement) {
  if (!announcement) return false;
  return isDirectorOrHodRole(announcement.authorRole);
}

export const announcementService = new AnnouncementService();
export default announcementService;
