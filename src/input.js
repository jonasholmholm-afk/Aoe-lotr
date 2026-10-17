// =====================================================================
//  Touch / mouse input → controller callbacks
// =====================================================================
export class Input {
  constructor(canvas, ctrl) {
    this.canvas = canvas; this.ctrl = ctrl;
    this.pointers = new Map();
    this.dragging = false; this.pinching = false; this.moved = false;
    this.lastTap = 0; this.lastTapX = 0; this.lastTapY = 0;
    this.longTimer = null; this.longFired = false;
    this.start = null; this.pinchStart = null;
    canvas.addEventListener('pointerdown', e => this.down(e));
    canvas.addEventListener('pointermove', e => this.move(e));
    canvas.addEventListener('pointerup', e => this.up(e));
    canvas.addEventListener('pointercancel', e => this.up(e));
    canvas.addEventListener('wheel', e => { e.preventDefault(); ctrl.onWheel(e.clientX, e.clientY, e.deltaY); }, { passive: false });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('keydown', e => ctrl.onKey(e));
    this.edgePan = { x: 0, y: 0 };
  }
  down(e) {
    this.canvas.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), button: e.button });
    if (this.pointers.size === 1) {
      this.start = { x: e.clientX, y: e.clientY, t: performance.now(), button: e.button };
      this.moved = false; this.dragging = false; this.longFired = false;
      this.ctrl.onPressStart(e.clientX, e.clientY);
      clearTimeout(this.longTimer);
      this.longTimer = setTimeout(() => { if (!this.moved && this.pointers.size === 1) { this.longFired = true; this.ctrl.onLongPress(e.clientX, e.clientY); } }, 480);
    } else if (this.pointers.size === 2) {
      clearTimeout(this.longTimer);
      const [a, b] = [...this.pointers.values()];
      this.pinching = true; this.dragging = false;
      this.pinchStart = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      this.ctrl.onPinchStart(this.pinchStart.cx, this.pinchStart.cy);
    }
  }
  move(e) {
    const p = this.pointers.get(e.pointerId); if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    if (this.pinching && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      this.ctrl.onPinch(d / this.pinchStart.d, cx, cy);
      return;
    }
    if (this.pointers.size !== 1 || !this.start) return;
    const dx = e.clientX - this.start.x, dy = e.clientY - this.start.y;
    if (!this.moved && Math.hypot(dx, dy) > 8) { this.moved = true; clearTimeout(this.longTimer); if (!this.longFired) { this.dragging = true; this.ctrl.onDragStart(this.start.x, this.start.y, this.start.button); } }
    if (this.dragging) this.ctrl.onDragMove(e.clientX, e.clientY, this.start.x, this.start.y);
    else if (this.longFired) this.ctrl.onLongDrag(e.clientX, e.clientY);
  }
  up(e) {
    const p = this.pointers.get(e.pointerId); if (!p) return;
    this.pointers.delete(e.pointerId);
    clearTimeout(this.longTimer);
    if (this.pinching) { if (this.pointers.size < 2) { this.pinching = false; this.ctrl.onPinchEnd(); if (this.pointers.size === 1) { const [r] = [...this.pointers.values()]; this.start = { x: r.x, y: r.y, t: performance.now(), button: 0 }; this.moved = true; this.dragging = true; this.ctrl.onDragStart(r.x, r.y, 0); } } return; }
    if (this.pointers.size > 0) return;
    if (this.dragging) { this.dragging = false; this.ctrl.onDragEnd(e.clientX, e.clientY); return; }
    if (this.longFired) { this.ctrl.onLongRelease(e.clientX, e.clientY); return; }
    if (!this.moved) {
      const now = performance.now();
      const dbl = now - this.lastTap < 320 && Math.hypot(e.clientX - this.lastTapX, e.clientY - this.lastTapY) < 24;
      this.lastTap = dbl ? 0 : now; this.lastTapX = e.clientX; this.lastTapY = e.clientY;
      this.ctrl.onTap(e.clientX, e.clientY, dbl, p.button);
    }
  }
}
