import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import { verifyFirebaseToken } from '../middleware/authMiddleware.js';
import { googleDriveService, stateManager } from '../services/googleDriveService.js';

export const storageRouter = express.Router();
export const assignmentRouter = express.Router();
export const submissionRouter = express.Router();
const router = storageRouter;

/**
 * GET /api/storage/google/auth-url
 * Generates a genuine Google OAuth 2.0 consent screen URL bound to a single-use state token.
 * Protected by verifyFirebaseToken.
 */
router.get('/google/auth-url', verifyFirebaseToken, async (req, res) => {
  try {
    const teacherUid = req.userId;
    if (!teacherUid) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Teacher identity could not be verified.'
      });
    }

    // 1. Create a cryptographically random, single-use state token bound to teacherUid
    const state = await stateManager.createState(teacherUid);

    // 2. Generate Google OAuth authorization URL
    const url = googleDriveService.getAuthorizationUrl(state);

    return res.json({
      success: true,
      url,
      provider: 'google'
    });
  } catch (error) {
    console.error('[StorageRoutes] Failed to generate Google auth URL:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/storage/google/callback
 * Handles the OAuth 2.0 authorization code callback from Google.
 * Validates the state token, exchanges code for tokens, retrieves user profile,
 * encrypts tokens with AES-256-GCM, and stores integration in Firestore.
 */
router.get('/google/callback', async (req, res) => {
  const { code, state, error } = req.query;
  let frontendUrl = process.env.FRONTEND_URL;
  if (!frontendUrl && process.env.VERCEL) {
    const prodHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || 'esangam.vercel.app';
    frontendUrl = `https://${prodHost}`;
  } else if (!frontendUrl) {
    frontendUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:5173';
  }

  // 1. Handle user cancellation or provider denial
  if (error) {
    console.warn('[StorageRoutes] Google OAuth callback returned error:', error);
    if (req.accepts('html')) {
      return res.redirect(`${frontendUrl}/teacher?storage_status=error&error=${encodeURIComponent(error)}`);
    }
    return res.status(400).json({
      success: false,
      error: `Google authorization denied: ${error}`
    });
  }

  // 2. Validate and consume single-use state token
  if (!state) {
    return res.status(400).json({
      success: false,
      error: 'Missing OAuth state parameter.'
    });
  }

  let stateData;
  try {
    stateData = await stateManager.consumeState(state);
  } catch (stateErr) {
    console.error('[StorageRoutes] OAuth state verification failed closed:', stateErr.message);
    return res.status(500).json({
      success: false,
      error: 'OAuth state verification service unavailable. Please try again.'
    });
  }

  if (!stateData || !stateData.teacherUid) {
    return res.status(400).json({
      success: false,
      error: 'Invalid, expired, or already-used OAuth state parameter. Please restart the connection flow.'
    });
  }

  const teacherUid = stateData.teacherUid;

  // 3. Ensure authorization code exists
  if (!code) {
    return res.status(400).json({
      success: false,
      error: 'Missing authorization code from Google.'
    });
  }

  try {
    // 4. Exchange authorization code for tokens (server-side only)
    const tokens = await googleDriveService.exchangeCodeForTokens(code);

    // 4b. Authoritatively verify that the required Google Drive scope was granted
    const grantedScopes = (tokens.scope || '').split(' ');
    const hasDriveScope = grantedScopes.some(
      (s) => s === 'https://www.googleapis.com/auth/drive.file' || s === 'https://www.googleapis.com/auth/drive'
    );
    if (!hasDriveScope) {
      console.warn(`[StorageRoutes] OAuth code exchange for teacher ${teacherUid} lacked Drive scope: "${tokens.scope}"`);
      const scopeError = 'Google Drive permission was not granted. On the Google consent screen, you must check the box to allow Sangam to access and create files in Google Drive.';
      if (req.accepts('html')) {
        return res.redirect(`${frontendUrl}/teacher?storage_status=error&error=${encodeURIComponent(scopeError)}`);
      }
      return res.status(403).json({
        success: false,
        error: scopeError
      });
    }

    // 5. Fetch verified Google user profile directly from Google API
    const profile = await googleDriveService.fetchUserProfile(tokens.access_token);

    // 6. Encrypt tokens and save integration metadata in Firestore
    await googleDriveService.saveIntegration(teacherUid, { tokens, profile });

    console.log(`[StorageRoutes] Successfully connected Google Drive for teacher: ${teacherUid} (${profile.email})`);

    // 7. Redirect back to Sangam frontend with status flag
    if (req.accepts('html')) {
      return res.redirect(`${frontendUrl}/teacher?storage_status=connected&provider=google`);
    }

    return res.json({
      success: true,
      message: 'Google Drive connected successfully.',
      accountEmail: profile.email
    });
  } catch (exchangeError) {
    console.error('[StorageRoutes] OAuth exchange failed:', exchangeError.message);
    if (req.accepts('html')) {
      return res.redirect(`${frontendUrl}/teacher?storage_status=error&error=${encodeURIComponent(exchangeError.message)}`);
    }
    return res.status(500).json({
      success: false,
      error: `OAuth exchange failed: ${exchangeError.message}`
    });
  }
});

/**
 * GET /api/storage/status
 * Retrieves current cloud storage connection status for the authenticated teacher.
 * Protected by verifyFirebaseToken.
 * Strictly avoids exposing any tokens, ciphertext, or keys.
 */
router.get('/status', verifyFirebaseToken, async (req, res) => {
  try {
    const teacherUid = req.userId;
    const record = await googleDriveService.getIntegration(teacherUid);

    if (!record || record.status === 'disconnected') {
      return res.json({
        success: true,
        connected: false,
        provider: null
      });
    }

    // Validate if the stored integration actually possesses Google Drive scope
    const grantedScopes = (record.scope || '').split(' ');
    const hasDriveScope = grantedScopes.some(
      (s) => s === 'https://www.googleapis.com/auth/drive.file' || s === 'https://www.googleapis.com/auth/drive'
    );
    const isConnected = record.status === 'connected' && hasDriveScope;

    // Return safe presentation metadata only
    return res.json({
      success: true,
      connected: isConnected,
      provider: record.provider,
      accountEmail: record.accountEmail,
      accountName: record.accountName || '',
      status: hasDriveScope ? record.status : 'insufficient_scope',
      error: hasDriveScope ? null : 'Google Drive permission was not granted. Please reconnect your account and check the Google Drive permissions box.',
      connectedAt: record.connectedAt,
      updatedAt: record.updatedAt,
      tokenExpiresAt: record.tokenExpiresAt,
      folderReady: Boolean(record.rootFolderId)
    });
  } catch (error) {
    console.error('[StorageRoutes] Failed to fetch storage status:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/storage/google/init-folder
 * Idempotently initializes the private 'Sangam Coursework' root folder in Google Drive.
 * Protected by verifyFirebaseToken and validates teacher/faculty role.
 * Never accepts arbitrary folder IDs or exposes credentials.
 */
router.post('/google/init-folder', verifyFirebaseToken, async (req, res) => {
  try {
    const teacherUid = req.userId;
    if (!teacherUid) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: User identity could not be verified.'
      });
    }

    // Role check: Authoritative server-side validation against users collection
    const db = googleDriveService.getDb();
    const userSnap = await db.collection('users').doc(teacherUid).get();
    if (!userSnap.exists) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: User profile not found.'
      });
    }

    const userData = userSnap.data();
    const role = (userData.role || '').toLowerCase();
    if (role !== 'faculty' && role !== 'teacher' && role !== 'director') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Only faculty members can manage coursework folders.'
      });
    }

    // Idempotently get or create Sangam Coursework folder
    const folder = await googleDriveService.getOrCreateCourseworkFolder(teacherUid);

    return res.json({
      success: true,
      ready: true,
      folderName: folder.name || 'Sangam Coursework',
      message: 'Sangam Coursework folder is ready.'
    });
  } catch (error) {
    console.error('[StorageRoutes] Failed to initialize coursework folder:', error.message);
    const msg = error.message || 'Failed to initialize coursework folder.';
    const isAuth = msg.includes('revoked') || msg.includes('expired') || msg.includes('not active') || msg.includes('No Google Drive integration');
    return res.status(isAuth ? 400 : 500).json({
      success: false,
      error: msg
    });
  }
});

