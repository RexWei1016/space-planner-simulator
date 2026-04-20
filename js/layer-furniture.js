/* layer-furniture.js — Layer 3：div 家具放置、拖移、旋轉（含碰撞偵測） */
'use strict';

// ── Collision helpers ────────────────────────────────────────────

/** 取得家具的 axis-aligned bounding box（cm 單位） */
function _getBBox(xCm, yCm, rotation, def) {
  const rot = rotation || 0;
  const w = (rot === 90 || rot === 270) ? def.depthCm : def.widthCm;
  const h = (rot === 90 || rot === 270) ? def.widthCm : def.depthCm;
  return { x: xCm, y: yCm, w, h };
}

/** 兩個矩形是否重疊（留 0.5cm 容差，讓緊貼擺放不算碰撞） */
function _bboxOverlap(a, b) {
  const GAP = 0.5;
  return a.x + GAP < b.x + b.w &&
         a.x + a.w - GAP > b.x &&
         a.y + GAP < b.y + b.h &&
         a.y + a.h - GAP > b.y;
}

/**
 * 檢查將 excludeId 的家具放到 (xCm, yCm, rot) 時是否與其他家具碰撞
 * excludeId = null 表示放置新家具（不排除任何現有件）
 */
function _collidesWithOthers(excludeId, xCm, yCm, rot, def) {
  const box = _getBBox(xCm, yCm, rot, def);
  for (const other of AppState.furniture) {
    if (other.id === excludeId) continue;
    const otherDef = getFurnitureDef(other.defId);
    if (!otherDef) continue;
    const otherBox = _getBBox(other.xCm, other.yCm, other.rotation, otherDef);
    if (_bboxOverlap(box, otherBox)) return true;
  }
  return false;
}

/**
 * 碰撞時自動補位：從目標位置向外螺旋搜尋最近的無碰撞格位（以 5cm 步進）
 * 最多搜尋 20 步（100cm 半徑）。找不到則回傳 null（呼叫方應還原原位）
 */
function _findNearestFree(excludeId, targetX, targetY, rot, def) {
  const STEP = 5;   // 搜尋步進 5cm
  const rw   = (rot === 90 || rot === 270) ? def.depthCm : def.widthCm;
  const rh   = (rot === 90 || rot === 270) ? def.widthCm : def.depthCm;
  const RW   = AppState.room.widthCm;
  const RH   = AppState.room.heightCm;

  for (let radius = 0; radius <= 20; radius++) {
    // 對 radius 圈的所有 (dx, dy) 組合，按距離排序後嘗試
    const candidates = [];
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue; // 只走邊框
        candidates.push([dx, dy, dx * dx + dy * dy]);
      }
    }
    candidates.sort((a, b) => a[2] - b[2]);

    for (const [dx, dy] of candidates) {
      const tx = Math.max(0, Math.min(RW - rw, targetX + dx * STEP));
      const ty = Math.max(0, Math.min(RH - rh, targetY + dy * STEP));
      if (!_collidesWithOthers(excludeId, tx, ty, rot, def)) {
        return { x: tx, y: ty };
      }
    }
  }
  return null; // 100cm 內找不到空位
}

// ────────────────────────────────────────────────────────────────

