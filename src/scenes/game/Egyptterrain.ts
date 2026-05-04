import * as THREE from 'three';

// ============================================================
//  EgyptTerrain_UNIFORM.ts
//  Procedural sky + infinite terrain + EVEN LIGHTING
//  No dark spots - fully uniform illumination
// ============================================================

function hash(n: number): number {
  return (Math.sin(n * 127.1 + 311.7) * 43758.5453) % 1;
}

function smoothNoise2D(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);

  const a = hash(ix     + iz * 57);
  const b = hash(ix + 1 + iz * 57);
  const c = hash(ix     + (iz + 1) * 57);
  const d = hash(ix + 1 + (iz + 1) * 57);

  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

function fbm(x: number, z: number, octaves: number, lacunarity = 2.0, gain = 0.5): number {
  let value = 0, amplitude = 1, frequency = 1, max = 0;
  for (let i = 0; i < octaves; i++) {
    value    += smoothNoise2D(x * frequency, z * frequency) * amplitude;
    max      += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return value / max;
}

export function egyptHeight(wx: number, wz: number): number {
  const SCALE = 1 / 3000;
  const nx = wx * SCALE;
  const nz = wz * SCALE;

  const desert = fbm(nx, nz, 5) * 120;
  const sinaiInfluence = THREE.MathUtils.smoothstep(wx, 20000, 80000);
  const sinai = fbm(nx * 0.4 + 10, nz * 0.4, 6, 2.1, 0.55) * 1200 * sinaiInfluence;
  const deltaInfluence = THREE.MathUtils.smoothstep(-wz, 30000, 80000);
  const delta = -desert * 0.8 * deltaInfluence;
  const nileX = wx - 5000;
  const nileValley = Math.exp(-(nileX * nileX) / (8000 * 8000)) * 60;
  const raw = Math.max(0, desert + sinai + delta - nileValley);
  return raw - 3000;
}

// ============================================================
//  ProceduralSky — UNIFORM BRIGHT SKY
// ============================================================
export class ProceduralSky {
  private mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;
  private sunObject: THREE.Mesh | null = null;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.SphereGeometry(450000, 64, 32);

    this.material = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vWorldPos;
        varying vec3 vNormal;
        
        void main() {
          vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3  uSunDir;
        uniform float uTime;
        varying vec3  vWorldPos;
        varying vec3  vNormal;

        void main() {
          vec3 dir = normalize(vWorldPos);
          float height = clamp(dir.y, -1.0, 1.0);
          
          // UNIFORM SKY COLOR - no gradient, just one bright color
          vec3 skyColor = vec3(0.75, 0.85, 1.0);
          
          // Simple sun glow
          float cosAngle = dot(dir, normalize(uSunDir));
          float sunGlow = smoothstep(0.98, 0.995, cosAngle);
          vec3 sunColor = vec3(1.0, 0.95, 0.8);
          
          vec3 finalColor = skyColor + sunColor * sunGlow * 0.8;
          
          gl_FragColor = vec4(finalColor, 1.0);
        }
      `,
      uniforms: {
        uSunDir: { value: new THREE.Vector3(0.5, 0.7, -0.5).normalize() },
        uTime:   { value: 0.0 },
      },
      side: THREE.BackSide,
      depthWrite: false,
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.renderOrder = -1;
    scene.add(this.mesh);

    this.createSunObject(scene);
  }

  private createSunObject(scene: THREE.Scene): void {
    const sunGlowGeo = new THREE.SphereGeometry(15000, 32, 32);
    const sunGlowMat = new THREE.MeshBasicMaterial({
      color: 0xFFDD88,
      transparent: true,
      opacity: 0.5,
      fog: false,
    });
    const sunGlow = new THREE.Mesh(sunGlowGeo, sunGlowMat);
    sunGlow.renderOrder = -0.5;
    scene.add(sunGlow);

    const sunDiskGeo = new THREE.SphereGeometry(8000, 32, 32);
    const sunDiskMat = new THREE.MeshBasicMaterial({
      color: 0xFFEEAA,
      fog: false,
    });
    const sunDisk = new THREE.Mesh(sunDiskGeo, sunDiskMat);
    sunDisk.renderOrder = -0.4;
    scene.add(sunDisk);

    this.sunObject = sunGlow;
    this.sunObject.userData.diskMesh = sunDisk;
  }

  update(camera: THREE.Camera, deltaTime: number): void {
    this.mesh.position.copy(camera.position);
    this.material.uniforms.uTime.value += deltaTime;

    if (this.sunObject) {
      const sunDir = this.material.uniforms.uSunDir.value as THREE.Vector3;
      const sunPos = sunDir.clone().multiplyScalar(300000).add(camera.position);
      this.sunObject.position.copy(sunPos);
      if (this.sunObject.userData.diskMesh) {
        this.sunObject.userData.diskMesh.position.copy(sunPos);
      }
    }
  }

  setTimeOfDay(t: number): void {
    const angle  = (t * Math.PI * 2) - Math.PI / 2;
    const sunDir = new THREE.Vector3(
      Math.cos(angle) * 0.7,
      Math.sin(angle) * 0.8,
      Math.sin(angle) * 0.3
    ).normalize();
    this.material.uniforms.uSunDir.value.copy(sunDir);
  }

  setSunDirection(sunDir: THREE.Vector3): void {
    this.material.uniforms.uSunDir.value.copy(sunDir.normalize());
  }
}

// ============================================================
//  InfiniteTerrain — UNIFORM BRIGHT TEXTURE
// ============================================================
const CHUNK_SIZE  = 8000;
const CHUNK_SEGS  = 128;
const VIEW_RADIUS = 2;

interface Chunk {
  mesh: THREE.Mesh;
  cx: number;
  cz: number;
}

export class InfiniteTerrain {
  private scene: THREE.Scene;
  private chunks: Map<string, Chunk> = new Map();
  private material: THREE.MeshStandardMaterial;
  private lastCX = Infinity;
  private lastCZ = Infinity;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // UNIFORM MATERIAL - no lighting variation, full brightness
    this.material = new THREE.MeshStandardMaterial({
      color: 0xD2B48C,  // Sandy color
      emissive: 0xC8A86C,  // Emissive to keep everything bright
      emissiveIntensity: 0.6,  // High emissive = no dark spots
      roughness: 0.8,
      metalness: 0.1,
      flatShading: false,
    });

    // Load sand texture for more detail
    const loader = new THREE.TextureLoader();
    loader.load(
      '/images/sand-dune-texture-background.jpg',
      (tex) => {
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(32, 32);
        tex.anisotropy = 16;
        this.material.map = tex;
        this.material.needsUpdate = true;
      },
      undefined,
      (err) => {
        console.warn('[InfiniteTerrain] Could not load texture — using fallback color.', err);
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
    const geo = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, CHUNK_SEGS, CHUNK_SEGS);
    geo.rotateX(-Math.PI / 2);

    const positions = geo.attributes.position as THREE.BufferAttribute;

    for (let i = 0; i < positions.count; i++) {
      const wx = positions.getX(i) + cx * CHUNK_SIZE;
      const wz = positions.getZ(i) + cz * CHUNK_SIZE;
      positions.setY(i, egyptHeight(wx, wz));
    }

    positions.needsUpdate = true;
    geo.computeVertexNormals();

    // Force all normals to point straight up for uniform lighting
    const normals = geo.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < normals.count; i++) {
      normals.setXYZ(i, 0, 1, 0);
    }
    normals.needsUpdate = true;

    const mesh = new THREE.Mesh(geo, this.material);
    mesh.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
    mesh.receiveShadow = false;
    mesh.castShadow = false;

    this.scene.add(mesh);
    this.chunks.set(key, { mesh, cx, cz });
  }

  getHeightAt(x: number, z: number): number {
    return egyptHeight(x, z);
  }

  getMinCameraHeight(x: number, z: number, minClearance = 80): number {
    return egyptHeight(x, z) + minClearance;
  }
}

// ============================================================
//  DistanceFog — LIGHT UNIFORM FOG
// ============================================================
export function setupFog(scene: THREE.Scene): void {
  // Very light fog - barely visible
  scene.fog = new THREE.FogExp2(0xC8D8E8, 0.000012);
  scene.background = new THREE.Color(0xC8D8E8);
}

// ============================================================
//  Lighting — FULLY UNIFORM (no directional shadows)
// ============================================================
export function setupLighting(scene: THREE.Scene): {
  sun: THREE.DirectionalLight;
  ambient: THREE.AmbientLight;
} {
  // Very bright ambient light - this eliminates all dark spots
  const ambient = new THREE.AmbientLight(0xFFFFFF, 1.2);
  scene.add(ambient);

  // Soft fill light from below
  const fillUp = new THREE.PointLight(0xDDCCAA, 0.8);
  fillUp.position.set(0, -1000, 0);
  scene.add(fillUp);

  // Additional fill light from all directions
  const fillLight1 = new THREE.PointLight(0xCCDDFF, 0.5);
  fillLight1.position.set(10000, 5000, 10000);
  scene.add(fillLight1);

  const fillLight2 = new THREE.PointLight(0xCCDDFF, 0.5);
  fillLight2.position.set(-10000, 5000, -10000);
  scene.add(fillLight2);

  const fillLight3 = new THREE.PointLight(0xDDCCAA, 0.5);
  fillLight3.position.set(10000, 5000, -10000);
  scene.add(fillLight3);

  const fillLight4 = new THREE.PointLight(0xDDCCAA, 0.5);
  fillLight4.position.set(-10000, 5000, 10000);
  scene.add(fillLight4);

  // Directional light for subtle direction (not strong enough to cause shadows)
  const sun = new THREE.DirectionalLight(0xFFEECC, 0.6);
  sun.position.set(60000, 100000, -80000);
  sun.castShadow = false;
  sun.matrixAutoUpdate = false;
  sun.updateMatrix();
  scene.add(sun);

  return { sun, ambient };
}

// ============================================================
//  Settings UI
// ============================================================
export class SettingsUI {
  private container: HTMLDivElement;
  private isOpen: boolean = false;
  private settings: {
    sunBrightness: number;
    fogDensity: number;
    ambientLight: number;
  } = {
    sunBrightness: 1.0,
    fogDensity:    1.0,
    ambientLight:  1.0,
  };

  constructor(
    scene: THREE.Scene,
    terrain: InfiniteTerrain,
    sky: ProceduralSky,
    lights: { sun: THREE.DirectionalLight; ambient: THREE.AmbientLight }
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
          background: rgba(80,80,80,0.8);
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
          background: rgba(100,100,100,0.9);
          transform: rotate(20deg);
        }
        .settings-panel {
          display: none;
          position: absolute;
          top: 70px;
          right: 0;
          background: rgba(40,40,40,0.95);
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
        }
        .settings-slider::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: rgba(255,221,68,0.9);
          cursor: pointer;
          border: none;
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
          <input type="range" class="settings-slider" id="sun-brightness" min="0.3" max="1.5" step="0.1" value="0.6">
          <span class="settings-value" id="sun-brightness-value">0.6x</span>
        </div>
        <div class="settings-item">
          <label class="settings-label">Fog Density</label>
          <input type="range" class="settings-slider" id="fog-density" min="0.3" max="2.0" step="0.1" value="1.0">
          <span class="settings-value" id="fog-density-value">1.0x</span>
        </div>
        <div class="settings-item">
          <label class="settings-label">Ambient Light</label>
          <input type="range" class="settings-slider" id="ambient-light" min="0.8" max="1.5" step="0.1" value="1.2">
          <span class="settings-value" id="ambient-light-value">1.2x</span>
        </div>
      </div>
    `;
    return container;
  }

  private setupEventListeners(
    scene: THREE.Scene,
    terrain: InfiniteTerrain,
    sky: ProceduralSky,
    lights: { sun: THREE.DirectionalLight; ambient: THREE.AmbientLight }
  ): void {
    const button = this.container.querySelector('.settings-button') as HTMLButtonElement;
    const panel  = this.container.querySelector('.settings-panel') as HTMLDivElement;

    button.addEventListener('click', () => {
      this.isOpen = !this.isOpen;
      panel.classList.toggle('open');
    });

    const bind = (
      id: string,
      valueId: string,
      onChange: (v: number) => void
    ) => {
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
      lights.sun.intensity = 0.6 * v;
    });
    bind('fog-density', 'fog-density-value', (v) => {
      this.settings.fogDensity = v;
      if (scene.fog instanceof THREE.FogExp2) {
        scene.fog.density = 0.000012 * v;
      }
    });
    bind('ambient-light', 'ambient-light-value', (v) => {
      this.settings.ambientLight = v;
      lights.ambient.intensity = 1.2 * v;
    });
  }

  getSettings() {
    return this.settings;
  }
}