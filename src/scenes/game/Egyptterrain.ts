import * as THREE from 'three';

// ============================================================
//  EgyptTerrain_DETAILED.ts
//  Procedural sky + infinite terrain + DETAILED TEXTURES + SETTINGS UI
//  مصر ١٩٧٣: دلتا النيل + الصحراء + سيناء
//  ✅ HIGH-DETAIL TEXTURES + SETTINGS ICON + FINE-GRAINED SURFACE
// ============================================================

// ---------- Simple Perlin / Value Noise (no dependencies) ----------
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

// ✅ DETAIL NOISE - fine-grained surface texture
function detailNoise(x: number, z: number): number {
  return fbm(x, z, 8, 2.2, 0.45) * 0.5 + fbm(x * 3.5, z * 3.5, 6, 2.0, 0.5) * 0.3;
}

// ---------- Terrain height function — tuned for Egypt ----------
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
//  ProceduralSky — BLUE SKY + VISIBLE SUN
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

        float rayleigh(float cosAngle) {
          return 0.75 * (1.0 + cosAngle * cosAngle);
        }

        float mie(float cosAngle, float g) {
          float g2 = g * g;
          return (1.0 - g2) / pow(max(1.0 + g2 - 2.0 * g * cosAngle, 0.001), 1.5);
        }

        void main() {
          vec3  dir     = normalize(vWorldPos);
          float height  = clamp(dir.y, -1.0, 1.0);
          float cosAngle = dot(dir, normalize(uSunDir));

          // ✅ BLUE SKY GRADIENT
          vec3 zenith  = vec3(0.2, 0.5, 0.9);      // Deep blue at top
          vec3 horizon = vec3(0.7, 0.85, 1.0);     // Light blue at horizon
          vec3 haze    = vec3(0.85, 0.9, 0.95);    // Very light blue near ground

          // Smooth transition from horizon to zenith
          float t = pow(max(height, 0.0), 0.4);
          vec3 sky = mix(mix(haze, horizon, smoothstep(-0.1, 0.15, height)), zenith, t);

          // Rayleigh scattering (blue light)
          sky *= 1.0 + rayleigh(cosAngle) * 0.3;

          // ✅ VISIBLE SUN - bright and prominent
          float sunGlow   = mie(cosAngle, 0.9997);
          float sunCorona = mie(cosAngle, 0.985) * 0.5;
          vec3  sunColor  = vec3(1.0, 0.95, 0.7);  // Warm yellow sun
          
          // Add sun disk
          float sunDisk = smoothstep(0.02, 0.015, acos(cosAngle) / 3.14159);
          sky += sunColor * (sunGlow * 0.3 + sunCorona * 0.15 + sunDisk * 2.0);

          // Smooth transition to ground at horizon
          float groundBlend = smoothstep(-0.2, 0.08, height);
          vec3 groundColor = vec3(0.8, 0.75, 0.65);
          sky = mix(groundColor, sky, groundBlend);

          // Tone mapping
          sky = sky / (sky + vec3(1.0));
          sky = pow(sky, vec3(1.0 / 2.2));

          gl_FragColor = vec4(sky, 1.0);
        }
      `,
      uniforms: {
        uSunDir: { value: new THREE.Vector3(0.3, 0.6, -0.5).normalize() },
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
      color: 0xFFDD44,
      transparent: true,
      opacity: 0.6,
      fog: false,
    });
    const sunGlow = new THREE.Mesh(sunGlowGeo, sunGlowMat);
    sunGlow.renderOrder = -0.5;
    scene.add(sunGlow);

    const sunDiskGeo = new THREE.SphereGeometry(8000, 32, 32);
    const sunDiskMat = new THREE.MeshBasicMaterial({
      color: 0xFFEE99,
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
    const sunDir = new THREE.Vector3(Math.cos(angle) * 0.7, Math.sin(angle) * 0.8, Math.sin(angle) * 0.3).normalize();
    this.material.uniforms.uSunDir.value.copy(sunDir);
  }

  setSunDirection(sunDir: THREE.Vector3): void {
    this.material.uniforms.uSunDir.value.copy(sunDir.normalize());
  }
}

// ============================================================
//  InfiniteTerrain — chunks تتولد مع الطيارة
//  ✅ HIGH-DETAIL PROCEDURAL TEXTURES
// ============================================================
const CHUNK_SIZE   = 8000;
const CHUNK_SEGS   = 128;  // ✅ INCREASED FOR DETAIL
const VIEW_RADIUS  = 2;

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

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // ✅ CUSTOM SHADER FOR DETAILED TEXTURES
    this.material = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec3 vColor;
        
        attribute vec3 color;
        
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vPosition = position;
          vColor = color;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec3 vColor;
        
        uniform vec3 uSunDir;
        
        // ✅ PROCEDURAL DETAIL TEXTURE
        float hash(vec3 p) {
          return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
        }
        
        float noise(vec3 p) {
          vec3 i = floor(p);
          vec3 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          
          float n000 = hash(i);
          float n100 = hash(i + vec3(1.0, 0.0, 0.0));
          float n010 = hash(i + vec3(0.0, 1.0, 0.0));
          float n110 = hash(i + vec3(1.0, 1.0, 0.0));
          
          float nx0 = mix(n000, n100, f.x);
          float nx1 = mix(n010, n110, f.x);
          return mix(nx0, nx1, f.y);
        }
        
        float fbm(vec3 p) {
          float value = 0.0;
          float amplitude = 1.0;
          float frequency = 1.0;
          
          for(int i = 0; i < 6; i++) {
            value += amplitude * noise(p * frequency);
            amplitude *= 0.5;
            frequency *= 2.0;
          }
          return value;
        }
        
        void main() {
          // ✅ BASE COLOR FROM HEIGHT
          vec3 baseColor = vColor;
          
          // ✅ FINE-GRAINED DETAIL TEXTURE
          vec3 detailPos = vPosition * 0.01;
          float detail = fbm(detailPos);
          float fineDetail = fbm(detailPos * 3.0) * 0.3;
          
          // Blend detail with base color
          vec3 detailColor = mix(baseColor * 0.8, baseColor * 1.2, detail);
          detailColor = mix(detailColor * 0.9, detailColor * 1.1, fineDetail);
          
          // ✅ LIGHTING
          float diffuse = max(0.3, dot(vNormal, normalize(uSunDir)));
          float ambient = 0.5;
          float light = ambient + diffuse * 0.7;
          
          // ✅ SPECULAR HIGHLIGHTS (sand sparkle)
          vec3 viewDir = normalize(-vPosition);
          vec3 halfDir = normalize(normalize(uSunDir) + viewDir);
          float specular = pow(max(0.0, dot(vNormal, halfDir)), 16.0) * 0.3;
          
          vec3 finalColor = detailColor * light + vec3(1.0) * specular;
          
          gl_FragColor = vec4(finalColor, 1.0);
        }
      `,
      uniforms: {
        uSunDir: { value: new THREE.Vector3(0.3, 0.6, -0.5).normalize() },
      },
      side: THREE.FrontSide,
    });
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
      if (Math.abs(chunk.cx - cx) > VIEW_RADIUS + 1 ||
          Math.abs(chunk.cz - cz) > VIEW_RADIUS + 1) {
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
    const colors    = new Float32Array(positions.count * 3);
    const color     = new THREE.Color();

    for (let i = 0; i < positions.count; i++) {
      const wx = positions.getX(i) + cx * CHUNK_SIZE;
      const wz = positions.getZ(i) + cz * CHUNK_SIZE;
      const h  = egyptHeight(wx, wz);

      positions.setY(i, h);

      const rawH = h + 3000;

      // ✅ TERRACOTTA / RUST-ORANGE PALETTE — matched to reference screenshot
      // Base: warm reddish-orange sandy earth with iron-oxide splotch variation
      if (rawH < 5) {
        color.setHex(0xD9865A);  // muted terracotta (low flat areas)
      } else if (rawH < 40) {
        color.setHex(0xE8956A);  // soft orange-sand
      } else if (rawH < 100) {
        color.setHex(0xE07850);  // mid terracotta-orange
      } else if (rawH < 250) {
        color.setHex(0xD46A3A);  // deeper rust-orange
      } else if (rawH < 600) {
        color.setHex(0xC85A2A);  // rich burnt sienna
      } else {
        color.setHex(0xBF4F22);  // deep rust for high ridges
      }

      // ✅ SPLOTCH VARIATION — dark reddish-brown patches like in reference image
      const splotch = detailNoise(wx * 0.00015, wz * 0.00015);
      const splotchDark = detailNoise(wx * 0.0005, wz * 0.0005);
      // Darken patches where noise is high (iron-oxide staining effect)
      if (splotch > 0.62) {
        color.lerp(new THREE.Color(0x8B3018), (splotch - 0.62) * 2.0); // dark rust splotch
      } else if (splotchDark > 0.68) {
        color.lerp(new THREE.Color(0xA03520), (splotchDark - 0.68) * 1.5); // smaller dark patches
      }

      // ✅ SUBTLE BRIGHTNESS VARIATION for surface texture
      const variation = detailNoise(wx * 0.0001, wz * 0.0001) * 0.12 - 0.06;
      color.multiplyScalar(1.0 + variation);

      colors[i * 3]     = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    positions.needsUpdate = true;
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, this.material);
    mesh.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);

    this.scene.add(mesh);
    this.chunks.set(key, { mesh, cx, cz });
  }

  getHeightAt(x: number, z: number): number {
    return egyptHeight(x, z);
  }

  setSunDirection(sunDir: THREE.Vector3): void {
    this.material.uniforms.uSunDir.value.copy(sunDir.normalize());
  }
}

