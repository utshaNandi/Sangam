import crypto from 'node:crypto';
import { getAdminFirestore } from '../config/firebaseAdmin.js';
import { googleDriveService, isMatchingDepartment, isMatchingSection } from './googleDriveService.js';
import { isMatchingYear } from './announcementService.js';

/**
 * Formats the canonical Google Drive folder name for an academic subject.
 * Pattern: `[SUBJECT_CODE] Subject Name`, omitting code prefix when no code exists.
 *
 * @param {object} subject
 * @param {string} subject.name
 * @param {string} [subject.code]
 * @returns {string}
 */
export function formatSubjectFolderName(subject) {
  if (!subject) return '';
  const name = (subject.name || '').trim();
  const code = (subject.code || '').trim().toUpperCase();
  if (code) {
    return `[${code}] ${name}`.trim();
  }
  return name;
}

/**
 * SubjectService
 *
 * Manages academic curriculum subjects and teacher-subject assignments.
 *
 * Core Guarantees:
 * 1. Authority Verification: Only verified Directors/Admins may create or delete subjects,
 *    or assign teachers to subjects within their authorized institution.
 * 2. Academic Scope Uniqueness: Prevents duplicate subjects with same name or code
 *    within the same institution, department, and academic year.
 * 3. Safe Deletion: Prevents subject deletion if the subject is currently assigned to
 *    faculty or has associated study materials.
 * 4. Pre-allocation Verification: Assigning a teacher to a subject strictly requires
 *    an existing active class allocation in `teacher_allocations` for that academic scope.
 * 5. Compatible Data Model: Uses dedicated collections `subjects` and `teacher_subject_assignments`
 *    leaving `teacher_allocations` and client Firestore rules 100% backward compatible.
 * 6. Automated Drive Subfolder Sync: Automatically provisions private subject subfolders
 *    inside the teacher's 'Sangam Coursework' Drive root folder upon assignment, deduplicating
 *    and deferring safely if Drive is not yet connected.
 */
export class SubjectService {
  constructor() {
    this.customDb = null;
    this.customDriveService = null;
    this.subjectFolderLocks = new Map();
  }

  getDb() {
    if (this.customDb) {
      return this.customDb;
    }
    const db = getAdminFirestore();
    if (!db) {
      throw new Error('Database is unavailable. Subject operation failed closed.');
    }
    return db;
  }

