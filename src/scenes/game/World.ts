import * as THREE from 'three';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';

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

  constructor(scene: THREE.Scene, options: Partial<WorldOptions> = {}, renderer?: THREE.WebGLRenderer) {
    this.scene = scene;
    this.options = options;
    this.renderer = renderer ?? null;

    this.build();
    this.loadSkyEXR();
  }

  private loadSkyEXR(): void {
    const url = this.options.skyExrUrl;
    if (!url || !this.renderer) return;

    const loader = new EXRLoader();
    loader.setDataType(THREE.FloatType);

    loader.load(url, (texture) => {
      try {
        texture.mapping = THREE.EquirectangularReflectionMapping;

        const pmrem = new THREE.PMREMGenerator(this.renderer!);
        pmrem.compileEquirectangularShader();
        const envMap = pmrem.fromEquirectangular(texture).texture;

        // Set the EXR as the background and the light source
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
    // Basic lighting to ensure objects in the scene (like your cockpit) are visible
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
  }
}