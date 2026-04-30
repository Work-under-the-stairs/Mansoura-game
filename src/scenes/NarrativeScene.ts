import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

export class NarrativeScene {
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private mixer?: THREE.AnimationMixer;
  private scrollMesh?: THREE.Group;
  private overlay: HTMLElement;
  private onCompleteCallback: (() => void) | null = null;
  private clock = new THREE.Clock();

  private modelReady = false;
  private pendingShow = false;
  private gltfAnimations: THREE.AnimationClip[] = [];
  private actions: THREE.AnimationAction[] = [];
  private mixerPaused = false;

  private readonly text = "معركة المنصورة الجوية: هي معركة جوية وقعت في 14 أكتوبر 1973 في طنطا والمنصورة والصالحية. وكانت أكبر هجوم جوي تشنه إسرائيل بقوة قُدرت بحوالي 120 طائرة إسرائيلية وقد انتهت بالنصر للقوات المصرية بعد أطول وأكبر معركة جوية استمرت 53 دقيقة.";

  private readonly secondText = "نجحت قواتنا المسلحة في عبور قناة السويس على طول المواجهة وتم الاستيلاء على منطقة الشاطئ الشرقي للقناة وتواصل قواتنا حاليا قتالها مع العدو بنجاح كما قامت قواتنا البحرية بحماية الجانب الايسر لقواتنا على ساحل البحر الابيض المتوسط وقد قامت بضرب الاهداف الهامة للعدو.";

  private typingInterval: ReturnType<typeof setInterval> | null = null;
  private secondTypingInterval: ReturnType<typeof setInterval> | null = null;

  private typingAudioCtx: AudioContext | null = null;
  private typingAudioBuffer: AudioBuffer | null = null;
  private currentTypingSource: AudioBufferSourceNode | null = null;
  
  // New Scroll Audio Properties
  private scrollAudio: HTMLAudioElement | null = null;
  private voiceAudio: HTMLAudioElement | null = null;

  constructor(private container: HTMLElement) {
    this.overlay = this.createOverlay();
    this.initScene();
    this.initTypingAudio();
    this.initVoiceAudio();
    this.initScrollAudio(); // Initialize new sound
  }

  // =============================
  //  PAPER SCROLL SOUND (New)
  // =============================
  private initScrollAudio(): void {
    try {
      this.scrollAudio = new Audio('/sounds/videoplayback (1).m4a'); // Ensure this path is correct
      this.scrollAudio.volume = 0.6;
    } catch (err) {
      console.warn('Scroll audio failed to load:', err);
    }
  }

  private playScrollSnippet(durationMs: number = 1500): void {
    if (!this.scrollAudio) return;
    
    try {
      this.scrollAudio.currentTime = 6; // Start from beginning
      this.scrollAudio.play().catch(() => {});
      
      // Stop the audio after the specified duration (the snippet)
      setTimeout(() => {
        if (this.scrollAudio) {
          this.scrollAudio.pause();
          this.scrollAudio.currentTime = 0;
        }
      }, durationMs);
    } catch {}
  }

  // =============================
  //  TYPING SOUND
  // =============================
  private async initTypingAudio(): Promise<void> {
    try {
      this.typingAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const response = await fetch('/sounds/typingsound.mp3');
      const arrayBuffer = await response.arrayBuffer();
      this.typingAudioBuffer = await this.typingAudioCtx.decodeAudioData(arrayBuffer);
    } catch (err) {
      console.warn('Typing audio failed to load:', err);
    }
  }

  private startTypingSound(): void {
    if (!this.typingAudioCtx || !this.typingAudioBuffer) return;
    if (this.currentTypingSource) return;

    try {
      if (this.typingAudioCtx.state === 'suspended') this.typingAudioCtx.resume();

      const source = this.typingAudioCtx.createBufferSource();
      const gainNode = this.typingAudioCtx.createGain();

      source.buffer = this.typingAudioBuffer;
      source.loop = true;
      source.loopStart = 0;
      source.loopEnd = 2.4;

      source.connect(gainNode);
      gainNode.connect(this.typingAudioCtx.destination);
      gainNode.gain.setValueAtTime(0.4, this.typingAudioCtx.currentTime);

      source.start();
      this.currentTypingSource = source;
    } catch {}
  }

  private stopTypingSound(): void {
    try {
      if (this.currentTypingSource) {
        this.currentTypingSource.stop();
        this.currentTypingSource = null;
      }
    } catch {}
  }

  private stopTypingAudio(): void {
    this.stopTypingSound();
    try {
      if (this.typingAudioCtx) {
        this.typingAudioCtx.close();
        this.typingAudioCtx = null;
      }
    } catch {}
  }

