/* layer-room.js — Layer 1：SVG 空間邊界 */
'use strict';

const LayerRoom = {
  render() {
    const svg = document.getElementById('layer-room');
    const scale = AppState.view.scale;
    const W  = AppState.room.widthCm  * scale;
    const H  = AppState.room.heightCm * scale;

    svg.style.visibility = AppState.view.showLayer1 ? '' : 'hidden';
    svg.innerHTML = '';

    if (!W || !H) return;

    // Room fill + border
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', 0); rect.setAttribute('y', 0);
    rect.setAttribute('width', W); rect.setAttribute('height', H);
    rect.setAttribute('class', 'room-boundary');
    svg.appendChild(rect);

    // Dimension labels
    this._addDimLabel(svg, W / 2, H + 18, `${AppState.room.widthCm} cm  (${(AppState.room.widthCm/100).toFixed(2)} m)`, 'middle');
    this._addDimLabel(svg, -18, H / 2, `${AppState.room.heightCm} cm  (${(AppState.room.heightCm/100).toFixed(2)} m)`, 'middle', -90);
  },

  _addDimLabel(svg, x, y, text, anchor, rotateDeg) {
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', x); t.setAttribute('y', y);
    t.setAttribute('text-anchor', anchor || 'middle');
    t.setAttribute('class', 'room-dimension-text');
    if (rotateDeg) t.setAttribute('transform', `rotate(${rotateDeg},${x},${y})`);
    t.textContent = text;
    svg.appendChild(t);
  }
};
