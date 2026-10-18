import crypto from 'node:crypto';
import { getAdminFirestore } from '../config/firebaseAdmin.js';
import {
  googleDriveService,
  isMatchingDepartment,
  isMatchingSection
} from './googleDriveService.js';
import { isMatchingYear } from './announcementService.js';
import { subjectService } from './subjectService.js';

export const VALID_STUDY_MATERIAL_CATEGORIES = [
  'Lecture Notes',
  'Lab Manual',
  'Question Bank',
  'Problem Set',
  'Reference Book',
  'Syllabus',
  'Other'
];

/**
 * StudyMaterialService
 *
 * Implements authoritative backend storage, Google Drive integration,
 * publication controls, and role-based academic scoping for Sangam study materials.
 *
 * Core Guarantees:
 * 1. Isolated Drive Storage: Materials are uploaded directly to the authenticated teacher's
 *    connected Google Drive ("Sangam Coursework" folder) with zero public sharing links.
 * 2. Scope Enforcement:
 *    - Year-wide materials are accessible to all students within matching institution,
 *      department, and academic year without requiring section matching.
 *    - Section-specific materials strictly enforce matching section.
 * 3. Immediate Publication / Unpublication:
 *    - Students can ONLY list and download materials where `isPublished === true`.
 *    - Setting `isPublished: false` immediately blocks student access across both listing and downloads.
 * 4. Safe Deletion: Teachers may only delete materials they authored; Directors may delete
 *    within their institution.
 * 5. Download Streaming: Client downloads are securely proxied through the Express backend
 *    using the owning teacher's decrypted access token.
 */
export class StudyMaterialService {
  constructor() {
    this.customDb = null;
    this.customDriveService = null;
  }

