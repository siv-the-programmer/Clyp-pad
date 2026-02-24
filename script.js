'use strict';
/* ─── UTILS ──────────────────────────────────────────────────── */
var ge=function(id){return document.getElementById(id);};
var uid=function(){return Date.now().toString(36)+Math.random().toString(36).slice(2,6);};
var ts=function(){return Date.now();};
var clamp=function(v,a,b){return Math.max(a,Math.min(b,v));};
var esc=function(s){return String(s||'').replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});};
var ago=function(t){var d=(Date.now()-t)/1000;if(d<60)return 'just now';if(d<3600)return Math.floor(d/60)+'m ago';if(d<86400)return Math.floor(d/3600)+'h ago';return new Date(t).toLocaleDateString(undefined,{month:'short',day:'numeric'});};
var fmtDur=function(s){s=Math.floor(s);return Math.floor(s/60)+':'+(s%60<10?'0':'')+s%60;};
var RH='<svg width="10" height="10" viewBox="0 0 10 10"><path d="M9 1L1 9M5 1L1 5M9 5L5 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

/* ─── DATABASE ───────────────────────────────────────────────── */
var DB_KEY='cpv7';
function newBoard(name){
  var r=uid();
  return{id:r,name:name,root:r,current:r,
    nodes:{},pos:{},views:{},pinned:{}};
}
function initBoard(b){
  if(!b.nodes[b.root])b.nodes[b.root]={id:b.root,type:'folder',name:b.name,parent:null,kids:[],t:ts()};
  if(!b.pos[b.root])b.pos[b.root]={};
  if(!b.pinned)b.pinned={};
}
function loadState(){
  try{
    var d=JSON.parse(localStorage.getItem(DB_KEY)||'null');
    if(d&&d.boards&&d.boards.length){d.boards.forEach(initBoard);return d;}
  }catch(e){}
  var b0=newBoard('Board 1'),b1=newBoard('Board 2');
  initBoard(b0);initBoard(b1);
  return{boards:[b0,b1],activeBoard:0};
}
function saveState(){
  try{localStorage.setItem(DB_KEY,JSON.stringify(STATE));}
  catch(e){toast('⚠ Storage full — export your board!');}
}

var STATE=loadState();
var ACTIVE=STATE.activeBoard||0;
function DB(){return STATE.boards[ACTIVE];}
function nod(id){return DB().nodes[id]||null;}
function posOf(fid,id){return(DB().pos[fid]||{})[id]||null;}
function setPos(fid,id,x,y,w,h){
  if(!DB().pos[fid])DB().pos[fid]={};
  var o=DB().pos[fid][id]||{};
  DB().pos[fid][id]={x:x,y:y,w:w!==undefined?w:o.w||null,h:h!==undefined?h:o.h||null};
}
function setSz(fid,id,w,h){
  if(!DB().pos[fid])DB().pos[fid]={};
  var o=DB().pos[fid][id]||{x:0,y:0};
  DB().pos[fid][id]={x:o.x,y:o.y,w:w,h:h};
}

/* ─── UNDO/REDO ─────────────────────────────────────────────── */
var undoStack=[],redoStack=[];
var MAX_UNDO=30;
function snapshot(){
  var s=JSON.stringify(STATE);
  if(undoStack.length&&undoStack[undoStack.length-1]===s)return;
  undoStack.push(s);if(undoStack.length>MAX_UNDO)undoStack.shift();
  redoStack=[];updateUndoUI();
}
function undo(){
  if(!undoStack.length)return;
  redoStack.push(JSON.stringify(STATE));
  STATE=JSON.parse(undoStack.pop());
  ACTIVE=STATE.activeBoard||0;
  saveState();renderNow();updateUndoUI();toast('Undo');
}
function redo(){
  if(!redoStack.length)return;
  undoStack.push(JSON.stringify(STATE));
  STATE=JSON.parse(redoStack.pop());
  ACTIVE=STATE.activeBoard||0;
  saveState();renderNow();updateUndoUI();toast('Redo');
}
function updateUndoUI(){
  ge('undo-btn').disabled=!undoStack.length;
  ge('redo-btn').disabled=!redoStack.length;
}
ge('undo-btn').addEventListener('click',undo);
ge('redo-btn').addEventListener('click',redo);
updateUndoUI();

/* ─── VIEW ───────────────────────────────────────────────────── */
var V={tx:0,ty:0,scale:1};
var MIN_Z=0.04,MAX_Z=24;
var worldEl=ge('world'),stageEl=ge('stage'),gridCvs=ge('grid-cvs');
var gridCtx=gridCvs.getContext('2d');
var _gRaf=null,_renderRaf=null;

function applyView(){
  worldEl.style.transform='translate('+V.tx+'px,'+V.ty+'px) scale('+V.scale+')';
  ge('zoom-lbl').textContent=Math.round(V.scale*100)+'%';
  if(!_gRaf)_gRaf=requestAnimationFrame(function(){_gRaf=null;drawGrid();});
}
function drawGrid(){
  var cW=stageEl.clientWidth,cH=stageEl.clientHeight;
  if(gridCvs.width!==cW)gridCvs.width=cW;
  if(gridCvs.height!==cH)gridCvs.height=cH;
  gridCtx.clearRect(0,0,cW,cH);
  var sp=32*V.scale;while(sp<16)sp*=2;while(sp>90)sp/=2;
  var ox=((V.tx%sp)+sp)%sp,oy=((V.ty%sp)+sp)%sp;
  gridCtx.fillStyle='rgba(255,255,255,0.035)';
  for(var x=ox-sp;x<cW+sp;x+=sp)for(var y=oy-sp;y<cH+sp;y+=sp)gridCtx.fillRect(x-.8,y-.8,1.6,1.6);
}
function s2w(sx,sy){return{x:(sx-V.tx)/V.scale,y:(sy-V.ty)/V.scale};}
function zoomAt(cx,cy,f){
  var b=s2w(cx,cy);V.scale=clamp(V.scale*f,MIN_Z,MAX_Z);
  V.tx=cx-b.x*V.scale;V.ty=cy-b.y*V.scale;applyView();
}
function fitAll(){
  var folder=nod(DB().current),kids=(folder&&folder.kids||[]).map(nod).filter(Boolean);
  if(!kids.length){V.scale=1;V.tx=80;V.ty=60;applyView();return;}
  var xs=[],ys=[];
  kids.forEach(function(n){
    var p=posOf(DB().current,n.id)||{x:0,y:0,w:null,h:null};
    xs.push(p.x,p.x+(p.w||defW(n)));ys.push(p.y,p.y+(p.h||110));
  });
  var x0=Math.min.apply(null,xs)-70,y0=Math.min.apply(null,ys)-70;
  var bw=(Math.max.apply(null,xs)+70)-x0,bh=(Math.max.apply(null,ys)+70)-y0;
  var sW=stageEl.clientWidth,sH=stageEl.clientHeight-50;
  V.scale=clamp(Math.min(sW/bw,sH/bh),MIN_Z,MAX_Z);
  V.tx=sW/2-(x0+bw/2)*V.scale;V.ty=(sH/2+25)-(y0+bh/2)*V.scale;
  applyView();
}
function defW(n){return{folder:165,label:180,shape:130,media:260,voice:220}[n.type]||215;}
function saveView(){DB().views[DB().current]={tx:V.tx,ty:V.ty,scale:V.scale};}
function restoreView(fid){
  var v=DB().views[fid];
  if(v){V.tx=v.tx;V.ty=v.ty;V.scale=v.scale;applyView();}
  else{V.scale=1;setTimeout(fitAll,50);}
}
function dropPos(w,h){
  var cx=stageEl.clientWidth/2+(Math.random()-.5)*100;
  var cy=stageEl.clientHeight/2+(Math.random()-.5)*80;
  var wp=s2w(cx,cy);return{x:wp.x-(w/2),y:wp.y-(h/2)};
}

/* ─── BREADCRUMB ─────────────────────────────────────────────── */
function renderBC(){
  var trail=ge('bc-trail'),cur=DB().current,path=[],c=nod(cur);
  trail.innerHTML='';
  while(c){path.unshift(c);c=c.parent?nod(c.parent):null;}
  var bb=ge('back-btn');
  bb.style.display=DB().current!==DB().root?'flex':'none';
  if(DB().current!==DB().root){var pid=nod(DB().current).parent||DB().root;bb.onclick=function(){navTo(pid);};}
  path.forEach(function(n,i){
    var last=i===path.length-1;
    var s=document.createElement('span');s.className='bc-crumb'+(last?' cur':'');
    s.textContent=n.name;if(!last)s.onclick=function(){navTo(n.id);};
    trail.appendChild(s);
    if(!last){var sep=document.createElement('span');sep.className='bc-sep';sep.textContent='/';trail.appendChild(sep);}
  });
}

/* ─── WORKSPACE ──────────────────────────────────────────────── */
document.querySelectorAll('.ws-tab').forEach(function(b){
  b.addEventListener('click',function(){
    var idx=parseInt(b.dataset.ws);
    if(idx===ACTIVE)return;
    saveView();STATE.activeBoard=idx;ACTIVE=idx;saveState();
    V={tx:0,ty:0,scale:1};DB().current=DB().root;sel=null;
    restoreView(DB().root);renderNow();
    document.querySelectorAll('.ws-tab').forEach(function(x){x.classList.toggle('active',parseInt(x.dataset.ws)===idx);});
    toast('Switched to '+DB().name);
  });
});

/* ─── SELECTION ──────────────────────────────────────────────── */
var sel=null;
function setSel(id){
  sel=id;
  worldEl.querySelectorAll('.card').forEach(function(el){el.classList.toggle('sel',el.dataset.id===id);});
}
function clearSel(){
  sel=null;
  worldEl.querySelectorAll('.card').forEach(function(el){el.classList.remove('sel');});
}

