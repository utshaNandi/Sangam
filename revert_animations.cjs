const fs = require('fs');
let content = fs.readFileSync('src/pages/Teacher/TeacherViews.jsx', 'utf8');

// header card
content = content.replace(
  'md:items-start gap-8 group animate-hero-fade-up" style={{ animationDelay: \'100ms\', animationFillMode: \'both\' }}>',
  'md:items-start gap-8 group">'
);

// contact buttons
content = content.replace(
  /cursor-pointer shadow-sm active:scale-95\">/g,
  'cursor-pointer shadow-sm\">'
);

// metrics
content = content.replace(
  'overflow-hidden group animate-hero-fade-up" style={{ animationDelay: \'200ms\', animationFillMode: \'both\' }}>\n             <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50',
  'overflow-hidden group">\n             <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50'
);
content = content.replace(
  'overflow-hidden group animate-hero-fade-up" style={{ animationDelay: \'300ms\', animationFillMode: \'both\' }}>\n             <div className="absolute top-0 right-0 w-24 h-24 bg-purple-50',
  'overflow-hidden group">\n             <div className="absolute top-0 right-0 w-24 h-24 bg-purple-50'
);
content = content.replace(
  'overflow-hidden group animate-hero-fade-up" style={{ animationDelay: \'400ms\', animationFillMode: \'both\' }}>\n             <div className="absolute top-0 right-0 w-24 h-24 bg-amber-50',
  'overflow-hidden group">\n             <div className="absolute top-0 right-0 w-24 h-24 bg-amber-50'
);

// info cards
content = content.replace(
  'p-8 shadow-[0_2px_20px_rgba(0,0,0,0.02)] animate-hero-fade-up" style={{ animationDelay: \'500ms\', animationFillMode: \'both\' }}>\n            <h3 className="text-xl',
  'p-8 shadow-[0_2px_20px_rgba(0,0,0,0.02)]">\n            <h3 className="text-xl'
);
content = content.replace(
  'p-8 shadow-[0_2px_20px_rgba(0,0,0,0.02)] animate-hero-fade-up" style={{ animationDelay: \'600ms\', animationFillMode: \'both\' }}>\n            <h3 className="text-xl',
  'p-8 shadow-[0_2px_20px_rgba(0,0,0,0.02)]">\n            <h3 className="text-xl'
);

fs.writeFileSync('src/pages/Teacher/TeacherViews.jsx', content);
console.log('Reverted animations successfully!');
