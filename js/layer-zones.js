/* layer-zones.js — Layer 2：SVG 區域繪製、渲染、拖曳 */
'use strict';

// 可以畫出來的最小區域邊長（cm）
const MIN_ZONE_CM = 10;

const LayerZones = {
  _drawing:  false,
  _startCm:  null,
  _previewEl: null,

  // 拖曳區域的狀態
  _drag: null,  // { id, startMouseX, startMouseY, startZoneXcm, startZoneYcm, origXcm, origYcm, undoPushed }
  _resize: null,

  // ── Render all zones ─────────────────────────────────────────
  render() {
    const svg   = document.getElementById('layer-zones');
    const scale = AppState.view.scale;
    svg.style.visibility = AppState.view.showLayer2 ? '' : 'hidden';

    // Remove all zone elements (keep preview rect)
    [...svg.querySelectorAll('[data-zone-id]')].forEach(el => el.remove());

    for (const zone of AppState.zones) {
      this._renderZone(svg, zone, scale);
    }

    // Keep preview rect on top
    if (this._previewEl && this._previewEl.parentNode === svg) {
      svg.appendChild(this._previewEl);
    }
  },

  _renderZone(svg, zone, scale) {
    const def = getZoneDef(zone.type);
    const g   = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('data-zone-id', zone.id);
    g.style.cursor = 'grab';

    const isSelected = AppState.selection.id === zone.id;

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x',      zone.xCm      * scale);
    rect.setAttribute('y',      zone.yCm      * scale);
    rect.setAttribute('width',  zone.widthCm  * scale);
    rect.setAttribute('height', zone.heightCm * scale);
    rect.setAttribute('fill',        def.color);
    rect.setAttribute('fill-opacity', zone.opacity || 0.3);
    rect.setAttribute('stroke',       def.color);
    rect.setAttribute('stroke-width', isSelected ? 2.5 : 1.5);
    rect.setAttribute('stroke-opacity', 0.7);
    rect.setAttribute('class', 'zone-rect' + (isSelected ? ' selected-zone' : ''));

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', (zone.xCm + zone.widthCm  / 2) * scale);
    label.setAttribute('y', (zone.yCm + zone.heightCm / 2) * scale);
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('dominant-baseline', 'middle');
    label.setAttribute('class', 'zone-label-text');
    label.setAttribute('fill', def.color);
    label.textContent = zone.label || def.label;

    // 坪數小標籤
    const areaLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    const areaPing  = (zone.widthCm * zone.heightCm / 33058).toFixed(1);
    areaLabel.setAttribute('x', (zone.xCm + zone.widthCm  / 2) * scale);
    areaLabel.setAttribute('y', (zone.yCm + zone.heightCm / 2) * scale + 16);
    areaLabel.setAttribute('text-anchor', 'middle');
    areaLabel.setAttribute('dominant-baseline', 'middle');
    areaLabel.setAttribute('font-size', '11');
    areaLabel.setAttribute('fill', def.color);
    areaLabel.setAttribute('opacity', '0.7');
    areaLabel.textContent = `${areaPing} 坪`;

    g.appendChild(rect);
    // 縮太小時文字會滿出區域外，依螢幕實際大小決定要不要放標籤
    if (zone.widthCm * scale > 40 && zone.heightCm * scale > 18) {
      g.appendChild(label);
    }
    if (zone.widthCm * scale > 60 && zone.heightCm * scale > 40) {
      g.appendChild(areaLabel);
    }

    // ── 點擊 → 選取 ──────────────────────────────────────────
    g.addEventListener('mousedown', e => {
      if (AppState.mode !== 'select') return;
      e.stopPropagation();
      dispatch('SET_SELECTION', { type: 'zone', id: zone.id });
      this._startDrag(e, zone);
    });

    // 選取時才畫出縮放控制點
    if (isSelected && AppState.mode === 'select') {
      const hs = 4;   // 控制點半徑（px）
      RESIZE_HANDLES.forEach(h => {
        const hx = (zone.xCm + zone.widthCm  * (h.dx + 1) / 2) * scale;
        const hy = (zone.yCm + zone.heightCm * (h.dy + 1) / 2) * scale;
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        dot.setAttribute('x', hx - hs);
        dot.setAttribute('y', hy - hs);
        dot.setAttribute('width',  hs * 2);
        dot.setAttribute('height', hs * 2);
        dot.setAttribute('class', 'zone-handle');
        dot.style.cursor = `${h.pos}-resize`;
        dot.addEventListener('mousedown', e => {
          if (AppState.mode !== 'select') return;
          e.stopPropagation();
          this._startResize(e, zone, h);
        });
        g.appendChild(dot);
      });
    }

    svg.appendChild(g);
  },

  // ── Zone Drag ────────────────────────────────────────────────
  _startDrag(e, zone) {
    this._drag = {
      id:           zone.id,
      startMouseX:  e.clientX,
      startMouseY:  e.clientY,
      startZoneXcm: zone.xCm,
      startZoneYcm: zone.yCm,
      origXcm:      zone.xCm,
      origYcm:      zone.yCm,
      undoPushed:   false
    };
    // Change cursor while dragging
    document.getElementById('layer-zones').style.cursor = 'grabbing';
  },

  // ── 拖拉縮放 ─────────────────────────────────────────────────
  _startResize(e, zone, handle) {
    this._resize = {
      id: zone.id, handle,
      startMouseX: e.clientX, startMouseY: e.clientY,
      origX: zone.xCm, origY: zone.yCm,
      origW: zone.widthCm, origH: zone.heightCm,
      cur: { x: zone.xCm, y: zone.yCm, w: zone.widthCm, h: zone.heightCm }
    };
  },

  _onResizeMove(e) {
    const r = this._resize;
    const zone = AppState.zones.find(z => z.id === r.id);
    if (!zone) { this._resize = null; return; }

    const step = e.altKey ? 1 : 5;
    const dx = Grid.pxToCm(e.clientX - r.startMouseX);
    const dy = Grid.pxToCm(e.clientY - r.startMouseY);

    let x = r.origX, y = r.origY, w = r.origW, h = r.origH;

    if (r.handle.dx < 0) {
      const right = r.origX + r.origW;
      x = Math.max(0, Math.min(right - MIN_ZONE_CM, Grid.snapCmFine(r.origX + dx, step)));
      w = right - x;
    } else if (r.handle.dx > 0) {
      w = Math.max(MIN_ZONE_CM, Grid.snapCmFine(r.origW + dx, step));
      w = Math.min(w, AppState.room.widthCm - x);
    }

    if (r.handle.dy < 0) {
      const bottom = r.origY + r.origH;
      y = Math.max(0, Math.min(bottom - MIN_ZONE_CM, Grid.snapCmFine(r.origY + dy, step)));
      h = bottom - y;
    } else if (r.handle.dy > 0) {
      h = Math.max(MIN_ZONE_CM, Grid.snapCmFine(r.origH + dy, step));
      h = Math.min(h, AppState.room.heightCm - y);
    }

    r.cur = { x, y, w, h };
    zone.xCm = x; zone.yCm = y; zone.widthCm = w; zone.heightCm = h;
    this.render();

    document.getElementById('status-cursor').textContent =
      `區域：${Math.round(w)} × ${Math.round(h)} cm（${(w * h / 33058).toFixed(2)} 坪）`;
  },

  _onResizeUp() {
    const r = this._resize;
    this._resize = null;

    const zone = AppState.zones.find(z => z.id === r.id);
    if (!zone) return;

    // 先還原再套用，讓 undo 記到的是縮放前的狀態
    zone.xCm = r.origX; zone.yCm = r.origY;
    zone.widthCm = r.origW; zone.heightCm = r.origH;

    this.applyManualUpdate(r.id, {
      xCm: r.cur.x, yCm: r.cur.y,
      widthCm: r.cur.w, heightCm: r.cur.h
    });
  },

  _onDragMove(e) {
    if (this._resize) { this._onResizeMove(e); return; }
    if (!this._drag) return;
    const zone = AppState.zones.find(z => z.id === this._drag.id);
    if (!zone) { this._drag = null; return; }

    const dx = Grid.pxToCm(e.clientX - this._drag.startMouseX);
    const dy = Grid.pxToCm(e.clientY - this._drag.startMouseY);

    const rawX = this._drag.startZoneXcm + dx;
    const rawY = this._drag.startZoneYcm + dy;
    const step = e.altKey ? 1 : 5;
    const newX = Math.max(0, Math.min(AppState.room.widthCm  - zone.widthCm,  Grid.snapCmFine(rawX, step)));
    const newY = Math.max(0, Math.min(AppState.room.heightCm - zone.heightCm, Grid.snapCmFine(rawY, step)));
    if (!this._drag.undoPushed && (newX !== this._drag.origXcm || newY !== this._drag.origYcm)) {
      pushUndo();
      this._drag.undoPushed = true;
    }

    // Live-update SVG element without going through dispatch (smooth)
    const svg   = document.getElementById('layer-zones');
    const scale = AppState.view.scale;
    const g     = svg.querySelector(`[data-zone-id="${zone.id}"]`);
    if (g) {
      const r = g.querySelector('rect');
      const texts = g.querySelectorAll('text');
      if (r) {
        r.setAttribute('x', newX * scale);
        r.setAttribute('y', newY * scale);
      }
      // Update label positions
      if (texts[0]) {
        texts[0].setAttribute('x', (newX + zone.widthCm  / 2) * scale);
        texts[0].setAttribute('y', (newY + zone.heightCm / 2) * scale);
      }
      if (texts[1]) {
        texts[1].setAttribute('x', (newX + zone.widthCm  / 2) * scale);
        texts[1].setAttribute('y', (newY + zone.heightCm / 2) * scale + 16);
      }
    }

    // Update state directly for smooth drag (no undo push mid-drag)
    zone.xCm = newX;
    zone.yCm = newY;
  },

  _onDragUp() {
    if (this._resize) { this._onResizeUp(); return; }
    if (!this._drag) return;
    const zone = AppState.zones.find(z => z.id === this._drag.id);
    if (zone) Storage.saveFloorPlan();
    UIProperties.refresh();
    this._drag = null;
    document.getElementById('layer-zones').style.cursor = '';
  },

  applyManualUpdate(id, patch) {
    const zone = AppState.zones.find(z => z.id === id);
    if (!zone) return { ok: false, reason: 'not-found' };

    const widthCm = Math.max(10, Math.round(patch.widthCm ?? zone.widthCm));
    const heightCm = Math.max(10, Math.round(patch.heightCm ?? zone.heightCm));
    const maxX = Math.max(0, AppState.room.widthCm - widthCm);
    const maxY = Math.max(0, AppState.room.heightCm - heightCm);
    const xCm = Math.max(0, Math.min(maxX, Math.round(patch.xCm ?? zone.xCm)));
    const yCm = Math.max(0, Math.min(maxY, Math.round(patch.yCm ?? zone.yCm)));

    const changed =
      zone.xCm !== xCm ||
      zone.yCm !== yCm ||
      zone.widthCm !== widthCm ||
      zone.heightCm !== heightCm;

    if (!changed) return { ok: true };

    pushUndo();
    zone.xCm = xCm;
    zone.yCm = yCm;
    zone.widthCm = widthCm;
    zone.heightCm = heightCm;
    Storage.saveFloorPlan();
    renderAll();
    UIProperties.refresh();
    return { ok: true };
  },

  // ── 複製 / 貼上 ───────────────────────────────────────────────
  // 取出可獨立存在的資料快照（來源刪掉後仍可貼上）
  snapshot(id) {
    const zone = AppState.zones.find(z => z.id === id);
    if (!zone) return null;

    return {
      type:     zone.type,
      widthCm:  zone.widthCm,
      heightCm: zone.heightCm,
      label:    zone.label || '',
      opacity:  zone.opacity || 0.3,
      xCm:      zone.xCm,
      yCm:      zone.yCm
    };
  },

  // 區域允許互相重疊，因此只做邊界夾限，不做碰撞閃避
  pasteFrom(snap, atCm) {
    if (!snap) return { ok: false, reason: 'empty' };

    const def  = getZoneDef(snap.type);
    if (!def) return { ok: false, reason: 'type-not-found' };

    const maxX = Math.max(0, AppState.room.widthCm  - snap.widthCm);
    const maxY = Math.max(0, AppState.room.heightCm - snap.heightCm);

    let x = atCm ? atCm.x - snap.widthCm  / 2 : snap.xCm + DUPLICATE_OFFSET_CM;
    let y = atCm ? atCm.y - snap.heightCm / 2 : snap.yCm + DUPLICATE_OFFSET_CM;
    x = Math.max(0, Math.min(maxX, Grid.snapCmFine(x, 5)));
    y = Math.max(0, Math.min(maxY, Grid.snapCmFine(y, 5)));

    const zone = {
      id:       generateId('z'),
      type:     snap.type,
      xCm:      x,
      yCm:      y,
      widthCm:  snap.widthCm,
      heightCm: snap.heightCm,
      label:    snap.label || def.label,
      opacity:  snap.opacity
    };

    dispatch('ADD_ZONE', zone);
    dispatch('SET_SELECTION', { type: 'zone', id: zone.id });
    return { ok: true, id: zone.id };
  },

  duplicate(id, atCm) {
    return this.pasteFrom(this.snapshot(id), atCm);
  },

  // ── Drawing interaction ──────────────────────────────────────
  initDrawing() {
    const overlay = document.getElementById('interaction-overlay');

    overlay.addEventListener('mousedown', this._onMouseDown.bind(this));
    overlay.addEventListener('mousemove', this._onMouseMove.bind(this));
    overlay.addEventListener('mouseup',   this._onMouseUp.bind(this));

    // 測量模式共用同一個 overlay；各自用 AppState.mode 判斷要不要理會
    overlay.addEventListener('mousedown', e => LayerMeasure.onMouseDown(e));
    document.addEventListener('mousemove', e => LayerMeasure.onMouseMove(e));
    document.addEventListener('mouseup',   e => LayerMeasure.onMouseUp(e));

    // Global handlers for zone drag (SVG elements, not overlay)
    document.addEventListener('mousemove', this._onDragMove.bind(this));
    document.addEventListener('mouseup',   this._onDragUp.bind(this));

    // Create persistent preview rect in SVG
    const svg = document.getElementById('layer-zones');
    this._previewEl = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    this._previewEl.setAttribute('id', 'zone-preview-rect');
    this._previewEl.style.display = 'none';
    svg.appendChild(this._previewEl);
  },

  enableOverlay(enable) {
    const overlay = document.getElementById('interaction-overlay');
    overlay.style.pointerEvents = enable ? 'all' : 'none';
  },

  _onMouseDown(e) {
    if (AppState.mode !== 'draw-zone') return;
    this._drawing = true;
    this._startCm = Grid.eventToCmSnapped(e, Grid.stepForEvent(e));
    this._previewEl.style.display = '';
  },

  _onMouseMove(e) {
    if (!this._drawing || AppState.mode !== 'draw-zone') return;
    const cur   = Grid.eventToCmSnapped(e, Grid.stepForEvent(e));
    const scale = AppState.view.scale;
    const x = Math.min(this._startCm.x, cur.x) * scale;
    const y = Math.min(this._startCm.y, cur.y) * scale;
    const w = Math.abs(cur.x - this._startCm.x) * scale;
    const h = Math.abs(cur.y - this._startCm.y) * scale;
    this._previewEl.setAttribute('x', x);
    this._previewEl.setAttribute('y', y);
    this._previewEl.setAttribute('width',  w);
    this._previewEl.setAttribute('height', h);
  },

  _onMouseUp(e) {
    if (!this._drawing || AppState.mode !== 'draw-zone') return;
    this._drawing = false;
    this._previewEl.style.display = 'none';
    const cur  = Grid.eventToCmSnapped(e, Grid.stepForEvent(e));
    const minX = Math.min(this._startCm.x, cur.x);
    const minY = Math.min(this._startCm.y, cur.y);
    const w    = Math.abs(cur.x - this._startCm.x);
    const h    = Math.abs(cur.y - this._startCm.y);

    // 原本的下限是「一個網格格子」（預設 50cm），導致沿著牆邊拉的窄長條
    // 會被無聲丟掉。改成固定的最小值，並在丟掉時給提示。
    if (w < MIN_ZONE_CM || h < MIN_ZONE_CM) {
      if (w > 0 || h > 0) toast(`區域太小（最小 ${MIN_ZONE_CM}cm），按住 Alt 可以 1cm 微調`);
      return;
    }

    const def  = getZoneDef(AppState.pendingZoneType || 'open-office');
    const zone = {
      id:       generateId('z'),
      type:     AppState.pendingZoneType || 'open-office',
      xCm:      minX,
      yCm:      minY,
      widthCm:  w,
      heightCm: h,
      label:    def.label,
      opacity:  0.3
    };
    dispatch('ADD_ZONE', zone);
    dispatch('SET_SELECTION', { type: 'zone', id: zone.id });
  }
};
