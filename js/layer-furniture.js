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

const LayerFurniture = {
  _drag: null,
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

    el.style.left = (inst.xCm * scale) + 'px';
    el.style.top = (inst.yCm * scale) + 'px';
    el.style.width = (fp.w * scale) + 'px';
    el.style.height = (fp.h * scale) + 'px';
    el.style.backgroundColor = def.color || '#a8d8ea';
    el.style.transform = `rotate(${rot}deg)`;
    el.style.transformOrigin = 'top left';

    el.classList.toggle('selected', AppState.selection.id === inst.id);
    el.classList.toggle('colliding', !!colliding);

    const nameEl = el.querySelector('.fi-label');
    const sizeEl = el.querySelector('.fi-size-label');
    nameEl.textContent = inst.label || def.name;
    sizeEl.textContent = `${size.widthCm}×${size.depthCm}`;
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

  _onMouseMove(e) {
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
    const snapped = Grid.eventToCmSnapped(e);
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
    const snapped = Grid.eventToCmSnapped(e);
    const xCm = Math.max(0, Math.min(AppState.room.widthCm - fp.w, snapped.x));
    const yCm = Math.max(0, Math.min(AppState.room.heightCm - fp.h, snapped.y));

    if (_collidesWithOthers(null, xCm, yCm, rot, def.widthCm, def.depthCm)) {
      this._flashGhostError();
      return;
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
