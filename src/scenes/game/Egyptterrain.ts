import * as THREE from 'three';

// ============================================================
//  EgyptTerrain1973.ts
//  Procedural sky + infinite terrain — بدون أي صور EXR
//  مصر ١٩٧٣: دلتا النيل + الصحراء + سيناء
//  خفيف على الموبايل، يغطي كل الاتجاهات
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

  // ✅ نزّلنا الأرض -3000 عشان الطيارات تكون دايماً في السما
  return raw - 3000;
}

// ============================================================
//  ProceduralSky — يحل محل EXR كاملاً
// ============================================================
export class ProceduralSky {
  private mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.SphereGeometry(450000, 32, 16);

    this.material = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3  uSunDir;
        uniform float uTime;
        varying vec3  vWorldPos;

        float rayleigh(float cosAngle) {
          return 0.75 * (1.0 + cosAngle * cosAngle);
        }

        float mie(float cosAngle, float g) {
          float g2 = g * g;
          return (1.0 - g2) / pow(max(1.0 + g2 - 2.0 * g * cosAngle, 0.001), 1.5);
        }

        void main() {
          vec3  dir     = normalize(vWorldPos);
          float height  = clamp(dir.y, 0.0, 1.0);
          float cosAngle = dot(dir, normalize(uSunDir));

          vec3 zenith  = vec3(0.08, 0.22, 0.65);
          vec3 horizon = vec3(0.55, 0.72, 0.90);
          // ✅ haze = نفس لون الـ fog بالظبط (0xC8B892)
          vec3 haze    = vec3(0.784, 0.722, 0.573);

          float t = pow(height, 0.35);
          vec3 sky = mix(mix(haze, horizon, smoothstep(0.0, 0.12, height)), zenith, t);

          sky *= 1.0 + rayleigh(cosAngle) * 0.25;

          float sunGlow   = mie(cosAngle, 0.9997);
          float sunCorona = mie(cosAngle, 0.985) * 0.4;
          vec3  sunColor  = vec3(2.2, 2.0, 1.8);
          sky += sunColor * (sunGlow + sunCorona) * 0.012;

          vec3 groundColor = vec3(0.55, 0.48, 0.35);
          sky = mix(groundColor, sky, smoothstep(-0.05, 0.0, dir.y));

          sky = sky / (sky + vec3(1.0));
          sky = pow(sky, vec3(1.0 / 2.2));

          gl_FragColor = vec4(sky, 1.0);
        }
      `,
      uniforms: {
        uSunDir: { value: new THREE.Vector3(0.5, 0.3, -0.8).normalize() },
        uTime:   { value: 0.0 },
      },
      side: THREE.BackSide,
      depthWrite: false,
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.renderOrder = -1;
    scene.add(this.mesh);
  }

  update(camera: THREE.Camera, deltaTime: number): void {
    this.mesh.position.copy(camera.position);
    this.material.uniforms.uTime.value += deltaTime;
  }

  setTimeOfDay(t: number): void {
    const angle  = (t * Math.PI * 2) - Math.PI / 2;
    const sunDir = new THREE.Vector3(Math.cos(angle) * 0.7, Math.sin(angle), Math.sin(angle) * 0.3).normalize();
    this.material.uniforms.uSunDir.value.copy(sunDir);
  }
}

// ============================================================
//  InfiniteTerrain — chunks تتولد مع الطيارة
// ============================================================
const CHUNK_SIZE   = 8000;
const CHUNK_SEGS   = 64;
const VIEW_RADIUS  = 2;

interface Chunk {
  mesh: THREE.Mesh;
  cx: number;
  cz: number;
}

export class InfiniteTerrain {
  private scene: THREE.Scene;
  private chunks: Map<string, Chunk> = new Map();
  private material: THREE.MeshLambertMaterial;
  private lastCX = Infinity;
  private lastCZ = Infinity;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    this.material = new THREE.MeshLambertMaterial({
      vertexColors: true,
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

    const positions = geo.attributes.position;
    const colors    = new Float32Array(positions.count * 3);
    const color     = new THREE.Color();

    for (let i = 0; i < positions.count; i++) {
      const wx = positions.getX(i) + cx * CHUNK_SIZE;
      const wz = positions.getZ(i) + cz * CHUNK_SIZE;
      const h  = egyptHeight(wx, wz);

      positions.setY(i, h);

      // الارتفاع قبل الـ offset
      const rawH = h + 3000;

      // ✅ كل الألوان تدرجات رمل — 2 ظهر صيف مصر
      // الضوء الساطع بيخلي الرمل أفتح وأذهب من الصبح
      if (rawH < 5) {
        // قاع منخفض — رمل رطب بني/ذهبي داكن
        color.setHex(0xB8955A);
      } else if (rawH < 40) {
        // سهول منبسطة — رمل فاتح ذهبي (الضهر بيكون أفتح من الصبح)
        color.setHex(0xEDD07A);
      } else if (rawH < 100) {
        // كثبان متوسطة — رمل ذهبي دافي
        color.setHex(0xD4A844);
      } else if (rawH < 250) {
        // كثبان عالية (الجانب المظلل) — أغمق شوية
        color.setHex(0xBF923A);
      } else if (rawH < 600) {
        // هضاب صخرية — رمل بني محروق
        color.setHex(0xA07830);
      } else {
        // قمم سيناء — صخر بيج رملي
        color.setHex(0xC8A86A);
      }

      colors[i * 3]     = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    positions.needsUpdate = true;
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, this.material);
    mesh.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
    mesh.receiveShadow = true;
    mesh.castShadow    = false;

    this.scene.add(mesh);
    this.chunks.set(key, { mesh, cx, cz });
  }

  getHeightAt(x: number, z: number): number {
    return egyptHeight(x, z);
  }
}

// ============================================================
//  DistanceFog — يخفي الـ horizon seam تماماً
//  ✅ لون الـ fog = نفس vec3 haze في الشيدر بالظبط
// ============================================================
export function setupFog(scene: THREE.Scene): void {
  // 0.784*255≈200, 0.722*255≈184, 0.573*255≈146 → #daccab
  scene.fog = new THREE.FogExp2(0xdaccab, 0.000025);
  scene.background = new THREE.Color(0xdaccab);
}

// ============================================================
//  الإضاءة — شمس مصر ١٩٧٣ — الساعة ٢ ظهر
//  ✅ خففنا الـ intensity عشان مش overexposed
// ============================================================
export function setupLighting(scene: THREE.Scene): {
  sun: THREE.DirectionalLight;
  ambient: THREE.AmbientLight;
} {
  // ambient خفيف — مش هيكون كل حاجة أبيض
  const ambient = new THREE.AmbientLight(0xFFEECC, 1.2);
  scene.add(ambient);

  // شمس 2 ظهر — عالية، بيضاء، intensity معقولة
  const sun = new THREE.DirectionalLight(0xFFFAF0, 3.0);
  sun.position.set(30000, 120000, -60000);
  sun.castShadow        = false;
  sun.matrixAutoUpdate  = false;
  sun.updateMatrix();
  scene.add(sun);

  // fill خفيف — انعكاس من الرمال الساخنة
  const fill = new THREE.DirectionalLight(0xFFE8B0, 0.8);
  fill.position.set(-30000, 40000, 60000);
  fill.castShadow       = false;
  fill.matrixAutoUpdate = false;
  fill.updateMatrix();
  scene.add(fill);

  return { sun, ambient };
}