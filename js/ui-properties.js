/* ui-properties.js — 右側屬性面板 */
'use strict';

const UIProperties = {
  refresh() {
    const panel  = document.getElementById('props-panel');
    const { type, id } = AppState.selection;

    if (type === 'furniture') {
      const inst = AppState.furniture.find(f => f.id === id);
      const def  = inst ? getFurnitureDef(inst.defId) : null;
      if (inst && def) { this._showFurniture(panel, inst, def); return; }
    }
    if (type === 'zone') {
      const zone = AppState.zones.find(z => z.id === id);
      if (zone) { this._showZone(panel, zone); return; }
    }
    this._showRoomInfo(panel);
  },

  // ── Room info (nothing selected) ─────────────────────────────
  _showRoomInfo(panel) {
    const r = AppState.room;
    const ping = r.ping || ((r.widthCm * r.heightCm) / 33058).toFixed(2);
    panel.innerHTML = `
      <h3>空間資訊</h3>
      <div class="room-info-grid">
        <div class="info-cell">
          <div class="info-label">寬度</div>
          <div class="info-value">${r.widthCm} cm</div>
        </div>
        <div class="info-cell">
          <div class="info-label">深度</div>
          <div class="info-value">${r.heightCm} cm</div>
        </div>
        <div class="info-cell">
          <div class="info-label">面積</div>
          <div class="info-value">${ping} 坪</div>
        </div>
        <div class="info-cell">
          <div class="info-label">m²</div>
          <div class="info-value">${(r.widthCm * r.heightCm / 10000).toFixed(2)} m²</div>
        </div>
      </div>
      <button class="btn-resize-room" id="btn-resize-room">重設空間大小</button>

      <div style="margin-top:18px;">
        <h3>統計</h3>
        <div class="room-info-grid">
          <div class="info-cell">
            <div class="info-label">家具數量</div>
            <div class="info-value">${AppState.furniture.length}</div>
          </div>
          <div class="info-cell">
            <div class="info-label">區域數量</div>
            <div class="info-value">${AppState.zones.length}</div>
          </div>
        </div>
      </div>

      <div style="margin-top:18px; font-size:11px; color:var(--sub); line-height:1.6;">
        <b>快捷鍵：</b><br>
        Ctrl+Z 復原 / Ctrl+Y 重做<br>
        R = 旋轉家具<br>
        Delete = 刪除選取<br>
        Esc = 取消放置
      </div>
    `;
    document.getElementById('btn-resize-room')?.addEventListener('click', () => {
      UIDialogs.openSetupModal(true);
    });
  },

  // ── Furniture ────────────────────────────────────────────────
  _showFurniture(panel, inst, def) {
    const rotations = [0, 90, 180, 270];
    const rotBtns = rotations.map(r => `
      <button class="btn-rotate${inst.rotation === r ? ' active-rot' : ''}"
              data-rot="${r}" title="${r}°">${r}°</button>
    `).join('');

    panel.innerHTML = `
      <h3>家具屬性</h3>

      <div class="prop-row">
        <label>類型</label>
        <div style="font-weight:600;">${def.name}</div>
        <div style="font-size:11px;color:var(--sub);">${def.widthCm}×${def.depthCm} cm</div>
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
        <div style="font-size:11px;color:var(--sub);">
          位置：(${inst.xCm}, ${inst.yCm}) cm
        </div>
      </div>

      <button class="btn-danger" id="btn-delete-fi" style="margin-top:10px;">🗑 刪除家具</button>
    `;

    // Label input
    document.getElementById('fi-label-input').addEventListener('change', e => {
      dispatch('UPDATE_FURNITURE', { id: inst.id, label: e.target.value });
    });

    // Rotation buttons
    panel.querySelectorAll('.btn-rotate').forEach(btn => {
      btn.addEventListener('click', () => {
        dispatch('ROTATE_FURNITURE', { id: inst.id, rotation: +btn.dataset.rot });
      });
    });

    // Delete
    document.getElementById('btn-delete-fi').addEventListener('click', () => {
      dispatch('DELETE_FURNITURE', { id: inst.id });
    });
  },

  // ── Zone ─────────────────────────────────────────────────────
  _showZone(panel, zone) {
    const def = getZoneDef(zone.type);
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
        <label>填色透明度</label>
        <div class="opacity-row">
          <input type="range" id="zone-opacity" min="0.05" max="0.6" step="0.05" value="${zone.opacity || 0.3}">
          <span class="opacity-val" id="zone-opacity-val">${Math.round((zone.opacity||0.3)*100)}%</span>
        </div>
      </div>

      <div class="prop-row" style="margin-top:4px;">
        <div style="font-size:11px;color:var(--sub);">
          位置：(${zone.xCm}, ${zone.yCm}) cm<br>
          尺寸：${zone.widthCm}×${zone.heightCm} cm
        </div>
      </div>

      <button class="btn-danger" id="btn-delete-zone" style="margin-top:10px;">🗑 刪除區域</button>
    `;

    document.getElementById('zone-type-sel').addEventListener('change', e => {
      dispatch('UPDATE_ZONE', { id: zone.id, type: e.target.value, label: getZoneDef(e.target.value).label });
    });

    document.getElementById('zone-label-input').addEventListener('change', e => {
      dispatch('UPDATE_ZONE', { id: zone.id, label: e.target.value });
    });

    const opSlider = document.getElementById('zone-opacity');
    const opVal    = document.getElementById('zone-opacity-val');
    opSlider.addEventListener('input', e => {
      opVal.textContent = Math.round(+e.target.value * 100) + '%';
      dispatch('UPDATE_ZONE', { id: zone.id, opacity: +e.target.value });
    });

    document.getElementById('btn-delete-zone').addEventListener('click', () => {
      dispatch('DELETE_ZONE', { id: zone.id });
    });
  }
};
