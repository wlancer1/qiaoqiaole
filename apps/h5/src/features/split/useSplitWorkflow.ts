import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { mergeSimilarCells, type Cell } from '@qiaoqiaole/core';
import {
  cellsFromAlignedGridAsync,
  cellsFromImageAsync,
  clampSplitImageScale,
  centeredAlignmentOffset,
  centeredGridControlOrigin,
  createBlankCells,
  fitSplitImageRect,
  getImageCrop,
  gridSizeFromAlignment,
  initialAlignCellSize,
  scaleRectFromCenter,
  touchDistance,
} from '../../canvas/H5CanvasPreview';
import { colorCodeOf, imageDataToUrl, loadImageData, yieldToBrowser } from '../../utils/h5AppUtils';
import { cropSize, getAutoCropBounds, splitCropRegion, type CropBounds } from '../../utils/splitCrop';
import { DEFAULT_SPLIT_LONG_SIDE, gridSizeFromSplitBounds, maxSplitLongSideFromBounds } from '../../utils/splitConfig';
import { cloneImageData, DEFAULT_BACKGROUND_SENSITIVITY, deriveSplitImage } from '../../pages/split/splitImageProcessing';
import { defaultSplitGeometryFromCrop } from '../../pages/split/splitImageState';
import { prepareBackgroundRemoval } from '@qiaoqiaole/core';
import { createSplitAsyncScope } from './splitAsyncScope';
import type { AlignedGrid, GridHandle, GridHandlePosition, SplitMode, SplitPreviewTab, UploadedSplitImage } from '../../shared/h5Types';

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const GRID_CONTROL_CELLS = 3;

function alignCellSizeForQuickGrid(crop: { width: number; height: number }, cols: number, rows: number): number {
  const largestMatchingSize = Math.min(crop.width / Math.max(1, cols), crop.height / Math.max(1, rows));
  const smallestMatchingSize = Math.max(1, crop.width / Math.max(1, cols + 1), crop.height / Math.max(1, rows + 1));
  if (smallestMatchingSize < largestMatchingSize) {
    return largestMatchingSize - Number.EPSILON * Math.max(1, largestMatchingSize);
  }
  return initialAlignCellSize(crop, cols, rows);
}

