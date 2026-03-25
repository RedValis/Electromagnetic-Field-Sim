import { useState, useRef, useEffect, useCallback } from "react";

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED
// ═══════════════════════════════════════════════════════════════════════════════
const TOOLBAR_H = 44;

// ═══════════════════════════════════════════════════════════════════════════════
// PROTO I — COULOMB FIELD VIEWER
// ═══════════════════════════════════════════════════════════════════════════════
const K = 0.8, EPS = 20;
const HMAP_RES = 4, ARR_STEP = 52, EQ_RES = 8;
const EQ_LEVELS = [-3,-2,-1.5,-1,-0.5,-0.2,0.2,0.5,1,1.5,2,3];
const FL_N = 14, FL_STEPS = 350, FL_DT = 2.8;

function computeE(charges, x, y) {
  let ex = 0, ey = 0;
  for (const c of charges) {
    const dx = x-c.x, dy = y-c.y, r2 = dx*dx+dy*dy+EPS*EPS;
    const f = K*c.q/(r2*Math.sqrt(r2)); ex += f*dx; ey += f*dy;
  }
  return [ex, ey];
}
function computeV(charges, x, y) {
  let v = 0;
  for (const c of charges) {
    const dx=x-c.x, dy=y-c.y;
    v += K*c.q/Math.sqrt(dx*dx+dy*dy+EPS*EPS);
  }
  return v;
}

// Inferno colormap
const _I = [[15,14,27],[30,15,97],[107,0,168],[214,0,106],[255,71,0],[255,184,0],[255,248,224]];
function inferno(t) {
  t = Math.max(0,Math.min(1,t));
  const n=_I.length-1, i=Math.min(n-1,(t*n)|0), f=t*n-i;
  const a=_I[i], b=_I[i+1];
  return [a[0]+(b[0]-a[0])*f|0, a[1]+(b[1]-a[1])*f|0, a[2]+(b[2]-a[2])*f|0];
}

let _hmc=null, _hmx=null;
function p1DrawHeatmap(ctx, canvas, charges) {
  const W=canvas.width, H=canvas.height;
  const cw=Math.ceil(W/HMAP_RES), ch=Math.ceil(H/HMAP_RES);
  if (!_hmc){ _hmc=document.createElement('canvas'); _hmx=_hmc.getContext('2d'); }
  if (_hmc.width!==cw||_hmc.height!==ch){ _hmc.width=cw; _hmc.height=ch; }
  const img=_hmx.createImageData(cw,ch), d=img.data, LN=Math.log1p(5000);
  for (let j=0;j<ch;j++){ const y=j*HMAP_RES;
    for (let i=0;i<cw;i++){ const x=i*HMAP_RES;
      let ex=0,ey=0;
      for (const c of charges){const dx=x-c.x,dy=y-c.y,r2=dx*dx+dy*dy+EPS*EPS; const f=K*c.q/(r2*Math.sqrt(r2)); ex+=f*dx; ey+=f*dy;}
      const mag=Math.sqrt(ex*ex+ey*ey), t=Math.log1p(mag*5000)/LN;
      const [r,g,b]=inferno(t), p=(j*cw+i)*4;
      d[p]=r;d[p+1]=g;d[p+2]=b;d[p+3]=Math.min(255,Math.pow(t,0.5)*230);
    }
  }
  _hmx.putImageData(img,0,0);
  ctx.save(); ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high';
  ctx.globalAlpha=0.9; ctx.drawImage(_hmc,0,0,W,H); ctx.globalAlpha=1; ctx.restore();
}

function p1DrawEquipotentials(ctx, canvas, charges) {
  const W=canvas.width, H=canvas.height, gs=EQ_RES;
  const cols=Math.ceil(W/gs)+1, rows=Math.ceil(H/gs)+1;
  const Vg=new Float32Array(cols*rows);
  for (let j=0;j<rows;j++) for (let i=0;i<cols;i++){
    let v=0; const x=i*gs, y=j*gs;
    for (const c of charges){ const dx=x-c.x,dy=y-c.y; v+=K*c.q/Math.sqrt(dx*dx+dy*dy+EPS*EPS); }
    Vg[j*cols+i]=v;
  }
  ctx.save(); ctx.strokeStyle='rgba(6,118,71,0.58)'; ctx.lineWidth=0.9; ctx.setLineDash([4,3]);
  for (const lev of EQ_LEVELS){
    ctx.beginPath();
    for (let j=0;j<rows-1;j++) for (let i=0;i<cols-1;i++){
      const v00=Vg[j*cols+i],v10=Vg[j*cols+(i+1)],v01=Vg[(j+1)*cols+i],v11=Vg[(j+1)*cols+(i+1)];
      const x0=i*gs, y0=j*gs; let cfg=0;
      if(v00>lev)cfg|=1; if(v10>lev)cfg|=2; if(v11>lev)cfg|=4; if(v01>lev)cfg|=8;
      if(cfg===0||cfg===15) continue;
      const lerp=(va,vb,d)=>d*(lev-va)/(vb-va), pts=[];
      if((cfg&3)===1||(cfg&3)===2) pts.push(x0+lerp(v00,v10,gs),y0);
      if((cfg&6)===2||(cfg&6)===4) pts.push(x0+gs,y0+lerp(v10,v11,gs));
      if((cfg&12)===4||(cfg&12)===8) pts.push(x0+lerp(v01,v11,gs),y0+gs);
      if((cfg&9)===1||(cfg&9)===8) pts.push(x0,y0+lerp(v00,v01,gs));
      if(pts.length>=4){ctx.moveTo(pts[0],pts[1]);ctx.lineTo(pts[2],pts[3]);}
    }
    ctx.stroke();
  }
  ctx.setLineDash([]); ctx.restore();
}

function p1DrawArrows(ctx, canvas, charges) {
  const W=canvas.width, H=canvas.height, half=ARR_STEP>>1, LN=Math.log1p(2000);
  ctx.save(); ctx.lineWidth=0.9;
  for (let y=half;y<H;y+=ARR_STEP) for (let x=half;x<W;x+=ARR_STEP){
    let ex=0,ey=0;
    for(const c of charges){const dx=x-c.x,dy=y-c.y,r2=dx*dx+dy*dy+EPS*EPS; const f=K*c.q/(r2*Math.sqrt(r2)); ex+=f*dx;ey+=f*dy;}
    const mag=Math.sqrt(ex*ex+ey*ey); if(mag<1e-7) continue;
    const t=Math.log1p(mag*2000)/LN, len=7+t*16, nx=ex/mag, ny=ey/mag;
    const tx=x+nx*len, ty=y+ny*len, hl=Math.min(len*.4,7), ang=Math.atan2(ny,nx), alp=0.35+t*0.65;
    const [r,g,b]=inferno(t);
    ctx.strokeStyle=`rgba(${r},${g},${b},${alp})`;
    ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(tx,ty);ctx.stroke();
    for(const da of[-0.4,0.4]){ctx.beginPath();ctx.moveTo(tx,ty);ctx.lineTo(tx-hl*Math.cos(ang+da),ty-hl*Math.sin(ang+da));ctx.stroke();}
  }
  ctx.restore();
}

