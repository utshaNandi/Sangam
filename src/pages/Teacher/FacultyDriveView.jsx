import { useState, useEffect, useRef } from 'react';
import { Icons } from './Icons';
import { fetchMyAssignedSubjects } from '../../services/subjectService';
import {
  fetchDriveSubjectFiles,
  uploadToDriveFolder,
  formatFileSize,
  formatDate,
  MAX_STUDY_MATERIAL_FILE_SIZE
} from '../../services/studyMaterialService';
import { getStorageStatus } from '../../services/storageService';

export { formatFileSize, formatDate };


export default function FacultyDriveView({
  userProfile,
  allocations = [],
  isLoadingAllocations = false,
  onNavigate
}) {
  const [assignedSubjects, setAssignedSubjects] = useState([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [files, setFiles] = useState([]);
  const [folderInfo, setFolderInfo] = useState(null);
  const [driveStatus, setDriveStatus] = useState(null);

  // Loading states
  const [isLoadingSubjects, setIsLoadingSubjects] = useState(true);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Feedback states
  const [uploadError, setUploadError] = useState(null);
  const [uploadSuccess, setUploadSuccess] = useState(null);
  const [viewError, setViewError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Handoff modal state
  const [selectedFileForHandoff, setSelectedFileForHandoff] = useState(null);

  const fileInputRef = useRef(null);

  // 1. Initial Load: Storage Status & Assigned Subjects
  useEffect(() => {
    let isMounted = true;

    async function initializeView() {
      setIsLoadingSubjects(true);
      setViewError(null);

      // Check Google Drive status
      try {
        const status = await getStorageStatus();
        if (isMounted) setDriveStatus(status);
      } catch (err) {
        if (isMounted) setDriveStatus({ connected: false });
      }

      // Fetch teacher assigned subjects
      try {
        const assignments = await fetchMyAssignedSubjects();
        if (isMounted) {
          // Normalize and deduplicate by subjectId
          const uniqueSubjects = [];
          const seenIds = new Set();

          for (const a of assignments) {
            const sid = a.subjectId || a.id;
            if (sid && !seenIds.has(sid) && a.active !== false) {
              seenIds.add(sid);
              uniqueSubjects.push({
                id: sid,
                name: a.subjectName || a.name || 'Untitled Subject',
                code: a.subjectCode || a.code || '',
                department: a.department || '',
                year: a.year || '',
                driveFolderId: a.driveFolderId || null
              });
            }
          }

          setAssignedSubjects(uniqueSubjects);
          if (uniqueSubjects.length > 0) {
            setSelectedSubjectId(uniqueSubjects[0].id);
          }
        }
      } catch (err) {
        if (isMounted) {
          console.warn('[FacultyDriveView] Failed to load subjects:', err.message);
          setViewError(err.message || 'Failed to load assigned subjects.');
        }
      } finally {
        if (isMounted) setIsLoadingSubjects(false);
      }
    }

    initializeView();

    return () => {
      isMounted = false;
    };
  }, [userProfile?.uid]);

  // 2. Load Drive Files when selectedSubjectId changes
  const loadSubjectFiles = async (subjectId) => {
    if (!subjectId) {
      setFiles([]);
      setFolderInfo(null);
      return;
    }

    setIsLoadingFiles(true);
    setViewError(null);

    try {
      const data = await fetchDriveSubjectFiles(subjectId);
      setFiles(data.files || []);
      setFolderInfo({
        folderId: data.folderId,
        folderName: data.folderName
      });
      // If we successfully fetched files, Drive is connected
      setDriveStatus(prev => ({ ...(prev || {}), connected: true }));
    } catch (err) {
      console.warn('[FacultyDriveView] Error loading Drive files:', err.message);
      if (err.statusCode === 424 || err.code === 'DRIVE_NOT_CONNECTED') {
        setDriveStatus({ connected: false });
        setViewError('Google Drive is not connected. Please connect your Google account in Settings to access this folder.');
      } else {
        setViewError(err.message || 'Failed to load files from Google Drive.');
      }
      setFiles([]);
      setFolderInfo(null);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  useEffect(() => {
    if (selectedSubjectId) {
      loadSubjectFiles(selectedSubjectId);
    }
  }, [selectedSubjectId]);

  // 3. Handle File Upload to Drive
  const handleFileUpload = async (event) => {
    const file = event.target?.files?.[0];
    if (!file) return;

    // Reset input so the same file can be selected again if needed
    if (event.target) event.target.value = '';

    setUploadError(null);
    setUploadSuccess(null);

    if (!selectedSubjectId) {
      setUploadError('Please select a subject before uploading files.');
      return;
    }

    // PDF validation
    const fileName = file.name || '';
    if (!fileName.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setUploadError('Only PDF files (.pdf) are supported in the Faculty Drive Library.');
      return;
    }

    // Size check (25 MB max)
    if (file.size > MAX_STUDY_MATERIAL_FILE_SIZE) {
      setUploadError(`File size (${(file.size / (1024 * 1024)).toFixed(1)}MB) exceeds the maximum allowed limit of 25MB.`);
      return;
    }

    setIsUploading(true);

    try {
      const uploaded = await uploadToDriveFolder(selectedSubjectId, file);
      setUploadSuccess(`"${uploaded.name || fileName}" uploaded to your private Google Drive folder. It remains unpublished to students.`);
      // Refresh file list
      await loadSubjectFiles(selectedSubjectId);
    } catch (err) {
      console.error('[FacultyDriveView] Upload error:', err);
      if (err.statusCode === 424 || err.code === 'DRIVE_NOT_CONNECTED') {
        setDriveStatus({ connected: false });
        setUploadError('Google Drive is not connected. Please connect your account in Settings before uploading.');
      } else {
        setUploadError(err.message || 'Failed to upload file to Google Drive.');
      }
    } finally {
      setIsUploading(false);
    }
  };

  const selectedSubject = assignedSubjects.find(s => s.id === selectedSubjectId);

  // Filter files by search query
  const filteredFiles = files.filter(f => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (f.name || '').toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6 animate-fade-in text-[#171717] pb-12">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#D8D1C3] pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black tracking-tight text-[#171717]">Faculty Drive Library</h1>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#EFA9D1]/30 text-[#831843] border border-[#EFA9D1]/60">
              Private Storage
            </span>
          </div>
          <p className="text-xs text-[#858174] font-medium mt-1">
            Browse course folders, manage draft coursework in your Google Drive, and publish to Study Materials.
          </p>
        </div>

        {/* Drive Connection Status Badge */}
        <div className="flex items-center gap-2">
          {driveStatus?.connected ? (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-full text-emerald-800 text-xs font-semibold shadow-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Drive Connected{driveStatus.accountEmail ? `: ${driveStatus.accountEmail}` : ''}</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onNavigate && onNavigate('Settings')}
              className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-full text-amber-900 text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95"
            >
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              <span>Connect Google Drive</span>
              <span className="text-[10px]">→</span>
            </button>
          )}
        </div>
      </div>

      {/* Disconnected Drive Warning Banner */}
      {driveStatus && !driveStatus.connected && (
        <div className="p-4 bg-amber-50/90 border border-amber-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-900 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700 flex-shrink-0 font-bold">
              ⚠️
            </div>
            <div>
              <p className="text-xs font-bold">Google Drive Disconnected or Authorization Expired</p>
              <p className="text-[11px] text-amber-800 leading-relaxed mt-0.5">
                Connect your institutional Google account in Settings to browse subject folders and store draft coursework privately.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate && onNavigate('Settings')}
            className="px-4 py-2 bg-[#171717] hover:bg-[#2b2b2b] text-white rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer shadow-xs active:scale-95 flex-shrink-0"
          >
            Open Settings
          </button>
        </div>
      )}

      {/* Global Action Feedback Alerts */}
      {uploadSuccess && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between text-emerald-900 text-xs font-semibold shadow-xs animate-hero-fade-up">
          <div className="flex items-center gap-2">
            <span className="font-bold text-emerald-600">✓</span>
            <span>{uploadSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setUploadSuccess(null)}
            className="text-emerald-700 hover:text-emerald-900 font-bold px-1 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {uploadError && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between text-rose-900 text-xs font-semibold shadow-xs animate-hero-fade-up">
          <div className="flex items-center gap-2">
            <span className="font-bold text-rose-600">!</span>
            <span>{uploadError}</span>
          </div>
          <button
            type="button"
            onClick={() => setUploadError(null)}
            className="text-rose-700 hover:text-rose-900 font-bold px-1 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {viewError && !uploadError && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between text-rose-900 text-xs font-semibold shadow-xs animate-hero-fade-up">
          <div className="flex items-center gap-2">
            <span className="font-bold text-rose-600">!</span>
            <span>{viewError}</span>
          </div>
          <button
            type="button"
            onClick={() => setViewError(null)}
            className="text-rose-700 hover:text-rose-900 font-bold px-1 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Subject Selection Tabs / Pills */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-bold text-[#858174] uppercase tracking-wider">
            Assigned Subjects
          </h2>
          <span className="text-[11px] text-[#858174]">
            {assignedSubjects.length} {assignedSubjects.length === 1 ? 'subject' : 'subjects'} assigned
          </span>
        </div>

        {isLoadingSubjects ? (
          <div className="flex items-center gap-2 py-3 overflow-x-auto">
            <div className="w-36 h-10 bg-white/70 animate-pulse rounded-xl border border-[#D8D1C3]"></div>
            <div className="w-36 h-10 bg-white/70 animate-pulse rounded-xl border border-[#D8D1C3]"></div>
          </div>
        ) : assignedSubjects.length === 0 ? (
          <div className="p-6 bg-white border border-[#D8D1C3] rounded-2xl text-center text-[#858174] text-xs">
            <p className="font-semibold text-[#171717] mb-1">No Assigned Subjects</p>
            <p>You have not been assigned to teach any subjects yet. Contact your Director to assign coursework.</p>
          </div>
        ) : (
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {assignedSubjects.map(sub => {
              const isSelected = sub.id === selectedSubjectId;
              return (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => {
                    setSelectedSubjectId(sub.id);
                    setUploadError(null);
                    setUploadSuccess(null);
                  }}
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-2 border select-none ${
                    isSelected
                      ? 'bg-[#171717] text-white border-[#171717] shadow-sm'
                      : 'bg-white hover:bg-[#F5E5EE] text-[#171717] border-[#D8D1C3]'
                  }`}
                >
                  {sub.code && (
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-[#D8D1C3]/40 text-[#858174]'
                    }`}>
                      {sub.code}
                    </span>
                  )}
                  <span>{sub.name}</span>
                  <span className={`text-[10px] font-medium ${
                    isSelected ? 'text-white/60' : 'text-[#858174]'
                  }`}>
                    • {sub.year}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Subject Folder Canvas */}
      {selectedSubject && (
        <div className="bg-white border border-[#D8D1C3] rounded-3xl p-6 shadow-xs space-y-6">
          {/* Folder Path & Action Toolbar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-[#D8D1C3]/60">
            <div>
              <div className="flex items-center gap-2 text-[11px] text-[#858174] font-medium">
                <span>Google Drive</span>
                <span>/</span>
                <span>Sangam Coursework</span>
                <span>/</span>
                <span className="text-[#171717] font-bold">
                  {folderInfo?.folderName || (selectedSubject.code ? `[${selectedSubject.code}] ${selectedSubject.name}` : selectedSubject.name)}
                </span>
              </div>
              <h3 className="text-lg font-black text-[#171717] mt-1">
                {selectedSubject.code ? `[${selectedSubject.code}] ` : ''}{selectedSubject.name}
              </h3>
              <p className="text-xs text-[#858174] mt-0.5">
                {selectedSubject.department} • {selectedSubject.year} • Drafts are private to your connected Google Drive
              </p>
            </div>

            {/* Action Bar (Search & Upload) */}
            <div className="flex items-center gap-3">
              {/* Search filter */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Filter files..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-40 sm:w-48 pl-8 pr-3 py-2 bg-[#F8F3E6] border border-[#D8D1C3] rounded-xl text-xs font-medium text-[#171717] placeholder-[#858174] focus:outline-none focus:border-[#171717] transition-all"
                />
                <span className="absolute left-2.5 top-2.5 text-[#858174]">
                  <Icons.Search />
                </span>
              </div>

              {/* Hidden PDF file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={handleFileUpload}
              />

              {/* Upload Draft PDF Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || (driveStatus && !driveStatus.connected)}
                className="flex items-center gap-2 px-4 py-2 bg-[#171717] hover:bg-[#2b2b2b] text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {isUploading ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>Uploading Draft...</span>
                  </>
                ) : (
                  <>
                    <Icons.Plus />
                    <span>Upload Draft PDF</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Files List / Grid */}
          <div>
            {isLoadingFiles ? (
              <div className="py-12 flex flex-col items-center justify-center text-center">
                <div className="w-7 h-7 border-3 border-[#171717] border-t-transparent rounded-full animate-spin mb-3"></div>
                <p className="text-xs text-[#858174] font-medium">Loading Google Drive files...</p>
              </div>
            ) : filteredFiles.length === 0 ? (
              <div className="py-12 px-4 flex flex-col items-center justify-center text-center bg-[#F8F3E6]/60 border border-dashed border-[#D8D1C3] rounded-2xl">
                <div className="w-12 h-12 rounded-2xl bg-white border border-[#D8D1C3] flex items-center justify-center text-[#171717] mb-3 shadow-xs">
                  <Icons.Drive />
                </div>
                <h4 className="text-sm font-bold text-[#171717]">
                  {searchQuery ? 'No matching files found' : 'No draft files in this subject folder'}
                </h4>
                <p className="text-xs text-[#858174] max-w-sm mt-1 leading-relaxed">
                  {searchQuery
                    ? `No files match your query "${searchQuery}". Clear the search filter to see all files.`
                    : 'Upload lecture notes, problem sets, or reference PDFs to this course folder in your Google Drive.'}
                </p>
                {!searchQuery && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading || (driveStatus && !driveStatus.connected)}
                    className="mt-4 px-4 py-2 bg-white hover:bg-[#F5E5EE] border border-[#D8D1C3] text-[#171717] rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                  >
                    Upload first PDF draft
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#D8D1C3] text-[11px] font-bold text-[#858174] uppercase tracking-wider select-none">
                      <th className="py-3 px-3">File Name</th>
                      <th className="py-3 px-3">Size</th>
                      <th className="py-3 px-3">Date</th>
                      <th className="py-3 px-3">Status</th>
                      <th className="py-3 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#D8D1C3]/40 font-medium">
                    {filteredFiles.map(file => {
                      const isPublished = Boolean(file.isPublished);
                      const publications = Array.isArray(file.publications) ? file.publications : [];

                      return (
                        <tr key={file.id} className="hover:bg-[#F8F3E6]/50 transition-colors group">
                          {/* Name + PDF badge */}
                          <td className="py-3.5 px-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 flex items-center justify-center text-[10px] font-black flex-shrink-0">
                                PDF
                              </div>
                              <div className="truncate max-w-xs sm:max-w-md">
                                <span className="font-bold text-[#171717] group-hover:text-[#171717] transition-colors truncate block">
                                  {file.name}
                                </span>
                                <span className="text-[10px] text-[#858174] font-mono block">
                                  ID: {file.id}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Size */}
                          <td className="py-3.5 px-3 text-[#858174] whitespace-nowrap">
                            {formatFileSize(file.size)}
                          </td>

                          {/* Date */}
                          <td className="py-3.5 px-3 text-[#858174] whitespace-nowrap">
                            {formatDate(file.modifiedTime || file.createdTime)}
                          </td>

                          {/* Publication Status Badge */}
                          <td className="py-3.5 px-3 whitespace-nowrap">
                            {isPublished ? (
                              <div className="flex flex-col gap-1 items-start">
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                  Published
                                </span>
                                {publications.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {publications.map((pub, idx) => (
                                      <span
                                        key={pub.id || idx}
                                        className="text-[9px] font-semibold text-[#858174] bg-[#F8F3E6] border border-[#D8D1C3] px-1.5 py-0.2 rounded"
                                      >
                                        {pub.isYearWide || pub.scope === 'year'
                                          ? 'Year-Wide'
                                          : `Sec ${pub.section || ''}`}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#F8F3E6] text-[#858174] border border-[#D8D1C3]">
                                Private Draft
                              </span>
                            )}
                          </td>

                          {/* Action Button */}
                          <td className="py-3.5 px-3 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => setSelectedFileForHandoff(file)}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-2xs ${
                                isPublished
                                  ? 'bg-[#F8F3E6] hover:bg-[#F5E5EE] text-[#171717] border border-[#D8D1C3]'
                                  : 'bg-[#171717] hover:bg-[#2b2b2b] text-white'
                              }`}
                            >
                              {isPublished ? 'Manage publication' : 'Publish as Study Material'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Handoff Modal (Safe Navigation to Study Material) */}
      {selectedFileForHandoff && (
        <div className="fixed inset-0 z-50 bg-[#171717]/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#F8F3E6] border border-[#D8D1C3] rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#D8D1C3]">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-white border border-[#D8D1C3] flex items-center justify-center text-xs font-bold">
                  📄
                </span>
                <h3 className="text-sm font-black text-[#171717]">
                  {selectedFileForHandoff.isPublished ? 'Manage Publication' : 'Publish as Study Material'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedFileForHandoff(null)}
                className="text-[#858174] hover:text-[#171717] text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div>
                <span className="text-[11px] text-[#858174] font-medium block">Selected Drive File:</span>
                <p className="font-bold text-[#171717] break-words">{selectedFileForHandoff.name}</p>
                <p className="text-[10px] font-mono text-[#858174]">ID: {selectedFileForHandoff.id}</p>
              </div>

              <div>
                <span className="text-[11px] text-[#858174] font-medium block">Coursework Subject:</span>
                <p className="font-semibold text-[#171717]">
                  {selectedSubject?.code ? `[${selectedSubject.code}] ` : ''}{selectedSubject?.name}
                </p>
              </div>

              <div>
                <span className="text-[11px] text-[#858174] font-medium block">Current Status:</span>
                {selectedFileForHandoff.isPublished ? (
                  <div className="mt-1">
                    <span className="inline-block px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                      Published to Students
                    </span>
                    {selectedFileForHandoff.publications?.length > 0 && (
                      <ul className="mt-1.5 space-y-1 text-[11px] text-[#858174]">
                        {selectedFileForHandoff.publications.map(p => (
                          <li key={p.id} className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            <span>{p.title} ({p.isYearWide || p.scope === 'year' ? 'Year-Wide' : `Section ${p.section}`})</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : (
                  <span className="inline-block mt-1 px-2 py-0.5 rounded bg-[#D8D1C3]/60 text-[#171717] text-[10px] font-bold">
                    Private Draft (Not visible to students)
                  </span>
                )}
              </div>

              <div className="p-3 bg-white/70 border border-[#D8D1C3] rounded-xl text-[11px] text-[#858174] leading-relaxed">
                Study Material publication is managed in the <strong>Academic Spaces</strong> workflow.
                Phase D will integrate direct publication options into the Study Material view.
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setSelectedFileForHandoff(null)}
                className="px-4 py-2 bg-white hover:bg-[#F5E5EE] border border-[#D8D1C3] text-[#171717] rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  const fileToHandoff = selectedFileForHandoff;
                  setSelectedFileForHandoff(null);
                  if (onNavigate) {
                    const handoffPayload = {
                      preselectedSubjectId: selectedSubject?.id,
                      department: selectedSubject?.department,
                      year: selectedSubject?.year,
                      preselectedDriveFile: fileToHandoff,
                      mode: fileToHandoff?.isPublished ? 'manage' : 'publish'
                    };
                    if (handoffPayload) {
                      onNavigate('Academic Spaces', handoffPayload);
                    } else {
                      onNavigate('Academic Spaces');
                    }
                  }
                }}
                className="px-4 py-2 bg-[#171717] hover:bg-[#2b2b2b] text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95"
              >
                {selectedFileForHandoff?.isPublished ? 'Manage in Study Material →' : 'Publish in Study Material →'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
