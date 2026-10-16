import { useState, useEffect } from 'react';
import { Icons } from './Icons';
import { teacherProfile } from './mockData';
import DashboardHome from './DashboardHome';
import { 
  ClassesView, 
  StudentsView, 
  AttendanceView, 
  GradesView, 
  AnnouncementsView, 
  ScheduleView,
  ProfileView
} from './TeacherViews';
import AcademicSpacesView from './AcademicSpacesView';
import { auth } from '../../firebase/config';
import { subscribeTeacherAllocations } from '../../services/attendanceService';

export default function TeacherApp({ userProfile, onLogout }) {
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilterChip, setActiveFilterChip] = useState('All');
  const [allocations, setAllocations] = useState([]);
  const [isLoadingAllocations, setIsLoadingAllocations] = useState(true);

  const teacherUid = userProfile?.uid || auth?.currentUser?.uid || '';
  const institution = userProfile?.institution || '';
  const teacherName = userProfile?.name || teacherProfile.name;

  useEffect(() => {
    if (!teacherUid) {
      setAllocations([]);
      setIsLoadingAllocations(false);
      return;
    }

    setIsLoadingAllocations(true);
    const unsubscribe = subscribeTeacherAllocations(
      { institution: institution || undefined, teacherUid },
      (updatedAllocs) => {
        setAllocations(updatedAllocs);
        setIsLoadingAllocations(false);
      },
      (err) => {
        console.warn('TeacherApp allocations subscription error:', err);
        setIsLoadingAllocations(false);
      }
    );

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [teacherUid, institution]);

  const generalNavItems = [
    { id: 'Dashboard', label: 'Dashboard', icon: <Icons.Dashboard /> },
    { id: 'Schedule', label: 'Schedule', icon: <Icons.Schedule /> },
    { id: 'Academic Spaces', label: 'Academic Spaces', icon: <Icons.Hierarchy /> },
    { id: 'My Classes', label: 'My Classes', icon: <Icons.Classes /> },
  ];

  const toolsNavItems = [
    { id: 'Students', label: 'Students', icon: <Icons.Students /> },
    { id: 'Attendance', label: 'Attendance', icon: <Icons.Attendance /> },
    { id: 'Grades', label: 'Grades / Marks', icon: <Icons.Grades /> },
    { id: 'Announcements', label: 'Announcements', icon: <Icons.Announcements /> },
  ];

  const bottomNavItems = [
    { id: 'Profile', label: 'Profile', icon: <Icons.Profile /> },
    { id: 'Settings', label: 'Settings', icon: <Icons.Settings /> },
    { id: 'Logout', label: 'Log out', icon: <Icons.Logout />, onClick: onLogout },
  ];

  const renderContent = () => {
    switch(activeTab) {
      case 'Dashboard': 
        return (
          <DashboardHome 
            onNavigate={setActiveTab} 
            userProfile={userProfile} 
            allocations={allocations} 
            isLoadingAllocations={isLoadingAllocations} 
          />
        );
      case 'Academic Spaces': 
        return (
          <AcademicSpacesView 
            userProfile={userProfile} 
            allocations={allocations} 
            isLoadingAllocations={isLoadingAllocations} 
          />
        );
      case 'My Classes': 
        return (
          <ClassesView 
            userProfile={userProfile} 
            allocations={allocations} 
            isLoadingAllocations={isLoadingAllocations} 
          />
        );
      case 'Students': 
        return (
          <StudentsView 
            userProfile={userProfile} 
            allocations={allocations} 
            isLoadingAllocations={isLoadingAllocations} 
          />
        );
      case 'Attendance': 
        return (
          <AttendanceView 
            userProfile={userProfile} 
            allocations={allocations} 
            isLoadingAllocations={isLoadingAllocations} 
          />
        );
      case 'Grades': 
        return (
          <GradesView 
            userProfile={userProfile} 
            allocations={allocations} 
            isLoadingAllocations={isLoadingAllocations} 
          />
        );
      case 'Announcements': 
        return (
          <AnnouncementsView 
            userProfile={userProfile} 
            allocations={allocations} 
            isLoadingAllocations={isLoadingAllocations} 
          />
        );
      case 'Schedule': 
        return (
          <ScheduleView 
            userProfile={userProfile} 
            allocations={allocations} 
            isLoadingAllocations={isLoadingAllocations} 
          />
        );
      case 'Profile': 
        return (
          <ProfileView 
            userProfile={userProfile} 
            allocations={allocations} 
            isLoadingAllocations={isLoadingAllocations} 
          />
        );
      default: 
        return <div className="p-8 text-[#858174]">View under construction</div>;
    }
  };

  const handleNavClick = (id, onClick) => {
    if (onClick) onClick();
    else setActiveTab(id);
    setIsMobileMenuOpen(false);
  };

  return (
    <div 
      className="flex h-screen h-[100dvh] bg-[#F8F3E6] font-sans text-[#171717] overflow-hidden selection:bg-[#F5E5EE] selection:text-[#171717]"
      style={{
        '--theme-primary': '#171717',
        '--theme-bg': '#F5E5EE',
        '--color-ivory': '#F8F3E6',
        '--color-charcoal': '#171717',
        '--color-muted': '#858174',
        '--color-pink': '#EFA9D1',
        '--color-yellow': '#F3D75E',
        '--color-green': '#A9BD78',
        '--color-blue': '#B7C9EA',
        '--color-border': '#D8D1C3',
        '--color-hover': '#F5E5EE'
      }}
    >
      
      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-[#171717]/40 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Premium Charcoal Sidebar matching reference image */}
      <aside className={`fixed inset-y-0 left-0 z-50 bg-[#171717] text-white flex flex-col transform transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] lg:translate-x-0 lg:static ${
        isMobileMenuOpen ? 'translate-x-0 shadow-2xl w-64' : '-translate-x-full'
      } ${
        isSidebarCollapsed ? 'lg:w-[82px]' : 'lg:w-[240px]'
      } m-0 lg:m-3.5 lg:rounded-[28px] overflow-hidden lg:overflow-visible flex-shrink-0 border border-[#171717] relative`}>
        
        {/* Brand Header */}
        <div className={`p-6 flex items-center h-[82px] select-none relative ${isSidebarCollapsed ? 'justify-center px-2' : 'justify-between'}`}>
          {isSidebarCollapsed ? (
            <div 
              onClick={() => setIsSidebarCollapsed(false)}
              className="flex items-center justify-center cursor-pointer group"
              title="Expand sidebar"
            >
              <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-1.5">
                <span className="font-extrabold text-2xl tracking-tight lowercase">s</span>
                <span className="w-2 h-2 rounded-full bg-[#EFA9D1] inline-block -mt-1 shadow-sm animate-pulse"></span>
              </h2>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2.5">
                <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                  <span className="font-extrabold text-2xl tracking-tight lowercase">sangam</span>
                  <span className="w-2.5 h-2.5 rounded-full bg-[#EFA9D1] inline-block -mt-1 shadow-sm animate-pulse"></span>
                </h2>
              </div>

              <button 
                type="button"
                className="hidden lg:flex w-7 h-7 rounded-lg bg-white/[0.06] hover:bg-white/[0.14] text-white/70 hover:text-white items-center justify-center transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-1.5 focus-visible:ring-white/40"
                onClick={() => setIsSidebarCollapsed(true)}
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            </>
          )}

          {/* Mobile close menu button */}
          <button 
            type="button"
            className="lg:hidden text-white/60 hover:text-white transition-colors" 
            onClick={() => setIsMobileMenuOpen(false)}
            aria-label="Close menu"
          >
            <Icons.Close />
          </button>
        </div>

        {/* Persistent, discoverable Expand Control at the Edge of Sidebar */}
        {isSidebarCollapsed && (
          <button 
            type="button"
            className="hidden lg:flex absolute -right-3.5 top-7 z-50 w-7 h-7 rounded-full bg-[#171717] border border-white/20 hover:border-white/40 hover:bg-[#262626] text-white/80 hover:text-white shadow-md items-center justify-center transition-all duration-150 cursor-pointer group active:scale-95 focus-visible:outline-none focus-visible:ring-1.5 focus-visible:ring-white/40"
            onClick={() => setIsSidebarCollapsed(false)}
            aria-label="Expand sidebar"
            title="Expand sidebar"
          >
            <svg className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform duration-150" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}

        {/* Navigation Sections */}
        <nav className={`flex-1 py-2 px-3 text-[13px] ${
          isSidebarCollapsed ? 'overflow-visible space-y-1' : 'overflow-y-auto space-y-6 scrollbar-hide'
        }`}>
          
          {/* General Section */}
          <div>
            {!isSidebarCollapsed && (
              <p className="px-3 text-[11px] font-semibold text-white/40 tracking-wider uppercase mb-1.5 select-none">
                General
              </p>
            )}
            <div className="space-y-1">
              {generalNavItems.map(item => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavClick(item.id)}
                    aria-label={item.label}
                    className={`relative group flex items-center transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-1.5 focus-visible:ring-white/40 focus-visible:ring-offset-1 focus-visible:ring-offset-[#171717] cursor-pointer select-none ${
                      isSidebarCollapsed 
                        ? 'w-11 h-11 mx-auto justify-center rounded-xl' 
                        : 'w-full h-10 px-3 justify-start gap-3 rounded-xl'
                    } ${
                      isActive 
                        ? 'bg-white/[0.08] text-white font-medium' 
                        : 'text-white/60 hover:bg-white/[0.05] hover:text-white'
                    }`}
                  >
                    {/* Restrained Accent Indicator */}
                    {isActive && (
                      <span 
                        aria-hidden="true" 
                        className={`absolute left-1 w-[3px] rounded-full bg-[#EFA9D1] transition-all duration-150 ${
                          isSidebarCollapsed ? 'top-2.5 bottom-2.5' : 'top-2 bottom-2'
                        }`} 
                      />
                    )}

                    {/* Icon */}
                    <span className={`w-5 h-5 flex items-center justify-center flex-shrink-0 transition-colors duration-150 ${
                      isActive ? 'text-[#EFA9D1]' : 'text-current'
                    }`}>
                      {item.icon}
                    </span>

                    {/* Label (Only in expanded mode) */}
                    {!isSidebarCollapsed && (
                      <span className="text-[13px] font-medium leading-none whitespace-nowrap text-inherit truncate">
                        {item.label}
                      </span>
                    )}

                    {/* Collapsed Tooltip */}
                    {isSidebarCollapsed && (
                      <div 
                        role="tooltip"
                        className="absolute left-full ml-3 px-2.5 py-1 bg-[#262626] text-white text-[11px] font-medium rounded-lg shadow-lg border border-white/10 whitespace-nowrap z-50 pointer-events-none opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 ease-out"
                      >
                        {item.label}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Collapsed Mode Divider */}
          {isSidebarCollapsed && (
            <div className="w-8 h-px bg-white/10 mx-auto my-2.5" aria-hidden="true" />
          )}

          {/* Tools & Academic Section */}
          <div>
            {!isSidebarCollapsed && (
              <p className="px-3 text-[11px] font-semibold text-white/40 tracking-wider uppercase mb-1.5 select-none">
                Academic & Tools
              </p>
            )}
            <div className="space-y-1">
              {toolsNavItems.map(item => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavClick(item.id)}
                    aria-label={item.label}
                    className={`relative group flex items-center transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-1.5 focus-visible:ring-white/40 focus-visible:ring-offset-1 focus-visible:ring-offset-[#171717] cursor-pointer select-none ${
                      isSidebarCollapsed 
                        ? 'w-11 h-11 mx-auto justify-center rounded-xl' 
                        : 'w-full h-10 px-3 justify-start gap-3 rounded-xl'
                    } ${
                      isActive 
                        ? 'bg-white/[0.08] text-white font-medium' 
                        : 'text-white/60 hover:bg-white/[0.05] hover:text-white'
                    }`}
                  >
                    {/* Restrained Accent Indicator */}
                    {isActive && (
                      <span 
                        aria-hidden="true" 
                        className={`absolute left-1 w-[3px] rounded-full bg-[#EFA9D1] transition-all duration-150 ${
                          isSidebarCollapsed ? 'top-2.5 bottom-2.5' : 'top-2 bottom-2'
                        }`} 
                      />
                    )}

                    {/* Icon */}
                    <span className={`w-5 h-5 flex items-center justify-center flex-shrink-0 transition-colors duration-150 ${
                      isActive ? 'text-[#EFA9D1]' : 'text-current'
                    }`}>
                      {item.icon}
                    </span>

                    {/* Label (Only in expanded mode) */}
                    {!isSidebarCollapsed && (
                      <span className="text-[13px] font-medium leading-none whitespace-nowrap text-inherit truncate">
                        {item.label}
                      </span>
                    )}

                    {/* Collapsed Tooltip */}
                    {isSidebarCollapsed && (
                      <div 
                        role="tooltip"
                        className="absolute left-full ml-3 px-2.5 py-1 bg-[#262626] text-white text-[11px] font-medium rounded-lg shadow-lg border border-white/10 whitespace-nowrap z-50 pointer-events-none opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 ease-out"
                      >
                        {item.label}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </nav>

        {/* Bottom Actions */}
        <div className={`p-3 border-t border-white/10 space-y-1 text-[13px] relative ${
          isSidebarCollapsed ? 'px-2' : 'px-3'
        }`}>
          {bottomNavItems.map(item => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id, item.onClick)}
                aria-label={item.label}
                className={`relative group flex items-center transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-1.5 focus-visible:ring-white/40 focus-visible:ring-offset-1 focus-visible:ring-offset-[#171717] cursor-pointer select-none ${
                  isSidebarCollapsed 
                    ? 'w-11 h-11 mx-auto justify-center rounded-xl' 
                    : 'w-full h-10 px-3 justify-start gap-3 rounded-xl'
                } ${
                  isActive 
                    ? 'bg-white/[0.08] text-white font-medium' 
                    : 'text-white/50 hover:bg-white/[0.05] hover:text-white'
                }`}
              >
                {/* Restrained Accent Indicator */}
                {isActive && (
                  <span 
                    aria-hidden="true" 
                    className={`absolute left-1 w-[3px] rounded-full bg-[#EFA9D1] transition-all duration-150 ${
                      isSidebarCollapsed ? 'top-2.5 bottom-2.5' : 'top-2 bottom-2'
                    }`} 
                  />
                )}

                {/* Icon */}
                <span className={`w-5 h-5 flex items-center justify-center flex-shrink-0 transition-colors duration-150 ${
                  isActive ? 'text-[#EFA9D1]' : 'text-white/50 group-hover:text-white'
                }`}>
                  {item.icon}
                </span>

                {/* Label (Only in expanded mode) */}
                {!isSidebarCollapsed && (
                  <span className="text-[13px] font-medium leading-none whitespace-nowrap text-inherit truncate">
                    {item.label}
                  </span>
                )}

                {/* Collapsed Tooltip */}
                {isSidebarCollapsed && (
                  <div 
                    role="tooltip"
                    className="absolute left-full ml-3 px-2.5 py-1 bg-[#262626] text-white text-[11px] font-medium rounded-lg shadow-lg border border-white/10 whitespace-nowrap z-50 pointer-events-none opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 ease-out"
                  >
                    {item.label}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </aside>

      {/* Main Viewport */}
      <main className="flex-1 flex flex-col h-screen h-[100dvh] overflow-hidden bg-[#F8F3E6] relative">
        
        {/* Top Header Bar: Cleaned up on Teacher Dashboard to reclaim space and eliminate top-right clutter */}
        {activeTab === 'Dashboard' ? (
          /* Mobile-only menu toggle for dashboard */
          <div className="lg:hidden px-6 py-3 flex items-center justify-between border-b border-[#D8D1C3]/40 bg-[#F8F3E6]">
            <button 
              className="text-[#171717] p-2 -ml-2 rounded-xl hover:bg-[#F5E5EE] transition-all"
              onClick={() => setIsMobileMenuOpen(true)}
              aria-label="Open mobile menu"
            >
              <Icons.Menu />
            </button>
          </div>
        ) : (
          <header className="px-6 lg:px-10 py-5 flex items-center justify-between gap-4 z-40 bg-[#F8F3E6]/95 backdrop-blur-md border-b border-[#D8D1C3]/50 sticky top-0">
            
            {/* Mobile menu button */}
            <button 
              className="lg:hidden text-[#171717] p-2 -ml-2 rounded-xl hover:bg-[#F5E5EE] transition-all"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Icons.Menu />
            </button>

            {/* Search bar with filter pills matching reference */}
            <div className="flex-1 max-w-xl">
              <div className="bg-white/80 border border-[#D8D1C3] rounded-full px-3.5 py-1.5 flex items-center gap-2.5 shadow-sm hover:border-[#171717]/30 transition-all focus-within:border-[#171717] focus-within:ring-2 focus-within:ring-[#171717]/5">
                <span className="w-6 h-6 rounded-full bg-[#EFA9D1]/30 text-[#171717] flex items-center justify-center flex-shrink-0 text-xs">
                  🔍
                </span>
                <input 
                  type="text"
                  placeholder="Search classes, assignments, students..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent text-xs sm:text-sm text-[#171717] placeholder-[#858174] focus:outline-none flex-1 font-medium"
                />
                <div className="hidden sm:flex items-center gap-1.5 border-l border-[#D8D1C3] pl-2 text-[11px] text-[#858174]">
                  <span className="font-semibold text-[10px] text-[#858174]/70 mr-0.5">In:</span>
                  {['Classes', 'Assignments', 'Students'].map(filter => (
                    <button
                      key={filter}
                      onClick={() => setActiveFilterChip(activeFilterChip === filter ? 'All' : filter)}
                      className={`px-2 py-0.5 rounded-full border transition-all text-[10px] font-semibold ${
                        activeFilterChip === filter 
                          ? 'bg-[#171717] text-white border-[#171717]' 
                          : 'bg-white border-[#D8D1C3] text-[#858174] hover:border-[#171717]/40 hover:text-[#171717]'
                      }`}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Header Controls (Notif, Settings, Profile Avatar) */}
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setActiveTab('Announcements')}
                className="w-9 h-9 rounded-full bg-white border border-[#D8D1C3] flex items-center justify-center text-[#171717] hover:bg-[#F5E5EE] transition-all relative group shadow-sm active:scale-95"
                title="Announcements & Notices"
              >
                <span className="w-2 h-2 rounded-full bg-[#EFA9D1] absolute top-2 right-2 border border-white"></span>
                <Icons.Announcements />
              </button>

              <button 
                onClick={() => setActiveTab('Settings')}
                className="w-9 h-9 rounded-full bg-white border border-[#D8D1C3] flex items-center justify-center text-[#171717] hover:bg-[#F5E5EE] transition-all shadow-sm active:scale-95 hidden sm:flex"
                title="Settings"
              >
                <Icons.Settings />
              </button>

              <div 
                onClick={() => setActiveTab('Profile')}
                className="flex items-center gap-2 pl-2 cursor-pointer group"
              >
                <div className="w-9 h-9 rounded-full bg-[#EFA9D1] border border-[#EFA9D1] text-[#171717] font-extrabold flex items-center justify-center text-xs shadow-sm group-hover:scale-105 transition-transform">
                  {teacherProfile.avatar || 'SJ'}
                </div>
                <div className="hidden md:block text-left">
                  <p className="text-xs font-bold text-[#171717] leading-tight group-hover:text-[#858174] transition-colors">{teacherName}</p>
                  <p className="text-[10px] font-medium text-[#858174] leading-tight">Faculty</p>
                </div>
              </div>
            </div>
          </header>
        )}

        {/* Main Content Area (Fixed non-scrollable on Dashboard, scrollable on other tabs) */}
        <div className={`flex-1 ${activeTab === 'Dashboard' ? 'overflow-hidden px-6 lg:px-10 pt-5 pb-0 h-full flex flex-col' : 'overflow-y-auto px-6 lg:px-10 pb-12 pt-6 scroll-smooth'}`}>
          <div key={activeTab} className={`max-w-7xl mx-auto relative z-10 w-full transition-all duration-300 animate-fade-in ${activeTab === 'Dashboard' ? 'h-full flex flex-col justify-start' : ''}`}>
            {renderContent()}
          </div>
        </div>
      </main>
    </div>
  );
}
