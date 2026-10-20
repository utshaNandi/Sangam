import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import PdfPreview, { preloadPdf } from './PdfPreview';
import { fetchAnnouncements, postAnnouncement, mapBackendAnnouncementToItem } from '../../services/announcementService';

/**
 * @typedef {'All' | 'Academic' | 'Routine' | 'General'} AnnouncementCategory
 *
 * @typedef {Object} AnnouncementAttachment
 * @property {string} id
 * @property {string} name
 * @property {number} size
 * @property {string} type
 * @property {string} url
 *
 * @typedef {Object} AnnouncementItem
 * @property {string} id
 * @property {string} senderName
 * @property {string} [senderRole]
 * @property {string} [senderEmail]
 * @property {string} senderAvatar
 * @property {string} timestamp
 * @property {string} [dueDate]
 * @property {string} subject
 * @property {string} message
 * @property {Exclude<AnnouncementCategory, 'All'>} category
 * @property {'Unread' | 'Important' | 'Active' | 'Pinned' | 'Routine'} status
 * @property {boolean} isSaved
 * @property {AnnouncementAttachment[]} [attachments]
 *
 * @typedef {Object} AuthenticatedFacultyProfile
 * @property {string} name
 * @property {string} role
 * @property {string} email
 * @property {string} avatar
 */

function getAuthenticatedFacultyProfile(propProfile) {
  if (propProfile && (propProfile.name || propProfile.fullName)) {
    return {
      name: propProfile.name || propProfile.fullName,
      role: propProfile.role || propProfile.designation || 'Dean of Academic Affairs',
      email: propProfile.email || 'faculty@sangam.edu',
      avatar:
        propProfile.avatar ||
        propProfile.avatarUrl ||
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
    };
  }

  try {
    if (typeof window !== 'undefined') {
      const win = window;
      const globalUser = win.__SANGAM_AUTH_USER__ || win.__SANGAM_USER__ || win.currentUser;
      if (globalUser && globalUser.name) {
        return {
          name: globalUser.name,
          role: globalUser.role || 'Faculty Member',
          email: globalUser.email || 'faculty@sangam.edu',
          avatar:
            globalUser.avatar ||
            'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
        };
      }

      const stored =
        window.localStorage.getItem('sangam_auth_user') ||
        window.localStorage.getItem('sangam_faculty_profile') ||
        window.localStorage.getItem('user');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && (parsed.name || parsed.fullName)) {
          return {
            name: parsed.name || parsed.fullName,
            role: parsed.role || parsed.designation || 'Dean of Academic Affairs',
            email: parsed.email || 'rachel.mayers@sangam.edu',
            avatar:
              parsed.avatar ||
              parsed.avatarUrl ||
              'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
          };
        }
      }
    }
  } catch {
    // Fallback to active faculty session profile
  }

  return {
    name: 'Rachel Mayers',
    role: 'Dean of Academic Affairs',
    email: 'rachel.mayers@sangam.edu',
    avatar:
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
  };
}

/**
 * Formats a Date object following Sangam's DD/MM/YY date convention (e.g., 12/12/24).
 */
function formatSangamDate(date = new Date()) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

