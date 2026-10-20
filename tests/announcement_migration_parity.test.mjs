import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const sourceRoot = path.resolve(projectRoot, '..', 'Sangam-ui-made-pretty (2)', 'Sangam-ui-made-pretty');

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${name}:`, err.message);
    failed++;
  }
}

console.log('\n======================================================');
console.log(' SANGAM TEACHER ANNOUNCEMENT MIGRATION — PARITY TEST');
console.log(' Verifies 1:1 component preservation, branching hooks,');
console.log(' styling, PDF preview, and backend publishing adapter.');
console.log('======================================================\n');

// --- SECTION 1: Exact File Parity with Sangam UI Mate Pretty ---
console.log('--- SECTION 1: Source File Parity & Integrity ---');

runTest('1.1: AnnouncementPage.jsx exists and preserves component structure & integration', () => {
  const destPath = path.join(projectRoot, 'src', 'pages', 'Teacher', 'AnnouncementPage.jsx');
  const srcPath = path.join(sourceRoot, 'src', 'pages', 'Teacher', 'AnnouncementPage.jsx');

  assert.ok(fs.existsSync(destPath), 'AnnouncementPage.jsx must exist in Sangam-main');
  assert.ok(fs.existsSync(srcPath), 'AnnouncementPage.jsx must exist in source reference');

  const destContent = fs.readFileSync(destPath, 'utf8');
  const srcContent = fs.readFileSync(srcPath, 'utf8');

  // 1. Deterministic Structural Landmarks verified in strict top-to-bottom source order
  const sequentialLandmarks = [
    // Header & type definitions
    "import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';",
    "import PdfPreview, { preloadPdf } from './PdfPreview';",
    "@typedef {'All' | 'Academic' | 'Routine' | 'General'} AnnouncementCategory",
    "@typedef {Object} AnnouncementAttachment",
    "@typedef {Object} AnnouncementItem",
    // Core helpers
    "function getAuthenticatedFacultyProfile(propProfile) {",
    "function formatSangamDate(date = new Date()) {",
    "function formatFileSize(bytes) {",
    "function getAttachmentPreviewKind(att) {",
    // Constants & seed data
    "const INITIAL_ANNOUNCEMENTS = [",
    "const FILTER_CATEGORIES = [",
    "function getBadgePalette(status) {",
    // Component signature & state hooks
    "export function App({ onBack, group, userProfile }) {",
    "const [announcements, setAnnouncements] = useState(INITIAL_ANNOUNCEMENTS);",
    "const [activeCategory, setActiveCategory] = useState('All');",
    "const [selectedAnnouncement, setSelectedAnnouncement] = useState(group?.selectedAnnouncement || null);",
    "const currentUser = useMemo(() => getAuthenticatedFacultyProfile(userProfile), [userProfile]);",
    "const [isDetailMaximized, setIsDetailMaximized] = useState(false);",
    "const [isDetailClosing, setIsDetailClosing] = useState(false);",
    "const [activeAttachmentIndex, setActiveAttachmentIndex] = useState(0);",
    // Action handlers & keyboard listeners
    "const handleCloseDetailModal = useCallback(",
    "const handleOpenDetailModal = useCallback(",
    "const handleToggleMaximizeDetailModal = useCallback(",
    "const handleAttachmentSelect = (e) => {",
    "const handleRemoveAttachment = (attachmentId) => {",
    "const handlePublishAnnouncement = async (e) => {",
    "const filteredAnnouncements = useMemo(() => {",
    "const gridColumns =",
    // JSX component tree in top-to-bottom render sequence
    "return (",
    'aria-label="Go back"',
    'aria-label="Announcement category filters"',
    'aria-label="Create new announcement"',
    "breadcrumbSegments.map((segment, idx) => {",
    'aria-label="Search announcements"',
    'aria-label="Announcements table"',
    'role="rowgroup"',
    "filteredAnnouncements.map((item) => {",
    "selectedAnnouncement && (",
    "<PdfPreview",
    "isComposeOpen && ("
  ];

  let lastIndex = 0;
  sequentialLandmarks.forEach((landmark, i) => {
    const idx = destContent.indexOf(landmark, lastIndex);
    assert.ok(
      idx !== -1,
      `Landmark #${i + 1} missing or out of order (searching from offset ${lastIndex}): "${landmark.slice(0, 60)}..."`
    );
    lastIndex = idx + landmark.length;
  });

  // 2. Component exports
  assert.ok(destContent.includes('export function App'), 'Must export App');
  assert.ok(destContent.includes('export { App as AnnouncementPage }'), 'Must export AnnouncementPage');
  assert.ok(destContent.includes('export { mapBackendAnnouncementToItem }'), 'Must export mapBackendAnnouncementToItem');

  // 3. UI Constants & Helper Functions
  assert.ok(destContent.includes('const FILTER_CATEGORIES = ['), 'Must define FILTER_CATEGORIES');
  assert.ok(destContent.includes("'Academic'"), 'Must include Academic category');
  assert.ok(destContent.includes("'Routine'"), 'Must include Routine category');
  assert.ok(destContent.includes("'General'"), 'Must include General category');
  assert.ok(destContent.includes('const INITIAL_ANNOUNCEMENTS = ['), 'Must define INITIAL_ANNOUNCEMENTS');
  assert.ok(destContent.includes('function getBadgePalette(status)'), 'Must define getBadgePalette');
  assert.ok(destContent.includes('#C7D1F6') && destContent.includes('#EBD0E6') && destContent.includes('#B3BC89'), 'Must preserve badge color calibration');
  assert.ok(destContent.includes('function getAuthenticatedFacultyProfile('), 'Must define getAuthenticatedFacultyProfile');
  assert.ok(destContent.includes('function formatSangamDate('), 'Must define formatSangamDate');
  assert.ok(destContent.includes('function formatFileSize('), 'Must define formatFileSize');
  assert.ok(destContent.includes('function getAttachmentPreviewKind('), 'Must define getAttachmentPreviewKind');

  // 4. Modal State Management & Keyboard Shortcuts
  assert.ok(destContent.includes('isDetailMaximized, setIsDetailMaximized'), 'Must manage isDetailMaximized');
  assert.ok(destContent.includes('isDetailClosing, setIsDetailClosing'), 'Must manage isDetailClosing');
  assert.ok(destContent.includes('activeAttachmentIndex, setActiveAttachmentIndex'), 'Must manage activeAttachmentIndex');
  assert.ok(destContent.includes('handleCloseDetailModal'), 'Must handle detail modal close');
  assert.ok(destContent.includes('handleOpenDetailModal'), 'Must handle detail modal open');
  assert.ok(destContent.includes('handleToggleMaximizeDetailModal'), 'Must handle detail modal maximize toggle');
  assert.ok(destContent.includes("event.key === 'Escape'"), 'Must handle Escape key shortcut');
  assert.ok(destContent.includes("event.key === 'ArrowLeft'"), 'Must handle ArrowLeft shortcut');
  assert.ok(destContent.includes('preloadPdf'), 'Must integrate preloadPdf for background warming');

  // 5. Compose Toolbar Features
  assert.ok(destContent.includes('isComposeOpen, setIsComposeOpen'), 'Must manage isComposeOpen');
  assert.ok(destContent.includes('composeSubject, setComposeSubject'), 'Must manage composeSubject');
  assert.ok(destContent.includes('composeDescription, setComposeDescription'), 'Must manage composeDescription');
  assert.ok(destContent.includes('isListening, setIsListening'), 'Must manage isListening');
  assert.ok(destContent.includes('handleToggleSpeechInput'), 'Must implement speech dictation');
  assert.ok(destContent.includes('handleTranslateAction'), 'Must implement translation action');
  assert.ok(destContent.includes('handleAttachmentSelect'), 'Must implement file attachment selection');
  assert.ok(destContent.includes('handleRemoveAttachment'), 'Must implement file attachment removal');

  // 6. Backend Integration & Scope Integrity
  assert.ok(destContent.includes("from '../../services/announcementService'"), 'Must import from announcementService');
  assert.ok(destContent.includes('fetchAnnouncements({'), 'Must call fetchAnnouncements');
  assert.ok(destContent.includes('mapBackendAnnouncementToItem'), 'Must use mapBackendAnnouncementToItem');
  assert.ok(destContent.includes('postAnnouncement({'), 'Must call postAnnouncement');
  assert.ok(destContent.includes('sangam:announcement-published'), 'Must listen for realtime publish events');
  assert.ok(
    !destContent.includes('path[1] || userProfile?.department'),
    'Hierarchy scope must NOT silently fall back to userProfile.department'
  );
});