  // =============================
  //  VOICE AUDIO
  // =============================
  private initVoiceAudio(): void {
    try {
      this.voiceAudio = new Audio('/sounds/videoplayback.m4a');
      this.voiceAudio.volume = 1.0;
    } catch (err) {
      console.warn('Voice audio failed to load:', err);
    }
  }

  private stopVoiceAudio(): void {
    if (this.secondTypingInterval) {
      clearInterval(this.secondTypingInterval);
      this.secondTypingInterval = null;
    }
    if (this.voiceAudio) {
      this.voiceAudio.pause();
      this.voiceAudio = null;
    }
  }

  // =============================
  //  SECOND TEXT + VOICE
  // =============================
  private startVoiceAndSecondText(): void {
    const content = this.overlay.querySelector("#ns-text-content") as HTMLElement;
    const btn = this.overlay.querySelector("#ns-action-btn") as HTMLButtonElement;
    if (!content || !btn) return;

    content.style.transition = 'opacity 0.6s ease';
    content.style.opacity = '0';

    setTimeout(() => {
      content.textContent = '';
      content.style.opacity = '1';

      if (this.voiceAudio) {
        this.voiceAudio.currentTime = 19;
        this.voiceAudio.play().catch(() => {});
      }

      this.startTypingSound();

      const totalDuration = 34400;
      const delay = Math.floor(totalDuration / this.secondText.length);

      btn.textContent = "تخطي ›";
      btn.style.display = "block";
      btn.onclick = () => {
        if (this.secondTypingInterval) {
          clearInterval(this.secondTypingInterval);
          this.secondTypingInterval = null;
        }
        this.stopTypingSound();
        this.voiceAudio?.pause();
        content.textContent = this.secondText;
        this._showStartButton(btn);
      };

      let i = 0;
      this.secondTypingInterval = setInterval(() => {
        if (i < this.secondText.length) {
          content.textContent += this.secondText[i];
          i++;
        } else {
          clearInterval(this.secondTypingInterval!);
          this.secondTypingInterval = null;
          this.stopTypingSound();

          setTimeout(() => {
            this.voiceAudio?.pause();
            this._showStartButton(btn);
          }, 2000);
        }
      }, delay);

    }, 700);
  }

