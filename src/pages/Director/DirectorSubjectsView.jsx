import React, { useState, useEffect, useMemo } from 'react';
import { Icons } from '../Teacher/Icons.jsx';
import { auth, db } from '../../firebase/config.js';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { deduplicateFacultyRecords } from './studentPartition.js';
import { fetchTeacherAllocations } from '../../services/attendanceService.js';
import {
  fetchSubjects,
  createSubject,
  updateSubject,
  deleteSubject,
  fetchTeacherSubjectAssignments,
  assignTeacherToSubject,
  deleteTeacherSubjectAssignment
} from '../../services/subjectService.js';

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
  if (s1 === s2) return true;
  const n1 = String(s1).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const n2 = String(s2).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (n1 === n2) return true;
  const clean1 = n1.replace(/^(SECTION|SEC|CSE)/, '');
  const clean2 = n2.replace(/^(SECTION|SEC|CSE)/, '');
  if (clean1 && clean2 && clean1 === clean2) {
    return true;
  }
  return n1.endsWith(n2) || n2.endsWith(n1);
};

export default function DirectorSubjectsView({ userProfile, onNavigate, scopedDepartment, scopedYear, onBack }) {
  // Scoped hierarchy mode flag
  const isScopedMode = Boolean(scopedDepartment && scopedYear);

  // Navigation / View Tab
  const [activeTab, setActiveTab] = useState('subjects'); // 'subjects' | 'assignments'

  // Filters & Search (initialized to scoped department/year if provided)
  const [selectedDept, setSelectedDept] = useState(scopedDepartment || 'All Departments');
  const [selectedYear, setSelectedYear] = useState(scopedYear || 'All Years');
  const [searchQuery, setSearchQuery] = useState('');

  // Synchronize when scoped props change
  useEffect(() => {
    if (scopedDepartment) setSelectedDept(scopedDepartment);
    if (scopedYear) setSelectedYear(scopedYear);
  }, [scopedDepartment, scopedYear]);

  // Primary Data
  const [subjects, setSubjects] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [facultyList, setFacultyList] = useState([]);
  const [allocationsList, setAllocationsList] = useState([]);

  // Loading & Feedback
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);
  const [actionError, setActionError] = useState(null);

  // Modals & Panels
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assignModalSubject, setAssignModalSubject] = useState(null);
  const [isPostCreationAssign, setIsPostCreationAssign] = useState(false);
  const [deleteModalSubject, setDeleteModalSubject] = useState(null);
  const [editModalSubject, setEditModalSubject] = useState(null);

  // Submitting States
  const [isCreatingSubject, setIsCreatingSubject] = useState(false);
  const [isUpdatingSubject, setIsUpdatingSubject] = useState(false);
  const [isAssigningFaculty, setIsAssigningFaculty] = useState(false);
  const [isDeletingSubject, setIsDeletingSubject] = useState(false);
  const [revokingAssignmentId, setRevokingAssignmentId] = useState(null);

  // Institution
  const institution = userProfile?.institution || 'UEMK';

  // Load all necessary data
  const loadData = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    setError(null);
    try {
      // 1. Fetch curriculum subjects from backend API
      const fetchedSubjects = await fetchSubjects({
        department: selectedDept !== 'All Departments' ? selectedDept : undefined,
        year: selectedYear !== 'All Years' ? selectedYear : undefined,
        institution
      });
      setSubjects(fetchedSubjects || []);

      // 2. Fetch all teacher-subject assignments
      try {
        const fetchedAssignments = await fetchTeacherSubjectAssignments({
          department: selectedDept !== 'All Departments' ? selectedDept : undefined,
          year: selectedYear !== 'All Years' ? selectedYear : undefined
        });
        setAssignments(fetchedAssignments || []);
      } catch (aErr) {
        console.warn('[DirectorSubjectsView] Could not load assignments:', aErr);
      }

      // 3. Fetch faculty list from Firestore
      try {
        const facultyQ = query(
          collection(db, 'users'),
          where('role', '==', 'faculty')
        );
        const facultySnap = await getDocs(facultyQ);
        const deduplicated = deduplicateFacultyRecords(facultySnap.docs);
        setFacultyList(deduplicated);
      } catch (fErr) {
        console.warn('[DirectorSubjectsView] Could not load faculty:', fErr);
      }

      // 4. Fetch teacher allocations from Firestore
      try {
        const allocs = await fetchTeacherAllocations({ institution });
        setAllocationsList(allocs || []);
      } catch (alErr) {
        console.warn('[DirectorSubjectsView] Could not load teacher allocations:', alErr);
      }
    } catch (err) {
      console.error('[DirectorSubjectsView] Error loading data:', err);
      setError(err.message || 'Failed to load curriculum subjects.');
    } finally {
      if (showLoading) setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData(true);
  }, [selectedDept, selectedYear]);

  // Group assignments by subjectId
  const assignmentsBySubject = useMemo(() => {
    const map = new Map();
    assignments.forEach(a => {
      if (!map.has(a.subjectId)) {
        map.set(a.subjectId, []);
      }
      map.get(a.subjectId).push(a);
    });
    return map;
  }, [assignments]);

  // Filter subjects by search input
  const filteredSubjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return subjects.filter(s => {
      const nameMatch = (s.name || '').toLowerCase().includes(q);
      const codeMatch = (s.code || '').toLowerCase().includes(q);
      const descMatch = (s.description || '').toLowerCase().includes(q);
      return !q || nameMatch || codeMatch || descMatch;
    });
  }, [subjects, searchQuery]);

  // Filter assignments for Roster view
  const filteredAssignments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return assignments.filter(a => {
      const teacherNameMatch = (a.teacherName || '').toLowerCase().includes(q);
      const teacherEmailMatch = (a.teacherEmail || '').toLowerCase().includes(q);
      const subjectNameMatch = (a.subjectName || '').toLowerCase().includes(q);
      const subjectCodeMatch = (a.subjectCode || '').toLowerCase().includes(q);
      const sectionMatch = (a.section || '').toLowerCase().includes(q);
      const searchOk = !q || teacherNameMatch || teacherEmailMatch || subjectNameMatch || subjectCodeMatch || sectionMatch;

      const deptOk = selectedDept === 'All Departments' || isMatchingDepartment(a.department, selectedDept);
      const yearOk = selectedYear === 'All Years' || isMatchingYear(a.year, selectedYear);

      return searchOk && deptOk && yearOk;
    });
  }, [assignments, searchQuery, selectedDept, selectedYear]);

  // Helper: Find eligible teachers for a specific subject based on teacher_allocations
  const getEligibleTeachersForSubject = (subject) => {
    if (!subject) return [];

    return facultyList.map(faculty => {
      const facultyUid = faculty.uid || faculty.id;
      // Find matching authorized class allocations for this subject's department & year
      const matchingAllocations = allocationsList.filter(alloc => {
        const isMatchTeacher = alloc.teacherUid === facultyUid;
        const isAuth = alloc.authorized !== false;
        const isMatchDept = isMatchingDepartment(alloc.department, subject.department);
        const isMatchYr = isMatchingYear(alloc.year, subject.year);
        return isMatchTeacher && isAuth && isMatchDept && isMatchYr;
      });

      const allocatedSections = Array.from(new Set(
        matchingAllocations
          .map(a => a.section)
          .filter(Boolean)
      ));

      const isEligible = matchingAllocations.length > 0;

      // Check if already assigned to this subject
      const subjectAssignments = assignmentsBySubject.get(subject.id) || [];
      const currentTeacherAssignments = subjectAssignments.filter(a => a.teacherUid === facultyUid);
      const isAlreadyAssignedYearWide = currentTeacherAssignments.some(a => a.scope === 'all' || !a.section);
      const assignedSections = currentTeacherAssignments.map(a => a.section).filter(Boolean);

      return {
        ...faculty,
        uid: facultyUid,
        isEligible,
        allocatedSections,
        currentAssignments: currentTeacherAssignments,
        isAlreadyAssignedYearWide,
        assignedSections
      };
    }).filter(f => f.isEligible);
  };

  // Handle Create Subject Submission
  const handleCreateSubject = async (formData) => {
    setIsCreatingSubject(true);
    setActionError(null);
    try {
      const created = await createSubject({
        name: formData.name.trim(),
        code: formData.code.trim().toUpperCase(),
        department: formData.department,
        year: formData.year,
        description: formData.description?.trim() || undefined,
        institution
      });

      setIsCreateModalOpen(false);
      await loadData(false);

      // Seamlessly transition to assigning faculty to this newly created subject
      setAssignModalSubject(created);
      setIsPostCreationAssign(true);
      setIsAssignModalOpen(true);

      setActionSuccess(`Subject "${formData.name}" created successfully! Assign faculty members below, or click Done to finish.`);
      setTimeout(() => setActionSuccess(null), 6000);
    } catch (err) {
      console.error('[DirectorSubjectsView] Create subject error:', err);
      setActionError(err.message || 'Failed to create subject.');
    } finally {
      setIsCreatingSubject(false);
    }
  };

  // Handle Update Subject Submission
  const handleUpdateSubject = async (subjectId, updateData) => {
    setIsUpdatingSubject(true);
    setActionError(null);
    try {
      const updated = await updateSubject(subjectId, {
        name: updateData.name.trim(),
        code: updateData.code ? updateData.code.trim().toUpperCase() : '',
        description: updateData.description !== undefined ? updateData.description.trim() : undefined
      });

      // Update local subjects list
      setSubjects(prev => prev.map(s => s.id === updated.id ? updated : s));

      // Update local assignments list if name or code changed
      setAssignments(prev => prev.map(a => {
        if (a.subjectId === updated.id) {
          return {
            ...a,
            subjectName: updated.name,
            subjectCode: updated.code
          };
        }
        return a;
      }));

      setActionSuccess(`Subject "${updated.name}" updated successfully.`);
      setEditModalSubject(null);
      setTimeout(() => setActionSuccess(null), 4500);
    } catch (err) {
      console.error('[DirectorSubjectsView] Update subject error:', err);
      setActionError(err.message || 'Failed to update subject.');
    } finally {
      setIsUpdatingSubject(false);
    }
  };

  // Handle Delete Subject
  const handleDeleteSubject = async () => {
    if (!deleteModalSubject) return;
    setIsDeletingSubject(true);
    setActionError(null);
    try {
      const res = await deleteSubject(deleteModalSubject.id);
      setActionSuccess(res.message || `Subject "${deleteModalSubject.name}" deleted successfully.`);
      setDeleteModalSubject(null);
      await loadData(false);
      setTimeout(() => setActionSuccess(null), 4500);
    } catch (err) {
      console.error('[DirectorSubjectsView] Delete subject error:', err);
      setActionError(err.message || 'Failed to delete subject.');
    } finally {
      setIsDeletingSubject(false);
    }
  };

  // Handle Assign Faculty to Subject
  const handleAssignFaculty = async (targetSubjectId, facultyUid, section) => {
    if (!targetSubjectId || !facultyUid) return;
    setIsAssigningFaculty(true);
    setActionError(null);
    try {
      await assignTeacherToSubject({
        subjectId: targetSubjectId,
        assignedTeacherUid: facultyUid,
        section: section || null
      });

      setActionSuccess('Faculty member assigned to subject successfully!');
      // Refresh assignments silently
      const fetchedAssignments = await fetchTeacherSubjectAssignments({
        department: selectedDept !== 'All Departments' ? selectedDept : undefined,
        year: selectedYear !== 'All Years' ? selectedYear : undefined
      });
      setAssignments(fetchedAssignments || []);
      setTimeout(() => setActionSuccess(null), 4500);
    } catch (err) {
      console.error('[DirectorSubjectsView] Assign faculty error:', err);
      setActionError(err.message || 'Failed to assign faculty member.');
    } finally {
      setIsAssigningFaculty(false);
    }
  };

  // Handle Revoke Assignment
  const handleRevokeAssignment = async (assignmentId) => {
    setRevokingAssignmentId(assignmentId);
    setActionError(null);
    try {
      await deleteTeacherSubjectAssignment(assignmentId);
      setActionSuccess('Faculty subject assignment revoked successfully.');
      // Refresh assignments silently
      const fetchedAssignments = await fetchTeacherSubjectAssignments({
        department: selectedDept !== 'All Departments' ? selectedDept : undefined,
        year: selectedYear !== 'All Years' ? selectedYear : undefined
      });
      setAssignments(fetchedAssignments || []);
      setTimeout(() => setActionSuccess(null), 4500);
    } catch (err) {
      console.error('[DirectorSubjectsView] Revoke assignment error:', err);
      setActionError(err.message || 'Failed to revoke teacher assignment.');
    } finally {
      setRevokingAssignmentId(null);
    }
  };

  return (
    <div className="space-y-6 animate-hero-fade-up">
      {/* Toast Banners */}
      {actionSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold px-4 py-3 rounded-2xl flex items-center justify-between shadow-sm animate-fade-in">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs font-bold">✓</span>
            <span>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="text-emerald-600 hover:text-emerald-900 font-bold ml-4">✕</button>
        </div>
      )}

      {actionError && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 text-sm font-semibold px-4 py-3 rounded-2xl flex items-center justify-between shadow-sm animate-fade-in">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center text-xs font-bold">!</span>
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="text-rose-600 hover:text-rose-900 font-bold ml-4">✕</button>
        </div>
      )}

      {/* SCOPED CONTEXTUAL NAVIGATION BANNER */}
      {isScopedMode && (
        <div className="bg-gradient-to-r from-[#FFF2ED] via-white to-[#FFF2ED] border border-[#D67756]/30 p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs animate-fade-in">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="px-3.5 py-2 bg-white text-slate-700 hover:text-[#D67756] hover:bg-slate-50 border border-slate-200/90 rounded-xl transition-all shadow-xs cursor-pointer flex items-center gap-1.5 text-xs font-bold active:scale-95"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12" />
                  <polyline points="12 19 5 12 12 5" />
                </svg>
                <span>Back to Academic Hierarchy</span>
              </button>
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#D67756] animate-pulse"></span>
                <span className="text-[11px] font-black uppercase tracking-wider text-[#D67756]">Contextual Hierarchy Mode</span>
              </div>
              <h3 className="text-base font-extrabold text-slate-900 mt-0.5">
                {scopedDepartment} • {scopedYear}
              </h3>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-600 bg-white/90 px-3.5 py-1.5 rounded-xl border border-[#D67756]/20 shadow-xs">
            <span>Branch/Year Scope Locked</span>
          </div>
        </div>
      )}

      {/* Header and Separate Primary Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <span>Subject & Curriculum Management</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {isScopedMode
              ? `Managing curriculum subjects and faculty allocations for ${scopedDepartment} • ${scopedYear}.`
              : 'Define curriculum subjects, manage course codes, and assign authorized faculty to enable study material management.'}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Action 1: Assign Faculty */}
          <button
            type="button"
            onClick={() => {
              setActionError(null);
              setIsPostCreationAssign(false);
              setAssignModalSubject(filteredSubjects[0] || subjects[0] || null);
              setIsAssignModalOpen(true);
            }}
            className="px-4 py-2.5 rounded-xl text-sm font-bold text-[#D67756] bg-[#FFF2ED] hover:bg-[#ffe5dc] border border-[#D67756]/20 shadow-xs hover:shadow transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
          >
            <Icons.Classes />
            <span>Assign Faculty</span>
          </button>

          {/* Action 2: Add New Subject */}
          <button
            type="button"
            onClick={() => {
              setActionError(null);
              setIsCreateModalOpen(true);
            }}
            className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-[#D67756] hover:bg-[#c26444] shadow-sm hover:shadow transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
          >
            <Icons.Plus />
            <span>Add New Subject</span>
          </button>
        </div>
      </div>

      {/* View Switcher Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200/80 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('subjects')}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'subjects'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Icons.Classes />
          <span>Curriculum Subjects</span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-black ${
            activeTab === 'subjects' ? 'bg-slate-800 text-slate-200' : 'bg-slate-200 text-slate-700'
          }`}>
            {filteredSubjects.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('assignments')}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'assignments'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Icons.Students />
          <span>Faculty Assignments Roster</span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-black ${
            activeTab === 'assignments' ? 'bg-[#D67756] text-white' : 'bg-slate-200 text-slate-700'
          }`}>
            {filteredAssignments.length}
          </span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row items-center gap-4">
        {/* Search */}
        <div className="relative flex-1 w-full">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <Icons.Search />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              activeTab === 'subjects'
                ? 'Search subjects by course name, code, or description...'
                : 'Search assignments by teacher name, email, subject, or section...'
            }
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200/80 rounded-xl text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#D67756]/30 focus:border-[#D67756] transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>

        {/* Department Filter / Scope Lock */}
        <div className="w-full md:w-56">
          {isScopedMode ? (
            <div className="px-3.5 py-2 bg-slate-100 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 flex items-center justify-between">
              <span className="truncate">{scopedDepartment}</span>
              <span className="text-[10px] uppercase font-bold text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded">Fixed</span>
            </div>
          ) : (
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200/80 rounded-xl text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#D67756]/30 focus:border-[#D67756] transition-all cursor-pointer"
            >
              <option value="All Departments">All Departments</option>
              {DEPARTMENTS.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          )}
        </div>

        {/* Academic Year Filter / Scope Lock */}
        <div className="w-full md:w-44">
          {isScopedMode ? (
            <div className="px-3.5 py-2 bg-slate-100 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 flex items-center justify-between">
              <span className="truncate">{scopedYear}</span>
              <span className="text-[10px] uppercase font-bold text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded">Fixed</span>
            </div>
          ) : (
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200/80 rounded-xl text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#D67756]/30 focus:border-[#D67756] transition-all cursor-pointer"
            >
              <option value="All Years">All Years</option>
              {YEARS.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center shadow-sm">
          <div className="w-8 h-8 border-3 border-[#D67756] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm font-bold text-slate-600">Loading curriculum subjects & faculty allocations...</p>
        </div>
      ) : error ? (
        <div className="bg-white rounded-2xl border border-rose-200 p-8 text-center shadow-sm">
          <p className="text-sm font-bold text-rose-700 mb-2">{error}</p>
          <button
            onClick={() => loadData(true)}
            className="text-xs font-bold text-[#D67756] hover:underline cursor-pointer"
          >
            Try Refreshing
          </button>
        </div>
      ) : activeTab === 'subjects' ? (
        /* TAB 1: CURRICULUM SUBJECTS GRID */
        filteredSubjects.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center shadow-sm space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-[#FFF2ED] text-[#D67756] flex items-center justify-center mx-auto shadow-sm">
              <Icons.Classes />
            </div>
            <h3 className="text-lg font-bold text-slate-900">No Subjects Found</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              {searchQuery
                ? `No subjects match the search query "${searchQuery}".`
                : `No curriculum subjects registered for ${selectedDept} • ${selectedYear}.`}
            </p>
            <button
              onClick={() => {
                setActionError(null);
                setIsCreateModalOpen(true);
              }}
              className="px-4 py-2 bg-[#FFF2ED] text-[#D67756] hover:bg-[#ffe5dc] font-bold text-xs rounded-xl transition-colors inline-block mt-2 cursor-pointer"
            >
              Create First Subject
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredSubjects.map(subject => {
              const subjectAssignments = assignmentsBySubject.get(subject.id) || [];
              const hasFaculty = subjectAssignments.length > 0;

              return (
                <div
                  key={subject.id}
                  className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group relative overflow-hidden"
                >
                  <div>
                    {/* Top Badges */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <span className="px-2.5 py-1 bg-slate-900 text-white text-xs font-black tracking-wide rounded-lg shadow-sm">
                        {subject.code}
                      </span>
                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[11px] font-bold rounded-md">
                          {subject.year}
                        </span>
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 text-[11px] font-bold rounded-md">
                          {subject.department}
                        </span>
                      </div>
                    </div>

                    {/* Subject Name & Description */}
                    <h3 className="text-base font-extrabold text-slate-900 leading-snug group-hover:text-[#D67756] transition-colors">
                      {subject.name}
                    </h3>
                    {subject.description ? (
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                        {subject.description}
                      </p>
                    ) : (
                      <p className="text-xs text-slate-400 italic mt-1">No syllabus description provided.</p>
                    )}

                    {/* Assigned Faculty Roster */}
                    <div className="mt-4 pt-3 border-t border-slate-100">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                          <Icons.Students />
                          <span>Assigned Faculty ({subjectAssignments.length})</span>
                        </span>
                      </div>

                      {hasFaculty ? (
                        <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                          {subjectAssignments.map(assign => (
                            <div
                              key={assign.id}
                              className="flex items-center justify-between bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100 text-xs"
                            >
                              <div className="truncate pr-2">
                                <p className="font-bold text-slate-800 truncate">{assign.teacherName || assign.teacherEmail}</p>
                                <p className="text-[10px] text-slate-500">
                                  {assign.section ? `Scope: Section ${assign.section}` : 'Scope: Year-Wide (All Sections)'}
                                </p>
                              </div>
                              <button
                                type="button"
                                disabled={revokingAssignmentId === assign.id}
                                onClick={() => handleRevokeAssignment(assign.id)}
                                title="Revoke faculty assignment"
                                className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-white transition-colors cursor-pointer disabled:opacity-50"
                              >
                                {revokingAssignmentId === assign.id ? (
                                  <span className="w-3 h-3 border border-rose-500 border-t-transparent rounded-full animate-spin inline-block"></span>
                                ) : (
                                  <span className="font-bold text-xs">✕</span>
                                )}
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs font-semibold text-amber-700 bg-amber-50/70 border border-amber-200/50 rounded-lg px-2.5 py-1.5">
                          No faculty assigned yet. Click "Assign Faculty" below to link an authorized teacher.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Bottom Actions */}
                  <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setActionError(null);
                        setIsPostCreationAssign(false);
                        setAssignModalSubject(subject);
                        setIsAssignModalOpen(true);
                      }}
                      className="flex-1 py-2 px-3 bg-[#FFF2ED] hover:bg-[#ffe5dc] text-[#D67756] font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                    >
                      <Icons.Classes />
                      <span>Assign / Manage Faculty</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setActionError(null);
                        setEditModalSubject(subject);
                      }}
                      title="Edit Subject"
                      className="p-2 text-slate-400 hover:text-[#D67756] hover:bg-[#FFF2ED] rounded-xl transition-colors cursor-pointer"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setActionError(null);
                        setDeleteModalSubject(subject);
                      }}
                      title="Delete Subject"
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* TAB 2: FACULTY ASSIGNMENTS ROSTER */
        filteredAssignments.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center shadow-sm space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-[#FFF2ED] text-[#D67756] flex items-center justify-center mx-auto shadow-sm">
              <Icons.Students />
            </div>
            <h3 className="text-lg font-bold text-slate-900">No Faculty Assignments Found</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              {searchQuery
                ? `No assignments match "${searchQuery}".`
                : `No faculty members are currently assigned to subjects for ${selectedDept} • ${selectedYear}.`}
            </p>
            <button
              onClick={() => {
                setActionError(null);
                setIsPostCreationAssign(false);
                setAssignModalSubject(filteredSubjects[0] || subjects[0] || null);
                setIsAssignModalOpen(true);
              }}
              className="px-4 py-2 bg-[#FFF2ED] text-[#D67756] hover:bg-[#ffe5dc] font-bold text-xs rounded-xl transition-colors inline-block mt-2 cursor-pointer"
            >
              Assign Faculty Now
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                  Active Faculty Allocations ({filteredAssignments.length})
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActionError(null);
                  setIsPostCreationAssign(false);
                  setAssignModalSubject(filteredSubjects[0] || subjects[0] || null);
                  setIsAssignModalOpen(true);
                }}
                className="px-3 py-1.5 bg-[#D67756] text-white hover:bg-[#c26444] rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Icons.Plus />
                <span>New Assignment</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/80 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">Faculty Member</th>
                    <th className="py-3 px-4">Curriculum Subject</th>
                    <th className="py-3 px-4">Academic Scope</th>
                    <th className="py-3 px-4">Assigned Scope</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAssignments.map(assign => {
                    const initials = (assign.teacherName || assign.teacherEmail || 'F')
                      .split(' ')
                      .map(p => p[0])
                      .join('')
                      .toUpperCase()
                      .slice(0, 2);

                    return (
                      <tr key={assign.id} className="hover:bg-slate-50/60 transition-colors">
                        {/* Faculty Member */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-[#FFF2ED] text-[#D67756] font-bold text-xs flex items-center justify-center border border-[#D67756]/20 shrink-0">
                              {initials}
                            </div>
                            <div className="truncate">
                              <p className="font-bold text-slate-900 truncate">
                                {assign.teacherName || 'Faculty Member'}
                              </p>
                              <p className="text-[11px] text-slate-500 truncate">
                                {assign.teacherEmail}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Subject */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-1.5">
                            <span className="px-2 py-0.5 bg-slate-900 text-white font-mono font-bold rounded text-[10px]">
                              {assign.subjectCode}
                            </span>
                            <span className="font-extrabold text-slate-800">
                              {assign.subjectName}
                            </span>
                          </div>
                        </td>

                        {/* Academic Scope */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-1.5">
                            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 font-bold rounded text-[10px]">
                              {assign.department}
                            </span>
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 font-bold rounded text-[10px]">
                              {assign.year}
                            </span>
                          </div>
                        </td>

                        {/* Assigned Scope */}
                        <td className="py-3.5 px-4">
                          {assign.section ? (
                            <span className="px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-100 font-bold rounded text-[11px]">
                              Section {assign.section}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 font-bold rounded text-[11px]">
                              Year-Wide (All Sections)
                            </span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4 text-center">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full font-bold text-[10px]">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            <span>Active</span>
                          </span>
                        </td>

                        {/* Action */}
                        <td className="py-3.5 px-4 text-right">
                          <button
                            type="button"
                            disabled={revokingAssignmentId === assign.id}
                            onClick={() => handleRevokeAssignment(assign.id)}
                            className="px-3 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                          >
                            {revokingAssignmentId === assign.id ? 'Revoking...' : 'Revoke'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* CREATE SUBJECT MODAL */}
      {isCreateModalOpen && (
        <CreateSubjectModal
          isOpen={isCreateModalOpen}
          initialDepartment={selectedDept !== 'All Departments' ? selectedDept : DEPARTMENTS[0]}
          initialYear={selectedYear !== 'All Years' ? selectedYear : YEARS[0]}
          lockedDepartment={isScopedMode ? scopedDepartment : null}
          lockedYear={isScopedMode ? scopedYear : null}
          onClose={() => setIsCreateModalOpen(false)}
          onSubmit={handleCreateSubject}
          isSubmitting={isCreatingSubject}
          actionError={actionError}
        />
      )}

      {/* EDIT SUBJECT MODAL */}
      {editModalSubject && (
        <EditSubjectModal
          isOpen={Boolean(editModalSubject)}
          subject={editModalSubject}
          onClose={() => setEditModalSubject(null)}
          onSubmit={handleUpdateSubject}
          isSubmitting={isUpdatingSubject}
          actionError={actionError}
        />
      )}

      {/* ASSIGN FACULTY MODAL */}
      {isAssignModalOpen && (
        <AssignFacultyModal
          isOpen={isAssignModalOpen}
          subject={assignModalSubject}
          subjects={subjects}
          onSelectSubject={(subj) => setAssignModalSubject(subj)}
          isPostCreation={isPostCreationAssign}
          assignmentsBySubject={assignmentsBySubject}
          getEligibleTeachers={getEligibleTeachersForSubject}
          onClose={() => {
            setIsAssignModalOpen(false);
            setAssignModalSubject(null);
            setIsPostCreationAssign(false);
          }}
          onAssign={handleAssignFaculty}
          onRevoke={handleRevokeAssignment}
          onNavigate={onNavigate}
          isAssigning={isAssigningFaculty}
          revokingAssignmentId={revokingAssignmentId}
          actionError={actionError}
        />
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteModalSubject && (
        <DeleteSubjectModal
          isOpen={Boolean(deleteModalSubject)}
          subject={deleteModalSubject}
          activeAssignmentsCount={(assignmentsBySubject.get(deleteModalSubject.id) || []).length}
          onClose={() => setDeleteModalSubject(null)}
          onConfirm={handleDeleteSubject}
          onManageFaculty={() => {
            setDeleteModalSubject(null);
            setAssignModalSubject(deleteModalSubject);
            setIsAssignModalOpen(true);
          }}
          isDeleting={isDeletingSubject}
          actionError={actionError}
        />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// SUBCOMPONENT: Create Subject Modal
// -----------------------------------------------------------------------------
function CreateSubjectModal({ isOpen, initialDepartment, initialYear, lockedDepartment, lockedYear, onClose, onSubmit, isSubmitting, actionError }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [department, setDepartment] = useState(lockedDepartment || initialDepartment);
  const [year, setYear] = useState(lockedYear || initialYear);
  const [description, setDescription] = useState('');
  const [clientError, setClientError] = useState('');

  const isScopeLocked = Boolean(lockedDepartment && lockedYear);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setClientError('Subject name is required.');
      return;
    }
    if (name.trim().length < 2 || name.trim().length > 100) {
      setClientError('Subject name must be between 2 and 100 characters.');
      return;
    }
    if (!code.trim()) {
      setClientError('Subject code is required (e.g. CS201).');
      return;
    }
    const finalDept = lockedDepartment || department;
    const finalYear = lockedYear || year;
    if (!finalDept) {
      setClientError('Department selection is required.');
      return;
    }
    if (!finalYear) {
      setClientError('Academic year is required.');
      return;
    }

    setClientError('');
    onSubmit({
      name: name.trim(),
      code: code.trim().toUpperCase(),
      department: finalDept,
      year: finalYear,
      description: description.trim()
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl w-full max-w-lg overflow-hidden animate-scale-up">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h3 className="text-lg font-extrabold text-slate-900">Add Curriculum Subject</h3>
            <p className="text-xs text-slate-500">Define course code, department branch, and academic year.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {(clientError || actionError) && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-semibold flex items-center gap-2">
              <span className="w-4 h-4 bg-rose-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold">!</span>
              <span>{clientError || actionError}</span>
            </div>
          )}

          {isScopeLocked && (
            <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-600 flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-700">Target Academic Scope:</span> {lockedDepartment} • {lockedYear}
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-200 text-slate-600 px-2 py-0.5 rounded">
                Scope Locked
              </span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Subject Name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Data Structures & Algorithms"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#D67756]/30 focus:border-[#D67756]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Subject Code *
              </label>
              <input
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. CS201"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#D67756]/30 focus:border-[#D67756]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Academic Year *
              </label>
              {isScopeLocked ? (
                <div className="px-3.5 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 flex items-center justify-between">
                  <span>{lockedYear}</span>
                  <span className="text-[10px] uppercase font-bold text-slate-400 bg-slate-200 px-1.5 py-0.5 rounded">Locked</span>
                </div>
              ) : (
                <select
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D67756]/30 focus:border-[#D67756] cursor-pointer"
                >
                  {YEARS.map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Department / Branch *
            </label>
            {isScopeLocked ? (
              <div className="px-3.5 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 flex items-center justify-between">
                <span>{lockedDepartment}</span>
                <span className="text-[10px] uppercase font-bold text-slate-400 bg-slate-200 px-1.5 py-0.5 rounded">Locked</span>
              </div>
            ) : (
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D67756]/30 focus:border-[#D67756] cursor-pointer"
              >
                {DEPARTMENTS.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Syllabus Description (Optional)
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief summary of topics or curriculum syllabus..."
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#D67756]/30 focus:border-[#D67756]"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-[#D67756] hover:bg-[#c26444] shadow-sm transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  <span>Creating Subject...</span>
                </>
              ) : (
                <span>Create Subject</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// SUBCOMPONENT: Edit Subject Modal
// -----------------------------------------------------------------------------
function EditSubjectModal({ isOpen, subject, onClose, onSubmit, isSubmitting, actionError }) {
  const [name, setName] = useState(subject?.name || '');
  const [code, setCode] = useState(subject?.code || '');
  const [description, setDescription] = useState(subject?.description || '');
  const [clientError, setClientError] = useState('');

  useEffect(() => {
    if (subject) {
      setName(subject.name || '');
      setCode(subject.code || '');
      setDescription(subject.description || '');
      setClientError('');
    }
  }, [subject]);

  if (!isOpen || !subject) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setClientError('Subject name is required.');
      return;
    }
    if (name.trim().length < 2 || name.trim().length > 100) {
      setClientError('Subject name must be between 2 and 100 characters.');
      return;
    }
    if (!code.trim()) {
      setClientError('Subject code is required (e.g. CS201).');
      return;
    }

    setClientError('');
    onSubmit(subject.id, {
      name: name.trim(),
      code: code.trim().toUpperCase(),
      description: description.trim()
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl w-full max-w-lg overflow-hidden animate-scale-up">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h3 className="text-lg font-extrabold text-slate-900">Edit Curriculum Subject</h3>
            <p className="text-xs text-slate-500">Update course name, code, and syllabus description.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {(clientError || actionError) && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-semibold flex items-center gap-2">
              <span className="w-4 h-4 bg-rose-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold">!</span>
              <span>{clientError || actionError}</span>
            </div>
          )}

          {/* Scope Immutable Banner */}
          <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-600 flex items-center justify-between">
            <div>
              <span className="font-bold text-slate-700">Academic Scope:</span> {subject.department} • {subject.year}
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-200 text-slate-600 px-2 py-0.5 rounded">
              Immutable Scope
            </span>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Subject Name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Data Structures & Algorithms"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#D67756]/30 focus:border-[#D67756]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Subject Code *
            </label>
            <input
              type="text"
              required
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. CS201"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#D67756]/30 focus:border-[#D67756]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Syllabus Description (Optional)
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief summary of topics or curriculum syllabus..."
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#D67756]/30 focus:border-[#D67756]"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-[#D67756] hover:bg-[#c26444] shadow-sm transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  <span>Saving Changes...</span>
                </>
              ) : (
                <span>Save Changes</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// SUBCOMPONENT: Assign Faculty Modal
// -----------------------------------------------------------------------------
function AssignFacultyModal({
  isOpen,
  subject,
  subjects = [],
  onSelectSubject,
  isPostCreation = false,
  assignmentsBySubject,
  getEligibleTeachers,
  onClose,
  onAssign,
  onRevoke,
  onNavigate,
  isAssigning,
  revokingAssignmentId,
  actionError
}) {
  // Current active subject in the modal
  const [currentSubjectId, setCurrentSubjectId] = useState(subject?.id || subjects[0]?.id || '');
  const [selectedTeacherUid, setSelectedTeacherUid] = useState('');
  const [selectedSection, setSelectedSection] = useState('');
  const [formError, setFormError] = useState('');

  // Sync if subject prop changes
  useEffect(() => {
    if (subject?.id) {
      setCurrentSubjectId(subject.id);
    }
  }, [subject?.id]);

  if (!isOpen) return null;

  const currentSubject = subjects.find(s => s.id === currentSubjectId) || subject;
  const currentAssignments = currentSubject ? (assignmentsBySubject.get(currentSubject.id) || []) : [];
  const eligibleTeachers = currentSubject ? getEligibleTeachers(currentSubject) : [];
  const currentTeacherObj = eligibleTeachers.find(t => t.uid === selectedTeacherUid);

  const handleAssignSubmit = (e) => {
    e.preventDefault();
    if (!currentSubject) {
      setFormError('Please select a subject first.');
      return;
    }
    if (!selectedTeacherUid) {
      setFormError('Please select a faculty member.');
      return;
    }

    setFormError('');
    onAssign(currentSubject.id, selectedTeacherUid, selectedSection || null);
    setSelectedTeacherUid('');
    setSelectedSection('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl w-full max-w-xl overflow-hidden animate-scale-up max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
              <Icons.Classes />
              <span>Assign Faculty to Subject</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Link authorized teachers to curriculum courses for study materials.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Body (scrollable) */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Post-Creation Prompt Banner */}
          {isPostCreation && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2">
              <span className="w-5 h-5 bg-emerald-500 text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0">✓</span>
              <span>Subject created! You can assign an authorized faculty member below, or click Done to finish.</span>
            </div>
          )}

          {(formError || actionError) && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-semibold flex items-center gap-2">
              <span className="w-4 h-4 bg-rose-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold shrink-0">!</span>
              <span>{formError || actionError}</span>
            </div>
          )}

          {/* Section 0: Subject Selection */}
          <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/80 space-y-2">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Target Curriculum Subject *
            </label>
            {subjects.length > 0 ? (
              <select
                value={currentSubjectId}
                onChange={(e) => {
                  setCurrentSubjectId(e.target.value);
                  setSelectedTeacherUid('');
                  setSelectedSection('');
                  if (onSelectSubject) {
                    const sel = subjects.find(s => s.id === e.target.value);
                    if (sel) onSelectSubject(sel);
                  }
                }}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D67756]/30 focus:border-[#D67756] cursor-pointer"
              >
                {subjects.map(s => (
                  <option key={s.id} value={s.id}>
                    [{s.code}] {s.name} — {s.department} ({s.year})
                  </option>
                ))}
              </select>
            ) : currentSubject ? (
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-slate-900 text-white text-xs font-black rounded">
                  {currentSubject.code}
                </span>
                <span className="text-sm font-bold text-slate-900">{currentSubject.name}</span>
                <span className="text-xs text-slate-500">({currentSubject.department} • {currentSubject.year})</span>
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">No curriculum subjects available.</p>
            )}

            {currentSubject && (
              <div className="flex items-center gap-2 pt-1 text-[11px] text-slate-600 font-medium">
                <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded font-bold">
                  {currentSubject.department}
                </span>
                <span className="px-2 py-0.5 bg-slate-200/80 text-slate-700 rounded font-bold">
                  {currentSubject.year}
                </span>
                {currentSubject.description && (
                  <span className="truncate italic text-slate-400 max-w-xs">
                    {currentSubject.description}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Section 1: Currently Assigned Teachers */}
          {currentSubject && (
            <div>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center justify-between">
                <span>Currently Assigned Faculty ({currentAssignments.length})</span>
              </h4>

              {currentAssignments.length > 0 ? (
                <div className="space-y-2 border border-slate-100 rounded-xl p-2 bg-slate-50/50">
                  {currentAssignments.map(assign => (
                    <div
                      key={assign.id}
                      className="flex items-center justify-between bg-white p-3 rounded-lg border border-slate-100 shadow-2xs"
                    >
                      <div className="truncate pr-2">
                        <p className="text-sm font-bold text-slate-900 truncate">
                          {assign.teacherName || assign.teacherEmail}
                        </p>
                        <p className="text-xs text-slate-500">
                          {assign.teacherEmail} •{' '}
                          <span className="font-semibold text-[#D67756]">
                            {assign.section ? `Section ${assign.section}` : 'Year-Wide (All Sections)'}
                          </span>
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={revokingAssignmentId === assign.id}
                        onClick={() => onRevoke(assign.id)}
                        className="px-3 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {revokingAssignmentId === assign.id ? 'Revoking...' : 'Revoke'}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic p-3 bg-slate-50 rounded-xl border border-slate-100">
                  No faculty members are currently assigned to this subject.
                </p>
              )}
            </div>
          )}

          {/* Section 2: Assign an Eligible Teacher */}
          {currentSubject && (
            <div className="pt-2 border-t border-slate-100">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">
                Assign an Authorized Faculty Member
              </h4>

              {eligibleTeachers.length === 0 ? (
                <div className="bg-amber-50/80 border border-amber-200/80 rounded-xl p-4 space-y-2 text-xs">
                  <p className="font-bold text-amber-900">
                    No faculty members have active allocations for {currentSubject.department} • {currentSubject.year}.
                  </p>
                  <p className="text-amber-800 leading-relaxed">
                    Before a faculty member can be assigned to this subject, they must have an authorized class allocation in the Director's Academic Spaces or Faculty Allocations panel.
                  </p>
                  {onNavigate && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onNavigate('People', 'Faculty');
                      }}
                      className="mt-2 text-xs font-bold text-[#D67756] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <span>Go to Faculty Class Allocation &rarr;</span>
                    </button>
                  )}
                </div>
              ) : (
                <form onSubmit={handleAssignSubmit} className="space-y-3 bg-slate-50/70 p-4 rounded-xl border border-slate-100">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Select Eligible Faculty Member *
                    </label>
                    <select
                      value={selectedTeacherUid}
                      onChange={(e) => {
                        setSelectedTeacherUid(e.target.value);
                        setSelectedSection('');
                      }}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D67756]/30 focus:border-[#D67756] cursor-pointer"
                    >
                      <option value="">-- Choose from authorized faculty ({eligibleTeachers.length}) --</option>
                      {eligibleTeachers.map(teacher => (
                        <option key={teacher.uid} value={teacher.uid}>
                          {teacher.name || teacher.email} ({teacher.email})
                          {teacher.isAlreadyAssignedYearWide ? ' — [Assigned Year-Wide]' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {currentTeacherObj && (
                    <div className="space-y-2 pt-1">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Assigned Scope / Section
                        </label>
                        <select
                          value={selectedSection}
                          onChange={(e) => setSelectedSection(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D67756]/30 focus:border-[#D67756] cursor-pointer"
                        >
                          <option value="">Year-Wide (All Authorized Sections)</option>
                          {currentTeacherObj.allocatedSections.map(sec => {
                            const isAssigned = currentTeacherObj.assignedSections?.some(s => isMatchingSection(s, sec));
                            return (
                              <option key={sec} value={sec}>
                                Section {sec} {isAssigned ? '(Already Assigned)' : ''}
                              </option>
                            );
                          })}
                        </select>
                      </div>

                      <div className="text-[11px] text-slate-500 bg-white p-2.5 rounded-lg border border-slate-100 space-y-1">
                        <p>
                          <span className="font-bold text-slate-700">Authorized Class Allocations:</span>{' '}
                          {currentTeacherObj.allocatedSections.length > 0
                            ? currentTeacherObj.allocatedSections.map(s => `Section ${s}`).join(', ')
                            : 'General Department Class'}
                        </p>
                        {currentTeacherObj.isAlreadyAssignedYearWide && (
                          <p className="text-amber-700 font-semibold">
                            ⚠️ This teacher is already assigned year-wide to this subject.
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="pt-2 flex justify-end">
                    <button
                      type="submit"
                      disabled={!selectedTeacherUid || isAssigning}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#D67756] hover:bg-[#c26444] shadow-sm transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                    >
                      {isAssigning ? (
                        <>
                          <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                          <span>Assigning...</span>
                        </>
                      ) : (
                        <span>Confirm Subject Assignment</span>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 flex justify-end bg-slate-50/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// SUBCOMPONENT: Delete Subject Modal
// -----------------------------------------------------------------------------
function DeleteSubjectModal({ isOpen, subject, activeAssignmentsCount = 0, onClose, onConfirm, onManageFaculty, isDeleting, actionError }) {
  if (!isOpen || !subject) return null;

  const hasAssignments = activeAssignmentsCount > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl w-full max-w-md overflow-hidden animate-scale-up p-6 space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
        </div>

        <div className="text-center">
          <h3 className="text-lg font-extrabold text-slate-900">Delete Subject</h3>
          <p className="text-xs text-slate-500 mt-1">
            Are you sure you want to delete <span className="font-bold text-slate-800">"{subject.name}" ({subject.code})</span>?
          </p>
        </div>

        {hasAssignments ? (
          <div className="p-3 bg-amber-50 border border-amber-200/80 rounded-xl text-xs text-amber-800 space-y-2">
            <p className="font-bold">⚠️ Active Faculty Assignments Detected ({activeAssignmentsCount})</p>
            <p className="leading-relaxed">
              This subject cannot be deleted while assigned to faculty. Please revoke active faculty assignments first. Original study material files on Google Drive will remain protected.
            </p>
            <button
              type="button"
              onClick={onManageFaculty}
              className="mt-1 text-xs font-bold text-[#D67756] hover:underline cursor-pointer block"
            >
              Manage & Revoke Assignments &rarr;
            </button>
          </div>
        ) : (
          <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-700 leading-relaxed">
            <span className="font-bold">Safe Deletion Guard:</span> The backend strictly verifies that no active study materials or assignments exist. Any original coursework files on Google Drive will never be modified.
          </div>
        )}

        {actionError && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-semibold leading-relaxed">
            {actionError}
          </div>
        )}

        <div className="pt-2 flex items-center justify-end gap-3">
          <button
            type="button"
            disabled={isDeleting}
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isDeleting || hasAssignments}
            onClick={onConfirm}
            className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-sm transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            {isDeleting ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                <span>Deleting...</span>
              </>
            ) : (
              <span>Yes, Delete Subject</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
