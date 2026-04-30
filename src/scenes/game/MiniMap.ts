import * as THREE from 'three';

export interface MiniMapOptions {
  width?: number;
  height?: number;
  mapImageUrl: string;
  playerColor?: string;
  containerId?: string;
}

export class MiniMap {
  private container: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private mapImage: HTMLImageElement;
  private playerPos: { x: number; y: number } = { x: 0.5, y: 0.5 };
  private isImageLoaded: boolean = false;

  // Arrow HUD elements
  private arrowContainer: HTMLDivElement;
  private arrowCanvas: HTMLCanvasElement;
  private arrowCtx: CanvasRenderingContext2D;

  // Fullscreen modal elements
  private modalOverlay: HTMLDivElement;
  private modalCanvas: HTMLCanvasElement;
  private modalCtx: CanvasRenderingContext2D;
  private isModalOpen: boolean = false;

  // Reference heading: the cockpit's yaw at spawn (radians)
  private referenceHeading: number | null = null;
  // Current deviation to redraw arrow on demand
  private currentDeviation: number = 0;

  // Resize listener reference (for cleanup)
  private onResizeBound!: () => void;

  // Egypt Bounding Box
  private readonly EGYPT_BOUNDS = {
    minLat: 22,
    maxLat: 32,
    minLon: 25,
    maxLon: 37
  };

  // Mansoura Coordinates
  private readonly MANSOURA_COORDS = {
    lat: 31.03637,
    lon: 31.38069
  };

  constructor(options: MiniMapOptions) {
    // ── Hidden mini-map canvas (used for modal rendering) ──────────────────
    this.container = document.createElement('div');
    this.container.id = 'game-minimap-container';
    this.setupContainer(options.width || 200, options.height || 200);

    this.canvas = document.createElement('canvas');
    this.canvas.width  = options.width  || 200;
    this.canvas.height = options.height || 200;
    this.canvas.style.display = 'block';
    this.container.appendChild(this.canvas);

    const context = this.canvas.getContext('2d');
    if (!context) throw new Error('Could not get 2D context');
    this.ctx = context;

    // ── Map image ──────────────────────────────────────────────────────────
    this.mapImage = new Image();
    this.mapImage.crossOrigin = 'anonymous';
    this.mapImage.src = options.mapImageUrl;

    this.mapImage.onload = () => {
      this.isImageLoaded = true;
      this.draw();
      if (this.isModalOpen) this.drawModal();
    };

    this.mapImage.onerror = () => {
      this.draw();
    };

    // Attach hidden map container
    const parent = options.containerId
      ? document.getElementById(options.containerId) ?? document.body
      : document.body;
    parent.appendChild(this.container);

    this.draw();

    // ── Arrow HUD ──────────────────────────────────────────────────────────
    this.arrowContainer = document.createElement('div');
    this.arrowCanvas    = document.createElement('canvas');
    const initialArrowSize      = this.getArrowSizePx();
    this.arrowCanvas.width      = initialArrowSize;
    this.arrowCanvas.height     = initialArrowSize;
    // CRITICAL: Ensure the canvas itself has the transition for smooth rotation
    this.arrowCanvas.style.transition = 'transform 0.05s linear';
    
    const aCtx = this.arrowCanvas.getContext('2d');
    if (!aCtx) throw new Error('Could not get arrow 2D context');
    this.arrowCtx = aCtx;

    this.setupArrowContainer();
    this.arrowContainer.appendChild(this.arrowCanvas);
    parent.appendChild(this.arrowContainer);

    // Draw arrow pointing straight forward initially
    this.drawArrow(0);
    this.hideArrow();

    // Click on arrow → open fullscreen modal
    this.arrowContainer.addEventListener('click', () => this.openModal());
    this.arrowContainer.style.pointerEvents = 'auto';
    this.arrowContainer.style.cursor        = 'pointer';

    // ── Responsive resize listener ─────────────────────────────────────────
    this.onResizeBound = () => {
      this.resizeArrow();
      // If modal is open, re-open at new size
      if (this.isModalOpen) {
        this.openModal();
      }
    };
    window.addEventListener('resize', this.onResizeBound);

    // ── Fullscreen Modal ───────────────────────────────────────────────────
    this.modalOverlay = document.createElement('div');
    this.modalCanvas  = document.createElement('canvas');
    const mCtx = this.modalCanvas.getContext('2d');
    if (!mCtx) throw new Error('Could not get modal 2D context');
    this.modalCtx = mCtx;

    this.setupModal();
    document.body.appendChild(this.modalOverlay);

    // DEBUG: Attach to window for manual testing
    (window as any).miniMap = this;
  }

  // ── Responsive sizing ────────────────────────────────────────────────────

  /** Returns arrow container size in px: 11vmin, clamped 52px–110px */
  private getArrowSizePx(): number {
    const vmin = Math.min(window.innerWidth, window.innerHeight);
    return Math.max(52, Math.min(110, Math.round(vmin * 0.11)));
  }

