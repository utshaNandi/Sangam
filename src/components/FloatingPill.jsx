export default function FloatingPill({ icon, label, className = "" }) {
  return (
    <div className={`absolute px-5 py-2.5 bg-white/70 backdrop-blur-md rounded-full shadow-sm flex items-center gap-2.5 hover:scale-105 transition-transform duration-300 cursor-default border border-white/50 ${className}`}>
      <span className="text-[#6D5647] text-[1.1rem] leading-none">{icon}</span>
      <span className="text-[15px] font-serif text-[#3E2723] font-medium tracking-wide">{label}</span>
    </div>
  );
}