/* storage.js — localStorage 讀寫、JSON/PNG 匯出入 */
'use strict';

const KEYS = {
  FLOORPLAN: 'ospace_floorplan',
  CUSTOM_FI:  'ospace_custom_furniture',
  VIEW:       'ospace_view'
};

const Storage = {
  // ── Floor Plan ──────────────────────────────────────────────
  saveFloorPlan() {
    try {
      const data = {
        version:    '1.0',
        savedAt:    new Date().toISOString(),
        room:       { ...AppState.room },
        zones:      JSON.parse(JSON.stringify(AppState.zones)),
        furniture:  JSON.parse(JSON.stringify(AppState.furniture)),
        measurements: JSON.parse(JSON.stringify(AppState.measurements)),
        customFurnitureDefs: AppState.furnitureCatalog.filter(d => d.isCustom)
      };
      localStorage.setItem(KEYS.FLOORPLAN, JSON.stringify(data));
    } catch (e) { console.error('Save failed', e); }
  },

  loadFloorPlan() {
    try {
      const raw = localStorage.getItem(KEYS.FLOORPLAN);
      if (!raw) return false;
      const data = JSON.parse(raw);
      AppState.room         = { ...AppState.room, ...data.room };
      AppState.zones        = data.zones     || [];
      AppState.furniture    = data.furniture || [];
      AppState.measurements = data.measurements || [];   // 舊存檔沒有這欄
      if (data.customFurnitureDefs) {
        data.customFurnitureDefs.forEach(def => {
          def.isCustom = true;
          if (!AppState.furnitureCatalog.find(d => d.id === def.id)) {
            AppState.furnitureCatalog.push(def);
          }
        });
      }
      return true;
    } catch (e) { console.error('Load failed', e); return false; }
  },

  // ── Custom Furniture ─────────────────────────────────────────
  saveCustomFurniture() {
    const custom = AppState.furnitureCatalog.filter(d => d.isCustom);
    localStorage.setItem(KEYS.CUSTOM_FI, JSON.stringify(custom));
  },

  loadCustomFurniture() {
    try {
      const raw = localStorage.getItem(KEYS.CUSTOM_FI);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  },

  // ── View state ───────────────────────────────────────────────
  saveView() {
    localStorage.setItem(KEYS.VIEW, JSON.stringify(AppState.view));
  },

  loadView() {
    try {
      const raw = localStorage.getItem(KEYS.VIEW);
      if (raw) Object.assign(AppState.view, JSON.parse(raw));
    } catch {}
  },

  // ── JSON Export ──────────────────────────────────────────────
  exportJSON() {
    const data = {
      version:    '1.0',
      exportedAt: new Date().toISOString(),
      room:       { ...AppState.room },
      zones:      JSON.parse(JSON.stringify(AppState.zones)),
      furniture:  JSON.parse(JSON.stringify(AppState.furniture)),
      measurements: JSON.parse(JSON.stringify(AppState.measurements)),
      customFurnitureDefs: AppState.furnitureCatalog.filter(d => d.isCustom)
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.download = `${AppState.room.label}_平面圖.json`;
    a.href = url;
    a.click();
    URL.revokeObjectURL(url);
  },

  importJSON(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const data = JSON.parse(e.target.result);
          if (!data.room || !data.zones || !data.furniture) throw new Error('格式錯誤');
          AppState.room         = { ...AppState.room, ...data.room };
          AppState.zones        = data.zones;
          AppState.furniture    = data.furniture;
          AppState.measurements = data.measurements || [];
          AppState.selection    = { type: null, id: null };
          if (data.customFurnitureDefs) {
            data.customFurnitureDefs.forEach(def => {
              def.isCustom = true;
              if (!AppState.furnitureCatalog.find(d => d.id === def.id)) {
                AppState.furnitureCatalog.push(def);
              }
            });
          }
          Storage.saveFloorPlan();
          resolve();
        } catch (err) { reject(err); }
      };
      reader.onerror = reject;
      reader.readAsText(file);
    });
  },

  // ── PNG Export ───────────────────────────────────────────────
  async exportPNG() {
    const scale    = AppState.view.scale;
    const W        = AppState.room.widthCm  * scale;
    const H        = AppState.room.heightCm * scale;
    const offscreen = document.createElement('canvas');
    offscreen.width  = W;
    offscreen.height = H;
    const ctx = offscreen.getContext('2d');

    // 1. White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    // 2. Grid canvas
    const gridEl = document.getElementById('layer-grid');
    ctx.drawImage(gridEl, 0, 0);

    // 3. Room SVG
    await _drawSVGToCanvas(ctx, document.getElementById('layer-room'), W, H);

    // 4. Zones SVG
    await _drawSVGToCanvas(ctx, document.getElementById('layer-zones'), W, H);

    // 5. Furniture (draw manually)
    for (const inst of AppState.furniture) {
      const def = getFurnitureDef(inst.defId);
      if (!def) continue;
      _drawFurnitureOnCanvas(ctx, inst, def, scale);
    }

    // 6. 量測線
    if (AppState.view.showMeasure) {
      await _drawSVGToCanvas(ctx, document.getElementById('layer-measure'), W, H);
    }

    const a = document.createElement('a');
    a.download = `${AppState.room.label}_平面圖.png`;
    a.href = offscreen.toDataURL('image/png');
    a.click();
  }
};

