const fs = require('fs');
const content = fs.readFileSync('src/pages/Teacher/TeacherViews.jsx', 'utf8');
const regex = /return <TreeHierarchy title="Students"[\s\S]*?return <TreeHierarchy title="Attendance"[\s\S]*?\n\}/;
console.log(regex.test(content));
