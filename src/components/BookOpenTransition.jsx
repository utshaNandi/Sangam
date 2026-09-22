import { useState, useEffect, useRef } from 'react';

function SegmentedPage({ index, totalPages, delay, durationMs, tint, isOpening, width, height }) {
  const SEGMENTS = 6;
  const segW = width / SEGMENTS;
  
  const startZ = -index * 0.4;
  const endZ = (totalPages - 1 - index) * 0.4; 

  const renderSeg = (segIndex) => {
    const isRoot = segIndex === 0;
    const isLast = segIndex === SEGMENTS - 1;
    
    return (
      <div 
        className={isRoot ? `page-root-${index}` : `page-seg-${index}`}
        style={{
          position: 'absolute',
          left: isRoot ? 0 : segW - 0.5,
          top: 0,
          width: segW + 0.5,
          height: '100%',
          transformOrigin: 'left center',
          transformStyle: 'preserve-3d',
          transform: isRoot ? `rotateY(0deg) translateZ(${startZ}px)` : 'rotateY(0deg)',
        }}
      >
        {/* Front Face */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundColor: tint,
          backfaceVisibility: 'hidden',
          transform: 'translateZ(0.1px)',
        }}>
          {isRoot && (
            <div className="shadow-fade" style={{
              position: 'absolute', left: 0, top: 0, bottom: 0, width: '100%',
              background: 'linear-gradient(90deg, rgba(0,0,0,0.08), transparent)'
            }} />
          )}
          <div className={`seg-light-front-${index}-${segIndex}`} style={{
            position: 'absolute', inset: 0,
            backgroundColor: '#FFFFFF',
            opacity: 0,
          }} />
        </div>

        {/* Back Face (Pure White) */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundColor: '#FFFFFF',
          backfaceVisibility: 'hidden',
          transform: 'rotateY(180deg) translateZ(0.1px)',
        }}>
          {isRoot && (
            <div className="shadow-fade" style={{
              position: 'absolute', left: 0, top: 0, bottom: 0, width: '100%',
              background: 'linear-gradient(90deg, rgba(0,0,0,0.12), transparent)'
            }} />
          )}
          <div className={`seg-light-back-${index}-${segIndex}`} style={{
            position: 'absolute', inset: 0,
            backgroundColor: '#000000',
            opacity: 0,
          }} />
        </div>

        {isLast && (
          <div className="shadow-fade" style={{
            position: 'absolute', right: 0, top: 0, bottom: 0, width: '1px',
            backgroundColor: '#d0c8ba', 
            transformOrigin: 'right center',
            transform: 'translateZ(0.2px) rotateY(90deg)',
          }} />
        )}

        {!isLast && renderSeg(segIndex + 1)}
      </div>
    );
  };

  return (
    <div style={{
      position: 'absolute', left: 0, top: 1, width: width, height: height - 2,
      transformStyle: 'preserve-3d', zIndex: 10 - index,
      opacity: isOpening ? 1 : 0,
    }}>
      {renderSeg(0)}
      <style>{`
        @keyframes pageRootFlip${index} {
          0% { transform: rotateY(0deg) translateZ(${startZ}px); animation-timing-function: cubic-bezier(0.3, 0, 0.2, 1); }
          45% { transform: rotateY(-120deg) translateZ(20px); animation-timing-function: cubic-bezier(0.2, 0, 0.1, 1); }
          100% { transform: rotateY(-180deg) translateZ(${endZ}px); }
        }
        @keyframes pageSegBend${index} {
          0% { transform: rotateY(0deg); animation-timing-function: cubic-bezier(0.3, 0, 0.2, 1); }
          45% { transform: rotateY(16deg); animation-timing-function: cubic-bezier(0.2, 0, 0.1, 1); }
          85% { transform: rotateY(-1deg); animation-timing-function: ease-in-out; }
          100% { transform: rotateY(0deg); }
        }
        
        @keyframes rollLightFront${index} {
          0% { opacity: 0; }
          20% { opacity: 0.3; }
          50% { opacity: 0; }
          100% { opacity: 0; }
        }
        @keyframes rollLightBack${index} {
          0% { opacity: 0; }
          40% { opacity: 0.15; }
          100% { opacity: 0; }
        }

        .page-root-${index} {
          animation: ${isOpening ? `pageRootFlip${index} ${durationMs}ms forwards ${delay}ms` : 'none'};
        }
        .page-seg-${index} {
          animation: ${isOpening ? `pageSegBend${index} ${durationMs}ms forwards ${delay}ms` : 'none'};
        }
      `}</style>
      
      {[...Array(SEGMENTS)].map((_, i) => (
        <style key={i}>{`
          .seg-light-front-${index}-${i} {
            animation: ${isOpening ? `rollLightFront${index} ${durationMs}ms forwards ${delay + i * 25}ms` : 'none'};
          }
          .seg-light-back-${index}-${i} {
            animation: ${isOpening ? `rollLightBack${index} ${durationMs}ms forwards ${delay + (SEGMENTS - 1 - i) * 25}ms` : 'none'};
          }
        `}</style>
      ))}
    </div>
  );
}

