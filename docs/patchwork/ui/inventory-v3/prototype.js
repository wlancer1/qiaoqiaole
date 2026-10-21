const projectIcons = {
  back: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-left icon" aria-hidden="true"><path d="m12 19-7-7 7-7"></path><path d="M19 12H5"></path></svg>',
  plus: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-plus icon" aria-hidden="true"><path d="M5 12h14"></path><path d="M12 5v14"></path></svg>',
  search: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search icon" aria-hidden="true"><path d="m21 21-4.34-4.34"></path><circle cx="11" cy="11" r="8"></circle></svg>',
  close: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x icon" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>',
  box: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-package icon" aria-hidden="true"><path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"></path><path d="M12 22V12"></path><polyline points="3.29 7 12 12 20.71 7"></polyline><path d="m7.5 4.27 9 5.15"></path></svg>',
  check: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check icon" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>',
  warn: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-triangle-alert icon" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg>',
  home: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-house icon" aria-hidden="true"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"></path><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg>',
  user: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-user-round icon" aria-hidden="true"><circle cx="12" cy="8" r="5"></circle><path d="M20 21a8 8 0 0 0-16 0"></path></svg>',
  scissors: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-scissors icon" aria-hidden="true"><circle cx="6" cy="6" r="3"></circle><path d="M8.12 8.12 12 12"></path><path d="M20 4 8.12 15.88"></path><circle cx="6" cy="18" r="3"></circle><path d="M14.8 14.8 20 20"></path></svg>',
  undo: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-undo-2 icon" aria-hidden="true"><path d="M9 14 4 9l5-5"></path><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"></path></svg>',
  redo: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-redo-2 icon" aria-hidden="true"><path d="m15 14 5-5-5-5"></path><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13"></path></svg>',
  layers: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-layers icon" aria-hidden="true"><path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"></path><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"></path><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"></path></svg>',
  upload: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-upload icon" aria-hidden="true"><path d="M12 3v12"></path><path d="m17 8-5-5-5 5"></path><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path></svg>',
  image: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-image icon" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"></rect><circle cx="9" cy="9" r="2"></circle><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"></path></svg>',
  next: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right icon" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg>',
  settings: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-settings icon" aria-hidden="true"><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"></path><circle cx="12" cy="12" r="3"></circle></svg>',
  message: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-message-circle icon" aria-hidden="true"><path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"></path></svg>',
  compass: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-compass icon" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z"></path></svg>',
  pointer: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-mouse-pointer-2 icon" aria-hidden="true"><path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z"></path></svg>',
  brush: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-paintbrush icon" aria-hidden="true"><path d="m14.622 17.897-10.68-2.913"></path><path d="M18.376 2.622a1 1 0 1 1 3.002 3.002L17.36 9.643a.5.5 0 0 0 0 .707l.944.944a2.41 2.41 0 0 1 0 3.408l-.944.944a.5.5 0 0 1-.707 0L8.354 7.348a.5.5 0 0 1 0-.707l.944-.944a2.41 2.41 0 0 1 3.408 0l.944.944a.5.5 0 0 0 .707 0z"></path><path d="M9 8c-1.804 2.71-3.97 3.46-6.583 3.948a.507.507 0 0 0-.302.819l7.32 8.883a1 1 0 0 0 1.185.204C12.735 20.405 16 16.792 16 15"></path></svg>',
  palette: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-palette icon" aria-hidden="true"><path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z"></path><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"></circle><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"></circle><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"></circle><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"></circle></svg>',
  trash: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2 icon" aria-hidden="true"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>'
};
const I = n => projectIcons[n] || projectIcons.box;
const textures = ['rose-floral', 'sage-leaves', 'blue-gingham', 'linen-cream', 'lavender-sprig', 'navy-dots', 'coral-grid', 'marigold'];
/* [名称, 可用面积文案, 筛选状态, 规格/批次副文案, 右上角标签, 标签样式] */
const fabrics = [
  ['玫粉亚麻', '8,000 cm²', '有库存', '80×75 cm 等 2 批 · 棉布', '2 批', ''],
  ['鼠尾草绿', '12,000 cm²', '有库存', '120×100 cm · 1 块整布', '整布', ''],
  ['蓝色格纹', '400 cm² · 库存偏低', '库存不足', '20×20 cm · 1 块余料', '偏低', 'warn'],
  ['奶油亚麻', '已有 · 数量待核实', '有库存', '仅登记拥有 · 待量尺寸', '待核实', 'unknown'],
  ['淡紫条纹', '6,000 cm²', '有库存', '100×60 cm · 1 块整布', '整布', ''],
  ['藏蓝波点', '9,000 cm²', '有库存', '100×90 cm · 1 块整布', '整布', ''],
  ['珊瑚格纹', '4,500 cm²', '有库存', '75×60 cm · 1 块整布', '整布', ''],
  ['姜黄格纹', '已用完 · 0 cm²', '已用完', '上次用于郁金香拼布', '已用完', 'empty']
];
const img = (i, cl = 'swatch') => '<img class="' + cl + '" src="./assets/' + textures[i] + '.svg" alt="' + fabrics[i][0] + '布料纹理">';
const go = (id, text, cls = '', attrs = '') => '<a class="' + cls + '" href="#' + id + '" data-go="' + id + '" ' + attrs + '>' + text + '</a>';
const btn = (text, cls, attrs = '') => '<button type="button" class="' + cls + '" ' + attrs + '>' + text + '</button>';
const status = '<div class="status"><span>9:41</span><span aria-hidden="true">▮▮▮ &nbsp; ◉ &nbsp; ▰</span></div>';
const head = (t, b = 'warehouse', action = '') =>
  '<header class="head">' + go(b, I('back'), 'icbtn edge', 'aria-label="返回"') + '<strong>' + t + '</strong>' + (action || '<span class="edge"></span>') + '</header>';
