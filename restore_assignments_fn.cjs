const fs = require('fs');
let content = fs.readFileSync('src/pages/Teacher/TeacherViews.jsx', 'utf8');

const getAssignmentsForSectionStr = `export const getAssignmentsForSection = (branch, year, section) => {
    const subjects = ["Data Structures", "Database Systems", "Operating Systems", "Computer Networks", "Mathematics", "Machine Learning", "Artificial Intelligence", "Web Development", "Cloud Computing"];
    const seedStr = branch + year + section + "assignments";
    let seed = 0;
    for(let i = 0; i < seedStr.length; i++) seed += seedStr.charCodeAt(i);
    
    const count = 3 + (seed % 3); // 3 to 5 assignments
    const sectionAssignments = [];
    for(let i=0; i<count; i++) {
        const subj = subjects[(seed + i * 5) % subjects.length];
        sectionAssignments.push({
            id: \`a-\${seed}-\${i}\`,
            title: \`\${subj} Assignment \${i+1}\`,
            className: \`\${year} • \${branch} • \${section}\`,
            dueDate: \`Oct \${10 + (seed + i) % 20}\`,
            total: 20, // Always 20 as requested
            status: 'Active'
        });
    }
    return sectionAssignments;
};

`;

content = content.replace('export function AssignmentsView', getAssignmentsForSectionStr + 'export function AssignmentsView');
fs.writeFileSync('src/pages/Teacher/TeacherViews.jsx', content);
console.log('Restored getAssignmentsForSection');
