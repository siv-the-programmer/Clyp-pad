'use strict';
/* ─── UTILS ─────────────────────────────────────────────────── */
var uid=function(){return Date.now().toString(36)+Math.random().toString(36).slice(2,6);};
var ts=function(){return Date.now();};
var ge=function(id){return document.getElementById(id);};
var clamp=function(v,a,b){return Math.max(a,Math.min(b,v));};
var esc=function(s){return String(s||'').replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});};
var ago=function(t){var d=(Date.now()-t)/1000;if(d<60)return 'now';if(d<3600)return Math.floor(d/60)+'m';if(d<86400)return Math.floor(d/3600)+'h';return new Date(t).toLocaleDateString(undefined,{month:'short',day:'numeric'});};
function fmtDur(s){s=Math.floor(s);return Math.floor(s/60)+':'+(s%60<10?'0':'')+s%60;}

/* ─── DB ─────────────────────────────────────────────────────── */
var DB_KEY='cpv6';
function newBoard(name){
  var r=uid();
  return {id:r,name:name||'Board',root:r,current:r,
    nodes:{[r]:{id:r,type:'folder',name:name||'Board',parent:null,kids:[],t:ts()}},
    pos:{[r]:{}},views:{}};
}
function loadState(){
  try{
    var d=JSON.parse(localStorage.getItem(DB_KEY)||'null');
    if(d&&d.boards&&d.boards.length){return d;}
  }catch(e){}
  var b0=newBoard('Board 1'),b1=newBoard('Board 2');
  return{boards:[b0,b1],activeBoard:0};
}
function saveState(){try{localStorage.setItem(DB_KEY,JSON.stringify(STATE));}catch(e){toast('⚠ Storage full — export your board!');}}

var STATE=loadState();
var ACTIVE=STATE.activeBoard||0;
function DB(){return STATE.boards[ACTIVE];}
function nod(id){return DB().nodes[id];}
function posOf(fid,id){if(!DB().pos[fid])DB().pos[fid]={};return DB().pos[fid][id]||null;}
function setPos(fid,id,x,y,w,h){
  if(!DB().pos[fid])DB().pos[fid]={};
  var old=DB().pos[fid][id]||{};
  DB().pos[fid][id]={x:x,y:y,w:w!==undefined?w:old.w||null,h:h!==undefined?h:old.h||null};
}
function setSz(fid,id,w,h){
  if(!DB().pos[fid])DB().pos[fid]={};
  var old=DB().pos[fid][id]||{x:0,y:0};
  DB().pos[fid][id]={x:old.x,y:old.y,w:w,h:h};
}

/* ─── VIEW ──────────────────────────────────────────────────── */
var V={tx:0,ty:0,scale:1};
var MIN_SCALE=0.05,MAX_SCALE=20;
var worldEl=ge('world'),stageEl=ge('stage');
var gridCvs=ge('grid-cvs'),gridCtx=gridCvs.getContext('2d');
var _gRaf=null,_renderRaf=null;

function applyView(){
  worldEl.style.transform='translate('+V.tx+'px,'+V.ty+'px) scale('+V.scale+')';
  ge('zoom-lbl').textContent=Math.round(V.scale*100)+'%';
  if(!_gRaf)_gRaf=requestAnimationFrame(function(){_gRaf=null;drawGrid();});
}
function drawGrid(){
  var W=window.innerWidth,H=window.innerHeight;
  if(gridCvs.width!==W)gridCvs.width=W;
  if(gridCvs.height!==H)gridCvs.height=H;
  gridCtx.clearRect(0,0,W,H);
  var sp=28*V.scale;
  while(sp<14)sp*=2;while(sp>80)sp/=2;
  var ox=((V.tx%sp)+sp)%sp,oy=((V.ty%sp)+sp)%sp;
  gridCtx.fillStyle='rgba(255,255,255,0.04)';
  for(var x=ox;x<W+sp;x+=sp)for(var y=oy;y<H+sp;y+=sp)gridCtx.fillRect(x-1,y-1,2,2);
}
function s2w(sx,sy){return{x:(sx-V.tx)/V.scale,y:(sy-V.ty)/V.scale};}
function w2s(wx,wy){return{x:wx*V.scale+V.tx,y:wy*V.scale+V.ty};}
function zoomAt(cx,cy,f){var b=s2w(cx,cy);V.scale=clamp(V.scale*f,MIN_SCALE,MAX_SCALE);V.tx=cx-b.x*V.scale;V.ty=cy-b.y*V.scale;applyView();}
function fitAll(){
  var folder=nod(DB().current);
  var kids=(folder&&folder.kids||[]).map(function(id){return nod(id);}).filter(Boolean);
  if(!kids.length){V.scale=1;V.tx=window.innerWidth/2-100;V.ty=(window.innerHeight+50)/2-80;applyView();return;}
  var xs=[],ys=[];
  kids.forEach(function(n){
    var p=posOf(DB().current,n.id)||{x:0,y:0,w:null,h:null};
    var w=p.w||defW(n),h=p.h||120;
    xs.push(p.x,p.x+w);ys.push(p.y,p.y+h);
  });
  var x0=Math.min.apply(null,xs)-60,y0=Math.min.apply(null,ys)-60;
  var bw=(Math.max.apply(null,xs)+60)-x0,bh=(Math.max.apply(null,ys)+60)-y0;
  var sw=window.innerWidth,sh=window.innerHeight-110;
  V.scale=clamp(Math.min(sw/bw,sh/bh),MIN_SCALE,MAX_SCALE);
  V.tx=sw/2-(x0+bw/2)*V.scale;V.ty=(sh/2+50)-(y0+bh/2)*V.scale;
  applyView();
}
function defW(n){return n.type==='folder'?160:n.type==='label'?200:n.type==='shape'?140:n.type==='media'?280:210;}
function saveView(){DB().views[DB().current]={tx:V.tx,ty:V.ty,scale:V.scale};}
function restoreView(fid){
  var v=DB().views[fid];
  if(v){V.tx=v.tx;V.ty=v.ty;V.scale=v.scale;applyView();}
  else{V.scale=1;setTimeout(fitAll,30);}
}

/* ─── BREADCRUMB + BACK ─────────────────────────────────────── */
function renderBC(){
  var bc=ge('bc');bc.innerHTML='';
  var cur=DB().current,path=[],c=nod(cur);
  while(c){path.unshift(c);c=c.parent?nod(c.parent):null;}
  var bb=ge('back-btn');
  if(DB().current!==DB().root){
    bb.style.display='flex';
    var pid=nod(DB().current).parent||DB().root;
    bb.onclick=function(){navTo(pid);};
  } else {bb.style.display='none';}
  path.forEach(function(n,i){
    var s=document.createElement('span');s.className='bc-node'+(i===path.length-1?' cur':'');
    s.textContent=n.name;
    if(i<path.length-1)s.onclick=function(){navTo(n.id);};
    bc.appendChild(s);
    if(i<path.length-1){var sep=document.createElement('span');sep.className='bc-sep';sep.textContent='/';bc.appendChild(sep);}
  });
}

/* ─── WORKSPACE ─────────────────────────────────────────────── */
function switchWS(idx){
  if(idx===ACTIVE)return;
  saveView();
  STATE.activeBoard=idx;ACTIVE=idx;
  saveState();
  V={tx:0,ty:0,scale:1};
  restoreView(DB().root);
  DB().current=DB().root;
  sel=null;renderNow();
  ge('back-btn').style.display='none';
  document.querySelectorAll('.ws-btn').forEach(function(b){b.classList.toggle('active',parseInt(b.dataset.ws)===idx);});
  toast('Switched to '+DB().name);
}
document.querySelectorAll('.ws-btn').forEach(function(b){
  b.addEventListener('click',function(){switchWS(parseInt(b.dataset.ws));});
});

/* ─── SELECTION ─────────────────────────────────────────────── */
var sel=null;
function setSel(id){sel=id;worldEl.querySelectorAll('.card').forEach(function(el){el.classList.toggle('sel',el.dataset.id===id);});}
function clearSel(){sel=null;worldEl.querySelectorAll('.card').forEach(function(el){el.classList.remove('sel');});}

/* ─── RENDER ────────────────────────────────────────────────── */
var RH_SVG='<svg width="10" height="10" viewBox="0 0 10 10"><path d="M9 1L1 9M5 1L1 5M9 5L5 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

