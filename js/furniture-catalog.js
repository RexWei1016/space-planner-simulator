/* furniture-catalog.js — 內建家具定義 + 自訂家具管理 */
'use strict';

const BUILTIN_FURNITURE = [
  { id: 'workstation-150', name: '工作站',  widthCm: 150, depthCm: 150, category: 'workstation', color: '#a8d8ea', isCustom: false },
  { id: 'desk-120',        name: '辦公桌',  widthCm: 120, depthCm:  60, category: 'desk',        color: '#b8e0d2', isCustom: false },
  { id: 'chair-std',       name: '辦公椅',  widthCm:  50, depthCm:  50, category: 'chair',       color: '#d6eaf8', isCustom: false },
  { id: 'conf-table-240',  name: '會議桌',  widthCm: 240, depthCm: 100, category: 'meeting',     color: '#d5d8dc', isCustom: false },
  { id: 'sofa-180',        name: '沙發',    widthCm: 180, depthCm:  80, category: 'lounge',      color: '#d2b4de', isCustom: false },
  { id: 'cabinet-90',      name: '文件櫃',  widthCm:  90, depthCm:  45, category: 'storage',     color: '#fad7a0', isCustom: false },
  { id: 'plant-40',        name: '植栽',    widthCm:  40, depthCm:  40, category: 'deco',        color: '#a9dfbf', isCustom: false },
  { id: 'monitor-60',      name: '螢幕',    widthCm:  60, depthCm:  15, category: 'desk',        color: '#d5d8dc', isCustom: false },
  { id: 'printer-50',      name: '印表機',  widthCm:  50, depthCm:  40, category: 'storage',     color: '#e8daef', isCustom: false },
  { id: 'locker-40',       name: '置物櫃',  widthCm:  40, depthCm:  50, category: 'storage',     color: '#fdebd0', isCustom: false },
  { id: 'whiteboard-120',  name: '白板',    widthCm: 120, depthCm:   5, category: 'meeting',     color: '#fdfefe', isCustom: false },
];

const FurnitureCatalog = {
  init() {
    // Load built-ins
    AppState.furnitureCatalog = [...BUILTIN_FURNITURE];
    // Append saved custom defs
    const custom = Storage.loadCustomFurniture();
    custom.forEach(def => {
      if (!AppState.furnitureCatalog.find(d => d.id === def.id)) {
        AppState.furnitureCatalog.push(def);
      }
    });
  },

  addCustom(def) {
    def.isCustom = true;
    dispatch('ADD_FURNITURE_DEF', def);
    Storage.saveCustomFurniture();
  },

  deleteCustom(defId) {
    dispatch('DELETE_FURNITURE_DEF', { id: defId });
    Storage.saveCustomFurniture();
  }
};
