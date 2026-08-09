import { editorCanvasGeometry } from './CanvasLayerGeometry';
import { H5CanvasLayers, type H5CanvasLayersProps } from './H5CanvasLayers';

export type EditorCanvasLayersProps = Omit<H5CanvasLayersProps, 'measureGeometry'>;

function measureEditorGeometry(stack: HTMLElement, artboard: HTMLElement) {
  return editorCanvasGeometry(
    stack.getBoundingClientRect(),
    artboard.getBoundingClientRect(),
  );
}

export function EditorCanvasLayers(props: EditorCanvasLayersProps) {
  return <H5CanvasLayers
    {...props}
    measureGeometry={measureEditorGeometry}
  />;
}
