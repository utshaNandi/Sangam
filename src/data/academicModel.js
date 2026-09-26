export const globalAcademicData = [
  {
    institution: "UEMK",
    programme: "B.Tech",
    branch: "CSE",
    specialization: "AI",
    year: "2nd Year",
    section: "Section C",
    subject: "DSA",
    faculty: "Dr. Sarah Jenkins",
    studentsCount: 60,
  },
  {
    institution: "UEMK",
    programme: "B.Tech",
    branch: "CSE",
    specialization: "AI",
    year: "2nd Year",
    section: "Section C",
    subject: "OS",
    faculty: "Prof. Alan Turing",
    studentsCount: 60,
  },
  {
    institution: "UEMK",
    programme: "B.Tech",
    branch: "CSE",
    specialization: "AI",
    year: "2nd Year",
    section: "Section B",
    subject: "DSA",
    faculty: "Dr. Sarah Jenkins",
    studentsCount: 55,
  },
  {
    institution: "UEMK",
    programme: "B.Tech",
    branch: "CSE",
    specialization: "Core",
    year: "3rd Year",
    section: "Section A",
    subject: "DSA",
    faculty: "Dr. Sarah Jenkins",
    studentsCount: 62,
  },
  {
    institution: "UEMK",
    programme: "BBA",
    branch: "Management",
    specialization: "Core",
    year: "1st Year",
    section: "Section A",
    subject: "Business Ethics",
    faculty: "Dr. Smith",
    studentsCount: 40,
  }
];

export const getTreeForRole = (role, email) => {
  // If director, return full tree with Manage permissions everywhere
  // If teacher, filter by faculty name/email
  
  let allowedData = globalAcademicData;
  let permissions = ["View"];

  if (role === 'director') {
    permissions = ["View", "Announce", "Manage"];
  } else if (role === 'faculty') {
    // Hardcoding Dr. Sarah Jenkins for demo purposes, matching mockData.js
    allowedData = globalAcademicData.filter(d => d.faculty === "Dr. Sarah Jenkins");
    permissions = ["View", "Announce", "Manage"]; // Faculty gets manage on their subjects
  } else if (role === 'student') {
    allowedData = globalAcademicData.filter(d => d.section === "Section C" && d.year === "2nd Year"); // mock student
  }

  const tree = {};
  allowedData.forEach(alloc => {
    if (!tree[alloc.institution]) tree[alloc.institution] = {};
    if (!tree[alloc.institution][alloc.programme]) tree[alloc.institution][alloc.programme] = {};
    if (!tree[alloc.institution][alloc.programme][alloc.branch]) tree[alloc.institution][alloc.programme][alloc.branch] = {};
    if (!tree[alloc.institution][alloc.programme][alloc.branch][alloc.specialization]) tree[alloc.institution][alloc.programme][alloc.branch][alloc.specialization] = {};
    if (!tree[alloc.institution][alloc.programme][alloc.branch][alloc.specialization][alloc.year]) tree[alloc.institution][alloc.programme][alloc.branch][alloc.specialization][alloc.year] = {};
    if (!tree[alloc.institution][alloc.programme][alloc.branch][alloc.specialization][alloc.year][alloc.section]) tree[alloc.institution][alloc.programme][alloc.branch][alloc.specialization][alloc.year][alloc.section] = {};
    tree[alloc.institution][alloc.programme][alloc.branch][alloc.specialization][alloc.year][alloc.section][alloc.subject] = permissions;
  });
  return tree;
};