/* ─── RENDER ─────────────────────────────────────────────────── */
function render(){
  if(_renderRaf)return;
  _renderRaf=requestAnimationFrame(function(){_renderRaf=null;_doRender();});
}
function renderNow(){cancelAnimationFrame(_renderRaf);_renderRaf=null;_doRender();}
function _doRender(){
  worldEl.querySelectorAll('.card').forEach(function(el){el.remove();});
  renderBC();
  var folder=nod(DB().current);if(!folder)return;
  (folder.kids||[]).forEach(function(id){
    var n=nod(id);if(!n)return;
    var p=posOf(DB().current,id);
    if(!p){var a=Math.random()*Math.PI*2,r=130+Math.random()*170;setPos(DB().current,id,Math.cos(a)*r-90,Math.sin(a)*r-55,null,null);p=posOf(DB().current,id);}
    var el=buildCard(n,p);
    el.dataset.id=id;
    el.style.left=p.x+'px';el.style.top=p.y+'px';
    if(p.w&&n.type!=='label'&&n.type!=='shape')el.style.width=p.w+'px';
    if(p.h&&n.type!=='label'&&n.type!=='shape')el.style.height=p.h+'px';
    if(n.type==='shape'){var sz=p.w||n.sz||120;el.style.width=sz+'px';el.style.height=sz+'px';}
    if(sel===id)el.classList.add('sel');
    if(DB().pinned[id])el.classList.add('pinned');
    attachCardEvents(el,n);
    worldEl.appendChild(el);
  });
}

/* ─── BUILD CARDS ────────────────────────────────────────────── */
function buildCard(n,p){
  var el=document.createElement('div');
  switch(n.type){

  case 'note':
    el.className='card cn';
    var preview=(n.text||'').slice(0,280).trim();
    el.innerHTML='<div class="cn-head"><div class="cn-title">'+esc(n.name)+'</div></div>'
      +(preview?'<div class="cn-body">'+esc(preview)+'</div>':'')
      +'<div class="cn-foot"><span>'+ago(n.t)+'</span>'
      +'<button class="cn-edit-btn">Edit</button></div>'
      +'<div class="rh">'+RH+'</div>';
    el.querySelector('.cn-edit-btn').addEventListener('click',function(e){e.stopPropagation();openEditor(n.id);});
    break;

  case 'folder':
    el.className='card cf';
    var cnt=(n.kids||[]).length;
    el.innerHTML='<div class="cf-ico"><svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 6.25a1.25 1.25 0 011.25-1.25h4.482l.625.833A1.25 1.25 0 0010.357 6.25H15.75A1.25 1.25 0 0117 7.5v7.25A1.25 1.25 0 0115.75 16H4.25A1.25 1.25 0 013 14.75V6.25z" fill="rgba(79,143,255,0.3)" stroke="#4f8fff" stroke-width="1.2"/></svg></div>'
      +'<div class="cf-name">'+esc(n.name)+'</div>'
      +'<div class="cf-meta">'+cnt+' item'+(cnt!==1?'s':'')+'</div>'
      +'<div class="cf-hint">Double-click to open</div>'
      +'<div class="rh">'+RH+'</div>';
    break;

  case 'label':
    el.className='card cl';
    el.innerHTML='<button class="cl-edit-btn"><svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M11.5 2.5a2.121 2.121 0 013 3L5 15H2v-3L11.5 2.5z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg></button>'
      +'<div class="cl-text" style="font-size:'+n.size+'px;color:'+n.color+'">'+esc(n.name)+'</div>'
      +'<div class="rh">'+RH+'</div>';
    el.querySelector('.cl-edit-btn').addEventListener('click',function(e){e.stopPropagation();openTxtEdit(n.id);});
    break;

  case 'sticky':
    el.className='card cs';
    el.style.background=n.color||'#ffd060';el.style.borderColor='rgba(0,0,0,0.06)';
    el.innerHTML='<div class="cs-inner">'+esc(n.text||n.name||'')+'</div>'
      +'<div class="cs-foot">'
      +'<span class="cs-foot-date">'+ago(n.t)+'</span>'
      +'<button class="cs-edit-btn">Edit</button></div>'
      +'<div class="rh">'+RH+'</div>';
    el.querySelector('.cs-edit-btn').addEventListener('click',function(e){e.stopPropagation();openTxtEdit(n.id);});
    break;

  case 'checklist':
    var items=n.items||[],done=items.filter(function(x){return x.done;}).length;
    var pct=items.length?Math.round(done/items.length*100):0;
    el.className='card cch';
    var rows=items.map(function(it,i){
      return '<div class="cch-item'+(it.done?' done-item':'')+'" data-idx="'+i+'">'
        +'<div class="cch-box'+(it.done?' done':'')+'"><svg class="cch-tick" viewBox="0 0 9 9" fill="none"><path d="M1.5 4.5l2.5 2.5 4-4" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></div>'
        +'<span class="cch-lbl">'+esc(it.t)+'</span></div>';
    }).join('');
    el.innerHTML='<div class="cch-title">'+esc(n.name)+'</div>'+rows
      +'<div class="cch-progress"><div class="cch-prog-bar" style="width:'+pct+'%"></div></div>'
      +'<div class="rh">'+RH+'</div>';
    el.querySelectorAll('.cch-item').forEach(function(row){
      row.addEventListener('click',function(e){
        e.stopPropagation();
        var idx=parseInt(row.dataset.idx);
        snapshot();
        n.items[idx].done=!n.items[idx].done;n.t=ts();
        saveState();render();setSel(n.id);
      });
    });
    break;

  case 'link':
    var host='';try{host=new URL(n.url).hostname.replace('www.','');}catch(e){}
    el.className='card clk';
    el.innerHTML=(host?'<div class="clk-host"><div class="clk-host-dot"></div>'+esc(host)+'</div>':'')
      +'<div class="clk-title">'+esc(n.name)+'</div>'
      +(n.desc?'<div class="clk-desc">'+esc(n.desc)+'</div>':'')
      +'<button class="clk-open"><svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M13 3H3M13 3v10M13 3L5 11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg> Open link</button>'
      +'<div class="rh">'+RH+'</div>';
    el.querySelector('.clk-open').addEventListener('click',function(e){e.stopPropagation();window.open(n.url,'_blank');});
    break;

  case 'media':
    el.className='card cmed';
    if(n.mediaType==='video'){
      el.innerHTML='<video src="'+n.src+'" controls></video>'+(n.caption?'<div class="cmed-cap">'+esc(n.caption)+'</div>':'')+'<div class="rh">'+RH+'</div>';
      el.querySelector('video').addEventListener('pointerdown',function(e){e.stopPropagation();});
    } else {
      el.innerHTML='<img src="'+n.src+'" draggable="false" alt="'+esc(n.caption||'')+'">'+(n.caption?'<div class="cmed-cap">'+esc(n.caption)+'</div>':'')+'<div class="rh">'+RH+'</div>';
    }
    break;

  case 'voice':
    el.className='card cvoc';
    var bars='';for(var bi=0;bi<20;bi++)bars+='<span style="height:'+(Math.random()*18+4)+'px;opacity:'+(Math.random()*.5+.15).toFixed(2)+'"></span>';
    el.innerHTML='<div class="cvoc-top"><div class="cvoc-ico"><svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="6.5" y="1.5" width="5" height="8" rx="2.5" stroke="#9b6fff" stroke-width="1.5"/><path d="M2.5 9A6.5 6.5 0 009 15.5 6.5 6.5 0 0015.5 9" stroke="#9b6fff" stroke-width="1.5" stroke-linecap="round"/><path d="M9 15.5V18" stroke="#9b6fff" stroke-width="1.5" stroke-linecap="round"/></svg></div><div><div class="cvoc-name">'+esc(n.name)+'</div><div class="cvoc-dur">'+esc(n.dur||'0:00')+'</div></div></div>'
      +'<div class="cvoc-bars">'+bars+'</div>'
      +'<div style="display:flex;align-items:center;gap:8px">'
      +'<button class="vplay" data-id="'+n.id+'"><svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M3 2l7 4-7 4z"/></svg></button>'
      +'<span style="font-size:11px;color:var(--sub);font-family:var(--mono)" id="vt-'+n.id+'">'+esc(n.dur||'0:00')+'</span></div>'
      +'<div class="rh">'+RH+'</div>';
    el.querySelector('.vplay').addEventListener('click',function(e){
      e.stopPropagation();var btn=this,nid=btn.dataset.id,n2=nod(nid);if(!n2)return;
      if(!_auds[nid]){
        _auds[nid]=new Audio(n2.src);
        _auds[nid].addEventListener('timeupdate',function(){var t=ge('vt-'+nid);if(t)t.textContent=fmtDur(this.currentTime);});
        _auds[nid].addEventListener('ended',function(){var t=ge('vt-'+nid);if(t)t.textContent=n2.dur;btn.innerHTML='<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M3 2l7 4-7 4z"/></svg>';});
      }
      if(_auds[nid].paused){_auds[nid].play();btn.innerHTML='<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><rect x="2.5" y="2" width="3" height="8" rx="1"/><rect x="6.5" y="2" width="3" height="8" rx="1"/></svg>';}
      else{_auds[nid].pause();btn.innerHTML='<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M3 2l7 4-7 4z"/></svg>';}
    });
    break;

  case 'shape':
    el.className='card cshp';
    var sz=p&&p.w||n.sz||120;
    el.innerHTML=buildShapeSVG(n,sz)+'<div class="rh">'+RH+'</div>';
    break;
  }
  return el;
}

/* ─── CARD EVENTS ────────────────────────────────────────────── */
function attachCardEvents(el,n){
  attachDrag(el,n);
  if(n.type==='label')attachLabelResize(el,n);
  else if(n.type==='shape')attachShapeResize(el,n);
  else attachResize(el,n);
  el.addEventListener('contextmenu',function(e){
    e.preventDefault();e.stopPropagation();
    setSel(n.id);showCtx(e.clientX,e.clientY,n.id);
  });
}