function render(){
  if(_renderRaf)return;
  _renderRaf=requestAnimationFrame(function(){_renderRaf=null;_doRender();});
}
function renderNow(){if(_renderRaf)cancelAnimationFrame(_renderRaf);_renderRaf=null;_doRender();}
function _doRender(){
  worldEl.querySelectorAll('.card').forEach(function(el){el.remove();});
  renderBC();
  var folder=nod(DB().current);if(!folder)return;
  (folder.kids||[]).forEach(function(id){
    var n=nod(id);if(!n)return;
    var p=posOf(DB().current,id);
    if(!p){var a=Math.random()*Math.PI*2,r=120+Math.random()*160;setPos(DB().current,id,Math.cos(a)*r-90,Math.sin(a)*r-55,null,null);p=posOf(DB().current,id);}
    var el=buildCard(n,p);
    el.dataset.id=id;
    el.style.left=p.x+'px';el.style.top=p.y+'px';
    if(p.w&&n.type!=='label'&&n.type!=='shape')el.style.width=p.w+'px';
    if(p.h&&n.type!=='label'&&n.type!=='shape')el.style.height=p.h+'px';
    if(n.type==='shape'){var sz=p.w||n.sz||120;el.style.width=sz+'px';el.style.height=sz+'px';}
    if(sel===id)el.classList.add('sel');
    attachCardEvents(el,n);
    worldEl.appendChild(el);
  });
}

function buildCard(n,p){
  var el=document.createElement('div');
  if(n.type==='note'){
    el.className='card cn';
    var preview=(n.text||'').replace(/\s+/g,' ').slice(0,200);
    el.innerHTML='<div class="cn-head"><div class="cn-title">'+esc(n.name)+'</div></div>'
      +(preview?'<div class="cn-body">'+esc(preview)+'</div>':'')
      +'<div class="cn-foot"><span>'+ago(n.t)+'</span>'
      +'<button class="cn-edit">✏ Edit</button></div>'
      +'<div class="rh">'+RH_SVG+'</div>';
    el.querySelector('.cn-edit').addEventListener('click',function(e){e.stopPropagation();openEditor(n.id);});
  } else if(n.type==='folder'){
    el.className='card cf';
    var cnt=(n.kids||[]).length;
    el.innerHTML='<div class="cf-ico">📁</div><div class="cf-name">'+esc(n.name)+'</div>'
      +'<div class="cf-meta">'+cnt+' item'+(cnt!==1?'s':'')+'</div>'
      +'<div class="cf-hint">Double-click to open →</div>'
      +'<div class="rh">'+RH_SVG+'</div>';
  } else if(n.type==='label'){
    el.className='card cl';
    el.innerHTML='<button class="cl-edit">✏</button>'
      +'<div class="cl-text" style="font-size:'+n.size+'px;color:'+n.color+';">'+esc(n.name)+'</div>'
      +'<div class="rh">'+RH_SVG+'</div>';
    el.querySelector('.cl-edit').addEventListener('click',function(e){e.stopPropagation();openTxtEdit(n.id);});
  } else if(n.type==='sticky'){
    el.className='card cs';
    el.style.background=n.color||'#ffd060';el.style.borderColor='rgba(0,0,0,0.07)';
    el.innerHTML='<div class="cs-inner">'+esc(n.text||n.name||'')+'</div>'
      +'<div class="cs-foot"><span>'+ago(n.t)+'</span>'
      +'<button class="cs-edit">✏</button></div>'
      +'<div class="rh">'+RH_SVG+'</div>';
    el.querySelector('.cs-edit').addEventListener('click',function(e){e.stopPropagation();openTxtEdit(n.id);});
  } else if(n.type==='checklist'){
    el.className='card cch';
    var items=(n.items||[]).map(function(it,i){
      return '<div class="cch-item'+(it.done?' done-item':'')+'"><div class="cch-box'+(it.done?' done':'')+'" data-idx="'+i+'"></div><span class="cch-lbl">'+esc(it.t)+'</span></div>';
    }).join('');
    el.innerHTML='<div class="cch-title">'+esc(n.name)+'</div>'+items+'<div class="rh">'+RH_SVG+'</div>';
    el.querySelectorAll('.cch-box').forEach(function(box){
      box.addEventListener('click',function(e){
        e.stopPropagation();
        n.items[parseInt(box.dataset.idx)].done=!n.items[parseInt(box.dataset.idx)].done;
        n.t=ts();saveState();render();setSel(n.id);
      });
    });
  } else if(n.type==='link'){
    el.className='card clk';
    el.innerHTML='<div class="clk-title">'+esc(n.name)+'</div>'
      +'<div class="clk-url">'+esc(n.url||'')+'</div>'
      +(n.desc?'<div class="clk-desc">'+esc(n.desc)+'</div>':'')
      +'<div class="rh">'+RH_SVG+'</div>';
    el.querySelector('.clk-url').addEventListener('click',function(e){e.stopPropagation();window.open(n.url,'_blank');});
  } else if(n.type==='media'){
    el.className='card cmed';
    if(n.mediaType==='video'){
      el.innerHTML='<video src="'+n.src+'" controls></video>'
        +(n.caption?'<div class="cmed-cap">'+esc(n.caption)+'</div>':'')
        +'<div class="rh">'+RH_SVG+'</div>';
      el.querySelector('video').addEventListener('pointerdown',function(e){e.stopPropagation();});
    } else {
      el.innerHTML='<img src="'+n.src+'" draggable="false">'
        +(n.caption?'<div class="cmed-cap">'+esc(n.caption)+'</div>':'')
        +'<div class="rh">'+RH_SVG+'</div>';
    }
  } else if(n.type==='voice'){
    el.className='card cvoc';
    var bars='';for(var bi=0;bi<18;bi++)bars+='<span style="height:'+(Math.random()*18+4)+'px;opacity:'+(Math.random()*.5+.15).toFixed(2)+'"></span>';
    el.innerHTML='<div class="cvoc-top"><div class="cvoc-ico">🎙</div><div><div class="cvoc-name">'+esc(n.name)+'</div><div class="cvoc-dur">'+esc(n.dur||'')+'</div></div></div>'
      +'<div class="cvoc-bars">'+bars+'</div>'
      +'<div style="display:flex;align-items:center;gap:8px">'
      +'<button class="vplay" data-id="'+n.id+'">▶</button>'
      +'<span style="font-size:11px;color:var(--sub);font-family:var(--mono)" id="vt-'+n.id+'">'+esc(n.dur||'0:00')+'</span></div>'
      +'<div class="rh">'+RH_SVG+'</div>';
    el.querySelector('.vplay').addEventListener('click',function(e){
      e.stopPropagation();
      var btn=this,nid=btn.dataset.id,n2=nod(nid);if(!n2||!n2.src)return;
      if(!_auds[nid]){
        _auds[nid]=new Audio(n2.src);
        _auds[nid].addEventListener('timeupdate',function(){var t=ge('vt-'+nid);if(t)t.textContent=fmtDur(this.currentTime);});
        _auds[nid].addEventListener('ended',function(){var t=ge('vt-'+nid);if(t)t.textContent=n2.dur;btn.textContent='▶';});
      }
      if(_auds[nid].paused){_auds[nid].play();btn.textContent='⏸';}
      else{_auds[nid].pause();btn.textContent='▶';}
    });
  } else if(n.type==='shape'){
    el.className='card cshp';
    var sz=p&&p.w||n.sz||120;
    el.innerHTML=buildShapeSVG(n,sz)+'<div class="rh">'+RH_SVG+'</div>';
  }
  return el;
}

/* ─── CARD EVENTS ───────────────────────────────────────────── */
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

/* ─── DRAG ──────────────────────────────────────────────────── */
function attachDrag(el,n){
  var dragging=false,moved=false,startWX,startWY,startPX,startPY,startDist=0;
  // track pointer down time to distinguish click vs drag
  var downTime=0;

  el.addEventListener('pointerdown',function(e){
    if(e.button!==0)return;
    // don't start drag from interactive children
    var t=e.target;
    if(t.closest('.rh')||t.closest('.cn-edit')||t.closest('.cs-edit')||
       t.closest('.cl-edit')||t.closest('.cch-box')||t.closest('.clk-url')||
       t.closest('.vplay')||t.closest('video')||t.closest('button'))return;
    e.stopPropagation();
    setSel(n.id);downTime=Date.now();
    dragging=true;moved=false;startDist=0;
    el.setPointerCapture(e.pointerId);
    var wp=s2w(e.clientX,e.clientY);startWX=wp.x;startWY=wp.y;
    var p=posOf(DB().current,n.id);startPX=p.x;startPY=p.y;
  });

  el.addEventListener('pointermove',function(e){
    if(!dragging)return;
    var wp=s2w(e.clientX,e.clientY);
    var dx=wp.x-startWX,dy=wp.y-startWY;
    startDist=Math.sqrt(dx*dx+dy*dy);
    if(startDist>4){moved=true;el.classList.add('dragging');}
    if(!moved)return;
    var nx=startPX+dx,ny=startPY+dy;
    var old=DB().pos[DB().current][n.id]||{};
    DB().pos[DB().current][n.id]={x:nx,y:ny,w:old.w,h:old.h};
    el.style.left=nx+'px';el.style.top=ny+'px';
  });

  el.addEventListener('pointerup',function(e){
    el.classList.remove('dragging');
    if(!dragging)return;
    dragging=false;
    if(moved){saveState();return;}
    // it was a click (not drag) — only open on double-click for folder
    if(n.type==='folder'){
      // single click selects, dbl-click opens — handled by dblclick below
      return;
    }
    if(n.type==='note'&&(Date.now()-downTime)<400){openEditor(n.id);}
  });

  // double-click to open folder (won't fire if dragging since we pointercancel)
  el.addEventListener('dblclick',function(e){
    e.stopPropagation();
    if(moved)return;
    if(n.type==='folder')navTo(n.id);
    else if(n.type==='note')openEditor(n.id);
    else if(n.type==='sticky'||n.type==='label')openTxtEdit(n.id);
  });

  el.addEventListener('pointercancel',function(){el.classList.remove('dragging');dragging=false;});
}

