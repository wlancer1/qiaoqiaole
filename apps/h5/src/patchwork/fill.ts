import type { Piece } from './model';
import { defaultShapePaint } from './stitches';
export const fillColors=['#dca1aa','#fff5dc','#f7dc78','#9eb993','#8fb8db','#b8a2cf','#ffffff','#343b45','#ef9276','#82c4bd'];
export function applyColor(piece:Piece,color:string|null){
 if(piece.locked||piece.stitch)return;
 piece.paint={...(piece.paint||defaultShapePaint),fill:color===null?'none':'solid',color:color||piece.paint?.color||defaultShapePaint.color};
}
export function sameFill(a:Piece,b:Piece){
 const af=a.paint?.fill||'fabric',bf=b.paint?.fill||'fabric';
 return af===bf&&(af==='none'||(af==='solid'?a.paint?.color===b.paint?.color:a.materialId===b.materialId));
}
