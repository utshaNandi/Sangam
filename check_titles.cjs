const fs = require('fs');
const content = fs.readFileSync('src/pages/Teacher/TeacherViews.jsx', 'utf8');
const matches = content.match(/title=".*?"/g);
console.log(matches);