/**
 * POST /api/storage/disconnect
 * Disconnects cloud storage integration, revokes token grant, and deletes stored credentials.
 * Protected by verifyFirebaseToken.
 */
router.post('/disconnect', verifyFirebaseToken, async (req, res) => {
  try {
    const teacherUid = req.userId;
    const result = await googleDriveService.disconnect(teacherUid);

    return res.json({
      success: true,
      revoked: result.revoked,
      message: result.message
    });
  } catch (error) {
    console.error('[StorageRoutes] Failed to disconnect storage:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Temporary upload directory and multer configuration for assignment PDFs.
 * Enforces configurable file size limit (default 15MB) and single-file constraint.
 */
const ASSIGNMENTS_TEMP_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), 'uploads', 'assignments')
  : path.join(process.cwd(), 'uploads', 'assignments');
try {
  if (!fs.existsSync(ASSIGNMENTS_TEMP_DIR)) {
    fs.mkdirSync(ASSIGNMENTS_TEMP_DIR, { recursive: true });
  }
} catch {
  // Gracefully handle read-only environments
}

export const MAX_ASSIGNMENT_FILE_SIZE = parseInt(
  process.env.MAX_ASSIGNMENT_FILE_SIZE || `${15 * 1024 * 1024}`,
  10
);

const assignmentMulter = multer({
  dest: ASSIGNMENTS_TEMP_DIR,
  limits: {
    fileSize: MAX_ASSIGNMENT_FILE_SIZE,
    files: 1
  }
});

/**
 * Middleware handling assignment file upload errors (e.g. LIMIT_FILE_SIZE -> 413).
 */
export function handleAssignmentFileUpload(req, res, next) {
  assignmentMulter.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          success: false,
          code: 'FILE_TOO_LARGE',
          error: `File size exceeds maximum allowed limit (${Math.round(MAX_ASSIGNMENT_FILE_SIZE / (1024 * 1024))}MB).`
        });
      }
      return res.status(400).json({
        success: false,
        code: 'UPLOAD_ERROR',
        error: `File upload error: ${err.message}`
      });
    }
    next();
  });
}

