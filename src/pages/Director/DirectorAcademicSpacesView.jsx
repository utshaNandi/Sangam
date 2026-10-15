import React, { useState } from 'react';
import { Icons } from '../Teacher/Icons';
import { 
  AssignmentsView, 
  StudentsListView, 
  AttendanceView 
} from '../Teacher/TeacherViews';
import { announcements as sharedAnnouncements, addAnnouncement } from '../Teacher/mockData';

const defaultProgrammes = ['B.Tech', 'BBA', 'BCA', 'BBA LLB', 'LLB', 'MBA', 'M.Tech'];
const btechBranches = ['CSE', 'ESE', 'ME', 'CE', 'BT'];
const cseSpecs = ['AI', 'IoT', 'IoTCSBT', 'CST', 'CSIT', 'Core', 'AIML', 'Data Science', 'Robotics & AI'];
const standardYears = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
const standardSections = ['Section A', 'Section B', 'Section C'];

const generateDirectorTree = () => {
  const tree = { UEMK: {} };
  defaultProgrammes.forEach(p => {
    tree.UEMK[p] = {};
    if (p === 'B.Tech') {
      btechBranches.forEach(b => {
        tree.UEMK[p][b] = {};
        if (b === 'CSE') {
          cseSpecs.forEach(s => {
            tree.UEMK[p][b][s] = {};
            standardYears.forEach(y => {
              tree.UEMK[p][b][s][y] = {};
              standardSections.forEach(sec => {
                tree.UEMK[p][b][s][y][sec] = {};
              });
            });
          });
        } else {
          tree.UEMK[p][b]['Core'] = {};
          standardYears.forEach(y => {
            tree.UEMK[p][b]['Core'][y] = { 'Section A': {}, 'Section B': {} };
          });
        }
      });
    } else if (p === 'BBA') {
      tree.UEMK[p]['Management'] = {
        'Core': {
          '1st Year': { 'Section A': {} },
          '2nd Year': { 'Section A': {} },
          '3rd Year': { 'Section A': {} },
        }
      };
    } else if (p === 'BCA') {
      tree.UEMK[p]['Computer Applications'] = {
        'Core': {
          '1st Year': { 'Section A': {} },
          '2nd Year': { 'Section A': {} },
          '3rd Year': { 'Section A': {} },
        }
      };
    } else if (p === 'MBA') {
      tree.UEMK[p]['Management'] = {
        'Finance': { '1st Year': { 'Section A': {} }, '2nd Year': { 'Section A': {} } },
        'Marketing': { '1st Year': { 'Section A': {} }, '2nd Year': { 'Section A': {} } },
        'HR': { '1st Year': { 'Section A': {} }, '2nd Year': { 'Section A': {} } }
      };
    } else if (p === 'M.Tech') {
      tree.UEMK[p]['CSE'] = {
        'Core': {
          '1st Year': { 'Section A': {} },
          '2nd Year': { 'Section A': {} },
        }
      };
    } else {
      tree.UEMK[p]['Law'] = {
        'Core': {
          '1st Year': { 'Section A': {} },
          '2nd Year': { 'Section A': {} },
        }
      };
    }
  });
  return tree;
};

