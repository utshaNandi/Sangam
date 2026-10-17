import { useState, useEffect } from 'react';
import { Icons } from '../Teacher/Icons';
import { auth, db } from '../../firebase/config';
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { partitionStudentRecords, deduplicateFacultyRecords } from './studentPartition';
import { createTeacherAllocation, deleteTeacherAllocation, fetchTeacherAllocations } from '../../services/attendanceService';

const DEPARTMENTS = [
  'Computer Science',
  'CSE AI',
  'CSE',
  'Information Technology',
  'Electronics & Communication',
  'ECE',
  'Electrical Engineering',
  'Mechanical Engineering',
  'Civil Engineering',
  'Biotechnology',
  'Management'
];

const YEARS = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
const SECTIONS = ['Sec A', 'Sec B', 'Sec C', 'Sec D', 'Section A', 'Section B', 'Section C'];

export function PeopleView({ userProfile, initialTab }) {
  const [activeTab, setActiveTab] = useState(initialTab || 'Pending Approvals');
  const [pendingStudents, setPendingStudents] = useState([]);
  const [activeStudents, setActiveStudents] = useState([]);
  const [facultyList, setFacultyList] = useState([]);
  const [allocationsList, setAllocationsList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudentForApproval, setSelectedStudentForApproval] = useState(null);
  const [selectedFacultyForAllocation, setSelectedFacultyForAllocation] = useState(null);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const fetchStudents = async (showLoading = false) => {
    if (showLoading) {
      setIsLoading(true);
    }
    try {
      // 1. Query students from Cloud Firestore as single source of truth
      const studentsQ = query(
        collection(db, 'users'),
        where('role', '==', 'student')
      );
      const snap = await getDocs(studentsQ);
      const rawList = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      const { pendingList, activeList } = partitionStudentRecords(rawList);
      setError(null);
      setPendingStudents(pendingList);
      setActiveStudents(activeList);

      // 2. Query faculty members
      try {
        const facultyQ = query(
          collection(db, 'users'),
          where('role', '==', 'faculty')
        );
        const facultySnap = await getDocs(facultyQ);
        const deduplicatedFaculty = deduplicateFacultyRecords(facultySnap.docs);
        setFacultyList(deduplicatedFaculty);
      } catch (fErr) {
        console.warn('Could not load faculty in Director PeopleView:', fErr);
      }

      // 3. Query teacher allocations
      try {
        const directorInst = userProfile?.institution || 'UEMK';
        const allocs = await fetchTeacherAllocations({ institution: directorInst });
        setAllocationsList(allocs);
      } catch (aErr) {
        console.warn('Could not load allocations in Director PeopleView:', aErr);
      }
    } catch (err) {
      console.error('Error fetching records in Director PeopleView:', err);
      setError('Could not load student records. Please verify Director authorization in Firestore.');
      setPendingStudents([]);
      setActiveStudents([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    const loadInitialData = async () => {
      try {
        // Query students
        const studentsQ = query(
          collection(db, 'users'),
          where('role', '==', 'student')
        );
        const snap = await getDocs(studentsQ);
        if (!isMounted) return;
        const rawList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const { pendingList, activeList } = partitionStudentRecords(rawList);
        setError(null);
        setPendingStudents(pendingList);
        setActiveStudents(activeList);

        // Query faculty
        try {
          const facultyQ = query(
            collection(db, 'users'),
            where('role', '==', 'faculty')
          );
          const facultySnap = await getDocs(facultyQ);
          if (isMounted) {
            const deduplicatedFaculty = deduplicateFacultyRecords(facultySnap.docs);
            setFacultyList(deduplicatedFaculty);
          }
        } catch (fErr) {
          console.warn('Could not load initial faculty:', fErr);
        }

        // Query allocations
        try {
          const directorInst = userProfile?.institution || 'UEMK';
          const allocs = await fetchTeacherAllocations({ institution: directorInst });
          if (isMounted) {
            setAllocationsList(allocs);
          }
        } catch (aErr) {
          console.warn('Could not load initial allocations:', aErr);
        }
      } catch (err) {
        if (!isMounted) return;
        console.error('Error fetching records in Director PeopleView:', err);
        setError('Could not load records. Please verify Director authorization in Firestore.');
        setPendingStudents([]);
        setActiveStudents([]);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadInitialData();
    return () => {
      isMounted = false;
    };
  }, [userProfile?.institution]);

  const handleApprove = async (studentId, assignments) => {
    const studentDocRef = doc(db, 'users', studentId);
    await updateDoc(studentDocRef, {
      status: 'active',
      department: assignments.department,
      year: assignments.year,
      section: assignments.section
    });

    setActionSuccess('Student approved successfully and assigned to academic section!');
    setSelectedStudentForApproval(null);
    await fetchStudents(true);
    setTimeout(() => setActionSuccess(null), 4500);
  };

  const handleAllocateFaculty = async (facultyMember, { department, year, section }) => {
    const directorUid = userProfile?.uid || auth?.currentUser?.uid || '';
    const institution = userProfile?.institution || facultyMember.institution || 'UEMK';
    const facultyUid = facultyMember.uid || facultyMember.id;

    // Check for duplicate allocation across complete class identity
    const isDuplicate = allocationsList.some(a => 
      a.teacherUid === facultyUid &&
      a.department === department &&
      a.year === year &&
      a.section === section &&
      a.authorized !== false
    );
    if (isDuplicate) {
      throw new Error(`This faculty member is already allocated to ${department} • ${year} • ${section}.`);
    }

    try {
      await createTeacherAllocation({
        teacherUid: facultyUid,
        institution,
        department,
        year,
        section,
        directorUid
      });
    } catch (allocErr) {
      console.error(`[DirectorAllocation] Allocation failed: op=createTeacherAllocation, code=${allocErr?.code || 'unknown'}`);
      throw allocErr;
    }

    setActionSuccess(`Successfully allocated ${department} • ${year} • ${section} to ${facultyMember.name || facultyMember.email}!`);
    setSelectedFacultyForAllocation(null);
    await fetchStudents(false);
    setTimeout(() => setActionSuccess(null), 4500);
  };

  const handleRevokeAllocation = async (allocId) => {
    try {
      await deleteTeacherAllocation(allocId);
      setActionSuccess('Class allocation revoked successfully.');
      await fetchStudents(false);
      setTimeout(() => setActionSuccess(null), 4500);
    } catch (err) {
      console.error('Error revoking allocation:', err);
      setError('Failed to revoke allocation: ' + err.message);
    }
  };

  // Filter lists based on search input with strict status verification
  const filteredPending = pendingStudents.filter(s => {
    const status = (s.status || '').trim().toLowerCase();
    if (status !== 'pending_approval') return false;
    const queryStr = searchQuery.toLowerCase();
    return (s.name || '').toLowerCase().includes(queryStr) ||
           (s.email || '').toLowerCase().includes(queryStr);
  });

  const filteredActive = activeStudents.filter(s => {
    const status = (s.status || '').trim().toLowerCase();
    if (status !== 'active') return false;
    const queryStr = searchQuery.toLowerCase();
    return (s.name || '').toLowerCase().includes(queryStr) ||
           (s.email || '').toLowerCase().includes(queryStr) ||
           (s.department || '').toLowerCase().includes(queryStr) ||
           (s.section || '').toLowerCase().includes(queryStr);
  });

  const filteredFaculty = facultyList.filter(f => {
    const queryStr = searchQuery.toLowerCase();
    return (f.name || '').toLowerCase().includes(queryStr) ||
           (f.email || '').toLowerCase().includes(queryStr) ||
           (f.department || '').toLowerCase().includes(queryStr);
  });

  return (
    <div className="space-y-6 animate-hero-fade-up">
      {/* View Header with Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900">Student & Staff Management</h2>
          <p className="text-xs text-slate-500 mt-1">Review student admissions, grant access, and assign academic sections.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button 
            onClick={() => setActiveTab('Pending Approvals')}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
              activeTab === 'Pending Approvals' 
                ? 'bg-[#D67756] text-white shadow-sm' 
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span>Pending Approvals</span>
            {pendingStudents.length > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-xs font-black ${
                activeTab === 'Pending Approvals' ? 'bg-white text-[#D67756]' : 'bg-amber-100 text-amber-800'
              }`}>
                {pendingStudents.length}
              </span>
            )}
          </button>
          <button 
            onClick={() => setActiveTab('Students')}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              activeTab === 'Students' 
                ? 'bg-[#D67756] text-white shadow-sm' 
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            Approved Students ({activeStudents.length})
          </button>
          <button 
            onClick={() => setActiveTab('Faculty')}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              activeTab === 'Faculty' 
                ? 'bg-[#D67756] text-white shadow-sm' 
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            Faculty ({facultyList.length})
          </button>
        </div>
      </div>

      {/* Success Notification */}
      {actionSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium px-4 py-3 rounded-2xl flex items-center justify-between animate-fade-in shadow-sm">
          <div className="flex items-center gap-2">
            <span className="text-emerald-600 font-bold">✓</span>
            <span>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="text-emerald-600 hover:text-emerald-900 font-bold text-lg leading-none">
            ×
          </button>
        </div>
      )}

      {/* Error Notification with Retry */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 text-sm font-medium px-4 py-3 rounded-2xl flex items-center justify-between animate-fade-in shadow-sm">
          <span>{error}</span>
          <button 
            onClick={() => fetchStudents(true)}
            className="text-xs font-bold underline hover:no-underline text-rose-900 ml-4"
          >
            Retry
          </button>
        </div>
      )}

      {/* Main Table / Card Container */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        {/* Search & Actions Bar */}
        <div className="flex items-center gap-4 mb-6 pb-6 border-b border-slate-100">
          <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 flex items-center gap-2">
            <Icons.Search />
            <input 
              type="text" 
              placeholder={`Search ${activeTab.toLowerCase()} by name, email, or department...`} 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none outline-none w-full text-sm font-medium text-slate-800 placeholder:text-slate-400" 
            />
          </div>
          <button 
            onClick={() => fetchStudents(true)}
            className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 rounded-xl text-slate-600 text-sm font-bold hover:bg-slate-50 transition-all active:scale-95"
            title="Refresh list"
          >
            Refresh
          </button>
        </div>

        {/* Content based on Active Tab */}
        {isLoading ? (
          <div className="py-16 text-center text-slate-500 space-y-3">
            <div className="w-6 h-6 border-2 border-[#D67756] border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-sm font-medium">Loading records from Cloud Firestore...</p>
          </div>
        ) : error ? (
          <div className="text-center py-12 px-4 border border-dashed border-rose-200 rounded-2xl bg-rose-50/50">
            <h4 className="text-base font-bold text-rose-800">Unable to Load Student Records</h4>
            <p className="text-xs text-rose-600 mt-1 max-w-sm mx-auto">{error}</p>
            <button 
              onClick={() => fetchStudents(true)}
              className="mt-4 px-4 py-2 bg-[#D67756] hover:bg-[#c26444] text-white rounded-xl text-xs font-bold shadow-sm transition-all active:scale-95"
            >
              Retry
            </button>
          </div>
        ) : activeTab === 'Pending Approvals' ? (
          /* PENDING APPROVALS TAB */
          <div className="space-y-4">
            {filteredPending.length === 0 ? (
              <div className="text-center py-12 px-4 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3 font-bold text-xl">
                  ✓
                </div>
                <h4 className="text-base font-bold text-slate-800">No Pending Student Registrations</h4>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  All registered students have been reviewed and approved. Newly registered students will appear here automatically.
                </p>
              </div>
            ) : (
              filteredPending.map(student => (
                <div 
                  key={student.id} 
                  className="p-5 border border-amber-100 bg-amber-50/20 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-800 font-extrabold flex items-center justify-center shrink-0">
                      {(student.name || 'S').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-slate-900 text-base">{student.name || 'Unnamed Student'}</h4>
                        <span className="text-[10px] uppercase tracking-wider font-extrabold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                          Pending Approval
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 font-medium">{student.email}</p>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Registered: {student.createdAt ? new Date(student.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Recently'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-center">
                    <button 
                      onClick={() => setSelectedStudentForApproval(student)}
                      className="px-5 py-2.5 bg-[#D67756] hover:bg-[#c26444] text-white rounded-xl text-xs font-bold tracking-wide shadow-sm hover:shadow transition-all active:scale-95"
                    >
                      Review & Approve
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : activeTab === 'Students' ? (
          /* APPROVED STUDENTS TAB */
          <div className="space-y-4">
            {filteredActive.length === 0 ? (
              <div className="space-y-4">
                {/* Fallback to mock profile if no real approved students yet */}
                <div className="p-4 border border-slate-100 rounded-xl flex items-center justify-between hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-500">
                      JD
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900">John Doe</h4>
                      <p className="text-xs text-slate-500">Roll: CS20041 • 2nd Year, Section C</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold text-[#D67756] bg-[#FFF2ED] px-2.5 py-1 rounded-md">B.Tech / CSE / AI</span>
                  </div>
                </div>
              </div>
            ) : (
              filteredActive.map(student => (
                <div 
                  key={student.id} 
                  className="p-4 border border-slate-100 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                      {(student.name || 'S').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900">{student.name || 'Student'}</h4>
                      <p className="text-xs text-slate-500 font-medium">
                        {student.email} • {student.year || 'Year Unassigned'}, {student.section || 'Section Unassigned'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex items-center gap-2 self-end sm:self-center">
                    <span className="text-xs font-bold text-[#D67756] bg-[#FFF2ED] px-3 py-1 rounded-md">
                      {student.department || 'General'}
                    </span>
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                      Active
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          /* FACULTY TAB */
          <div className="space-y-4">
            {filteredFaculty.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <p className="font-bold text-base text-slate-600 mb-1">No faculty members found</p>
                <p className="text-xs">Registered faculty will appear here for class allocation.</p>
              </div>
            ) : (
              filteredFaculty.map(faculty => {
                const facultyUid = faculty.uid || faculty.id;
                const facultyAllocs = allocationsList.filter(a => a.teacherUid === facultyUid && a.authorized !== false);
                return (
                  <div 
                    key={faculty.id || facultyUid} 
                    className="p-5 border border-slate-100 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 hover:shadow-md transition-all bg-white"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-700 text-sm border border-slate-200 flex-shrink-0">
                        {(faculty.name || faculty.email || 'F').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-extrabold text-slate-900 text-base">{faculty.name || faculty.email?.split('@')[0]}</h4>
                          <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                            Faculty
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 font-medium mt-0.5">{faculty.email}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{faculty.department || 'Computer Science'} • {faculty.institution || 'UEMK'}</p>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                      {/* Allocations Badges */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {facultyAllocs.length === 0 ? (
                          <span className="text-xs text-slate-400 italic">No class allocations</span>
                        ) : (
                          facultyAllocs.map(alloc => (
                            <span 
                              key={alloc.id} 
                              className="inline-flex items-center gap-1.5 text-xs font-bold text-[#D67756] bg-[#FFF2ED] px-2.5 py-1 rounded-lg border border-[#D67756]/20"
                            >
                              <span>{alloc.department} • {alloc.year} • {alloc.section}</span>
                              <button
                                type="button"
                                onClick={() => handleRevokeAllocation(alloc.id)}
                                className="text-[#D67756] hover:text-rose-700 hover:bg-rose-50 rounded-full w-4 h-4 flex items-center justify-center font-black leading-none ml-0.5 transition-colors"
                                title="Revoke class allocation"
                              >
                                ×
                              </button>
                            </span>
                          ))
                        )}
                      </div>

                      {/* Assign Class Button */}
                      <button
                        type="button"
                        onClick={() => setSelectedFacultyForAllocation(faculty)}
                        className="px-4 py-2 bg-[#D67756] hover:bg-[#c26444] text-white text-xs font-bold rounded-xl shadow-sm hover:shadow transition-all flex items-center gap-1.5 active:scale-95 whitespace-nowrap"
                      >
                        <span>+ Assign Class</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* APPROVAL DIALOG MODAL */}
      {selectedStudentForApproval && (
        <ApprovalModal 
          student={selectedStudentForApproval}
          onClose={() => setSelectedStudentForApproval(null)}
          onApprove={handleApprove}
        />
      )}

      {/* FACULTY ALLOCATION MODAL */}
      {selectedFacultyForAllocation && (
        <FacultyAllocationModal 
          faculty={selectedFacultyForAllocation}
          existingAllocations={allocationsList.filter(a => 
            a.teacherUid === (selectedFacultyForAllocation.uid || selectedFacultyForAllocation.id) && 
            a.authorized !== false
          )}
          onClose={() => setSelectedFacultyForAllocation(null)}
          onAllocate={handleAllocateFaculty}
        />
      )}
    </div>
  );
}

function ApprovalModal({ student, onClose, onApprove }) {
  const [department, setDepartment] = useState('');
  const [year, setYear] = useState('');
  const [section, setSection] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');

  const isFormValid = department.trim() !== '' && year.trim() !== '' && section.trim() !== '';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isFormValid || isSubmitting) return;

    setModalError('');
    setIsSubmitting(true);
    try {
      await onApprove(student.id || student.uid, {
        department,
        year,
        section
      });
    } catch (err) {
      console.error('Modal approval error:', err);
      setModalError(err.message || 'Failed to approve student. Please verify administrative permissions.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
      <div 
        className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-extrabold text-slate-900">Approve Student Registration</h3>
            <p className="text-xs text-slate-500 mt-0.5">Assign academic placement to grant full dashboard access.</p>
          </div>
          <button 
            onClick={onClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-slate-700 font-bold text-xl p-1 leading-none rounded-lg"
          >
            ×
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Student Info Box */}
          <div className="bg-[#FFF2ED]/60 border border-[#D67756]/20 p-4 rounded-2xl">
            <h4 className="text-xs font-bold text-[#D67756] uppercase tracking-wider">Candidate Details</h4>
            <p className="text-sm font-bold text-slate-900 mt-1">{student.name || 'Student'}</p>
            <p className="text-xs text-slate-600 font-medium">{student.email}</p>
          </div>

          {modalError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
              {modalError}
            </div>
          )}

          {/* Department Select */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Department / Discipline <span className="text-rose-500">*</span>
            </label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              required
              disabled={isSubmitting}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-[#D67756] focus:ring-2 focus:ring-[#D67756]/20 transition-all"
            >
              <option value="">Select Department...</option>
              {DEPARTMENTS.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>

          {/* Year Select */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Academic Year <span className="text-rose-500">*</span>
            </label>
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              required
              disabled={isSubmitting}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-[#D67756] focus:ring-2 focus:ring-[#D67756]/20 transition-all"
            >
              <option value="">Select Academic Year...</option>
              {YEARS.map(yr => (
                <option key={yr} value={yr}>{yr}</option>
              ))}
            </select>
          </div>

          {/* Section Select */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Section Allocation <span className="text-rose-500">*</span>
            </label>
            <select
              value={section}
              onChange={(e) => setSection(e.target.value)}
              required
              disabled={isSubmitting}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-[#D67756] focus:ring-2 focus:ring-[#D67756]/20 transition-all"
            >
              <option value="">Select Section...</option>
              {SECTIONS.map(sec => (
                <option key={sec} value={sec}>{sec}</option>
              ))}
            </select>
          </div>

          {/* Action Buttons */}
          <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isFormValid || isSubmitting}
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-[#D67756] hover:bg-[#c26444] shadow-sm hover:shadow transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  <span>Approving...</span>
                </>
              ) : (
                <span>Confirm Approval & Assign</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FacultyAllocationModal({ faculty, existingAllocations = [], onClose, onAllocate }) {
  const [department, setDepartment] = useState(faculty.department || 'Computer Science');
  const [year, setYear] = useState('2nd Year');
  const [section, setSection] = useState('Sec C');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');

  const isFormValid = department.trim() !== '' && year.trim() !== '' && section.trim() !== '';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isFormValid || isSubmitting) return;

    // Check if duplicate allocation already exists for this exact class
    const isDuplicate = existingAllocations.some(a => 
      a.department === department &&
      a.year === year &&
      a.section === section &&
      a.authorized !== false
    );
    if (isDuplicate) {
      setModalError(`This faculty member is already allocated to ${department} • ${year} • ${section}.`);
      return;
    }

    setModalError('');
    setIsSubmitting(true);
    try {
      await onAllocate(faculty, {
        department,
        year,
        section
      });
    } catch (err) {
      console.error(`[DirectorModal] Allocation modal error: op=handleAllocateFaculty, code=${err?.code || 'unknown'}`);
      setModalError(err.message || 'Failed to allocate class. Please verify administrative permissions.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
      <div 
        className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-extrabold text-slate-900">Assign Faculty to Class</h3>
            <p className="text-xs text-slate-500 mt-0.5">Grant attendance marking authority for this academic class.</p>
          </div>
          <button 
            onClick={onClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-slate-700 font-bold text-xl p-1 leading-none rounded-lg"
          >
            ×
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Candidate Box */}
          <div className="bg-[#FFF2ED]/60 border border-[#D67756]/20 p-4 rounded-2xl">
            <h4 className="text-xs font-bold text-[#D67756] uppercase tracking-wider">Faculty Details</h4>
            <p className="text-sm font-bold text-slate-900 mt-1">{faculty.name || faculty.email?.split('@')[0] || 'Faculty Member'}</p>
            <p className="text-xs text-slate-600 font-medium">{faculty.email}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">UID: {faculty.uid || faculty.id}</p>
          </div>

          {modalError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
              {modalError}
            </div>
          )}

          {/* Department */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Department / Discipline <span className="text-rose-500">*</span>
            </label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              required
              disabled={isSubmitting}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-[#D67756] focus:ring-2 focus:ring-[#D67756]/20 transition-all"
            >
              {DEPARTMENTS.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>

          {/* Year */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Academic Year <span className="text-rose-500">*</span>
            </label>
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              required
              disabled={isSubmitting}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-[#D67756] focus:ring-2 focus:ring-[#D67756]/20 transition-all"
            >
              {YEARS.map(yr => (
                <option key={yr} value={yr}>{yr}</option>
              ))}
            </select>
          </div>

          {/* Section */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Section Allocation <span className="text-rose-500">*</span>
            </label>
            <select
              value={section}
              onChange={(e) => setSection(e.target.value)}
              required
              disabled={isSubmitting}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-[#D67756] focus:ring-2 focus:ring-[#D67756]/20 transition-all"
            >
              {SECTIONS.map(sec => (
                <option key={sec} value={sec}>{sec}</option>
              ))}
            </select>
          </div>

          {/* Action Buttons */}
          <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isFormValid || isSubmitting}
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-[#D67756] hover:bg-[#c26444] shadow-sm hover:shadow transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  <span>Allocating...</span>
                </>
              ) : (
                <span>Confirm Class Allocation</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function AcademicManagementView({ onNavigate }) {
  return (
    <div className="space-y-6 animate-hero-fade-up">
      <h2 className="text-2xl font-extrabold text-slate-900">Academic Management</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md cursor-pointer transition-shadow">
          <div className="w-12 h-12 rounded-xl bg-theme-bg text-theme-primary flex items-center justify-center mb-4">
            <Icons.Hierarchy />
          </div>
          <h3 className="text-lg font-bold text-slate-900">Programmes</h3>
          <p className="text-sm text-slate-500 mt-1">Manage B.Tech, BBA, etc.</p>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md cursor-pointer transition-shadow">
          <div className="w-12 h-12 rounded-xl bg-theme-bg text-theme-primary flex items-center justify-center mb-4">
            <Icons.Classes />
          </div>
          <h3 className="text-lg font-bold text-slate-900">Branches & Specializations</h3>
          <p className="text-sm text-slate-500 mt-1">Manage CSE, AI, Core, etc.</p>
        </div>
        <div 
          onClick={() => onNavigate && onNavigate('People', 'Faculty')}
          className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md cursor-pointer transition-shadow group"
        >
          <div className="w-12 h-12 rounded-xl bg-theme-bg text-theme-primary flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
            <Icons.Students />
          </div>
          <h3 className="text-lg font-bold text-slate-900 group-hover:text-[#D67756] transition-colors">Faculty Assignment</h3>
          <p className="text-sm text-slate-500 mt-1">Assign faculty to academic scopes.</p>
        </div>
      </div>
    </div>
  );
}

export { DirectorAnnouncementsView } from './DirectorAnnouncementsView';
