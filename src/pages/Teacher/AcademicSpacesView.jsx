import { useState } from 'react';
import { teacherAllocations } from './mockData';
import { Icons } from './Icons';

export default function AcademicSpacesView() {
  const buildTree = (allocations) => {
    const tree = {};
    allocations.forEach(alloc => {
      if (!tree[alloc.institution]) tree[alloc.institution] = {};
      if (!tree[alloc.institution][alloc.department]) tree[alloc.institution][alloc.department] = {};
      if (!tree[alloc.institution][alloc.department][alloc.year]) tree[alloc.institution][alloc.department][alloc.year] = {};
      if (!tree[alloc.institution][alloc.department][alloc.year][alloc.section]) tree[alloc.institution][alloc.department][alloc.year][alloc.section] = {};
      tree[alloc.institution][alloc.department][alloc.year][alloc.section][alloc.subject] = alloc.permissions;
    });
    return tree;
  };

  const tree = buildTree(teacherAllocations);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [expandedPaths, setExpandedPaths] = useState(new Set());
  const [activePath, setActivePath] = useState([]);

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
    <div className="space-y-6 animate-fade-in relative z-10 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">My Academic Spaces</h2>
        <span className="text-xs font-bold text-slate-500 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm">
          Allocated Hierarchy View
        </span>
      </div>
      
      {currentPathForBreadcrumb.length > 0 && (
        <BreadcrumbNav activePath={currentPathForBreadcrumb} onNavigateBack={handleNavigateBack} onNavigateTo={handleNavigateTo} />
      )}

      <div className="bg-white rounded-[24px] border border-slate-100 p-6 md:p-8 shadow-[0_2px_20px_rgba(0,0,0,0.02)] overflow-x-auto">
        <div className="min-w-[500px]">
          {Object.entries(tree).map(([inst, depts]) => (
            <InstitutionNode key={inst} name={inst} departments={depts} onSelectGroup={setSelectedGroup} expandedPaths={expandedPaths} toggleExpand={toggleExpand} setActivePath={setActivePath} />
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

function InstitutionNode({ name, departments, onSelectGroup, expandedPaths, toggleExpand, setActivePath }) {
  // Institution acts as the root active path when clicked, but it's always "expanded" visually.
  // We can set it as activePath when clicked.
  return (
    <div className="space-y-4">
      <div 
        className="flex items-center gap-3 cursor-pointer group w-fit"
        onClick={() => setActivePath([name])}
      >
        <div className="w-10 h-10 rounded-xl bg-theme-bg text-theme-primary flex items-center justify-center font-bold text-lg shadow-sm group-hover:scale-105 transition-transform">
          {name.charAt(0)}
        </div>
        <h3 className="text-xl font-extrabold text-slate-900 tracking-tight group-hover:text-theme-primary transition-colors">{name}</h3>
      </div>
      <div className="ml-5 pl-6 border-l-2 border-slate-100 space-y-6 mt-3">
        {Object.entries(departments).map(([dept, years]) => (
          <DepartmentNode key={dept} name={dept} years={years} path={[name]} onSelectGroup={onSelectGroup} expandedPaths={expandedPaths} toggleExpand={toggleExpand} />
        ))}
      </div>
    </div>
  );
}

function DepartmentNode({ name, years, path, onSelectGroup, expandedPaths, toggleExpand }) {
  const fullPath = [...path, name];
  const expanded = expandedPaths.has(fullPath.join('|'));
  return (
    <div className="space-y-3 relative before:absolute before:left-[-26px] before:top-[12px] before:w-[20px] before:h-[2px] before:bg-slate-100">
      <div className="flex items-center gap-2 group cursor-pointer w-fit" onClick={() => toggleExpand(fullPath, expanded)}>
        <button className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-slate-100 text-slate-400 transition-colors">
          {expanded ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg> : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>}
        </button>
        <h4 className="text-lg font-bold text-slate-800 group-hover:text-theme-primary transition-colors">{name}</h4>
      </div>
      {expanded && (
        <div className="ml-3 pl-6 border-l-2 border-slate-100 space-y-5">
          {Object.entries(years).map(([year, sections]) => (
            <YearNode key={year} name={year} sections={sections} path={fullPath} onSelectGroup={onSelectGroup} expandedPaths={expandedPaths} toggleExpand={toggleExpand} />
          ))}
        </div>
      )}
    </div>
  );
}

function YearNode({ name, sections, path, onSelectGroup, expandedPaths, toggleExpand }) {
  const fullPath = [...path, name];
  const expanded = expandedPaths.has(fullPath.join('|'));
  return (
    <div className="space-y-3 relative before:absolute before:left-[-26px] before:top-[10px] before:w-[20px] before:h-[2px] before:bg-slate-100">
      <div className="flex items-center gap-2 group cursor-pointer w-fit" onClick={() => toggleExpand(fullPath, expanded)}>
        <button className="w-5 h-5 flex items-center justify-center rounded-md hover:bg-slate-100 text-slate-400 transition-colors">
          {expanded ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg> : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>}
        </button>
        <span className="text-[15px] font-bold text-slate-700 group-hover:text-theme-primary transition-colors">{name}</span>
      </div>
      {expanded && (
        <div className="ml-2.5 pl-6 border-l-2 border-slate-100 space-y-4">
          {Object.entries(sections).map(([sec, subjects]) => (
            <SectionNode key={sec} name={sec} subjects={subjects} path={fullPath} onSelectGroup={onSelectGroup} expandedPaths={expandedPaths} toggleExpand={toggleExpand} />
          ))}
        </div>
      )}
    </div>
  );
}

function SectionNode({ name, subjects, path, onSelectGroup, expandedPaths, toggleExpand }) {
  const fullPath = [...path, name];
  const expanded = expandedPaths.has(fullPath.join('|'));
  return (
    <div className="space-y-3 relative before:absolute before:left-[-26px] before:top-[10px] before:w-[20px] before:h-[2px] before:bg-slate-100">
      <div className="flex items-center gap-2 group cursor-pointer w-fit" onClick={() => toggleExpand(fullPath, expanded)}>
        <button className="w-5 h-5 flex items-center justify-center rounded-md hover:bg-slate-100 text-slate-400 transition-colors">
          {expanded ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg> : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>}
        </button>
        <span className="text-sm font-bold text-slate-600 group-hover:text-theme-primary transition-colors">{name}</span>
      </div>
      {expanded && (
        <div className="ml-2.5 pl-6 border-l-2 border-slate-100 space-y-4 pb-2">
          {Object.entries(subjects).map(([subject, permissions]) => (
            <SubjectNode key={subject} name={subject} permissions={permissions} path={fullPath} onSelectGroup={onSelectGroup} expandedPaths={expandedPaths} toggleExpand={toggleExpand} />
          ))}
        </div>
      )}
    </div>
  );
}

function SubjectNode({ name, permissions, path, onSelectGroup }) {
  return (
    <div className="flex items-start gap-3 relative before:absolute before:left-[-26px] before:top-[10px] before:w-[20px] before:h-[2px] before:bg-slate-100">
      <div className="flex flex-col flex-1 space-y-2">
         <div className="flex items-center gap-2 w-fit">
           <span className="text-sm font-bold text-slate-800">{name}</span>
           <div className="flex gap-1.5 ml-3">
             {permissions.map(p => (
               <span key={p} className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500 border border-slate-200">{p}</span>
             ))}
           </div>
         </div>
         <div className="ml-1 pl-5 border-l-2 border-slate-100 pt-2">
           <div 
             onClick={() => onSelectGroup({ name: "Official Group", permissions, path: [...path, name] })}
             className="flex items-center justify-between bg-slate-50/50 border border-slate-100 rounded-xl p-3 cursor-pointer hover:shadow-[0_4px_12px_rgba(0,0,0,0.03)] hover:border-theme-primary/30 hover:bg-white transition-all group w-full max-w-sm relative before:absolute before:left-[-21px] before:top-[20px] before:w-[20px] before:h-[2px] before:bg-slate-100"
           >
             <div className="flex items-center gap-3">
               <div className="w-10 h-10 rounded-xl bg-white border border-slate-100 text-theme-primary flex items-center justify-center transition-transform group-hover:scale-105 shadow-sm">
                 <Icons.Announcements />
               </div>
               <div>
                 <p className="text-sm font-bold text-slate-900 group-hover:text-theme-primary transition-colors">Official Group</p>
                 <p className="text-[11px] text-slate-500 font-medium mt-0.5">Section-wide announcements</p>
               </div>
             </div>
             <button className="text-xs font-bold text-theme-primary px-3 py-1.5 bg-theme-bg/50 group-hover:bg-theme-bg rounded-lg transition-colors border border-transparent group-hover:border-theme-primary/10">
               Enter
             </button>
           </div>
         </div>
      </div>
    </div>
  );
}

function OfficialGroupView({ group }) {
  const canAnnounce = group.permissions.includes('Announce') || group.permissions.includes('Manage');
  const [announcements, setAnnouncements] = useState([
    {
      id: 1,
      title: 'Upcoming DSA Lab',
      content: 'Lab will be held on Friday in Room 304. Please bring your laptops with the dev environment configured.',
      author: 'Dr. Sarah Jenkins',
      time: '2 hours ago'
    }
  ]);
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');

  const handlePublish = () => {
    if (!newTitle.trim() || !newContent.trim()) return;
    setAnnouncements([{
      id: Date.now(),
      title: newTitle,
      content: newContent,
      author: 'Dr. Sarah Jenkins',
      time: 'Just now'
    }, ...announcements]);
    setIsCreating(false);
    setNewTitle('');
    setNewContent('');
  };
  
  // breadcrumbs handled in parent

  return (
    <div className="space-y-6 animate-fade-in relative z-10 pb-10">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Official Group</h2>
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
              <h3 className="text-lg font-bold text-slate-900">Section-wide announcements</h3>
              <div className="flex gap-2 mt-1.5">
                {group.permissions.map(p => (
                  <span key={p} className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-500">{p}</span>
                ))}
              </div>
            </div>
          </div>
          {canAnnounce && !isCreating && (
            <button onClick={() => setIsCreating(true)} className="flex items-center gap-2 bg-theme-primary text-white px-5 py-2.5 rounded-xl hover:opacity-90 transition-all shadow-sm font-bold text-sm">
              <Icons.Plus /> Create Announcement
            </button>
          )}
        </div>

        <div className="p-6 sm:p-8 space-y-6">
          {/* Create Announcement Form */}
          {isCreating && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 mb-8 animate-fade-in">
              <h4 className="text-sm font-bold text-slate-900 mb-4">New Announcement</h4>
              <input 
                type="text" 
                placeholder="Announcement Title" 
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                className="w-full mb-3 px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-theme-primary/20 focus:border-theme-primary text-sm font-medium transition-all"
              />
              <textarea 
                placeholder="Write your message here..." 
                rows="4"
                value={newContent}
                onChange={e => setNewContent(e.target.value)}
                className="w-full mb-4 px-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-theme-primary/20 focus:border-theme-primary text-sm font-medium transition-all resize-none"
              ></textarea>
              <div className="flex justify-end gap-3">
                <button onClick={() => setIsCreating(false)} className="px-5 py-2.5 rounded-xl text-slate-500 font-bold hover:bg-slate-200 bg-slate-100 transition-colors text-sm">Cancel</button>
                <button onClick={handlePublish} className="px-5 py-2.5 rounded-xl bg-theme-primary text-white font-bold hover:opacity-90 shadow-sm transition-all text-sm">Publish</button>
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
                <p className="text-slate-400 font-medium text-sm">No announcements yet.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
