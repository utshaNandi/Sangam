export default function FloatingPill({ icon, label, className = "" }) {
  return (
    <div className={`group absolute px-5 py-2.5 bg-white/70 backdrop-blur-md rounded-full shadow-sm flex items-center gap-2.5 hover:scale-105 hover:shadow-md transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] cursor-default border border-white/50 ${className}`}>
      <span className="text-[#6D5647] text-[1.1rem] leading-none transition-transform duration-300 ease-out group-hover:scale-110 group-hover:rotate-6">{icon}</span>
      <span className="text-[15px] font-serif text-[#3E2723] font-medium tracking-wide">{label}</span>
    </div>
  );
}