/* ui-dialogs.js — 初始化 Modal、自訂家具 Modal */
'use strict';

const UIDialogs = {
  // ── Setup Modal ─────────────────────────────────────────────
  _setupModalInited: false,

  openSetupModal(allowClose) {
    const modal = document.getElementById('modal-setup');
    modal.classList.remove('hidden');

    const pingInput  = document.getElementById('setup-ping');
    const wInput     = document.getElementById('setup-w');
    const hInput     = document.getElementById('setup-h');
    const nameInput  = document.getElementById('setup-name');
    const confirmBtn = document.getElementById('setup-confirm');
    const cancelBtn  = document.getElementById('setup-cancel');

    // Pre-fill if room exists
    if (AppState.room.widthCm) {
      pingInput.value = AppState.room.ping || '';
      wInput.value    = AppState.room.widthCm;
      hInput.value    = AppState.room.heightCm;
      nameInput.value = AppState.room.label;
    }

    if (cancelBtn) cancelBtn.style.display = allowClose ? '' : 'none';

    // Wire input events only once (use onclick to avoid stacking listeners)
    pingInput.oninput = () => {
      const ping = parseFloat(pingInput.value);
      if (!isNaN(ping) && ping > 0) {
        const side = Math.round(Math.sqrt(ping * 33058));
        wInput.value = side;
        hInput.value = side;
      }
    };
    const updatePing = () => {
      const w = parseFloat(wInput.value);
      const h = parseFloat(hInput.value);
      if (!isNaN(w) && !isNaN(h) && w > 0 && h > 0) {
        pingInput.value = (w * h / 33058).toFixed(2);
      }
    };
    wInput.oninput = updatePing;
    hInput.oninput = updatePing;

    const onConfirm = () => {
      const w = parseInt(wInput.value);
      const h = parseInt(hInput.value);
      const name = nameInput.value.trim() || '辦公室';
      if (!w || !h || w < 100 || h < 100) {
        alert('請輸入有效尺寸（最小 100cm × 100cm）');
        return;
      }
      // Clear existing layout if this is a fresh setup (not resize)
      if (!allowClose) {
        AppState.zones     = [];
        AppState.furniture = [];
        AppState.selection = { type: null, id: null };
      }
      dispatch('SET_ROOM_SIZE', { w, h, label: name });
      Grid.resizeCanvas();
      Grid.drawGrid();
      renderAll();
      this._fitAfterSetup();
      modal.classList.add('hidden');
    };

    confirmBtn.onclick = onConfirm;
    if (cancelBtn) cancelBtn.onclick = () => modal.classList.add('hidden');
  },

  _fitAfterSetup() {
    // Slight delay to let DOM update
    setTimeout(() => UIToolbar._fitToScreen(), 50);
  },

  // ── Custom Furniture Modal ────────────────────────────────────
  openCustomFurnitureModal() {
    const modal = document.getElementById('modal-custom-fi');
    modal.classList.remove('hidden');

    document.getElementById('cfi-name').value    = '';
    document.getElementById('cfi-w').value       = '';
    document.getElementById('cfi-d').value       = '';
    document.getElementById('cfi-color').value   = '#a8d8ea';
    document.getElementById('cfi-category').value = 'custom';

    const saveBtn   = document.getElementById('cfi-save');
    const cancelBtn = document.getElementById('cfi-cancel');

    saveBtn.onclick = () => {
      const name  = document.getElementById('cfi-name').value.trim();
      const w     = parseInt(document.getElementById('cfi-w').value);
      const d     = parseInt(document.getElementById('cfi-d').value);
      const color = document.getElementById('cfi-color').value;
      const cat   = document.getElementById('cfi-category').value;

      if (!name) { alert('請輸入名稱'); return; }
      if (!w || !d || w < 10 || d < 10) { alert('請輸入有效尺寸（最小 10cm）'); return; }

      const def = {
        id:       'custom-' + Date.now(),
        name:     name,
        widthCm:  w,
        depthCm:  d,
        category: cat,
        color:    color,
        isCustom: true
      };
      FurnitureCatalog.addCustom(def);
      UIToolbar.buildFurnitureCatalog();
      modal.classList.add('hidden');

      // Auto-select new def for placement
      AppState.pendingFurnitureDefId = def.id;
      LayerFurniture._ghostRotation  = 0;
      setMode('place-furniture');
      LayerFurniture.showGhost(def.id, 0);
    };

    cancelBtn.onclick = () => modal.classList.add('hidden');
  },

  // Close modal when clicking backdrop
  initBackdropClose() {
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
      backdrop.addEventListener('click', e => {
        if (e.target === backdrop) {
          // Only close if it's not the setup modal that's required
          if (backdrop.id === 'modal-setup' && !AppState.room.widthCm) return;
          backdrop.classList.add('hidden');
        }
      });
    });
  }
};
