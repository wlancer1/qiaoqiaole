import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Cell } from '@qiaoqiaole/core';
import { useSplitWorkflow } from './useSplitWorkflow';
import { extractUrlFromText, isSupportedXiaohongshuUrl, loadImageDataFromUrl, safeImageFilename } from '../../utils/h5AppUtils';
import type { XhsExtractedImage } from '../../shared/h5Types';
import { SplitCanvasLoading } from '../../flow/H5FlowComponents';
import { useAppOverlay } from '../../app/overlays/AppOverlayContext';

type ImportCommand = (input: { cells: Cell[]; rows: number; cols: number }) => void;
type SplitFeatureValue = ReturnType<typeof useSplitWorkflow> & {
  openFromUpload: (file: File | undefined) => Promise<void>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  showUploadModal: boolean; closeUploadModal: () => void; openUpload: () => void; chooseLocalDrawing: () => void;
  showXhsInput: boolean; setShowXhsInput: (value: boolean) => void; xhsLink: string; setXhsLink: (value: string) => void;
  xhsExtractedImages: XhsExtractedImage[]; isExtractingXhs: boolean; extractXiaohongshuImage: () => Promise<void>;
  importXhsImage: (image: XhsExtractedImage) => Promise<void>; showXhsImagePicker: boolean; closeXhsImagePicker: () => void;
  isImportingXhsImage: boolean; isImportingLocalImage: boolean; xhsExtractedTitle: string;
};
const SplitFeatureContext = createContext<SplitFeatureValue | null>(null);

export type SplitSourceImage = { name: string; dataUrl: string };

/**
 * The application shell only needs this narrow query when an editor save
 * uploads the original drawing.  Split image state itself stays in the
 * feature rather than being mirrored back into H5App.
 */
export type SplitFeatureCommands = {
  upload: (file: File | undefined) => Promise<void>;
  getSourceImage: () => SplitSourceImage | null;
  toggleBackground: () => Promise<void>;
  isBackgroundProcessing: () => boolean;
};

