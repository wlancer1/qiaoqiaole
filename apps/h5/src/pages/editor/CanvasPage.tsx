import { ArrowLeft, FileDown, Layers3, List, Redo2, Save, SlidersHorizontal, Undo2, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch';
import { EditorCanvasLayers } from '../../canvas/EditorCanvasLayers';
import { CanvasRulers, CanvasScaleObserver, CanvasViewportRulers } from '../../canvas/H5CanvasPreview';
import { BeadListDrawer } from '../../flow/H5FlowComponents';
import { Icon } from '../../shared/h5Icons';
import { SaveProjectDialog } from './SaveProjectDialog';

type CanvasPageProps = Record<string, any>;

export function CanvasBackgroundTool(props: {
  isProcessing: boolean;
  onToggle: () => void;
}) {
  const { isProcessing, onToggle } = props;
  return (
    <button
      className="rail-tool"
      aria-label={isProcessing ? '背景处理中' : '去除背景'}
      onClick={onToggle}
      disabled={isProcessing}
    >
      <Icon name="spark" />
    </button>
  );
}

export function CanvasPage(props: CanvasPageProps) {
  const canvasStageRef = useRef<HTMLDivElement | null>(null);
  const [viewportRulerSticky, setViewportRulerSticky] = useState(false);
  const {
    fileInputRef, handleUpload, referenceInputRef, handleReferenceUpload, clearReferenceImage, setScreen,
    setShowSettings, cols, rows, history, future, undo, redo, chooseReferenceImage, exportPatternPng, workMode,
    exportStl, saveCurrentProject, selectedCode, selectedColor, showSettings, cfgCols, setCfgCols, cfgRows, setCfgRows, fitView,
    showSaveProjectModal, setShowSaveProjectModal, saveProjectName, setSaveProjectName, isSavingProject, confirmSaveProject,
    showSaveLoginPrompt, setShowSaveLoginPrompt, onLoginForSave,
    shareToCommunity, setShareToCommunity, activeProjectShared,
    projectFolders, saveFolderId, setSaveFolderId, createProjectFolder, projectFolderSheetOpen,
    handleResizeCanvas, canvasTools, tool, setTool, handleCanvasPointerDownCapture, handleCanvasPointerEndCapture,
    parseGridSizeInput, normalizeGridSize,
    setCanvasScale, canvasArtboardRef, cells, canvasScale, getCode, getTextColor, handleCanvasKeyDown,
    handleCanvasPointerDown, handleCanvasPointerMove, handleCanvasPaintPointerEnd, handleCanvasClick, referenceImage,
    canRemoveGridBackground, isBackgroundProcessing, onToggleBackground,
    isReferenceMinimized, setIsReferenceMinimized, closeReferenceImage, status, prioritizedPaletteColors,
    selectPaletteColor, showPaletteSearch, setShowPaletteSearch, paletteQuery, setPaletteQuery, filteredPaletteColors,
    showBeadList, setShowBeadList, beadListColors, totalBeads, onInventoryCheck, onStartBeading,
  } = props;
return (
  <main className="h5-canvas-page cell-codes-visible" aria-label="H5 画布编辑器">
    <input ref={fileInputRef} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void handleUpload(event.target.files?.[0])} />
    <input ref={referenceInputRef} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" aria-label="参考图文件" onChange={(event) => handleReferenceUpload(event.target.files?.[0])} />

    <header className="canvas-topbar">
      <div className="topbar-left">
        <button className="top-icon-btn close-btn" aria-label="返回作品列表" onClick={() => { clearReferenceImage(); setScreen('home'); }}>
          <ArrowLeft aria-hidden="true" />
        </button>
        <button className="top-icon-btn sliders-btn" aria-label="画布设置" onClick={() => setShowSettings(true)}>
          <SlidersHorizontal aria-hidden="true" />
        </button>
        <span className="canvas-size-pill">{cols}×{rows}</span>
      </div>

      <div className="topbar-center">
        <button className="top-icon-btn undo-btn" aria-label="撤销" onClick={undo} disabled={history.length === 0}>
          <Undo2 aria-hidden="true" />
        </button>
        <button className="top-icon-btn redo-btn" aria-label="重做" onClick={redo} disabled={future.length === 0}>
          <Redo2 aria-hidden="true" />
        </button>
      </div>

      <div className="topbar-right">
        <button className="top-icon-btn reference-upload-btn" aria-label="上传参考图" onClick={chooseReferenceImage}>
          <Icon name="upload" />
        </button>
        <button className="top-icon-btn save-btn" aria-label="导出拼豆图纸" onClick={exportPatternPng}>
          <FileDown aria-hidden="true" />
        </button>
        <button className="top-icon-btn save-project-btn" aria-label="保存到我的作品" onClick={() => saveCurrentProject()}>
          <Save aria-hidden="true" />
        </button>
        {workMode === 'peg' ? (
          <button className="top-icon-btn layers-btn" aria-label="导出 STL" onClick={exportStl}>
            <Layers3 aria-hidden="true" />
          </button>
        ) : null}
        <button className="current-color-dot" aria-label={`当前色号 ${selectedCode}`} style={{ background: selectedColor }} />
      </div>
    </header>

    {showSettings && (
      <div className="h5-settings-modal">
        <div className="h5-settings-modal-content">
          <h3>画布参数调整</h3>
          <div className="h5-settings-form">
            <label>
              <span>宽度列数 (Cols):</span>
              <input type="number" min={2} max={120} value={cfgCols} onChange={(e) => setCfgCols(parseGridSizeInput(e.target.value))} onBlur={() => setCfgCols(normalizeGridSize(cfgCols))} />
            </label>
            <label>
              <span>高度行数 (Rows):</span>
              <input type="number" min={2} max={120} value={cfgRows} onChange={(e) => setCfgRows(parseGridSizeInput(e.target.value))} onBlur={() => setCfgRows(normalizeGridSize(cfgRows))} />
            </label>
          </div>
          <div className="h5-modal-actions">
            <button className="fit-btn" onClick={fitView}>重置视图</button>
            <button className="confirm-btn" onClick={handleResizeCanvas}>确定调整</button>
            <button className="cancel-btn" onClick={() => {
              setCfgCols(cols);
              setCfgRows(rows);
              setShowSettings(false);
            }}>取消</button>
          </div>
        </div>
      </div>
    )}

    {showSaveProjectModal ? <SaveProjectDialog
      saveProjectName={saveProjectName}
      setSaveProjectName={setSaveProjectName}
      shareToCommunity={shareToCommunity}
      setShareToCommunity={setShareToCommunity}
      activeProjectShared={activeProjectShared}
      isSaving={isSavingProject}
      onConfirm={confirmSaveProject}
      onClose={() => setShowSaveProjectModal(false)}
      folders={projectFolders}
      folderId={saveFolderId}
      onFolderChange={setSaveFolderId}
      onCreateFolder={createProjectFolder}
      covered={projectFolderSheetOpen}
    /> : null}

    {showSaveLoginPrompt ? (
      <div className="save-login-prompt" role="dialog" aria-modal="true" aria-labelledby="save-login-title">
        <div className="save-login-prompt-panel">
          <button className="save-project-close" type="button" aria-label="关闭登录提示" onClick={() => setShowSaveLoginPrompt(false)}><X aria-hidden="true" /></button>
          <h2 id="save-login-title">登录后保存作品</h2>
          <p>登录后才能把当前画布保存到我的作品，当前画布内容不会丢失。</p>
          <div className="h5-modal-actions">
            <button className="cancel-btn" type="button" onClick={() => setShowSaveLoginPrompt(false)}>暂不登录</button>
            <button className="confirm-btn" type="button" onClick={onLoginForSave}>去登录</button>
          </div>
        </div>
      </div>
    ) : null}

    <section className="canvas-workbench">
      <aside className="canvas-rail" aria-label="画布工具栏">
        {canvasTools.map((item: { tool: string; label: string; icon: any }) => (
          <button
            key={item.tool}
            className={tool === item.tool ? 'rail-tool active' : 'rail-tool'}
            aria-label={item.label}
            aria-pressed={tool === item.tool}
            onClick={() => setTool(item.tool)}
          >
            <Icon name={item.icon} />
            </button>
          ))}
        <button
          className={showBeadList ? 'rail-tool active' : 'rail-tool'}
          aria-label="豆子清单"
          aria-pressed={showBeadList}
          onClick={() => setShowBeadList(true)}
        >
          <List className="ui-icon" aria-hidden="true" />
        </button>
        {canRemoveGridBackground ? <CanvasBackgroundTool isProcessing={isBackgroundProcessing} onToggle={onToggleBackground} /> : null}
      </aside>

      <div
        className={tool === 'pan' ? 'canvas-stage is-pan-tool' : 'canvas-stage'}
        role="application"
        aria-label="画布工作区"
        onPointerDownCapture={handleCanvasPointerDownCapture}
        onPointerUpCapture={handleCanvasPointerEndCapture}
        onPointerCancelCapture={handleCanvasPointerEndCapture}
        onLostPointerCapture={handleCanvasPointerEndCapture}
        ref={canvasStageRef}
      >
        <TransformWrapper
          initialScale={1}
          minScale={0.2}
          maxScale={12}
          centerOnInit={true}
          panning={{
            disabled: false,
            allowLeftClickPan: true,
            excluded: tool === 'pan' ? [] : ['canvas-artwork'],
          }}
          pinch={{ disabled: false, allowPanning: true, excluded: [] }}
          doubleClick={{ disabled: true }}
          wheel={{ step: 0.15 }}
        >
          {({ zoomIn, zoomOut, resetTransform }) => (
            <>
              <CanvasScaleObserver onScaleChange={setCanvasScale} />
              <EditorCanvasLayers
                artboardRef={canvasArtboardRef}
                cells={cells}
                cols={cols}
                rows={rows}
                codesVisible={canvasScale >= 1.5}
                getCode={getCode}
                getTextColor={getTextColor}
              />
              <TransformComponent
                wrapperStyle={{ width: '100%', height: '100%', overflow: 'hidden' }}
                contentStyle={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <div
                  ref={canvasArtboardRef}
                  className="h5-artboard"
                  style={{
                    aspectRatio: `${cols} / ${rows}`,
                    width: `min(calc(${cols} * var(--canvas-cell-size)), calc(100% - var(--canvas-ruler-gutter)))`,
                  }}
                  >
                     {!viewportRulerSticky ? <CanvasRulers rows={rows} cols={cols} /> : null}
                    <div
                      className="h5-canvas-interaction canvas-artwork"
                      role="img"
                      aria-label="拼豆编辑画布"
                      tabIndex={0}
                      onKeyDown={handleCanvasKeyDown}
                      onPointerDown={handleCanvasPointerDown}
                      onPointerMove={handleCanvasPointerMove}
                      onPointerUp={handleCanvasPaintPointerEnd}
                      onPointerCancel={handleCanvasPaintPointerEnd}
                      onLostPointerCapture={handleCanvasPaintPointerEnd}
                      onClick={handleCanvasClick}
                    />
                </div>
              </TransformComponent>
              <CanvasViewportRulers
                stageRef={canvasStageRef}
                artboardRef={canvasArtboardRef}
                rows={rows}
                cols={cols}
                scale={canvasScale}
                onStickyChange={setViewportRulerSticky}
              />
              <div className="canvas-zoom-controls" aria-label="画布缩放控制">
                <button aria-label="放大画布" onClick={() => { zoomIn(0.35); setCanvasScale((value: number) => Math.min(12, value + 0.35)); }}>+</button>
                <button aria-label="缩小画布" onClick={() => { zoomOut(0.35); setCanvasScale((value: number) => Math.max(0.2, value - 0.35)); }}>-</button>
                <button aria-label="重置画布视图" onClick={() => { resetTransform(); setCanvasScale(1); }}>1:1</button>
              </div>
            </>
          )}
        </TransformWrapper>
        {referenceImage ? (
          <section className={isReferenceMinimized ? 'canvas-reference-window minimized' : 'canvas-reference-window'} aria-label="参考图">
            <header className="canvas-reference-head">
              <strong>参考图</strong>
              <span>{referenceImage.name}</span>
              <button aria-label={isReferenceMinimized ? '展开参考图' : '最小化参考图'} onClick={() => setIsReferenceMinimized((value: boolean) => !value)}>
                {isReferenceMinimized ? '+' : '−'}
              </button>
              <button aria-label="关闭参考图" onClick={closeReferenceImage}>×</button>
            </header>
            {!isReferenceMinimized ? (
              <div className="canvas-reference-body">
                <img src={referenceImage.url} alt="参考图" />
              </div>
            ) : null}
          </section>
        ) : null}
        {status ? (
          <p className="canvas-status" role="status" aria-live="polite">{status}</p>
        ) : null}
      </div>
    </section>

    {showBeadList ? <BeadListDrawer colors={beadListColors} totalBeads={totalBeads} onClose={() => setShowBeadList(false)} onInventoryCheck={onInventoryCheck} onStartBeading={onStartBeading} /> : null}

    <footer className="canvas-palette" aria-label="底部色卡">
      <div className="palette-strip">
        {prioritizedPaletteColors.map((color: { code: string; hex: string }) => (
          <button
            key={color.code}
            className={selectedCode === color.code ? 'palette-code active' : 'palette-code'}
            style={{ background: color.hex }}
            aria-label={`选择色号 ${color.code}`}
            onClick={() => {
              selectPaletteColor(color);
            }}
          >
            <span className="palette-code-label">{color.code}</span>
            <span className="palette-active-indicator" />
          </button>
        ))}
      </div>
      <button className="filter-button" aria-label="筛选色卡" onClick={() => setShowPaletteSearch(true)} />
    </footer>
    {showPaletteSearch ? (
      <div className="palette-search-modal" role="dialog" aria-label="筛选色卡面板">
        <div className="palette-search-panel">
          <div className="palette-search-head">
            <strong>筛选色卡</strong>
            <button aria-label="关闭筛选" onClick={() => setShowPaletteSearch(false)}>关闭</button>
          </div>
          <input
            type="search"
            aria-label="搜索色号"
            placeholder="输入色号，如 M15"
            value={paletteQuery}
            onChange={(event) => setPaletteQuery(event.target.value)}
          />
          <div className="palette-search-results">
            {filteredPaletteColors.map((color: { code: string; hex: string }) => (
              <button
                key={color.code}
                className="palette-search-option"
                aria-label={`选择色号 ${color.code}`}
                onClick={() => {
                  selectPaletteColor(color);
                  setShowPaletteSearch(false);
                  setPaletteQuery('');
                }}
              >
                <span style={{ background: color.hex }} />
                <strong>{color.code}</strong>
                <small>{color.hex}</small>
              </button>
            ))}
          </div>
        </div>
      </div>
    ) : null}
  </main>
);

}