  // =============================
  //  SCENE INIT
  // =============================
  private initScene() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 0, 4);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x000000, 0);

    this.renderer.domElement.style.position = "absolute";
    this.renderer.domElement.style.top = "0";
    this.renderer.domElement.style.left = "0";
    this.renderer.domElement.style.zIndex = "1";
    this.renderer.domElement.style.pointerEvents = "none";

    const scrollArea = this.overlay.querySelector("#ns-scroll-area") as HTMLElement;
    scrollArea.appendChild(this.renderer.domElement);

    this.addLights();
    this.loadScrollModel();
    this.animate();

    window.addEventListener("resize", this.onResize);
  }

  private onResize = () => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  private addLights() {
    const sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.position.set(2, 5, 5);
    this.scene.add(sun);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  }

  private loadScrollModel() {
    const loader = new GLTFLoader();
    loader.load("/models/paperScrollDone.glb", (gltf: GLTF) => {
      this.scrollMesh = gltf.scene;
      this.scrollMesh.rotation.x = Math.PI / 2;
      this.scrollMesh.rotation.y = Math.PI;
      this.scrollMesh.scale.set(1.6, 1.2, 1.2);
      this.scene.add(this.scrollMesh);

      this.gltfAnimations = gltf.animations;
      this.mixer = new THREE.AnimationMixer(this.scrollMesh);
      this.actions = this.gltfAnimations.map((clip) => {
        const action = this.mixer!.clipAction(clip);
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        return action;
      });

      this.modelReady = true;
      if (this.pendingShow) {
        this.pendingShow = false;
        this._playAndType();
      }
    });
  }

  private playOpenAnimations() {
    if (!this.mixer || this.actions.length === 0) return;
    this.mixerPaused = false;
    this.mixer.stopAllAction();
    this.actions.forEach((action) => action.reset().play());
    
    // Play the scroll sound effect here
    this.playScrollSnippet(1800); // 1.8 seconds of sound

    setTimeout(() => { this.mixerPaused = true; }, 4000);
  }

  // =============================
  //  HTML + CSS
  // =============================
  private createOverlay(): HTMLElement {
    const el = document.createElement("div");
    el.id = "narrative-screen";
    el.innerHTML = `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap');
        #narrative-screen {
          position: fixed; inset: 0; z-index: 9999; display: flex; opacity: 0;
          transition: opacity 1s; pointer-events: none; justify-content: center; align-items: center;
        }
        #narrative-screen.visible { opacity: 1; pointer-events: all; }
        #ns-bg { position: absolute; inset: 0; background-image: url('/images/main-menu-bg.png'); background-size: cover; z-index: 0; }
        #ns-bg-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.55); z-index: 1; }
        #ns-scroll-area { position: relative; z-index: 2; width: 100%; height: 100%; display: flex; justify-content: center; align-items: center; }
        #ns-text-container {
          position: absolute; left: 50%; transform: translateX(-50%);
          top: clamp(20%, 3vw + 15%, 25%); width: clamp(220px, 32vw, 520px);
          font-family: 'Amiri', serif; font-weight: 700; color: #2b1b0a;
          direction: rtl; text-align: right; font-size: clamp(0.62rem, 1.7vw, 6rem);
          line-height: 2.5; overflow: hidden; z-index: 10; pointer-events: none;
        }
        #ns-text-content { display: block; width: 100%; white-space: pre-wrap; word-break: break-word; }
        #ns-action-btn {
          position: absolute; bottom: 20%; left: 50%; transform: translateX(-50%);
          z-index: 20; font-family: 'Amiri', serif; font-size: clamp(0.85rem, 1.2vw, 1.1rem);
          color: #2b1b0a; background: rgba(205,170,100,0.4); border: 2px solid #8b6914;
          border-radius: 8px; padding: 8px 30px; cursor: pointer; transition: all 0.2s;
          display: none; pointer-events: all; white-space: nowrap;
        }
        #ns-action-btn:hover { background: rgba(205,170,100,0.7); transform: translateX(-50%) scale(1.05); }
        @media (max-width: 768px) {
          #ns-text-container { top: clamp(25%, 5vw + 15%, 32%); width: clamp(160px, 52vw, 300px); font-size: clamp(0.6rem, 2.2vw, 0.85rem); }
          #ns-action-btn { bottom: 25%; font-size: clamp(0.75rem, 3vw, 0.95rem); padding: 6px 22px; }
        }
      </style>
      <div id="ns-bg"></div>
      <div id="ns-bg-overlay"></div>
      <div id="ns-scroll-area">
        <div id="ns-text-container"><span id="ns-text-content"></span></div>
        <button id="ns-action-btn">تخطي</button>
      </div>
    `;
    this.container.appendChild(el);
    return el;
  }

  // =============================
  //  SHOW / PLAY
  // =============================
  public show(): void {
    this.overlay.classList.add("visible");
    if (this.modelReady) {
      this._playAndType();
    } else {
      this.pendingShow = true;
    }
  }

  private _playAndType() {
    this.playOpenAnimations();
    setTimeout(() => this._startTyping(), 4000);
  }

  private _startTyping() {
    const content = this.overlay.querySelector("#ns-text-content") as HTMLElement;
    const btn = this.overlay.querySelector("#ns-action-btn") as HTMLButtonElement;
    if (!content || !btn) return;

    content.textContent = "";
    btn.style.display = "block";
    btn.textContent = "تخطي ›";

    this.startTypingSound();

    btn.onclick = () => {
      if (this.typingInterval) { clearInterval(this.typingInterval); this.typingInterval = null; }
      this.stopTypingSound();
      content.textContent = this.text;
      setTimeout(() => this.startVoiceAndSecondText(), 500);
    };

    let i = 0;
    this.typingInterval = setInterval(() => {
      if (i < this.text.length) {
        content.textContent += this.text[i];
        i++;
      } else {
        clearInterval(this.typingInterval!);
        this.typingInterval = null;
        this.stopTypingSound();
        setTimeout(() => this.startVoiceAndSecondText(), 1500);
      }
    }, 40);
  }

  private _showStartButton(btn: HTMLButtonElement): void {
    btn.textContent = "ابدأ المعركة";
    btn.style.display = "block";
    btn.style.fontWeight = "bold";
    btn.onclick = () => {
      this.destroy();
      if (this.onCompleteCallback) this.onCompleteCallback();
    };
  }

  private animate = () => {
    requestAnimationFrame(this.animate);
    if (this.mixer && !this.mixerPaused) this.mixer.update(this.clock.getDelta());
    this.renderer.render(this.scene, this.camera);
  };

  public onComplete(callback: () => void) {
    this.onCompleteCallback = callback;
  }

  public destroy() {
    if (this.typingInterval) clearInterval(this.typingInterval);
    if (this.secondTypingInterval) clearInterval(this.secondTypingInterval);
    this.stopTypingAudio();
    this.stopVoiceAudio();
    if (this.scrollAudio) { this.scrollAudio.pause(); this.scrollAudio = null; }
    window.removeEventListener("resize", this.onResize);
    this.renderer.dispose();
    this.overlay.remove();
  }
}