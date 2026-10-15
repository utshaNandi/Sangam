import { useState, useMemo } from 'react';
import { Icons } from './Icons';
import { AssignmentsView, StudentsListView, AttendanceView } from './TeacherViews';
import { buildAcademicHierarchyTree } from '../../services/attendanceService';
import { announcements as sharedAnnouncements, addAnnouncement, teacherAllocations, studyMaterials as sharedStudyMaterials, addStudyMaterial } from './mockData';

export const buildTree = buildAcademicHierarchyTree;

export default function AcademicSpacesView({ userProfile, allocations = [], isLoadingAllocations = false, embedded = false, onNavigate }) {
  // Use allocations or fallback to teacherAllocations if empty
  const effectiveAllocations = (Array.isArray(allocations) && allocations.length > 0)
    ? allocations
    : teacherAllocations;
  const tree = buildAcademicHierarchyTree(effectiveAllocations, userProfile?.institution || 'UEMK');
  const [selectedGroup, setSelectedGroup] = useState(null);
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
              <StudyMaterialView group={selectedGroup} userProfile={userProfile} embedded={true} />
            ) : selectedGroup.isStudents ? (
              <StudentsListView group={selectedGroup} userProfile={userProfile} allocations={effectiveAllocations} />
            ) : selectedGroup.isAttendance ? (
              <AttendanceView group={selectedGroup} userProfile={userProfile} allocations={effectiveAllocations} />
            ) : (
              <OfficialGroupView group={selectedGroup} embedded={true} />
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
          <StudyMaterialView group={selectedGroup} userProfile={userProfile} embedded={false} />
        ) : selectedGroup.isStudents ? (
          <StudentsListView group={selectedGroup} userProfile={userProfile} allocations={effectiveAllocations} />
        ) : selectedGroup.isAttendance ? (
          <AttendanceView group={selectedGroup} userProfile={userProfile} allocations={effectiveAllocations} />
        ) : (
          <OfficialGroupView group={selectedGroup} />
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
        <div className="flex items-center justify-center h-full text-center p-6 text-[#858174]">
          <p className="text-xs font-normal">No academic spaces assigned</p>
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
                          onSelectGroup={setSelectedGroup}
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
              onSelectGroup={setSelectedGroup}
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
                onClick={(e) => { e.stopPropagation(); onSelectGroup({ name: "Official Group", permissions: ['Announce'], path: fullPath }); }}
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
              onClick={(e) => { e.stopPropagation(); onSelectGroup({ name: "Official Group", permissions: ['Announce'], path: fullPath }); }}
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

function OfficialGroupView({ group, embedded = false }) {
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
            <div key={ann.id} className="p-3 rounded-xl border border-[#D8D1C3]/70 bg-white/60 hover:bg-white transition-all">
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
              <div key={ann.id} className="p-5 rounded-2xl border border-[#D8D1C3]/80 hover:border-[#171717]/40 hover:shadow-sm transition-all bg-white group">
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

function StudyMaterialView({ group, userProfile, embedded = false }) {
  const scopePath = group.path.join('/');
  const isYearWide = group.scope?.includes('Common') || group.path.length === 3;
  const scopeLabel = isYearWide 
    ? `${group.path.slice(1).join(' • ')} (Shared Across Year)` 
    : `${group.path.slice(1).join(' • ')} (Section Specific)`;

  const [materials, setMaterials] = useState(() => {
    return sharedStudyMaterials.filter(m => {
      if (m.scopePath === scopePath) return true;
      if (!isYearWide && m.scopePath === group.path.slice(0, 3).join('/')) return true;
      return false;
    });
  });

  const [activeCategory, setActiveCategory] = useState('All');
  const [isUploading, setIsUploading] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('Lecture Notes');
  const [newDescription, setNewDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleUpload = (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const fileExt = selectedFile ? selectedFile.name.split('.').pop().toUpperCase() : 'PDF';
    const fileSizeStr = selectedFile 
      ? (selectedFile.size > 1024 * 1024 ? (selectedFile.size / (1024 * 1024)).toFixed(1) + ' MB' : Math.round(selectedFile.size / 1024) + ' KB')
      : '1.4 MB';

    const newMaterial = {
      id: `mat-${Date.now()}`,
      title: newTitle.trim(),
      description: newDescription.trim() || 'Uploaded reference notes and course materials for students.',
      category: newCategory,
      fileType: fileExt,
      fileSize: fileSizeStr,
      uploadedAt: 'Just now',
      author: userProfile?.name || 'Dr. Sarah Jenkins',
      scopePath: scopePath
    };

    addStudyMaterial(newMaterial);
    setMaterials([newMaterial, ...materials]);
    setIsUploading(false);
    setNewTitle('');
    setNewDescription('');
    setSelectedFile(null);
  };

  const handleDelete = (id) => {
    setMaterials(materials.filter(m => m.id !== id));
  };

  const filteredMaterials = activeCategory === 'All'
    ? materials
    : materials.filter(m => m.category === activeCategory);

  const categories = ['All', 'Lecture Notes', 'Lab Manual', 'Question Bank', 'Problem Set'];

  if (embedded) {
    return (
      <div className="space-y-3 animate-fade-in text-xs">
        {/* Header Row */}
        <div className="flex items-center justify-between pb-2 border-b border-[#D8D1C3]/50">
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-normal text-[#171717]">{scopeLabel}</h4>
              <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-[#C4B5FD]/25 text-[#4c1d95]">
                {isYearWide ? 'Year-Wide Scope' : 'Section Scope'}
              </span>
            </div>
            <p className="text-[11px] text-[#858174] mt-0.5 font-normal">
              Course reference notes, lab guidelines, and question archives
            </p>
          </div>

          {!isUploading && (
            <button
              onClick={() => setIsUploading(true)}
              className="flex items-center gap-1.5 bg-[#171717] text-white px-3 py-1 rounded-full hover:bg-[#2b2b2b] transition-all text-[11px] font-normal cursor-pointer active:scale-95"
            >
              <Icons.Plus /> Add Material
            </button>
          )}
        </div>

        {/* Upload Form */}
        {isUploading && (
          <form onSubmit={handleUpload} className="bg-[#F8F3E6]/90 border border-[#D8D1C3] rounded-xl p-3 animate-fade-in space-y-2.5">
            <div className="flex items-center justify-between">
              <h5 className="text-xs font-medium text-[#171717]">Upload Study Material</h5>
              <span className="text-[10px] text-[#858174]">{scopePath}</span>
            </div>

            <div>
              <input
                type="text"
                placeholder="Material Title (e.g. Tree Traversal Lecture Slides)"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                required
                className="w-full px-3 py-1.5 bg-white border border-[#D8D1C3] rounded-lg focus:outline-none focus:border-[#171717] text-xs font-normal text-[#171717]"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-[#858174] block mb-1">Category</label>
                <select
                  value={newCategory}
                  onChange={e => setNewCategory(e.target.value)}
                  className="w-full px-2.5 py-1 bg-white border border-[#D8D1C3] rounded-lg text-xs font-normal text-[#171717] focus:outline-none"
                >
                  <option value="Lecture Notes">Lecture Notes</option>
                  <option value="Lab Manual">Lab Manual</option>
                  <option value="Question Bank">Question Bank</option>
                  <option value="Problem Set">Problem Set</option>
                  <option value="Reference Book">Reference Book</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] text-[#858174] block mb-1">Attachment File</label>
                <input
                  type="file"
                  onChange={handleFileSelect}
                  className="w-full text-[10px] text-[#858174] file:mr-2 file:py-0.5 file:px-2 file:rounded file:border-0 file:text-[10px] file:bg-[#C4B5FD]/30 file:text-[#4c1d95] file:cursor-pointer"
                />
              </div>
            </div>

            <div>
              <textarea
                placeholder="Short description or instructions for students..."
                rows="2"
                value={newDescription}
                onChange={e => setNewDescription(e.target.value)}
                className="w-full px-3 py-1.5 bg-white border border-[#D8D1C3] rounded-lg focus:outline-none focus:border-[#171717] text-xs font-normal text-[#171717] resize-none"
              ></textarea>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsUploading(false)}
                className="px-3 py-1 rounded-full text-[#858174] font-normal hover:bg-[#F5E5EE] text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3.5 py-1 rounded-full bg-[#171717] text-white font-normal hover:bg-[#2b2b2b] text-xs cursor-pointer active:scale-95"
              >
                Upload & Share
              </button>
            </div>
          </form>
        )}

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide py-0.5">
          {categories.map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={`text-[10px] px-2.5 py-0.5 rounded-full transition-colors font-normal whitespace-nowrap cursor-pointer ${
                activeCategory === cat
                  ? 'bg-[#171717] text-white'
                  : 'bg-white/70 text-[#858174] hover:text-[#171717] border border-[#D8D1C3]/60'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Materials List */}
        <div className="space-y-2 pt-1">
          {filteredMaterials.map(mat => {
            const isShared = mat.scopePath !== scopePath;
            return (
              <div
                key={mat.id}
                className="p-3 rounded-xl border border-[#D8D1C3]/70 bg-white/70 hover:bg-white hover:border-[#171717]/30 transition-all flex flex-col gap-1.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <span className="w-6 h-6 rounded-md bg-[#C4B5FD]/25 text-[#4c1d95] flex items-center justify-center font-bold text-[9px] flex-shrink-0 mt-0.5">
                      {mat.fileType || 'PDF'}
                    </span>
                    <div>
                      <h5 className="font-normal text-xs text-[#171717] leading-snug">{mat.title}</h5>
                      <p className="text-[#858174] text-[11px] font-normal mt-0.5 leading-relaxed">{mat.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => alert(`Downloading "${mat.title}" (${mat.fileSize})`)}
                      className="text-[10px] text-[#4c1d95] bg-[#C4B5FD]/20 hover:bg-[#C4B5FD]/40 px-2 py-0.5 rounded-md transition-colors cursor-pointer"
                      title="Download file"
                    >
                      Download
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(mat.id)}
                      className="text-[10px] text-[#858174] hover:text-red-600 px-1.5 py-0.5 rounded-md transition-colors cursor-pointer"
                      title="Delete material"
                    >
                      ×
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-[10px] text-[#858174] pt-0.5 border-t border-[#D8D1C3]/30">
                  <span className="text-[#4c1d95] bg-[#C4B5FD]/15 px-2 py-0.5 rounded-full font-normal">
                    {mat.category}
                  </span>
                  <span>•</span>
                  <span>{mat.fileSize}</span>
                  <span>•</span>
                  <span>{mat.uploadedAt}</span>
                  {isShared && (
                    <>
                      <span>•</span>
                      <span className="text-[#858174] italic">Shared across 2nd Year</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {filteredMaterials.length === 0 && (
            <div className="text-center py-8 text-xs text-[#858174]">
              No study materials uploaded for this section yet.
            </div>
          )}
        </div>
      </div>
    );
  }

  // Non-embedded full-screen view
  return (
    <div className="space-y-6 animate-fade-in relative z-10 pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-extrabold text-[#171717] tracking-tight">{scopeLabel}</h2>
          <p className="text-xs font-semibold text-[#858174] mt-0.5">Course reference notes, lab guidelines, and archives</p>
        </div>

        {!isUploading && (
          <button
            onClick={() => setIsUploading(true)}
            className="flex items-center gap-2 bg-[#171717] text-white px-5 py-2.5 rounded-full hover:bg-[#2b2b2b] transition-all shadow-sm font-bold text-xs cursor-pointer active:scale-95"
          >
            <Icons.Plus /> Add Material
          </button>
        )}
      </div>

      {isUploading && (
        <form onSubmit={handleUpload} className="bg-white rounded-2xl border border-[#D8D1C3] p-5 shadow-sm space-y-4">
          <h4 className="text-sm font-bold text-[#171717]">Upload New Material</h4>
          <input
            type="text"
            placeholder="Material Title"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            required
            className="w-full px-4 py-2 bg-[#F8F3E6] border border-[#D8D1C3] rounded-xl text-xs font-semibold text-[#171717]"
          />
          <div className="grid grid-cols-2 gap-3">
            <select
              value={newCategory}
              onChange={e => setNewCategory(e.target.value)}
              className="px-3 py-2 bg-[#F8F3E6] border border-[#D8D1C3] rounded-xl text-xs font-semibold text-[#171717]"
            >
              <option value="Lecture Notes">Lecture Notes</option>
              <option value="Lab Manual">Lab Manual</option>
              <option value="Question Bank">Question Bank</option>
              <option value="Problem Set">Problem Set</option>
              <option value="Reference Book">Reference Book</option>
            </select>
            <input
              type="file"
              onChange={handleFileSelect}
              className="text-xs text-[#858174] file:mr-2 file:py-1 file:px-3 file:rounded-md file:border-0 file:bg-[#C4B5FD]/30 file:text-[#4c1d95]"
            />
          </div>
          <textarea
            placeholder="Description..."
            rows="3"
            value={newDescription}
            onChange={e => setNewDescription(e.target.value)}
            className="w-full px-4 py-2 bg-[#F8F3E6] border border-[#D8D1C3] rounded-xl text-xs font-normal text-[#171717] resize-none"
          ></textarea>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsUploading(false)}
              className="px-4 py-2 rounded-full text-[#858174] font-bold text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-full bg-[#171717] text-white font-bold text-xs shadow-sm"
            >
              Publish
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredMaterials.map(mat => (
          <div key={mat.id} className="p-5 rounded-2xl border border-[#D8D1C3] bg-white shadow-sm space-y-2">
            <div className="flex items-start justify-between">
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-[#C4B5FD]/25 text-[#4c1d95]">
                {mat.category}
              </span>
              <button
                type="button"
                onClick={() => alert(`Downloading "${mat.title}"`)}
                className="text-xs font-bold text-[#4c1d95] hover:underline"
              >
                Download
              </button>
            </div>
            <h4 className="font-bold text-sm text-[#171717]">{mat.title}</h4>
            <p className="text-xs text-[#858174] leading-relaxed">{mat.description}</p>
            <div className="flex items-center gap-2 text-[11px] text-[#858174] pt-2 border-t border-[#D8D1C3]/40">
              <span>{mat.fileSize}</span>
              <span>•</span>
              <span>{mat.uploadedAt}</span>
              <span>•</span>
              <span>{mat.author}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
