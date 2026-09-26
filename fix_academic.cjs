const fs = require('fs');
let content = fs.readFileSync('src/pages/Teacher/AcademicSpacesView.jsx', 'utf8');

const regex = /const toggleExpand = \(pathArr, isExpanded\) => \{[\s\S]*?setExpandedPaths\(newExpanded\);\s*\};/;

const newToggle = `const toggleExpand = (pathArr, isExpanded) => {
    const pathStr = pathArr.join('|');
    const newExpanded = new Set(expandedPaths);
    
    if (isExpanded) {
      // Collapse node and all descendants
      for (let key of Array.from(newExpanded)) {
         if (key === pathStr || key.startsWith(pathStr + '|')) {
             newExpanded.delete(key);
         }
      }
      const currentActiveStr = activePath.join('|');
      if (currentActiveStr.startsWith(pathStr)) {
         setActivePath(pathArr.slice(0, -1));
      }
    } else {
      // Expand node, but collapse siblings and their descendants
      const level = pathArr.length;
      const parentPrefix = pathArr.slice(0, -1).join('|');
      
      for (let key of Array.from(newExpanded)) {
         const keyParts = key.split('|');
         // Check if key is a sibling
         if (keyParts.length === level) {
             const keyParentPrefix = keyParts.slice(0, -1).join('|');
             if (level === 1 || keyParentPrefix === parentPrefix) {
                 // Delete sibling
                 newExpanded.delete(key);
                 // Delete sibling's descendants
                 for (let descKey of Array.from(newExpanded)) {
                    if (descKey.startsWith(key + '|')) {
                        newExpanded.delete(descKey);
                    }
                 }
             }
         }
      }
      newExpanded.add(pathStr);
      setActivePath(pathArr);
    }
    setExpandedPaths(newExpanded);
  };`;

content = content.replace(regex, newToggle);
fs.writeFileSync('src/pages/Teacher/AcademicSpacesView.jsx', content);
console.log('Fixed toggleExpand in AcademicSpacesView');
