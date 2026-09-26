const fs = require('fs');
let content = fs.readFileSync('src/pages/Teacher/TeacherViews.jsx', 'utf8');

const regex = /const toggleNode = \(nodeId\) => setExpandedNodes\(prev => \{[\s\S]*?return newState;\s*\}\);/g;

const newToggle = `const toggleNode = (nodeId) => setExpandedNodes(prev => {
    const isExpanding = !prev[nodeId];
    const newState = { ...prev };
    if (isExpanding) {
      const level = (nodeId.match(/-/g) || []).length;
      
      // Determine the parent prefix to ensure we only collapse TRUE SIBLINGS
      // Example: nodeId = "CSE-1st Year-Sec A"
      // Parent prefix = "CSE-1st Year"
      const parts = nodeId.split('-');
      const parentPrefix = parts.slice(0, -1).join('-');
      
      Object.keys(newState).forEach(key => {
        if (key !== nodeId && (key.match(/-/g) || []).length === level) {
          // If level > 0, only collapse if it shares the SAME PARENT
          const keyParts = key.split('-');
          const keyParentPrefix = keyParts.slice(0, -1).join('-');
          
          if (level === 0 || keyParentPrefix === parentPrefix) {
             newState[key] = false;
             // Collapse all descendants of this sibling
             Object.keys(newState).forEach(k => {
               if (k.startsWith(key + '-')) newState[k] = false;
             });
          }
        }
      });
    } else {
      // When explicitly collapsing a node, collapse all its descendants
      Object.keys(newState).forEach(k => {
         if (k.startsWith(nodeId + '-')) newState[k] = false;
      });
    }
    newState[nodeId] = isExpanding;
    return newState;
  });`;

content = content.replace(regex, newToggle);
fs.writeFileSync('src/pages/Teacher/TeacherViews.jsx', content);
console.log('Fixed toggleNode in TeacherViews');
