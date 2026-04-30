import * as THREE from 'three';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { MiniMap } from './MiniMap';

export interface WorldOptions {
  skyExrUrl?: string;
}

export class World {
  public readonly root = new THREE.Group();
  private readonly scene: THREE.Scene;
  private readonly options: WorldOptions;
  private time = 0;

  private sunLight!: THREE.DirectionalLight;
  private fillLight!: THREE.HemisphereLight;
  private renderer: THREE.WebGLRenderer | null = null;

  constructor(scene: THREE.Scene, loadingManager: THREE.LoadingManager, options: Partial<WorldOptions> = {}, renderer?: THREE.WebGLRenderer) {
    this.scene = scene;
    this.loadingManager = loadingManager;
    this.options       = options;
    this.renderer      = renderer ?? null;

    this.build();
    this.loadSkyEXR();
  }

  private loadSkyEXR(): void {
    const url = this.options.skyExrUrl;
    if (!url || !this.renderer) return;

    const loader = new EXRLoader(this.loadingManager);
    loader.setDataType(THREE.FloatType);

    loader.load(url, (texture) => {
      try {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        const pmrem = new THREE.PMREMGenerator(this.renderer!);
        pmrem.compileEquirectangularShader();
        const envMap = pmrem.fromEquirectangular(texture).texture;
        this.scene.environment = envMap;
        this.scene.background = envMap;

        texture.dispose();
        pmrem.dispose();
      } catch (e) {
        console.warn('[World] Failed to apply EXR:', e);
        this.scene.background = new THREE.Color(0x8ec5f7);
      }
    });
  }

  private build(): void {
    this.scene.add(this.root);
    this.createEnvironment();
  }

  private createEnvironment(): void {
    this.fillLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
    this.root.add(this.fillLight);
    this.sunLight = new THREE.DirectionalLight(0xffffff, 2.0);
    this.sunLight.position.set(100, 200, 100);
    this.root.add(this.sunLight);
  }

  public update(deltaTime: number): void {
    this.time += deltaTime;
    // You can add logic here to rotate the sky or update light intensity
  }

  public dispose(): void {
    this.scene.remove(this.root);
    // Clear background and environment
    this.scene.background = null;
    this.scene.environment = null;
    if (this.miniMap) {
      this.miniMap.dispose();
    }
  }
}
