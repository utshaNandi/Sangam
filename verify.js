import { students, globalPeriodAttendance } from './src/pages/Teacher/mockData.js';

const student = students.find(s => s.section === 'CSE-C');
const periodData = globalPeriodAttendance[student.id];

let daysHeld = 0;
let daysAttended = 0;

Object.keys(periodData).forEach(dateStr => {
  const periods = periodData[dateStr];
  let hasAbsent = false;
  let hasRecorded = false;

  [1,2,3,4,6,7,8,9].forEach(p => {
    if (periods[p] === 'Absent') {
      hasAbsent = true;
      hasRecorded = true;
    } else if (periods[p] === 'Present') {
      hasRecorded = true;
    }
  });

  if (hasRecorded) {
    daysHeld++;
    if (!hasAbsent) {
      daysAttended++;
    }
  }
});

console.log("Semester: ", daysAttended, "/", daysHeld, "=", (daysAttended / daysHeld) * 100, "%");
