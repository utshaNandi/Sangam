import express from 'express';
import { verifyFirebaseToken } from '../middleware/authMiddleware.js';
import { announcementService } from '../services/announcementService.js';

export const announcementRouter = express.Router();
const router = announcementRouter;

/**
 * POST /api/announcements
 * Creates a new official announcement.
 *
 * Enforces server-side authorization:
 * - Director: may publish institution-wide, department-wide, department+year, or section announcements within their authorized institution.
 * - Teacher: may publish ONLY to sections listed in their active authorized teacher_allocations.
 * - Student: strictly forbidden from publishing official announcements (403).
 * - Inactive or pending accounts are blocked (403).
 */
router.post('/', verifyFirebaseToken, async (req, res) => {
  try {
    const callerUid = req.userId;
    if (!callerUid) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: User identity could not be verified.'
      });
    }

    const {
      title,
      content,
      scopeType,
      department,
      year,
      section,
      priority,
      category
    } = req.body || {};

    const announcement = await announcementService.createAnnouncement({
      callerUid,
      title,
      content,
      scopeType,
      department,
      year,
      section,
      priority,
      category
    });

    return res.status(201).json({
      success: true,
      message: 'Announcement published successfully.',
      announcement
    });
  } catch (error) {
    console.error('[AnnouncementRoutes] Publish failed:', error.message);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      code: error.code || 'ANNOUNCEMENT_PUBLISH_FAILED',
      error: error.message
    });
  }
});

/**
 * GET /api/announcements
 * Retrieves announcements scoped for the authenticated user with pagination.
 *
 * Scoping rules:
 * - Student: restricted to their institution, department, year, and section, plus institution-wide and department-wide announcements.
 * - Teacher: scoped to their institution, department, and authorized sections, plus applicable institution-wide announcements.
 * - Director: scoped to all announcements within their authorized institution.
 *
 * Supports ?page=1&limit=50 query parameters (max limit: 100).
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

    const { page, limit, authorRole, authorRoles } = req.query;

    const result = await announcementService.getAnnouncementsForUser({
      callerUid,
      page,
      limit,
      authorRoles: authorRole || authorRoles
    });

    return res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('[AnnouncementRoutes] Fetch failed:', error.message);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      code: error.code || 'ANNOUNCEMENT_FETCH_FAILED',
      error: error.message
    });
  }
});

/**
 * GET /api/announcements/dashboard
 * Retrieves up to 4 Director and HOD announcements for the dashboard panel.
 * Strictly enforces server-side scoping and role filtering.
 */
router.get('/dashboard', verifyFirebaseToken, async (req, res) => {
  try {
    const callerUid = req.userId;
    if (!callerUid) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: User identity could not be verified.'
      });
    }

    const { limit = 4 } = req.query;
    const result = await announcementService.getDashboardAnnouncements({
      callerUid,
      limit: parseInt(limit, 10) || 4
    });

    return res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('[AnnouncementRoutes] Fetch dashboard announcements failed:', error.message);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      code: error.code || 'ANNOUNCEMENT_FETCH_FAILED',
      error: error.message
    });
  }
});

/**
 * GET /api/announcements/:id
 * Retrieves a single announcement by ID if caller has scoped read permission.
 */
router.get('/:id', verifyFirebaseToken, async (req, res) => {
  try {
    const callerUid = req.userId;
    const { id } = req.params;

    if (!callerUid) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: User identity could not be verified.'
      });
    }

    const announcement = await announcementService.getAnnouncementById({
      announcementId: id,
      callerUid
    });

    return res.json({
      success: true,
      announcement
    });
  } catch (error) {
    console.error('[AnnouncementRoutes] Fetch by ID failed:', error.message);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      code: error.code || 'ANNOUNCEMENT_FETCH_FAILED',
      error: error.message
    });
  }
});

export default router;
