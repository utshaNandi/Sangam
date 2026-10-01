import React, { useState } from 'react';
import { Icons } from '../Teacher/Icons'; // Reuse same icons
import SharedAcademicSpace from '../../components/SharedAcademicSpace';
import OfficialGroupView from '../../components/OfficialGroupView';
import { PeopleView, AcademicManagementView } from './DirectorViews';
import DirectorAcademicSpacesView from './DirectorAcademicSpacesView';
import DirectorDashboard from './DirectorDashboard';

export default function DirectorApp({ onLogout }) {
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const navItems = [
    { id: 'Dashboard', label: 'Dashboard', icon: <Icons.Dashboard /> },
    { id: 'Academic Space', label: 'Academic Space', icon: <Icons.Hierarchy /> },
    { id: 'People', label: 'People', icon: <Icons.Students /> },
    { id: 'Announcements', label: 'Announcements', icon: <Icons.Announcements /> },
    { id: 'Academic Management', label: 'Academic Management', icon: <Icons.Classes /> },
    { id: 'Attendance', label: 'Attendance', icon: <Icons.Attendance /> },
    { id: 'Performance', label: 'Performance', icon: <Icons.Grades /> },
    { id: 'Timetable', label: 'Timetable', icon: <Icons.Schedule /> },
    { id: 'Reports & Analytics', label: 'Reports & Analytics', icon: <Icons.Assignments /> },
    { id: 'Resources', label: 'Resources', icon: <Icons.Resources /> },
    { id: 'Communication', label: 'Communication', icon: <Icons.Announcements /> },
  ];

  const bottomNavItems = [
    { id: 'Profile', label: 'Profile', icon: <Icons.Profile /> },
    { id: 'Settings', label: 'Settings', icon: <Icons.Settings /> },
    { id: 'Logout', label: 'Logout', icon: <Icons.Logout />, onClick: onLogout },
  ];

  const renderContent = () => {
    switch(activeTab) {
      case 'Dashboard': 
        return <DirectorDashboard onNavigate={setActiveTab} />;
      case 'Academic Space': 
        return <DirectorAcademicSpacesView />;
      case 'People':
        return <PeopleView />;
      case 'Academic Management':
        return <AcademicManagementView />;
      case 'Announcements':
      case 'Attendance':
      case 'Performance':
      case 'Timetable':
      case 'Reports & Analytics':
      case 'Resources':
      case 'Communication':
        return <div className="p-8 text-slate-500 bg-white rounded-2xl border border-slate-100 shadow-sm">{activeTab} View (Under Construction)</div>;
      default: return <div className="p-8 text-slate-500">View under construction</div>;
    }
  };

  const handleNavClick = (id, onClick) => {
    if (onClick) onClick();
    else {
      setActiveTab(id);
    }
    setIsMobileMenuOpen(false);
  };

  // Using #D67756 for primary, #FFF2ED for bg
  return (
    <div 
      className="flex h-screen bg-slate-50 font-sans text-slate-800 overflow-hidden selection:bg-theme-bg selection:text-theme-primary"
      style={{
        '--theme-primary': '#D67756',
        '--theme-bg': '#FFF2ED'
      }}
    >
      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 bg-white border-r border-slate-200/60 flex flex-col transform transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] lg:translate-x-0 lg:static ${isMobileMenuOpen ? 'translate-x-0 shadow-2xl w-64' : '-translate-x-full'} ${isSidebarCollapsed ? 'lg:w-[84px]' : 'lg:w-64'}`}>
        
        {/* Logo / Header */}
        <div className={`p-6 flex items-center h-[88px] ${isSidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
           <h2 className={`text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3 transition-all duration-300 ${isSidebarCollapsed ? 'justify-center' : ''}`}>
             <span className="w-9 h-9 rounded-xl bg-theme-primary text-white flex items-center justify-center text-lg font-bold shadow-sm flex-shrink-0">S</span>
             <span className={`transition-all duration-300 overflow-hidden ${isSidebarCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>Sangam</span>
           </h2>
           <button className="lg:hidden text-slate-400 hover:text-slate-600 transition-colors" onClick={() => setIsMobileMenuOpen(false)}>
             <Icons.Close />
           </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1.5 scrollbar-hide">
           {navItems.map(item => (
             <button
               key={item.id}
               onClick={() => handleNavClick(item.id)}
               title={isSidebarCollapsed ? item.label : undefined}
               className={`w-full flex items-center py-3 rounded-xl transition-all duration-300 text-sm font-semibold relative group active:scale-[0.98] ${
                 isSidebarCollapsed ? 'justify-center px-0' : 'justify-start px-4 gap-3'
               } ${
                 activeTab === item.id 
                   ? 'bg-theme-bg text-theme-primary' 
                   : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
               }`}
             >
               <div className={`transition-transform duration-300 group-hover:scale-110 ${activeTab === item.id ? 'opacity-100 text-theme-primary scale-110' : 'opacity-70 group-hover:text-slate-700'}`}>
                 {item.icon}
               </div>
               <span className={`transition-all duration-300 overflow-hidden whitespace-nowrap ${isSidebarCollapsed ? 'w-0 opacity-0' : 'opacity-100'}`}>
                 {item.label}
               </span>
               {isSidebarCollapsed && (
                 <div className="absolute left-full ml-4 px-3 py-1.5 bg-slate-800 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 shadow-md whitespace-nowrap pointer-events-none translate-x-1 group-hover:translate-x-0">
                   {item.label}
                 </div>
               )}
             </button>
           ))}
        </nav>

        <div className="p-3 border-t border-slate-100 space-y-1.5">
           {bottomNavItems.map(item => (
             <button
               key={item.id}
               onClick={() => handleNavClick(item.id, item.onClick)}
               title={isSidebarCollapsed ? item.label : undefined}
               className={`w-full flex items-center py-3 rounded-xl transition-all duration-300 text-sm font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-800 relative group active:scale-[0.98] ${
                 isSidebarCollapsed ? 'justify-center px-0' : 'justify-start px-4 gap-3'
               }`}
             >
               <div className="opacity-70 group-hover:text-slate-700 transition-transform duration-300 group-hover:scale-110">{item.icon}</div>
               <span className={`transition-all duration-300 overflow-hidden whitespace-nowrap ${isSidebarCollapsed ? 'w-0 opacity-0' : 'opacity-100'}`}>
                 {item.label}
               </span>
               {isSidebarCollapsed && (
                 <div className="absolute left-full ml-4 px-3 py-1.5 bg-slate-800 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 shadow-md whitespace-nowrap pointer-events-none translate-x-1 group-hover:translate-x-0">
                   {item.label}
                 </div>
               )}
             </button>
           ))}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-50 relative">
         
         <header className="px-6 lg:px-10 py-4 bg-white/80 backdrop-blur-md border-b border-slate-200/60 flex justify-between items-center z-10 sticky top-0">
             <div className="flex items-center gap-4">
               <button className="lg:hidden text-slate-500 hover:text-slate-800 p-2 rounded-lg hover:bg-slate-100 transition-all active:scale-95 group" onClick={() => setIsMobileMenuOpen(true)}>
                 <div className="transition-transform duration-300 group-hover:scale-110">
                   <Icons.Menu />
                 </div>
               </button>
               <button 
                 className="hidden lg:flex text-slate-400 hover:text-slate-700 p-2 rounded-xl hover:bg-slate-100 transition-all active:scale-95 group" 
                 onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                 title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
               >
                 <div className="transition-transform duration-300 group-hover:scale-110">
                   <Icons.Menu />
                 </div>
               </button>
               <div>
                 <h1 className="text-xl font-bold text-slate-900 tracking-tight">Good morning, Director</h1>
                 <p className="text-sm text-slate-500 hidden sm:block font-medium">Overview of the Sangam ecosystem.</p>
               </div>
             </div>
             
             <div className="flex items-center gap-4">
               <button className="w-10 h-10 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-all active:scale-95 relative group">
                 <div className="absolute top-2.5 right-3 w-2 h-2 bg-rose-500 rounded-full border-2 border-white"></div>
                 <div className="transition-transform duration-300 group-hover:scale-110">
                   <Icons.Announcements />
                 </div>
               </button>
               <div className="flex items-center gap-3 pl-4 border-l border-slate-200">
                 <div className="text-right hidden sm:block">
                   <p className="text-sm font-bold text-slate-900">Dr. Alan Carter</p>
                   <p className="text-xs font-medium text-slate-500">Director</p>
                 </div>
                 <div className="w-10 h-10 rounded-full bg-theme-bg text-theme-primary flex items-center justify-center font-bold text-sm cursor-pointer hover:opacity-90 transition-all hover:shadow-md active:scale-95">
                   AC
                 </div>
               </div>
             </div>
         </header>
         
         <div className="flex-1 overflow-y-auto p-6 lg:p-10 scroll-smooth">
            <div key={activeTab} className="max-w-6xl mx-auto relative z-10 transition-all duration-300 animate-hero-fade-up" style={{ animationDuration: '400ms' }}>
              {renderContent()}
            </div>
         </div>
      </main>
    </div>
  );
}
