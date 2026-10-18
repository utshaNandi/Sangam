import React, { useState, useEffect, useRef } from 'react';

// SVG Icons matching the exact 1:1 Gemini specification
const ICONS = {
  knot: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1E1E1E" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 12c-2-2.67-4-4-6-4a4 4 0 1 0 0 8c2 0 4-1.33 6-4Zm0 0c2 2.67 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1.33-6 4Z" />
      <path d="M12 12c-2.67 2-4 4-4 6a4 4 0 1 0 8 0c0-2-1.33-4-4-6Zm0 0c2.67-2 4-4 4-6a4 4 0 1 0-8 0c0 2 1.33 4 4 6Z" />
    </svg>
  ),
  stethoscope: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#1E1E1E" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3" />
      <path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4" />
      <circle cx="20" cy="10" r="2" />
    </svg>
  ),
  video: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1E1E1E" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="13" rx="2.5" />
      <polygon points="10 8.5 15 10.5 10 12.5 10 8.5" fill="#1E1E1E" stroke="none" />
      <line x1="8" y1="20" x2="16" y2="20" />
      <line x1="12" y1="17" x2="12" y2="20" />
    </svg>
  ),
  report: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1E1E1E" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="6" width="18" height="14" rx="2.5" />
      <path d="M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6" />
      <line x1="12" y1="10.5" x2="12" y2="15.5" />
      <line x1="9.5" y1="13" x2="14.5" y2="13" />
    </svg>
  )
};

const ANNOUNCEMENTS_DATA = {
  leftHeader: "Announcement",
  rightHeader: "Details",
  labels: ["Published By", "Observation", "Action Items"],
  subPrefix: "Reference ",
  items: [
    {
      id: "ann-1",
      name: "Taigo Wilkinson",
      subtitle: "Emergency Visit",
      time: "09 : 15 AM",
      color: "#F5B8D8",
      tagBg: "#E4A3C5",
      mutedColor: "#6E4E60",
      icon: "knot",
      badgeCode: "1EG4-TES-MK72",
      demographics: "Operations Lead • Priority Broadcast",
      tags: ["Urgent", "Ward A & B", "Shift Handover"],
      checkedBy: "Dr Everly",
      checkedDate: "on 21 April 2021",
      refCode: "#2J983KT0",
      observation: "Updated triage intake routing is now active for all morning emergency arrivals.",
      prescriptions: [
        "Verify badge sync before 10:00 AM",
        "Route priority lab samples via Express Desk"
      ]
    },
    {
      id: "ann-2",
      name: "Samantha Williams",
      subtitle: "Routine Check-Up",
      time: "09 : 15 AM",
      color: "#C4D4F2",
      tagBg: "#AEC2E8",
      mutedColor: "#4A5974",
      icon: "stethoscope",
      badgeCode: "9B2K-R41-PL08",
      demographics: "Clinical Coordinator • Weekly Brief",
      tags: ["Equipment", "Diagnostics", "Floor 3"],
      checkedBy: "BioMed Team",
      checkedDate: "on 16 October 2026",
      refCode: "#8K412MN9",
      observation: "Annual calibration completed on all outpatient diagnostic monitors with zero downtime.",
      prescriptions: [
        "Review updated check-up checklist",
        "Log afternoon vitals in unified portal"
      ]
    },
    {
      id: "ann-3",
      name: "Amy White",
      subtitle: "Video Consultation",
      time: "09 : 15 AM",
      color: "#C4B5FD",
      tagBg: "#B39DF8",
      mutedColor: "#4C1D95",
      icon: "video",
      badgeCode: "4VD9-M82-QW19",
      demographics: "Telehealth Director • Platform Update",
      tags: ["Telehealth", "HD Audio", "Low Latency"],
      checkedBy: "IT Systems",
      checkedDate: "on 15 October 2026",
      refCode: "#5P109VX4",
      observation: "Virtual consultation rooms now include instant prescription card sharing for patients.",
      prescriptions: [
        "Enable one-click room link in calendar",
        "Attach post-visit summary automatically"
      ]
    },
    {
      id: "ann-4",
      name: "Tyler Young",
      subtitle: "Report",
      time: "09 : 45 AM",
      color: "#A7B868",
      tagBg: "#94A753",
      mutedColor: "#465124",
      icon: "report",
      badgeCode: "7RP3-K19-ZN64",
      demographics: "Quality Assurance • Monthly Audit",
      tags: ["Q3 Metrics", "Compliance", "100% Verified"],
      checkedBy: "Audit Board",
      checkedDate: "on 14 October 2026",
      refCode: "#3L774TY2",
      observation: "Departmental turnaround time improved by 24% across all routine lab reports this quarter.",
      prescriptions: [
        "Download signed Q3 compliance packet",
        "Share summary before Friday briefing"
      ]
    }
  ]
};

