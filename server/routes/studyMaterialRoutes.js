import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import { verifyFirebaseToken } from '../middleware/authMiddleware.js';
import { studyMaterialService } from '../services/studyMaterialService.js';

export const studyMaterialRouter = express.Router();
const router = studyMaterialRouter;

/**
 * Temporary upload directory and multer configuration for study materials.
 * Enforces configurable file size limit (default 25MB).
 */
const STUDY_MATERIALS_TEMP_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), 'uploads', 'study-materials')
  : path.join(process.cwd(), 'uploads', 'study-materials');

try {
  if (!fs.existsSync(STUDY_MATERIALS_TEMP_DIR)) {
    fs.mkdirSync(STUDY_MATERIALS_TEMP_DIR, { recursive: true });
  }
} catch {
  // Gracefully handle read-only environments
}

export const MAX_STUDY_MATERIAL_FILE_SIZE = parseInt(
  process.env.MAX_STUDY_MATERIAL_FILE_SIZE || `${25 * 1024 * 1024}`,
  10
);

const studyMaterialMulter = multer({
  dest: STUDY_MATERIALS_TEMP_DIR,
  limits: {
    fileSize: MAX_STUDY_MATERIAL_FILE_SIZE,
    files: 1
  }
});

/**
 * Middleware handling file upload errors (e.g. LIMIT_FILE_SIZE -> 413).
 */
export function handleStudyMaterialFileUpload(req, res, next) {
  studyMaterialMulter.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          success: false,
          code: 'FILE_TOO_LARGE',
          error: `File size exceeds maximum allowed limit (${Math.round(MAX_STUDY_MATERIAL_FILE_SIZE / (1024 * 1024))}MB).`
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
 * Upload study material handler.
 * Uploads file privately to the authenticated teacher's Google Drive,
 * records metadata in Firestore collection `study_materials`,
 * and guarantees temporary file cleanup in a finally block on every path.
 */
export async function handleUploadStudyMaterial(req, res) {
  const file = req.file;
  if (!file) {
    return res.status(400).json({
      success: false,
      code: 'MISSING_FILE',
      error: 'Missing file: Document or study material file is required in form-data field "file".'
    });
  }

  try {
    if (file.size === 0) {
      return res.status(400).json({
        success: false,
        code: 'EMPTY_FILE',
        error: 'File is empty (0 bytes). Uploaded study material must contain content.'
      });
    }

    const fileBuffer = await fs.promises.readFile(file.path);
    const callerUid = req.userId;
    const callerEmail = req.userEmail;

    const {
      title,
      subjectId,
      department,
      year,
      scope,
      section,
      category,
      description,
      isPublished
    } = req.body || {};

    const material = await studyMaterialService.uploadStudyMaterial({
      callerUid,
      callerEmail,
      fileBuffer,
      originalFileName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype || 'application/pdf',
      metadata: {
        title,
        subjectId,
        department,
        year,
        scope,
        section,
        category,
        description,
        isPublished: isPublished === undefined ? true : (isPublished === true || isPublished === 'true')
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Study material uploaded to Google Drive and recorded successfully.',
      material
    });
  } catch (error) {
    console.error('[StudyMaterialRoutes] Upload failed:', error.message);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      code: error.code || 'UPLOAD_FAILED',
      error: error.message
    });
  } finally {
    // Guaranteed cleanup of temporary upload file
    if (file && file.path && fs.existsSync(file.path)) {
      try {
        fs.unlinkSync(file.path);
      } catch (cleanupErr) {
        console.warn('[StudyMaterialRoutes] Failed to clean up temp file:', file.path, cleanupErr.message);
      }
    }
  }
}

/**
 * POST /api/study-materials
 * POST /api/study-materials/upload
 * Uploads a new study material to teacher's Google Drive.
 * Protected by verifyFirebaseToken.
 */
router.post('/upload', verifyFirebaseToken, handleStudyMaterialFileUpload, handleUploadStudyMaterial);
router.post('/', verifyFirebaseToken, handleStudyMaterialFileUpload, handleUploadStudyMaterial);

/**
 * GET /api/study-materials
 * Retrieves study materials matching the authenticated caller's academic scope and role permissions.
 * Protected by verifyFirebaseToken.
 */
router.get('/', verifyFirebaseToken, async (req, res) => {
  try {
    const callerUid = req.userId;
    if (!callerUid) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: User identity could not be verified.'
      });
    }

    const { subjectId, department, year, section, category, scope } = req.query;

    const materials = await studyMaterialService.getStudyMaterialsForUser({
      callerUid,
      subjectId,
      department,
      year,
      section,
      category,
      scope
    });

    return res.json({
      success: true,
      materials
    });
  } catch (error) {
    console.error('[StudyMaterialRoutes] Failed to fetch materials:', error.message);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      code: error.code || 'MATERIALS_FETCH_FAILED',
      error: error.message
    });
  }
});