// ============================================================
//  DistanceFog — يخفي الـ horizon seam تماماً
// ============================================================
export function setupFog(scene: THREE.Scene): void {
  scene.fog = new THREE.FogExp2(0xB0D4E8, 0.000025);
  scene.background = new THREE.Color(0xB0D4E8);
}

// ============================================================
//  الإضاءة — شمس مصر ١٩٧٣
// ============================================================
export function setupLighting(scene: THREE.Scene): {
  sun: THREE.DirectionalLight;
  ambient: THREE.AmbientLight;
} {
  const ambient = new THREE.AmbientLight(0xFFFFFF, 0.8);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xFFEECC, 2.0);
  sun.position.set(60000, 100000, -80000);
  sun.castShadow        = false;
  sun.matrixAutoUpdate  = false;
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
//  SETTINGS UI COMPONENT — ⚙️ SETTINGS ICON
// ============================================================
export class SettingsUI {
  private container: HTMLDivElement;
  private isOpen: boolean = false;
  private settings: {
    terrainDetail: number;
    sunBrightness: number;
    fogDensity: number;
    ambientLight: number;
  } = {
    terrainDetail: 1.0,
    sunBrightness: 1.0,
    fogDensity: 1.0,
    ambientLight: 1.0,
  };

  constructor(scene: THREE.Scene, terrain: InfiniteTerrain, sky: ProceduralSky, lights: { sun: THREE.DirectionalLight; ambient: THREE.AmbientLight }) {
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
          background: rgba(100, 100, 100, 0.8);
          border: 2px solid rgba(200, 200, 200, 0.9);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 28px;
          color: rgba(220, 220, 220, 0.9);
          transition: all 0.3s ease;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }
        
