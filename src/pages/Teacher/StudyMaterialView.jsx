import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Icons } from './Icons.jsx';
import { getStorageStatus, getGoogleAuthUrl } from '../../services/storageService.js';
import { fetchMyAssignedSubjects } from '../../services/subjectService.js';
import {
  fetchStudyMaterials,
  fetchStudyMaterialHistory,
  getMaterialDisplayStatus,
  uploadStudyMaterial,
  downloadStudyMaterialFile,
  setStudyMaterialPublishStatus,
  deleteStudyMaterial,
  fetchDriveSubjectFiles,
  publishFromDriveFile,
  formatFileSize,
  formatDate,
  MAX_STUDY_MATERIAL_FILE_SIZE
} from '../../services/studyMaterialService.js';

const CANONICAL_DEPARTMENT_MAP = {
  'CSE AI': 'Computer Science',
  'CSE': 'Computer Science',
  'Computer Science': 'Computer Science',
  'IT': 'Information Technology',
  'Information Technology': 'Information Technology',
  'ECE': 'Electronics & Communication',
  'Electronics & Communication': 'Electronics & Communication',
  'EE': 'Electrical Engineering',
  'Electrical Engineering': 'Electrical Engineering',
  'ME': 'Mechanical Engineering',
  'Mechanical Engineering': 'Mechanical Engineering',
  'CE': 'Civil Engineering',
  'Civil Engineering': 'Civil Engineering',
  'BT': 'Biotechnology',
  'Biotechnology': 'Biotechnology',
  'Management': 'Management'
};

const normalize = (str) => String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const isMatchingDepartment = (d1, d2) => {
  if (!d1 || !d2) return false;
  const c1 = CANONICAL_DEPARTMENT_MAP[d1] || d1;
  const c2 = CANONICAL_DEPARTMENT_MAP[d2] || d2;
  return normalize(c1) === normalize(c2);
};

const isMatchingYear = (y1, y2) => {
  if (!y1 || !y2) return false;
  return normalize(y1) === normalize(y2);
};

const isMatchingSection = (s1, s2) => {
  if (!s1 || !s2) return false;
  return normalize(s1) === normalize(s2);
};

const CATEGORIES = [
  'All',
  'Lecture Notes',
  'Lab Manuals & Code',
  'Assignments & Problem Sets',
  'Syllabus & Course Plans',
  'Reference Books & Papers',
  'Previous Year Questions (PYQs)'
];

