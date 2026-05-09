import * as THREE from 'three';
import { MiniMap } from './MiniMap';

// ============================================================
//  EgyptTerrain_DETAILED.ts
//  Procedural sky + FLAT infinite terrain + TEXTURE-MAPPED GROUND
//  + MiniMap integrated here (World.ts no longer needed)
// ============================================================

// ============================================================
//  ProceduralSky — simple gradient sky texture + plain sun circle
//  No ShaderMaterial, no SphereGeometry artifacts
// ============================================================
export class ProceduralSky {
  private scene: THREE.Scene;
  private sunMesh: THREE.Mesh;
  // Sun world position (fixed, far away)
  private readonly SUN_DISTANCE = 300000;
  private sunWorldPos = new THREE.Vector3(80000, 160000, -200000).normalize();

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // ── 1. Sky: canvas gradient baked into a CubeRenderTarget background ──
    //    Simplest approach: just set scene.background to a gradient texture
    this.buildGradientBackground();

    // ── 2. Sun: plain white emissive circle, no transparency tricks ──
    const sunGeo = new THREE.CircleGeometry(10000, 48);
    const sunMat = new THREE.MeshBasicMaterial({
      color:     0xFFFDE8,
      fog:       false,
      depthTest: false,   // always on top of sky
      depthWrite: false,
    });
    this.sunMesh = new THREE.Mesh(sunGeo, sunMat);
    this.sunMesh.renderOrder = -1;

    // Position sun far away in a fixed direction
    const sunPos = new THREE.Vector3(0.3, 0.55, -0.6).normalize().multiplyScalar(this.SUN_DISTANCE);
    this.sunMesh.position.copy(sunPos);
    this.sunWorldPos.copy(sunPos);

    // Make it always face the camera (billboard)
    scene.add(this.sunMesh);
  }

  private buildGradientBackground(): void {
    // Draw a vertical gradient on a canvas: horizon (light blue) → zenith (deep blue)
    const W = 2, H = 512;
    const canvas = document.createElement('canvas');
    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;

    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0.0,  '#3a7bd5'); // zenith — deep blue
    grad.addColorStop(0.55, '#6aaee8'); // mid sky
    grad.addColorStop(0.80, '#a8d0ef'); // near horizon
    grad.addColorStop(1.0,  '#c8e0f0'); // horizon haze
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    const tex = new THREE.CanvasTexture(canvas);
    tex.mapping = THREE.UVMapping;

    // Use a large skybox quad approach: set scene.background directly
    this.scene.background = tex;
  }

  update(camera: THREE.Camera, _deltaTime: number): void {
    // Sun always faces camera (billboard)
    this.sunMesh.lookAt(camera.position);
  }

  setTimeOfDay(_t: number): void { /* no-op for simple sky */ }
  setSunDirection(_sunDir: THREE.Vector3): void { /* no-op for simple sky */ }
}

// ============================================================
//  InfiniteTerrain — FLAT texture-mapped ground (no height variation)
// ============================================================
const CHUNK_SIZE  = 8000;
const CHUNK_SEGS  = 1;      // ✅ 1 segment only — perfectly flat, no bumps
const VIEW_RADIUS = 2;

interface Chunk {
  mesh: THREE.Mesh;
  cx: number;
  cz: number;
}

export class InfiniteTerrain {
  private scene: THREE.Scene;
  private chunks: Map<string, Chunk> = new Map();
  private material: THREE.ShaderMaterial;
  private lastCX = Infinity;
  private lastCZ = Infinity;
  private readonly FLAT_Y = -3000; // constant ground level

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    this.material = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec2 vUv;

        #include <fog_pars_vertex>

        void main() {
          vNormal   = normalize(normalMatrix * normal);
          vPosition = position;
          vUv       = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);

          #include <fog_vertex>
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec2 vUv;

        uniform vec3      uSunDir;
        uniform sampler2D uSandTexture;
        uniform int       uTextureLoaded;

