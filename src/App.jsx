import { useState, useRef, useEffect, useCallback } from "react";

// ── Constants ─────────────────────────────────────────────────────────────────
const K        = 0.8;
const EPS      = 20;
const HMAP_RES = 4;
const ARR_STEP = 52;
const EQ_RES   = 8;
const EQ_LEVELS = [-3,-2,-1.5,-1,-0.5,-0.2,0.2,0.5,1,1.5,2,3];
const FL_N     = 14;
const FL_STEPS = 350;
const FL_DT    = 2.8;
const TOOLBAR_H = 44;

// ── Physics ───────────────────────────────────────────────────────────────────
function computeE(charges, x, y) {
  let ex = 0, ey = 0;
  for (const c of charges) {
    const dx = x - c.x, dy = y - c.y;
    const r2 = dx*dx + dy*dy + EPS*EPS;
    const r3 = r2 * Math.sqrt(r2);
    const f  = K * c.q / r3;
    ex += f * dx; ey += f * dy;
  }
  return [ex, ey];
}

function computeV(charges, x, y) {
  let v = 0;
  for (const c of charges) {
    const dx = x - c.x, dy = y - c.y;
    v += K * c.q / Math.sqrt(dx*dx + dy*dy + EPS*EPS);
  }
  return v;
}

// ── Inferno colormap ──────────────────────────────────────────────────────────
const _I = [[15,14,27],[30,15,97],[107,0,168],[214,0,106],[255,71,0],[255,184,0],[255,248,224]];
function inferno(t) {
  t = Math.max(0, Math.min(1, t));
  const n = _I.length - 1;
  const i = Math.min(n - 1, (t * n) | 0);
  const f = t * n - i;
  const a = _I[i], b = _I[i + 1];
  return [a[0]+(b[0]-a[0])*f|0, a[1]+(b[1]-a[1])*f|0, a[2]+(b[2]-a[2])*f|0];
}

// ── Canvas drawing ────────────────────────────────────────────────────────────
function drawGrid(ctx, W, H) {
  ctx.strokeStyle = '#EDF0F5';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
  for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
}

