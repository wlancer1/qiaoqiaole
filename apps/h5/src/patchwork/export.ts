import { area, exportIssues, pointBounds, type PatchworkProject, type Piece, type Point } from './model';

export function cutList(project: PatchworkProject, includeHidden = true) {
  return project.pieces.filter((p) => includeHidden || p.visible).map((p, index) => ({
    index: index + 1, id: p.id, name: p.name, materialId: p.materialId, bounds: pointBounds(p.points), areaMm2: area(p.points), seamMm: p.seamMm,
  }));
}
export function outwardOffset(points: Point[], mm: number): Point[] {
  if (!mm) return points;
  const signed = points.reduce((a,p,i) => { const q=points[(i+1)%points.length]; return a+p.x*q.y-q.x*p.y; },0);
  const sign = signed >= 0 ? 1 : -1;
  const edges = points.map((p,i) => { const next=points[(i+1)%points.length],dx=next.x-p.x,dy=next.y-p.y,l=Math.hypot(dx,dy); if(l<1e-6) throw new Error('重合的路径节点无法计算缝份'); return { p:{x:p.x+sign*mm*dy/l,y:p.y-sign*mm*dx/l}, d:{x:dx,y:dy} }; });
  return edges.map((e,i) => {
    const prev=edges[(i+edges.length-1)%edges.length]; const d=e.d, v=prev.d;
    const det=v.x*d.y-v.y*d.x;
    if(Math.abs(det)<1e-8) return {x:e.p.x,y:e.p.y};
    const w={x:e.p.x-prev.p.x,y:e.p.y-prev.p.y}; const t=(w.x*d.y-w.y*d.x)/det;
    const result={x:prev.p.x+t*v.x,y:prev.p.y+t*v.y};
    if(!Number.isFinite(result.x)||!Number.isFinite(result.y)||Math.hypot(result.x-points[i].x,result.y-points[i].y)>Math.max(10,mm*12)) throw new Error('缝份外扩失败，请修整尖角');
    return result;
  });
}
export function planIssues(project: PatchworkProject) {
  const issues = exportIssues(project);
  if (project.technique === 'turned') for (const p of project.pieces) {
    try { if(p.seamMm>0) outwardOffset(p.points,p.seamMm); } catch {issues.push(`${p.name}：缝份外扩失败`);}
  }
  return issues;
}
const pt = (mm:number) => +(mm*72/25.4).toFixed(6);
const fmt = (n:number) => Number(n.toFixed(4)).toString();
const pdfText = (str:string) => str.replace(/[^\x20-\x7E]/g,'?').replace(/[\\()]/g,(a)=>`\\${a}`);
const rgb = (value:string) => { const n=/^#([0-9a-f]{6})$/i.exec(value)?.[1]||'bbbbbb'; return [0,2,4].map((i)=>fmt(parseInt(n.slice(i,i+2),16)/255)).join(' '); };
const line = (points:Point[], xMm:number,yMm:number, pageHeightMm:number) => points.map((p,i)=>`${fmt(pt(xMm+p.x))} ${fmt(pt(pageHeightMm-yMm-p.y))} ${i?'l':'m'}`).join('\n')+'\nh\n';
function pdfPages(project: PatchworkProject, paper: 'A4'|'Letter', includeHidden: boolean) {
  const pageWidthMm=paper==='A4'?210:215.9,pageHeightMm=paper==='A4'?297:279.4;
  const margin=10, availableW=pageWidthMm-20,availableH=pageHeightMm-70;
  const strideX=availableW-10,strideY=availableH-10;
  const cols=Math.max(1,Math.ceil(Math.max(0,project.widthMm-availableW)/strideX)+1);
  const rows=Math.max(1,Math.ceil(Math.max(0,project.heightMm-availableH)/strideY)+1);
  const paperW=pt(pageWidthMm),paperH=pt(pageHeightMm);
  const selected=project.pieces.filter((p)=>includeHidden||p.visible);
  const materials=new Map(project.materials.map((m)=>[m.id,m]));
  const pages:string[]=[];
  // 总览：整张图缩放仅用于定位；不将这一页当作原尺寸纸样。
  const previewWidth=pageWidthMm-40,previewHeight=pageHeightMm-100;
  const overviewScale=Math.min(previewWidth/project.widthMm,previewHeight/project.heightMm);
  let cover=`BT /F1 17 Tf ${fmt(pt(15))} ${fmt(paperH-pt(20))} Td (PATCHWORK PATTERN / OVERVIEW) Tj ET\n`;
  cover+=`BT /F1 10 Tf ${fmt(pt(15))} ${fmt(paperH-pt(30))} Td (${pdfText(project.name)} - ${project.widthMm} x ${project.heightMm} mm) Tj ET\n`;
  cover+=`BT /F1 9 Tf ${fmt(pt(15))} ${fmt(paperH-pt(38))} Td (Overview not to scale. Print pattern sheets at ACTUAL SIZE / 100%.) Tj ET\n`;
  cover+=`0.92 0.88 0.82 rg ${fmt(pt(15))} ${fmt(pt(pageHeightMm-48-project.heightMm*overviewScale))} ${fmt(pt(project.widthMm*overviewScale))} ${fmt(pt(project.heightMm*overviewScale))} re f\n`;
  for(const piece of selected) {
    const material=materials.get(piece.materialId);
    cover+=`${rgb(material?.color||'#cccccc')} rg 0.35 w\n`+line(piece.points.map((p)=>({x:p.x*overviewScale,y:p.y*overviewScale})),15,48,pageHeightMm)+'f\n';
    cover+=`0.22 0.22 0.22 RG\n`+line(piece.points.map((p)=>({x:p.x*overviewScale,y:p.y*overviewScale})),15,48,pageHeightMm)+'S\n';
  }
  const list=cutList(project,includeHidden);
  cover+=`BT /F1 10 Tf ${fmt(pt(15))} ${fmt(pt(47))} Td (Materials: ${project.materials.length}   Pieces: ${list.length}   Base: ${project.base.includeInCutList?'included':'excluded'}) Tj ET\n`;
  cover+=`0 0 0 RG 0.8 w ${fmt(pt(15))} ${fmt(pt(55))} ${fmt(pt(50))} ${fmt(pt(50))} re S\n`;
  cover+=`BT /F1 9 Tf ${fmt(pt(70))} ${fmt(pt(76))} Td (50 x 50 mm calibration square) Tj ET\n`;
  pages.push(cover);
  const headerMm=60;
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++) {
    const originX=x*strideX,originY=y*strideY;
    let content=`0 0 0 RG 0.5 w\n`;
    // calibration square on every actual-size page, outside printed workpiece area
    content+=`${fmt(pt(margin))} ${fmt(pt(pageHeightMm-margin-50))} ${fmt(pt(50))} ${fmt(pt(50))} re S\n`;
    content+=`BT /F1 9 Tf ${fmt(pt(65))} ${fmt(pt(pageHeightMm-18))} Td (50 x 50 mm TEST SQUARE) Tj ET\n`;
    content+=`BT /F1 10 Tf ${fmt(pt(65))} ${fmt(pt(pageHeightMm-27))} Td (Sheet ${x+1}-${y+1} of ${cols} x ${rows} / 100%) Tj ET\n`;
    content+=`BT /F1 8 Tf ${fmt(pt(65))} ${fmt(pt(pageHeightMm-35))} Td (Do NOT fit to page / Allow 10 mm overlap.) Tj ET\n`;
    // Clip drawing to paper's available rectangle. Vector paths remain exact mm sizes.
    content+=`q ${fmt(pt(margin))} ${fmt(pt(pageHeightMm-headerMm-availableH))} ${fmt(pt(availableW))} ${fmt(pt(availableH))} re W n\n`;
    // translate world board origin to page at (margin - originX, headerMm - originY)
    for(const piece of selected) {
      const color=rgb(materials.get(piece.materialId)?.color||'#ccc');
      const outline=project.technique==='turned'?outwardOffset(piece.points,piece.seamMm):piece.points;
      content+=`${color} rg 0.25 0.25 0.25 RG 0.6 w\n`+line(outline,margin-originX,headerMm-originY,pageHeightMm)+'B\n';
    }
    content+='Q\n';
    // Crosshair registration marks around print area
    for(const [px,py] of [[margin,headerMm],[margin+availableW,headerMm],[margin,headerMm+availableH],[margin+availableW,headerMm+availableH]]) {
      content+=`${fmt(pt(px-2))} ${fmt(pt(pageHeightMm-py))} m ${fmt(pt(px+2))} ${fmt(pt(pageHeightMm-py))} l S\n`;
    }
    pages.push(content);
  }
  return {pages,paperW,paperH};
}
/** 无截图、无 DPI 假设，直接将世界坐标的多边形写入 PDF content streams。 */
export function buildPatternPdf(project: PatchworkProject, paper: 'A4'|'Letter'='A4', includeHidden=true): Blob {
  const issues=planIssues(project);
  if(issues.length) throw new Error(issues.join('；'));
  const {pages,paperW,paperH}=pdfPages(project,paper,includeHidden);
  const objects:string[]=[];
  const add=(s:string) => {objects.push(s);return objects.length;};
  const catalog=add('');const tree=add('');const font=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pageRefs:number[]=[];
  for(const content of pages) {
    // streams use ASCII-only PDF operators; accurate byte offsets supplied below
    const stream=add(`<< /Length ${content.length} >>\nstream\n${content}endstream`);
    pageRefs.push(add(`<< /Type /Page /Parent ${tree} 0 R /MediaBox [0 0 ${fmt(paperW)} ${fmt(paperH)}] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${stream} 0 R >>`));
  }
  objects[catalog-1]=`<< /Type /Catalog /Pages ${tree} 0 R >>`;
  objects[tree-1]=`<< /Type /Pages /Kids [${pageRefs.map((i)=>`${i} 0 R`).join(' ')}] /Count ${pageRefs.length} >>`;
  let content='%PDF-1.4\n%PATCHWORK\n'; const offsets=[0];
  for(let i=0;i<objects.length;i++) {offsets.push(content.length);content+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
  const xrefAt=content.length;
  content+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  for(let i=1;i<offsets.length;i++) content+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;
  content+=`trailer\n<< /Size ${objects.length+1} /Root ${catalog} 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
  return new Blob([content],{type:'application/pdf'});
}
export function downloadBlob(blob:Blob,filename:string) {
  const url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=filename;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function pieceDescription(piece: Piece) { const b=pointBounds(piece.points);return `${piece.name} · ${b.width.toFixed(0)}×${b.height.toFixed(0)}mm`; }