/* ─── RESIZE ────────────────────────────────────────────────── */
function attachResize(el,n){
  var rh=el.querySelector('.rh');if(!rh)return;
  var isRes=false,startX,startY,startW,startH;
  rh.addEventListener('pointerdown',function(e){
    e.stopPropagation();e.preventDefault();
    isRes=true;rh.setPointerCapture(e.pointerId);
    startX=e.clientX;startY=e.clientY;
    startW=el.offsetWidth;startH=el.offsetHeight;
  });
  rh.addEventListener('pointermove',function(e){
    if(!isRes)return;
    var nw=Math.max(120,startW+(e.clientX-startX)/V.scale);
    var nh=Math.max(60,startH+(e.clientY-startY)/V.scale);
    el.style.width=nw+'px';el.style.height=nh+'px';
    // scale font inside cards proportionally
    scaleCardText(el,n,nw,nh,startW,startH);
    setSz(DB().current,n.id,nw,nh);
  });
  rh.addEventListener('pointerup',function(){if(!isRes)return;isRes=false;saveState();});
}

function scaleCardText(el,n,nw,nh,origW,origH){
  // scale font sizes of text inside the card proportionally to width change
  if(!origW||origW===nw)return;
  var ratio=nw/origW;
  if(n.type==='note'){
    var title=el.querySelector('.cn-title');
    var body=el.querySelector('.cn-body');
    if(title)title.style.fontSize=(12.5*ratio).toFixed(1)+'px';
    if(body)body.style.fontSize=(11.5*ratio).toFixed(1)+'px';
  } else if(n.type==='sticky'){
    var inner=el.querySelector('.cs-inner');
    if(inner)inner.style.fontSize=(12*ratio).toFixed(1)+'px';
  } else if(n.type==='checklist'){
    var items=el.querySelectorAll('.cch-item');
    items.forEach(function(item){item.style.fontSize=(12*ratio).toFixed(1)+'px';});
  }
}

function attachLabelResize(el,n){
  var rh=el.querySelector('.rh');if(!rh)return;
  var isRes=false,startX,startY,startSz;
  rh.addEventListener('pointerdown',function(e){
    e.stopPropagation();e.preventDefault();
    isRes=true;rh.setPointerCapture(e.pointerId);
    startX=e.clientX;startY=e.clientY;startSz=n.size||20;
  });
  rh.addEventListener('pointermove',function(e){
    if(!isRes)return;
    var delta=((e.clientX-startX)+(e.clientY-startY))/V.scale;
    var ns=Math.max(8,Math.min(200,Math.round(startSz+delta*0.35)));
    n.size=ns;
    var txt=el.querySelector('.cl-text');
    if(txt)txt.style.fontSize=ns+'px';
  });
  rh.addEventListener('pointerup',function(){if(!isRes)return;isRes=false;n.t=ts();saveState();});
}

function attachShapeResize(el,n){
  var rh=el.querySelector('.rh');if(!rh)return;
  var isRes=false,startX,startY,startSz;
  rh.addEventListener('pointerdown',function(e){
    e.stopPropagation();e.preventDefault();
    isRes=true;rh.setPointerCapture(e.pointerId);
    startX=e.clientX;startY=e.clientY;
    startSz=parseInt(el.style.width)||n.sz||120;
  });
  rh.addEventListener('pointermove',function(e){
    if(!isRes)return;
    var d=((e.clientX-startX)+(e.clientY-startY))/V.scale;
    var sz=Math.max(40,Math.round(startSz+d));
    el.style.width=sz+'px';el.style.height=sz+'px';
    // rebuild SVG at new size (excluding the rh div)
    var oldRh=el.querySelector('.rh');
    el.innerHTML=buildShapeSVG(n,sz)+'<div class="rh">'+RH_SVG+'</div>';
    setSz(DB().current,n.id,sz,sz);
  });
  rh.addEventListener('pointerup',function(){if(!isRes)return;isRes=false;saveState();});
}

/* ─── SHAPES ────────────────────────────────────────────────── */
var SHAPES=[
  {id:'rect',label:'Rect',icon:'▭'},{id:'circle',label:'Circle',icon:'◯'},
  {id:'triangle',label:'Tri',icon:'△'},{id:'diamond',label:'Diamond',icon:'◇'},
  {id:'star',label:'Star',icon:'☆'},{id:'arrow-r',label:'→',icon:'→'},
  {id:'arrow-l',label:'←',icon:'←'},{id:'line-h',label:'—',icon:'—'},
  {id:'line-v',label:'|',icon:'|'},{id:'line-d',label:'↘',icon:'↘'},
  {id:'line-dl',label:'↙',icon:'↙'},{id:'bracket',label:'[ ]',icon:'[]'},
];
function buildShapeSVG(n,sz){
  var f=n.fill||'none',s=n.stroke||'#4f8fff',sw=n.sw||2.5,h=sz,p=sw/2;
  var svg='<svg width="'+sz+'" height="'+h+'" viewBox="0 0 '+sz+' '+h+'" xmlns="http://www.w3.org/2000/svg">';
  var sh=n.shape||'rect';
  if(sh==='rect')svg+='<rect x="'+p+'" y="'+p+'" width="'+(sz-sw)+'" height="'+(h-sw)+'" fill="'+f+'" stroke="'+s+'" stroke-width="'+sw+'" rx="4"/>';
  else if(sh==='circle'){var r=(sz-sw)/2;svg+='<circle cx="'+(sz/2)+'" cy="'+(h/2)+'" r="'+r+'" fill="'+f+'" stroke="'+s+'" stroke-width="'+sw+'"/>';}
  else if(sh==='triangle')svg+='<polygon points="'+(sz/2)+','+p+' '+(sz-p)+','+(h-p)+' '+p+','+(h-p)+'" fill="'+f+'" stroke="'+s+'" stroke-width="'+sw+'"/>';
  else if(sh==='diamond')svg+='<polygon points="'+(sz/2)+','+p+' '+(sz-p)+','+(h/2)+' '+(sz/2)+','+(h-p)+' '+p+','+(h/2)+'" fill="'+f+'" stroke="'+s+'" stroke-width="'+sw+'"/>';
  else if(sh==='star'){
    var cx=sz/2,cy=h/2,ro=(sz-sw)/2,ri=ro*0.42,pts='';
    for(var i=0;i<10;i++){var ang=Math.PI/5*i-Math.PI/2,r2=i%2===0?ro:ri;pts+=(cx+r2*Math.cos(ang)).toFixed(2)+','+(cy+r2*Math.sin(ang)).toFixed(2)+(i<9?' ':'');}
    svg+='<polygon points="'+pts+'" fill="'+f+'" stroke="'+s+'" stroke-width="'+sw+'"/>';
  }
  else if(sh==='arrow-r'){var m=h/2;svg+='<polyline points="'+p+','+m+' '+(sz-p)+','+m+'" fill="none" stroke="'+s+'" stroke-width="'+sw+'" stroke-linecap="round"/><polyline points="'+(sz-p-14)+','+(m-11)+' '+(sz-p)+','+m+' '+(sz-p-14)+','+(m+11)+'" fill="none" stroke="'+s+'" stroke-width="'+sw+'" stroke-linecap="round" stroke-linejoin="round"/>';}
  else if(sh==='arrow-l'){var m2=h/2;svg+='<polyline points="'+(sz-p)+','+m2+' '+p+','+m2+'" fill="none" stroke="'+s+'" stroke-width="'+sw+'" stroke-linecap="round"/><polyline points="'+(p+14)+','+(m2-11)+' '+p+','+m2+' '+(p+14)+','+(m2+11)+'" fill="none" stroke="'+s+'" stroke-width="'+sw+'" stroke-linecap="round" stroke-linejoin="round"/>';}
  else if(sh==='line-h')svg+='<line x1="'+p+'" y1="'+(h/2)+'" x2="'+(sz-p)+'" y2="'+(h/2)+'" stroke="'+s+'" stroke-width="'+sw+'" stroke-linecap="round"/>';
  else if(sh==='line-v')svg+='<line x1="'+(sz/2)+'" y1="'+p+'" x2="'+(sz/2)+'" y2="'+(h-p)+'" stroke="'+s+'" stroke-width="'+sw+'" stroke-linecap="round"/>';
  else if(sh==='line-d')svg+='<line x1="'+p+'" y1="'+p+'" x2="'+(sz-p)+'" y2="'+(h-p)+'" stroke="'+s+'" stroke-width="'+sw+'" stroke-linecap="round"/>';
  else if(sh==='line-dl')svg+='<line x1="'+(sz-p)+'" y1="'+p+'" x2="'+p+'" y2="'+(h-p)+'" stroke="'+s+'" stroke-width="'+sw+'" stroke-linecap="round"/>';
  else if(sh==='bracket')svg+='<path d="M'+(sz*0.35)+','+p+' L'+p+','+p+' L'+p+','+(h-p)+' L'+(sz*0.35)+','+(h-p)+'" fill="none" stroke="'+s+'" stroke-width="'+sw+'" stroke-linecap="round" stroke-linejoin="round"/><path d="M'+(sz*0.65)+','+p+' L'+(sz-p)+','+p+' L'+(sz-p)+','+(h-p)+' L'+(sz*0.65)+','+(h-p)+'" fill="none" stroke="'+s+'" stroke-width="'+sw+'" stroke-linecap="round" stroke-linejoin="round"/>';
  return svg+'</svg>';
}