function p1ComputeFieldLines(canvas, charges) {
  const W=canvas.width, H=canvas.height, lines=[];
  for (const c of charges){
    const sign=c.q>0?1:-1;
    for (let k=0;k<FL_N;k++){
      const ang=2*Math.PI*k/FL_N; let x=c.x+20*Math.cos(ang), y=c.y+20*Math.sin(ang);
      const xs=[x], ys=[y];
      for (let s=0;s<FL_STEPS;s++){
        const step=(px,py)=>{let ex=0,ey=0; for(const cc of charges){const dx=px-cc.x,dy=py-cc.y,r2=dx*dx+dy*dy+EPS*EPS; const f=K*cc.q/(r2*Math.sqrt(r2));ex+=f*dx;ey+=f*dy;} const m=Math.sqrt(ex*ex+ey*ey)||1e-12; return[sign*ex/m,sign*ey/m];};
        const[k1x,k1y]=step(x,y),[k2x,k2y]=step(x+FL_DT/2*k1x,y+FL_DT/2*k1y),[k3x,k3y]=step(x+FL_DT/2*k2x,y+FL_DT/2*k2y),[k4x,k4y]=step(x+FL_DT*k3x,y+FL_DT*k3y);
        x+=FL_DT/6*(k1x+2*k2x+2*k3x+k4x); y+=FL_DT/6*(k1y+2*k2y+2*k3y+k4y);
        if(x<-30||x>W+30||y<-30||y>H+30) break;
        let near=false; for(const cc of charges) if(Math.hypot(x-cc.x,y-cc.y)<13&&cc.q*sign<0){near=true;break;}
        if(near) break; xs.push(x); ys.push(y);
      }
      lines.push({xs,ys,pos:c.q>0});
    }
  }
  return lines;
}

function p1DrawFieldLines(ctx, cachedFL) {
  if(!cachedFL) return; ctx.save(); ctx.lineWidth=1.0;
  for(const l of cachedFL){ if(l.xs.length<2) continue;
    ctx.strokeStyle=l.pos?'rgba(180,48,48,0.45)':'rgba(37,90,210,0.45)';
    ctx.beginPath(); ctx.moveTo(l.xs[0],l.ys[0]);
    for(let i=1;i<l.xs.length;i++) ctx.lineTo(l.xs[i],l.ys[i]); ctx.stroke();
  }
  ctx.restore();
}

function p1DrawCharges(ctx, charges) {
  for(const c of charges){
    const{x,y}=c, pos=c.q>0;
    const g=ctx.createRadialGradient(x,y,4,x,y,22);
    g.addColorStop(0,pos?'rgba(220,38,38,0.18)':'rgba(37,99,235,0.18)'); g.addColorStop(1,'rgba(0,0,0,0)');
    ctx.beginPath();ctx.arc(x,y,22,0,2*Math.PI);ctx.fillStyle=g;ctx.fill();
    ctx.beginPath();ctx.arc(x,y,12,0,2*Math.PI);ctx.fillStyle=pos?'#DC2626':'#2563EB';ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,0.8)';ctx.lineWidth=1.5;ctx.stroke();
    ctx.fillStyle='#fff';ctx.font='bold 14px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(pos?'+':'−',x,y+0.5);
  }
}

