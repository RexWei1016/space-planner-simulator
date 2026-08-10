/* layer-furniture.js - Layer 3: furniture rendering, drag, collision */
'use strict';

function _getBaseSize(inst, def) {
  return {
    widthCm: inst.widthCm || def.widthCm,
    depthCm: inst.depthCm || def.depthCm
  };
}

function _getFootprint(rotation, widthCm, depthCm) {
  const rot = rotation || 0;
  const w = (rot === 90 || rot === 270) ? depthCm : widthCm;
  const h = (rot === 90 || rot === 270) ? widthCm : depthCm;
  return { w, h };
}

function _getBBox(xCm, yCm, rotation, widthCm, depthCm) {
  const fp = _getFootprint(rotation, widthCm, depthCm);
  return { x: xCm, y: yCm, w: fp.w, h: fp.h };
}

function _bboxOverlap(a, b) {
  const gap = 0.5;
  return a.x + gap < b.x + b.w &&
         a.x + a.w - gap > b.x &&
         a.y + gap < b.y + b.h &&
         a.y + a.h - gap > b.y;
}

function _collidesWithOthers(excludeId, xCm, yCm, rotation, widthCm, depthCm) {
  const box = _getBBox(xCm, yCm, rotation, widthCm, depthCm);
  for (const other of AppState.furniture) {
    if (other.id === excludeId) continue;
    const otherDef = getFurnitureDef(other.defId);
    if (!otherDef) continue;

    const otherSize = _getBaseSize(other, otherDef);
    const otherBox = _getBBox(other.xCm, other.yCm, other.rotation, otherSize.widthCm, otherSize.depthCm);
    if (_bboxOverlap(box, otherBox)) return true;
  }
  return false;
}

function _findNearestFree(excludeId, targetX, targetY, rotation, widthCm, depthCm) {
  const step = 5;
  const fp = _getFootprint(rotation, widthCm, depthCm);
  const roomW = AppState.room.widthCm;
  const roomH = AppState.room.heightCm;

  for (let radius = 0; radius <= 20; radius++) {
    const candidates = [];
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
        candidates.push([dx, dy, dx * dx + dy * dy]);
      }
    }
    candidates.sort((a, b) => a[2] - b[2]);

    for (const [dx, dy] of candidates) {
      const tx = Math.max(0, Math.min(roomW - fp.w, targetX + dx * step));
      const ty = Math.max(0, Math.min(roomH - fp.h, targetY + dy * step));
      if (!_collidesWithOthers(excludeId, tx, ty, rotation, widthCm, depthCm)) {
        return { x: tx, y: ty };
      }
    }
  }

  return null;
}

const MIN_SIZE_CM = 10;