export function useSplitWorkflow({ screen, setStatus, onImport, onSourceChange }: {
  screen: string;
  setStatus: (message: string) => void;
  onImport: (input: { cells: Cell[]; rows: number; cols: number }) => void;
  onSourceChange: (dataUrl: string) => void;
}) {
  const [uploadedSplitImage, setUploadedSplitImage] = useState<UploadedSplitImage | null>(null);
  const [splitMode, setSplitModeState] = useState<SplitMode>('quick');
  const [splitLongSide, setSplitLongSide] = useState(DEFAULT_SPLIT_LONG_SIDE);
  const [splitRows, setSplitRows] = useState(DEFAULT_SPLIT_LONG_SIDE);
  const [splitCols, setSplitCols] = useState(DEFAULT_SPLIT_LONG_SIDE);
  const [splitMergeThreshold, setSplitMergeThreshold] = useState(0);
  const deferredSplitMergeThreshold = useDeferredValue(splitMergeThreshold);
  const [splitPreviewCells, setSplitPreviewCells] = useState<Cell[]>([]);
  const [splitPreviewLoading, setSplitPreviewLoading] = useState(false);
  const [splitLoadingStage, setSplitLoadingStage] = useState('正在分析图片...');
  const [splitLoadingProgress, setSplitLoadingProgress] = useState(15);
  const [splitCropBounds, setSplitCropBounds] = useState<CropBounds>({ top: 0, right: 1, bottom: 1, left: 0 });
  const [splitPreviewTab, setSplitPreviewTab] = useState<SplitPreviewTab>('settings');
  const [isSplitCropped, setIsSplitCropped] = useState(false);
  const [splitImageScale, setSplitImageScale] = useState(1);
  const [splitImageOffset, setSplitImageOffset] = useState({ x: 0, y: 0 });
  const [alignCellSize, setAlignCellSize] = useState(1);
  const [alignOffsetX, setAlignOffsetX] = useState(0);
  const [alignOffsetY, setAlignOffsetY] = useState(0);
  const [lockedAlignedGrid, setLockedAlignedGrid] = useState<AlignedGrid | null>(null);
  const [gridFrameOrigin, setGridFrameOrigin] = useState<GridHandlePosition>({ x: 40, y: 40 });
  const [isBackgroundProcessing, setIsBackgroundProcessing] = useState(false);
  const scopeRef = useRef(createSplitAsyncScope());
  const screenRef = useRef(screen);
  const imageRef = useRef<UploadedSplitImage | null>(null);
  const sensitivityFrameRef = useRef(0);
  const queuedSensitivityRef = useRef(DEFAULT_BACKGROUND_SENSITIVITY);
  const imageOffsetRef = useRef({ x: 0, y: 0 });
  const imagePinchRef = useRef({ active: false, startDistance: 0, startScale: 1 });
  const imagePanRef = useRef({ active: false, pointerId: null as number | null, lastX: 0, lastY: 0 });
  const suppressImageClickRef = useRef(false);
  const gridDragRef = useRef<{ handle: GridHandle | null; lastX: number; lastY: number }>({ handle: null, lastX: 0, lastY: 0 });
  const liveAlignCellSizeRef = useRef(1);
  const liveAlignOffsetRef = useRef({ x: 0, y: 0 });
  const liveGridFrameOriginRef = useRef<GridHandlePosition>({ x: 40, y: 40 });
  const alignFrameRef = useRef(0);

  // Keep the route identity live even in the render→effect gap where an
  // animation frame may otherwise commit work for the page that just left.
  screenRef.current = screen;

  useEffect(() => { imageRef.current = uploadedSplitImage; }, [uploadedSplitImage]);
  useEffect(() => { imageOffsetRef.current = splitImageOffset; }, [splitImageOffset]);
  useEffect(() => { liveAlignCellSizeRef.current = alignCellSize; }, [alignCellSize]);
  useEffect(() => { liveAlignOffsetRef.current = { x: alignOffsetX, y: alignOffsetY }; }, [alignOffsetX, alignOffsetY]);
  useEffect(() => { liveGridFrameOriginRef.current = gridFrameOrigin; }, [gridFrameOrigin]);
  useEffect(() => () => {
    if (sensitivityFrameRef.current) cancelAnimationFrame(sensitivityFrameRef.current);
    if (alignFrameRef.current) cancelAnimationFrame(alignFrameRef.current);
  }, []);
  useEffect(() => {
    if (!['split', 'split-crop', 'split-preview'].includes(screen)) {
      scopeRef.current.leave(screen);
      setIsBackgroundProcessing(false);
    }
  }, [screen]);

  const alignedGrid = useMemo(() => uploadedSplitImage
    ? gridSizeFromAlignment(uploadedSplitImage.crop, alignCellSize, alignOffsetX, alignOffsetY)
    : { rows: splitRows, cols: splitCols, cellSize: 1, offsetX: 0, offsetY: 0, cropWidth: 1, cropHeight: 1 },
  [alignCellSize, alignOffsetX, alignOffsetY, splitCols, splitRows, uploadedSplitImage]);
  const flowAlignedGrid = splitMode === 'align' && lockedAlignedGrid ? lockedAlignedGrid : alignedGrid;
  const activeSplitRows = splitMode === 'align' ? flowAlignedGrid.rows : splitRows;
  const activeSplitCols = splitMode === 'align' ? flowAlignedGrid.cols : splitCols;
  const splitColorList = useMemo(() => {
    const counts = new Map<string, number>();
    splitPreviewCells.forEach((cell) => { if (!cell.transparent) counts.set(cell.color, (counts.get(cell.color) ?? 0) + 1); });
    return [...counts].sort((a, b) => b[1] - a[1]).map(([color, count]) => ({ color, count, code: colorCodeOf(color) }));
  }, [splitPreviewCells]);

  useEffect(() => {
    if (screen !== 'split-preview' || !isSplitCropped || !uploadedSplitImage) return;
    const job = scopeRef.current.begin(uploadedSplitImage.originalImageData, screen);
    let cancelled = false;
    setSplitPreviewCells([]); setSplitPreviewLoading(true); setSplitLoadingStage('正在分析图片...'); setSplitLoadingProgress(15);
    void (async () => {
      try {
        await yieldToBrowser(180);
        if (cancelled || !scopeRef.current.isCurrent(job, uploadedSplitImage.originalImageData, screen)) return;
        const source = splitCropRegion(uploadedSplitImage.crop, splitCropBounds, activeSplitCols, activeSplitRows, splitMode === 'align' ? flowAlignedGrid : undefined);
        const raw = splitMode === 'align'
          ? await cellsFromAlignedGridAsync(uploadedSplitImage.imageData, {
            ...flowAlignedGrid, cols: cropSize(splitCropBounds).cols, rows: cropSize(splitCropBounds).rows,
            offsetX: flowAlignedGrid.offsetX + splitCropBounds.left * flowAlignedGrid.cellSize,
            offsetY: flowAlignedGrid.offsetY + splitCropBounds.top * flowAlignedGrid.cellSize,
          }, uploadedSplitImage.crop)
          : await cellsFromImageAsync(uploadedSplitImage.imageData, cropSize(splitCropBounds).rows, cropSize(splitCropBounds).cols, source, (progress) => {
          if (!cancelled && scopeRef.current.isCurrent(job, uploadedSplitImage.originalImageData, screen)) setSplitLoadingProgress(28 + Math.round(progress * .42));
          });
        if (cancelled || !scopeRef.current.isCurrent(job, uploadedSplitImage.originalImageData, screen)) return;
        setSplitLoadingStage('正在匹配拼豆色号...'); setSplitLoadingProgress(72);
        setSplitPreviewCells(deferredSplitMergeThreshold ? mergeSimilarCells(raw, deferredSplitMergeThreshold) : raw.map((cell) => ({ ...cell, color: cell.color.toLowerCase() })));
        setSplitLoadingProgress(100);
      } catch {
        if (!cancelled && scopeRef.current.isCurrent(job, uploadedSplitImage.originalImageData, screen)) {
          setSplitPreviewCells([]);
          setStatus('画布生成失败，请重新调整后重试。');
        }
      } finally {
        if (!cancelled && scopeRef.current.isCurrent(job, uploadedSplitImage.originalImageData, screen)) setSplitPreviewLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeSplitCols, activeSplitRows, deferredSplitMergeThreshold, flowAlignedGrid, isSplitCropped, screen, splitCropBounds, splitMode, uploadedSplitImage]);

  const loadImage = (name: string, imageData: ImageData) => {
    scopeRef.current.leave('image-replaced');
    const originalImageData = cloneImageData(imageData);
    const backgroundCache = prepareBackgroundRemoval(originalImageData);
    const derived = deriveSplitImage(originalImageData, false, { toUrl: imageDataToUrl, getCrop: getImageCrop }, { backgroundCache });
    const image: UploadedSplitImage = { name, originalImageData, imageData: derived.imageData, crop: derived.crop, url: derived.url, originalUrl: derived.url, backgroundRemoved: false, backgroundSensitivity: DEFAULT_BACKGROUND_SENSITIVITY, backgroundCache };
    imageRef.current = image; setUploadedSplitImage(image); onSourceChange(derived.url);
    const geometry = defaultSplitGeometryFromCrop(image.crop);
    liveAlignCellSizeRef.current = geometry.alignCellSize;
    liveAlignOffsetRef.current = geometry.alignOffset;
    liveGridFrameOriginRef.current = geometry.gridFrameOrigin;
    setSplitModeState('quick'); setSplitLongSide(geometry.longSide); setSplitRows(geometry.rows); setSplitCols(geometry.cols); setSplitMergeThreshold(0); setSplitPreviewCells([]); setIsSplitCropped(false); setSplitPreviewTab('settings'); setLockedAlignedGrid(null); setAlignCellSize(geometry.alignCellSize); setAlignOffsetX(geometry.alignOffset.x); setAlignOffsetY(geometry.alignOffset.y); setGridFrameOrigin(geometry.gridFrameOrigin); setSplitCropBounds({ top: 0, right: geometry.cols, bottom: geometry.rows, left: 0 });
  };
  const upload = async (file: File | undefined) => {
    if (!file) return false;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) { setStatus('请上传 PNG、JPG 或 WebP 图片。'); return false; }
    if (file.size > MAX_FILE_SIZE) { setStatus('图片不能超过 20MB。'); return false; }
    try { loadImage(file.name, await loadImageData(file)); return true; } catch { setStatus('图片读取失败，请换一张图片。'); return false; }
  };
  const openPreview = () => {
    if (!uploadedSplitImage) return;
    const locked = splitMode === 'align' ? gridSizeFromAlignment(uploadedSplitImage.crop, alignCellSize, alignOffsetX, alignOffsetY) : null;
    setLockedAlignedGrid(locked); setIsSplitCropped(false); setSplitPreviewCells([]);
    setSplitImageScale(1); setSplitImageOffset({ x: 0, y: 0 });
    setSplitCropBounds({ top: 0, right: locked?.cols ?? splitCols, bottom: locked?.rows ?? splitRows, left: 0 });
  };
  const confirmCrop = () => { if (!uploadedSplitImage) return; setIsSplitCropped(true); setSplitPreviewLoading(true); };
  const returnToCrop = () => { setIsSplitCropped(false); setSplitPreviewLoading(false); };
  const resetCrop = () => setSplitCropBounds(getAutoCropBounds(splitPreviewCells, activeSplitCols, activeSplitRows));
  const updateLongSide = (value: number) => {
    if (!uploadedSplitImage) return;
    const side = Math.min(maxSplitLongSideFromBounds(uploadedSplitImage.crop.width, uploadedSplitImage.crop.height), Math.max(2, Math.round(value)));
    const size = gridSizeFromSplitBounds(uploadedSplitImage.crop.width, uploadedSplitImage.crop.height, side);
    const cellSize = alignCellSizeForQuickGrid(uploadedSplitImage.crop, size.cols, size.rows);
    const offset = centeredAlignmentOffset(uploadedSplitImage.crop, cellSize);
    const origin = centeredGridControlOrigin(uploadedSplitImage.crop, cellSize, offset);
    liveAlignCellSizeRef.current = cellSize;
    liveAlignOffsetRef.current = offset;
    liveGridFrameOriginRef.current = origin;
    setSplitLongSide(side); setSplitRows(size.rows); setSplitCols(size.cols);
    setAlignCellSize(cellSize); setAlignOffsetX(offset.x); setAlignOffsetY(offset.y); setGridFrameOrigin(origin);
  };
  const setSplitMode = (mode: SplitMode) => {
    const image = imageRef.current;
    if (mode === 'quick' && splitMode === 'align' && image) {
      const grid = gridSizeFromAlignment(image.crop, liveAlignCellSizeRef.current, liveAlignOffsetRef.current.x, liveAlignOffsetRef.current.y);
      setSplitRows(grid.rows); setSplitCols(grid.cols);
      setSplitLongSide(Math.min(maxSplitLongSideFromBounds(image.crop.width, image.crop.height), Math.max(2, Math.max(grid.rows, grid.cols))));
    }
    setSplitModeState(mode);
  };
  const importToCanvas = () => { if (splitPreviewCells.length) onImport({ cells: splitPreviewCells, rows: cropSize(splitCropBounds).rows, cols: cropSize(splitCropBounds).cols }); };
  const clear = () => { scopeRef.current.leave('cleared'); imageRef.current = null; setUploadedSplitImage(null); setSplitPreviewCells([]); setIsSplitCropped(false); onSourceChange(''); };
  const toggleBackground = async () => {
    const image = imageRef.current;
    if (!image || isBackgroundProcessing || !['split', 'split-crop', 'split-preview'].includes(screen)) return;
    setIsBackgroundProcessing(true);
    const job = scopeRef.current.begin(image.originalImageData, screen);
    try {
      await yieldToBrowser();
      const derived = deriveSplitImage(image.originalImageData, !image.backgroundRemoved, { toUrl: imageDataToUrl, getCrop: getImageCrop }, { sensitivity: queuedSensitivityRef.current, backgroundCache: image.backgroundCache });
      if (!scopeRef.current.isCurrent(job, image.originalImageData, screen)) return;
      const next = { ...image, ...derived, crop: image.crop, backgroundRemoved: !image.backgroundRemoved, backgroundSensitivity: queuedSensitivityRef.current };
      imageRef.current = next; setUploadedSplitImage(next); onSourceChange(derived.url); setSplitPreviewCells([]);
    } catch { if (scopeRef.current.isCurrent(job, image.originalImageData, screen)) setStatus('图片去背景失败，请重试。'); }
    finally { if (scopeRef.current.isCurrent(job, image.originalImageData, screen)) setIsBackgroundProcessing(false); }
  };
  const updateBackgroundSensitivity = (value: number) => {
    const image = imageRef.current; const sensitivity = Math.max(0, Math.min(100, Math.round(value)));
    queuedSensitivityRef.current = sensitivity;
    if (!image) return;
    const next = { ...image, backgroundSensitivity: sensitivity }; imageRef.current = next; setUploadedSplitImage(next);
    if (!image.backgroundRemoved || sensitivityFrameRef.current) return;
    const expectedScreen = screen;
    const sourceIdentity = image.originalImageData;
    const job = scopeRef.current.begin(sourceIdentity, expectedScreen);
    sensitivityFrameRef.current = requestAnimationFrame(() => {
      sensitivityFrameRef.current = 0;
      const source = imageRef.current;
      if (!source?.backgroundRemoved
        || source.originalImageData !== sourceIdentity
        || screenRef.current !== expectedScreen
        || !scopeRef.current.isCurrent(job, sourceIdentity, expectedScreen)
        || expectedScreen !== 'split-preview') return;
      const derived = deriveSplitImage(source.originalImageData, true, { toUrl: imageDataToUrl, getCrop: getImageCrop }, { sensitivity: queuedSensitivityRef.current, backgroundCache: source.backgroundCache });
      if (imageRef.current?.originalImageData !== sourceIdentity || screenRef.current !== expectedScreen || !scopeRef.current.isCurrent(job, sourceIdentity, expectedScreen)) return;
      const updated = { ...source, ...derived, crop: source.crop, backgroundSensitivity: queuedSensitivityRef.current }; imageRef.current = updated; setUploadedSplitImage(updated); onSourceChange(derived.url);
    });
  };
  const commitAlignState = () => {
    if (alignFrameRef.current) return;
    alignFrameRef.current = requestAnimationFrame(() => {
      alignFrameRef.current = 0;
      setAlignCellSize(liveAlignCellSizeRef.current);
      setAlignOffsetX(liveAlignOffsetRef.current.x);
      setAlignOffsetY(liveAlignOffsetRef.current.y);
    });
  };
  const updateAlignCellSize = (value: number, options: { deferred?: boolean } = {}) => {
    const image = imageRef.current;
    if (!image) return;
    const origin = liveGridFrameOriginRef.current;
    const originX = (origin.x / 100) * image.crop.width;
    const originY = (origin.y / 100) * image.crop.height;
    const maxCellSize = Math.max(1, Math.min((image.crop.width - originX) / GRID_CONTROL_CELLS, (image.crop.height - originY) / GRID_CONTROL_CELLS));
    const next = Math.max(1, Math.min(maxCellSize, value));
    liveAlignCellSizeRef.current = next;
    liveAlignOffsetRef.current = { x: originX, y: originY };
    if (options.deferred) commitAlignState();
    else { setAlignCellSize(next); setAlignOffsetX(originX); setAlignOffsetY(originY); }
  };
  const moveGridControlFrame = (deltaX: number, deltaY: number, options: { deferred?: boolean } = {}) => {
    const image = imageRef.current;
    if (!image) return;
    const origin = liveGridFrameOriginRef.current;
    const currentX = (origin.x / 100) * image.crop.width;
    const currentY = (origin.y / 100) * image.crop.height;
    const frameSize = liveAlignCellSizeRef.current * GRID_CONTROL_CELLS;
    const nextX = Math.max(0, Math.min(Math.max(0, image.crop.width - frameSize), currentX + deltaX));
    const nextY = Math.max(0, Math.min(Math.max(0, image.crop.height - frameSize), currentY + deltaY));
    const nextOrigin = { x: (nextX / image.crop.width) * 100, y: (nextY / image.crop.height) * 100 };
    liveGridFrameOriginRef.current = nextOrigin;
    liveAlignOffsetRef.current = { x: liveAlignOffsetRef.current.x + nextX - currentX, y: liveAlignOffsetRef.current.y + nextY - currentY };
    setGridFrameOrigin(nextOrigin);
    if (options.deferred) commitAlignState();
    else { setAlignOffsetX(liveAlignOffsetRef.current.x); setAlignOffsetY(liveAlignOffsetRef.current.y); }
  };
  const imageRectFor = (target: Element) => {
    const image = imageRef.current;
    if (!image) return null;
    const frame = target.closest('.split-image-frame') ?? target.querySelector('.split-image-frame') ?? target;
    const frameRect = frame.getBoundingClientRect();
    const base = fitSplitImageRect(frameRect, image.crop);
    const scaled = scaleRectFromCenter(base, splitImageScale);
    return { frameRect, image, rect: { ...scaled, x: scaled.x + imageOffsetRef.current.x, y: scaled.y + imageOffsetRef.current.y } };
  };
  const setImageOffset = (offset: { x: number; y: number }) => { imageOffsetRef.current = offset; setSplitImageOffset(offset); };
  const zoomAtPoint = (clientX: number, clientY: number, factor: number, target: Element) => {
    const data = imageRectFor(target); if (!data) return;
    const pointX = clientX - data.frameRect.left; const pointY = clientY - data.frameRect.top;
    const relativeX = data.rect.width ? (pointX - data.rect.x) / data.rect.width : .5;
    const relativeY = data.rect.height ? (pointY - data.rect.y) / data.rect.height : .5;
    const nextScale = clampSplitImageScale(splitImageScale * factor);
    const next = scaleRectFromCenter(fitSplitImageRect(data.frameRect, data.image.crop), nextScale);
    setImageOffset({ x: pointX - (next.x + relativeX * next.width), y: pointY - (next.y + relativeY * next.height) });
    setSplitImageScale(nextScale);
  };
  const alignDeltaFromScreen = (deltaX: number, deltaY: number, target: Element) => {
    const data = imageRectFor(target); if (!data) return { x: 0, y: 0 };
    return { x: data.rect.width ? deltaX / data.rect.width * data.image.crop.width : 0, y: data.rect.height ? deltaY / data.rect.height * data.image.crop.height : 0 };
  };
  const gridPointFromScreen = (clientX: number, clientY: number, target: Element) => {
    const data = imageRectFor(target); if (!data) return { x: 0, y: 0 };
    return { x: data.rect.width ? (clientX - data.frameRect.left - data.rect.x) / data.rect.width * data.image.crop.width : 0, y: data.rect.height ? (clientY - data.frameRect.top - data.rect.y) / data.rect.height * data.image.crop.height : 0 };
  };
  const handleSplitTouchStart = (event: React.TouchEvent) => { if ((event.target as HTMLElement).closest('.split-grid-handle') || event.touches.length !== 2) return; event.preventDefault(); suppressImageClickRef.current = false; imagePinchRef.current = { active: true, startDistance: touchDistance(event.touches[0], event.touches[1]), startScale: splitImageScale }; };
  const handleSplitTouchMove = (event: React.TouchEvent) => { if (!imagePinchRef.current.active || event.touches.length !== 2) return; if (event.cancelable) event.preventDefault(); suppressImageClickRef.current = true; setSplitImageScale(clampSplitImageScale(imagePinchRef.current.startScale * touchDistance(event.touches[0], event.touches[1]) / Math.max(1, imagePinchRef.current.startDistance))); };
  const handleSplitTouchEnd = (event: React.TouchEvent) => { if (event.touches.length < 2) { imagePinchRef.current.active = false; gridDragRef.current.handle = null; } };
  const handleSplitWheel = (event: React.WheelEvent<HTMLDivElement>) => { if ((event.target as HTMLElement).closest('.split-grid-handle')) return; event.preventDefault(); zoomAtPoint(event.clientX, event.clientY, event.deltaY < 0 ? 1.12 : .9, event.currentTarget); };
  const handleSplitClick = (event: React.MouseEvent<HTMLDivElement>) => { if ((event.target as HTMLElement).closest('.split-grid-handle')) return; if (suppressImageClickRef.current) { suppressImageClickRef.current = false; return; } zoomAtPoint(event.clientX, event.clientY, 1.12, event.currentTarget); };
  const handleSplitPointerDown = (event: React.PointerEvent<HTMLDivElement>) => { if ((event.target as HTMLElement).closest('.split-grid-handle')) return; imagePanRef.current = { active: true, pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId); };
  const handleSplitPointerMove = (event: React.PointerEvent<HTMLDivElement>) => { const pan = imagePanRef.current; if (!pan.active || pan.pointerId !== event.pointerId || imagePinchRef.current.active) return; const x = event.clientX - pan.lastX; const y = event.clientY - pan.lastY; if (Math.abs(x) + Math.abs(y) < 1) return; setImageOffset({ x: imageOffsetRef.current.x + x, y: imageOffsetRef.current.y + y }); suppressImageClickRef.current = true; pan.lastX = event.clientX; pan.lastY = event.clientY; };
  const handleSplitPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => { const pan = imagePanRef.current; if (pan.pointerId !== event.pointerId) return; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); imagePanRef.current = { ...pan, active: false, pointerId: null }; };
  const handleGridHandlePointerDown = (handle: GridHandle, event: React.PointerEvent<HTMLElement>) => { event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); gridDragRef.current = { handle, lastX: event.clientX, lastY: event.clientY }; };
  const handleGridHandlePointerMove = (event: React.PointerEvent<HTMLElement>) => { const drag = gridDragRef.current; if (!drag.handle) return; event.preventDefault(); event.stopPropagation(); if (drag.handle === 'move') { const delta = alignDeltaFromScreen(event.clientX - drag.lastX, event.clientY - drag.lastY, event.currentTarget); moveGridControlFrame(delta.x, delta.y, { deferred: true }); } else { const image = imageRef.current; if (image) { const point = gridPointFromScreen(event.clientX, event.clientY, event.currentTarget); const origin = liveGridFrameOriginRef.current; updateAlignCellSize(((point.x - origin.x / 100 * image.crop.width) + (point.y - origin.y / 100 * image.crop.height)) / (GRID_CONTROL_CELLS * 2), { deferred: true }); } } gridDragRef.current = { ...drag, lastX: event.clientX, lastY: event.clientY }; };
  const handleGridHandlePointerEnd = (event: React.PointerEvent<HTMLElement>) => { event.preventDefault(); event.stopPropagation(); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); gridDragRef.current.handle = null; };
  return { uploadedSplitImage, splitMode, setSplitMode, splitLongSide, activeSplitRows, activeSplitCols, splitPreviewCells, splitPreviewLoading, splitLoadingStage, splitLoadingProgress, splitMergeThreshold, setSplitMergeThreshold, deferredSplitMergeThreshold, splitCropBounds, setSplitCropBounds, splitPreviewTab, setSplitPreviewTab, splitImageScale, setSplitImageScale, splitImageOffset, alignCellSize, alignedGrid, flowAlignedGrid, gridFrameOrigin, isSplitCropped, isBackgroundProcessing, upload, loadImage, clear, openPreview, confirmCrop, returnToCrop, resetCrop, updateLongSide, importToCanvas, splitColorList, toggleBackground, updateBackgroundSensitivity, updateAlignCellSize, moveGridControlFrame, handleSplitTouchStart, handleSplitTouchMove, handleSplitTouchEnd, handleSplitWheel, handleSplitClick, handleSplitPointerDown, handleSplitPointerMove, handleSplitPointerEnd, handleGridHandlePointerDown, handleGridHandlePointerMove, handleGridHandlePointerEnd, createBlankCells };
}
