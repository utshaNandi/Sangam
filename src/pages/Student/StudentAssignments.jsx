import React, { useState, useEffect } from 'react';
import { Icons } from '../Teacher/Icons';
import { submitStudentAssignment, getStudentSubmissions, getStudentAssignments, downloadAssignmentPdf } from '../../services/storageService.js';

export default function StudentAssignments({ userProfile }) {
  const [expandedId, setExpandedId] = useState(null);
  const [uploadFiles, setUploadFiles] = useState({});
  const [persistedSubmissions, setPersistedSubmissions] = useState({});
  const [submittingIds, setSubmittingIds] = useState({});
  const [submissionErrors, setSubmissionErrors] = useState({});
  const [idempotencyKeys, setIdempotencyKeys] = useState({});
  const [cloudAssignments, setCloudAssignments] = useState([]);
  const [downloadingIds, setDownloadingIds] = useState({});
  const [downloadErrors, setDownloadErrors] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const studentName = (userProfile?.name && userProfile.name.trim())
    || (userProfile?.email ? userProfile.email.split('@')[0] : '')
    || 'Student';
  const studentId = userProfile?.uid || 'student';
  const studentRef = userProfile?.uid ? userProfile.uid.slice(0, 8).toUpperCase() : 'STUDENT';
  const section = userProfile?.section || '';

  // Load persisted submissions and assignments from backend on mount or when user changes
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      if (!userProfile?.uid) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setLoadError(null);
      try {
        const [subRes, asgRes] = await Promise.allSettled([
          getStudentSubmissions(),
          getStudentAssignments()
        ]);

        if (isMounted && subRes.status === 'fulfilled' && subRes.value?.success && Array.isArray(subRes.value.submissions)) {
          const map = {};
          subRes.value.submissions.forEach(sub => {
            map[sub.assignmentId] = sub;
          });
          setPersistedSubmissions(map);
        }

        if (isMounted && asgRes.status === 'fulfilled' && asgRes.value?.success && Array.isArray(asgRes.value.assignments)) {
          setCloudAssignments(asgRes.value.assignments);
        } else if (asgRes.status === 'rejected') {
          console.warn('[StudentAssignments] Assignment fetch rejected:', asgRes.reason?.message);
          setLoadError(asgRes.reason?.message || 'Failed to load assignments.');
        }
      } catch (err) {
        console.warn('[StudentAssignments] Data could not be loaded from backend:', err.message);
        if (isMounted) setLoadError(err.message || 'Failed to connect to assignments service.');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    loadData();
    return () => { isMounted = false; };
  }, [userProfile?.uid]);

  // Real backend assignments mapped to presentation structure
  const formattedCloudAssignments = cloudAssignments.map(ca => ({
    id: ca.id,
    title: ca.title,
    className: `${ca.year || ''} • ${ca.department || ''} • ${ca.section || ''}`.replace(/^ • | • $/g, ''),
    subject: ca.subject || `${ca.department || ''} Coursework`.trim() || 'Coursework',
    actualSubject: ca.subject || `${ca.department || ''} Coursework`.trim() || 'Coursework',
    teacher: ca.teacherName || (ca.teacherEmail ? ca.teacherEmail.split('@')[0] : 'Faculty'),
    dueDate: ca.dueDate,
    hasFile: Boolean(ca.hasFile),
    fileName: ca.fileName || 'assignment.pdf',
    fileSizeBytes: ca.fileSizeBytes,
    isBackendAssignment: true
  }));

  const studentAssignments = formattedCloudAssignments;

  const pendingAssignments = studentAssignments.map(a => {
    const persisted = persistedSubmissions[a.id];
    const isSubmitted = Boolean(persisted);
    const hasPdf = Boolean(a.hasFile);
    const fileName = a.fileName || 'assignment.pdf';
    const fileSize = a.fileSizeBytes || null;

    return {
      id: a.id,
      title: a.title,
      subject: a.className || section || 'Coursework',
      actualSubject: a.actualSubject || a.subject || 'Coursework',
      teacher: a.teacher || 'Faculty',
      dueDate: a.dueDate,
      status: isSubmitted ? 'Submitted' : 'Pending',
      progress: isSubmitted ? 100 : 0,
      hasFile: a.hasFile,
      hasPdf,
      fileName,
      fileSize,
      isBackendAssignment: true,
      persistedSubmission: persisted || null,
      isSubmitted,
      isCloudBacked: Boolean(persisted?.driveFileId)
    };
  });

  const handleDownloadPdf = async (assignment, e) => {
    e.stopPropagation();
    if (downloadingIds[assignment.id]) return;

    setDownloadErrors(prev => ({ ...prev, [assignment.id]: null }));

    // If purely local mock with valid pdfUrl
    if (!assignment.isBackendAssignment && assignment.pdfUrl) {
      const link = document.createElement('a');
      link.href = assignment.pdfUrl;
      link.download = assignment.fileName || 'assignment.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    // Cloud backend assignment download
    setDownloadingIds(prev => ({ ...prev, [assignment.id]: true }));
    try {
      await downloadAssignmentPdf(assignment.id, assignment.fileName);
    } catch (err) {
      console.error('[StudentAssignments] Download PDF error:', err);
      setDownloadErrors(prev => ({
        ...prev,
        [assignment.id]: err.message || 'Failed to download assignment PDF.'
      }));
    } finally {
      setDownloadingIds(prev => ({ ...prev, [assignment.id]: false }));
    }
  };

  const handleFileSelect = (assignmentId, e) => {
    if (e.target.files && e.target.files[0]) {
      setUploadFiles(prev => ({
        ...prev,
        [assignmentId]: e.target.files[0]
      }));
      setSubmissionErrors(prev => ({
        ...prev,
        [assignmentId]: null
      }));
    }
  };

  const handleSubmit = async (assignmentId, e) => {
    e.stopPropagation();
    const file = uploadFiles[assignmentId];
    if (!file) return;

    // Reuse existing idempotency key if user is retrying after a failure
    let key = idempotencyKeys[assignmentId];
    if (!key) {
      key = `sub_${assignmentId}_${studentId}_${Date.now()}`;
      setIdempotencyKeys(prev => ({ ...prev, [assignmentId]: key }));
    }

    setSubmittingIds(prev => ({ ...prev, [assignmentId]: true }));
    setSubmissionErrors(prev => ({ ...prev, [assignmentId]: null }));

    try {
      const res = await submitStudentAssignment({
        file,
        assignmentId,
        idempotencyKey: key
      });

      if (res.success && res.submission) {
        setPersistedSubmissions(prev => ({
          ...prev,
          [assignmentId]: res.submission
        }));

        // Only clear upload file and key upon confirmed success!
        setUploadFiles(prev => ({ ...prev, [assignmentId]: null }));
        setIdempotencyKeys(prev => ({ ...prev, [assignmentId]: null }));
      } else {
        throw new Error(res.error || 'Failed to submit assignment response.');
      }
    } catch (err) {
      console.error('[StudentAssignments] Submit error:', err);
      let message = err.message || 'Submission failed. Please check your connection and try again.';
      if (err.code === 'TEACHER_DRIVE_DISCONNECTED') {
        message = "Faculty Google Drive is disconnected. Your answer could not be uploaded because the faculty member has not connected their Google Drive account.";
      } else if (err.code === 'SERVER_UNAVAILABLE') {
        message = 'Unable to reach the Sangam backend server. Please verify your connection.';
      } else if (err.code === 'PAST_DUE') {
        message = 'The due date for this assignment has passed. Submissions are no longer accepted.';
      } else if (err.code === 'FORBIDDEN_SCOPE') {
        message = 'You are not eligible to submit this assignment (class or section mismatch).';
      }
      setSubmissionErrors(prev => ({
        ...prev,
        [assignmentId]: message
      }));
      // Note: uploadFiles[assignmentId] is preserved so the student does not have to re-select the file!
    } finally {
      setSubmittingIds(prev => ({ ...prev, [assignmentId]: false }));
    }
  };

  const tree = {};
  pendingAssignments.forEach(a => {
    const t = a.teacher || 'Unknown';
    const s = a.actualSubject || 'Not specified';
    if (!tree[t]) tree[t] = {};
    if (!tree[t][s]) tree[t][s] = [];
    tree[t][s].push(a);
  });

  return (
    <div className="space-y-6 animate-fade-in relative z-10 pb-8">
      {/* Header Area */}
      <div className="bg-white rounded-[24px] border border-slate-200/60 shadow-sm p-5 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-5 opacity-5 pointer-events-none">
          <Icons.Assignments />
        </div>
        <div className="relative z-10">
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight mb-1">
            Assignments
          </h2>
          <p className="text-sm text-slate-600 max-w-2xl">
            Track and submit your coursework.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-[24px] border border-slate-100 shadow-[0_2px_20px_rgba(0,0,0,0.02)] p-7">
        <h3 className="text-xl font-bold text-slate-900 tracking-tight mb-5">All Assignments</h3>
        {isLoading ? (
          <div className="p-12 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-slate-900 border-t-transparent mb-3"></div>
            <p className="text-sm font-medium text-slate-500">Loading assignments...</p>
          </div>
        ) : loadError ? (
          <div className="p-8 text-center bg-rose-50 rounded-2xl border border-rose-200">
            <p className="text-sm font-bold text-rose-700 mb-2">{loadError}</p>
            <p className="text-xs text-rose-500">Please check your network connection or try again.</p>
          </div>
        ) : Object.keys(tree).length === 0 ? (
          <div className="p-12 text-center bg-slate-50 rounded-2xl border border-slate-100">
            <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center mx-auto mb-3 text-slate-400">
              <Icons.Assignments />
            </div>
            <h4 className="text-base font-bold text-slate-800 mb-1">No Assignments Available</h4>
            <p className="text-sm text-slate-500 max-w-sm mx-auto">
              There are currently no coursework assignments posted for your section ({userProfile?.section || 'your class'}).
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {Object.entries(tree).map(([teacherName, subjects]) => (
            <div key={teacherName} className="space-y-6 pt-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-700">
                  {teacherName.charAt(0)}
                </div>
                <h4 className="text-xl font-bold text-slate-900">Teacher: {teacherName}</h4>
              </div>

              <div className="ml-5 border-l-2 border-slate-200 pl-8 space-y-8 relative">
                {Object.entries(subjects).map(([subjectName, assignments]) => (
                  <div key={subjectName} className="relative">
                    <div className="absolute -left-[34px] top-3 w-6 h-0.5 bg-slate-200"></div>

                    <div className="flex items-center gap-2 mb-4">
                      <h5 className="font-bold text-slate-700 text-lg">Subject: {subjectName}</h5>
                    </div>

                    <div className="ml-2 border-l-2 border-slate-100 pl-8 space-y-4 relative">
                      {assignments.map(a => {
                        const isExpanded = expandedId === a.id;
                        return (
                          <div key={a.id} className="relative">
                             <div className="absolute -left-[34px] top-12 w-6 h-0.5 bg-slate-100"></div>

                             <div
                               onClick={() => setExpandedId(isExpanded ? null : a.id)}
                               className={`flex flex-col p-4 rounded-2xl border transition-all duration-300 cursor-pointer group ${isExpanded ? 'border-theme-primary/30 bg-slate-50' : 'border-slate-100 hover:border-theme-primary/30 hover:bg-theme-bg/30 hover:shadow-[0_4px_20px_rgba(0,0,0,0.04)] hover:-translate-y-1'}`}
                             >
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between">
                                  <div>
                                    <h4 className="font-bold text-slate-900 group-hover:text-theme-primary transition-colors duration-300">{a.title}</h4>
                                    <p className="text-sm text-slate-500 font-medium mt-1">{a.subject} • Due {a.dueDate}</p>
                                    <p className="text-sm text-slate-500 font-medium mt-1">Subject: {a.actualSubject || 'Not specified'}</p>
                                    <p className="text-sm text-slate-500 font-medium mt-1">Teacher: {a.teacher || 'Unknown'}</p>
                                  </div>
                                  <div className="mt-3 sm:mt-0 flex items-center gap-5">
                                    <div className="text-right">
                                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${
                                        a.status === 'Pending'
                                          ? 'bg-amber-100 text-amber-700'
                                          : a.isCloudBacked
                                          ? 'bg-emerald-100 text-emerald-800'
                                          : 'bg-slate-100 text-slate-700'
                                      }`}>
                                        {a.status === 'Pending' ? 'Pending' : (a.isCloudBacked ? 'Submitted (Drive)' : 'Submitted (Draft)')}
                                      </span>
                                    </div>
                                    <div className="text-right transition-transform duration-300 group-hover:-translate-x-1">
                                      <p className="text-sm font-bold text-slate-900">{a.progress}%</p>
                                      <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Completed</p>
                                    </div>
                                    <div className="w-20 h-2.5 bg-slate-100 rounded-full overflow-hidden relative shadow-inner">
                                      <div className="absolute top-0 left-0 h-full bg-theme-primary rounded-full" style={{ width: `${a.progress}%` }}></div>
                                    </div>
                                  </div>
                                </div>

                                {isExpanded && (
                                  <div className="mt-6 pt-6 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-6" onClick={(e) => e.stopPropagation()}>
                                    <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
                                      <h5 className="font-bold text-slate-900 mb-3 flex items-center gap-2">
                                        <Icons.Resources /> Assignment PDF
                                      </h5>
                                      {a.hasPdf ? (
                                        <div className="space-y-2">
                                          <div className="flex items-center justify-between bg-slate-50 p-4 rounded-lg border border-slate-100">
                                            <div className="flex items-center gap-3">
                                              <div className="p-2 bg-red-100 text-red-600 rounded-lg">
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                                              </div>
                                              <div>
                                                <p className="text-sm font-bold text-slate-700 truncate max-w-[150px]">{a.fileName}</p>
                                                {a.fileSize && (
                                                  <p className="text-xs text-slate-500">{(a.fileSize / 1024 / 1024).toFixed(2)} MB</p>
                                                )}
                                              </div>
                                            </div>
                                            <button
                                              type="button"
                                              disabled={downloadingIds[a.id]}
                                              onClick={(e) => handleDownloadPdf(a, e)}
                                              className={`px-3 py-1.5 bg-theme-primary text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
                                                downloadingIds[a.id] ? 'opacity-70 cursor-wait' : 'hover:bg-theme-primary/90'
                                              }`}
                                            >
                                              {downloadingIds[a.id] ? (
                                                <>
                                                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                                  Downloading...
                                                </>
                                              ) : (
                                                <>
                                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                                    <polyline points="7 10 12 15 17 10"></polyline>
                                                    <line x1="12" y1="15" x2="12" y2="3"></line>
                                                  </svg>
                                                  Download
                                                </>
                                              )}
                                            </button>
                                          </div>
                                          {downloadErrors[a.id] && (
                                            <p className="text-xs text-red-600 bg-red-50 p-2 rounded border border-red-200">
                                              {downloadErrors[a.id]}
                                            </p>
                                          )}
                                        </div>
                                      ) : (
                                        <div className="text-sm text-slate-500 italic p-4 bg-slate-50 rounded-lg text-center border border-slate-100">
                                          No PDF uploaded by Faculty.
                                        </div>
                                      )}
                                    </div>

                                    <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
                                      <h5 className="font-bold text-slate-900 mb-3 flex items-center gap-2">
                                        <Icons.Assignments /> Submit Answer
                                      </h5>
                                      {a.status === 'Not Pending' ? (
                                        a.isCloudBacked ? (
                                          <div className="p-4 bg-emerald-50 text-emerald-800 rounded-lg border border-emerald-100">
                                            <div className="flex items-start gap-3">
                                              <svg className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                                                <polyline points="22 4 12 14.01 9 11.01"></polyline>
                                              </svg>
                                              <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                  <p className="text-sm font-bold text-emerald-900">Answer Submitted</p>
                                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                                    <svg className="w-3 h-3 text-emerald-600" viewBox="0 0 24 24" fill="currentColor">
                                                      <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/>
                                                    </svg>
                                                    Google Drive
                                                  </span>
                                                </div>
                                                <p className="text-xs text-emerald-700 font-medium mt-1 truncate">
                                                  {a.persistedSubmission?.fileName || a.persistedSubmission?.originalFileName || 'Response uploaded to teacher coursework'}
                                                </p>
                                                {a.persistedSubmission?.submittedAt && (
                                                  <p className="text-[11px] text-emerald-600 mt-1">
                                                    Submitted on {new Date(a.persistedSubmission.submittedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                  </p>
                                                )}
                                                <button
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setPersistedSubmissions(prev => {
                                                      const copy = { ...prev };
                                                      delete copy[a.id];
                                                      return copy;
                                                    });
                                                  }}
                                                  className="mt-3 text-xs font-semibold text-emerald-800 underline hover:text-emerald-950 block"
                                                >
                                                  Upload a revised response
                                                </button>
                                              </div>
                                            </div>
                                          </div>
                                        ) : (
                                          <div className="p-4 bg-slate-50 text-slate-700 rounded-lg border border-slate-200">
                                            <div className="flex items-start gap-3">
                                              <svg className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                                                <polyline points="22 4 12 14.01 9 11.01"></polyline>
                                              </svg>
                                              <div>
                                                <div className="flex items-center gap-2">
                                                  <p className="text-sm font-bold text-slate-800">Answer Submitted (Local Draft)</p>
                                                  <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700">
                                                    Local Draft
                                                  </span>
                                                </div>
                                                <p className="text-xs text-slate-500 mt-1">Response saved in browser memory only.</p>
                                              </div>
                                            </div>
                                          </div>
                                        )
                                      ) : (
                                        <div className="space-y-4">
                                          {submissionErrors[a.id] && (
                                            <div className="p-3 bg-red-50 text-red-700 rounded-lg border border-red-200 text-xs flex items-start gap-2">
                                              <svg className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                                              <div>
                                                <p className="font-bold">Submission Failed</p>
                                                <p className="mt-0.5">{submissionErrors[a.id]}</p>
                                              </div>
                                            </div>
                                          )}

                                          <div className="border-2 border-dashed border-slate-200 rounded-lg p-4 text-center hover:border-theme-primary/50 transition-colors bg-slate-50/50">
                                            <input
                                              type="file"
                                              accept=".pdf,application/pdf"
                                              disabled={submittingIds[a.id]}
                                              onChange={(e) => handleFileSelect(a.id, e)}
                                              className="hidden"
                                              id={`upload-${a.id}`}
                                            />
                                            <label htmlFor={`upload-${a.id}`} className={`flex flex-col items-center gap-2 ${submittingIds[a.id] ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                                              <div className="w-8 h-8 rounded-full bg-theme-primary/10 text-theme-primary flex items-center justify-center">
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                                              </div>
                                              <span className="text-sm font-bold text-theme-primary truncate max-w-[220px]">
                                                {uploadFiles[a.id] ? uploadFiles[a.id].name : 'Select PDF Answer'}
                                              </span>
                                              <span className="text-[11px] text-slate-400">PDF document up to 10MB</span>
                                            </label>
                                          </div>

                                          <button
                                            onClick={(e) => handleSubmit(a.id, e)}
                                            disabled={!uploadFiles[a.id] || submittingIds[a.id]}
                                            className={`w-full py-2.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                                              submittingIds[a.id]
                                                ? 'bg-theme-primary/70 text-white cursor-wait'
                                                : uploadFiles[a.id]
                                                ? 'bg-theme-primary text-white shadow-md hover:shadow-lg hover:bg-theme-primary/90'
                                                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                            }`}
                                          >
                                            {submittingIds[a.id] ? (
                                              <>
                                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                                Uploading to Google Drive...
                                              </>
                                            ) : (
                                              'Submit Answer'
                                            )}
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                             </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        )}
      </div>
    </div>
  );
}