export default function DirectorAcademicSpacesView({ userProfile }) {
  const [tree, setTree] = useState(generateDirectorTree);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [expandedPaths, setExpandedPaths] = useState(new Set());
  const [activePath, setActivePath] = useState(['UEMK']);
  const [isAddBranchModalOpen, setIsAddBranchModalOpen] = useState(false);
  const [notification, setNotification] = useState(null);

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
        // Check if key is a sibling
        if (keyParts.length === level) {
          const keyParentPrefix = keyParts.slice(0, -1).join('|');
          if (level === 1 || keyParentPrefix === parentPrefix) {
            // Delete sibling
            newExpanded.delete(key);
            // Delete sibling's descendants
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
    const targetPath = (selectedGroup ? [...selectedGroup.path, selectedGroup.isAssignment ? 'Assignments' : selectedGroup.isStudents ? 'Students' : selectedGroup.isAttendance ? 'Attendance' : 'Official Group'] : activePath).slice(0, index + 1);
    
    const newExpanded = new Set(expandedPaths);
    const currentPath = selectedGroup ? selectedGroup.path : activePath;
    for (let i = index + 2; i <= currentPath.length; i++) {
      newExpanded.delete(currentPath.slice(0, i).join('|'));
    }
    setExpandedPaths(newExpanded);
    setActivePath(targetPath);
  };

  const handleAddBranch = (newBranchData) => {
    const { programme, branch, specialization, year, section } = newBranchData;
    const inst = 'UEMK';

    setTree(prevTree => {
      const next = JSON.parse(JSON.stringify(prevTree));
      if (!next[inst]) next[inst] = {};
      if (!next[inst][programme]) next[inst][programme] = {};
      if (!next[inst][programme][branch]) next[inst][programme][branch] = {};
      if (!next[inst][programme][branch][specialization]) next[inst][programme][branch][specialization] = {};
      if (!next[inst][programme][branch][specialization][year]) next[inst][programme][branch][specialization][year] = {};
      next[inst][programme][branch][specialization][year][section] = {};
      return next;
    });

    // Auto expand to newly added placement
    const p1 = [inst, programme];
    const p2 = [...p1, branch];
    const p3 = [...p2, specialization];
    const p4 = [...p3, year];
    const p5 = [...p4, section];

    const nextExpanded = new Set(expandedPaths);
    nextExpanded.add(p1.join('|'));
    nextExpanded.add(p2.join('|'));
    nextExpanded.add(p3.join('|'));
    nextExpanded.add(p4.join('|'));
    nextExpanded.add(p5.join('|'));
    setExpandedPaths(nextExpanded);
    setActivePath(p5);

    setNotification(`Successfully added ${programme} • ${branch} • ${specialization} • ${year} • ${section}`);
    setTimeout(() => setNotification(null), 4000);
  };

  const currentPathForBreadcrumb = selectedGroup 
    ? [...selectedGroup.path, selectedGroup.isAssignment ? 'Assignments' : selectedGroup.isStudents ? 'Students' : selectedGroup.isAttendance ? 'Attendance' : 'Official Group'] 
    : activePath;

  if (selectedGroup) {
    return (
      <div className="space-y-6 animate-fade-in relative z-10 pb-10">
        <BreadcrumbNav 
          activePath={currentPathForBreadcrumb} 
          onNavigateBack={handleNavigateBack} 
          onNavigateTo={handleNavigateTo} 
        />
        {selectedGroup.isAssignment ? (
          <AssignmentsView group={selectedGroup} userProfile={userProfile} allocations={[]} />
        ) : selectedGroup.isStudents ? (
          <StudentsListView group={selectedGroup} userProfile={userProfile} allocations={[]} />
        ) : selectedGroup.isAttendance ? (
          <AttendanceView group={selectedGroup} userProfile={userProfile} allocations={[]} />
        ) : (
          <DirectorOfficialGroupView group={selectedGroup} />
        )}
      </div>
    );
  }

  const existingProgrammes = Object.keys(tree.UEMK || {});

  return (
    <div className="space-y-5 animate-hero-fade-up relative z-10 pb-20" style={{ animationDuration: '400ms' }}>
      {/* Header matching Teacher's layout */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-[26px] font-extrabold text-slate-900 tracking-tight">Academic Spaces</h2>
          <p className="text-xs font-semibold text-slate-400 mt-0.5">Global Institutional Directory & Hierarchical Controls</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsAddBranchModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-theme-primary text-white text-xs font-bold shadow-sm hover:opacity-90 active:scale-95 transition-all cursor-pointer"
          >
            <Icons.Plus /> <span>Add Academic Branch</span>
          </button>
          <span className="text-xs font-bold text-slate-500 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm">
            Global Institutional View
          </span>
        </div>
      </div>

      {notification && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-xl flex items-center justify-between animate-fade-in shadow-sm">
          <div className="flex items-center gap-2">
            <span>✓</span>
            <span>{notification}</span>
          </div>
          <button onClick={() => setNotification(null)} className="text-emerald-600 hover:text-emerald-900 font-bold ml-4">✕</button>
        </div>
      )}
      
      {currentPathForBreadcrumb.length > 0 && (
        <BreadcrumbNav 
          activePath={currentPathForBreadcrumb} 
          onNavigateBack={handleNavigateBack} 
          onNavigateTo={handleNavigateTo} 
        />
      )}

      {/* Clean Unboxed Hierarchy View matching Teacher's minimal layout */}
      <div className="overflow-x-auto transition-all duration-500 mt-2">
        <div className="min-w-[500px]">
          {Object.entries(tree).map(([inst, programmes]) => (
            <InstitutionNode 
              key={inst} 
              name={inst} 
              programmes={programmes} 
              onSelectGroup={setSelectedGroup} 
              expandedPaths={expandedPaths} 
              toggleExpand={toggleExpand} 
              setActivePath={setActivePath}
            />
          ))}
        </div>
      </div>

      {/* Administrative Branch Creation Modal */}
      <AddBranchModal 
        isOpen={isAddBranchModalOpen} 
        onClose={() => setIsAddBranchModalOpen(false)} 
        onAddBranch={handleAddBranch}
        programmes={existingProgrammes}
      />
    </div>
  );
}

function BreadcrumbNav({ activePath, onNavigateBack, onNavigateTo }) {
  if (activePath.length === 0) return null;

  return (
    <div className="flex items-center gap-2 text-sm font-bold bg-white px-4 py-2.5 rounded-xl border border-slate-200 shadow-sm w-fit animate-fade-in">
      <button onClick={onNavigateBack} className="flex items-center gap-1.5 text-slate-500 hover:text-theme-primary transition-colors pr-3 border-r border-slate-100 cursor-pointer">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
        <span>Back</span>
      </button>
      <div className="flex items-center gap-2 pl-1 overflow-x-auto scrollbar-hide max-w-full">
        {activePath.map((segment, index) => {
          const isLast = index === activePath.length - 1;
          return (
            <div key={index} className="flex items-center gap-2 whitespace-nowrap">
              <button 
                onClick={() => !isLast && onNavigateTo(index)}
                className={`transition-colors ${isLast ? 'text-slate-900 cursor-default' : 'text-slate-500 hover:text-theme-primary cursor-pointer'}`}
              >
                {segment}
              </button>
              {!isLast && <span className="text-slate-300">/</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InstitutionNode({ name, programmes, onSelectGroup, expandedPaths, toggleExpand, setActivePath }) {
  const fullPath = [name];
  const anyExpanded = Object.keys(programmes).some(p => expandedPaths.has([name, p].join('|')));

  return (
    <div className="space-y-4">
      <div 
        className="flex items-center gap-3 cursor-pointer group w-fit"
        onClick={() => setActivePath(fullPath)}
      >
        <div className="w-10 h-10 rounded-xl bg-theme-bg text-theme-primary flex items-center justify-center font-bold text-lg shadow-sm group-hover:scale-105 transition-transform">
          {name.charAt(0)}
        </div>
        <h3 className="text-xl font-extrabold text-slate-900 tracking-tight group-hover:text-theme-primary transition-colors">{name}</h3>
      </div>
      <div className="ml-5 pl-6 border-l-2 border-slate-100 mt-3 pt-1">
        {/* Global Institution-level Action Button */}
        <div className={`grid transition-[grid-template-rows,opacity,margin,padding] duration-200 ease-in-out ${anyExpanded ? 'grid-rows-[0fr] opacity-0 m-0 p-0' : 'grid-rows-[1fr] opacity-100 mb-4 pt-1'}`}>
          <div className="overflow-hidden">
            <div className="flex items-center gap-2 relative before:absolute before:left-[-26px] before:top-[10px] before:w-[20px] before:h-[2px] before:bg-slate-100">
              <button 
                onClick={(e) => { e.stopPropagation(); onSelectGroup({ name: "Official Group", permissions: ["View", "Announce", "Manage"], path: fullPath, scope: "Institution-wide" }); }}
                className="text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 border border-slate-200 hover:bg-theme-primary hover:text-white transition-colors cursor-pointer"
              >
                OFFICIAL GROUP
              </button>
            </div>
          </div>
        </div>

        {Object.entries(programmes).map(([prog, branches]) => {
          const p = [name, prog];
          const isExpanded = expandedPaths.has(p.join('|'));
          const isHidden = anyExpanded && !isExpanded;
          
          return (
            <div key={prog} className={`grid transition-[grid-template-rows,opacity,margin,padding] duration-200 ease-in-out ${isHidden ? 'grid-rows-[0fr] opacity-0 m-0 p-0' : 'grid-rows-[1fr] opacity-100 mb-6'}`}>
              <div className="overflow-hidden">
                <div className={isHidden ? "" : "pb-1"}>
                  <ProgrammeNode 
                    name={prog} 
                    branches={branches} 
                    path={fullPath} 
                    onSelectGroup={onSelectGroup} 
                    expandedPaths={expandedPaths} 
                    toggleExpand={toggleExpand} 
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

function ProgrammeNode({ name, branches, path, onSelectGroup, expandedPaths, toggleExpand }) {
  const fullPath = [...path, name];
  const expanded = expandedPaths.has(fullPath.join('|'));
  const anyBranchesExpanded = Object.keys(branches).some(b => expandedPaths.has([...fullPath, b].join('|')));

  return (
    <div className="space-y-3 relative before:absolute before:left-[-26px] before:top-[12px] before:w-[20px] before:h-[2px] before:bg-slate-100">
      <div className="flex items-center gap-2 group cursor-pointer w-fit" onClick={() => toggleExpand(fullPath, expanded)}>
        <button className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-slate-100 text-slate-400 transition-colors">
          {expanded ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
          )}
        </button>
        <h4 className="text-lg font-bold text-slate-800 group-hover:text-theme-primary transition-colors">{name}</h4>
      </div>

      <div className={`grid transition-[grid-template-rows,opacity] duration-200 ease-in-out ${expanded ? 'grid-rows-[1fr] opacity-100 mt-4' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <div className="ml-3 pl-6 border-l-2 border-slate-100 pb-2 pt-1">
            {/* Programme-wide action pill */}
            <div className={`grid transition-[grid-template-rows,opacity,margin,padding] duration-200 ease-in-out ${anyBranchesExpanded ? 'grid-rows-[0fr] opacity-0 m-0 p-0' : 'grid-rows-[1fr] opacity-100 mb-4 pt-1'}`}>
              <div className="overflow-hidden">
                <div className="flex items-center gap-2 relative before:absolute before:left-[-26px] before:top-[10px] before:w-[20px] before:h-[2px] before:bg-slate-100">
                  <button 
                    onClick={(e) => { e.stopPropagation(); onSelectGroup({ name: "Official Group", permissions: ["View", "Announce", "Manage"], path: fullPath, scope: `${name}-wide` }); }}
                    className="text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 border border-slate-200 hover:bg-theme-primary hover:text-white transition-colors cursor-pointer"
                  >
                    OFFICIAL GROUP
                  </button>
                </div>
              </div>
            </div>

            {Object.entries(branches).map(([branch, specializations]) => {
              const p = [...fullPath, branch];
              const isExpanded = expandedPaths.has(p.join('|'));
              const isHidden = anyBranchesExpanded && !isExpanded;
              return (
                <div key={branch} className={`grid transition-[grid-template-rows,opacity,margin,padding] duration-200 ease-in-out ${isHidden ? 'grid-rows-[0fr] opacity-0 m-0 p-0' : 'grid-rows-[1fr] opacity-100 mb-5'}`}>
                  <div className="overflow-hidden">
                    <div className={isHidden ? "" : "pb-1"}>
                      <BranchNode 
                        name={branch} 
                        specializations={specializations} 
                        path={fullPath} 
                        onSelectGroup={onSelectGroup} 
                        expandedPaths={expandedPaths} 
                        toggleExpand={toggleExpand} 
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

function BranchNode({ name, specializations, path, onSelectGroup, expandedPaths, toggleExpand }) {
  const fullPath = [...path, name];
  const expanded = expandedPaths.has(fullPath.join('|'));
  const anySpecsExpanded = Object.keys(specializations).some(s => expandedPaths.has([...fullPath, s].join('|')));

  return (
    <div className="space-y-3 relative before:absolute before:left-[-26px] before:top-[10px] before:w-[20px] before:h-[2px] before:bg-slate-100">
      <div className="flex items-center gap-2 group cursor-pointer w-fit" onClick={() => toggleExpand(fullPath, expanded)}>
        <button className="w-5 h-5 flex items-center justify-center rounded-md hover:bg-slate-100 text-slate-400 transition-colors">
          {expanded ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
          )}
        </button>
        <span className="text-[15px] font-bold text-slate-700 group-hover:text-theme-primary transition-colors">{name}</span>
      </div>

      <div className={`grid transition-[grid-template-rows,opacity] duration-200 ease-in-out ${expanded ? 'grid-rows-[1fr] opacity-100 mt-3' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <div className="ml-2.5 pl-6 border-l-2 border-slate-100 pb-2 pt-1">
            {/* Branch-wide action pill */}
            <div className={`grid transition-[grid-template-rows,opacity,margin,padding] duration-200 ease-in-out ${anySpecsExpanded ? 'grid-rows-[0fr] opacity-0 m-0 p-0' : 'grid-rows-[1fr] opacity-100 mb-4 pt-1'}`}>
              <div className="overflow-hidden">
                <div className="flex items-center gap-2 relative before:absolute before:left-[-26px] before:top-[10px] before:w-[20px] before:h-[2px] before:bg-slate-100">
                  <button 
                    onClick={(e) => { e.stopPropagation(); onSelectGroup({ name: "Official Group", permissions: ["View", "Announce", "Manage"], path: fullPath, scope: `${name}-wide` }); }}
                    className="text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 border border-slate-200 hover:bg-theme-primary hover:text-white transition-colors cursor-pointer"
                  >
                    OFFICIAL GROUP
                  </button>
                </div>
              </div>
            </div>

            {Object.entries(specializations).map(([spec, years]) => {
              const p = [...fullPath, spec];
              const isExpanded = expandedPaths.has(p.join('|'));
              const isHidden = anySpecsExpanded && !isExpanded;
              return (
                <div key={spec} className={`grid transition-[grid-template-rows,opacity,margin,padding] duration-200 ease-in-out ${isHidden ? 'grid-rows-[0fr] opacity-0 m-0 p-0' : 'grid-rows-[1fr] opacity-100 mb-4'}`}>
                  <div className="overflow-hidden">
                    <div className={isHidden ? "" : "pb-1"}>
                      <SpecializationNode 
                        name={spec} 
                        years={years} 
                        path={fullPath} 
                        onSelectGroup={onSelectGroup} 
                        expandedPaths={expandedPaths} 
                        toggleExpand={toggleExpand} 
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

function SpecializationNode({ name, years, path, onSelectGroup, expandedPaths, toggleExpand }) {
  const fullPath = [...path, name];
  const expanded = expandedPaths.has(fullPath.join('|'));
  const anyYearsExpanded = Object.keys(years).some(y => expandedPaths.has([...fullPath, y].join('|')));

  return (
    <div className="space-y-3 relative before:absolute before:left-[-26px] before:top-[10px] before:w-[20px] before:h-[2px] before:bg-slate-100">
      <div className="flex items-center gap-2 group cursor-pointer w-fit" onClick={() => toggleExpand(fullPath, expanded)}>
        <button className="w-5 h-5 flex items-center justify-center rounded-md hover:bg-slate-100 text-slate-400 transition-colors">
          {expanded ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
          )}
        </button>
        <span className="text-[15px] font-bold text-slate-700 group-hover:text-theme-primary transition-colors">{name}</span>
      </div>

      <div className={`grid transition-[grid-template-rows,opacity] duration-200 ease-in-out ${expanded ? 'grid-rows-[1fr] opacity-100 mt-3' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <div className="ml-2.5 pl-6 border-l-2 border-slate-100 pb-2 pt-1">
            {/* Specialization-wide action pill */}
            <div className={`grid transition-[grid-template-rows,opacity,margin,padding] duration-200 ease-in-out ${anyYearsExpanded ? 'grid-rows-[0fr] opacity-0 m-0 p-0' : 'grid-rows-[1fr] opacity-100 mb-4 pt-1'}`}>
              <div className="overflow-hidden">
                <div className="flex items-center gap-2 relative before:absolute before:left-[-26px] before:top-[10px] before:w-[20px] before:h-[2px] before:bg-slate-100">
                  <button 
                    onClick={(e) => { e.stopPropagation(); onSelectGroup({ name: "Official Group", permissions: ["View", "Announce", "Manage"], path: fullPath, scope: `${name}-wide` }); }}
                    className="text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 border border-slate-200 hover:bg-theme-primary hover:text-white transition-colors cursor-pointer"
                  >
                    OFFICIAL GROUP
                  </button>
                </div>
              </div>
            </div>

            {Object.entries(years).map(([year, sections]) => {
              const p = [...fullPath, year];
              const isExpanded = expandedPaths.has(p.join('|'));
              const isHidden = anyYearsExpanded && !isExpanded;
              return (
                <div key={year} className={`grid transition-[grid-template-rows,opacity,margin,padding] duration-200 ease-in-out ${isHidden ? 'grid-rows-[0fr] opacity-0 m-0 p-0' : 'grid-rows-[1fr] opacity-100 mb-4'}`}>
                  <div className="overflow-hidden">
                    <div className={isHidden ? "" : "pb-1"}>
                      <YearNode 
                        name={year} 
                        sections={sections} 
                        path={fullPath} 
                        onSelectGroup={onSelectGroup} 
                        expandedPaths={expandedPaths} 
                        toggleExpand={toggleExpand} 
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

function YearNode({ name, sections, path, onSelectGroup, expandedPaths, toggleExpand }) {
  const fullPath = [...path, name];
  const expanded = expandedPaths.has(fullPath.join('|'));
  const anySectionsExpanded = Object.keys(sections).some(s => expandedPaths.has([...fullPath, s].join('|')));

  return (
    <div className="space-y-3 relative before:absolute before:left-[-26px] before:top-[10px] before:w-[20px] before:h-[2px] before:bg-slate-100">
      <div className="flex items-center gap-2 group cursor-pointer w-fit" onClick={() => toggleExpand(fullPath, expanded)}>
        <button className="w-5 h-5 flex items-center justify-center rounded-md hover:bg-slate-100 text-slate-400 transition-colors">
          {expanded ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
          )}
        </button>
        <span className="text-[15px] font-bold text-slate-700 group-hover:text-theme-primary transition-colors">{name}</span>
      </div>

      <div className={`grid transition-[grid-template-rows,opacity] duration-200 ease-in-out ${expanded ? 'grid-rows-[1fr] opacity-100 mt-3' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <div className="ml-2.5 pl-6 border-l-2 border-slate-100 pb-2 pt-1">
            {/* Year-level action pills: OFFICIAL GROUP & ASSIGNMENTS */}
            <div className={`grid transition-[grid-template-rows,opacity,margin,padding] duration-200 ease-in-out ${anySectionsExpanded ? 'grid-rows-[0fr] opacity-0 m-0 p-0' : 'grid-rows-[1fr] opacity-100 mb-4 pt-2'}`}>
              <div className="overflow-hidden">
                <div className="flex items-start gap-2 relative before:absolute before:left-[-26px] before:top-[10px] before:w-[20px] before:h-[2px] before:bg-slate-100">
                  <button 
                    onClick={(e) => { e.stopPropagation(); onSelectGroup({ name: "Official Group", permissions: ["View", "Announce", "Manage"], path: fullPath, scope: `${name}-wide` }); }}
                    className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500 border border-slate-200 hover:bg-theme-primary hover:text-white transition-colors cursor-pointer"
                  >
                    OFFICIAL GROUP
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); onSelectGroup({ name: "Assignments", isAssignment: true, path: fullPath, scope: "Common to all sections" }); }}
                    className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500 border border-slate-200 hover:bg-theme-primary hover:text-white transition-colors cursor-pointer"
                  >
                    ASSIGNMENTS
                  </button>
                </div>
              </div>
            </div>

            {Object.entries(sections).map(([sec]) => {
              const p = [...fullPath, sec];
              const isExpanded = expandedPaths.has(p.join('|'));
              const isHidden = anySectionsExpanded && !isExpanded;
              return (
                <div key={sec} className={`grid transition-[grid-template-rows,opacity,margin,padding] duration-200 ease-in-out ${isHidden ? 'grid-rows-[0fr] opacity-0 m-0 p-0' : 'grid-rows-[1fr] opacity-100 mb-4'}`}>
                  <div className="overflow-hidden">
                    <div className={isHidden ? "" : "pb-1"}>
                      <SectionNode 
                        name={sec} 
                        path={fullPath} 
                        onSelectGroup={onSelectGroup} 
                        expandedPaths={expandedPaths} 
                        toggleExpand={toggleExpand} 
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

function SectionNode({ name, path, onSelectGroup, expandedPaths, toggleExpand }) {
  const fullPath = [...path, name];
  const expanded = expandedPaths.has(fullPath.join('|'));

  return (
    <div className="space-y-3 relative before:absolute before:left-[-26px] before:top-[10px] before:w-[20px] before:h-[2px] before:bg-slate-100">
      <div className="flex items-center gap-2 group cursor-pointer w-fit" onClick={() => toggleExpand(fullPath, expanded)}>
        <button className="w-5 h-5 flex items-center justify-center rounded-md hover:bg-slate-100 text-slate-400 transition-colors">
          {expanded ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
          )}
        </button>
        <span className="text-sm font-bold text-slate-600 group-hover:text-theme-primary transition-colors">{name}</span>
      </div>
      
      <div className={`grid transition-[grid-template-rows,opacity] duration-200 ease-in-out ${expanded ? 'grid-rows-[1fr] opacity-100 mt-2' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <div className="ml-2.5 pl-6 border-l-2 border-slate-100 pt-2 pb-2 flex flex-wrap gap-2 sm:gap-3">
            <button 
              onClick={(e) => { e.stopPropagation(); onSelectGroup({ name: "Students", isStudents: true, path: fullPath, scope: name + " only" }); }}
              className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500 border border-slate-200 hover:bg-theme-primary hover:text-white transition-colors cursor-pointer"
            >
              VIEW
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); onSelectGroup({ name: "Official Group", permissions: ['View', 'Announce', 'Manage'], path: fullPath, scope: name + " only" }); }}
              className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500 border border-slate-200 hover:bg-theme-primary hover:text-white transition-colors cursor-pointer"
            >
              ANNOUNCE
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); onSelectGroup({ name: "Assignments", isAssignment: true, path: fullPath, scope: name + " only" }); }}
              className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500 border border-slate-200 hover:bg-theme-primary hover:text-white transition-colors cursor-pointer"
            >
              ASSIGNMENTS
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); onSelectGroup({ name: "Attendance", isAttendance: true, path: fullPath, scope: name + " only" }); }}
              className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500 border border-slate-200 hover:bg-theme-primary hover:text-white transition-colors cursor-pointer"
            >
              ATTENDANCE
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DirectorOfficialGroupView({ group }) {
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
      author: 'Dr. Alan Carter (Director)',
      time: 'Just now',
      scopePath: scopePath
    };
    
    addAnnouncement(newAnn);
    setAnnouncements([newAnn, ...announcements]);
    setIsCreating(false);
    setNewTitle('');
    setNewContent('');
  };

  return (
    <div className="space-y-6 animate-fade-in relative z-10 pb-10">
      <div className="flex items-center gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Official Group</h2>
          <p className="text-xs font-semibold text-slate-500 mt-0.5">{group.scope || group.path.slice(1).join(' · ') || 'Institution-wide'}</p>
        </div>
      </div>

      <div className="bg-white rounded-[24px] border border-slate-100 shadow-[0_2px_20px_rgba(0,0,0,0.02)] overflow-hidden">
        {/* Banner */}
        <div className="bg-slate-50/80 border-b border-slate-100 p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-theme-bg text-theme-primary flex items-center justify-center shadow-sm">
              <Icons.Announcements />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">{group.scope ? `${group.scope} announcements` : 'Official announcements'}</h3>
              <div className="flex gap-2 mt-1.5">
                {group.permissions.map(p => (
                  <span key={p} className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-500">{p}</span>
                ))}
              </div>
            </div>
          </div>
          {canAnnounce && !isCreating && (
            <button onClick={() => setIsCreating(true)} className="flex items-center gap-2 bg-theme-primary text-white px-5 py-2.5 rounded-xl hover:opacity-90 transition-all shadow-sm font-bold text-sm cursor-pointer">
              <Icons.Plus /> Create Announcement
            </button>
          )}
        </div>

        <div className="p-6 sm:p-8 space-y-6">
          {/* Create Announcement Form */}
          {isCreating && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 mb-8 animate-fade-in">
              <h4 className="text-sm font-bold text-slate-900 mb-4">New Institutional Announcement</h4>
              <input 
                type="text" 
                placeholder="Announcement Title" 
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                className="w-full mb-3 px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-theme-primary/20 focus:border-theme-primary text-sm font-medium transition-all"
              />
              <textarea 
                placeholder="Write your official message here..." 
                rows="4"
                value={newContent}
                onChange={e => setNewContent(e.target.value)}
                className="w-full mb-4 px-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-theme-primary/20 focus:border-theme-primary text-sm font-medium transition-all resize-none"
              ></textarea>
              <div className="flex justify-end gap-3">
                <button onClick={() => setIsCreating(false)} className="px-5 py-2.5 rounded-xl text-slate-500 font-bold hover:bg-slate-200 bg-slate-100 transition-colors text-sm cursor-pointer">Cancel</button>
                <button onClick={handlePublish} className="px-5 py-2.5 rounded-xl bg-theme-primary text-white font-bold hover:opacity-90 shadow-sm transition-all text-sm cursor-pointer">Publish</button>
              </div>
            </div>
          )}

          {/* Announcements List */}
          <div className="space-y-4">
            {announcements.map(ann => (
              <div key={ann.id} className="p-5 sm:p-6 rounded-2xl border border-slate-100 hover:border-slate-200 hover:shadow-[0_4px_12px_rgba(0,0,0,0.02)] transition-all bg-white group">
                <h4 className="font-bold text-slate-900 text-lg">{ann.title}</h4>
                <p className="text-slate-600 mt-2 mb-4 text-sm font-medium leading-relaxed">{ann.content}</p>
                <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                  <span className="text-slate-600 bg-slate-50 px-2 py-1 rounded-md">{ann.author}</span>
                  <span>•</span>
                  <span>{ann.time}</span>
                </div>
              </div>
            ))}
            {announcements.length === 0 && !isCreating && (
              <div className="text-center py-10">
                <p className="text-slate-400 font-medium text-sm">No announcements yet for this scope.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AddBranchModal({ isOpen, onClose, onAddBranch, programmes }) {
  const [programme, setProgramme] = useState('B.Tech');
  const [customProgramme, setCustomProgramme] = useState('');
  const [branch, setBranch] = useState('CSE');
  const [customBranch, setCustomBranch] = useState('');
  const [specialization, setSpecialization] = useState('AI');
  const [customSpec, setCustomSpec] = useState('');
  const [year, setYear] = useState('1st Year');
  const [section, setSection] = useState('Section A');

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const finalProg = programme === '__custom__' ? customProgramme.trim() : programme;
    const finalBranch = branch === '__custom__' ? customBranch.trim() : branch;
    const finalSpec = specialization === '__custom__' ? customSpec.trim() : specialization;

    if (!finalProg || !finalBranch || !finalSpec) return;

    onAddBranch({
      programme: finalProg,
      branch: finalBranch,
      specialization: finalSpec,
      year,
      section
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
      <div 
        className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-extrabold text-slate-900">Add Academic Branch</h3>
            <p className="text-xs text-slate-500 mt-0.5">Register a new academic placement to the institutional directory.</p>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 font-bold text-xl p-1 leading-none rounded-lg cursor-pointer"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Degree Programme */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Degree Programme <span className="text-rose-500">*</span>
            </label>
            <select
              value={programme}
              onChange={(e) => setProgramme(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-theme-primary focus:ring-2 focus:ring-theme-primary/20 transition-all"
            >
              {programmes.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
              <option value="__custom__">+ Add Custom Programme</option>
            </select>
            {programme === '__custom__' && (
              <input
                type="text"
                placeholder="Enter new programme (e.g. M.Sc)"
                value={customProgramme}
                onChange={e => setCustomProgramme(e.target.value)}
                required
                className="w-full mt-2 bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-sm font-medium outline-none focus:border-theme-primary"
              />
            )}
          </div>

          {/* Branch */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Branch / Department <span className="text-rose-500">*</span>
            </label>
            <select
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-theme-primary focus:ring-2 focus:ring-theme-primary/20 transition-all"
            >
              {['CSE', 'ESE', 'ME', 'CE', 'BT', 'Management', 'Computer Applications', 'Electrical Engineering', 'Information Technology'].map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
              <option value="__custom__">+ Add Custom Branch</option>
            </select>
            {branch === '__custom__' && (
              <input
                type="text"
                placeholder="Enter new branch (e.g. Aerospace)"
                value={customBranch}
                onChange={e => setCustomBranch(e.target.value)}
                required
                className="w-full mt-2 bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-sm font-medium outline-none focus:border-theme-primary"
              />
            )}
          </div>

          {/* Specialization */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Specialization / Stream <span className="text-rose-500">*</span>
            </label>
            <select
              value={specialization}
              onChange={(e) => setSpecialization(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-theme-primary focus:ring-2 focus:ring-theme-primary/20 transition-all"
            >
              {['Core', 'AI', 'IoT', 'IoTCSBT', 'CST', 'CSIT', 'AIML', 'Data Science', 'Robotics & AI', 'Finance', 'Marketing', 'HR'].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
              <option value="__custom__">+ Add Custom Specialization</option>
            </select>
            {specialization === '__custom__' && (
              <input
                type="text"
                placeholder="Enter new specialization (e.g. Cloud Computing)"
                value={customSpec}
                onChange={e => setCustomSpec(e.target.value)}
                required
                className="w-full mt-2 bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-sm font-medium outline-none focus:border-theme-primary"
              />
            )}
          </div>

          {/* Year & Section Row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Year <span className="text-rose-500">*</span>
              </label>
              <select
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-theme-primary"
              >
                {['1st Year', '2nd Year', '3rd Year', '4th Year'].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Section <span className="text-rose-500">*</span>
              </label>
              <select
                value={section}
                onChange={(e) => setSection(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-theme-primary"
              >
                {['Section A', 'Section B', 'Section C', 'Section D'].map(sec => (
                  <option key={sec} value={sec}>{sec}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-theme-primary hover:opacity-90 shadow-sm hover:shadow transition-all flex items-center gap-2 cursor-pointer"
            >
              Confirm Registration
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