const foot = (text, id, note = '') =>
  '<footer class="foot">' + go(id, text, 'primary full') + (note ? '<p>' + note + '</p>' : '') + '</footer>';
const search = (placeholder = '搜索布料名称', scope = '') =>
  '<label class="search">' + I('search') + '<input type="search" aria-label="' + placeholder + '" placeholder="' + placeholder + '" data-search="' + scope + '"></label>';
const nav =
  '<nav class="bottom-tabs" aria-label="底部导航">' +
  btn(I('home') + '<span>首页</span>', '', 'data-toast="沿用项目首页"') +
  btn(I('compass') + '<span>发现</span>', '', 'data-toast="沿用项目发现页"') +
  btn(I('plus'), 'plus-tab', 'data-go="editor" aria-label="创建"') +
  btn(I('message') + '<span>消息</span>', '', 'data-toast="沿用项目消息页"') +
  btn(I('user') + '<span>我的</span>', 'active', 'data-go="profile"') +
  '</nav>';
const notice = (text, kind = '') =>
  '<div class="notice ' + kind + '">' + I(kind === 'danger' ? 'warn' : 'box') + '<span>' + text + '</span></div>';

const tile = (i, pick = false) => {
  if (pick) {
    return (
      '<button type="button" class="tile ' +
      (i === 0 ? 'active' : '') +
      '" data-name="' +
      fabrics[i][0] +
      '" data-stock="' +
      fabrics[i][2] +
      '" data-pick="' +
      i +
      '">' +
      '<span class="pw-card-sw">' +
      img(i) +
      '<span class="pw-check-badge">' +
      I('check') +
      '</span></span>' +
      '<b>' +
      fabrics[i][0] +
      '</b><small class="' +
      (i === 2 ? 'red' : '') +
      '">' +
      fabrics[i][1] +
      '</small></button>'
    );
  }
  return (
    '<button type="button" class="tile ' +
    (i === 7 ? 'used ' : '') +
    '" data-name="' +
    fabrics[i][0] +
    '" data-stock="' +
    fabrics[i][2] +
    '" data-go="detail">' +
    '<span class="tile-thumb">' +
    img(i) +
    (fabrics[i][4] ? '<span class="tile-tag ' + fabrics[i][5] + '">' + fabrics[i][4] + '</span>' : '') +
    '</span>' +
    '<b>' +
    fabrics[i][0] +
    '</b><small class="' +
    (i === 2 ? 'red' : '') +
    '">' +
    fabrics[i][1] +
    '</small><small class="tile-spec">' +
    fabrics[i][3] +
    '</small></button>'
  );
};

const chips = scope =>
  '<div class="chips" data-filters="' +
  scope +
  '">' +
  ['全部', '有库存', '库存不足', '已用完']
    .map((x, i) => btn(x, 'chip ' + (!i ? 'on' : ''), 'data-filter="' + x + '" aria-pressed="' + !i + '"'))
    .join('') +
  '</div>';

const material = (i, qty, need, formula, state, action = '', showSupply = false) =>
  '<div class="lineitem">' +
  img(i, 'mini') +
  '<div class="desc"><div class="row"><b>' +
  fabrics[i][0] +
  '</b><span class="badge ' +
  (state.includes('缺') || state.includes('不足') ? 'red' : state.includes('核实') ? 'gray' : '') +
  '">' +
  state +
  '</span></div><p>' +
  qty +
  ' 片 · 预计备料 <b>' +
  need +
  ' cm²</b></p><p class="formula">' +
  formula +
  '</p>' +
  (action
    ? '<div class="row" style="margin-top:.1905rem"><span class="tiny red">' +
      action +
      '</span><span class="row-actions">' +
      (showSupply ? go('upload', '补充库存', 'btn-xs ghost') : '') +
      go('replace', '替换布料', 'btn-xs') +
      '</span></div>'
    : '') +
  '</div></div>';

const board = () =>
  '<svg viewBox="0 0 300 300" aria-label="郁金香拼布作品，黄色花瓣缺料"><defs>' +
  [0, 1, 2, 7]
    .map(
      i =>
        '<pattern id="pat-' +
        i +
        '-ID" width="52" height="52" patternUnits="userSpaceOnUse"><image href="./assets/' +
        textures[i] +
        '.svg" width="52" height="52"/></pattern>'
    )
    .join('') +
  '</defs><path d="M20 20h260v260H20Z" fill="#faf7ef"/><path d="M150 254V137" stroke="#6f8a69" stroke-width="8"/><path d="M145 229Q69 224 65 165Q125 169 145 229Z" fill="url(#pat-1-ID)" stroke="#91a78b"/><path d="M154 248Q214 241 239 187Q180 187 154 248Z" fill="url(#pat-1-ID)" stroke="#91a78b"/><path d="M151 163Q80 146 92 65L132 96 150 55 171 96 211 65Q222 149 151 163Z" fill="url(#pat-0-ID)" stroke="#be8f97" stroke-width="1.5"/><path d="M150 55 171 96 211 65Q219 117 196 140L151 163Z" fill="url(#pat-7-ID)" stroke="#cf4352" stroke-width="2.5" stroke-dasharray="5 3"/><g transform="translate(201 79)"><circle r="11" fill="#fff" stroke="#cf4352"/><path d="M0-6v7M0 5h.01" stroke="#cf4352" stroke-width="2"/></g></svg>';

