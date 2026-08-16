import { FlowTopbar, SegmentedControl, SplitBeadList, SplitCanvasLoading, ThresholdControl, getImportAction } from '../../flow/H5FlowComponents';
import { GridAlignmentHandles, SplitPreviewCanvas } from '../../canvas/H5CanvasPreview';
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch';
import type { Cell } from '@qiaoqiaole/core';
import type { SplitMode } from '../../shared/h5Types';
import { SplitCropEditorCanvas } from '../../canvas/SplitCropEditorCanvas';

type SplitPageProps = Record<string, any>;

export function SplitSettingsPage(props: SplitPageProps) {
  const {
    splitMode, setScreen, setSplitMode, uploadedSplitImage, splitImageScale, splitImageOffset,
    handleSplitTouchStart, handleSplitTouchMove, handleSplitTouchEnd, handleSplitWheel, handleSplitClick,
    handleSplitPointerDown, handleSplitPointerMove, handleSplitPointerEnd, activeSplitRows, activeSplitCols,
    alignedGrid, gridFrameOrigin, handleGridHandlePointerDown, handleGridHandlePointerMove, handleGridHandlePointerEnd,
    updateSplitLongSide, splitLongSide, minSplitLongSide, maxSplitLongSide, alignCellSize, moveGridControlFrame,
    updateAlignCellSize, onNext,
  } = props;
return (
  <main className={`split-page split-page--${splitMode}`}>
    <FlowTopbar
      title={splitMode === 'quick' ? '分割设置' : '对格子'}
      backLabel="返回首页"
      onBack={() => setScreen('home')}
      action={{
        label: '下一步',
        onClick: onNext,
        primary: true,
      }}
    />

    <section className="split-main">
      <div className="split-flow-inner">
        <SegmentedControl<SplitMode>
          ariaLabel="分割模式"
          idPrefix="split-mode"
          value={splitMode}
          options={[
            { value: 'quick', label: '快速分割' },
            { value: 'align', label: '对格子' },
          ]}
          onChange={setSplitMode}
        />

        <div
          className="split-mode-panel"
          id={`split-mode-${splitMode}-panel`}
          role="tabpanel"
          aria-labelledby={`split-mode-${splitMode}-tab`}
        >
        <div
          className="split-image-container"
          aria-label="分割预览图"
          data-image-scale={splitImageScale}
          data-image-offset-x={splitImageOffset.x}
          data-image-offset-y={splitImageOffset.y}
          onTouchStartCapture={handleSplitTouchStart}
          onTouchMoveCapture={handleSplitTouchMove}
          onTouchEndCapture={handleSplitTouchEnd}
          onTouchCancelCapture={handleSplitTouchEnd}
          onWheel={handleSplitWheel}
          onClick={handleSplitClick}
          onPointerDown={handleSplitPointerDown}
          onPointerMove={handleSplitPointerMove}
          onPointerUp={handleSplitPointerEnd}
          onPointerCancel={handleSplitPointerEnd}
        >
          <TransformWrapper
            initialScale={1}
            minScale={0.6}
            maxScale={8}
            centerOnInit={true}
            doubleClick={{ disabled: true }}
            wheel={{ disabled: true }}
            pinch={{ disabled: true }}
            panning={{ disabled: true }}
          >
            {() => (
              <>
                <TransformComponent
                  wrapperClass="split-image-zoom-wrapper"
                  contentClass="split-image-zoom-content"
                >
                  <div
                    className="split-image-frame"
                    data-crop-width={uploadedSplitImage.crop.width}
                    data-crop-height={uploadedSplitImage.crop.height}
                  >
                    <SplitPreviewCanvas
                      imageData={uploadedSplitImage.imageData}
                      crop={uploadedSplitImage.crop}
                      rows={activeSplitRows}
                      cols={activeSplitCols}
                      alignment={splitMode === 'align' ? alignedGrid : undefined}
                      imageScale={splitImageScale}
                      imageOffset={splitImageOffset}
                    />
                    {splitMode === 'align' ? (
                      <GridAlignmentHandles
                        grid={alignedGrid}
                        origin={gridFrameOrigin}
                        imageScale={splitImageScale}
                        imageOffset={splitImageOffset}
                        onPointerDown={handleGridHandlePointerDown}
                        onPointerMove={handleGridHandlePointerMove}
                        onPointerEnd={handleGridHandlePointerEnd}
                      />
                    ) : null}
                  </div>
                </TransformComponent>
              </>
            )}
          </TransformWrapper>
        </div>

        <div className="split-controls-card">
        {splitMode === 'quick' ? (
          <div className="split-quick-controls">
            <div className="split-quick-value-group">
              <output
                className="split-quick-output"
                id="split-quick-output"
                aria-label="当前宽高格数"
                data-grid-rows={activeSplitRows}
                data-grid-cols={activeSplitCols}
              >
                {activeSplitCols} × {activeSplitRows}
              </output>
            </div>
            <div className="split-slider-row">
              <div className="split-slider-wrap">
                <input
                  aria-label="长边格数"
                  aria-describedby="split-quick-output"
                  type="range"
                  min={minSplitLongSide}
                  max={maxSplitLongSide}
                  value={splitLongSide}
                  className="split-range"
                  onChange={(event) => updateSplitLongSide(Number(event.target.value))}
                />
                <span className="split-range-bounds" aria-hidden="true">
                  <span>{minSplitLongSide}</span>
                  <span>{maxSplitLongSide}</span>
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="split-align-panel">
            <div className="split-align-controls" aria-label="对格子微调">
              <section className="split-nudge-section" aria-labelledby="split-nudge-title">
                <h3 id="split-nudge-title">微移</h3>
                <div className="split-nudge-pad" aria-label="移动网格">
                  <button className="split-nudge-up" aria-label="上移网格" onClick={() => moveGridControlFrame(0, -1)}>⌃</button>
                  <button className="split-nudge-left" aria-label="左移网格" onClick={() => moveGridControlFrame(-1, 0)}>‹</button>
                  <output
                    className="split-nudge-readout"
                    aria-label="网格偏移"
                    data-offset-x={alignedGrid.offsetX.toFixed(2)}
                    data-offset-y={alignedGrid.offsetY.toFixed(2)}
                    data-cell-size={alignedGrid.cellSize.toFixed(2)}
                    data-grid-rows={activeSplitRows}
                    data-grid-cols={activeSplitCols}
                  >
                    <span>{alignedGrid.offsetX.toFixed(1)}</span>
                    <span>{alignedGrid.offsetY.toFixed(1)}</span>
                  </output>
                  <button className="split-nudge-right" aria-label="右移网格" onClick={() => moveGridControlFrame(1, 0)}>›</button>
                  <button className="split-nudge-down" aria-label="下移网格" onClick={() => moveGridControlFrame(0, 1)}>⌄</button>
                </div>
              </section>
              <section className="split-grid-size-section" aria-labelledby="split-grid-size-title">
                <h3 id="split-grid-size-title">调整格子大小</h3>
                <div className="split-cell-actions" aria-label="缩放网格">
                  <button aria-label="减小格距" onClick={() => updateAlignCellSize(alignCellSize - 1)}>−</button>
                  <output
                    className="split-grid-size-output"
                    aria-label="格距"
                    data-offset-x={alignedGrid.offsetX.toFixed(2)}
                    data-offset-y={alignedGrid.offsetY.toFixed(2)}
                    data-cell-size={alignedGrid.cellSize.toFixed(2)}
                    data-grid-rows={activeSplitRows}
                    data-grid-cols={activeSplitCols}
                  >
                    <strong>{alignedGrid.cellSize.toFixed(2)}</strong>
                    <span>格 / PX</span>
                  </output>
                  <button aria-label="增大格距" onClick={() => updateAlignCellSize(alignCellSize + 1)}>+</button>
                </div>
                <p>调整网格线间距<br />使其与图纸格线对齐</p>
              </section>
            </div>
          </div>
        )}
        </div>
        </div>
      </div>
    </section>
  </main>
);

}