/**
 * Upload assignment PDF handler.
 * Validates declared MIME type and '%PDF-' magic bytes, enforces class allocation authorization,
 * uploads privately to teacher's Google Drive, persists assignment metadata in Firestore,
 * and guarantees temporary file deletion in a finally block on every path.
 */
export async function handleUploadAssignment(req, res) {
  const file = req.file;
  if (!file) {
    return res.status(400).json({
      success: false,
      code: 'MISSING_FILE',
      error: 'Missing file: PDF assignment document is required in form-data field "file".'
    });
  }

  try {
    // 1. Validate non-empty file
    if (file.size === 0) {
      return res.status(400).json({
        success: false,
        code: 'EMPTY_FILE',
        error: 'File is empty (0 bytes). Uploaded assignment must contain content.'
      });
    }

    // 2. Validate declared MIME type
    const allowedMimeTypes = ['application/pdf', 'application/x-pdf'];
    if (!file.mimetype || !allowedMimeTypes.includes(file.mimetype.toLowerCase())) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_MIME_TYPE',
        error: `Invalid file MIME type '${file.mimetype}'. Only PDF documents are accepted.`
      });
    }

    // 3. Validate magic bytes signature (%PDF-)
    let magicBuffer = Buffer.alloc(5);
    try {
      const fd = await fs.promises.open(file.path, 'r');
      await fd.read(magicBuffer, 0, 5, 0);
      await fd.close();
    } catch (readErr) {
      return res.status(400).json({
        success: false,
        code: 'UNREADABLE_FILE',
        error: `Failed to read uploaded file signature: ${readErr.message}`
      });
    }

    if (magicBuffer.toString('utf-8') !== '%PDF-') {
      return res.status(400).json({
        success: false,
        code: 'INVALID_PDF_SIGNATURE',
        error: 'Invalid PDF signature. The uploaded file does not begin with the %PDF- magic bytes.'
      });
    }

    // Read complete file buffer for Google Drive upload
    const fileBuffer = await fs.promises.readFile(file.path);

    // Derive teacher identity exclusively from the verified Firebase ID token
    const teacherUid = req.userId;
    const teacherEmail = req.userEmail;

    const {
      title,
      department,
      year,
      section,
      dueDate,
      description,
      subject,
      checkSimilarity
    } = req.body || {};

    const idempotencyKey = req.headers['x-idempotency-key'] || (req.body && req.body.idempotencyKey) || null;

    const result = await googleDriveService.uploadAssignmentPdf({
      teacherUid,
      teacherEmail,
      fileBuffer,
      originalFileName: file.originalname,
      fileSize: file.size,
      assignmentData: {
        title,
        department,
        year,
        section,
        dueDate,
        description,
        subject,
        checkSimilarity: checkSimilarity === true || checkSimilarity === 'true'
      },
      idempotencyKey
    });

    if (result.isReplay) {
      res.setHeader('X-Idempotent-Replay', 'true');
    }

    return res.status(result.isReplay ? 200 : 201).json({
      success: true,
      message: result.isReplay
        ? 'Assignment already recorded (idempotent replay).'
        : 'Assignment PDF uploaded and recorded successfully.',
      assignment: result.assignment
    });

  } catch (error) {
    console.error('[StorageRoutes] Assignment upload failed:', error.message);
    const statusCode = error.statusCode || (error.message.includes('revoked') || error.message.includes('expired') ? 401 : 500);

    return res.status(statusCode).json({
      success: false,
      code: error.code || 'UPLOAD_FAILED',
      error: error.message
    });
  } finally {
    // Guaranteed temporary file cleanup on every success and failure path
    if (file && file.path && fs.existsSync(file.path)) {
      try {
        fs.unlinkSync(file.path);
      } catch (cleanupErr) {
        console.warn('[StorageRoutes] Failed to clean up temp file:', file.path, cleanupErr.message);
      }
    }
  }
}

