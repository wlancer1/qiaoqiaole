import { describe, expect, it } from 'vitest';
import { editorCanvasGeometry } from './CanvasLayerGeometry';

describe('editorCanvasGeometry', () => {
  it('keeps the artboard offset inside the editor viewport', () => {
    expect(editorCanvasGeometry(
      { left: 40, top: 30, width: 1024, height: 768 },
      { left: 200, top: 150, width: 420, height: 280 },
    )).toEqual({
      viewportWidth: 1024,
      viewportHeight: 768,
      artboard: { left: 160, top: 120, width: 420, height: 280 },
    });
  });
});