  // ── Container & Style Setup ──────────────────────────────────────────────

  private setupContainer(w: number, h: number) {
    this.container.style.position     = 'fixed';
    this.container.style.top          = '-9999px';
    this.container.style.left         = '-9999px';
    this.container.style.width        = `${w}px`;
    this.container.style.height       = `${h}px`;
    this.container.style.overflow     = 'hidden';
    this.container.style.zIndex       = '-1';
    this.container.style.pointerEvents = 'none';
  }

  private setupArrowContainer() {
    const c    = this.arrowContainer;
    const size = this.getArrowSizePx();
    // Offset from screen edge: 2.5vmin, min 12px
    const offset = Math.max(12, Math.round(Math.min(window.innerWidth, window.innerHeight) * 0.025));

    c.id = 'game-arrow-hud';
    c.style.position        = 'fixed';
    c.style.top             = `${offset}px`;
    c.style.left            = `${offset}px`;
    c.style.width           = `${size}px`;
    c.style.height          = `${size}px`;
    c.style.zIndex          = '99999';
    c.style.borderRadius    = '50%';
    c.style.background      = 'radial-gradient(circle at 35% 35%, rgba(60,20,20,0.95), rgba(25,5,5,0.98))';
    c.style.border          = '2px solid rgba(255,80,80,0.5)';
    c.style.boxShadow       = '0 0 18px rgba(220,30,30,0.4), inset 0 0 8px rgba(0,0,0,0.6)';
    c.style.display         = 'flex';
    c.style.alignItems      = 'center';
    c.style.justifyContent  = 'center';
    c.style.transition      = 'box-shadow 0.2s ease';

    // Hover glow
    c.addEventListener('mouseenter', () => {
      c.style.boxShadow = '0 0 28px rgba(255,60,60,0.8), inset 0 0 8px rgba(0,0,0,0.6)';
    });
    c.addEventListener('mouseleave', () => {
      c.style.boxShadow = '0 0 18px rgba(220,30,30,0.4), inset 0 0 8px rgba(0,0,0,0.6)';
    });
  }

  /** Reapplies responsive size to the arrow container + canvas after a resize */
  private resizeArrow(): void {
    const size   = this.getArrowSizePx();
    const offset = Math.max(12, Math.round(Math.min(window.innerWidth, window.innerHeight) * 0.025));
    const c      = this.arrowContainer;
    c.style.width  = `${size}px`;
    c.style.height = `${size}px`;
    c.style.top    = `${offset}px`;
    c.style.left   = `${offset}px`;

    // Resize the backing canvas and redraw arrow
    this.arrowCanvas.width  = size;
    this.arrowCanvas.height = size;
    this.drawArrow(this.currentDeviation);
  }

