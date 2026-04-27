/* ui-properties.js - right panel inspectors */
'use strict';

const UIProperties = {
  refresh() {
    const panel = document.getElementById('props-panel');
    const { type, id } = AppState.selection;

    if (type === 'furniture') {
      const inst = AppState.furniture.find(f => f.id === id);
      const def = inst ? getFurnitureDef(inst.defId) : null;
      if (inst && def) {
        this._showFurniture(panel, inst, def);
        return;
      }
    }

    if (type === 'zone') {
      const zone = AppState.zones.find(z => z.id === id);
      if (zone) {
        this._showZone(panel, zone);
        return;
      }
    }

    this._showRoomInfo(panel);
  },

  _showRoomInfo(panel) {
    const r = AppState.room;
    const ping = r.ping || ((r.widthCm * r.heightCm) / 33058).toFixed(2);

    panel.innerHTML = `
      <h3>空間資訊</h3>
      <div class="room-info-grid">
        <div class="info-cell"><div class="info-label">寬度</div><div class="info-value">${r.widthCm} cm</div></div>
        <div class="info-cell"><div class="info-label">深度</div><div class="info-value">${r.heightCm} cm</div></div>
        <div class="info-cell"><div class="info-label">坪數</div><div class="info-value">${ping} 坪</div></div>
        <div class="info-cell"><div class="info-label">面積</div><div class="info-value">${(r.widthCm * r.heightCm / 10000).toFixed(2)} m²</div></div>
      </div>
      <button class="btn-resize-room" id="btn-resize-room">調整空間大小</button>

      <div style="margin-top:18px;">
        <h3>統計</h3>
        <div class="room-info-grid">
          <div class="info-cell"><div class="info-label">物件數</div><div class="info-value">${AppState.furniture.length}</div></div>
          <div class="info-cell"><div class="info-label">區域數</div><div class="info-value">${AppState.zones.length}</div></div>
        </div>
      </div>

      <div style="margin-top:18px; font-size:11px; color:var(--sub); line-height:1.6;">
        <b>快捷鍵</b><br>
        Ctrl+Z / Ctrl+Y：復原 / 重做<br>
        R：旋轉物件<br>
        Delete：刪除選取<br>
        Alt + 拖曳：精準 1cm（家具不自動排擠）
      </div>
    `;

    document.getElementById('btn-resize-room')?.addEventListener('click', () => {
      UIDialogs.openSetupModal(true);
    });
  },

  _showFurniture(panel, inst, def) {
    const rotations = [0, 90, 180, 270];
    const rotBtns = rotations.map(r => `
      <button class="btn-rotate${(inst.rotation || 0) === r ? ' active-rot' : ''}" data-rot="${r}" title="${r}°">${r}°</button>
    `).join('');

    const widthCm = inst.widthCm || def.widthCm;
    const depthCm = inst.depthCm || def.depthCm;

    panel.innerHTML = `
      <h3>物件屬性</h3>

      <div class="prop-row">
        <label>類型</label>
        <div style="font-weight:600;">${def.name}</div>
      </div>

      <div class="prop-row">
        <label>標籤</label>
        <input type="text" id="fi-label-input" value="${inst.label || ''}" placeholder="${def.name}">
      </div>

      <div class="prop-row">
        <label>旋轉</label>
        <div class="rotation-group">${rotBtns}</div>
      </div>

      <div class="prop-row" style="margin-top:8px;">
        <label>位置 / 尺寸 (cm)</label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
          <input type="number" id="fi-x" value="${Math.round(inst.xCm)}" min="0" step="1" placeholder="X">
          <input type="number" id="fi-y" value="${Math.round(inst.yCm)}" min="0" step="1" placeholder="Y">
          <input type="number" id="fi-w" value="${Math.round(widthCm)}" min="10" step="1" placeholder="寬">
          <input type="number" id="fi-d" value="${Math.round(depthCm)}" min="10" step="1" placeholder="深">
        </div>
        <button id="btn-fi-apply" style="margin-top:8px;">套用位置/尺寸</button>
      </div>

      <div class="prop-row" style="margin-top:4px;">
        <div style="font-size:11px;color:var(--sub);">
          原始型錄尺寸：${def.widthCm} × ${def.depthCm} cm
        </div>
      </div>

      <button class="btn-danger" id="btn-delete-fi" style="margin-top:10px;">刪除此物件</button>
    `;

    document.getElementById('fi-label-input')?.addEventListener('change', e => {
      dispatch('UPDATE_FURNITURE', { id: inst.id, label: e.target.value });
    });

    panel.querySelectorAll('.btn-rotate').forEach(btn => {
      btn.addEventListener('click', () => {
        dispatch('ROTATE_FURNITURE', { id: inst.id, rotation: +btn.dataset.rot });
      });
    });

    document.getElementById('btn-fi-apply')?.addEventListener('click', () => {
      const xCm = this._readInt('fi-x', Math.round(inst.xCm));
      const yCm = this._readInt('fi-y', Math.round(inst.yCm));
      const wCm = this._readInt('fi-w', Math.round(widthCm));
      const dCm = this._readInt('fi-d', Math.round(depthCm));

      const result = LayerFurniture.applyManualUpdate(inst.id, {
        xCm,
        yCm,
        widthCm: wCm,
        depthCm: dCm
      });

      if (!result.ok) {
        alert('目前位置與尺寸無法放置（與其他物件重疊且找不到可用位置）。');
      }
    });

    document.getElementById('btn-delete-fi')?.addEventListener('click', () => {
      dispatch('DELETE_FURNITURE', { id: inst.id });
    });
  },

  _showZone(panel, zone) {
    const typeOptions = ZONE_TYPES.map(zt =>
      `<option value="${zt.type}"${zone.type === zt.type ? ' selected' : ''}>${zt.icon} ${zt.label}</option>`
    ).join('');

    panel.innerHTML = `
      <h3>區域屬性</h3>

      <div class="prop-row">
        <label>類型</label>
        <select id="zone-type-sel">${typeOptions}</select>
      </div>

      <div class="prop-row">
        <label>標籤</label>
        <input type="text" id="zone-label-input" value="${zone.label || ''}">
      </div>

      <div class="prop-row">
        <label>透明度</label>
        <div class="opacity-row">
          <input type="range" id="zone-opacity" min="0.05" max="0.6" step="0.05" value="${zone.opacity || 0.3}">
          <span class="opacity-val" id="zone-opacity-val">${Math.round((zone.opacity || 0.3) * 100)}%</span>
        </div>
      </div>

      <div class="prop-row" style="margin-top:8px;">
        <label>位置 / 尺寸 (cm)</label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
          <input type="number" id="zone-x" value="${Math.round(zone.xCm)}" min="0" step="1" placeholder="X">
          <input type="number" id="zone-y" value="${Math.round(zone.yCm)}" min="0" step="1" placeholder="Y">
          <input type="number" id="zone-w" value="${Math.round(zone.widthCm)}" min="10" step="1" placeholder="寬">
          <input type="number" id="zone-h" value="${Math.round(zone.heightCm)}" min="10" step="1" placeholder="高">
        </div>
        <button id="btn-zone-apply" style="margin-top:8px;">套用位置/尺寸</button>
      </div>

      <button class="btn-danger" id="btn-delete-zone" style="margin-top:10px;">刪除此區域</button>
    `;

    document.getElementById('zone-type-sel')?.addEventListener('change', e => {
      dispatch('UPDATE_ZONE', { id: zone.id, type: e.target.value, label: getZoneDef(e.target.value).label });
    });

    document.getElementById('zone-label-input')?.addEventListener('change', e => {
      dispatch('UPDATE_ZONE', { id: zone.id, label: e.target.value });
    });

    const opSlider = document.getElementById('zone-opacity');
    const opVal = document.getElementById('zone-opacity-val');
    opSlider?.addEventListener('input', e => {
      opVal.textContent = Math.round(+e.target.value * 100) + '%';
      dispatch('UPDATE_ZONE', { id: zone.id, opacity: +e.target.value });
    });

    document.getElementById('btn-zone-apply')?.addEventListener('click', () => {
      const xCm = this._readInt('zone-x', Math.round(zone.xCm));
      const yCm = this._readInt('zone-y', Math.round(zone.yCm));
      const wCm = this._readInt('zone-w', Math.round(zone.widthCm));
      const hCm = this._readInt('zone-h', Math.round(zone.heightCm));
      LayerZones.applyManualUpdate(zone.id, {
        xCm,
        yCm,
        widthCm: wCm,
        heightCm: hCm
      });
    });

    document.getElementById('btn-delete-zone')?.addEventListener('click', () => {
      dispatch('DELETE_ZONE', { id: zone.id });
    });
  },

  _readInt(id, fallback) {
    const el = document.getElementById(id);
    if (!el) return fallback;
    const n = Math.round(Number(el.value));
    return Number.isFinite(n) ? n : fallback;
  }
};