export function SplitFeatureProvider({ children, onImport, setStatus, onCommands, requestApi, isLoggedIn, token, requireLogin }: { children: ReactNode; onImport: ImportCommand; setStatus: (message: string) => void; onCommands?: (commands: SplitFeatureCommands) => void; requestApi?: <T>(path: string, init?: RequestInit) => Promise<T>; isLoggedIn?: boolean; token?: string | null; requireLogin?: (resume: () => void) => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const routeScope = `${location.key ?? ''}:${location.pathname}:${location.search}`;
  const screen = location.pathname === '/split/crop' ? 'split-crop' : location.pathname === '/split/preview' ? 'split-preview' : location.pathname === '/split' ? 'split' : 'other';
  const workflow = useSplitWorkflow({ screen, setStatus, onImport, onSourceChange: () => undefined });
  const { setOverlaySlot } = useAppOverlay();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showXhsInput, setShowXhsInput] = useState(false);
  const [xhsLink, setXhsLink] = useState('');
  const [xhsExtractedImages, setXhsExtractedImages] = useState<XhsExtractedImage[]>([]);
  const [xhsExtractedTitle, setXhsExtractedTitle] = useState('');
  const [showXhsImagePicker, setShowXhsImagePicker] = useState(false);
  const [isExtractingXhs, setIsExtractingXhs] = useState(false);
  const [isImportingXhsImage, setIsImportingXhsImage] = useState(false);
  const [isImportingLocalImage, setIsImportingLocalImage] = useState(false);
  const xhsRequest = useRef(0); const xhsImport = useRef(0);
  const xhsScopeRef = useRef({ routeScope, token: token ?? '' });
  if (xhsScopeRef.current.routeScope !== routeScope || xhsScopeRef.current.token !== (token ?? '')) {
    // This synchronous identity flip covers the render→effect gap.
    xhsScopeRef.current = { routeScope, token: token ?? '' };
    xhsRequest.current += 1;
    xhsImport.current += 1;
  }
  useEffect(() => {
    // XHS controls belong to the home upload UI.  A route or session change
    // makes every outstanding result stale before it can reopen that UI.
    xhsScopeRef.current = { routeScope, token: token ?? '' };
    xhsRequest.current += 1;
    xhsImport.current += 1;
    setShowUploadModal(false); setShowXhsInput(false); setShowXhsImagePicker(false);
    setXhsExtractedImages([]); setXhsExtractedTitle(''); setIsExtractingXhs(false); setIsImportingXhsImage(false); setIsImportingLocalImage(false);
  }, [routeScope, token]);
  useEffect(() => {
    setOverlaySlot('loading', isImportingLocalImage ? (
      <div className="split-import-page-loading" role="dialog" aria-modal="true" aria-label="正在读取图片">
        <SplitCanvasLoading title="正在读取图片" rows={0} cols={0} stage="正在解析图片尺寸与像素" progress={25} />
      </div>
    ) : null);
  }, [isImportingLocalImage, setOverlaySlot]);
  useEffect(() => () => setOverlaySlot('loading', null), [setOverlaySlot]);
  const closeUploadModal = () => { if (isImportingLocalImage) return; xhsRequest.current += 1; xhsImport.current += 1; setShowUploadModal(false); setShowXhsInput(false); setShowXhsImagePicker(false); setXhsExtractedImages([]); setXhsExtractedTitle(''); setXhsLink(''); setIsExtractingXhs(false); setIsImportingXhsImage(false); setIsImportingLocalImage(false); };
  const openUpload = () => { setShowUploadModal(true); setShowXhsInput(false); setShowXhsImagePicker(false); setXhsExtractedImages([]); setXhsExtractedTitle(''); setXhsLink(''); setIsImportingLocalImage(false); };
  const value = useMemo(() => ({
    ...workflow,
    openFromUpload: async (file: File | undefined) => {
      if (!file) return;
      setIsImportingLocalImage(true);
      setShowUploadModal(false);
      try {
        const loaded = await workflow.upload(file);
        // Only enter the flow after a valid image actually loaded.
        if (loaded) navigate('/split');
      } finally {
        setIsImportingLocalImage(false);
      }
    },
    fileInputRef, showUploadModal, closeUploadModal, openUpload,
    chooseLocalDrawing: () => { fileInputRef.current?.click(); },
    showXhsInput, setShowXhsInput, xhsLink, setXhsLink, xhsExtractedImages, isExtractingXhs, showXhsImagePicker, isImportingXhsImage, xhsExtractedTitle,
    isImportingLocalImage,
    closeXhsImagePicker: () => { if (!isImportingXhsImage) { xhsImport.current += 1; setShowXhsImagePicker(false); setXhsExtractedImages([]); } },
    extractXiaohongshuImage: async () => {
      if (!isLoggedIn) { requireLogin?.(() => setShowXhsInput(true)); return; }
      const url = extractUrlFromText(xhsLink); if (!url) { setStatus('未识别到链接。'); return; }
      if (!isSupportedXiaohongshuUrl(url)) { setStatus('不支持的链接域名。'); return; }
      if (!requestApi) return;
      const request = ++xhsRequest.current;
      const requestScope = xhsScopeRef.current;
      const isCurrent = () => request === xhsRequest.current && xhsScopeRef.current === requestScope;
      setIsExtractingXhs(true); setXhsExtractedImages([]);
      try {
        const payload = await requestApi<{ imageUrl?: string; imageDataUrl?: string; title?: string; images?: XhsExtractedImage[] }>('/xiaohongshu/extract', { method: 'POST', body: JSON.stringify({ url }) });
        if (!isCurrent()) return;
        const images = (payload.images?.length ? payload.images : [{ imageUrl: payload.imageUrl || '', imageDataUrl: payload.imageDataUrl || '' }]).filter((image): image is XhsExtractedImage => Boolean(image.imageUrl || image.imageDataUrl));
        if (!images.length) throw new Error('未找到可用图片');
        setXhsExtractedTitle(payload.title?.trim() || '小红书图纸'); setXhsExtractedImages(images); setShowUploadModal(false); setShowXhsInput(false); setShowXhsImagePicker(true);
      } catch (error) { if (isCurrent()) setStatus(error instanceof Error ? error.message : '小红书图片提取失败。'); }
      finally { if (isCurrent()) setIsExtractingXhs(false); }
    },
    importXhsImage: async (image: XhsExtractedImage) => {
      if (!image.imageDataUrl && !image.imageUrl) { setStatus('未找到可用图片。'); return; }
      const request = ++xhsImport.current;
      const requestScope = xhsScopeRef.current;
      const isCurrent = () => request === xhsImport.current && xhsScopeRef.current === requestScope;
      setIsImportingXhsImage(true);
      try {
        let source = image.imageDataUrl || '';
        if (!source && image.imageUrl && requestApi) source = (await requestApi<{ imageDataUrl: string }>('/xiaohongshu/image', { method: 'POST', body: JSON.stringify({ imageUrl: image.imageUrl }) })).imageDataUrl;
        const data = await loadImageDataFromUrl(source);
        if (!isCurrent()) return;
        workflow.loadImage(safeImageFilename(xhsExtractedTitle || 'xiaohongshu-drawing', 'image/png'), data); navigate('/split'); closeUploadModal();
      } catch { if (isCurrent()) setStatus('小红书图片读取失败，请换一张图片。'); }
      finally { if (isCurrent()) setIsImportingXhsImage(false); }
    },
  }), [closeUploadModal, isImportingLocalImage, isImportingXhsImage, isLoggedIn, navigate, requestApi, requireLogin, showUploadModal, showXhsImagePicker, workflow, xhsExtractedImages, xhsExtractedTitle, xhsLink, isExtractingXhs]);
  onCommands?.({
    upload: value.openFromUpload,
    getSourceImage: () => value.uploadedSplitImage
      ? { name: value.uploadedSplitImage.name, dataUrl: value.uploadedSplitImage.url }
      : null,
    toggleBackground: value.toggleBackground,
    isBackgroundProcessing: () => value.isBackgroundProcessing,
  });
  return <SplitFeatureContext.Provider value={value}>{children}</SplitFeatureContext.Provider>;
}

export function useSplitFeature() {
  const value = useContext(SplitFeatureContext);
  if (!value) throw new Error('SplitFeatureProvider is required');
  return value;
}