  private setupModal() {
    const o = this.modalOverlay;
    o.id                    = 'game-minimap-modal';
    o.style.position        = 'fixed';
    o.style.inset           = '0';
    o.style.background      = 'rgba(0,0,0,0.85)';
    o.style.zIndex          = '999999';
    o.style.display         = 'none';
    o.style.alignItems      = 'center';
    o.style.justifyContent  = 'center';
    o.style.flexDirection   = 'column';
    o.style.backdropFilter  = 'blur(6px)';
    o.style.cursor          = 'pointer';

    const title = document.createElement('div');
    title.id = 'game-minimap-modal-title';
    title.textContent = '◈  TACTICAL MAP  ◈';
    title.style.cssText = `
      color: rgba(255,80,80,0.9);
      font-family: 'Courier New', monospace;
      font-size: clamp(10px, 2vmin, 16px);
      letter-spacing: clamp(3px, 1vmin, 8px);
      margin-bottom: clamp(8px, 2vmin, 20px);
      text-shadow: 0 0 12px rgba(220,30,30,0.8);
    `;
    o.appendChild(title);

    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
      position: relative;
      border: 2px solid rgba(255,80,80,0.6);
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 0 40px rgba(220,30,30,0.4), inset 0 0 20px rgba(0,0,0,0.5);
    `;

    this.modalCanvas.style.display = 'block';
    wrapper.appendChild(this.modalCanvas);
    o.appendChild(wrapper);

    const hint = document.createElement('div');
    hint.textContent = 'click anywhere to close';
    hint.style.cssText = `
      color: rgba(255,255,255,0.35);
      font-family: 'Courier New', monospace;
      font-size: clamp(9px, 1.5vmin, 13px);
      letter-spacing: clamp(2px, 0.8vmin, 5px);
      margin-top: clamp(8px, 2vmin, 18px);
    `;
    o.appendChild(hint);

    o.addEventListener('click', () => this.closeModal());
  }

  // ── Arrow Drawing ────────────────────────────────────────────────────────

  private drawArrow(deviationRad: number) {
    const c   = this.arrowCanvas;
    const ctx = this.arrowCtx;
    const cx  = c.width  / 2;
    const cy  = c.height / 2;
    // Arrow size = 32% of canvas width so it scales with any canvas size
    const size = c.width * 0.32;

    ctx.clearRect(0, 0, c.width, c.height);

    ctx.save();
    ctx.translate(cx, cy);
    
    ctx.shadowBlur  = 14;
    ctx.shadowColor = 'rgba(255,80,80,0.9)';

    ctx.beginPath();
    ctx.moveTo(0,             -size);           // tip
    ctx.lineTo( size * 0.45,  size * 0.35);    // bottom-right
    ctx.lineTo(0,             size * 0.1);      // inner bottom
    ctx.lineTo(-size * 0.45,  size * 0.35);    // bottom-left
    ctx.closePath();

    const grad = ctx.createLinearGradient(0, -size, 0, size * 0.35);
    grad.addColorStop(0,   'rgba(255,120,120,1)');
    grad.addColorStop(0.5, 'rgba(220,30,30,1)');
    grad.addColorStop(1,   'rgba(120,10,10,0.7)');
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.shadowBlur    = 0;
    ctx.strokeStyle   = 'rgba(255,180,180,0.8)';
    ctx.lineWidth     = 1.5;
    ctx.stroke();

    ctx.restore();

    // Direct CSS rotation application
    const degrees = (deviationRad * 180) / Math.PI;
    this.arrowCanvas.style.transform = `rotate(${degrees}deg)`;
  }

  // ── Modal Open / Close ───────────────────────────────────────────────────

  private openModal() {
    const vmin    = Math.min(window.innerWidth, window.innerHeight);
    const ratio   = vmin < 500 ? 0.90 : 0.80;   // 90% on small/mobile, 80% on desktop
    const size    = Math.floor(vmin * ratio);
    this.modalCanvas.width  = size;
    this.modalCanvas.height = size;
    this.isModalOpen = true;
    this.drawModal();
    this.modalOverlay.style.display = 'flex';
    this.modalOverlay.style.opacity = '1';
  }

  private closeModal() {
    this.modalOverlay.style.display = 'none';
    this.isModalOpen = false;
  }

  private drawModal() {
    const w   = this.modalCanvas.width;
    const h   = this.modalCanvas.height;
    const ctx = this.modalCtx;
    ctx.clearRect(0, 0, w, h);
    if (this.isImageLoaded) ctx.drawImage(this.mapImage, 0, 0, w, h);
    const px = this.playerPos.x * w;
    const py = this.playerPos.y * h;
    
    // Player position indicator removed per user request
    
    // Arrow on big map removed per user request
  }

  // ── Public API ───────────────────────────────────────────────────────────

  public setReferenceHeading(headingRad: number) {
    this.referenceHeading = headingRad;
    console.log('[MiniMap] Reference Heading Set:', headingRad);
  }

  public showArrow() {
    if (this.arrowContainer) {
      this.arrowContainer.style.display = 'flex';
    }
  }

  public hideArrow() {
    if (this.arrowContainer) {
      this.arrowContainer.style.display = 'none';
    }
  }

  public updateHeading(headingRad: number) {
    if (this.referenceHeading === null) {
      this.referenceHeading = headingRad;
    }

    // CALCULATE DEVIATION
    // We want: Cockpit turns LEFT (CCW in Three.js) -> Arrow turns LEFT (CCW)
    // Three.js euler.y is CCW positive.
    // CSS rotate is CW positive.
    // So to make CCW rotation in Three.js result in CCW rotation in CSS, we negate.
    let deviation = -(headingRad - this.referenceHeading);
    
    // Normalize to [-PI, PI]
    while (deviation >  Math.PI) deviation -= 2 * Math.PI;
    while (deviation < -Math.PI) deviation += 2 * Math.PI;

    this.currentDeviation = deviation;
    this.drawArrow(deviation);
  }

  public updatePlayerPosition(worldX: number, worldZ: number, scale: number = 0.00005) {
    const lon = this.MANSOURA_COORDS.lon + worldX * scale;
    const lat = this.MANSOURA_COORDS.lat - worldZ * scale;
    this.playerPos.x = (lon - this.EGYPT_BOUNDS.minLon) / (this.EGYPT_BOUNDS.maxLon - this.EGYPT_BOUNDS.minLon);
    this.playerPos.y = 1 - (lat - this.EGYPT_BOUNDS.minLat) / (this.EGYPT_BOUNDS.maxLat - this.EGYPT_BOUNDS.minLat);
    this.draw();
    if (this.isModalOpen) this.drawModal();
  }

  private draw() {
    const { width, height } = this.canvas;
    this.ctx.clearRect(0, 0, width, height);
    if (this.isImageLoaded) this.ctx.drawImage(this.mapImage, 0, 0, width, height);
  }

  public dispose() {
    window.removeEventListener('resize', this.onResizeBound);
    if (this.container?.parentNode)      this.container.parentNode.removeChild(this.container);
    if (this.arrowContainer?.parentNode) this.arrowContainer.parentNode.removeChild(this.arrowContainer);
    if (this.modalOverlay?.parentNode)   this.modalOverlay.parentNode.removeChild(this.modalOverlay);
  }
}