/* ─── DRAG ───────────────────────────────────────────────────── */
function attachDrag(el,n){
  var dragging=false,moved=false,startWX,startWY,startPX,startPY,downTime=0;
  var IGNORE='.rh,.cn-edit-btn,.cs-edit-btn,.cl-edit-btn,.cch-item,.cch-box,.clk-open,.vplay,video,button,input,textarea';

  el.addEventListener('pointerdown',function(e){
    if(e.button!==0)return;
    if(e.target.closest(IGNORE))return;
    // Don't start drag from pinned cards (they still can be moved but only from explicit drag)
    e.stopPropagation();
    setSel(n.id);downTime=Date.now();dragging=true;moved=false;
    el.setPointerCapture(e.pointerId);
    var wp=s2w(e.clientX,e.clientY);startWX=wp.x;startWY=wp.y;
    var p=posOf(DB().current,n.id)||{x:0,y:0};startPX=p.x;startPY=p.y;
  });

  el.addEventListener('pointermove',function(e){
    if(!dragging)return;
    var wp=s2w(e.clientX,e.clientY);
    var dx=wp.x-startWX,dy=wp.y-startWY;
    if(!moved&&Math.hypot(dx,dy)<5)return;
    if(!moved){moved=true;el.classList.add('dragging');snapshot();}
    var nx=startPX+dx,ny=startPY+dy;
    DB().pos[DB().current][n.id]=Object.assign(DB().pos[DB().current][n.id]||{},{x:nx,y:ny});
    el.style.left=nx+'px';el.style.top=ny+'px';
  });

  el.addEventListener('pointerup',function(e){
    el.classList.remove('dragging');
    if(!dragging)return;dragging=false;
    if(moved){saveState();return;}
    // click actions
    if(Date.now()-downTime<350){
      if(n.type==='note')openEditor(n.id);
      else if(n.type==='sticky'||n.type==='label')openTxtEdit(n.id);
    }
  });

  el.addEventListener('dblclick',function(e){
    if(moved)return;e.stopPropagation();
    if(n.type==='folder')navTo(n.id);
    else if(n.type==='note')openEditor(n.id);
    else if(n.type==='sticky'||n.type==='label')openTxtEdit(n.id);
  });

  el.addEventListener('pointercancel',function(){el.classList.remove('dragging');dragging=false;});
}

/* ─── RESIZE ─────────────────────────────────────────────────── */
function attachResize(el,n){
  var rh=el.querySelector('.rh');if(!rh)return;
  var on=false,sx,sy,sw,sh;
  rh.addEventListener('pointerdown',function(e){
    e.stopPropagation();e.preventDefault();
    on=true;rh.setPointerCapture(e.pointerId);
    sx=e.clientX;sy=e.clientY;sw=el.offsetWidth;sh=el.offsetHeight;
    snapshot();
  });
  rh.addEventListener('pointermove',function(e){
    if(!on)return;
    var nw=Math.max(130,sw+(e.clientX-sx)/V.scale);
    var nh=Math.max(60,sh+(e.clientY-sy)/V.scale);
    el.style.width=nw+'px';el.style.height=nh+'px';
    setSz(DB().current,n.id,nw,nh);
  });
  rh.addEventListener('pointerup',function(){if(!on)return;on=false;saveState();});
}
function attachLabelResize(el,n){
  var rh=el.querySelector('.rh');if(!rh)return;
  var on=false,sx,sy,s0;
  rh.addEventListener('pointerdown',function(e){e.stopPropagation();e.preventDefault();on=true;rh.setPointerCapture(e.pointerId);sx=e.clientX;sy=e.clientY;s0=n.size||20;snapshot();});
  rh.addEventListener('pointermove',function(e){
    if(!on)return;
    var d=((e.clientX-sx)+(e.clientY-sy))/V.scale;
    var ns=Math.max(8,Math.min(200,Math.round(s0+d*0.35)));
    n.size=ns;var txt=el.querySelector('.cl-text');if(txt)txt.style.fontSize=ns+'px';
  });
  rh.addEventListener('pointerup',function(){if(!on)return;on=false;n.t=ts();saveState();});
}
function attachShapeResize(el,n){
  var rh=el.querySelector('.rh');if(!rh)return;
  var on=false,sx,sy,s0;
  rh.addEventListener('pointerdown',function(e){e.stopPropagation();e.preventDefault();on=true;rh.setPointerCapture(e.pointerId);sx=e.clientX;sy=e.clientY;s0=parseInt(el.style.width)||n.sz||120;snapshot();});
  rh.addEventListener('pointermove',function(e){
    if(!on)return;
    var d=((e.clientX-sx)+(e.clientY-sy))/V.scale;
    var sz=Math.max(40,Math.round(s0+d));
    el.style.width=sz+'px';el.style.height=sz+'px';
    el.innerHTML=buildShapeSVG(n,sz)+'<div class="rh">'+RH+'</div>';
    setSz(DB().current,n.id,sz,sz);
    // re-attach rh events
    attachShapeResize(el,n);
  });
  rh.addEventListener('pointerup',function(){if(!on)return;on=false;saveState();});
}

/* ─── SHAPES ─────────────────────────────────────────────────── */
var SHAPES=[
  {id:'rect',label:'Rect',svg:'▭'},{id:'rounded',label:'Round',svg:'▢'},
  {id:'circle',label:'Circle',svg:'○'},{id:'triangle',label:'Tri',svg:'△'},
  {id:'diamond',label:'Diamond',svg:'◇'},{id:'star',label:'Star',svg:'☆'},
  {id:'arrow-r',label:'→',svg:'→'},{id:'arrow-l',label:'←',svg:'←'},
  {id:'arrow-u',label:'↑',svg:'↑'},{id:'arrow-d',label:'↓',svg:'↓'},
  {id:'line-h',label:'—',svg:'—'},{id:'line-v',label:'|',svg:'|'},
  {id:'line-d',label:'↘',svg:'↘'},{id:'bracket',label:'[ ]',svg:'[]'},
  {id:'callout',label:'Chat',svg:'💬'},{id:'hexagon',label:'Hex',svg:'⬡'},
];
function buildShapeSVG(n,sz){
  var f=n.fill||'none',s=n.stroke||'#4f8fff',sw=n.sw||2,h=sz,p=sw/2;
  var g='<svg width="'+sz+'" height="'+h+'" viewBox="0 0 '+sz+' '+h+'" xmlns="http://www.w3.org/2000/svg">';
  var sh=n.shape||'rect';
  if(sh==='rect')g+='<rect x="'+p+'" y="'+p+'" width="'+(sz-sw)+'" height="'+(h-sw)+'" fill="'+f+'" stroke="'+s+'" stroke-width="'+sw+'" rx="3"/>';
  else if(sh==='rounded')g+='<rect x="'+p+'" y="'+p+'" width="'+(sz-sw)+'" height="'+(h-sw)+'" fill="'+f+'" stroke="'+s+'" stroke-width="'+sw+'" rx="'+(sz*0.15)+'"/>';
  else if(sh==='circle'){var r=(sz-sw)/2;g+='<ellipse cx="'+(sz/2)+'" cy="'+(h/2)+'" rx="'+r+'" ry="'+(h/2-sw/2)+'" fill="'+f+'" stroke="'+s+'" stroke-width="'+sw+'"/>';}
  else if(sh==='triangle')g+='<polygon points="'+(sz/2)+','+p+' '+(sz-p)+','+(h-p)+' '+p+','+(h-p)+'" fill="'+f+'" stroke="'+s+'" stroke-width="'+sw+'" stroke-linejoin="round"/>';
  else if(sh==='diamond')g+='<polygon points="'+(sz/2)+','+p+' '+(sz-p)+','+(h/2)+' '+(sz/2)+','+(h-p)+' '+p+','+(h/2)+'" fill="'+f+'" stroke="'+s+'" stroke-width="'+sw+'"/>';
  else if(sh==='star'){var cx=sz/2,cy=h/2,ro=(sz-sw)/2,ri=ro*0.42,pts='';for(var i=0;i<10;i++){var ang=Math.PI/5*i-Math.PI/2,rv=i%2===0?ro:ri;pts+=(cx+rv*Math.cos(ang)).toFixed(2)+','+(cy+rv*Math.sin(ang)).toFixed(2)+(i<9?' ':'');}g+='<polygon points="'+pts+'" fill="'+f+'" stroke="'+s+'" stroke-width="'+sw+'"/>';}
  else if(sh==='arrow-r'){var m=h/2;g+='<line x1="'+p+'" y1="'+m+'" x2="'+(sz-p)+'" y2="'+m+'" stroke="'+s+'" stroke-width="'+sw+'" stroke-linecap="round"/><path d="M'+(sz-p-sz*0.2)+','+(m-sz*0.15)+' L'+(sz-p)+','+m+' L'+(sz-p-sz*0.2)+','+(m+sz*0.15)+'" fill="none" stroke="'+s+'" stroke-width="'+sw+'" stroke-linecap="round" stroke-linejoin="round"/>';}
  else if(sh==='arrow-l'){var m3=h/2;g+='<line x1="'+p+'" y1="'+m3+'" x2="'+(sz-p)+'" y2="'+m3+'" stroke="'+s+'" stroke-width="'+sw+'" stroke-linecap="round"/><path d="M'+(p+sz*0.2)+','+(m3-sz*0.15)+' L'+p+','+m3+' L'+(p+sz*0.2)+','+(m3+sz*0.15)+'" fill="none" stroke="'+s+'" stroke-width="'+sw+'" stroke-linecap="round" stroke-linejoin="round"/>';}
  else if(sh==='arrow-u'){var mx=sz/2;g+='<line x1="'+mx+'" y1="'+p+'" x2="'+mx+'" y2="'+(h-p)+'" stroke="'+s+'" stroke-width="'+sw+'" stroke-linecap="round"/><path d="M'+(mx-h*0.15)+','+(p+h*0.2)+' L'+mx+','+p+' L'+(mx+h*0.15)+','+(p+h*0.2)+'" fill="none" stroke="'+s+'" stroke-width="'+sw+'" stroke-linecap="round" stroke-linejoin="round"/>';}
  else if(sh==='arrow-d'){var mx2=sz/2;g+='<line x1="'+mx2+'" y1="'+p+'" x2="'+mx2+'" y2="'+(h-p)+'" stroke="'+s+'" stroke-width="'+sw+'" stroke-linecap="round"/><path d="M'+(mx2-h*0.15)+','+(h-p-h*0.2)+' L'+mx2+','+(h-p)+' L'+(mx2+h*0.15)+','+(h-p-h*0.2)+'" fill="none" stroke="'+s+'" stroke-width="'+sw+'" stroke-linecap="round" stroke-linejoin="round"/>';}
  else if(sh==='line-h')g+='<line x1="'+p+'" y1="'+(h/2)+'" x2="'+(sz-p)+'" y2="'+(h/2)+'" stroke="'+s+'" stroke-width="'+sw+'" stroke-linecap="round"/>';
  else if(sh==='line-v')g+='<line x1="'+(sz/2)+'" y1="'+p+'" x2="'+(sz/2)+'" y2="'+(h-p)+'" stroke="'+s+'" stroke-width="'+sw+'" stroke-linecap="round"/>';
  else if(sh==='line-d')g+='<line x1="'+p+'" y1="'+p+'" x2="'+(sz-p)+'" y2="'+(h-p)+'" stroke="'+s+'" stroke-width="'+sw+'" stroke-linecap="round"/>';
  else if(sh==='bracket')g+='<path d="M'+(sz*0.32)+','+p+' L'+p+','+p+' L'+p+','+(h-p)+' L'+(sz*0.32)+','+(h-p)+'" fill="none" stroke="'+s+'" stroke-width="'+sw+'" stroke-linecap="round" stroke-linejoin="round"/><path d="M'+(sz*0.68)+','+p+' L'+(sz-p)+','+p+' L'+(sz-p)+','+(h-p)+' L'+(sz*0.68)+','+(h-p)+'" fill="none" stroke="'+s+'" stroke-width="'+sw+'" stroke-linecap="round" stroke-linejoin="round"/>';
  else if(sh==='callout'){var r2=sz*.08;g+='<rect x="'+p+'" y="'+p+'" width="'+(sz-sw)+'" height="'+(h*0.75)+'" fill="'+f+'" stroke="'+s+'" stroke-width="'+sw+'" rx="'+r2+'"/><polygon points="'+(sz*0.2)+','+(h*0.75)+' '+(sz*0.38)+','+(h*0.75)+' '+(sz*0.25)+','+(h-p)+'" fill="'+f+'" stroke="'+s+'" stroke-width="'+sw+'"/>';}
  else if(sh==='hexagon'){var cx2=sz/2,cy2=h/2,r3=(Math.min(sz,h)/2-sw/2);var hpts='';for(var j=0;j<6;j++){var a2=Math.PI/3*j-Math.PI/6;hpts+=(cx2+r3*Math.cos(a2)).toFixed(2)+','+(cy2+r3*Math.sin(a2)).toFixed(2)+(j<5?' ':'');}g+='<polygon points="'+hpts+'" fill="'+f+'" stroke="'+s+'" stroke-width="'+sw+'"/>';}
  return g+'</svg>';
}

