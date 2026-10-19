import { useState, useMemo, useEffect } from 'react';
import { Icons } from './Icons';
import { AssignmentsView, StudentsListView, AttendanceView } from './TeacherViews';
import StudentListSectionView from './StudentListSectionView';
import { buildAcademicHierarchyTree } from '../../services/attendanceService';
import { announcements as sharedAnnouncements, addAnnouncement } from './mockData';
import StudyMaterialView from './StudyMaterialView';
import AnnouncementPage from './AnnouncementPage';

export const buildTree = buildAcademicHierarchyTree;

export default function AcademicSpacesView({
  userProfile,
  allocations = [],
  isLoadingAllocations = false,
  embedded = false,
  onNavigate,
  onOpenStudentList,
  onOpenAnnouncement,
  studyMaterialHandoff = null,
  onClearHandoff = null
}) {
  // Strictly rely on real allocations passed from backend
  const effectiveAllocations = Array.isArray(allocations) ? allocations : [];
  const tree = buildAcademicHierarchyTree(effectiveAllocations, userProfile?.institution || 'UEMK');
  const [selectedGroup, setSelectedGroup] = useState(null);

  useEffect(() => {
    if (studyMaterialHandoff?.department && studyMaterialHandoff?.year) {
      const inst = userProfile?.institution || 'UEMK';
      setSelectedGroup({
        name: "Study Material",
        isStudyMaterial: true,
        path: [inst, studyMaterialHandoff.department, studyMaterialHandoff.year],
        scope: "Common to all sections"
      });
    }
  }, [studyMaterialHandoff, userProfile?.institution]);

  const handleSelectGroup = (group) => {
    if (group?.isStudents && onOpenStudentList) {
      onOpenStudentList(group);
    } else if (group?.isAnnounce && onOpenAnnouncement) {
      onOpenAnnouncement(group);
    } else {
      setSelectedGroup(group);
    }
  };

  const [expandedPaths, setExpandedPaths] = useState(() => {
    if (embedded) {
      // By default in embedded canvas, expand the primary department so the hierarchy is immediately visible
      return new Set(['UEMK|CSE AI']);
    }
    return new Set();
  });
  const [activePath, setActivePath] = useState(() => (embedded ? ['UEMK', 'CSE AI'] : []));

  // Dynamic academic hierarchy path for minimal breadcrumb navigation
  const currentBreadcrumbPath = useMemo(() => {
    if (selectedGroup?.path) {
      return selectedGroup.path.filter(s => s !== 'UEMK' && s !== 'Institution');
    }
    const filteredActive = activePath.filter(s => s !== 'UEMK' && s !== 'Institution');
    if (filteredActive.length > 0) {
      return filteredActive;
    }
    let deepest = [];
    expandedPaths.forEach(p => {
      const parts = p.split('|').filter(s => s !== 'UEMK' && s !== 'Institution');
      if (parts.length > deepest.length) {
        deepest = parts;
      }
    });
    if (deepest.length > 0) return deepest;

    const firstInst = Object.keys(tree)[0];
    const firstDept = firstInst && Object.keys(tree[firstInst] || {})[0];
    return firstDept ? [firstDept] : [];
  }, [selectedGroup, activePath, expandedPaths, tree]);

  const handleBreadcrumbClick = (index) => {
    if (selectedGroup) setSelectedGroup(null);
    const targetSegments = currentBreadcrumbPath.slice(0, index + 1);
    const inst = Object.keys(tree)[0] || 'UEMK';
    const targetFullPath = [inst, ...targetSegments];
    const targetPathStr = targetFullPath.join('|');

    const newExpanded = new Set();
    expandedPaths.forEach(p => {
      if (p === targetPathStr || targetPathStr.startsWith(p + '|')) {
        newExpanded.add(p);
      }
    });
    newExpanded.add(targetPathStr);
    setExpandedPaths(newExpanded);
    setActivePath(targetFullPath);
  };

  const toggleExpand = (pathArr, isExpanded) => {
    const pathStr = pathArr.join('|');
    const newExpanded = new Set(expandedPaths);

    if (isExpanded) {
      // Collapse node and all descendants
      for (let key of Array.from(newExpanded)) {
        if (key === pathStr || key.startsWith(pathStr + '|')) {
          newExpanded.delete(key);
        }
      }
      const currentActiveStr = activePath.join('|');
      if (currentActiveStr.startsWith(pathStr)) {
        setActivePath(pathArr.slice(0, -1));
      }
    } else {
      // Expand node, but collapse siblings and their descendants
      const level = pathArr.length;
      const parentPrefix = pathArr.slice(0, -1).join('|');

      for (let key of Array.from(newExpanded)) {
        const keyParts = key.split('|');
        if (keyParts.length === level) {
          const keyParentPrefix = keyParts.slice(0, -1).join('|');
          if (level === 1 || keyParentPrefix === parentPrefix) {
            newExpanded.delete(key);
            for (let descKey of Array.from(newExpanded)) {
              if (descKey.startsWith(key + '|')) {
                newExpanded.delete(descKey);
              }
            }
          }
        }
      }
      newExpanded.add(pathStr);
      setActivePath(pathArr);
    }
    setExpandedPaths(newExpanded);
  };

  const handleNavigateBack = () => {
    if (selectedGroup) {
      setSelectedGroup(null);
    } else {
      if (activePath.length > 1) {
        const pathToCollapse = activePath.join('|');
        const newExpanded = new Set(expandedPaths);
        newExpanded.delete(pathToCollapse);
        setExpandedPaths(newExpanded);
        setActivePath(activePath.slice(0, -1));
      } else if (activePath.length === 1) {
        setActivePath([]);
      }
    }
  };

  const handleNavigateTo = (index) => {
    if (selectedGroup) setSelectedGroup(null);
    const targetPath = (selectedGroup ? [...selectedGroup.path, 'Official Group'] : activePath).slice(0, index + 1);

    const newExpanded = new Set(expandedPaths);
    const currentPath = selectedGroup ? selectedGroup.path : activePath;
    for (let i = index + 2; i <= currentPath.length; i++) {
      newExpanded.delete(currentPath.slice(0, i).join('|'));
    }
    setExpandedPaths(newExpanded);
    setActivePath(targetPath);
  };

  const currentPathForBreadcrumb = selectedGroup
    ? [...selectedGroup.path, selectedGroup.isAssignment ? 'Assignments' : selectedGroup.isStudyMaterial ? 'Study Material' : selectedGroup.isStudents ? 'Students' : selectedGroup.isAttendance ? 'Attendance' : 'Official Group']
    : activePath;

  if (selectedGroup) {
    if (selectedGroup.isStudents) {
      return (
        <div className="fixed inset-0 z-[9999] bg-[#F8F3E6] overflow-y-auto animate-fade-in">
          <StudentListSectionView
            group={selectedGroup}
            onBack={() => setSelectedGroup(null)}
            userProfile={userProfile}
            allocations={effectiveAllocations}
          />
        </div>
      );
    }

    if (selectedGroup.isAnnounce) {
      return (
        <div className="fixed inset-0 z-[9999] bg-[#F8F3E6] overflow-hidden animate-fade-in">
          <AnnouncementPage
            group={selectedGroup}
            onBack={() => setSelectedGroup(null)}
            userProfile={userProfile}
            allocations={effectiveAllocations}
          />
        </div>
      );
    }

    if (embedded) {
      return (
        <div className="h-full flex flex-col overflow-hidden animate-fade-in p-3 sm:p-4">
          <div className="flex-shrink-0 mb-3">
            <BreadcrumbNav
              activePath={currentPathForBreadcrumb}
              onNavigateBack={handleNavigateBack}
              onNavigateTo={handleNavigateTo}
              embedded={true}
            />
          </div>
          <div className="flex-1 overflow-y-auto pr-1 scrollbar-thin">
            {selectedGroup.isAssignment ? (
              <AssignmentsView group={selectedGroup} userProfile={userProfile} allocations={effectiveAllocations} />
            ) : selectedGroup.isStudyMaterial ? (
              <StudyMaterialView
                group={selectedGroup}
                userProfile={userProfile}
                embedded={true}
                allocations={effectiveAllocations}
                onNavigate={onNavigate}
                studyMaterialHandoff={studyMaterialHandoff}
                onClearHandoff={onClearHandoff}
              />
            ) : selectedGroup.isAttendance ? (
              <AttendanceView group={selectedGroup} userProfile={userProfile} allocations={effectiveAllocations} />
            ) : (
              <OfficialGroupView group={selectedGroup} onOpenAnnouncement={onOpenAnnouncement} embedded={true} />
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6 animate-fade-in relative z-10 pb-12">
        <BreadcrumbNav activePath={currentPathForBreadcrumb} onNavigateBack={handleNavigateBack} onNavigateTo={handleNavigateTo} />
        {selectedGroup.isAssignment ? (
          <AssignmentsView group={selectedGroup} userProfile={userProfile} allocations={effectiveAllocations} />
        ) : selectedGroup.isStudyMaterial ? (
          <StudyMaterialView
            group={selectedGroup}
            userProfile={userProfile}
            embedded={false}
            allocations={effectiveAllocations}
            onNavigate={onNavigate}
            studyMaterialHandoff={studyMaterialHandoff}
            onClearHandoff={onClearHandoff}
          />
        ) : selectedGroup.isAttendance ? (
          <AttendanceView group={selectedGroup} userProfile={userProfile} allocations={effectiveAllocations} />
        ) : (
          <OfficialGroupView group={selectedGroup} onOpenAnnouncement={onOpenAnnouncement} />
        )}
      </div>
    );
  }

  if (isLoadingAllocations) {
    if (embedded) {
      return (
        <div className="flex items-center justify-center h-full text-xs text-[#858174] font-normal">
          <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-[#171717] mr-2"></div>
          Loading academic spaces...
        </div>
      );
    }

    return (
      <div className="space-y-5 animate-hero-fade-up relative z-10 pb-20" style={{ animationDuration: '400ms' }}>
        <div className="flex items-center justify-between">
          <h2 className="text-[26px] font-extrabold text-[#171717] tracking-tight">My Academic Spaces</h2>
        </div>
        <div className="bg-white/80 rounded-[28px] border border-[#D8D1C3] p-12 text-center shadow-sm">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#171717] mb-3"></div>
          <p className="text-sm font-medium text-[#858174]">Loading your academic spaces...</p>
        </div>
      </div>
    );
  }

  if (!isLoadingAllocations && (!effectiveAllocations || effectiveAllocations.length === 0)) {
    if (embedded) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center p-6 text-[#858174] select-none">
          <div className="w-12 h-12 rounded-2xl bg-[#F5E5EE] text-[#171717] flex items-center justify-center mb-3 border border-[#D8D1C3]/60">
            <Icons.Hierarchy />
          </div>
          <p className="text-sm font-bold text-[#171717]">No Academic Spaces Assigned</p>
          <p className="text-xs text-[#858174] mt-1 max-w-xs">
            Contact your Director to assign your branches and sections.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-5 animate-hero-fade-up relative z-10 pb-20" style={{ animationDuration: '400ms' }}>
        <div className="flex items-center justify-between">
          <h2 className="text-[26px] font-extrabold text-[#171717] tracking-tight">My Academic Spaces</h2>
        </div>
        <div className="bg-white/80 rounded-[28px] border border-[#D8D1C3] p-12 text-center shadow-sm max-w-xl mx-auto">
          <div className="w-16 h-16 rounded-2xl bg-[#F5E5EE] text-[#171717] flex items-center justify-center mx-auto mb-4 shadow-sm">
            <Icons.Hierarchy />
          </div>
          <h3 className="text-xl font-bold text-[#171717] mb-2">No Academic Spaces Assigned</h3>
          <p className="text-sm font-medium text-[#858174] max-w-md mx-auto leading-relaxed">
            You do not currently have any class or department allocations. Please contact your Director to assign your academic spaces.
          </p>
        </div>
      </div>
    );
  }

  // Embedded mode for Dotted Canvas
  if (embedded) {
    return (
      <div className="w-full h-full flex flex-col p-4 sm:p-5 overflow-hidden animate-fade-in select-none">
        {/* Minimal Breadcrumb Navigation directly above the branching tree */}
        {currentBreadcrumbPath.length > 0 && (
          <div className="flex-shrink-0 flex items-center text-[11px] sm:text-xs font-normal text-[#858174] tracking-tight pb-3 select-none overflow-x-hidden whitespace-nowrap">
            {currentBreadcrumbPath.map((segment, idx) => {
              const isLast = idx === currentBreadcrumbPath.length - 1;
              return (
                <span key={idx} className="flex items-center">
                  {idx > 0 && (
                    <span className="text-[#D8D1C3] mx-2 font-light select-none">/</span>
                  )}
                  <span
                    onClick={() => !isLast && handleBreadcrumbClick(idx)}
                    className={`${isLast ? 'text-[#171717] font-normal cursor-default' : 'text-[#858174] font-normal hover:text-[#171717] cursor-pointer transition-colors'}`}
                  >
                    {segment}
                  </span>
                </span>
              );
            })}
          </div>
        )}

        {/* Refined branching tree shifted slightly downward to accommodate the breadcrumb */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden pr-2 scrollbar-thin pt-1">
          <div
            className="origin-top-left pb-4"
            style={{
              transform: 'scale(1.10)',
              transformOrigin: 'top left',
              width: '90.9%'
            }}
          >
            {Object.entries(tree).map(([inst, depts]) => (
              <div key={inst} className="space-y-3">
                {Object.entries(depts).map(([dept, years]) => {
                  const fullPath = [inst, dept];
                  const isExpanded = expandedPaths.has(fullPath.join('|'));
                  const anyExpanded = Object.keys(depts).some(d => expandedPaths.has([inst, d].join('|')));
                  const isHidden = anyExpanded && !isExpanded;

                  return (
                    <div
                      key={dept}
                      className={`grid transition-[grid-template-rows,opacity,margin,padding] duration-200 ease-in-out ${isHidden ? 'grid-rows-[0fr] opacity-0 m-0 p-0' : 'grid-rows-[1fr] opacity-100 mb-2'}`}
                    >
                      <div className="overflow-hidden">
                        <DepartmentNode
                          name={dept}
                          years={years}
                          path={[inst]}
                          onSelectGroup={handleSelectGroup}
                          expandedPaths={expandedPaths}
                          toggleExpand={toggleExpand}
                          embedded={true}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Standard non-embedded mode (preserved for the full Academic Spaces tab)
  return (
    <div className="space-y-5 animate-hero-fade-up relative z-10 pb-20" style={{ animationDuration: '400ms' }}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-[26px] font-extrabold text-[#171717] tracking-tight">My Academic Spaces</h2>
          <p className="text-xs font-semibold text-[#858174] mt-0.5">Assigned departments, years, and classroom sections</p>
        </div>
        <span className="text-xs font-bold text-[#171717] bg-white border border-[#D8D1C3] px-3.5 py-1.5 rounded-full shadow-sm w-fit">
          Faculty Roster
        </span>
      </div>

      {currentPathForBreadcrumb.length > 0 && (
        <BreadcrumbNav activePath={currentPathForBreadcrumb} onNavigateBack={handleNavigateBack} onNavigateTo={handleNavigateTo} />
      )}

      {/* Clean Unboxed Hierarchy Tree matching Reference styling */}
      <div className="overflow-x-auto transition-all duration-500 mt-2">
        <div className="min-w-[500px]">
          {Object.entries(tree).map(([inst, depts]) => (
            <InstitutionNode
              key={inst}
              name={inst}
              departments={depts}
              onSelectGroup={handleSelectGroup}
              expandedPaths={expandedPaths}
              toggleExpand={toggleExpand}
              setActivePath={setActivePath}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function BreadcrumbNav({ activePath, onNavigateBack, onNavigateTo, embedded = false }) {
  if (activePath.length === 0) return null;

  return (
    <div className={`flex items-center gap-1.5 ${embedded ? 'bg-white/70 backdrop-blur-sm px-2.5 py-1 rounded-lg border border-[#D8D1C3]/60 w-fit text-xs font-normal' : 'text-sm font-bold bg-white/80 backdrop-blur-sm px-4 py-2 rounded-full border border-[#D8D1C3] shadow-sm w-fit animate-fade-in'}`}>
      <button
        type="button"
        onClick={onNavigateBack}
        className="flex items-center gap-1 text-[#858174] hover:text-[#171717] transition-colors pr-2 border-r border-[#D8D1C3]/60 cursor-pointer"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
        <span className="text-[11px] font-normal">Back</span>
      </button>
      <div className="flex items-center gap-1.5 pl-1 overflow-x-auto scrollbar-hide max-w-full">
        {activePath.map((segment, index) => {
          // In embedded mode, omit the root institution name if present
          if (embedded && index === 0 && (segment === 'UEMK' || segment === 'Institution')) return null;
          const isLast = index === activePath.length - 1;
          return (
            <div key={index} className="flex items-center gap-1.5 whitespace-nowrap text-[11px]">
              <button
                type="button"
                onClick={() => !isLast && onNavigateTo(index)}
                className={`transition-colors cursor-pointer ${isLast ? 'text-[#171717] font-medium cursor-default' : 'text-[#858174] hover:text-[#171717] font-normal'}`}
              >
                {segment}
              </button>
              {!isLast && <span className="text-[#D8D1C3]">/</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InstitutionNode({ name, departments, onSelectGroup, expandedPaths, toggleExpand, setActivePath }) {
  return (
    <div className="space-y-4">
      <div
        className="flex items-center gap-3 cursor-pointer group w-fit"
        onClick={() => setActivePath([name])}
      >
        <div className="w-10 h-10 rounded-2xl bg-[#171717] text-white flex items-center justify-center font-black text-lg shadow-sm group-hover:scale-105 transition-transform">
          {name.charAt(0)}
        </div>
        <h3 className="text-xl font-extrabold text-[#171717] tracking-tight group-hover:text-[#858174] transition-colors">{name}</h3>
      </div>

      <div className="ml-5 pl-6 border-l-2 border-[#D8D1C3] mt-3 pt-1">
        {Object.entries(departments).map(([dept, years]) => {
          const fullPath = [name, dept];
          const isExpanded = expandedPaths.has(fullPath.join('|'));
          const anyExpanded = Object.keys(departments).some(d => expandedPaths.has([name, d].join('|')));
          const isHidden = anyExpanded && !isExpanded;

          return (
            <div key={dept} className={`grid transition-[grid-template-rows,opacity,margin,padding] duration-200 ease-in-out ${isHidden ? 'grid-rows-[0fr] opacity-0 m-0 p-0' : 'grid-rows-[1fr] opacity-100 mb-6'}`}>
              <div className="overflow-hidden">
                <div className={isHidden ? "" : "pb-1"}>
                  <DepartmentNode
                    name={dept}
                    years={years}
                    path={[name]}
                    onSelectGroup={onSelectGroup}
                    expandedPaths={expandedPaths}
                    toggleExpand={toggleExpand}
                    embedded={false}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DepartmentNode({ name, years, path, onSelectGroup, expandedPaths, toggleExpand, embedded = false }) {
  const fullPath = [...path, name];
  const expanded = expandedPaths.has(fullPath.join('|'));

  if (embedded) {
    return (
      <div className="space-y-1.5">
        <div
          className="flex items-center gap-1.5 group cursor-pointer w-fit py-1 px-1.5 -ml-1 rounded-md hover:bg-[#171717]/[0.04] transition-colors select-none"
          onClick={() => toggleExpand(fullPath, expanded)}
        >
          <span className="w-3.5 h-3.5 flex items-center justify-center text-[#858174] group-hover:text-[#171717] transition-colors">
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-transform duration-200 ${expanded ? 'rotate-90' : 'rotate-0'}`}
            >
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </span>
          <span className="text-[13px] font-normal text-[#171717] tracking-tight group-hover:text-[#858174] transition-colors">
            {name}
          </span>
        </div>

        <div className={`grid transition-[grid-template-rows,opacity] duration-200 ease-in-out ${expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
          <div className="overflow-hidden">
            <div className="ml-2 pl-3.5 border-l border-[#D8D1C3]/60 space-y-1.5 pt-0.5 pb-1">
              {Object.entries(years).map(([year, sections]) => {
                const p = [...path, name, year];
                const isExpanded = expandedPaths.has(p.join('|'));
                const anyExpanded = Object.keys(years).some(y => expandedPaths.has([...path, name, y].join('|')));
                const isHidden = anyExpanded && !isExpanded;
                return (
                  <div
                    key={year}
                    className={`grid transition-[grid-template-rows,opacity,margin,padding] duration-200 ease-in-out ${isHidden ? 'grid-rows-[0fr] opacity-0 m-0 p-0' : 'grid-rows-[1fr] opacity-100'}`}
                  >
                    <div className="overflow-hidden">
                      <YearNode
                        name={year}
                        sections={sections}
                        path={fullPath}
                        onSelectGroup={onSelectGroup}
                        expandedPaths={expandedPaths}
                        toggleExpand={toggleExpand}
                        embedded={true}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Non-embedded mode
  return (
    <div className="space-y-3 relative before:absolute before:left-[-26px] before:top-[12px] before:w-[20px] before:h-[2px] before:bg-[#D8D1C3]">
      <div className="flex items-center gap-2 group cursor-pointer w-fit" onClick={() => toggleExpand(fullPath, expanded)}>
        <button className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-[#F5E5EE] text-[#858174] transition-colors">
          {expanded ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
          )}
        </button>
        <h4 className="text-lg font-bold text-[#171717] group-hover:text-[#858174] transition-colors">{name}</h4>
      </div>

      <div className={`grid transition-[grid-template-rows,opacity] duration-200 ease-in-out ${expanded ? 'grid-rows-[1fr] opacity-100 mt-4' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <div className="ml-3 pl-6 border-l-2 border-[#D8D1C3] pb-2 pt-1">
            {Object.entries(years).map(([year, sections]) => {
              const p = [...path, name, year];
              const isExpanded = expandedPaths.has(p.join('|'));
              const anyExpanded = Object.keys(years).some(y => expandedPaths.has([...path, name, y].join('|')));
              const isHidden = anyExpanded && !isExpanded;
              return (
                <div key={year} className={`grid transition-[grid-template-rows,opacity,margin,padding] duration-200 ease-in-out ${isHidden ? 'grid-rows-[0fr] opacity-0 m-0 p-0' : 'grid-rows-[1fr] opacity-100 mb-5'}`}>
                  <div className="overflow-hidden">
                    <div className={isHidden ? "" : "pb-1"}>
                      <YearNode
                        name={year}
                        sections={sections}
                        path={fullPath}
                        onSelectGroup={onSelectGroup}
                        expandedPaths={expandedPaths}
                        toggleExpand={toggleExpand}
                        embedded={false}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function YearNode({ name, sections, path, onSelectGroup, expandedPaths, toggleExpand, embedded = false }) {
  const fullPath = [...path, name];
  const expanded = expandedPaths.has(fullPath.join('|'));

  if (embedded) {
    return (
      <div className="space-y-1.5 relative before:absolute before:left-[-15px] before:top-[12px] before:w-[11px] before:h-px before:bg-[#D8D1C3]/60">
        <div
          className="flex items-center gap-1.5 group cursor-pointer w-fit py-0.5 px-1.5 -ml-1 rounded-md hover:bg-[#171717]/[0.04] transition-colors select-none"
          onClick={() => toggleExpand(fullPath, expanded)}
        >
          <span className="w-3.5 h-3.5 flex items-center justify-center text-[#858174] group-hover:text-[#171717] transition-colors">
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-transform duration-200 ${expanded ? 'rotate-90' : 'rotate-0'}`}
            >
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </span>
          <span className="text-[13px] font-normal text-[#171717] group-hover:text-[#858174] transition-colors">
            {name}
          </span>
        </div>

        <div className={`grid transition-[grid-template-rows,opacity] duration-200 ease-in-out ${expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
          <div className="overflow-hidden">
            <div className="ml-2 pl-3.5 border-l border-[#D8D1C3]/60 space-y-1.5 pt-0.5 pb-1">
              {(() => {
                const anyExpanded = Object.keys(sections).some(s => expandedPaths.has([...path, name, s].join('|')));
                return (
                  <div className={`grid transition-[grid-template-rows,opacity,margin,padding] duration-200 ease-in-out ${anyExpanded ? 'grid-rows-[0fr] opacity-0 m-0 p-0' : 'grid-rows-[1fr] opacity-100 mb-1'}`}>
                    <div className="overflow-hidden">
                      <div className="flex items-center gap-1.5 relative before:absolute before:left-[-15px] before:top-[11px] before:w-[11px] before:h-px before:bg-[#D8D1C3]/60">
                        <button
                          type="button"
                          className="text-[11px] font-normal px-2.5 py-0.5 rounded-full bg-[#F3D75E]/20 text-[#5c4813] hover:bg-[#F3D75E]/35 transition-colors cursor-pointer active:scale-95"
                          onClick={(e) => { e.stopPropagation(); onSelectGroup({ name: "Assignments", isAssignment: true, path: fullPath, scope: "Common to all sections" }); }}
                        >
                          Assignments
                        </button>
                        <button
                          type="button"
                          className="text-[11px] font-normal px-2.5 py-0.5 rounded-full bg-[#C4B5FD]/25 text-[#4c1d95] hover:bg-[#C4B5FD]/45 transition-colors cursor-pointer active:scale-95"
                          onClick={(e) => { e.stopPropagation(); onSelectGroup({ name: "Study Material", isStudyMaterial: true, path: fullPath, scope: "Common to all sections" }); }}
                        >
                          Study Material
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {Object.entries(sections).map(([sec, subjects]) => {
                const p = [...path, name, sec];
                const isExpanded = expandedPaths.has(p.join('|'));
                const anyExpanded = Object.keys(sections).some(s => expandedPaths.has([...path, name, s].join('|')));
                const isHidden = anyExpanded && !isExpanded;
                return (
                  <div
                    key={sec}
                    className={`grid transition-[grid-template-rows,opacity,margin,padding] duration-200 ease-in-out ${isHidden ? 'grid-rows-[0fr] opacity-0 m-0 p-0' : 'grid-rows-[1fr] opacity-100'}`}
                  >
                    <div className="overflow-hidden">
                      <SectionNode
                        name={sec}
                        subjects={subjects}
                        path={fullPath}
                        onSelectGroup={onSelectGroup}
                        expandedPaths={expandedPaths}
                        toggleExpand={toggleExpand}
                        embedded={true}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Non-embedded mode
  return (
    <div className="space-y-3 relative before:absolute before:left-[-26px] before:top-[10px] before:w-[20px] before:h-[2px] before:bg-[#D8D1C3]">
      <div className="flex items-center gap-2 group cursor-pointer w-fit" onClick={() => toggleExpand(fullPath, expanded)}>
        <button className="w-5 h-5 flex items-center justify-center rounded-lg hover:bg-[#F5E5EE] text-[#858174] transition-colors">
          {expanded ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
          )}
        </button>
        <span className="text-[15px] font-bold text-[#171717] group-hover:text-[#858174] transition-colors">{name}</span>
      </div>

      <div className={`grid transition-[grid-template-rows,opacity] duration-200 ease-in-out ${expanded ? 'grid-rows-[1fr] opacity-100 mt-3' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <div className="ml-2.5 pl-6 border-l-2 border-[#D8D1C3] pb-2 pt-1">
            {(() => {
              const anyExpanded = Object.keys(sections).some(s => expandedPaths.has([...path, name, s].join('|')));
              return (
                <div className={`grid transition-[grid-template-rows,opacity,margin,padding] duration-200 ease-in-out ${anyExpanded ? 'grid-rows-[0fr] opacity-0 m-0 p-0' : 'grid-rows-[1fr] opacity-100 mb-4 pt-2'}`}>
                  <div className="overflow-hidden">
                    <div className="flex items-start gap-2.5 relative before:absolute before:left-[-26px] before:top-[10px] before:w-[20px] before:h-[2px] before:bg-[#D8D1C3]">
                      <button
                        className="text-[10px] uppercase tracking-wider font-extrabold px-2.5 py-0.5 rounded-full bg-[#F3D75E]/30 text-[#171717] border border-[#F3D75E] hover:bg-[#F3D75E] transition-all cursor-pointer shadow-sm active:scale-95"
                        onClick={(e) => { e.stopPropagation(); onSelectGroup({ name: "Assignments", isAssignment: true, path: fullPath, scope: "Common to all sections" }); }}
                      >
                        ASSIGNMENTS
                      </button>
                      <button
                        className="text-[10px] uppercase tracking-wider font-extrabold px-2.5 py-0.5 rounded-full bg-[#C4B5FD]/30 text-[#171717] border border-[#C4B5FD] hover:bg-[#C4B5FD] transition-all cursor-pointer shadow-sm active:scale-95"
                        onClick={(e) => { e.stopPropagation(); onSelectGroup({ name: "Study Material", isStudyMaterial: true, path: fullPath, scope: "Common to all sections" }); }}
                      >
                        STUDY MATERIAL
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

            {Object.entries(sections).map(([sec, subjects]) => {
              const p = [...path, name, sec];
              const isExpanded = expandedPaths.has(p.join('|'));
              const anyExpanded = Object.keys(sections).some(s => expandedPaths.has([...path, name, s].join('|')));
              const isHidden = anyExpanded && !isExpanded;
              return (
                <div key={sec} className={`grid transition-[grid-template-rows,opacity,margin,padding] duration-200 ease-in-out ${isHidden ? 'grid-rows-[0fr] opacity-0 m-0 p-0' : 'grid-rows-[1fr] opacity-100 mb-4'}`}>
                  <div className="overflow-hidden">
                    <div className={isHidden ? "" : "pb-1"}>
                      <SectionNode
                        name={sec}
                        subjects={subjects}
                        path={fullPath}
                        onSelectGroup={onSelectGroup}
                        expandedPaths={expandedPaths}
                        toggleExpand={toggleExpand}
                        embedded={false}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionNode({ name, subjects, path, onSelectGroup, expandedPaths, toggleExpand, embedded = false }) {
  const fullPath = [...path, name];
  const expanded = expandedPaths.has(fullPath.join('|'));

  if (embedded) {
    return (
      <div className="space-y-1 relative before:absolute before:left-[-15px] before:top-[12px] before:w-[11px] before:h-px before:bg-[#D8D1C3]/60">
        <div
          className="flex items-center gap-1.5 group cursor-pointer w-fit py-0.5 px-1.5 -ml-1 rounded-md hover:bg-[#171717]/[0.04] transition-colors select-none"
          onClick={() => toggleExpand(fullPath, expanded)}
        >
          <span className="w-3.5 h-3.5 flex items-center justify-center text-[#858174] group-hover:text-[#171717] transition-colors">
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-transform duration-200 ${expanded ? 'rotate-90' : 'rotate-0'}`}
            >
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </span>
          <span className="text-[13px] font-normal text-[#171717] group-hover:text-[#858174] transition-colors">
            {name}
          </span>
        </div>

        <div className={`grid transition-[grid-template-rows,opacity] duration-200 ease-in-out ${expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
          <div className="overflow-hidden">
            <div className="ml-2 pl-3.5 border-l border-[#D8D1C3]/60 pt-1 pb-1 flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onSelectGroup({ name: "Students", isStudents: true, path: fullPath, scope: name + " only" }); }}
                className="text-[11px] font-normal px-2.5 py-0.5 rounded-full bg-[#B7C9EA]/25 text-[#1b2b48] hover:bg-[#B7C9EA]/45 transition-colors cursor-pointer active:scale-95"
              >
                View
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onSelectGroup({ name: "Official Group", isAnnounce: true, permissions: ['Announce'], path: fullPath }); }}
                className="text-[11px] font-normal px-2.5 py-0.5 rounded-full bg-[#EFA9D1]/25 text-[#5e193c] hover:bg-[#EFA9D1]/45 transition-colors cursor-pointer active:scale-95"
              >
                Announce
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onSelectGroup({ name: "Assignments", isAssignment: true, path: fullPath, scope: name + " only" }); }}
                className="text-[11px] font-normal px-2.5 py-0.5 rounded-full bg-[#F3D75E]/25 text-[#5c4813] hover:bg-[#F3D75E]/45 transition-colors cursor-pointer active:scale-95"
              >
                Assignments
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onSelectGroup({ name: "Study Material", isStudyMaterial: true, path: fullPath, scope: name + " only" }); }}
                className="text-[11px] font-normal px-2.5 py-0.5 rounded-full bg-[#C4B5FD]/25 text-[#4c1d95] hover:bg-[#C4B5FD]/45 transition-colors cursor-pointer active:scale-95"
              >
                Study Material
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onSelectGroup({ name: "Attendance", isAttendance: true, path: fullPath, scope: name + " only" }); }}
                className="text-[11px] font-normal px-2.5 py-0.5 rounded-full bg-[#A9BD78]/25 text-[#2e4016] hover:bg-[#A9BD78]/45 transition-colors cursor-pointer active:scale-95"
              >
                Attendance
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Non-embedded mode
  return (
    <div className="space-y-3 relative before:absolute before:left-[-26px] before:top-[10px] before:w-[20px] before:h-[2px] before:bg-[#D8D1C3]">
      <div className="flex items-center gap-2 group cursor-pointer w-fit" onClick={() => toggleExpand(fullPath, expanded)}>
        <button className="w-5 h-5 flex items-center justify-center rounded-lg hover:bg-[#F5E5EE] text-[#858174] transition-colors">
          {expanded ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
          )}
        </button>
        <span className="text-sm font-bold text-[#171717] group-hover:text-[#858174] transition-colors">{name}</span>
      </div>

      <div className={`grid transition-[grid-template-rows,opacity] duration-200 ease-in-out ${expanded ? 'grid-rows-[1fr] opacity-100 mt-2' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <div className="ml-2.5 pl-6 border-l-2 border-[#D8D1C3] pt-2 pb-2 flex flex-wrap gap-2 sm:gap-2.5">
            <button
              onClick={(e) => { e.stopPropagation(); onSelectGroup({ name: "Students", isStudents: true, path: fullPath, scope: name + " only" }); }}
              className="text-[10px] uppercase tracking-wider font-extrabold px-3 py-1 rounded-full bg-[#B7C9EA]/25 text-[#171717] border border-[#B7C9EA] hover:bg-[#B7C9EA] transition-all cursor-pointer shadow-sm active:scale-95"
            >
              VIEW
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onSelectGroup({ name: "Official Group", isAnnounce: true, permissions: ['Announce'], path: fullPath }); }}
              className="text-[10px] uppercase tracking-wider font-extrabold px-3 py-1 rounded-full bg-[#EFA9D1]/25 text-[#171717] border border-[#EFA9D1] hover:bg-[#EFA9D1] transition-all cursor-pointer shadow-sm active:scale-95"
            >
              ANNOUNCE
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onSelectGroup({ name: "Assignments", isAssignment: true, path: fullPath, scope: name + " only" }); }}
              className="text-[10px] uppercase tracking-wider font-extrabold px-3 py-1 rounded-full bg-[#F3D75E]/25 text-[#171717] border border-[#F3D75E] hover:bg-[#F3D75E] transition-all cursor-pointer shadow-sm active:scale-95"
            >
              ASSIGNMENTS
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onSelectGroup({ name: "Study Material", isStudyMaterial: true, path: fullPath, scope: name + " only" }); }}
              className="text-[10px] uppercase tracking-wider font-extrabold px-3 py-1 rounded-full bg-[#C4B5FD]/25 text-[#171717] border border-[#C4B5FD] hover:bg-[#C4B5FD] transition-all cursor-pointer shadow-sm active:scale-95"
            >
              STUDY MATERIAL
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onSelectGroup({ name: "Attendance", isAttendance: true, path: fullPath, scope: name + " only" }); }}
              className="text-[10px] uppercase tracking-wider font-extrabold px-3 py-1 rounded-full bg-[#A9BD78]/25 text-[#171717] border border-[#A9BD78] hover:bg-[#A9BD78] transition-all cursor-pointer shadow-sm active:scale-95"
            >
              ATTENDANCE
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function OfficialGroupView({ group, onOpenAnnouncement, embedded = false }) {
  const canAnnounce = group.permissions.includes('Announce') || group.permissions.includes('Manage');
  const scopePath = group.path.join('/');

  const [announcements, setAnnouncements] = useState(() =>
    sharedAnnouncements.filter(a => a.scopePath === scopePath)
  );

  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');

  const handlePublish = () => {
    if (!newTitle.trim() || !newContent.trim()) return;

    const newAnn = {
      id: Date.now(),
      title: newTitle,
      content: newContent,
      author: 'Dr. Sarah Jenkins',
      time: 'Just now',
      scopePath: scopePath
    };

    addAnnouncement(newAnn);
    setAnnouncements([newAnn, ...announcements]);
    setIsCreating(false);
    setNewTitle('');
    setNewContent('');
  };

  if (embedded) {
    return (
      <div className="space-y-3 animate-fade-in text-xs">
        <div className="flex items-center justify-between pb-2 border-b border-[#D8D1C3]/50">
          <div>
            <h4 className="text-sm font-normal text-[#171717]">{group.path.slice(1).join(' • ') || 'Official Group Notices'}</h4>
            <div className="flex gap-1 mt-0.5">
              {group.permissions.map(p => (
                <span key={p} className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-white/70 border border-[#D8D1C3]/60 text-[#858174]">{p}</span>
              ))}
            </div>
          </div>
          {canAnnounce && !isCreating && (
            <button
              onClick={() => setIsCreating(true)}
              className="flex items-center gap-1.5 bg-[#171717] text-white px-3 py-1 rounded-full hover:bg-[#2b2b2b] transition-all text-[11px] font-normal cursor-pointer active:scale-95"
            >
              <Icons.Plus /> Post notice
            </button>
          )}
        </div>

        {/* Create Announcement Form */}
        {isCreating && (
          <div className="bg-[#F8F3E6]/80 border border-[#D8D1C3] rounded-xl p-3 animate-fade-in space-y-2">
            <h5 className="text-xs font-medium text-[#171717]">New Notice</h5>
            <input
              type="text"
              placeholder="Notice Title"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              className="w-full px-3 py-1.5 bg-white border border-[#D8D1C3] rounded-lg focus:outline-none focus:border-[#171717] text-xs font-normal text-[#171717]"
            />
            <textarea
              placeholder="Write notice message..."
              rows="3"
              value={newContent}
              onChange={e => setNewContent(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-[#D8D1C3] rounded-lg focus:outline-none focus:border-[#171717] text-xs font-normal text-[#171717] resize-none"
            ></textarea>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsCreating(false)}
                className="px-3 py-1 rounded-full text-[#858174] font-normal hover:bg-[#F5E5EE] text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handlePublish}
                className="px-3 py-1 rounded-full bg-[#171717] text-white font-normal hover:bg-[#2b2b2b] text-xs cursor-pointer"
              >
                Publish
              </button>
            </div>
          </div>
        )}

        {/* Notices list */}
        <div className="space-y-2">
          {announcements.map(ann => (
            <div
              key={ann.id}
              onClick={() => {
                const grp = {
                  ...group,
                  isAnnounce: true,
                  selectedAnnouncement: {
                    id: String(ann.id),
                    senderName: ann.author || 'Dr. Sarah Jenkins',
                    senderRole: 'Faculty',
                    senderAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
                    timestamp: ann.time || 'Today',
                    subject: ann.title,
                    message: ann.content,
                    category: 'Academic',
                    status: 'Important',
                    isSaved: false
                  }
                };
                if (onOpenAnnouncement) onOpenAnnouncement(grp);
              }}
              className="p-3 rounded-xl border border-[#D8D1C3]/70 bg-white/60 hover:bg-white transition-all cursor-pointer"
            >
              <h5 className="font-medium text-[#171717] text-xs">{ann.title}</h5>
              <p className="text-[#858174] mt-1 text-[11px] font-normal leading-relaxed">{ann.content}</p>
              <div className="flex items-center gap-2 mt-2 text-[10px] text-[#858174]">
                <span className="text-[#171717] font-normal">{ann.author}</span>
                <span>•</span>
                <span>{ann.time}</span>
              </div>
            </div>
          ))}
          {announcements.length === 0 && !isCreating && (
            <div className="text-center py-6 text-xs text-[#858174]">
              No notices published for this section.
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in relative z-10 pb-10">
      <div className="flex items-center gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-[#171717] tracking-tight">Official Group</h2>
          <p className="text-xs font-semibold text-[#858174] mt-0.5">{group.path.slice(1).join(' • ') || 'Section Announcements'}</p>
        </div>
      </div>

      <div className="bg-white/80 backdrop-blur-sm rounded-[28px] border border-[#D8D1C3] shadow-sm overflow-hidden">
        {/* Banner */}
        <div className="bg-[#F5E5EE]/60 border-b border-[#D8D1C3] p-6 sm:p-7 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-[#EFA9D1] text-[#171717] flex items-center justify-center shadow-sm">
              <Icons.Announcements />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-[#171717]">Section-wide notices & discussions</h3>
              <div className="flex gap-1.5 mt-1">
                {group.permissions.map(p => (
                  <span key={p} className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-white border border-[#D8D1C3] text-[#858174]">{p}</span>
                ))}
              </div>
            </div>
          </div>
          {canAnnounce && !isCreating && (
            <button
              onClick={() => setIsCreating(true)}
              className="flex items-center gap-2 bg-[#171717] text-white px-5 py-2.5 rounded-full hover:bg-[#2b2b2b] transition-all shadow-sm font-bold text-xs cursor-pointer active:scale-95"
            >
              <Icons.Plus /> Post Announcement
            </button>
          )}
        </div>

        <div className="p-6 sm:p-7 space-y-6">
          {/* Create Announcement Form */}
          {isCreating && (
            <div className="bg-[#F8F3E6] border border-[#D8D1C3] rounded-2xl p-5 mb-8 animate-fade-in">
              <h4 className="text-sm font-extrabold text-[#171717] mb-3">New Announcement</h4>
              <input
                type="text"
                placeholder="Announcement Title"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                className="w-full mb-3 px-4 py-2.5 bg-white border border-[#D8D1C3] rounded-xl focus:outline-none focus:border-[#171717] text-xs font-semibold text-[#171717] transition-all"
              />
              <textarea
                placeholder="Write your message here..."
                rows="4"
                value={newContent}
                onChange={e => setNewContent(e.target.value)}
                className="w-full mb-4 px-4 py-3 bg-white border border-[#D8D1C3] rounded-xl focus:outline-none focus:border-[#171717] text-xs font-medium text-[#171717] transition-all resize-none"
              ></textarea>
              <div className="flex justify-end gap-2.5">
                <button
                  onClick={() => setIsCreating(false)}
                  className="px-4 py-2 rounded-full text-[#858174] font-bold hover:bg-[#F5E5EE] transition-colors text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePublish}
                  className="px-5 py-2 rounded-full bg-[#171717] text-white font-bold hover:bg-[#2b2b2b] shadow-sm transition-all text-xs cursor-pointer active:scale-95"
                >
                  Publish
                </button>
              </div>
            </div>
          )}

          {/* Announcements List */}
          <div className="space-y-3.5">
            {announcements.map(ann => (
              <div
                key={ann.id}
                onClick={() => {
                  const grp = {
                    ...group,
                    isAnnounce: true,
                    selectedAnnouncement: {
                      id: String(ann.id),
                      senderName: ann.author || 'Dr. Sarah Jenkins',
                      senderRole: 'Faculty',
                      senderAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
                      timestamp: ann.time || 'Today',
                      subject: ann.title,
                      message: ann.content,
                      category: 'Academic',
                      status: 'Important',
                      isSaved: false
                    }
                  };
                  if (onOpenAnnouncement) onOpenAnnouncement(grp);
                }}
                className="p-5 rounded-2xl border border-[#D8D1C3]/80 hover:border-[#171717]/40 hover:shadow-sm transition-all bg-white group cursor-pointer"
              >
                <h4 className="font-extrabold text-[#171717] text-base">{ann.title}</h4>
                <p className="text-[#858174] mt-1.5 mb-3 text-xs font-medium leading-relaxed">{ann.content}</p>
                <div className="flex items-center gap-2 text-[11px] font-bold text-[#858174]">
                  <span className="text-[#171717] bg-[#F5E5EE] px-2.5 py-0.5 rounded-full">{ann.author}</span>
                  <span>•</span>
                  <span>{ann.time}</span>
                </div>
              </div>
            ))}
            {announcements.length === 0 && !isCreating && (
              <div className="text-center py-10">
                <p className="text-[#858174] font-medium text-xs">No announcements yet for this scope.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