// ── Helpers ──────────────────────────────────────────────────────
// SVG 被當成圖片載入時是一份獨立文件，讀不到頁面的樣式表，
// 所有靠 class 上色的元素都會退回預設值（fill 變黑、stroke 消失）。
// 因此序列化前要把樣式內嵌進去。
function _collectCssText() {
  let css = '';
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) css += rule.cssText + '\n';
    } catch {
      // 跨來源樣式表讀不到 cssRules，略過
    }
  }
  return css;
}

function _svgToImage(svgEl, w, h) {
  return new Promise((resolve, reject) => {
    const clone = svgEl.cloneNode(true);
    clone.setAttribute('width',  w);
    clone.setAttribute('height', h);
    clone.setAttribute('viewBox', `0 0 ${w} ${h}`);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    // 移掉 id，否則 #layer-room 之類的 width:100% 規則會蓋掉上面的尺寸
    clone.removeAttribute('id');

    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = _collectCssText();
    clone.insertBefore(style, clone.firstChild);

    const svgData = new XMLSerializer().serializeToString(clone);
    const blob    = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url     = URL.createObjectURL(blob);
    const img     = new Image();
    img.onload  = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = reject;
    img.src     = url;
  });
}

async function _drawSVGToCanvas(ctx, svgEl, w, h) {
  try {
    const img = await _svgToImage(svgEl, w, h);
    ctx.drawImage(img, 0, 0);
  } catch (e) { console.warn('SVG draw failed', e); }
}

function _drawFurnitureOnCanvas(ctx, inst, def, scale) {
  // 尺寸要用實例上的（可能被拖拉控制點改過），不能只看型錄。
  // 旋轉沿用畫面上的做法：交換寬深即可，不可再 ctx.rotate()，
  // 否則會轉兩次、跑到自己的 footprint 外面。
  const widthCm = inst.widthCm || def.widthCm;
  const depthCm = inst.depthCm || def.depthCm;
  const swap    = (inst.rotation === 90 || inst.rotation === 270);

  const x  = inst.xCm * scale;
  const y  = inst.yCm * scale;
  const rw = (swap ? depthCm : widthCm) * scale;
  const rh = (swap ? widthCm : depthCm) * scale;

  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = def.color || '#a8d8ea';
  ctx.globalAlpha = 0.85;
  ctx.fillRect(0, 0, rw, rh);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(0,0,0,.3)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(0, 0, rw, rh);

  ctx.fillStyle = 'rgba(0,0,0,.6)';
  ctx.font = `bold ${Math.max(9, rw * .09)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const label = inst.label || def.name;
  ctx.fillText(label, rw / 2, rh / 2);

  ctx.restore();
}