/* ─── CONTEXT MENU ───────────────────────────────────────────── */
var ctxId=null,ctxOpen=false;
var ctxEl=ge('ctx');

// Single capture mousedown closes ctx/cpick if clicking outside
document.addEventListener('mousedown',function(e){
  if(ctxOpen&&!ctxEl.contains(e.target))hideCtx();
  if(cpickId!==null&&!ge('cpick').contains(e.target))hideCpick();
},{capture:true});

function showCtx(x,y,id){
  ctxId=id;var n=nod(id);
  ge('ctx-open').style.display=n.type==='folder'?'flex':'none';
  ge('ctx-edit').style.display=(n.type==='note'||n.type==='sticky'||n.type==='label')?'flex':'none';
  ge('ctx-rename').style.display='flex';
  ge('ctx-color').style.display=(n.type==='sticky'||n.type==='label')?'flex':'none';
  ge('ctx-copy').style.display=n.type==='note'?'flex':'none';
  ge('ctx-dup').style.display=n.type!=='folder'?'flex':'none';
  var px=Math.min(x,window.innerWidth-185);
  var py=Math.min(y,window.innerHeight-260);
  ctxEl.style.left=px+'px';ctxEl.style.top=py+'px';ctxEl.style.display='block';
  ctxOpen=true;
}
function hideCtx(){ctxEl.style.display='none';ctxOpen=false;ctxId=null;}

ge('ctx-open').addEventListener('click',function(){var id=ctxId;hideCtx();if(id)navTo(id);});
ge('ctx-edit').addEventListener('click',function(){var id=ctxId;hideCtx();if(!id)return;var n=nod(id);if(n.type==='note')openEditor(id);else openTxtEdit(id);});
ge('ctx-rename').addEventListener('click',function(){var id=ctxId;hideCtx();if(id)doRename(id);});
ge('ctx-color').addEventListener('click',function(){var id=ctxId;hideCtx();if(id)showCpick(id);});
ge('ctx-copy').addEventListener('click',function(){var n=ctxId&&nod(ctxId);hideCtx();if(n&&n.text)navigator.clipboard.writeText(n.text).then(function(){toast('Copied to clipboard');});});
ge('ctx-dup').addEventListener('click',function(){var id=ctxId;hideCtx();if(id)dupNode(id);});
ge('ctx-del').addEventListener('click',function(){var id=ctxId;hideCtx();if(id)delNode(id);});

/* ─── COLOR PICKER ───────────────────────────────────────────── */
var cpickId=null;
var CP_COLORS=['#ffd060','#a8f0c6','#ffa8d5','#a8ccff','#d4a8ff','#ffc8a8','#f05858','#4f8fff','#2fd17a','#9b6fff','#ff6eb4','#ffffff','#dddddd','#888888','#1c1c28'];
(function(){
  var row=ge('cpick-swatches');
  CP_COLORS.forEach(function(c){
    var sw=document.createElement('div');sw.className='sw';sw.style.background=c;
    sw.addEventListener('click',function(){
      if(!cpickId)return;var n=nod(cpickId);if(!n)return;
      snapshot();n.color=c;var id=cpickId;hideCpick();saveState();render();setSel(id);toast('Color updated');
    });
    row.appendChild(sw);
  });
})();
function showCpick(id){
  cpickId=id;
  var cardEl=worldEl.querySelector('[data-id="'+id+'"]');
  var cpEl=ge('cpick');cpEl.style.display='block';
  if(cardEl){var r=cardEl.getBoundingClientRect();cpEl.style.left=Math.min(r.left,window.innerWidth-200)+'px';cpEl.style.top=Math.min(r.bottom+6,window.innerHeight-100)+'px';}
  else{cpEl.style.left=(window.innerWidth/2-85)+'px';cpEl.style.top='50%';}
}
function hideCpick(){ge('cpick').style.display='none';cpickId=null;}

/* ─── NAV ────────────────────────────────────────────────────── */
function navTo(fid){saveView();DB().current=fid;sel=null;restoreView(fid);renderNow();}

/* ─── CREATE NODES ───────────────────────────────────────────── */
function addToBoard(node,w,h){
  var id=node.id,p=dropPos(w||defW(node),h||110);
  DB().nodes[id]=node;nod(DB().current).kids.push(id);
  setPos(DB().current,id,p.x,p.y,null,null);
  snapshot();saveState();render();setSel(id);
}
function mkNote(text){
  var id=uid(),n={id:id,type:'note',name:'Untitled',parent:DB().current,text:text||'',t:ts()};
  addToBoard(n,220,100);if(!text)openEditor(id);
}
function mkFolder(){
  var id=uid(),n={id:id,type:'folder',name:'New Folder',parent:DB().current,kids:[],t:ts()};
  DB().nodes[id]=n;DB().pos[id]={};
  var p=dropPos(165,140);setPos(DB().current,id,p.x,p.y,null,null);
  nod(DB().current).kids.push(id);
  snapshot();saveState();render();setSel(id);doRename(id);
}
function mkLabel(txt,size,color){addToBoard({id:uid(),type:'label',name:txt,parent:DB().current,size:size,color:color,t:ts()},180,60);}
function mkSticky(txt,color){addToBoard({id:uid(),type:'sticky',name:'sticky',text:txt,color:color,parent:DB().current,t:ts()},175,120);}
function mkChecklist(name,items){addToBoard({id:uid(),type:'checklist',name:name,items:items,parent:DB().current,t:ts()},220,140);}
function mkLink(title,url,desc){addToBoard({id:uid(),type:'link',name:title,url:url,desc:desc,parent:DB().current,t:ts()},220,100);}
function mkShape(shape,fill,stroke,sw,sz){
  var id=uid(),p=dropPos(sz,sz);
  DB().nodes[id]={id:id,type:'shape',shape:shape,fill:fill,stroke:stroke,sw:sw,sz:sz,name:shape,parent:DB().current,t:ts()};
  nod(DB().current).kids.push(id);setPos(DB().current,id,p.x,p.y,sz,sz);
  snapshot();saveState();render();setSel(id);
}
function delNode(id){
  var n=nod(id);if(!n)return;
  snapshot();
  if(n.parent&&nod(n.parent)){
    nod(n.parent).kids=(nod(n.parent).kids||[]).filter(function(k){return k!==id;});
    if(DB().pos[n.parent])delete DB().pos[n.parent][id];
  }
  function rm(nid){var x=nod(nid);if(!x)return;if(x.type==='folder')(x.kids||[]).forEach(rm);delete DB().nodes[nid];delete DB().pos[nid];}
  rm(id);if(sel===id)sel=null;if(openFileId===id)closeEditor(true);
  saveState();render();toast('Deleted');
}
function dupNode(id){
  var n=nod(id);if(!n||n.type==='folder')return;snapshot();
  var nid=uid(),copy=JSON.parse(JSON.stringify(n));
  copy.id=nid;copy.t=ts();copy.parent=DB().current;
  DB().nodes[nid]=copy;nod(DB().current).kids.push(nid);
  var p=posOf(DB().current,id)||{x:0,y:0,w:null,h:null};
  setPos(DB().current,nid,p.x+24,p.y+24,p.w,p.h);
  saveState();render();setSel(nid);toast('Duplicated');
}