let boardid = 0;
const editor = () => {
  const id = ++boardid;
  return (
    '<div class="pw-editor-shell">' +
    '<header class="pw-topbar">' +
    '<div class="pw-top-left">' +
    go('warehouse', I('back'), 'icbtn', 'aria-label="返回"') +
    btn('<span>20 × 20 cm</span><small>⌄</small>', 'pw-size-pill', 'data-toast="打开底布设置弹窗（含底布纹理选择器）"') +
    '</div>' +
    '<div class="pw-top-mid">' +
    btn(I('undo'), 'pw-undo-btn', 'aria-label="撤销" data-toast="撤销上一步"') +
    btn(I('redo'), 'pw-undo-btn', 'aria-label="重做" data-toast="重做下一步"') +
    '</div>' +
    '<div class="pw-top-right">' +
    go('requirements', I('scissors') + '<span>用料</span>', 'pw-export-pill', 'aria-label="查看用料清单"') +
    btn('保存', 'pw-save-pill', 'data-toast="设计已保存；库存保持不变"') +
    '</div>' +
    '</header>' +
    '<div class="stage">' +
    '<div class="ruler"><span>0</span><span>5</span><span>10</span><span>15</span><span>20 cm</span></div>' +
    '<div class="ruler-v"><span>0</span><span>5</span><span>10</span><span>15</span><span>20</span></div>' +
    '<aside class="pw-rail" aria-label="拼布工具栏">' +
    [
      ['pointer', '选择', true, 'data-toast="选择与移动布片"'],
      ['brush', '画笔', false, 'data-toast="手绘闭合布片"'],
      ['plus', '添加', false, 'data-toast="打开形状库"'],
      ['palette', '填布', false, 'data-go="picker"'],
      ['layers', '图层', false, 'data-toast="打开图层与材料统计"']
    ]
      .map(([ic, label, on, attr]) => btn(I(ic) + '<span>' + label + '</span>', 'pw-rail-btn ' + (on ? 'on' : ''), attr))
      .join('') +
    '<div class="pw-rail-sep"></div>' +
    btn(I('trash') + '<span>清空</span>', 'pw-rail-btn', 'data-toast="清空画布确认"') +
    '</aside>' +
    go('requirements', I('warn') + ' 姜黄格纹缺料 · 查看用料清单', 'warning') +
    '<div class="canvas">' +
    board().replaceAll('ID', id) +
    '</div>' +
    '<div class="zoom">100%</div>' +
    '</div>' +
    '<footer class="pw-materials-bar" aria-label="当前布料条">' +
    btn(I('palette') + '<span>布料</span>', 'pw-fab-open', 'data-go="picker" aria-label="打开布料面板"') +
    '<div class="pw-material-scroll">' +
    [0, 1, 2, 3, 4, 5]
      .map((i, idx) =>
        btn(
          img(i, 'pw-mat-sw') + '<span>' + fabrics[i][0].slice(0, 4) + '</span>',
          'pw-material-item ' + (idx === 0 ? 'on' : ''),
          'data-go="picker" aria-label="选择' + fabrics[i][0] + '"'
        )
      )
      .join('') +
    '</div>' +
    '</footer>' +
    '</div>'
  );
};

const sheet = (title, body, back = 'editor', headActions = '') =>
  '<div class="shade" data-backdrop="' +
  back +
  '"><section class="sheet" role="dialog" aria-modal="true" aria-label="' +
  title +
  '"><div class="handle"></div><div class="sheethead"><strong>' +
  title +
  '</strong><div class="sheethead-actions">' +
  headActions +
  go(back, I('close'), 'icbtn', 'aria-label="关闭面板"') +
  '</div></div>' +
  body +
  '</section></div>';

const warehouseStats =
  '<div class="wh-stats-strip" aria-label="布料库存概览">' +
  '<div class="wh-stat-card"><strong>8 种</strong><span>仓库布料</span></div>' +
  '<div class="wh-stat-card"><strong>3.99 m²</strong><span>可用总面积</span></div>' +
  '<div class="wh-stat-card warn"><strong>2 种</strong><span>偏低 / 用完</span></div>' +
  '</div>';