export default function BookOpenTransition({ bookColor, startRect, bookNode }) {
  const [isOpening, setIsOpening] = useState(false);
  const frontCoverContainerRef = useRef(null);

  useEffect(() => {
    if (frontCoverContainerRef.current && bookNode) {
      const bookAssembly = bookNode.querySelector('.w-full.h-full.relative');
      if (bookAssembly) {
        const clone = bookAssembly.cloneNode(true);
        
        clone.style.position = 'absolute';
        clone.style.left = '0';
        clone.style.top = '0';
        clone.style.width = '100%';
        clone.style.height = '100%';
        clone.style.transform = 'none';
        clone.style.transition = 'none';
        clone.style.boxShadow = 'none';
        clone.style.pointerEvents = 'none';
        
        clone.querySelectorAll('*').forEach(el => {
          el.style.transition = 'none';
        });

        const origInputs = bookAssembly.querySelectorAll('input');
        const cloneInputs = clone.querySelectorAll('input');
        origInputs.forEach((input, i) => {
          if (cloneInputs[i]) cloneInputs[i].value = input.value;
        });

        frontCoverContainerRef.current.innerHTML = '';
        frontCoverContainerRef.current.appendChild(clone);
      }

      bookNode.style.visibility = 'hidden';
      
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsOpening(true);
        });
      });
    }

    return () => {
      if (bookNode) bookNode.style.visibility = 'visible';
    };
  }, [bookNode]);

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const BOOK_W = startRect.width;
  const BOOK_H = startRect.height;
  
  const ox = 0; 
  const oy = BOOK_H / 2;

  const idleLeft = startRect.left;
  const idleTop  = startRect.top;
  
  const centLeft = vw / 2;
  const centTop  = (vh / 2) - (BOOK_H / 2);

  const initScale = 1;
  const restingScale = (0.80 * vw) / (2 * BOOK_W);
  const fillScale = Math.max((vw / 2) / BOOK_W, vh / BOOK_H) * 1.2;

  const duration = 1200; 

  // Enforced strictly to 3 pages per request
  const flipPages = 3; 
  const coverDur = 450;
  const pageDur = 400; 

  const edgeColor = 'rgba(0,0,0,0.35)';
  const COVER_THICKNESS = 8;
  
  return (
    <div
      className="fixed inset-0 z-[200] pointer-events-none"
      style={{
        perspective: isOpening ? '1500px' : '3000px',
        perspectiveOrigin: '50% 50%',
        transition: `perspective ${duration}ms cubic-bezier(0.4, 0, 0.2, 1)`,
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundColor: '#FFFFFF', 
          opacity: isOpening ? 1 : 0,
          transition: `opacity ${duration}ms cubic-bezier(0.4, 0, 0.2, 1)`,
        }}
      />

      <style>{`
        @keyframes masterZoom {
          0% {
            transform: scale(0.98) rotateY(-25deg) rotateX(5deg) translateX(12px) translateZ(0);
            left: ${idleLeft}px; top: ${idleTop}px;
            animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
          }
          60% { 
            transform: scale(${restingScale}) rotateY(0deg) rotateX(0deg) translateX(0px) translateZ(50px);
            left: ${centLeft}px; top: ${centTop}px;
            animation-timing-function: cubic-bezier(0.8, 0, 0.2, 1);
          }
          100% {
            transform: scale(${fillScale}) rotateY(0deg) rotateX(0deg) translateX(0px) translateZ(250px);
            left: ${centLeft}px; top: ${centTop}px;
          }
        }
        
        .master-container {
          animation: ${isOpening ? `masterZoom ${duration}ms forwards` : 'none'};
        }

        @keyframes shadowFade {
          0% { opacity: 1; }
          60% { opacity: 1; } 
          80% { opacity: 0; } 
          100% { opacity: 0; } 
        }

        .shadow-fade {
          animation: ${isOpening ? `shadowFade ${duration}ms forwards` : 'none'};
        }
      `}</style>

      {/* MASTER BOOK CONTAINER */}
      <div
        className="master-container"
        style={{
          position: 'fixed',
          left: idleLeft,
          top: idleTop,
          transform: `scale(0.98) rotateY(-25deg) rotateX(5deg) translateX(12px) translateZ(0)`,
          width: BOOK_W,
          height: BOOK_H,
          transformStyle: 'preserve-3d',
          transformOrigin: `${ox}px ${oy}px`,
        }}
      >
        <div style={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d' }}>
          
          {/* ==========================================
              RIGID THICK BACK COVER (Bottom of the stack)
          ========================================== */}
          <div
            style={{
              position: 'absolute', inset: 0,
              backgroundColor: bookColor,
              borderRadius: '0 4px 4px 0',
              transform: `translateZ(-${COVER_THICKNESS / 2}px)`,
              boxShadow: '15px 20px 40px rgba(0,0,0,0.4)',
              transformStyle: 'preserve-3d',
            }}
          >
            {/* Physical walls */}
            <div className="shadow-fade" style={{
              position: 'absolute', right: 0, top: 0, bottom: 0, width: COVER_THICKNESS,
              backgroundColor: edgeColor,
              transformOrigin: 'right center',
              transform: 'rotateY(90deg) translateZ(0.5px)',
            }} />
            <div className="shadow-fade" style={{
              position: 'absolute', left: 0, right: 0, top: 0, height: COVER_THICKNESS,
              backgroundColor: edgeColor,
              transformOrigin: 'top center',
              transform: 'rotateX(90deg) translateZ(0.5px)',
            }} />
            <div className="shadow-fade" style={{
              position: 'absolute', left: 0, right: 0, bottom: 0, height: COVER_THICKNESS,
              backgroundColor: edgeColor,
              transformOrigin: 'bottom center',
              transform: 'rotateX(-90deg) translateZ(-0.5px)',
            }} />
          </div>

          {/* ==========================================
              FINAL RESTING WHITE PAGE (Right Side)
          ========================================== */}
          <div
            style={{
              position: 'absolute',
              left: -0.5, top: 1, 
              width: 'calc(100% + 0.5px)', height: 'calc(100% - 2px)',
              backgroundColor: '#FFFFFF', 
              borderRadius: '0 3px 3px 0',
              transformStyle: 'preserve-3d',
              transform: `translateZ(0px)`, 
              zIndex: 2, 
            }}
          >
            {/* Inner crease shadow */}
            <div className="shadow-fade" style={{
              position: 'absolute', left: 0, top: 0, bottom: 0, width: '35px',
              background: 'linear-gradient(90deg, rgba(0,0,0,0.12), transparent)',
            }} />
          </div>

          {/* ==========================================
              EXACTLY 3 TRUE BENDING PAGES
          ========================================== */}
          {[...Array(flipPages)].map((_, i) => (
            <SegmentedPage 
              key={i} 
              index={i} 
              totalPages={flipPages}
              delay={100 + i * 80} 
              durationMs={pageDur} 
              tint={i % 2 === 0 ? '#F8F5EF' : '#F4EEE2'}
              isOpening={isOpening}
              width={BOOK_W}
              height={BOOK_H}
            />
          ))}

          {/* ==========================================
              RIGID THICK FRONT HARDCOVER (Swings Left)
          ========================================== */}
          <div
            style={{
              position: 'absolute', left: 0, top: 0,
              width: '100%', height: '100%',
              transformOrigin: 'left center',
              transformStyle: 'preserve-3d',
              zIndex: 20, 
              transform: `rotateY(0deg) translateZ(-${COVER_THICKNESS / 2}px)`,
              animation: isOpening ? `rigidCoverFlip ${coverDur}ms forwards` : 'none',
            }}
          >
            {/* Front UI Face */}
            <div style={{
              position: 'absolute', inset: 0,
              backgroundColor: bookColor,
              borderRadius: '0 4px 4px 0',
              transform: `translateZ(${COVER_THICKNESS / 2}px)`,
            }}>
              {/* Cloned Original UI */}
              <div ref={frontCoverContainerRef} className="absolute inset-0 w-full h-full" />
              
              <div style={{
                position: 'absolute', inset: 0,
                backgroundColor: '#FFFFFF',
                borderRadius: '0 4px 4px 0',
                opacity: 0, 
                pointerEvents: 'none',
                animation: isOpening ? `coverWhiteFade ${coverDur}ms ease-in forwards` : 'none',
              }} />
            </div>

            {/* Back Face (Inner Hardcover) -> Pure White */}
            <div style={{
              position: 'absolute', inset: 0,
              backgroundColor: '#FFFFFF', 
              borderRadius: '4px 0 0 4px',
              transform: `rotateY(180deg) translateZ(${COVER_THICKNESS / 2}px)`,
            }}>
              <div className="shadow-fade" style={{
                position: 'absolute', left: 0, top: 0, bottom: 0, width: '35px',
                background: 'linear-gradient(90deg, rgba(0,0,0,0.12), transparent)'
              }} />
            </div>

            {/* Front Cover Physical Walls */}
            <div className="shadow-fade" style={{
              position: 'absolute', right: 0, top: 0, bottom: 0, width: COVER_THICKNESS,
              backgroundColor: edgeColor,
              transformOrigin: 'right center',
              transform: `rotateY(90deg) translateZ(${COVER_THICKNESS / 2}px)`,
            }} />
            <div className="shadow-fade" style={{
              position: 'absolute', left: 0, right: 0, top: 0, height: COVER_THICKNESS,
              backgroundColor: edgeColor,
              transformOrigin: 'top center',
              transform: `rotateX(90deg) translateZ(${COVER_THICKNESS / 2}px)`,
            }} />
            <div className="shadow-fade" style={{
              position: 'absolute', left: 0, right: 0, bottom: 0, height: COVER_THICKNESS,
              backgroundColor: edgeColor,
              transformOrigin: 'bottom center',
              transform: `rotateX(-90deg) translateZ(-${COVER_THICKNESS / 2}px)`,
            }} />
            
            <style>{`
              @keyframes rigidCoverFlip {
                0% { transform: rotateY(0deg) translateZ(-${COVER_THICKNESS / 2}px); animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1); }
                100% { transform: rotateY(-180deg) translateZ(-1px); }
              }
              @keyframes coverWhiteFade {
                0% { opacity: 0; }
                40% { opacity: 1; }
                100% { opacity: 1; }
              }
            `}</style>
          </div>

        </div>
      </div>
    </div>
  );
}