/* ─── NAV ───────────────────────────────────────────────────── */
function navTo(fid){saveView();DB().current=fid;sel=null;restoreView(fid);renderNow();}

/* ─── DROP POS ──────────────────────────────────────────────── */
function dropPos(w,h){
  var cx=window.innerWidth/2+(Math.random()-.5)*80;
  var cy=(window.innerHeight+50)/2+(Math.random()-.5)*60;
  var wp=s2w(cx,cy);return{x:wp.x-(w/2),y:wp.y-(h/2)};
}

/* ─── CREATE NODES ──────────────────────────────────────────── */
function mkNote(text){
  var id=uid(),p=dropPos(220,100);
  DB().nodes[id]={id:id,type:'note',name:'Untitled',parent:DB().current,text:text||'',t:ts()};
  nod(DB().current).kids.push(id);setPos(DB().current,id,p.x,p.y,null,null);
  saveState();render();setSel(id);if(!text)openEditor(id);
}
function mkFolder(){
  var id=uid(),p=dropPos(160,130);
  DB().nodes[id]={id:id,type:'folder',name:'New Folder',parent:DB().current,kids:[],t:ts()};
  nod(DB().current).kids.push(id);DB().pos[id]={};setPos(DB().current,id,p.x,p.y,null,null);
  saveState();render();setSel(id);doRename(id);
}
function mkLabel(txt,size,color){
  var id=uid(),p=dropPos(180,50);
  DB().nodes[id]={id:id,type:'label',name:txt,parent:DB().current,size:size,color:color,t:ts()};
  nod(DB().current).kids.push(id);setPos(DB().current,id,p.x,p.y,null,null);
  saveState();render();setSel(id);
}
function mkSticky(txt,color){
  var id=uid(),p=dropPos(180,120);
  DB().nodes[id]={id:id,type:'sticky',name:'sticky',text:txt,color:color,parent:DB().current,t:ts()};
  nod(DB().current).kids.push(id);setPos(DB().current,id,p.x,p.y,null,null);
  saveState();render();setSel(id);
}
function mkChecklist(name,items){
  var id=uid(),p=dropPos(220,140);
  DB().nodes[id]={id:id,type:'checklist',name:name,items:items,parent:DB().current,t:ts()};
  nod(DB().current).kids.push(id);setPos(DB().current,id,p.x,p.y,null,null);
  saveState();render();setSel(id);
}
function mkLink(title,url,desc){
  var id=uid(),p=dropPos(230,90);
  DB().nodes[id]={id:id,type:'link',name:title,url:url,desc:desc||'',parent:DB().current,t:ts()};
  nod(DB().current).kids.push(id);setPos(DB().current,id,p.x,p.y,null,null);
  saveState();render();setSel(id);
}
function mkShape(shape,fill,stroke,sw,sz){
  var id=uid(),p=dropPos(sz,sz);
  DB().nodes[id]={id:id,type:'shape',shape:shape,fill:fill,stroke:stroke,sw:sw,sz:sz,name:shape,parent:DB().current,t:ts()};
  nod(DB().current).kids.push(id);setPos(DB().current,id,p.x,p.y,sz,sz);
  saveState();render();setSel(id);
}
function delNode(id){
  var n=nod(id);if(!n)return;
  if(n.parent&&nod(n.parent)){
    nod(n.parent).kids=(nod(n.parent).kids||[]).filter(function(k){return k!==id;});
    if(DB().pos[n.parent])delete DB().pos[n.parent][id];
  }
  function rm(nid){var x=nod(nid);if(!x)return;if(x.type==='folder')(x.kids||[]).forEach(rm);delete DB().nodes[nid];delete DB().pos[nid];}
  rm(id);if(sel===id)sel=null;if(openFileId===id)closeEditor(true);
  saveState();render();toast('Deleted');
}
function dupNode(id){
  var n=nod(id);if(!n||n.type==='folder')return;
  var nid=uid(),copy=JSON.parse(JSON.stringify(n));copy.id=nid;copy.t=ts();copy.parent=DB().current;
  DB().nodes[nid]=copy;nod(DB().current).kids.push(nid);
  var p=posOf(DB().current,id)||{x:0,y:0,w:null,h:null};
  setPos(DB().current,nid,p.x+28,p.y+28,p.w,p.h);
  saveState();render();setSel(nid);toast('Duplicated');
}

/* ─── NOTE EDITOR ───────────────────────────────────────────── */
var openFileId=null,edDirty=false,edTimer=null;
function openEditor(id){
  var n=nod(id);if(!n||n.type!=='note')return;
  if(edDirty&&openFileId)flushEd();
  openFileId=id;edDirty=false;
  ge('ed-nm').value=n.name;ge('ed-ta').value=n.text||'';
  updateEdStat();ge('ed-dot').className='saved';
  ge('ed-bg').classList.add('open');setTimeout(function(){ge('ed-ta').focus();},80);
}
function closeEditor(silent){if(!silent&&edDirty&&openFileId)flushEd();openFileId=null;edDirty=false;ge('ed-bg').classList.remove('open');}
function flushEd(){
  if(!openFileId)return;var n=nod(openFileId);if(!n)return;
  n.text=ge('ed-ta').value;n.name=ge('ed-nm').value.trim()||n.name;n.t=ts();
  edDirty=false;ge('ed-dot').className='saved';saveState();render();
}
function updateEdStat(){var v=ge('ed-ta').value,w=v.trim()?v.trim().split(/\s+/).length:0;ge('ed-stat').textContent=w+'w';}
ge('ed-ta').addEventListener('input',function(){edDirty=true;ge('ed-dot').className='dirty';updateEdStat();clearTimeout(edTimer);edTimer=setTimeout(function(){if(edDirty)flushEd();},800);});
ge('ed-nm').addEventListener('input',function(){edDirty=true;ge('ed-dot').className='dirty';});
ge('ed-cl').addEventListener('click',function(){flushEd();closeEditor(true);});
ge('ed-bg').addEventListener('mousedown',function(e){if(e.target===ge('ed-bg')){flushEd();closeEditor(true);}});

/* ─── TEXT EDIT (sticky / label) ───────────────────────────── */
var txtId=null;
function openTxtEdit(id){
  var n=nod(id);if(!n)return;
  txtId=id;
  ge('txt-title').textContent=n.type==='label'?'Edit Label':n.type==='sticky'?'Edit Sticky':'Edit';
  ge('txt-inp').value=n.type==='sticky'?(n.text||n.name||''):(n.name||'');
  // extra controls for label
  var extra=ge('txt-extra');extra.innerHTML='';
  if(n.type==='label'){
    extra.innerHTML='<div class="mrow2" style="margin-top:4px">'
      +'<div><label class="mlbl">Size</label><select class="msel" id="txt-sz"><option value="13">Small</option><option value="20">Medium</option><option value="32">Large</option><option value="52">Huge</option></select></div>'
      +'<div><label class="mlbl">Color</label><select class="msel" id="txt-col"><option value="#eaeaf0">White</option><option value="#4f8fff">Blue</option><option value="#2fd17a">Green</option><option value="#ffd060">Yellow</option><option value="#9b6fff">Purple</option><option value="#ff6eb4">Pink</option><option value="#f05858">Red</option></select></div>'
      +'</div>';
    ge('txt-sz').value=n.size||20;ge('txt-col').value=n.color||'#eaeaf0';
  }
  ge('txt-bg').classList.add('open');setTimeout(function(){ge('txt-inp').focus();ge('txt-inp').select();},80);
}
function commitTxtEdit(){
  var n=txtId&&nod(txtId);if(!n)return;
  var v=ge('txt-inp').value.trim();if(!v)return;
  if(n.type==='sticky'){n.text=v;n.name='sticky';}
  else if(n.type==='label'){
    n.name=v;
    var sz=ge('txt-sz');if(sz)n.size=parseInt(sz.value)||n.size;
    var col=ge('txt-col');if(col)n.color=col.value||n.color;
  } else n.name=v;
  n.t=ts();saveState();render();setSel(txtId);
  ge('txt-bg').classList.remove('open');txtId=null;
  toast('Updated');
}
ge('txt-ok').addEventListener('click',commitTxtEdit);
ge('txt-cancel').addEventListener('click',function(){ge('txt-bg').classList.remove('open');txtId=null;});
ge('txt-cl').addEventListener('click',function(){ge('txt-bg').classList.remove('open');txtId=null;});
ge('txt-bg').addEventListener('mousedown',function(e){if(e.target===ge('txt-bg'))ge('txt-bg').classList.remove('open');});
ge('txt-inp').addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey)commitTxtEdit();});

