import { describe, expect, it } from 'vitest';
import { cloneDocument, makePiece, makeProject, hitTest, exportIssues } from './model';
import { buildPatternPdf, cutList } from './export';
import { computeProjectMaterialRequirements } from './fabricInventory';
import { defaultStitch, outlinePoints, stitchSegments } from './stitches';

describe('physical sewing paths',()=>{
 it('keeps dash phase through a corner without closing an open path',()=>{
  const segments=stitchSegments([{x:0,y:0},{x:4,y:0},{x:4,y:6}],{...defaultStitch,lengthMm:3,gapMm:2});
  expect(segments).toEqual([[{x:0,y:0},{x:3,y:0}],[{x:4,y:1},{x:4,y:4}]]);
 });
 it('offsets the boundary by physical mm for either winding and rejects collapsed insets',()=>{
  const pts=[{x:0,y:0},{x:20,y:0},{x:20,y:20},{x:0,y:20}];
  for(const polygon of [pts,[...pts].reverse()]){
   const result=outlinePoints(polygon,2);
   expect(result.map(p=>p.x).sort((a,b)=>a-b)).toEqual([2,2,18,18]);
   expect(result.map(p=>p.y).sort((a,b)=>a-b)).toEqual([2,2,18,18]);
  }
  expect(()=>outlinePoints(pts,11)).toThrow();
 });
 it('adds blanket stitches pointing into a closed piece',()=>{
  const pts=[{x:0,y:0},{x:20,y:0},{x:20,y:20},{x:0,y:20}];
  const segs=stitchSegments(pts,{...defaultStitch,kind:'blanket'},true);
  expect(segs.slice(1).every(s=>s[1].x>=0&&s[1].x<=20&&s[1].y>=0&&s[1].y<=20)).toBe(true);
 });

 it('uses the explicit solid paint in PDF output instead of the old material color',async()=>{
  const project=makeProject(),p=makePiece([{x:10,y:10},{x:30,y:10},{x:30,y:30},{x:10,y:30}],'B','red');
  p.paint={fill:'solid',color:'#ff0000',border:false,borderColor:'#000000',borderWidthMm:.6};project.pieces=[p];
  const text=await buildPatternPdf(project).text();
  expect(text).toContain('1 0 0 rg 0.35 w');
 });
 it('serializes threads and attached styles, selects open lines, and excludes threads from cutting and fabric stock',()=>{
  const project=makeProject();project.base.includeInCutList=false;
  const piece=makePiece([{x:10,y:10},{x:30,y:10}],'','平针');piece.stitch={...defaultStitch};project.pieces.push(piece);
  expect(cloneDocument(project).pieces[0].stitch).toEqual(defaultStitch);
  expect(hitTest({x:20,y:12},project.pieces,3)).toBe(piece.id);
  expect(hitTest({x:20,y:14},project.pieces,3)).toBe(null);
  expect(cutList(project)).toEqual([]);
  expect(exportIssues(project)).toEqual([]);
  expect(computeProjectMaterialRequirements(project,[])).toEqual([]);
 });
});

describe('base fabric in PDF',()=>{
 it('omits the fabric background and reports exclusion when no base is selected',async()=>{
  const project=makeProject();project.base.materialId='';project.base.includeInCutList=true;
  const text=await buildPatternPdf(project).text();
  expect(text).not.toContain('0.92 0.88 0.82 rg');
  expect(text).toContain('Base: excluded');
 });
});