/* ─── NOTE EDITOR ────────────────────────────────────────────── */
var openFileId=null,edDirty=false,edTimer=null;
function openEditor(id){
  var n=nod(id);if(!n||n.type!=='note')return;
  if(edDirty&&openFileId)flushEd();
  openFileId=id;edDirty=false;
  ge('ed-nm').value=n.name||'';ge('ed-ta').value=n.text||'';
  updateEdStat();ge('ed-dot').className='';
  ge('ed-bg').classList.add('open');
  setTimeout(function(){ge('ed-ta').focus();},80);
}
function closeEditor(silent){if(!silent&&edDirty&&openFileId)flushEd();openFileId=null;edDirty=false;ge('ed-bg').classList.remove('open');}
function flushEd(){
  if(!openFileId)return;var n=nod(openFileId);if(!n)return;
  var name=ge('ed-nm').value.trim()||'Untitled';
  var changed=n.text!==ge('ed-ta').value||n.name!==name;
  if(!changed)return;
  snapshot();n.text=ge('ed-ta').value;n.name=name;n.t=ts();
  edDirty=false;ge('ed-dot').className='saved';saveState();render();
}
function updateEdStat(){
  var v=ge('ed-ta').value,w=v.trim()?v.trim().split(/\s+/).length:0,c=v.length;
  ge('ed-stat').textContent=w+' words';ge('ed-char-count').textContent=c+' chars';
}
ge('ed-ta').addEventListener('input',function(){edDirty=true;ge('ed-dot').className='dirty';updateEdStat();clearTimeout(edTimer);edTimer=setTimeout(function(){if(edDirty&&openFileId)flushEd();},900);});
ge('ed-nm').addEventListener('input',function(){edDirty=true;ge('ed-dot').className='dirty';});
ge('ed-cl').addEventListener('click',function(){flushEd();closeEditor(true);});
ge('ed-bg').addEventListener('mousedown',function(e){if(e.target===ge('ed-bg')){flushEd();closeEditor(true);}});

// Format bar
document.querySelectorAll('.fmt-btn').forEach(function(btn){
  btn.addEventListener('click',function(){
    var ta=ge('ed-ta'),fmt=btn.dataset.fmt;
    var start=ta.selectionStart,end=ta.selectionEnd,val=ta.value,sel2=val.slice(start,end);
    var ins='',newStart=start,newEnd=end;
    if(fmt==='bold'){ins='**'+sel2+'**';newEnd=start+ins.length;}
    else if(fmt==='italic'){ins='*'+sel2+'*';newEnd=start+ins.length;}
    else if(fmt==='h1'){ins='\n# '+(sel2||'Heading 1')+'\n';newEnd=start+ins.length;}
    else if(fmt==='h2'){ins='\n## '+(sel2||'Heading 2')+'\n';newEnd=start+ins.length;}
    else if(fmt==='bullet'){ins='\n- '+(sel2||'Item')+'\n';newEnd=start+ins.length;}
    else if(fmt==='check'){ins='\n- [ ] '+(sel2||'Task')+'\n';newEnd=start+ins.length;}
    else if(fmt==='hr'){ins='\n\n---\n\n';newEnd=start+ins.length;}
    if(ins){ta.value=val.slice(0,start)+ins+val.slice(end);ta.selectionStart=newEnd;ta.selectionEnd=newEnd;ta.dispatchEvent(new Event('input'));}
    ta.focus();
  });
});

/* ─── TEXT EDIT ──────────────────────────────────────────────── */
var txtId=null;
function openTxtEdit(id){
  var n=nod(id);if(!n)return;txtId=id;
  ge('txt-title').textContent=n.type==='label'?'Edit Label':n.type==='sticky'?'Edit Sticky':'Edit';
  ge('txt-inp').value=n.type==='sticky'?(n.text||n.name||''):(n.name||'');
  var extra=ge('txt-extra');extra.innerHTML='';
  if(n.type==='label'){
    extra.innerHTML='<div class="mrow2" style="margin-top:10px">'
      +'<div><label class="mlbl">Size</label><select class="msel" id="txt-sz"><option value="11">XS</option><option value="14">S</option><option value="20">M</option><option value="32">L</option><option value="48">XL</option><option value="72">XXL</option></select></div>'
      +'<div><label class="mlbl">Color</label><select class="msel" id="txt-col"><option value="#eaeaf0">White</option><option value="#4f8fff">Blue</option><option value="#2fd17a">Green</option><option value="#ffd060">Amber</option><option value="#9b6fff">Purple</option><option value="#ff6eb4">Pink</option><option value="#f05858">Red</option><option value="#6a6a80">Muted</option></select></div>'
      +'</div>';
    var szEl=ge('txt-sz');var colEl=ge('txt-col');
    if(szEl)szEl.value=String(n.size||20);if(colEl)colEl.value=n.color||'#eaeaf0';
  }
  ge('txt-bg').classList.add('open');setTimeout(function(){ge('txt-inp').focus();ge('txt-inp').select();},80);
}
function commitTxtEdit(){
  var n=txtId&&nod(txtId);if(!n)return;
  var v=ge('txt-inp').value.trim();if(!v)return;
  snapshot();
  if(n.type==='sticky'){n.text=v;n.name='sticky';}
  else if(n.type==='label'){n.name=v;var sz=ge('txt-sz');var col=ge('txt-col');if(sz)n.size=parseInt(sz.value)||n.size;if(col)n.color=col.value||n.color;}
  else n.name=v;
  n.t=ts();saveState();render();setSel(txtId);ge('txt-bg').classList.remove('open');txtId=null;toast('Updated');
}
ge('txt-ok').addEventListener('click',commitTxtEdit);
ge('txt-cancel').addEventListener('click',function(){ge('txt-bg').classList.remove('open');txtId=null;});
ge('txt-cl').addEventListener('click',function(){ge('txt-bg').classList.remove('open');txtId=null;});
ge('txt-bg').addEventListener('mousedown',function(e){if(e.target===ge('txt-bg'))ge('txt-bg').classList.remove('open');});
ge('txt-inp').addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();commitTxtEdit();}});

/* ─── RENAME ─────────────────────────────────────────────────── */
var rnId=null;
function doRename(id){
  rnId=id;var n=nod(id);
  ge('rn-title').textContent='Rename '+n.type.charAt(0).toUpperCase()+n.type.slice(1);
  ge('rn-inp').value=n.name;
  ge('rn-bg').classList.add('open');setTimeout(function(){ge('rn-inp').focus();ge('rn-inp').select();},80);
}
function commitRename(){
  if(!rnId)return;var v=ge('rn-inp').value.trim();if(!v)return;
  snapshot();nod(rnId).name=v;nod(rnId).t=ts();
  if(openFileId===rnId)ge('ed-nm').value=v;
  saveState();render();ge('rn-bg').classList.remove('open');rnId=null;toast('Renamed');
}
ge('rn-ok').addEventListener('click',commitRename);
ge('rn-cancel').addEventListener('click',function(){ge('rn-bg').classList.remove('open');rnId=null;});
ge('rn-cl').addEventListener('click',function(){ge('rn-bg').classList.remove('open');rnId=null;});
ge('rn-bg').addEventListener('mousedown',function(e){if(e.target===ge('rn-bg'))ge('rn-bg').classList.remove('open');});
ge('rn-inp').addEventListener('keydown',function(e){if(e.key==='Enter')commitRename();if(e.key==='Escape')ge('rn-bg').classList.remove('open');});

/* ─── LABEL MODAL ────────────────────────────────────────────── */
ge('lbl-ok').addEventListener('click',function(){var t=ge('lbl-inp').value.trim();if(!t)return;mkLabel(t,parseInt(ge('lbl-size').value),ge('lbl-color').value);ge('lbl-inp').value='';ge('lbl-bg').classList.remove('open');});
ge('lbl-cancel').addEventListener('click',function(){ge('lbl-bg').classList.remove('open');});
ge('lbl-cl').addEventListener('click',function(){ge('lbl-bg').classList.remove('open');});
ge('lbl-bg').addEventListener('mousedown',function(e){if(e.target===ge('lbl-bg'))ge('lbl-bg').classList.remove('open');});
ge('lbl-inp').addEventListener('keydown',function(e){if(e.key==='Enter')ge('lbl-ok').click();});

/* ─── STICKY MODAL ───────────────────────────────────────────── */
var STICKY_COLORS=['#ffd060','#a8f0c6','#ffa8d5','#a8ccff','#d4a8ff','#ffc8a8'];
var _styC=STICKY_COLORS[0];
(function(){
  var row=ge('sty-swatches');
  STICKY_COLORS.forEach(function(c,i){
    var sw=document.createElement('div');sw.className='sw'+(i===0?' on':'');
    sw.style.background=c;sw.dataset.c=c;
    sw.addEventListener('click',function(){row.querySelectorAll('.sw').forEach(function(s){s.classList.remove('on');});sw.classList.add('on');_styC=c;});
    row.appendChild(sw);
  });
})();
ge('sty-ok').addEventListener('click',function(){var t=ge('sty-inp').value.trim();if(!t)return;mkSticky(t,_styC);ge('sty-inp').value='';ge('sty-bg').classList.remove('open');});
ge('sty-cancel').addEventListener('click',function(){ge('sty-bg').classList.remove('open');});
ge('sty-cl').addEventListener('click',function(){ge('sty-bg').classList.remove('open');});
ge('sty-bg').addEventListener('mousedown',function(e){if(e.target===ge('sty-bg'))ge('sty-bg').classList.remove('open');});

