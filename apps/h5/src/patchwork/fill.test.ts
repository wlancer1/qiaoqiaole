import {expect,it} from 'vitest';
import {makePiece} from './model';
import {applyColor,sameFill} from './fill';
import {defaultStitch} from './stitches';
it('preserves material links and skips locked shapes and sewing paths',()=>{
 const p=makePiece([{x:0,y:0},{x:20,y:0},{x:20,y:20}],'B');
 applyColor(p,'#ffffff');expect(p.materialId).toBe('B');expect(p.paint?.fill).toBe('solid');
 p.locked=true;applyColor(p,null);expect(p.paint?.fill).toBe('solid');
 p.locked=false;p.stitch={...defaultStitch};applyColor(p,null);expect(p.paint?.fill).toBe('solid');
});
it('matches actual paint instead of hidden material when finding the same fill',()=>{
 const a=makePiece([],'B'),b=makePiece([],'B');
 applyColor(a,'#ffffff');expect(sameFill(a,b)).toBe(false);
 applyColor(b,'#000000');expect(sameFill(a,b)).toBe(false);
 applyColor(b,'#ffffff');expect(sameFill(a,b)).toBe(true);
});
