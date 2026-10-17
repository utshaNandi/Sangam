import { useState, useEffect } from 'react';
import { Icons } from '../Teacher/Icons';
import { fetchAnnouncements, postAnnouncement } from '../../services/announcementService.js';

export const DIRECTOR_DEPARTMENTS = [
  'Computer Science',
  'Information Technology',
  'Electronics & Communication',
  'Electrical Engineering',
  'Mechanical Engineering',
  'Civil Engineering',
  'Biotechnology',
  'Management'
];

export const DIRECTOR_YEARS = [
  '1st Year',
  '2nd Year',
  '3rd Year',
  '4th Year'
];

export const DIRECTOR_SECTIONS = [
  'Section A',
  'Section B',
  'Section C',
  'Section D',
  'Sec A',
  'Sec B',
  'Sec C',
  'Sec D'
];

export function DirectorAnnouncementsView({ userProfile }) {
  const [announcements, setAnnouncements] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'institution' | 'branch' | 'year' | 'section'

  // Form states
  const [isPostingOpen, setIsPostingOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [postError, setPostError] = useState(null);
  const [postSuccess, setPostSuccess] = useState(null);

  // Form inputs
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [scopeType, setScopeType] = useState('institution'); // 'institution' | 'branch' | 'year' | 'section'
  const [department, setDepartment] = useState('Computer Science');
  const [year, setYear] = useState('1st Year');
  const [section, setSection] = useState('Section A');
  const [priority, setPriority] = useState('normal'); // 'normal' | 'urgent'
  const [category, setCategory] = useState('general');

  const institutionName = userProfile?.institution || 'Institution';

  const loadAnnouncements = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchAnnouncements({ page: 1, limit: 50 });
      setAnnouncements(Array.isArray(data?.announcements) ? data.announcements : []);
    } catch (err) {
      console.warn('[DirectorAnnouncementsView] Error loading announcements:', err.message);
      setError(err.message || 'Failed to load announcements.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAnnouncements();
  }, [userProfile?.uid]);

  const handlePost = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setPostError(null);
    setPostSuccess(null);

    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setPostError('Please enter an announcement title.');
      return;
    }
    if (cleanTitle.length > 200) {
      setPostError('Title must be 200 characters or less.');
      return;
    }

    const cleanContent = content.trim();
    if (!cleanContent) {
      setPostError('Please enter announcement content.');
      return;
    }
    if (cleanContent.length > 5000) {
      setPostError('Content must be 5000 characters or less.');
      return;
    }

    if (scopeType !== 'institution' && !department) {
      setPostError('Please select a target department.');
      return;
    }

    if ((scopeType === 'year' || scopeType === 'section') && !year) {
      setPostError('Please select a target academic year.');
      return;
    }

    if (scopeType === 'section' && !section) {
      setPostError('Please select a target class section.');
      return;
    }

    setIsSubmitting(true);
    try {
      await postAnnouncement({
        title: cleanTitle,
        content: cleanContent,
        scopeType,
        department: scopeType !== 'institution' ? department : undefined,
        year: (scopeType === 'year' || scopeType === 'section') ? year : undefined,
        section: scopeType === 'section' ? section : undefined,
        priority,
        category: category.trim() || 'general'
      });

      setPostSuccess(
        scopeType === 'institution'
          ? 'Institution-wide announcement published successfully!'
          : scopeType === 'branch'
          ? `Announcement for ${department} published successfully!`
          : scopeType === 'year'
          ? `Announcement for ${department} • ${year} published successfully!`
          : `Announcement for ${department} • ${year} • ${section} published successfully!`
      );
      setTitle('');
      setContent('');
      setIsPostingOpen(false);
      await loadAnnouncements();
    } catch (err) {
      console.error('[DirectorAnnouncementsView] Publish failed:', err.message);
      setPostError(err.message || 'Failed to publish announcement.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter announcements for display
  const filteredAnnouncements = announcements.filter(a => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'institution') return a.scopeType === 'institution';
    if (activeFilter === 'branch') return a.scopeType === 'branch' || a.scopeType === 'department';
    if (activeFilter === 'year') return a.scopeType === 'year';
    if (activeFilter === 'section') return a.scopeType === 'section';
    return true;
  });

  const countInstitution = announcements.filter(a => a.scopeType === 'institution').length;
  const countBranch = announcements.filter(a => a.scopeType === 'branch' || a.scopeType === 'department').length;
  const countYear = announcements.filter(a => a.scopeType === 'year').length;
  const countSection = announcements.filter(a => a.scopeType === 'section').length;

  return (
    <div className="space-y-6 animate-hero-fade-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Announcements & Notices</h2>
          <p className="text-sm font-medium text-slate-500 mt-1">
            Broadcast official notices to {institutionName} or target specific departments
          </p>
        </div>
        <button
          onClick={() => {
            setIsPostingOpen(!isPostingOpen);
            setPostError(null);
            setPostSuccess(null);
          }}
          className="flex items-center gap-2 bg-[#D67756] hover:bg-[#c26444] text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-sm hover:shadow transition-all duration-200 active:scale-95 cursor-pointer self-start sm:self-auto"
        >
          <Icons.Plus /> {isPostingOpen ? 'Close Form' : 'Broadcast Announcement'}
        </button>
      </div>

      {/* Post Success Banner */}
      {postSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-sm font-semibold flex items-center justify-between animate-hero-fade-up">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>{postSuccess}</span>
          </div>
          <button
            onClick={() => setPostSuccess(null)}
            className="text-emerald-700 hover:text-emerald-900 text-xs font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Post Announcement Form */}
      {isPostingOpen && (
        <div className="bg-white rounded-[24px] border border-slate-200/80 p-6 sm:p-7 shadow-[0_4px_24px_rgba(0,0,0,0.04)] animate-hero-fade-up space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#D67756]"></span>
              New Official Notice
            </h3>
            <span className="text-xs font-semibold text-slate-400">
              Authority: Director&apos;s Office ({institutionName})
            </span>
          </div>

          {postError && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold">
              {postError}
            </div>
          )}

          <form onSubmit={handlePost} className="space-y-4">
            {/* Scope Selection */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Distribution Scope</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <button
                  type="button"
                  onClick={() => setScopeType('institution')}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                    scopeType === 'institution'
                      ? 'border-[#D67756] bg-[#FFF2ED] shadow-xs'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <p className={`text-xs font-bold ${scopeType === 'institution' ? 'text-[#D67756]' : 'text-slate-800'}`}>
                    Institution-Wide
                  </p>
                  <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                    Broadcasts to all users across {institutionName}
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setScopeType('branch')}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                    scopeType === 'branch'
                      ? 'border-[#D67756] bg-[#FFF2ED] shadow-xs'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <p className={`text-xs font-bold ${scopeType === 'branch' ? 'text-[#D67756]' : 'text-slate-800'}`}>
                    Department-Wide
                  </p>
                  <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                    Target all years &amp; sections in a dept
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setScopeType('year')}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                    scopeType === 'year'
                      ? 'border-[#D67756] bg-[#FFF2ED] shadow-xs'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <p className={`text-xs font-bold ${scopeType === 'year' ? 'text-[#D67756]' : 'text-slate-800'}`}>
                    Department + Year
                  </p>
                  <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                    Target an academic year in a dept
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setScopeType('section')}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                    scopeType === 'section'
                      ? 'border-[#D67756] bg-[#FFF2ED] shadow-xs'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <p className={`text-xs font-bold ${scopeType === 'section' ? 'text-[#D67756]' : 'text-slate-800'}`}>
                    Class Section
                  </p>
                  <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                    Target an exact class section
                  </p>
                </button>
              </div>
            </div>

            {/* Target Selectors (Department, Year, Section) */}
            {scopeType !== 'institution' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 animate-hero-fade-up">
                {/* Department Selector */}
                <div className={scopeType === 'branch' ? 'sm:col-span-3' : scopeType === 'year' ? 'sm:col-span-2' : 'sm:col-span-1'}>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Target Department</label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-[#D67756] focus:bg-white transition-all"
                  >
                    {DIRECTOR_DEPARTMENTS.map(dept => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                </div>

                {/* Year Selector: only for Department + Year or Department + Year + Section */}
                {(scopeType === 'year' || scopeType === 'section') && (
                  <div className={scopeType === 'year' ? 'sm:col-span-1' : 'sm:col-span-1'}>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">Academic Year</label>
                    <select
                      value={year}
                      onChange={(e) => setYear(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-[#D67756] focus:bg-white transition-all"
                    >
                      {DIRECTOR_YEARS.map(yr => (
                        <option key={yr} value={yr}>{yr}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Section Selector: only for Department + Year + Section */}
                {scopeType === 'section' && (
                  <div className="sm:col-span-1">
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">Class Section</label>
                    <select
                      value={section}
                      onChange={(e) => setSection(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-[#D67756] focus:bg-white transition-all"
                    >
                      {DIRECTOR_SECTIONS.map(sec => (
                        <option key={sec} value={sec}>{sec}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* Priority and Category Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Priority</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPriority('normal')}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      priority === 'normal'
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Normal
                  </button>
                  <button
                    type="button"
                    onClick={() => setPriority('urgent')}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      priority === 'urgent'
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Urgent
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-50/50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-[#D67756] focus:bg-white transition-all"
                >
                  <option value="general">General Notice</option>
                  <option value="academic">Academic & Examinations</option>
                  <option value="administration">Administrative & Operations</option>
                  <option value="events">Institutional Events</option>
                  <option value="urgent">Emergency / Critical</option>
                </select>
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Notice Title</label>
              <input
                type="text"
                placeholder="e.g. Mid-Term Examination Schedule Released"
                maxLength={200}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#D67756] focus:bg-white text-xs font-semibold text-slate-800 transition-all"
              />
            </div>

            {/* Body */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Notice Body</label>
              <textarea
                placeholder="Write the full announcement text here..."
                rows={4}
                maxLength={5000}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50/50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#D67756] focus:bg-white text-xs font-medium text-slate-800 transition-all resize-none"
              />
            </div>

            {/* Form Actions */}
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsPostingOpen(false);
                  setPostError(null);
                }}
                className="px-5 py-2.5 rounded-xl text-slate-500 font-bold hover:bg-slate-100 transition-colors text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2.5 rounded-xl bg-[#D67756] hover:bg-[#c26444] text-white font-bold shadow-xs transition-all text-xs cursor-pointer active:scale-95 disabled:opacity-50 flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>Publishing...</span>
                  </>
                ) : (
                  <span>Publish Notice</span>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Scope Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
        <button
          onClick={() => setActiveFilter('all')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeFilter === 'all'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-white border border-slate-200/80 text-slate-600 hover:bg-slate-50'
          }`}
        >
          All Notices ({announcements.length})
        </button>
        <button
          onClick={() => setActiveFilter('institution')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeFilter === 'institution'
              ? 'bg-[#D67756] text-white shadow-xs'
              : 'bg-white border border-slate-200/80 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Institution-Wide ({countInstitution})
        </button>
        <button
          onClick={() => setActiveFilter('branch')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeFilter === 'branch'
              ? 'bg-[#D67756] text-white shadow-xs'
              : 'bg-white border border-slate-200/80 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Department ({countBranch})
        </button>
        <button
          onClick={() => setActiveFilter('year')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeFilter === 'year'
              ? 'bg-[#D67756] text-white shadow-xs'
              : 'bg-white border border-slate-200/80 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Academic Year ({countYear})
        </button>
        <button
          onClick={() => setActiveFilter('section')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeFilter === 'section'
              ? 'bg-[#D67756] text-white shadow-xs'
              : 'bg-white border border-slate-200/80 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Class Sections ({countSection})
        </button>
      </div>

      {/* Announcements List Container */}
      {isLoading ? (
        <div className="bg-white rounded-[24px] border border-slate-100 p-12 text-center text-slate-400 font-medium text-sm shadow-xs">
          <div className="w-7 h-7 border-2 border-[#D67756] border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          Loading official notices...
        </div>
      ) : error ? (
        <div className="bg-rose-50 border border-rose-200 rounded-[24px] p-6 text-rose-700 flex justify-between items-center text-sm font-medium shadow-xs">
          <span>{error}</span>
          <button
            onClick={loadAnnouncements}
            className="px-4 py-2 bg-rose-700 text-white rounded-xl font-bold text-xs hover:bg-rose-800 transition-all cursor-pointer"
          >
            Retry
          </button>
        </div>
      ) : filteredAnnouncements.length === 0 ? (
        <div className="bg-white rounded-[24px] border border-slate-100 p-12 text-center shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-theme-bg text-theme-primary flex items-center justify-center mx-auto mb-4">
            <Icons.Announcements />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">No Announcements Yet</h3>
          <p className="text-sm font-medium text-slate-500 max-w-md mx-auto">
            {activeFilter === 'all'
              ? `There are currently no announcements published for ${institutionName}.`
              : `There are currently no ${activeFilter} announcements.`}
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredAnnouncements.map(a => (
            <div
              key={a.id}
              className="bg-white rounded-[24px] border border-slate-100 p-6 shadow-xs hover:border-[#D67756]/30 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99] transition-all duration-200 group"
            >
              <div className="flex justify-between items-start mb-3 gap-2">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h3 className="font-bold text-slate-900 text-lg transition-colors group-hover:text-[#D67756]">
                    {a.title}
                  </h3>
                  {a.priority === 'urgent' && (
                    <span className="text-[10px] font-extrabold text-white bg-rose-600 px-2 py-0.5 rounded-full uppercase tracking-wider">
                      Urgent
                    </span>
                  )}
                  {a.category && a.category !== 'general' && (
                    <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md uppercase tracking-wider">
                      {a.category}
                    </span>
                  )}
                </div>
                <span className="text-[11px] font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg whitespace-nowrap">
                  {a.createdAt
                    ? new Date(a.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })
                    : (a.date || 'Recent')}
                </span>
              </div>

              <p className="text-sm text-slate-600 mb-4 leading-relaxed font-medium whitespace-pre-line">
                {a.content}
              </p>

              <div className="flex items-center justify-between flex-wrap gap-2 pt-3 border-t border-slate-100">
                <span className={`text-xs font-bold px-3 py-1 rounded-lg inline-block ${
                  a.scopeType === 'institution'
                    ? 'bg-[#FFF2ED] text-[#D67756] border border-[#D67756]/20'
                    : a.scopeType === 'branch' || a.scopeType === 'department'
                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                    : a.scopeType === 'year'
                    ? 'bg-purple-50 text-purple-700 border border-purple-200'
                    : 'bg-amber-50 text-amber-800 border border-amber-200'
                }`}>
                  {a.scopeType === 'institution'
                    ? 'Institution-wide'
                    : a.scopeType === 'branch' || a.scopeType === 'department'
                    ? `Branch: ${a.department}`
                    : a.scopeType === 'year'
                    ? `Year: ${a.department || ''} • ${a.year || ''}`.replace(/^Year:\s*•\s*/, 'Year: ')
                    : `Class: ${a.department || ''} • ${a.year || ''} • ${a.section || ''}`.replace(/^Class:\s*•\s*/, 'Class: ')}
                </span>

                {a.authorName && (
                  <span className="text-xs font-medium text-slate-500">
                    By {a.authorName}{a.authorRole ? ` (${a.authorRole.charAt(0).toUpperCase() + a.authorRole.slice(1)})` : ''}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default DirectorAnnouncementsView;