/* ─── CHECKLIST MODAL ────────────────────────────────────────── */
ge('chk-ok').addEventListener('click',function(){
  var title=ge('chk-title').value.trim()||'Checklist';
  var lines=ge('chk-items').value.split('\n').map(function(l){return l.trim();}).filter(Boolean);
  if(!lines.length)return;
  mkChecklist(title,lines.map(function(l){return{t:l,done:false};}));
  ge('chk-title').value='';ge('chk-items').value='';ge('chk-bg').classList.remove('open');
});
ge('chk-cancel').addEventListener('click',function(){ge('chk-bg').classList.remove('open');});
ge('chk-cl').addEventListener('click',function(){ge('chk-bg').classList.remove('open');});
ge('chk-bg').addEventListener('mousedown',function(e){if(e.target===ge('chk-bg'))ge('chk-bg').classList.remove('open');});

/* ─── LINK MODAL ─────────────────────────────────────────────── */
ge('lnk-ok').addEventListener('click',function(){
  var url=ge('lnk-url').value.trim();if(!url)return;
  var title=ge('lnk-title').value.trim()||url;
  mkLink(title,url,ge('lnk-desc').value.trim());
  ge('lnk-url').value='';ge('lnk-title').value='';ge('lnk-desc').value='';
  ge('lnk-bg').classList.remove('open');
});
ge('lnk-cancel').addEventListener('click',function(){ge('lnk-bg').classList.remove('open');});
ge('lnk-cl').addEventListener('click',function(){ge('lnk-bg').classList.remove('open');});
ge('lnk-bg').addEventListener('mousedown',function(e){if(e.target===ge('lnk-bg'))ge('lnk-bg').classList.remove('open');});
ge('lnk-url').addEventListener('keydown',function(e){if(e.key==='Enter')ge('lnk-ok').click();});

/* ─── SHAPE MODAL ────────────────────────────────────────────── */
var _shpSel='rect',_shpFill='none',_shpStroke='#4f8fff';
var SW_COLORS=['none','#ffffff','#ffd060','#2fd17a','#4f8fff','#f05858','#9b6fff','#ff6eb4','#1c1c28','#888888'];
function buildSwatchRow(el,cur,setter){
  el.innerHTML='';
  SW_COLORS.forEach(function(c){
    var sw=document.createElement('div');
    if(c==='none'){sw.className='sw sw-none'+(cur===c?' on':'');}
    else{sw.className='sw'+(cur===c?' on':'');sw.style.background=c;}
    sw.addEventListener('click',function(){el.querySelectorAll('.sw').forEach(function(s){s.classList.remove('on');});sw.classList.add('on');setter(c);});
    el.appendChild(sw);
  });
}
function openShapeModal(){
  var grid=ge('shp-grid');grid.innerHTML='';
  SHAPES.forEach(function(sh){
    var btn=document.createElement('div');btn.className='shp-btn'+(sh.id===_shpSel?' on':'');
    btn.innerHTML=sh.svg+'<span class="shp-lbl">'+sh.label+'</span>';
    btn.addEventListener('click',function(){grid.querySelectorAll('.shp-btn').forEach(function(b){b.classList.remove('on');});btn.classList.add('on');_shpSel=sh.id;});
    grid.appendChild(btn);
  });
  buildSwatchRow(ge('shp-fill'),_shpFill,function(c){_shpFill=c;});
  buildSwatchRow(ge('shp-stroke'),_shpStroke,function(c){_shpStroke=c;});
  ge('shp-bg').classList.add('open');
}
ge('shp-ok').addEventListener('click',function(){mkShape(_shpSel,_shpFill,_shpStroke,parseFloat(ge('shp-sw').value),parseInt(ge('shp-sz').value));ge('shp-bg').classList.remove('open');});
ge('shp-cancel').addEventListener('click',function(){ge('shp-bg').classList.remove('open');});
ge('shp-cl').addEventListener('click',function(){ge('shp-bg').classList.remove('open');});
ge('shp-bg').addEventListener('mousedown',function(e){if(e.target===ge('shp-bg'))ge('shp-bg').classList.remove('open');});

/* ─── IMAGE / VIDEO ──────────────────────────────────────────── */
var _mediaSrc=null,_mediaType=null;
function handleMediaFile(file){
  if(!file)return;var isImg=file.type.startsWith('image/'),isVid=file.type.startsWith('video/');
  if(!isImg&&!isVid){toast('Please choose an image or video file');return;}
  if(file.size>25*1024*1024){toast('File too large — max 25MB');return;}
  _mediaType=isImg?'image':'video';
  var reader=new FileReader();
  reader.onload=function(e){
    _mediaSrc=e.target.result;
    ge('media-preview-wrap').style.display='block';ge('media-drop').style.display='none';
    ge('img-preview').style.display=isImg?'block':'none';ge('vid-preview').style.display=isVid?'block':'none';
    if(isImg)ge('img-preview').src=_mediaSrc;else ge('vid-preview').src=_mediaSrc;
  };
  reader.onerror=function(){toast('Could not read file');};reader.readAsDataURL(file);
}
ge('media-drop').addEventListener('click',function(){ge('img-file').click();});
ge('img-file').addEventListener('change',function(){handleMediaFile(this.files[0]);this.value='';});
ge('media-drop').addEventListener('dragover',function(e){e.preventDefault();this.classList.add('drag-over');});
ge('media-drop').addEventListener('dragleave',function(){this.classList.remove('drag-over');});
ge('media-drop').addEventListener('drop',function(e){e.preventDefault();this.classList.remove('drag-over');handleMediaFile(e.dataTransfer.files[0]);});
ge('media-ok').addEventListener('click',function(){
  if(!_mediaSrc){toast('Please choose a file first');return;}
  var cap=ge('media-caption').value.trim();
  var id=uid(),p=dropPos(280,190);
  DB().nodes[id]={id:id,type:'media',mediaType:_mediaType,src:_mediaSrc,caption:cap,name:cap||(_mediaType==='video'?'Video':'Image'),parent:DB().current,t:ts()};
  nod(DB().current).kids.push(id);setPos(DB().current,id,p.x,p.y,280,null);
  snapshot();saveState();render();setSel(id);
  ge('media-bg').classList.remove('open');_mediaSrc=null;_mediaType=null;
  ge('media-caption').value='';ge('media-preview-wrap').style.display='none';ge('media-drop').style.display='flex';
  ge('img-preview').src='';ge('vid-preview').src='';toast('Added to canvas');
});
ge('media-cancel').addEventListener('click',function(){ge('media-bg').classList.remove('open');});
ge('media-cl').addEventListener('click',function(){ge('media-bg').classList.remove('open');});
ge('media-bg').addEventListener('mousedown',function(e){if(e.target===ge('media-bg'))ge('media-bg').classList.remove('open');});
function openMediaModal(type){
  _mediaSrc=null;_mediaType=null;
  ge('media-title').textContent=type==='video'?'Add Video':'Add Image / Video';
  ge('media-preview-wrap').style.display='none';ge('media-drop').style.display='flex';ge('media-caption').value='';
  ge('media-bg').classList.add('open');
}

/* ─── VOICE ──────────────────────────────────────────────────── */
var _auds={};var mediaRec=null,recChunks=[],recBlob=null,recSecs=0,recTimer=null,waveTimer=null;
(function(){var wf=ge('waveform');for(var i=0;i<36;i++){var b=document.createElement('span');b.style.cssText='height:4px;width:3px;border-radius:2px;background:var(--purple);opacity:.18;display:block;flex-shrink:0;transition:height .08s,opacity .08s';wf.appendChild(b);}})();
function startRec(){
  if(mediaRec&&mediaRec.state==='recording')return;
  navigator.mediaDevices.getUserMedia({audio:true}).then(function(stream){
    recChunks=[];recBlob=null;
    ge('rec-preview').style.display='none';ge('rec-add').disabled=true;
    mediaRec=new MediaRecorder(stream);
    mediaRec.ondataavailable=function(e){if(e.data.size>0)recChunks.push(e.data);};
    mediaRec.onstop=function(){
      recBlob=new Blob(recChunks,{type:'audio/webm'});
      ge('rec-preview').src=URL.createObjectURL(recBlob);ge('rec-preview').style.display='block';ge('rec-add').disabled=false;
      ge('rec-btn').textContent='Record again';ge('rec-hint').textContent='Listen back, then add';
      ge('rec-dot').classList.remove('active');
      clearInterval(recTimer);clearInterval(waveTimer);
      ge('waveform').querySelectorAll('span').forEach(function(b){b.style.height='4px';b.style.opacity='.18';});
      stream.getTracks().forEach(function(t){t.stop();});
    };
    mediaRec.start();recSecs=0;ge('rec-time').textContent='0:00';
    ge('rec-dot').classList.add('active');ge('rec-hint').textContent='Recording — tap Stop when done';
    ge('rec-btn').textContent='Stop recording';
    recTimer=setInterval(function(){recSecs++;ge('rec-time').textContent=fmtDur(recSecs);},1000);
    waveTimer=setInterval(function(){ge('waveform').querySelectorAll('span').forEach(function(b){var h=Math.random()*36+4;b.style.height=h+'px';b.style.opacity=((h/40)*.7+.15).toFixed(2);});},80);
  }).catch(function(){toast('Microphone not available — check browser permissions');});
}
function stopRec(){if(!mediaRec||mediaRec.state!=='recording')return;mediaRec.stop();clearInterval(recTimer);clearInterval(waveTimer);}
ge('rec-btn').addEventListener('click',function(){if(mediaRec&&mediaRec.state==='recording')stopRec();else startRec();});
ge('rec-add').addEventListener('click',function(){
  if(!recBlob)return;var reader=new FileReader();
  reader.onload=function(e){
    var id=uid(),p=dropPos(225,130);
    DB().nodes[id]={id:id,type:'voice',name:'Voice note',src:e.target.result,dur:fmtDur(recSecs),parent:DB().current,t:ts()};
    nod(DB().current).kids.push(id);setPos(DB().current,id,p.x,p.y,null,null);
    snapshot();saveState();render();setSel(id);
    ge('voice-bg').classList.remove('open');
    ge('rec-btn').textContent='Record';ge('rec-hint').textContent='Press Record to start';ge('rec-time').textContent='0:00';
    ge('rec-preview').style.display='none';ge('rec-add').disabled=true;ge('rec-dot').classList.remove('active');
    ge('waveform').querySelectorAll('span').forEach(function(b){b.style.height='4px';});
    toast('Voice note added!');
  };
  reader.readAsDataURL(recBlob);
});
ge('voice-cl').addEventListener('click',function(){stopRec();ge('voice-bg').classList.remove('open');});
ge('voice-bg').addEventListener('mousedown',function(e){if(e.target===ge('voice-bg')){stopRec();ge('voice-bg').classList.remove('open');}});