const LayerFurniture = {
  // drag state
  _drag: null,
  /*  {
        id, def,
        startMouseX, startMouseY,
        startItemXcm, startItemYcm,   // 拖曳開始時的位置
        origXcm, origYcm,              // 拖曳前的合法位置（用於復原）
        colliding: false
      }
  */

  _ghost: null,
  _ghostRotation: 0,

  // ── Render ───────────────────────────────────────────────────
  render() {
    const container = document.getElementById('layer-furniture');
    container.style.visibility = AppState.view.showLayer3 ? '' : 'hidden';

    const currentIds = new Set(AppState.furniture.map(f => f.id));

    // Remove deleted
    [...container.children].forEach(el => {
      if (!currentIds.has(el.dataset.id)) el.remove();
    });

    // Add / update
    for (const inst of AppState.furniture) {
      const def = getFurnitureDef(inst.defId);
      if (!def) continue;
      let el = container.querySelector(`[data-id="${inst.id}"]`);
      if (!el) {
        el = this._createElement(inst, def);
        container.appendChild(el);
      }
      this._updateElement(el, inst, def, false);
    }
  },

  _createElement(inst, def) {
    const el = document.createElement('div');
    el.className  = 'fi-item';
    el.dataset.id = inst.id;

    const nameEl = document.createElement('div');
    nameEl.className = 'fi-label';
    el.appendChild(nameEl);

    const sizeEl = document.createElement('div');
    sizeEl.className = 'fi-size-label';
    el.appendChild(sizeEl);

    el.addEventListener('mousedown', e => {
      if (AppState.mode !== 'select') return;
      e.stopPropagation();
      dispatch('SET_SELECTION', { type: 'furniture', id: inst.id });
      this._startDrag(e, inst, def);
    });

    return el;
  },

  _updateElement(el, inst, def, colliding) {
    const scale = AppState.view.scale;
    const rot   = inst.rotation || 0;
    const rw    = (rot === 90 || rot === 270) ? def.depthCm : def.widthCm;
    const rh    = (rot === 90 || rot === 270) ? def.widthCm : def.depthCm;

    el.style.left            = (inst.xCm * scale) + 'px';
    el.style.top             = (inst.yCm * scale) + 'px';
    el.style.width           = (rw * scale) + 'px';
    el.style.height          = (rh * scale) + 'px';
    el.style.backgroundColor = def.color || '#a8d8ea';
    el.style.transform       = `rotate(${rot}deg)`;
    el.style.transformOrigin = 'top left';

    el.classList.toggle('selected',  AppState.selection.id === inst.id);
    el.classList.toggle('colliding', !!colliding);

    const nameEl = el.querySelector('.fi-label');
    const sizeEl = el.querySelector('.fi-size-label');
    nameEl.textContent = inst.label || def.name;
    sizeEl.textContent = `${def.widthCm}×${def.depthCm}`;
    sizeEl.style.display = (rw * scale > 50 && rh * scale > 32) ? '' : 'none';
  },

  // ── Drag ─────────────────────────────────────────────────────
  _startDrag(e, inst, def) {
    this._drag = {
      id:           inst.id,
      def:          def,
      startMouseX:  e.clientX,
      startMouseY:  e.clientY,
      startItemXcm: inst.xCm,
      startItemYcm: inst.yCm,
      origXcm:      inst.xCm,   // 安全位置（用於碰撞時還原）
      origYcm:      inst.yCm,
      colliding:    false
    };
  },

  _onMouseMove(e) {
    if (!this._drag || AppState.mode !== 'select') return;
    const d    = this._drag;
    const inst = AppState.furniture.find(f => f.id === d.id);
    if (!inst) return;
    const def = d.def;
    const rot = inst.rotation || 0;
    const rw  = (rot === 90 || rot === 270) ? def.depthCm : def.widthCm;
    const rh  = (rot === 90 || rot === 270) ? def.widthCm : def.depthCm;

    const dx = Grid.pxToCm(e.clientX - d.startMouseX);
    const dy = Grid.pxToCm(e.clientY - d.startMouseY);
    const rawX = d.startItemXcm + dx;
    const rawY = d.startItemYcm + dy;

    // 拖曳用細粒度 snap（5cm），不受顯示格子大小影響
    const snapX = Math.max(0, Math.min(AppState.room.widthCm  - rw, Grid.snapCmFine(rawX)));
    const snapY = Math.max(0, Math.min(AppState.room.heightCm - rh, Grid.snapCmFine(rawY)));

    const collision = _collidesWithOthers(d.id, snapX, snapY, rot, def);
    d.colliding  = collision;
    d.currentX   = snapX;
    d.currentY   = snapY;

    inst.xCm = snapX;
    inst.yCm = snapY;

    const el = document.querySelector(`#layer-furniture [data-id="${inst.id}"]`);
    if (el) this._updateElement(el, inst, def, collision);
  },

  _onMouseUp() {
    if (!this._drag) return;
    const d    = this._drag;
    const inst = AppState.furniture.find(f => f.id === d.id);

    if (inst) {
      if (d.colliding) {
        // 自動補位：在目標附近尋找最近的無碰撞位置
        const free = _findNearestFree(d.id, d.currentX, d.currentY, inst.rotation || 0, d.def);
        if (free) {
          inst.xCm = free.x;
          inst.yCm = free.y;
        } else {
          // 找不到空位 → 還原
          inst.xCm = d.origXcm;
          inst.yCm = d.origYcm;
        }
        const el = document.querySelector(`#layer-furniture [data-id="${inst.id}"]`);
        if (el) this._updateElement(el, inst, d.def, false);
      }
      // 不論是否碰撞，只要有移動就記 undo
      if (inst.xCm !== d.origXcm || inst.yCm !== d.origYcm) {
        pushUndo();
      }
      Storage.saveFloorPlan();
    }
    this._drag = null;
  },

  // ── Ghost (placement preview) ────────────────────────────────
  showGhost(defId, rotation) {
    this._ghostRotation = rotation || 0;
    const def = getFurnitureDef(defId);
    if (!def) return;
    if (!this._ghost) {
      this._ghost = document.createElement('div');
      this._ghost.id = 'furniture-ghost';
      document.body.appendChild(this._ghost);
    }
    const scale = AppState.view.scale;
    const rot   = this._ghostRotation;
    const rw    = (rot === 90 || rot === 270) ? def.depthCm : def.widthCm;
    const rh    = (rot === 90 || rot === 270) ? def.widthCm : def.depthCm;

    this._ghost.style.width           = (rw * scale) + 'px';
    this._ghost.style.height          = (rh * scale) + 'px';
    this._ghost.style.backgroundColor = def.color;
    this._ghost.textContent           = def.name;
    this._ghost.style.display         = 'block';
  },

  moveGhost(e) {
    if (!this._ghost) return;
    this._ghost.style.left = (e.clientX + 6) + 'px';
    this._ghost.style.top  = (e.clientY + 6) + 'px';

    // 碰撞預覽：ghost 變紅提示
    const defId = AppState.pendingFurnitureDefId;
    if (!defId || !AppState.room.widthCm) return;
    const def = getFurnitureDef(defId);
    if (!def) return;
    const rot     = this._ghostRotation;
    const rw      = (rot === 90 || rot === 270) ? def.depthCm : def.widthCm;
    const rh      = (rot === 90 || rot === 270) ? def.widthCm : def.depthCm;
    const snapped = Grid.eventToCmSnapped(e);
    const xCm     = Math.max(0, Math.min(AppState.room.widthCm  - rw, snapped.x));
    const yCm     = Math.max(0, Math.min(AppState.room.heightCm - rh, snapped.y));

    const collision = _collidesWithOthers(null, xCm, yCm, rot, def);
    this._ghost.classList.toggle('ghost-collide', collision);
  },

  hideGhost() {
    if (this._ghost) this._ghost.style.display = 'none';
  },

  rotateGhost() {
    this._ghostRotation = (this._ghostRotation + 90) % 360;
    if (AppState.pendingFurnitureDefId) {
      this.showGhost(AppState.pendingFurnitureDefId, this._ghostRotation);
    }
  },

  getGhostRotation() { return this._ghostRotation; },

  // ── Place furniture ──────────────────────────────────────────
  placeAt(e) {
    const defId = AppState.pendingFurnitureDefId;
    if (!defId) return;
    const def = getFurnitureDef(defId);
    if (!def) return;
    const rot     = this._ghostRotation;
    const rw      = (rot === 90 || rot === 270) ? def.depthCm : def.widthCm;
    const rh      = (rot === 90 || rot === 270) ? def.widthCm : def.depthCm;
    const snapped = Grid.eventToCmSnapped(e);
    const xCm     = Math.max(0, Math.min(AppState.room.widthCm  - rw, snapped.x));
    const yCm     = Math.max(0, Math.min(AppState.room.heightCm - rh, snapped.y));

    // 碰撞 → 拒絕放置，ghost 閃爍紅色提示
    if (_collidesWithOthers(null, xCm, yCm, rot, def)) {
      this._flashGhostError();
      return;
    }

    const inst = {
      id:       generateId('fi'),
      defId:    defId,
      xCm:      xCm,
      yCm:      yCm,
      rotation: rot,
      label:    ''
    };
    dispatch('ADD_FURNITURE', inst);
    dispatch('SET_SELECTION', { type: 'furniture', id: inst.id });
  },

  _flashGhostError() {
    if (!this._ghost) return;
    this._ghost.classList.add('ghost-collide');
    this._ghost.style.animation = 'ghost-shake .3s ease';
    setTimeout(() => {
      if (this._ghost) {
        this._ghost.style.animation = '';
      }
    }, 300);
  },

  // ── Init ─────────────────────────────────────────────────────
  initEvents() {
    document.addEventListener('mousemove', e => {
      this._onMouseMove(e);
      if (AppState.mode === 'place-furniture') this.moveGhost(e);
    });
    document.addEventListener('mouseup', () => this._onMouseUp());
  }
};
