const fs = require('fs');

const sharedLogic = `
export const tree = {};
Object.values(scheduleData).flat().forEach(period => {
  if (period.classInfo) {
    const parts = period.classInfo.split(/ \\u2022 | - /); 
    if (parts.length >= 3) {
      const year = parts[0].trim();
      const branch = parts[1].trim();
      const section = parts[2].trim().replace('Section ', 'Section ');
      if (!tree[branch]) tree[branch] = {};
      if (!tree[branch][year]) tree[branch][year] = new Set();
      tree[branch][year].add(section);
    }
  }
});
export const branches = Object.keys(tree).sort();

export const get20Students = (branch, year, section) => {
  const firstNames = ["Aarav", "Ananya", "Arjun", "Aditya", "Anika", "Rohan", "Riya", "Karan", "Ishita", "Rahul", "Aditi", "Yash", "Neha", "Aryan", "Priya", "Kabir", "Sneha", "Dev", "Meera", "Vivaan", "Vikram", "Siddharth", "Tara", "Rishabh", "Nisha", "Ravi", "Pooja", "Amit", "Sonal", "Kunal"];
  const lastNames = ["Sharma", "Singh", "Mehta", "Verma", "Gupta", "Patel", "Reddy", "Joshi", "Kapoor", "Chopra"];
  
  const seedStr = branch + year + section;
  let seed = 0;
  for(let i = 0; i < seedStr.length; i++) seed += seedStr.charCodeAt(i);
  
  const sectionStudents = [];
  for(let i=0; i<20; i++) {
    const fn = firstNames[(seed + i * 7) % firstNames.length];
    const ln = lastNames[(seed + i * 3) % lastNames.length];
    sectionStudents.push({ 
       id: \`\${branch}-\${year}-\${section}-\${i}\`.replace(/\\s/g, ''), 
       name: fn + ' ' + ln,
       roll: \`\${branch.substring(0,2).toUpperCase()}\${20 + i}\`
    });
  }
  return sectionStudents;
};
`;

let content = fs.readFileSync('src/pages/Teacher/TeacherViews.jsx', 'utf8');

// Insert the shared logic right after scheduleData
const scheduleDataEndIdx = content.indexOf('};', content.indexOf('export const scheduleData')) + 2;
content = content.slice(0, scheduleDataEndIdx) + '\n\n' + sharedLogic + content.slice(scheduleDataEndIdx);

fs.writeFileSync('src/pages/Teacher/TeacherViews.jsx', content);
console.log('Successfully added tree and get20Students');
