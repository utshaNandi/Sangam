import React, { useState, useMemo } from 'react';

export function SimilarityCheckView({ assignment, submittedStudents, onCompare }) {
  const [status, setStatus] = useState('Analyzing...');
  
  // Fake delay for analyzing status
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setStatus('Analysis complete');
    }, 2000);
    return () => clearTimeout(timer);
  }, [assignment.id]);

  const { pairs, studentScores } = useMemo(() => {
    if (submittedStudents.length < 2) return { pairs: [], studentScores: {} };
    
    let allPairs = [];
    let sScores = {};
    
    // Seeded random for deterministic similarities
    const getSeed = (str) => {
       let s = 0;
       for(let i=0; i<str.length; i++) s += str.charCodeAt(i);
       return s;
    };
    
    for (let i = 0; i < submittedStudents.length; i++) {
       sScores[submittedStudents[i].id] = 0;
    }

    for (let i = 0; i < submittedStudents.length; i++) {
       for (let j = i + 1; j < submittedStudents.length; j++) {
           const stA = submittedStudents[i];
           const stB = submittedStudents[j];
           const seedStr = assignment.id + stA.id + stB.id;
           const seed = getSeed(seedStr);
           
           // Make a few highly similar
           
           let score = (seed % 15) + 2; 
           if (seed % 7 === 0) {
              score = 65 + (seed % 30); 
           }
           
           let pairObj = {
               stA, stB, score,
               sharedPassage: "The efficiency of the algorithm heavily relies on the underlying data structure choices, specifically regarding how memory is allocated during the initialization phase.",
               fakeContentA: "In addition to this, the time complexity can be bounded by O(N log N) if we assume average case distribution.",
               fakeContentB: "Furthermore, if we consider average case inputs, the time complexity is bounded by O(N log N)."
           };
           
           if (stB.isReal && stA.isReal && stB.similarityReport) {
              score = stB.similarityReport.overallSimilarity;
              pairObj = {
                stA, stB, score, report: stB.similarityReport
              };
           } else if (stA.isReal && stB.isReal && stA.similarityReport) {
              score = stA.similarityReport.overallSimilarity;
              pairObj = {
                stA, stB, score, report: stA.similarityReport
              };
           }
           
           allPairs.push(pairObj);

           
           if (score > sScores[stA.id]) sScores[stA.id] = score;
           if (score > sScores[stB.id]) sScores[stB.id] = score;
       }
    }
    
    return { pairs: allPairs.sort((a,b) => b.score - a.score), studentScores: sScores };
  }, [submittedStudents, assignment.id]);

  if (submittedStudents.length < 2) {
    return (
      <div className="bg-white/80 rounded-[24px] border border-[#D8D1C3] p-6 shadow-xs mt-6">
        <h3 className="text-lg font-bold text-[#171717] mb-2">Similarity Status</h3>
        <p className="text-sm text-[#858174] font-medium">Peer comparison is not yet possible. Waiting for more submissions.</p>
      </div>
    );
  }

  return (
    <div className="bg-white/80 rounded-[24px] border border-[#D8D1C3] p-6 shadow-xs mt-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-[#171717]">Similarity Status</h3>
        <span className={`text-xs font-bold px-3 py-1 rounded-full border ${status === 'Analysis complete' ? 'bg-[#A9BD78]/25 text-[#273811] border-[#A9BD78]/50' : 'bg-[#F3D75E]/30 text-[#45380b] border-[#F3D75E]/50 animate-pulse'}`}>
           {status}
        </span>
      </div>
      
      {status === 'Analysis complete' && (
        <div className="space-y-8">
          <div>
            <h4 className="text-xs font-bold text-[#858174] mb-3 uppercase tracking-wider">{submittedStudents.length} Submissions Analyzed</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {submittedStudents.slice(0, 10).map(st => {
                 const score = studentScores[st.id] || 0;
                 const isHigh = score > 40;
                 return (
                   <div key={st.id} className="flex items-center justify-between p-3.5 rounded-xl border border-[#D8D1C3]/60 bg-[#FDFBF7] hover:bg-[#F5E5EE]/50 transition-colors">
                     <span className="font-bold text-[#171717] text-sm">{st.name}</span>
                     <div className="flex items-center gap-3">
                       <span className={`text-sm font-bold ${isHigh ? 'text-[#a12052]' : 'text-[#858174]'}`}>{score}%</span>
                       <span className={`text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 rounded-lg border transition-all ${isHigh ? 'bg-[#EFA9D1]/30 text-[#5e193c] border-[#EFA9D1]/60 cursor-pointer hover:bg-[#EFA9D1]/50' : 'bg-white border-[#D8D1C3] text-[#858174]'}`}
                         onClick={() => {
                           if (isHigh) {
                              const pair = pairs.find(p => p.score === score && (p.stA.id === st.id || p.stB.id === st.id));
                              if (pair) onCompare(pair);
                           }
                         }}
                       >
                         {isHigh ? 'Review' : 'Low similarity'}
                       </span>
                     </div>
                   </div>
                 )
              })}
              {submittedStudents.length > 10 && (
                <div className="p-3 text-sm font-medium text-[#858174] italic">...and {submittedStudents.length - 10} more</div>
              )}
            </div>
          </div>
          
          <div>
             <h4 className="text-xs font-bold text-[#858174] mb-3 uppercase tracking-wider">Pairwise Similarity Matrix (Top 5)</h4>
             <div className="overflow-x-auto">
               <table className="w-full text-sm text-left border-collapse">
                 <thead>
                   <tr>
                     <th className="p-2.5 border-b border-[#D8D1C3] text-[#858174] font-bold uppercase text-[10px]">Student</th>
                     {submittedStudents.slice(0, 5).map(s => <th key={s.id} className="p-2.5 border-b border-[#D8D1C3] text-[#858174] font-bold uppercase text-[10px] truncate max-w-[80px]">{s.name.split(' ')[0]}</th>)}
                   </tr>
                 </thead>
                 <tbody>
                   {submittedStudents.slice(0, 5).map(rowSt => (
                     <tr key={rowSt.id} className="hover:bg-[#F5E5EE]/30 transition-colors">
                       <td className="p-2.5 border-b border-[#D8D1C3]/50 font-bold text-[#171717] text-xs truncate max-w-[100px]">{rowSt.name}</td>
                       {submittedStudents.slice(0, 5).map(colSt => {
                         if (rowSt.id === colSt.id) return <td key={colSt.id} className="p-2.5 border-b border-[#D8D1C3]/50 text-[#858174]/40 text-center text-xs">—</td>;
                         const pair = pairs.find(p => (p.stA.id === rowSt.id && p.stB.id === colSt.id) || (p.stB.id === rowSt.id && p.stA.id === colSt.id));
                         const score = pair ? pair.score : 0;
                         const isHigh = score > 40;
                         return (
                           <td 
                             key={colSt.id} 
                             onClick={() => pair && onCompare(pair)}
                             className={`p-2.5 border-b border-[#D8D1C3]/50 text-center font-bold text-xs cursor-pointer hover:bg-[#F5E5EE] transition-colors ${isHigh ? 'text-[#a12052] font-extrabold' : 'text-[#858174]'}`}
                           >
                             {score < 10 ? `0${score}%` : `${score}%`}
                           </td>
                         )
                       })}
                     </tr>
                   ))}
                 </tbody>
               </table>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
