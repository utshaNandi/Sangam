import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Icons } from '../Teacher/Icons';
import { db, auth } from '../../firebase/config.js';
import { collection, query, where, getDocs } from 'firebase/firestore';
import {
  VALID_DAYS,
  VALID_PERIOD_TYPES,
  DEFAULT_PERIOD_TIMINGS,
  DEPARTMENTS,
  YEARS,
  SECTIONS,
  saveTimetableSlot,
  saveDayTimetable,
  deleteTimetableSlot,
  fetchClassTimetable,
  subscribeClassTimetable
} from '../../services/timetableService.js';
import { fetchTeacherAllocations } from '../../services/attendanceService.js';
import { deduplicateFacultyRecords } from './studentPartition.js';

export { DEPARTMENTS, YEARS, SECTIONS };

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

const getInitialDay = () => {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const current = days[new Date().getDay()];
  return current === 'Sunday' ? 'Monday' : current;
};

// UI Badge Colors for Period Types
const TYPE_STYLES = {
  Lecture: {
    bg: 'bg-indigo-50',
    text: 'text-indigo-700',
    border: 'border-indigo-200',
    dot: 'bg-indigo-500'
  },
  Lab: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    dot: 'bg-emerald-500'
  },
  Tutorial: {
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-200',
    dot: 'bg-purple-500'
  },
  Break: {
    bg: 'bg-amber-50',
    text: 'text-amber-800',
    border: 'border-amber-200',
    dot: 'bg-amber-500'
  },
  'Self Study': {
    bg: 'bg-sky-50',
    text: 'text-sky-700',
    border: 'border-sky-200',
    dot: 'bg-sky-500'
  }
};

