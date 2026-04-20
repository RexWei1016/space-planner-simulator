/* zone-catalog.js — 區域類型定義 */
'use strict';

const ZONE_TYPES = [
  { type: 'open-office', label: '開放辦公區', color: '#5dade2', icon: '🖥' },
  { type: 'meeting',     label: '會議室',     color: '#4a90d9', icon: '🗣' },
  { type: 'breakroom',   label: '休息區',     color: '#7bc67e', icon: '☕' },
  { type: 'reception',   label: '接待區',     color: '#9b59b6', icon: '🤝' },
  { type: 'storage',     label: '倉儲區',     color: '#f5a623', icon: '📦' },
  { type: 'server',      label: '機房',       color: '#e74c3c', icon: '🖧' },
  { type: 'custom',      label: '自定義',     color: '#95a5a6', icon: '✏️' },
];

function getZoneDef(type) {
  return ZONE_TYPES.find(z => z.type === type) || ZONE_TYPES[ZONE_TYPES.length - 1];
}