export const SUBMISSIONS_TEMP_DIR = process.env.VERCEL
  ? path.resolve(os.tmpdir(), 'uploads/submissions')
  : path.resolve(process.cwd(), 'uploads/submissions');
try {
  if (!fs.existsSync(SUBMISSIONS_TEMP_DIR)) {
    fs.mkdirSync(SUBMISSIONS_TEMP_DIR, { recursive: true });
  }
} catch {
  // Gracefully handle read-only environments
}

export const MAX_SUBMISSION_FILE_SIZE = parseInt(
  process.env.MAX_SUBMISSION_FILE_SIZE || process.env.MAX_ASSIGNMENT_FILE_SIZE || `${15 * 1024 * 1024}`,
  10
);

const submissionMulter = multer({
  dest: SUBMISSIONS_TEMP_DIR,
  limits: {
    fileSize: MAX_SUBMISSION_FILE_SIZE,
    files: 1
  }
});

/**
 * Middleware handling student submission file upload errors (e.g. LIMIT_FILE_SIZE -> 413).
 */
export function handleSubmissionFileUpload(req, res, next) {
  submissionMulter.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          success: false,
          code: 'FILE_TOO_LARGE',
          error: `File size exceeds maximum allowed limit (${Math.round(MAX_SUBMISSION_FILE_SIZE / (1024 * 1024))}MB).`
        });
      }
      return res.status(400).json({
        success: false,
        code: 'UPLOAD_ERROR',
        error: `File upload error: ${err.message}`
      });
    }
    next();
  });
}

/**
 * Student assignment PDF submission handler.
 * Validates declared MIME type, .pdf extension, non-empty file, and '%PDF-' magic bytes signature.
 * Verifies student role, class scope, due-date, and teacher Google Drive integration.
 * Performs private upload to teacher's Google Drive and persists submission metadata in Firestore.
 * Always guarantees temporary file cleanup in a finally block on every path.
 */
