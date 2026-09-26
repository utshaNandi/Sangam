const fs = require('fs');

const newCode = `
export function ClassesView() {
  // Determine current day robustly
  const daysMap = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const currentDayName = daysMap[new Date().getDay()].toLowerCase();
  
  // Normalize schedule keys and find today's schedule
  let todaysSchedule = [];
  for (const [dayKey, periods] of Object.entries(scheduleData)) {
    if (dayKey.toLowerCase().trim() === currentDayName) {
      todaysSchedule = periods;
      break;
    }
  }
  
  // NO FILTERING: Include EVERY period for the current day
  const myClasses = todaysSchedule.map(period => {
    return {
      id: period.period,
      subject: period.subject,
      section: period.classInfo ? period.classInfo : period.type,
      semester: currentDayName.charAt(0).toUpperCase() + currentDayName.slice(1),
      studentsCount: period.type === 'Break' ? 0 : 20,
      room: period.type === 'Break' ? 'Cafeteria' : (period.type === 'Lab' ? 'Computer Lab' : 'Lecture Hall'),
      time: period.time
    };
  });

  return (
    <div className="space-y-6 animate-hero-fade-up relative z-10" style={{ animationDuration: '400ms' }}>
      <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">My Classes</h2>
      
      {myClasses.length === 0 ? (
        <div className="bg-white rounded-[24px] border border-slate-100 p-10 text-center shadow-[0_2px_20px_rgba(0,0,0,0.02)]">
           <p className="text-lg font-bold text-slate-500">No classes scheduled for today</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {myClasses.map(c => (
            <div key={c.id} className="bg-white rounded-[24px] border border-slate-100 p-6 shadow-[0_2px_20px_rgba(0,0,0,0.02)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] hover:-translate-y-1 active:scale-[0.98] transition-all duration-300 cursor-pointer group">
              <div className="flex justify-between items-start mb-5">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 group-hover:text-theme-primary transition-colors">{c.subject}</h3>
                  <p className="text-sm font-medium text-slate-500 mt-1">{c.section} \u2022 {c.semester}</p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-theme-bg text-theme-primary flex items-center justify-center transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
                  <Icons.Classes />
                </div>
              </div>
              <div className="space-y-3 text-sm text-slate-500 font-medium">
                <div className="flex justify-between items-center py-2 border-b border-slate-50"><span>Students:</span> <span className="font-bold text-slate-900 bg-slate-50 px-2 py-0.5 rounded-lg">{c.studentsCount}</span></div>
                <div className="flex justify-between items-center py-2 border-b border-slate-50"><span>Room:</span> <span className="font-bold text-slate-900 group-hover:text-slate-600 transition-colors">{c.room}</span></div>
                <div className="flex justify-between items-center py-2"><span>Time:</span> <span className="font-bold text-theme-primary">{c.time}</span></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
`;

let content = fs.readFileSync('src/pages/Teacher/TeacherViews.jsx', 'utf8');
const classRegex = /export function ClassesView\(\) \{[\s\S]*?\n\}\n/m;
content = content.replace(classRegex, newCode);
fs.writeFileSync('src/pages/Teacher/TeacherViews.jsx', content);
console.log('Successfully replaced ClassesView without filtering');
