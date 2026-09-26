const fs = require('fs');
const content = fs.readFileSync('src/pages/Teacher/TeacherViews.jsx', 'utf8');
const idx = content.indexOf('export function StudentsView');
console.log(content.slice(idx, idx + 6000));