export async function handleUploadSubmission(req, res) {
  const file = req.file;
  if (!file) {
    return res.status(400).json({
      success: false,
      code: 'MISSING_FILE',
      error: 'Missing file: PDF assignment submission document is required in form-data field "file".'
    });
  }

  try {
    // 1. Validate non-empty file
    if (file.size === 0) {
      return res.status(400).json({
        success: false,
        code: 'EMPTY_FILE',
        error: 'File is empty (0 bytes). Uploaded submission must contain content.'
      });
    }

    // 2. Validate declared MIME type
    const allowedMimeTypes = ['application/pdf', 'application/x-pdf'];
    if (!file.mimetype || !allowedMimeTypes.includes(file.mimetype.toLowerCase())) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_MIME_TYPE',
        error: `Invalid file MIME type '${file.mimetype}'. Only PDF documents are accepted.`
      });
    }

    // 3. Validate file extension (.pdf)
    const fileExt = path.extname(file.originalname || '').toLowerCase();
    if (fileExt !== '.pdf') {
      return res.status(400).json({
        success: false,
        code: 'INVALID_FILE_EXTENSION',
        error: `Invalid file extension '${fileExt}'. Only .pdf files are accepted.`
      });
    }

    // 4. Validate magic bytes signature (%PDF-)
    let magicBuffer = Buffer.alloc(5);
    try {
      const fd = await fs.promises.open(file.path, 'r');
      await fd.read(magicBuffer, 0, 5, 0);
      await fd.close();
    } catch (readErr) {
      return res.status(400).json({
        success: false,
        code: 'UNREADABLE_FILE',
        error: `Failed to read uploaded file signature: ${readErr.message}`
      });
    }

    if (magicBuffer.toString('utf-8') !== '%PDF-') {
      return res.status(400).json({
        success: false,
        code: 'INVALID_PDF_SIGNATURE',
        error: 'Invalid PDF signature. The uploaded file does not begin with the %PDF- magic bytes.'
      });
    }

    // 5. Read complete file buffer
    const fileBuffer = await fs.promises.readFile(file.path);

    // 6. Derive student identity exclusively from verified Firebase ID token
    const studentUid = req.userId;
    const studentEmail = req.userEmail;

    const { assignmentId } = req.body || {};
    if (!assignmentId || typeof assignmentId !== 'string' || !assignmentId.trim()) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_ASSIGNMENT_ID',
        error: 'Missing required field: assignmentId is required in form body.'
      });
    }

    const idempotencyKey = req.headers['x-idempotency-key'] || (req.body && req.body.idempotencyKey) || null;

    const result = await googleDriveService.uploadStudentSubmission({
      studentUid,
      studentEmail,
      assignmentId: assignmentId.trim(),
      fileBuffer,
      originalFileName: file.originalname,
      fileSize: file.size,
      idempotencyKey
    });

    if (result.isReplay) {
      res.setHeader('X-Idempotent-Replay', 'true');
    }

    return res.status(result.isReplay ? 200 : 201).json({
      success: true,
      message: result.isReplay
        ? 'Submission already recorded (idempotent replay).'
        : 'Assignment submission uploaded and recorded successfully.',
      submission: result.submission
    });

  } catch (error) {
    console.error('[StorageRoutes] Student submission upload failed:', error.message);
    const statusCode = error.statusCode || (error.message.includes('revoked') || error.message.includes('expired') ? 401 : 500);

    return res.status(statusCode).json({
      success: false,
      code: error.code || 'SUBMISSION_FAILED',
      error: error.message
    });
  } finally {
    // Guaranteed temporary file cleanup on every success and failure path
    if (file && file.path && fs.existsSync(file.path)) {
      try {
        fs.unlinkSync(file.path);
      } catch (cleanupErr) {
        console.warn('[StorageRoutes] Failed to clean up temp submission file:', file.path, cleanupErr.message);
      }
    }
  }
}

/**
 * GET /api/submissions/my-submissions
 * GET /api/submissions
 * Retrieves all submissions created by the authenticated student.
 */
