import * as THREE from 'three';

export interface WorldOptions {
  terrainSize: number;
  terrainSegments: number;
  riverWidth: number;
  cloudCount: number;
}

const DEFAULT_OPTIONS: WorldOptions = {
  terrainSize: 26000,
  terrainSegments: 280,
  riverWidth: 360,
  cloudCount: 16,
};

export class World {
  public readonly root = new THREE.Group();

  private readonly scene: THREE.Scene;
  private readonly options: WorldOptions;

  private readonly terrainGeometry: THREE.PlaneGeometry;
  private readonly terrainMaterial: THREE.MeshStandardMaterial;
  private readonly terrainMesh: THREE.Mesh;

  private readonly cloudLayer = new THREE.Group();
  private readonly reusableObject = new THREE.Object3D();
  private time = 0;

  private sunLight!: THREE.DirectionalLight;
  private fillLight!: THREE.HemisphereLight;

  constructor(scene: THREE.Scene, options: Partial<WorldOptions> = {}) {
    this.scene = scene;
    this.options = { ...DEFAULT_OPTIONS, ...options };

    this.terrainGeometry = new THREE.PlaneGeometry(
      this.options.terrainSize,
      this.options.terrainSize,
      this.options.terrainSegments,
      this.options.terrainSegments,
    );

    this.terrainMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.98,
      metalness: 0.0,
      flatShading: false,
    });

    this.terrainMesh = new THREE.Mesh(this.terrainGeometry, this.terrainMaterial);
    this.terrainMesh.rotation.x = -Math.PI / 2;
    this.terrainMesh.receiveShadow = true;
    this.terrainMesh.castShadow = false;

    this.build();
  }

  private build(): void {
    this.scene.add(this.root);
    this.root.add(this.terrainMesh);

    this.createEnvironment();
    this.sculptTerrain();
    this.addRiver();
    this.addFieldBoundaries();
    this.addTreeBands();
    this.addClouds();
  }

  private createEnvironment(): void {
    this.scene.background = new THREE.Color(0x8ec5f7);
    this.scene.fog = new THREE.Fog(0xbfd8ec, 4200, 24000);

    this.fillLight = new THREE.HemisphereLight(0xc9ecff, 0x8a7b5c, 1.55);
    this.root.add(this.fillLight);

    this.sunLight = new THREE.DirectionalLight(0xfff2cb, 2.2);
    this.sunLight.position.set(-3200, 4200, 1600);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 200;
    this.sunLight.shadow.camera.far = 12000;
    this.sunLight.shadow.camera.left = -4500;
    this.sunLight.shadow.camera.right = 4500;
    this.sunLight.shadow.camera.top = 4500;
    this.sunLight.shadow.camera.bottom = -4500;
    this.root.add(this.sunLight);

    const ambient = new THREE.AmbientLight(0xf6f9ff, 0.35);
    this.root.add(ambient);
  }

  private sculptTerrain(): void {
    const position = this.terrainGeometry.attributes.position;
    const colors: number[] = [];
    const color = new THREE.Color();

    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const z = position.getY(i);
      const height = this.getTerrainHeight(x, z);

      position.setZ(i, height);

      const fieldTone = this.getFieldColor(x, z, height);
      color.set(fieldTone);
      colors.push(color.r, color.g, color.b);
    }

    this.terrainGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    position.needsUpdate = true;
    this.terrainGeometry.computeVertexNormals();
  }

  private addRiver(): void {
    const riverLength = this.options.terrainSize * 0.96;
    const segments = 220;
    const riverVertices: number[] = [];
    const riverUvs: number[] = [];
    const riverIndices: number[] = [];

    for (let i = 0; i <= segments; i += 1) {
      const t = i / segments;
      const z = THREE.MathUtils.lerp(-riverLength / 2, riverLength / 2, t);
      const centerX = this.getRiverCenter(z);
      const width = this.options.riverWidth + Math.sin(z * 0.0017) * 70 + Math.cos(z * 0.0008) * 55;

      const leftX = centerX - width;
      const rightX = centerX + width;
      const leftY = this.getTerrainHeight(leftX, z) + 2.5;
      const rightY = this.getTerrainHeight(rightX, z) + 2.5;

      riverVertices.push(leftX, leftY, z, rightX, rightY, z);
      riverUvs.push(0, t * 5, 1, t * 5);

      if (i < segments) {
        const base = i * 2;
        riverIndices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(riverVertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(riverUvs, 2));
    geometry.setIndex(riverIndices);
    geometry.computeVertexNormals();

    const material = new THREE.MeshPhysicalMaterial({
      color: 0x5d8fc7,
      transparent: true,
      opacity: 0.9,
      roughness: 0.18,
      transmission: 0.18,
      thickness: 0.4,
      clearcoat: 0.35,
      clearcoatRoughness: 0.2,
      side: THREE.DoubleSide,
    });

    const river = new THREE.Mesh(geometry, material);
    river.receiveShadow = false;
    this.root.add(river);
  }

  private addFieldBoundaries(): void {
    const boundaryGroup = new THREE.Group();
    const material = new THREE.LineBasicMaterial({
      color: 0x50663d,
      transparent: true,
      opacity: 0.22,
    });

    const step = 560;
    const extent = this.options.terrainSize * 0.46;

    for (let x = -extent; x <= extent; x += step) {
      const points: THREE.Vector3[] = [];
      for (let z = -extent; z <= extent; z += 180) {
        points.push(new THREE.Vector3(x + Math.sin(z * 0.002) * 22, this.getTerrainHeight(x, z) + 4, z));
      }
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      boundaryGroup.add(new THREE.Line(geometry, material));
    }

    for (let z = -extent; z <= extent; z += step) {
      const points: THREE.Vector3[] = [];
      for (let x = -extent; x <= extent; x += 180) {
        points.push(new THREE.Vector3(x, this.getTerrainHeight(x, z) + 4, z + Math.sin(x * 0.0024) * 18));
      }
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      boundaryGroup.add(new THREE.Line(geometry, material));
    }

    this.root.add(boundaryGroup);
  }

  private addTreeBands(): void {
    const treeGeometry = new THREE.ConeGeometry(10, 34, 6);
    const treeMaterial = new THREE.MeshStandardMaterial({
      color: 0x2d4e26,
      roughness: 1,
      metalness: 0,
    });

    const count = 900;
    const trees = new THREE.InstancedMesh(treeGeometry, treeMaterial, count);
    trees.castShadow = false;
    trees.receiveShadow = false;

    for (let i = 0; i < count; i += 1) {
      const z = THREE.MathUtils.lerp(-this.options.terrainSize * 0.45, this.options.terrainSize * 0.45, i / count);
      const bandOffset = (this.randomSigned(i * 17.2) * 140) + (i % 2 === 0 ? -1 : 1) * (this.options.riverWidth + 110);
      const x = this.getRiverCenter(z) + bandOffset + this.randomSigned(i * 7.1) * 75;
      const y = this.getTerrainHeight(x, z) + 16;
      const scale = 0.8 + this.random01(i * 3.31) * 1.8;

      this.reusableObject.position.set(x, y, z + this.randomSigned(i * 5.73) * 65);
      this.reusableObject.rotation.y = this.random01(i * 9.17) * Math.PI;
      this.reusableObject.scale.setScalar(scale);
      this.reusableObject.updateMatrix();
      trees.setMatrixAt(i, this.reusableObject.matrix);
    }

    trees.instanceMatrix.needsUpdate = true;
    this.root.add(trees);
  }

  private addClouds(): void {
    const sphere = new THREE.SphereGeometry(1, 8, 8);
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.8,
      roughness: 1,
      depthWrite: false,
    });

    for (let i = 0; i < this.options.cloudCount; i += 1) {
      const cloud = new THREE.Group();
      const puffCount = 5 + (i % 4);

      for (let p = 0; p < puffCount; p += 1) {
        const puff = new THREE.Mesh(sphere, material);
        puff.position.set(
          (p - puffCount / 2) * 36 + this.randomSigned(i * 11 + p) * 18,
          this.randomSigned(i * 3 + p) * 12,
          this.randomSigned(i * 13 + p) * 24,
        );
        puff.scale.set(
          40 + this.random01(i * 2 + p) * 35,
          22 + this.random01(i * 7 + p) * 12,
          26 + this.random01(i * 5 + p) * 18,
        );
        cloud.add(puff);
      }

      cloud.position.set(
        this.randomSigned(i * 41.1) * this.options.terrainSize * 0.35,
        1600 + this.random01(i * 9.9) * 700,
        this.randomSigned(i * 23.4) * this.options.terrainSize * 0.35,
      );

      cloud.userData.drift = 8 + this.random01(i * 15.2) * 10;
      this.cloudLayer.add(cloud);
    }

    this.root.add(this.cloudLayer);
  }

  public update(deltaTime: number): void {
    this.time += deltaTime;

    this.cloudLayer.children.forEach((cloud, index) => {
      cloud.position.x += (cloud.userData.drift as number) * deltaTime;
      cloud.position.z += Math.sin(this.time * 0.03 + index) * 0.2;

      if (cloud.position.x > this.options.terrainSize * 0.42) {
        cloud.position.x = -this.options.terrainSize * 0.42;
      }
    });

    const sunSwing = Math.sin(this.time * 0.015) * 220;
    this.sunLight.position.x = -3200 + sunSwing;
    this.sunLight.position.z = 1600 + Math.cos(this.time * 0.012) * 120;
  }

  public dispose(): void {
    this.scene.remove(this.root);
    this.terrainGeometry.dispose();
    this.terrainMaterial.dispose();

    this.root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();

      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((material) => material.dispose());
      } else if (mesh.material) {
        mesh.material.dispose();
      }
    });
  }

  private getTerrainHeight(x: number, z: number): number {
    const broad = this.fbm(x * 0.00065, z * 0.00065, 4) * 78;
    const rolling = this.fbm(x * 0.0018, z * 0.0018, 3) * 18;
    const subtle = this.fbm(x * 0.0055, z * 0.0055, 2) * 5;

    const riverDistance = Math.abs(x - this.getRiverCenter(z));
    const riverMask = 1 - THREE.MathUtils.smoothstep(riverDistance, this.options.riverWidth * 0.9, this.options.riverWidth * 2.4);
    const riverCut = riverMask * 52;

    const lowland = Math.max(0, 1 - Math.abs(z) / (this.options.terrainSize * 0.5)) * 10;
    return broad + rolling + subtle - riverCut - lowland;
  }

  private getFieldColor(x: number, z: number, height: number): number {
    const riverDistance = Math.abs(x - this.getRiverCenter(z));
    if (riverDistance < this.options.riverWidth * 1.4) {
      return height < 0 ? 0x84b36e : 0x7ea55c;
    }

    const gridX = Math.floor((x + this.options.terrainSize * 0.5) / 420);
    const gridZ = Math.floor((z + this.options.terrainSize * 0.5) / 420);
    const fieldSeed = this.random01(gridX * 17.13 + gridZ * 9.31);

    if (fieldSeed < 0.2) return 0xceb77e;
    if (fieldSeed < 0.4) return 0xb7c97a;
    if (fieldSeed < 0.62) return 0x97b96a;
    if (fieldSeed < 0.82) return 0x7f9f59;
    return 0x688651;
  }

  private getRiverCenter(z: number): number {
    return Math.sin(z * 0.00115) * 950 + Math.sin(z * 0.00031 + 1.4) * 420;
  }

  private fbm(x: number, z: number, octaves: number): number {
    let value = 0;
    let amplitude = 0.5;
    let frequency = 1;

    for (let i = 0; i < octaves; i += 1) {
      value += this.smoothNoise(x * frequency, z * frequency) * amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }

    return value;
  }

  private smoothNoise(x: number, z: number): number {
    const x0 = Math.floor(x);
    const z0 = Math.floor(z);
    const xf = x - x0;
    const zf = z - z0;

    const n00 = this.valueNoise(x0, z0);
    const n10 = this.valueNoise(x0 + 1, z0);
    const n01 = this.valueNoise(x0, z0 + 1);
    const n11 = this.valueNoise(x0 + 1, z0 + 1);

    const u = xf * xf * (3 - 2 * xf);
    const v = zf * zf * (3 - 2 * zf);

    const nx0 = THREE.MathUtils.lerp(n00, n10, u);
    const nx1 = THREE.MathUtils.lerp(n01, n11, u);
    return THREE.MathUtils.lerp(nx0, nx1, v);
  }

  private valueNoise(x: number, z: number): number {
    const raw = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
    return (raw - Math.floor(raw)) * 2 - 1;
  }

  private random01(seed: number): number {
    const raw = Math.sin(seed * 91.173 + 17.713) * 43758.5453123;
    return raw - Math.floor(raw);
  }

  private randomSigned(seed: number): number {
    return this.random01(seed) * 2 - 1;
  }
}
