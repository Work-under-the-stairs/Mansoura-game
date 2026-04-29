import * as THREE from 'three';

export interface MiniMapOptions {
  width?: number;
  height?: number;
  mapImageUrl: string;
  playerColor?: string;
  containerId?: string; // Optional: attach to a specific element
}

export class MiniMap {
  private container: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private mapImage: HTMLImageElement;
  private playerPos: { x: number; y: number } = { x: 0.5, y: 0.5 };
  private isImageLoaded: boolean = false;
  
  // Egypt Bounding Box (Approximate for mapping)
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
    this.container = document.createElement('div');
    this.container.id = 'game-minimap-container';
    this.setupContainer(options.width || 200, options.height || 200);
    
    this.canvas = document.createElement('canvas');
    this.canvas.width = options.width || 200;
    this.canvas.height = options.height || 200;
    this.canvas.style.display = 'block';
    this.container.appendChild(this.canvas);
    
    const context = this.canvas.getContext('2d');
    if (!context) throw new Error('Could not get 2D context');
    this.ctx = context;

    this.mapImage = new Image();
    this.mapImage.crossOrigin = "anonymous"; // Handle potential CORS issues
    this.mapImage.src = options.mapImageUrl;
    
    this.mapImage.onload = () => {
      console.log('MiniMap: Image loaded successfully');
      this.isImageLoaded = true;
      this.draw();
    };

    this.mapImage.onerror = (err) => {
      console.error('MiniMap: Failed to load map image', err);
      this.draw(); // Draw fallback even if image fails
    };

    // Append to body or specific container
    if (options.containerId) {
      const parent = document.getElementById(options.containerId);
      if (parent) {
        parent.appendChild(this.container);
      } else {
        document.body.appendChild(this.container);
      }
    } else {
      document.body.appendChild(this.container);
    }

    this.draw();
  }

  private setupContainer(w: number, h: number) {
    // Use fixed positioning to ensure it stays on top of the game canvas
    this.container.style.position = 'fixed';
    this.container.style.top = '20px';
    this.container.style.left = '20px'; // Moved to the left side as requested
    this.container.style.width = `${w}px`;
    this.container.style.height = `${h}px`;
    this.container.style.border = '3px solid rgba(255, 255, 255, 0.8)';
    this.container.style.borderRadius = '10px';
    this.container.style.boxShadow = '0 0 15px rgba(0, 0, 0, 0.5)';
    this.container.style.overflow = 'hidden';
    this.container.style.backgroundColor = 'rgba(20, 20, 20, 0.8)';
    this.container.style.zIndex = '99999'; // Extremely high z-index to stay on top
    this.container.style.pointerEvents = 'none'; // Don't block clicks to the game
  }

  public updatePlayerPosition(worldX: number, worldZ: number, scale: number = 0.00005) {
    // Convert game coordinates to Lat/Lon relative to Mansoura
    // Note: Adjust scale based on your world size
    const lon = this.MANSOURA_COORDS.lon + (worldX * scale);
    const lat = this.MANSOURA_COORDS.lat - (worldZ * scale);

    // Normalize to 0-1 within Egypt bounds
    this.playerPos.x = (lon - this.EGYPT_BOUNDS.minLon) / (this.EGYPT_BOUNDS.maxLon - this.EGYPT_BOUNDS.minLon);
    this.playerPos.y = 1 - (lat - this.EGYPT_BOUNDS.minLat) / (this.EGYPT_BOUNDS.maxLat - this.EGYPT_BOUNDS.minLat);

    // Clamp values
    this.playerPos.x = Math.max(0, Math.min(1, this.playerPos.x));
    this.playerPos.y = Math.max(0, Math.min(1, this.playerPos.y));

    this.draw();
  }

  private draw() {
    const { width, height } = this.canvas;
    this.ctx.clearRect(0, 0, width, height);

    // Draw Background/Map
    if (this.isImageLoaded) {
      this.ctx.drawImage(this.mapImage, 0, 0, width, height);
    } else {
      // Fallback background if image is missing
      this.ctx.fillStyle = '#1a3a5a';
      this.ctx.fillRect(0, 0, width, height);
      this.ctx.strokeStyle = '#ffffff';
      this.ctx.strokeRect(5, 5, width - 10, height - 10);
      this.ctx.fillStyle = 'white';
      this.ctx.font = '12px Arial';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('Loading Map...', width / 2, height / 2);
    }

    // Draw Grid Lines (Optional, for better orientation)
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    this.ctx.lineWidth = 1;
    for(let i = 1; i < 4; i++) {
      this.ctx.beginPath();
      this.ctx.moveTo((i * width) / 4, 0);
      this.ctx.lineTo((i * width) / 4, height);
      this.ctx.stroke();
      this.ctx.beginPath();
      this.ctx.moveTo(0, (i * height) / 4);
      this.ctx.lineTo(width, (i * height) / 4);
      this.ctx.stroke();
    }

    // Draw Player Position (Small Square)
    const markerSize = 10;
    const px = this.playerPos.x * width;
    const py = this.playerPos.y * height;

    // Draw a glow effect for the player
    const gradient = this.ctx.createRadialGradient(px, py, 2, px, py, markerSize);
    gradient.addColorStop(0, 'rgba(255, 0, 0, 1)');
    gradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
    this.ctx.fillStyle = gradient;
    this.ctx.beginPath();
    this.ctx.arc(px, py, markerSize, 0, Math.PI * 2);
    this.ctx.fill();

    // Draw the actual square
    this.ctx.fillStyle = '#ff0000';
    this.ctx.strokeStyle = '#ffffff';
    this.ctx.lineWidth = 2;
    this.ctx.fillRect(px - 4, py - 4, 8, 8);
    this.ctx.strokeRect(px - 4, py - 4, 8, 8);
    
    // Label for Mansoura
    const mX = ((this.MANSOURA_COORDS.lon - this.EGYPT_BOUNDS.minLon) / (this.EGYPT_BOUNDS.maxLon - this.EGYPT_BOUNDS.minLon)) * width;
    const mY = (1 - (this.MANSOURA_COORDS.lat - this.EGYPT_BOUNDS.minLat) / (this.EGYPT_BOUNDS.maxLat - this.EGYPT_BOUNDS.minLat)) * height;
    
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    this.ctx.font = 'bold 10px Arial';
    this.ctx.textAlign = 'left';
    this.ctx.fillText('MANSOURA', mX + 5, mY + 3);
    
    // Draw a small dot for Mansoura
    this.ctx.fillStyle = '#00ff00';
    this.ctx.beginPath();
    this.ctx.arc(mX, mY, 3, 0, Math.PI * 2);
    this.ctx.fill();
  }

  public setVisible(visible: boolean) {
    this.container.style.display = visible ? 'block' : 'none';
  }

  public dispose() {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}