export async function handleGetStudentSubmissions(req, res) {
  try {
    const studentUid = req.userId;
    if (!studentUid) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Student identity could not be verified.'
      });
    }

    const submissions = await googleDriveService.getStudentSubmissions(studentUid);
    return res.json({
      success: true,
      submissions
    });
  } catch (error) {
    console.error('[StorageRoutes] Failed to fetch student submissions:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * GET /api/submissions/assignment/:assignmentId
 * Retrieves the submission for a specific assignment for the authenticated student.
 */
export async function handleGetAssignmentSubmission(req, res) {
  try {
    const studentUid = req.userId;
    const { assignmentId } = req.params;
    if (!studentUid) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    const submission = await googleDriveService.getAssignmentSubmission(assignmentId, studentUid);
    return res.json({
      success: true,
      submission: submission || null
    });
  } catch (error) {
    console.error('[StorageRoutes] Failed to get assignment submission:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * GET /api/assignments
 * GET /api/assignments/my-assignments
 * Retrieves all assignments accessible to the authenticated user.
 * - For students: returns assignments matching the student's department, year, and section with submission status.
 * - For teachers: returns assignments created by the teacher.
 */
export async function handleGetAssignments(req, res) {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: User identity could not be verified.'
      });
    }

    const assignments = await googleDriveService.getAssignmentsForUser(userId);
    return res.json({
      success: true,
      assignments
    });
  } catch (error) {
    console.error('[StorageRoutes] Failed to fetch assignments:', error.message);
    return res.status(error.statusCode || 500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * GET /api/assignments/:assignmentId/file
 * GET /api/assignments/:assignmentId/download
 * Downloads the original teacher-uploaded assignment PDF from Google Drive.
 * Securely enforces role and class scope authorization on the backend,
 * retrieves the file using the owning teacher's credentials,
 * and streams the binary to the client without exposing tokens.
 */
export async function handleDownloadAssignmentFile(req, res) {
  try {
    const userId = req.userId;
    const { assignmentId } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: User identity could not be verified.'
      });
    }

    if (!assignmentId) {
      return res.status(400).json({
        success: false,
        error: 'assignmentId is required.'
      });
    }

    const { fileBuffer, fileName, mimeType } = await googleDriveService.getAssignmentFile(
      assignmentId,
      userId
    );

    res.setHeader('Content-Type', mimeType || 'application/pdf');
    res.setHeader('Content-Length', fileBuffer.length);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
    );
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');

    return res.send(fileBuffer);
  } catch (error) {
    console.error('[StorageRoutes] Failed to download assignment file:', error.message);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      code: error.code || 'DOWNLOAD_FAILED',
      error: error.message
    });
  }
}

/**
 * GET /api/assignments/:assignmentId/submissions
 * Retrieves all submissions for an assignment for an authorized teacher/director.
 * Students and unauthorized faculty are rejected with 403 Forbidden.
 */
export async function handleGetAssignmentSubmissions(req, res) {
  try {
    const userId = req.userId;
    const { assignmentId } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: User identity could not be verified.'
      });
    }

    if (!assignmentId) {
      return res.status(400).json({
        success: false,
        error: 'assignmentId is required.'
      });
    }

    const result = await googleDriveService.getAssignmentSubmissions(assignmentId, userId);
    return res.json(result);
  } catch (error) {
    console.error('[StorageRoutes] Failed to get assignment submissions:', error.message);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      code: error.code || 'SUBMISSIONS_FETCH_FAILED',
      error: error.message
    });
  }
}

/**
 * GET /api/submissions/:submissionId/file
 * GET /api/submissions/:submissionId/download
 * Downloads a student submission PDF from Google Drive.
 * Authorized for the student who submitted or the authorized teacher/director.
 */
export async function handleDownloadSubmissionFile(req, res) {
  try {
    const userId = req.userId;
    const { submissionId } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: User identity could not be verified.'
      });
    }

    if (!submissionId) {
      return res.status(400).json({
        success: false,
        error: 'submissionId is required.'
      });
    }

    const { fileBuffer, fileName, mimeType } = await googleDriveService.getSubmissionFile(
      submissionId,
      userId
    );

    res.setHeader('Content-Type', mimeType || 'application/pdf');
    res.setHeader('Content-Length', fileBuffer.length);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
    );
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');

    return res.send(fileBuffer);
  } catch (error) {
    console.error('[StorageRoutes] Failed to download submission file:', error.message);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      code: error.code || 'DOWNLOAD_FAILED',
      error: error.message
    });
  }
}

/**
 * GET /api/students
 * GET /api/students/section
 * Retrieves real active student profiles in a class section for authorized faculty/director.
 * Students cannot access section rosters.
 */
export async function handleGetSectionStudents(req, res) {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: User identity could not be verified.'
      });
    }

    const { department, year, section, institution } = req.query;
    const result = await googleDriveService.getStudentsForSection({
      department,
      year,
      section,
      institution,
      requestingUserId: userId
    });

    return res.json(result);
  } catch (error) {
    console.error('[StorageRoutes] Failed to fetch section students:', error.message);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      code: error.code || 'STUDENTS_FETCH_FAILED',
      error: error.message
    });
  }
}

// -----------------------------------------------------------------------------
// Student Directory Routes (mounted at /api/students)
// -----------------------------------------------------------------------------
export const studentRouter = express.Router();
studentRouter.get('/', verifyFirebaseToken, handleGetSectionStudents);
studentRouter.get('/section', verifyFirebaseToken, handleGetSectionStudents);

