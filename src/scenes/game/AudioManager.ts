import * as THREE from 'three';

export class AudioManager {
  private listener: THREE.AudioListener;
  private audioLoader: THREE.AudioLoader;
  private sounds: Map<string, AudioBuffer> = new Map();
  private activeMissileEngines: Map<number, THREE.PositionalAudio> = new Map();
  private nextId: number = 0;

  constructor(camera: THREE.Camera) {
    this.listener = new THREE.AudioListener();
    camera.add(this.listener);
    this.audioLoader = new THREE.AudioLoader();

    // Load your assets here
    this.load('bullet', '/sounds/bullet_fire.mp3');
    this.load('launch', '/sounds/missile_launch.mp3');
    this.load('engine', '/sounds/missile_engine_loop.mp3');
  }

  private load(name: string, url: string) {
    this.audioLoader.load(url, (buffer) => {
      this.sounds.set(name, buffer);
    });
  }

  /**
   * Browser policy requires a user gesture to start audio. 
   * This is called inside your ProjectileManager.spawn()
   */
  public resume(): void {
    if (this.listener.context.state === 'suspended') {
      this.listener.context.resume();
    }
  }

  // ── Bullet Sounds ─────────────────────────────────────────────
  public playBulletFire(): void {
    const buffer = this.sounds.get('bullet');
    if (!buffer) return;

    const sound = new THREE.Audio(this.listener);
    sound.setBuffer(buffer);
    sound.setVolume(0.4);
    sound.play();
  }

  // ── Missile Sounds ─────────────────────────────────────────────
  public playMissileLaunch(): void {
    const buffer = this.sounds.get('launch');
    if (!buffer) return;

    const sound = new THREE.Audio(this.listener);
    sound.setBuffer(buffer);
    sound.setVolume(0.6);
    sound.play();
  }

  public startMissileEngine(): number {
    const buffer = this.sounds.get('engine');
    if (!buffer) return -1;

    const id = this.nextId++;
    const sound = new THREE.PositionalAudio(this.listener);
    
    sound.setBuffer(buffer);
    sound.setLoop(true);
    sound.setVolume(0.5);
    sound.setRefDistance(20); // Distance where volume starts dropping
    sound.play();

    this.activeMissileEngines.set(id, sound);
    return id;
  }

  public stopMissileEngine(id: number): void {
    const sound = this.activeMissileEngines.get(id);
    if (sound) {
      if (sound.isPlaying) sound.stop();
      this.activeMissileEngines.delete(id);
    }
  }
}