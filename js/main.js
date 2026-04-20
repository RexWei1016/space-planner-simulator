/* main.js — App bootstrap、事件串接 */
'use strict';

// ── Global render pipeline ───────────────────────────────────────
function renderAll() {
  if (!AppState.room.widthCm) return;
  LayerRoom.render();
  LayerZones.render();
  LayerFurniture.render();
  _updateRoomInfoBar();
  _updateStatusBar();
}

function _updateRoomInfoBar() {
  const r    = AppState.room;
  const ping = r.ping || ((r.widthCm * r.heightCm) / 33058).toFixed(2);
  const el   = document.getElementById('room-info');
  if (el) el.textContent = `${r.label}  |  ${r.widthCm}×${r.heightCm} cm  |  ${ping} 坪  |  ${AppState.furniture.length} 件家具`;
}

function _updateStatusBar() {
  document.getElementById('status-items').textContent =
    `家具 ${AppState.furniture.length} / 區域 ${AppState.zones.length}`;
}

// ── App Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  // 1. Init catalog (built-ins + custom from localStorage)
  FurnitureCatalog.init();

  // 2. Load saved view settings
  Storage.loadView();

  // 3. Try to restore saved floor plan
  const hasData = Storage.loadFloorPlan();

  // 4. Init toolbar UI
  UIToolbar.init();

  // 5. Init zone drawing events
  LayerZones.initDrawing();

  // 6. Init furniture drag events
  LayerFurniture.initEvents();

  // 7. Modal backdrop close
  UIDialogs.initBackdropClose();

  // 8. If no saved data, show setup modal
  if (!hasData || !AppState.room.widthCm) {
    UIDialogs.openSetupModal(false);
  } else {
    Grid.resizeCanvas();
    Grid.drawGrid();
    renderAll();
    UIToolbar._fitToScreen();
  }

  // 9. Wire header buttons
  document.getElementById('btn-export-json').addEventListener('click', () => Storage.exportJSON());
  document.getElementById('btn-export-png').addEventListener('click',  () => Storage.exportPNG());
  document.getElementById('btn-import-json').addEventListener('click', () => {
    document.getElementById('import-file-input').click();
  });
  document.getElementById('import-file-input').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await Storage.importJSON(file);
      Grid.resizeCanvas();
      Grid.drawGrid();
      UIToolbar.buildFurnitureCatalog();
      renderAll();
      UIToolbar._fitToScreen();
    } catch (err) {
      alert('匯入失敗：' + err.message);
    }
    e.target.value = '';
  });

  document.getElementById('btn-new-plan').addEventListener('click', () => {
    if (confirm('確定要重新開始？目前的規畫將被清除。')) {
      AppState.zones     = [];
      AppState.furniture = [];
      AppState.selection = { type: null, id: null };
      AppState.undoStack = [];
      AppState.redoStack = [];
      UIDialogs.openSetupModal(true);
    }
  });

  // 10. Canvas viewport click events
  const viewport = document.getElementById('canvas-viewport');
  viewport.addEventListener('click', e => {
    const mode = AppState.mode;
    if (mode === 'place-furniture') {
      // Only place if click is on stage area
      const stage = document.getElementById('canvas-stage');
      const stageRect = stage.getBoundingClientRect();
      if (e.clientX >= stageRect.left && e.clientX <= stageRect.right &&
          e.clientY >= stageRect.top  && e.clientY <= stageRect.bottom) {
        LayerFurniture.placeAt(e);
      }
    } else if (mode === 'select') {
      // Click on empty area → deselect
      const bgIds = new Set(['canvas-viewport','canvas-stage','layer-furniture',
                             'layer-grid','layer-room','layer-zones','interaction-overlay']);
      if (bgIds.has(e.target.id) || e.target === viewport) {
        dispatch('CLEAR_SELECTION');
      }
    }
  });

  // Right-click in place mode → rotate ghost
  viewport.addEventListener('contextmenu', e => {
    if (AppState.mode === 'place-furniture') {
      e.preventDefault();
      LayerFurniture.rotateGhost();
    }
  });

  // 11. Status bar cursor position
  viewport.addEventListener('mousemove', e => {
    if (!AppState.room.widthCm) return;
    const { x, y } = Grid.eventToCm(e);
    document.getElementById('status-cursor').textContent =
      `游標：(${Math.round(x)}, ${Math.round(y)}) cm`;
  });

  // 12. Keyboard shortcuts
  document.addEventListener('keydown', e => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
    if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) { e.preventDefault(); redo(); }

    if (e.key === 'Escape') {
      setMode('select');
      dispatch('CLEAR_SELECTION');
    }

    if (e.key === 'r' || e.key === 'R') {
      if (AppState.mode === 'place-furniture') {
        LayerFurniture.rotateGhost();
      } else if (AppState.selection.type === 'furniture') {
        const inst = AppState.furniture.find(f => f.id === AppState.selection.id);
        if (inst) dispatch('ROTATE_FURNITURE', { id: inst.id, rotation: (inst.rotation + 90) % 360 });
      }
    }

    if ((e.key === 'Delete' || e.key === 'Backspace') && AppState.selection.id) {
      const { type, id } = AppState.selection;
      if (type === 'furniture') dispatch('DELETE_FURNITURE', { id });
      if (type === 'zone')      dispatch('DELETE_ZONE',      { id });
    }
  });

  // 13. Initial mode
  setMode('select');
  UIToolbar.updateZoomLabel();
});