const LayerFurniture = {
  _drag: null,
  _resize: null,
  _ghost: null,
  _ghostRotation: 0,

  render() {
    const container = document.getElementById('layer-furniture');
    container.style.visibility = AppState.view.showLayer3 ? '' : 'hidden';

    const currentIds = new Set(AppState.furniture.map(f => f.id));
    [...container.children].forEach(el => {
      if (!currentIds.has(el.dataset.id)) el.remove();
    });

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
    el.className = 'fi-item';
    el.dataset.id = inst.id;

    const nameEl = document.createElement('div');
    nameEl.className = 'fi-label';
    el.appendChild(nameEl);

    const sizeEl = document.createElement('div');
    sizeEl.className = 'fi-size-label';
    el.appendChild(sizeEl);

    // 縮放控制點：只有選取時才由 CSS 顯示出來
    RESIZE_HANDLES.forEach(h => {
      const handle = document.createElement('div');
      handle.className = `fi-handle fi-handle-${h.pos}`;
      handle.dataset.pos = h.pos;
      handle.addEventListener('mousedown', e => {
        if (AppState.mode !== 'select') return;
        e.stopPropagation();
        this._startResize(e, inst, h);
      });
      el.appendChild(handle);
    });

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
    const rot = inst.rotation || 0;
    const size = _getBaseSize(inst, def);
    const fp = _getFootprint(rot, size.widthCm, size.depthCm);

    // 旋轉已由 _getFootprint 交換寬深表達（矩形轉 90° 等同於交換尺寸），
    // 不可再套 CSS rotate，否則會轉兩次、跑到錨點左側並與碰撞框脫鉤。
    el.style.left = (inst.xCm * scale) + 'px';
    el.style.top = (inst.yCm * scale) + 'px';
    el.style.width = (fp.w * scale) + 'px';
    el.style.height = (fp.h * scale) + 'px';
    el.style.backgroundColor = def.color || '#a8d8ea';

    el.classList.toggle('selected', AppState.selection.id === inst.id);
    el.classList.toggle('colliding', !!colliding);
    // 太小的物件塞不下八個控制點，只留四個角
    el.classList.toggle('tiny', fp.w * scale < 34 || fp.h * scale < 34);

    const nameEl = el.querySelector('.fi-label');
    const sizeEl = el.querySelector('.fi-size-label');
    nameEl.textContent = inst.label || def.name;
    sizeEl.textContent = rot ? `${size.widthCm}×${size.depthCm} ↻${rot}°`
                             : `${size.widthCm}×${size.depthCm}`;
    sizeEl.style.display = (fp.w * scale > 50 && fp.h * scale > 32) ? '' : 'none';
  },

  _startDrag(e, inst, def) {
    this._drag = {
      id: inst.id,
      def,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startItemXcm: inst.xCm,
      startItemYcm: inst.yCm,
      origXcm: inst.xCm,
      origYcm: inst.yCm,
      colliding: false,
      preciseMode: false,
      undoPushed: false
    };
  },

  // ── 拖拉縮放 ─────────────────────────────────────────────────
  // 在「螢幕上看到的」footprint 空間裡計算，最後再依旋轉角換回寬/深。
  _startResize(e, inst, handle) {
    const def = getFurnitureDef(inst.defId);
    if (!def) return;

    dispatch('SET_SELECTION', { type: 'furniture', id: inst.id });

    const rot  = inst.rotation || 0;
    const size = _getBaseSize(inst, def);
    const fp   = _getFootprint(rot, size.widthCm, size.depthCm);

    this._resize = {
      id: inst.id, def, handle, rot,
      startMouseX: e.clientX, startMouseY: e.clientY,
      origX: inst.xCm, origY: inst.yCm, origW: fp.w, origH: fp.h,
      origWidthCm: size.widthCm, origDepthCm: size.depthCm,
      cur: { x: inst.xCm, y: inst.yCm, w: fp.w, h: fp.h }
    };
  },

  // footprint(寬,高) → 實例的 widthCm/depthCm（90/270 度時對調）
  _footprintToSize(rot, w, h) {
    return (rot === 90 || rot === 270)
      ? { widthCm: h, depthCm: w }
      : { widthCm: w, depthCm: h };
  },

  _onResizeMove(e) {
    const r = this._resize;
    const inst = AppState.furniture.find(f => f.id === r.id);
    if (!inst) { this._resize = null; return; }

    const step = e.altKey ? 1 : 5;
    const dx = Grid.pxToCm(e.clientX - r.startMouseX);
    const dy = Grid.pxToCm(e.clientY - r.startMouseY);

    let x = r.origX, y = r.origY, w = r.origW, h = r.origH;

    if (r.handle.dx < 0) {              // 拖左緣：右緣釘住
      const right = r.origX + r.origW;
      x = Math.max(0, Math.min(right - MIN_SIZE_CM, Grid.snapCmFine(r.origX + dx, step)));
      w = right - x;
    } else if (r.handle.dx > 0) {       // 拖右緣：左緣釘住
      w = Math.max(MIN_SIZE_CM, Grid.snapCmFine(r.origW + dx, step));
      w = Math.min(w, AppState.room.widthCm - x);
    }

    if (r.handle.dy < 0) {              // 拖上緣：下緣釘住
      const bottom = r.origY + r.origH;
      y = Math.max(0, Math.min(bottom - MIN_SIZE_CM, Grid.snapCmFine(r.origY + dy, step)));
      h = bottom - y;
    } else if (r.handle.dy > 0) {       // 拖下緣：上緣釘住
      h = Math.max(MIN_SIZE_CM, Grid.snapCmFine(r.origH + dy, step));
      h = Math.min(h, AppState.room.heightCm - y);
    }

    r.cur = { x, y, w, h };

    const size = this._footprintToSize(r.rot, w, h);
    inst.xCm = x; inst.yCm = y;
    inst.widthCm = size.widthCm;
    inst.depthCm = size.depthCm;

    const colliding = _collidesWithOthers(r.id, x, y, r.rot, size.widthCm, size.depthCm);
    const el = document.querySelector(`#layer-furniture [data-id="${r.id}"]`);
    if (el) this._updateElement(el, inst, r.def, colliding);

    document.getElementById('status-cursor').textContent =
      `尺寸：${Math.round(size.widthCm)} × ${Math.round(size.depthCm)} cm`;
  },

  _onResizeUp() {
    const r = this._resize;
    this._resize = null;

    const inst = AppState.furniture.find(f => f.id === r.id);
    if (!inst) return;

    const target = this._footprintToSize(r.rot, r.cur.w, r.cur.h);

    // 先還原，再走 applyManualUpdate，讓碰撞處理與 undo 紀錄都走同一條路
    inst.xCm = r.origX;
    inst.yCm = r.origY;
    inst.widthCm = r.origWidthCm;
    inst.depthCm = r.origDepthCm;

    const res = LayerFurniture.applyManualUpdate(r.id, {
      xCm: r.cur.x, yCm: r.cur.y,
      widthCm: target.widthCm, depthCm: target.depthCm
    });

    if (!res.ok) {
      renderAll();
      toast('這個尺寸會和其他物件重疊，已還原');
    }
  },

  _onMouseMove(e) {
    if (this._resize && AppState.mode === 'select') { this._onResizeMove(e); return; }
    if (!this._drag || AppState.mode !== 'select') return;

    const d = this._drag;
    const inst = AppState.furniture.find(f => f.id === d.id);
    if (!inst) return;

    const def = d.def;
    const rot = inst.rotation || 0;
    const size = _getBaseSize(inst, def);
    const fp = _getFootprint(rot, size.widthCm, size.depthCm);

    const dx = Grid.pxToCm(e.clientX - d.startMouseX);
    const dy = Grid.pxToCm(e.clientY - d.startMouseY);
    const rawX = d.startItemXcm + dx;
    const rawY = d.startItemYcm + dy;

    const step = e.altKey ? 1 : 5;
    const snapX = Math.max(0, Math.min(AppState.room.widthCm - fp.w, Grid.snapCmFine(rawX, step)));
    const snapY = Math.max(0, Math.min(AppState.room.heightCm - fp.h, Grid.snapCmFine(rawY, step)));

    const collision = _collidesWithOthers(d.id, snapX, snapY, rot, size.widthCm, size.depthCm);
    d.colliding = collision;
    d.currentX = snapX;
    d.currentY = snapY;
    d.preciseMode = !!e.altKey;
    if (!d.undoPushed && (snapX !== d.origXcm || snapY !== d.origYcm)) {
      pushUndo();
      d.undoPushed = true;
    }

    inst.xCm = snapX;
    inst.yCm = snapY;

    const el = document.querySelector(`#layer-furniture [data-id="${inst.id}"]`);
    if (el) this._updateElement(el, inst, def, collision);
  },

  _onMouseUp() {
    if (this._resize) { this._onResizeUp(); return; }
    if (!this._drag) return;

    const d = this._drag;
    const inst = AppState.furniture.find(f => f.id === d.id);

    if (inst) {
      const size = _getBaseSize(inst, d.def);
      if (d.colliding && !d.preciseMode) {
        const free = _findNearestFree(d.id, d.currentX, d.currentY, inst.rotation || 0, size.widthCm, size.depthCm);
        if (free) {
          inst.xCm = free.x;
          inst.yCm = free.y;
        } else {
          inst.xCm = d.origXcm;
          inst.yCm = d.origYcm;
        }

        const el = document.querySelector(`#layer-furniture [data-id="${inst.id}"]`);
        if (el) this._updateElement(el, inst, d.def, false);
      }

      Storage.saveFloorPlan();
      UIProperties.refresh();
    }

    this._drag = null;
  },

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
    const fp = _getFootprint(this._ghostRotation, def.widthCm, def.depthCm);
    this._ghost.style.width = (fp.w * scale) + 'px';
    this._ghost.style.height = (fp.h * scale) + 'px';
    this._ghost.style.backgroundColor = def.color;
    this._ghost.textContent = def.name;
    this._ghost.style.display = 'block';
  },

  moveGhost(e) {
    if (!this._ghost) return;

    this._ghost.style.left = (e.clientX + 6) + 'px';
    this._ghost.style.top = (e.clientY + 6) + 'px';

    const defId = AppState.pendingFurnitureDefId;
    if (!defId || !AppState.room.widthCm) return;

    const def = getFurnitureDef(defId);
    if (!def) return;

    const fp = _getFootprint(this._ghostRotation, def.widthCm, def.depthCm);
    const snapped = Grid.eventToCmSnapped(e, Grid.stepForEvent(e));
    const xCm = Math.max(0, Math.min(AppState.room.widthCm - fp.w, snapped.x));
    const yCm = Math.max(0, Math.min(AppState.room.heightCm - fp.h, snapped.y));

    const collision = _collidesWithOthers(null, xCm, yCm, this._ghostRotation, def.widthCm, def.depthCm);
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

  getGhostRotation() {
    return this._ghostRotation;
  },

  placeAt(e) {
    const defId = AppState.pendingFurnitureDefId;
    if (!defId) return;

    const def = getFurnitureDef(defId);
    if (!def) return;

    const rot = this._ghostRotation;
    const fp = _getFootprint(rot, def.widthCm, def.depthCm);
    const snapped = Grid.eventToCmSnapped(e, Grid.stepForEvent(e));
    let xCm = Math.max(0, Math.min(AppState.room.widthCm - fp.w, snapped.x));
    let yCm = Math.max(0, Math.min(AppState.room.heightCm - fp.h, snapped.y));

    // 靠牆時 x/y 會被夾到同一個位置，若原地被佔住就整個放不下去。
    // 改成跟拖曳一樣先找附近空位，真的塞不下才拒絕。
    if (_collidesWithOthers(null, xCm, yCm, rot, def.widthCm, def.depthCm)) {
      const free = _findNearestFree(null, xCm, yCm, rot, def.widthCm, def.depthCm);
      if (!free) {
        this._flashGhostError();
        toast('這附近放不下，請先挪開其他物件');
        return;
      }
      xCm = free.x;
      yCm = free.y;
    }

    const inst = {
      id: generateId('fi'),
      defId,
      xCm,
      yCm,
      widthCm: def.widthCm,
      depthCm: def.depthCm,
      rotation: rot,
      label: ''
    };

    dispatch('ADD_FURNITURE', inst);
    dispatch('SET_SELECTION', { type: 'furniture', id: inst.id });
  },

  applyManualUpdate(id, patch) {
    const inst = AppState.furniture.find(f => f.id === id);
    if (!inst) return { ok: false, reason: 'not-found' };

    const def = getFurnitureDef(inst.defId);
    if (!def) return { ok: false, reason: 'def-not-found' };

    const curSize = _getBaseSize(inst, def);
    const newWidth = Math.max(10, Math.round(patch.widthCm ?? curSize.widthCm));
    const newDepth = Math.max(10, Math.round(patch.depthCm ?? curSize.depthCm));
    const newRotation = patch.rotation == null ? (inst.rotation || 0) : patch.rotation;

    const fp = _getFootprint(newRotation, newWidth, newDepth);
    const maxX = Math.max(0, AppState.room.widthCm - fp.w);
    const maxY = Math.max(0, AppState.room.heightCm - fp.h);

    let newX = patch.xCm == null ? inst.xCm : Math.round(patch.xCm);
    let newY = patch.yCm == null ? inst.yCm : Math.round(patch.yCm);
    newX = Math.max(0, Math.min(maxX, newX));
    newY = Math.max(0, Math.min(maxY, newY));

    if (!_collidesWithOthers(id, newX, newY, newRotation, newWidth, newDepth)) {
      // no-op
    } else {
      const free = _findNearestFree(id, newX, newY, newRotation, newWidth, newDepth);
      if (!free) {
        return { ok: false, reason: 'collision' };
      }
      newX = free.x;
      newY = free.y;
    }

    const changed =
      inst.xCm !== newX ||
      inst.yCm !== newY ||
      (inst.widthCm || def.widthCm) !== newWidth ||
      (inst.depthCm || def.depthCm) !== newDepth ||
      (inst.rotation || 0) !== newRotation;

    if (!changed) return { ok: true };

    pushUndo();
    inst.xCm = newX;
    inst.yCm = newY;
    inst.widthCm = newWidth;
    inst.depthCm = newDepth;
    inst.rotation = newRotation;

    Storage.saveFloorPlan();
    renderAll();
    UIProperties.refresh();

    return { ok: true };
  },

  // ── 複製 / 貼上 ─────────────────────────────────────────────
  // 取出可獨立存在的資料快照（來源刪掉後仍可貼上）
  snapshot(id) {
    const inst = AppState.furniture.find(f => f.id === id);
    if (!inst) return null;

    const def = getFurnitureDef(inst.defId);
    if (!def) return null;

    const size = _getBaseSize(inst, def);
    return {
      defId:    inst.defId,
      widthCm:  size.widthCm,
      depthCm:  size.depthCm,
      rotation: inst.rotation || 0,
      label:    inst.label || '',
      xCm:      inst.xCm,
      yCm:      inst.yCm
    };
  },

  // atCm 給定時以該點為中心貼上，否則從來源位置斜移一段距離
  pasteFrom(snap, atCm) {
    if (!snap) return { ok: false, reason: 'empty' };
    if (!getFurnitureDef(snap.defId)) return { ok: false, reason: 'def-not-found' };

    const rot  = snap.rotation || 0;
    const fp   = _getFootprint(rot, snap.widthCm, snap.depthCm);
    const maxX = Math.max(0, AppState.room.widthCm  - fp.w);
    const maxY = Math.max(0, AppState.room.heightCm - fp.h);

    let x = atCm ? atCm.x - fp.w / 2 : snap.xCm + DUPLICATE_OFFSET_CM;
    let y = atCm ? atCm.y - fp.h / 2 : snap.yCm + DUPLICATE_OFFSET_CM;
    x = Math.max(0, Math.min(maxX, Grid.snapCmFine(x, 5)));
    y = Math.max(0, Math.min(maxY, Grid.snapCmFine(y, 5)));

    if (_collidesWithOthers(null, x, y, rot, snap.widthCm, snap.depthCm)) {
      const free = _findNearestFree(null, x, y, rot, snap.widthCm, snap.depthCm);
      if (!free) return { ok: false, reason: 'collision' };
      x = free.x;
      y = free.y;
    }

    const inst = {
      id:       generateId('fi'),
      defId:    snap.defId,
      xCm:      x,
      yCm:      y,
      widthCm:  snap.widthCm,
      depthCm:  snap.depthCm,
      rotation: rot,
      label:    snap.label || ''
    };

    dispatch('ADD_FURNITURE', inst);
    dispatch('SET_SELECTION', { type: 'furniture', id: inst.id });
    return { ok: true, id: inst.id };
  },

  duplicate(id, atCm) {
    return this.pasteFrom(this.snapshot(id), atCm);
  },

  _flashGhostError() {
    if (!this._ghost) return;

    this._ghost.classList.add('ghost-collide');
    this._ghost.style.animation = 'ghost-shake .3s ease';
    setTimeout(() => {
      if (this._ghost) this._ghost.style.animation = '';
    }, 300);
  },

  initEvents() {
    document.addEventListener('mousemove', e => {
      this._onMouseMove(e);
      if (AppState.mode === 'place-furniture') this.moveGhost(e);
    });
    document.addEventListener('mouseup', () => this._onMouseUp());
  }
};
