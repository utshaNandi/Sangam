import React, { useState } from 'react';
import { Icons } from '../Teacher/Icons';
import OfficialGroupView from '../../components/OfficialGroupView';

const programmes = ['B.Tech', 'BBA', 'BCA', 'BBA LLB', 'LLB', 'MBA', 'M.Tech'];
const btechBranches = ['CSE', 'ESE', 'ME', 'CE', 'BT'];
const cseSpecs = ['AI', 'IoT', 'IoTCSBT', 'CST', 'CSIT', 'Core', 'AIML', 'Data Science', 'Robotics & AI'];
const years = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
const sections = ['Section A', 'Section B', 'Section C'];

function useDelayedUnmount(isMounted, delayTime) {
  const [shouldRender, setShouldRender] = useState(isMounted);
  
  if (isMounted && !shouldRender) {
    setShouldRender(true);
  }

  React.useEffect(() => {
    let timeoutId;
    if (!isMounted && shouldRender) {
      timeoutId = setTimeout(() => setShouldRender(false), delayTime);
    }
    return () => clearTimeout(timeoutId);
  }, [isMounted, delayTime, shouldRender]);

  return shouldRender;
}

const generateDirectorTree = () => {
  const tree = { UEMK: {} };
  programmes.forEach(p => {
    tree.UEMK[p] = {};
    if (p === 'B.Tech') {
      btechBranches.forEach(b => {
        tree.UEMK[p][b] = {};
        if (b === 'CSE') {
          cseSpecs.forEach(s => {
            tree.UEMK[p][b][s] = {};
            years.forEach(y => {
              tree.UEMK[p][b][s][y] = {};
              sections.forEach(sec => {
                tree.UEMK[p][b][s][y][sec] = {};
              });
            });
          });
        } else {
          tree.UEMK[p][b]['Core'] = { '1st Year': { 'Section A': {} } };
        }
      });
    } else {
      tree.UEMK[p]['Core'] = { '1st Year': { 'Section A': {} } };
    }
  });
  return tree;
};

const tree = generateDirectorTree();

