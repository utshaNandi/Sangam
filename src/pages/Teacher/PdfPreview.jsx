import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Initialize PDF.js worker using Vite's resolved asset URL once
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

// ---------------------------------------------------------------------------
// High-Performance In-Memory Caches:
// 1. docPromiseCache: Reuses parsed PDFDocumentProxy across modal opens/closes
// 2. page1SnapshotCache: Caches first-page rendered image for instant (0ms) display
// ---------------------------------------------------------------------------
const docPromiseCache = new Map();
const page1SnapshotCache = new Map();
const MAX_CACHE_ENTRIES = 20;

function trimCache(map) {
  if (map.size > MAX_CACHE_ENTRIES) {
    const oldestKey = map.keys().next().value;
    map.delete(oldestKey);
  }
}

/**
 * Retrieves or creates a cached PDF document loading promise.
 * Avoids repeated network fetches and re-parsing.
 */
export function getCachedPdfDocument(url) {
  if (docPromiseCache.has(url)) {
    return docPromiseCache.get(url);
  }

  let docSource;
  if (typeof url === 'string') {
    docSource = { url };
  } else if (
    url instanceof ArrayBuffer ||
    (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(url))
  ) {
    docSource = { data: url };
  } else {
    docSource = url;
  }

  const promise = pdfjsLib.getDocument(docSource).promise.catch((err) => {
    // Evict on failure so retry is possible
    docPromiseCache.delete(url);
    throw err;
  });

  docPromiseCache.set(url, promise);
  trimCache(docPromiseCache);
  return promise;
}

/**
 * Background-preloads a PDF and warms its first page into the snapshot cache
 * during idle moments so opening the announcement is instant.
 */
export function preloadPdf(url) {
  if (!url || typeof window === 'undefined') return;

  getCachedPdfDocument(url)
    .then(async (doc) => {
      if (page1SnapshotCache.has(url)) return;

      try {
        const page = await doc.getPage(1);
        const unscaledViewport = page.getViewport({ scale: 1 });
        const targetWidth = 440;
        const targetHeight = 520;
        const fitScale = Math.min(
          targetWidth / unscaledViewport.width,
          targetHeight / unscaledViewport.height
        );
        const pixelRatio = window.devicePixelRatio || 1;
        const renderScale = fitScale * Math.min(pixelRatio, 2);
        const viewport = page.getViewport({ scale: renderScale });

        const offscreen = document.createElement('canvas');
        offscreen.width = Math.floor(viewport.width);
        offscreen.height = Math.floor(viewport.height);
        const ctx = offscreen.getContext('2d', { alpha: false });
        if (ctx) {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, offscreen.width, offscreen.height);
          await page.render({ canvasContext: ctx, viewport, intent: 'display' }).promise;

          const dataUrl = offscreen.toDataURL('image/webp', 0.92);
          page1SnapshotCache.set(url, {
            dataUrl,
            cssWidth: Math.floor(unscaledViewport.width * fitScale),
            cssHeight: Math.floor(unscaledViewport.height * fitScale),
            numPages: doc.numPages || 1,
          });
          trimCache(page1SnapshotCache);
        }
      } catch {
        // Silently ignore preloading errors; on-demand rendering handles them
      }
    })
    .catch(() => {});
}

/**
 * Clean, borderless, scrollbar-free & highly-optimized PDF Preview Component.
 * - Displays cached document/snapshot immediately (0ms delay on reopening).
 * - Reuses parsed PDF documents to eliminate redundant network downloads.
 * - Renders at crisp Retina resolution with proportional container scaling.
 */
