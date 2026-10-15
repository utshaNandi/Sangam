import React, { useRef, useEffect } from 'react';

/**
 * InteractiveDotCanvas - Quiet, borderless, map-like dot matrix with
 * subtle cursor-reactive magnetic attraction.
 */
export default function InteractiveDotCanvas({ className = '', children }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const animFrameIdRef = useRef(null);
  const dotsRef = useRef([]);
  const mouseRef = useRef({ x: -9999, y: -9999, isActive: false });
  const isRunningRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const SPACING = 24; // Balanced, airy grid spacing matching FlowCanvas
    const RADIUS_INFLUENCE = 120; // 90–140 CSS pixels attraction radius
    const MAX_DISPLACEMENT = 6.5; // 4–8 CSS pixels subtle gathering
    const BASE_DOT_RADIUS = 1.15;
    const BASE_ALPHA = 0.20;

    let width = 0;
    let height = 0;
    let dpr = 1;

    // Check for reduced motion preference
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Initialize or recalculate dot matrix
    const initGrid = () => {
      const rect = container.getBoundingClientRect();
      width = Math.floor(rect.width);
      height = Math.floor(rect.height);

      if (width <= 0 || height <= 0) return;

      dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const cols = Math.floor(width / SPACING);
      const rows = Math.floor(height / SPACING);
      const offsetX = (width - cols * SPACING) / 2 + SPACING / 2;
      const offsetY = (height - rows * SPACING) / 2 + SPACING / 2;

      const newDots = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const originX = offsetX + c * SPACING;
          const originY = offsetY + r * SPACING;
          newDots.push({
            originX,
            originY,
            dx: 0,
            dy: 0,
            alpha: BASE_ALPHA
          });
        }
      }
      dotsRef.current = newDots;
      drawStatic();
    };

    // Static render when idle or reduced motion
    const drawStatic = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#171717';
      const dots = dotsRef.current;
      for (let i = 0; i < dots.length; i++) {
        const dot = dots[i];
        ctx.globalAlpha = BASE_ALPHA;
        ctx.beginPath();
        ctx.arc(dot.originX, dot.originY, BASE_DOT_RADIUS, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1.0;
    };

    // Animation loop with smooth spring interpolation & idle settling
    const animate = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#171717';

      const dots = dotsRef.current;
      const { x: mx, y: my, isActive } = mouseRef.current;
      let hasMovement = false;

      for (let i = 0; i < dots.length; i++) {
        const dot = dots[i];
        let targetDx = 0;
        let targetDy = 0;
        let targetAlpha = BASE_ALPHA;

        if (isActive && !prefersReducedMotion) {
          const distX = mx - dot.originX;
          const distY = my - dot.originY;
          const dist = Math.hypot(distX, distY);

          if (dist < RADIUS_INFLUENCE && dist > 0.001) {
            // Smooth hermite curve for calm, non-abrupt attraction
            const norm = 1 - dist / RADIUS_INFLUENCE;
            const factor = norm * norm * (3 - 2 * norm);
            const displacement = MAX_DISPLACEMENT * factor;
            const angle = Math.atan2(distY, distX);

            targetDx = Math.cos(angle) * displacement;
            targetDy = Math.sin(angle) * displacement;
            targetAlpha = BASE_ALPHA + 0.22 * factor; // Subtle clarity near cursor
          }
        }

        // Smooth easing towards target
        dot.dx += (targetDx - dot.dx) * 0.12;
        dot.dy += (targetDy - dot.dy) * 0.12;
        dot.alpha += (targetAlpha - dot.alpha) * 0.12;

        if (Math.abs(dot.dx - targetDx) > 0.015 || Math.abs(dot.dy - targetDy) > 0.015) {
          hasMovement = true;
        }

        const renderX = dot.originX + dot.dx;
        const renderY = dot.originY + dot.dy;
        const radius = BASE_DOT_RADIUS + (dot.alpha - BASE_ALPHA) * 0.6;

        ctx.globalAlpha = dot.alpha;
        ctx.beginPath();
        ctx.arc(renderX, renderY, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1.0;

      // Keep running while cursor is active or while dots are smoothly settling
      if (isActive || hasMovement) {
        animFrameIdRef.current = requestAnimationFrame(animate);
      } else {
        isRunningRef.current = false;
      }
    };

    const startAnimation = () => {
      if (!isRunningRef.current) {
        isRunningRef.current = true;
        animFrameIdRef.current = requestAnimationFrame(animate);
      }
    };

    const handleMouseMove = (e) => {
      const rect = container.getBoundingClientRect();
      mouseRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        isActive: true
      };
      startAnimation();
    };

    const handleMouseEnter = (e) => {
      const rect = container.getBoundingClientRect();
      mouseRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        isActive: true
      };
      startAnimation();
    };

    const handleMouseLeave = () => {
      mouseRef.current = {
        x: -9999,
        y: -9999,
        isActive: false
      };
      // Keep animation running until dots settle to their origin
      startAnimation();
    };

    // Resize observer to handle dynamic viewport changes seamlessly
    const resizeObserver = new ResizeObserver(() => {
      initGrid();
    });
    resizeObserver.observe(container);

    container.addEventListener('mousemove', handleMouseMove, { passive: true });
    container.addEventListener('mouseenter', handleMouseEnter, { passive: true });
    container.addEventListener('mouseleave', handleMouseLeave, { passive: true });

    initGrid();

    return () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
      resizeObserver.disconnect();
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseenter', handleMouseEnter);
      container.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`w-full relative pointer-events-auto overflow-hidden ${className}`}
      style={{
        background: 'transparent',
      }}
    >
      <canvas
        ref={canvasRef}
        className="block absolute inset-0 w-full h-full pointer-events-none"
        style={{
          background: 'transparent'
        }}
        aria-hidden="true"
      />
      {children && (
        <div className="relative z-10 w-full h-full pointer-events-auto">
          {children}
        </div>
      )}
    </div>
  );
}
