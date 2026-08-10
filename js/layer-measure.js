/* layer-measure.js — 測量圖層：拉出量測線、顯示距離 */
'use strict';

// 吸附判定半徑（螢幕 px，換算成 cm 後比較，縮放時手感才一致）
const MEASURE_SNAP_PX = 10;

// 量測線兩端的垂直短刻度長度（螢幕 px）
const MEASURE_TICK_PX = 6;

const SVG_NS = 'http://www.w3.org/2000/svg';

// 距離文字：超過 1m 就同時標出公尺
function formatDistance(cm) {
  const r = Math.round(cm);
  return r >= 100 ? `${r} cm (${(r / 100).toFixed(2)} m)` : `${r} cm`;
}

// ── 吸附候選點 ───────────────────────────────────────────────────
// 蒐集所有物件的邊界座標，讓量測端點可以精準貼上桌角、牆面、區域邊。
function _snapCandidates() {
  const xs = new Set([0, AppState.room.widthCm]);
  const ys = new Set([0, AppState.room.heightCm]);

  for (const z of AppState.zones) {
    xs.add(z.xCm); xs.add(z.xCm + z.widthCm);
    ys.add(z.yCm); ys.add(z.yCm + z.heightCm);
  }

  for (const f of AppState.furniture) {
    const def = getFurnitureDef(f.defId);
    if (!def) continue;
    const w   = f.widthCm || def.widthCm;
    const d   = f.depthCm || def.depthCm;
    const rot = f.rotation || 0;
    const fw  = (rot === 90 || rot === 270) ? d : w;
    const fh  = (rot === 90 || rot === 270) ? w : d;
    xs.add(f.xCm); xs.add(f.xCm + fw);
    ys.add(f.yCm); ys.add(f.yCm + fh);
  }

  return { xs: [...xs], ys: [...ys] };
}

