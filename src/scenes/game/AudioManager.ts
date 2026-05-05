import * as THREE from 'three';

export class AudioManager {
  private listener: THREE.AudioListener;
  private audioLoader: THREE.AudioLoader;
  private sounds: Map<string, AudioBuffer> = new Map();
  private activeMissileEngines: Map<number, THREE.PositionalAudio> = new Map();
  private nextId: number = 0;

  // ✅ Persistent audio objects to prevent memory leaks
  private bulletAudio: THREE.Audio | null = null;
  private launchAudio: THREE.Audio | null = null;

  constructor(camera: THREE.Camera) {
    this.listener = new THREE.AudioListener();
    camera.add(this.listener);
    this.audioLoader = new THREE.AudioLoader();

    // Pre-create audio objects
    this.bulletAudio = new THREE.Audio(this.listener);
    this.launchAudio = new THREE.Audio(this.listener);

    // Load files
    this.load('bullet', '/sounds/bullet_fire.mp3');
    this.load('launch', '/sounds/missile_launch.mp3');
    this.load('engine', '/sounds/missile_engine_loop.mp3');
  }

  private load(name: string, url: string) {
    this.audioLoader.load(url, (buffer) => {
      this.sounds.set(name, buffer);

      if (name === 'bullet' && this.bulletAudio) {
        this.bulletAudio.setBuffer(buffer);
        this.bulletAudio.setVolume(0.4);
      }
      if (name === 'launch' && this.launchAudio) {
        this.launchAudio.setBuffer(buffer);
        this.launchAudio.setVolume(0.6);
      }
    });
  }

  public resume(): void {
    if (this.listener.context.state === 'suspended') {
      this.listener.context.resume();
    }
  }

  // ── Bullet Sounds ──────────────────────────────────────────────
  public playBulletFire(): void {
    if (this.bulletAudio && this.bulletAudio.buffer) {
      if (this.bulletAudio.isPlaying) this.bulletAudio.stop();
      this.bulletAudio.play();
    }
  }

  // ── Missile Sounds ─────────────────────────────────────────────
  public playMissileLaunch(): void {
    if (this.launchAudio && this.launchAudio.buffer) {
      if (this.launchAudio.isPlaying) this.launchAudio.stop();
      this.launchAudio.play();
    }
  }

  // Positional engine sounds (created/removed per missile — need spatial tracking)
  public startMissileEngine(): number {
    const buffer = this.sounds.get('engine');
    if (!buffer) return -1;

    const id = this.nextId++;
    const sound = new THREE.PositionalAudio(this.listener);

    sound.setBuffer(buffer);
    sound.setLoop(true);
    sound.setVolume(0.5);
    sound.setRefDistance(20);
    sound.play();

    this.activeMissileEngines.set(id, sound);
    return id;
  }

  public stopMissileEngine(id: number): void {
    const sound = this.activeMissileEngines.get(id);
    if (sound) {
      if (sound.isPlaying) sound.stop();
      this.activeMissileEngines.delete(id);
      // FIX: Help GC clean up the WebAudio graph node
      sound.disconnect();
    }
  }

  // FIX: Stop ALL active missile engines at once — call this on reset/dispose
  // to prevent WebAudio node leaks when missiles are destroyed mid-flight
  public stopAll(): void {
    for (const [id] of this.activeMissileEngines) {
      this.stopMissileEngine(id);
    }
  }

  // FIX: Full cleanup — call when the game is being torn down entirely
  public dispose(): void {
    this.stopAll();

    if (this.bulletAudio) {
      if (this.bulletAudio.isPlaying) this.bulletAudio.stop();
      this.bulletAudio.disconnect();
      this.bulletAudio = null;
    }
    if (this.launchAudio) {
      if (this.launchAudio.isPlaying) this.launchAudio.stop();
      this.launchAudio.disconnect();
      this.launchAudio = null;
    }

    this.sounds.clear();
  }
}
