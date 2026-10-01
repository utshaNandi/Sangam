import React, { useState } from 'react';
import { Icons } from '../Teacher/Icons';
import { globalAcademicData } from '../../data/academicModel';

export function PeopleView() {
  const [activeTab, setActiveTab] = useState('Students');
  
  return (
    <div className="space-y-6 animate-hero-fade-up">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-extrabold text-slate-900">People</h2>
        <div className="flex gap-2">
          <button 
            onClick={() => setActiveTab('Students')}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'Students' ? 'bg-theme-bg text-theme-primary shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            Students
          </button>
          <button 
            onClick={() => setActiveTab('Faculty')}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'Faculty' ? 'bg-theme-bg text-theme-primary shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            Faculty
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div className="flex items-center gap-4 mb-6 pb-6 border-b border-slate-100">
          <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 flex items-center gap-2">
            <Icons.Search />
            <input type="text" placeholder={`Search ${activeTab.toLowerCase()}...`} className="bg-transparent border-none outline-none w-full text-sm font-medium" />
          </div>
          <button className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 rounded-xl text-slate-600 text-sm font-bold hover:bg-slate-50 transition-all">
            <Icons.Filter /> Filters
          </button>
        </div>

        {activeTab === 'Students' ? (
          <div className="space-y-4">
            <div className="p-4 border border-slate-100 rounded-xl flex items-center justify-between hover:shadow-md transition-shadow cursor-pointer">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-500">
                  JD
                </div>
                <div>
                  <h4 className="font-bold text-slate-900">John Doe</h4>
                  <p className="text-xs text-slate-500">Roll: CS20041 • 2nd Year, Section C</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs font-bold text-theme-primary bg-theme-bg px-2 py-1 rounded-md">B.Tech / CSE / AI</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-4 border border-slate-100 rounded-xl flex items-center justify-between hover:shadow-md transition-shadow cursor-pointer">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-500">
                  SJ
                </div>
                <div>
                  <h4 className="font-bold text-slate-900">Dr. Sarah Jenkins</h4>
                  <p className="text-xs text-slate-500">Senior Professor</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs font-bold text-theme-primary bg-theme-bg px-2 py-1 rounded-md">CSE AI</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function AcademicManagementView() {
  return (
    <div className="space-y-6 animate-hero-fade-up">
      <h2 className="text-2xl font-extrabold text-slate-900">Academic Management</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md cursor-pointer transition-shadow">
          <div className="w-12 h-12 rounded-xl bg-theme-bg text-theme-primary flex items-center justify-center mb-4">
            <Icons.Hierarchy />
          </div>
          <h3 className="text-lg font-bold text-slate-900">Programmes</h3>
          <p className="text-sm text-slate-500 mt-1">Manage B.Tech, BBA, etc.</p>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md cursor-pointer transition-shadow">
          <div className="w-12 h-12 rounded-xl bg-theme-bg text-theme-primary flex items-center justify-center mb-4">
            <Icons.Classes />
          </div>
          <h3 className="text-lg font-bold text-slate-900">Branches & Specializations</h3>
          <p className="text-sm text-slate-500 mt-1">Manage CSE, AI, Core, etc.</p>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md cursor-pointer transition-shadow">
          <div className="w-12 h-12 rounded-xl bg-theme-bg text-theme-primary flex items-center justify-center mb-4">
            <Icons.Students />
          </div>
          <h3 className="text-lg font-bold text-slate-900">Faculty Assignment</h3>
          <p className="text-sm text-slate-500 mt-1">Assign faculty to academic scopes.</p>
        </div>
      </div>
    </div>
  );
}
