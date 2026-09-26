import React, { useEffect, useRef } from 'react';
import studentImg from '../../assets/characters/student/student-character.png';

export default function StudentCharacter() {
  const containerRef = useRef(null);
  const leftAnchorRef = useRef(null);
  const leftPupilWrapperRef = useRef(null);
  const leftPupilRef = useRef(null);
  const rightAnchorRef = useRef(null);
  const rightPupilWrapperRef = useRef(null);
  const rightPupilRef = useRef(null);
  const rafRef = useRef(null);

  // Store current and target positions for lerping
  const leftPos = useRef({ currentX: 0, currentY: 0, targetX: 0, targetY: 0 });
  const rightPos = useRef({ currentX: 0, currentY: 0, targetX: 0, targetY: 0 });

  useEffect(() => {
    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let isTracking = false;

    const handleMouseMove = (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      isTracking = true;
    };

    const handleMouseLeave = () => {
      isTracking = false;
    };

    const updateEyeTarget = (targetObj) => {
      if (!isTracking || !containerRef.current) {
        targetObj.targetX = 0;
        targetObj.targetY = 0;
        return;
      }
      
      const rect = containerRef.current.getBoundingClientRect();
      
      let normalizedX = (mouseX - (rect.left + rect.width / 2)) / (rect.width / 2);
      let normalizedY = (mouseY - (rect.top + rect.height / 2)) / (rect.height / 2);

      normalizedX = Math.max(-1, Math.min(1, normalizedX));
      normalizedY = Math.max(-1, Math.min(1, normalizedY));

      const maxMoveX = 1.5; 
      const maxMoveUp = 0.5;   
      const maxMoveDown = 1.5; 

      targetObj.targetX = normalizedX * maxMoveX;
      targetObj.targetY = normalizedY < 0 ? normalizedY * maxMoveUp : normalizedY * maxMoveDown;
    };

    const lerp = (current, target, speed) => current + (target - current) * speed;

    const animate = () => {
      updateEyeTarget(leftPos.current);
      updateEyeTarget(rightPos.current);

      const lerpSpeed = 0.12; 
      
      leftPos.current.currentX = lerp(leftPos.current.currentX, leftPos.current.targetX, lerpSpeed);
      leftPos.current.currentY = lerp(leftPos.current.currentY, leftPos.current.targetY, lerpSpeed);
      
      rightPos.current.currentX = lerp(rightPos.current.currentX, rightPos.current.targetX, lerpSpeed);
      rightPos.current.currentY = lerp(rightPos.current.currentY, rightPos.current.targetY, lerpSpeed);

      if (leftPupilWrapperRef.current) {
        leftPupilWrapperRef.current.style.transform = `translate(-50%, -50%) translate(${leftPos.current.currentX}px, ${leftPos.current.currentY}px)`;
      }
      if (rightPupilWrapperRef.current) {
        rightPupilWrapperRef.current.style.transform = `translate(-50%, -50%) translate(${rightPos.current.currentX}px, ${rightPos.current.currentY}px)`;
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    document.addEventListener('mouseleave', handleMouseLeave);
    rafRef.current = requestAnimationFrame(animate);
    
    let blinkTimeout1;
    let blinkTimeout2;
    const blink = () => {
      if (leftPupilRef.current) leftPupilRef.current.style.transform = 'scaleY(0.1)';
      if (rightPupilRef.current) rightPupilRef.current.style.transform = 'scaleY(0.1)';
      
      const blinkDuration = 120 + Math.random() * 60; 
      blinkTimeout1 = setTimeout(() => {
        if (leftPupilRef.current) leftPupilRef.current.style.transform = 'scaleY(1)';
        if (rightPupilRef.current) rightPupilRef.current.style.transform = 'scaleY(1)';
        
        const nextBlink = 3000 + Math.random() * 4000; 
        blinkTimeout2 = setTimeout(blink, nextBlink);
      }, blinkDuration);
    };

    const initialBlinkTimer = setTimeout(blink, 3000 + Math.random() * 4000);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      clearTimeout(initialBlinkTimer);
      clearTimeout(blinkTimeout1);
      clearTimeout(blinkTimeout2);
    };
  }, []);

  return (
    <div 
      ref={containerRef}
      className="hidden lg:block absolute -bottom-[50px] right-[-80px] w-[690px] h-[460px] pointer-events-none z-20 opacity-95"
      style={{ clipPath: 'inset(-100% -100% 50px -100%)' }}
    >
      <div className="relative w-full h-full">
        
        <img 
          src={studentImg} 
          alt="Student Character" 
          className="w-full h-full object-contain object-bottom drop-shadow-xl"
        />

        {/* LEFT PUPIL */}
        <div 
          ref={leftAnchorRef}
          className="absolute pointer-events-none" 
          style={{ top: '23.85%', left: '54.23%', width: '0px', height: '0px' }}
        >
          <div 
            ref={leftPupilWrapperRef} 
            className="absolute" 
            style={{ transform: 'translate(-50%, -50%)' }}
          >
            <div 
              ref={leftPupilRef}
              className="w-[3px] h-[3px] bg-[#0f172a] rounded-full transition-transform duration-150 ease-in-out origin-center"
            />
          </div>
        </div>

        {/* RIGHT PUPIL */}
        <div 
          ref={rightAnchorRef}
          className="absolute pointer-events-none" 
          style={{ top: '24.78%', left: '59.35%', width: '0px', height: '0px' }}
        >
          <div 
            ref={rightPupilWrapperRef} 
            className="absolute" 
            style={{ transform: 'translate(-50%, -50%)' }}
          >
            <div 
              ref={rightPupilRef}
              className="w-[3px] h-[3px] bg-[#0f172a] rounded-full transition-transform duration-150 ease-in-out origin-center"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
