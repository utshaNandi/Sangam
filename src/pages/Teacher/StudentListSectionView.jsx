import React, { useState, useMemo, useRef } from 'react';
import { resolveAcademicScope } from '../../services/attendanceService';

const RAW_STUDENTS = [
  ["Aarav Sharma", "M"], ["Aditi Verma", "F"], ["Advait Joshi", "M"], ["Akash Nair", "M"], ["Alia Kulkarni", "F"],
  ["Aman Gupta", "M"], ["Amrita Rao", "F"], ["Ananya Iyer", "F"], ["Aniket Deshmukh", "M"], ["Anjali Mehta", "F"],
  ["Anushka Sen", "F"], ["Arjun Reddy", "M"], ["Aryan Kapoor", "M"], ["Atharv Patil", "M"], ["Avani Chatterjee", "F"],
  ["Ayushmann Bose", "M"], ["Bhavya Malhotra", "F"], ["Chaitanya Menon", "M"], ["Chirag Agarwal", "M"], ["Daksh Bansal", "M"],
  ["Deepika Choudhury", "F"], ["Devansh Saxena", "M"], ["Dhruv Bhatia", "M"], ["Divya Krishnan", "F"], ["Esha Singhania", "F"],
  ["Farhan Akhtar", "M"], ["Gaurav Tiwari", "M"], ["Gauri Shankar", "M"], ["Harshvardhan Chauhan", "M"], ["Hina Parekh", "F"],
  ["Hrithik Roshan", "M"], ["Ishan Kishan", "M"], ["Ishita Dutta", "F"], ["Jatin Sarna", "M"], ["Jhanvi Gokhale", "F"],
  ["Kabir Bedi", "M"], ["Kajal Aggarwal", "F"], ["Karan Johar", "M"], ["Kartik Aaryan", "M"], ["Kavya Madhavan", "F"],
  ["Khushi Kapoor", "F"], ["Kiran Mazumdar", "F"], ["Kritika Kamra", "F"], ["Kunal Kemmu", "M"], ["Lakshya Lalwani", "M"],
  ["Lavanya Tripathi", "F"], ["Madhavendra Singh", "M"], ["Mahima Makwana", "F"], ["Manish Pandey", "M"], ["Meera Rajput", "F"],
  ["Mihir Virani", "M"], ["Mrunal Thakur", "F"], ["Nakul Mehta", "M"], ["Nandini Murthy", "F"], ["Neha Dhupia", "F"],
  ["Nikhil Dwivedi", "M"], ["Niharika Konidela", "F"], ["Nishant Dahiya", "M"], ["Nitya Menen", "F"], ["Omkar Das", "M"],
  ["Palak Tiwari", "F"], ["Parth Samthaan", "M"], ["Pranav Mohanlal", "M"], ["Prachi Desai", "F"], ["Prateek Kuhad", "M"],
  ["Priya Prakash", "F"], ["Pulkit Samrat", "M"], ["Radhika Apte", "F"], ["Raghav Juyal", "M"], ["Rahul Dravid", "M"],
  ["Rajkummar Rao", "M"], ["Rashi Khanna", "F"], ["Reyansh Mistry", "M"], ["Rhea Chakraborty", "F"], ["Rishabh Pant", "M"],
  ["Ritvik Dhanjani", "M"], ["Rohan Gavaskar", "M"], ["Ruhi Chaturvedi", "F"], ["Saanvi Talwar", "F"], ["Sahil Khattar", "M"],
  ["Sakshi Malik", "F"], ["Samarth Jurel", "M"], ["Sameer Wankhede", "M"], ["Sanya Malhotra", "F"], ["Sarthak Kalyani", "M"]
];

function getSearchPriority(student, q) {
  const rollStr = student.roll.toLowerCase();
  const rollNumStr = String(student.id);
  const nameStr = student.name.toLowerCase();
  const enrollmentStr = student.enrollment.toLowerCase();
  const genderStr = student.gender.toLowerCase();

  // Priority 1: Exact or prefix match on Roll or Name
  if (rollStr === q || rollNumStr === q || rollStr.startsWith(q)) return 1;
  if (nameStr.startsWith(q) || nameStr.split(' ').some(part => part.startsWith(q))) return 2;

  // Priority 2: Substring match on Roll or Name
  if (rollStr.includes(q) || nameStr.includes(q)) return 3;

  // Priority 3: Enrollment number match (starts with, then includes)
  if (enrollmentStr.startsWith(q)) return 4;
  if (enrollmentStr.includes(q)) return 5;

  // Priority 4: Gender match
  if (genderStr.startsWith(q)) return 6;

  return 0; // No match
}