/* ─── SIDEBAR BUTTONS ────────────────────────────────────────── */
ge('sb-note').addEventListener('click',function(){snapshot();mkNote();});
ge('sb-folder').addEventListener('click',mkFolder);
ge('sb-sticky').addEventListener('click',function(){ge('sty-bg').classList.add('open');setTimeout(function(){ge('sty-inp').focus();},80);});
ge('sb-label').addEventListener('click',function(){ge('lbl-bg').classList.add('open');setTimeout(function(){ge('lbl-inp').focus();},80);});
ge('sb-checklist').addEventListener('click',function(){ge('chk-bg').classList.add('open');setTimeout(function(){ge('chk-title').focus();},80);});
ge('sb-link').addEventListener('click',function(){ge('lnk-bg').classList.add('open');setTimeout(function(){ge('lnk-url').focus();},80);});
ge('sb-image').addEventListener('click',function(){openMediaModal('image');});
ge('sb-voice').addEventListener('click',function(){ge('voice-bg').classList.add('open');});
ge('sb-shapes').addEventListener('click',openShapeModal);
ge('tb-del').addEventListener('click',function(){if(sel)delNode(sel);else toast('Select a card first');});

/* ─── TOPBAR BUTTONS ─────────────────────────────────────────── */
ge('tb-zi').addEventListener('click',function(){zoomAt(stageEl.clientWidth/2,stageEl.clientHeight/2,1.3);});
ge('tb-zo').addEventListener('click',function(){zoomAt(stageEl.clientWidth/2,stageEl.clientHeight/2,1/1.3);});
ge('tb-fit').addEventListener('click',fitAll);
ge('zoom-lbl').addEventListener('click',function(){fitAll();});
ge('exp-btn').addEventListener('click',function(){
  var blob=new Blob([JSON.stringify(STATE,null,2)],{type:'application/json'});
  var a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download='clyppad-'+new Date().toISOString().slice(0,10)+'.json';a.click();
  URL.revokeObjectURL(a.href);toast('Board exported');
});
ge('imp-btn').addEventListener('click',function(){ge('imp-file').click();});
ge('imp-file').addEventListener('change',function(){
  var file=this.files[0];if(!file)return;
  var reader=new FileReader();
  reader.onload=function(e){
    try{
      var d=JSON.parse(e.target.result);
      if(!d||!d.boards||!d.boards.length){toast('Invalid board file');return;}
      if(!confirm('Replace all boards with this import? This cannot be undone.'))return;
      STATE=d;ACTIVE=STATE.activeBoard||0;
      STATE.boards.forEach(initBoard);saveState();
      V={tx:0,ty:0,scale:1};renderNow();setTimeout(fitAll,60);
      document.querySelectorAll('.ws-tab').forEach(function(b){b.classList.toggle('active',parseInt(b.dataset.ws)===ACTIVE);});
      toast('Board imported!');
    }catch(err){toast('Could not read file');}
  };
  reader.readAsText(file);this.value='';
});

/* ─── PAN & ZOOM ─────────────────────────────────────────────── */
var spaceDown=false,panning=false,panStart={};

document.addEventListener('keydown',function(e){
  if(e.code==='Space'&&!e.target.matches('input,textarea,select')){e.preventDefault();spaceDown=true;stageEl.style.cursor='grab';}
},true);
document.addEventListener('keyup',function(e){if(e.code==='Space'){spaceDown=false;if(!panning)stageEl.style.cursor='';}});

stageEl.addEventListener('pointerdown',function(e){
  // Only handle events that actually start on the stage canvas area
  if(!stageEl.contains(e.target))return;
  if(e.button===1||(e.button===0&&spaceDown)){
    e.preventDefault();panning=true;stageEl.setPointerCapture(e.pointerId);
    stageEl.style.cursor='grabbing';panStart={x:e.clientX,y:e.clientY,tx:V.tx,ty:V.ty};
    return;
  }
  if(e.target===stageEl||e.target===ge('grid-cvs')||e.target===worldEl)clearSel();
});
stageEl.addEventListener('pointermove',function(e){
  if(!panning)return;
  V.tx=panStart.tx+(e.clientX-panStart.x);V.ty=panStart.ty+(e.clientY-panStart.y);applyView();
});
stageEl.addEventListener('pointerup',function(e){
  if(!panning)return;panning=false;stageEl.style.cursor=spaceDown?'grab':'';
  try{stageEl.releasePointerCapture(e.pointerId);}catch(err){}
  saveView();
});
stageEl.addEventListener('pointercancel',function(){panning=false;stageEl.style.cursor='';});

stageEl.addEventListener('dblclick',function(e){
  if(e.target!==stageEl&&e.target!==ge('grid-cvs')&&e.target!==worldEl)return;
  if(ge('ed-bg').classList.contains('open'))return;
  var wp=s2w(e.clientX,e.clientY);
  var id=uid(),n={id:id,type:'note',name:'Untitled',parent:DB().current,text:'',t:ts()};
  DB().nodes[id]=n;nod(DB().current).kids.push(id);
  setPos(DB().current,id,wp.x-105,wp.y-45,null,null);
  snapshot();saveState();render();setSel(id);openEditor(id);
});

// Wheel: trackpad pan, Ctrl+wheel = zoom, pinch = zoom
var _wAccX=0,_wAccY=0,_wAccZ=0,_wRaf=null;
stageEl.addEventListener('wheel',function(e){
  e.preventDefault();
  if(e.ctrlKey||e.metaKey){
    _wAccZ+=e.deltaY;
  } else {
    _wAccX+=e.deltaX;_wAccY+=e.deltaY;
  }
  if(!_wRaf)_wRaf=requestAnimationFrame(function(){
    if(_wAccZ){zoomAt(stageEl.clientWidth/2,stageEl.clientHeight/2,Math.pow(0.997,_wAccZ));_wAccZ=0;}
    if(_wAccX||_wAccY){V.tx-=_wAccX;V.ty-=_wAccY;_wAccX=0;_wAccY=0;applyView();}
    _wRaf=null;
  });
},{passive:false});

// Touch pinch
var _t0=null,_t1=null,_tDist=null,_tMid=null;
stageEl.addEventListener('touchstart',function(e){if(e.touches.length===2){_t0={x:e.touches[0].clientX,y:e.touches[0].clientY};_t1={x:e.touches[1].clientX,y:e.touches[1].clientY};_tDist=Math.hypot(_t1.x-_t0.x,_t1.y-_t0.y);_tMid={x:(_t0.x+_t1.x)/2,y:(_t0.y+_t1.y)/2};}},{passive:true});
stageEl.addEventListener('touchmove',function(e){
  if(e.touches.length!==2)return;e.preventDefault();
  var a={x:e.touches[0].clientX,y:e.touches[0].clientY},b={x:e.touches[1].clientX,y:e.touches[1].clientY};
  var d=Math.hypot(b.x-a.x,b.y-a.y),mx=(a.x+b.x)/2,my=(a.y+b.y)/2;
  if(_tDist)zoomAt(mx,my,d/_tDist);
  if(_tMid){V.tx+=mx-_tMid.x;V.ty+=my-_tMid.y;applyView();}
  _tDist=d;_tMid={x:mx,y:my};
},{passive:false});
stageEl.addEventListener('touchend',function(){_tDist=null;_tMid=null;},{passive:true});

/* ─── KEYBOARD SHORTCUTS ─────────────────────────────────────── */
document.addEventListener('keydown',function(e){
  var inInput=e.target.matches('input,textarea,select');
  if(e.key==='Escape'){
    closeAllModals();clearSel();hideCtx();hideCpick();
    if(ge('ed-bg').classList.contains('open')){flushEd();closeEditor(true);}
    return;
  }
  if((e.ctrlKey||e.metaKey)&&!e.shiftKey){
    if(e.key==='s'){e.preventDefault();flushEd();saveState();toast('Saved');}
    if(e.key==='z'){e.preventDefault();undo();}
    if(e.key==='d'&&sel){e.preventDefault();dupNode(sel);}
    if(e.key==='='||e.key==='+'){e.preventDefault();zoomAt(stageEl.clientWidth/2,stageEl.clientHeight/2,1.25);}
    if(e.key==='-'){e.preventDefault();zoomAt(stageEl.clientWidth/2,stageEl.clientHeight/2,1/1.25);}
    if(e.key==='0'){e.preventDefault();fitAll();}
    if(e.key==='n'&&!inInput){e.preventDefault();snapshot();mkNote();}
    return;
  }
  if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key==='Z'){e.preventDefault();redo();return;}
  if(!inInput&&!ge('ed-bg').classList.contains('open')){
    if((e.key==='Delete'||e.key==='Backspace')&&sel){e.preventDefault();delNode(sel);}
    if(e.key==='f'||e.key==='F'){e.preventDefault();fitAll();}
  }
});
function closeAllModals(){['rn-bg','lbl-bg','sty-bg','shp-bg','media-bg','voice-bg','txt-bg','chk-bg','lnk-bg'].forEach(function(id){ge(id).classList.remove('open');});}

window.addEventListener('resize',function(){drawGrid();});

