const fs = require('fs');
const content = fs.readFileSync('src/pages/Teacher/TeacherViews.jsx', 'utf8');
const idx1 = content.indexOf('return <TreeHierarchy title="Students"');
const idx2 = content.indexOf('return <TreeHierarchy title="Attendance"');
console.log("Students: " + idx1);
console.log("Attendance: " + idx2);
console.log(content.slice(idx1, idx2 + 200));