const screens = [
  [
    'profile',
    '00',
    '我的 · 独立布料仓库入口',
    'EXISTING PROFILE',
    '<section class="profile-page"><header class="profile-hero"><div class="profile-orbit"></div><div><h1>我的</h1><p>管理你的拼豆与拼布世界</p></div></header><section class="profile-account-card"><div class="profile-account-top"><div class="profile-avatar">' +
      I('user') +
      '</div><div class="profile-account-copy"><div class="profile-account-name"><strong>拼布爱好者</strong></div><span>ID 20260729</span></div><button type="button" class="profile-edit-btn">编辑资料</button></div><div class="profile-account-stats">' +
      [
        ['12', '作品'],
        ['28', '获赞'],
        ['8', '关注'],
        ['6', '粉丝']
      ]
        .map(x => '<button type="button"><strong>' + x[0] + '</strong><span>' + x[1] + '</span></button>')
        .join('') +
      '</div></section><button type="button" class="profile-warehouse-card" data-toast="进入豆子仓库（管理 MARD 色号，与布料仓库独立）"><span class="profile-warehouse-icon">' +
      I('layers') +
      '</span><span class="profile-warehouse-copy"><strong>豆子仓库</strong><small>管理 MARD 221 色库存</small><span class="profile-progress-track"><i style="width:42%"></i></span><span class="profile-warehouse-meta"><small>已入库 92 / 221 色</small><small>共 12,800 颗</small></span></span><span class="profile-chevron">›</span></button><button type="button" class="profile-warehouse-card fabric-entry" data-go="warehouse"><span class="profile-warehouse-icon">' +
      I('scissors') +
      '</span><span class="profile-warehouse-copy"><strong>布料仓库</strong><small>管理拼布花色、布块尺寸与余料</small><span class="profile-fabrics">' +
      [0, 1, 2, 3, 4].map(i => img(i, '')).join('') +
      '<small>8 种花色</small></span><span class="profile-warehouse-meta"><small>可用约 3.99 m²</small><small>1 偏低 · 1 用完</small></span></span><span class="profile-chevron">›</span></button><section class="profile-menu-card"><button type="button" class="profile-row" data-toast="沿用项目设置"><span class="profile-row-icon">' +
      I('settings') +
      '</span><span><strong>设置</strong><small>账号、安全与偏好</small></span><em>›</em></button></section><button type="button" class="profile-logout-btn">退出登录</button></section>' +
      nav
  ],
  [
    'warehouse',
    '01',
    '我的布料（独立仓库）',
    'FABRIC INVENTORY',
    head('我的布料', 'profile', go('ledger', '库存流水', 'small')) +
      '<div class="body"><section class="wh-list-intro"><div><strong>布料库存</strong><span>按花色与布块批次管理，拼布时直接取用</span></div><button type="button" class="wh-list-create-btn" data-file>' +
      I('plus') +
      ' 上传布料</button></section>' +
      warehouseStats +
      search('搜索布料名称或材质', 'warehouse') +
      chips('warehouse') +
      '<div class="row small" style="margin-bottom:.3175rem"><span class="muted">共 8 种花色</span><span class="muted">按最近使用 ↓</span></div><div class="fgrid">' +
      fabrics.map((_, i) => tile(i)).join('') +
      '</div></div>'
  ],
  [
    'upload',
    '02',
    '上传布料与批次录入',
    'ADD FABRIC',
    head('添加布料', 'warehouse') +
      '<form class="body" id="upload-form"><div class="preview">' +
      img(0) +
      '<div class="crop"></div><button type="button" data-file>更换照片</button></div><p class="tiny muted" style="margin-top:.22rem">拖动裁剪框截取平整纹样，用于画布无缝平铺</p><label class="formlabel" for="fabric-name">布料名称 <span class="red">*</span></label><input id="fabric-name" class="field" value="玫粉亚麻" required maxlength="30">' +
      '<div class="fieldrow two" style="margin-top:.381rem"><label>材质分类<select class="select" id="fabric-category"><option>棉布</option><option selected>亚麻</option><option>格纹</option><option>条纹</option><option>波点</option><option>其他</option></select></label><label>识别主色（可改）<span class="color-row"><input type="color" value="#d98b99" aria-label="布料主色值"><span>#D98B99</span></span></label></div>' +
      '<label class="formlabel" for="stock-mode">首笔库存记录方式</label><select class="field" id="stock-mode"><option value="size">按布块尺寸（推荐整块布）</option><option value="area">按总面积（适合不规则余布）</option><option value="own">仅记录拥有（暂不量尺寸）</option></select><div id="size-fields"><div class="fieldrow" style="margin-top:.3175rem"><label>长度 / cm<input class="field" type="number" value="80" min="0.1" step=".1"></label><label>宽度 / cm<input class="field" type="number" value="75" min="0.1" step=".1"></label><label>块数<input class="field" type="number" value="1" min="1" step="1"></label></div><p class="small muted" style="margin-top:.3175rem">本批次可用面积 <b style="color:var(--ink)">6,000 cm²</b>（保存后可在详情继续追加余布批次）</p></div><div id="area-fields" hidden><label class="formlabel">可用总面积 / cm²</label><input class="field" type="number" value="6000" min="1"></div><p id="own-fields" class="notice" hidden>仅记录拥有，设计时可正常选布填充，裁剪前再核实数量。</p><label class="formlabel" for="memo">备注 <span class="muted">选填</span></label><input class="field" id="memo" placeholder="购买店铺、缩水率或布料手感"></form><footer class="foot"><button class="primary full" type="submit" form="upload-form">保存到我的布料</button></footer>'
  ],
  [
    'detail',
    '03',
    '布料详情与分批库存',
    'FABRIC DETAILS',
    head('布料详情', 'warehouse', btn('编辑信息', 'blue', 'data-go="upload"')) +
      '<div class="body"><div class="stockhero">' +
      img(0) +
      '<div><h3>玫粉亚麻</h3><span class="badge">有库存 · 亚麻 · #D98B99</span><p style="margin-top:.254rem"><strong>8,000</strong> <small>cm² 可用（共 2 批）</small></p></div></div><div class="chips"><button type="button" class="chip on">库存批次 (2)</button>' +
      btn('消耗流水 (3)', 'chip', 'data-go="ledger"') +
      '</div><div class="row"><h3 class="small">分批库存明细</h3>' +
      go('upload', '＋ 新增批次', 'btn-xs') +
      '</div><div class="box" style="margin-top:.3175rem"><div class="row"><b class="small">批次 01 · 整块布</b><span class="badge">整块 · 可直接排料</span></div><p class="small muted" style="margin-top:.1905rem">尺寸规格：80 × 75 cm · 1 块</p><div class="metric"><span>当前可用面积</span><b>6,000 cm²</b></div></div><div class="box"><div class="row"><b class="small">批次 02 · 裁剪余布</b><span class="badge gray">余料 · 仅面积</span></div><p class="small muted" style="margin-top:.1905rem">来源：上次制作后登记入库</p><div class="metric"><span>剩余可用面积</span><b>2,000 cm²</b></div><p class="tiny muted" style="margin-top:.1905rem">不规则余料未记录长宽，大裁片请优先核对实物形状。</p></div>' +
      notice('同一花色按实际布块分批管理，避免把多块碎布误算成一整块大布。') +
      '<h3 class="section">最近使用作品</h3><div class="lineitem">' +
      I('scissors') +
      '<div class="desc"><b>郁金香拼布</b><p>2026/10/19 · 批次 01 消耗 2,600 cm²</p></div>' +
      go('ledger', I('next'), '', 'aria-label="查看裁剪记录"') +
      '</div></div>' +
      '<footer class="foot"><div class="foot-dual">' +
      go('upload', '＋ 新增批次', 'secondary') +
      go('editor', '用于拼布设计', 'primary') +
      '</div></footer>'
  ],
  [
    'picker',
    '04',
    '统一布料选择器',
    'FABRIC PICKER',
    editor() +
      sheet(
        '选择布料',
        '<div class="row small" style="margin-bottom:.1905rem"><span class="muted">当前目标：<b style="color:var(--ink)">所选布片（右侧花瓣）</b></span><span class="blue">点选即填充</span></div>' +
          search('搜索我的可用布料', 'picker') +
          '<div class="pgrid">' +
          [0, 1, 2, 3, 4, 5, 6].map(i => tile(i, true)).join('') +
          '</div><p class="sheetnote">已自动隐藏「已用完」布料；库存偏低与数量待核实仍可先用于设计。</p>',
        'editor',
        btn('+ 上传新布', 'pw-sheet-btn', 'data-file') + btn('管理仓库', 'pw-sheet-btn', 'data-go="warehouse"')
      )
  ],
  ['editor', '05', '画布缺料提示', 'EDITOR / MISSING', editor()],
  [
    'requirements',
    '06',
    '项目用料清单',
    'MATERIAL REQUIREMENTS',
    head('用料清单', 'editor') +
      '<div class="body">' +
      notice('1 种缺料，1 种库存不足。可点击「补充库存」或「替换布料」，也可先仅扣减已就绪材料。', 'danger') +
      '<div class="row small"><span class="muted">郁金香拼布 · 底布 20 × 20 cm</span><span class="badge gray">设计稿 · 未裁剪</span></div><div class="box" style="margin-top:.381rem"><div class="row small"><span>统一缝份宽度</span><b>5 mm（按偏移轮廓计算）</b></div><div class="row small"><label for="waste">预计排版损耗率</label><select class="select" style="width:3.2rem" id="waste"><option value="0.15">15%</option><option value="0.1">10%</option><option value="0">0%</option></select></div><label class="row small" style="margin-top:.254rem"><span>计入底布用量（20 × 20 cm = 400 cm²）</span><input type="checkbox" id="backing" style="accent-color:var(--blue)"></label></div>' +
      material(0, 8, '2,645', '净面积 2,000 + 缝份 300 + 损耗 345 cm² · 库存 8,000 cm²', '库存充足') +
      material(1, 5, '1,600', '净面积 1,210 + 缝份 181 + 损耗 209 cm² · 库存 12,000 cm²', '库存充足') +
      material(7, 3, '900', '净面积 680 + 缝份 103 + 损耗 117 cm² · 原作花色未绑库', '原作待配布', '无同款库存 · 可用相近布替换', true) +
      material(2, 2, '600', '净面积 450 + 缝份 72 + 损耗 78 cm² · 库存 400 cm²', '库存不足', '差 200 cm²', true) +
      '<div class="lineitem"><span class="mini" style="background:#f1f2f2;display:grid;place-items:center">?</span><div class="desc"><b>未指定布料</b><p>2 片 · 净面积 320 cm²（待绑定布料后计入）</p></div>' +
      go('picker', '去选布', 'btn-xs') +
      '</div><div class="metric" style="margin-top:.254rem"><span class="muted">已指定布料预计备料合计</span><b id="total-estimate">5,745 cm²</b></div></div><footer class="foot"><button type="button" class="primary full" data-go="cutting">已裁剪，去核对扣减库存</button><p>仅保存设计不会扣减库存；实际裁剪后再确认扣库</p></footer>'
  ],
  [
    'replace',
    '07',
    '他作配布与缺料替换',
    'SMART MATCH & REPLACE',
    editor() +
      sheet(
        '配布与替换布料',
        '<div class="lineitem">' +
          img(7, 'mini') +
          '<div class="desc"><div class="row"><b>原作：姜黄格纹</b><span class="badge red">无同款 · 需 900 cm²</span></div><p>来自设计师图纸（主色 #E2A84B · 共 3 片使用）</p></div></div>' +
          '<div class="row" style="margin-top:.381rem"><h3 class="section" style="margin:0">推荐我的相近布料（库存够裁）</h3>' +
          go('picker', '全部布料 →', 'small') +
          '</div>' +
          '<div class="lineitem">' +
          img(6, 'mini') +
          '<div class="desc"><div class="row"><b>珊瑚格纹</b><span class="badge">同类格纹 · 4,500 cm²</span></div><p>色系相近 · 裁完 3 片后预计仍余 3,600 cm²</p></div>' +
          btn('选用', 'btn-xs', 'data-replace') +
          '</div>' +
          '<div class="lineitem">' +
          img(0, 'mini') +
          '<div class="desc"><div class="row"><b>玫粉亚麻</b><span class="badge">暖色百搭 · 8,000 cm²</span></div><p>扣去本作品已有用量后仍余 5,355 cm²</p></div>' +
          btn('选用', 'btn-xs ghost', 'data-replace') +
          '</div>' +
          '<div class="row" style="margin-top:.3175rem">' +
          btn(I('plus') + ' 拍照上传手头新布并替换', 'secondary full', 'data-file') +
          '</div>' +
          '<fieldset style="border:0;padding:0;margin:0"><legend class="section">替换范围</legend><div class="options"><label class="option"><input name="scope" type="radio" value="one"><span>仅当前选中的 1 个布片（局部撞色）</span></label><label class="option"><input name="scope" type="radio" value="all" checked><span>作品中全部使用该布料的布片（共 3 片一键换色）</span></label></div></fieldset>' +
          btn('确认用所选布料替换', 'primary full', 'data-replace') +
          '<p class="sheetnote">支持画布撤销对比效果；也可暂不替换，直接导出原图纸纸样。</p>',
        'requirements'
      )
  ],
  [
    'cutting',
    '08',
    '裁剪确认与实际扣库',
    'CONFIRM CUTTING',
    head('核对实际裁剪', 'requirements') +
      '<div class="body">' +
      notice('请按实际剪下的耗料核对批次与面积。本次仅扣减下方 2 种已就绪布料。') +
      '<div class="box"><div class="row"><b class="small">1. 玫粉亚麻（8 片）</b><span class="tiny muted">预计备料 2,645 cm²</span></div><label class="formlabel" for="lot">扣减库存批次</label><select id="lot" class="select"><option>批次 01 · 整块布 (80×75 cm) · 可用 6,000 cm²</option><option>批次 02 · 余料 · 可用 2,000 cm²</option></select><div class="actual"><label for="actual">实际消耗面积</label><input id="actual" class="field" type="number" min="1" value="2600"><span class="small">cm²</span></div><div id="stock-result" class="tiny muted" style="margin-top:.22rem">本批次扣减后剩余 3,400 cm²</div></div>' +
      '<div class="box"><div class="row"><b class="small">2. 鼠尾草绿（5 片）</b><span class="tiny muted">预计备料 1,600 cm²</span></div><label class="formlabel" for="lot-sage">扣减库存批次</label><select id="lot-sage" class="select"><option>批次 01 · 整块布 (120×100 cm) · 可用 12,000 cm²</option></select><div class="actual"><label for="actual-sage">实际消耗面积</label><input id="actual-sage" class="field" type="number" min="1" value="1600"><span class="small">cm²</span></div><div class="tiny muted" style="margin-top:.22rem">本批次扣减后剩余 10,400 cm²</div></div>' +
      '<h3 class="section">本次暂不扣减（3 项未就绪）</h3><div class="box"><div class="row small"><span>姜黄格纹 · 3 片</span><span class="red">缺料（0 cm²）</span></div><div class="row small"><span>蓝色格纹 · 2 片</span><span class="red">库存差 200 cm²</span></div><div class="row small"><span>未指定布料 · 2 片</span><span class="muted">待选布</span></div>' +
      go('requirements', '返回用料清单先处理 →', 'small') +
      '</div><label class="option"><input type="checkbox" id="ack"><span>我已知晓未就绪材料本次不扣减，仅记录上述 2 种布料的实际裁剪消耗。</span></label></div><footer class="foot"><button type="button" id="confirm-cut" class="primary full" disabled>确认扣减 2 种布料库存</button><p>携带唯一 operationId 事务提交，防止重复扣减</p></footer>'
  ],
  [
    'ledger',
    '09',
    '扣库结果与库存流水',
    'CONSUMPTION RECORD',
    head('库存扣减记录', 'requirements') +
      '<div class="body"><div class="success"><span class="successmark">' +
      I('check') +
      '</span><h3>本次裁剪消耗已入账</h3><p class="small muted">作品状态：裁剪制作中（部分材料待补）</p></div>' +
      notice('已生成 2 笔正式扣减流水；未处理的 3 项材料仍保留在用料清单中。', 'ok') +
      '<div class="box"><div class="row small"><b>玫粉亚麻 · 批次 01（整块布）</b><b class="red">−2,600 cm²</b></div><div class="metric muted"><span>变动前 6,000 cm²</span><span>批次结余 3,400 cm²</span></div><div class="divider"></div><div class="row small"><b>鼠尾草绿 · 批次 01（整块布）</b><b class="red">−1,600 cm²</b></div><div class="metric muted"><span>变动前 12,000 cm²</span><span>批次结余 10,400 cm²</span></div></div><div class="metric muted"><span>关联作品</span><span>郁金香拼布 (rev-12)</span></div><div class="metric muted"><span>流水单号</span><span>OP-20261019-1620</span></div><div class="metric muted"><span>操作类型</span><span>实际裁剪确认扣减</span></div><div class="divider"></div><p class="small muted">若刚才数量填错，或裁剪后产生了规整余布，可通过下方入口发起更正或余布入库：</p><div style="margin-top:.254rem">' +
      go('reversal', '申请冲正 / 登记余布批次 →', 'btn-xs') +
      '</div></div>' +
      foot('返回用料清单处理剩余项', 'requirements', '后续继续修改保存作品不会重复扣减本笔流水')
  ],
  [
    'empty',
    '10',
    '空仓库与首次上传',
    'EMPTY INVENTORY',
    head('我的布料', 'profile') +
      '<div class="body"><section class="wh-list-intro"><div><strong>布料库存</strong><span>你的专属拼布布料柜，与拼豆仓库完全独立</span></div><button type="button" class="wh-list-create-btn" data-file>' +
      I('plus') +
      ' 上传布料</button></section><div class="fabric-empty-card"><span class="empty-icon">' +
      I('scissors') +
      '</span><h3>还没有收录布料</h3><p>把手头拥有的棉布、亚麻和碎布拍照上传，拼布设计时点选即可真实预览并自动核算用量。</p>' +
      btn(I('plus') + ' 上传第一块布料', 'primary', 'data-file') +
      '<p class="tiny">支持手机拍照、相册选取（JPG / PNG / WebP）</p></div></div>'
  ],
  [
    'errors',
    '11',
    '异常与边界保护',
    'ERROR STATES',
    head('需要核实的异常项', 'requirements') +
      '<div class="body">' +
      notice('以下情况不会用猜测面积自动扣减库存，需人工确认后再处理。') +
      '<div class="box"><h3 class="small">1. 仅记录拥有，未填数量</h3><div class="lineitem">' +
      img(3, 'mini') +
      '<div class="desc"><b>奶油亚麻</b><p>当前状态为「数量待核实」，无法自动判断是否够裁</p></div></div>' +
      go('upload', '去补充尺寸或面积', 'secondary full') +
      '</div><div class="box"><h3 class="small">2. 布片几何轮廓异常</h3><p class="small muted" style="margin:.254rem 0">布片 #07 存在未闭合或自交边线，缝份偏移计算已中止，禁止用错误面积扣库。</p>' +
      go('editor', '返回画布检查布片 #07', 'secondary full') +
      '</div><div class="box"><h3 class="small">3. 网络超时幂等保护</h3><p class="small muted" style="margin:.254rem 0">上次扣减请求超时（operationId: OP-1620），正在向服务端核对流水状态，请勿重复扣减。</p>' +
      btn('查询该笔流水结果', 'secondary full', 'data-go="ledger"') +
      '</div><div class="box"><h3 class="small">4. 仓库读取失败（非空仓库）</h3><p class="small muted" style="margin:.254rem 0">网络异常导致布料列表加载失败，不展示空仓库误导，点击可重试。</p>' +
      btn('重新加载我的布料', 'secondary full', 'data-go="warehouse"') +
      '</div></div>'
  ],
  [
    'reversal',
    '12',
    '冲正流水与余料入库',
    'REVERSE / RETURN',
    head('更正裁剪记录', 'ledger') +
      '<div class="body">' +
      notice('历史库存流水不可直接篡改。请根据实物是否已剪开，选择对应处理方式：') +
      '<fieldset style="border:0;padding:0"><legend class="section">实物布料当前状态</legend><label class="option"><input type="radio" name="return-kind" value="mistake" checked><span><b>录入错误，实物并未裁剪</b><br><span class="tiny muted">生成一笔 +2,600 / +1,600 cm² 反向冲正流水，恢复原整块布批次余额</span></span></label><label class="option"><input type="radio" name="return-kind" value="remnant"><span><b>实物已裁剪，需登记剩余碎布</b><br><span class="tiny muted">保留原消耗记录，不把碎布退回原整块布，而是新增「余料批次」入库</span></span></label></fieldset><div class="box" style="margin-top:.4444rem"><h3 class="small">原流水明细（OP-20261019-1620）</h3><div class="metric"><span>玫粉亚麻 · 批次 01</span><span>−2,600 cm²</span></div><div class="metric"><span>鼠尾草绿 · 批次 01</span><span>−1,600 cm²</span></div></div><label class="formlabel" for="reason">冲正原因说明 <span class="red">*</span></label><textarea class="field" id="reason" style="height:2.6rem;resize:vertical" placeholder="例如：误选了批次 01，实际尚未开剪"></textarea><p class="tiny muted" style="margin-top:.254rem">同一笔流水仅允许冲正一次，服务端校验流水状态。</p></div><footer class="foot"><button type="button" class="primary full" data-correction>确认提交处理</button></footer>'
  ]
];

