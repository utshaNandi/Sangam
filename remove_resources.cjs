const fs = require('fs');

// 1. Update TeacherApp.jsx
let appContent = fs.readFileSync('src/pages/Teacher/TeacherApp.jsx', 'utf8');

appContent = appContent.replace('  ResourcesView \n', '');
appContent = appContent.replace(/,\s*ResourcesView\s*\}/, '}');
appContent = appContent.replace(/,\s*ResourcesView\s*/, '');
appContent = appContent.replace(/\n\s*\{\s*id:\s*'Resources',\s*label:\s*'',\s*icon:\s*<Icons\.Resources \/>\s*\},/, '');
appContent = appContent.replace(/\n\s*case\s*'Resources':\s*return\s*<ResourcesView\s*\/>;/, '');

fs.writeFileSync('src/pages/Teacher/TeacherApp.jsx', appContent);


// 2. Update DashboardHome.jsx
let dashboardContent = fs.readFileSync('src/pages/Teacher/DashboardHome.jsx', 'utf8');

// The QuickActions grid
dashboardContent = dashboardContent.replace(
  /<div className="grid grid-cols-2 gap-3">\s*<QuickAction icon=\{<Icons.Plus \/>\} label="Assignment" onClick=\{.*?\} \/>\s*<QuickAction icon=\{<Icons.Attendance \/>\} label="Attendance" onClick=\{.*?\} \/>\s*<QuickAction icon=\{<Icons.Resources \/>\} label="" onClick=\{.*?\} \/>\s*<QuickAction icon=\{<Icons.Announcements \/>\} label="Announcement" onClick=\{.*?\} \/>\s*<\/div>/,
  '<div className="grid grid-cols-3 gap-3">\n' +
  '                <QuickAction icon={<Icons.Plus />} label="Assignment" onClick={() => onNavigate(\'Assignments\')} />\n' +
  '                <QuickAction icon={<Icons.Attendance />} label="Attendance" onClick={() => onNavigate(\'Attendance\')} />\n' +
  '                <QuickAction icon={<Icons.Announcements />} label="Announcement" onClick={() => onNavigate(\'Announcements\')} />\n' +
  '              </div>'
);

fs.writeFileSync('src/pages/Teacher/DashboardHome.jsx', dashboardContent);


// 3. Update Icons.jsx
let iconsContent = fs.readFileSync('src/pages/Teacher/Icons.jsx', 'utf8');
iconsContent = iconsContent.replace(/\n\s*Resources:\s*\(\)\s*=>\s*<svg.*?<\/svg>,/, '');
fs.writeFileSync('src/pages/Teacher/Icons.jsx', iconsContent);


// 4. Update TeacherViews.jsx
let viewsContent = fs.readFileSync('src/pages/Teacher/TeacherViews.jsx', 'utf8');

const resourcesViewRegex = /export function ResourcesView\(\)\s*\{[\s\S]*?\n\}\s*$/;
viewsContent = viewsContent.replace(resourcesViewRegex, '');
fs.writeFileSync('src/pages/Teacher/TeacherViews.jsx', viewsContent);

console.log('Successfully removed Resources completely');