function p1DrawGrid(ctx, W, H) {
  ctx.strokeStyle='#EDF0F5'; ctx.lineWidth=1;
  for(let x=0;x<W;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
  for(let y=0;y<H;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
}

function Proto1() {
  const [charges, setCharges] = useState([]);
  const [mode, setMode]       = useState('pos');
  const [layers, setLayers]   = useState({heat:true,arr:true,eq:true,fl:false});
  const [probe, setProbe]     = useState({x:null,y:null,E:null,V:null});

  const chargesRef = useRef([]);
  const modeRef    = useRef('pos');
  const layersRef  = useRef({heat:true,arr:true,eq:true,fl:false});
  const dragRef    = useRef(null);
  const flCache    = useRef(null);
  const flDirty    = useRef(true);
  const nextId     = useRef(1);
  const canvasRef  = useRef(null);
  const cardRef    = useRef(null);

  useEffect(()=>{ chargesRef.current=charges; },[charges]);
  useEffect(()=>{ modeRef.current=mode; },[mode]);
  useEffect(()=>{ layersRef.current=layers; },[layers]);

  const render = useCallback(()=>{
    const canvas=canvasRef.current; if(!canvas) return;
    const ctx=canvas.getContext('2d'), W=canvas.width, H=canvas.height;
    const ch=chargesRef.current, ly=layersRef.current;
    ctx.clearRect(0,0,W,H); ctx.fillStyle='#FFFFFF'; ctx.fillRect(0,0,W,H);
    p1DrawGrid(ctx,W,H);
    if(ch.length===0) return;
    if(ly.heat) p1DrawHeatmap(ctx,canvas,ch);
    if(ly.fl){ if(flDirty.current){flCache.current=p1ComputeFieldLines(canvas,ch);flDirty.current=false;} p1DrawFieldLines(ctx,flCache.current); }
    if(ly.eq)  p1DrawEquipotentials(ctx,canvas,ch);
    if(ly.arr) p1DrawArrows(ctx,canvas,ch);
    p1DrawCharges(ctx,ch);
  },[]);

  useEffect(()=>{
    const card=cardRef.current, canvas=canvasRef.current; if(!card||!canvas) return;
    const resize=()=>{ const r=card.getBoundingClientRect(); canvas.width=r.width; canvas.height=r.height-TOOLBAR_H; requestAnimationFrame(render); };
    resize();
    const ro=new ResizeObserver(resize); ro.observe(card);
    return()=>ro.disconnect();
  },[render]);

  useEffect(()=>{ requestAnimationFrame(render); },[charges,layers,render]);

  const getXY=e=>{ const r=canvasRef.current.getBoundingClientRect(); return[e.clientX-r.left,e.clientY-r.top]; };
  const chargeAt=(x,y,r=18)=>{ const ch=chargesRef.current; for(let i=ch.length-1;i>=0;i--) if(Math.hypot(ch[i].x-x,ch[i].y-y)<r) return i; return -1; };
  const removeCharge=useCallback(id=>{ setCharges(p=>p.filter(c=>c.id!==id)); flDirty.current=true; },[]);
  const clearAll=useCallback(()=>{ setCharges([]); flDirty.current=true; flCache.current=null; setProbe({x:null,y:null,E:null,V:null}); },[]);

  const onMouseDown=useCallback(e=>{
    const canvas=canvasRef.current; if(!canvas) return;
    const[x,y]=getXY(e), m=modeRef.current;
    if(e.button===2){ const i=chargeAt(x,y); if(i>=0){setCharges(p=>{const n=[...p];n.splice(i,1);return n;});flDirty.current=true;} return; }
    if(m==='era'){ const i=chargeAt(x,y); if(i>=0){setCharges(p=>{const n=[...p];n.splice(i,1);return n;});flDirty.current=true;} return; }
    const hit=chargeAt(x,y);
    if(hit>=0){ dragRef.current={idx:hit,ox:x-chargesRef.current[hit].x,oy:y-chargesRef.current[hit].y}; canvas.style.cursor='grabbing'; return; }
    const id=nextId.current++;
    setCharges(p=>[...p,{x,y,q:m==='pos'?1:-1,id}]); flDirty.current=true;
  },[]);

  const onMouseMove=useCallback(e=>{
    if(!canvasRef.current) return;
    const[x,y]=getXY(e), ch=chargesRef.current;
    if(ch.length>0){ const[ex,ey]=computeE(ch,x,y); const mag=Math.sqrt(ex*ex+ey*ey); setProbe({x:Math.round(x),y:Math.round(y),E:mag.toFixed(4),V:computeV(ch,x,y).toFixed(4)}); }
    else setProbe(p=>({...p,x:Math.round(x),y:Math.round(y)}));
    if(dragRef.current!==null){ const{idx,ox,oy}=dragRef.current; setCharges(p=>{const n=[...p];n[idx]={...n[idx],x:x-ox,y:y-oy};return n;}); flDirty.current=true; }
  },[]);

  const onMouseUp=useCallback(()=>{ dragRef.current=null; if(canvasRef.current) canvasRef.current.style.cursor='crosshair'; },[]);

  useEffect(()=>{
    const h=e=>{ if(document.activeElement!==document.body) return; const k=e.key.toLowerCase();
      if(k==='q') setMode('pos'); else if(k==='w') setMode('neg'); else if(k==='e') setMode('era'); else if(k==='c') clearAll();
      else if(k==='h') setLayers(p=>({...p,heat:!p.heat})); else if(k==='a') setLayers(p=>({...p,arr:!p.arr}));
      else if(k==='p') setLayers(p=>({...p,eq:!p.eq})); else if(k==='f'){flDirty.current=true;setLayers(p=>({...p,fl:!p.fl}));}
    };
    document.addEventListener('keydown',h); return()=>document.removeEventListener('keydown',h);
  },[clearAll]);

  const bc=mode==='pos'?'pos':mode==='neg'?'neg':'era';
  const bt=mode==='pos'?'Place +q':mode==='neg'?'Place −q':'Erase Mode';

  return (
    <div className="body">
      <aside className="sidebar">
        <div className="s-sec">
          <div className="s-lbl">Charge Mode</div>
          <div className="mode-row">
            {[['pos','＋ Pos'],['neg','− Neg'],['era','✕ Erase']].map(([m,l])=>(
              <button key={m} className={`mbtn ${mode===m?m:''}`} onClick={()=>setMode(m)}>{l}</button>
            ))}
          </div>
          <button className="clr-btn" onClick={clearAll}>Clear All Charges</button>
        </div>

        <div className="s-sec">
          <div className="s-lbl">Visualization Layers</div>
          {[{k:'heat',l:'Field heatmap'},{k:'arr',l:'E-field arrows'},{k:'eq',l:'Equipotentials'},{k:'fl',l:'Field lines (RK4)'}].map(({k,l})=>(
            <div className="tog-row" key={k}>
              <span className="tog-name">{l}</span>
              <label className="sw">
                <input type="checkbox" checked={layers[k]} onChange={()=>{ if(k==='fl') flDirty.current=true; setLayers(p=>({...p,[k]:!p[k]})); }}/>
                <span className="sw-track"/><span className="sw-knob"/>
              </label>
            </div>
          ))}
          <div className="cbar-inferno"/>
          <div className="cbar-row"><span>weak</span><span>strong |E|</span></div>
        </div>

        <div className="s-sec">
          <div className="s-lbl">Active Charges{charges.length>0&&` (${charges.length})`}</div>
          <div className="ci-list">
            {charges.length===0 ? <p className="empty">No charges placed</p>
              : charges.map(c=>(
                <div key={c.id} className={`ci ${c.q>0?'pos':'neg'}`}>
                  <span className="ci-tag">{c.q>0?'+q':'−q'}</span>
                  <span className="ci-xy">({Math.round(c.x)}, {Math.round(c.y)})</span>
                  <button className="ci-rm" onClick={()=>removeCharge(c.id)}>×</button>
                </div>
              ))
            }
          </div>
        </div>

        <div className="s-sec">
          <div className="s-lbl">Field Probe</div>
          <div className="probe-xy">{probe.x!==null?`x = ${probe.x}   y = ${probe.y}`:'Hover over the canvas'}</div>
          <div className="probe-cards">
            <div className="pc"><div className="pk">|E| Field</div><div className="pv E">{probe.E??'—'}</div><div className="pu">N / C</div></div>
            <div className="pc"><div className="pk">Potential V</div><div className="pv V">{probe.V??'—'}</div><div className="pu">Volts</div></div>
          </div>
        </div>

        <div className="s-sec">
          <div className="s-lbl">Keyboard Shortcuts</div>
          <div className="shortcuts">
            <div className="sh-row"><kbd>Q</kbd> Positive <span className="sh-sep">·</span><kbd>W</kbd> Negative <span className="sh-sep">·</span><kbd>E</kbd> Erase</div>
            <div className="sh-row"><kbd>H</kbd> Heatmap <span className="sh-sep">·</span><kbd>A</kbd> Arrows <span className="sh-sep">·</span><kbd>P</kbd> Equip.</div>
            <div className="sh-row"><kbd>F</kbd> Field lines <span className="sh-sep">·</span><kbd>C</kbd> Clear</div>
            <div className="hint">Drag to reposition · Right-click to delete</div>
          </div>
        </div>
      </aside>

      <div className="workspace">
        <div className="ccard" ref={cardRef}>
          <div className="ctoolbar">
            <span className={`badge ${bc}`}>{bt}</span>
            <span className="tsep"/>
            <span className="tcnt">{charges.length} {charges.length===1?'charge':'charges'}</span>
            {charges.length===0&&<span className="thint">Select a mode and click the canvas to place a charge</span>}
          </div>
          <canvas ref={canvasRef} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp} onContextMenu={e=>e.preventDefault()}/>
          {charges.length===0&&(
            <div className="c-empty">
              <div className="c-empty-title">Canvas is empty</div>
              <div className="c-empty-sub">Choose a charge mode · click to place · drag to move · right-click to delete</div>
            </div>
          )}
        </div>
        <div className="sbar">
          <div className="si"><span className="sk">Cursor</span><span className="sv">{probe.x!==null?`${probe.x}, ${probe.y}`:'—'}</span></div>
          <div className="si"><span className="sk">|E|</span><span className="sv">{probe.E?`${probe.E} N/C`:'—'}</span></div>
          <div className="si"><span className="sk">V</span><span className="sv">{probe.V?`${probe.V} V`:'—'}</span></div>
          <div className="si ml"><span className="sk">Coulomb · K</span><span className="sv" style={{color:'var(--faint)'}}>0.8</span></div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROTO II — POISSON GRID SOLVER
// ═══════════════════════════════════════════════════════════════════════════════
const NX = 130, NY = 82;
const ITERS_PER_FRAME = 20;
const CHARGE_STRENGTH = 4.0;

// Cell types stored in painted[]:
//   0 = free cell (solved by iterator)
//   1 = user-painted conductor  (fixed phi, drawn as metal)
//   2 = user-painted charge source (rho != 0)
// fixed[] = 1 for boundary + conductors (don't update in solver)

function p2MakeGrid() {
  const phi     = new Float32Array(NX*NY);
  const rho     = new Float32Array(NX*NY);
  const fixed   = new Uint8Array(NX*NY);
  const painted = new Uint8Array(NX*NY);
  p2ResetBoundary({phi,rho,fixed,painted});
  return {phi,rho,fixed,painted};
}

function p2ResetBoundary(g) {
  for(let i=0;i<NX;i++){
    const t=i, b=(NY-1)*NX+i;
    g.phi[t]=0; g.fixed[t]=1; g.painted[t]=0;
    g.phi[b]=0; g.fixed[b]=1; g.painted[b]=0;
  }
  for(let j=1;j<NY-1;j++){
    const l=j*NX, r=j*NX+NX-1;
    g.phi[l]=0; g.fixed[l]=1; g.painted[l]=0;
    g.phi[r]=0; g.fixed[r]=1; g.painted[r]=0;
  }
}

function p2ClearGrid(g) {
  g.phi.fill(0); g.rho.fill(0); g.fixed.fill(0); g.painted.fill(0);
  p2ResetBoundary(g);
}

function p2PaintCells(g, ci, cj, radius, tool, value) {
  for(let dj=-radius;dj<=radius;dj++) for(let di=-radius;di<=radius;di++){
    if(di*di+dj*dj>radius*radius+0.5) continue;
    const i=ci+di, j=cj+dj;
    if(i<1||i>=NX-1||j<1||j>=NY-1) continue;
    const idx=j*NX+i;
    if(tool==='erase'){
      g.phi[idx]=0; g.rho[idx]=0; g.fixed[idx]=0; g.painted[idx]=0;
    } else if(tool==='charge'){
      g.rho[idx]=value; g.painted[idx]=2; g.fixed[idx]=0;
    } else if(tool==='conductor'){
      g.phi[idx]=value; g.rho[idx]=0; g.fixed[idx]=1; g.painted[idx]=1;
    }
  }
}

// SOR (ω=1 = Gauss-Seidel, ω>1 = over-relaxation, ω=1 label = "Jacobi" uses copy)
function p2RunJacobi(g) {
  const{phi,rho,fixed}=g;
  const next=new Float32Array(phi); let res=0;
  for(let j=1;j<NY-1;j++) for(let i=1;i<NX-1;i++){
    const idx=j*NX+i; if(fixed[idx]) continue;
    const gs=(phi[j*NX+(i+1)]+phi[j*NX+(i-1)]+phi[(j+1)*NX+i]+phi[(j-1)*NX+i]+rho[idx])*0.25;
    const r=Math.abs(gs-phi[idx]); if(r>res) res=r; next[idx]=gs;
  }
  g.phi.set(next); return res;
}

function p2RunSOR(g, omega) {
  const{phi,rho,fixed}=g; let res=0;
  for(let j=1;j<NY-1;j++) for(let i=1;i<NX-1;i++){
    const idx=j*NX+i; if(fixed[idx]) continue;
    const gs=(phi[j*NX+(i+1)]+phi[j*NX+(i-1)]+phi[(j+1)*NX+i]+phi[(j-1)*NX+i]+rho[idx])*0.25;
    const nv=phi[idx]+omega*(gs-phi[idx]);
    const r=Math.abs(nv-phi[idx]); if(r>res) res=r; phi[idx]=nv;
  }
  return res;
}

// Diverging colormap: blue → white → red
function diverge(t) {
  t=Math.max(0,Math.min(1,t));
  if(t<=0.5){ const s=t*2; return[Math.round(80+s*175),Math.round(110+s*145),255]; }
  else{ const s=(t-0.5)*2; return[255,Math.round(255-s*145),Math.round(255-s*175)]; }
}

let _p2oc=null, _p2cx2=null;
function p2RenderGrid(ctx, cW, cH, g, showArrows, showEq) {
  const{phi,rho,fixed,painted}=g;
  if(!_p2oc){_p2oc=document.createElement('canvas');_p2cx2=_p2oc.getContext('2d');}
  if(_p2oc.width!==NX||_p2oc.height!==NY){_p2oc.width=NX;_p2oc.height=NY;}

  // Dynamic range from free cells
  let maxAbs=0.001;
  for(let i=0;i<NX*NY;i++) if(!fixed[i]) maxAbs=Math.max(maxAbs,Math.abs(phi[i]));

  const img=_p2cx2.createImageData(NX,NY), d=img.data;
  for(let j=0;j<NY;j++) for(let i=0;i<NX;i++){
    const idx=j*NX+i, p=idx*4;
    const isBoundary=fixed[idx]&&!painted[idx];
    if(isBoundary){
      d[p]=232;d[p+1]=235;d[p+2]=240;d[p+3]=255;
    } else if(painted[idx]===1){
      // conductor: color by phi value
      const v=phi[idx];
      if(v>0.05){d[p]=160;d[p+1]=50;d[p+2]=50;d[p+3]=255;}
      else if(v<-0.05){d[p]=50;d[p+1]=70;d[p+2]=160;d[p+3]=255;}
      else{d[p]=70;d[p+1]=80;d[p+2]=95;d[p+3]=255;}
    } else {
      const t=phi[idx]/maxAbs*0.5+0.5;
      const[r,g2,b]=diverge(t); d[p]=r;d[p+1]=g2;d[p+2]=b;d[p+3]=255;
    }
  }
  _p2cx2.putImageData(img,0,0);
  ctx.save();ctx.imageSmoothingEnabled=false;ctx.drawImage(_p2oc,0,0,cW,cH);ctx.restore();

  // Draw charge source markers
  const cw=cW/NX, ch=cH/NY;
  ctx.save();
  for(let j=1;j<NY-1;j++) for(let i=1;i<NX-1;i++){
    if(painted[i+j*NX]!==2) continue;
    const isPos=rho[i+j*NX]>0;
    const cx=i*cw+cw/2, cy=j*ch+ch/2;
    ctx.fillStyle=isPos?'rgba(255,255,255,0.7)':'rgba(255,255,255,0.7)';
    ctx.font=`bold ${Math.max(8,Math.min(14,cw*0.7))}px system-ui`;
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(isPos?'+':'−',cx,cy+0.5);
  }
  ctx.restore();

  // E-field arrows from -∇φ
  if(showArrows){
    const step=Math.max(4,Math.round(50/cw));
    ctx.save(); ctx.lineWidth=1.0;
    for(let j=step;j<NY-step;j+=step) for(let i=step;i<NX-step;i+=step){
      const idx=j*NX+i;
      if(fixed[idx]) continue;
      const ex=-(phi[j*NX+(i+1)]-phi[j*NX+(i-1)])*0.5;
      const ey=-(phi[(j+1)*NX+i]-phi[(j-1)*NX+i])*0.5;
      const mag=Math.sqrt(ex*ex+ey*ey); if(mag<1e-5) continue;
      const t=Math.min(1,Math.log1p(mag*30)/Math.log1p(30));
      const nx=ex/mag, ny=ey/mag;
      const cx2=i*cw+cw/2, cy2=j*ch+ch/2;
      const len=cw*step*0.35*(0.4+t*0.6);
      const tx=cx2+nx*len, ty=cy2+ny*len;
      const hl=len*0.35, ang=Math.atan2(ny,nx), alp=0.4+t*0.55;
      ctx.strokeStyle=`rgba(255,255,255,${alp})`;
      ctx.beginPath();ctx.moveTo(cx2-nx*len*0.3,cy2-ny*len*0.3);ctx.lineTo(tx,ty);ctx.stroke();
      for(const da of[-0.45,0.45]){ctx.beginPath();ctx.moveTo(tx,ty);ctx.lineTo(tx-hl*Math.cos(ang+da),ty-hl*Math.sin(ang+da));ctx.stroke();}
    }
    ctx.restore();
  }

  // Equipotential lines via marching squares on phi grid
  if(showEq){
    const range=maxAbs, step2=range/6;
    const levels=[]; for(let l=-range+step2;l<range;l+=step2) if(Math.abs(l)>0.01) levels.push(l);
    ctx.save(); ctx.strokeStyle='rgba(255,255,255,0.55)'; ctx.lineWidth=0.8; ctx.setLineDash([3,2]);
    for(const lev of levels){
      ctx.beginPath();
      for(let j=0;j<NY-1;j++) for(let i=0;i<NX-1;i++){
        const v00=phi[j*NX+i],v10=phi[j*NX+(i+1)],v01=phi[(j+1)*NX+i],v11=phi[(j+1)*NX+(i+1)];
        let cfg=0; if(v00>lev)cfg|=1;if(v10>lev)cfg|=2;if(v11>lev)cfg|=4;if(v01>lev)cfg|=8;
        if(cfg===0||cfg===15) continue;
        const lp=(va,vb,d)=>{ if(Math.abs(vb-va)<1e-9) return d*0.5; return d*(lev-va)/(vb-va); };
        const pts=[];
        if((cfg&3)===1||(cfg&3)===2) pts.push((i+lp(v00,v10,1))*cw,(j)*ch);
        if((cfg&6)===2||(cfg&6)===4) pts.push((i+1)*cw,(j+lp(v10,v11,1))*ch);
        if((cfg&12)===4||(cfg&12)===8) pts.push((i+lp(v01,v11,1))*cw,(j+1)*ch);
        if((cfg&9)===1||(cfg&9)===8) pts.push((i)*cw,(j+lp(v00,v01,1))*ch);
        if(pts.length>=4){ctx.moveTo(pts[0],pts[1]);ctx.lineTo(pts[2],pts[3]);}
      }
      ctx.stroke();
    }
    ctx.setLineDash([]); ctx.restore();
  }
}

// Presets
function p2ApplyCapacitor(g) {
  p2ClearGrid(g);
  const y1=Math.floor(NY*0.3), y2=Math.floor(NY*0.7);
  const x1=Math.floor(NX*0.15), x2=Math.floor(NX*0.85);
  for(let i=x1;i<=x2;i++){
    p2PaintCells(g,i,y1,0,'conductor',1.5);
    p2PaintCells(g,i,y2,0,'conductor',-1.5);
  }
  for(let i=x1+2;i<=x2-2;i+=3) g.rho[y1*NX+i]=0; // conductors don't need rho
}

function p2ApplyDipole(g) {
  p2ClearGrid(g);
  const cy=Math.floor(NY/2);
  const x1=Math.floor(NX/2-NX*0.12), x2=Math.floor(NX/2+NX*0.12);
  p2PaintCells(g,x1,cy,2,'charge', CHARGE_STRENGTH);
  p2PaintCells(g,x2,cy,2,'charge',-CHARGE_STRENGTH);
}

function p2ApplyRing(g) {
  p2ClearGrid(g);
  const cx=NX/2, cy=NY/2, r=Math.min(NX,NY)*0.28;
  for(let j=1;j<NY-1;j++) for(let i=1;i<NX-1;i++){
    const dist=Math.hypot(i-cx,j-cy);
    if(Math.abs(dist-r)<1.2){ const idx=j*NX+i; g.phi[idx]=1.2; g.fixed[idx]=1; g.painted[idx]=1; g.rho[idx]=0; }
  }
  // point charge in center
  p2PaintCells(g,Math.floor(cx),Math.floor(cy),1,'charge',CHARGE_STRENGTH*1.5);
}

function p2ApplyCoaxial(g) {
  p2ClearGrid(g);
  const cx=NX/2, cy=NY/2;
  const r_outer=Math.min(NX,NY)*0.38, r_inner=Math.min(NX,NY)*0.14;
  for(let j=1;j<NY-1;j++) for(let i=1;i<NX-1;i++){
    const dist=Math.hypot(i-cx,j-cy);
    if(Math.abs(dist-r_outer)<1.2){ const idx=j*NX+i; g.phi[idx]=0; g.fixed[idx]=1; g.painted[idx]=1; g.rho[idx]=0; }
    if(Math.abs(dist-r_inner)<1.2){ const idx=j*NX+i; g.phi[idx]=2.0; g.fixed[idx]=1; g.painted[idx]=1; g.rho[idx]=0; }
  }
}

const TOOL_DEFS = [
  {id:'pos_charge',   label:'+ρ Charge',  cls:'pos'},
  {id:'neg_charge',   label:'−ρ Charge',  cls:'neg'},
  {id:'cond_pos',     label:'+V Plate',   cls:'cpos'},
  {id:'cond_neg',     label:'−V Plate',   cls:'cneg'},
  {id:'cond_gnd',     label:'⏚ Ground',   cls:'cgnd'},
  {id:'erase',        label:'✕ Erase',    cls:'era'},
];

function Proto2() {
  const [running,   setRunning]   = useState(false);
  const [solver,    setSolver]    = useState('sor');
  const [omega,     setOmega]     = useState(1.8);
  const [tool,      setTool]      = useState('pos_charge');
  const [brush,     setBrush]     = useState(2);
  const [iters,     setIters]     = useState(0);
  const [residual,  setResidual]  = useState(0);
  const [layers,    setLayers]    = useState({arrows:true,eq:true});
  const [converged, setConverged] = useState(false);
  const [probe,     setProbe]     = useState({i:null,j:null,phi:null,E:null});

  const gridRef      = useRef(p2MakeGrid());
  const canvasRef    = useRef(null);
  const cardRef      = useRef(null);
  const isPainting   = useRef(false);
  const solverRef    = useRef('sor');
  const omegaRef     = useRef(1.8);
  const runningRef   = useRef(false);
  const layersRef    = useRef({arrows:true,eq:true});
  const itersRef     = useRef(0);
  const residualRef  = useRef(0);
  const rafRef       = useRef(null);

  useEffect(()=>{ solverRef.current=solver; },[solver]);
  useEffect(()=>{ omegaRef.current=omega; },[omega]);
  useEffect(()=>{ runningRef.current=running; },[running]);
  useEffect(()=>{ layersRef.current=layers; },[layers]);

  const render = useCallback(()=>{
    const canvas=canvasRef.current; if(!canvas) return;
    const ctx=canvas.getContext('2d'), g=gridRef.current, ly=layersRef.current;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    p2RenderGrid(ctx,canvas.width,canvas.height,g,ly.arrows,ly.eq);
  },[]);

  useEffect(()=>{
    const card=cardRef.current, canvas=canvasRef.current; if(!card||!canvas) return;
    const resize=()=>{ const r=card.getBoundingClientRect(); canvas.width=r.width; canvas.height=r.height-TOOLBAR_H; render(); };
    resize(); const ro=new ResizeObserver(resize); ro.observe(card); return()=>ro.disconnect();
  },[render]);

  // Solver animation loop
  useEffect(()=>{
    if(!running){ if(rafRef.current) cancelAnimationFrame(rafRef.current); return; }
    let lastUIUpdate=0;
    const loop=(t)=>{
      const g=gridRef.current; const sol=solverRef.current, om=omegaRef.current;
      let res=0;
      for(let k=0;k<ITERS_PER_FRAME;k++){
        if(sol==='jacobi') res=p2RunJacobi(g);
        else res=p2RunSOR(g,sol==='sor'?om:1.0);
      }
      itersRef.current+=ITERS_PER_FRAME; residualRef.current=res;
      render();
      if(t-lastUIUpdate>150){ setIters(itersRef.current); setResidual(+res.toFixed(6)); setConverged(res<0.0002); lastUIUpdate=t; }
      rafRef.current=requestAnimationFrame(loop);
    };
    rafRef.current=requestAnimationFrame(loop);
    return()=>{ if(rafRef.current) cancelAnimationFrame(rafRef.current); };
  },[running,render]);

  const gridCoords=(e)=>{
    const canvas=canvasRef.current; if(!canvas) return[0,0];
    const r=canvas.getBoundingClientRect();
    const x=e.clientX-r.left, y=e.clientY-r.top;
    return[Math.floor(x/canvas.width*NX), Math.floor(y/canvas.height*NY)];
  };

  const applyTool=useCallback((ci,cj)=>{
    const g=gridRef.current; const t=tool;
    if(t==='erase') p2PaintCells(g,ci,cj,brush,'erase',0);
    else if(t==='pos_charge') p2PaintCells(g,ci,cj,brush,'charge', CHARGE_STRENGTH);
    else if(t==='neg_charge') p2PaintCells(g,ci,cj,brush,'charge',-CHARGE_STRENGTH);
    else if(t==='cond_pos')   p2PaintCells(g,ci,cj,brush,'conductor', 1.5);
    else if(t==='cond_neg')   p2PaintCells(g,ci,cj,brush,'conductor',-1.5);
    else if(t==='cond_gnd')   p2PaintCells(g,ci,cj,brush,'conductor', 0);
    if(!runningRef.current) render();
  },[tool,brush,render]);

  const onMouseDown=useCallback(e=>{ isPainting.current=true; const[i,j]=gridCoords(e); applyTool(i,j); },[applyTool]);
  const onMouseMove=useCallback(e=>{
    const[i,j]=gridCoords(e);
    if(isPainting.current) applyTool(i,j);
    // Probe
    if(i>=0&&i<NX&&j>=0&&j<NY){
      const g=gridRef.current, idx=j*NX+i;
      const phi=g.phi[idx];
      const ex=i>0&&i<NX-1?-(g.phi[j*NX+(i+1)]-g.phi[j*NX+(i-1)])*0.5:0;
      const ey=j>0&&j<NY-1?-(g.phi[(j+1)*NX+i]-g.phi[(j-1)*NX+i])*0.5:0;
      setProbe({i,j,phi:phi.toFixed(4),E:Math.sqrt(ex*ex+ey*ey).toFixed(4)});
    }
  },[applyTool]);
  const onMouseUp=useCallback(()=>{ isPainting.current=false; },[]);

  const resetSolver=useCallback(()=>{ gridRef.current.phi.fill(0); p2ResetBoundary(gridRef.current); for(let k=0;k<NX*NY;k++) if(gridRef.current.painted[k]===1) {} itersRef.current=0; setIters(0); setResidual(0); setConverged(false); render(); },[render]);

  const loadPreset=useCallback(name=>{
    const g=gridRef.current;
    if(name==='capacitor') p2ApplyCapacitor(g);
    else if(name==='dipole') p2ApplyDipole(g);
    else if(name==='ring') p2ApplyRing(g);
    else if(name==='coaxial') p2ApplyCoaxial(g);
    itersRef.current=0; setIters(0); setResidual(0); setConverged(false); render();
  },[render]);

  const step=useCallback(n=>{
    const g=gridRef.current; const sol=solverRef.current, om=omegaRef.current;
    let res=0;
    for(let k=0;k<n;k++) res=sol==='jacobi'?p2RunJacobi(g):p2RunSOR(g,sol==='sor'?om:1.0);
    itersRef.current+=n; setIters(itersRef.current); setResidual(+res.toFixed(6)); setConverged(res<0.0002); render();
  },[render]);

  const resColor = residual<0.0002?'var(--green)':residual<0.01?'var(--amber)':'var(--red)';

  return (
    <div className="body">
      <aside className="sidebar">
        {/* Paint tools */}
        <div className="s-sec">
          <div className="s-lbl">Paint Tool</div>
          <div className="tool-grid">
            {TOOL_DEFS.map(({id,label,cls})=>(
              <button key={id} className={`tbtn ${cls} ${tool===id?'on':''}`} onClick={()=>setTool(id)}>{label}</button>
            ))}
          </div>
          <div className="s-lbl" style={{marginTop:10}}>Brush Radius</div>
          <div className="brush-row">
            {[{v:1,l:'1'},{v:2,l:'3'},{v:4,l:'6'},{v:7,l:'12'}].map(({v,l})=>(
              <button key={v} className={`brush-btn ${brush===v?'on':''}`} onClick={()=>setBrush(v)}>{l}px</button>
            ))}
          </div>
        </div>

        {/* Presets */}
        <div className="s-sec">
          <div className="s-lbl">Presets</div>
          <div className="preset-grid">
            {[['capacitor','Capacitor'],['dipole','Dipole'],['ring','Ring Electrode'],['coaxial','Coaxial Cable']].map(([k,l])=>(
              <button key={k} className="preset-btn" onClick={()=>loadPreset(k)}>{l}</button>
            ))}
          </div>
        </div>

        {/* Solver */}
        <div className="s-sec">
          <div className="s-lbl">Iterative Solver</div>
          <div className="solver-row">
            {[['jacobi','Jacobi'],['gs','Gauss-Seidel'],['sor','SOR']].map(([k,l])=>(
              <button key={k} className={`solver-btn ${solver===k?'on':''}`} onClick={()=>setSolver(k)}>{l}</button>
            ))}
          </div>
          {solver==='sor'&&(
            <div className="omega-row">
              <span className="tog-name">ω (relaxation)</span>
              <span className="omega-val">{omega.toFixed(2)}</span>
              <input type="range" min="1.0" max="1.99" step="0.01" value={omega}
                onChange={e=>setOmega(parseFloat(e.target.value))} className="omega-slider"/>
            </div>
          )}
          <div className="solver-note">
            {solver==='jacobi'?'Simultaneous update — slowest convergence':solver==='gs'?'In-place update — faster than Jacobi':'ω-weighted update — fastest, optimal ω ≈ 1.8'}
          </div>
        </div>

        {/* Controls */}
        <div className="s-sec">
          <div className="s-lbl">Solver Controls</div>
          <div className="ctrl-row">
            <button className={`ctrl-btn ${running?'pause':'run'}`} onClick={()=>setRunning(r=>!r)}>
              {running?'⏸ Pause':'▶ Run'}
            </button>
            <button className="ctrl-btn step" onClick={()=>step(50)} disabled={running}>+50</button>
            <button className="ctrl-btn step" onClick={()=>step(200)} disabled={running}>+200</button>
          </div>
          <div className="ctrl-row2">
            <button className="clr-btn" onClick={resetSolver}>Reset φ</button>
            <button className="clr-btn" onClick={()=>{ p2ClearGrid(gridRef.current); itersRef.current=0; setIters(0); setResidual(0); setConverged(false); render(); }}>Clear All</button>
          </div>
        </div>

        {/* Stats */}
        <div className="s-sec">
          <div className="s-lbl">Convergence</div>
          <div className="probe-cards">
            <div className="pc"><div className="pk">Iterations</div><div className="pv" style={{color:'var(--text)'}}>{iters.toLocaleString()}</div></div>
            <div className="pc"><div className="pk">Residual</div><div className="pv" style={{color:resColor,fontSize:12}}>{residual.toExponential(2)}</div></div>
          </div>
          {converged&&<div className="conv-badge">✓ Converged</div>}
        </div>

        {/* Probe */}
        <div className="s-sec">
          <div className="s-lbl">Field Probe</div>
          <div className="probe-xy">{probe.i!==null?`grid (${probe.i}, ${probe.j})`:'Hover over canvas'}</div>
          <div className="probe-cards">
            <div className="pc"><div className="pk">φ Potential</div><div className="pv V">{probe.phi??'—'}</div><div className="pu">V</div></div>
            <div className="pc"><div className="pk">|E| field</div><div className="pv E">{probe.E??'—'}</div><div className="pu">V/cell</div></div>
          </div>
        </div>

        {/* Layers */}
        <div className="s-sec">
          <div className="s-lbl">Overlays</div>
          {[{k:'arrows',l:'E-field arrows'},{k:'eq',l:'Equipotential lines'}].map(({k,l})=>(
            <div className="tog-row" key={k}>
              <span className="tog-name">{l}</span>
              <label className="sw">
                <input type="checkbox" checked={layers[k]} onChange={()=>setLayers(p=>({...p,[k]:!p[k]}))}/>
                <span className="sw-track"/><span className="sw-knob"/>
              </label>
            </div>
          ))}
          <div className="cbar-div"/>
          <div className="cbar-row"><span>−V</span><span>0</span><span>+V</span></div>
        </div>
      </aside>

      <div className="workspace">
        <div className="ccard" ref={cardRef}>
          <div className="ctoolbar">
            <span className={`badge ${TOOL_DEFS.find(t=>t.id===tool)?.cls}`}>{TOOL_DEFS.find(t=>t.id===tool)?.label}</span>
            <span className="tsep"/>
            <span className="tcnt">{running?'Solving…':'Paused'}</span>
            <span className="tsep"/>
            <span className="tcnt">{iters.toLocaleString()} iter</span>
            {converged&&<><span className="tsep"/><span className="tcnt" style={{color:'var(--green)'}}>Converged</span></>}
            <span style={{marginLeft:'auto',fontSize:11,color:'var(--faint)',fontFamily:'var(--mono)'}}>
              Grid {NX}×{NY} · {solver.toUpperCase()}{solver==='sor'?` ω=${omega.toFixed(2)}`:''}
            </span>
          </div>
          <canvas ref={canvasRef} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp} style={{cursor:'crosshair'}}/>
          {iters===0&&(
            <div className="c-empty" style={{pointerEvents:'none'}}>
              <div className="c-empty-title">Grid is empty</div>
              <div className="c-empty-sub">Paint conductors or charges, then press Run<br/>or load a preset to begin</div>
            </div>
          )}
        </div>
        <div className="sbar">
          <div className="si"><span className="sk">Cell</span><span className="sv">{probe.i!==null?`${probe.i}, ${probe.j}`:'—'}</span></div>
          <div className="si"><span className="sk">φ</span><span className="sv">{probe.phi?`${probe.phi} V`:'—'}</span></div>
          <div className="si"><span className="sk">|E|</span><span className="sv">{probe.E?`${probe.E} V/cell`:'—'}</span></div>
          <div className="si ml"><span className="sk">Poisson · ∇²φ = −ρ/ε₀</span></div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CSS
// ═══════════════════════════════════════════════════════════════════════════════
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{
  --font:'IBM Plex Sans',-apple-system,BlinkMacSystemFont,sans-serif;
  --mono:'IBM Plex Mono','Cascadia Code',Consolas,monospace;
  --bg:#EAECF0; --surface:#FFFFFF; --surface-2:#F8F9FB;
  --border:#D0D5DD; --border-2:#B2BAC4;
  --text:#101828; --muted:#475467; --faint:#98A2B3;
  --hdr:#192236; --hdr-2:#243147; --hdr-text:#E5E9F0; --hdr-muted:#7A8A9F;
  --accent:#1570EF; --accent-lt:#D1E9FF;
  --red:#D92D20; --red-lt:#FEE4E2;
  --blue:#1570EF; --blue-lt:#D1E9FF;
  --green:#067647; --purple:#6927DA;
  --amber:#B54708; --amber-lt:#FEF0C7;
  --sidebar-w:272px; --radius:4px; --radius-lg:6px;
}
html,body{height:100%;background:var(--bg);font-family:var(--font);color:var(--text);font-size:13px;overflow:hidden;}
#app-shell{display:flex;flex-direction:column;height:100vh;}

/* Header */
.hdr{height:50px;flex-shrink:0;background:var(--hdr);border-bottom:1px solid #0F1824;display:flex;align-items:center;padding:0 0 0 16px;user-select:none;}
.hdr-brand{display:flex;align-items:center;gap:10px;padding-right:16px;border-right:1px solid #2A3A50;}
.hdr-icon{width:28px;height:28px;background:var(--accent);border-radius:var(--radius);display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.hdr-name{font-size:13.5px;font-weight:600;color:var(--hdr-text);letter-spacing:.01em;line-height:1.2;}
.hdr-sub{font-size:10.5px;color:var(--hdr-muted);margin-top:1px;letter-spacing:.02em;}
.hdr-nav{display:flex;align-items:center;gap:1px;padding:0 14px;flex:1;}
.hdr-tab{padding:5px 11px;font-size:12px;font-weight:500;color:var(--hdr-muted);border-radius:3px;cursor:pointer;transition:color .12s,background .12s;}
.hdr-tab:hover{color:var(--hdr-text);background:rgba(255,255,255,.06);}
.hdr-tab.on{color:var(--hdr-text);background:rgba(255,255,255,.09);border-bottom:2px solid var(--accent);}
.hdr-right{display:flex;align-items:center;height:100%;border-left:1px solid #2A3A50;padding:0 16px;gap:10px;font-family:var(--mono);font-size:10.5px;color:var(--hdr-muted);}
.hdr-dot{width:6px;height:6px;border-radius:50%;background:#4ADE80;flex-shrink:0;}
.hdr-div{width:1px;height:13px;background:#2A3A50;}

/* Layout */
.body{display:flex;flex:1;overflow:hidden;}

/* Sidebar */
.sidebar{width:var(--sidebar-w);min-width:var(--sidebar-w);background:var(--surface);border-right:1px solid var(--border);display:flex;flex-direction:column;overflow-y:auto;overflow-x:hidden;}
.sidebar::-webkit-scrollbar{width:4px;}
.sidebar::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px;}
.s-sec{padding:13px 14px;border-bottom:1px solid var(--border);}
.s-sec:last-child{border-bottom:none;}
.s-lbl{font-size:9.5px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;color:var(--faint);margin-bottom:10px;}

/* Proto I mode buttons */
.mode-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;}
.mbtn{padding:7px 0;border:1px solid var(--border-2);background:var(--surface);border-radius:var(--radius);font-family:var(--font);font-size:11.5px;font-weight:500;color:var(--muted);cursor:pointer;transition:all .1s;text-align:center;user-select:none;}
.mbtn:hover{color:var(--text);background:var(--surface-2);}
.mbtn.pos{background:var(--red-lt);border-color:#FCA5A5;color:var(--red);}
.mbtn.neg{background:var(--blue-lt);border-color:#93C5FD;color:var(--blue);}
.mbtn.era{background:var(--amber-lt);border-color:#FCD34D;color:var(--amber);}

/* Proto II tool grid */
.tool-grid{display:grid;grid-template-columns:1fr 1fr;gap:5px;}
.tbtn{padding:6px 4px;border:1px solid var(--border-2);background:var(--surface);border-radius:var(--radius);font-family:var(--font);font-size:11px;font-weight:500;color:var(--muted);cursor:pointer;transition:all .1s;text-align:center;user-select:none;}
.tbtn:hover{color:var(--text);background:var(--surface-2);}
.tbtn.pos.on,.tbtn.pos:active{background:var(--red-lt);border-color:#FCA5A5;color:var(--red);}
.tbtn.neg.on,.tbtn.neg:active{background:var(--blue-lt);border-color:#93C5FD;color:var(--blue);}
.tbtn.cpos.on{background:#FEE2E2;border-color:#F87171;color:#B91C1C;}
.tbtn.cneg.on{background:#DBEAFE;border-color:#60A5FA;color:#1D4ED8;}
.tbtn.cgnd.on{background:#F0FDF4;border-color:#86EFAC;color:#15803D;}
.tbtn.era.on{background:var(--amber-lt);border-color:#FCD34D;color:var(--amber);}

/* Brush */
.brush-row{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;}
.brush-btn{padding:5px 0;border:1px solid var(--border);background:var(--surface);border-radius:var(--radius);font-family:var(--mono);font-size:11px;color:var(--muted);cursor:pointer;text-align:center;transition:all .1s;}
.brush-btn:hover{color:var(--text);background:var(--surface-2);}
.brush-btn.on{background:var(--accent);border-color:var(--accent);color:#fff;}

/* Presets */
.preset-grid{display:grid;grid-template-columns:1fr 1fr;gap:5px;}
.preset-btn{padding:6px 4px;border:1px solid var(--border-2);background:var(--surface);border-radius:var(--radius);font-family:var(--font);font-size:11px;font-weight:500;color:var(--muted);cursor:pointer;transition:all .1s;text-align:center;}
.preset-btn:hover{border-color:var(--accent);color:var(--accent);background:var(--accent-lt);}

/* Solver */
.solver-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;margin-bottom:8px;}
.solver-btn{padding:6px 0;border:1px solid var(--border-2);background:var(--surface);border-radius:var(--radius);font-family:var(--mono);font-size:10.5px;font-weight:500;color:var(--muted);cursor:pointer;transition:all .1s;text-align:center;}
.solver-btn:hover{color:var(--text);background:var(--surface-2);}
.solver-btn.on{background:var(--hdr);border-color:var(--hdr);color:#fff;}
.omega-row{display:flex;align-items:center;gap:8px;padding:5px 0 2px;flex-wrap:wrap;}
.omega-val{font-family:var(--mono);font-size:12px;font-weight:500;color:var(--accent);min-width:32px;text-align:right;}
.omega-slider{flex:1;min-width:80px;accent-color:var(--accent);cursor:pointer;}
.solver-note{font-size:10.5px;color:var(--faint);line-height:1.5;margin-top:6px;font-style:italic;}

/* Controls */
.ctrl-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;margin-bottom:6px;}
.ctrl-btn{padding:7px 0;border:1px solid var(--border-2);background:var(--surface);border-radius:var(--radius);font-family:var(--mono);font-size:11.5px;font-weight:500;color:var(--muted);cursor:pointer;transition:all .1s;text-align:center;}
.ctrl-btn:disabled{opacity:0.4;cursor:not-allowed;}
.ctrl-btn.run{background:#ECFDF5;border-color:#6EE7B7;color:var(--green);}
.ctrl-btn.run:hover{background:#D1FAE5;}
.ctrl-btn.pause{background:var(--amber-lt);border-color:#FCD34D;color:var(--amber);}
.ctrl-btn.step{font-size:10.5px;}
.ctrl-btn.step:hover{background:var(--surface-2);color:var(--text);}
.ctrl-row2{display:grid;grid-template-columns:1fr 1fr;gap:5px;}
.clr-btn{width:100%;padding:6px 0;border:1px solid var(--border);background:var(--surface);border-radius:var(--radius);font-family:var(--font);font-size:11.5px;font-weight:500;color:var(--muted);cursor:pointer;transition:all .1s;}
.clr-btn:hover{border-color:#FCA5A5;color:var(--red);background:var(--red-lt);}

/* Conv badge */
.conv-badge{margin-top:8px;padding:5px 10px;background:#ECFDF5;border:1px solid #6EE7B7;border-radius:var(--radius);font-size:11.5px;font-weight:500;color:var(--green);text-align:center;}

/* Toggles */
.tog-row{display:flex;align-items:center;justify-content:space-between;padding:5px 0;}
.tog-name{font-size:12.5px;color:var(--text);}
.sw{position:relative;width:34px;height:18px;cursor:pointer;flex-shrink:0;}
.sw input{opacity:0;width:0;height:0;position:absolute;}
.sw-track{position:absolute;inset:0;background:var(--border-2);border-radius:9px;transition:background .15s;}
.sw input:checked+.sw-track{background:var(--accent);}
.sw-knob{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2);transition:transform .15s;pointer-events:none;}
.sw input:checked~.sw-knob{transform:translateX(16px);}

/* Colorbars */
.cbar-inferno{height:7px;border-radius:3px;margin-top:11px;background:linear-gradient(to right,#0f0e1a,#3b0764,#7c2d8e,#c2185b,#e64a19,#f9a825,#fff9c4);border:1px solid var(--border);}
.cbar-div{height:7px;border-radius:3px;margin-top:11px;background:linear-gradient(to right,#5060b4,#90a0d8,#ffffff,#d88090,#b45060);border:1px solid var(--border);}
.cbar-row{display:flex;justify-content:space-between;margin-top:4px;font-size:9.5px;color:var(--faint);font-family:var(--mono);}

/* Charge list */
.ci-list{display:flex;flex-direction:column;gap:4px;}
.ci{display:flex;align-items:center;gap:6px;padding:5px 8px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface-2);font-size:11.5px;}
.ci-tag{font-weight:600;font-family:var(--mono);width:22px;flex-shrink:0;}
.ci.pos .ci-tag{color:var(--red);}
.ci.neg .ci-tag{color:var(--blue);}
.ci-xy{flex:1;color:var(--faint);font-family:var(--mono);font-size:10.5px;}
.ci-rm{background:none;border:none;cursor:pointer;color:var(--faint);font-size:14px;line-height:1;padding:1px 4px;border-radius:3px;flex-shrink:0;}
.ci-rm:hover{color:var(--red);background:var(--red-lt);}
.empty{font-size:11.5px;color:var(--faint);font-style:italic;text-align:center;padding:8px 0;}

/* Probe */
.probe-xy{font-size:11px;color:var(--faint);font-family:var(--mono);margin-bottom:9px;min-height:15px;}
.probe-cards{display:grid;grid-template-columns:1fr 1fr;gap:6px;}
.pc{background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius);padding:9px 10px;}
.pk{font-size:9px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--faint);margin-bottom:5px;}
.pv{font-size:14px;font-weight:500;font-family:var(--mono);font-variant-numeric:tabular-nums;}
.pv.E{color:var(--purple);}
.pv.V{color:var(--green);}
.pu{font-size:9px;color:var(--faint);margin-top:2px;font-family:var(--mono);letter-spacing:.04em;}

/* Shortcuts */
.shortcuts{display:flex;flex-direction:column;gap:5px;font-size:11.5px;color:var(--muted);}
.sh-row{display:flex;align-items:center;gap:5px;flex-wrap:wrap;line-height:1.8;}
kbd{display:inline-block;padding:1px 5px;background:var(--surface-2);border:1px solid var(--border-2);border-bottom-width:2px;border-radius:3px;font-family:var(--mono);font-size:10.5px;color:var(--text);vertical-align:middle;}
.sh-sep{color:var(--faint);font-size:10px;}
.hint{font-size:10.5px;color:var(--faint);margin-top:3px;}

/* Workspace */
.workspace{flex:1;display:flex;flex-direction:column;padding:12px;gap:8px;min-width:0;}
.ccard{flex:1;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);position:relative;overflow:hidden;min-height:0;}
.ctoolbar{position:absolute;top:0;left:0;right:0;height:44px;border-bottom:1px solid var(--border);background:var(--surface-2);display:flex;align-items:center;padding:0 14px;gap:10px;z-index:10;user-select:none;}
.badge{padding:3px 10px;border-radius:3px;font-family:var(--mono);font-size:11.5px;font-weight:500;border:1px solid transparent;letter-spacing:.02em;}
.badge.pos{background:var(--red-lt);border-color:#FCA5A5;color:var(--red);}
.badge.neg{background:var(--blue-lt);border-color:#93C5FD;color:var(--blue);}
.badge.era{background:var(--amber-lt);border-color:#FCD34D;color:var(--amber);}
.badge.cpos{background:#FEE2E2;border-color:#F87171;color:#B91C1C;}
.badge.cneg{background:#DBEAFE;border-color:#60A5FA;color:#1D4ED8;}
.badge.cgnd{background:#F0FDF4;border-color:#86EFAC;color:#15803D;}
.tsep{width:1px;height:16px;background:var(--border);}
.tcnt{color:var(--faint);font-size:11.5px;font-family:var(--mono);}
.thint{color:var(--faint);font-size:11px;margin-left:auto;}
canvas{position:absolute;top:44px;left:0;right:0;bottom:0;width:100%;height:calc(100% - 44px);cursor:crosshair;display:block;}
.c-empty{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;color:var(--faint);pointer-events:none;}
.c-empty-title{font-size:13.5px;font-weight:500;color:var(--muted);margin-bottom:5px;}
.c-empty-sub{font-size:12px;line-height:1.8;}

/* Status bar */
.sbar{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);height:34px;padding:0 14px;display:flex;align-items:center;font-family:var(--mono);font-size:11px;flex-shrink:0;}
.si{display:flex;align-items:center;gap:8px;padding-right:16px;margin-right:16px;border-right:1px solid var(--border);}
.si:last-child{border-right:none;margin-right:0;padding-right:0;}
.sk{color:var(--faint);font-size:10px;letter-spacing:.05em;text-transform:uppercase;}
.sv{color:var(--text);font-weight:500;}
.ml{margin-left:auto;}
`;

// ═══════════════════════════════════════════════════════════════════════════════
// APP
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [tab, setTab] = useState('proto1');

  return (
    <>
      <style>{CSS}</style>
      <div id="app-shell">
        <header className="hdr">
          <div className="hdr-brand">
            <div className="hdr-icon">
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                <circle cx="7.5" cy="7.5" r="5.5" stroke="white" strokeWidth="1.4"/>
                <line x1="7.5" y1="2" x2="7.5" y2="13" stroke="white" strokeWidth="1.4"/>
                <line x1="2" y1="7.5" x2="13" y2="7.5" stroke="white" strokeWidth="1.4"/>
              </svg>
            </div>
            <div>
              <div className="hdr-name">Maxwell Lab</div>
              <div className="hdr-sub">Electrostatics Simulator</div>
            </div>
          </div>
          <div className="hdr-nav">
            <div className={`hdr-tab ${tab==='proto1'?'on':''}`} onClick={()=>setTab('proto1')}>Proto I · Coulomb Viewer</div>
            <div className={`hdr-tab ${tab==='proto2'?'on':''}`} onClick={()=>setTab('proto2')}>Proto II · Poisson Solver</div>
          </div>
          <div className="hdr-right">
            <div className="hdr-dot"/>
            <span>READY</span>
            <div className="hdr-div"/>
            <span style={{color:'var(--hdr-text)'}}>{tab==='proto1'?'Coulomb':'Poisson ∇²φ=−ρ'}</span>
          </div>
        </header>
        {tab==='proto1' ? <Proto1/> : <Proto2/>}
      </div>
    </>
  );
}