  getDriveService() {
    return this.customDriveService || googleDriveService;
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
   * Test-only helper to inject a mock Drive service.
   * Strictly forbidden and fails closed in production.
   */
  setTestDriveService(mockDrive) {
    const isTestEnv = (process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true');
    if (!isTestEnv) {
      throw new Error('SECURITY VIOLATION: setTestDriveService can only be called in test environment.');
    }
    this.customDriveService = mockDrive;
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

    const userData = userSnap.data();
    const status = (userData.status || '').trim().toLowerCase();

    if (status === 'pending_approval' || status === 'inactive') {
      const err = new Error('Forbidden: Account is pending approval or inactive.');
      err.statusCode = 403;
      err.code = 'ACCOUNT_INACTIVE';
      throw err;
    }

    return {
      uid: userId.trim(),
      ...userData
    };
  }

  // ---------------------------------------------------------------------------
  // SUBJECT CRUD
  // ---------------------------------------------------------------------------

  /**
   * Creates a new academic subject.
   * Only accessible by authorized Directors or Admins.
   *
   * @param {object} params
   * @param {string} params.callerUid - Authenticated Director UID
   * @param {string} params.name - Subject display name (e.g. "Data Structures")
   * @param {string} [params.code] - Subject code (e.g. "CS301")
   * @param {string} params.department - Branch/Department name (e.g. "CSE AI")
   * @param {string} params.year - Academic year (e.g. "2nd Year")
   * @param {string} [params.institution] - Institution name (e.g. "UEMK")
   * @param {string} [params.description] - Optional subject description/syllabus
   * @returns {Promise<object>} Created subject record
   */
  async createSubject({
    callerUid,
    name,
    code = '',
    department,
    year,
    institution = null,
    description = ''
  }) {
    const caller = await this.getValidatedUserProfile(callerUid);
    const role = (caller.role || '').toLowerCase();

    if (role !== 'director' && role !== 'admin') {
      const err = new Error('Forbidden: Only Directors or Admins can create subjects.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN_ROLE';
      throw err;
    }

    const targetInstitution = (caller.institution || institution || 'UEMK').trim();

    // 1. Validate Subject Name
    if (!name || typeof name !== 'string' || !name.trim()) {
      const err = new Error('Subject name is required.');
      err.statusCode = 400;
      err.code = 'INVALID_SUBJECT_NAME';
      throw err;
    }
    const cleanName = name.trim();
    if (cleanName.length < 2 || cleanName.length > 100) {
      const err = new Error('Subject name must be between 2 and 100 characters.');
      err.statusCode = 400;
      err.code = 'INVALID_SUBJECT_NAME';
      throw err;
    }

    // 2. Validate Department
    if (!department || typeof department !== 'string' || !department.trim()) {
      const err = new Error('Department is required.');
      err.statusCode = 400;
      err.code = 'INVALID_DEPARTMENT';
      throw err;
    }
    const cleanDept = department.trim();

    // 3. Validate Year
    if (!year || typeof year !== 'string' || !year.trim()) {
      const err = new Error('Academic year is required.');
      err.statusCode = 400;
      err.code = 'INVALID_YEAR';
      throw err;
    }
    const cleanYear = year.trim();

    // 4. Sanitize Code
    const cleanCode = code && typeof code === 'string' && code.trim()
      ? code.trim().toUpperCase()
      : '';

    const db = this.getDb();

    // 5. Duplicate Check within identical academic scope
    const existingSnap = await db.collection('subjects')
      .where('institution', '==', targetInstitution)
      .get();

    const normalizedNewName = cleanName.toLowerCase();
    const isDuplicate = existingSnap.docs.some(doc => {
      const d = doc.data();
      const sameDept = isMatchingDepartment(d.department, cleanDept);
      const sameYear = isMatchingYear(d.year, cleanYear);
      if (!sameDept || !sameYear) return false;

      const sameName = (d.name || '').trim().toLowerCase() === normalizedNewName;
      const sameCode = cleanCode && d.code && String(d.code).trim().toUpperCase() === cleanCode;
      return sameName || sameCode;
    });

    if (isDuplicate) {
      const err = new Error(
        `A subject with name "${cleanName}"${cleanCode ? ` or code "${cleanCode}"` : ''} already exists in ${cleanDept} ${cleanYear}.`
      );
      err.statusCode = 409;
      err.code = 'SUBJECT_ALREADY_EXISTS';
      throw err;
    }

    const subjectId = `sub_${crypto.randomUUID ? crypto.randomUUID() : (Date.now() + '_' + crypto.randomBytes(4).toString('hex'))}`;
    const nowIso = new Date().toISOString();

    const subjectRecord = {
      id: subjectId,
      name: cleanName,
      code: cleanCode,
      institution: targetInstitution,
      department: cleanDept,
      year: cleanYear,
      description: typeof description === 'string' ? description.trim() : '',
      createdBy: callerUid,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    await db.collection('subjects').doc(subjectId).set(subjectRecord);
    return subjectRecord;
  }

  /**
   * Updates an existing academic subject's metadata.
   * Only accessible by authorized Directors or Admins.
   * Modifies: name, code, description.
   * Preserves: id, institution, department, year, createdBy, createdAt.
   *
   * @param {object} params
   * @param {string} params.callerUid - Authenticated Director UID
   * @param {string} params.subjectId - Target subject ID
   * @param {string} params.name - Updated subject name
   * @param {string} [params.code] - Updated subject code
   * @param {string} [params.description] - Updated syllabus description
   * @returns {Promise<object>} Updated subject record
   */
  async updateSubject({
    callerUid,
    subjectId,
    name,
    code,
    description
  }) {
    const caller = await this.getValidatedUserProfile(callerUid);
    const role = (caller.role || '').toLowerCase();

    if (role !== 'director' && role !== 'admin') {
      const err = new Error('Forbidden: Only Directors or Admins can edit subjects.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN_ROLE';
      throw err;
    }

    if (!subjectId || typeof subjectId !== 'string' || !subjectId.trim()) {
      const err = new Error('subjectId is required.');
      err.statusCode = 400;
      err.code = 'INVALID_ARGUMENT';
      throw err;
    }

    const cleanSubjectId = subjectId.trim();
    const db = this.getDb();

    // 1. Fetch current subject document
    const subjectSnap = await db.collection('subjects').doc(cleanSubjectId).get();
    if (!subjectSnap.exists) {
      const err = new Error(`Subject with ID '${cleanSubjectId}' not found.`);
      err.statusCode = 404;
      err.code = 'SUBJECT_NOT_FOUND';
      throw err;
    }

    const existingSubject = subjectSnap.data();

    // Scope / Institution Boundary Check
    if (caller.institution && existingSubject.institution && caller.institution !== existingSubject.institution) {
      const err = new Error('Forbidden: Cannot modify subject in another institution.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN_INSTITUTION';
      throw err;
    }

    // 2. Validate Name
    if (!name || typeof name !== 'string' || !name.trim()) {
      const err = new Error('Subject name is required.');
      err.statusCode = 400;
      err.code = 'INVALID_SUBJECT_NAME';
      throw err;
    }
    const cleanName = name.trim();
    if (cleanName.length < 2 || cleanName.length > 100) {
      const err = new Error('Subject name must be between 2 and 100 characters.');
      err.statusCode = 400;
      err.code = 'INVALID_SUBJECT_NAME';
      throw err;
    }

    // 3. Sanitize Code
    const cleanCode = code && typeof code === 'string' && code.trim()
      ? code.trim().toUpperCase()
      : (code === '' ? '' : (existingSubject.code || ''));

    // 4. Duplicate Check (excluding current subject itself)
    const allSubjectsSnap = await db.collection('subjects')
      .where('institution', '==', existingSubject.institution)
      .get();

    const normalizedNewName = cleanName.toLowerCase();
    const isDuplicate = allSubjectsSnap.docs.some(doc => {
      if (doc.id === cleanSubjectId) return false; // Exclude current subject
      const d = doc.data();
      const sameDept = isMatchingDepartment(d.department, existingSubject.department);
      const sameYear = isMatchingYear(d.year, existingSubject.year);
      if (!sameDept || !sameYear) return false;

      const sameName = (d.name || '').trim().toLowerCase() === normalizedNewName;
      const sameCode = cleanCode && d.code && String(d.code).trim().toUpperCase() === cleanCode;
      return sameName || sameCode;
    });

    if (isDuplicate) {
      const err = new Error(
        `A subject with name "${cleanName}"${cleanCode ? ` or code "${cleanCode}"` : ''} already exists in ${existingSubject.department} ${existingSubject.year}.`
      );
      err.statusCode = 409;
      err.code = 'SUBJECT_ALREADY_EXISTS';
      throw err;
    }

    const nowIso = new Date().toISOString();
    const cleanDesc = description !== undefined
      ? (typeof description === 'string' ? description.trim() : '')
      : (existingSubject.description || '');

    const updatedRecord = {
      ...existingSubject,
      name: cleanName,
      code: cleanCode,
      description: cleanDesc,
      updatedAt: nowIso,
      updatedBy: callerUid
    };

    await db.collection('subjects').doc(cleanSubjectId).set(updatedRecord);

    // If subject name or code changed, sync cached subjectName/subjectCode in teacher_subject_assignments & faculty_subject_folders
    if (existingSubject.name !== cleanName || existingSubject.code !== cleanCode) {
      const newFolderName = formatSubjectFolderName({ name: cleanName, code: cleanCode });

      try {
        const assignSnap = await db.collection('teacher_subject_assignments')
          .where('subjectId', '==', cleanSubjectId)
          .get();

        for (const doc of assignSnap.docs) {
          const aData = doc.data();
          await db.collection('teacher_subject_assignments').doc(doc.id).set({
            ...aData,
            subjectName: cleanName,
            subjectCode: cleanCode,
            driveFolderName: newFolderName,
            updatedAt: nowIso
          });
        }
      } catch (assignSyncErr) {
        console.warn('[SubjectService] Warning updating assignments cache:', assignSyncErr);
      }

      // Sync faculty_subject_folders and safely rename in Drive without duplicating folder ID
      try {
        const foldersSnap = await db.collection('faculty_subject_folders')
          .where('subjectId', '==', cleanSubjectId)
          .get();

        const driveService = this.getDriveService();

        for (const fDoc of foldersSnap.docs) {
          const fData = fDoc.data();
          if (fData.driveFolderId && fData.status !== 'revoked') {
            try {
              const accessToken = await driveService.getValidAccessToken(fData.teacherUid);
              if (accessToken) {
                await driveService.updateDriveFileName(fData.driveFolderId, newFolderName, accessToken);
              }
            } catch (renameDriveErr) {
              // Non-fatal if teacher is disconnected/offline; will sync on next active verification
              console.warn(`[SubjectService] Could not rename Drive folder ${fData.driveFolderId} in Drive:`, renameDriveErr.message);
            }
          }

          await db.collection('faculty_subject_folders').doc(fDoc.id).set({
            ...fData,
            subjectName: cleanName,
            subjectCode: cleanCode,
            driveFolderName: newFolderName,
            updatedAt: nowIso
          }, { merge: true });
        }
      } catch (folderSyncErr) {
        console.warn('[SubjectService] Warning syncing faculty subject folders:', folderSyncErr);
      }
    }

    return updatedRecord;
  }


  /**
   * Retrieves subjects filtered by academic scope and role permissions.
   *
   * @param {object} params
   * @param {string} params.callerUid - Authenticated user UID
   * @param {string} [params.department] - Optional department filter
   * @param {string} [params.year] - Optional academic year filter
   * @param {string} [params.institution] - Optional institution override
   * @returns {Promise<Array<object>>} List of subjects
   */
  async getSubjects({ callerUid, department, year, institution }) {
    const caller = await this.getValidatedUserProfile(callerUid);
    const role = (caller.role || '').toLowerCase();
    const targetInstitution = (caller.institution || institution || 'UEMK').trim();

    const db = this.getDb();
    const snapshot = await db.collection('subjects')
      .where('institution', '==', targetInstitution)
      .get();

    let subjects = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    // Apply role-based filtering
    if (role === 'student') {
      // Students can only see subjects matching their department and year
      subjects = subjects.filter(s => {
        const deptOk = isMatchingDepartment(caller.department, s.department);
        const yrOk = isMatchingYear(caller.year, s.year);
        return deptOk && yrOk;
      });
    } else if (role === 'faculty' || role === 'teacher') {
      // Teachers can filter by department or see all in their department/institution
      if (department) {
        subjects = subjects.filter(s => isMatchingDepartment(department, s.department));
      }
      if (year) {
        subjects = subjects.filter(s => isMatchingYear(year, s.year));
      }
    } else {
      // Director: filter by query params if provided
      if (department) {
        subjects = subjects.filter(s => isMatchingDepartment(department, s.department));
      }
      if (year) {
        subjects = subjects.filter(s => isMatchingYear(year, s.year));
      }
    }

    // Sort alphabetically by name
    subjects.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return subjects;
  }

  /**
   * Fetches single subject by ID.
   *
   * @param {object} params
   * @param {string} params.callerUid
   * @param {string} params.subjectId
   * @returns {Promise<object>}
   */
  async getSubjectById({ callerUid, subjectId }) {
    const caller = await this.getValidatedUserProfile(callerUid);
    if (!subjectId || typeof subjectId !== 'string' || !subjectId.trim()) {
      const err = new Error('subjectId is required.');
      err.statusCode = 400;
      err.code = 'INVALID_ARGUMENT';
      throw err;
    }

    const db = this.getDb();
    const docSnap = await db.collection('subjects').doc(subjectId.trim()).get();
    if (!docSnap.exists) {
      const err = new Error(`Subject with ID '${subjectId}' not found.`);
      err.statusCode = 404;
      err.code = 'SUBJECT_NOT_FOUND';
      throw err;
    }

    const subject = { id: docSnap.id, ...docSnap.data() };
    if (caller.institution && subject.institution && caller.institution !== subject.institution) {
      const err = new Error('Forbidden: Institution mismatch.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN_SCOPE';
      throw err;
    }

    return subject;
  }

  /**
   * Safely deletes a subject if it is not currently in use.
   * Prevents accidental deletion if:
   * 1. Faculty members are currently assigned to this subject.
   * 2. Study materials are attached to this subject.
   *
   * @param {object} params
   * @param {string} params.callerUid - Must be Director or Admin
   * @param {string} params.subjectId - Subject ID to delete
   * @returns {Promise<{ success: boolean, message: string }>}
   */
  async deleteSubject({ callerUid, subjectId }) {
    const caller = await this.getValidatedUserProfile(callerUid);
    const role = (caller.role || '').toLowerCase();

    if (role !== 'director' && role !== 'admin') {
      const err = new Error('Forbidden: Only Directors or Admins can delete subjects.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN_ROLE';
      throw err;
    }

    const subject = await this.getSubjectById({ callerUid, subjectId });
    const db = this.getDb();

    // 1. Dependency check: Active teacher-subject assignments
    const assignmentsSnap = await db.collection('teacher_subject_assignments')
      .where('subjectId', '==', subject.id)
      .where('status', '==', 'active')
      .get();

    if (!assignmentsSnap.empty) {
      const count = assignmentsSnap.size;
      const err = new Error(
        `Cannot delete subject "${subject.name}": It is currently assigned to ${count} faculty member(s). Please revoke the faculty assignments first.`
      );
      err.statusCode = 409;
      err.code = 'SUBJECT_IN_USE';
      throw err;
    }

    // 2. Dependency check: Associated study materials
    const materialsSnap = await db.collection('study_materials')
      .where('subjectId', '==', subject.id)
      .get();

    if (!materialsSnap.empty) {
      const count = materialsSnap.size;
      const err = new Error(
        `Cannot delete subject "${subject.name}": ${count} study material(s) are associated with this subject. Please delete or reassign the materials first.`
      );
      err.statusCode = 409;
      err.code = 'SUBJECT_IN_USE';
      throw err;
    }

    // Safe to delete
    await db.collection('subjects').doc(subject.id).delete();
    return {
      success: true,
      message: `Subject "${subject.name}" deleted successfully.`
    };
  }

  // ---------------------------------------------------------------------------
  // TEACHER-SUBJECT ASSIGNMENTS
  // ---------------------------------------------------------------------------

  /**
   * Assigns an authorized faculty member to teach a subject.
   * Verifies the Director's authority and strictly checks that the teacher has
   * an active, authorized allocation in `teacher_allocations` for that academic scope.
   *
   * @param {object} params
   * @param {string} params.callerUid - Must be Director
   * @param {string} params.teacherUid - Target faculty UID
   * @param {string} params.subjectId - Target subject ID
   * @param {string} [params.section] - Optional specific section (or null for all allocated sections)
   * @returns {Promise<object>} Created or existing assignment record
   */
  async assignTeacherToSubject({
    callerUid,
    teacherUid,
    subjectId,
    section = null
  }) {
    const caller = await this.getValidatedUserProfile(callerUid);
    const role = (caller.role || '').toLowerCase();

    if (role !== 'director' && role !== 'admin') {
      const err = new Error('Forbidden: Only Directors or Admins can assign faculty to subjects.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN_ROLE';
      throw err;
    }

    if (!teacherUid || typeof teacherUid !== 'string' || !teacherUid.trim()) {
      const err = new Error('teacherUid is required.');
      err.statusCode = 400;
      err.code = 'INVALID_ARGUMENT';
      throw err;
    }

    const cleanTeacherUid = teacherUid.trim();
    const subject = await this.getSubjectById({ callerUid, subjectId });
    const db = this.getDb();

    // Verify teacher exists and is active faculty
    const teacherSnap = await db.collection('users').doc(cleanTeacherUid).get();
    if (!teacherSnap.exists) {
      const err = new Error('Teacher profile not found.');
      err.statusCode = 404;
      err.code = 'TEACHER_NOT_FOUND';
      throw err;
    }

    const teacherData = teacherSnap.data();
    const teacherRole = (teacherData.role || '').toLowerCase();
    if (teacherRole !== 'faculty' && teacherRole !== 'teacher' && teacherRole !== 'director') {
      const err = new Error('Target user is not a faculty member.');
      err.statusCode = 400;
      err.code = 'INVALID_ROLE';
      throw err;
    }

    if (teacherData.status && teacherData.status !== 'active') {
      const err = new Error('Target faculty member account is not active.');
      err.statusCode = 400;
      err.code = 'ACCOUNT_INACTIVE';
      throw err;
    }

    // Authoritative Allocation Check:
    // Verify teacher has an authorized allocation in teacher_allocations matching this scope
    const allocsSnap = await db.collection('teacher_allocations')
      .where('teacherUid', '==', cleanTeacherUid)
      .get();

    const activeAllocations = allocsSnap.docs
      .map(d => d.data())
      .filter(a => a.authorized !== false);

    const cleanSection = section && typeof section === 'string' && section.trim()
      ? section.trim()
      : null;

    const hasMatchingAllocation = activeAllocations.some(alloc => {
      const instOk = !alloc.institution || alloc.institution === subject.institution;
      const deptOk = isMatchingDepartment(alloc.department, subject.department);
      const yrOk = isMatchingYear(alloc.year, subject.year);
      const secOk = !cleanSection || isMatchingSection(alloc.section, cleanSection);
      return instOk && deptOk && yrOk && secOk;
    });

    if (!hasMatchingAllocation) {
      const err = new Error(
        `Cannot assign subject: Faculty member lacks an authorized class allocation for ${subject.department} ${subject.year}${cleanSection ? ` (${cleanSection})` : ''}. Allocate the class in Academic Spaces first.`
      );
      err.statusCode = 403;
      err.code = 'ALLOCATION_REQUIRED';
      throw err;
    }

    // Idempotent duplicate check
    const cleanSecId = cleanSection ? cleanSection.replace(/[^a-zA-Z0-9]/g, '_') : 'all';
    const assignmentId = `tsa_${cleanTeacherUid}_${subject.id}_${cleanSecId}`;

    const existingAssocSnap = await db.collection('teacher_subject_assignments').doc(assignmentId).get();
    if (existingAssocSnap.exists && existingAssocSnap.data()?.status === 'active') {
      const existingData = existingAssocSnap.data();
      // If assignment exists but folder was deferred, attempt provisioning if Drive is now connected
      if (!existingData.driveFolderId && existingData.driveFolderStatus === 'deferred') {
        try {
          const folderRes = await this.getOrCreateSubjectFolder({
            teacherUid: cleanTeacherUid,
            subjectId: subject.id,
            callerUid,
            allowPreAssignment: true
          });
          if (folderRes && folderRes.status === 'active') {
            const updatedAssoc = {
              ...existingData,
              driveFolderId: folderRes.driveFolderId,
              driveFolderName: folderRes.driveFolderName,
              driveFolderStatus: 'active',
              updatedAt: new Date().toISOString()
            };
            await db.collection('teacher_subject_assignments').doc(assignmentId).set(updatedAssoc, { merge: true });
            return {
              isExisting: true,
              assignment: { id: existingAssocSnap.id, ...updatedAssoc },
              folder: folderRes
            };
          }
        } catch (provErr) {
          console.warn('[SubjectService] Re-provisioning attempt warning:', provErr.message);
        }
      }

      return {
        isExisting: true,
        assignment: { id: existingAssocSnap.id, ...existingData }
      };
    }

    const nowIso = new Date().toISOString();
    const assignmentRecord = {
      id: assignmentId,
      teacherUid: cleanTeacherUid,
      teacherName: teacherData.name || (teacherData.email ? teacherData.email.split('@')[0] : 'Faculty'),
      teacherEmail: teacherData.email || '',
      subjectId: subject.id,
      subjectName: subject.name,
      subjectCode: subject.code || '',
      institution: subject.institution,
      department: subject.department,
      year: subject.year,
      section: cleanSection,
      scope: cleanSection ? 'section' : 'all',
      assignedBy: callerUid,
      assignedAt: nowIso,
      status: 'active',
      driveFolderStatus: 'pending'
    };

    await db.collection('teacher_subject_assignments').doc(assignmentId).set(assignmentRecord);

    // Attempt Google Drive subject subfolder provisioning
    // If Drive is not connected, provisioning is deferred safely without failing the assignment.
    let folderResult = null;
    try {
      folderResult = await this.getOrCreateSubjectFolder({
        teacherUid: cleanTeacherUid,
        subjectId: subject.id,
        callerUid,
        allowPreAssignment: true
      });
    } catch (driveErr) {
      console.warn('[SubjectService] Drive provisioning error during assignment:', driveErr.message);
      folderResult = {
        status: 'failed',
        error: driveErr.message
      };
    }

    if (folderResult && folderResult.status === 'active') {
      assignmentRecord.driveFolderId = folderResult.driveFolderId;
      assignmentRecord.driveFolderName = folderResult.driveFolderName;
      assignmentRecord.driveFolderStatus = 'active';
    } else if (folderResult && folderResult.status === 'deferred') {
      assignmentRecord.driveFolderId = null;
      assignmentRecord.driveFolderStatus = 'deferred';
      assignmentRecord.driveFolderReason = folderResult.reason || 'DRIVE_NOT_CONNECTED';
    } else {
      assignmentRecord.driveFolderId = null;
      assignmentRecord.driveFolderStatus = 'failed';
      assignmentRecord.driveFolderError = folderResult?.error || 'Unknown provisioning failure';
    }

    await db.collection('teacher_subject_assignments').doc(assignmentId).set(assignmentRecord, { merge: true });

    return {
      isExisting: false,
      assignment: assignmentRecord,
      folder: folderResult
    };
  }

  /**
   * Retrieves teacher-subject assignments with role-based scoping.
   *
   * @param {object} params
   * @param {string} params.callerUid
   * @param {string} [params.teacherUid]
   * @param {string} [params.subjectId]
   * @param {string} [params.department]
   * @param {string} [params.year]
   * @param {string} [params.section]
   * @returns {Promise<Array<object>>}
   */
  async getTeacherSubjectAssignments({
    callerUid,
    teacherUid,
    subjectId,
    department,
    year,
    section
  }) {
    const caller = await this.getValidatedUserProfile(callerUid);
    const role = (caller.role || '').toLowerCase();
    const db = this.getDb();

    let queryRef = db.collection('teacher_subject_assignments')
      .where('status', '==', 'active');

    if (caller.institution) {
      queryRef = queryRef.where('institution', '==', caller.institution);
    }

    if (teacherUid) {
      queryRef = queryRef.where('teacherUid', '==', teacherUid.trim());
    } else if (role === 'faculty' || role === 'teacher') {
      // By default, teachers query their own assignments unless an authorized department is specified
      if (!department) {
        queryRef = queryRef.where('teacherUid', '==', callerUid);
      }
    }

    if (subjectId) {
      queryRef = queryRef.where('subjectId', '==', subjectId.trim());
    }

    const snapshot = await queryRef.get();
    let assignments = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    // In-memory canonical filtering
    if (department) {
      assignments = assignments.filter(a => isMatchingDepartment(a.department, department));
    }
    if (year) {
      assignments = assignments.filter(a => isMatchingYear(a.year, year));
    }
    if (section) {
      assignments = assignments.filter(a => !a.section || isMatchingSection(a.section, section));
    }

    return assignments;
  }

  /**
   * Revokes/deletes a teacher-subject assignment.
   *
   * @param {object} params
   * @param {string} params.callerUid - Must be Director
   * @param {string} params.assignmentId - Assignment ID to revoke
   * @returns {Promise<{ success: boolean, message: string }>}
   */
  async deleteTeacherSubjectAssignment({ callerUid, assignmentId }) {
    const caller = await this.getValidatedUserProfile(callerUid);
    const role = (caller.role || '').toLowerCase();

    if (role !== 'director' && role !== 'admin') {
      const err = new Error('Forbidden: Only Directors or Admins can revoke subject assignments.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN_ROLE';
      throw err;
    }

    if (!assignmentId || typeof assignmentId !== 'string') {
      const err = new Error('assignmentId is required.');
      err.statusCode = 400;
      err.code = 'INVALID_ARGUMENT';
      throw err;
    }

    const db = this.getDb();
    const docRef = db.collection('teacher_subject_assignments').doc(assignmentId.trim());
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      const err = new Error(`Teacher-subject assignment '${assignmentId}' not found.`);
      err.statusCode = 404;
      err.code = 'ASSIGNMENT_NOT_FOUND';
      throw err;
    }

    const assignmentData = docSnap.data();
    await docRef.delete();

    // Check if the teacher has any remaining active assignments for this subject
    if (assignmentData && assignmentData.teacherUid && assignmentData.subjectId) {
      try {
        const remainingSnap = await db.collection('teacher_subject_assignments')
          .where('teacherUid', '==', assignmentData.teacherUid)
          .where('subjectId', '==', assignmentData.subjectId)
          .where('status', '==', 'active')
          .get();

        if (remainingSnap.empty) {
          // No remaining active assignments: mark folder mapping as revoked.
          // CRITICAL: We NEVER delete the Drive folder, files, or historical publication records.
          const mappingDocId = `${assignmentData.teacherUid}_${assignmentData.subjectId}`;
          const mappingRef = db.collection('faculty_subject_folders').doc(mappingDocId);
          const mappingSnap = await mappingRef.get();
          if (mappingSnap.exists) {
            await mappingRef.set({
              ...mappingSnap.data(),
              status: 'revoked',
              revokedAt: new Date().toISOString()
            }, { merge: true });
          }
        }
      } catch (revSyncErr) {
        console.warn('[SubjectService] Warning marking folder mapping as revoked:', revSyncErr.message);
      }
    }

    return {
      success: true,
      message: 'Teacher subject assignment revoked successfully.'
    };
  }

  // ---------------------------------------------------------------------------
  // GOOGLE DRIVE SUBJECT FOLDER PROVISIONING & SYNC
  // ---------------------------------------------------------------------------

  /**
   * Idempotently retrieves, verifies, or provisions the teacher's dedicated Google Drive folder
   * for an academic subject.
   *
   * Guarantees:
   * 1. Concurrency Safety: In-flight deduplication via `this.subjectFolderLocks` prevents duplicate folders.
   * 2. Active Assignment: Requires active assignment in `teacher_subject_assignments` unless `allowPreAssignment: true`.
   * 3. Deferred Provisioning: If teacher has not connected Google Drive, returns status 'deferred' without error.
   * 4. Deduplication:
   *    a. Checks stored mapping in `faculty_subject_folders` and verifies folder still exists in Drive and is not trashed.
   *    b. If mapping is missing or trashed, searches root folder for matching existing folder before creating one.
   *    c. Only creates a new subfolder if no matching non-trashed folder exists.
   * 5. Rename Safety: Preserves existing folder ID and updates Drive folder name if subject was renamed.
   *
   * @param {object} params
   * @param {string} params.teacherUid - Target faculty UID
   * @param {string} params.subjectId - Target subject ID
   * @param {string} [params.callerUid] - Optional caller UID
   * @param {string} [params.encryptionKey] - Optional test encryption key override
   * @param {boolean} [params.allowPreAssignment=false] - Allow provisioning during assignment creation before record is committed
   * @returns {Promise<object>} Folder provisioning result
   */
  async getOrCreateSubjectFolder({
    teacherUid,
    subjectId,
    callerUid = null,
    encryptionKey = null,
    allowPreAssignment = false
  }) {
    if (!teacherUid || typeof teacherUid !== 'string' || !teacherUid.trim()) {
      throw new Error('teacherUid is required.');
    }
    if (!subjectId || typeof subjectId !== 'string' || !subjectId.trim()) {
      throw new Error('subjectId is required.');
    }

    const cleanTeacherUid = teacherUid.trim();
    const cleanSubjectId = subjectId.trim();
    const lockKey = `${cleanTeacherUid}_${cleanSubjectId}`;

    if (this.subjectFolderLocks.has(lockKey)) {
      return await this.subjectFolderLocks.get(lockKey);
    }

    const task = (async () => {
      const db = this.getDb();
      const driveService = this.getDriveService();

      // 1. Fetch Subject
      const subjectSnap = await db.collection('subjects').doc(cleanSubjectId).get();
      if (!subjectSnap.exists) {
        const err = new Error(`Subject with ID '${cleanSubjectId}' not found.`);
        err.statusCode = 404;
        err.code = 'SUBJECT_NOT_FOUND';
        throw err;
      }
      const subject = { id: subjectSnap.id, ...subjectSnap.data() };

      // 2. Active assignment verification
      // Folders must never be provisioned for inactive or revoked assignments
      if (!allowPreAssignment) {
        const assignmentsSnap = await db.collection('teacher_subject_assignments')
          .where('teacherUid', '==', cleanTeacherUid)
          .where('subjectId', '==', cleanSubjectId)
          .where('status', '==', 'active')
          .get();

        if (assignmentsSnap.empty) {
          const err = new Error('Cannot provision Drive folder: Faculty member is not actively assigned to this subject.');
          err.statusCode = 403;
          err.code = 'ASSIGNMENT_NOT_ACTIVE';
          throw err;
        }
      }

      // 3. Check teacher's Google Drive integration status
      // If Drive is not connected, handle provisioning as deferred without throwing
      let integration = null;
      if (typeof driveService.getIntegration === 'function') {
        integration = await driveService.getIntegration(cleanTeacherUid);
      }

      if (!integration || integration.status === 'disconnected' || !integration.encryptedAccessToken) {
        return {
          status: 'deferred',
          reason: 'DRIVE_NOT_CONNECTED',
          driveFolderId: null,
          message: 'Teacher has not connected Google Drive. Subject folder provisioning deferred.'
        };
      }

      let accessToken;
      try {
        accessToken = await driveService.getValidAccessToken(cleanTeacherUid, encryptionKey);
      } catch (tokenErr) {
        return {
          status: 'deferred',
          reason: 'DRIVE_AUTH_FAILED',
          driveFolderId: null,
          error: tokenErr.message
        };
      }

      // 4. Ensure Teacher's root 'Sangam Coursework' folder exists
      const rootFolder = await driveService.getOrCreateCourseworkFolder(cleanTeacherUid, encryptionKey);
      if (!rootFolder || !rootFolder.id) {
        throw new Error('Failed to retrieve or create teacher root coursework folder in Google Drive.');
      }
      const rootFolderId = rootFolder.id;

      const expectedFolderName = formatSubjectFolderName(subject);
      const mappingDocId = `${cleanTeacherUid}_${cleanSubjectId}`;
      const mappingRef = db.collection('faculty_subject_folders').doc(mappingDocId);
      const mappingSnap = await mappingRef.get();
      const nowIso = new Date().toISOString();

      // 5. Check stored mapping in Firestore
      if (mappingSnap.exists) {
        const stored = mappingSnap.data();
        if (stored.driveFolderId && stored.status !== 'revoked') {
          // Verify folder still exists in Google Drive and is not trashed
          let meta = null;
          try {
            meta = await driveService.getFileMetadata(stored.driveFolderId, accessToken);
          } catch (metaErr) {
            console.warn('[SubjectService] Warning fetching folder metadata:', metaErr.message);
          }

          if (meta && !meta.trashed) {
            // Folder exists and is active!
            // Check if name needs synchronizing (e.g. if subject was renamed)
            if (meta.name !== expectedFolderName) {
              try {
                await driveService.updateDriveFileName(stored.driveFolderId, expectedFolderName, accessToken);
              } catch (renameErr) {
                console.warn('[SubjectService] Warning syncing Drive folder name:', renameErr.message);
              }
            }

            const updatedDoc = {
              ...stored,
              driveFolderName: expectedFolderName,
              subjectName: subject.name,
              subjectCode: subject.code || '',
              status: 'active',
              updatedAt: nowIso
            };
            await mappingRef.set(updatedDoc, { merge: true });

            return {
              status: 'active',
              isExisting: true,
              driveFolderId: stored.driveFolderId,
              driveFolderName: expectedFolderName,
              rootFolderId: stored.rootFolderId || rootFolderId
            };
          }
          // Folder was trashed or missing in Drive: fall through to re-discover or re-create
        }
      }

      // 6. Search teacher's root folder for an existing non-trashed folder by exact name
      const existingDriveFolder = await driveService.findFolderByName(rootFolderId, expectedFolderName, accessToken);
      if (existingDriveFolder && existingDriveFolder.id) {
        // Discovered existing folder in Drive: map to it instead of creating a duplicate!
        const mappingRecord = {
          id: mappingDocId,
          teacherUid: cleanTeacherUid,
          subjectId: subject.id,
          subjectName: subject.name,
          subjectCode: subject.code || '',
          institution: subject.institution,
          department: subject.department,
          year: subject.year,
          driveFolderId: existingDriveFolder.id,
          driveFolderName: expectedFolderName,
          rootFolderId: rootFolderId,
          status: 'active',
          createdAt: mappingSnap.exists ? (mappingSnap.data().createdAt || nowIso) : nowIso,
          updatedAt: nowIso
        };
        await mappingRef.set(mappingRecord, { merge: true });

        return {
          status: 'active',
          isExisting: true,
          driveFolderId: existingDriveFolder.id,
          driveFolderName: expectedFolderName,
          rootFolderId: rootFolderId
        };
      }

      // 7. No existing folder found: create new subfolder in Drive
      const newFolder = await driveService.createSubfolder(rootFolderId, expectedFolderName, accessToken);
      const newMappingRecord = {
        id: mappingDocId,
        teacherUid: cleanTeacherUid,
        subjectId: subject.id,
        subjectName: subject.name,
        subjectCode: subject.code || '',
        institution: subject.institution,
        department: subject.department,
        year: subject.year,
        driveFolderId: newFolder.id,
        driveFolderName: expectedFolderName,
        rootFolderId: rootFolderId,
        status: 'active',
        createdAt: nowIso,
        updatedAt: nowIso
      };
      await mappingRef.set(newMappingRecord);

      return {
        status: 'active',
        isExisting: false,
        driveFolderId: newFolder.id,
        driveFolderName: expectedFolderName,
        rootFolderId: rootFolderId
      };
    })();

    this.subjectFolderLocks.set(lockKey, task);
    try {
      return await task;
    } finally {
      this.subjectFolderLocks.delete(lockKey);
    }
  }

  /**
   * Synchronizes and provisions Drive folders for all currently active subjects
   * assigned to a teacher. Useful when a teacher connects Google Drive or logs in.
   *
   * @param {string} teacherUid - Faculty UID.
   * @param {string} [encryptionKey=null] - Optional encryption key override.
   * @returns {Promise<{ provisioned: Array<object>, deferred: Array<object>, errors: Array<object> }>}
   */
  async ensureTeacherSubjectFolders(teacherUid, encryptionKey = null) {
    if (!teacherUid || typeof teacherUid !== 'string' || !teacherUid.trim()) {
      throw new Error('teacherUid is required.');
    }
    const cleanTeacherUid = teacherUid.trim();
    const db = this.getDb();

    const assignmentsSnap = await db.collection('teacher_subject_assignments')
      .where('teacherUid', '==', cleanTeacherUid)
      .where('status', '==', 'active')
      .get();

    const distinctSubjectIds = [...new Set(assignmentsSnap.docs.map(d => d.data().subjectId))];
    const results = {
      provisioned: [],
      deferred: [],
      errors: []
    };

    for (const subjectId of distinctSubjectIds) {
      try {
        const folderRes = await this.getOrCreateSubjectFolder({
          teacherUid: cleanTeacherUid,
          subjectId,
          encryptionKey
        });
        if (folderRes && folderRes.status === 'active') {
          results.provisioned.push({ subjectId, ...folderRes });
        } else {
          results.deferred.push({ subjectId, ...folderRes });
        }
      } catch (err) {
        results.errors.push({ subjectId, error: err.message });
      }
    }

    return results;
  }

  /**
   * Verifies that a teacher has an active assignment and authorization for a subject folder.
   * Guarantees that a stored folder ID does not grant authorization after assignment revocation.
   *
   * @param {string} teacherUid
   * @param {string} subjectId
   * @returns {Promise<boolean>}
   */
  async verifyTeacherSubjectAuthorization(teacherUid, subjectId) {
    if (!teacherUid || !subjectId) return false;
    const db = this.getDb();
    const assignmentsSnap = await db.collection('teacher_subject_assignments')
      .where('teacherUid', '==', teacherUid.trim())
      .where('subjectId', '==', subjectId.trim())
      .where('status', '==', 'active')
      .get();
    return !assignmentsSnap.empty;
  }

  /**
   * Retrieves all subjects assigned to the authenticated faculty member.
   *
   * @param {string} teacherUid - Authenticated faculty UID
   * @returns {Promise<Array<object>>}
   */
  async getMyAssignedSubjects(teacherUid) {
    const caller = await this.getValidatedUserProfile(teacherUid);
    const db = this.getDb();

    const snapshot = await db.collection('teacher_subject_assignments')
      .where('teacherUid', '==', caller.uid)
      .where('status', '==', 'active')
      .get();

    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  }
}

export const subjectService = new SubjectService();
export default subjectService;
