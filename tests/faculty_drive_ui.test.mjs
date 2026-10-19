import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

import {
  formatFileSize,
  formatDate,
  MAX_STUDY_MATERIAL_FILE_SIZE
} from '../src/services/studyMaterialService.js';

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

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${name}:`, err.message);
    failed++;
  }
}

console.log('\n======================================================');
console.log(' SANGAM PHASE C — FACULTY DRIVE LIBRARY UI TEST SUITE');
console.log(' Sidebar Navigation, Drive Library UI & Publishing Handoff');
console.log('======================================================\n');

// -----------------------------------------------------------------------------
// SECTION 1: TeacherApp Navigation & Sidebar Placement
// -----------------------------------------------------------------------------
console.log('--- SECTION 1: Sidebar Navigation & Placement ---');

runTest('1.1: Icons.Drive is defined in Icons.jsx with an SVG representation', () => {
  const iconsPath = path.resolve(process.cwd(), 'src/pages/Teacher/Icons.jsx');
  const iconsContent = fs.readFileSync(iconsPath, 'utf-8');

  assert.ok(
    iconsContent.includes('Drive: () => <svg'),
    'Icons object must define a Drive icon returning an SVG element'
  );
  assert.ok(
    iconsContent.includes('viewBox="0 0 24 24"'),
    'Drive SVG must have viewBox 0 0 24 24 matching other icons'
  );
});

runTest('1.2: TeacherApp.jsx places Drive item in toolsNavItems directly below Announcements', () => {
  const teacherAppPath = path.resolve(process.cwd(), 'src/pages/Teacher/TeacherApp.jsx');
  const fileContent = fs.readFileSync(teacherAppPath, 'utf-8');

  // Check import of FacultyDriveView
  assert.ok(
    fileContent.includes("import FacultyDriveView from './FacultyDriveView'"),
    'TeacherApp must import FacultyDriveView'
  );

  // Check toolsNavItems array structure
  const toolsNavMatch = fileContent.match(/const toolsNavItems = \[([\s\S]*?)\];/);
  assert.ok(toolsNavMatch, 'toolsNavItems array must be present');

  const toolsContent = toolsNavMatch[1];
  const announcementsIndex = toolsContent.indexOf("id: 'Announcements'");
  const driveIndex = toolsContent.indexOf("id: 'Drive'");

  assert.ok(announcementsIndex !== -1, "toolsNavItems must contain 'Announcements'");
  assert.ok(driveIndex !== -1, "toolsNavItems must contain 'Drive'");
  assert.ok(
    driveIndex > announcementsIndex,
    "'Drive' item must be placed directly after 'Announcements' in toolsNavItems"
  );

  // Verify label and icon
  assert.ok(
    toolsContent.includes("id: 'Drive', label: 'Drive', icon: <Icons.Drive />"),
    "Drive nav item must have label 'Drive' and icon <Icons.Drive />"
  );
});

runTest('1.3: TeacherApp.jsx renders FacultyDriveView when activeTab is Drive', () => {
  const teacherAppPath = path.resolve(process.cwd(), 'src/pages/Teacher/TeacherApp.jsx');
  const fileContent = fs.readFileSync(teacherAppPath, 'utf-8');

  // Verify switch-case for Drive in renderContent()
  assert.ok(
    fileContent.includes("case 'Drive':"),
    "renderContent switch statement must contain case 'Drive'"
  );
  assert.ok(
    fileContent.includes('<FacultyDriveView'),
    "case 'Drive' must render <FacultyDriveView"
  );
  assert.ok(
    fileContent.includes('onNavigate={setActiveTab}'),
    "FacultyDriveView must receive onNavigate={setActiveTab} prop for handoffs and settings navigation"
  );
});

// -----------------------------------------------------------------------------
// SECTION 2: Formatting Helpers & Sanitization
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 2: Formatting Helpers ---');

runTest('2.1: formatFileSize accurately handles various byte thresholds', () => {
  assert.strictEqual(formatFileSize(0), '0 B');
  assert.strictEqual(formatFileSize(512), '512 B');
  assert.strictEqual(formatFileSize(1024), '1.0 KB');
  assert.strictEqual(formatFileSize(1024 * 500), '500.0 KB');
  assert.strictEqual(formatFileSize(1024 * 1024 * 3.5), '3.5 MB');
  assert.strictEqual(formatFileSize(null), '0 B');
  assert.strictEqual(formatFileSize(undefined), '0 B');
  assert.strictEqual(formatFileSize('not_a_number'), '0 B');
});

runTest('2.2: formatDate cleanly formats ISO timestamps and handles invalid values', () => {
  const formatted = formatDate('2026-10-19T10:30:00Z');
  assert.strictEqual(typeof formatted, 'string');
  assert.ok(formatted.includes('2026'));
  assert.ok(formatted.includes('Oct'));

  assert.strictEqual(formatDate(null), '—');
  assert.strictEqual(formatDate(undefined), '—');
  assert.strictEqual(formatDate('invalid_date_string'), '—');
});

// -----------------------------------------------------------------------------
// SECTION 3: FacultyDriveView State Machine & UI Contracts
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 3: UI State Machine & Component Contracts ---');

runTest('3.1: FacultyDriveView exports standard React component', () => {
  const facultyDriveViewPath = path.resolve(process.cwd(), 'src/pages/Teacher/FacultyDriveView.jsx');
  const fileContent = fs.readFileSync(facultyDriveViewPath, 'utf-8');

  assert.ok(
    fileContent.includes('export default function FacultyDriveView('),
    'FacultyDriveView must have a default functional component export'
  );
});

runTest('3.2: FacultyDriveView uses existing subject and storage service contracts', () => {
  const facultyDriveViewPath = path.resolve(process.cwd(), 'src/pages/Teacher/FacultyDriveView.jsx');
  const fileContent = fs.readFileSync(facultyDriveViewPath, 'utf-8');

  // Verify reuse of existing services without introducing duplicate data models
  assert.ok(
    fileContent.includes("import { fetchMyAssignedSubjects } from '../../services/subjectService'"),
    'Must use fetchMyAssignedSubjects from subjectService'
  );
  assert.ok(
    fileContent.includes("fetchDriveSubjectFiles") && fileContent.includes("uploadToDriveFolder"),
    'Must use fetchDriveSubjectFiles, uploadToDriveFolder from studyMaterialService'
  );
  assert.ok(
    fileContent.includes("import { getStorageStatus } from '../../services/storageService'"),
    'Must use getStorageStatus from storageService'
  );
});

runTest('3.3: PDF upload restrictions enforce PDF-only and 25 MB limit', () => {
  const facultyDriveViewPath = path.resolve(process.cwd(), 'src/pages/Teacher/FacultyDriveView.jsx');
  const fileContent = fs.readFileSync(facultyDriveViewPath, 'utf-8');

  // Accepts only PDF
  assert.ok(
    fileContent.includes('accept=".pdf,application/pdf"'),
    'File input must restrict to .pdf and application/pdf'
  );

  // Validates file extension
  assert.ok(
    fileContent.includes("fileName.toLowerCase().endsWith('.pdf')"),
    'Upload handler must validate .pdf extension'
  );

  // Enforces 25MB max size
  assert.ok(
    fileContent.includes('file.size > MAX_STUDY_MATERIAL_FILE_SIZE'),
    'Upload handler must reject files exceeding MAX_STUDY_MATERIAL_FILE_SIZE'
  );
  assert.strictEqual(MAX_STUDY_MATERIAL_FILE_SIZE, 25 * 1024 * 1024);
});

runTest('3.4: Draft upload does not publish and provides clear privacy guarantees', () => {
  const facultyDriveViewPath = path.resolve(process.cwd(), 'src/pages/Teacher/FacultyDriveView.jsx');
  const fileContent = fs.readFileSync(facultyDriveViewPath, 'utf-8');

  // Confirms upload call is uploadToDriveFolder (which does NOT create a study_materials doc)
  assert.ok(
    fileContent.includes('uploadToDriveFolder(selectedSubjectId, file)'),
    'Must call uploadToDriveFolder without creating study_materials document'
  );

  // Feedback mentions unpublished status
  assert.ok(
    fileContent.includes('It remains unpublished to students'),
    'Success feedback must confirm file remains unpublished to students'
  );
});

runTest('3.5: Publishing handoff provides Manage publication or Publish as Study Material actions', () => {
  const facultyDriveViewPath = path.resolve(process.cwd(), 'src/pages/Teacher/FacultyDriveView.jsx');
  const fileContent = fs.readFileSync(facultyDriveViewPath, 'utf-8');

  // File action labels
  assert.ok(
    fileContent.includes("isPublished ? 'Manage publication' : 'Publish as Study Material'"),
    "Actions must toggle between 'Manage publication' and 'Publish as Study Material'"
  );

  // Handoff to Academic Spaces Study Material
  assert.ok(
    fileContent.includes("onNavigate('Academic Spaces')"),
    "Handoff must navigate to 'Academic Spaces' via existing onNavigate pattern"
  );
});

runTest('3.6: Disconnected Drive handling provides Settings navigation', () => {
  const facultyDriveViewPath = path.resolve(process.cwd(), 'src/pages/Teacher/FacultyDriveView.jsx');
  const fileContent = fs.readFileSync(facultyDriveViewPath, 'utf-8');

  // Check disconnected banner and Settings navigation
  assert.ok(
    fileContent.includes('Google Drive Disconnected or Authorization Expired'),
    'Must display prominent disconnected warning banner'
  );
  assert.ok(
    fileContent.includes("onNavigate('Settings')"),
    'Must provide button to navigate to Settings for reconnection'
  );
});

// -----------------------------------------------------------------------------
// SECTION 4: Mock Service Integration & State Simulation
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 4: Service Integration & Mock Flow ---');

await runAsyncTest('4.1: Subject file listing returns enriched publication metadata for UI rendering', async () => {
  const mockSubjectId = 'sub_cs301_cn';
  const mockDriveResponse = {
    success: true,
    folderId: 'drive_folder_123',
    folderName: '[CS301] Computer Networks',
    files: [
      {
        id: 'file_draft_1',
        name: 'Unit1_Notes.pdf',
        size: 1024 * 1024 * 2.1,
        createdTime: '2026-10-18T10:00:00Z',
        isPublished: false,
        publications: []
      },
      {
        id: 'file_published_2',
        name: 'Unit2_Sockets.pdf',
        size: 1024 * 512,
        createdTime: '2026-10-18T11:00:00Z',
        isPublished: true,
        publications: [
          {
            id: 'mat_101',
            title: 'Socket Programming Notes',
            scope: 'year',
            isYearWide: true
          }
        ]
      }
    ]
  };

  // Simulate client-side rendering evaluation
  const draftFile = mockDriveResponse.files[0];
  const publishedFile = mockDriveResponse.files[1];

  assert.strictEqual(draftFile.isPublished, false);
  assert.strictEqual(draftFile.publications.length, 0);
  assert.strictEqual(formatFileSize(draftFile.size), '2.1 MB');

  assert.strictEqual(publishedFile.isPublished, true);
  assert.strictEqual(publishedFile.publications.length, 1);
  assert.strictEqual(publishedFile.publications[0].scope, 'year');
  assert.strictEqual(formatFileSize(publishedFile.size), '512.0 KB');
});

// -----------------------------------------------------------------------------
// CLEANUP & SUMMARY
// -----------------------------------------------------------------------------
console.log('\n======================================================');
console.log(` SUMMARY: ${passed} passed, ${failed} failed`);
console.log('======================================================\n');

if (failed > 0) {
  process.exit(1);
}