runTest('1.2: PdfPreview.jsx exists and matches source implementation', () => {
  const destPath = path.join(projectRoot, 'src', 'pages', 'Teacher', 'PdfPreview.jsx');
  const srcPath = path.join(sourceRoot, 'src', 'pages', 'Teacher', 'PdfPreview.jsx');

  assert.ok(fs.existsSync(destPath), 'PdfPreview.jsx must exist in Sangam-main');
  assert.ok(fs.existsSync(srcPath), 'PdfPreview.jsx must exist in source reference');

  const destContent = fs.readFileSync(destPath, 'utf8');
  const srcContent = fs.readFileSync(srcPath, 'utf8');

  assert.strictEqual(destContent.length, srcContent.length, 'PdfPreview.jsx size must match source exactly');
  assert.strictEqual(destContent, srcContent, 'PdfPreview.jsx content must match source exactly');
});

runTest('1.3: sample-schedule.pdf exists in public directory', () => {
  const destPdf = path.join(projectRoot, 'public', 'sample-schedule.pdf');
  assert.ok(fs.existsSync(destPdf), 'public/sample-schedule.pdf must exist');
  const stat = fs.statSync(destPdf);
  assert.ok(stat.size > 0, 'sample-schedule.pdf must not be empty');
});

runTest('1.4: package.json includes pdfjs-dist dependency', () => {
  const pkgPath = path.join(projectRoot, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  assert.ok(pkg.dependencies && pkg.dependencies['pdfjs-dist'], 'pdfjs-dist must be in dependencies');
});

// --- SECTION 2: Branching Interface Hooks in AcademicSpacesView ---
console.log('\n--- SECTION 2: Branching Interface Integration ---');

runTest('2.1: AcademicSpacesView imports AnnouncementPage and accepts onOpenAnnouncement', () => {
  const asvPath = path.join(projectRoot, 'src', 'pages', 'Teacher', 'AcademicSpacesView.jsx');
  const content = fs.readFileSync(asvPath, 'utf8');

  assert.ok(content.includes("import AnnouncementPage from './AnnouncementPage';"), 'Must import AnnouncementPage');
  assert.ok(content.includes('onOpenAnnouncement'), 'Must accept onOpenAnnouncement prop');
});

runTest('2.2: handleSelectGroup routes isAnnounce groups to onOpenAnnouncement', () => {
  const asvPath = path.join(projectRoot, 'src', 'pages', 'Teacher', 'AcademicSpacesView.jsx');
  const content = fs.readFileSync(asvPath, 'utf8');

  assert.ok(content.includes('group?.isAnnounce && onOpenAnnouncement'), 'handleSelectGroup must check isAnnounce');
  assert.ok(content.includes('onOpenAnnouncement(group)'), 'Must call onOpenAnnouncement(group)');
});

runTest('2.3: SectionNode buttons pass isAnnounce: true for Announce actions', () => {
  const asvPath = path.join(projectRoot, 'src', 'pages', 'Teacher', 'AcademicSpacesView.jsx');
  const content = fs.readFileSync(asvPath, 'utf8');

  const matches = content.match(/isAnnounce:\s*true/g);
  assert.ok(matches && matches.length >= 2, 'Both embedded and non-embedded Announce buttons must specify isAnnounce: true');
});

runTest('2.4: OfficialGroupView cards route clicked notices to onOpenAnnouncement', () => {
  const asvPath = path.join(projectRoot, 'src', 'pages', 'Teacher', 'AcademicSpacesView.jsx');
  const content = fs.readFileSync(asvPath, 'utf8');

  assert.ok(content.includes('OfficialGroupView({ group, onOpenAnnouncement'), 'OfficialGroupView must accept onOpenAnnouncement');
  assert.ok(content.includes('onOpenAnnouncement(grp)'), 'Notice click must forward selectedAnnouncement group');
});

// --- SECTION 3: Dashboard & TeacherApp Integration ---
console.log('\n--- SECTION 3: Dashboard & TeacherApp Integration ---');

runTest('3.1: DashboardHome accepts and forwards onOpenAnnouncement to embedded AcademicSpacesView', () => {
  const dhPath = path.join(projectRoot, 'src', 'pages', 'Teacher', 'DashboardHome.jsx');
  const content = fs.readFileSync(dhPath, 'utf8');

  assert.ok(content.includes('onOpenAnnouncement'), 'DashboardHome must accept onOpenAnnouncement');
  assert.ok(content.includes('onOpenAnnouncement={onOpenAnnouncement}'), 'DashboardHome must forward onOpenAnnouncement');
});

runTest('3.2: TeacherApp imports AnnouncementPage and postAnnouncement', () => {
  const taPath = path.join(projectRoot, 'src', 'pages', 'Teacher', 'TeacherApp.jsx');
  const content = fs.readFileSync(taPath, 'utf8');

  assert.ok(content.includes("import AnnouncementPage from './AnnouncementPage';"), 'TeacherApp must import AnnouncementPage');
  assert.ok(content.includes("postAnnouncement"), 'TeacherApp must import postAnnouncement');
});

runTest('3.3: TeacherApp manages fullscreenAnnouncementGroup state and renders AnnouncementPage', () => {
  const taPath = path.join(projectRoot, 'src', 'pages', 'Teacher', 'TeacherApp.jsx');
  const content = fs.readFileSync(taPath, 'utf8');

  assert.ok(content.includes('fullscreenAnnouncementGroup, setFullscreenAnnouncementGroup'), 'Must have fullscreenAnnouncementGroup state');
  assert.ok(content.includes('<AnnouncementPage'), 'Must render AnnouncementPage component');
  assert.ok(content.includes('onBack={() => setFullscreenAnnouncementGroup(null)}'), 'Must supply onBack callback');
});

runTest('3.4: TeacherApp registers window.__SANGAM_PUBLISH_ANNOUNCEMENT__ adapter', () => {
  const taPath = path.join(projectRoot, 'src', 'pages', 'Teacher', 'TeacherApp.jsx');
  const content = fs.readFileSync(taPath, 'utf8');

  assert.ok(content.includes('window.__SANGAM_PUBLISH_ANNOUNCEMENT__'), 'Must register __SANGAM_PUBLISH_ANNOUNCEMENT__');
  assert.ok(content.includes('postAnnouncement({'), 'Must delegate to postAnnouncement');
});

// --- SECTION 4: CSS Styling and Animation Tokens ---
console.log('\n--- SECTION 4: Announcement CSS Styles & Keyframes ---');

runTest('4.1: index.css contains .sangam-scrollable-list utility', () => {
  const cssPath = path.join(projectRoot, 'src', 'index.css');
  const content = fs.readFileSync(cssPath, 'utf8');

  assert.ok(content.includes('.sangam-scrollable-list'), 'Must contain .sangam-scrollable-list');
  assert.ok(content.includes('scrollbar-width: none !important;'), 'Must hide scrollbar smoothly');
});

runTest('4.2: index.css contains announcement modal keyframes', () => {
  const cssPath = path.join(projectRoot, 'src', 'index.css');
  const content = fs.readFileSync(cssPath, 'utf8');

  assert.ok(content.includes('@keyframes sangamBackdropIn'), 'Must contain sangamBackdropIn keyframe');
  assert.ok(content.includes('@keyframes sangamBackdropOut'), 'Must contain sangamBackdropOut keyframe');
  assert.ok(content.includes('@keyframes sangamModalIn'), 'Must contain sangamModalIn keyframe');
  assert.ok(content.includes('@keyframes sangamModalOut'), 'Must contain sangamModalOut keyframe');
});

console.log('\n======================================================');
console.log(` RESULTS: ${passed} passed, ${failed} failed`);
console.log('======================================================\n');

if (failed > 0) {
  process.exit(1);
}