export default function DirectorTimetableView({ userProfile }) {
  // Class Selectors
  const [department, setDepartment] = useState('Computer Science');
  const [year, setYear] = useState('2nd Year');
  const [section, setSection] = useState('Sec A');
  const [selectedDay, setSelectedDay] = useState(getInitialDay());

  // Data states
  const [slots, setSlots] = useState([]);
  const [weeklySlots, setWeeklySlots] = useState([]);
  const [allFaculty, setAllFaculty] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingDay, setIsSavingDay] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Modal states
  const [editingSlot, setEditingSlot] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [slotToDelete, setSlotToDelete] = useState(null);

  const institution = (userProfile?.institution || '').trim() || 'UEMK';
  const directorUid = auth?.currentUser?.uid || userProfile?.uid || userProfile?.id || '';

  // 1. Fetch Faculty and Allocations for the Institution
  const loadFacultyAndAllocations = useCallback(async () => {
    try {
      // Query faculty members
      const facultyQ = query(collection(db, 'users'), where('role', '==', 'faculty'));
      const facultySnap = await getDocs(facultyQ);
      const deduplicated = deduplicateFacultyRecords(facultySnap.docs);
      setAllFaculty(deduplicated);

      // Query allocations for institution
      const allocs = await fetchTeacherAllocations({ institution });
      setAllocations(allocs);
    } catch (err) {
      console.warn('Warning loading faculty allocations in Timetable UI:', err);
    }
  }, [institution]);

  useEffect(() => {
    loadFacultyAndAllocations();
  }, [loadFacultyAndAllocations]);

  // 2. Fetch and Subscribe to Timetable Slots for Selected Class
  const loadClassTimetable = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const fullWeek = await fetchClassTimetable({
        institution,
        department,
        year,
        section
      });
      setWeeklySlots(fullWeek);
      const daySlots = fullWeek.filter(s => s.day === selectedDay);
      setSlots(daySlots);
    } catch (err) {
      console.error('Error fetching timetable slots:', err);
      setError(err.message || 'Failed to load class timetable schedule.');
    } finally {
      setIsLoading(false);
    }
  }, [institution, department, year, section, selectedDay]);

  useEffect(() => {
    loadClassTimetable();

    // Subscribe to real-time changes
    try {
      const unsubscribe = subscribeClassTimetable(
        { institution, department, year, section, day: selectedDay },
        (updatedSlots) => {
          setSlots(updatedSlots);
        },
        (err) => {
          console.warn('Real-time timetable subscription error:', err);
        }
      );
      return () => unsubscribe();
    } catch (subErr) {
      console.warn('Could not subscribe to timetable updates:', subErr);
    }
  }, [institution, department, year, section, selectedDay, loadClassTimetable]);

  // Filter allocated faculty specifically authorized for the selected class
  const eligibleFacultyForClass = useMemo(() => {
    const normDept = normalize(department);
    const canonicalSelectedDept = CANONICAL_DEPARTMENT_MAP[department] || department;
    const normYear = normalize(year);
    const normSec = normalize(section);

    const matchingAllocations = allocations.filter(alloc => {
      if (alloc.authorized === false) return false;
      if (alloc.institution && normalize(alloc.institution) !== normalize(institution)) return false;

      const allocCanonicalDept = CANONICAL_DEPARTMENT_MAP[alloc.department] || alloc.department;
      const deptMatch =
        normalize(alloc.department) === normDept ||
        normalize(allocCanonicalDept) === normalize(canonicalSelectedDept);

      const allocYear = normalize(alloc.year);
      const yearMatch = allocYear === normYear || allocYear.includes(normYear) || normYear.includes(allocYear);

      const allocSec = normalize(alloc.section);
      const secMatch =
        allocSec === normSec ||
        (normSec && allocSec.endsWith(normSec.replace('sec', '').replace('section', ''))) ||
        (allocSec && normSec.endsWith(allocSec.replace('sec', '').replace('section', '')));

      return deptMatch && yearMatch && secMatch;
    });

    const teacherUids = new Set(matchingAllocations.map(a => a.teacherUid));
    return allFaculty.filter(f => teacherUids.has(f.uid || f.id));
  }, [allocations, allFaculty, department, year, section, institution]);

  // Counts of scheduled periods per day (for tab badges)
  const dayPeriodCounts = useMemo(() => {
    const counts = {};
    VALID_DAYS.forEach(d => { counts[d] = 0; });
    weeklySlots.forEach(s => {
      if (counts[s.day] !== undefined) {
        counts[s.day]++;
      }
    });
    return counts;
  }, [weeklySlots]);

  // Map slots for Periods 1 to 9 for the active day
  const periodMap = useMemo(() => {
    const map = {};
    slots.forEach(slot => {
      map[Number(slot.period)] = slot;
    });
    return map;
  }, [slots]);

  // Open modal for a new or existing period
  const handleOpenAddPeriod = (periodNumber) => {
    const defaultTiming = DEFAULT_PERIOD_TIMINGS[periodNumber - 1] || { startTime: '09:30 AM', endTime: '10:15 AM' };
    setEditingSlot({
      isNew: true,
      period: periodNumber,
      startTime: defaultTiming.startTime,
      endTime: defaultTiming.endTime,
      type: periodNumber === 5 ? 'Break' : 'Lecture',
      subject: periodNumber === 5 ? 'Lunch Break' : '',
      room: periodNumber === 5 ? 'Cafeteria' : '',
      teacherUid: '',
      teacherName: ''
    });
    setIsModalOpen(true);
  };

  const handleOpenEditPeriod = (slot) => {
    setEditingSlot({
      ...slot,
      isNew: false
    });
    setIsModalOpen(true);
  };

  // Quick 1-click lunch break configuration for Period 5
  const handleQuickAddLunchBreak = async () => {
    const activeUid = auth?.currentUser?.uid || userProfile?.uid || userProfile?.id || directorUid;
    if (!activeUid) {
      setError('Missing authenticated Director session. Please log in again.');
      return;
    }
    try {
      const slotInput = {
        institution,
        department,
        year,
        section,
        day: selectedDay,
        period: 5,
        startTime: '12:30 PM',
        endTime: '01:15 PM',
        subject: 'Lunch Break',
        type: 'Break',
        room: 'Cafeteria',
        teacherUid: '',
        teacherName: '',
        updatedBy: activeUid
      };
      await saveTimetableSlot(slotInput);
      setSuccessMessage('Lunch break added for Period 5.');
      loadClassTimetable();
    } catch (err) {
      console.error('Error adding lunch break:', err);
      setError(err.message || 'Failed to add lunch break.');
    }
  };

  // Save single slot from modal
  const handleSaveSlot = async (slotData) => {
    // Validate duplicate period when adding a new slot
    if (slotData.isNew && periodMap[slotData.period]) {
      throw new Error(`Period ${slotData.period} is already scheduled on ${selectedDay}. Please edit the existing period or select an unscheduled period.`);
    }

    const activeUid = auth?.currentUser?.uid || userProfile?.uid || userProfile?.id || directorUid;
    if (!activeUid) {
      throw new Error('Missing authenticated Director session. Please log in again.');
    }

    const payload = {
      institution,
      department,
      year,
      section,
      day: selectedDay,
      period: Number(slotData.period),
      startTime: slotData.startTime,
      endTime: slotData.endTime,
      subject: slotData.subject,
      type: slotData.type,
      room: slotData.room || '',
      teacherUid: slotData.type === 'Break' ? '' : (slotData.teacherUid || ''),
      teacherName: slotData.type === 'Break' ? '' : (slotData.teacherName || ''),
      updatedBy: activeUid
    };

    await saveTimetableSlot(payload);
    setSuccessMessage(`Period ${payload.period} (${payload.subject}) saved successfully.`);
    setIsModalOpen(false);
    setEditingSlot(null);
    loadClassTimetable();
  };

  // Delete slot handler
  const handleDeleteSlot = async () => {
    if (!slotToDelete) return;
    try {
      await deleteTimetableSlot({
        institution,
        department,
        year,
        section,
        day: selectedDay,
        period: slotToDelete.period
      });
      setSuccessMessage(`Period ${slotToDelete.period} has been deleted.`);
      setSlotToDelete(null);
      loadClassTimetable();
    } catch (err) {
      console.error('Error deleting slot:', err);
      setError(err.message || 'Failed to delete period slot.');
    }
  };

  // Save whole day's timetable
  const handleSaveDayBatch = async () => {
    if (slots.length === 0) {
      setError('Cannot save an empty timetable. Add at least one period first.');
      return;
    }
    setIsSavingDay(true);
    setError(null);
    const activeUid = auth?.currentUser?.uid || userProfile?.uid || userProfile?.id || directorUid;
    if (!activeUid) {
      setError('Missing authenticated Director session. Please log in again.');
      setIsSavingDay(false);
      return;
    }
    try {
      await saveDayTimetable({
        classInfo: { institution, department, year, section },
        day: selectedDay,
        slots,
        directorUid: activeUid
      });
      setSuccessMessage(`Full day schedule for ${selectedDay} saved and verified successfully.`);
    } catch (err) {
      console.error('Error saving day timetable batch:', err);
      setError(err.message || 'Failed to save full day schedule.');
    } finally {
      setIsSavingDay(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Title */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-100 shadow-sm relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-extrabold uppercase tracking-widest text-[#D67756] bg-[#FFF2ED] px-3 py-1 rounded-full">
                Timetable Administration
              </span>
              <span className="text-xs font-semibold text-slate-400">
                {institution} • Director Control
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Class Timetable Management
            </h2>
            <p className="text-sm text-slate-500 font-medium mt-1 max-w-2xl">
              Configure and maintain the master 9-period daily schedules. Assign subjects, rooms, and authorized faculty for each class branch and section.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => loadClassTimetable()}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-slate-600 text-xs font-bold hover:bg-slate-100 transition-all active:scale-95 disabled:opacity-50"
            >
              <svg className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10"></polyline>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
              </svg>
              <span>Refresh</span>
            </button>

            <button
              onClick={handleSaveDayBatch}
              disabled={isSavingDay || slots.length === 0}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#D67756] hover:bg-[#c26444] text-white rounded-2xl text-xs font-bold shadow-sm hover:shadow transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSavingDay ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  <span>Saving Day...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                    <polyline points="17 21 17 13 7 13 7 21"></polyline>
                    <polyline points="7 3 7 8 15 8"></polyline>
                  </svg>
                  <span>Save Day Timetable</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Notifications */}
        {successMessage && (
          <div className="mt-6 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold px-4 py-3 rounded-2xl flex items-center justify-between shadow-sm animate-fade-in">
            <div className="flex items-center gap-2.5">
              <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-extrabold">✓</span>
              <span>{successMessage}</span>
            </div>
            <button onClick={() => setSuccessMessage(null)} className="text-emerald-700 hover:text-emerald-900 font-bold text-lg leading-none">
              ×
            </button>
          </div>
        )}

        {error && (
          <div className="mt-6 bg-rose-50 border border-rose-200 text-rose-800 text-sm font-medium px-4 py-3 rounded-2xl flex items-center justify-between shadow-sm animate-fade-in">
            <div className="flex items-center gap-2.5">
              <span className="w-5 h-5 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center text-xs font-bold">!</span>
              <span>{error}</span>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => loadClassTimetable()} className="text-xs font-bold underline hover:no-underline text-rose-900">
                Retry
              </button>
              <button onClick={() => setError(null)} className="text-rose-700 hover:text-rose-900 font-bold text-lg leading-none">
                ×
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Class Identity Selectors Bar */}
      <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#FFF2ED] text-[#D67756] flex items-center justify-center">
              <Icons.Classes />
            </div>
            <h3 className="text-base font-extrabold text-slate-900">Select Academic Class</h3>
          </div>
          <span className="text-xs font-semibold text-slate-400">
            Canonical Identity: <code className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono text-[11px]">{institution}_{department}_{year}_{section}</code>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Department Select */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Department / Branch
            </label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-[#D67756] focus:ring-2 focus:ring-[#D67756]/20 transition-all cursor-pointer"
            >
              {DEPARTMENTS.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>

          {/* Academic Year Select */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Academic Year
            </label>
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-[#D67756] focus:ring-2 focus:ring-[#D67756]/20 transition-all cursor-pointer"
            >
              {YEARS.map(yr => (
                <option key={yr} value={yr}>{yr}</option>
              ))}
            </select>
          </div>

          {/* Section Select */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Section
            </label>
            <select
              value={section}
              onChange={(e) => setSection(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-[#D67756] focus:ring-2 focus:ring-[#D67756]/20 transition-all cursor-pointer"
            >
              {SECTIONS.map(sec => (
                <option key={sec} value={sec}>{sec}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Authorized Faculty Banner for this selected class */}
        <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
            <span className="font-bold text-slate-800">Authorized Faculty for this Class:</span>
            {eligibleFacultyForClass.length === 0 ? (
              <span className="text-amber-600 font-semibold bg-amber-50 px-2.5 py-1 rounded-lg">
                ⚠️ No faculty allocated to this class yet (assign in People &gt; Allocations)
              </span>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {eligibleFacultyForClass.map(f => (
                  <span
                    key={f.uid || f.id}
                    className="inline-flex items-center gap-1.5 bg-[#FFF2ED] text-[#D67756] px-2.5 py-0.5 rounded-full text-[11px] font-bold"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-[#D67756]"></span>
                    {f.name || f.email?.split('@')[0]}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="text-xs text-slate-400">
            {slots.length} of 9 periods scheduled for {selectedDay}
          </div>
        </div>
      </div>

      {/* Day Selector Tabs (Monday - Saturday) */}
      <div className="bg-white rounded-3xl p-3 border border-slate-100 shadow-sm">
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
          {VALID_DAYS.map(dayName => {
            const isSelected = selectedDay === dayName;
            const count = dayPeriodCounts[dayName] || 0;
            return (
              <button
                key={dayName}
                onClick={() => setSelectedDay(dayName)}
                className={`flex flex-col sm:flex-row items-center justify-center gap-2 py-3 px-4 rounded-2xl text-xs font-bold transition-all ${
                  isSelected
                    ? 'bg-[#D67756] text-white shadow-md shadow-[#D67756]/20'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span>{dayName}</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                    isSelected
                      ? 'bg-white/20 text-white'
                      : count > 0
                      ? 'bg-[#FFF2ED] text-[#D67756]'
                      : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Timetable Grid View (Periods 1 - 9) */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-100 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-lg font-extrabold text-slate-900 tracking-tight">
              {selectedDay} Schedule • {department}
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              {year} • {section} • Periods 1 through 9
            </p>
          </div>

          <div className="flex items-center gap-3">
            {!periodMap[5] && (
              <button
                onClick={handleQuickAddLunchBreak}
                className="flex items-center gap-1.5 px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold transition-all active:scale-95"
              >
                <span>+ Add Lunch Break (P5)</span>
              </button>
            )}
            <button
              onClick={() => handleOpenAddPeriod(1)}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#D67756] hover:bg-[#c26444] text-white rounded-xl text-xs font-bold shadow-sm hover:shadow transition-all active:scale-95"
            >
              <Icons.Plus />
              <span>Add Period</span>
            </button>
          </div>
        </div>

        {/* Loading State */}
        {isLoading ? (
          <div className="py-20 text-center space-y-3">
            <div className="w-8 h-8 border-3 border-[#D67756] border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-sm font-semibold text-slate-600">Loading {selectedDay} schedule from Cloud Firestore...</p>
          </div>
        ) : (
          <div className="space-y-3">
            {DEFAULT_PERIOD_TIMINGS.map(({ period: periodNum, startTime: defStart, endTime: defEnd }) => {
              const slot = periodMap[periodNum];
              const typeStyle = slot ? (TYPE_STYLES[slot.type] || TYPE_STYLES.Lecture) : null;

              if (slot) {
                // Scheduled Period Card
                return (
                  <div
                    key={periodNum}
                    className="p-4 sm:p-5 rounded-2xl border border-slate-200/80 bg-slate-50/40 hover:bg-white hover:border-[#D67756]/40 hover:shadow-md transition-all duration-200 flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    {/* Left: Period & Time Badge */}
                    <div className="flex items-start sm:items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 text-slate-800 flex flex-col items-center justify-center shrink-0 shadow-sm">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">P</span>
                        <span className="text-lg font-black text-slate-900 leading-none">{periodNum}</span>
                      </div>

                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-extrabold text-slate-900 text-base">
                            {slot.subject}
                          </h4>
                          <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-0.5 rounded-full border ${typeStyle.bg} ${typeStyle.text} ${typeStyle.border}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${typeStyle.dot}`}></span>
                            {slot.type}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 font-medium">
                          {/* Timing */}
                          <span className="inline-flex items-center gap-1">
                            <svg className="w-3.5 h-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10"></circle>
                              <polyline points="12 6 12 12 16 14"></polyline>
                            </svg>
                            {slot.startTime} – {slot.endTime}
                          </span>

                          {/* Room */}
                          {slot.room && (
                            <span className="inline-flex items-center gap-1">
                              <svg className="w-3.5 h-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                              </svg>
                              {slot.room}
                            </span>
                          )}

                          {/* Teacher */}
                          {slot.type !== 'Break' && (
                            <span className="inline-flex items-center gap-1">
                              <svg className="w-3.5 h-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                <circle cx="12" cy="7" r="4"></circle>
                              </svg>
                              <span className={slot.teacherName ? 'font-semibold text-slate-700' : 'italic text-slate-400'}>
                                {slot.teacherName || 'No Faculty Assigned'}
                              </span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2 self-end md:self-center">
                      <button
                        onClick={() => handleOpenEditPeriod(slot)}
                        className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-all active:scale-95"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setSlotToDelete(slot)}
                        className="px-3 py-1.5 rounded-xl border border-rose-200 text-xs font-bold text-rose-600 hover:bg-rose-50 hover:text-rose-700 transition-all active:scale-95"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              }

              // Unscheduled Period Card
              return (
                <div
                  key={periodNum}
                  className="p-3.5 sm:p-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/20 hover:bg-slate-50/50 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 text-slate-400 flex flex-col items-center justify-center shrink-0">
                      <span className="text-[10px] font-bold">P</span>
                      <span className="text-sm font-bold text-slate-600 leading-none">{periodNum}</span>
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-400">Period {periodNum}</span>
                        <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                          Unscheduled
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 font-medium mt-0.5">
                        Standard Timing: {defStart} – {defEnd}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    {periodNum === 5 && (
                      <button
                        onClick={handleQuickAddLunchBreak}
                        className="px-3 py-1.5 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-xl transition-all"
                      >
                        Lunch Break
                      </button>
                    )}
                    <button
                      onClick={() => handleOpenAddPeriod(periodNum)}
                      className="px-3.5 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-[#D67756] hover:bg-[#FFF2ED] transition-all flex items-center gap-1.5 active:scale-95"
                    >
                      <Icons.Plus />
                      <span>Add Period {periodNum}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Period Add / Edit Modal */}
      {isModalOpen && editingSlot && (
        <PeriodModal
          slot={editingSlot}
          classInfo={{ institution, department, year, section }}
          day={selectedDay}
          eligibleFaculty={eligibleFacultyForClass}
          onClose={() => {
            setIsModalOpen(false);
            setEditingSlot(null);
          }}
          onSave={handleSaveSlot}
        />
      )}

      {/* Delete Confirmation Modal */}
      {slotToDelete && (
        <DeleteConfirmationModal
          slot={slotToDelete}
          onClose={() => setSlotToDelete(null)}
          onConfirm={handleDeleteSlot}
        />
      )}
    </div>
  );
}

/**
 * Add / Edit Period Modal
 */
function PeriodModal({ slot, classInfo, day, eligibleFaculty, onClose, onSave }) {
  const [period, setPeriod] = useState(slot.period || 1);
  const [type, setType] = useState(slot.type || 'Lecture');
  const [subject, setSubject] = useState(slot.subject || '');
  const [startTime, setStartTime] = useState(slot.startTime || '09:30 AM');
  const [endTime, setEndTime] = useState(slot.endTime || '10:15 AM');
  const [room, setRoom] = useState(slot.room || '');
  const [teacherUid, setTeacherUid] = useState(slot.teacherUid || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');

  // Auto-fill standard times when period changes
  const handlePeriodChange = (newPeriod) => {
    setPeriod(Number(newPeriod));
    const def = DEFAULT_PERIOD_TIMINGS[Number(newPeriod) - 1];
    if (def && slot.isNew) {
      setStartTime(def.startTime);
      setEndTime(def.endTime);
      if (Number(newPeriod) === 5) {
        setType('Break');
        if (!subject) setSubject('Lunch Break');
        if (!room) setRoom('Cafeteria');
      }
    }
  };

  const handleTypeChange = (newType) => {
    setType(newType);
    if (newType === 'Break') {
      setTeacherUid('');
      if (!subject || subject === 'Lecture') setSubject('Break');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!subject.trim()) {
      setModalError('Subject name is required.');
      return;
    }
    if (!startTime.trim() || !endTime.trim()) {
      setModalError('Start and End times are required.');
      return;
    }

    setModalError('');
    setIsSubmitting(true);

    try {
      let teacherName = '';
      if (type !== 'Break' && teacherUid) {
        const found = eligibleFaculty.find(f => (f.uid || f.id) === teacherUid);
        teacherName = found?.name || found?.email?.split('@')[0] || '';
      }

      await onSave({
        ...slot,
        period: Number(period),
        type,
        subject: subject.trim(),
        startTime: startTime.trim(),
        endTime: endTime.trim(),
        room: room.trim(),
        teacherUid: type === 'Break' ? '' : teacherUid,
        teacherName: type === 'Break' ? '' : teacherName
      });
    } catch (err) {
      console.error('Error in PeriodModal submission:', err);
      setModalError(err.message || 'Failed to save timetable slot.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
      <div
        className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-100 overflow-hidden animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-extrabold text-slate-900">
              {slot.isNew ? `Add Period ${period}` : `Edit Period ${period}`}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {classInfo.department} • {classInfo.year} • {classInfo.section} ({day})
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-slate-700 font-bold text-xl p-1 leading-none rounded-lg"
          >
            ×
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {modalError && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold px-4 py-2.5 rounded-xl">
              {modalError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {/* Period Selector */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Period Number <span className="text-rose-500">*</span>
              </label>
              <select
                value={period}
                onChange={(e) => handlePeriodChange(e.target.value)}
                disabled={!slot.isNew || isSubmitting}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-[#D67756] focus:ring-2 focus:ring-[#D67756]/20 transition-all disabled:opacity-60"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(p => (
                  <option key={p} value={p}>Period {p}</option>
                ))}
              </select>
            </div>

            {/* Type Selector */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Class Type <span className="text-rose-500">*</span>
              </label>
              <select
                value={type}
                onChange={(e) => handleTypeChange(e.target.value)}
                disabled={isSubmitting}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-[#D67756] focus:ring-2 focus:ring-[#D67756]/20 transition-all"
              >
                {VALID_PERIOD_TYPES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Subject Name */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Subject / Activity <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Data Structures & Algorithms"
              required
              disabled={isSubmitting}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-[#D67756] focus:ring-2 focus:ring-[#D67756]/20 transition-all"
            />
          </div>

          {/* Timings */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Start Time <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                placeholder="09:30 AM"
                required
                disabled={isSubmitting}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-[#D67756] focus:ring-2 focus:ring-[#D67756]/20 transition-all font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                End Time <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                placeholder="10:15 AM"
                required
                disabled={isSubmitting}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-[#D67756] focus:ring-2 focus:ring-[#D67756]/20 transition-all font-mono"
              />
            </div>
          </div>

          {/* Room Number */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Classroom / Laboratory / Location
            </label>
            <input
              type="text"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              placeholder="e.g. Room 402, Lab 3, Workshop"
              disabled={isSubmitting}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-[#D67756] focus:ring-2 focus:ring-[#D67756]/20 transition-all"
            />
          </div>

          {/* Assigned Faculty Selector (Filtered strictly by class allocation) */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Assigned Faculty
            </label>
            {type === 'Break' ? (
              <p className="text-xs text-slate-400 italic bg-slate-50 p-3 rounded-xl border border-slate-200">
                Breaks do not require an assigned faculty member.
              </p>
            ) : eligibleFaculty.length === 0 ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 space-y-1">
                <p className="font-bold">No faculty allocated to this class yet.</p>
                <p className="text-slate-600">
                  You can assign faculty once they are allocated to {classInfo.department} • {classInfo.year} • {classInfo.section} in the People tab.
                </p>
              </div>
            ) : (
              <select
                value={teacherUid}
                onChange={(e) => setTeacherUid(e.target.value)}
                disabled={isSubmitting}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-[#D67756] focus:ring-2 focus:ring-[#D67756]/20 transition-all cursor-pointer"
              >
                <option value="">Select Allocated Faculty...</option>
                {eligibleFaculty.map(f => (
                  <option key={f.uid || f.id} value={f.uid || f.id}>
                    {f.name || f.email?.split('@')[0]} ({f.email})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Action Buttons */}
          <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
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
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-[#D67756] hover:bg-[#c26444] shadow-sm hover:shadow transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save Period</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Delete Confirmation Modal
 */
function DeleteConfirmationModal({ slot, onClose, onConfirm }) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirm = async () => {
    setIsDeleting(true);
    await onConfirm();
    setIsDeleting(false);
  };

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
      <div
        className="bg-white rounded-3xl max-w-sm w-full shadow-2xl border border-slate-100 p-6 space-y-4 animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold text-xl mx-auto">
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
        </div>

        <div className="text-center space-y-1">
          <h3 className="text-lg font-extrabold text-slate-900">
            Delete Period {slot.period}?
          </h3>
          <p className="text-xs text-slate-500">
            Are you sure you want to remove <span className="font-bold text-slate-800">"{slot.subject}"</span> ({slot.startTime} – {slot.endTime}) from the timetable?
          </p>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isDeleting}
            className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-sm transition-all flex items-center justify-center gap-2"
          >
            {isDeleting ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                <span>Deleting...</span>
              </>
            ) : (
              <span>Confirm Delete</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