export default function PdfPreview({ url, name, onError }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);

  // Check if a warm snapshot already exists in cache for immediate display
  const initialSnapshot = url ? page1SnapshotCache.get(url) : null;

  const [pdfDoc, setPdfDoc] = useState(null);
  const [numPages, setNumPages] = useState(initialSnapshot ? initialSnapshot.numPages : 0);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(!initialSnapshot);
  const [hasError, setHasError] = useState(false);
  const [renderReady, setRenderReady] = useState(!!initialSnapshot);

  const currentRenderTaskRef = useRef(null);
  const containerDimensionsRef = useRef({ width: 0, height: 0 });
  const activeUrlRef = useRef(url);
  activeUrlRef.current = url;

  // 1. Immediately paint cached snapshot on first render (0ms delay)
  useLayoutEffect(() => {
    const cached = url ? page1SnapshotCache.get(url) : null;
    if (cached && canvasRef.current && currentPage === 1) {
      const canvas = canvasRef.current;
      const img = new Image();
      img.onload = () => {
        if (activeUrlRef.current !== url) return;
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.style.width = `${cached.cssWidth}px`;
        canvas.style.height = `${cached.cssHeight}px`;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          setRenderReady(true);
          setIsLoading(false);
        }
      };
      img.src = cached.dataUrl;
    }
  }, [url, currentPage]);

  // 2. Load and cache the PDF document
  useEffect(() => {
    let isCancelled = false;
    activeUrlRef.current = url;

    const cached = page1SnapshotCache.get(url);
    if (!cached) {
      setIsLoading(true);
      setRenderReady(false);
    }
    setHasError(false);
    setCurrentPage(1);

    if (!url) {
      setIsLoading(false);
      setHasError(true);
      onError?.();
      return;
    }

    getCachedPdfDocument(url)
      .then((doc) => {
        if (isCancelled || activeUrlRef.current !== url) return;
        setPdfDoc(doc);
        setNumPages(doc.numPages || 1);
        setIsLoading(false);
      })
      .catch((err) => {
        if (isCancelled || activeUrlRef.current !== url) return;
        console.warn('PDF load error:', err);
        setIsLoading(false);
        setHasError(true);
        onError?.(err);
      });

    return () => {
      isCancelled = true;
      if (currentRenderTaskRef.current) {
        try {
          currentRenderTaskRef.current.cancel();
        } catch {
          // Ignore cancellation
        }
        currentRenderTaskRef.current = null;
      }
    };
  }, [url, onError]);

  // 3. Render the current page onto the canvas scaled proportionally
  const renderPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current || !containerRef.current) return;
    const thisUrl = url;

    try {
      if (currentRenderTaskRef.current) {
        try {
          currentRenderTaskRef.current.cancel();
        } catch {
          // Ignore cancellation
        }
        currentRenderTaskRef.current = null;
      }

      const page = await pdfDoc.getPage(currentPage);
      if (activeUrlRef.current !== thisUrl) return;

      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const containerWidth = container.clientWidth || containerDimensionsRef.current.width || 420;
      const containerHeight = container.clientHeight || containerDimensionsRef.current.height || 480;

      containerDimensionsRef.current = { width: containerWidth, height: containerHeight };

      // Determine proportional scale to fit within container with clean margin
      const unscaledViewport = page.getViewport({ scale: 1 });
      const padding = 16;
      const availableWidth = Math.max(80, containerWidth - padding);
      const availableHeight = Math.max(80, containerHeight - padding);

      const scaleX = availableWidth / unscaledViewport.width;
      const scaleY = availableHeight / unscaledViewport.height;
      const fitScale = Math.min(scaleX, scaleY);

      // High-DPI support
      const pixelRatio = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
      const renderScale = fitScale * Math.min(pixelRatio, 2.5);
      const viewport = page.getViewport({ scale: renderScale });

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);

      const cssWidth = Math.floor(unscaledViewport.width * fitScale);
      const cssHeight = Math.floor(unscaledViewport.height * fitScale);
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;

      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) return;

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const renderContext = {
        canvasContext: ctx,
        viewport,
        intent: 'display',
      };

      const renderTask = page.render(renderContext);
      currentRenderTaskRef.current = renderTask;

      await renderTask.promise;
      currentRenderTaskRef.current = null;

      if (activeUrlRef.current === thisUrl) {
        setRenderReady(true);
        setIsLoading(false);

        // Cache first page snapshot for instant reopen
        if (currentPage === 1) {
          try {
            const dataUrl = canvas.toDataURL('image/webp', 0.92);
            page1SnapshotCache.set(thisUrl, {
              dataUrl,
              cssWidth,
              cssHeight,
              numPages: pdfDoc.numPages || 1,
            });
            trimCache(page1SnapshotCache);
          } catch {
            // Ignore snapshot errors
          }
        }
      }
    } catch (err) {
      if (err?.name === 'RenderingCancelledException') {
        return;
      }
      console.warn('PDF render error:', err);
    }
  }, [pdfDoc, currentPage, url]);

  useEffect(() => {
    if (pdfDoc) {
      renderPage();
    }
  }, [pdfDoc, currentPage, renderPage]);

  // 4. Re-render on container resize (debounced to avoid jitter)
  useEffect(() => {
    if (!containerRef.current) return;

    let resizeTimer = null;
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (
          Math.abs(width - containerDimensionsRef.current.width) > 6 ||
          Math.abs(height - containerDimensionsRef.current.height) > 6
        ) {
          if (resizeTimer) clearTimeout(resizeTimer);
          resizeTimer = setTimeout(() => {
            renderPage();
          }, 80);
        }
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      if (resizeTimer) clearTimeout(resizeTimer);
    };
  }, [renderPage]);

  // 5. Keyboard Arrow Navigation
  useEffect(() => {
    if (numPages <= 1) return;
    const handleKey = (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCurrentPage((prev) => Math.max(1, prev - 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setCurrentPage((prev) => Math.min(numPages, prev + 1));
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [numPages]);

  const handlePrevPage = (e) => {
    e?.stopPropagation?.();
    setCurrentPage((prev) => Math.max(1, prev - 1));
  };

  const handleNextPage = (e) => {
    e?.stopPropagation?.();
    setCurrentPage((prev) => Math.min(numPages, prev + 1));
  };

  if (hasError) {
    return (
      <div className="flex flex-col items-center justify-center text-center px-6 py-8 max-w-[320px]">
        <div className="w-12 h-12 rounded-2xl bg-black/[0.05] flex items-center justify-center text-[#3D3C39] mb-3.5">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        </div>
        <div className="text-[14px] font-medium text-[#1E1E1C] break-all line-clamp-2 mb-1">
          {name || 'PDF Document'}
        </div>
        <div className="text-[12px] text-[#7A7873] mb-4">Preview unavailable</div>
        {url && (
          <a
            href={url}
            download={name || 'document.pdf'}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 h-[35px] px-5 rounded-full bg-black/[0.06] hover:bg-black/[0.1] text-[12.5px] font-medium text-[#222220] transition-colors"
          >
            <span>Download PDF</span>
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 w-full flex flex-col items-center justify-center overflow-hidden select-none relative">
      {/* Container holding the dynamically scaled Canvas */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 w-full flex items-center justify-center overflow-hidden p-1 relative"
      >
        {isLoading && !renderReady && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-6 h-6 rounded-full border-2 border-black/15 border-t-black/60 animate-spin" />
          </div>
        )}

        <canvas
          ref={canvasRef}
          className={`rounded-[10px] shadow-[0_4px_20px_rgba(0,0,0,0.08)] border border-black/[0.06] bg-white transition-opacity duration-150 ${
            renderReady ? 'opacity-100' : 'opacity-0'
          }`}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            display: renderReady ? 'block' : 'none',
          }}
        />
      </div>

      {/* Multi-page Navigation Bar */}
      {numPages > 1 && (
        <div className="flex items-center justify-center gap-4 pt-2.5 pb-0.5 shrink-0 select-none text-[12px] text-[#7A7873] font-medium">
          <button
            type="button"
            onClick={handlePrevPage}
            disabled={currentPage <= 1}
            aria-label="Previous page"
            title="Previous page"
            className="w-7 h-7 inline-flex items-center justify-center text-[#7A7873] hover:text-[#181816] disabled:opacity-25 disabled:hover:text-[#7A7873] disabled:cursor-not-allowed active:scale-90 transition-all duration-150 focus:outline-none cursor-pointer"
          >
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          <span className="tabular-nums tracking-tight">
            {currentPage} of {numPages}
          </span>

          <button
            type="button"
            onClick={handleNextPage}
            disabled={currentPage >= numPages}
            aria-label="Next page"
            title="Next page"
            className="w-7 h-7 inline-flex items-center justify-center text-[#7A7873] hover:text-[#181816] disabled:opacity-25 disabled:hover:text-[#7A7873] disabled:cursor-not-allowed active:scale-90 transition-all duration-150 focus:outline-none cursor-pointer"
          >
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
