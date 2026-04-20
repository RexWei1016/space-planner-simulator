/* state.js — AppState 單一資料源 + dispatch + undo/redo */
'use strict';

const AppState = {
  room: {
    widthCm:  0,
    heightCm: 0,
    ping:     0,
    label:    '辦公室'
  },

  view: {
    scale:        4,      // px per cm
    gridCellCm:   50,
    showLayer1:   true,
    showLayer2:   true,
    showLayer3:   true,
    showPingGrid: false   // 坪數格覆蓋層
  },

  mode: 'select',       // 'select' | 'draw-zone' | 'place-furniture'

  zones: [],            // ZoneObject[]
  furniture: [],        // FurnitureInstance[]
  furnitureCatalog: [], // FurnitureDef[] (built-in + custom)

  selection: {
    type: null,         // 'zone' | 'furniture' | null
    id:   null
  },

  pendingFurnitureDefId: null,  // def id being placed
  pendingZoneType:       null,  // zone type being drawn

  undoStack: [],        // JSON strings (max 50)
  redoStack: []
};

// ── Mutations ───────────────────────────────────────────────────
const mutations = {
  SET_ROOM_SIZE(payload) {
    AppState.room.widthCm  = payload.w;
    AppState.room.heightCm = payload.h;
    AppState.room.label    = payload.label || AppState.room.label;
    AppState.room.ping     = +(payload.w * payload.h / 33058).toFixed(2);
  },

  ADD_ZONE(zone) {
    AppState.zones.push(zone);
  },

  UPDATE_ZONE(payload) {
    const z = AppState.zones.find(z => z.id === payload.id);
    if (z) Object.assign(z, payload);
  },

  DELETE_ZONE(payload) {
    AppState.zones = AppState.zones.filter(z => z.id !== payload.id);
    if (AppState.selection.id === payload.id) {
      AppState.selection = { type: null, id: null };
    }
  },

  ADD_FURNITURE(inst) {
    AppState.furniture.push(inst);
  },

  MOVE_FURNITURE(payload) {
    const f = AppState.furniture.find(f => f.id === payload.id);
    if (f) { f.xCm = payload.xCm; f.yCm = payload.yCm; }
  },

  ROTATE_FURNITURE(payload) {
    const f = AppState.furniture.find(f => f.id === payload.id);
    if (f) f.rotation = payload.rotation;
  },

  UPDATE_FURNITURE(payload) {
    const f = AppState.furniture.find(f => f.id === payload.id);
    if (f) Object.assign(f, payload);
  },

  DELETE_FURNITURE(payload) {
    AppState.furniture = AppState.furniture.filter(f => f.id !== payload.id);
    if (AppState.selection.id === payload.id) {
      AppState.selection = { type: null, id: null };
    }
  },

  ADD_FURNITURE_DEF(def) {
    AppState.furnitureCatalog.push(def);
  },

  DELETE_FURNITURE_DEF(payload) {
    AppState.furnitureCatalog = AppState.furnitureCatalog.filter(d => d.id !== payload.id);
    // also remove placed instances of this def
    AppState.furniture = AppState.furniture.filter(f => f.defId !== payload.id);
  },

  SET_SELECTION(payload) {
    AppState.selection = { type: payload.type, id: payload.id };
  },

  CLEAR_SELECTION() {
    AppState.selection = { type: null, id: null };
  },

  SET_SCALE(payload) {
    AppState.view.scale = Math.max(1, Math.min(10, payload.scale));
  },

  SET_LAYER_VISIBILITY(payload) {
    AppState.view[payload.key] = payload.visible;
  }
};

// ── Undo / Redo ─────────────────────────────────────────────────
function _snapshot() {
  return JSON.stringify({
    zones:     AppState.zones,
    furniture: AppState.furniture
  });
}

function pushUndo() {
  AppState.undoStack.push(_snapshot());
  if (AppState.undoStack.length > 50) AppState.undoStack.shift();
  AppState.redoStack = [];
}

function undo() {
  if (!AppState.undoStack.length) return;
  AppState.redoStack.push(_snapshot());
  const prev = JSON.parse(AppState.undoStack.pop());
  AppState.zones     = prev.zones;
  AppState.furniture = prev.furniture;
  AppState.selection = { type: null, id: null };
  Storage.saveFloorPlan();
  renderAll();
  UIProperties.refresh();
}

function redo() {
  if (!AppState.redoStack.length) return;
  AppState.undoStack.push(_snapshot());
  const next = JSON.parse(AppState.redoStack.pop());
  AppState.zones     = next.zones;
  AppState.furniture = next.furniture;
  AppState.selection = { type: null, id: null };
  Storage.saveFloorPlan();
  renderAll();
  UIProperties.refresh();
}

// ── Dispatch ─────────────────────────────────────────────────────
// Actions that mutate zones/furniture push an undo snapshot first.
const UNDO_ACTIONS = new Set([
  'ADD_ZONE','UPDATE_ZONE','DELETE_ZONE',
  'ADD_FURNITURE','MOVE_FURNITURE','ROTATE_FURNITURE','UPDATE_FURNITURE','DELETE_FURNITURE',
  'DELETE_FURNITURE_DEF'
]);

function dispatch(action, payload) {
  if (!mutations[action]) { console.warn('Unknown action:', action); return; }
  if (UNDO_ACTIONS.has(action)) pushUndo();
  mutations[action](payload);

  if (action !== 'SET_SELECTION' && action !== 'CLEAR_SELECTION') {
    Storage.saveFloorPlan();
  }
  renderAll();
  UIProperties.refresh();
}

// ── Helper ────────────────────────────────────────────────────────
function getFurnitureDef(defId) {
  return AppState.furnitureCatalog.find(d => d.id === defId) || null;
}

function generateId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random()*1000)}`;
}
