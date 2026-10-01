const getElapsedWeekdays = (startDate, endDate) => {
  let count = 0;
  let curDate = new Date(startDate.getTime());
  curDate.setHours(0,0,0,0);
  const end = new Date(endDate.getTime());
  end.setHours(0,0,0,0);
  
  while (curDate <= end) {
    const day = curDate.getDay();
    if (day !== 0 && day !== 6) count++;
    curDate.setDate(curDate.getDate() + 1);
  }
  return count;
};

const today = new Date();
const weekStart = new Date(today);
const dayOfWeek = weekStart.getDay();
const diffToMonday = weekStart.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
weekStart.setDate(diffToMonday);
let totalWeekDays = getElapsedWeekdays(weekStart, today);

const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
let totalMonthDays = getElapsedWeekdays(monthStart, today);

const semesterStart = new Date(today);
semesterStart.setDate(today.getDate() - 60); 
let totalSemesterDays = getElapsedWeekdays(semesterStart, today);

console.log("Week:", totalWeekDays, "Month:", totalMonthDays, "Sem:", totalSemesterDays);
