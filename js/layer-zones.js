/* layer-zones.js — Layer 2：SVG 區域繪製、渲染、拖曳 */
'use strict';

const LayerZones = {
  _drawing:  false,
  _startCm:  null,
  _previewEl: null,

  // 拖曳區域的狀態
  _drag: null,  // { id, startMouseX, startMouseY, startZoneXcm, startZoneYcm }

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
    g.appendChild(label);
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

    svg.appendChild(g);
  },

  // ── Zone Drag ────────────────────────────────────────────────
  _startDrag(e, zone) {
    this._drag = {
      id:           zone.id,
      startMouseX:  e.clientX,
      startMouseY:  e.clientY,
      startZoneXcm: zone.xCm,
      startZoneYcm: zone.yCm
    };
    // Change cursor while dragging
    document.getElementById('layer-zones').style.cursor = 'grabbing';
  },

  _onDragMove(e) {
    if (!this._drag) return;
    const zone = AppState.zones.find(z => z.id === this._drag.id);
    if (!zone) { this._drag = null; return; }

    const dx = Grid.pxToCm(e.clientX - this._drag.startMouseX);
    const dy = Grid.pxToCm(e.clientY - this._drag.startMouseY);

    const rawX = this._drag.startZoneXcm + dx;
    const rawY = this._drag.startZoneYcm + dy;
    const newX = Math.max(0, Math.min(AppState.room.widthCm  - zone.widthCm,  Grid.snapCm(rawX)));
    const newY = Math.max(0, Math.min(AppState.room.heightCm - zone.heightCm, Grid.snapCm(rawY)));

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
    if (!this._drag) return;
    const zone = AppState.zones.find(z => z.id === this._drag.id);
    if (zone) {
      // Commit final position with undo entry
      pushUndo();
      Storage.saveFloorPlan();
      UIProperties.refresh();
    }
    this._drag = null;
    document.getElementById('layer-zones').style.cursor = '';
  },

  // ── Drawing interaction ──────────────────────────────────────
  initDrawing() {
    const overlay = document.getElementById('interaction-overlay');

    overlay.addEventListener('mousedown', this._onMouseDown.bind(this));
    overlay.addEventListener('mousemove', this._onMouseMove.bind(this));
    overlay.addEventListener('mouseup',   this._onMouseUp.bind(this));

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
    this._startCm = Grid.eventToCmSnapped(e);
    this._previewEl.style.display = '';
  },

  _onMouseMove(e) {
    if (!this._drawing || AppState.mode !== 'draw-zone') return;
    const cur   = Grid.eventToCmSnapped(e);
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
    const cur  = Grid.eventToCmSnapped(e);
    const minX = Math.min(this._startCm.x, cur.x);
    const minY = Math.min(this._startCm.y, cur.y);
    const w    = Math.abs(cur.x - this._startCm.x);
    const h    = Math.abs(cur.y - this._startCm.y);
    const cell = AppState.view.gridCellCm;
    if (w < cell || h < cell) return;

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