export default function StudentListSectionView({ group, onBack, userProfile, allocations = [] }) {
  const defaultAlloc = allocations?.[0] || null;
  const { br, yr, sec } = resolveAcademicScope(group, defaultAlloc);

  // Dynamic complete academic hierarchy breadcrumb
  const breadcrumbSegments = useMemo(() => {
    if (group?.path && Array.isArray(group.path) && group.path.length > 0) {
      return group.path;
    }
    const inst = userProfile?.institution || 'UEMK';
    const cleanBranch = br !== 'Unknown' ? br : 'CSE AI';
    const cleanYear = yr !== 'Unknown' ? yr : '1st Year';
    const cleanSec = sec !== 'All Sections' ? sec : 'Section B';
    return [inst, cleanBranch, cleanYear, cleanSec];
  }, [group, userProfile, br, yr, sec]);

  // Section code for enrollment number distinction
  const lastPathSegment = (group?.path && group.path.length > 0) ? group.path[group.path.length - 1] : '';
  const sectionStr = String(group?.section || lastPathSegment || sec || '').toLowerCase();
  const secCode = sectionStr.includes('a') ? 'A' : sectionStr.includes('c') ? 'C' : 'B';

  const studentsData = useMemo(() => {
    return RAW_STUDENTS.slice(0, 85).map(([name, genderCode], index) => {
      const rollNum = index + 1;
      const paddedRoll = String(rollNum).padStart(2, '0');
      const enrollmentNo = `ENR26CS${secCode}${String(1000 + rollNum * 3 + (index % 7)).padStart(4, '0')}`;
      return {
        id: rollNum,
        roll: paddedRoll,
        name: name,
        gender: genderCode === "M" ? "Male" : "Female",
        enrollment: enrollmentNo
      };
    });
  }, [secCode]);

  const [currentSort, setCurrentSort] = useState({ field: 'roll', asc: true });
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef(null);

  const handleSort = (field) => {
    if (currentSort.field === field) {
      setCurrentSort(prev => ({ ...prev, asc: !prev.asc }));
    } else {
      setCurrentSort({ field, asc: true });
    }
  };

  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      return studentsData
        .map(student => ({ student, priority: getSearchPriority(student, q) }))
        .filter(item => item.priority > 0)
        .sort((a, b) => {
          if (a.priority !== b.priority) return a.priority - b.priority;
          return a.student.id - b.student.id;
        })
        .map(item => item.student);
    }

    return [...studentsData].sort((a, b) => {
      let valA = currentSort.field === 'roll' ? a.id : a[currentSort.field].toLowerCase();
      let valB = currentSort.field === 'roll' ? b.id : b[currentSort.field].toLowerCase();
      if (valA < valB) return currentSort.asc ? -1 : 1;
      if (valA > valB) return currentSort.asc ? 1 : -1;
      return 0;
    });
  }, [studentsData, searchQuery, currentSort]);

  return (
    <div className="min-h-screen w-full bg-[#F8F3E6] text-neutral-900 flex flex-col selection:bg-neutral-300 selection:text-black font-sans">
      <style>{`
        /* Very subtle, fast, and clean row hover */
        .student-row {
          position: relative;
          transition: background-color 0.18s cubic-bezier(0.16, 1, 0.3, 1),
                      transform 0.18s cubic-bezier(0.16, 1, 0.3, 1);
          border-bottom: 1px solid rgba(0, 0, 0, 0.045);
        }
        .student-row:hover {
          background-color: rgba(0, 0, 0, 0.035);
        }
        .student-row:active {
          background-color: rgba(0, 0, 0, 0.055);
        }

        /* Minimalist '<' back button interaction */
        .back-btn {
          transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .back-btn:hover {
          background-color: rgba(0, 0, 0, 0.05);
          transform: translateX(-1.5px);
        }
        .back-btn:active {
          transform: translateX(0px) scale(0.96);
        }

        /* Minimalist expandable search line */
        .search-line-wrap {
          transition: width 0.25s cubic-bezier(0.16, 1, 0.3, 1),
                      border-color 0.2s ease;
        }
      `}</style>

      {/* Header Bar */}
      <header className="sticky top-0 z-30 bg-[#F8F3E6]/90 backdrop-blur-md">
        <div className="w-full px-4 sm:px-6 h-16 flex items-center justify-between gap-4">

          <div className="flex items-center gap-2 sm:gap-3 overflow-hidden">
            {/* Minimalist '<' Back Button from provided code */}
            <button
              id="backBtn"
              type="button"
              onClick={onBack}
              aria-label="Back"
              className="back-btn w-9 h-9 rounded-lg flex items-center justify-center text-neutral-800 hover:text-black text-lg font-normal select-none cursor-pointer focus:outline-none shrink-0"
            >
              <span className="leading-none -mt-0.5">&lt;</span>
            </button>

            {/* Complete Academic Hierarchy Breadcrumb Path */}
            <nav aria-label="Academic Hierarchy" className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide py-1 text-xs sm:text-[13px] font-sans">
              {breadcrumbSegments.map((segment, idx) => {
                const isLast = idx === breadcrumbSegments.length - 1;
                return (
                  <span key={idx} className="flex items-center gap-1.5 whitespace-nowrap">
                    <span className={isLast ? 'text-neutral-900 font-semibold' : 'text-neutral-500'}>
                      {segment}
                    </span>
                    {!isLast && (
                      <span className="text-neutral-300 font-light select-none">/</span>
                    )}
                  </span>
                );
              })}
            </nav>
          </div>

          {/* Minimalistic Search Logo + Line */}
          <div
            id="searchWrap"
            onClick={() => searchInputRef.current?.focus()}
            className="search-line-wrap flex items-center border-b border-black/25 focus-within:border-black py-1 w-28 sm:w-36 focus-within:w-52 sm:focus-within:w-64 cursor-text shrink-0"
          >
            <svg
              className="w-3.5 h-3.5 text-neutral-600 shrink-0 mr-2"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7"></circle>
              <line x1="20" y1="20" x2="16.35" y2="16.35" strokeLinecap="round"></line>
            </svg>
            <input
              ref={searchInputRef}
              id="searchInput"
              type="text"
              autoComplete="off"
              spellCheck="false"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search student"
              placeholder=""
              className="w-full bg-transparent text-xs sm:text-[13px] text-neutral-900 placeholder-transparent focus:outline-none font-sans"
            />
            {searchQuery && (
              <button
                id="clearSearchBtn"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSearchQuery('');
                  searchInputRef.current?.focus();
                }}
                aria-label="Clear search"
                className="text-neutral-400 hover:text-black text-xs leading-none ml-1.5 focus:outline-none cursor-pointer"
              >
                &times;
              </button>
            )}
          </div>

        </div>
      </header>

      {/* Main Student List Table */}
      <main className="flex-1 w-full px-4 sm:px-6 pb-16">

        {/* Column Headers: Only Roll, Name, Gender, Enrollment */}
        <div className="grid grid-cols-12 px-3 sm:px-4 py-2.5 text-[11px] font-mono uppercase tracking-wider text-neutral-500 select-none border-b border-black/10">
          <div
            className="col-span-2 sm:col-span-2 flex items-center gap-1 cursor-pointer hover:text-black transition-colors"
            onClick={() => handleSort('roll')}
          >
            <span>Roll</span>
            <span id="sort-roll" className="text-[9px] text-neutral-800">
              {currentSort.field === 'roll' ? (currentSort.asc ? '↑' : '↓') : ''}
            </span>
          </div>

          <div
            className="col-span-5 sm:col-span-5 flex items-center gap-1 cursor-pointer hover:text-black transition-colors"
            onClick={() => handleSort('name')}
          >
            <span>Name</span>
            <span id="sort-name" className="text-[9px] text-neutral-800">
              {currentSort.field === 'name' ? (currentSort.asc ? '↑' : '↓') : ''}
            </span>
          </div>

          <div
            className="col-span-2 sm:col-span-2 flex items-center gap-1 cursor-pointer hover:text-black transition-colors"
            onClick={() => handleSort('gender')}
          >
            <span>Gender</span>
            <span id="sort-gender" className="text-[9px] text-neutral-800">
              {currentSort.field === 'gender' ? (currentSort.asc ? '↑' : '↓') : ''}
            </span>
          </div>

          <div className="col-span-3 sm:col-span-3 text-right flex items-center justify-end">
            <span>Enrollment</span>
          </div>
        </div>

        {/* Student Rows Container */}
        <div id="studentList" className="divide-y divide-black/[0.04]" role="list">
          {filteredStudents.length === 0 ? (
            <div className="py-16 text-center text-xs text-neutral-400 font-mono">
              No students found matching "{searchQuery}"
            </div>
          ) : (
            filteredStudents.map((student) => (
              <div
                key={student.id}
                role="listitem"
                className="student-row group px-3 sm:px-4 py-3 grid grid-cols-12 items-center cursor-default select-text rounded-md"
              >
                {/* Roll Number */}
                <div className="col-span-2 sm:col-span-2 flex items-center">
                  <span className="font-mono text-xs sm:text-[13px] text-neutral-500 group-hover:text-black transition-colors duration-150">
                    {student.roll}
                  </span>
                </div>

                {/* Student Name */}
                <div className="col-span-5 sm:col-span-5 flex items-center pr-2">
                  <span className="text-xs sm:text-[14px] font-normal text-neutral-900 group-hover:text-black transition-colors duration-150 truncate">
                    {student.name}
                  </span>
                </div>

                {/* Gender */}
                <div className="col-span-2 sm:col-span-2 flex items-center">
                  <span className="text-xs sm:text-[13px] text-neutral-600 group-hover:text-neutral-900 transition-colors duration-150">
                    {student.gender}
                  </span>
                </div>

                {/* Enrollment Number */}
                <div className="col-span-3 sm:col-span-3 flex items-center justify-end">
                  <span className="font-mono text-[11px] sm:text-[13px] text-neutral-700 group-hover:text-black transition-colors duration-150">
                    {student.enrollment}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

      </main>
    </div>
  );
}