        #include <fog_pars_fragment>

        void main() {
          vec3 texColor;

          if (uTextureLoaded == 1) {
            texColor = texture2D(uSandTexture, vUv).rgb;
          } else {
            // Fallback sand color while texture loads
            texColor = vec3(0.93, 0.85, 0.54);
          }

          float ambient = 0.5;
          float diffuse = 0.8;
          float light   = ambient + diffuse * 0.7;

          vec3 finalColor = texColor * light;
          gl_FragColor    = vec4(finalColor, 1.0);

          #include <fog_fragment>
        }
      `,
      uniforms: {
        uSunDir:        { value: new THREE.Vector3(0.3, 0.6, -0.5).normalize() },
        uSandTexture:   { value: null },
        uTextureLoaded: { value: 0 },
      },
      side: THREE.FrontSide,
    });

    // Load sand/ground texture
    const loader = new THREE.TextureLoader();
    loader.load(
      '/images/gg.png',
      (tex) => {
        tex.wrapS      = THREE.RepeatWrapping;
        tex.wrapT      = THREE.RepeatWrapping;
        tex.repeat.set(1, 1);
        tex.anisotropy = 16;
        this.material.uniforms.uSandTexture.value   = tex;
        this.material.uniforms.uTextureLoaded.value = 1;
      },
      undefined,
      (err) => {
        console.warn('[InfiniteTerrain] Could not load /images/gg.png — using fallback color.', err);
      }
    );
  }

  update(cameraWorldPos: THREE.Vector3): void {
    const cx = Math.round(cameraWorldPos.x / CHUNK_SIZE);
    const cz = Math.round(cameraWorldPos.z / CHUNK_SIZE);

    if (cx === this.lastCX && cz === this.lastCZ) return;
    this.lastCX = cx;
    this.lastCZ = cz;

    for (let dx = -VIEW_RADIUS; dx <= VIEW_RADIUS; dx++) {
      for (let dz = -VIEW_RADIUS; dz <= VIEW_RADIUS; dz++) {
        const key = `${cx + dx},${cz + dz}`;
        if (!this.chunks.has(key)) {
          this.buildChunk(cx + dx, cz + dz, key);
        }
      }
    }

    this.chunks.forEach((chunk, key) => {
      if (
        Math.abs(chunk.cx - cx) > VIEW_RADIUS + 1 ||
        Math.abs(chunk.cz - cz) > VIEW_RADIUS + 1
      ) {
        this.scene.remove(chunk.mesh);
        chunk.mesh.geometry.dispose();
        this.chunks.delete(key);
      }
    });
  }

  private buildChunk(cx: number, cz: number, key: string): void {
    // ✅ FLAT plane — 1 segment, no height displacement at all
    const geo = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, CHUNK_SEGS, CHUNK_SEGS);
    geo.rotateX(-Math.PI / 2);

    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, this.material);
    // ✅ All chunks sit at the same flat Y level
    mesh.position.set(cx * CHUNK_SIZE, this.FLAT_Y, cz * CHUNK_SIZE);

    this.scene.add(mesh);
    this.chunks.set(key, { mesh, cx, cz });
  }

  /** Always returns the flat ground level */
  getHeightAt(_x: number, _z: number): number {
    return this.FLAT_Y;
  }

  /** Returns flat ground level + clearance */
  getMinCameraHeight(_x: number, _z: number, minClearance = 80): number {
    return this.FLAT_Y + minClearance;
  }

  setSunDirection(sunDir: THREE.Vector3): void {
    this.material.uniforms.uSunDir.value.copy(sunDir.normalize());
  }
}

// ============================================================
//  DistanceFog
// ============================================================
export function setupFog(scene: THREE.Scene): void {
  // ✅ fog color matches horizon — do NOT set scene.background here
  //    (ProceduralSky sets the gradient background in its constructor)
  scene.fog = new THREE.FogExp2(0xC8E0F0, 0.000025);
}

// ============================================================
//  Lighting — شمس مصر ١٩٧٣
// ============================================================
export function setupLighting(scene: THREE.Scene): {
  sun: THREE.DirectionalLight;
  ambient: THREE.AmbientLight;
} {
  const ambient = new THREE.AmbientLight(0xFFFFFF, 2);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xFFEECC, 3.0);
  sun.position.set(60000, 100000, -80000);
  sun.castShadow       = false;
  sun.matrixAutoUpdate = false;
  sun.updateMatrix();
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0xCCDDEE, 0.5);
  fill.position.set(-60000, 50000, 80000);
  fill.castShadow       = false;
  fill.matrixAutoUpdate = false;
  fill.updateMatrix();
  scene.add(fill);

  return { sun, ambient };
}

// ============================================================
//  EgyptWorld — replaces World.ts, owns sky + terrain + MiniMap
// ============================================================
export class EgyptWorld {
  private sky: ProceduralSky;
  private terrain: InfiniteTerrain;
  private miniMap?: MiniMap;

  constructor(scene: THREE.Scene, mapImageUrl?: string) {
    this.sky     = new ProceduralSky(scene);
    this.terrain = new InfiniteTerrain(scene);

    const mapUrl = mapImageUrl || '/images/map-Picsart-AiImageEnhancer.png';
    this.miniMap = new MiniMap({
      mapImageUrl: mapUrl,
      width:  500,
      height: 200,
    });
  }

  /**
   * Call each frame from your main loop.
   * @param deltaTime    Seconds since last frame.
   * @param camera       Active camera (used to follow sky dome).
   * @param playerPos    World-space position for minimap.
   * @param playerYaw    Current yaw in radians for minimap arrow.
   */
  update(
    deltaTime: number,
    camera: THREE.Camera,
    playerPos?: THREE.Vector3,
    playerYaw?: number
  ): void {
    this.sky.update(camera, deltaTime);
    this.terrain.update(camera.position);

    if (this.miniMap) {
      if (playerPos)            this.miniMap.updatePlayerPosition(playerPos.x, playerPos.z);
      if (playerYaw !== undefined) this.miniMap.updateHeading(playerYaw);
    }
  }

  getSky():     ProceduralSky    { return this.sky;     }
  getTerrain(): InfiniteTerrain  { return this.terrain; }

  dispose(): void {
    if (this.miniMap) this.miniMap.dispose();
  }
}

// ============================================================
//  Settings UI
// ============================================================
export class SettingsUI {
  private container: HTMLDivElement;
  private isOpen: boolean = false;
  private settings: {
    terrainDetail: number;
    sunBrightness: number;
    fogDensity:    number;
    ambientLight:  number;
  } = {
    terrainDetail: 1.0,
    sunBrightness: 1.0,
    fogDensity:    1.0,
    ambientLight:  1.0,
  };

  constructor(
    scene:   THREE.Scene,
    terrain: InfiniteTerrain,
    sky:     ProceduralSky,
    lights:  { sun: THREE.DirectionalLight; ambient: THREE.AmbientLight }
  ) {
    this.container = this.createUI();
    document.body.appendChild(this.container);
    this.setupEventListeners(scene, terrain, sky, lights);
  }

  private createUI(): HTMLDivElement {
    const container = document.createElement('div');
    container.id = 'settings-ui';
    container.innerHTML = `
      <style>
        #settings-ui {
          position: fixed;
          top: 20px;
          right: 20px;
          font-family: Arial, sans-serif;
          z-index: 1000;
        }
        .settings-button {
          width: 50px;
          height: 50px;
          border-radius: 50%;
          background: rgba(100,100,100,0.8);
          border: 2px solid rgba(200,200,200,0.9);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 28px;
          color: rgba(220,220,220,0.9);
          transition: all 0.3s ease;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }
        .settings-button:hover {
          background: rgba(120,120,120,0.9);
          transform: rotate(20deg);
        }
        .settings-panel {
          display: none;
          position: absolute;
          top: 70px;
          right: 0;
          background: rgba(50,50,50,0.95);
          border: 2px solid rgba(150,150,150,0.8);
          border-radius: 8px;
          padding: 20px;
          width: 250px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.5);
          color: rgba(220,220,220,0.95);
        }
        .settings-panel.open { display: block; }
        .settings-item { margin-bottom: 15px; }
        .settings-label {
          display: block;
          font-size: 12px;
          margin-bottom: 5px;
          font-weight: bold;
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        .settings-slider {
          width: 100%;
          height: 6px;
          border-radius: 3px;
          background: rgba(100,100,100,0.8);
          outline: none;
          -webkit-appearance: none;
          appearance: none;
        }
        .settings-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: rgba(255,221,68,0.9);
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(0,0,0,0.4);
        }
        .settings-slider::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: rgba(255,221,68,0.9);
          cursor: pointer;
          border: none;
          box-shadow: 0 2px 6px rgba(0,0,0,0.4);
        }
        .settings-value {
          display: inline-block;
          float: right;
          font-size: 12px;
          color: rgba(255,221,68,0.9);
          font-weight: bold;
        }
      </style>

      <button class="settings-button" title="Settings">⚙️</button>
      <div class="settings-panel">
        <div class="settings-item">
          <label class="settings-label">Sun Brightness</label>
          <input type="range" class="settings-slider" id="sun-brightness" min="0.5" max="2.0" step="0.1" value="1.0">
          <span class="settings-value" id="sun-brightness-value">1.0x</span>
        </div>
        <div class="settings-item">
          <label class="settings-label">Fog Density</label>
          <input type="range" class="settings-slider" id="fog-density" min="0.5" max="2.0" step="0.1" value="1.0">
          <span class="settings-value" id="fog-density-value">1.0x</span>
        </div>
        <div class="settings-item">
          <label class="settings-label">Ambient Light</label>
          <input type="range" class="settings-slider" id="ambient-light" min="0.3" max="1.5" step="0.1" value="1.0">
          <span class="settings-value" id="ambient-light-value">1.0x</span>
        </div>
      </div>
    `;
    return container;
  }

  private setupEventListeners(
    scene:   THREE.Scene,
    _terrain: InfiniteTerrain,
    _sky:    ProceduralSky,
    lights:  { sun: THREE.DirectionalLight; ambient: THREE.AmbientLight }
  ): void {
    const button = this.container.querySelector('.settings-button') as HTMLButtonElement;
    const panel  = this.container.querySelector('.settings-panel') as HTMLDivElement;

    button.addEventListener('click', () => {
      this.isOpen = !this.isOpen;
      panel.classList.toggle('open');
    });

    const bind = (id: string, valueId: string, onChange: (v: number) => void) => {
      const slider = this.container.querySelector(`#${id}`) as HTMLInputElement;
      const label  = this.container.querySelector(`#${valueId}`) as HTMLSpanElement;
      slider.addEventListener('input', (e) => {
        const v = parseFloat((e.target as HTMLInputElement).value);
        label.textContent = v.toFixed(1) + 'x';
        onChange(v);
      });
    };

    bind('sun-brightness', 'sun-brightness-value', (v) => {
      this.settings.sunBrightness = v;
      lights.sun.intensity = 3.0 * v;
    });
    bind('fog-density', 'fog-density-value', (v) => {
      this.settings.fogDensity = v;
      if (scene.fog instanceof THREE.FogExp2) scene.fog.density = 0.000025 * v;
    });
    bind('ambient-light', 'ambient-light-value', (v) => {
      this.settings.ambientLight  = v;
      lights.ambient.intensity = 2.0 * v;
    });
  }

  getSettings() { return this.settings; }
}