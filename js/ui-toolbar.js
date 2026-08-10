/* ui-toolbar.js — 左側欄：模式切換、圖層開關、目錄、縮放 */
'use strict';

const UIToolbar = {
  init() {
    this._buildModes();
    this._buildLayerToggles();
    this._buildGridSettings();
    this._buildFurnitureCatalog();
    this._buildZoneTypes();
    this._buildZoomControls();
    this._buildSectionCollapse();
  },

  // ── Mode buttons ─────────────────────────────────────────────
  _buildModes() {
    document.getElementById('btn-mode-select').addEventListener('click', () => setMode('select'));
    document.getElementById('btn-mode-zone').addEventListener('click',   () => setMode('draw-zone'));
    document.getElementById('btn-mode-furniture').addEventListener('click', () => setMode('place-furniture'));
    document.getElementById('btn-mode-measure').addEventListener('click', () => setMode('measure'));
    document.getElementById('btn-clear-measure').addEventListener('click', () => LayerMeasure.clearAll());
  },

  setActiveMode(mode) {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    const map = {
      'select':          'btn-mode-select',
      'draw-zone':       'btn-mode-zone',
      'place-furniture': 'btn-mode-furniture',
      'measure':         'btn-mode-measure'
    };
    const el = document.getElementById(map[mode]);
    if (el) el.classList.add('active');

    // Body class for cursor
    document.body.className = document.body.className.replace(/mode-\S+/g, '').trim();
    document.body.classList.add(`mode-${mode}`);
  },

  // ── Layer toggles ────────────────────────────────────────────
  _buildLayerToggles() {
    const toggles = [
      { id: 'toggle-layer1', key: 'showLayer1', layerId: 'layer-room'      },
      { id: 'toggle-layer2', key: 'showLayer2', layerId: 'layer-zones'     },
      { id: 'toggle-layer3', key: 'showLayer3', layerId: 'layer-furniture' },
      { id: 'toggle-measure', key: 'showMeasure', layerId: 'layer-measure' }
    ];
    toggles.forEach(({ id, key, layerId }) => {
      const cb = document.getElementById(id);
      if (!cb) return;
      cb.checked = AppState.view[key];
      cb.addEventListener('change', () => {
        dispatch('SET_LAYER_VISIBILITY', { key, visible: cb.checked });
        document.getElementById(layerId).style.visibility = cb.checked ? '' : 'hidden';
      });
    });
  },

  // ── Grid settings ────────────────────────────────────────────
  _buildGridSettings() {
    // Grid cell size dropdown
    const cellSel = document.getElementById('grid-cell-select');
    if (cellSel) {
      cellSel.innerHTML = '';
      GRID_CELL_OPTIONS.forEach(opt => {
        const o = document.createElement('option');
        o.value       = opt.cm;
        o.textContent = opt.label;
        if (opt.cm === AppState.view.gridCellCm) o.selected = true;
        cellSel.appendChild(o);
      });
      cellSel.onchange = () => Grid.setGridCell(+cellSel.value);
    }

    // 坪數格 toggle
    const pingCb = document.getElementById('toggle-ping-grid');
    if (pingCb) {
      pingCb.checked = AppState.view.showPingGrid;
      pingCb.onchange = () => {
        AppState.view.showPingGrid = pingCb.checked;
        Grid.drawGrid();
        Storage.saveView();
      };
    }
  },

  // ── Furniture catalog ────────────────────────────────────────
  buildFurnitureCatalog() { this._buildFurnitureCatalog(); },

  _buildFurnitureCatalog() {
    const list = document.getElementById('furniture-catalog-list');
    if (!list) return;
    list.innerHTML = '';

    AppState.furnitureCatalog.forEach(def => {
      const card = document.createElement('div');
      card.className = 'catalog-card';
      card.dataset.defId = def.id;
      card.innerHTML = `
        <div class="catalog-swatch" style="background:${escapeHtml(def.color)}"></div>
        <div class="catalog-info">
          <div class="catalog-name">${escapeHtml(def.name)}</div>
          <div class="catalog-size">${def.widthCm}×${def.depthCm} cm</div>
        </div>
        ${def.isCustom ? '<button class="btn-del-custom" title="刪除" data-id="' + escapeHtml(def.id) + '">✕</button>' : ''}
      `;
      card.addEventListener('click', e => {
        if (e.target.classList.contains('btn-del-custom')) return;
        AppState.pendingFurnitureDefId = def.id;
        LayerFurniture._ghostRotation  = 0;
        setMode('place-furniture');
        LayerFurniture.showGhost(def.id, 0);
        // Highlight active card
        document.querySelectorAll('.catalog-card').forEach(c => c.classList.remove('active-place'));
        card.classList.add('active-place');
      });

      const delBtn = card.querySelector('.btn-del-custom');
      if (delBtn) {
        delBtn.addEventListener('click', e => {
          e.stopPropagation();
          if (confirm(`確定刪除自訂家具「${def.name}」？`)) {
            FurnitureCatalog.deleteCustom(def.id);
            this._buildFurnitureCatalog();
          }
        });
      }
      list.appendChild(card);
    });

    // Add custom button
    const addBtn = document.createElement('button');
    addBtn.className = 'btn-add-custom';
    addBtn.textContent = '＋ 新增自訂家具';
    addBtn.addEventListener('click', () => UIDialogs.openCustomFurnitureModal());
    list.appendChild(addBtn);
  },

  // ── Zone types ───────────────────────────────────────────────
  _buildZoneTypes() {
    const list = document.getElementById('zone-type-list');
    if (!list) return;
    list.innerHTML = '';

    ZONE_TYPES.forEach(zt => {
      const chip = document.createElement('div');
      chip.className = 'zone-type-chip';
      chip.dataset.type = zt.type;
      chip.innerHTML = `
        <div class="zone-color-dot" style="background:${escapeHtml(zt.color)}"></div>
        <span>${escapeHtml(zt.icon)} ${escapeHtml(zt.label)}</span>
      `;
      chip.addEventListener('click', () => {
        AppState.pendingZoneType = zt.type;
        setMode('draw-zone');
        document.querySelectorAll('.zone-type-chip').forEach(c => c.classList.remove('active-draw'));
        chip.classList.add('active-draw');
      });
      list.appendChild(chip);
    });
  },

  // ── Zoom controls ────────────────────────────────────────────
  // 縮放範圍跨了近 70 倍（0.15 ~ 10），線性滑桿會把常用的 2~5 倍
  // 擠在最右側，因此滑桿位置 0~100 對應到對數刻度。
  _sliderToScale(pos) {
    return SCALE_MIN * Math.pow(SCALE_MAX / SCALE_MIN, pos / 100);
  },

  _scaleToSlider(scale) {
    const s = Math.max(SCALE_MIN, Math.min(SCALE_MAX, scale));
    return 100 * Math.log(s / SCALE_MIN) / Math.log(SCALE_MAX / SCALE_MIN);
  },

  _buildZoomControls() {
    const slider  = document.getElementById('zoom-slider');
    const zoomIn  = document.getElementById('btn-zoom-in');
    const zoomOut = document.getElementById('btn-zoom-out');
    const fitBtn  = document.getElementById('btn-zoom-fit');

    if (slider) {
      slider.min = 0; slider.max = 100; slider.step = 1;
      slider.value = this._scaleToSlider(AppState.view.scale);
      slider.addEventListener('input', () => Grid.setScale(this._sliderToScale(+slider.value)));
    }
    // 每一步固定放大/縮小 25%，在整個範圍內手感一致
    if (zoomIn)  zoomIn.addEventListener('click',  () => Grid.setScale(AppState.view.scale * 1.25));
    if (zoomOut) zoomOut.addEventListener('click', () => Grid.setScale(AppState.view.scale / 1.25));
    if (fitBtn)  fitBtn.addEventListener('click',  () => this._fitToScreen());
  },

  updateZoomLabel() {
    const slider = document.getElementById('zoom-slider');
    const label  = document.getElementById('zoom-label');
    const text   = `${formatScale(AppState.view.scale)}×`;
    if (slider) slider.value = this._scaleToSlider(AppState.view.scale);
    if (label)  label.textContent = text;
    document.getElementById('status-scale').textContent = `縮放 ${text}`;
  },

  _fitToScreen() {
    const viewport = document.getElementById('canvas-viewport');
    if (!AppState.room.widthCm) return;
    // 48 = #canvas-stage 左右（上下）各 24px 的 margin
    const vw = viewport.clientWidth  - 48;
    const vh = viewport.clientHeight - 48;
    const sx = vw / AppState.room.widthCm;
    const sy = vh / AppState.room.heightCm;
    Grid.setScale(Math.min(sx, sy));
  },

  // ── Collapsible sections ─────────────────────────────────────
  _buildSectionCollapse() {
    document.querySelectorAll('.sidebar-section-header').forEach(hdr => {
      hdr.addEventListener('click', () => {
        hdr.closest('.sidebar-section').classList.toggle('collapsed');
      });
    });
  }
};

// ── Mode management (global) ─────────────────────────────────────
function setMode(mode) {
  AppState.mode = mode;
  UIToolbar.setActiveMode(mode);

  const overlay = document.getElementById('interaction-overlay');
  // Overlay captures events for draw-zone / measure; furniture placement uses viewport click
  overlay.style.pointerEvents = (mode === 'draw-zone' || mode === 'measure') ? 'all' : 'none';

  if (mode !== 'place-furniture') {
    LayerFurniture.hideGhost();
    AppState.pendingFurnitureDefId = null;
    document.querySelectorAll('.catalog-card').forEach(c => c.classList.remove('active-place'));
  }
  if (mode !== 'draw-zone') {
    document.querySelectorAll('.zone-type-chip').forEach(c => c.classList.remove('active-draw'));
  }
  if (mode === 'select') {
    // Clicking blank area deselects
  }
}
