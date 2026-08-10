/* main.js — App bootstrap、事件串接 */
'use strict';

// ── Global render pipeline ───────────────────────────────────────
function renderAll() {
  if (!AppState.room.widthCm) return;
  LayerRoom.render();
  LayerZones.render();
  LayerFurniture.render();
  LayerMeasure.render();
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

// ── Toast 提示 ───────────────────────────────────────────────────
let _toastTimer = null;

function toast(msg) {
  let el = document.getElementById('app-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'app-toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 1600);
}

// ── 複製 / 貼上 ──────────────────────────────────────────────────
let _clipboard     = null;  // { kind: 'furniture' | 'zone', data: snapshot }
let _lastCursorCm  = null;  // 最後一次落在畫布上的游標位置（cm）

function copySelection() {
  const { type, id } = AppState.selection;

  if (type === 'furniture') {
    const snap = LayerFurniture.snapshot(id);
    if (!snap) return;
    _clipboard = { kind: 'furniture', data: snap };
    toast('已複製物件，Ctrl+V 貼到游標位置');
    return;
  }

  if (type === 'zone') {
    const snap = LayerZones.snapshot(id);
    if (!snap) return;
    _clipboard = { kind: 'zone', data: snap };
    toast('已複製區域，Ctrl+V 貼到游標位置');
    return;
  }

  toast('請先選取要複製的物件或區域');
}

function pasteClipboard() {
  if (!_clipboard) { toast('剪貼簿是空的'); return; }

  const res = _clipboard.kind === 'furniture'
    ? LayerFurniture.pasteFrom(_clipboard.data, _lastCursorCm)
    : LayerZones.pasteFrom(_clipboard.data, _lastCursorCm);

  toast(res.ok ? '已貼上' : '此處放不下，找不到可用位置');
}

function duplicateSelection() {
  const { type, id } = AppState.selection;

  if (type === 'furniture') {
    const res = LayerFurniture.duplicate(id);
    toast(res.ok ? '已複製物件' : '找不到可放置的位置');
    return;
  }

  if (type === 'zone') {
    const res = LayerZones.duplicate(id);
    toast(res.ok ? '已複製區域' : '無法複製此區域');
    return;
  }

  toast('請先選取要複製的物件或區域');
}

// ── App Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  // 0. 顯示目前載入的版本，方便確認有沒有吃到新的檔案（而不是舊快取）
  const ver = document.querySelector('meta[name="app-version"]')?.content || '—';
  const verEl = document.getElementById('status-version');
  if (verEl) verEl.textContent = `v${ver}`;

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
      AppState.zones        = [];
      AppState.furniture    = [];
      AppState.measurements = [];
      AppState.selection    = { type: null, id: null };
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
    _lastCursorCm = { x, y };   // 供 Ctrl+V 貼到游標位置
    document.getElementById('status-cursor').textContent =
      `游標：(${Math.round(x)}, ${Math.round(y)}) cm`;
  });

  // 12. Keyboard shortcuts
  document.addEventListener('keydown', e => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
    if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) { e.preventDefault(); redo(); }

    if (e.ctrlKey && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); duplicateSelection(); }
    if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) { e.preventDefault(); copySelection(); }
    if (e.ctrlKey && (e.key === 'v' || e.key === 'V')) { e.preventDefault(); pasteClipboard(); }

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
