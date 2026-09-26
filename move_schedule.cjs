const fs = require('fs');
let content = fs.readFileSync('src/pages/Teacher/TeacherViews.jsx', 'utf8');
const scheduleDataRegex = /const scheduleData = \{[\s\S]*?\n  \};\n/;
const match = content.match(scheduleDataRegex);
if (match) {
  content = content.replace(match[0], '');
  content = content.replace("import { Icons } from './Icons';", "import { Icons } from './Icons';\n\nexport " + match[0]);
  fs.writeFileSync('src/pages/Teacher/TeacherViews.jsx', content);
  console.log('Successfully moved scheduleData');
} else {
  console.log('scheduleData not found');
}