export default function AnnouncementsPanel({ userProfile, onNavigate }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedPeriod, setSelectedPeriod] = useState('Today');
  const [isPeriodDropdownOpen, setIsPeriodDropdownOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [isSwitching, setIsSwitching] = useState(false);

  const switchTimeoutRef = useRef(null);
  const toastTimeoutRef = useRef(null);
  const periodDropdownRef = useRef(null);

  const currentItem = ANNOUNCEMENTS_DATA.items[selectedIndex] || ANNOUNCEMENTS_DATA.items[0];
  const [displayedItem, setDisplayedItem] = useState(currentItem);

  const selectItem = (index, immediate = false) => {
    if (index < 0 || index >= ANNOUNCEMENTS_DATA.items.length) return;
    setSelectedIndex(index);
    const targetItem = ANNOUNCEMENTS_DATA.items[index];

    if (immediate) {
      setDisplayedItem(targetItem);
      setIsSwitching(false);
      return;
    }

    if (switchTimeoutRef.current) clearTimeout(switchTimeoutRef.current);
    setIsSwitching(true);
    switchTimeoutRef.current = setTimeout(() => {
      setDisplayedItem(targetItem);
      setIsSwitching(false);
    }, 130);
  };

  // Keyboard navigation (Up / Down arrows)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = (selectedIndex + 1) % ANNOUNCEMENTS_DATA.items.length;
        selectItem(next);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const len = ANNOUNCEMENTS_DATA.items.length;
        const prev = (selectedIndex - 1 + len) % len;
        selectItem(prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex]);

  // Click outside listener for period dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (periodDropdownRef.current && !periodDropdownRef.current.contains(e.target)) {
        setIsPeriodDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handlePrescriptionClick = () => {
    const msg = `Loaded reference ${displayedItem.refCode} for ${displayedItem.name}`;
    setToastMessage(msg);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 2400);
  };

  // Geometry dimensions from specification
  const rowHeight = 64;
  const rowGap = 12;
  const connectorY = selectedIndex * (rowHeight + rowGap);

  return (
    <div
      className="announcement-widget w-full select-none"
      style={{
        '--bg-cream': '#FAF6EB',
        '--card-unselected': '#EFECE1',
        '--card-unselected-hover': '#E7E3D5',
        '--active-color': currentItem.color,
        '--active-tag-bg': currentItem.tagBg,
        '--active-muted': currentItem.mutedColor,
        '--row-height': `${rowHeight}px`,
        '--row-gap': `${rowGap}px`,
        '--left-width': '244px',
        '--bridge-gap': '26px',
        '--radius-card': '22px',
        '--scoop-size': '22px',
        '--spring-ease': 'cubic-bezier(0.22, 1, 0.36, 1)',
        '--connector-y': `${connectorY}px`
      }}
    >
      <style>{`
        .announcement-widget {
          font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
          color: #1F1F1F;
        }

        /* Strictly side-by-side master-detail desktop geometry */
        .announcement-widget .board-stage {
          position: relative;
          display: grid;
          grid-template-columns: var(--left-width) 1fr;
          column-gap: var(--bridge-gap);
          height: calc(4 * var(--row-height) + 3 * var(--row-gap));
          clip-path: inset(0px);
        }

        /* Unified sliding active background bar + bridge */
        .announcement-widget .active-row-connector {
          position: absolute;
          left: 0;
          top: 0;
          width: calc(var(--left-width) + var(--bridge-gap) + 32px);
          height: var(--row-height);
          background-color: var(--active-color);
          border-top-left-radius: var(--radius-card);
          border-bottom-left-radius: var(--radius-card);
          transform: translateY(var(--connector-y, 0px));
          transition:
            transform 0.48s var(--spring-ease),
            background-color 0.42s var(--spring-ease);
          z-index: 1;
          pointer-events: none;
        }

        /* Concave inner fillets (scoops) where horizontal bridge joins right panel */
        .announcement-widget .concave-scoop {
          position: absolute;
          right: 31px;
          width: var(--scoop-size);
          height: var(--scoop-size);
          pointer-events: none;
        }

        .announcement-widget .concave-scoop svg {
          display: block;
          width: 100%;
          height: 100%;
        }

        .announcement-widget .concave-scoop path {
          fill: var(--active-color);
          transition: fill 0.42s var(--spring-ease);
        }

        .announcement-widget .scoop-top {
          top: calc(-1 * var(--scoop-size) + 1px);
        }

        .announcement-widget .scoop-bottom {
          bottom: calc(-1 * var(--scoop-size) + 1px);
        }

        /* Left list item rows: strictly on the LEFT */
        .announcement-widget .left-list {
          position: relative;
          z-index: 2;
          display: flex;
          flex-direction: column;
          gap: var(--row-gap);
          height: 100%;
        }

        .announcement-widget .list-item-btn {
          position: relative;
          height: var(--row-height);
          width: 100%;
          border-radius: var(--radius-card);
          background-color: var(--card-unselected);
          padding: 0 11px 0 10px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
          border: none;
          cursor: pointer;
          text-align: left;
          transition:
            background-color 0.32s var(--spring-ease),
            transform 0.25s var(--spring-ease);
          outline: none;
        }

        .announcement-widget .list-item-btn:hover:not(.is-selected) {
          background-color: var(--card-unselected-hover);
          transform: translateX(3px);
        }

        .announcement-widget .list-item-btn:focus-visible {
          box-shadow: 0 0 0 2px #1F1F1F;
        }

        /* When selected, the button's own bg is transparent so continuous connector underneath shows seamlessly */
        .announcement-widget .list-item-btn.is-selected {
          background-color: transparent;
        }

        /* Left circular icon container */
        .announcement-widget .item-icon-circle {
          width: 36px;
          height: 36px;
          border-radius: 9999px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition:
            background-color 0.38s var(--spring-ease),
            transform 0.38s var(--spring-ease),
            box-shadow 0.38s var(--spring-ease);
        }

        .announcement-widget .list-item-btn:hover .item-icon-circle {
          transform: scale(1.04);
        }

        /* Right oval pill inside each left box */
        .announcement-widget .item-time-oval {
          padding: 5px 9px;
          border-radius: 9999px;
          font-size: 9.5px;
          font-weight: 700;
          letter-spacing: 0.01em;
          color: #1F1F1F;
          white-space: nowrap;
          flex-shrink: 0;
          transition:
            background-color 0.38s var(--spring-ease),
            transform 0.38s var(--spring-ease),
            box-shadow 0.38s var(--spring-ease);
        }

        /* Right details container: strictly on the RIGHT, side-by-side with exact height match */
        .announcement-widget .details-panel {
          position: relative;
          z-index: 2;
          background-color: var(--active-color);
          border-radius: var(--radius-card);
          padding: 16px 24px;
          height: calc(4 * var(--row-height) + 3 * var(--row-gap));
          display: flex;
          flex-direction: column;
          justify-content: center;
          overflow: hidden;
          transition: background-color 0.42s var(--spring-ease);
        }

        /* Smooth content fade+slide when switching items */
        .announcement-widget .details-content-inner {
          transition:
            opacity 0.22s ease,
            transform 0.28s var(--spring-ease);
        }

        .announcement-widget .details-content-inner.is-switching {
          opacity: 0;
          transform: translateY(6px);
        }

        .announcement-widget .symptom-tag {
          background-color: var(--active-tag-bg);
          transition: background-color 0.42s var(--spring-ease), transform 0.2s ease;
        }

        .announcement-widget .symptom-tag:hover {
          transform: translateY(-1px);
        }

        .announcement-widget .muted-label {
          color: var(--active-muted);
          transition: color 0.42s var(--spring-ease);
        }
      `}</style>

      {/* Section Headers Row: Side-by-side matching the columns below */}
      <div
        className="items-center mb-3 px-0.5"
        style={{
          display: 'grid',
          gridTemplateColumns: 'var(--left-width) 1fr',
          columnGap: 'var(--bridge-gap)'
        }}
      >
        {/* Left Column Header */}
        <div className="flex items-center justify-between gap-1.5">
          <h2 className="text-[17px] font-medium tracking-tight text-[#222222] whitespace-nowrap">
            {ANNOUNCEMENTS_DATA.leftHeader}
          </h2>

          {/* Filter Pill Dropdown ("Today v") */}
          <div className="relative flex-shrink-0" ref={periodDropdownRef}>
            <button
              type="button"
              onClick={() => setIsPeriodDropdownOpen(!isPeriodDropdownOpen)}
              className="inline-flex items-center gap-1 bg-[#141414] hover:bg-[#292929] text-white text-[11px] font-normal px-3 py-1 rounded-full transition-colors shadow-sm cursor-pointer"
            >
              <span>{selectedPeriod}</span>
              <svg
                className="w-3.5 h-3.5 text-white/90 transition-transform duration-200"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ transform: isPeriodDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
              >
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>

            {/* Dropdown Menu */}
            {isPeriodDropdownOpen && (
              <div className="absolute right-0 mt-1.5 w-32 bg-[#181818] text-white rounded-2xl shadow-xl py-1.5 z-30 border border-white/10 text-xs animate-in fade-in duration-100">
                {['Today', 'Tomorrow', 'This Week'].map((period) => (
                  <button
                    key={period}
                    type="button"
                    onClick={() => {
                      setSelectedPeriod(period);
                      setIsPeriodDropdownOpen(false);
                    }}
                    className="w-full text-left px-3.5 py-1.5 hover:bg-white/10 font-medium flex items-center justify-between text-white/90 cursor-pointer"
                  >
                    <span>{period}</span>
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        selectedPeriod === period ? 'bg-white' : 'bg-transparent'
                      }`}
                    ></span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column Header */}
        <div className="flex items-center justify-between pl-1">
          <h2 className="text-[17px] font-medium tracking-tight text-[#222222]">
            {ANNOUNCEMENTS_DATA.rightHeader}
          </h2>
        </div>
      </div>

      {/* Connected Master-Detail Stage: Strictly Side-by-Side */}
      <div className="board-stage">
        {/* Continuous Sliding Active Connector + Concave Inner Scoops */}
        <div className="active-row-connector">
          {/* Upper Concave Fillet */}
          <div className="concave-scoop scoop-top">
            <svg viewBox="0 0 22 22" preserveAspectRatio="none">
              <path d="M 22 0 L 22 22 L 0 22 A 22 22 0 0 0 22 0 Z"></path>
            </svg>
          </div>
          {/* Lower Concave Fillet */}
          <div className="concave-scoop scoop-bottom">
            <svg viewBox="0 0 22 22" preserveAspectRatio="none">
              <path d="M 0 0 L 22 0 L 22 22 A 22 22 0 0 0 0 0 Z"></path>
            </svg>
          </div>
        </div>

        {/* Left Column: Shorter Boxes List */}
        <div className="left-list" role="listbox" aria-label="Announcement list">
          {ANNOUNCEMENTS_DATA.items.map((item, index) => {
            const isSelected = index === selectedIndex;
            return (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`list-item-btn ${isSelected ? 'is-selected' : ''}`}
                onClick={() => selectItem(index)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="item-icon-circle"
                    style={{ backgroundColor: isSelected ? '#FFFFFF' : item.color }}
                  >
                    {ICONS[item.icon] || ICONS.knot}
                  </div>
                  <div className="truncate">
                    <div className="text-[12.5px] font-bold text-[#1F1F1F] leading-tight truncate">
                      {item.name}
                    </div>
                    <div
                      className="text-[10px] font-medium mt-0.5 truncate transition-colors duration-300"
                      style={{ color: isSelected ? item.mutedColor : '#6B6860' }}
                    >
                      {item.subtitle}
                    </div>
                  </div>
                </div>
                <span
                  className="item-time-oval"
                  style={{ backgroundColor: isSelected ? '#FFFFFF' : item.color }}
                >
                  {item.time}
                </span>
              </button>
            );
          })}
        </div>

        {/* Right Column: Connected Details Panel */}
        <section className="details-panel" aria-live="polite">
          <div className={`details-content-inner ${isSwitching ? 'is-switching' : ''}`}>
            {/* Top Identity & Badge Row */}
            <div className="flex items-start justify-between gap-3 mb-2.5">
              <div>
                <h3 className="text-[15.5px] font-bold text-[#1E1E1E] underline decoration-[#1E1E1E]/80 underline-offset-[3px] leading-snug">
                  {displayedItem.name}
                </h3>
                <p className="text-[11.5px] font-semibold text-[#2A2A2A] mt-0.5">
                  {displayedItem.demographics}
                </p>
              </div>

              <span className="bg-white text-[#1E1E1E] text-[11px] font-bold tracking-tight px-3 py-1 rounded-full shadow-[0_1px_2px_rgba(0,0,0,0.04)] whitespace-nowrap">
                {displayedItem.badgeCode}
              </span>
            </div>

            {/* Category Ovals Row */}
            <div className="flex flex-wrap items-center gap-1.5 mb-3">
              {displayedItem.tags.map((tag, idx) => (
                <span
                  key={idx}
                  className="symptom-tag text-[#1E1E1E] text-[11px] font-semibold px-3 py-0.5 rounded-full cursor-default"
                >
                  {tag}
                </span>
              ))}
            </div>

            {/* Structured Metadata Rows */}
            <div className="space-y-2 text-[11.5px] leading-snug">
              {/* Row 1 */}
              <div className="grid grid-cols-[98px_1fr] gap-2 items-baseline">
                <span className="muted-label font-medium">{ANNOUNCEMENTS_DATA.labels[0]}</span>
                <div className="text-[#1F1F1F] font-medium">
                  <span>
                    <span className="underline decoration-[#1F1F1F]/70 underline-offset-2 font-semibold">
                      {displayedItem.checkedBy}
                    </span>{' '}
                    {displayedItem.checkedDate}
                  </span>
                  <div className="mt-0.5">
                    <span>{ANNOUNCEMENTS_DATA.subPrefix}</span>
                    <button
                      type="button"
                      onClick={handlePrescriptionClick}
                      className="text-[#2B6CB0] hover:text-[#1D4ED8] underline font-semibold transition-colors cursor-pointer"
                    >
                      {displayedItem.refCode}
                    </button>
                  </div>
                </div>
              </div>

              {/* Row 2 */}
              <div className="grid grid-cols-[98px_1fr] gap-2 items-baseline">
                <span className="muted-label font-medium">{ANNOUNCEMENTS_DATA.labels[1]}</span>
                <p className="text-[#1F1F1F] font-medium m-0">
                  {displayedItem.observation}
                </p>
              </div>

              {/* Row 3 */}
              <div className="grid grid-cols-[98px_1fr] gap-2 items-baseline">
                <span className="muted-label font-medium">{ANNOUNCEMENTS_DATA.labels[2]}</span>
                <div className="text-[#1F1F1F] font-medium space-y-0.5">
                  {displayedItem.prescriptions.map((line, idx) => (
                    <p key={idx} className="m-0">
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Toast Notification for Reference Click */}
      <div
        className={`fixed bottom-5 right-5 bg-[#181818] text-white text-xs font-medium px-4 py-2.5 rounded-full shadow-lg transition-all duration-200 z-50 pointer-events-none ${
          toastMessage ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
        }`}
      >
        {toastMessage || 'Opened reference details'}
      </div>
    </div>
  );
}