export default function DirectorAcademicSpacesView() {
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [expandedPaths, setExpandedPaths] = useState(new Set());
  const [activePath, setActivePath] = useState(['UEMK']); // Default UEMK active

  const toggleExpand = (pathArr, isExpanded) => {
    const pathStr = pathArr.join('|');
    const newExpanded = new Set(expandedPaths);
    
    if (isExpanded) {
      newExpanded.delete(pathStr);
      const currentActiveStr = activePath.join('|');
      if (currentActiveStr.startsWith(pathStr)) {
         setActivePath(pathArr.slice(0, -1));
      }
    } else {
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

  const currentPathForBreadcrumb = selectedGroup ? [...selectedGroup.path, 'Official Group'] : activePath;

  if (selectedGroup) {
    return (
      <div className="space-y-6 animate-fade-in relative z-10 pb-10">
        <BreadcrumbNav activePath={currentPathForBreadcrumb} onNavigateBack={handleNavigateBack} onNavigateTo={handleNavigateTo} />
        <OfficialGroupView group={selectedGroup} />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-hero-fade-up relative z-10 pb-10" style={{ animationDuration: '400ms' }}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Academic Spaces</h2>
        <span className="text-xs font-bold text-slate-500 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm">
          Global Institutional View
        </span>
      </div>
      
      {currentPathForBreadcrumb.length > 0 && (
        <BreadcrumbNav activePath={currentPathForBreadcrumb} onNavigateBack={handleNavigateBack} onNavigateTo={handleNavigateTo} />
      )}

      <div className="bg-white rounded-[24px] border border-slate-100 p-5 md:p-6 shadow-[0_2px_20px_rgba(0,0,0,0.02)] overflow-x-auto transition-all duration-500 w-full max-w-4xl">
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
              activePath={activePath}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function BreadcrumbNav({ activePath, onNavigateBack, onNavigateTo }) {
  if (activePath.length === 0) return null;

  return (
    <div className="flex items-center gap-2 text-sm font-bold bg-white px-4 py-2.5 rounded-xl border border-slate-200 shadow-sm w-fit animate-fade-in">
      <button onClick={onNavigateBack} className="flex items-center gap-1.5 text-slate-500 hover:text-theme-primary transition-colors pr-3 border-r border-slate-100">
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
                className={`transition-colors ${isLast ? 'text-slate-900 cursor-default' : 'text-slate-500 hover:text-theme-primary'}`}
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

function OfficialGroupConnector({ path, scopeName, onSelectGroup }) {
  return (
    <div className="ml-1 pl-5 border-l-2 border-slate-100 pt-2 pb-1 animate-fade-in">
      <div 
        onClick={() => onSelectGroup({ name: "Official Group", permissions: ["View", "Announce", "Manage"], path })}
        className="flex items-center justify-between bg-slate-50/50 border border-slate-100 rounded-xl p-3 cursor-pointer hover:shadow-[0_4px_12px_rgba(0,0,0,0.03)] hover:-translate-y-0.5 active:scale-[0.98] hover:border-theme-primary/30 hover:bg-white transition-all duration-300 group w-full max-w-sm relative before:absolute before:left-[-21px] before:top-[20px] before:w-[20px] before:h-[2px] before:bg-slate-100"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white border border-slate-100 text-theme-primary flex items-center justify-center transition-transform duration-300 group-hover:scale-110 shadow-sm">
            <Icons.Announcements />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900 group-hover:text-theme-primary transition-colors">Official Group</p>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5 group-hover:text-slate-600 transition-colors">{scopeName} announcements</p>
          </div>
        </div>
        <button className="text-xs font-bold text-theme-primary px-3 py-1.5 bg-theme-bg/50 group-hover:bg-theme-bg rounded-lg transition-all duration-300 border border-transparent group-hover:border-theme-primary/10">
          Enter
        </button>
      </div>
    </div>
  );
}

// Wrapper for sibling hiding animation
function NodeVisibilityWrapper({ isVisible, children }) {
  return (
    <div className={`grid transition-all duration-400 ease-[cubic-bezier(0.4,0,0.2,1)] ${isVisible ? 'grid-rows-[1fr] opacity-100 mt-1.5' : 'grid-rows-[0fr] opacity-0 scale-[0.98] mt-0'}`}>
      <div className="overflow-hidden -ml-8 pl-8 py-1 -my-1">
        {children}
      </div>
    </div>
  );
}

function InstitutionNode({ name, programmes, onSelectGroup, expandedPaths, toggleExpand, setActivePath, activePath }) {
  const fullPath = [name];
  const isActive = activePath.join('|') === fullPath.join('|');
  
  return (
    <div>
      <div 
        className="flex items-center gap-3 cursor-pointer group w-full"
        onClick={() => setActivePath(fullPath)}
      >
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg shadow-sm transition-all duration-300 group-hover:scale-105 ${isActive ? 'bg-theme-primary text-white scale-105 shadow-md' : 'bg-theme-bg text-theme-primary'}`}>
          {name.charAt(0)}
        </div>
        <h3 className={`text-xl font-extrabold tracking-tight transition-colors duration-300 ${isActive ? 'text-theme-primary' : 'text-slate-900 group-hover:text-theme-primary'}`}>{name}</h3>
      </div>
      <div className="ml-5 pl-6 border-l-2 border-slate-100 mt-3 relative pb-2">
        {isActive && <OfficialGroupConnector path={fullPath} scopeName="Institution-wide" onSelectGroup={onSelectGroup} />}
        {Object.entries(programmes).map(([prog, branches]) => {
          const isVisible = activePath.length <= 1 || activePath[1] === prog;
          return (
            <NodeVisibilityWrapper key={prog} isVisible={isVisible}>
              <ProgrammeNode name={prog} branches={branches} path={fullPath} onSelectGroup={onSelectGroup} expandedPaths={expandedPaths} toggleExpand={toggleExpand} activePath={activePath} />
            </NodeVisibilityWrapper>
          );
        })}
      </div>
    </div>
  );
}

function ProgrammeNode({ name, branches, path, onSelectGroup, expandedPaths, toggleExpand, activePath }) {
  const fullPath = [...path, name];
  const expanded = expandedPaths.has(fullPath.join('|'));
  const isActive = activePath.join('|') === fullPath.join('|');
  const shouldRenderChildren = useDelayedUnmount(expanded, 400);
  
  return (
    <div className="relative before:absolute before:left-[-26px] before:top-[12px] before:w-[20px] before:h-[2px] before:bg-slate-100">
      <div className={`flex items-center gap-2 group cursor-pointer w-full py-1.5 px-2 -ml-2 rounded-lg transition-colors duration-300 ${isActive ? 'bg-slate-50' : 'hover:bg-slate-50/50'}`} onClick={() => toggleExpand(fullPath, expanded)}>
        <button className={`w-6 h-6 flex items-center justify-center rounded-md transition-colors duration-300 ${isActive ? 'bg-white shadow-sm text-theme-primary' : 'hover:bg-slate-100 text-slate-400'}`}>
          {expanded ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg> : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>}
        </button>
        <h4 className={`text-lg font-bold transition-colors duration-300 ${isActive ? 'text-theme-primary' : 'text-slate-800 group-hover:text-theme-primary'}`}>{name}</h4>
      </div>
      
      <div className={`grid transition-[grid-template-rows,opacity] duration-400 ease-[cubic-bezier(0.4,0,0.2,1)] ${expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <div className="ml-3 pl-6 border-l-2 border-slate-100 pt-1 pb-2">
            {shouldRenderChildren && (
              <>
                {isActive && <div className="mt-2"><OfficialGroupConnector path={fullPath} scopeName="Programme-wide" onSelectGroup={onSelectGroup} /></div>}
                {Object.entries(branches).map(([branch, specializations]) => {
                  const isVisible = activePath.length <= 2 || activePath[2] === branch;
                  return (
                    <NodeVisibilityWrapper key={branch} isVisible={isVisible}>
                      <BranchNode name={branch} specializations={specializations} path={fullPath} onSelectGroup={onSelectGroup} expandedPaths={expandedPaths} toggleExpand={toggleExpand} activePath={activePath} />
                    </NodeVisibilityWrapper>
                  );
                })}
</>
            )}
          </div>
        </div>
      </div>
    </div>
    );
}

function BranchNode({ name, specializations, path, onSelectGroup, expandedPaths, toggleExpand, activePath }) {
  const fullPath = [...path, name];
  const expanded = expandedPaths.has(fullPath.join('|'));
  const isActive = activePath.join('|') === fullPath.join('|');
  const shouldRenderChildren = useDelayedUnmount(expanded, 400);
  
  return (
    <div className="relative before:absolute before:left-[-26px] before:top-[10px] before:w-[20px] before:h-[2px] before:bg-slate-100">
      <div className={`flex items-center gap-2 group cursor-pointer w-full py-1.5 px-2 -ml-2 rounded-lg transition-colors duration-300 ${isActive ? 'bg-slate-50' : 'hover:bg-slate-50/50'}`} onClick={() => toggleExpand(fullPath, expanded)}>
        <button className={`w-5 h-5 flex items-center justify-center rounded-md transition-colors duration-300 ${isActive ? 'bg-white shadow-sm text-theme-primary' : 'hover:bg-slate-100 text-slate-400'}`}>
          {expanded ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg> : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>}
        </button>
        <span className={`text-[15px] font-bold transition-colors duration-300 ${isActive ? 'text-theme-primary' : 'text-slate-700 group-hover:text-theme-primary'}`}>{name}</span>
      </div>
      <div className={`grid transition-[grid-template-rows,opacity] duration-400 ease-[cubic-bezier(0.4,0,0.2,1)] ${expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <div className="ml-2.5 pl-6 border-l-2 border-slate-100 pt-1 pb-2">
            {shouldRenderChildren && (
              <>
                {isActive && <div className="mt-2"><OfficialGroupConnector path={fullPath} scopeName="Branch-wide" onSelectGroup={onSelectGroup} /></div>}
                {Object.entries(specializations).map(([spec, years]) => {
                  const isVisible = activePath.length <= 3 || activePath[3] === spec;
                  return (
                    <NodeVisibilityWrapper key={spec} isVisible={isVisible}>
                      <SpecializationNode name={spec} years={years} path={fullPath} onSelectGroup={onSelectGroup} expandedPaths={expandedPaths} toggleExpand={toggleExpand} activePath={activePath} />
                    </NodeVisibilityWrapper>
                  );
                })}
</>
            )}
          </div>
        </div>
      </div>
    </div>
    );
}

function SpecializationNode({ name, years, path, onSelectGroup, expandedPaths, toggleExpand, activePath }) {
  const fullPath = [...path, name];
  const expanded = expandedPaths.has(fullPath.join('|'));
  const isActive = activePath.join('|') === fullPath.join('|');
  const shouldRenderChildren = useDelayedUnmount(expanded, 400);
  
  return (
    <div className="relative before:absolute before:left-[-26px] before:top-[10px] before:w-[20px] before:h-[2px] before:bg-slate-100">
      <div className={`flex items-center gap-2 group cursor-pointer w-full py-1.5 px-2 -ml-2 rounded-lg transition-colors duration-300 ${isActive ? 'bg-slate-50' : 'hover:bg-slate-50/50'}`} onClick={() => toggleExpand(fullPath, expanded)}>
        <button className={`w-5 h-5 flex items-center justify-center rounded-md transition-colors duration-300 ${isActive ? 'bg-white shadow-sm text-theme-primary' : 'hover:bg-slate-100 text-slate-400'}`}>
          {expanded ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg> : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>}
        </button>
        <span className={`text-[15px] font-bold transition-colors duration-300 ${isActive ? 'text-theme-primary' : 'text-slate-700 group-hover:text-theme-primary'}`}>{name}</span>
      </div>
      <div className={`grid transition-[grid-template-rows,opacity] duration-400 ease-[cubic-bezier(0.4,0,0.2,1)] ${expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <div className="ml-2.5 pl-6 border-l-2 border-slate-100 pt-1 pb-2">
            {shouldRenderChildren && (
              <>
                {isActive && <div className="mt-2"><OfficialGroupConnector path={fullPath} scopeName="Specialization-wide" onSelectGroup={onSelectGroup} /></div>}
                {Object.entries(years).map(([year, sections]) => {
                  const isVisible = activePath.length <= 4 || activePath[4] === year;
                  return (
                    <NodeVisibilityWrapper key={year} isVisible={isVisible}>
                      <YearNode name={year} sections={sections} path={fullPath} onSelectGroup={onSelectGroup} expandedPaths={expandedPaths} toggleExpand={toggleExpand} activePath={activePath} />
                    </NodeVisibilityWrapper>
                  );
                })}
</>
            )}
          </div>
        </div>
      </div>
    </div>
    );
}

function YearNode({ name, sections, path, onSelectGroup, expandedPaths, toggleExpand, activePath }) {
  const fullPath = [...path, name];
  const expanded = expandedPaths.has(fullPath.join('|'));
  const isActive = activePath.join('|') === fullPath.join('|');
  const shouldRenderChildren = useDelayedUnmount(expanded, 400);
  
  return (
    <div className="relative before:absolute before:left-[-26px] before:top-[10px] before:w-[20px] before:h-[2px] before:bg-slate-100">
      <div className={`flex items-center gap-2 group cursor-pointer w-full py-1.5 px-2 -ml-2 rounded-lg transition-colors duration-300 ${isActive ? 'bg-slate-50' : 'hover:bg-slate-50/50'}`} onClick={() => toggleExpand(fullPath, expanded)}>
        <button className={`w-5 h-5 flex items-center justify-center rounded-md transition-colors duration-300 ${isActive ? 'bg-white shadow-sm text-theme-primary' : 'hover:bg-slate-100 text-slate-400'}`}>
          {expanded ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg> : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>}
        </button>
        <span className={`text-[15px] font-bold transition-colors duration-300 ${isActive ? 'text-theme-primary' : 'text-slate-700 group-hover:text-theme-primary'}`}>{name}</span>
      </div>
      <div className={`grid transition-[grid-template-rows,opacity] duration-400 ease-[cubic-bezier(0.4,0,0.2,1)] ${expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <div className="ml-2.5 pl-6 border-l-2 border-slate-100 pt-1 pb-2">
            {shouldRenderChildren && (
              <>
                {isActive && <div className="mt-2"><OfficialGroupConnector path={fullPath} scopeName="Year-wide" onSelectGroup={onSelectGroup} /></div>}
                {Object.entries(sections).map(([sec]) => {
                  const isVisible = activePath.length <= 5 || activePath[5] === sec;
                  return (
                    <NodeVisibilityWrapper key={sec} isVisible={isVisible}>
                      <SectionNode name={sec} path={fullPath} onSelectGroup={onSelectGroup} activePath={activePath} setActivePath={toggleExpand} expandedPaths={expandedPaths} toggleExpand={toggleExpand} />
                    </NodeVisibilityWrapper>
                  );
                })}
</>
            )}
          </div>
        </div>
      </div>
    </div>
    );
}

function SectionNode({ name, path, onSelectGroup, activePath, setActivePath, expandedPaths, toggleExpand }) {
  const fullPath = [...path, name];
  const isActive = activePath.join('|') === fullPath.join('|');
  const expanded = expandedPaths.has(fullPath.join('|'));
  const shouldRenderChildren = useDelayedUnmount(expanded, 400);
  
  return (
    <div className="relative before:absolute before:left-[-26px] before:top-[10px] before:w-[20px] before:h-[2px] before:bg-slate-100">
      <div className={`flex items-center gap-2 group cursor-pointer w-full py-1.5 px-2 -ml-2 rounded-lg transition-colors duration-300 ${isActive ? 'bg-slate-50' : 'hover:bg-slate-50/50'}`} onClick={() => toggleExpand(fullPath, expanded)}>
        <button className={`w-5 h-5 flex items-center justify-center rounded-md transition-colors duration-300 ${isActive ? 'bg-white shadow-sm text-theme-primary' : 'hover:bg-slate-100 text-slate-400'}`}>
          {expanded ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg> : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>}
        </button>
        <span className={`text-[15px] font-bold transition-colors duration-300 ${isActive ? 'text-theme-primary' : 'text-slate-700 group-hover:text-theme-primary'}`}>{name}</span>
      </div>
      <div className={`grid transition-[grid-template-rows,opacity] duration-400 ease-[cubic-bezier(0.4,0,0.2,1)] ${expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <div className="ml-2.5 pl-6 border-l-2 border-slate-100 pt-1 pb-2">
            {shouldRenderChildren && isActive && <div className="mt-2"><OfficialGroupConnector path={fullPath} scopeName="Section-wide" onSelectGroup={onSelectGroup} /></div>}
          </div>
        </div>
      </div>
    </div>
  );
}
