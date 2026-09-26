const fs = require('fs');
let content = fs.readFileSync('src/pages/Teacher/TeacherViews.jsx', 'utf8');

const oldToggle = 'const toggleNode = (nodeId) => setExpandedNodes(prev => ({ ...prev, [nodeId]: !prev[nodeId] }));';

const newToggle = `const toggleNode = (nodeId) => setExpandedNodes(prev => {
    const isExpanding = !prev[nodeId];
    const newState = { ...prev };
    if (isExpanding) {
      const level = (nodeId.match(/-/g) || []).length;
      Object.keys(newState).forEach(key => {
        if (key !== nodeId && (key.match(/-/g) || []).length === level) {
          newState[key] = false; Object.keys(newState).forEach(k => { if (k.startsWith(key + '-')) newState[k] = false; });
        }
      });
    }
    newState[nodeId] = isExpanding;
    return newState;
  });`;

content = content.split(oldToggle).join(newToggle);
fs.writeFileSync('src/pages/Teacher/TeacherViews.jsx', content);
console.log('Replaced toggleNode in all views.');
