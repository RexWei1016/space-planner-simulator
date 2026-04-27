/* grid.js — 座標換算、網格繪製、snap、canvas resize */
'use strict';

// 1 ping = 3.3058 m² = 33058 cm²，邊長 ≈ 181.82 cm
const PING_SIDE_CM = Math.sqrt(33058); // ≈ 181.82

// 可選的網格格子大小選項
const GRID_CELL_OPTIONS = [
  { label: '25 cm',        cm: 25  },
  { label: '50 cm（預設）', cm: 50  },
  { label: '100 cm (1m)',  cm: 100 },
  { label: '182 cm (≈1坪)', cm: Math.round(PING_SIDE_CM) },
];

const Grid = {
  // ── Coordinate conversion ────────────────────────────────────
  cmToPx(cm) { return cm * AppState.view.scale; },
  pxToCm(px) { return px / AppState.view.scale; },

  snapPx(px) {
    const cellPx = AppState.view.gridCellCm * AppState.view.scale;
    return Math.round(px / cellPx) * cellPx;
  },

  snapCm(cm, stepCm) {
    const cell = stepCm || AppState.view.gridCellCm;
    return Math.round(cm / cell) * cell;
  },

  // 細粒度 snap：拖曳家具用，固定 5cm，不受網格格子大小影響
  snapCmFine(cm, stepCm) {
    const fine = stepCm || 5;
    return Math.round(cm / fine) * fine;
  },

  eventToCm(e) {
    const stage = document.getElementById('canvas-stage');
    const rect  = stage.getBoundingClientRect();
    const cmX   = this.pxToCm(e.clientX - rect.left);
    const cmY   = this.pxToCm(e.clientY - rect.top);
    return {
      x: Math.max(0, Math.min(AppState.room.widthCm,  cmX)),
      y: Math.max(0, Math.min(AppState.room.heightCm, cmY))
    };
  },

  eventToCmSnapped(e) {
    const { x, y } = this.eventToCm(e);
    return {
      x: Math.max(0, Math.min(AppState.room.widthCm,  this.snapCm(x))),
      y: Math.max(0, Math.min(AppState.room.heightCm, this.snapCm(y)))
    };
  },

  // ── Canvas resize ────────────────────────────────────────────
  resizeCanvas() {
    const W = this.cmToPx(AppState.room.widthCm);
    const H = this.cmToPx(AppState.room.heightCm);
    const stage   = document.getElementById('canvas-stage');
    const gridCvs = document.getElementById('layer-grid');
    const roomSvg = document.getElementById('layer-room');
    const zoneSvg = document.getElementById('layer-zones');
    const fiLayer = document.getElementById('layer-furniture');
    const overlay = document.getElementById('interaction-overlay');

    [stage, fiLayer, overlay].forEach(el => {
      el.style.width  = W + 'px';
      el.style.height = H + 'px';
    });
    gridCvs.width  = W;
    gridCvs.height = H;
    [roomSvg, zoneSvg].forEach(svg => {
      svg.setAttribute('width',  W);
      svg.setAttribute('height', H);
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    });
  },

  // ── Set scale ────────────────────────────────────────────────
  setScale(newScale) {
    AppState.view.scale = Math.max(1, Math.min(10, newScale));
    this.resizeCanvas();
    this.drawGrid();
    LayerRoom.render();
    LayerZones.render();
    LayerFurniture.render();
    Storage.saveView();
    UIToolbar.updateZoomLabel();
  },

  // ── Set grid cell size ───────────────────────────────────────
  setGridCell(cm) {
    AppState.view.gridCellCm = cm;
    this.drawGrid();
    Storage.saveView();
  },

  // ── Draw grid canvas ─────────────────────────────────────────
  drawGrid() {
    const cvs  = document.getElementById('layer-grid');
    const ctx  = cvs.getContext('2d');
    const W    = cvs.width;
    const H    = cvs.height;
    const scale   = AppState.view.scale;
    const cellCm  = AppState.view.gridCellCm;
    const majorCm = cellCm * 2;

    ctx.clearRect(0, 0, W, H);

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    // 坪數格（最底層，在一般網格之前畫）
    if (AppState.view.showPingGrid) {
      this._drawPingGrid(ctx, W, H, scale);
    }

    // Minor grid lines
    ctx.strokeStyle = '#b8ccd8';   // 明顯深藍灰，肉眼可見
    ctx.lineWidth   = 0.5;
    this._drawGridLines(ctx, cellCm, scale, W, H);

    // Major grid lines (2× cell)
    ctx.strokeStyle = '#7898b0';   // 更深，區分主副格
    ctx.lineWidth   = 1;
    this._drawGridLines(ctx, majorCm, scale, W, H);

    // Room outer border
    ctx.strokeStyle = '#2c4a60';
    ctx.lineWidth   = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);

    // Ruler labels
    this._drawRuler(ctx, majorCm, scale, W, H);
  },

  // ── 坪數格 overlay ────────────────────────────────────────────
  _drawPingGrid(ctx, W, H, scale) {
    const pingPx = PING_SIDE_CM * scale;  // 1坪的邊長（px）

    // 填色：每個完整坪格淡橘色背景（棋盤式）
    let row = 0;
    for (let y = 0; y < H; y += pingPx, row++) {
      let col = 0;
      for (let x = 0; x < W; x += pingPx, col++) {
        const cellW = Math.min(pingPx, W - x);
        const cellH = Math.min(pingPx, H - y);
        // 棋盤交替色
        if ((row + col) % 2 === 0) {
          ctx.fillStyle = 'rgba(230, 126, 34, 0.04)';
        } else {
          ctx.fillStyle = 'rgba(52, 152, 219, 0.04)';
        }
        ctx.fillRect(x, y, cellW, cellH);
      }
    }

    // 坪數格格線（橘色虛線）
    ctx.strokeStyle = 'rgba(230, 126, 34, 0.35)';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([8, 5]);
    ctx.beginPath();
    for (let x = 0; x <= W + 0.5; x += pingPx) {
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, H);
    }
    for (let y = 0; y <= H + 0.5; y += pingPx) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(W, y + 0.5);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // 坪數標籤（每個格子中央）
    ctx.fillStyle    = 'rgba(180, 90, 20, 0.55)';
    ctx.font         = `bold ${Math.max(10, Math.min(14, pingPx * 0.08))}px sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    for (let y = 0, rowIdx = 0; y < H; y += pingPx, rowIdx++) {
      for (let x = 0, colIdx = 0; x < W; x += pingPx, colIdx++) {
        const cellW  = Math.min(pingPx, W - x);
        const cellH  = Math.min(pingPx, H - y);
        const cellPing = (cellW / scale) * (cellH / scale) / 33058;

        if (cellPing >= 0.05 && pingPx > 30) {
          const label = cellPing >= 0.95
            ? `${Math.round(cellPing)} 坪`
            : `${cellPing.toFixed(1)} 坪`;
          ctx.fillText(label, x + cellW / 2, y + cellH / 2);
        }
      }
    }
  },

  _drawGridLines(ctx, cellCm, scale, W, H) {
    const step = cellCm * scale;
    ctx.beginPath();
    // 從 0 畫到 W/H（含兩側邊），確保底部右側都有線
    for (let x = 0; x <= W + 0.5; x += step) {
      const px = Math.round(x) + 0.5;
      ctx.moveTo(px, 0);
      ctx.lineTo(px, H);
    }
    for (let y = 0; y <= H + 0.5; y += step) {
      const py = Math.round(y) + 0.5;
      ctx.moveTo(0,  py);
      ctx.lineTo(W, py);
    }
    ctx.stroke();
  },

  _drawRuler(ctx, cellCm, scale, W, H) {
    const step = cellCm * scale;
    ctx.fillStyle    = '#8fa8bb';
    ctx.font         = '10px monospace';
    ctx.textBaseline = 'top';
    ctx.textAlign    = 'left';

    for (let x = step, cm = cellCm; x < W - 2; x += step, cm += cellCm) {
      ctx.fillText(`${cm}`, x + 2, 2);
    }
    for (let y = step, cm = cellCm; y < H - 2; y += step, cm += cellCm) {
      ctx.fillText(`${cm}`, 2, y + 2);
    }
  }
};