/* ─── RENAME ────────────────────────────────────────────────── */
var rnId=null;
function doRename(id){rnId=id;var n=nod(id);ge('rn-title').textContent='Rename '+n.type;ge('rn-inp').value=n.name;ge('rn-bg').classList.add('open');setTimeout(function(){ge('rn-inp').focus();ge('rn-inp').select();},80);}
function commitRename(){if(!rnId)return;var v=ge('rn-inp').value.trim();if(!v)return;nod(rnId).name=v;nod(rnId).t=ts();if(openFileId===rnId)ge('ed-nm').value=v;saveState();render();ge('rn-bg').classList.remove('open');rnId=null;toast('Renamed');}
ge('rn-ok').addEventListener('click',commitRename);
ge('rn-cancel').addEventListener('click',function(){ge('rn-bg').classList.remove('open');rnId=null;});
ge('rn-cl').addEventListener('click',function(){ge('rn-bg').classList.remove('open');rnId=null;});
ge('rn-bg').addEventListener('mousedown',function(e){if(e.target===ge('rn-bg'))ge('rn-bg').classList.remove('open');});
ge('rn-inp').addEventListener('keydown',function(e){if(e.key==='Enter')commitRename();if(e.key==='Escape')ge('rn-bg').classList.remove('open');});

/* ─── LABEL MODAL ───────────────────────────────────────────── */
ge('lbl-ok').addEventListener('click',function(){var t=ge('lbl-inp').value.trim();if(!t)return;mkLabel(t,parseInt(ge('lbl-size').value),ge('lbl-color').value);ge('lbl-inp').value='';ge('lbl-bg').classList.remove('open');});
ge('lbl-cancel').addEventListener('click',function(){ge('lbl-bg').classList.remove('open');});
ge('lbl-cl').addEventListener('click',function(){ge('lbl-bg').classList.remove('open');});
ge('lbl-bg').addEventListener('mousedown',function(e){if(e.target===ge('lbl-bg'))ge('lbl-bg').classList.remove('open');});
ge('lbl-inp').addEventListener('keydown',function(e){if(e.key==='Enter')ge('lbl-ok').click();});

/* ─── STICKY MODAL ──────────────────────────────────────────── */
var _styC='#ffd060';
ge('sty-swatches').querySelectorAll('.sw').forEach(function(sw){
  sw.addEventListener('click',function(){ge('sty-swatches').querySelectorAll('.sw').forEach(function(s){s.classList.remove('on');});sw.classList.add('on');_styC=sw.dataset.c;});
});
ge('sty-ok').addEventListener('click',function(){var t=ge('sty-inp').value.trim();if(!t)return;mkSticky(t,_styC);ge('sty-inp').value='';ge('sty-bg').classList.remove('open');});
ge('sty-cancel').addEventListener('click',function(){ge('sty-bg').classList.remove('open');});
ge('sty-cl').addEventListener('click',function(){ge('sty-bg').classList.remove('open');});
ge('sty-bg').addEventListener('mousedown',function(e){if(e.target===ge('sty-bg'))ge('sty-bg').classList.remove('open');});

/* ─── SHAPE MODAL ───────────────────────────────────────────── */
var _shpSel='rect',_shpFill='none',_shpStroke='#4f8fff';
var _swColors=['none','#ffffff','#ffd060','#2fd17a','#4f8fff','#f05858','#9b6fff','#ff6eb4','#1c1c22','#eaeaf0'];

function buildSwatches(el,current,setter){
  el.innerHTML='';
  _swColors.forEach(function(c){
    var sw=document.createElement('div');sw.className='sw'+(c===current?' on':'');
    if(c==='none'){sw.style.cssText='width:26px;height:26px;border-radius:7px;cursor:pointer;border:2px solid var(--border2);background:transparent;position:relative;overflow:hidden;';sw.innerHTML='<svg width="26" height="26" style="position:absolute;inset:0"><line x1="0" y1="0" x2="26" y2="26" stroke="#f05858" stroke-width="1.5"/></svg>';}
    else{sw.style.cssText='width:26px;height:26px;border-radius:7px;cursor:pointer;border:2px solid '+(c===current?'#fff':'transparent')+';background:'+c+';';}
    sw.addEventListener('click',function(){el.querySelectorAll('.sw').forEach(function(s){s.classList.remove('on');s.style.borderColor='transparent';});sw.classList.add('on');sw.style.borderColor='#fff';setter(c);});
    el.appendChild(sw);
  });
}

function openShapeModal(){
  var grid=ge('shp-grid');grid.innerHTML='';
  SHAPES.forEach(function(sh){
    var btn=document.createElement('div');btn.className='shp-btn'+(sh.id===_shpSel?' on':'');
    btn.innerHTML=sh.icon+'<span>'+sh.label+'</span>';
    btn.addEventListener('click',function(){grid.querySelectorAll('.shp-btn').forEach(function(b){b.classList.remove('on');});btn.classList.add('on');_shpSel=sh.id;});
    grid.appendChild(btn);
  });
  buildSwatches(ge('shp-fill'),_shpFill,function(c){_shpFill=c;});
  buildSwatches(ge('shp-stroke'),_shpStroke,function(c){_shpStroke=c;});
  ge('shp-bg').classList.add('open');
}
ge('shp-ok').addEventListener('click',function(){
  mkShape(_shpSel,_shpFill,_shpStroke,parseFloat(ge('shp-sw').value),parseInt(ge('shp-sz').value));
  ge('shp-bg').classList.remove('open');
});
ge('shp-cancel').addEventListener('click',function(){ge('shp-bg').classList.remove('open');});
ge('shp-cl').addEventListener('click',function(){ge('shp-bg').classList.remove('open');});
ge('shp-bg').addEventListener('mousedown',function(e){if(e.target===ge('shp-bg'))ge('shp-bg').classList.remove('open');});

/* ─── CONTEXT MENU ──────────────────────────────────────────── */
var ctxId=null,ctxEl=ge('ctx');
var _ctxOpen=false;

// Use mousedown with capture so we can close ctx before other handlers fire
document.addEventListener('mousedown',function(e){
  // close ctx if clicking outside it
  if(_ctxOpen&&!ctxEl.contains(e.target)){hideCtx();}
  // close cpick if clicking outside it
  if(cpickId!==null&&!ge('cpick').contains(e.target)){hideCpick();}
},{capture:true});

function showCtx(x,y,id){
  ctxId=id;var n=nod(id);
  ge('ctx-open').style.display=n.type==='folder'?'flex':'none';
  ge('ctx-edit').style.display=(n.type==='note'||n.type==='sticky'||n.type==='label')?'flex':'none';
  ge('ctx-rename').style.display=n.type!=='shape'?'flex':'none';
  ge('ctx-copy').style.display=n.type==='note'?'flex':'none';
  ge('ctx-dup').style.display=n.type!=='folder'?'flex':'none';
  ge('ctx-color').style.display=(n.type==='sticky'||n.type==='label')?'flex':'none';
  ctxEl.style.left=Math.min(x,window.innerWidth-190)+'px';
  ctxEl.style.top=Math.min(y,window.innerHeight-230)+'px';
  ctxEl.style.display='block';_ctxOpen=true;
}
function hideCtx(){ctxEl.style.display='none';_ctxOpen=false;ctxId=null;}

ge('ctx-open').addEventListener('click',function(){var id=ctxId;hideCtx();if(id)navTo(id);});
ge('ctx-edit').addEventListener('click',function(){var id=ctxId;hideCtx();if(!id)return;var n=nod(id);if(n.type==='note')openEditor(id);else openTxtEdit(id);});
ge('ctx-rename').addEventListener('click',function(){var id=ctxId;hideCtx();if(id)doRename(id);});
ge('ctx-copy').addEventListener('click',function(){var n=ctxId&&nod(ctxId);var id=ctxId;hideCtx();if(n&&n.text)navigator.clipboard.writeText(n.text).then(function(){toast('Copied!');});});
ge('ctx-dup').addEventListener('click',function(){var id=ctxId;hideCtx();if(id)dupNode(id);});
ge('ctx-del').addEventListener('click',function(){var id=ctxId;hideCtx();if(id)delNode(id);});
ge('ctx-color').addEventListener('click',function(){var id=ctxId;hideCtx();if(id)showCpick(id);});

