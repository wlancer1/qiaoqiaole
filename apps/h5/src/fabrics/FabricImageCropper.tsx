import { useEffect, useRef, useState } from 'react';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import {
 clampFabricCrop,
 cropFabricPhoto,
 fabricCropPixels,
 fitFabricCropAspect,
 resizeFabricCropRect,
 type FabricCropRect,
} from './fabricPhoto';

export type FabricCropApplyResult = {
 image: string;
 color: string;
 widthMm?: number | null;
 heightMm?: number | null;
 pixelWidth?: number;
 pixelHeight?: number;
 rect?: FabricCropRect;
};

type AspectMode = 'free' | '1:1' | '4:3' | '3:4';

type Props = {
 image: HTMLImageElement;
 url: string;
 initialRect?: FabricCropRect;
 initialWidthMm?: string;
 initialHeightMm?: string;
 defaultAspect?: AspectMode;
 onApply: (result: FabricCropApplyResult, sampleWidth: string) => void;
 onCancel: () => void;
};

const ASPECT_VALUE: Record<Exclude<AspectMode, 'free'>, number> = {
 '1:1': 1,
 '4:3': 4 / 3,
 '3:4': 3 / 4,
};


function detectCropHandle(p: { x: number; y: number }, r: FabricCropRect): string | null {
 const tol = .065;
 const nearW = Math.abs(p.x - r.x) <= tol;
 const nearE = Math.abs(p.x - (r.x + r.w)) <= tol;
 const nearN = Math.abs(p.y - r.y) <= tol;
 const nearS = Math.abs(p.y - (r.y + r.h)) <= tol;
 const inX = p.x >= r.x - tol && p.x <= r.x + r.w + tol;
 const inY = p.y >= r.y - tol && p.y <= r.y + r.h + tol;
 if (nearN && nearW) return 'nw';
 if (nearN && nearE) return 'ne';
 if (nearS && nearW) return 'sw';
 if (nearS && nearE) return 'se';
 if (nearN && inX) return 'n';
 if (nearS && inX) return 's';
 if (nearW && inY) return 'w';
 if (nearE && inY) return 'e';
 return null;
}

