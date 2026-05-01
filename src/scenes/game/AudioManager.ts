import * as THREE from 'three';

export class AudioManager {
  private listener: THREE.AudioListener;
  private audioLoader: THREE.AudioLoader;
  private sounds: Map<string, AudioBuffer> = new Map();
  private activeMissileEngines: Map<number, THREE.PositionalAudio> = new Map();
  private nextId: number = 0;

  // ✅ كائنات صوتية ثابتة لمنع تسريب الذاكرة
  private bulletAudio: THREE.Audio | null = null;
  private launchAudio: THREE.Audio | null = null;

  constructor(camera: THREE.Camera) {
    this.listener = new THREE.AudioListener();
    camera.add(this.listener);
    this.audioLoader = new THREE.AudioLoader();

    // تجهيز كائنات الصوت مسبقاً
    this.bulletAudio = new THREE.Audio(this.listener);
    this.launchAudio = new THREE.Audio(this.listener);

    // تحميل الملفات
    this.load('bullet', '/sounds/bullet_fire.mp3');
    this.load('launch', '/sounds/missile_launch.mp3');
    this.load('engine', '/sounds/missile_engine_loop.mp3');
  }

  private load(name: string, url: string) {
    this.audioLoader.load(url, (buffer) => {
      this.sounds.set(name, buffer);
      
      // ربط الـ buffer بالكائنات الثابتة بمجرد تحميلها
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

  // ── Bullet Sounds (Mended) ─────────────────────────────────────────────
  public playBulletFire(): void {
    // ✅ نستخدم نفس الكائن، نوقفه ثم نشغله بدلاً من إنشاء واحد جديد
    if (this.bulletAudio && this.bulletAudio.buffer) {
      if (this.bulletAudio.isPlaying) this.bulletAudio.stop();
      this.bulletAudio.play();
    }
  }

  // ── Missile Sounds (Mended) ─────────────────────────────────────────────
  public playMissileLaunch(): void {
    // ✅ نستخدم نفس الكائن لمنع تراكم الأصوات في الذاكرة
    if (this.launchAudio && this.launchAudio.buffer) {
      if (this.launchAudio.isPlaying) this.launchAudio.stop();
      this.launchAudio.play();
    }
  }

  // محركات الصواريخ (تُنشأ وتُحذف لأنها Positional وتحتاج تتبع مكاني)
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
      // ✅ مساعدة الـ Garbage Collector في تنظيف الذاكرة
      sound.disconnect(); 
    }
  }
}