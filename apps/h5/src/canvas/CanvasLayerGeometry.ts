import type { ViewportArtboard } from './H5CanvasRenderer';

export type CanvasRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type CanvasLayerGeometry = {
  viewportWidth: number;
  viewportHeight: number;
  artboard: ViewportArtboard;
};

export function editorCanvasGeometry(
  viewport: CanvasRect,
  artboard: CanvasRect,
): CanvasLayerGeometry {
  return {
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    artboard: {
      left: artboard.left - viewport.left,
      top: artboard.top - viewport.top,
      width: artboard.width,
      height: artboard.height,
    },
  };
}

function untransformedDimension(element: HTMLElement, axis: 'width' | 'height'): number {
  const clientSize = axis === 'width' ? element.clientWidth : element.clientHeight;
  if (Number.isFinite(clientSize) && clientSize > 0) return clientSize;
  const offsetSize = axis === 'width' ? element.offsetWidth : element.offsetHeight;
  if (Number.isFinite(offsetSize) && offsetSize > 0) return offsetSize;
  const inlineSize = Number.parseFloat(element.style?.[axis] ?? '');
  return Number.isFinite(inlineSize) && inlineSize > 0 ? inlineSize : 0;
}

export function beadingCanvasGeometry(
  stack: HTMLElement,
  artboard: HTMLElement,
): CanvasLayerGeometry {
  const artboardWidth = untransformedDimension(artboard, 'width');
  const artboardHeight = untransformedDimension(artboard, 'height');
  const viewportWidth = untransformedDimension(stack, 'width') || artboardWidth;
  const viewportHeight = untransformedDimension(stack, 'height') || artboardHeight;
  return {
    viewportWidth,
    viewportHeight,
    artboard: { left: 0, top: 0, width: artboardWidth, height: artboardHeight },
  };
}