export function FabricImageCropper({
 image,
 url,
 initialRect,
 initialWidthMm,
 initialHeightMm,
 defaultAspect = 'free',
 onApply,
 onCancel,
}: Props) {
 const imgW = Math.max(1, image.naturalWidth || 1);
 const imgH = Math.max(1, image.naturalHeight || 1);
 const hasInitialCustomPair = Boolean(
  initialWidthMm && initialHeightMm && Number(initialWidthMm) > 0 && Number(initialHeightMm) > 0,
 );

 const [aspectMode, setAspectMode] = useState<AspectMode>(defaultAspect);
 const [zoom, setZoom] = useState(1);
 const [pan, setPan] = useState({ x: 0, y: 0 });
 const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
 const pinchStartRef = useRef<{ dist: number; zoom: number } | null>(null);
 const touchPinchRef = useRef<{ dist: number; zoom: number } | null>(null);
 const zoomRef = useRef(zoom);
 zoomRef.current = zoom;
 const stageRef = useRef<HTMLDivElement | null>(null);

 // iOS Safari ignores touch-action and can take over a two-finger pinch as a
 // page gesture, cancelling the pointer stream. Block the native gesture and,
 // when pointer tracking is not holding both pointers, drive the same zoom
 // state from raw touch events as a fallback.
 useEffect(() => {
  const el = stageRef.current;
  if (!el) return;
  const distOf = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const onGestureStart = (e: Event) => { e.preventDefault(); };
  const onTouchStart = (e: TouchEvent) => {
   if (e.touches.length === 2 && pointersRef.current.size < 2) {
    touchPinchRef.current = { dist: Math.max(1, distOf(e.touches)), zoom: zoomRef.current };
    e.preventDefault();
   }
  };
  const onTouchMove = (e: TouchEvent) => {
   const start = touchPinchRef.current;
   if (!start || e.touches.length !== 2) return;
   e.preventDefault();
   zoomToRef.current(start.zoom * (distOf(e.touches) / start.dist));
  };
  const onTouchEnd = (e: TouchEvent) => { if (e.touches.length < 2) touchPinchRef.current = null; };
  el.addEventListener('gesturestart', onGestureStart as EventListener, { passive: false });
  el.addEventListener('touchstart', onTouchStart, { passive: false });
  el.addEventListener('touchmove', onTouchMove, { passive: false });
  el.addEventListener('touchend', onTouchEnd);
  el.addEventListener('touchcancel', onTouchEnd);
  return () => {
   el.removeEventListener('gesturestart', onGestureStart as EventListener);
   el.removeEventListener('touchstart', onTouchStart);
   el.removeEventListener('touchmove', onTouchMove);
   el.removeEventListener('touchend', onTouchEnd);
   el.removeEventListener('touchcancel', onTouchEnd);
  };
 }, []);
 const [rect, setRect] = useState<FabricCropRect>(() => {
  const base = initialRect ? clampFabricCrop(initialRect, .12) : { x: .06, y: .06, w: .88, h: .88 };
  if (initialRect) return base;
  if (hasInitialCustomPair) {
   return fitFabricCropAspect(base, imgW, imgH, Number(initialWidthMm) / Number(initialHeightMm));
  }
  if (defaultAspect !== 'free') {
   return fitFabricCropAspect(base, imgW, imgH, ASPECT_VALUE[defaultAspect]);
  }
  return base;
 });

 // 固定初始选区与原图像素的厘米比例；后续拖动、缩放只改变覆盖范围。
 const [calibration] = useState(() => {
  const sourceWidth = rect.w * imgW;
  const sourceHeight = rect.h * imgH;
  const widthMm = initialWidthMm && Number(initialWidthMm) > 0
   ? Number(initialWidthMm)
   : initialHeightMm && Number(initialHeightMm) > 0
    ? Number(initialHeightMm) * sourceWidth / sourceHeight
    : 100;
  return { widthMm, mmPerPixel: widthMm / sourceWidth };
 });
 const [error, setError] = useState('');

 // The selection box lives in stage coordinates and never scales; zoom
 // scales only the image beneath it. effOf maps a box rect to the image
 // region it currently covers.
 const effOf = (r: FabricCropRect): FabricCropRect => {
  if (zoom <= 1) return r;
  const imgLeft = (1 - zoom) / 2 + pan.x;
  const imgTop = (1 - zoom) / 2 + pan.y;
  return { x: (r.x - imgLeft) / zoom, y: (r.y - imgTop) / zoom, w: r.w / zoom, h: r.h / zoom };
 };
 const effRect = effOf(rect);
 const pixels = fabricCropPixels(imgW, imgH, effRect);

 const widthMmVal = Number((effRect.w * imgW * calibration.mmPerPixel).toFixed(3));
 const heightMmVal = Number((effRect.h * imgH * calibration.mmPerPixel).toFixed(3));
 const sampleWidth = String(widthMmVal);

 const activeLockAspect: number | null = aspectMode !== 'free' ? ASPECT_VALUE[aspectMode] : null;


 const applyAspectPreset = (nextMode: AspectMode) => {
  setError('');
  setAspectMode(nextMode);
  if (nextMode === 'free') return;
  const targetRatio = ASPECT_VALUE[nextMode];
  const nextRect = fitFabricCropAspect(rect, imgW, imgH, targetRatio);
  setRect(nextRect);
 };

 const selectFullImage = () => {
  setError('');
  setZoom(1);
  setPan({ x: 0, y: 0 });
  setAspectMode('free');
  setRect({ x: 0, y: 0, w: 1, h: 1 });
 };



 const clampPan = (nextPan: { x: number; y: number }, currentZoom: number) => {
  if (currentZoom <= 1) return { x: 0, y: 0 };
  const max = (currentZoom - 1) / 2;
  return {
   x: Math.max(-max, Math.min(max, nextPan.x)),
   y: Math.max(-max, Math.min(max, nextPan.y)),
  };
 };

 // Zoom acts on the image layer only, anchored at the selection box center
 // so the region under the box stays put while it magnifies.
 const zoomTo = (raw: number) => {
  const nextZoom = Math.max(1, Math.min(3.5, Number(raw.toFixed(2))));
  if (nextZoom === 1) {
   setZoom(1);
   setPan({ x: 0, y: 0 });
   return;
  }
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const ux = (cx - ((1 - zoom) / 2 + pan.x)) / zoom;
  const uy = (cy - ((1 - zoom) / 2 + pan.y)) / zoom;
  setPan(clampPan({
   x: cx - ux * nextZoom - (1 - nextZoom) / 2,
   y: cy - uy * nextZoom - (1 - nextZoom) / 2,
  }, nextZoom));
  setZoom(nextZoom);
 };
 const zoomToRef = useRef(zoomTo);
 zoomToRef.current = zoomTo;
 const zoomIn = () => zoomTo(zoom + .25);
 const zoomOut = () => zoomTo(zoom - .25);
 const resetZoom = () => zoomTo(1);
 const cycleZoom = () => zoomTo(zoom < 1.4 ? 1.5 : zoom < 2.4 ? 2.5 : 1);

 const drag = useRef<{
  mode: string;
  x: number;
  y: number;
  clientX: number;
  clientY: number;
  start: FabricCropRect;
  startPan: { x: number; y: number };
 } | null>(null);

 const point = (e: React.PointerEvent<HTMLDivElement>) => {
  const r = e.currentTarget.getBoundingClientRect();
  return {
   x: Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(1, r.width))),
   y: Math.max(0, Math.min(1, (e.clientY - r.top) / Math.max(1, r.height))),
  };
 };

 const applyDelta = (start: FabricCropRect, mode: string, dx: number, dy: number) =>
  resizeFabricCropRect(start, mode, dx, dy, {
   imageWidth: imgW,
   imageHeight: imgH,
   lockPixelAspect: activeLockAspect,
   minSize: .12,
  });


 return (
  <div className="fabric-crop-content">
   <div className="fabric-crop-scroll">
    <p className="fabric-create-hint">拖动四角调整截取范围，尺寸随选区同步变化。初始选区宽度按 {Number((calibration.widthMm / 10).toFixed(2))} cm 计算，可在布料编辑中校准实际尺寸。</p>
    <div
     className="fabric-crop-space"
     onWheel={e => {
      e.preventDefault();
      const step = e.deltaY < 0 ? .15 : -.15;
      setZoom(z => {
       const next = Math.max(1, Math.min(3.5, Number((z + step).toFixed(2))));
       if (next === 1) setPan({ x: 0, y: 0 });
       else setPan(p => clampPan(p, next));
       return next;
      });
     }}
    >
     <div className="fabric-crop-zoom-toolbar" role="toolbar" aria-label="底图缩放控制">
      <button
       type="button"
       disabled={zoom <= 1}
       onClick={zoomOut}
       aria-label="缩小底图"
      >
       <ZoomOut size={14} />
      </button>
      <button
       type="button"
       className="fabric-crop-zoom-pct"
       onClick={cycleZoom}
       aria-label="切换缩放比例"
      >
       {Math.round(zoom * 100)}%
      </button>
      <button
       type="button"
       disabled={zoom >= 3.5}
       onClick={zoomIn}
       aria-label="放大底图"
      >
       <ZoomIn size={14} />
      </button>
      {(zoom > 1 || pan.x !== 0 || pan.y !== 0) && (
       <button
        type="button"
        onClick={resetZoom}
        aria-label="还原底图大小"
       >
        <RotateCcw size={13} />
       </button>
      )}
     </div>

     <div
      ref={stageRef}
      className="fabric-crop-stage"
      style={{
       aspectRatio: `${imgW}/${imgH}`,
       width: `min(100%, calc(42dvh * ${imgW / imgH}))`,
      }}
     >
      <div
       className="fabric-crop-canvas"
      onPointerDown={e => {
       pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
       if (pointersRef.current.size === 2) {
        const pts = Array.from(pointersRef.current.values());
        pinchStartRef.current = {
         dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
         zoom,
        };
        drag.current = null;
        return;
       }

       const p = point(e);
       const target = e.target as HTMLElement;
       const explicitHandle = target.dataset?.handle;
       const nearHandle = explicitHandle || detectCropHandle(p, rect);
       let startRect = rect;
       let mode = nearHandle || (target.closest?.('.fabric-crop-selection') ? 'move' : (zoom > 1 ? 'pan' : 'move'));
       if (mode === 'move' && !nearHandle && !target.closest?.('.fabric-crop-selection')) {
        const inside = p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h;
        if (!inside) {
         startRect = clampFabricCrop({ ...rect, x: p.x - rect.w / 2, y: p.y - rect.h / 2 }, .12);
         setRect(startRect);
        }
       }
       drag.current = {
        mode,
        ...p,
        clientX: e.clientX,
        clientY: e.clientY,
        start: startRect,
        startPan: { ...pan },
       };
       e.currentTarget.setPointerCapture?.(e.pointerId);
       e.preventDefault();
      }}
      onPointerMove={e => {
       pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
       if (pointersRef.current.size === 2 && pinchStartRef.current) {
        const pts = Array.from(pointersRef.current.values());
        const currDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const ratio = currDist / Math.max(1, pinchStartRef.current.dist);
        zoomToRef.current(pinchStartRef.current.zoom * ratio);
        return;
       }

       const d = drag.current;
       if (!d) return;

       const p = point(e);
       if (d.mode === 'pan') {
        setPan(clampPan({ x: d.startPan.x + (p.x - d.x), y: d.startPan.y + (p.y - d.y) }, zoom));
        return;
       }

       const nextRect = applyDelta(d.start, d.mode, p.x - d.x, p.y - d.y);
       setRect(nextRect);
      }}
      onPointerUp={e => {
       pointersRef.current.delete(e.pointerId);
       if (pointersRef.current.size < 2) pinchStartRef.current = null;
       drag.current = null;
      }}
      onPointerCancel={e => {
       pointersRef.current.delete(e.pointerId);
       if (pointersRef.current.size < 2) pinchStartRef.current = null;
       drag.current = null;
      }}
      >
      <img
       src={url}
       alt="待截取的布料图片"
       draggable={false}
       style={{
        width: `${zoom * 100}%`,
        height: `${zoom * 100}%`,
        left: `${((1 - zoom) / 2 + pan.x) * 100}%`,
        top: `${((1 - zoom) / 2 + pan.y) * 100}%`,
       }}
      />
      <div
       className="fabric-crop-selection"
       style={{
        left: rect.x * 100 + '%',
        top: rect.y * 100 + '%',
        width: rect.w * 100 + '%',
        height: rect.h * 100 + '%',
       }}
      >
       <span className="fabric-crop-live-badge">
        {`${Number((widthMmVal / 10).toFixed(2))} × ${Number((heightMmVal / 10).toFixed(2))} cm`}
       </span>
       {(['nw', 'ne', 'sw', 'se'] as const).map((handle, i) => (
        <button
         key={handle}
         type="button"
         data-handle={handle}
         className={'fabric-crop-handle ' + handle}
         aria-label={'调整' + ['左上', '右上', '左下', '右下'][i] + '角裁剪'}
         onKeyDown={e => {
          const delta: Record<string, [number, number]> = {
           ArrowLeft: [-.01, 0],
           ArrowRight: [.01, 0],
           ArrowUp: [0, -.01],
           ArrowDown: [0, .01],
          };
          if (delta[e.key]) {
           e.preventDefault();
           setRect(r => applyDelta(r, handle, ...delta[e.key]));
          }
         }}
        />
       ))}
      </div>
      </div>
     </div>
    </div>

    <div className="fabric-crop-actions">
     <span>选区 {pixels.width} × {pixels.height} px</span>
     <div className="fabric-crop-ratios" role="group" aria-label="选区比例预设">
      <button
       type="button"
       className={aspectMode === '1:1' ? 'active' : ''}
       onClick={() => applyAspectPreset('1:1')}
      >
       1:1 正方形
      </button>
      <button
       type="button"
       className={aspectMode === '4:3' ? 'active' : ''}
       onClick={() => applyAspectPreset('4:3')}
      >
       4:3
      </button>
      <button
       type="button"
       className={aspectMode === '3:4' ? 'active' : ''}
       onClick={() => applyAspectPreset('3:4')}
      >
       3:4
      </button>
      <button
       type="button"
       className={aspectMode === 'free' && !(rect.x === 0 && rect.y === 0 && rect.w === 1 && rect.h === 1) ? 'active' : ''}
       onClick={() => applyAspectPreset('free')}
      >
       自由
      </button>
      <button
       type="button"
       className={rect.x === 0 && rect.y === 0 && rect.w === 1 && rect.h === 1 ? 'active' : ''}
       onClick={selectFullImage}
      >
       选择全图
      </button>
     </div>
    </div>

   </div>
   {error && <p role="alert" className="fabric-create-error">{error}</p>}
   <footer className="fabric-create-footer">
    <button type="button" onClick={onCancel}>取消截取</button>
    <button
     type="button"
     className="primary"
     onClick={() => {
      try {
       const cropped = cropFabricPhoto(image, effRect);
       onApply(
        {
         ...cropped,
         widthMm: widthMmVal,
         heightMm: heightMmVal,
         pixelWidth: pixels.width,
         pixelHeight: pixels.height,
         rect: effRect,
        },
        sampleWidth,
       );
      } catch (e) {
       setError(e instanceof Error ? e.message : '图片截取失败');
      }
     }}
    >
     确认截取
    </button>
   </footer>
  </div>
 );
}
