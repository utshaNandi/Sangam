import { useState } from 'react';
import { classes, students, assignments, announcements } from './mockData';
import { Icons } from './Icons';

export function ClassesView() {
  return (
    <div className="space-y-6 animate-fade-in relative z-10">
      <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">My Classes</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {classes.map(c => (
          <div key={c.id} className="bg-white rounded-[24px] border border-slate-100 p-6 shadow-[0_2px_20px_rgba(0,0,0,0.02)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.04)] hover:-translate-y-1 transition-all duration-300 cursor-pointer">
            <div className="flex justify-between items-start mb-5">
              <div>
                <h3 className="text-xl font-bold text-slate-900">{c.subject}</h3>
                <p className="text-sm font-medium text-slate-500 mt-1">{c.section} • {c.semester} Sem</p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-theme-bg text-theme-primary flex items-center justify-center">
                <Icons.Classes />
              </div>
            </div>
            <div className="space-y-3 text-sm text-slate-500 font-medium">
              <div className="flex justify-between items-center py-2 border-b border-slate-50"><span>Students:</span> <span className="font-bold text-slate-900 bg-slate-50 px-2 py-0.5 rounded-lg">{c.studentsCount}</span></div>
              <div className="flex justify-between items-center py-2 border-b border-slate-50"><span>Room:</span> <span className="font-bold text-slate-900">{c.room}</span></div>
              <div className="flex justify-between items-center py-2"><span>Next Class:</span> <span className="font-bold text-theme-primary">{c.time}</span></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StudentsView() {
  const [searchTerm, setSearchTerm] = useState('');
  
  const filteredStudents = students.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.roll.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="space-y-6 animate-fade-in relative z-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Students</h2>
        <div className="relative w-full sm:w-72">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"><Icons.Search /></div>
          <input 
            type="text" 
            placeholder="Search students..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 bg-white border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-theme-primary/20 focus:border-theme-primary transition-all text-sm font-medium placeholder:text-slate-400 shadow-sm"
          />
        </div>
      </div>

      <div className="bg-white rounded-[24px] border border-slate-100 shadow-[0_2px_20px_rgba(0,0,0,0.02)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
              <tr>
                <th className="px-6 py-4 uppercase tracking-wider text-[11px]">Name</th>
                <th className="px-6 py-4 uppercase tracking-wider text-[11px]">Roll No.</th>
                <th className="px-6 py-4 uppercase tracking-wider text-[11px]">Section</th>
                <th className="px-6 py-4 uppercase tracking-wider text-[11px]">Attendance</th>
                <th className="px-6 py-4 uppercase tracking-wider text-[11px]">Avg Marks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredStudents.map(s => (
                <tr key={s.id} className="hover:bg-theme-bg/50 transition-colors group">
                  <td className="px-6 py-4 font-bold text-slate-900">{s.name}</td>
                  <td className="px-6 py-4 text-slate-500 font-medium">{s.roll}</td>
                  <td className="px-6 py-4 text-slate-500 font-medium">{s.section}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-bold ${s.attendance >= 75 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                      {s.attendance}%
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-900 font-bold group-hover:text-theme-primary transition-colors">{s.avgMarks}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function AssignmentsView() {
  return (
    <div className="space-y-6 animate-fade-in relative z-10">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Assignments</h2>
        <button className="flex items-center gap-2 bg-theme-primary text-white px-5 py-2.5 rounded-xl hover:opacity-90 transition-all shadow-sm font-bold text-sm">
          <Icons.Plus /> Create Assignment
        </button>
      </div>

      <div className="grid gap-4">
        {assignments.map(a => (
          <div key={a.id} className="bg-white rounded-[24px] border border-slate-100 p-6 shadow-[0_2px_20px_rgba(0,0,0,0.02)] hover:border-theme-primary/30 flex flex-col sm:flex-row sm:items-center justify-between gap-5 transition-all">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-lg font-bold text-slate-900">{a.title}</h3>
                <span className={`text-[11px] uppercase tracking-wider px-2.5 py-1 rounded-lg font-bold ${a.status === 'Active' ? 'bg-theme-bg text-theme-primary' : 'bg-slate-100 text-slate-500'}`}>{a.status}</span>
              </div>
              <p className="text-sm font-medium text-slate-500">{a.className} • Due: {a.dueDate}</p>
            </div>
            
            <div className="flex items-center gap-6">
              <div className="text-center">
                <p className="text-xl font-extrabold text-slate-900">{a.submitted}/{a.total}</p>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Submitted</p>
              </div>
              <button className="px-5 py-2.5 text-theme-primary bg-theme-bg rounded-xl text-sm font-bold hover:opacity-80 transition-colors">
                Review
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AttendanceView() {
  return (
    <div className="space-y-6 animate-fade-in relative z-10">
      <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Mark Attendance</h2>
      
      <div className="bg-white rounded-[24px] border border-slate-100 p-6 shadow-[0_2px_20px_rgba(0,0,0,0.02)] flex flex-wrap gap-5 items-end">
         <div className="flex-1 min-w-[200px]">
           <label className="block text-sm font-bold text-slate-700 mb-2">Select Class</label>
           <select className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-theme-primary/20 focus:border-theme-primary outline-none text-sm font-medium text-slate-700 shadow-sm transition-all bg-white">
              {classes.map(c => <option key={c.id}>{c.subject} ({c.section})</option>)}
           </select>
         </div>
         <div className="flex-1 min-w-[200px]">
           <label className="block text-sm font-bold text-slate-700 mb-2">Date</label>
           <input type="date" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-theme-primary/20 focus:border-theme-primary outline-none text-sm font-medium text-slate-700 shadow-sm transition-all" defaultValue={new Date().toISOString().split('T')[0]} />
         </div>
         <button className="bg-theme-primary text-white px-6 py-2.5 rounded-xl font-bold hover:opacity-90 transition-all shadow-sm h-[46px]">
           Load Students
         </button>
      </div>

      <div className="bg-white rounded-[24px] border border-slate-100 shadow-[0_2px_20px_rgba(0,0,0,0.02)] p-12 text-center text-slate-400 flex flex-col items-center justify-center">
        <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 mb-4">
           <Icons.Attendance />
        </div>
        <p className="font-medium">Select a class and date to mark attendance.</p>
      </div>
    </div>
  );
}

export function GradesView() {
  return (
    <div className="space-y-6 animate-fade-in relative z-10">
      <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Grades & Marks</h2>
      <div className="bg-white rounded-[24px] border border-slate-100 shadow-[0_2px_20px_rgba(0,0,0,0.02)] p-12 text-center text-slate-400 flex flex-col items-center justify-center">
        <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 mb-4">
           <Icons.Grades />
        </div>
        <p className="font-medium">Select an assignment to grade students.</p>
      </div>
    </div>
  );
}

export function AnnouncementsView() {
  return (
    <div className="space-y-6 animate-fade-in relative z-10">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Announcements</h2>
        <button className="flex items-center gap-2 bg-theme-primary text-white px-5 py-2.5 rounded-xl hover:opacity-90 transition-all shadow-sm font-bold text-sm">
          <Icons.Plus /> Post Announcement
        </button>
      </div>
      <div className="grid gap-4">
        {announcements.map(a => (
          <div key={a.id} className="bg-white rounded-[24px] border border-slate-100 p-6 shadow-[0_2px_20px_rgba(0,0,0,0.02)] hover:border-theme-primary/30 transition-all">
             <div className="flex justify-between items-start mb-3">
                <h3 className="font-bold text-slate-900 text-lg">{a.title}</h3>
                <span className="text-[11px] font-bold text-slate-500 bg-slate-50 px-2.5 py-1 rounded-lg uppercase tracking-wider">{a.date}</span>
             </div>
             <p className="text-sm text-slate-600 mb-4 leading-relaxed font-medium">{a.content}</p>
             <span className="text-xs font-bold text-theme-primary bg-theme-bg px-3 py-1 rounded-lg">Class: {classes.find(c => c.id === a.classId)?.subject || 'All Classes'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ScheduleView() {
  return (
    <div className="space-y-6 animate-fade-in relative z-10">
      <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Weekly Schedule</h2>
      <div className="bg-white rounded-[24px] border border-slate-100 shadow-[0_2px_20px_rgba(0,0,0,0.02)] p-12 text-center text-slate-400 flex flex-col items-center justify-center">
        <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 mb-4">
           <Icons.Schedule />
        </div>
        <p className="font-medium">Schedule grid will appear here.</p>
      </div>
    </div>
  );
}

export function ResourcesView() {
  return (
    <div className="space-y-6 animate-fade-in relative z-10">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Resources</h2>
        <button className="flex items-center gap-2 bg-theme-primary text-white px-5 py-2.5 rounded-xl hover:opacity-90 transition-all shadow-sm font-bold text-sm">
          <Icons.Plus /> Upload Resource
        </button>
      </div>
      <div className="bg-white rounded-[24px] border border-slate-100 shadow-[0_2px_20px_rgba(0,0,0,0.02)] p-12 text-center text-slate-400 flex flex-col items-center justify-center">
        <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 mb-4">
           <Icons.Resources />
        </div>
        <p className="font-medium">No resources uploaded yet.</p>
      </div>
    </div>
  );
}