  getDb() {
    if (this.customDb) {
      return this.customDb;
    }
    const db = getAdminFirestore();
    if (!db) {
      throw new Error('Database is unavailable. Study material operation failed closed.');
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
   * Test-only helper to inject a mock Google Drive service.
   * Strictly forbidden and fails closed in production.
   */
  setCustomDriveService(mockDrive) {
    const isTestEnv = (process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true');
    if (!isTestEnv) {
      throw new Error('SECURITY VIOLATION: setCustomDriveService can only be called in test environment.');
    }
    this.customDriveService = mockDrive;
  }

  /**
   * Loads and validates user profile from Firestore.
   *
   * @param {string} userId
   * @returns {Promise<object>}
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

  /**
   * Uploads a study-material file to the authenticated teacher's connected Google Drive
   * and persists metadata in `study_materials`.
   *
   * @param {object} params
   * @param {string} params.callerUid - Authenticated teacher UID
   * @param {string} [params.callerEmail] - Authenticated teacher email
   * @param {Buffer} params.fileBuffer - File binary buffer
   * @param {string} params.originalFileName - Original file name
   * @param {number} params.fileSize - File size in bytes
   * @param {string} params.mimeType - File MIME type
   * @param {object} params.metadata - Metadata (title, subjectId, department, year, scope, section, category, description, isPublished)
   * @param {string} [params.encryptionKey=null] - Optional encryption key override
   * @returns {Promise<object>} Created study material metadata record
   */
  async uploadStudyMaterial({
    callerUid,
    callerEmail = null,
    fileBuffer,
    originalFileName,
    fileSize,
    mimeType = 'application/pdf',
    metadata = {},
    encryptionKey = null
  }) {
    // 1. Authoritative Teacher Role & Profile Check
    const userData = await this.getValidatedUserProfile(callerUid);
    const role = (userData.role || '').toLowerCase();

    if (role !== 'faculty' && role !== 'teacher' && role !== 'director') {
      const err = new Error('Forbidden: Only faculty members or authorized directors can upload study materials.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN_ROLE';
      throw err;
    }

    // 2. Validate File Buffer
    if (!fileBuffer || !Buffer.isBuffer(fileBuffer) || fileBuffer.length === 0) {
      const err = new Error('A valid, non-empty file buffer is required.');
      err.statusCode = 400;
      err.code = 'INVALID_FILE';
      throw err;
    }

    // 3. Validate Required Metadata Fields
    const title = (metadata.title || '').trim();
    if (!title || title.length < 2 || title.length > 150) {
      const err = new Error('Title is required and must be between 2 and 150 characters.');
      err.statusCode = 400;
      err.code = 'INVALID_TITLE';
      throw err;
    }

    const subjectId = (metadata.subjectId || '').trim();
    if (!subjectId) {
      const err = new Error('subjectId is required.');
      err.statusCode = 400;
      err.code = 'MISSING_SUBJECT';
      throw err;
    }

    const department = (metadata.department || '').trim();
    if (!department) {
      const err = new Error('department is required.');
      err.statusCode = 400;
      err.code = 'MISSING_DEPARTMENT';
      throw err;
    }

    const year = (metadata.year || '').trim();
    if (!year) {
      const err = new Error('year is required.');
      err.statusCode = 400;
      err.code = 'MISSING_YEAR';
      throw err;
    }

    const rawScope = (metadata.scope || '').trim().toLowerCase();
    const isSectionScope = rawScope === 'section' || rawScope === 'section-specific';
    const scope = isSectionScope ? 'section' : 'year';
    const isYearWide = !isSectionScope;

    const section = (metadata.section || '').trim();
    if (isSectionScope && !section) {
      const err = new Error('section is required when study material scope is section-specific.');
      err.statusCode = 400;
      err.code = 'MISSING_SECTION';
      throw err;
    }

    const category = (metadata.category || 'Lecture Notes').trim();
    const description = (metadata.description || '').trim();
    const isPublished = metadata.isPublished === undefined || metadata.isPublished === null
      ? true
      : (metadata.isPublished === true || metadata.isPublished === 'true');

    // 4. Verify Subject exists and matches academic scope
    const db = this.getDb();
    const subjectSnap = await db.collection('subjects').doc(subjectId).get();
    if (!subjectSnap.exists) {
      const err = new Error(`Subject with ID '${subjectId}' not found.`);
      err.statusCode = 404;
      err.code = 'SUBJECT_NOT_FOUND';
      throw err;
    }

    const subjectData = subjectSnap.data();
    if (
      !isMatchingDepartment(subjectData.department, department) ||
      !isMatchingYear(subjectData.year, year)
    ) {
      const err = new Error(
        `Subject '${subjectData.name}' (${subjectData.department} ${subjectData.year}) does not match the material scope (${department} ${year}).`
      );
      err.statusCode = 400;
      err.code = 'SUBJECT_SCOPE_MISMATCH';
      throw err;
    }

    // 5. Verify Teacher's Class Allocation (unless Director)
    if (role === 'faculty' || role === 'teacher') {
      const allocsSnap = await db.collection('teacher_allocations')
        .where('teacherUid', '==', callerUid)
        .get();

      const activeAllocations = allocsSnap.docs
        .map(d => d.data())
        .filter(a => a.authorized !== false);

      const hasClassAllocation = activeAllocations.some(alloc => {
        const instOk = !alloc.institution || alloc.institution === subjectData.institution;
        const deptOk = isMatchingDepartment(alloc.department, department);
        const yrOk = isMatchingYear(alloc.year, year);
        const secOk = !isSectionScope || !alloc.section || isMatchingSection(alloc.section, section);
        return instOk && deptOk && yrOk && secOk;
      });

      if (!hasClassAllocation) {
        const err = new Error(
          `Forbidden: You do not have an authorized class allocation for ${department} ${year}${isSectionScope ? ` (${section})` : ''}.`
        );
        err.statusCode = 403;
        err.code = 'FORBIDDEN_SCOPE';
        throw err;
      }
    }

    // 6. Verify Google Drive Integration & Retrieve Access Token
    const driveService = this.getDriveService();
    const integration = await driveService.getIntegration(callerUid);
    if (!integration || integration.status !== 'connected') {
      const err = new Error('Google Drive is not connected. Please connect your Google Drive account in Settings before uploading study materials.');
      err.statusCode = 424;
      err.code = 'DRIVE_NOT_CONNECTED';
      throw err;
    }

    const folder = await driveService.getOrCreateCourseworkFolder(callerUid, encryptionKey);
    const validAccessToken = await driveService.getValidAccessToken(callerUid, encryptionKey);

    // 7. Perform Private Upload to Teacher's Google Drive
    const cleanExt = (originalFileName || '').split('.').pop() || 'pdf';
    const sanitizedTitle = title.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 35);
    const safeUploadName = `StudyMaterial_${sanitizedTitle}_${Date.now()}.${cleanExt}`;

    const uploadResult = await driveService.uploadFileToFolder(
      folder.id,
      safeUploadName,
      mimeType,
      fileBuffer,
      validAccessToken,
      {
        description: description || `Study Material: ${title} (${department} ${year}${isSectionScope ? ' ' + section : ''})`
      }
    );

    const driveFileId = uploadResult.id;
    const driveFileName = uploadResult.name || safeUploadName;

    // 8. Persist Study Material Document in Firestore
    const materialId = `mat_${crypto.randomUUID ? crypto.randomUUID() : (Date.now() + '_' + crypto.randomBytes(4).toString('hex'))}`;
    const nowIso = new Date().toISOString();

    const materialRecord = {
      id: materialId,
      driveFileId,
      driveFileName,
      fileName: originalFileName || safeUploadName,
      mimeType: mimeType || 'application/pdf',
      fileSizeBytes: fileSize || fileBuffer.length,
      teacherUid: callerUid,
      teacherName: userData.name || (callerEmail ? callerEmail.split('@')[0] : 'Faculty'),
      teacherEmail: callerEmail || userData.email || '',
      subjectId: subjectData.id || subjectId,
      subjectName: subjectData.name || '',
      subjectCode: subjectData.code || '',
      institution: userData.institution || subjectData.institution || 'UEMK',
      department,
      year,
      scope,
      isYearWide,
      section: isSectionScope ? section : null,
      category,
      title,
      description,
      isPublished,
      publishedAt: isPublished ? nowIso : null,
      storageProvider: 'google',
      createdAt: nowIso,
      updatedAt: nowIso
    };

    await db.collection('study_materials').doc(materialId).set(materialRecord);
    return materialRecord;
  }

  /**
   * Retrieves study materials for the authenticated user based on role and academic scope.
   *
   * @param {object} params
   * @param {string} params.callerUid
   * @param {string} [params.subjectId]
   * @param {string} [params.department]
   * @param {string} [params.year]
   * @param {string} [params.section]
   * @param {string} [params.category]
   * @param {string} [params.scope]
   * @returns {Promise<Array<object>>} List of accessible study materials
   */
  async getStudyMaterialsForUser({
    callerUid,
    subjectId,
    department,
    year,
    section,
    category,
    scope
  }) {
    const caller = await this.getValidatedUserProfile(callerUid);
    const role = (caller.role || '').toLowerCase();
    const db = this.getDb();

    let queryRef = db.collection('study_materials');
    if (caller.institution) {
      queryRef = queryRef.where('institution', '==', caller.institution);
    }
    if (subjectId) {
      queryRef = queryRef.where('subjectId', '==', subjectId.trim());
    }
    if (category && category !== 'All') {
      queryRef = queryRef.where('category', '==', category.trim());
    }

    const snapshot = await queryRef.get();
    let materials = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    // Apply strict server-side scoping by caller role
    if (role === 'student') {
      // 1. Students ONLY see published materials
      // 2. Materials MUST match student's institution, department, and academic year
      // 3. Section rules:
      //    - Year-wide materials (scope === 'year' or isYearWide === true): Accessible to all sections in that year!
      //    - Section-specific materials: Strictly require matching section.
      materials = materials.filter(m => {
        if (!m.isPublished) return false;
        if (caller.institution && m.institution && caller.institution !== m.institution) return false;
        if (!isMatchingDepartment(caller.department, m.department)) return false;
        if (!isMatchingYear(caller.year, m.year)) return false;

        const isYearScoped = m.isYearWide === true || m.scope === 'year';
        if (isYearScoped) {
          return true;
        }

        // Section-specific check
        return isMatchingSection(caller.section, m.section);
      });
    } else if (role === 'faculty' || role === 'teacher') {
      // Teachers see:
      // 1. All materials they authored (published and unpublished).
      // 2. Published materials for their department.
      materials = materials.filter(m => {
        const isAuthor = m.teacherUid === callerUid;
        if (isAuthor) return true;

        if (!m.isPublished) return false;
        if (caller.institution && m.institution && caller.institution !== m.institution) return false;
        return isMatchingDepartment(caller.department, m.department);
      });

      // Apply optional query filters if requested
      if (department) {
        materials = materials.filter(m => isMatchingDepartment(m.department, department));
      }
      if (year) {
        materials = materials.filter(m => isMatchingYear(m.year, year));
      }
      if (section) {
        materials = materials.filter(m => m.isYearWide || isMatchingSection(m.section, section));
      }
    } else {
      // Director: Can view all materials in their authorized institution
      if (department) {
        materials = materials.filter(m => isMatchingDepartment(m.department, department));
      }
      if (year) {
        materials = materials.filter(m => isMatchingYear(m.year, year));
      }
      if (section) {
        materials = materials.filter(m => m.isYearWide || isMatchingSection(m.section, section));
      }
    }

    if (scope) {
      const isSec = scope.toLowerCase().includes('section');
      materials = materials.filter(m => (isSec ? m.scope === 'section' : m.scope === 'year'));
    }

    // Sort descending by creation timestamp
    materials.sort((a, b) => {
      const tA = new Date(a.createdAt || 0).getTime();
      const tB = new Date(b.createdAt || 0).getTime();
      return tB - tA;
    });

    return materials;
  }

  /**
   * Retrieves single study material metadata with access authorization.
   *
   * @param {object} params
   * @param {string} params.callerUid
   * @param {string} params.materialId
   * @returns {Promise<object>}
   */
  async getStudyMaterialById({ callerUid, materialId }) {
    const caller = await this.getValidatedUserProfile(callerUid);
    const role = (caller.role || '').toLowerCase();

    if (!materialId || typeof materialId !== 'string' || !materialId.trim()) {
      const err = new Error('materialId is required.');
      err.statusCode = 400;
      err.code = 'INVALID_ARGUMENT';
      throw err;
    }

    const db = this.getDb();
    const docSnap = await db.collection('study_materials').doc(materialId.trim()).get();
    if (!docSnap.exists) {
      const err = new Error(`Study material '${materialId}' not found.`);
      err.statusCode = 404;
      err.code = 'MATERIAL_NOT_FOUND';
      throw err;
    }

    const material = { id: docSnap.id, ...docSnap.data() };

    // Role-based access validation
    if (role === 'student') {
      if (!material.isPublished) {
        const err = new Error('Forbidden: This study material is not published.');
        err.statusCode = 403;
        err.code = 'MATERIAL_UNPUBLISHED';
        throw err;
      }
      if (caller.institution && material.institution && caller.institution !== material.institution) {
        const err = new Error('Forbidden: Institution mismatch.');
        err.statusCode = 403;
        err.code = 'FORBIDDEN_SCOPE';
        throw err;
      }
      if (!isMatchingDepartment(caller.department, material.department)) {
        const err = new Error('Forbidden: Department mismatch.');
        err.statusCode = 403;
        err.code = 'FORBIDDEN_SCOPE';
        throw err;
      }
      if (!isMatchingYear(caller.year, material.year)) {
        const err = new Error('Forbidden: Academic year mismatch.');
        err.statusCode = 403;
        err.code = 'FORBIDDEN_SCOPE';
        throw err;
      }
      if (!material.isYearWide && material.scope === 'section' && !isMatchingSection(caller.section, material.section)) {
        const err = new Error('Forbidden: Section mismatch.');
        err.statusCode = 403;
        err.code = 'FORBIDDEN_SCOPE';
        throw err;
      }
    } else if (role === 'faculty' || role === 'teacher') {
      if (material.teacherUid !== callerUid) {
        if (!material.isPublished) {
          const err = new Error('Forbidden: Study material is unpublished and not owned by you.');
          err.statusCode = 403;
          err.code = 'MATERIAL_UNPUBLISHED';
          throw err;
        }
        if (caller.institution && material.institution && caller.institution !== material.institution) {
          const err = new Error('Forbidden: Institution mismatch.');
          err.statusCode = 403;
          err.code = 'FORBIDDEN_SCOPE';
          throw err;
        }
      }
    } else {
      // Director: Institution check
      if (caller.institution && material.institution && caller.institution !== material.institution) {
        const err = new Error('Forbidden: Institution mismatch.');
        err.statusCode = 403;
        err.code = 'FORBIDDEN_SCOPE';
        throw err;
      }
    }

    return material;
  }

  /**
   * Downloads a study material file from Google Drive.
   * Strictly enforces backend authentication, publication state, and academic scope.
   *
   * @param {object} params
   * @param {string} params.callerUid - Authenticated user UID
   * @param {string} params.materialId - Material ID to download
   * @param {string} [params.encryptionKey=null] - Optional encryption key override
   * @returns {Promise<{ fileBuffer: Buffer, fileName: string, mimeType: string, fileSizeBytes: number }>}
   */
  async getStudyMaterialFile({ callerUid, materialId, encryptionKey = null }) {
    // 1. Authorize caller and retrieve material record
    const material = await this.getStudyMaterialById({ callerUid, materialId });

    if (!material.driveFileId) {
      const err = new Error('Study material record is missing a Google Drive file ID.');
      err.statusCode = 404;
      err.code = 'FILE_NOT_FOUND';
      throw err;
    }

    const owningTeacherUid = material.teacherUid;
    if (!owningTeacherUid) {
      const err = new Error('Study material record is missing owning teacher identification.');
      err.statusCode = 500;
      err.code = 'CORRUPTED_RECORD';
      throw err;
    }

    // 2. Fetch fresh Google Drive access token for the owning teacher
    const driveService = this.getDriveService();
    const validAccessToken = await driveService.getValidAccessToken(owningTeacherUid, encryptionKey);

    // 3. Download binary buffer from Google Drive API
    const fileBuffer = await driveService.downloadFile(material.driveFileId, validAccessToken);

    return {
      fileBuffer,
      fileName: material.fileName || material.driveFileName || 'study_material.pdf',
      mimeType: material.mimeType || 'application/pdf',
      fileSizeBytes: material.fileSizeBytes || fileBuffer.length
    };
  }

  /**
   * Sets the publication status of a study material (publish / unpublish).
   * Unpublishing immediately prevents students from listing or downloading the file.
   * Only the owning teacher or an authorized Director may toggle publication.
   *
   * @param {object} params
   * @param {string} params.callerUid - Must be owner or Director
   * @param {string} params.materialId - Target material ID
   * @param {boolean} params.isPublished - Target publication state
   * @returns {Promise<object>} Updated material record
   */
  async setPublishStatus({ callerUid, materialId, isPublished }) {
    const caller = await this.getValidatedUserProfile(callerUid);
    const role = (caller.role || '').toLowerCase();

    if (!materialId || typeof materialId !== 'string' || !materialId.trim()) {
      const err = new Error('materialId is required.');
      err.statusCode = 400;
      err.code = 'INVALID_ARGUMENT';
      throw err;
    }

    const db = this.getDb();
    const docRef = db.collection('study_materials').doc(materialId.trim());
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      const err = new Error(`Study material '${materialId}' not found.`);
      err.statusCode = 404;
      err.code = 'MATERIAL_NOT_FOUND';
      throw err;
    }

    const material = docSnap.data();

    // Authority Check: Owning teacher or Director only
    const isOwner = material.teacherUid === callerUid;
    const isDirector = role === 'director' || role === 'admin';

    if (!isOwner && !isDirector) {
      const err = new Error('Forbidden: Only the authoring teacher or a Director can modify publication status.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN_ROLE';
      throw err;
    }

    const shouldPublish = Boolean(isPublished);
    const nowIso = new Date().toISOString();

    const updates = {
      isPublished: shouldPublish,
      publishedAt: shouldPublish ? (material.publishedAt || nowIso) : null,
      updatedAt: nowIso
    };

    await docRef.set(updates, { merge: true });

    return {
      id: docSnap.id,
      ...material,
      ...updates
    };
  }

  /**
   * Deletes a study material record.
   * Only the authoring teacher or an authorized Director may delete a material.
   *
   * @param {object} params
   * @param {string} params.callerUid - Must be owner or Director
   * @param {string} params.materialId - Target material ID
   * @returns {Promise<{ success: boolean, message: string }>}
   */
  async deleteStudyMaterial({ callerUid, materialId }) {
    const caller = await this.getValidatedUserProfile(callerUid);
    const role = (caller.role || '').toLowerCase();

    if (!materialId || typeof materialId !== 'string' || !materialId.trim()) {
      const err = new Error('materialId is required.');
      err.statusCode = 400;
      err.code = 'INVALID_ARGUMENT';
      throw err;
    }

    const db = this.getDb();
    const docRef = db.collection('study_materials').doc(materialId.trim());
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      const err = new Error(`Study material '${materialId}' not found.`);
      err.statusCode = 404;
      err.code = 'MATERIAL_NOT_FOUND';
      throw err;
    }

    const material = docSnap.data();

    // Authority Check: Owning teacher or Director only
    const isOwner = material.teacherUid === callerUid;
    const isDirector = role === 'director' || role === 'admin';

    if (!isOwner && !isDirector) {
      const err = new Error('Forbidden: Only the authoring teacher or a Director can delete study materials.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN_ROLE';
      throw err;
    }

    await docRef.delete();

    return {
      success: true,
      message: `Study material "${material.title}" deleted successfully.`
    };
  }
}

export const studyMaterialService = new StudyMaterialService();
export default studyMaterialService;