export default function StudyMaterialView({
  group,
  userProfile,
  embedded = false,
  allocations = [],
  onNavigate,
  studyMaterialHandoff = null,
  onClearHandoff = null
}) {
  const scopePath = group?.path?.join('/') || '';
  const currentInst = group?.path?.[0] || userProfile?.institution || 'UEMK';
  const currentDept = group?.path?.[1] || userProfile?.department || '';
  const currentYear = group?.path?.[2] || '';
  const currentSection = group?.path?.length > 3 ? group?.path?.[3] : null;

  const isYearWideScope = group?.scope?.includes('Common') || !currentSection || group?.path?.length === 3;
  const scopeLabel = isYearWideScope
    ? `${group.path.slice(1).join(' • ')} (Shared Across Year)`
    : `${group.path.slice(1).join(' • ')} (Section Specific)`;

  // Data states
  const [materials, setMaterials] = useState([]);
  const [assignedSubjects, setAssignedSubjects] = useState([]);
  const [driveStatus, setDriveStatus] = useState(null); // { connected: boolean, accountEmail?: string }

  // Loading & Feedback
  const [isLoading, setIsLoading] = useState(true);
  const [actionSuccess, setActionSuccess] = useState(null);
  const [actionError, setActionError] = useState(null);

  // Filters
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Source Mode: 'drive' (Select from Faculty Drive) or 'upload' (Upload New File)
  const [uploadSourceMode, setUploadSourceMode] = useState('drive');

  // Form State
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadSubjectId, setUploadSubjectId] = useState('');
  const [uploadCategory, setUploadCategory] = useState('Lecture Notes');
  const [uploadScope, setUploadScope] = useState(isYearWideScope ? 'year' : 'section');
  const [uploadSection, setUploadSection] = useState(currentSection || '');
  const [uploadFile, setUploadFile] = useState(null);
  const [isSubmittingUpload, setIsSubmittingUpload] = useState(false);
  const [uploadClientError, setUploadClientError] = useState('');

  // Drive File Browsing & Selection State
  const [driveFiles, setDriveFiles] = useState([]);
  const [isLoadingDriveFiles, setIsLoadingDriveFiles] = useState(false);
  const [driveFilesError, setDriveFilesError] = useState(null);
  const [selectedDriveFile, setSelectedDriveFile] = useState(null);

  // Per-Item Action Loading
  const [publishingId, setPublishingId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const [deleteModalMaterial, setDeleteModalMaterial] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  // View Mode: 'active' (Active Coursework) or 'history' (Study Material Lifecycle History & Archive)
  const [activeViewTab, setActiveViewTab] = useState('active');
  const [historyMaterials, setHistoryMaterials] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Load Lifecycle History for authorized faculty
  const loadHistoryData = async (showLoading = true) => {
    if (showLoading) setIsLoadingHistory(true);
    try {
      const fetchedHistory = await fetchStudyMaterialHistory({
        department: currentDept,
        year: currentYear,
        section: isYearWideScope ? undefined : currentSection
      });
      setHistoryMaterials(fetchedHistory || []);
    } catch (err) {
      console.warn('[StudyMaterialView] Error loading history materials:', err);
      setHistoryMaterials([]);
    } finally {
      if (showLoading) setIsLoadingHistory(false);
    }
  };

  // 1. Load Drive Status, Assigned Subjects, and Study Materials
  const loadViewData = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    setActionError(null);

    try {
      // 1. Check Google Drive integration status
      try {
        const storageInfo = await getStorageStatus();
        setDriveStatus(storageInfo);
      } catch (driveErr) {
        console.warn('[StudyMaterialView] Storage status error:', driveErr);
        setDriveStatus({ connected: false });
      }

      // 2. Fetch Assigned Subjects for this teacher
      try {
        const myAssignments = await fetchMyAssignedSubjects();
        // Filter to subjects matching current department & year
        const relevantAssignments = myAssignments.filter(a => {
          const matchDept = isMatchingDepartment(a.department, currentDept);
          const matchYr = isMatchingYear(a.year, currentYear);
          return matchDept && matchYr;
        });
        setAssignedSubjects(relevantAssignments);

        // Pre-select first subject if none selected
        if (relevantAssignments.length > 0 && !uploadSubjectId) {
          setUploadSubjectId(relevantAssignments[0].subjectId);
        }
      } catch (subjErr) {
        console.warn('[StudyMaterialView] Error loading subjects:', subjErr);
        setAssignedSubjects([]);
      }

      // 3. Fetch Study Materials from backend
      try {
        const fetchedMaterials = await fetchStudyMaterials({
          department: currentDept,
          year: currentYear,
          section: isYearWideScope ? undefined : currentSection
        });
        setMaterials(fetchedMaterials || []);
      } catch (matErr) {
        console.error('[StudyMaterialView] Error loading materials:', matErr);
        setActionError(matErr.message || 'Failed to load study materials.');
        setMaterials([]);
      }

      // 4. Fetch lifecycle history & archive
      loadHistoryData(false);
    } finally {
      if (showLoading) setIsLoading(false);
    }
  };

  useEffect(() => {
    loadViewData(true);
  }, [scopePath, currentDept, currentYear, currentSection]);

  // Handle incoming handoff from FacultyDriveView
  useEffect(() => {
    if (studyMaterialHandoff?.preselectedDriveFile) {
      const { preselectedSubjectId, preselectedDriveFile, mode } = studyMaterialHandoff;
      if (mode === 'manage') {
        // Highlight/search for this file
        setSearchQuery(preselectedDriveFile.name || '');
        setActionSuccess(`Filtered to "${preselectedDriveFile.name}". Use the controls below to manage publication or unpublish.`);
        setTimeout(() => setActionSuccess(null), 6000);
      } else {
        // Open publication modal in Drive mode
        setUploadSourceMode('drive');
        if (preselectedSubjectId) {
          setUploadSubjectId(preselectedSubjectId);
        }
        setSelectedDriveFile(preselectedDriveFile);
        setUploadTitle(preselectedDriveFile.name ? preselectedDriveFile.name.replace(/\.pdf$/i, '') : '');
        setUploadClientError('');
        setIsUploadOpen(true);
      }
      if (typeof onClearHandoff === 'function') {
        onClearHandoff();
      }
    }
  }, [studyMaterialHandoff]);

  // Load Google Drive files when upload modal is open in 'drive' mode and subjectId changes
  useEffect(() => {
    let isMounted = true;
    if (isUploadOpen && uploadSourceMode === 'drive' && uploadSubjectId) {
      setIsLoadingDriveFiles(true);
      setDriveFilesError(null);
      fetchDriveSubjectFiles(uploadSubjectId)
        .then((res) => {
          if (isMounted) {
            setDriveFiles(res.files || []);
          }
        })
        .catch((err) => {
          if (isMounted) {
            console.warn('[StudyMaterialView] Error loading Drive files:', err);
            if (err.statusCode === 424 || err.code === 'DRIVE_NOT_CONNECTED') {
              setDriveFilesError('Google Drive is not connected. Please connect your Google account in Settings.');
            } else {
              setDriveFilesError(err.message || 'Failed to fetch Drive files.');
            }
            setDriveFiles([]);
          }
        })
        .finally(() => {
          if (isMounted) setIsLoadingDriveFiles(false);
        });
    }
    return () => {
      isMounted = false;
    };
  }, [isUploadOpen, uploadSourceMode, uploadSubjectId]);

  // Available sections for the teacher's allocations in this department/year
  const availableSections = useMemo(() => {
    const teacherUid = userProfile?.uid;
    const matchingAllocs = (allocations || []).filter(alloc => {
      const matchTeacher = !teacherUid || alloc.teacherUid === teacherUid;
      const matchAuth = alloc.authorized !== false;
      const matchDept = isMatchingDepartment(alloc.department, currentDept);
      const matchYr = isMatchingYear(alloc.year, currentYear);
      return matchTeacher && matchAuth && matchDept && matchYr;
    });

    const set = new Set();
    matchingAllocs.forEach(a => {
      if (a.section) set.add(a.section);
    });
    return Array.from(set);
  }, [allocations, currentDept, currentYear, userProfile?.uid]);

  // Selected subject object for upload validation
  const selectedSubjectAssignment = useMemo(() => {
    return assignedSubjects.find(s => s.subjectId === uploadSubjectId);
  }, [assignedSubjects, uploadSubjectId]);

  // Determine allowed scope options for the selected subject
  const canUploadYearWide = useMemo(() => {
    if (!selectedSubjectAssignment) return true;
    return selectedSubjectAssignment.scope === 'all' || !selectedSubjectAssignment.section;
  }, [selectedSubjectAssignment]);

  // Update scope and section when selected subject changes
  useEffect(() => {
    if (selectedSubjectAssignment) {
      if (selectedSubjectAssignment.section && selectedSubjectAssignment.scope === 'section') {
        setUploadScope('section');
        setUploadSection(selectedSubjectAssignment.section);
      } else if (currentSection) {
        setUploadScope('section');
        setUploadSection(currentSection);
      } else {
        setUploadScope('year');
        setUploadSection('');
      }
    }
  }, [selectedSubjectAssignment, currentSection]);

  // Filtered materials by category and search
  const filteredMaterials = useMemo(() => {
    let list = materials;
    if (activeCategory !== 'All') {
      list = list.filter(m => m.category === activeCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(m => {
        return (
          (m.title || '').toLowerCase().includes(q) ||
          (m.subjectName || '').toLowerCase().includes(q) ||
          (m.subjectCode || '').toLowerCase().includes(q) ||
          (m.fileName || '').toLowerCase().includes(q) ||
          (m.description || '').toLowerCase().includes(q)
        );
      });
    }
    return list;
  }, [materials, activeCategory, searchQuery]);

  // Filtered history materials by category, search, and status
  const filteredHistoryMaterials = useMemo(() => {
    let list = historyMaterials;
    if (activeCategory !== 'All') {
      list = list.filter(m => m.category === activeCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(m => {
        return (
          (m.title || '').toLowerCase().includes(q) ||
          (m.subjectName || '').toLowerCase().includes(q) ||
          (m.subjectCode || '').toLowerCase().includes(q) ||
          (m.fileName || '').toLowerCase().includes(q) ||
          (m.description || '').toLowerCase().includes(q) ||
          (m.unavailabilityReason || '').toLowerCase().includes(q) ||
          (m.status || '').toLowerCase().includes(q) ||
          (m.availabilityStatus || '').toLowerCase().includes(q)
        );
      });
    }
    return list;
  }, [historyMaterials, activeCategory, searchQuery]);

  // Handle File Selection with 25MB check
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_STUDY_MATERIAL_FILE_SIZE) {
      setUploadClientError(`Selected file (${(file.size / (1024 * 1024)).toFixed(1)}MB) exceeds the 25MB maximum limit. Please select a smaller document.`);
      setUploadFile(null);
      return;
    }

    setUploadClientError('');
    setUploadFile(file);
    if (!uploadTitle || uploadTitle.trim() === '') {
      setUploadTitle(file.name.replace(/\.pdf$/i, ''));
    }
  };

  // Handle Drive File Selection
  const handleSelectDriveFile = (file) => {
    setSelectedDriveFile(file);
    setUploadClientError('');
    if (!uploadTitle || uploadTitle.trim() === '') {
      setUploadTitle(file.name ? file.name.replace(/\.pdf$/i, '') : '');
    }
  };

  // Handle Upload Submission (Local Upload Mode)
  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!uploadFile) {
      setUploadClientError('Please select a file to upload.');
      return;
    }

    if (!uploadTitle.trim() || uploadTitle.trim().length < 2) {
      setUploadClientError('Title must be at least 2 characters.');
      return;
    }

    if (!uploadSubjectId) {
      setUploadClientError('Please select an assigned subject.');
      return;
    }

    if (uploadScope === 'section' && !uploadSection) {
      setUploadClientError('Please select an authorized section.');
      return;
    }

    setUploadClientError('');
    setIsSubmittingUpload(true);
    setActionError(null);

    try {
      const newMaterial = await uploadStudyMaterial({
        file: uploadFile,
        title: uploadTitle.trim(),
        subjectId: uploadSubjectId,
        department: currentDept,
        year: currentYear,
        scope: uploadScope,
        section: uploadScope === 'section' ? uploadSection : null,
        category: uploadCategory,
        description: uploadDescription.trim(),
        isPublished: false
      });

      setActionSuccess(`Study material "${uploadTitle}" uploaded to your Google Drive as an unpublished draft.`);
      setIsUploadOpen(false);
      setUploadTitle('');
      setUploadDescription('');
      setUploadFile(null);

      // Prepend or refresh
      setMaterials(prev => [newMaterial, ...prev.filter(m => m.id !== newMaterial.id)]);
      setTimeout(() => setActionSuccess(null), 5000);
    } catch (err) {
      console.error('[StudyMaterialView] Upload error:', err);
      if (err.code === 'DRIVE_NOT_CONNECTED' || err.statusCode === 424) {
        setActionError('Google Drive is not connected. Please connect your Google Drive account in Settings before uploading materials.');
      } else {
        setActionError(err.message || 'Failed to upload study material.');
      }
    } finally {
      setIsSubmittingUpload(false);
    }
  };

  // Handle Publish From Drive Submission (Drive Selection Mode)
  const handlePublishFromDriveSubmit = async (e) => {
    e.preventDefault();
    if (!selectedDriveFile) {
      setUploadClientError('Please select an existing file from your connected Google Drive folder.');
      return;
    }

    if (!uploadTitle.trim() || uploadTitle.trim().length < 2) {
      setUploadClientError('Title must be at least 2 characters.');
      return;
    }

    if (!uploadSubjectId) {
      setUploadClientError('Please select an assigned subject.');
      return;
    }

    if (uploadScope === 'section' && !uploadSection) {
      setUploadClientError('Please select an authorized section.');
      return;
    }

    // Client-side conflict detection
    if (selectedDriveFile.publications?.length > 0) {
      const isConflict = selectedDriveFile.publications.some(p => {
        if (!p.isPublished) return false;
        if (uploadScope === 'year') {
          return p.isYearWide || p.scope === 'year';
        }
        return p.scope === 'section' && isMatchingSection(p.section, uploadSection);
      });
      if (isConflict) {
        setUploadClientError(`This file is already published for ${uploadScope === 'year' ? 'all sections (Year-Wide)' : `Section ${uploadSection}`}.`);
        return;
      }
    }

    setUploadClientError('');
    setIsSubmittingUpload(true);
    setActionError(null);

    try {
      const published = await publishFromDriveFile({
        subjectId: uploadSubjectId,
        driveFileId: selectedDriveFile.id,
        title: uploadTitle.trim(),
        scope: uploadScope,
        section: uploadScope === 'section' ? uploadSection : null,
        category: uploadCategory,
        description: uploadDescription.trim(),
        isYearWide: uploadScope === 'year'
      });

      const scopeText = uploadScope === 'year' ? 'all sections (Year-Wide)' : `Section ${uploadSection}`;
      setActionSuccess(`"${uploadTitle}" published successfully from Google Drive to ${scopeText}.`);
      setIsUploadOpen(false);
      setSelectedDriveFile(null);
      setUploadTitle('');
      setUploadDescription('');

      // Prepend or refresh
      setMaterials(prev => [published, ...prev.filter(m => m.id !== published.id)]);
      setTimeout(() => setActionSuccess(null), 5000);
    } catch (err) {
      console.error('[StudyMaterialView] Publish from Drive error:', err);
      if (err.code === 'ALREADY_PUBLISHED' || err.statusCode === 409) {
        setUploadClientError('This file is already published for the selected scope.');
      } else if (err.code === 'DRIVE_NOT_CONNECTED' || err.statusCode === 424) {
        setActionError('Google Drive is not connected. Please connect your Google Drive account in Settings before publishing.');
        setUploadClientError('Google Drive is not connected.');
      } else {
        setUploadClientError(err.message || 'Failed to publish file from Google Drive.');
      }
    } finally {
      setIsSubmittingUpload(false);
    }
  };

  // Handle Publish / Unpublish Toggle
  const handleTogglePublish = async (material) => {
    setPublishingId(material.id);
    setActionError(null);
    const targetStatus = !material.isPublished;

    try {
      const updated = await setStudyMaterialPublishStatus({
        materialId: material.id,
        isPublished: targetStatus
      });

      setMaterials(prev =>
        prev.map(m => (m.id === material.id ? { ...m, ...updated, isPublished: targetStatus } : m))
      );

      setActionSuccess(
        targetStatus
          ? `"${material.title}" is now published and accessible to students.`
          : `"${material.title}" unpublished. Student access is immediately revoked.`
      );
      setTimeout(() => setActionSuccess(null), 4500);
    } catch (err) {
      console.error('[StudyMaterialView] Publish toggle error:', err);
      setActionError(err.message || 'Failed to update publication status.');
    } finally {
      setPublishingId(null);
    }
  };

  // Handle Download
  const handleDownload = async (material) => {
    setDownloadingId(material.id);
    setActionError(null);

    try {
      await downloadStudyMaterialFile({
        materialId: material.id,
        fileName: material.fileName || `${material.title}.pdf`
      });
    } catch (err) {
      console.error('[StudyMaterialView] Download error:', err);
      if (err.code === 'FILE_NOT_FOUND' || err.code === 'FILE_TRASHED' || err.statusCode === 404 || err.statusCode === 410) {
        setActionError(`"${material.title}" is no longer available because the original file was deleted or trashed in Google Drive.`);
        setMaterials(prev => prev.filter(m => m.id !== material.id));
      } else {
        setActionError(err.message || 'Failed to download study material from Google Drive.');
      }
    } finally {
      setDownloadingId(null);
    }
  };

  // Handle Delete Confirmation & Execution
  const handleDeleteConfirm = async () => {
    if (!deleteModalMaterial) return;
    setIsDeleting(true);
    setActionError(null);

    try {
      await deleteStudyMaterial(deleteModalMaterial.id);
      setMaterials(prev => prev.filter(m => m.id !== deleteModalMaterial.id));
      setActionSuccess(`Study material "${deleteModalMaterial.title}" deleted.`);
      setDeleteModalMaterial(null);
      setTimeout(() => setActionSuccess(null), 4500);
    } catch (err) {
      console.error('[StudyMaterialView] Delete error:', err);
      setActionError(err.message || 'Failed to delete study material.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Connect Google Drive Handler
  const handleConnectDrive = async () => {
    try {
      const { url } = await getGoogleAuthUrl();
      if (url) {
        window.location.href = url;
      }
    } catch (err) {
      if (onNavigate) {
        onNavigate('Settings');
      } else {
        setActionError('Failed to initiate Google Drive connection. Please navigate to Settings.');
      }
    }
  };

  // ===========================================================================
  // EMBEDDED RENDER (Canvas view in AcademicSpacesView)
  // ===========================================================================
  if (embedded) {
    return (
      <div className="space-y-3 animate-fade-in text-xs">
        {/* Drive Disconnected Notice */}
        {driveStatus && !driveStatus.connected && (
          <div className="p-3 bg-amber-50/90 border border-amber-200 rounded-xl flex items-center justify-between gap-3 text-amber-900">
            <div className="flex items-center gap-2">
              <span className="font-bold text-amber-700">⚠️</span>
              <p className="text-[11px] leading-tight">
                <span className="font-bold">Google Drive not connected:</span> Connect your Google account to upload and store coursework materials in your own Drive.
              </p>
            </div>
            <button
              type="button"
              onClick={handleConnectDrive}
              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-[10px] whitespace-nowrap transition-colors cursor-pointer"
            >
              Connect Drive
            </button>
          </div>
        )}

        {/* Feedback Messages */}
        {actionSuccess && (
          <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-[11px] font-semibold flex items-center justify-between animate-fade-in">
            <span>✓ {actionSuccess}</span>
            <button onClick={() => setActionSuccess(null)} className="font-bold ml-2">✕</button>
          </div>
        )}

        {actionError && (
          <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-[11px] font-semibold flex items-center justify-between animate-fade-in">
            <span>! {actionError}</span>
            <button onClick={() => setActionError(null)} className="font-bold ml-2">✕</button>
          </div>
        )}

        {/* Header Row */}
        <div className="flex items-center justify-between pb-2 border-b border-[#D8D1C3]/50 gap-2 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-[#171717]">{scopeLabel}</h4>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#C4B5FD]/25 text-[#4c1d95]">
                {isYearWideScope ? 'Year-Wide Scope' : 'Section Scope'}
              </span>
            </div>
            <p className="text-[11px] text-[#858174] mt-0.5 font-normal">
              Course reference notes, lab guidelines, and coursework materials
            </p>
          </div>

          {!isUploadOpen && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setUploadClientError('');
                  setUploadSourceMode('drive');
                  setIsUploadOpen(true);
                }}
                disabled={driveStatus && !driveStatus.connected}
                className="flex items-center gap-1.5 bg-[#171717] text-white px-3.5 py-1.5 rounded-full hover:bg-[#2b2b2b] transition-all text-[11px] font-bold cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
              >
                <Icons.Drive />
                <span>Select from Drive</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setUploadClientError('');
                  setUploadSourceMode('upload');
                  setIsUploadOpen(true);
                }}
                disabled={driveStatus && !driveStatus.connected}
                className="flex items-center gap-1.5 bg-white border border-[#D8D1C3] text-[#171717] hover:bg-[#F5E5EE] px-3 py-1.5 rounded-full transition-all text-[11px] font-bold cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
              >
                <Icons.Plus />
                <span>Upload New</span>
              </button>
            </div>
          )}
        </div>

        {/* Upload / Publication Modal */}
        {isUploadOpen && (
          <UploadMaterialForm
            assignedSubjects={assignedSubjects}
            availableSections={availableSections}
            isYearWideScope={isYearWideScope}
            currentSection={currentSection}
            currentDept={currentDept}
            currentYear={currentYear}
            canUploadYearWide={canUploadYearWide}
            uploadSourceMode={uploadSourceMode}
            setUploadSourceMode={setUploadSourceMode}
            title={uploadTitle}
            setTitle={setUploadTitle}
            description={uploadDescription}
            setDescription={setUploadDescription}
            subjectId={uploadSubjectId}
            setSubjectId={(id) => {
              setUploadSubjectId(id);
              setSelectedDriveFile(null);
            }}
            category={uploadCategory}
            setCategory={setUploadCategory}
            scope={uploadScope}
            setScope={setUploadScope}
            section={uploadSection}
            setSection={setUploadSection}
            file={uploadFile}
            onFileSelect={handleFileSelect}
            onFileRemove={() => {
              setUploadFile(null);
              setUploadClientError('');
            }}
            driveFiles={driveFiles}
            isLoadingDriveFiles={isLoadingDriveFiles}
            driveFilesError={driveFilesError}
            selectedDriveFile={selectedDriveFile}
            onSelectDriveFile={handleSelectDriveFile}
            onSubmit={uploadSourceMode === 'drive' ? handlePublishFromDriveSubmit : handleUploadSubmit}
            onCancel={() => {
              setIsUploadOpen(false);
              setUploadClientError('');
            }}
            isSubmitting={isSubmittingUpload}
            clientError={uploadClientError}
            onNavigate={onNavigate}
          />
        )}

        {/* Subtab Navigation: Active Coursework vs Lifecycle History & Archive */}
        <div className="flex items-center gap-1.5 border-b border-[#D8D1C3]/40 pb-2">
          <button
            type="button"
            onClick={() => setActiveViewTab('active')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
              activeViewTab === 'active'
                ? 'bg-[#171717] text-white shadow-2xs'
                : 'bg-white/80 text-slate-600 hover:text-slate-900 border border-[#D8D1C3]/60'
            }`}
          >
            Active Coursework ({materials.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveViewTab('history');
              loadHistoryData(true);
            }}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeViewTab === 'history'
                ? 'bg-[#171717] text-white shadow-2xs'
                : 'bg-white/80 text-slate-600 hover:text-slate-900 border border-[#D8D1C3]/60'
            }`}
          >
            <Icons.History />
            <span>History & Archive ({historyMaterials.length})</span>
          </button>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide py-1">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={`text-[10px] px-2.5 py-0.5 rounded-full transition-colors font-medium whitespace-nowrap cursor-pointer ${
                activeCategory === cat
                  ? 'bg-[#171717] text-white'
                  : 'bg-white/70 text-[#858174] hover:text-[#171717] border border-[#D8D1C3]/60'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Materials List (Active or History) */}
        {activeViewTab === 'history' ? (
          isLoadingHistory ? (
            <div className="py-8 text-center text-[#858174]">
              <div className="w-5 h-5 border-2 border-[#171717] border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
              <p>Loading lifecycle history & archive...</p>
            </div>
          ) : filteredHistoryMaterials.length === 0 ? (
            <div className="text-center py-8 text-xs text-[#858174] bg-white/40 border border-[#D8D1C3]/40 rounded-xl p-6 space-y-2">
              <p className="font-semibold text-slate-700">No archived history records found.</p>
              <p className="text-[11px] text-slate-500">
                Uploaded and published coursework materials remain recorded here even if removed from Google Drive.
              </p>
            </div>
          ) : (
            <div className="space-y-2 pt-1">
              {filteredHistoryMaterials.map(mat => (
                <ArchiveHistoryCard
                  key={mat.id}
                  material={mat}
                  onDownload={() => handleDownload(mat)}
                  isDownloading={downloadingId === mat.id}
                  compact={true}
                />
              ))}
            </div>
          )
        ) : isLoading ? (
          <div className="py-8 text-center text-[#858174]">
            <div className="w-5 h-5 border-2 border-[#171717] border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
            <p>Loading coursework materials...</p>
          </div>
        ) : filteredMaterials.length === 0 ? (
          <div className="text-center py-8 text-xs text-[#858174] bg-white/40 border border-[#D8D1C3]/40 rounded-xl p-6 space-y-2">
            <p className="font-semibold text-slate-700">No study materials in this view yet.</p>
            <p className="text-[11px] text-slate-500">
              {assignedSubjects.length === 0
                ? 'No curriculum subjects assigned to you for this academic space.'
                : 'Click "Select from Drive" or "Upload New" above to publish coursework materials.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2 pt-1">
            {filteredMaterials.map(mat => (
              <MaterialCard
                key={mat.id}
                material={mat}
                isPublishing={publishingId === mat.id}
                isDownloading={downloadingId === mat.id}
                onTogglePublish={() => handleTogglePublish(mat)}
                onDownload={() => handleDownload(mat)}
                onDelete={() => setDeleteModalMaterial(mat)}
              />
            ))}
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deleteModalMaterial && (
          <DeleteConfirmModal
            material={deleteModalMaterial}
            isDeleting={isDeleting}
            onConfirm={handleDeleteConfirm}
            onCancel={() => setDeleteModalMaterial(null)}
          />
        )}
      </div>
    );
  }

  // ===========================================================================
  // NON-EMBEDDED FULL-SCREEN RENDER
  // ===========================================================================
  return (
    <div className="space-y-6 animate-fade-in relative z-10 pb-12 max-w-6xl mx-auto">
      {/* Drive Disconnected Notice */}
      {driveStatus && !driveStatus.connected && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-amber-900 shadow-xs">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="font-bold text-sm text-amber-900">Google Drive Account Not Connected</p>
              <p className="text-xs text-amber-800 mt-0.5">
                Coursework materials are stored directly in your own Google Drive. Connect your account in Settings to enable private uploads.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleConnectDrive}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-xs shadow-xs transition-colors cursor-pointer active:scale-95"
          >
            Connect Google Drive
          </button>
        </div>
      )}

      {/* Success / Error Banners */}
      {actionSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-bold flex items-center justify-between shadow-xs animate-fade-in">
          <span>✓ {actionSuccess}</span>
          <button onClick={() => setActionSuccess(null)} className="font-bold ml-4 text-emerald-700">✕</button>
        </div>
      )}

      {actionError && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-xs font-bold flex items-center justify-between shadow-xs animate-fade-in">
          <span>! {actionError}</span>
          <button onClick={() => setActionError(null)} className="font-bold ml-4 text-rose-700">✕</button>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-100 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-extrabold text-[#171717] tracking-tight">{scopeLabel}</h2>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-[#C4B5FD]/30 text-[#4c1d95]">
              {isYearWideScope ? 'Year-Wide' : 'Section Specific'}
            </span>
          </div>
          <p className="text-xs font-medium text-slate-500 mt-1">
            Publish and manage coursework documents, lecture slides, and reference materials.
          </p>
        </div>

        {!isUploadOpen && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setUploadClientError('');
                setUploadSourceMode('drive');
                setIsUploadOpen(true);
              }}
              disabled={driveStatus && !driveStatus.connected}
              className="flex items-center justify-center gap-2 bg-[#171717] text-white px-5 py-2.5 rounded-xl hover:bg-[#2b2b2b] transition-all shadow-sm font-bold text-xs cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Icons.Drive />
              <span>Select from Faculty Drive</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setUploadClientError('');
                setUploadSourceMode('upload');
                setIsUploadOpen(true);
              }}
              disabled={driveStatus && !driveStatus.connected}
              className="flex items-center justify-center gap-2 bg-white border border-[#D8D1C3] text-[#171717] hover:bg-[#F5E5EE] px-4 py-2.5 rounded-xl transition-all shadow-xs font-bold text-xs cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Icons.Plus />
              <span>Upload New File</span>
            </button>
          </div>
        )}
      </div>

      {/* View Tabs: Active Coursework vs Lifecycle History & Archive */}
      <div className="flex items-center gap-3 bg-white p-2 rounded-2xl border border-slate-100 shadow-xs">
        <button
          type="button"
          onClick={() => setActiveViewTab('active')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
            activeViewTab === 'active'
              ? 'bg-[#171717] text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <span>Active Coursework</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full ${
            activeViewTab === 'active' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
          }`}>
            {materials.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveViewTab('history');
            loadHistoryData(true);
          }}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
            activeViewTab === 'history'
              ? 'bg-[#171717] text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Icons.History />
          <span>Lifecycle History & Archive</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full ${
            activeViewTab === 'history' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
          }`}>
            {historyMaterials.length}
          </span>
        </button>
      </div>

      {/* History Information Banner */}
      {activeViewTab === 'history' && (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-600 flex items-start gap-3 shadow-xs animate-fade-in">
          <div className="w-8 h-8 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center shrink-0 font-bold">
            <Icons.Archive />
          </div>
          <div>
            <p className="font-extrabold text-slate-900">Coursework Lifecycle History & Unavailable File Archive</p>
            <p className="mt-1 leading-relaxed text-slate-500">
              Preserves a full audit history of all uploaded and published coursework documents across their complete lifecycle.
              If a teacher deletes or trashes a file in connected Google Drive, the file remains inaccessible, but its publication record remains visible here.
              Google Drive is the single source of truth: preview and download actions are permanently disabled for unavailable files.
            </p>
          </div>
        </div>
      )}

      {/* Upload / Publication Form Modal */}
      {isUploadOpen && (
        <UploadMaterialForm
          assignedSubjects={assignedSubjects}
          availableSections={availableSections}
          isYearWideScope={isYearWideScope}
          currentSection={currentSection}
          currentDept={currentDept}
          currentYear={currentYear}
          canUploadYearWide={canUploadYearWide}
          uploadSourceMode={uploadSourceMode}
          setUploadSourceMode={setUploadSourceMode}
          title={uploadTitle}
          setTitle={setUploadTitle}
          description={uploadDescription}
          setDescription={setUploadDescription}
          subjectId={uploadSubjectId}
          setSubjectId={(id) => {
            setUploadSubjectId(id);
            setSelectedDriveFile(null);
          }}
          category={uploadCategory}
          setCategory={setUploadCategory}
          scope={uploadScope}
          setScope={setUploadScope}
          section={uploadSection}
          setSection={setUploadSection}
          file={uploadFile}
          onFileSelect={handleFileSelect}
          onFileRemove={() => {
            setUploadFile(null);
            setUploadClientError('');
          }}
          driveFiles={driveFiles}
          isLoadingDriveFiles={isLoadingDriveFiles}
          driveFilesError={driveFilesError}
          selectedDriveFile={selectedDriveFile}
          onSelectDriveFile={handleSelectDriveFile}
          onSubmit={uploadSourceMode === 'drive' ? handlePublishFromDriveSubmit : handleUploadSubmit}
          onCancel={() => {
            setIsUploadOpen(false);
            setUploadClientError('');
          }}
          isSubmitting={isSubmittingUpload}
          clientError={uploadClientError}
          onNavigate={onNavigate}
        />
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-100 shadow-xs">
        {/* Category Pills */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide w-full sm:w-auto py-1">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={`text-xs px-3 py-1.5 rounded-xl transition-colors font-bold whitespace-nowrap cursor-pointer ${
                activeCategory === cat
                  ? 'bg-[#171717] text-white shadow-xs'
                  : 'bg-slate-50 text-slate-600 hover:text-slate-900 border border-slate-200/60'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <input
            type="text"
            placeholder={activeViewTab === 'history' ? 'Search archive...' : 'Search materials...'}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full px-3.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#171717]"
          />
        </div>
      </div>

      {/* Materials Grid (Active Coursework vs History Archive) */}
      {activeViewTab === 'history' ? (
        isLoadingHistory ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center shadow-xs">
            <div className="w-8 h-8 border-3 border-[#171717] border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-xs font-bold text-slate-600">Loading lifecycle history & archive...</p>
          </div>
        ) : filteredHistoryMaterials.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center shadow-xs space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-600 flex items-center justify-center mx-auto shadow-xs">
              <Icons.Archive />
            </div>
            <h3 className="text-base font-bold text-slate-900">No History Records Found</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              {searchQuery
                ? `No archive records match the search query "${searchQuery}".`
                : 'All uploaded and published materials will remain preserved here, including drafts and files deleted from Google Drive.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredHistoryMaterials.map(mat => (
              <ArchiveHistoryCard
                key={mat.id}
                material={mat}
                onDownload={() => handleDownload(mat)}
                isDownloading={downloadingId === mat.id}
              />
            ))}
          </div>
        )
      ) : isLoading ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center shadow-xs">
          <div className="w-8 h-8 border-3 border-[#171717] border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-xs font-bold text-slate-600">Loading study materials...</p>
        </div>
      ) : filteredMaterials.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center shadow-xs space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-[#FFF2ED] text-[#D67756] flex items-center justify-center mx-auto shadow-xs">
            <Icons.Resources />
          </div>
          <h3 className="text-base font-bold text-slate-900">No Study Materials Found</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {assignedSubjects.length === 0
              ? `You currently do not have any curriculum subjects assigned in ${currentDept} • ${currentYear}. A Director must assign a subject before you can publish.`
              : searchQuery
              ? `No materials match the search query "${searchQuery}".`
              : 'Click "Select from Faculty Drive" or "Upload New File" to publish coursework for students.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredMaterials.map(mat => (
            <MaterialCard
              key={mat.id}
              material={mat}
              isPublishing={publishingId === mat.id}
              isDownloading={downloadingId === mat.id}
              onTogglePublish={() => handleTogglePublish(mat)}
              onDownload={() => handleDownload(mat)}
              onDelete={() => setDeleteModalMaterial(mat)}
            />
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModalMaterial && (
        <DeleteConfirmModal
          material={deleteModalMaterial}
          isDeleting={isDeleting}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteModalMaterial(null)}
        />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// SUBCOMPONENT: Material Card
// -----------------------------------------------------------------------------
function MaterialCard({ material, isPublishing, isDownloading, onTogglePublish, onDownload, onDelete }) {
  const isPublished = Boolean(material.isPublished);

  return (
    <div className="p-4 rounded-2xl border border-slate-200/90 bg-white hover:border-slate-300 transition-all flex flex-col justify-between shadow-xs relative group">
      <div>
        {/* Top Badges */}
        <div className="flex items-start justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Category */}
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#C4B5FD]/20 text-[#4c1d95] border border-[#C4B5FD]/30">
              {material.category || 'Lecture Notes'}
            </span>
            {/* Subject Code */}
            {material.subjectCode && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-slate-900 text-white">
                {material.subjectCode}
              </span>
            )}
            {/* Scope */}
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
              {material.isYearWide || material.scope === 'year'
                ? 'Year-Wide'
                : material.section || 'Section Specific'}
            </span>
            {/* Drive origin badge */}
            {material.driveFileId && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200/60 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <span>Drive</span>
              </span>
            )}
          </div>

          {/* Publication Status Badge */}
          <span
            className={`text-[10px] font-black px-2 py-0.5 rounded-md flex items-center gap-1.5 ${
              isPublished
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-amber-50 text-amber-700 border border-amber-200'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${isPublished ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
            <span>{isPublished ? 'Published' : 'Unpublished (Draft)'}</span>
          </span>
        </div>

        {/* Title & Subject Name */}
        <h4 className="font-extrabold text-sm text-[#171717] leading-snug">{material.title}</h4>
        {material.subjectName && (
          <p className="text-[11px] font-semibold text-slate-500 mt-0.5">
            Subject: <span className="text-slate-800">{material.subjectName}</span>
          </p>
        )}
        {material.description && (
          <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
            {material.description}
          </p>
        )}
      </div>

      {/* Bottom Metadata & Controls */}
      <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[11px] text-slate-400 font-medium">
          <span className="truncate max-w-[130px] font-mono text-slate-600" title={material.fileName}>
            {material.fileName || 'file.pdf'}
          </span>
          {material.fileSizeBytes ? (
            <>
              <span>•</span>
              <span>{formatFileSize(material.fileSizeBytes)}</span>
            </>
          ) : null}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 justify-end">
          {/* Publish / Unpublish Button */}
          <button
            type="button"
            disabled={isPublishing}
            onClick={onTogglePublish}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50 active:scale-95 ${
              isPublished
                ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs'
            }`}
          >
            {isPublishing ? (
              <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin"></span>
            ) : isPublished ? (
              'Unpublish'
            ) : (
              'Publish to Students'
            )}
          </button>

          {/* Download Button */}
          <button
            type="button"
            disabled={isDownloading}
            onClick={onDownload}
            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-lg transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
            title="Download file through secure backend proxy"
          >
            {isDownloading ? (
              <span className="w-3 h-3 border border-slate-700 border-t-transparent rounded-full animate-spin"></span>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            )}
            <span>Download</span>
          </button>

          {/* Delete Button */}
          <button
            type="button"
            onClick={onDelete}
            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
            title="Delete metadata"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// SUBCOMPONENT: Upload Material Form Modal (Supporting Drive Selection & Upload)
// -----------------------------------------------------------------------------
function UploadMaterialForm({
  assignedSubjects,
  availableSections,
  isYearWideScope,
  currentSection,
  currentDept,
  currentYear,
  canUploadYearWide,
  uploadSourceMode,
  setUploadSourceMode,
  title,
  setTitle,
  description,
  setDescription,
  subjectId,
  setSubjectId,
  category,
  setCategory,
  scope,
  setScope,
  section,
  setSection,
  file,
  onFileSelect,
  onFileRemove,
  driveFiles = [],
  isLoadingDriveFiles = false,
  driveFilesError = null,
  selectedDriveFile = null,
  onSelectDriveFile,
  onSubmit,
  onCancel,
  isSubmitting,
  clientError,
  onNavigate
}) {
  const fileInputRef = useRef(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Prevent background page scrolling while modal is open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;
    const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;

    if (scrollBarWidth > 0) {
      document.body.style.paddingRight = `${scrollBarWidth}px`;
    }
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
    };
  }, []);

  // Keyboard navigation: Escape key closes modal if not submitting
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSubmitting, onCancel]);

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget && !isSubmitting) {
      onCancel();
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const droppedFile = e.dataTransfer?.files?.[0];
    if (droppedFile && onFileSelect) {
      onFileSelect({ target: { files: [droppedFile] } });
    }
  };

  const handleRemoveFile = () => {
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (onFileRemove) onFileRemove();
  };

  const handleChangeFile = () => {
    fileInputRef.current?.click();
  };

  // Check if selectedDriveFile has conflict with current chosen scope
  const driveConflictWarning = useMemo(() => {
    if (uploadSourceMode !== 'drive' || !selectedDriveFile?.publications?.length) {
      return null;
    }
    const publications = selectedDriveFile.publications.filter(p => p.isPublished);
    if (!publications.length) return null;

    if (scope === 'year') {
      const yearPub = publications.find(p => p.isYearWide || p.scope === 'year');
      if (yearPub) {
        return 'This file is already published for all sections (Year-Wide). To update it, unpublish the existing record in the materials list below.';
      }
    } else if (scope === 'section' && section) {
      const secPub = publications.find(p => p.scope === 'section' && isMatchingSection(p.section, section));
      if (secPub) {
        return `This file is already published for Section ${section}. Choose a different section or unpublish the existing record below.`;
      }
    }
    return null;
  }, [uploadSourceMode, selectedDriveFile, scope, section]);

  const modalNode = (
    <div
      onClick={handleBackdropClick}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-xs animate-fade-in"
      style={{ minHeight: '100dvh' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-study-material-title"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl border border-slate-100 shadow-2xl w-full max-w-xl overflow-hidden animate-scale-up flex flex-col"
        style={{ maxHeight: 'calc(100dvh - 32px)' }}
      >
        {/* Header - Fixed at Top */}
        <div className="px-5 py-3.5 sm:px-6 sm:py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/90 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#171717] text-white flex items-center justify-center shrink-0">
              {uploadSourceMode === 'drive' ? (
                <Icons.Drive />
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>
                </svg>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="upload-study-material-title" className="text-base font-extrabold text-slate-900">
                  {uploadSourceMode === 'drive' ? 'Select & Publish from Faculty Drive' : 'Upload Study Material'}
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#171717]/5 text-slate-700 border border-slate-200">
                  {currentDept || 'Curriculum'} • {currentYear || 'All Years'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {uploadSourceMode === 'drive'
                  ? 'Select existing files from your Google Drive folder and publish them to students'
                  : 'Upload coursework documents privately to your Google Drive account'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Source Mode Switcher */}
        <div className="px-5 pt-3 pb-0 bg-slate-50/50 shrink-0">
          <div className="flex items-center p-1 bg-slate-200/60 rounded-xl">
            <button
              type="button"
              onClick={() => setUploadSourceMode('drive')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                uploadSourceMode === 'drive'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icons.Drive />
              <span>Select from Faculty Drive</span>
            </button>
            <button
              type="button"
              onClick={() => setUploadSourceMode('upload')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                uploadSourceMode === 'upload'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              <span>Upload New File</span>
            </button>
          </div>
        </div>

        {/* Form Container */}
        <form onSubmit={onSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          {/* Scrollable Form Body */}
          <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1 overscroll-contain">
            {clientError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-semibold flex items-center gap-2 animate-fade-in">
                <span className="w-4 h-4 bg-rose-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold shrink-0">!</span>
                <span className="flex-1">{clientError}</span>
              </div>
            )}

            {driveConflictWarning && (
              <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs font-medium flex items-start gap-2 animate-fade-in">
                <span className="text-sm shrink-0">⚠️</span>
                <span className="flex-1 leading-relaxed">{driveConflictWarning}</span>
              </div>
            )}

            {/* SECTION 1: ASSIGNED SUBJECT */}
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4 space-y-3.5">
              <div className="flex items-center justify-between pb-1 border-b border-slate-200/60">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-md bg-[#171717] text-white flex items-center justify-center text-[10px] font-bold shrink-0">1</span>
                  <h4 className="text-xs font-bold text-slate-900">Assigned Subject</h4>
                </div>
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Required</span>
              </div>

              {/* Subject Selector */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Assigned Subject *
                </label>
                {assignedSubjects.length === 0 ? (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                    You do not have any curriculum subjects assigned for {currentDept} • {currentYear}. Please ask your Director to assign you a subject.
                  </div>
                ) : (
                  <select
                    required
                    value={subjectId}
                    onChange={e => setSubjectId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#171717]/10 focus:border-[#171717] transition-all"
                  >
                    <option value="">-- Choose Assigned Subject --</option>
                    {assignedSubjects.map(sub => (
                      <option key={sub.subjectId} value={sub.subjectId}>
                        {sub.subjectCode ? `[${sub.subjectCode}] ` : ''}{sub.subjectName} ({sub.scope === 'all' || !sub.section ? 'Year-Wide' : `Section: ${sub.section}`})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* SECTION 2: FILE SOURCE (DRIVE vs UPLOAD) */}
            {uploadSourceMode === 'drive' ? (
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4 space-y-3.5">
                <div className="flex items-center justify-between pb-1 border-b border-slate-200/60">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-md bg-[#171717] text-white flex items-center justify-center text-[10px] font-bold shrink-0">2</span>
                    <h4 className="text-xs font-bold text-slate-900">Choose File from Google Drive</h4>
                  </div>
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Select One</span>
                </div>

                {isLoadingDriveFiles ? (
                  <div className="py-6 text-center text-xs text-slate-500 flex flex-col items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-[#171717] border-t-transparent rounded-full animate-spin"></div>
                    <span>Loading Drive files for this subject...</span>
                  </div>
                ) : driveFilesError ? (
                  <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span>⚠️</span>
                      <span>{driveFilesError}</span>
                    </div>
                    {onNavigate && (
                      <button
                        type="button"
                        onClick={() => onNavigate('Settings')}
                        className="px-2.5 py-1 bg-amber-600 text-white rounded-lg font-bold text-[10px] whitespace-nowrap cursor-pointer"
                      >
                        Settings
                      </button>
                    )}
                  </div>
                ) : driveFiles.length === 0 ? (
                  <div className="p-4 bg-white border border-dashed border-slate-300 rounded-xl text-center text-xs text-slate-500 space-y-2">
                    <p className="font-semibold text-slate-800">No files found in this subject's Drive folder</p>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Upload draft files first using the Faculty Drive tab, or switch to "Upload New File" to add one now.
                    </p>
                    <button
                      type="button"
                      onClick={() => setUploadSourceMode('upload')}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold transition-all cursor-pointer"
                    >
                      Switch to Upload New File →
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1 scrollbar-thin">
                    {driveFiles.map((f) => {
                      const isSelected = selectedDriveFile?.id === f.id;
                      const hasPubs = f.publications?.length > 0;

                      return (
                        <div
                          key={f.id}
                          onClick={() => onSelectDriveFile(f)}
                          className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                            isSelected
                              ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                              : 'bg-white hover:bg-slate-100/70 border-slate-200 text-slate-800'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 ${
                              isSelected ? 'bg-white/20 text-white' : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}>
                              PDF
                            </div>
                            <div className="min-w-0">
                              <p className={`text-xs font-bold truncate ${isSelected ? 'text-white' : 'text-slate-900'}`} title={f.name}>
                                {f.name}
                              </p>
                              <div className={`flex items-center gap-2 text-[10px] ${isSelected ? 'text-white/70' : 'text-slate-400'}`}>
                                <span>{formatFileSize(f.size)}</span>
                                <span>•</span>
                                <span>{formatDate(f.modifiedTime || f.createdTime)}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {hasPubs ? (
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                isSelected ? 'bg-emerald-400/25 text-emerald-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              }`}>
                                Published
                              </span>
                            ) : (
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                isSelected ? 'bg-white/10 text-white/80' : 'bg-slate-100 text-slate-600'
                              }`}>
                                Draft
                              </span>
                            )}

                            {isSelected && (
                              <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs font-bold">
                                ✓
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              /* LOCAL FILE ATTACHMENT SECTION */
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4 space-y-3.5">
                <div className="flex items-center justify-between pb-1 border-b border-slate-200/60">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-md bg-[#171717] text-white flex items-center justify-center text-[10px] font-bold shrink-0">2</span>
                    <h4 className="text-xs font-bold text-slate-900">File Attachment</h4>
                  </div>
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Max 25 MB</span>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={onFileSelect}
                  className="hidden"
                  id="study-material-file-input"
                />

                {!file ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
                      isDragOver
                        ? 'border-[#171717] bg-[#171717]/5'
                        : 'border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-50/70'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center mx-auto mb-2">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                    </div>
                    <p className="text-xs font-bold text-slate-800">
                      Click to browse <span className="font-normal text-slate-500">or drag and drop your file</span>
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1 font-medium">
                      PDF documents up to 25 MB
                    </p>
                  </div>
                ) : (
                  <div className="border border-slate-200 bg-white rounded-xl p-3 sm:p-3.5 flex items-center justify-between gap-3 shadow-2xs">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-[#171717] text-white flex items-center justify-center shrink-0">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <path d="M14 2v6h6" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800 truncate" title={file.name}>
                          {file.name}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11px] text-slate-500 font-medium">
                            {formatFileSize(file.size)}
                          </span>
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                            Ready to upload
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={handleChangeFile}
                        className="px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                      >
                        Change
                      </button>
                      <button
                        type="button"
                        onClick={handleRemoveFile}
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Remove file"
                        aria-label="Remove selected file"
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* SECTION 3: MATERIAL DETAILS */}
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4 space-y-3.5">
              <div className="flex items-center justify-between pb-1 border-b border-slate-200/60">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-md bg-[#171717] text-white flex items-center justify-center text-[10px] font-bold shrink-0">3</span>
                  <h4 className="text-xs font-bold text-slate-900">Material Details</h4>
                </div>
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Required</span>
              </div>

              {/* Title & Category Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Material Title *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Lecture 1: Complexity Slides"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#171717]/10 focus:border-[#171717] transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Category *
                  </label>
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#171717]/10 focus:border-[#171717] transition-all"
                  >
                    <option value="Lecture Notes">Lecture Notes</option>
                    <option value="Lab Manuals & Code">Lab Manuals & Code</option>
                    <option value="Assignments & Problem Sets">Assignments & Problem Sets</option>
                    <option value="Syllabus & Course Plans">Syllabus & Course Plans</option>
                    <option value="Reference Books & Papers">Reference Books & Papers</option>
                    <option value="Previous Year Questions (PYQs)">Previous Year Questions (PYQs)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* SECTION 4: VISIBILITY & AUDIENCE SCOPE */}
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4 space-y-3.5">
              <div className="flex items-center justify-between pb-1 border-b border-slate-200/60">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-md bg-[#171717] text-white flex items-center justify-center text-[10px] font-bold shrink-0">4</span>
                  <h4 className="text-xs font-bold text-slate-900">Visibility & Publication Scope</h4>
                </div>
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Required</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Publication Audience *
                  </label>
                  <select
                    value={scope}
                    onChange={e => {
                      setScope(e.target.value);
                      if (e.target.value === 'year') setSection('');
                      else if (!section && currentSection) setSection(currentSection);
                    }}
                    disabled={!canUploadYearWide}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#171717]/10 focus:border-[#171717] disabled:opacity-60 transition-all"
                  >
                    {canUploadYearWide && (
                      <option value="year">Year-Wide (All Sections)</option>
                    )}
                    <option value="section">Specific Section</option>
                  </select>
                  {!canUploadYearWide && (
                    <p className="text-[10px] text-slate-400 mt-1">
                      Your subject allocation is restricted to section scope.
                    </p>
                  )}
                </div>

                {scope === 'section' && (
                  <div className="animate-fade-in">
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Target Section *
                    </label>
                    <select
                      required
                      value={section}
                      onChange={e => setSection(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#171717]/10 focus:border-[#171717] transition-all"
                    >
                      <option value="">-- Choose Section --</option>
                      {availableSections.length > 0 ? (
                        availableSections.map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))
                      ) : (
                        <>
                          <option value="Section A">Section A</option>
                          <option value="Section B">Section B</option>
                          <option value="Section C">Section C</option>
                        </>
                      )}
                    </select>
                  </div>
                )}
              </div>

              {/* Publication Notice */}
              <div className="p-3 bg-amber-50/80 border border-amber-200/70 rounded-xl text-[11px] text-amber-900 flex items-start gap-2.5">
                <span className="text-sm shrink-0">{uploadSourceMode === 'drive' ? '📢' : '🔒'}</span>
                <p className="leading-relaxed">
                  {uploadSourceMode === 'drive' ? (
                    <span>
                      <strong className="font-bold">Immediate Publication:</strong> Publishing from Faculty Drive links this file to students in {scope === 'year' ? 'all sections (Year-Wide)' : `Section ${section || 'selected'}`}. You can unpublish anytime in the materials list.
                    </span>
                  ) : (
                    <span>
                      <strong className="font-bold">Draft Protection:</strong> New file uploads start unpublished. Students will not see or download this material until you explicitly click "Publish to Students".
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* SECTION 5: OPTIONAL DESCRIPTION */}
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4 space-y-3.5">
              <div className="flex items-center justify-between pb-1 border-b border-slate-200/60">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-md bg-[#171717] text-white flex items-center justify-center text-[10px] font-bold shrink-0">5</span>
                  <h4 className="text-xs font-bold text-slate-900">Description / Instructions</h4>
                </div>
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Optional</span>
              </div>

              <div>
                <textarea
                  rows={2}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Instructions, topics covered, or reading guidelines for students..."
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#171717]/10 focus:border-[#171717] resize-none transition-all"
                />
              </div>
            </div>
          </div>

          {/* Footer Actions - Fixed at Bottom */}
          <div className="px-5 py-3.5 sm:px-6 sm:py-4 border-t border-slate-100 bg-slate-50/90 flex items-center justify-between sm:justify-end gap-3 shrink-0">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onCancel}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                isSubmitting ||
                assignedSubjects.length === 0 ||
                Boolean(driveConflictWarning) ||
                (uploadSourceMode === 'drive' && !selectedDriveFile)
              }
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-[#171717] hover:bg-[#2b2b2b] shadow-xs transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-95"
            >
              {isSubmitting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  <span>{uploadSourceMode === 'drive' ? 'Publishing from Drive...' : 'Uploading to Google Drive...'}</span>
                </>
              ) : uploadSourceMode === 'drive' ? (
                <>
                  <Icons.Drive />
                  <span>Publish from Google Drive</span>
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <span>Upload to Drive</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(modalNode, document.body);
  }
  return modalNode;
}

// -----------------------------------------------------------------------------
// SUBCOMPONENT: Delete Confirmation Modal
// -----------------------------------------------------------------------------
function DeleteConfirmModal({ material, isDeleting, onConfirm, onCancel }) {
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;
    const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;

    if (scrollBarWidth > 0) {
      document.body.style.paddingRight = `${scrollBarWidth}px`;
    }
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isDeleting) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDeleting, onCancel]);

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget && !isDeleting) {
      onCancel();
    }
  };

  const modalNode = (
    <div
      onClick={handleBackdropClick}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-xs animate-fade-in"
      style={{ minHeight: '100dvh' }}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl border border-slate-100 shadow-2xl w-full max-w-md overflow-hidden animate-scale-up p-5 sm:p-6 space-y-4 flex flex-col"
        style={{ maxHeight: 'calc(100dvh - 32px)' }}
      >
        <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto shrink-0">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
        </div>

        <div className="text-center shrink-0">
          <h3 className="text-base font-extrabold text-slate-900">Delete Study Material?</h3>
          <p className="text-xs text-slate-500 mt-1">
            "{material.title}"
          </p>
        </div>

        <div className="p-3 bg-amber-50 border border-amber-200/80 rounded-xl text-xs text-amber-800 leading-relaxed overflow-y-auto">
          <span className="font-bold">Safe Removal:</span> This removes the material metadata and revokes all student access. Note that removing metadata does not delete the original file from your Google Drive account.
        </div>

        <div className="pt-2 flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            disabled={isDeleting}
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isDeleting}
            onClick={onConfirm}
            className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {isDeleting ? 'Deleting...' : 'Confirm Delete'}
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(modalNode, document.body);
  }
  return modalNode;
}

// -----------------------------------------------------------------------------
// SUBCOMPONENT: Archive History Card (Faculty Study Material History)
// -----------------------------------------------------------------------------
function ArchiveHistoryCard({ material, onDownload, isDownloading, compact = false }) {
  const [showTimeline, setShowTimeline] = useState(false);
  const statusInfo = getMaterialDisplayStatus(material);

  const isUnavailable =
    material.status === 'unavailable' ||
    material.isAvailableInDrive === false ||
    statusInfo.code === 'deleted' ||
    statusInfo.code === 'trashed' ||
    statusInfo.code === 'revoked';

  const isDeliberatelyUnpublished =
    material.status === 'unpublished' && !isUnavailable;

  const uploadDate = formatDate(material.uploadedAt || material.createdAt) || 'Unknown';
  const pubDate = material.publishedAt ? formatDate(material.publishedAt) : (material.isPublished ? 'Published' : 'Never published');
  const unpubDate = material.unpublishedAt ? formatDate(material.unpublishedAt) : null;
  const detectedDate = material.unavailabilityDetectedAt ? formatDate(material.unavailabilityDetectedAt) : null;
  const historyEvents = Array.isArray(material.lifecycleHistory) ? material.lifecycleHistory : [];

  const getStatusBadgeStyle = () => {
    switch (statusInfo.code) {
      case 'published':
        return {
          badge: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
          dot: 'bg-emerald-500'
        };
      case 'unpublished':
        return {
          badge: 'bg-amber-50 text-amber-800 border border-amber-200',
          dot: 'bg-amber-500'
        };
      case 'deleted':
        return {
          badge: 'bg-rose-50 text-rose-700 border border-rose-200',
          dot: 'bg-rose-500'
        };
      case 'trashed':
        return {
          badge: 'bg-orange-50 text-orange-700 border border-orange-200',
          dot: 'bg-orange-500'
        };
      case 'revoked':
        return {
          badge: 'bg-amber-50 text-amber-800 border border-amber-300',
          dot: 'bg-amber-500'
        };
      default:
        return {
          badge: 'bg-slate-100 text-slate-700 border border-slate-200',
          dot: 'bg-slate-400'
        };
    }
  };

  const badgeStyle = getStatusBadgeStyle();

  return (
    <div className={`p-4 rounded-2xl border transition-all flex flex-col justify-between shadow-xs ${
      isUnavailable
        ? 'bg-slate-50/90 border-slate-200/90 text-slate-700'
        : 'bg-white border-slate-200/90 hover:border-slate-300'
    }`}>
      <div>
        {/* Top Badges */}
        <div className="flex items-start justify-between gap-2 mb-2.5 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            {material.subjectCode && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-slate-900 text-white font-mono">
                {material.subjectCode}
              </span>
            )}
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#C4B5FD]/20 text-[#4c1d95] border border-[#C4B5FD]/30">
              {material.category || 'Lecture Notes'}
            </span>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-200/80 text-slate-700">
              {material.isYearWide || material.scope === 'year'
                ? 'Year-Wide Audience'
                : `Section ${material.section || 'All'}`}
            </span>
            {material.driveFileId && (
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                Drive ID: {material.driveFileId.slice(0, 8)}...
              </span>
            )}
          </div>

          {/* Status Badge */}
          <span className={`text-[10px] font-black px-2.5 py-1 rounded-md flex items-center gap-1.5 ${badgeStyle.badge}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${badgeStyle.dot}`}></span>
            <span>{statusInfo.label}</span>
          </span>
        </div>

        {/* Title */}
        <h4 className="font-extrabold text-sm sm:text-base text-slate-900 leading-snug">
          {material.title}
        </h4>

        {/* Subject & Author Info */}
        <div className="text-[11px] text-slate-500 font-medium mt-1 flex flex-wrap gap-x-3 gap-y-1">
          {material.subjectName && (
            <span>Subject: <strong className="text-slate-700">{material.subjectName}</strong></span>
          )}
          {material.teacherName && (
            <span>Faculty: <strong className="text-slate-700">{material.teacherName}</strong></span>
          )}
          <span>Filename: <code className="font-mono text-slate-700">{material.fileName || `${material.title}.pdf`}</code></span>
          {material.fileSizeBytes ? <span>({formatFileSize(material.fileSizeBytes)})</span> : null}
        </div>

        {/* Unavailability Notice Box if file is unavailable in Google Drive */}
        {isUnavailable && (
          <div className="mt-3 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
            <div className="flex items-center gap-1.5 font-bold">
              <span>⚠️ External Google Drive File Missing</span>
            </div>
            <p className="mt-0.5 text-[11px] text-rose-700 leading-relaxed">
              {material.unavailabilityReason || 'This file was permanently deleted or trashed in connected Google Drive. Sangam preserves this publication history without storing the file contents.'}
            </p>
            {detectedDate && (
              <p className="text-[10px] text-rose-600 font-semibold mt-1">
                Detected: {detectedDate}
              </p>
            )}
          </div>
        )}

        {/* Deliberately Unpublished Clarification */}
        {isDeliberatelyUnpublished && (
          <div className="mt-3 p-2 rounded-xl bg-amber-50/80 border border-amber-200/80 text-amber-900 text-xs flex items-center gap-2">
            <span className="font-bold text-amber-700">ℹ️ Draft:</span>
            <span className="text-[11px]">
              Deliberately unpublished by faculty. The original document remains safe in your Google Drive.
            </span>
          </div>
        )}

        {/* Publication History Timestamps Summary */}
        <div className="mt-3 p-2.5 rounded-xl bg-white/70 border border-slate-200/60 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
          <div>
            <span className="text-slate-400 block font-medium">Uploaded</span>
            <span className="text-slate-800 font-semibold">{uploadDate}</span>
          </div>
          <div>
            <span className="text-slate-400 block font-medium">Published</span>
            <span className="text-slate-800 font-semibold">{pubDate}</span>
          </div>
          <div>
            <span className="text-slate-400 block font-medium">Unpublished</span>
            <span className="text-slate-800 font-semibold">{unpubDate || '—'}</span>
          </div>
          <div>
            <span className="text-slate-400 block font-medium">Drive Availability</span>
            <span className={`font-semibold ${isUnavailable ? 'text-rose-600' : 'text-emerald-700'}`}>
              {isUnavailable ? 'Deleted/Trashed' : 'Present in Drive'}
            </span>
          </div>
        </div>

        {/* Description */}
        {material.description && (
          <p className="text-xs text-slate-600 mt-2 line-clamp-2 leading-relaxed">
            {material.description}
          </p>
        )}
      </div>

      {/* Footer Controls & Timeline Expander */}
      <div className="mt-4 pt-3 border-t border-slate-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setShowTimeline(!showTimeline)}
          className="text-[11px] font-bold text-slate-600 hover:text-slate-900 flex items-center gap-1 cursor-pointer"
        >
          <span>{showTimeline ? '▼ Hide' : '▶ View'} Lifecycle Events ({historyEvents.length})</span>
        </button>

        <div className="flex items-center gap-2">
          {isUnavailable ? (
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 cursor-not-allowed select-none" title="File was deleted from Google Drive and cannot be downloaded">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
              <span>Download Inaccessible</span>
            </div>
          ) : (
            <button
              type="button"
              disabled={isDownloading}
              onClick={onDownload}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Download file through secure backend proxy"
            >
              {isDownloading ? (
                <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"></span>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              )}
              <span>Download Live Copy</span>
            </button>
          )}
        </div>
      </div>

      {/* Expanded Lifecycle Audit Events Timeline */}
      {showTimeline && (
        <div className="mt-3 pt-3 border-t border-slate-200 space-y-2 bg-slate-50/70 p-3 rounded-xl animate-fade-in">
          <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
            Lifecycle Audit History
          </p>
          {historyEvents.length === 0 ? (
            <p className="text-[11px] text-slate-400 italic">No transition events recorded.</p>
          ) : (
            <div className="relative pl-3 border-l-2 border-slate-300 space-y-2.5">
              {historyEvents.map((evt, idx) => (
                <div key={idx} className="relative text-[11px]">
                  <span className="absolute -left-[17px] top-1 w-2 h-2 rounded-full bg-slate-500"></span>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-800 capitalize">
                      {evt.action ? evt.action.replace(/_/g, ' ') : 'Event'}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {evt.timestamp ? new Date(evt.timestamp).toLocaleString() : ''}
                    </span>
                  </div>
                  {evt.details && (
                    <p className="text-slate-600 text-[10px] mt-0.5">{evt.details}</p>
                  )}
                  {evt.actorName && (
                    <p className="text-slate-400 text-[9px] mt-0.5">
                      Actor: {evt.actorName} ({evt.actorRole || 'faculty'})
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