const LayerMeasure = {
  _drag:      null,   // { x1, y1, x2, y2, snappedX, snappedY }
  _hoverPoint: null,

  // ── Render ───────────────────────────────────────────────────
  render() {
    const svg = document.getElementById('layer-measure');
    if (!svg) return;

    svg.style.visibility = AppState.view.showMeasure ? '' : 'hidden';
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    for (const m of AppState.measurements) {
      this._drawMeasurement(svg, m, false);
    }

    if (this._drag) {
      this._drawMeasurement(svg, {
        id: '__preview__',
        x1Cm: this._drag.x1, y1Cm: this._drag.y1,
        x2Cm: this._drag.x2, y2Cm: this._drag.y2
      }, true);
    }
  },

  _drawMeasurement(svg, m, isPreview) {
    const scale = AppState.view.scale;
    const x1 = m.x1Cm * scale, y1 = m.y1Cm * scale;
    const x2 = m.x2Cm * scale, y2 = m.y2Cm * scale;

    const dxCm = m.x2Cm - m.x1Cm;
    const dyCm = m.y2Cm - m.y1Cm;
    const distCm = Math.hypot(dxCm, dyCm);
    if (distCm < 0.01 && !isPreview) return;

    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'measure-group' + (isPreview ? ' measure-preview' : ''));
    if (!isPreview) g.setAttribute('data-measure-id', m.id);

    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', x1); line.setAttribute('y1', y1);
    line.setAttribute('x2', x2); line.setAttribute('y2', y2);
    line.setAttribute('class', 'measure-line');
    g.appendChild(line);

    // 兩端的垂直刻度，讓端點落在哪裡一目了然
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    const nx  = -(y2 - y1) / len * MEASURE_TICK_PX;
    const ny  =  (x2 - x1) / len * MEASURE_TICK_PX;
    [[x1, y1], [x2, y2]].forEach(([px, py]) => {
      const tick = document.createElementNS(SVG_NS, 'line');
      tick.setAttribute('x1', px - nx); tick.setAttribute('y1', py - ny);
      tick.setAttribute('x2', px + nx); tick.setAttribute('y2', py + ny);
      tick.setAttribute('class', 'measure-tick');
      g.appendChild(tick);
    });

    // 標籤：主距離，斜線再補一行 Δx / Δy
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const isDiagonal = Math.abs(dxCm) > 0.5 && Math.abs(dyCm) > 0.5;

    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', midX);
    text.setAttribute('y', midY);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('class', 'measure-text');

    const l1 = document.createElementNS(SVG_NS, 'tspan');
    l1.setAttribute('x', midX);
    l1.setAttribute('dy', isDiagonal ? '-0.2em' : '0.35em');
    l1.textContent = formatDistance(distCm);
    text.appendChild(l1);

    if (isDiagonal) {
      const l2 = document.createElementNS(SVG_NS, 'tspan');
      l2.setAttribute('x', midX);
      l2.setAttribute('dy', '1.2em');
      l2.setAttribute('class', 'measure-subtext');
      l2.textContent = `↔${Math.round(Math.abs(dxCm))} ↕${Math.round(Math.abs(dyCm))}`;
      text.appendChild(l2);
    }

    g.appendChild(text);
    svg.appendChild(g);

    // 先插進 DOM 才量得到文字尺寸，再把底板墊到文字後面
    const bbox = text.getBBox();
    const pad  = 4;
    const bg   = document.createElementNS(SVG_NS, 'rect');
    bg.setAttribute('x', bbox.x - pad);
    bg.setAttribute('y', bbox.y - pad / 2);
    bg.setAttribute('width',  bbox.width  + pad * 2);
    bg.setAttribute('height', bbox.height + pad);
    bg.setAttribute('rx', 3);
    bg.setAttribute('class', 'measure-label-bg');
    g.insertBefore(bg, text);

    if (!isPreview) {
      g.addEventListener('mousedown', e => {
        if (AppState.mode !== 'measure') return;
        e.stopPropagation();
        dispatch('DELETE_MEASUREMENT', { id: m.id });
        toast('已刪除這條量測線');
      });
    }
  },

  // ── 端點吸附 ─────────────────────────────────────────────────
  // x / y 各自獨立吸附：先看有沒有物件邊界可貼，沒有才退回網格。
  _snap(rawCm, e) {
    const tolCm = MEASURE_SNAP_PX / AppState.view.scale;
    const { xs, ys } = _snapCandidates();

    let x = null, y = null;
    let bestDx = tolCm, bestDy = tolCm;

    for (const cx of xs) {
      const d = Math.abs(cx - rawCm.x);
      if (d <= bestDx) { bestDx = d; x = cx; }
    }
    for (const cy of ys) {
      const d = Math.abs(cy - rawCm.y);
      if (d <= bestDy) { bestDy = d; y = cy; }
    }

    const step = Grid.stepForEvent(e);
    return {
      x: x === null ? Grid.snapCm(rawCm.x, step) : x,
      y: y === null ? Grid.snapCm(rawCm.y, step) : y,
      snappedX: x !== null,
      snappedY: y !== null
    };
  },

  _pointFromEvent(e) {
    const raw = Grid.eventToCm(e);
    const p   = this._snap(raw, e);
    return {
      x: Math.max(0, Math.min(AppState.room.widthCm,  p.x)),
      y: Math.max(0, Math.min(AppState.room.heightCm, p.y)),
      snappedX: p.snappedX,
      snappedY: p.snappedY
    };
  },

  // ── 互動 ─────────────────────────────────────────────────────
  onMouseDown(e) {
    if (AppState.mode !== 'measure') return;
    const p = this._pointFromEvent(e);
    this._drag = { x1: p.x, y1: p.y, x2: p.x, y2: p.y };
    this.render();
  },

  onMouseMove(e) {
    if (!this._drag || AppState.mode !== 'measure') return;
    const p = this._pointFromEvent(e);

    let x2 = p.x, y2 = p.y;
    // Shift：鎖成水平或垂直，量走道寬度時很好用
    if (e.shiftKey) {
      if (Math.abs(x2 - this._drag.x1) >= Math.abs(y2 - this._drag.y1)) {
        y2 = this._drag.y1;
      } else {
        x2 = this._drag.x1;
      }
    }

    this._drag.x2 = x2;
    this._drag.y2 = y2;
    this.render();

    const dist = Math.hypot(x2 - this._drag.x1, y2 - this._drag.y1);
    document.getElementById('status-cursor').textContent = `量測：${formatDistance(dist)}`;
  },

  onMouseUp(e) {
    if (!this._drag || AppState.mode !== 'measure') return;

    const d = this._drag;
    this._drag = null;

    const dist = Math.hypot(d.x2 - d.x1, d.y2 - d.y1);
    if (dist < 1) { this.render(); return; }   // 只是點一下，不留線

    dispatch('ADD_MEASUREMENT', {
      id:   generateId('ms'),
      x1Cm: d.x1, y1Cm: d.y1,
      x2Cm: d.x2, y2Cm: d.y2
    });
    toast(`${formatDistance(dist)} — 點擊量測線可刪除`);
  },

  clearAll() {
    if (!AppState.measurements.length) { toast('目前沒有量測線'); return; }
    dispatch('CLEAR_MEASUREMENTS');
    toast('已清除所有量測線');
  }
};