export function SplitCropPage(props: SplitPageProps) {
  const {
    setScreen, splitPreviewLoading, uploadedSplitImage, splitMode, alignedGrid, activeSplitCols, activeSplitRows,
    splitImageScale, onZoomStep, onZoomChange, onResetImageZoom,
    splitLoadingStage, splitLoadingProgress, splitMergeThreshold, deferredSplitMergeThreshold,
    cropBounds, onCropBoundsChange, onConfirmCrop, onResetCrop,
  } = props;
  const resetCropView = () => {
    onResetImageZoom();
    onResetCrop();
  };
  return (
    <main className="split-page split-crop-page">
      <FlowTopbar
        title="裁剪"
        backLabel="返回分割设置"
        onBack={() => setScreen('split')}
        action={{
          label: '确认裁剪',
          onClick: onConfirmCrop,
          disabled: splitPreviewLoading || splitMergeThreshold !== deferredSplitMergeThreshold || !uploadedSplitImage,
          primary: true,
        }}
      />
      <section className="split-crop-body" aria-label="裁剪预览" aria-busy={splitPreviewLoading}>
        <div className="split-crop-workspace">
          {splitPreviewLoading ? (
            <div className="split-crop-loading"><SplitCanvasLoading rows={activeSplitRows} cols={activeSplitCols} stage={splitLoadingStage} progress={splitLoadingProgress} /></div>
          ) : (
            <SplitCropEditorCanvas
              imageUrl={uploadedSplitImage.url}
              sourceCrop={uploadedSplitImage.crop}
              rows={activeSplitRows}
              cols={activeSplitCols}
              alignment={splitMode === 'align' ? alignedGrid : undefined}
              bounds={cropBounds}
              zoom={splitImageScale}
              onBoundsChange={onCropBoundsChange}
              onZoomChange={onZoomChange}
            />
          )}
        </div>
        <p className="split-crop-notice">仅保留格子内容，裁掉清单、坐标轴等无关区域</p>
        <div className="split-crop-toolbar" aria-label="裁剪控制">
          <button className="split-crop-toolbar-reset" type="button" onClick={resetCropView}>重置</button>
          <div className="split-crop-zoom-controls">
            <button type="button" aria-label="缩小裁剪预览" onClick={() => onZoomStep(0.9)}>−</button>
            <output>{Math.round(splitImageScale * 100)}%</output>
            <button type="button" aria-label="放大裁剪预览" onClick={() => onZoomStep(1.1)}>+</button>
          </div>
        </div>
      </section>
    </main>
  );
}

