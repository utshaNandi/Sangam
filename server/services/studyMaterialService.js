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
   * Verifies the authoritative existence, non-trashed state, and accessibility
   * of a Google Drive file using the owning teacher's authenticated credentials.
   *
   * Distinguishes:
   * - missing / permanently deleted files (status: 'deleted', accessible: false)
   * - trashed files in Google Drive (status: 'trashed', accessible: false)
   * - revoked Google Drive authorization (status: 'revoked', accessible: false)
   * - disconnected Google Drive account (status: 'disconnected', accessible: false)
   * - temporary API outages or rate limits (temporaryError: true, accessible: false)
   *
   * @param {string} driveFileId - Google Drive file ID
   * @param {string} teacherUid - Owning teacher UID
   * @param {object} [options={}] - Options (e.g. encryptionKey, expectedFolderId)
   * @returns {Promise<{ accessible: boolean, exists: boolean, trashed: boolean, status: string, reason?: string, temporaryError?: boolean, metadata?: object }>}
   */
  async verifyDriveFileAvailability(driveFileId, teacherUid, options = {}) {
    if (!driveFileId || !teacherUid) {
      return {
        accessible: false,
        exists: false,
        trashed: false,
        status: 'invalid_arguments',
        reason: 'Missing driveFileId or teacherUid'
      };
    }

    const driveService = this.getDriveService();
    let accessToken;
    try {
      accessToken = await driveService.getValidAccessToken(teacherUid, options.encryptionKey);
    } catch (authErr) {
      if (authErr.code === 'DRIVE_NOT_CONNECTED' || authErr.statusCode === 424) {
        return {
          accessible: false,
          exists: false,
          trashed: false,
          status: 'disconnected',
          reason: 'Teacher Google Drive account is disconnected'
        };
      }
      if (authErr.code === 'GOOGLE_AUTH_REVOKED' || authErr.statusCode === 401 || authErr.statusCode === 403) {
        return {
          accessible: false,
          exists: false,
          trashed: false,
          status: 'revoked',
          reason: 'Teacher Google Drive authorization is revoked'
        };
      }
      if (authErr.code === 'DRIVE_TEMPORARY_ERROR' || authErr.statusCode === 503 || authErr.isTemporary) {
        return {
          accessible: false,
          exists: false,
          trashed: false,
          status: 'temporary_error',
          temporaryError: true,
          reason: authErr.message
        };
      }
      return {
        accessible: false,
        exists: false,
        trashed: false,
        status: 'auth_error',
        reason: authErr.message
      };
    }

    try {
      const meta = await driveService.getFileMetadata(driveFileId, accessToken);
      if (!meta) {
        return {
          accessible: false,
          exists: false,
          trashed: false,
          status: 'deleted',
          reason: 'File not found in Google Drive (deleted)'
        };
      }

      if (meta.trashed) {
        return {
          accessible: false,
          exists: true,
          trashed: true,
          status: 'trashed',
          reason: 'File is in Google Drive trash'
        };
      }

      if (options.expectedFolderId) {
        const parents = meta.parents || [];
        if (!parents.includes(options.expectedFolderId)) {
          return {
            accessible: false,
            exists: true,
            trashed: false,
            status: 'unauthorized_folder',
            reason: 'File does not belong to authorized subject folder'
          };
        }
      }

      return {
        accessible: true,
        exists: true,
        trashed: false,
        status: 'available',
        metadata: meta
      };
    } catch (apiErr) {
      if (apiErr.code === 'DRIVE_TEMPORARY_ERROR' || apiErr.statusCode === 503 || apiErr.statusCode === 429 || apiErr.isTemporary) {
        return {
          accessible: false,
          exists: false,
          trashed: false,
          status: 'temporary_error',
          temporaryError: true,
          reason: apiErr.message
        };
      }
      if (apiErr.code === 'GOOGLE_AUTH_REVOKED' || apiErr.statusCode === 401 || apiErr.statusCode === 403) {
        return {
          accessible: false,
          exists: false,
          trashed: false,
          status: 'revoked',
          reason: 'Google Drive authorization revoked during metadata inspection'
        };
      }
      if (apiErr.statusCode === 404 || apiErr.code === 'FILE_NOT_FOUND') {
        return {
          accessible: false,
          exists: false,
          trashed: false,
          status: 'deleted',
          reason: 'File not found in Google Drive'
        };
      }
      return {
        accessible: false,
        exists: false,
        trashed: false,
        status: 'error',
        reason: apiErr.message
      };
    }
  }

  /**
   * Reconciles stale publication documents in Firestore when a Google Drive file
   * is deleted, trashed, or has permissions revoked.
   * Marks records as unavailable while preserving diagnostic metadata.
   *
   * @param {string} driveFileId
   * @param {string} availabilityStatus - 'deleted' | 'trashed' | 'revoked' | 'disconnected'
   * @param {string} [reason='']
   * @returns {Promise<number>} Number of reconciled records
   */
  async reconcileStaleDrivePublications(driveFileId, availabilityStatus, reason = '') {
    if (!driveFileId) return 0;
    if (availabilityStatus !== 'deleted' && availabilityStatus !== 'trashed') {
      return 0;
    }
    try {
      const db = this.getDb();
      const snap = await db.collection('study_materials')
        .where('driveFileId', '==', driveFileId)
        .get();

      if (snap.empty) return 0;

      const nowIso = new Date().toISOString();
      const docsToUpdate = [];

      for (const doc of snap.docs) {
        const data = doc.data ? doc.data() : doc;
        // Idempotency: if already marked unavailable with this exact availability status, skip
        if (data.status === 'unavailable' && data.availabilityStatus === availabilityStatus) {
          continue;
        }

        const existingHistory = Array.isArray(data.lifecycleHistory) ? [...data.lifecycleHistory] : [];
        const eventAction = availabilityStatus === 'trashed' ? 'trashed_in_drive' : 'deleted_from_drive';
        const eventDetails = reason || (availabilityStatus === 'trashed'
          ? 'Original file moved to Google Drive trash'
          : 'Original file deleted from Google Drive');

        const lastEntry = existingHistory[existingHistory.length - 1];
        if (!lastEntry || lastEntry.action !== eventAction) {
          existingHistory.push({
            action: eventAction,
            timestamp: nowIso,
            actorUid: 'system_drive_sync',
            actorName: 'Google Drive Sync',
            actorRole: 'system',
            details: eventDetails
          });
        }

        const updates = {
          isPublished: false,
          status: 'unavailable',
          availabilityStatus,
          unavailableReason: eventDetails,
          unavailabilityDetectedAt: data.unavailabilityDetectedAt || nowIso,
          reconciledAt: nowIso,
          updatedAt: nowIso,
          lifecycleHistory: existingHistory
        };

        docsToUpdate.push({ doc, updates });
      }

      if (docsToUpdate.length === 0) return 0;

      const batch = db.batch ? db.batch() : null;
      if (batch && docsToUpdate.every(item => item.doc.ref && typeof item.doc.ref.update === 'function')) {
        docsToUpdate.forEach(({ doc, updates }) => {
          batch.update(doc.ref, updates);
        });
        await batch.commit();
      } else {
        await Promise.all(docsToUpdate.map(({ doc, updates }) => {
          if (doc.ref && typeof doc.ref.set === 'function') {
            return doc.ref.set(updates, { merge: true });
          }
          return db.collection('study_materials').doc(doc.id).set(updates, { merge: true });
        }));
      }

      return docsToUpdate.length;
    } catch (err) {
      console.warn('[StudyMaterialService] Failed to reconcile stale publications:', err.message);
      return 0;
    }
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
      uploadedAt: nowIso,
      publishedAt: isPublished ? nowIso : null,
      unpublishedAt: null,
      unavailabilityDetectedAt: null,
      status: isPublished ? 'active' : 'unpublished',
      availabilityStatus: 'available',
      lifecycleHistory: [
        {
          action: 'uploaded',
          timestamp: nowIso,
          actorUid: callerUid,
          actorName: userData.name || (callerEmail ? callerEmail.split('@')[0] : 'Faculty'),
          actorRole: role,
          details: `Uploaded "${originalFileName || safeUploadName}" to Google Drive`
        },
        ...(isPublished ? [{
          action: 'published',
          timestamp: nowIso,
          actorUid: callerUid,
          actorName: userData.name || (callerEmail ? callerEmail.split('@')[0] : 'Faculty'),
          actorRole: role,
          scope,
          section: isSectionScope ? section : null,
          details: isYearWide ? 'Published for all sections (Year-Wide)' : `Published for Section ${section}`
        }] : [])
      ],
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

    // Filter out materials previously marked unavailable/deleted/trashed in Firestore
    materials = materials.filter(m => {
      if (m.status === 'unavailable') return false;
      if (m.availabilityStatus === 'deleted' || m.availabilityStatus === 'trashed' || m.availabilityStatus === 'revoked') {
        return false;
      }
      return true;
    });

    // Authoritative Google Drive single source of truth verification:
    // Deduplicate checks by driveFileId to minimize API overhead
    const driveAvailabilityCache = new Map();
    const verifiedMaterials = [];

    for (const m of materials) {
      if (!m.driveFileId) {
        // Non-Drive (e.g. local) study materials retain intended behavior
        verifiedMaterials.push(m);
        continue;
      }

      let availability = driveAvailabilityCache.get(m.driveFileId);
      if (!availability) {
        availability = await this.verifyDriveFileAvailability(m.driveFileId, m.teacherUid);
        driveAvailabilityCache.set(m.driveFileId, availability);

        if (!availability.accessible) {
          if (availability.status === 'deleted' || availability.status === 'trashed') {
            await this.reconcileStaleDrivePublications(m.driveFileId, availability.status, availability.reason);
          }
        }
      }

      if (availability.accessible) {
        verifiedMaterials.push(m);
      } else {
        // Stale or inaccessible Drive file:
        // Student listing must exclude the publication.
        // Faculty Study Material interface must stop presenting its publication as available.
        // Temporary outages do not permanently delete records, but are excluded from active list.
        continue;
      }
    }

    materials = verifiedMaterials;

    // Sort descending by creation timestamp
    materials.sort((a, b) => {
      const tA = new Date(a.createdAt || 0).getTime();
      const tB = new Date(b.createdAt || 0).getTime();
      return tB - tA;
    });

    return materials;
  }

  /**
   * Retrieves full study material history and archive for authorized faculty and directors.
   * Includes active, unpublished, and unavailable (deleted/trashed in Drive) records
   * along with complete lifecycle audit events.
   *
   * @param {object} params
   * @param {string} params.callerUid
   * @param {string} [params.subjectId]
   * @param {string} [params.department]
   * @param {string} [params.year]
   * @param {string} [params.section]
   * @returns {Promise<Array<object>>}
   */
  async getStudyMaterialHistory({
    callerUid,
    subjectId,
    department,
    year,
    section
  }) {
    const caller = await this.getValidatedUserProfile(callerUid);
    const role = (caller.role || '').toLowerCase();

    if (role !== 'faculty' && role !== 'teacher' && role !== 'director' && role !== 'admin') {
      const err = new Error('Forbidden: Only faculty members and authorized directors can access study material history.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN_ROLE';
      throw err;
    }

    const db = this.getDb();
    let queryRef = db.collection('study_materials');

    if (caller.institution) {
      queryRef = queryRef.where('institution', '==', caller.institution);
    }
    if (subjectId) {
      queryRef = queryRef.where('subjectId', '==', subjectId.trim());
    }

    const snapshot = await queryRef.get();
    let materials = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    // Role-based scoping for faculty/teacher
    if (role === 'faculty' || role === 'teacher') {
      const allocsSnap = await db.collection('teacher_subject_assignments')
        .where('teacherUid', '==', callerUid)
        .where('status', '==', 'active')
        .get();
      const assignedSubjectIds = new Set(allocsSnap.docs.map(d => d.data().subjectId));

      materials = materials.filter(m => {
        const isAuthor = m.teacherUid === callerUid;
        const isAssigned = assignedSubjectIds.has(m.subjectId);
        return isAuthor || isAssigned;
      });
    }

    if (department && department !== 'All' && department !== 'All Departments') {
      materials = materials.filter(m => isMatchingDepartment(m.department, department));
    }
    if (year && year !== 'All' && year !== 'All Years') {
      materials = materials.filter(m => isMatchingYear(m.year, year));
    }
    if (section && section !== 'All' && section !== 'All Sections') {
      materials = materials.filter(m => m.isYearWide || isMatchingSection(m.section, section));
    }

    // Verify Drive availability for Drive-backed items so deleted/trashed files are up to date
    for (const m of materials) {
      if (m.driveFileId && m.status !== 'unavailable') {
        const availability = await this.verifyDriveFileAvailability(m.driveFileId, m.teacherUid);
        if (!availability.accessible) {
          if (availability.status === 'deleted' || availability.status === 'trashed') {
            await this.reconcileStaleDrivePublications(m.driveFileId, availability.status, availability.reason);
            m.isPublished = false;
            m.status = 'unavailable';
            m.availabilityStatus = availability.status;
            m.unavailableReason = availability.reason;
            m.unavailabilityDetectedAt = m.unavailabilityDetectedAt || new Date().toISOString();
          }
        }
      }

      // Ensure download is strictly disabled for unavailable materials
      const isUnavailable = m.status === 'unavailable' || m.availabilityStatus === 'deleted' || m.availabilityStatus === 'trashed';
      m.isDownloadable = !isUnavailable && (m.isPublished === true || m.teacherUid === callerUid);

      // Fallback for older records missing lifecycleHistory
      if (!Array.isArray(m.lifecycleHistory)) {
        m.lifecycleHistory = [];
        if (m.uploadedAt || m.createdAt) {
          m.lifecycleHistory.push({
            action: 'uploaded',
            timestamp: m.uploadedAt || m.createdAt,
            actorUid: m.teacherUid || 'Unknown',
            actorName: m.teacherName || 'Faculty',
            actorRole: 'faculty',
            details: `Uploaded ${m.fileName || 'file'}`
          });
        }
        if (m.publishedAt) {
          m.lifecycleHistory.push({
            action: 'published',
            timestamp: m.publishedAt,
            actorUid: m.teacherUid || 'Unknown',
            actorName: m.teacherName || 'Faculty',
            actorRole: 'faculty',
            details: m.isYearWide ? 'Published for all sections (Year-Wide)' : `Published for Section ${m.section}`
          });
        }
        if (m.status === 'unavailable') {
          m.lifecycleHistory.push({
            action: m.availabilityStatus === 'trashed' ? 'trashed_in_drive' : 'deleted_from_drive',
            timestamp: m.unavailabilityDetectedAt || m.updatedAt || new Date().toISOString(),
            actorUid: 'system_drive_sync',
            actorName: 'Google Drive Sync',
            actorRole: 'system',
            details: m.unavailableReason || 'File unavailable in Google Drive'
          });
        }
      }
    }

    // Sort descending by creation/update timestamp
    materials.sort((a, b) => {
      const tA = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const tB = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return tB - tA;
    });

    return materials;
  }

  /**
   * Retrieves sanitized unavailable/archived study materials for the authenticated student.
   * Respects academic scope and strips all internal Drive IDs and credentials.
   *
   * @param {object} params
   * @param {string} params.callerUid
   * @param {string} [params.subjectId]
   * @param {string} [params.department]
   * @param {string} [params.year]
   * @param {string} [params.section]
   * @returns {Promise<Array<object>>} Sanitized archived materials
   */
  async getStudentStudyMaterialHistory({
    callerUid,
    subjectId,
    department,
    year,
    section
  }) {
    const caller = await this.getValidatedUserProfile(callerUid);
    const role = (caller.role || '').toLowerCase();

    if (role !== 'student') {
      const err = new Error('Forbidden: Only students can access student study material history.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN_ROLE';
      throw err;
    }

    const studentDept = caller.department || department;
    const studentYear = caller.year || year;
    const studentSec = caller.section || section;

    const db = this.getDb();
    let queryRef = db.collection('study_materials');

    if (caller.institution) {
      queryRef = queryRef.where('institution', '==', caller.institution);
    }
    if (subjectId) {
      queryRef = queryRef.where('subjectId', '==', subjectId.trim());
    }

    const snapshot = await queryRef.get();
    let materials = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    // Filter strictly to student's academic scope
    materials = materials.filter(m => {
      if (caller.institution && m.institution && caller.institution !== m.institution) return false;
      if (!isMatchingDepartment(studentDept, m.department)) return false;
      if (!isMatchingYear(studentYear, m.year)) return false;

      const isYearScoped = m.isYearWide === true || m.scope === 'year';
      if (!isYearScoped && !isMatchingSection(studentSec, m.section)) {
        return false;
      }

      // Only show materials that are unavailable (previously published/archived)
      return m.status === 'unavailable';
    });

    // Sanitize for student: Never expose raw Drive IDs, folder IDs, or credentials
    const sanitized = materials.map(m => ({
      id: m.id,
      title: m.title,
      description: m.description || '',
      subjectId: m.subjectId,
      subjectName: m.subjectName,
      subjectCode: m.subjectCode,
      category: m.category,
      teacherName: m.teacherName || 'Faculty',
      scope: m.scope,
      isYearWide: m.isYearWide,
      section: m.section,
      publishedAt: m.publishedAt,
      unavailabilityDetectedAt: m.unavailabilityDetectedAt || m.reconciledAt,
      status: 'unavailable',
      availabilityStatus: m.availabilityStatus || 'deleted',
      unavailableReason: m.availabilityStatus === 'trashed'
        ? 'File is in Google Drive trash and unavailable'
        : 'File was deleted from Google Drive and is no longer accessible',
      isDownloadable: false
    }));

    sanitized.sort((a, b) => {
      const tA = new Date(a.unavailabilityDetectedAt || a.publishedAt || 0).getTime();
      const tB = new Date(b.unavailabilityDetectedAt || b.publishedAt || 0).getTime();
      return tB - tA;
    });

    return sanitized;
  }

  /**
   * Retrieves single study material metadata with access authorization and Drive availability checks.
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

    // Check if previously reconciled as unavailable (deleted or trashed in Drive)
    if (material.status === 'unavailable') {
      if (material.availabilityStatus === 'trashed') {
        const err = new Error('This study material is unavailable because the file is in Google Drive trash.');
        err.statusCode = 410;
        err.code = 'FILE_TRASHED';
        throw err;
      }
      if (material.availabilityStatus === 'deleted') {
        const err = new Error('This study material is unavailable because the file was deleted from Google Drive.');
        err.statusCode = 404;
        err.code = 'FILE_NOT_FOUND';
        throw err;
      }
    }

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

    // Authoritative live Drive verification for Drive-backed materials
    if (material.driveFileId) {
      const availability = await this.verifyDriveFileAvailability(material.driveFileId, material.teacherUid);
      if (!availability.accessible) {
        if (availability.temporaryError) {
          const err = new Error('Google Drive service is temporarily unavailable. Please try again later.');
          err.statusCode = 503;
          err.code = 'DRIVE_TEMPORARY_ERROR';
          err.isTemporary = true;
          throw err;
        }
        if (availability.status === 'trashed') {
          await this.reconcileStaleDrivePublications(material.driveFileId, 'trashed', availability.reason);
          const err = new Error('File is in Google Drive trash and cannot be accessed.');
          err.statusCode = 410;
          err.code = 'FILE_TRASHED';
          throw err;
        }
        if (availability.status === 'deleted') {
          await this.reconcileStaleDrivePublications(material.driveFileId, 'deleted', availability.reason);
          const err = new Error(`File '${material.driveFileId}' not found in Google Drive.`);
          err.statusCode = 404;
          err.code = 'FILE_NOT_FOUND';
          throw err;
        }
        if (availability.status === 'revoked') {
          const err = new Error('Google authorization has been revoked or expired. Please reconnect your account.');
          err.statusCode = 401;
          err.code = 'GOOGLE_AUTH_REVOKED';
          throw err;
        }
        if (availability.status === 'disconnected') {
          const err = new Error('Google Drive is not connected. Teacher account disconnected.');
          err.statusCode = 424;
          err.code = 'DRIVE_NOT_CONNECTED';
          throw err;
        }
        const err = new Error(`File is not accessible in Google Drive (${availability.status}): ${availability.reason || 'Unavailable'}`);
        err.statusCode = 403;
        err.code = 'FILE_UNAVAILABLE';
        throw err;
      }
    }

    return material;
  }

  /**
   * Downloads a study material file directly from Google Drive.
   * Strictly enforces backend authentication, publication state, Drive file existence, and academic scope.
   * Never serves cached or previously stored PDF bytes when the original Drive file is missing or trashed.
   *
   * @param {object} params
   * @param {string} params.callerUid - Authenticated user UID
   * @param {string} params.materialId - Material ID to download
   * @param {string} [params.encryptionKey=null] - Optional encryption key override
   * @returns {Promise<{ fileBuffer: Buffer, fileName: string, mimeType: string, fileSizeBytes: number }>}
   */
  async getStudyMaterialFile({ callerUid, materialId, encryptionKey = null }) {
    // 1. Authorize caller and retrieve material record (includes live Drive existence verification)
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

    // 3. Download binary buffer directly from Google Drive API
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
   * Re-publishing verifies authoritative Drive file existence and blocks publishing trashed/deleted files.
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

    // If attempting to publish, authoritatively verify that the file still exists in Google Drive
    if (shouldPublish && material.driveFileId) {
      const availability = await this.verifyDriveFileAvailability(material.driveFileId, material.teacherUid);
      if (!availability.accessible) {
        if (availability.temporaryError) {
          const err = new Error('Google Drive is temporarily unavailable. Please try again later.');
          err.statusCode = 503;
          err.code = 'DRIVE_TEMPORARY_ERROR';
          throw err;
        }
        if (availability.status === 'trashed') {
          await this.reconcileStaleDrivePublications(material.driveFileId, 'trashed', availability.reason);
          const err = new Error('Cannot publish: The file is in Google Drive trash.');
          err.statusCode = 410;
          err.code = 'FILE_TRASHED';
          throw err;
        }
        if (availability.status === 'deleted') {
          await this.reconcileStaleDrivePublications(material.driveFileId, 'deleted', availability.reason);
          const err = new Error('Cannot publish: The file was deleted from Google Drive.');
          err.statusCode = 404;
          err.code = 'FILE_NOT_FOUND';
          throw err;
        }
        const err = new Error(`Cannot publish: The Drive file is not accessible (${availability.reason || availability.status}).`);
        err.statusCode = 403;
        err.code = 'FILE_UNAVAILABLE';
        throw err;
      }
    }

    const nowIso = new Date().toISOString();
    const existingHistory = Array.isArray(material.lifecycleHistory) ? [...material.lifecycleHistory] : [];

    if (shouldPublish) {
      existingHistory.push({
        action: 'published',
        timestamp: nowIso,
        actorUid: callerUid,
        actorName: caller.name || 'Faculty',
        actorRole: role,
        details: material.publishedAt
          ? 'Study material re-published by faculty'
          : 'Study material published by faculty'
      });
    } else {
      existingHistory.push({
        action: 'unpublished',
        timestamp: nowIso,
        actorUid: callerUid,
        actorName: caller.name || 'Faculty',
        actorRole: role,
        details: 'Study material unpublished by faculty'
      });
    }

    const updates = {
      isPublished: shouldPublish,
      status: shouldPublish ? 'active' : 'unpublished',
      publishedAt: shouldPublish ? (material.publishedAt || nowIso) : (material.publishedAt || null),
      unpublishedAt: shouldPublish ? null : nowIso,
      availabilityStatus: shouldPublish ? 'available' : (material.availabilityStatus || 'available'),
      unavailableReason: shouldPublish ? null : (material.unavailableReason || null),
      unavailabilityDetectedAt: shouldPublish ? null : (material.unavailabilityDetectedAt || null),
      updatedAt: nowIso,
      lifecycleHistory: existingHistory
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

  // ---------------------------------------------------------------------------
  // PHASE B: FACULTY DRIVE LIBRARY BROWSING, DRAFT UPLOAD & PUBLISH-FROM-DRIVE
  // ---------------------------------------------------------------------------

  /**
   * Lists files in the teacher's dedicated Google Drive folder for an assigned subject.
   * Cross-references against published `study_materials` so the teacher can see
   * which files are currently published.
   *
   * @param {object} params
   * @param {string} params.callerUid - Authenticated teacher UID
   * @param {string} params.subjectId - Target subject ID
   * @param {string} [params.encryptionKey=null] - Optional encryption key override
   * @returns {Promise<{ folderId: string, folderName: string, files: Array<object> }>}
   */
  async listDriveFilesForSubject({ callerUid, subjectId, encryptionKey = null }) {
    if (!callerUid) {
      const err = new Error('Unauthorized: User identity could not be verified.');
      err.statusCode = 401;
      err.code = 'UNAUTHORIZED';
      throw err;
    }
    if (!subjectId || typeof subjectId !== 'string' || !subjectId.trim()) {
      const err = new Error('subjectId is required.');
      err.statusCode = 400;
      err.code = 'MISSING_SUBJECT';
      throw err;
    }

    const cleanSubjectId = subjectId.trim();
    const userData = await this.getValidatedUserProfile(callerUid);
    const role = (userData.role || '').toLowerCase();

    if (role !== 'faculty' && role !== 'teacher' && role !== 'director') {
      const err = new Error('Forbidden: Only faculty members or authorized directors can access the Faculty Drive Library.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN_ROLE';
      throw err;
    }

    // Verify active teacher-subject assignment
    const isAuthorized = await subjectService.verifyTeacherSubjectAuthorization(callerUid, cleanSubjectId);
    if (!isAuthorized) {
      const err = new Error('Forbidden: You are not actively assigned to teach this subject.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN_SUBJECT';
      throw err;
    }

    // Resolve teacher's subject folder
    const folderRes = await subjectService.getOrCreateSubjectFolder({
      teacherUid: callerUid,
      subjectId: cleanSubjectId,
      encryptionKey
    });

    if (folderRes.status === 'deferred') {
      const err = new Error('Google Drive is not connected. Please connect your Google Drive account in Settings to access the Faculty Drive Library.');
      err.statusCode = 424;
      err.code = 'DRIVE_NOT_CONNECTED';
      throw err;
    }

    const driveFolderId = folderRes.driveFolderId;
    if (!driveFolderId) {
      const err = new Error('Subject Drive folder is not available.');
      err.statusCode = 500;
      err.code = 'FOLDER_UNAVAILABLE';
      throw err;
    }

    const driveService = this.getDriveService();
    const accessToken = await driveService.getValidAccessToken(callerUid, encryptionKey);

    // List active, non-trashed files in the subject folder
    const driveFiles = await driveService.listFilesInFolder(driveFolderId, accessToken);

    // Query published study materials for this teacher and subject to attach publication metadata
    const db = this.getDb();
    const publishedSnap = await db.collection('study_materials')
      .where('teacherUid', '==', callerUid)
      .where('subjectId', '==', cleanSubjectId)
      .get();

    const activeDriveFileIds = new Set(driveFiles.map(f => f.id));
    const publishedMaterialsByDriveId = new Map();

    for (const doc of publishedSnap.docs) {
      const data = { id: doc.id, ...doc.data() };
      if (!data.driveFileId) continue;

      if (data.status === 'unavailable' || data.availabilityStatus === 'deleted' || data.availabilityStatus === 'trashed') {
        continue;
      }

      if (!activeDriveFileIds.has(data.driveFileId)) {
        // File is no longer active in this folder. Check Drive availability to reconcile stale publication
        const availability = await this.verifyDriveFileAvailability(data.driveFileId, callerUid, {
          encryptionKey,
          expectedFolderId: driveFolderId
        });

        if (!availability.accessible) {
          if (availability.status === 'deleted' || availability.status === 'trashed') {
            await this.reconcileStaleDrivePublications(data.driveFileId, availability.status, availability.reason);
          }
          continue;
        }
      }

      if (!publishedMaterialsByDriveId.has(data.driveFileId)) {
        publishedMaterialsByDriveId.set(data.driveFileId, []);
      }
      publishedMaterialsByDriveId.get(data.driveFileId).push({
        id: data.id,
        title: data.title,
        scope: data.scope,
        isYearWide: data.isYearWide,
        section: data.section,
        category: data.category,
        isPublished: Boolean(data.isPublished),
        publishedAt: data.publishedAt || data.createdAt
      });
    }

    const enrichedFiles = driveFiles.map((file) => {
      const publications = publishedMaterialsByDriveId.get(file.id) || [];
      const hasActivePublication = publications.some((p) => p.isPublished);
      return {
        ...file,
        folderId: driveFolderId,
        isPublished: hasActivePublication,
        publications
      };
    });

    return {
      folderId: driveFolderId,
      folderName: folderRes.driveFolderName,
      files: enrichedFiles
    };
  }

  /**
   * Uploads a draft document (PDF) directly to the teacher's subject folder in Google Drive.
   * Does NOT create a study_materials document in Firestore, keeping the draft completely private
   * and invisible to students.
   *
   * @param {object} params
   * @param {string} params.callerUid - Authenticated teacher UID
   * @param {string} [params.callerEmail] - Authenticated teacher email
   * @param {Buffer} params.fileBuffer - Binary buffer of the PDF file
   * @param {string} params.originalFileName - File name
   * @param {number} [params.fileSize] - File size in bytes
   * @param {string} [params.mimeType='application/pdf'] - MIME type
   * @param {string} params.subjectId - Target subject ID
   * @param {string} [params.encryptionKey=null] - Optional encryption key override
   * @returns {Promise<object>} Uploaded file metadata from Google Drive
   */
  async uploadToDriveSubjectFolder({
    callerUid,
    callerEmail = null,
    fileBuffer,
    originalFileName,
    fileSize,
    mimeType = 'application/pdf',
    subjectId,
    encryptionKey = null
  }) {
    if (!callerUid) {
      const err = new Error('Unauthorized: User identity could not be verified.');
      err.statusCode = 401;
      err.code = 'UNAUTHORIZED';
      throw err;
    }

    const userData = await this.getValidatedUserProfile(callerUid);
    const role = (userData.role || '').toLowerCase();

    if (role !== 'faculty' && role !== 'teacher' && role !== 'director') {
      const err = new Error('Forbidden: Only faculty members or authorized directors can upload files to the Drive Library.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN_ROLE';
      throw err;
    }

    if (!fileBuffer || !Buffer.isBuffer(fileBuffer) || fileBuffer.length === 0) {
      const err = new Error('A valid, non-empty PDF file buffer is required.');
      err.statusCode = 400;
      err.code = 'INVALID_FILE';
      throw err;
    }

    const cleanFileName = (originalFileName || 'document.pdf').trim();
    const isPdf = cleanFileName.toLowerCase().endsWith('.pdf') || (mimeType && mimeType.toLowerCase().includes('pdf'));
    if (!isPdf) {
      const err = new Error('Only PDF documents (.pdf) are supported in the Faculty Drive Library.');
      err.statusCode = 400;
      err.code = 'INVALID_FILE_TYPE';
      throw err;
    }

    const actualSize = fileSize || fileBuffer.length;
    const MAX_SIZE = 25 * 1024 * 1024; // 25 MB
    if (actualSize > MAX_SIZE) {
      const err = new Error('File size exceeds maximum allowed limit of 25MB.');
      err.statusCode = 413;
      err.code = 'FILE_TOO_LARGE';
      throw err;
    }

    if (!subjectId || typeof subjectId !== 'string' || !subjectId.trim()) {
      const err = new Error('subjectId is required.');
      err.statusCode = 400;
      err.code = 'MISSING_SUBJECT';
      throw err;
    }

    const cleanSubjectId = subjectId.trim();

    // Verify active teacher-subject assignment
    const isAuthorized = await subjectService.verifyTeacherSubjectAuthorization(callerUid, cleanSubjectId);
    if (!isAuthorized) {
      const err = new Error('Forbidden: You are not actively assigned to teach this subject.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN_SUBJECT';
      throw err;
    }

    // Resolve teacher's subject folder
    const folderRes = await subjectService.getOrCreateSubjectFolder({
      teacherUid: callerUid,
      subjectId: cleanSubjectId,
      encryptionKey
    });

    if (folderRes.status === 'deferred') {
      const err = new Error('Google Drive is not connected. Please connect your Google Drive account in Settings before uploading files.');
      err.statusCode = 424;
      err.code = 'DRIVE_NOT_CONNECTED';
      throw err;
    }

    const driveFolderId = folderRes.driveFolderId;
    if (!driveFolderId) {
      const err = new Error('Subject Drive folder is not available.');
      err.statusCode = 500;
      err.code = 'FOLDER_UNAVAILABLE';
      throw err;
    }

    const driveService = this.getDriveService();
    const accessToken = await driveService.getValidAccessToken(callerUid, encryptionKey);

    // Upload file directly to teacher's subject folder in Google Drive
    const uploadResult = await driveService.uploadFileToFolder(
      driveFolderId,
      cleanFileName,
      'application/pdf',
      fileBuffer,
      accessToken,
      {
        description: `Sangam Coursework Library Draft: ${cleanFileName}`
      }
    );

    // CRITICAL: We do NOT create any `study_materials` document here.
    // The file exists solely in Google Drive and remains a private draft.

    return {
      id: uploadResult.id,
      name: uploadResult.name || cleanFileName,
      size: actualSize,
      mimeType: 'application/pdf',
      folderId: driveFolderId
    };
  }

  /**
   * Publishes an existing Google Drive file as a study material without re-uploading or duplicating it.
   *
   * Verifications:
   * 1. Teacher has active subject assignment.
   * 2. Drive file exists in Google Drive and its parent is the teacher's assigned subject folder.
   * 3. Requested scope (year-wide or section-specific) is authorized by teacher_allocations.
   * 4. Deduplication: Ensures the same file isn't duplicate-published for the exact same scope.
   *
   * @param {object} params
   * @returns {Promise<object>} Created study material record
   */
  async publishFromDriveFile({
    callerUid,
    callerEmail = null,
    subjectId,
    driveFileId,
    title,
    scope,
    section,
    category,
    description,
    isYearWide = false,
    encryptionKey = null
  }) {
    if (!callerUid) {
      const err = new Error('Unauthorized: User identity could not be verified.');
      err.statusCode = 401;
      err.code = 'UNAUTHORIZED';
      throw err;
    }

    const userData = await this.getValidatedUserProfile(callerUid);
    const role = (userData.role || '').toLowerCase();

    if (role !== 'faculty' && role !== 'teacher' && role !== 'director') {
      const err = new Error('Forbidden: Only faculty members or authorized directors can publish study materials.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN_ROLE';
      throw err;
    }

    if (!subjectId || typeof subjectId !== 'string' || !subjectId.trim()) {
      const err = new Error('subjectId is required.');
      err.statusCode = 400;
      err.code = 'MISSING_SUBJECT';
      throw err;
    }

    if (!driveFileId || typeof driveFileId !== 'string' || !driveFileId.trim()) {
      const err = new Error('driveFileId is required to publish an existing Drive file.');
      err.statusCode = 400;
      err.code = 'MISSING_DRIVE_FILE';
      throw err;
    }

    const cleanSubjectId = subjectId.trim();
    const cleanDriveFileId = driveFileId.trim();

    // 1. Verify Teacher's Active Assignment for this subject
    const isAuthorized = await subjectService.verifyTeacherSubjectAuthorization(callerUid, cleanSubjectId);
    if (!isAuthorized) {
      const err = new Error('Forbidden: You are not actively assigned to teach this subject.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN_SUBJECT';
      throw err;
    }

    // 2. Fetch subject document
    const db = this.getDb();
    const subjectSnap = await db.collection('subjects').doc(cleanSubjectId).get();
    if (!subjectSnap.exists) {
      const err = new Error(`Subject with ID '${cleanSubjectId}' not found.`);
      err.statusCode = 404;
      err.code = 'SUBJECT_NOT_FOUND';
      throw err;
    }
    const subject = { id: subjectSnap.id, ...subjectSnap.data() };

    // 3. Resolve Teacher's Subject Folder
    const folderRes = await subjectService.getOrCreateSubjectFolder({
      teacherUid: callerUid,
      subjectId: cleanSubjectId,
      encryptionKey
    });

    if (folderRes.status === 'deferred') {
      const err = new Error('Google Drive is not connected. Please connect your Google Drive account in Settings before publishing.');
      err.statusCode = 424;
      err.code = 'DRIVE_NOT_CONNECTED';
      throw err;
    }

    const expectedFolderId = folderRes.driveFolderId;
    if (!expectedFolderId) {
      const err = new Error('Subject Drive folder is not available.');
      err.statusCode = 500;
      err.code = 'FOLDER_UNAVAILABLE';
      throw err;
    }

    // 4. Verify the file exists in Google Drive and belongs to this teacher's subject folder
    const driveService = this.getDriveService();
    const accessToken = await driveService.getValidAccessToken(callerUid, encryptionKey);

    const fileMeta = await driveService.getFileMetadata(cleanDriveFileId, accessToken);
    if (!fileMeta || fileMeta.trashed) {
      const err = new Error('The specified Drive file was not found or is in the Google Drive trash.');
      err.statusCode = 404;
      err.code = 'FILE_NOT_FOUND';
      throw err;
    }

    // Check ownership/containment: parents must include expectedFolderId
    const parents = fileMeta.parents || [];
    if (!parents.includes(expectedFolderId)) {
      const err = new Error('Forbidden: The specified file does not belong to your assigned subject folder.');
      err.statusCode = 403;
      err.code = 'UNAUTHORIZED_FILE_ACCESS';
      throw err;
    }

    // 5. Scope & Allocation Validation
    const rawScope = (scope || (isYearWide ? 'year' : 'section') || '').trim().toLowerCase();
    const isSectionScope = rawScope === 'section' || rawScope === 'section-specific';
    const finalScope = isSectionScope ? 'section' : 'year';
    const cleanSection = isSectionScope ? (section || '').trim() : null;

    if (isSectionScope && !cleanSection) {
      const err = new Error('section is required when publishing with section-specific scope.');
      err.statusCode = 400;
      err.code = 'MISSING_SECTION';
      throw err;
    }

    // Verify teacher's class allocation in teacher_allocations (unless Director)
    if (role === 'faculty' || role === 'teacher') {
      const allocsSnap = await db.collection('teacher_allocations')
        .where('teacherUid', '==', callerUid)
        .get();

      const activeAllocations = allocsSnap.docs
        .map(d => d.data())
        .filter(a => a.authorized !== false);

      const hasClassAllocation = activeAllocations.some(alloc => {
        const instOk = !alloc.institution || alloc.institution === subject.institution;
        const deptOk = isMatchingDepartment(alloc.department, subject.department);
        const yrOk = isMatchingYear(alloc.year, subject.year);
        const secOk = !isSectionScope || !alloc.section || isMatchingSection(alloc.section, cleanSection);
        return instOk && deptOk && yrOk && secOk;
      });

      if (!hasClassAllocation) {
        const err = new Error(
          `Forbidden: You do not have an authorized class allocation for ${subject.department} ${subject.year}${isSectionScope ? ` (${cleanSection})` : ''}.`
        );
        err.statusCode = 403;
        err.code = 'FORBIDDEN_SCOPE';
        throw err;
      }
    }

    // 6. Duplicate Publication Check for identical scope
    const existingSnap = await db.collection('study_materials')
      .where('driveFileId', '==', cleanDriveFileId)
      .where('subjectId', '==', subject.id)
      .where('teacherUid', '==', callerUid)
      .get();

    const alreadyPublishedForScope = existingSnap.docs.some(d => {
      const data = d.data();
      if (!data.isPublished) return false;
      if (finalScope === 'year') {
        return data.scope === 'year' || data.isYearWide;
      }
      return data.scope === 'section' && isMatchingSection(data.section, cleanSection);
    });

    if (alreadyPublishedForScope) {
      const err = new Error(
        `This Drive file is already published for ${finalScope === 'year' ? 'all sections (Year-Wide)' : `Section ${cleanSection}`}.`
      );
      err.statusCode = 409;
      err.code = 'ALREADY_PUBLISHED';
      throw err;
    }

    // 7. Persist study_materials document
    const materialId = `mat_${crypto.randomUUID ? crypto.randomUUID() : (Date.now() + '_' + crypto.randomBytes(4).toString('hex'))}`;
    const nowIso = new Date().toISOString();
    const finalTitle = (title && title.trim()) ? title.trim() : fileMeta.name;

    const materialRecord = {
      id: materialId,
      driveFileId: cleanDriveFileId,
      driveFileName: fileMeta.name,
      driveFolderId: expectedFolderId,
      fileName: fileMeta.name,
      mimeType: fileMeta.mimeType || 'application/pdf',
      fileSizeBytes: fileMeta.size || 0,
      teacherUid: callerUid,
      teacherName: userData.name || (callerEmail ? callerEmail.split('@')[0] : 'Faculty'),
      teacherEmail: callerEmail || userData.email || '',
      subjectId: subject.id,
      subjectName: subject.name,
      subjectCode: subject.code || '',
      institution: userData.institution || subject.institution || 'UEMK',
      department: subject.department,
      year: subject.year,
      scope: finalScope,
      isYearWide: !isSectionScope,
      section: cleanSection,
      category: (category || 'Lecture Notes').trim(),
      title: finalTitle,
      description: (description || '').trim(),
      storageProvider: 'google',
      isPublished: true,
      uploadedAt: fileMeta.createdTime || nowIso,
      publishedAt: nowIso,
      unpublishedAt: null,
      unavailabilityDetectedAt: null,
      status: 'active',
      availabilityStatus: 'available',
      lifecycleHistory: [
        {
          action: 'created',
          timestamp: nowIso,
          actorUid: callerUid,
          actorName: userData.name || (callerEmail ? callerEmail.split('@')[0] : 'Faculty'),
          actorRole: role,
          details: `Drive file "${fileMeta.name}" linked as study material`
        },
        {
          action: 'published',
          timestamp: nowIso,
          actorUid: callerUid,
          actorName: userData.name || (callerEmail ? callerEmail.split('@')[0] : 'Faculty'),
          actorRole: role,
          scope: finalScope,
          section: cleanSection,
          details: finalScope === 'year'
            ? 'Published for all sections (Year-Wide)'
            : `Published for Section ${cleanSection}`
        }
      ],
      createdAt: nowIso,
      updatedAt: nowIso
    };

    await db.collection('study_materials').doc(materialId).set(materialRecord);

    return materialRecord;
  }
}

export const studyMaterialService = new StudyMaterialService();
export default studyMaterialService;
