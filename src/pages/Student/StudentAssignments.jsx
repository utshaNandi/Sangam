import React, { useState } from 'react';
import { Icons } from '../Teacher/Icons';
import { assignments, students, submitAssignment, studentSubmissions } from '../Teacher/mockData';

export default function StudentAssignments() {
  const [expandedId, setExpandedId] = useState(null);
  const [uploadFiles, setUploadFiles] = useState({});

  const student = students.find(s => s.section === 'CSE-C') || students[0];
  const studentAssignments = assignments.filter(a => a.className === student.section);

  const pendingAssignments = studentAssignments.map(a => {
    const isSubmitted = !!(studentSubmissions[a.id] && studentSubmissions[a.id][student.id]);
    const pdfUrl = a.pdf ? URL.createObjectURL(a.pdf) : null;
    return {
      id: a.id,
      title: a.title,
      subject: a.className,
      dueDate: a.dueDate,
      status: isSubmitted ? 'Not Pending' : 'Pending',
      progress: isSubmitted ? 100 : 0,
      pdf: a.pdf,
      pdfUrl,
      actualSubject: a.subject,
      teacher: a.teacher
    };
  });

  const handleFileSelect = (assignmentId, e) => {
    if (e.target.files && e.target.files[0]) {
      setUploadFiles(prev => ({
        ...prev,
        [assignmentId]: e.target.files[0]
      }));
    }
  };

  const handleSubmit = (assignmentId, e) => {
    e.stopPropagation();
    const file = uploadFiles[assignmentId];
    if (file) {
      submitAssignment(assignmentId, student.id, file);
      // Force re-render hack by updating local state (or rely on React state if we used it, but here mockData is mutable)
      setUploadFiles(prev => ({...prev, [assignmentId]: null}));
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
        <div className="space-y-3">
          {Object.keys(tree).length > 0 ? Object.entries(tree).map(([teacherName, subjects]) => (
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
                                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${a.status === 'Pending' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                        {a.status}
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
                                      {a.pdf ? (
                                        <div className="flex items-center justify-between bg-slate-50 p-4 rounded-lg border border-slate-100">
                                          <div className="flex items-center gap-3">
                                            <div className="p-2 bg-red-100 text-red-600 rounded-lg">
                                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                                            </div>
                                            <div>
                                              <p className="text-sm font-bold text-slate-700 truncate max-w-[150px]">{a.pdf.name}</p>
                                              <p className="text-xs text-slate-500">{(a.pdf.size / 1024 / 1024).toFixed(2)} MB</p>
                                            </div>
                                          </div>
                                          <a href={a.pdfUrl} download={a.pdf.name} className="px-3 py-1.5 bg-theme-primary text-white text-xs font-bold rounded-lg hover:bg-theme-primary/90 transition-colors">
                                            Download
                                          </a>
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
                                        <div className="flex items-center gap-3 p-4 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-100">
                                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                                          <div>
                                            <p className="text-sm font-bold">Answer Submitted</p>
                                            <p className="text-xs opacity-80">You have successfully uploaded your response.</p>
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="space-y-4">
                                          <div className="border-2 border-dashed border-slate-200 rounded-lg p-4 text-center hover:border-theme-primary/50 transition-colors bg-slate-50/50">
                                            <input 
                                              type="file" 
                                              accept=".pdf" 
                                              onChange={(e) => handleFileSelect(a.id, e)} 
                                              className="hidden" 
                                              id={`upload-${a.id}`} 
                                            />
                                            <label htmlFor={`upload-${a.id}`} className="cursor-pointer flex flex-col items-center gap-2">
                                              <div className="w-8 h-8 rounded-full bg-theme-primary/10 text-theme-primary flex items-center justify-center">
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                                              </div>
                                              <span className="text-sm font-bold text-theme-primary">
                                                {uploadFiles[a.id] ? uploadFiles[a.id].name : 'Select PDF Answer'}
                                              </span>
                                            </label>
                                          </div>
                                          <button 
                                            onClick={(e) => handleSubmit(a.id, e)}
                                            disabled={!uploadFiles[a.id]}
                                            className={`w-full py-2.5 rounded-xl font-bold text-sm transition-all ${uploadFiles[a.id] ? 'bg-theme-primary text-white shadow-md hover:shadow-lg' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                                          >
                                            Submit Answer
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
          )) : (
            <div className="text-center py-10 text-slate-500">
              <p>No assignments found.</p>
            </div>
          )}
</div>
      </div>
    </div>
  );
}