export function SplitPreviewPage(props: SplitPageProps) {
  const {
    splitPreviewLoading, splitMergeThreshold, setSplitMergeThreshold, deferredSplitMergeThreshold, splitPreviewCells,
    importSplitToCanvas, splitLoadingStage, splitLoadingProgress,
    splitColorList, setSplitPreviewTab, splitPreviewTab, backgroundRemoved, isBackgroundProcessing, onToggleBackground,
    backgroundSensitivity, onBackgroundSensitivityChange,
    previewCols, previewRows,
    onBackToCrop,
  } = props;
return (
  <main className="split-page split-preview-page">
    <FlowTopbar
      title="浏览"
      backLabel="返回分割"
      onBack={onBackToCrop}
      action={getImportAction(
        splitPreviewLoading || isBackgroundProcessing || splitMergeThreshold !== deferredSplitMergeThreshold ? 0 : splitPreviewCells.length,
        importSplitToCanvas,
      )}
    />

    <section className="split-browser-container" aria-label="分割浏览预览" aria-busy={splitPreviewLoading}>
      {backgroundRemoved ? (
        <div className="split-background-preview-status" role="status" aria-label="已去背景，透明区域已标记">
          <span className="split-background-preview-status-dot" aria-hidden="true" />
          <strong>已去背景</strong>
          <span>透明区域</span>
        </div>
      ) : null}
      <div
        className={`split-grid-preview${splitPreviewLoading ? ' is-loading' : ''}${backgroundRemoved ? ' is-background-removed' : ''}`}
        data-background-removed={backgroundRemoved ? 'true' : 'false'}
        style={{
          gridTemplateColumns: `repeat(${previewCols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${previewRows}, minmax(0, 1fr))`,
          aspectRatio: `${previewCols} / ${previewRows}`,
        }}
      >
        {splitPreviewLoading ? (
          <SplitCanvasLoading
            rows={previewRows}
            cols={previewCols}
            stage={splitLoadingStage}
            progress={splitLoadingProgress}
          />
        ) : splitPreviewCells.map((cell: Cell) => (
          <span
            key={`${cell.x}-${cell.y}`}
            className={cell.transparent ? 'split-preview-cell transparent' : 'split-preview-cell'}
            style={{ background: cell.transparent ? undefined : cell.color }}
          />
        ))}
      </div>

      <div className="split-settings-panel" id="split-preview-settings-panel" role="tabpanel" aria-label="参数设置">

        <ThresholdControl
          value={splitMergeThreshold}
          min={0}
          max={20}
          onChange={setSplitMergeThreshold}
        />
        <div className="split-background-actions" aria-label="图片背景处理">
          <button className={backgroundRemoved ? 'is-active' : ''} type="button" onClick={onToggleBackground} disabled={isBackgroundProcessing} aria-pressed={backgroundRemoved}>
            {isBackgroundProcessing ? '处理中…' : backgroundRemoved ? '恢复原图' : '去除背景'}
          </button>
        </div>
        {backgroundRemoved ? (
          <section className="split-background-sensitivity" aria-label="去背景灵敏度设置">
            <div className="split-background-sensitivity-head">
              <label htmlFor="split-background-sensitivity">去背景灵敏度</label>
              <output htmlFor="split-background-sensitivity">{backgroundSensitivity}</output>
            </div>
            <div className="split-background-sensitivity-row">
              <span aria-hidden="true">保守</span>
              <input
                id="split-background-sensitivity"
                type="range"
                aria-label="去背景灵敏度"
                min={0}
                max={100}
                step={1}
                value={backgroundSensitivity}
                onChange={(event) => onBackgroundSensitivityChange(Number(event.target.value))}
              />
              <span aria-hidden="true">积极</span>
            </div>
          </section>
        ) : null}
         <button className="split-bead-list-entry" type="button" aria-label="查看豆子清单" onClick={() => setSplitPreviewTab('beads')}>
          <span className="split-bead-list-entry-title">豆子清单</span>
          <span className="split-bead-list-entry-meta">
            {splitColorList.length} 色 · {splitPreviewCells.filter((cell: Cell) => !cell.transparent).length.toLocaleString('en-US')} 颗
            <b aria-hidden="true">›</b>
          </span>
        </button>
      </div>
    </section>
    {splitPreviewTab === 'beads' ? (
      <div className="split-bead-drawer-backdrop" role="presentation" onClick={() => setSplitPreviewTab('settings')}>
        <section className="split-bead-drawer split-bead-sheet" role="dialog" aria-modal="true" aria-label="豆子清单" onClick={(event) => event.stopPropagation()}>
          <span className="split-bead-drawer-handle" aria-hidden="true" />
          <header className="split-bead-drawer-header">
            <h2>豆子清单</h2>
            <button type="button" aria-label="关闭豆子清单" onClick={() => setSplitPreviewTab('settings')}>×</button>
          </header>
          <p className="split-bead-drawer-copy">按当前浏览预览实时统计，颜色匹配默认使用众数投票</p>
          <SplitBeadList
            colors={splitColorList}
                totalBeads={splitPreviewCells.filter((cell: Cell) => !cell.transparent).length}
          />
        </section>
      </div>
    ) : null}
  </main>
);

}