/* ─── COLOR PICKER ──────────────────────────────────────────── */
var cpickId=null;
var cpEl=ge('cpick'),cpRow=cpEl.querySelector('.sw-row');
var cpColors=['#ffd060','#a8f0c6','#ffa8d5','#a8ccff','#d4a8ff','#ffc8a8','#f05858','#4f8fff','#2fd17a','#9b6fff','#ff6eb4','#ffffff','#eaeaf0','#1c1c22'];
cpColors.forEach(function(c){
  var sw=document.createElement('div');sw.className='sw';
  sw.style.cssText='width:26px;height:26px;border-radius:7px;background:'+c+';cursor:pointer;border:2px solid transparent;';
  sw.addEventListener('mouseenter',function(){sw.style.transform='scale(1.12)';});
  sw.addEventListener('mouseleave',function(){sw.style.transform='';});
  sw.addEventListener('click',function(){
    if(!cpickId)return;var n=nod(cpickId);if(!n)return;
    if(n.type==='sticky')n.color=c;
    else if(n.type==='label')n.color=c;
    var id=cpickId;hideCpick();saveState();render();setSel(id);toast('Color updated');
  });
  cpRow.appendChild(sw);
});
function showCpick(id){
  cpickId=id;
  var cardEl=worldEl.querySelector('[data-id="'+id+'"]');
  cpEl.style.display='block';
  if(cardEl){
    var r=cardEl.getBoundingClientRect();
    cpEl.style.left=Math.min(r.left,window.innerWidth-180)+'px';
    cpEl.style.top=Math.min(r.bottom+5,window.innerHeight-90)+'px';
  } else {cpEl.style.left=(window.innerWidth/2-80)+'px';cpEl.style.top='50%';}
}
function hideCpick(){cpEl.style.display='none';cpickId=null;}

/* ─── PAN ───────────────────────────────────────────────────── */
var panning=false,panStart={};
// Track modifier keys for space-pan and also allow trackpad two-finger scroll
var spaceDown=false;

document.addEventListener('keydown',function(e){
  if(e.code==='Space'&&!e.target.matches('input,textarea,select')){
    e.preventDefault();spaceDown=true;stageEl.style.cursor='grab';
  }
},true);
document.addEventListener('keyup',function(e){
  if(e.code==='Space'){spaceDown=false;if(!panning)stageEl.style.cursor='';}
});

stageEl.addEventListener('pointerdown',function(e){
  // pan with middle mouse or space+left or two-finger trackpad emulated as middle
  if(e.button===1||(e.button===0&&spaceDown)){
    e.preventDefault();panning=true;
    stageEl.style.cursor='grabbing';
    stageEl.setPointerCapture(e.pointerId);
    panStart={x:e.clientX,y:e.clientY,tx:V.tx,ty:V.ty};
  }
});
stageEl.addEventListener('pointermove',function(e){
  if(!panning)return;
  V.tx=panStart.tx+(e.clientX-panStart.x);
  V.ty=panStart.ty+(e.clientY-panStart.y);
  applyView();
});
stageEl.addEventListener('pointerup',function(e){
  if(!panning)return;panning=false;
  stageEl.style.cursor=spaceDown?'grab':'';
  stageEl.releasePointerCapture(e.pointerId);
  saveView();
});
stageEl.addEventListener('pointercancel',function(){panning=false;stageEl.style.cursor='';});

// click on empty canvas to deselect
stageEl.addEventListener('click',function(e){
  if(e.target===stageEl||e.target===ge('grid-cvs')||e.target===worldEl)clearSel();
});
// double-click empty canvas = new note
stageEl.addEventListener('dblclick',function(e){
  if(e.target!==stageEl&&e.target!==ge('grid-cvs')&&e.target!==worldEl)return;
  if(ge('ed-bg').classList.contains('open'))return;
  mkNote();
});

/* ─── WHEEL ZOOM + TRACKPAD ─────────────────────────────────── */
var _wX=window.innerWidth/2,_wY=window.innerHeight/2,_wD=0,_wRaf=null;
stageEl.addEventListener('wheel',function(e){
  e.preventDefault();
  _wX=e.clientX;_wY=e.clientY;
  // ctrlKey = pinch gesture on trackpad (actual zoom)
  // otherwise trackpad two-finger scroll = pan
  if(e.ctrlKey||e.metaKey){
    // zoom
    _wD+=e.deltaY;
    if(!_wRaf)_wRaf=requestAnimationFrame(function(){
      zoomAt(_wX,_wY,Math.pow(0.998,_wD));_wD=0;_wRaf=null;
    });
  } else {
    // pan (trackpad scroll or scroll wheel with no modifier)
    V.tx-=e.deltaX;V.ty-=e.deltaY;
    applyView();
  }
},{passive:false});

/* ─── PINCH (touch) ─────────────────────────────────────────── */
var pD=null,pM=null;
stageEl.addEventListener('touchstart',function(e){
  if(e.touches.length===2){
    pD=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
    pM={x:(e.touches[0].clientX+e.touches[1].clientX)/2,y:(e.touches[0].clientY+e.touches[1].clientY)/2};
  }
},{passive:true});
stageEl.addEventListener('touchmove',function(e){
  if(e.touches.length!==2)return;e.preventDefault();
  var d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
  var mx=(e.touches[0].clientX+e.touches[1].clientX)/2,my=(e.touches[0].clientY+e.touches[1].clientY)/2;
  if(pD)zoomAt(mx,my,d/pD);if(pM){V.tx+=mx-pM.x;V.ty+=my-pM.y;applyView();}
  pD=d;pM={x:mx,y:my};
},{passive:false});
stageEl.addEventListener('touchend',function(){pD=null;pM=null;},{passive:true});

/* ─── KEYBOARD ──────────────────────────────────────────────── */
document.addEventListener('keydown',function(e){
  // only handle shortcuts when no input focused
  var inInput=e.target.matches('input,textarea,select');
  if(e.key==='Escape'){
    closeAllModals();clearSel();
    ge('tpl-panel').classList.remove('open');ge('tb-tpl').classList.remove('active');
    if(ge('ed-bg').classList.contains('open')){flushEd();closeEditor(true);}
    hideCtx();hideCpick();
  }
  if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();flushEd();toast('Saved ✓');}
  if((e.ctrlKey||e.metaKey)&&(e.key==='='||e.key==='+')){e.preventDefault();zoomAt(window.innerWidth/2,window.innerHeight/2,1.25);}
  if((e.ctrlKey||e.metaKey)&&e.key==='-'){e.preventDefault();zoomAt(window.innerWidth/2,window.innerHeight/2,1/1.25);}
  if((e.ctrlKey||e.metaKey)&&e.key==='0'){e.preventDefault();fitAll();}
  if(!inInput&&!ge('ed-bg').classList.contains('open')){
    if((e.key==='Delete'||e.key==='Backspace')&&sel){e.preventDefault();delNode(sel);}
  }
});

function closeAllModals(){
  ['rn-bg','lbl-bg','sty-bg','shp-bg','media-bg','voice-bg','txt-bg'].forEach(function(id){ge(id).classList.remove('open');});
}

/* ─── TOOLBAR ───────────────────────────────────────────────── */
ge('tb-note').addEventListener('click',mkNote);
ge('tb-folder').addEventListener('click',mkFolder);
ge('tb-label').addEventListener('click',function(){ge('lbl-bg').classList.add('open');setTimeout(function(){ge('lbl-inp').focus();},100);});
ge('tb-sticky').addEventListener('click',function(){ge('sty-bg').classList.add('open');setTimeout(function(){ge('sty-inp').focus();},100);});
ge('tb-shapes').addEventListener('click',openShapeModal);
ge('tb-image').addEventListener('click',function(){openMediaModal('image');});
ge('tb-video').addEventListener('click',function(){openMediaModal('video');});
ge('tb-voice').addEventListener('click',function(){ge('voice-bg').classList.add('open');});
ge('tb-tpl').addEventListener('click',function(){
  var open=!ge('tpl-panel').classList.contains('open');
  ge('tpl-panel').classList.toggle('open',open);
  ge('tb-tpl').classList.toggle('active',open);
});
ge('tb-zi').addEventListener('click',function(){zoomAt(window.innerWidth/2,window.innerHeight/2,1.3);});
ge('tb-zo').addEventListener('click',function(){zoomAt(window.innerWidth/2,window.innerHeight/2,1/1.3);});
ge('tb-fit').addEventListener('click',fitAll);
ge('tb-del').addEventListener('click',function(){if(sel)delNode(sel);else toast('Select a card first');});
ge('zoom-lbl').addEventListener('click',function(){V.scale=1;fitAll();toast('Zoom reset');});
window.addEventListener('resize',drawGrid);