// -----------------------------------------------------------------------------
// Teacher Assignment Routes (mounted at /api/assignments)
// -----------------------------------------------------------------------------
assignmentRouter.get('/', verifyFirebaseToken, handleGetAssignments);
assignmentRouter.get('/my-assignments', verifyFirebaseToken, handleGetAssignments);
assignmentRouter.get('/:assignmentId/submissions', verifyFirebaseToken, handleGetAssignmentSubmissions);
assignmentRouter.get('/:assignmentId/submissions/:submissionId/file', verifyFirebaseToken, handleDownloadSubmissionFile);
assignmentRouter.get('/:assignmentId/submissions/:submissionId/download', verifyFirebaseToken, handleDownloadSubmissionFile);
assignmentRouter.get('/:assignmentId/file', verifyFirebaseToken, handleDownloadAssignmentFile);
assignmentRouter.get('/:assignmentId/download', verifyFirebaseToken, handleDownloadAssignmentFile);
assignmentRouter.post('/upload', verifyFirebaseToken, handleAssignmentFileUpload, handleUploadAssignment);
assignmentRouter.post('/upload-assignment', verifyFirebaseToken, handleAssignmentFileUpload, handleUploadAssignment);
assignmentRouter.post('/google/upload-assignment', verifyFirebaseToken, handleAssignmentFileUpload, handleUploadAssignment);

// -----------------------------------------------------------------------------
// Student Submission Routes (mounted at /api/submissions)
// -----------------------------------------------------------------------------
submissionRouter.post('/upload', verifyFirebaseToken, handleSubmissionFileUpload, handleUploadSubmission);
submissionRouter.post('/upload-submission', verifyFirebaseToken, handleSubmissionFileUpload, handleUploadSubmission);
submissionRouter.post('/submissions/upload', verifyFirebaseToken, handleSubmissionFileUpload, handleUploadSubmission);
submissionRouter.get('/my-submissions', verifyFirebaseToken, handleGetStudentSubmissions);
submissionRouter.get('/submissions/my-submissions', verifyFirebaseToken, handleGetStudentSubmissions);
submissionRouter.get('/', verifyFirebaseToken, handleGetStudentSubmissions);
submissionRouter.get('/assignment/:assignmentId', verifyFirebaseToken, handleGetAssignmentSubmission);
submissionRouter.get('/submissions/assignment/:assignmentId', verifyFirebaseToken, handleGetAssignmentSubmission);
submissionRouter.get('/:submissionId/file', verifyFirebaseToken, handleDownloadSubmissionFile);
submissionRouter.get('/:submissionId/download', verifyFirebaseToken, handleDownloadSubmissionFile);

// -----------------------------------------------------------------------------
// Storage Router Compatibility & Aliases (mounted at /api/storage)
// -----------------------------------------------------------------------------
storageRouter.get('/assignments', verifyFirebaseToken, handleGetAssignments);
storageRouter.get('/assignments/:assignmentId/submissions', verifyFirebaseToken, handleGetAssignmentSubmissions);
storageRouter.get('/assignments/:assignmentId/file', verifyFirebaseToken, handleDownloadAssignmentFile);
storageRouter.get('/assignments/:assignmentId/download', verifyFirebaseToken, handleDownloadAssignmentFile);
storageRouter.get('/submissions/:submissionId/file', verifyFirebaseToken, handleDownloadSubmissionFile);
storageRouter.get('/submissions/:submissionId/download', verifyFirebaseToken, handleDownloadSubmissionFile);
storageRouter.get('/students', verifyFirebaseToken, handleGetSectionStudents);
storageRouter.get('/students/section', verifyFirebaseToken, handleGetSectionStudents);
storageRouter.post('/google/upload-assignment', verifyFirebaseToken, handleAssignmentFileUpload, handleUploadAssignment);
storageRouter.post('/upload-assignment', verifyFirebaseToken, handleAssignmentFileUpload, handleUploadAssignment);
storageRouter.use('/assignments', assignmentRouter);
storageRouter.use('/submissions', submissionRouter);
storageRouter.use('/students', studentRouter);

export {
  assignmentRouter as assignmentRoutes,
  submissionRouter as submissionRoutes,
  studentRouter as studentRoutes
};

export default storageRouter;



