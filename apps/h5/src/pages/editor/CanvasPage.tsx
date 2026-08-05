import { FileDown, Layers3, List, Redo2, Save, SlidersHorizontal, Undo2, X } from 'lucide-react';
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch';
import { H5CanvasLayers } from '../../canvas/H5CanvasLayers';
import { CanvasRulers, CanvasScaleObserver } from '../../canvas/H5CanvasPreview';
import { BeadListDrawer } from '../../flow/H5FlowComponents';
import { Icon } from '../../shared/h5Icons';

type CanvasPageProps = Record<string, any>;

export function CanvasPage(props: CanvasPageProps) {
  const {
    fileInputRef, handleUpload, referenceInputRef, handleReferenceUpload, clearReferenceImage, setScreen,
    setShowSettings, cols, rows, history, future, undo, redo, chooseReferenceImage, exportPatternPng, workMode,
    exportStl, saveCurrentProject, selectedCode, selectedColor, showSettings, cfgCols, setCfgCols, cfgRows, setCfgRows, fitView,
    showSaveProjectModal, setShowSaveProjectModal, saveProjectName, setSaveProjectName, isSavingProject, confirmSaveProject,
    shareToCommunity, setShareToCommunity, activeProjectShared,
    handleResizeCanvas, canvasTools, tool, setTool, handleCanvasPointerDownCapture, handleCanvasPointerEndCapture,
    setCanvasScale, canvasArtboardRef, cells, canvasScale, getCode, getTextColor, handleCanvasKeyDown,
    handleCanvasPointerDown, handleCanvasPointerMove, handleCanvasPaintPointerEnd, handleCanvasClick, referenceImage,
    isReferenceMinimized, setIsReferenceMinimized, closeReferenceImage, status, prioritizedPaletteColors,
    selectPaletteColor, showPaletteSearch, setShowPaletteSearch, paletteQuery, setPaletteQuery, filteredPaletteColors,
    showBeadList, setShowBeadList, beadListColors, totalBeads,
  } = props;
return (
  <main className="h5-canvas-page cell-codes-visible" aria-label="H5 画布编辑器">
    <input ref={fileInputRef} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void handleUpload(event.target.files?.[0])} />
    <input ref={referenceInputRef} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" aria-label="参考图文件" onChange={(event) => handleReferenceUpload(event.target.files?.[0])} />

    <header className="canvas-topbar">
      <div className="topbar-left">
        <button className="top-icon-btn close-btn" aria-label="关闭画布" onClick={() => { clearReferenceImage(); setScreen('home'); }}>
          <X aria-hidden="true" />
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
        <button className="top-icon-btn save-project-btn" aria-label="保存到我的作品" onClick={saveCurrentProject}>
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
              <input type="number" min={2} max={120} value={cfgCols} onChange={(e) => setCfgCols(Math.max(2, parseInt(e.target.value) || 32))} />
            </label>
            <label>
              <span>高度行数 (Rows):</span>
              <input type="number" min={2} max={120} value={cfgRows} onChange={(e) => setCfgRows(Math.max(2, parseInt(e.target.value) || 32))} />
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

    {showSaveProjectModal ? (
      <div
        className="save-project-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-project-title"
        onClick={() => { if (!isSavingProject) setShowSaveProjectModal(false); }}
      >
        <form className="save-project-panel" onSubmit={(event) => { event.preventDefault(); void confirmSaveProject(); }} onClick={(event) => event.stopPropagation()}>
          <button className="save-project-close" type="button" aria-label="关闭保存作品" onClick={() => setShowSaveProjectModal(false)} disabled={isSavingProject}>
            <X aria-hidden="true" />
          </button>
          <h2 id="save-project-title">保存作品</h2>
          <label className="save-project-field">
            <span>作品名称</span>
            <div className="save-project-input-wrap">
              <input
                autoFocus
                type="text"
                aria-label="作品名称"
                maxLength={30}
                value={saveProjectName}
                onChange={(event) => setSaveProjectName(event.target.value)}
              />
              {saveProjectName ? (
                <button type="button" aria-label="清空作品名称" onClick={() => setSaveProjectName('')} disabled={isSavingProject}>×</button>
              ) : null}
            </div>
            <output>{saveProjectName.length}/30</output>
          </label>
          <label className="save-project-share-option">
            <input type="checkbox" checked={shareToCommunity} onChange={(event) => setShareToCommunity(event.target.checked)} disabled={isSavingProject || activeProjectShared} />
            <span><strong>{activeProjectShared ? '已分享到社区' : '分享到社区'}</strong><small>{activeProjectShared ? '保存不会重复分享或刷新分享时间' : '分享后会出现在发现和热门模板'}</small></span>
          </label>
          <button className="save-project-submit" type="submit" disabled={isSavingProject || !saveProjectName.trim()}>
            <Save aria-hidden="true" />
            {isSavingProject ? '保存中…' : '保存到作品'}
          </button>
        </form>
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
      </aside>

      <div
        className={tool === 'pan' ? 'canvas-stage is-pan-tool' : 'canvas-stage'}
        role="application"
        aria-label="画布工作区"
        onPointerDownCapture={handleCanvasPointerDownCapture}
        onPointerUpCapture={handleCanvasPointerEndCapture}
        onPointerCancelCapture={handleCanvasPointerEndCapture}
        onLostPointerCapture={handleCanvasPointerEndCapture}
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
              <H5CanvasLayers
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
                    <CanvasRulers rows={rows} cols={cols} />
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

    {showBeadList ? <BeadListDrawer colors={beadListColors} totalBeads={totalBeads} onClose={() => setShowBeadList(false)} /> : null}

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
