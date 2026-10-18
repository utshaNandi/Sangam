import React, { useState, useEffect, useMemo } from 'react';
import { Icons } from '../Teacher/Icons';
import {
  fetchStudyMaterials,
  downloadStudyMaterialFile
} from '../../services/studyMaterialService.js';

const CATEGORIES = [
  'All',
  'Lecture Notes',
  'Lab Manuals & Code',
  'Assignments & Problem Sets',
  'Syllabus & Course Plans',
  'Reference Books & Papers',
  'Previous Year Questions (PYQs)'
];

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function formatFileSize(bytes) {
  if (!bytes || isNaN(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function StudentStudyMaterialsView({ userProfile }) {
  const department = userProfile?.department;
  const year = userProfile?.year;
  const section = userProfile?.section;
  const institution = userProfile?.institution || 'UEMK';

  // Strict check: Student must have a confirmed academic placement
  const hasAcademicPlacement = Boolean(department && year && section);

  // Data states
  const [materials, setMaterials] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // Filters
  const [activeSubjectId, setActiveSubjectId] = useState('ALL');
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Per-item download tracking and feedback
  const [downloadingIds, setDownloadingIds] = useState({});
  const [downloadError, setDownloadError] = useState(null);
  const [downloadSuccess, setDownloadSuccess] = useState(null);

  // Load published study materials for the student's scope
  const loadMaterials = async () => {
    if (!hasAcademicPlacement) {
      setMaterials([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setLoadError(null);
    setDownloadError(null);

    try {
      // Backend automatically authenticates caller and scopes to their department, year & section
      const fetched = await fetchStudyMaterials({
        department,
        year,
        section
      });

      // Strict client-side safeguard: Only show published materials
      const publishedOnly = (fetched || []).filter(m => m.isPublished === true);
      setMaterials(publishedOnly);
    } catch (err) {
      console.warn('[StudentStudyMaterialsView] Failed to fetch materials:', err.message);
      setLoadError(err.message || 'Failed to load coursework study materials. Please check your network connection.');
      setMaterials([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMaterials();
  }, [department, year, section, userProfile?.uid]);

  // Extract unique subjects from materials for subject-wise browsing
  const availableSubjects = useMemo(() => {
    const map = new Map();
    materials.forEach(m => {
      const subKey = m.subjectId || m.subjectCode || 'general';
      if (!map.has(subKey)) {
        map.set(subKey, {
          id: subKey,
          code: m.subjectCode || '',
          name: m.subjectName || (m.subjectCode ? `Subject ${m.subjectCode}` : 'Core Coursework'),
          count: 0
        });
      }
      map.get(subKey).count += 1;
    });

    return Array.from(map.values()).sort((a, b) => {
      if (a.code && b.code) return a.code.localeCompare(b.code);
      return a.name.localeCompare(b.name);
    });
  }, [materials]);

  // Filter materials based on search, category, and subject
  const filteredMaterials = useMemo(() => {
    let list = materials;

    // Filter by subject
    if (activeSubjectId !== 'ALL') {
      list = list.filter(m => (m.subjectId || m.subjectCode || 'general') === activeSubjectId);
    }

    // Filter by category
    if (activeCategory !== 'All') {
      list = list.filter(m => m.category === activeCategory);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(m => {
        return (
          (m.title || '').toLowerCase().includes(q) ||
          (m.subjectName || '').toLowerCase().includes(q) ||
          (m.subjectCode || '').toLowerCase().includes(q) ||
          (m.teacherName || '').toLowerCase().includes(q) ||
          (m.fileName || '').toLowerCase().includes(q) ||
          (m.description || '').toLowerCase().includes(q)
        );
      });
    }

    return list;
  }, [materials, activeSubjectId, activeCategory, searchQuery]);

  // Group filtered materials by subject for structured browsing
  const groupedBySubject = useMemo(() => {
    const groups = new Map();

    filteredMaterials.forEach(m => {
      const subKey = m.subjectId || m.subjectCode || 'general';
      if (!groups.has(subKey)) {
        groups.set(subKey, {
          subjectId: subKey,
          subjectCode: m.subjectCode || '',
          subjectName: m.subjectName || (m.subjectCode ? `Subject ${m.subjectCode}` : 'General / Core Coursework'),
          items: []
        });
      }
      groups.get(subKey).items.push(m);
    });

    return Array.from(groups.values()).sort((a, b) => {
      if (a.subjectCode && b.subjectCode) return a.subjectCode.localeCompare(b.subjectCode);
      return a.subjectName.localeCompare(b.subjectName);
    });
  }, [filteredMaterials]);

  // Handle authenticated file download
  const handleDownload = async (material) => {
    if (downloadingIds[material.id]) return;
    setDownloadingIds(prev => ({ ...prev, [material.id]: true }));
    setDownloadError(null);
    setDownloadSuccess(null);

    try {
      await downloadStudyMaterialFile({
        materialId: material.id,
        fileName: material.fileName || `${material.title || 'study_material'}.pdf`
      });

      setDownloadSuccess(`Downloaded "${material.title}".`);
      setTimeout(() => setDownloadSuccess(null), 4000);
    } catch (err) {
      console.error('[StudentStudyMaterialsView] Download failed:', err);
      if (err.code === 'MATERIAL_UNPUBLISHED' || err.statusCode === 403) {
        setDownloadError(`"${material.title}" is no longer available. It was unpublished or restricted by the instructor.`);
        // Immediately remove from client state so student doesn't see outdated item
        setMaterials(prev => prev.filter(m => m.id !== material.id));
      } else if (err.code === 'FILE_NOT_FOUND' || err.statusCode === 404) {
        setDownloadError(`The file for "${material.title}" could not be located in Google Drive.`);
      } else {
        setDownloadError(err.message || `Failed to download "${material.title}". Please try again.`);
      }
    } finally {
      setDownloadingIds(prev => ({ ...prev, [material.id]: false }));
    }
  };

  // 1. Pending Placement View
  if (!hasAcademicPlacement) {
    return (
      <div className="bg-white rounded-[24px] border border-amber-200/80 p-8 text-center space-y-4 shadow-sm">
        <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto text-2xl font-bold">
          ⚠️
        </div>
        <div className="max-w-md mx-auto">
          <h3 className="text-lg font-bold text-slate-900">Academic Placement Pending</h3>
          <p className="text-sm text-slate-600 mt-2 leading-relaxed">
            Your department, academic year, or section enrollment is currently pending director approval.
            Coursework study materials will become available as soon as your academic placement is completed.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Feedback Banners */}
      {downloadSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-bold flex items-center justify-between shadow-xs animate-fade-in">
          <span>✓ {downloadSuccess}</span>
          <button onClick={() => setDownloadSuccess(null)} className="font-bold ml-4 text-emerald-700">✕</button>
        </div>
      )}

      {downloadError && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-xs font-bold flex items-center justify-between shadow-xs animate-fade-in">
          <span>! {downloadError}</span>
          <button onClick={() => setDownloadError(null)} className="font-bold ml-4 text-rose-700">✕</button>
        </div>
      )}

      {loadError && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center justify-between shadow-xs">
          <span>{loadError}</span>
          <button
            onClick={loadMaterials}
            className="px-3 py-1 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Header and Search Bar */}
      <div className="bg-white p-6 rounded-[24px] border border-slate-100 shadow-[0_2px_20px_rgba(0,0,0,0.02)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-bold text-slate-900 tracking-tight">Coursework Study Materials</h3>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-theme-bg text-theme-primary">
                {materials.length} {materials.length === 1 ? 'Resource' : 'Resources'}
              </span>
            </div>
            <p className="text-xs font-medium text-slate-500 mt-1">
              Lecture slides, lab manuals, reference books, and problem sets published by faculty.
            </p>
          </div>

          {/* Search Input */}
          <div className="relative w-full sm:w-72">
            <input
              type="text"
              placeholder="Search by topic, subject, faculty..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full px-3.5 py-2 pl-9 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-slate-800 transition-colors"
            />
            <div className="absolute left-3 top-2.5 text-slate-400 pointer-events-none">
              <Icons.Search />
            </div>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 text-xs"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Subject Filter Pills (Subject-wise browsing) */}
        {availableSubjects.length > 0 && (
          <div className="pt-2 border-t border-slate-100">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Subjects:</span>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-1">
              <button
                type="button"
                onClick={() => setActiveSubjectId('ALL')}
                className={`text-xs px-3 py-1.5 rounded-xl font-bold transition-all whitespace-nowrap cursor-pointer ${
                  activeSubjectId === 'ALL'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-50 text-slate-600 hover:text-slate-900 border border-slate-200/60'
                }`}
              >
                All Subjects ({materials.length})
              </button>
              {availableSubjects.map(sub => (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => setActiveSubjectId(sub.id)}
                  className={`text-xs px-3 py-1.5 rounded-xl font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                    activeSubjectId === sub.id
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-50 text-slate-600 hover:text-slate-900 border border-slate-200/60'
                  }`}
                >
                  {sub.code && <span className="font-mono text-[10px] opacity-80">{sub.code}</span>}
                  <span>{sub.name}</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/10">
                    {sub.count}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Category Pills */}
        <div className="pt-2 border-t border-slate-100 flex items-center gap-2 overflow-x-auto scrollbar-hide py-1">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex-shrink-0">Category:</span>
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={`text-[11px] px-2.5 py-1 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                activeCategory === cat
                  ? 'bg-theme-bg text-theme-primary font-bold border border-theme-primary/30'
                  : 'bg-white text-slate-500 hover:text-slate-800 border border-slate-200/50'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Materials Content List */}
      {isLoading ? (
        <div className="bg-white rounded-[24px] border border-slate-100 p-12 text-center shadow-xs">
          <div className="w-8 h-8 border-3 border-slate-900 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-xs font-bold text-slate-600">Loading coursework study materials...</p>
        </div>
      ) : filteredMaterials.length === 0 ? (
        <div className="bg-white rounded-[24px] border border-slate-100 p-12 text-center shadow-xs space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-theme-bg text-theme-primary flex items-center justify-center mx-auto shadow-xs">
            <Icons.Resources />
          </div>
          <h3 className="text-base font-bold text-slate-900">
            {materials.length === 0 ? 'No Study Materials Available' : 'No Matching Materials'}
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
            {materials.length === 0
              ? `There are currently no published study materials for ${department} • ${year} • ${section}. Course notes and reference documents published by your instructors will appear here.`
              : 'No materials matched your active search or category filters.'}
          </p>
          {(activeCategory !== 'All' || activeSubjectId !== 'ALL' || searchQuery) && (
            <button
              type="button"
              onClick={() => {
                setActiveCategory('All');
                setActiveSubjectId('ALL');
                setSearchQuery('');
              }}
              className="mt-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Clear All Filters
            </button>
          )}
        </div>
      ) : activeSubjectId === 'ALL' ? (
        /* Grouped by Subject View */
        <div className="space-y-8">
          {groupedBySubject.map(group => (
            <div key={group.subjectId} className="space-y-3">
              {/* Subject Group Header */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-200/70">
                <div className="flex items-center gap-2.5">
                  {group.subjectCode && (
                    <span className="font-mono text-xs font-black px-2 py-0.5 rounded-md bg-slate-900 text-white shadow-2xs">
                      {group.subjectCode}
                    </span>
                  )}
                  <h4 className="text-base font-extrabold text-slate-900">{group.subjectName}</h4>
                  <span className="text-[11px] font-bold text-slate-400">
                    ({group.items.length} {group.items.length === 1 ? 'file' : 'files'})
                  </span>
                </div>
              </div>

              {/* Subject Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {group.items.map(mat => (
                  <StudentMaterialCard
                    key={mat.id}
                    material={mat}
                    isDownloading={Boolean(downloadingIds[mat.id])}
                    onDownload={() => handleDownload(mat)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Filtered Specific Subject View */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredMaterials.map(mat => (
            <StudentMaterialCard
              key={mat.id}
              material={mat}
              isDownloading={Boolean(downloadingIds[mat.id])}
              onDownload={() => handleDownload(mat)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// SUBCOMPONENT: Student Material Card
// -----------------------------------------------------------------------------
function StudentMaterialCard({ material, isDownloading, onDownload }) {
  const isYearScoped = material.isYearWide || material.scope === 'year';
  const formattedDate = formatDate(material.publishedAt || material.createdAt);
  const formattedSize = formatFileSize(material.fileSizeBytes);

  return (
    <div className="p-5 rounded-2xl border border-slate-100 hover:border-slate-200 hover:shadow-[0_4px_20px_rgba(0,0,0,0.03)] bg-white transition-all duration-200 flex flex-col justify-between group">
      <div>
        {/* Badges Bar */}
        <div className="flex items-start justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Category */}
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-theme-bg text-theme-primary border border-theme-primary/20">
              {material.category || 'Lecture Notes'}
            </span>

            {/* Subject Code (if shown in flat mode) */}
            {material.subjectCode && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-slate-900 text-white font-mono">
                {material.subjectCode}
              </span>
            )}

            {/* Scope Badge */}
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                isYearScoped
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {isYearScoped ? 'Year-Wide Resource' : material.section || 'Section Specific'}
            </span>
          </div>
        </div>

        {/* Title */}
        <h4 className="font-extrabold text-base text-slate-900 leading-snug group-hover:text-slate-800 transition-colors">
          {material.title}
        </h4>

        {/* Subject Name (if applicable) */}
        {material.subjectName && (
          <p className="text-[11px] font-semibold text-slate-500 mt-1">
            {material.subjectName}
          </p>
        )}

        {/* Description */}
        {material.description && (
          <p className="text-xs text-slate-600 mt-2 line-clamp-2 leading-relaxed">
            {material.description}
          </p>
        )}
      </div>

      {/* Footer Info & Actions */}
      <div className="mt-4 pt-3.5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          {/* Author / Teacher */}
          {material.teacherName && (
            <p className="text-[11px] font-semibold text-slate-700 flex items-center gap-1">
              <span className="text-slate-400 font-normal">Faculty:</span>
              <span>{material.teacherName}</span>
            </p>
          )}

          {/* File Meta */}
          <div className="flex items-center gap-2 text-[11px] text-slate-400 font-medium">
            <span className="truncate max-w-[140px] font-mono text-slate-600" title={material.fileName}>
              {material.fileName || 'document.pdf'}
            </span>
            {formattedSize && (
              <>
                <span>•</span>
                <span>{formattedSize}</span>
              </>
            )}
            {formattedDate && (
              <>
                <span>•</span>
                <span>{formattedDate}</span>
              </>
            )}
          </div>
        </div>

        {/* Download Action Button */}
        <button
          type="button"
          disabled={isDownloading}
          onClick={onDownload}
          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-2xs hover:shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 active:scale-95 flex-shrink-0"
          title="Download file through secure authenticated proxy"
        >
          {isDownloading ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              <span>Downloading...</span>
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              <span>Download</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