/* ─── IMAGE / VIDEO ─────────────────────────────────────────── */
var _mediaSrc=null,_mediaType=null;
function handleMediaFile(file){
  if(!file)return;
  var isImg=file.type.startsWith('image/'),isVid=file.type.startsWith('video/');
  if(!isImg&&!isVid){toast('⚠ Choose an image or video');return;}
  if(file.size>25*1024*1024){toast('⚠ File too large (max 25MB)');return;}
  _mediaType=isImg?'image':'video';
  var reader=new FileReader();
  reader.onload=function(e){
    _mediaSrc=e.target.result;
    ge('media-preview-wrap').style.display='block';ge('media-drop').style.display='none';
    ge('img-preview').style.display=isImg?'block':'none';
    ge('vid-preview').style.display=isVid?'block':'none';
    if(isImg)ge('img-preview').src=_mediaSrc;else ge('vid-preview').src=_mediaSrc;
  };
  reader.onerror=function(){toast('⚠ Could not read file');};
  reader.readAsDataURL(file);
}
ge('media-drop').addEventListener('click',function(){ge('img-file').click();});
ge('img-file').addEventListener('change',function(){handleMediaFile(this.files[0]);this.value='';});
ge('media-drop').addEventListener('dragover',function(e){e.preventDefault();this.classList.add('drag-over');});
ge('media-drop').addEventListener('dragleave',function(){this.classList.remove('drag-over');});
ge('media-drop').addEventListener('drop',function(e){e.preventDefault();this.classList.remove('drag-over');handleMediaFile(e.dataTransfer.files[0]);});
ge('media-ok').addEventListener('click',function(){
  if(!_mediaSrc){toast('Choose a file first');return;}
  var cap=ge('media-caption').value.trim();
  var id=uid(),p=dropPos(280,180);
  DB().nodes[id]={id:id,type:'media',mediaType:_mediaType,src:_mediaSrc,caption:cap,name:cap||(_mediaType==='video'?'Video':'Image'),parent:DB().current,t:ts()};
  nod(DB().current).kids.push(id);setPos(DB().current,id,p.x,p.y,280,null);
  saveState();render();setSel(id);
  ge('media-bg').classList.remove('open');
  _mediaSrc=null;_mediaType=null;ge('media-caption').value='';
  ge('media-preview-wrap').style.display='none';ge('media-drop').style.display='block';
  ge('img-preview').src='';ge('vid-preview').src='';
  toast('Added!');
});
ge('media-cancel').addEventListener('click',function(){ge('media-bg').classList.remove('open');});
ge('media-cl').addEventListener('click',function(){ge('media-bg').classList.remove('open');});
ge('media-bg').addEventListener('mousedown',function(e){if(e.target===ge('media-bg'))ge('media-bg').classList.remove('open');});
function openMediaModal(type){
  _mediaSrc=null;_mediaType=null;
  ge('media-title').textContent=type==='video'?'Add Video':'Add Image';
  ge('media-drop-icon').textContent=type==='video'?'🎬':'🖼';
  ge('media-drop-txt').textContent='Click to choose or drag a '+(type==='video'?'video':'image')+' here';
  ge('img-file').accept=type==='video'?'video/*':'image/*,video/*';
  ge('media-preview-wrap').style.display='none';ge('media-drop').style.display='block';
  ge('media-caption').value='';ge('media-bg').classList.add('open');
}

/* ─── VOICE ─────────────────────────────────────────────────── */
var _auds={};
var mediaRec=null,recChunks=[],recBlob=null,recSecs=0,recTimer=null,waveTimer=null;
(function(){var wf=ge('waveform');for(var i=0;i<32;i++){var b=document.createElement('span');b.style.cssText='height:4px;width:3px;border-radius:2px;background:var(--purple);opacity:.2;display:block;flex-shrink:0';wf.appendChild(b);}})();
function startRec(){
  if(mediaRec&&mediaRec.state==='recording')return;
  navigator.mediaDevices.getUserMedia({audio:true}).then(function(stream){
    recChunks=[];recBlob=null;
    ge('rec-preview').style.display='none';ge('rec-add').disabled=true;
    mediaRec=new MediaRecorder(stream);
    mediaRec.ondataavailable=function(e){if(e.data.size>0)recChunks.push(e.data);};
    mediaRec.onstop=function(){
      recBlob=new Blob(recChunks,{type:'audio/webm'});
      ge('rec-preview').src=URL.createObjectURL(recBlob);
      ge('rec-preview').style.display='block';ge('rec-add').disabled=false;
      ge('rec-btn').textContent='🎙 Record again';
      ge('rec-hint').textContent='Preview → then add to canvas';
      ge('rec-dot').style.background='var(--dim)';
      clearInterval(recTimer);clearInterval(waveTimer);
      ge('waveform').querySelectorAll('span').forEach(function(b){b.style.height='4px';b.style.opacity='.2';});
      stream.getTracks().forEach(function(t){t.stop();});
    };
    mediaRec.start();recSecs=0;ge('rec-time').textContent='0:00';
    ge('rec-dot').style.background='var(--red)';ge('rec-hint').textContent='Recording… tap Stop when done';
    ge('rec-btn').textContent='⏹ Stop';
    recTimer=setInterval(function(){recSecs++;ge('rec-time').textContent=fmtDur(recSecs);},1000);
    waveTimer=setInterval(function(){
      ge('waveform').querySelectorAll('span').forEach(function(b){var h=Math.random()*32+4;b.style.height=h+'px';b.style.opacity=((h/36)*.7+.15).toFixed(2);});
    },80);
  }).catch(function(err){
    if(location.protocol!=='https:'&&location.hostname!=='localhost')toast('⚠ Microphone needs HTTPS');
    else toast('⚠ Mic not available — check browser permissions');
  });
}
function stopRec(){if(!mediaRec||mediaRec.state!=='recording')return;mediaRec.stop();clearInterval(recTimer);clearInterval(waveTimer);}
ge('rec-btn').addEventListener('click',function(){if(mediaRec&&mediaRec.state==='recording')stopRec();else startRec();});
ge('rec-add').addEventListener('click',function(){
  if(!recBlob)return;
  var reader=new FileReader();
  reader.onload=function(e){
    var id=uid(),p=dropPos(220,130);
    DB().nodes[id]={id:id,type:'voice',name:'Voice note',src:e.target.result,dur:fmtDur(recSecs),parent:DB().current,t:ts()};
    nod(DB().current).kids.push(id);setPos(DB().current,id,p.x,p.y,null,null);
    saveState();render();setSel(id);
    ge('voice-bg').classList.remove('open');
    ge('rec-btn').textContent='🎙 Record';ge('rec-hint').textContent='Press Record to start';
    ge('rec-time').textContent='0:00';ge('rec-preview').style.display='none';ge('rec-add').disabled=true;
    ge('rec-dot').style.background='var(--dim)';
    ge('waveform').querySelectorAll('span').forEach(function(b){b.style.height='4px';});
    toast('Voice note added!');
  };
  reader.readAsDataURL(recBlob);
});
ge('voice-cl').addEventListener('click',function(){stopRec();ge('voice-bg').classList.remove('open');});
ge('voice-bg').addEventListener('mousedown',function(e){if(e.target===ge('voice-bg')){stopRec();ge('voice-bg').classList.remove('open');}});

/* ─── EXPORT / IMPORT ───────────────────────────────────────── */
ge('exp-btn').addEventListener('click',function(){
  var blob=new Blob([JSON.stringify(STATE,null,2)],{type:'application/json'});
  var a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download='clyppad-'+new Date().toISOString().slice(0,10)+'.json';
  a.click();URL.revokeObjectURL(a.href);toast('Exported!');
});
ge('imp-btn').addEventListener('click',function(){ge('imp-file').click();});
ge('imp-file').addEventListener('change',function(){
  var file=this.files[0];if(!file)return;
  var reader=new FileReader();
  reader.onload=function(e){
    try{
      var d=JSON.parse(e.target.result);
      if(!d||!d.boards||!d.boards.length){toast('⚠ Invalid file');return;}
      if(!confirm('Replace all boards with this import?'))return;
      STATE=d;ACTIVE=STATE.activeBoard||0;saveState();
      V={tx:0,ty:0,scale:1};renderNow();setTimeout(fitAll,60);
      document.querySelectorAll('.ws-btn').forEach(function(b){b.classList.toggle('active',parseInt(b.dataset.ws)===ACTIVE);});
      toast('Imported!');
    }catch(err){toast('⚠ Could not read file');}
  };
  reader.readAsText(file);this.value='';
});


