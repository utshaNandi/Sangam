import express from 'express';
import { verifyFirebaseToken } from '../middleware/authMiddleware.js';
import { subjectService } from '../services/subjectService.js';

export const subjectRouter = express.Router();
const router = subjectRouter;

/**
 * POST /api/subjects
 * Creates a new academic curriculum subject.
 * Protected by verifyFirebaseToken (Director / Admin only).
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

    const { name, code, department, year, institution, description } = req.body || {};

    const subject = await subjectService.createSubject({
      callerUid,
      name,
      code,
      department,
      year,
      institution,
      description
    });

    return res.status(201).json({
      success: true,
      message: 'Subject created successfully.',
      subject
    });
  } catch (error) {
    console.error('[SubjectRoutes] Failed to create subject:', error.message);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      code: error.code || 'SUBJECT_CREATE_FAILED',
      error: error.message
    });
  }
});

/**
 * GET /api/subjects
 * Retrieves subjects filtered by academic scope and role permissions.
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

    const { department, year, institution } = req.query;

    const subjects = await subjectService.getSubjects({
      callerUid,
      department,
      year,
      institution
    });

    return res.json({
      success: true,
      subjects
    });
  } catch (error) {
    console.error('[SubjectRoutes] Failed to fetch subjects:', error.message);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      code: error.code || 'SUBJECT_FETCH_FAILED',
      error: error.message
    });
  }
});

/**
 * GET /api/subjects/my-subjects
 * Retrieves all subjects assigned to the authenticated faculty member.
 * Protected by verifyFirebaseToken.
 */
router.get('/my-subjects', verifyFirebaseToken, async (req, res) => {
  try {
    const callerUid = req.userId;
    if (!callerUid) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: User identity could not be verified.'
      });
    }

    const assignments = await subjectService.getMyAssignedSubjects(callerUid);
    return res.json({
      success: true,
      assignments
    });
  } catch (error) {
    console.error('[SubjectRoutes] Failed to fetch teacher subjects:', error.message);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      code: error.code || 'TEACHER_SUBJECTS_FAILED',
      error: error.message
    });
  }
});

/**
 * GET /api/subjects/assignments
 * Retrieves teacher-subject assignments with role-based scoping.
 * Protected by verifyFirebaseToken.
 */
router.get('/assignments', verifyFirebaseToken, async (req, res) => {
  try {
    const callerUid = req.userId;
    if (!callerUid) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: User identity could not be verified.'
      });
    }

    const { teacherUid, subjectId, department, year, section } = req.query;

    const assignments = await subjectService.getTeacherSubjectAssignments({
      callerUid,
      teacherUid,
      subjectId,
      department,
      year,
      section
    });

    return res.json({
      success: true,
      assignments
    });
  } catch (error) {
    console.error('[SubjectRoutes] Failed to fetch subject assignments:', error.message);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      code: error.code || 'ASSIGNMENTS_FETCH_FAILED',
      error: error.message
    });
  }
});

/**
 * POST /api/subjects/assignments
 * POST /api/subjects/:subjectId/assignments
 * Assigns an authorized faculty member to teach a subject.
 * Protected by verifyFirebaseToken (Director / Admin only).
 */
const handleAssignTeacher = async (req, res) => {
  try {
    const callerUid = req.userId;
    if (!callerUid) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: User identity could not be verified.'
      });
    }

    const subjectId = req.params.subjectId || req.body.subjectId;
    const { assignedTeacherUid, targetTeacherUid, facultyId, teacherUid, section } = req.body || {};
    const effectiveTeacherUid = assignedTeacherUid || targetTeacherUid || facultyId || teacherUid;

    const result = await subjectService.assignTeacherToSubject({
      callerUid,
      teacherUid: effectiveTeacherUid,
      subjectId,
      section
    });

    return res.status(result.isExisting ? 200 : 201).json({
      success: true,
      message: result.isExisting
        ? 'Teacher is already assigned to this subject.'
        : 'Teacher assigned to subject successfully.',
      assignment: result.assignment
    });
  } catch (error) {
    console.error('[SubjectRoutes] Failed to assign teacher to subject:', error.message);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      code: error.code || 'ASSIGNMENT_FAILED',
      error: error.message
    });
  }
};

router.post('/assignments', verifyFirebaseToken, handleAssignTeacher);
router.post('/:subjectId/assignments', verifyFirebaseToken, handleAssignTeacher);

/**
 * DELETE /api/subjects/assignments/:assignmentId
 * Revokes a teacher-subject assignment.
 * Protected by verifyFirebaseToken (Director / Admin only).
 */
router.delete('/assignments/:assignmentId', verifyFirebaseToken, async (req, res) => {
  try {
    const callerUid = req.userId;
    if (!callerUid) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: User identity could not be verified.'
      });
    }

    const { assignmentId } = req.params;
    const result = await subjectService.deleteTeacherSubjectAssignment({
      callerUid,
      assignmentId
    });

    return res.json(result);
  } catch (error) {
    console.error('[SubjectRoutes] Failed to revoke subject assignment:', error.message);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      code: error.code || 'REVOKE_FAILED',
      error: error.message
    });
  }
});

/**
 * GET /api/subjects/:subjectId
 * Retrieves a single subject record.
 * Protected by verifyFirebaseToken.
 */
router.get('/:subjectId', verifyFirebaseToken, async (req, res) => {
  try {
    const callerUid = req.userId;
    if (!callerUid) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: User identity could not be verified.'
      });
    }

    const { subjectId } = req.params;
    const subject = await subjectService.getSubjectById({ callerUid, subjectId });

    return res.json({
      success: true,
      subject
    });
  } catch (error) {
    console.error('[SubjectRoutes] Failed to fetch subject:', error.message);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      code: error.code || 'SUBJECT_FETCH_FAILED',
      error: error.message
    });
  }
});

/**
 * PATCH /api/subjects/:subjectId
 * PUT /api/subjects/:subjectId
 * Updates an existing curriculum subject's metadata (name, code, description).
 * Protected by verifyFirebaseToken (Director / Admin only).
 */
const handleUpdateSubject = async (req, res) => {
  try {
    const callerUid = req.userId;
    if (!callerUid) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: User identity could not be verified.'
      });
    }

    const { subjectId } = req.params;
    const { name, code, description } = req.body || {};

    const subject = await subjectService.updateSubject({
      callerUid,
      subjectId,
      name,
      code,
      description
    });

    return res.json({
      success: true,
      message: 'Subject updated successfully.',
      subject
    });
  } catch (error) {
    console.error('[SubjectRoutes] Failed to update subject:', error.message);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      code: error.code || 'SUBJECT_UPDATE_FAILED',
      error: error.message
    });
  }
};

router.patch('/:subjectId', verifyFirebaseToken, handleUpdateSubject);
router.put('/:subjectId', verifyFirebaseToken, handleUpdateSubject);

/**
 * DELETE /api/subjects/:subjectId
 * Safely deletes a subject if not in use.
 * Protected by verifyFirebaseToken (Director / Admin only).
 */
router.delete('/:subjectId', verifyFirebaseToken, async (req, res) => {
  try {
    const callerUid = req.userId;
    if (!callerUid) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: User identity could not be verified.'
      });
    }

    const { subjectId } = req.params;
    const result = await subjectService.deleteSubject({ callerUid, subjectId });

    return res.json(result);
  } catch (error) {
    console.error('[SubjectRoutes] Failed to delete subject:', error.message);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      code: error.code || 'SUBJECT_DELETE_FAILED',
      error: error.message
    });
  }
});

export default subjectRouter;
