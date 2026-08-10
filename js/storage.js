/* storage.js — localStorage 讀寫、JSON/PNG 匯出入 */
'use strict';

const KEYS = {
  FLOORPLAN: 'ospace_floorplan',
  CUSTOM_FI:  'ospace_custom_furniture',
  VIEW:       'ospace_view'
};

// ── PNG 匯出品質 ─────────────────────────────────────────────────
const EXPORT_PX_PER_CM   = 4;     // 目標倍率：60cm 的椅子約 240px，看得很清楚
const EXPORT_MAX_EDGE_PX = 6000;  // 長邊上限，超過就自動降倍率，避免產出巨無霸圖檔
const EXPORT_PAD_PX      = 56;    // 四周留白，讓房間尺寸標註不會被切掉

// 家具標籤字級。用「平面圖上的公分數」定義，全圖的字才會一樣大；
// 若定成方框寬度的百分比，寬櫃子的字會比窄椅子大好幾倍。
const EXPORT_LABEL_CM     = 7;    // 名稱字高
const EXPORT_SUBLABEL_CM  = 5;    // 尺寸小標字高
const EXPORT_LABEL_MIN_PX = 7;    // 收斂後小於這個就不畫，免得糊成一團

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
    const roomW = AppState.room.widthCm;
    const roomH = AppState.room.heightCm;
    if (!roomW || !roomH) { toast('還沒有設定空間'); return; }

    // 匯出倍率固定，不跟著畫面縮放跑，否則縮小看全景時匯出的圖會小到不能用
    let scale = EXPORT_PX_PER_CM;
    const longestCm = Math.max(roomW, roomH);
    if (longestCm * scale + EXPORT_PAD_PX * 2 > EXPORT_MAX_EDGE_PX) {
      scale = (EXPORT_MAX_EDGE_PX - EXPORT_PAD_PX * 2) / longestCm;
    }

    const pad = EXPORT_PAD_PX;
    const W   = Math.round(roomW * scale);
    const H   = Math.round(roomH * scale);
    const canvasW = W + pad * 2;
    const canvasH = H + pad * 2;

    // SVG 圖層的座標是照「目前畫面倍率」畫出來的，所以先暫時把倍率切到匯出倍率、
    // 重畫這幾層、同步序列化成字串，再馬上還原。整段都是同步的，中間不會發生
    // 重繪，畫面不會閃爍，而且標籤的顯示門檻也會用匯出倍率判斷。
    const css = _collectCssText();
    const prevScale = AppState.view.scale;
    let svgSources;
    try {
      AppState.view.scale = scale;
      LayerRoom.render();
      LayerZones.render();
      LayerMeasure.render();
      svgSources = {
        room:    _serializeSVG(document.getElementById('layer-room'),  W, H, pad, css),
        zones:   _serializeSVG(document.getElementById('layer-zones'), W, H, pad, css),
        measure: AppState.view.showMeasure
          ? _serializeSVG(document.getElementById('layer-measure'), W, H, pad, css)
          : null
      };
    } finally {
      AppState.view.scale = prevScale;
      LayerRoom.render();
      LayerZones.render();
      LayerMeasure.render();
    }

    const offscreen = document.createElement('canvas');
    offscreen.width  = canvasW;
    offscreen.height = canvasH;
    const ctx = offscreen.getContext('2d');

    // 1. 白底（含留白區）
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // 2. 網格：用匯出倍率重畫一份，不是把畫面上的低解析度畫布放大
    ctx.save();
    ctx.translate(pad, pad);
    Grid.drawGrid({ ctx, W, H, scale });
    ctx.restore();

    // 3~4. 邊界與區域（viewBox 已含留白位移，直接畫在 0,0）
    await _drawSVGStringToCanvas(ctx, svgSources.room,  canvasW, canvasH);
    await _drawSVGStringToCanvas(ctx, svgSources.zones, canvasW, canvasH);

    // 5. 家具
    ctx.save();
    ctx.translate(pad, pad);
    for (const inst of AppState.furniture) {
      const def = getFurnitureDef(inst.defId);
      if (!def) continue;
      _drawFurnitureOnCanvas(ctx, inst, def, scale);
    }
    ctx.restore();

    // 6. 量測線
    if (svgSources.measure) {
      await _drawSVGStringToCanvas(ctx, svgSources.measure, canvasW, canvasH);
    }

    const a = document.createElement('a');
    a.download = `${AppState.room.label}_平面圖.png`;
    a.href = offscreen.toDataURL('image/png');
    a.click();

    toast(`已匯出 ${canvasW}×${canvasH} px（${scale.toFixed(1)} px/cm）`);
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

// 同步把 SVG 圖層轉成字串。viewBox 往外推 pad，房間外面的尺寸標註才不會被裁掉。
function _serializeSVG(svgEl, w, h, pad, css) {
  const NS = 'http://www.w3.org/2000/svg';
  const clone = svgEl.cloneNode(true);

  // 移掉 id，否則 #layer-room 之類的 width:100% 規則會蓋掉下面設定的尺寸
  clone.removeAttribute('id');
  clone.setAttribute('xmlns', NS);
  clone.setAttribute('width',  w + pad * 2);
  clone.setAttribute('height', h + pad * 2);
  clone.setAttribute('viewBox', `${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}`);

  const style = document.createElementNS(NS, 'style');
  style.textContent = css;
  clone.insertBefore(style, clone.firstChild);

  return new XMLSerializer().serializeToString(clone);
}

function _svgStringToImage(svgData) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const img  = new Image();
    img.onload  = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = reject;
    img.src     = url;
  });
}

async function _drawSVGStringToCanvas(ctx, svgData, w, h) {
  if (!svgData) return;
  try {
    const img = await _svgStringToImage(svgData);
    ctx.drawImage(img, 0, 0, w, h);
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

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // 字級全圖一致，只有在方框塞不下時才往下收
  const nameSize = Math.min(EXPORT_LABEL_CM * scale, rh * 0.42);
  const subSize  = Math.min(EXPORT_SUBLABEL_CM * scale, rh * 0.26);
  const maxTextW = rw * 0.88;

  // 高度夠放兩行時才補上尺寸小標，跟畫面上的顯示一致
  const showSub = rh > (nameSize + subSize) * 2 && rw > subSize * 6;

  if (nameSize >= EXPORT_LABEL_MIN_PX) {
    const name = _fitText(ctx, inst.label || def.name, maxTextW, nameSize, 'bold');
    if (name) {
      ctx.fillStyle = 'rgba(0,0,0,.7)';
      ctx.font = `bold ${nameSize}px sans-serif`;
      ctx.fillText(name, rw / 2, showSub ? rh / 2 - subSize * 0.7 : rh / 2);
    }
  }

  if (showSub && subSize >= EXPORT_LABEL_MIN_PX) {
    const sub = _fitText(ctx, `${widthCm}×${depthCm}`, maxTextW, subSize, 'normal');
    if (sub) {
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.font = `${subSize}px sans-serif`;
      ctx.fillText(sub, rw / 2, rh / 2 + nameSize * 0.75);
    }
  }

  ctx.restore();
}

// 把文字塞進指定寬度：放不下就從尾端裁掉並補上省略號
function _fitText(ctx, text, maxW, fontPx, weight) {
  ctx.font = `${weight} ${fontPx}px sans-serif`;
  if (ctx.measureText(text).width <= maxW) return text;

  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t.length > 1 ? t + '…' : '';
}