/* ─── TEMPLATES ─────────────────────────────────────────────── */
var TEMPLATES=[
  {sec:'Notes',items:[
    {name:'Blank note',desc:'Empty text note',icon:'📝',bg:'#1c1c22',fn:function(){mkNote();}},
    {name:'Daily journal',desc:'Date, mood, highlights',icon:'📓',bg:'#1c1c28',fn:function(){
      var id=uid(),p=dropPos(220,100);DB().nodes[id]={id:id,type:'note',name:new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'}),parent:DB().current,text:'Mood: \n\nHighlights:\n\nNotes:\n\nTomorrow:',t:ts()};
      nod(DB().current).kids.push(id);setPos(DB().current,id,p.x,p.y,null,null);saveState();render();setSel(id);openEditor(id);}},
    {name:'Meeting notes',desc:'Agenda, actions, decisions',icon:'🗒',bg:'#1c1c28',fn:function(){
      var id=uid(),p=dropPos(220,100);DB().nodes[id]={id:id,type:'note',name:'Meeting Notes',parent:DB().current,text:'Date: \nAttendees:\n\nAgenda:\n1. \n\nDecisions:\n\nAction items:\n- ',t:ts()};
      nod(DB().current).kids.push(id);setPos(DB().current,id,p.x,p.y,null,null);saveState();render();setSel(id);openEditor(id);}},
    {name:'Brain dump',desc:'Clear your head',icon:'🧠',bg:'#1c1c28',fn:function(){
      var id=uid(),p=dropPos(220,100);DB().nodes[id]={id:id,type:'note',name:'Brain Dump',parent:DB().current,text:'Everything on my mind:\n\n',t:ts()};
      nod(DB().current).kids.push(id);setPos(DB().current,id,p.x,p.y,null,null);saveState();render();setSel(id);openEditor(id);}},
  ]},
  {sec:'Stickies',items:[
    {name:'Yellow',desc:'',icon:'📌',bg:'#ffd060',fn:function(){mkSticky('Write something here…','#ffd060');}},
    {name:'Green',desc:'',icon:'📌',bg:'#a8f0c6',fn:function(){mkSticky('Write something here…','#a8f0c6');}},
    {name:'Pink',desc:'',icon:'📌',bg:'#ffa8d5',fn:function(){mkSticky('Write something here…','#ffa8d5');}},
    {name:'Blue',desc:'',icon:'📌',bg:'#a8ccff',fn:function(){mkSticky('Write something here…','#a8ccff');}},
  ]},
  {sec:'Shapes',items:[
    {name:'Rectangle',desc:'Outline box',icon:'▭',bg:'#1c1c28',fn:function(){mkShape('rect','none','#4f8fff',2.5,120);}},
    {name:'Circle',desc:'Round shape',icon:'◯',bg:'#1c1c28',fn:function(){mkShape('circle','none','#2fd17a',2.5,120);}},
    {name:'Triangle',desc:'',icon:'△',bg:'#1c1c28',fn:function(){mkShape('triangle','none','#ffd060',2.5,120);}},
    {name:'Diamond',desc:'',icon:'◇',bg:'#1c1c28',fn:function(){mkShape('diamond','none','#9b6fff',2.5,120);}},
    {name:'Star',desc:'',icon:'☆',bg:'#1c1c28',fn:function(){mkShape('star','none','#ff6eb4',2.5,120);}},
    {name:'Arrow →',desc:'',icon:'→',bg:'#1c1c28',fn:function(){mkShape('arrow-r','none','#4f8fff',2.5,120);}},
    {name:'Arrow ←',desc:'',icon:'←',bg:'#1c1c28',fn:function(){mkShape('arrow-l','none','#4f8fff',2.5,120);}},
    {name:'Line —',desc:'Horizontal',icon:'—',bg:'#1c1c28',fn:function(){mkShape('line-h','none','#6a6a80',2.5,120);}},
    {name:'Line |',desc:'Vertical',icon:'|',bg:'#1c1c28',fn:function(){mkShape('line-v','none','#6a6a80',2.5,120);}},
    {name:'Diagonal ↘',desc:'',icon:'↘',bg:'#1c1c28',fn:function(){mkShape('line-d','none','#6a6a80',2.5,120);}},
    {name:'Bracket',desc:'[ ]',icon:'[]',bg:'#1c1c28',fn:function(){mkShape('bracket','none','#eaeaf0',2.5,160);}},
  ]},
  {sec:'Labels',items:[
    {name:'Big heading',desc:'Large bold title',icon:'Aa',bg:'#1c1c22',fn:function(){mkLabel('Heading',44,'#eaeaf0');}},
    {name:'Blue label',desc:'Coloured heading',icon:'Aa',bg:'#1c2040',fn:function(){mkLabel('Label',24,'#4f8fff');}},
    {name:'Small tag',desc:'Tiny annotation',icon:'aa',bg:'#1c1c22',fn:function(){mkLabel('tag',13,'#6a6a80');}},
  ]},
  {sec:'Checklists',items:[
    {name:'To-do list',desc:'Simple tasks',icon:'☑',bg:'#1c1c22',fn:function(){mkChecklist('To-do',[{t:'Task 1',done:false},{t:'Task 2',done:false},{t:'Task 3',done:false}]);}},
    {name:'Sprint tasks',desc:'Dev checklist',icon:'🚀',bg:'#1c1c22',fn:function(){mkChecklist('Sprint',[{t:'Plan',done:false},{t:'Build',done:false},{t:'Test',done:false},{t:'Review',done:false},{t:'Deploy',done:false}]);}},
    {name:'Shopping',desc:'Grocery list',icon:'🛒',bg:'#1c1c22',fn:function(){mkChecklist('Shopping',[{t:'Item 1',done:false},{t:'Item 2',done:false},{t:'Item 3',done:false}]);}},
  ]},
  {sec:'Links & Folders',items:[
    {name:'Link card',desc:'Save any URL',icon:'🔗',bg:'#1c1c22',fn:function(){var url=prompt('URL:','https://');if(!url||url==='https://')return;var title=prompt('Title (optional):','')||url;mkLink(title,url,'');}},
    {name:'New folder',desc:'Organise items',icon:'📁',bg:'#15151c',fn:mkFolder},
  ]},
];
function buildTPL(){
  var list=ge('tpl-list');list.innerHTML='';
  TEMPLATES.forEach(function(section){
    var lbl=document.createElement('div');lbl.className='tpl-sec';lbl.textContent=section.sec;list.appendChild(lbl);
    section.items.forEach(function(tpl){
      var row=document.createElement('div');row.className='tpl-item';
      row.innerHTML='<div class="tpl-ico" style="background:'+tpl.bg+'">'+tpl.icon+'</div>'
        +'<div><div class="tpl-name">'+esc(tpl.name)+'</div>'+(tpl.desc?'<div class="tpl-desc">'+esc(tpl.desc)+'</div>':'')+'</div>';
      row.addEventListener('click',function(){tpl.fn();if(window.innerWidth<700){ge('tpl-panel').classList.remove('open');ge('tb-tpl').classList.remove('active');}});
      list.appendChild(row);
    });
  });
}

/* ─── TOAST ─────────────────────────────────────────────────── */
var _tt;
function toast(msg){var el=ge('toast');el.textContent=msg;el.classList.add('show');clearTimeout(_tt);_tt=setTimeout(function(){el.classList.remove('show');},2400);}

/* ─── SEED WELCOME CONTENT ──────────────────────────────────── */
function seedBoard(b){
  if((b.nodes[b.root].kids||[]).length>0)return;
  var n1=uid();b.nodes[n1]={id:n1,type:'note',name:'Welcome to ClypPad ✦',parent:b.root,text:'Your infinite canvas.\n\n→ Scroll (trackpad/wheel) to pan\n→ Pinch or Ctrl+scroll to zoom\n→ Space + drag to pan on laptop\n→ Double-click empty space = new note\n→ Double-click a card to edit it\n→ Right-click any card for options\n→ Drag the corner handle to resize\n→ Double-click a folder to enter it\n→ Use Back ← button to go up\n→ ⊞ Templates for quick starts',t:ts()};
  b.nodes[b.root].kids.push(n1);if(!b.pos[b.root])b.pos[b.root]={};
  b.pos[b.root][n1]={x:-240,y:-120,w:null,h:null};

  var s1=uid();b.nodes[s1]={id:s1,type:'sticky',name:'sticky',text:'Drag me anywhere!',color:'#ffd060',parent:b.root,t:ts()};
  b.nodes[b.root].kids.push(s1);b.pos[b.root][s1]={x:50,y:-90,w:null,h:null};

  var l1=uid();b.nodes[l1]={id:l1,type:'label',name:b.name,parent:b.root,size:44,color:'#4f8fff',t:ts()};
  b.nodes[b.root].kids.push(l1);b.pos[b.root][l1]={x:-240,y:-220,w:null,h:null};

  var sh1=uid();b.nodes[sh1]={id:sh1,type:'shape',shape:'circle',fill:'none',stroke:'#2fd17a',sw:2.5,sz:90,name:'circle',parent:b.root,t:ts()};
  b.nodes[b.root].kids.push(sh1);b.pos[b.root][sh1]={x:50,y:-220,w:90,h:90};
}

/* ─── INIT ──────────────────────────────────────────────────── */
function init(){
  STATE.boards.forEach(seedBoard);
  DB().current=DB().root;
  buildTPL();
  restoreView(DB().root);
  if(!DB().views[DB().root])setTimeout(fitAll,60);
  renderNow();
}

init();