        .settings-button:hover {
          background: rgba(120, 120, 120, 0.9);
          transform: rotate(20deg);
        }
        
        .settings-panel {
          display: none;
          position: absolute;
          top: 70px;
          right: 0;
          background: rgba(50, 50, 50, 0.95);
          border: 2px solid rgba(150, 150, 150, 0.8);
          border-radius: 8px;
          padding: 20px;
          width: 250px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
          color: rgba(220, 220, 220, 0.95);
        }
        
        .settings-panel.open {
          display: block;
        }
        
        .settings-item {
          margin-bottom: 15px;
        }
        
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
          background: rgba(100, 100, 100, 0.8);
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
          background: rgba(255, 221, 68, 0.9);
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
        }
        
        .settings-slider::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: rgba(255, 221, 68, 0.9);
          cursor: pointer;
          border: none;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
        }
        
        .settings-value {
          display: inline-block;
          float: right;
          font-size: 12px;
          color: rgba(255, 221, 68, 0.9);
          font-weight: bold;
        }
      </style>
      
      <button class="settings-button" title="Settings">⚙️</button>
      <div class="settings-panel">
        <div class="settings-item">
          <label class="settings-label">Terrain Detail</label>
          <input type="range" class="settings-slider" id="terrain-detail" min="0.5" max="2.0" step="0.1" value="1.0">
          <span class="settings-value" id="terrain-detail-value">1.0x</span>
        </div>
        
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

  private setupEventListeners(scene: THREE.Scene, terrain: InfiniteTerrain, sky: ProceduralSky, lights: { sun: THREE.DirectionalLight; ambient: THREE.AmbientLight }): void {
    const button = this.container.querySelector('.settings-button') as HTMLButtonElement;
    const panel = this.container.querySelector('.settings-panel') as HTMLDivElement;

    button.addEventListener('click', () => {
      this.isOpen = !this.isOpen;
      panel.classList.toggle('open');
    });

    // Terrain Detail
    const terrainDetailSlider = this.container.querySelector('#terrain-detail') as HTMLInputElement;
    const terrainDetailValue = this.container.querySelector('#terrain-detail-value') as HTMLSpanElement;
    terrainDetailSlider.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      this.settings.terrainDetail = value;
      terrainDetailValue.textContent = value.toFixed(1) + 'x';
    });

    // Sun Brightness
    const sunBrightnessSlider = this.container.querySelector('#sun-brightness') as HTMLInputElement;
    const sunBrightnessValue = this.container.querySelector('#sun-brightness-value') as HTMLSpanElement;
    sunBrightnessSlider.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      this.settings.sunBrightness = value;
      sunBrightnessValue.textContent = value.toFixed(1) + 'x';
      lights.sun.intensity = 2.0 * value;
    });

    // Fog Density
    const fogDensitySlider = this.container.querySelector('#fog-density') as HTMLInputElement;
    const fogDensityValue = this.container.querySelector('#fog-density-value') as HTMLSpanElement;
    fogDensitySlider.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      this.settings.fogDensity = value;
      fogDensityValue.textContent = value.toFixed(1) + 'x';
      if (scene.fog instanceof THREE.FogExp2) {
        scene.fog.density = 0.000025 * value;
      }
    });

    // Ambient Light
    const ambientLightSlider = this.container.querySelector('#ambient-light') as HTMLInputElement;
    const ambientLightValue = this.container.querySelector('#ambient-light-value') as HTMLSpanElement;
    ambientLightSlider.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      this.settings.ambientLight = value;
      ambientLightValue.textContent = value.toFixed(1) + 'x';
      lights.ambient.intensity = 0.8 * value;
    });
  }

  getSettings() {
    return this.settings;
  }
}