/**
 * GET /api/study-materials/:materialId
 * Retrieves metadata for a single study material.
 * Protected by verifyFirebaseToken.
 */
router.get('/:materialId', verifyFirebaseToken, async (req, res) => {
  try {
    const callerUid = req.userId;
    if (!callerUid) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: User identity could not be verified.'
      });
    }

    const { materialId } = req.params;
    const material = await studyMaterialService.getStudyMaterialById({ callerUid, materialId });

    return res.json({
      success: true,
      material
    });
  } catch (error) {
    console.error('[StudyMaterialRoutes] Failed to fetch material:', error.message);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      code: error.code || 'MATERIAL_FETCH_FAILED',
      error: error.message
    });
  }
});

/**
 * GET /api/study-materials/:materialId/download
 * GET /api/study-materials/:materialId/file
 * Downloads study material file directly from Google Drive through authenticated backend streaming.
 * Protected by verifyFirebaseToken.
 */
const handleDownloadFile = async (req, res) => {
  try {
    const callerUid = req.userId;
    if (!callerUid) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: User identity could not be verified.'
      });
    }

    const { materialId } = req.params;
    const { fileBuffer, fileName, mimeType } = await studyMaterialService.getStudyMaterialFile({
      callerUid,
      materialId
    });

    res.setHeader('Content-Type', mimeType || 'application/pdf');
    res.setHeader('Content-Length', fileBuffer.length);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
    );
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');

    return res.send(fileBuffer);
  } catch (error) {
    console.error('[StudyMaterialRoutes] Download failed:', error.message);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      code: error.code || 'DOWNLOAD_FAILED',
      error: error.message
    });
  }
};

router.get('/:materialId/download', verifyFirebaseToken, handleDownloadFile);
router.get('/:materialId/file', verifyFirebaseToken, handleDownloadFile);

/**
 * PATCH /api/study-materials/:materialId/publish
 * POST /api/study-materials/:materialId/publish
 * Updates the publication status (publish / unpublish).
 * Protected by verifyFirebaseToken (authoring teacher or Director only).
 */
const handlePublishToggle = async (req, res) => {
  try {
    const callerUid = req.userId;
    if (!callerUid) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: User identity could not be verified.'
      });
    }

    const { materialId } = req.params;
    const isPublished = req.body && req.body.isPublished !== undefined
      ? Boolean(req.body.isPublished)
      : true;

    const result = await studyMaterialService.setPublishStatus({
      callerUid,
      materialId,
      isPublished
    });

    return res.json({
      success: true,
      message: isPublished ? 'Study material published successfully.' : 'Study material unpublished successfully.',
      material: result.material || result
    });
  } catch (error) {
    console.error('[StudyMaterialRoutes] Publish update failed:', error.message);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      code: error.code || 'PUBLISH_UPDATE_FAILED',
      error: error.message
    });
  }
};

router.patch('/:materialId/publish', verifyFirebaseToken, handlePublishToggle);
router.post('/:materialId/publish', verifyFirebaseToken, handlePublishToggle);

/**
 * POST /api/study-materials/:materialId/unpublish
 * Convenience endpoint to immediately unpublish a material.
 * Protected by verifyFirebaseToken (authoring teacher or Director only).
 */
router.post('/:materialId/unpublish', verifyFirebaseToken, async (req, res) => {
  try {
    const callerUid = req.userId;
    if (!callerUid) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: User identity could not be verified.'
      });
    }

    const { materialId } = req.params;
    const result = await studyMaterialService.setPublishStatus({
      callerUid,
      materialId,
      isPublished: false
    });

    return res.json({
      success: true,
      message: 'Study material unpublished successfully. Student access is immediately revoked.',
      material: result.material || result
    });
  } catch (error) {
    console.error('[StudyMaterialRoutes] Unpublish failed:', error.message);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      code: error.code || 'UNPUBLISH_FAILED',
      error: error.message
    });
  }
});

/**
 * DELETE /api/study-materials/:materialId
 * Safely deletes a study material record.
 * Protected by verifyFirebaseToken (authoring teacher or Director only).
 */
router.delete('/:materialId', verifyFirebaseToken, async (req, res) => {
  try {
    const callerUid = req.userId;
    if (!callerUid) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: User identity could not be verified.'
      });
    }

    const { materialId } = req.params;
    const result = await studyMaterialService.deleteStudyMaterial({ callerUid, materialId });

    return res.json(result);
  } catch (error) {
    console.error('[StudyMaterialRoutes] Delete failed:', error.message);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      code: error.code || 'MATERIAL_DELETE_FAILED',
      error: error.message
    });
  }
});

export default studyMaterialRouter;