function formatFileSize(bytes) {
  if (typeof bytes === 'string') return bytes;
  if (!bytes || isNaN(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

function getAttachmentPreviewKind(att) {
  if (!att) return 'unsupported';
  const mime = (att.type || '').toLowerCase();
  const name = (att.name || '').toLowerCase();
  const url = (att.url || '').toLowerCase();

  if (
    mime.startsWith('image/') ||
    /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(name) ||
    /\.(png|jpe?g|gif|webp|svg|bmp|avif)(\?.*)?$/i.test(url)
  ) {
    return 'image';
  }

  if (mime === 'application/pdf' || /\.pdf$/i.test(name) || /\.pdf(\?.*)?$/i.test(url)) {
    return 'pdf';
  }

  return 'unsupported';
}

const INITIAL_ANNOUNCEMENTS = [
  {
    id: 'ann-1',
    senderName: 'Rachel Mayers',
    senderRole: 'Dean of Academic Affairs',
    senderAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
    timestamp: '12/12/24',
    dueDate: '18/12/24',
    subject: 'Fall Semester Final Exam Schedule',
    message: '123456 Academic Registry — Final examination timetables and hall assignments for all undergraduate cohorts have been published.',
    category: 'Academic',
    status: 'Unread',
    isSaved: false,
    attachments: [
      {
        id: 'att-pdf-1',
        name: 'Fall_2026_Final_Examination_Schedule.pdf',
        size: 2097,
        type: 'application/pdf',
        url: '/sample-schedule.pdf',
      },
    ],
  },
  {
    id: 'ann-2',
    senderName: 'Samantha Williams',
    senderRole: 'Campus Operations',
    senderAvatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=120&auto=format&fit=crop&q=80',
    timestamp: '12/12/24',
    dueDate: '-',
    subject: 'Library Extended Study Hours',
    message: 'Samantha Williams — Main library reading rooms will remain open 24 hours daily throughout the assessment period.',
    category: 'Routine',
    status: 'Important',
    isSaved: true,
  },
  {
    id: 'ann-3',
    senderName: 'Amy White',
    senderRole: 'Research Grants Office',
    senderAvatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120&auto=format&fit=crop&q=80',
    timestamp: '12/12/24',
    dueDate: '12/12/24',
    subject: 'Spring Research Stipend Applications',
    message: '123324 Departmental Board — Faculty-sponsored research fellowship proposals are now open for submission.',
    category: 'Academic',
    status: 'Active',
    isSaved: false,
  },
  {
    id: 'ann-4',
    senderName: 'Tyler Young',
    senderRole: 'IT Infrastructure',
    senderAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80',
    timestamp: '12/12/24',
    dueDate: '-',
    subject: 'Portal Maintenance Window',
    message: '123456 Core Systems — Scheduled network upgrades will occur this Sunday between 02:00 and 04:30 AM.',
    category: 'Routine',
    status: 'Pinned',
    isSaved: false,
  },
  {
    id: 'ann-5',
    senderName: 'Amy White',
    senderRole: 'Student Services',
    senderAvatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120&auto=format&fit=crop&q=80',
    timestamp: '12/12/24',
    dueDate: '12/12/24',
    subject: 'Winter Break Housing Registration',
    message: '123324 Residence Life — Students remaining on campus during winter recess must confirm accommodation details.',
    category: 'General',
    status: 'Important',
    isSaved: false,
  },
  {
    id: 'ann-6',
    senderName: 'Rachel Mayers',
    senderRole: 'Dean of Academic Affairs',
    senderAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
    timestamp: '12/12/24',
    dueDate: '12/12/24',
    subject: 'Updated Course Withdrawal Policy',
    message: '123456 Academic Senate — Revised guidelines regarding late-semester course drops and Advisor sign-off.',
    category: 'Academic',
    status: 'Unread',
    isSaved: true,
  },
  {
    id: 'ann-7',
    senderName: 'Rachel Mayers',
    senderRole: 'Executive Office',
    senderAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
    timestamp: '12/12/24',
    dueDate: '12/12/24',
    subject: 'Annual Convocation Guest Speaker',
    message: '123456 University Events — Registration for faculty and student seating in the main auditorium is now live.',
    category: 'General',
    status: 'Important',
    isSaved: false,
    attachments: [
      {
        id: 'att-photo-1',
        name: 'Convocation_Auditorium_Stage.jpg',
        size: 1420000,
        type: 'image/jpeg',
        url: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1200&auto=format&fit=crop&q=80',
      },
    ],
  },
];

const FILTER_CATEGORIES = [
  'All',
  'Academic',
  'Routine',
  'General',
];

/**
 * Exact colour calibration sampled from the reference image:
 * - Periwinkle Blue: #C7D1F6 with #24293D text (matches "Rquested")
 * - Soft Pastel Pink: #EBD0E6 with #352231 text (matches "Paid")
 * - Muted Olive Green: #B3BC89 with #282D18 text (matches "Sent")
 */
function getBadgePalette(status) {
  switch (status) {
    case 'Unread':
      return { bg: '#C7D1F6', text: '#24293D' };
    case 'Important':
    case 'Pinned':
      return { bg: '#EBD0E6', text: '#352231' };
    case 'Active':
    case 'Routine':
      return { bg: '#B3BC89', text: '#282D18' };
    default:
      return { bg: '#E5E4DF', text: '#2E2E2C' };
  }
}

export { mapBackendAnnouncementToItem };

export function App({ onBack, group, userProfile }) {
  const [announcements, setAnnouncements] = useState(INITIAL_ANNOUNCEMENTS);
  const [activeCategory, setActiveCategory] = useState('All');
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(group?.selectedAnnouncement || null);
  const [avatarErrors, setAvatarErrors] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = React.useRef(null);

  // Authenticated faculty member profile
  const currentUser = useMemo(() => getAuthenticatedFacultyProfile(userProfile), [userProfile]);
  const [composerAvatarError, setComposerAvatarError] = useState(false);

  // Fetch announcements for this hierarchy section from backend
  const loadAnnouncements = useCallback(async () => {
    try {
      const path = group?.path || [];
      const dept = (path[1] || '').trim();
      const yr = (path[2] || '').trim();
      const sec = (path[3] || '').trim();

      const data = await fetchAnnouncements({
        department: dept,
        year: yr,
        section: sec,
        page: 1,
        limit: 100
      });

      if (data && Array.isArray(data.announcements)) {
        const mapped = data.announcements.map(mapBackendAnnouncementToItem).filter(Boolean);
        setAnnouncements(mapped);
      }
    } catch (err) {
      console.warn('[AnnouncementPage] Fetch announcements notice:', err.message);
    }
  }, [group]);

  useEffect(() => {
    loadAnnouncements();
  }, [loadAnnouncements]);

  // Listen for announcement-published events to update feed
  useEffect(() => {
    const handlePublished = () => {
      loadAnnouncements();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('sangam:announcement-published', handlePublished);
      return () => window.removeEventListener('sangam:announcement-published', handlePublished);
    }
  }, [loadAnnouncements]);

  // Clean, jitter-free Announcement Detail Modal open/close & maximize/restore states
  const [isDetailMaximized, setIsDetailMaximized] = useState(false);
  const [isDetailClosing, setIsDetailClosing] = useState(false);
  const [activeAttachmentIndex, setActiveAttachmentIndex] = useState(0);
  const [previewLoadErrors, setPreviewLoadErrors] = useState({});
  const closeTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  // Idle background preloading for instant, zero-delay PDF previews
  useEffect(() => {
    const timer = setTimeout(() => {
      announcements.forEach((item) => {
        const attList = Array.isArray(item.attachments)
          ? item.attachments
          : item.attachment
          ? [item.attachment]
          : [];
        attList.forEach((att) => {
          if (att?.url && getAttachmentPreviewKind(att) === 'pdf') {
            preloadPdf(att.url);
          }
        });
      });
    }, 120);
    return () => clearTimeout(timer);
  }, [announcements]);

  const handleCloseDetailModal = useCallback(() => {
    if (isDetailClosing) return;
    setIsDetailClosing(true);
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(() => {
      setSelectedAnnouncement(null);
      setIsDetailMaximized(false);
      setIsDetailClosing(false);
      closeTimerRef.current = null;
    }, 150);
  }, [isDetailClosing]);

  const handleOpenDetailModal = useCallback((item) => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setIsDetailClosing(false);
    setIsDetailMaximized(false);
    setActiveAttachmentIndex(0);
    setPreviewLoadErrors({});
    setSelectedAnnouncement(item);
  }, []);

  const handleToggleMaximizeDetailModal = useCallback(() => {
    setIsDetailMaximized((prev) => !prev);
  }, []);

  // Dynamic academic hierarchy branch breadcrumb (e.g. UEMK / CSE AI / 1st Year / Sec B)
  const breadcrumbSegments = useMemo(() => {
    let segments = [];
    if (group?.path && Array.isArray(group.path) && group.path.length > 0) {
      segments = [...group.path];
    } else {
      const inst = userProfile?.institution || 'UEMK';
      segments = [inst, 'CSE AI', '1st Year', 'Sec B'];
    }
    return segments.map((seg, idx) => {
      if (idx === segments.length - 1 && typeof seg === 'string') {
        return seg.replace(/^Section\s+/i, 'Sec ');
      }
      return seg;
    });
  }, [group, userProfile]);

  // Announcement Publishing Modal states
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [composeSubject, setComposeSubject] = useState('');
  const [composeDescription, setComposeDescription] = useState('');
  const [composeCategory, setComposeCategory] = useState('Academic');
  const [composeStatus, setComposeStatus] = useState('Important');
  const [composeAttachments, setComposeAttachments] = useState([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [composeNotice, setComposeNotice] = useState(null);

  // Composer toolbar states (Speech, Translate, File Input, 3-Dot Menu)
  const [isListening, setIsListening] = useState(false);
  const [isTranslateMenuOpen, setIsTranslateMenuOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);

  const fileInputRef = useRef(null);
  const speechRecognitionRef = useRef(null);
  const moreMenuRef = useRef(null);
  const translateMenuRef = useRef(null);

  // Synchronize default category when opening the composer
  const handleOpenComposer = () => {
    const initialCategory = activeCategory !== 'All' ? activeCategory : 'General';
    setComposeCategory(initialCategory);
    setComposeNotice(null);
    setIsMoreMenuOpen(false);
    setIsTranslateMenuOpen(false);
    setIsComposeOpen(true);
  };

  const handleCloseComposer = useCallback(() => {
    if (isPublishing) return;
    if (speechRecognitionRef.current && isListening) {
      try {
        speechRecognitionRef.current.stop();
      } catch {
        // Ignore stop errors
      }
      setIsListening(false);
    }
    setIsMoreMenuOpen(false);
    setIsTranslateMenuOpen(false);
    setComposeNotice(null);
    setIsComposeOpen(false);
  }, [isPublishing, isListening]);

  // Close popovers on outside click
  useEffect(() => {
    if (!isMoreMenuOpen && !isTranslateMenuOpen) return;
    const handleClickOutside = (event) => {
      if (
        isMoreMenuOpen &&
        moreMenuRef.current &&
        !moreMenuRef.current.contains(event.target)
      ) {
        setIsMoreMenuOpen(false);
      }
      if (
        isTranslateMenuOpen &&
        translateMenuRef.current &&
        !translateMenuRef.current.contains(event.target)
      ) {
        setIsTranslateMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMoreMenuOpen, isTranslateMenuOpen]);

  // Close modals on Escape key & navigate images on Arrow keys
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (isMoreMenuOpen) {
          setIsMoreMenuOpen(false);
        } else if (isTranslateMenuOpen) {
          setIsTranslateMenuOpen(false);
        } else if (isComposeOpen) {
          handleCloseComposer();
        } else if (selectedAnnouncement) {
          handleCloseDetailModal();
        }
      } else if (
        selectedAnnouncement &&
        !isComposeOpen &&
        (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
      ) {
        const attList = Array.isArray(selectedAnnouncement.attachments)
          ? selectedAnnouncement.attachments
          : selectedAnnouncement.attachment
          ? [selectedAnnouncement.attachment]
          : [];
        const imgIndices = attList
          .map((att, idx) => (getAttachmentPreviewKind(att) === 'image' ? idx : -1))
          .filter((idx) => idx !== -1);
        if (imgIndices.length > 1) {
          event.preventDefault();
          setActiveAttachmentIndex((prevIdx) => {
            const currentPos = imgIndices.indexOf(prevIdx);
            if (event.key === 'ArrowLeft') {
              const prevPos = currentPos <= 0 ? imgIndices.length - 1 : currentPos - 1;
              return imgIndices[prevPos];
            } else {
              const nextPos =
                currentPos === -1 || currentPos >= imgIndices.length - 1
                  ? 0
                  : currentPos + 1;
              return imgIndices[nextPos];
            }
          });
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isComposeOpen,
    isMoreMenuOpen,
    isTranslateMenuOpen,
    selectedAnnouncement,
    handleCloseComposer,
    handleCloseDetailModal,
  ]);

  const handleToggleSpeechInput = () => {
    setComposeNotice(null);
    if (typeof window === 'undefined') return;

    const SpeechRecognitionAPI =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      setComposeNotice(
        'Voice dictation is not supported in this browser environment.'
      );
      return;
    }

    if (isListening && speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch {
        // Ignore stop error
      }
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognitionAPI();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = navigator.language || 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
        setComposeNotice('Listening for voice input...');
      };

      recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map((result) => result[0]?.transcript || '')
          .join(' ')
          .trim();

        if (transcript) {
          setComposeDescription((prev) =>
            prev.trim() ? `${prev.trim()} ${transcript}` : transcript
          );
          setComposeNotice(null);
        }
      };

      recognition.onerror = () => {
        setIsListening(false);
        setComposeNotice('Microphone input could not be captured.');
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      speechRecognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsListening(false);
      setComposeNotice('Unable to start microphone dictation.');
    }
  };

  const handleTranslateAction = async (targetLanguage) => {
    setIsTranslateMenuOpen(false);
    setComposeNotice(null);

    const hasContent = composeSubject.trim() || composeDescription.trim();
    if (!hasContent) {
      setComposeNotice('Enter a subject or description before invoking translation.');
      return;
    }

    const win = typeof window !== 'undefined' ? window : undefined;
    const translatorHook =
      win?.__SANGAM_TRANSLATE__ || win?.sangamTranslate;

    if (typeof translatorHook === 'function') {
      try {
        const result = await translatorHook({
          subject: composeSubject,
          description: composeDescription,
          targetLanguage,
        });
        if (result?.subject) setComposeSubject(result.subject);
        if (result?.description) setComposeDescription(result.description);
        setComposeNotice(`Translated to ${targetLanguage}.`);
      } catch {
        setComposeNotice('Translation service encountered an error.');
      }
    } else {
      setComposeNotice(
        `Translation hook requested (${targetLanguage}). Connect Sangam Translation Service to translate live text.`
      );
    }
  };

  const handleAttachmentSelect = (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newlyAttached = Array.from(files).map((file) => ({
      id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
      url: URL.createObjectURL(file),
    }));

    setComposeAttachments((prev) => [...prev, ...newlyAttached]);
    setComposeNotice(null);
    e.target.value = '';

    // Warm up PDF in background immediately upon selection
    newlyAttached.forEach((att) => {
      if (att?.url && getAttachmentPreviewKind(att) === 'pdf') {
        preloadPdf(att.url);
      }
    });
  };

  const handleRemoveAttachment = (attachmentId) => {
    setComposeAttachments((prev) => {
      const target = prev.find((item) => item.id === attachmentId);
      if (target?.url) {
        try {
          URL.revokeObjectURL(target.url);
        } catch {
          // Ignore revoke errors
        }
      }
      return prev.filter((item) => item.id !== attachmentId);
    });
  };

  const handlePublishAnnouncement = async (e) => {
    if (e) e.preventDefault();
    if (isPublishing) return;

    const trimmedSubject = composeSubject.trim();
    const trimmedDescription = composeDescription.trim();

    if (!trimmedSubject) {
      setComposeNotice('Please enter a subject for this announcement.');
      return;
    }
    if (!trimmedDescription) {
      setComposeNotice('Please enter the announcement description.');
      return;
    }

    setIsPublishing(true);
    setComposeNotice(null);

    try {
      const newAnnouncement = {
        id: `ann-${Date.now()}`,
        senderName: currentUser.name,
        senderRole: currentUser.role,
        senderEmail: currentUser.email,
        senderAvatar: currentUser.avatar,
        timestamp: formatSangamDate(new Date()),
        dueDate: '-',
        subject: trimmedSubject,
        message: trimmedDescription,
        category: composeCategory,
        status: composeStatus,
        isSaved: false,
        attachments: composeAttachments.length > 0 ? [...composeAttachments] : undefined,
      };

      // Check if an external Sangam backend handler is registered on window
      const win = typeof window !== 'undefined' ? window : undefined;
      let created = null;

      const path = group?.path || [];
      const dept = (path[1] || '').trim();
      const yr = (path[2] || '').trim();
      const sec = (path[3] || '').trim();

      if (!dept || !yr || !sec) {
        setComposeNotice('Incomplete hierarchy section scope. Department, Year, and Section are required to publish.');
        setIsPublishing(false);
        return;
      }

      if (typeof win?.__SANGAM_PUBLISH_ANNOUNCEMENT__ === 'function') {
        created = await win.__SANGAM_PUBLISH_ANNOUNCEMENT__({
          ...newAnnouncement,
          department: dept,
          year: yr,
          section: sec,
          group
        });
      } else {
        const res = await postAnnouncement({
          title: trimmedSubject,
          content: trimmedDescription,
          scopeType: 'section',
          department: dept,
          year: yr,
          section: sec,
          priority: composeStatus === 'Important' ? 'urgent' : 'normal',
          category: composeCategory.toLowerCase()
        });
        created = res?.announcement;
      }

      const itemToAdd = created ? mapBackendAnnouncementToItem(created) : newAnnouncement;
      setAnnouncements((prev) => [itemToAdd, ...prev.filter(a => a.id !== itemToAdd.id)]);

      // Reset composer state and close modal
      setComposeSubject('');
      setComposeDescription('');
      setComposeAttachments([]);
      setComposeStatus('Important');
      setIsMoreMenuOpen(false);
      setIsTranslateMenuOpen(false);
      setIsComposeOpen(false);
    } catch (err) {
      setComposeNotice(err?.message || 'Failed to publish announcement. Please try again.');
    } finally {
      setIsPublishing(false);
    }
  };

  const filteredAnnouncements = useMemo(() => {
    return announcements.filter((item) => {
      const matchesCategory = activeCategory === 'All' || item.category === activeCategory;
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        item.senderName.toLowerCase().includes(q) ||
        item.subject.toLowerCase().includes(q) ||
        item.message.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [announcements, activeCategory, searchQuery]);

  const handleToggleSave = (id) => {
    setAnnouncements((prev) =>
      prev.map((ann) => (ann.id === id ? { ...ann, isSaved: !ann.isSaved } : ann))
    );
    if (selectedAnnouncement?.id === id) {
      setSelectedAnnouncement((prev) => (prev ? { ...prev, isSaved: !prev.isSaved } : null));
    }
  };

  /**
   * Locked 6-column CSS Grid template that mirrors the exact horizontal rhythm,
   * spacing, and right-aligned action icon clusters of the reference image.
   */
  const gridColumns =
    'minmax(0, 1.25fr) minmax(0, 0.6fr) minmax(0, 1.45fr) minmax(0, 2.35fr) minmax(0, 0.85fr) 76px';

  const currentUserInitials = currentUser.name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      style={{ backgroundColor: '#F8F3E6' }}
      className="h-full h-[100dvh] w-full bg-[#F8F3E6] text-[#222220] antialiased selection:bg-[#C7D1F6]/60 flex flex-col overflow-hidden"
    >
      <div className="w-full max-w-none mx-auto px-3 sm:px-5 pt-4 pb-0 flex flex-col flex-1 min-h-0">
        {/* Top Row: Minimal Back Arrowhead + Horizontal Filter Pills + Plus Button */}
        <div className="flex items-center justify-between gap-4 mb-[16px] shrink-0">
          <div className="flex items-center gap-3 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => {
                if (onBack) {
                  onBack();
                } else if (activeCategory !== 'All' || searchQuery) {
                  setActiveCategory('All');
                  setSearchQuery('');
                } else {
                  window.history.back();
                }
              }}
              aria-label="Go back"
              title="Back"
              className="inline-flex items-center justify-center w-6 h-6 -ml-1 text-[#222220]/55 hover:text-[#222220] transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#222220]/30 rounded shrink-0 cursor-pointer"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>

            <nav
              role="tablist"
              aria-label="Announcement category filters"
              className="flex items-center gap-[10px]"
            >
              {FILTER_CATEGORIES.map((category) => {
                const isSelected = activeCategory === category;
                return (
                  <button
                    key={category}
                    role="tab"
                    aria-selected={isSelected}
                    type="button"
                    onClick={() => {
                      setActiveCategory(category);
                    }}
                    style={{
                      backgroundColor: isSelected ? '#151514' : 'rgba(20, 20, 19, 0.055)',
                      color: isSelected ? '#F5F4F0' : '#4A4946',
                    }}
                    className="h-[34px] px-[19px] rounded-full text-[13px] leading-none font-medium tracking-[-0.01em] whitespace-nowrap transition-all duration-150 hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#151514]/40 cursor-pointer"
                  >
                    {category}
                  </button>
                );
              })}

              {/* Minimal, elegant black circular button containing a white plus (+) symbol immediately after General */}
              <button
                type="button"
                onClick={handleOpenComposer}
                aria-label="Create new announcement"
                title="Publish announcement"
                style={{
                  backgroundColor: '#151514',
                  color: '#FFFFFF',
                }}
                className="w-[34px] h-[34px] rounded-full inline-flex items-center justify-center shrink-0 transition-all duration-150 hover:opacity-90 active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#151514]/40 cursor-pointer"
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>

              {/* Clean and premium academic branch breadcrumb matching reference image: UEMK / CSE AI / 1st Year / Sec B */}
              <div
                aria-label="Current academic branch"
                className="flex items-center text-[13px] sm:text-[13.5px] tracking-[-0.01em] select-none whitespace-nowrap pl-2 sm:pl-3 font-sans"
              >
                {breadcrumbSegments.map((segment, idx) => {
                  const isLast = idx === breadcrumbSegments.length - 1;
                  return (
                    <React.Fragment key={idx}>
                      {idx > 0 && (
                        <span className="text-[#858174]/40 mx-2 font-light select-none">/</span>
                      )}
                      <span
                        className={
                          isLast
                            ? 'font-semibold text-[#171717]'
                            : 'font-normal text-[#7A7873]'
                        }
                      >
                        {segment}
                      </span>
                    </React.Fragment>
                  );
                })}
              </div>
            </nav>
          </div>

          {/* Minimalistic Expandable Search Icon with Bottom Line (Copied 1:1 from Sangam) */}
          <div className="flex items-center justify-end shrink-0">
            <div
              onClick={() => searchInputRef.current?.focus()}
              style={{
                transition:
                  'width 0.26s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.2s ease',
              }}
              className="flex items-center border-b border-black/30 focus-within:border-black py-0.5 w-8 sm:w-24 focus-within:w-48 sm:focus-within:w-56 cursor-text"
            >
              <svg
                className="w-3.5 h-3.5 text-neutral-700 shrink-0 mr-1.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <line
                  x1="20"
                  y1="20"
                  x2="16.35"
                  y2="16.35"
                  strokeLinecap="round"
                />
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                aria-label="Search announcements"
                className="w-full bg-transparent text-xs text-[#111111] placeholder-transparent focus:outline-none font-sans"
              />
              {searchQuery.length > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSearchQuery('');
                    searchInputRef.current?.focus();
                  }}
                  aria-label="Clear search"
                  className="text-neutral-400 hover:text-black text-xs leading-none ml-1 focus:outline-none cursor-pointer"
                >
                  &times;
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Main Rounded Rectangular Table Container */}
        <section
          aria-label="Announcements table"
          style={{
            backgroundColor: 'rgba(20, 20, 19, 0.045)',
          }}
          className="w-full rounded-t-[26px] rounded-b-none px-5 sm:px-7 pt-5 pb-0 flex flex-col flex-1 min-h-0 overflow-hidden no-scrollbar"
        >
          <div className="w-full min-w-0 max-w-full flex flex-col flex-1 min-h-0">
            {/* Quiet, Muted Table Header */}
            <div
              style={{ gridTemplateColumns: gridColumns }}
              className="grid items-center gap-x-6 pb-[18px] text-[12.5px] font-normal text-[#7A7873] tracking-[-0.005em] select-none shrink-0"
            >
              <div>Sender</div>
              <div>Time</div>
              <div>Subject</div>
              <div>Message</div>
              <div className="text-center">Status</div>
              <div aria-hidden="true" />
            </div>

            {/* Generously Spaced Continuous Rows */}
            <div
              role="rowgroup"
              className="flex flex-col flex-1 min-h-0 overflow-y-auto overflow-x-hidden no-scrollbar sangam-scrollable-list pb-6 -mx-4 px-4 pt-1"
            >
              {filteredAnnouncements.map((item) => {
                const badge = getBadgePalette(item.status);
                const hasImgError = avatarErrors[item.id];
                const initials = item.senderName
                  .split(' ')
                  .map((part) => part[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase();

                return (
                  <div
                    key={item.id}
                    role="row"
                    tabIndex={0}
                    onClick={() => handleOpenDetailModal(item)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleOpenDetailModal(item);
                      }
                    }}
                    style={{ gridTemplateColumns: gridColumns }}
                    className={`group grid items-center gap-x-6 min-h-[68px] px-3 -mx-3 rounded-[14px] cursor-pointer transition-colors duration-150 ease-out hover:bg-black/[0.025] active:bg-black/[0.035] focus:outline-none focus-visible:bg-black/[0.035] ${
                      selectedAnnouncement?.id === item.id ? 'bg-black/[0.035]' : ''
                    }`}
                  >
                    {/* Column 1: Circular Sender Avatar + Name */}
                    <div className="flex items-center gap-3 min-w-0">
                      {!hasImgError ? (
                        <img
                          src={item.senderAvatar}
                          alt={item.senderName}
                          onError={() =>
                            setAvatarErrors((prev) => ({ ...prev, [item.id]: true }))
                          }
                          className="w-[26px] h-[26px] rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <span
                          aria-hidden="true"
                          className="w-[26px] h-[26px] rounded-full bg-black/[0.08] text-[#2B2B29] text-[10.5px] font-medium flex items-center justify-center shrink-0"
                        >
                          {initials}
                        </span>
                      )}
                      <span className="text-[13.5px] font-normal text-[#333330] truncate tracking-[-0.01em]">
                        {item.senderName}
                      </span>
                    </div>

                    {/* Column 2: Timestamp */}
                    <div className="text-[13.5px] font-normal text-[#3D3C39] whitespace-nowrap tracking-[-0.01em]">
                      {item.timestamp}
                    </div>

                    {/* Column 3: Subject (Primary Typographic Anchor matching reference weight) */}
                    <div className="text-[13.5px] font-semibold text-[#1E1E1C] truncate tracking-[-0.015em]">
                      {item.subject}
                    </div>

                    {/* Column 4: Concise Message Preview */}
                    <div className="text-[13.5px] font-normal text-[#383734] truncate pr-2 tracking-[-0.01em]">
                      {item.message}
                    </div>

                    {/* Column 5: Compact Pastel Status Badge */}
                    <div className="flex items-center justify-center">
                      <span
                        style={{
                          backgroundColor: badge.bg,
                          color: badge.text,
                        }}
                        className="inline-flex items-center justify-center h-[27px] px-[14px] rounded-full text-[12px] font-medium leading-none tracking-[-0.01em] whitespace-nowrap"
                      >
                        {item.status}
                      </span>
                    </div>

                    {/* Column 6: Far-Right Minimal Outline Action Icons */}
                    <div
                      className="flex items-center justify-end gap-[22px]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Save / Bookmark Action */}
                      <button
                        type="button"
                        onClick={() => handleToggleSave(item.id)}
                        aria-label={item.isSaved ? 'Remove from saved' : 'Save announcement'}
                        title={item.isSaved ? 'Saved' : 'Save announcement'}
                        className="text-[#3A3936]/75 hover:text-[#141413] transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#141413]/30 rounded cursor-pointer"
                      >
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill={item.isSaved ? 'currentColor' : 'none'}
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                        </svg>
                      </button>

                      {/* Secondary Action Icon (Matches Reference Paper-Plane / Open Detail Action) */}
                      <button
                        type="button"
                        onClick={() => handleOpenDetailModal(item)}
                        aria-label="View announcement details"
                        title="Open announcement"
                        className="text-[#3A3936]/75 hover:text-[#141413] transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#141413]/30 rounded cursor-pointer"
                      >
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <line x1="22" y1="2" x2="11" y2="13" />
                          <polygon points="22 2 15 22 11 13 2 9 22 2" />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}

              {filteredAnnouncements.length === 0 && (
                <div className="py-14 text-center text-[13.5px] text-[#7A7873]">
                  No announcements found in this view.
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Subtle Detail Modal when clicking an announcement or its secondary action icon */}
      {selectedAnnouncement && (() => {
        const attachmentsList = Array.isArray(selectedAnnouncement.attachments)
          ? selectedAnnouncement.attachments
          : selectedAnnouncement.attachment
          ? [selectedAnnouncement.attachment]
          : [];
        const hasAttachments = attachmentsList.length > 0;
        const currentAttachment = hasAttachments
          ? attachmentsList[Math.min(activeAttachmentIndex, attachmentsList.length - 1)]
          : null;
        const previewKind =
          currentAttachment && !previewLoadErrors[currentAttachment.id || 'curr']
            ? getAttachmentPreviewKind(currentAttachment)
            : 'unsupported';

        const imageAttachmentIndices = attachmentsList
          .map((att, idx) => (getAttachmentPreviewKind(att) === 'image' ? idx : -1))
          .filter((idx) => idx !== -1);
        const hasMultipleImages = imageAttachmentIndices.length > 1;

        const handlePrevImage = (e) => {
          e?.stopPropagation?.();
          if (imageAttachmentIndices.length < 2) return;
          const currentPos = imageAttachmentIndices.indexOf(activeAttachmentIndex);
          const prevPos =
            currentPos <= 0
              ? imageAttachmentIndices.length - 1
              : currentPos - 1;
          setActiveAttachmentIndex(imageAttachmentIndices[prevPos]);
        };

        const handleNextImage = (e) => {
          e?.stopPropagation?.();
          if (imageAttachmentIndices.length < 2) return;
          const currentPos = imageAttachmentIndices.indexOf(activeAttachmentIndex);
          const nextPos =
            currentPos === -1 || currentPos >= imageAttachmentIndices.length - 1
              ? 0
              : currentPos + 1;
          setActiveAttachmentIndex(imageAttachmentIndices[nextPos]);
        };

        return (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-announcement-subject"
            onClick={handleCloseDetailModal}
            style={{
              animation: `${
                isDetailClosing ? 'sangamBackdropOut 150ms ease-in' : 'sangamBackdropIn 160ms ease-out'
              } forwards`,
            }}
            className="sangam-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/25 backdrop-blur-[1px] overflow-hidden"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: isDetailMaximized
                  ? '100vw'
                  : 'min(1060px, calc(100vw - 32px))',
                height: isDetailMaximized
                  ? '100vh'
                  : 'min(640px, 85vh)',
                maxHeight: isDetailMaximized ? '100vh' : '85vh',
                borderRadius: isDetailMaximized ? '0px' : '28px',
                animation: `${
                  isDetailClosing
                    ? 'sangamModalOut 150ms cubic-bezier(0.4, 0, 1, 1)'
                    : 'sangamModalIn 180ms cubic-bezier(0.22, 1, 0.36, 1)'
                } forwards`,
                transition:
                  'width 220ms cubic-bezier(0.22, 1, 0.36, 1), height 220ms cubic-bezier(0.22, 1, 0.36, 1), max-height 220ms cubic-bezier(0.22, 1, 0.36, 1), border-radius 220ms cubic-bezier(0.22, 1, 0.36, 1), padding 220ms cubic-bezier(0.22, 1, 0.36, 1)',
              }}
              className={`sangam-modal-card flex flex-col bg-[#F5F3EC] text-[#222220] shadow-2xl border border-black/[0.06] overflow-hidden transform-gpu my-auto ${
                isDetailMaximized ? 'p-7 sm:p-10' : 'p-7 sm:p-9'
              }`}
            >
              {!hasAttachments ? (
                <>
                  {/* Header: Avatar, Name, Role & Status Badge + Window Controls */}
                  <div className="flex items-center justify-between gap-4 mb-6 shrink-0">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <img
                        src={selectedAnnouncement.senderAvatar}
                        alt={selectedAnnouncement.senderName}
                        className="w-10 h-10 rounded-full object-cover shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="text-[14.5px] font-medium text-[#1E1E1C] truncate">
                          {selectedAnnouncement.senderName}
                        </div>
                        <div className="text-[12px] text-[#7A7873] truncate">
                          {selectedAnnouncement.senderRole} • {selectedAnnouncement.timestamp}
                        </div>
                      </div>
                    </div>

                    {/* Right Cluster: Status Badge + Top-Right Window Controls (Maximize/Restore -> Close) */}
                    <div className="flex items-center gap-2.5 shrink-0">
                      <span
                        style={{
                          backgroundColor: getBadgePalette(selectedAnnouncement.status).bg,
                          color: getBadgePalette(selectedAnnouncement.status).text,
                        }}
                        className="inline-flex items-center justify-center h-[26px] px-3.5 rounded-full text-[12px] font-medium shrink-0"
                      >
                        {selectedAnnouncement.status}
                      </span>

                      <div
                        role="group"
                        aria-label="Window controls"
                        className="flex items-center gap-1 ml-1 -mr-1"
                      >
                        {/* Maximize / Restore Control */}
                        <button
                          type="button"
                          onClick={handleToggleMaximizeDetailModal}
                          aria-label={
                            isDetailMaximized ? 'Restore announcement modal size' : 'Maximize announcement modal'
                          }
                          title={isDetailMaximized ? 'Restore down' : 'Maximize'}
                          className="w-8 h-8 rounded-full inline-flex items-center justify-center text-[#5A5955] hover:text-[#141413] hover:bg-black/[0.05] transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20 cursor-pointer"
                        >
                          {isDetailMaximized ? (
                            <svg
                              width="15"
                              height="15"
                              viewBox="0 0 16 16"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.4"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <path d="M5.5 3.5H12.5V10.5" />
                              <rect x="3.5" y="5.5" width="7" height="7" rx="1" />
                            </svg>
                          ) : (
                            <svg
                              width="15"
                              height="15"
                              viewBox="0 0 16 16"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.4"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <rect x="3" y="3" width="10" height="10" rx="1.25" />
                            </svg>
                          )}
                        </button>

                        {/* Close (X) Control */}
                        <button
                          type="button"
                          onClick={handleCloseDetailModal}
                          aria-label="Close announcement modal"
                          title="Close"
                          className="w-8 h-8 rounded-full inline-flex items-center justify-center text-[#5A5955] hover:text-[#141413] hover:bg-black/[0.05] transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20 cursor-pointer"
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Scrollable Content Body */}
                  <div className="overflow-y-auto pr-1 flex-1 min-h-0 mb-6 space-y-4 no-scrollbar">
                    <h2
                      id="modal-announcement-subject"
                      className="text-[18px] sm:text-[19px] font-semibold text-[#181816] tracking-[-0.015em] leading-snug"
                    >
                      {selectedAnnouncement.subject}
                    </h2>

                    <p className="text-[14.5px] sm:text-[15px] leading-relaxed text-[#3D3C39] whitespace-pre-line">
                      {selectedAnnouncement.message}
                    </p>
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-4 border-t border-black/[0.06] shrink-0">
                    <span className="text-[12.5px] text-[#7A7873]">
                      Category:{' '}
                      <strong className="font-medium text-[#333330]">
                        {selectedAnnouncement.category}
                      </strong>
                    </span>

                    <div>
                      <button
                        type="button"
                        onClick={() => handleToggleSave(selectedAnnouncement.id)}
                        className="h-[35px] px-5 rounded-full text-[13px] font-medium bg-black/[0.06] hover:bg-black/[0.1] text-[#222220] transition-colors cursor-pointer"
                      >
                        {selectedAnnouncement.isSaved ? 'Saved' : 'Save'}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                /* Unified Single-Box Two-Column Split Layout when Attachment Exists */
                <div className="flex flex-col md:flex-row flex-1 min-h-0 h-full">
                  {/* Left Half: Announcement Details */}
                  <div className="w-full md:w-1/2 flex flex-col min-h-0 flex-1 md:pr-8 pb-6 md:pb-0 border-b md:border-b-0 md:border-r border-black/[0.06]">
                    {/* Sender Info & Status Badge (+ Mobile Window Controls) */}
                    <div className="flex items-center justify-between gap-3 mb-6 shrink-0">
                      <div className="flex items-center gap-3.5 min-w-0">
                        <img
                          src={selectedAnnouncement.senderAvatar}
                          alt={selectedAnnouncement.senderName}
                          className="w-10 h-10 rounded-full object-cover shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="text-[14.5px] font-medium text-[#1E1E1C] truncate">
                            {selectedAnnouncement.senderName}
                          </div>
                          <div className="text-[12px] text-[#7A7873] truncate">
                            {selectedAnnouncement.senderRole}
                            {selectedAnnouncement.senderEmail
                              ? ` • ${selectedAnnouncement.senderEmail}`
                              : ''}{' '}
                            • {selectedAnnouncement.timestamp}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          style={{
                            backgroundColor: getBadgePalette(selectedAnnouncement.status).bg,
                            color: getBadgePalette(selectedAnnouncement.status).text,
                          }}
                          className="inline-flex items-center justify-center h-[26px] px-3.5 rounded-full text-[12px] font-medium shrink-0"
                        >
                          {selectedAnnouncement.status}
                        </span>

                        {/* Window Controls on smaller screens where columns stack */}
                        <div
                          role="group"
                          aria-label="Window controls"
                          className="flex md:hidden items-center gap-1 ml-1 -mr-1"
                        >
                          <button
                            type="button"
                            onClick={handleToggleMaximizeDetailModal}
                            aria-label={
                              isDetailMaximized
                                ? 'Restore announcement modal size'
                                : 'Maximize announcement modal'
                            }
                            title={isDetailMaximized ? 'Restore down' : 'Maximize'}
                            className="w-8 h-8 rounded-full inline-flex items-center justify-center text-[#5A5955] hover:text-[#141413] hover:bg-black/[0.05] transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20 cursor-pointer"
                          >
                            {isDetailMaximized ? (
                              <svg
                                width="15"
                                height="15"
                                viewBox="0 0 16 16"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.4"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <path d="M5.5 3.5H12.5V10.5" />
                                <rect x="3.5" y="5.5" width="7" height="7" rx="1" />
                              </svg>
                            ) : (
                              <svg
                                width="15"
                                height="15"
                                viewBox="0 0 16 16"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.4"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <rect x="3" y="3" width="10" height="10" rx="1.25" />
                              </svg>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={handleCloseDetailModal}
                            aria-label="Close announcement modal"
                            title="Close"
                            className="w-8 h-8 rounded-full inline-flex items-center justify-center text-[#5A5955] hover:text-[#141413] hover:bg-black/[0.05] transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20 cursor-pointer"
                          >
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Restrained, Scrollbar-Free Announcement Subject & Description */}
                    <div className="overflow-y-auto flex-1 mb-6 space-y-4 no-scrollbar">
                      <h2
                        id="modal-announcement-subject"
                        className="text-[18px] sm:text-[19px] font-semibold text-[#181816] tracking-[-0.015em] leading-snug"
                      >
                        {selectedAnnouncement.subject}
                      </h2>

                      <p className="text-[14.5px] sm:text-[15px] leading-relaxed text-[#3D3C39] whitespace-pre-line">
                        {selectedAnnouncement.message}
                      </p>

                      {attachmentsList.length > 1 && (
                        <div className="pt-3 border-t border-black/[0.06]">
                          <div className="text-[11.5px] font-medium text-[#7A7873] mb-2">
                            Attachments ({attachmentsList.length})
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {attachmentsList.map((att, idx) => {
                              const isCurrent = idx === activeAttachmentIndex;
                              return (
                                <button
                                  key={att.id || idx}
                                  type="button"
                                  onClick={() => setActiveAttachmentIndex(idx)}
                                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] transition-colors cursor-pointer ${
                                    isCurrent
                                      ? 'bg-[#151514] text-[#F5F4F0]'
                                      : 'bg-black/[0.05] hover:bg-black/[0.09] text-[#222220]'
                                  }`}
                                >
                                  <span className="truncate max-w-[160px]">{att.name}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Left Section Footer */}
                    <div className="flex items-center justify-between pt-4 border-t border-black/[0.06] shrink-0">
                      <span className="text-[12.5px] text-[#7A7873]">
                        Category:{' '}
                        <strong className="font-medium text-[#333330]">
                          {selectedAnnouncement.category}
                        </strong>
                      </span>

                      <div>
                        <button
                          type="button"
                          onClick={() => handleToggleSave(selectedAnnouncement.id)}
                          className="h-[35px] px-5 rounded-full text-[13px] font-medium bg-black/[0.06] hover:bg-black/[0.1] text-[#222220] transition-colors cursor-pointer"
                        >
                          {selectedAnnouncement.isSaved ? 'Saved' : 'Save'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Right Half: Stationary Attached-File Preview inside the Same Continuous Modal */}
                  <div className="w-full md:w-1/2 flex flex-col min-h-[260px] md:min-h-0 flex-1 md:pl-8 pt-6 md:pt-0 overflow-hidden">
                    {/* Right Section Top Bar: Subtle Filename + Download + Desktop Window Controls */}
                    <div className="flex items-center justify-between gap-3 mb-4 shrink-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="text-[#7A7873] shrink-0"
                        >
                          <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                        </svg>
                        {currentAttachment && (
                          <span className="text-[12.5px] font-medium text-[#3D3C39] truncate">
                            {currentAttachment.name}
                          </span>
                        )}
                        {currentAttachment && currentAttachment.size && (
                          <span className="text-[11.5px] text-[#7A7873] shrink-0">
                            ({formatFileSize(currentAttachment.size)})
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {currentAttachment && currentAttachment.url && (
                          <a
                            href={currentAttachment.url}
                            download={currentAttachment.name}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Download ${currentAttachment.name}`}
                            title="Download attachment"
                            className="h-8 px-3 rounded-full inline-flex items-center gap-1.5 text-[12px] font-medium text-[#3D3C39] hover:text-[#141413] hover:bg-black/[0.05] transition-colors"
                          >
                            <svg
                              width="13"
                              height="13"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                              <polyline points="7 10 12 15 17 10" />
                              <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                            <span className="hidden sm:inline">Download</span>
                          </a>
                        )}

                        <div
                          role="group"
                          aria-label="Window controls"
                          className="hidden md:flex items-center gap-1 -mr-1"
                        >
                          <button
                            type="button"
                            onClick={handleToggleMaximizeDetailModal}
                            aria-label={
                              isDetailMaximized
                                ? 'Restore announcement modal size'
                                : 'Maximize announcement modal'
                            }
                            title={isDetailMaximized ? 'Restore down' : 'Maximize'}
                            className="w-8 h-8 rounded-full inline-flex items-center justify-center text-[#5A5955] hover:text-[#141413] hover:bg-black/[0.05] transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20 cursor-pointer"
                          >
                            {isDetailMaximized ? (
                              <svg
                                width="15"
                                height="15"
                                viewBox="0 0 16 16"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.4"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <path d="M5.5 3.5H12.5V10.5" />
                                <rect x="3.5" y="5.5" width="7" height="7" rx="1" />
                              </svg>
                            ) : (
                              <svg
                                width="15"
                                height="15"
                                viewBox="0 0 16 16"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.4"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <rect x="3" y="3" width="10" height="10" rx="1.25" />
                              </svg>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={handleCloseDetailModal}
                            aria-label="Close announcement modal"
                            title="Close"
                            className="w-8 h-8 rounded-full inline-flex items-center justify-center text-[#5A5955] hover:text-[#141413] hover:bg-black/[0.05] transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20 cursor-pointer"
                          >
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Stationary Attachment Preview Stage */}
                    <div className="flex-1 min-h-0 w-full flex flex-col items-center justify-center overflow-hidden select-none">
                      {currentAttachment && previewKind === 'image' && (
                        <>
                          <div className="flex-1 min-h-0 w-full flex items-center justify-center overflow-hidden">
                            <img
                              src={currentAttachment.url}
                              alt={currentAttachment.name}
                              onError={() =>
                                setPreviewLoadErrors((prev) => ({
                                  ...prev,
                                  [currentAttachment.id || 'curr']: true,
                                }))
                              }
                              className="max-w-full max-h-full w-auto h-auto object-contain rounded-[14px]"
                            />
                          </div>

                          {hasMultipleImages && (
                            <div className="flex items-center justify-center gap-7 pt-2.5 pb-0.5 shrink-0 select-none">
                              {/* Minimal Unboxed Left Chevron Button */}
                              <button
                                type="button"
                                onClick={handlePrevImage}
                                aria-label="Previous image"
                                title="Previous image"
                                className="w-7 h-7 inline-flex items-center justify-center text-[#7A7873] hover:text-[#181816] active:scale-90 transition-all duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-black/20 cursor-pointer"
                              >
                                <svg
                                  width="17"
                                  height="17"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.9"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  aria-hidden="true"
                                >
                                  <polyline points="15 18 9 12 15 6" />
                                </svg>
                              </button>

                              {/* Minimal Unboxed Right Chevron Button */}
                              <button
                                type="button"
                                onClick={handleNextImage}
                                aria-label="Next image"
                                title="Next image"
                                className="w-7 h-7 inline-flex items-center justify-center text-[#7A7873] hover:text-[#181816] active:scale-90 transition-all duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-black/20 cursor-pointer"
                              >
                                <svg
                                  width="17"
                                  height="17"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.9"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  aria-hidden="true"
                                >
                                  <polyline points="9 18 15 12 9 6" />
                                </svg>
                              </button>
                            </div>
                          )}
                        </>
                      )}

                      {currentAttachment && previewKind === 'pdf' && (
                        <PdfPreview
                          url={currentAttachment.url}
                          name={currentAttachment.name}
                          onError={() =>
                            setPreviewLoadErrors((prev) => ({
                              ...prev,
                              [currentAttachment.id || 'curr']: true,
                            }))
                          }
                        />
                      )}

                      {currentAttachment && previewKind === 'unsupported' && (
                        <div className="flex flex-col items-center justify-center text-center px-6 py-8 max-w-[320px]">
                          <div className="w-12 h-12 rounded-2xl bg-black/[0.05] flex items-center justify-center text-[#3D3C39] mb-3.5">
                            <svg
                              width="22"
                              height="22"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.7"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <polyline points="14 2 14 8 20 8" />
                            </svg>
                          </div>
                          <div className="text-[14px] font-medium text-[#1E1E1C] break-all line-clamp-2 mb-1">
                            {currentAttachment.name}
                          </div>
                          {currentAttachment.size && (
                            <div className="text-[12px] text-[#7A7873] mb-4">
                              {formatFileSize(currentAttachment.size)}
                            </div>
                          )}
                          {currentAttachment.url && (
                            <a
                              href={currentAttachment.url}
                              download={currentAttachment.name}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 h-[35px] px-5 rounded-full bg-black/[0.06] hover:bg-black/[0.1] text-[12.5px] font-medium text-[#222220] transition-colors"
                            >
                              <svg
                                width="13"
                                height="13"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="7 10 12 15 17 10" />
                              </svg>
                              <span>Download File</span>
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Announcement Publishing Modal */}
      {isComposeOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="compose-announcement-modal-title"
          onClick={handleCloseComposer}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 backdrop-blur-[1px] p-4 sm:p-6 transition-opacity overflow-hidden"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(680px, calc(100vw - 32px))',
              height: 'min(640px, 85vh)',
              maxHeight: '85vh',
            }}
            className="w-full flex flex-col rounded-[30px] bg-[#F5F3EC] text-[#181816] p-7 sm:p-9 shadow-2xl border border-black/[0.05] my-auto overflow-hidden"
          >
            {/* A. Profile Header */}
            <div className="flex items-start justify-between gap-4 mb-6 shrink-0">
              <div className="flex items-center gap-3.5 min-w-0">
                {!composerAvatarError ? (
                  <img
                    src={currentUser.avatar}
                    alt={currentUser.name}
                    onError={() => setComposerAvatarError(true)}
                    className="w-[48px] h-[48px] rounded-full object-cover shrink-0 ring-1 ring-black/[0.06]"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="w-[48px] h-[48px] rounded-full bg-neutral-100 text-[#181816] text-[14px] font-semibold flex items-center justify-center shrink-0 ring-1 ring-black/[0.06]"
                  >
                    {currentUserInitials}
                  </span>
                )}
                <div className="min-w-0">
                  <div
                    id="compose-announcement-modal-title"
                    className="text-[16px] font-semibold text-[#141413] tracking-[-0.015em] truncate"
                  >
                    {currentUser.name}
                  </div>
                  <div className="text-[12.5px] text-[#8A8884] truncate mt-0.5">
                    {currentUser.email} • {formatSangamDate(new Date())}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCloseComposer}
                aria-label="Close announcement composer"
                title="Close"
                className="w-8 h-8 -mr-1 -mt-1 rounded-full inline-flex items-center justify-center text-[#5A5955] hover:text-[#111111] hover:bg-black/[0.04] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20 shrink-0 cursor-pointer"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* B & C. Separate Subject and Description Fields inside a scrollable body */}
            <form onSubmit={handlePublishAnnouncement} className="flex flex-col flex-1 min-h-0">
              <div className="overflow-y-auto pr-1 flex-1 min-h-0 space-y-4 mb-4 no-scrollbar">
                <div>
                  <input
                    type="text"
                    value={composeSubject}
                    onChange={(e) => {
                      setComposeSubject(e.target.value);
                      if (composeNotice) setComposeNotice(null);
                    }}
                    placeholder="Subject"
                    aria-label="Announcement subject"
                    autoFocus
                    className="w-full bg-transparent text-[16px] sm:text-[17px] font-semibold text-[#181816] placeholder-[#A3A19D] tracking-[-0.01em] pb-3 border-b border-black/[0.07] focus:border-black/25 focus:outline-none transition-colors"
                  />
                </div>

                <div>
                  <textarea
                    rows={7}
                    value={composeDescription}
                    onChange={(e) => {
                      setComposeDescription(e.target.value);
                      if (composeNotice) setComposeNotice(null);
                    }}
                    placeholder="Write your announcement description (supports multiple paragraphs)..."
                    aria-label="Announcement description"
                    className="w-full resize-none bg-transparent text-[14.5px] sm:text-[15px] leading-relaxed text-[#2C2B29] placeholder-[#A3A19D] pt-1 pb-3 focus:outline-none transition-colors min-h-[180px]"
                  />
                </div>

                {/* Selected File Attachments List */}
                {composeAttachments.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 pt-2 pb-1 border-t border-black/[0.05]">
                    {composeAttachments.map((file) => (
                      <div
                        key={file.id}
                        className="inline-flex items-center gap-2 pl-3.5 pr-2 py-1.5 rounded-full bg-[#F5F5F3] border border-black/[0.06] text-[12.5px] text-[#2C2B29]"
                      >
                        <svg
                          width="13"
                          height="13"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="text-[#6E6D68] shrink-0"
                        >
                          <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                        </svg>
                        <span className="max-w-[190px] truncate font-medium">
                          {file.name}
                        </span>
                        <span className="text-[11px] text-[#8A8884]">
                          {formatFileSize(file.size)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveAttachment(file.id)}
                          aria-label={`Remove ${file.name}`}
                          className="w-4 h-4 rounded-full inline-flex items-center justify-center text-[#7A7873] hover:text-[#141413] hover:bg-black/[0.06] transition-colors cursor-pointer"
                        >
                          &times;
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Subtle Inline Feedback / Notice */}
              {composeNotice && (
                <div
                  role="status"
                  className="text-[12.5px] text-[#6E6D68] pb-3 flex items-center justify-between gap-2 shrink-0"
                >
                  <span>{composeNotice}</span>
                  <button
                    type="button"
                    onClick={() => setComposeNotice(null)}
                    className="text-[11.5px] text-[#8A8884] hover:text-[#181816] cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {/* Hidden Native File Input for Functional Attachments */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleAttachmentSelect}
                className="hidden"
                aria-hidden="true"
              />

              {/* Composer Toolbar (Bottom-Left) + Publish Button (Bottom-Right) */}
              <div className="flex items-center justify-between gap-4 pt-4 border-t border-black/[0.07] shrink-0">
                {/* Bottom-Left Compact Monochrome Toolbar */}
                <div className="flex items-center gap-1.5 sm:gap-2">
                  {/* 1. Speaking / Microphone Icon */}
                  <button
                    type="button"
                    onClick={handleToggleSpeechInput}
                    aria-label={
                      isListening ? 'Stop voice dictation' : 'Voice dictation input'
                    }
                    title={
                      isListening ? 'Stop voice dictation' : 'Dictate announcement'
                    }
                    className={`w-9 h-9 rounded-full inline-flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20 cursor-pointer ${
                      isListening
                        ? 'bg-[#151514] text-white'
                        : 'text-[#6E6D68] hover:text-[#141413] hover:bg-black/[0.04]'
                    }`}
                  >
                    <svg
                      width="17"
                      height="17"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" y1="19" x2="12" y2="22" />
                    </svg>
                  </button>

                  {/* 2. Translate Icon */}
                  <div className="relative" ref={translateMenuRef}>
                    <button
                      type="button"
                      onClick={() => {
                        setIsTranslateMenuOpen((prev) => !prev);
                        setIsMoreMenuOpen(false);
                      }}
                      aria-label="Translate announcement"
                      aria-expanded={isTranslateMenuOpen}
                      title="Translate"
                      className={`w-9 h-9 rounded-full inline-flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20 cursor-pointer ${
                        isTranslateMenuOpen
                          ? 'bg-black/[0.07] text-[#141413]'
                          : 'text-[#6E6D68] hover:text-[#141413] hover:bg-black/[0.04]'
                      }`}
                    >
                      <svg
                        width="17"
                        height="17"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="m5 8 6 6" />
                        <path d="m4 14 6-6 2-3" />
                        <path d="M2 5h12" />
                        <path d="M7 2h1" />
                        <path d="m22 22-5-10-5 10" />
                        <path d="M14 18h6" />
                      </svg>
                    </button>

                    {isTranslateMenuOpen && (
                      <div className="absolute left-0 bottom-11 z-20 w-44 rounded-2xl bg-white shadow-xl border border-black/[0.08] py-1.5 text-[12.5px] text-[#222220]">
                        <div className="px-3 py-1 text-[11px] font-medium text-[#8A8884]">
                          Translate Hook
                        </div>
                        {['English', 'Hindi', 'Sanskrit'].map((lang) => (
                          <button
                            key={lang}
                            type="button"
                            onClick={() => handleTranslateAction(lang)}
                            className="w-full text-left px-3 py-1.5 hover:bg-black/[0.04] transition-colors flex items-center justify-between cursor-pointer"
                          >
                            <span>{lang}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 3. Functional Attachment Icon */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    aria-label="Attach files to announcement"
                    title="Attach file"
                    className={`w-9 h-9 rounded-full inline-flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20 cursor-pointer ${
                      composeAttachments.length > 0
                        ? 'text-[#141413] bg-black/[0.05]'
                        : 'text-[#6E6D68] hover:text-[#141413] hover:bg-black/[0.04]'
                    }`}
                  >
                    <svg
                      width="17"
                      height="17"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                    </svg>
                  </button>

                  {/* 4. Three-Dot Vertical Menu */}
                  <div className="relative" ref={moreMenuRef}>
                    <button
                      type="button"
                      onClick={() => {
                        setIsMoreMenuOpen((prev) => !prev);
                        setIsTranslateMenuOpen(false);
                      }}
                      aria-label="Announcement publishing options"
                      aria-expanded={isMoreMenuOpen}
                      title="Announcement options"
                      className={`w-9 h-9 rounded-full inline-flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20 cursor-pointer ${
                        isMoreMenuOpen
                          ? 'bg-black/[0.07] text-[#141413]'
                          : 'text-[#6E6D68] hover:text-[#141413] hover:bg-black/[0.04]'
                      }`}
                    >
                      <svg
                        width="17"
                        height="17"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="12" cy="5" r="1" />
                        <circle cx="12" cy="12" r="1" />
                        <circle cx="12" cy="19" r="1" />
                      </svg>
                    </button>

                    {isMoreMenuOpen && (
                      <div className="absolute left-0 bottom-11 z-20 w-52 rounded-2xl bg-white shadow-xl border border-black/[0.08] p-2.5 text-[12.5px] text-[#222220]">
                        <div className="px-2 py-1 text-[11px] font-medium text-[#8A8884]">
                          Category
                        </div>
                        <div className="flex flex-col gap-0.5 mb-2">
                          {['Academic', 'Routine', 'General'].map((cat) => (
                            <button
                              key={cat}
                              type="button"
                              onClick={() => setComposeCategory(cat)}
                              className={`w-full text-left px-2.5 py-1.5 rounded-lg transition-colors flex items-center justify-between cursor-pointer ${
                                composeCategory === cat
                                  ? 'bg-black/[0.06] font-medium text-[#141413]'
                                  : 'hover:bg-black/[0.03] text-[#4A4946]'
                              }`}
                            >
                              <span>{cat}</span>
                              {composeCategory === cat && (
                                <span className="w-1.5 h-1.5 rounded-full bg-[#151514]" />
                              )}
                            </button>
                          ))}
                        </div>

                        <div className="px-2 py-1 text-[11px] font-medium text-[#8A8884] border-t border-black/[0.06] pt-2">
                          Badge Status
                        </div>
                        <div className="flex flex-col gap-0.5">
                          {['Important', 'Active', 'Pinned', 'Unread', 'Routine'].map((st) => (
                            <button
                              key={st}
                              type="button"
                              onClick={() => setComposeStatus(st)}
                              className={`w-full text-left px-2.5 py-1.5 rounded-lg transition-colors flex items-center justify-between cursor-pointer ${
                                composeStatus === st
                                  ? 'bg-black/[0.06] font-medium text-[#141413]'
                                  : 'hover:bg-black/[0.03] text-[#4A4946]'
                              }`}
                            >
                              <span>{st}</span>
                              {composeStatus === st && (
                                <span className="w-1.5 h-1.5 rounded-full bg-[#151514]" />
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom-Right Rounded Pill Publish Button */}
                <button
                  type="submit"
                  disabled={isPublishing}
                  style={{
                    backgroundColor: '#151514',
                    color: '#FFFFFF',
                  }}
                  className="h-[38px] px-6 rounded-full text-[13.5px] font-medium tracking-[-0.01em] inline-flex items-center justify-center transition-all duration-150 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[#151514]/40 cursor-pointer"
                >
                  {isPublishing ? 'Publishing...' : 'Publish'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export { App as AnnouncementPage };
export default App;