const app = document.querySelector('#screens');
app.innerHTML = screens
  .map(
    ([id, no, title, en, body]) =>
      '<article id="' +
      id +
      '" class="art"><div class="label"><b>' +
      no +
      ' / ' +
      title +
      '</b><span>' +
      en +
      '</span></div><div class="device">' +
      status +
      body +
      '</div></article>'
  )
  .join('');

document.querySelector('#jumps').innerHTML = screens.map(([id, no, title]) => go(id, no + ' ' + title)).join('');
document.querySelector('#desktop-content').innerHTML =
  '<div class="row"><div><p class="eyebrow">我的 / 布料仓库（独立模块）</p><h3>我的布料</h3><p class="small muted" style="margin-top:.254rem">8 种花色 · 可用约 3.99 m² · 按整布与余料分批管理</p></div>' +
  btn(I('plus') + ' 上传布料', 'primary', 'data-file') +
  '</div>' +
  search('搜索布料名称或材质', 'desktop') +
  chips('desktop') +
  '<div class="fgrid">' +
  fabrics.map((_, i) => tile(i)).join('') +
  '</div>';

const toast = t => {
  const e = document.querySelector('#toast');
  e.textContent = t;
  e.style.display = 'block';
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => (e.style.display = 'none'), 2600);
};