/* ─── TEMPLATES ──────────────────────────────────────────────── */
var TEMPLATES=[
  {sec:'Notes',items:[
    {name:'Blank note',desc:'Empty note',bg:'#1a1a24',fn:function(){snapshot();mkNote();}},
    {name:'Daily journal',desc:'Mood, highlights, plans',bg:'#1a1a24',fn:function(){var id=uid(),p=dropPos(230,100);DB().nodes[id]={id:id,type:'note',name:new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'}),parent:DB().current,text:'Mood: \n\nHighlights:\n— \n\nNotes:\n\nTomorrow:\n— ',t:ts()};nod(DB().current).kids.push(id);setPos(DB().current,id,p.x,p.y,null,null);snapshot();saveState();render();setSel(id);openEditor(id);}},
    {name:'Meeting notes',desc:'Agenda, decisions, actions',bg:'#1a1a24',fn:function(){var id=uid(),p=dropPos(230,100);DB().nodes[id]={id:id,type:'note',name:'Meeting Notes',parent:DB().current,text:'Date: \nAttendees:\n\n# Agenda\n1. \n\n# Decisions\n\n# Action Items\n- [ ] ',t:ts()};nod(DB().current).kids.push(id);setPos(DB().current,id,p.x,p.y,null,null);snapshot();saveState();render();setSel(id);openEditor(id);}},
    {name:'Brain dump',desc:'Clear your mind',bg:'#1a1a24',fn:function(){var id=uid(),p=dropPos(230,100);DB().nodes[id]={id:id,type:'note',name:'Brain Dump',parent:DB().current,text:'Everything on my mind right now:\n\n',t:ts()};nod(DB().current).kids.push(id);setPos(DB().current,id,p.x,p.y,null,null);snapshot();saveState();render();setSel(id);openEditor(id);}},
    {name:'Weekly review',desc:'Wins, learnings, next week',bg:'#1a1a24',fn:function(){var id=uid(),p=dropPos(230,100);DB().nodes[id]={id:id,type:'note',name:'Weekly Review — W'+Math.ceil(new Date().getDate()/7),parent:DB().current,text:'# Wins this week\n\n# What I learned\n\n# What didn\'t go well\n\n# Next week focus\n1. \n2. \n3. ',t:ts()};nod(DB().current).kids.push(id);setPos(DB().current,id,p.x,p.y,null,null);snapshot();saveState();render();setSel(id);openEditor(id);}},
  ]},
  {sec:'Stickies',items:[
    {name:'Yellow sticky',desc:'',bg:'#ffd060',fn:function(){ge('sty-bg').classList.add('open');setTimeout(function(){ge('sty-inp').focus();},80);}},
    {name:'Green sticky',desc:'',bg:'#a8f0c6',fn:function(){mkSticky('Add text…','#a8f0c6');}},
    {name:'Pink sticky',desc:'',bg:'#ffa8d5',fn:function(){mkSticky('Add text…','#ffa8d5');}},
    {name:'Blue sticky',desc:'',bg:'#a8ccff',fn:function(){mkSticky('Add text…','#a8ccff');}},
  ]},
  {sec:'Checklists',items:[
    {name:'To-do list',desc:'Basic task list',bg:'#1a1a24',fn:function(){mkChecklist('To-do',[{t:'First task',done:false},{t:'Second task',done:false},{t:'Third task',done:false}]);}},
    {name:'Sprint tasks',desc:'Dev/work checklist',bg:'#1a1a24',fn:function(){mkChecklist('Sprint',[{t:'Plan',done:false},{t:'Design',done:false},{t:'Build',done:false},{t:'Test',done:false},{t:'Ship',done:false}]);}},
    {name:'Shopping list',desc:'Grocery checklist',bg:'#1a1a24',fn:function(){mkChecklist('Shopping',[{t:'Item 1',done:false},{t:'Item 2',done:false},{t:'Item 3',done:false}]);}},
  ]},
  {sec:'Shapes',items:[
    {name:'Blue rectangle',desc:'Outline box',bg:'#1a1a24',fn:function(){mkShape('rect','none','#4f8fff',2,120);}},
    {name:'Green circle',desc:'Round shape',bg:'#1a1a24',fn:function(){mkShape('circle','none','#2fd17a',2,120);}},
    {name:'Arrow right',desc:'Direction marker',bg:'#1a1a24',fn:function(){mkShape('arrow-r','none','#4f8fff',2.5,140);}},
    {name:'Hexagon',desc:'Geometric hex',bg:'#1a1a24',fn:function(){mkShape('hexagon','none','#9b6fff',2,120);}},
    {name:'Chat bubble',desc:'Callout shape',bg:'#1a1a24',fn:function(){mkShape('callout','rgba(79,143,255,0.1)','#4f8fff',2,150);}},
  ]},
  {sec:'Labels',items:[
    {name:'Large heading',desc:'Section title',bg:'#1a1a24',fn:function(){mkLabel('Heading',44,'#eaeaf0');}},
    {name:'Blue label',desc:'Colored heading',bg:'#0d1a33',fn:function(){mkLabel('Section',24,'#4f8fff');}},
    {name:'Small tag',desc:'Annotation',bg:'#1a1a24',fn:function(){mkLabel('tag',13,'#6a6a88');}},
  ]},
  {sec:'Folders & Links',items:[
    {name:'New folder',desc:'Organise cards',bg:'#1a1a24',fn:mkFolder},
    {name:'Link card',desc:'Save any URL',bg:'#1a1a24',fn:function(){ge('lnk-bg').classList.add('open');setTimeout(function(){ge('lnk-url').focus();},80);}},
  ]},
];
function buildTPL(){
  var list=ge('tpl-list');list.innerHTML='';
  TEMPLATES.forEach(function(section){
    var sec=document.createElement('div');sec.className='tpl-sec-label';sec.textContent=section.sec;list.appendChild(sec);
    section.items.forEach(function(tpl){
      var row=document.createElement('div');row.className='tpl-item';
      var col=tpl.bg.startsWith('#ff')||tpl.bg.startsWith('#a8')||tpl.bg.startsWith('#fd')?'rgba(0,0,0,0.55)':'var(--text2)';
      row.innerHTML='<div class="tpl-ico" style="background:'+tpl.bg+';color:'+col+'"><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" fill="currentColor" opacity=".35"/><path d="M5 8h6M5 5.5h4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg></div>'
        +'<div><div class="tpl-name">'+esc(tpl.name)+'</div>'+(tpl.desc?'<div class="tpl-desc">'+esc(tpl.desc)+'</div>':'')+'</div>';
      row.addEventListener('click',function(){tpl.fn();});
      list.appendChild(row);
    });
  });
}

/* ─── TOAST ─────────────────────────────────────────────────── */
var _tt;
function toast(msg){var el=ge('toast');el.textContent=msg;el.classList.add('show');clearTimeout(_tt);_tt=setTimeout(function(){el.classList.remove('show');},2500);}

/* ─── SEED ───────────────────────────────────────────────────── */
function seedBoard(b){
  if((b.nodes[b.root].kids||[]).length>0)return;
  var p=b.pos[b.root];if(!p)p=b.pos[b.root]={};

  var l1=uid();b.nodes[l1]={id:l1,type:'label',name:b.name,parent:b.root,size:48,color:'#4f8fff',t:ts()};
  b.nodes[b.root].kids.push(l1);p[l1]={x:-240,y:-240,w:null,h:null};

  var n1=uid();b.nodes[n1]={id:n1,type:'note',name:'Welcome to ClypPad',parent:b.root,text:'Your infinite canvas — clean, fast, and bug-free.\n\n→ Click any card to edit it\n→ Double-click empty space for a new note\n→ Right-click any card for options\n→ Space + drag to pan on laptop\n→ Pinch or Ctrl+scroll to zoom\n→ Drag the corner ↘ handle to resize\n→ Ctrl+Z to undo, Ctrl+Shift+Z to redo\n→ Double-click a folder to go inside\n→ Use ← Back to navigate up',t:ts()};
  b.nodes[b.root].kids.push(n1);p[n1]={x:-240,y:-140,w:null,h:null};

  var s1=uid();b.nodes[s1]={id:s1,type:'sticky',name:'sticky',text:'Try right-clicking me!',color:'#ffd060',parent:b.root,t:ts()};
  b.nodes[b.root].kids.push(s1);p[s1]={x:60,y:-140,w:null,h:null};

  var c1=uid();b.nodes[c1]={id:c1,type:'checklist',name:'Get started',items:[{t:'Create a note',done:false},{t:'Add a sticky',done:false},{t:'Try a shape',done:false},{t:'Make a folder',done:false}],parent:b.root,t:ts()};
  b.nodes[b.root].kids.push(c1);p[c1]={x:60,y:-240,w:null,h:null};
}

/* ─── INIT ───────────────────────────────────────────────────── */
function init(){
  STATE.boards.forEach(function(b){initBoard(b);seedBoard(b);});
  ACTIVE=STATE.activeBoard||0;
  document.querySelectorAll('.ws-tab').forEach(function(b){b.classList.toggle('active',parseInt(b.dataset.ws)===ACTIVE);});
  buildTPL();
  DB().current=DB().root;
  restoreView(DB().root);
  renderNow();
  updateUndoUI();
}
/* ─── MOBILE SIDEBAR ─────────────────────────────────────────── */
function openMobSidebar(){
  ge('sidebar').classList.add('mob-open');
  ge('mob-overlay').classList.add('mob-open');
}
function closeMobSidebar(){
  ge('sidebar').classList.remove('mob-open');
  ge('mob-overlay').classList.remove('mob-open');
}
ge('mob-menu-btn').addEventListener('click',openMobSidebar);
ge('mob-overlay').addEventListener('click',closeMobSidebar);

init();

// After init (which calls buildTPL), attach mobile close to sidebar items
if(window.innerWidth<=700){
  document.querySelectorAll('#sidebar .sb-btn').forEach(function(btn){
    btn.addEventListener('click',function(){closeMobSidebar();});
  });
  ge('tpl-list').addEventListener('click',function(){closeMobSidebar();});
}