let _hmc = null, _hmx = null;
function drawHeatmap(ctx, canvas, charges) {
  const W = canvas.width, H = canvas.height;
  const cw = Math.ceil(W / HMAP_RES), ch = Math.ceil(H / HMAP_RES);
  if (!_hmc) { _hmc = document.createElement('canvas'); _hmx = _hmc.getContext('2d'); }
  if (_hmc.width !== cw || _hmc.height !== ch) { _hmc.width = cw; _hmc.height = ch; }
  const img = _hmx.createImageData(cw, ch);
  const d = img.data, LN  = Math.log1p(5000);
  for (let j = 0; j < ch; j++) {
    const y = j * HMAP_RES;
    for (let i = 0; i < cw; i++) {
      const x = i * HMAP_RES;
      let ex = 0, ey = 0;
      for (const c of charges) {
        const dx=x-c.x, dy=y-c.y, r2=dx*dx+dy*dy+EPS*EPS;
        const f=K*c.q/(r2*Math.sqrt(r2)); ex+=f*dx; ey+=f*dy;
      }
      const mag = Math.sqrt(ex*ex+ey*ey);
      const t = Math.log1p(mag * 5000) / LN;
      const [r,g,b] = inferno(t);
      const p = (j * cw + i) * 4;
      d[p]=r; d[p+1]=g; d[p+2]=b; d[p+3]=Math.min(255, Math.pow(t, 0.5) * 230);
    }
  }
  _hmx.putImageData(img, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.globalAlpha = 0.9;
  ctx.drawImage(_hmc, 0, 0, W, H);
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawEquipotentials(ctx, canvas, charges) {
  const W = canvas.width, H = canvas.height;
  const gs = EQ_RES;
  const cols = Math.ceil(W / gs) + 1, rows = Math.ceil(H / gs) + 1;
  const Vg = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      let v = 0;
      const x = i*gs, y = j*gs;
      for (const c of charges) {
        const dx=x-c.x, dy=y-c.y;
        v += K*c.q / Math.sqrt(dx*dx+dy*dy+EPS*EPS);
      }
      Vg[j * cols + i] = v;
    }
  ctx.save();
  ctx.strokeStyle = 'rgba(6,118,71,0.58)';
  ctx.lineWidth = 0.9;
  ctx.setLineDash([4, 3]);
  for (const lev of EQ_LEVELS) {
    ctx.beginPath();
    for (let j = 0; j < rows-1; j++) {
      for (let i = 0; i < cols-1; i++) {
        const v00=Vg[j*cols+i], v10=Vg[j*cols+(i+1)];
        const v01=Vg[(j+1)*cols+i], v11=Vg[(j+1)*cols+(i+1)];
        const x0=i*gs, y0=j*gs;
        let cfg=0;
        if (v00>lev) cfg|=1; if (v10>lev) cfg|=2;
        if (v11>lev) cfg|=4; if (v01>lev) cfg|=8;
        if (cfg===0||cfg===15) continue;
        const lerp=(va,vb,d)=>d*(lev-va)/(vb-va);
        const pts=[];
        if ((cfg&3)===1||(cfg&3)===2) pts.push(x0+lerp(v00,v10,gs), y0);
        if ((cfg&6)===2||(cfg&6)===4) pts.push(x0+gs, y0+lerp(v10,v11,gs));
        if ((cfg&12)===4||(cfg&12)===8) pts.push(x0+lerp(v01,v11,gs), y0+gs);
        if ((cfg&9)===1||(cfg&9)===8) pts.push(x0, y0+lerp(v00,v01,gs));
        if (pts.length >= 4) { ctx.moveTo(pts[0],pts[1]); ctx.lineTo(pts[2],pts[3]); }
      }
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();
}

function drawArrows(ctx, canvas, charges) {
  const W = canvas.width, H = canvas.height;
  const half = ARR_STEP >> 1, LN = Math.log1p(2000);
  ctx.save(); ctx.lineWidth = 0.9;
  for (let y = half; y < H; y += ARR_STEP) {
    for (let x = half; x < W; x += ARR_STEP) {
      let ex=0, ey=0;
      for (const c of charges) {
        const dx=x-c.x, dy=y-c.y, r2=dx*dx+dy*dy+EPS*EPS;
        const f=K*c.q/(r2*Math.sqrt(r2)); ex+=f*dx; ey+=f*dy;
      }
      const mag=Math.sqrt(ex*ex+ey*ey);
      if (mag<1e-7) continue;
      const t=Math.log1p(mag*2000)/LN, len=7+t*16;
      const nx=ex/mag, ny=ey/mag;
      const tx=x+nx*len, ty=y+ny*len;
      const hl=Math.min(len*.4,7), ang=Math.atan2(ny,nx), alp=0.35+t*0.65;
      const [r,g,b]=inferno(t);
      ctx.strokeStyle=`rgba(${r},${g},${b},${alp})`;
      ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(tx,ty); ctx.stroke();
      for (const da of [-0.4,0.4]) {
        ctx.beginPath(); ctx.moveTo(tx,ty);
        ctx.lineTo(tx-hl*Math.cos(ang+da), ty-hl*Math.sin(ang+da));
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

function computeFieldLines(canvas, charges) {
  const W = canvas.width, H = canvas.height, lines = [];
  for (const c of charges) {
    const sign = c.q > 0 ? 1 : -1;
    for (let k = 0; k < FL_N; k++) {
      const ang = 2*Math.PI*k/FL_N;
      let x = c.x+20*Math.cos(ang), y = c.y+20*Math.sin(ang);
      const xs=[x], ys=[y];
      for (let s = 0; s < FL_STEPS; s++) {
        const step = (px,py) => {
          let ex=0,ey=0;
          for (const cc of charges) {
            const dx=px-cc.x, dy=py-cc.y, r2=dx*dx+dy*dy+EPS*EPS;
            const f=K*cc.q/(r2*Math.sqrt(r2)); ex+=f*dx; ey+=f*dy;
          }
          const m=Math.sqrt(ex*ex+ey*ey)||1e-12;
          return [sign*ex/m, sign*ey/m];
        };
        const [k1x,k1y]=step(x,y);
        const [k2x,k2y]=step(x+FL_DT/2*k1x, y+FL_DT/2*k1y);
        const [k3x,k3y]=step(x+FL_DT/2*k2x, y+FL_DT/2*k2y);
        const [k4x,k4y]=step(x+FL_DT*k3x, y+FL_DT*k3y);
        x += FL_DT/6*(k1x+2*k2x+2*k3x+k4x);
        y += FL_DT/6*(k1y+2*k2y+2*k3y+k4y);
        if (x<-30||x>W+30||y<-30||y>H+30) break;
        let near=false;
        for (const cc of charges) {
          if (Math.hypot(x-cc.x,y-cc.y)<13 && cc.q*sign<0) { near=true; break; }
        }
        if (near) break;
        xs.push(x); ys.push(y);
      }
      lines.push({ xs, ys, pos: c.q>0 });
    }
  }
  return lines;
}

function drawFieldLines(ctx, cachedFL) {
  if (!cachedFL) return;
  ctx.save(); ctx.lineWidth = 1.0;
  for (const l of cachedFL) {
    if (l.xs.length < 2) continue;
    ctx.strokeStyle = l.pos ? 'rgba(180,48,48,0.45)' : 'rgba(37,90,210,0.45)';
    ctx.beginPath();
    ctx.moveTo(l.xs[0], l.ys[0]);
    for (let i = 1; i < l.xs.length; i++) ctx.lineTo(l.xs[i], l.ys[i]);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCharges(ctx, charges) {
  for (const c of charges) {
    const { x, y } = c; const pos = c.q > 0;
    const g = ctx.createRadialGradient(x,y,4,x,y,22);
    g.addColorStop(0, pos?'rgba(220,38,38,0.18)':'rgba(37,99,235,0.18)');
    g.addColorStop(1,'rgba(0,0,0,0)');
    ctx.beginPath(); ctx.arc(x,y,22,0,2*Math.PI); ctx.fillStyle=g; ctx.fill();
    ctx.beginPath(); ctx.arc(x,y,12,0,2*Math.PI);
    ctx.fillStyle=pos?'#DC2626':'#2563EB'; ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,0.8)'; ctx.lineWidth=1.5; ctx.stroke();
    ctx.fillStyle='#fff'; ctx.font='bold 14px system-ui';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(pos?'+':'−', x, y+0.5);
  }
}

// ── Styles ────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --font:       'IBM Plex Sans', -apple-system, BlinkMacSystemFont, sans-serif;
  --mono:       'IBM Plex Mono', 'Cascadia Code', Consolas, monospace;
  --bg:         #EAECF0;
  --surface:    #FFFFFF;
  --surface-2:  #F8F9FB;
  --border:     #D0D5DD;
  --border-2:   #B2BAC4;
  --text:       #101828;
  --muted:      #475467;
  --faint:      #98A2B3;
  --hdr:        #192236;
  --hdr-2:      #243147;
  --hdr-text:   #E5E9F0;
  --hdr-muted:  #7A8A9F;
  --accent:     #1570EF;
  --accent-lt:  #D1E9FF;
  --red:        #D92D20;
  --red-lt:     #FEE4E2;
  --blue:       #1570EF;
  --blue-lt:    #D1E9FF;
  --green:      #067647;
  --purple:     #6927DA;
  --amber:      #B54708;
  --amber-lt:   #FEF0C7;
  --sidebar-w:  268px;
  --radius:     4px;
  --radius-lg:  6px;
}

html, body { height: 100%; background: var(--bg); font-family: var(--font); color: var(--text); font-size: 13px; overflow: hidden; }

/* ── App shell ──────────────────────────────────────────────────────────────── */
#app-shell { display: flex; flex-direction: column; height: 100vh; }

/* ── Header ─────────────────────────────────────────────────────────────────── */
.hdr {
  height: 50px; flex-shrink: 0;
  background: var(--hdr);
  border-bottom: 1px solid #0F1824;
  display: flex; align-items: center;
  padding: 0 0 0 16px;
  user-select: none;
}
.hdr-brand {
  display: flex; align-items: center; gap: 10px;
  padding-right: 16px;
  border-right: 1px solid #2A3A50;
}
.hdr-icon {
  width: 28px; height: 28px;
  background: var(--accent);
  border-radius: var(--radius);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.hdr-name { font-size: 13.5px; font-weight: 600; color: var(--hdr-text); letter-spacing: .01em; line-height: 1.2; }
.hdr-sub  { font-size: 10.5px; color: var(--hdr-muted); margin-top: 1px; letter-spacing: .02em; }
.hdr-nav  { display: flex; align-items: center; gap: 1px; padding: 0 14px; flex: 1; }
.hdr-tab  {
  padding: 5px 11px;
  font-size: 12px; font-weight: 500;
  color: var(--hdr-muted);
  border-radius: 3px; cursor: pointer;
  transition: color .12s, background .12s;
}
.hdr-tab:hover { color: var(--hdr-text); background: rgba(255,255,255,.06); }
.hdr-tab.on    { color: var(--hdr-text); background: rgba(255,255,255,.09); }
.hdr-right {
  display: flex; align-items: center;
  height: 100%;
  border-left: 1px solid #2A3A50;
  padding: 0 16px;
  gap: 10px;
  font-family: var(--mono);
  font-size: 10.5px;
  color: var(--hdr-muted);
}
.hdr-dot { width: 6px; height: 6px; border-radius: 50%; background: #4ADE80; flex-shrink: 0; }
.hdr-div { width: 1px; height: 13px; background: #2A3A50; }

/* ── Body ───────────────────────────────────────────────────────────────────── */
.body { display: flex; flex: 1; overflow: hidden; }

/* ── Sidebar ─────────────────────────────────────────────────────────────────── */
.sidebar {
  width: var(--sidebar-w); min-width: var(--sidebar-w);
  background: var(--surface);
  border-right: 1px solid var(--border);
  display: flex; flex-direction: column;
  overflow-y: auto; overflow-x: hidden;
}
.sidebar::-webkit-scrollbar { width: 4px; }
.sidebar::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

.s-sec { padding: 14px; border-bottom: 1px solid var(--border); }
.s-sec:last-child { border-bottom: none; }

.s-lbl {
  font-size: 9.5px; font-weight: 600;
  letter-spacing: .09em; text-transform: uppercase;
  color: var(--faint); margin-bottom: 10px;
}

/* Mode buttons */
.mode-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 5px; }
.mbtn {
  padding: 7px 0;
  border: 1px solid var(--border-2);
  background: var(--surface); border-radius: var(--radius);
  font-family: var(--font); font-size: 11.5px; font-weight: 500;
  color: var(--muted); cursor: pointer;
  transition: all .1s; text-align: center; user-select: none;
}
.mbtn:hover { color: var(--text); background: var(--surface-2); }
.mbtn.pos { background: var(--red-lt);   border-color: #FCA5A5; color: var(--red);   }
.mbtn.neg { background: var(--blue-lt);  border-color: #93C5FD; color: var(--blue);  }
.mbtn.era { background: var(--amber-lt); border-color: #FCD34D; color: var(--amber); }

.clr-btn {
  margin-top: 7px; width: 100%; padding: 6px 0;
  border: 1px solid var(--border); background: var(--surface);
  border-radius: var(--radius); font-family: var(--font);
  font-size: 11.5px; font-weight: 500; color: var(--muted);
  cursor: pointer; transition: all .1s;
  letter-spacing: .01em;
}
.clr-btn:hover { border-color: #FCA5A5; color: var(--red); background: var(--red-lt); }

/* Toggles */
.tog-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 5px 0;
}
.tog-name { font-size: 12.5px; color: var(--text); }

.sw { position: relative; width: 34px; height: 18px; cursor: pointer; flex-shrink: 0; }
.sw input { opacity: 0; width: 0; height: 0; position: absolute; }
.sw-track {
  position: absolute; inset: 0;
  background: var(--border-2); border-radius: 9px;
  transition: background .15s;
}
.sw input:checked + .sw-track { background: var(--accent); }
.sw-knob {
  position: absolute; top: 2px; left: 2px;
  width: 14px; height: 14px; border-radius: 50%;
  background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.2);
  transition: transform .15s; pointer-events: none;
}
.sw input:checked ~ .sw-knob { transform: translateX(16px); }

/* Color scale */
.cbar {
  height: 7px; border-radius: 3px; margin-top: 11px;
  background: linear-gradient(to right,#0f0e1a,#3b0764,#7c2d8e,#c2185b,#e64a19,#f9a825,#fff9c4);
  border: 1px solid var(--border);
}
.cbar-row { display: flex; justify-content: space-between; margin-top: 4px; font-size: 9.5px; color: var(--faint); font-family: var(--mono); }

/* Charge list */
.ci-list { display: flex; flex-direction: column; gap: 4px; }
.ci {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 8px;
  border: 1px solid var(--border); border-radius: var(--radius);
  background: var(--surface-2); font-size: 11.5px;
}
.ci-tag { font-weight: 600; font-family: var(--mono); width: 22px; flex-shrink: 0; }
.ci.pos .ci-tag { color: var(--red); }
.ci.neg .ci-tag { color: var(--blue); }
.ci-xy { flex: 1; color: var(--faint); font-family: var(--mono); font-size: 10.5px; }
.ci-rm {
  background: none; border: none; cursor: pointer;
  color: var(--faint); font-size: 14px; line-height: 1;
  padding: 1px 4px; border-radius: 3px; flex-shrink: 0;
}
.ci-rm:hover { color: var(--red); background: var(--red-lt); }
.empty { font-size: 11.5px; color: var(--faint); font-style: italic; text-align: center; padding: 8px 0; }

/* Probe */
.probe-xy { font-size: 11px; color: var(--faint); font-family: var(--mono); margin-bottom: 9px; min-height: 15px; }
.probe-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.pc {
  background: var(--surface-2); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 9px 10px;
}
.pk { font-size: 9px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--faint); margin-bottom: 5px; }
.pv { font-size: 14px; font-weight: 500; font-family: var(--mono); font-variant-numeric: tabular-nums; }
.pv.E { color: var(--purple); }
.pv.V { color: var(--green); }
.pu { font-size: 9px; color: var(--faint); margin-top: 2px; font-family: var(--mono); letter-spacing: .04em; }

/* Shortcuts */
.shortcuts { display: flex; flex-direction: column; gap: 5px; font-size: 11.5px; color: var(--muted); }
.sh-row { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; line-height: 1.8; }
kbd {
  display: inline-block; padding: 1px 5px;
  background: var(--surface-2); border: 1px solid var(--border-2);
  border-bottom-width: 2px; border-radius: 3px;
  font-family: var(--mono); font-size: 10.5px;
  color: var(--text); vertical-align: middle;
}
.sh-sep { color: var(--faint); font-size: 10px; }
.hint { font-size: 10.5px; color: var(--faint); margin-top: 3px; }

/* ── Workspace ───────────────────────────────────────────────────────────────── */
.workspace { flex: 1; display: flex; flex-direction: column; padding: 12px; gap: 8px; min-width: 0; }

/* Canvas card */
.ccard {
  flex: 1; background: var(--surface);
  border: 1px solid var(--border); border-radius: var(--radius-lg);
  position: relative; overflow: hidden; min-height: 0;
}

.ctoolbar {
  position: absolute; top: 0; left: 0; right: 0;
  height: 44px; border-bottom: 1px solid var(--border);
  background: var(--surface-2);
  display: flex; align-items: center;
  padding: 0 14px; gap: 10px; z-index: 10; user-select: none;
}
.badge {
  padding: 3px 10px; border-radius: 3px;
  font-family: var(--mono); font-size: 11.5px; font-weight: 500;
  border: 1px solid transparent; letter-spacing: .02em;
}
.badge.pos { background: var(--red-lt);   border-color: #FCA5A5; color: var(--red);   }
.badge.neg { background: var(--blue-lt);  border-color: #93C5FD; color: var(--blue);  }
.badge.era { background: var(--amber-lt); border-color: #FCD34D; color: var(--amber); }
.tsep { width: 1px; height: 16px; background: var(--border); }
.tcnt { color: var(--faint); font-size: 11.5px; font-family: var(--mono); }
.thint { color: var(--faint); font-size: 11px; margin-left: auto; }

canvas { position: absolute; top: 44px; left: 0; right: 0; bottom: 0; width: 100%; height: calc(100% - 44px); cursor: crosshair; display: block; }

.c-empty {
  position: absolute; top: 50%; left: 50%;
  transform: translate(-50%,-50%);
  text-align: center; color: var(--faint); pointer-events: none;
}
.c-empty-title { font-size: 13.5px; font-weight: 500; color: var(--muted); margin-bottom: 5px; }
.c-empty-sub   { font-size: 12px; line-height: 1.8; }

/* Status bar */
.sbar {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); height: 34px;
  padding: 0 14px; display: flex; align-items: center;
  font-family: var(--mono); font-size: 11px;
  flex-shrink: 0;
}
.si { display: flex; align-items: center; gap: 8px; padding-right: 16px; margin-right: 16px; border-right: 1px solid var(--border); }
.si:last-child { border-right: none; margin-right: 0; padding-right: 0; }
.sk { color: var(--faint); font-size: 10px; letter-spacing: .05em; text-transform: uppercase; }
.sv { color: var(--text); font-weight: 500; }
.ml { margin-left: auto; }
`;

// ── Component ─────────────────────────────────────────────────────────────────
export default function App() {
  const [charges, setCharges] = useState([]);
  const [mode,    setMode]    = useState('pos');
  const [layers,  setLayers]  = useState({ heat:true, arr:true, eq:true, fl:false });
  const [probe,   setProbe]   = useState({ x:null, y:null, E:null, V:null });

  const chargesRef = useRef([]);
  const modeRef    = useRef('pos');
  const layersRef  = useRef({ heat:true, arr:true, eq:true, fl:false });
  const dragRef    = useRef(null);
  const flCacheRef = useRef(null);
  const flDirty    = useRef(true);
  const nextId     = useRef(1);
  const canvasRef  = useRef(null);
  const cardRef    = useRef(null);

  // Sync refs
  useEffect(() => { chargesRef.current = charges; }, [charges]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { layersRef.current = layers; }, [layers]);

  // ── Render frame ─────────────────────────────────────────────────────────────
  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const ch = chargesRef.current;
    const ly = layersRef.current;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H);
    drawGrid(ctx, W, H);
    if (ch.length === 0) return;

    if (ly.heat) drawHeatmap(ctx, canvas, ch);
    if (ly.fl) {
      if (flDirty.current) { flCacheRef.current = computeFieldLines(canvas, ch); flDirty.current = false; }
      drawFieldLines(ctx, flCacheRef.current);
    }
    if (ly.eq)   drawEquipotentials(ctx, canvas, ch);
    if (ly.arr)  drawArrows(ctx, canvas, ch);
    drawCharges(ctx, ch);
  }, []);

  // Resize observer
  useEffect(() => {
    const card = cardRef.current, canvas = canvasRef.current;
    if (!card || !canvas) return;
    const resize = () => {
      const r = card.getBoundingClientRect();
      canvas.width  = r.width;
      canvas.height = r.height - TOOLBAR_H;
      requestAnimationFrame(renderFrame);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(card);
    return () => ro.disconnect();
  }, [renderFrame]);

  // Re-render when data changes
  useEffect(() => {
    requestAnimationFrame(renderFrame);
  }, [charges, layers, renderFrame]);

  // ── Canvas helpers ────────────────────────────────────────────────────────────
  const getXY = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  const chargeAt = (x, y, r=18) => {
    const ch = chargesRef.current;
    for (let i = ch.length - 1; i >= 0; i--)
      if (Math.hypot(ch[i].x - x, ch[i].y - y) < r) return i;
    return -1;
  };

  const removeCharge = useCallback((id) => {
    setCharges(p => p.filter(c => c.id !== id));
    flDirty.current = true;
  }, []);

  const clearAll = useCallback(() => {
    setCharges([]);
    flDirty.current = true;
    flCacheRef.current = null;
    setProbe({ x:null, y:null, E:null, V:null });
  }, []);

  // ── Mouse ─────────────────────────────────────────────────────────────────────
  const onMouseDown = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const [x, y] = getXY(e);
    const m = modeRef.current;

    if (e.button === 2) {
      const i = chargeAt(x, y);
      if (i >= 0) { setCharges(p => { const n=[...p]; n.splice(i,1); return n; }); flDirty.current=true; }
      return;
    }
    if (m === 'era') {
      const i = chargeAt(x, y);
      if (i >= 0) { setCharges(p => { const n=[...p]; n.splice(i,1); return n; }); flDirty.current=true; }
      return;
    }
    const hit = chargeAt(x, y);
    if (hit >= 0) {
      dragRef.current = { idx:hit, ox:x-chargesRef.current[hit].x, oy:y-chargesRef.current[hit].y };
      canvas.style.cursor = 'grabbing';
      return;
    }
    const id = nextId.current++;
    setCharges(p => [...p, { x, y, q: m==='pos'?1:-1, id }]);
    flDirty.current = true;
  }, []);

  const onMouseMove = useCallback((e) => {
    if (!canvasRef.current) return;
    const [x, y] = getXY(e);

    const ch = chargesRef.current;
    if (ch.length > 0) {
      const [ex, ey] = computeE(ch, x, y);
      const mag = Math.sqrt(ex*ex+ey*ey);
      const v   = computeV(ch, x, y);
      setProbe({ x:Math.round(x), y:Math.round(y), E:mag.toFixed(4), V:v.toFixed(4) });
    } else {
      setProbe(p => ({ ...p, x:Math.round(x), y:Math.round(y) }));
    }

    if (dragRef.current !== null) {
      const { idx, ox, oy } = dragRef.current;
      setCharges(p => { const n=[...p]; n[idx]={...n[idx], x:x-ox, y:y-oy}; return n; });
      flDirty.current = true;
    }
  }, []);

  const onMouseUp = useCallback(() => {
    dragRef.current = null;
    if (canvasRef.current) canvasRef.current.style.cursor = 'crosshair';
  }, []);

  // ── Keyboard ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (document.activeElement !== document.body) return;
      const k = e.key.toLowerCase();
      if      (k==='q') setMode('pos');
      else if (k==='w') setMode('neg');
      else if (k==='e') setMode('era');
      else if (k==='c') clearAll();
      else if (k==='h') setLayers(p => ({ ...p, heat:!p.heat }));
      else if (k==='a') setLayers(p => ({ ...p, arr:!p.arr }));
      else if (k==='p') setLayers(p => ({ ...p, eq:!p.eq }));
      else if (k==='f') { flDirty.current=true; setLayers(p => ({ ...p, fl:!p.fl })); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [clearAll]);

  // ── Render ────────────────────────────────────────────────────────────────────
  const badgeCls = mode==='pos'?'pos':mode==='neg'?'neg':'era';
  const badgeTxt = mode==='pos'?'Place +q':mode==='neg'?'Place −q':'Erase Mode';

  return (
    <>
      <style>{CSS}</style>
      <div id="app-shell">

        {/* ── Header ── */}
        <header className="hdr">
          <div className="hdr-brand">
            <div className="hdr-icon">
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
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
            <div className="hdr-tab on">Field Viewer</div>
            <div className="hdr-tab">Analysis</div>
            <div className="hdr-tab">Export</div>
          </div>
          <div className="hdr-right">
            <div className="hdr-dot" />
            <span>READY</span>
            <div className="hdr-div" />
            <span>K = {K}</span>
            <div className="hdr-div" />
            <span style={{color:'var(--hdr-muted)'}}>Proto·I</span>
          </div>
        </header>

        <div className="body">

          {/* ── Sidebar ── */}
          <aside className="sidebar">

            {/* Charge mode */}
            <div className="s-sec">
              <div className="s-lbl">Charge Mode</div>
              <div className="mode-row">
                {[['pos','＋ Pos'],['neg','− Neg'],['era','✕ Erase']].map(([m,lbl]) => (
                  <button key={m} className={`mbtn ${mode===m?m:''}`} onClick={() => setMode(m)}>{lbl}</button>
                ))}
              </div>
              <button className="clr-btn" onClick={clearAll}>Clear All Charges</button>
            </div>

            {/* Layers */}
            <div className="s-sec">
              <div className="s-lbl">Visualization Layers</div>
              {[
                { k:'heat', l:'Field heatmap' },
                { k:'arr',  l:'E-field arrows' },
                { k:'eq',   l:'Equipotentials' },
                { k:'fl',   l:'Field lines (RK4)' },
              ].map(({ k, l }) => (
                <div className="tog-row" key={k}>
                  <span className="tog-name">{l}</span>
                  <label className="sw">
                    <input type="checkbox" checked={layers[k]} onChange={() => {
                      if (k==='fl') flDirty.current = true;
                      setLayers(p => ({ ...p, [k]:!p[k] }));
                    }} />
                    <span className="sw-track" />
                    <span className="sw-knob" />
                  </label>
                </div>
              ))}
              <div className="cbar" />
              <div className="cbar-row"><span>weak</span><span>strong |E|</span></div>
            </div>

            {/* Charge list */}
            <div className="s-sec">
              <div className="s-lbl">Active Charges&ensp;{charges.length > 0 && `(${charges.length})`}</div>
              <div className="ci-list">
                {charges.length === 0
                  ? <p className="empty">No charges placed</p>
                  : charges.map(c => (
                    <div key={c.id} className={`ci ${c.q>0?'pos':'neg'}`}>
                      <span className="ci-tag">{c.q>0?'+q':'−q'}</span>
                      <span className="ci-xy">({Math.round(c.x)}, {Math.round(c.y)})</span>
                      <button className="ci-rm" onClick={() => removeCharge(c.id)}>×</button>
                    </div>
                  ))
                }
              </div>
            </div>

            {/* Field probe */}
            <div className="s-sec">
              <div className="s-lbl">Field Probe</div>
              <div className="probe-xy">
                {probe.x !== null ? `x = ${probe.x}   y = ${probe.y}` : 'Hover over the canvas'}
              </div>
              <div className="probe-cards">
                <div className="pc">
                  <div className="pk">|E| Field</div>
                  <div className="pv E">{probe.E ?? '—'}</div>
                  <div className="pu">N / C</div>
                </div>
                <div className="pc">
                  <div className="pk">Potential V</div>
                  <div className="pv V">{probe.V ?? '—'}</div>
                  <div className="pu">Volts</div>
                </div>
              </div>
            </div>

            {/* Shortcuts */}
            <div className="s-sec">
              <div className="s-lbl">Keyboard Shortcuts</div>
              <div className="shortcuts">
                <div className="sh-row"><kbd>Q</kbd> Positive <span className="sh-sep">·</span> <kbd>W</kbd> Negative <span className="sh-sep">·</span> <kbd>E</kbd> Erase</div>
                <div className="sh-row"><kbd>H</kbd> Heatmap <span className="sh-sep">·</span> <kbd>A</kbd> Arrows <span className="sh-sep">·</span> <kbd>P</kbd> Equip.</div>
                <div className="sh-row"><kbd>F</kbd> Field lines <span className="sh-sep">·</span> <kbd>C</kbd> Clear all</div>
                <div className="hint">Drag charges to reposition · Right-click to delete</div>
              </div>
            </div>

          </aside>

          {/* ── Workspace ── */}
          <div className="workspace">
            <div className="ccard" ref={cardRef}>
              <div className="ctoolbar">
                <span className={`badge ${badgeCls}`}>{badgeTxt}</span>
                <span className="tsep" />
                <span className="tcnt">{charges.length} {charges.length===1?'charge':'charges'}</span>
                {charges.length === 0 && <span className="thint">Select a mode, then click to place a charge</span>}
              </div>
              <canvas
                ref={canvasRef}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={onMouseUp}
                onContextMenu={e => e.preventDefault()}
              />
              {charges.length === 0 && (
                <div className="c-empty">
                  <div className="c-empty-title">Canvas is empty</div>
                  <div className="c-empty-sub">
                    Choose a charge mode and click to place<br/>
                    Drag to reposition · Right-click to delete
                  </div>
                </div>
              )}
            </div>

            {/* Status bar */}
            <div className="sbar">
              <div className="si">
                <span className="sk">Cursor</span>
                <span className="sv">{probe.x !== null ? `${probe.x}, ${probe.y}` : '—'}</span>
              </div>
              <div className="si">
                <span className="sk">|E|</span>
                <span className="sv">{probe.E ? `${probe.E} N/C` : '—'}</span>
              </div>
              <div className="si">
                <span className="sk">V</span>
                <span className="sv">{probe.V ? `${probe.V} V` : '—'}</span>
              </div>
              <div className="si ml">
                <span className="sk">Coulomb · K</span>
                <span className="sv" style={{color:'var(--faint)'}}>0.8</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}