function navigate(id) {
  if (!document.getElementById(id)) return;
  history.pushState(null, '', '#' + id);
  renderHash();
  document.getElementById(id).scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderHash() {
  const id = location.hash.slice(1);
  document.querySelectorAll('.art').forEach(e => e.classList.toggle('show', e.id === id));
  if (document.body.classList.contains('solo') && !screens.some(s => s[0] === id)) navigate('warehouse');
}

document.addEventListener('click', e => {
  if (e.target.matches('.shade[data-backdrop]')) {
    navigate(e.target.dataset.backdrop || 'editor');
    return;
  }
  const a = e.target.closest('[data-go]');
  if (a) {
    e.preventDefault();
    navigate(a.dataset.go);
    return;
  }
  const t = e.target.closest('[data-toast]');
  if (t) {
    toast(t.dataset.toast);
    return;
  }
  const f = e.target.closest('[data-file]');
  if (f) {
    document.getElementById('file').click();
    return;
  }
  const pick = e.target.closest('[data-pick]');
  if (pick) {
    document.querySelectorAll('#picker .tile').forEach(t => t.classList.remove('active'));
    pick.classList.add('active');
    toast('已填充 ' + fabrics[Number(pick.dataset.pick)][0] + ' · 可通过画布撤销');
    navigate('editor');
    return;
  }
  if (e.target.closest('[data-replace]')) {
    toast('已替换所选范围 · 库存保持不变');
    navigate('editor');
    return;
  }
  const filter = e.target.closest('[data-filter]');
  if (filter) {
    const scope = filter.closest('[data-filters]');
    scope.querySelectorAll('button').forEach(b => {
      b.classList.toggle('on', b === filter);
      b.setAttribute('aria-pressed', b === filter);
    });
    filterTiles(scope.closest('.body') || scope.parentElement);
    return;
  }
  if (e.target.closest('#confirm-cut')) {
    const btnEl = e.target.closest('#confirm-cut');
    btnEl.disabled = true;
    btnEl.textContent = '正在提交…';
    setTimeout(() => {
      navigate('ledger');
      btnEl.textContent = '本次已记录';
      toast('演示：已记录本次确认的 2 种布料');
    }, 500);
  }
  if (e.target.closest('[data-correction]')) {
    if (document.querySelector('[name="return-kind"]:checked').value === 'remnant') {
      navigate('upload');
      toast('将真实余料作为新批次录入');
    } else if (!document.querySelector('#reason').value.trim()) {
      document.querySelector('#reason').focus();
      toast('请填写更正原因');
    } else {
      toast('演示：已创建反向流水，原记录保留');
      navigate('ledger');
    }
  }
});

function filterTiles(scope) {
  const q = (scope.querySelector('[data-search]')?.value || '').trim();
  const filter = scope.querySelector('.chip.on')?.dataset.filter || '全部';
  scope.querySelectorAll('.tile[data-name]').forEach(t => {
    t.hidden = !(t.dataset.name.includes(q) && (filter === '全部' || t.dataset.stock === filter));
    t.style.display = t.hidden ? 'none' : '';
  });
}

document.addEventListener('input', e => {
  if (e.target.matches('[data-search]'))
    filterTiles(e.target.closest('.body') || e.target.closest('.sheet') || e.target.closest('.deskcontent'));
  if (e.target.id === 'actual') checkStock();
});

function checkStock() {
  const available = document.getElementById('lot').selectedIndex === 0 ? 6000 : 2000;
  const used = Number(document.getElementById('actual').value);
  const valid = used > 0 && used <= available;
  const result = document.querySelector('#stock-result');
  result.textContent = valid
    ? '本批次扣减后剩余 ' + (available - used).toLocaleString() + ' cm²'
    : '消耗量超出本批次可用面积，请调整用量或切换批次';
  result.classList.toggle('red', !valid);
  document.querySelector('#confirm-cut').disabled = !valid || !document.querySelector('#ack').checked;
}

document.addEventListener('change', e => {
  if (['lot', 'ack'].includes(e.target.id)) checkStock();
  if (e.target.id === 'stock-mode') {
    for (const [id, val] of [
      ['size-fields', 'size'],
      ['area-fields', 'area'],
      ['own-fields', 'own']
    ]) {
      document.getElementById(id).hidden = e.target.value !== val;
    }
  }
  if (['waste', 'backing'].includes(e.target.id)) {
    const cut = 4995.652173913;
    const amount =
      Math.round(cut * (1 + Number(document.getElementById('waste').value))) +
      (document.getElementById('backing').checked ? 400 : 0);
    document.getElementById('total-estimate').textContent = amount.toLocaleString() + ' cm²';
    toast('演示：已更新预计总用量');
  }
});

document.getElementById('file').addEventListener('change', e => {
  if (!e.target.files.length) return;
  const file = e.target.files[0];
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    toast('请选择 JPG、PNG 或 WebP 图片');
    return;
  }
  const image = document.querySelector('#upload .preview img');
  if (image.dataset.objectUrl) URL.revokeObjectURL(image.dataset.objectUrl);
  const url = URL.createObjectURL(file);
  image.src = url;
  image.dataset.objectUrl = url;
  navigate('upload');
});

document.getElementById('upload-form').addEventListener('submit', e => {
  e.preventDefault();
  toast('演示：布料信息已保存，未连接真实仓库');
  navigate('warehouse');
});

document.querySelector('#toggle').addEventListener('click', () => {
  document.body.classList.toggle('solo');
  renderHash();
  document.querySelector('#toggle').textContent = document.body.classList.contains('solo') ? '查看全部设计稿' : '单屏交互预览';
});

document.querySelector('#overview').addEventListener('click', () => {
  document.body.classList.remove('solo');
  document.querySelector('#toggle').textContent = '单屏交互预览';
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && ['picker', 'replace'].includes(location.hash.slice(1))) navigate('editor');
});

window.addEventListener('popstate', renderHash);
window.addEventListener('hashchange', renderHash);
renderHash();
