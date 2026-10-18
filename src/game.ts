import * as THREE from 'three';
import { Input } from './input';
import { Monster } from './monster';
import { createWorld, WORLD_RADIUS, type World } from './world';
import { Combat } from './combat';
import { CombatView } from './combat-view';
import { renderUpgradeCards } from './ui';
import type { SkillId } from './progression';
import { AdaptiveQuality, loadPreferences, savePreferences, type QualityMode } from './quality';
import { GameAudio } from './audio';
import { resize25DCamera, screenToGround, VIEW_25D } from './camera-25d';
import { HORN, type DashStep, type Ruleset } from './trial';

type Mode = 'menu' | 'playing' | 'paused' | 'gameover' | 'upgrading' | 'settings';
const STEP = 1 / 60;
const DASH_COOLDOWN = 1.4;

export class Game {
  private preferences = loadPreferences();
  private quality = new AdaptiveQuality(this.preferences.quality);
  private audio = new GameAudio(this.preferences.music, this.preferences.sound);
  private settingsFromMenu = false;
  private renderTime = 0;
  private jumpHeight = 0;
  private previousJump = 0;
  private jumpVelocity = 0;
  private cameraAnchor = new THREE.Vector3();
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-15, 15, 8.5, -8.5, 0.1, 180);
  // Repaired GLB by default; ?character=sprite / ?character=3d retain both fallbacks.
  private monster = new Monster(new URLSearchParams(window.location.search).get('character') === '3d' ? 'procedural' : new URLSearchParams(window.location.search).get('character') === 'sprite' ? 'sprite' : 'gltf');
  private world: World;
  private combat: Combat;
  private combatView: CombatView;
  private input: Input;
  private mode: Mode = 'menu';
  private runRuleset: Ruleset = 'classic';
  private trialHornMounted = false;
  private dashAttack: DashStep = { active: false, started: false, fromX: 0, fromZ: 0, dx: 0, dz: 1 };
  private position = new THREE.Vector3();
  private previousPosition = new THREE.Vector3();
  private velocity = new THREE.Vector2();
  private groundInput = new THREE.Vector2();
  private dashDirection = new THREE.Vector2(0, 1);
  private cameraTarget = new THREE.Vector3();
  private lookTarget = new THREE.Vector3();
  private facing = 0;
  private elapsed = 0;
  private visualTime = 0;
  private cooldown = 0;
  private dashRemaining = 0;
  private distance = 0;
  private accumulator = 0;
  private lastTime = 0;
  private frameId = 0;
  private disposed = false;
  private contextLost = false;
  private portrait = false;
  private toastTimeout = 0;
  private choiceTimer = 0;
  private offerVersion = 0;
  private cardDown: { pointer: number; skill: SkillId; version: number } | null = null;
  private armedCard: { skill: SkillId; version: number } | null = null;
  private events = new AbortController();
  private timer = document.querySelector<HTMLElement>('#timer')!;
  private dashButton = document.querySelector<HTMLButtonElement>('#dash')!;
  private dashStatus = document.querySelector<HTMLElement>('#dash-status')!;
  private welcome = document.querySelector<HTMLElement>('#welcome')!;
  private boundaryHint = document.querySelector<HTMLElement>('#boundary-hint')!;
  private healthBar = document.querySelector<HTMLElement>('.health-track')!;
  private healthFill = document.querySelector<HTMLElement>('#health-fill')!;
  private healthValue = document.querySelector<HTMLElement>('#health-value')!;
  private killValue = document.querySelector<HTMLElement>('#kill-value')!;
  private xpValue = document.querySelector<HTMLElement>('#xp-value')!;
  private damageOverlay = document.querySelector<HTMLElement>('#damage-overlay')!;
  private trails: { mesh: THREE.Mesh; remaining: number }[] = [];

  constructor() {
    const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas')!;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor('#ddf0cd');
    this.scene.background = new THREE.Color('#ddf0cd');
    this.scene.fog = new THREE.Fog('#ddf0cd', 40, 115);
    this.scene.add(new THREE.HemisphereLight('#fff4dc', '#6b9364', 2.15));
    const sun = new THREE.DirectionalLight('#fff0d0', 2.05);
    sun.position.set(-10, 18, 12);
    this.scene.add(sun);
    this.world = createWorld();
    this.scene.add(this.world.group, this.monster.root);
    this.combat = new Combat(this.world.obstacles, WORLD_RADIUS - 0.7);
    this.combatView = new CombatView(this.combat);
    this.scene.add(this.combatView.group);
    const trailGeometry = new THREE.RingGeometry(0.4, 0.5, 12);
    for (let i = 0; i < 7; i++) {
      const mesh = new THREE.Mesh(trailGeometry, new THREE.MeshBasicMaterial({ color: '#e5f2b2', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      this.trails.push({ mesh, remaining: 0 });
      this.scene.add(mesh);
    }
    this.input = new Input(document.querySelector<HTMLElement>('#joystick')!, this.dashButton);
    this.bindEvents(canvas);
    this.syncSettings();
    this.resize();
    this.placeCamera(true);
    this.wake();
  }

  private bindEvents(canvas: HTMLCanvasElement) {
    const options = { signal: this.events.signal };
    const click = (id: string, callback: () => void) => document.getElementById(id)!.addEventListener('click', callback, options);
    for (const id of ['settings', 'menu-settings', 'pause-settings']) click(id, () => this.openSettings());
    for (const id of ['close-settings', 'save-settings']) click(id, () => this.closeSettings());
    document.getElementById('quality')!.addEventListener('change', () => {
      this.preferences.quality = (document.getElementById('quality') as HTMLSelectElement).value as QualityMode;
      this.quality.setMode(this.preferences.quality); this.applyGraphics(); this.saveSettings();
    }, options);
    for (const id of ['music-toggle', 'sound-toggle']) document.getElementById(id)!.addEventListener('change', () => {
      this.preferences.music = (document.getElementById('music-toggle') as HTMLInputElement).checked;
      this.preferences.sound = (document.getElementById('sound-toggle') as HTMLInputElement).checked;
      this.audio.configure(this.preferences.music, this.preferences.sound); this.saveSettings();
    }, options);
    click('start', () => this.start('classic'));
    click('start-trial', () => this.start('horn-trial'));
    click('pause', () => this.pause('草原会在这里等你。'));
    click('resume', () => this.resume());
    click('back-menu', () => this.showMenu());
    click('restart', () => this.start());
    click('gameover-restart', () => this.start());
    click('gameover-menu', () => this.showMenu());
    click('upgrade-menu', () => this.showMenu());
    const upgradeScreen = document.getElementById('upgrade-screen')!;
    const cardFrom = (event: Event) => (event.target instanceof Element ? event.target.closest<HTMLButtonElement>('.skill-card') : null);
    upgradeScreen.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      const card = cardFrom(event);
      this.armedCard = null;
      this.cardDown = this.mode === 'upgrading' && card && !card.disabled
        ? { pointer: event.pointerId, skill: card.dataset.skill as SkillId, version: Number(card.dataset.offer) } : null;
    }, options);
    upgradeScreen.addEventListener('pointerup', (event) => {
      event.stopPropagation();
      const card = cardFrom(event);
      this.armedCard = card && this.cardDown?.pointer === event.pointerId && this.cardDown.skill === card.dataset.skill
        ? { skill: this.cardDown.skill, version: this.cardDown.version } : null;
      this.cardDown = null;
    }, options);
    upgradeScreen.addEventListener('pointercancel', () => { this.cardDown = null; this.armedCard = null; }, options);
    upgradeScreen.addEventListener('click', (event) => {
      event.stopPropagation();
      const card = cardFrom(event);
      if (!card || card.disabled) return;
      const skill = card.dataset.skill as SkillId, version = Number(card.dataset.offer);
      // A pointer must start AND finish on the current card. A joystick finger
      // released above a new dialog, or a stale queued click, cannot select it.
      const intentional = event.detail === 0 || (this.armedCard?.skill === skill && this.armedCard.version === version);
      this.armedCard = null;
      if (intentional && version === this.offerVersion) this.chooseUpgrade(skill);
    }, options);
    click('help', () => { document.getElementById('help-screen')!.hidden = false; document.getElementById('close-help')!.focus(); });
    click('close-help', () => { document.getElementById('help-screen')!.hidden = true; document.getElementById('help')!.focus(); });
    click('fullscreen', () => { void this.toggleFullscreen(); });
    const fullscreen = document.getElementById('fullscreen')!;
    fullscreen.hidden = !document.fullscreenEnabled;
    document.addEventListener('fullscreenchange', () => {
      fullscreen.setAttribute('aria-label', document.fullscreenElement ? '退出全屏' : '切换全屏');
      this.resize();
    }, options);
    window.addEventListener('resize', () => this.resize(), options);
    window.visualViewport?.addEventListener('resize', () => this.resize(), options);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.cardDown = this.armedCard = null;
        this.pause('刚才切到了后台，游戏已自动暂停。');
        this.input.reset();
        this.sleep();
      } else {
        this.wake();
      }
    }, options);
    window.addEventListener('blur', () => { this.audio.setActive(false); this.cardDown = this.armedCard = null; this.pause('窗口失去焦点，游戏已暂停。'); }, options);
    window.addEventListener('pagehide', () => { this.pause('游戏已暂停，准备好后继续。'); this.sleep(); }, options);
    window.addEventListener('pageshow', () => this.wake(), options);
    window.addEventListener('keydown', (event) => {
      if (event.code !== 'Escape') return;
      if (this.mode === 'settings') { this.closeSettings(); return; }
      if (!document.getElementById('help-screen')!.hidden) {
        document.getElementById('help-screen')!.hidden = true;
      } else if (this.mode === 'playing') this.pause('草原会在这里等你。');
      else if (this.mode === 'paused') this.resume();
    }, options);
    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.contextLost = true;
      this.pause('图形资源已中断。');
      this.sleep();
      showError('浏览器中断了 3D 画面，请点击重新加载恢复游戏。');
    }, options);
  }

  private syncSettings() {
    (document.getElementById('quality') as HTMLSelectElement).value = this.preferences.quality;
    (document.getElementById('music-toggle') as HTMLInputElement).checked = this.preferences.music;
    (document.getElementById('sound-toggle') as HTMLInputElement).checked = this.preferences.sound;
    document.getElementById('audio-status')!.textContent = this.audio.inspect().supported && this.audio.inspect().state !== 'unavailable' ? '点击开始冒险后启用声音' : '当前浏览器未提供音频，仍可正常游戏';
    document.getElementById('quality-description')!.textContent = this.preferences.quality === 'battery'
      ? '降低清晰度与装饰数量，以 30 帧为目标。' : this.preferences.quality === 'high'
      ? '更清晰的画面，以 60 帧为目标；负载较高时仍会降低像素比。' : '根据运行负载调整清晰度，必要时转为 30 帧目标。';
  }

  private saveSettings() { savePreferences(this.preferences); this.syncSettings(); }

  private applyGraphics() {
    this.renderer.setPixelRatio(this.quality.pixelRatio(window.devicePixelRatio, window.innerWidth, window.innerHeight));
    this.combatView.detail = this.quality.particles;
    for (const name of ['grass', 'flower', 'whiteFlower', 'pinkFlower', 'stem']) {
      const mesh = this.world.group.getObjectByName(`scenery-${name}`) as THREE.InstancedMesh | undefined;
      if (!mesh) continue;
      mesh.userData.fullCount ??= mesh.count;
      mesh.count = Math.floor(mesh.userData.fullCount * (this.quality.particles === 2 ? 0.55 : 1));
    }
  }

  private openSettings() {
    if (!['menu', 'paused', 'playing'].includes(this.mode)) return;
    this.syncSettings();
    this.settingsFromMenu = this.mode === 'menu';
    this.pause('设置已保存，准备好后继续冒险。');
    this.mode = 'settings'; this.input.setEnabled(false); this.sleep();
    document.getElementById('pause-screen')!.hidden = true;
    document.getElementById('settings-screen')!.hidden = false;
    document.getElementById('hud')!.inert = true; document.getElementById('menu')!.inert = true;
    document.getElementById('close-settings')!.focus({ preventScroll: true });
  }

  private closeSettings() {
    if (this.mode !== 'settings') return;
    document.getElementById('settings-screen')!.hidden = true;
    document.getElementById('hud')!.inert = false; document.getElementById('menu')!.inert = false;
    (document.activeElement as HTMLElement | null)?.blur();
    this.mode = this.settingsFromMenu ? 'menu' : 'paused';
    if (this.mode === 'paused') document.getElementById('pause-screen')!.hidden = false;
    else this.wake();
  }

  private start(ruleset: Ruleset = this.runRuleset) {
    if (this.portrait || this.contextLost) return;
    this.runRuleset = ruleset;
    this.audio.setActive(true); this.audio.unlock();
    this.position.set(0, 0, 0);
    this.previousPosition.copy(this.position);
    this.monster.root.position.copy(this.position);
    this.velocity.set(0, 0);
    this.facing = 0;
    this.jumpHeight = this.previousJump = this.jumpVelocity = 0;
    this.elapsed = this.cooldown = this.dashRemaining = this.distance = 0;
    this.combat.reset(ruleset);
    if (this.trialHornMounted) this.monster.unequipOrgan('head');
    this.trialHornMounted = ruleset === 'horn-trial';
    if (this.trialHornMounted) this.monster.equipOrgan('charge-horns');
    for (const trail of this.trails) (trail.mesh.material as THREE.MeshBasicMaterial).color.set(this.combat.isTrial ? '#ffd58a' : '#e5f2b2');
    this.monster.resetVisual();
    this.hideUpgrade();
    this.combatView.clear();
    this.combatView.group.visible = true;
    this.monster.body.visible = true;
    this.trails.forEach((trail) => { trail.remaining = 0; trail.mesh.visible = false; });
    this.mode = 'playing';
    this.input.setEnabled(true);
    document.getElementById('menu')!.hidden = true;
    document.getElementById('hud')!.hidden = false;
    document.getElementById('pause-screen')!.hidden = true;
    document.getElementById('help-screen')!.hidden = true;
    document.getElementById('gameover-screen')!.hidden = true;
    (document.activeElement as HTMLElement | null)?.blur();
    this.welcome.classList.remove('faded');
    this.welcome.querySelector('h2')!.textContent = this.combat.isTrial ? '犄角已就绪，冲出一条路。' : '小小魔法，准备就绪。';
    this.welcome.querySelector('p')!.textContent = this.combat.isTrial ? '冲刺命中可击退和打断 · 留意黄色扑击预警线' : '移动躲避敌人，焰绒会自动施法 · 靠近拾取经验';
    this.accumulator = 0;
    this.placeCamera(true);
    this.updateHUD();
    this.wake();
  }

  private pause(reason: string) {
    if (this.mode !== 'playing') return;
    this.mode = 'paused';
    this.input.setEnabled(false);
    this.velocity.set(0, 0);
    this.previousPosition.copy(this.position);
    this.monster.root.position.copy(this.position);
    this.accumulator = 0;
    document.getElementById('pause-screen')!.hidden = false;
    document.getElementById('pause-reason')!.textContent = reason;
    this.sleep();
    if (!document.hidden && !this.portrait && !this.contextLost) this.renderer.render(this.scene, this.camera);
  }

  private resume() {
    if (this.mode !== 'paused' || document.hidden || this.portrait || this.contextLost) return;
    this.audio.setActive(true); this.audio.unlock();
    this.mode = 'playing';
    this.input.setEnabled(true);
    document.getElementById('pause-screen')!.hidden = true;
    (document.activeElement as HTMLElement | null)?.blur();
    this.wake();
  }

  private showMenu() {
    this.runRuleset = 'classic';
    if (this.trialHornMounted) this.monster.unequipOrgan('head');
    this.trialHornMounted = false;
    this.monster.resetVisual();
    this.mode = 'menu';
    this.jumpHeight = this.previousJump = this.jumpVelocity = 0;
    this.input.setEnabled(false);
    this.position.set(0, 0, 0);
    this.previousPosition.copy(this.position);
    this.monster.root.position.copy(this.position);
    this.velocity.set(0, 0);
    this.dashRemaining = 0;
    this.combat.reset('classic');
    this.hideUpgrade();
    this.combatView.clear();
    this.combatView.group.visible = false;
    this.monster.body.visible = true;
    this.damageOverlay.style.opacity = '0';
    this.trails.forEach((trail) => { trail.remaining = 0; trail.mesh.visible = false; });
    document.getElementById('menu')!.hidden = false;
    document.getElementById('hud')!.hidden = true;
    document.getElementById('pause-screen')!.hidden = true;
    document.getElementById('gameover-screen')!.hidden = true;
    this.placeCamera(true);
    this.wake();
  }

  private resize() {
    const width = window.innerWidth, height = window.innerHeight;
    this.portrait = height > width;
    if (this.portrait) {
      this.cardDown = this.armedCard = null;
      this.pause('手机转成了竖屏，游戏已自动暂停。');
      this.input.reset();
      this.sleep();
    }
    resize25DCamera(this.camera, width / Math.max(1, height), this.mode === 'menu');
    this.applyGraphics();
    this.renderer.setSize(width, height, false);
    this.placeCamera(true);
    if (!this.portrait && !document.hidden && !this.contextLost) {
      this.renderer.render(this.scene, this.camera);
      this.wake();
    }
  }

  private step(dt: number) {
    if (this.combat.progression.awaitingChoice) { this.openUpgrade(); return; }
    this.previousPosition.copy(this.position);
    this.previousJump = this.jumpHeight;
    if (this.input.consumeJump() && this.jumpHeight === 0) { this.jumpVelocity = 6; this.audio.play('jump'); }
    if (this.jumpHeight > 0 || this.jumpVelocity > 0) {
      this.jumpVelocity -= 22 * dt;
      this.jumpHeight = Math.max(0, this.jumpHeight + this.jumpVelocity * dt);
      if (this.jumpHeight === 0) this.jumpVelocity = 0;
    }
    const screenInput = this.input.sample();
    // All simulation stays on XZ; only visuals use height, including cosmetic J.
    const movement = screenToGround(screenInput.x, screenInput.y, this.groundInput);
    const magnitude = Math.hypot(movement.x, movement.y);
    this.dashAttack.started = false;
    this.elapsed += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.dashRemaining = Math.max(0, this.dashRemaining - dt);
    if (this.input.consumeDash() && this.cooldown === 0) {
      this.dashDirection.set(movement.x, movement.y);
      if (magnitude < 0.05) this.dashDirection.set(Math.sin(this.facing), Math.cos(this.facing));
      this.dashDirection.normalize();
      this.cooldown = DASH_COOLDOWN;
      this.dashRemaining = 0.19;
      this.dashAttack.started = true;
      this.audio.play('dash');
    }
    const dashing = this.dashRemaining > 0;
    if (dashing) {
      const progress = 1 - this.dashRemaining / 0.19;
      this.velocity.copy(this.dashDirection).multiplyScalar(11 + 6 * Math.sin(Math.PI * progress));
      const trail = this.trails.find((particle) => particle.remaining === 0);
      if (trail) {
        trail.remaining = 0.26;
        trail.mesh.position.set(this.position.x, 0.06, this.position.z);
        trail.mesh.visible = true;
      }
    } else {
      const blend = 1 - Math.exp(-18 * dt);
      const speed = 4.6 * this.combat.stats.moveMultiplier;
      this.velocity.x += (movement.x * speed - this.velocity.x) * blend;
      this.velocity.y += (movement.y * speed - this.velocity.y) * blend;
    }
    const dx = this.velocity.x * dt, dz = this.velocity.y * dt;
    this.position.x += dx;
    this.position.z += dz;
    // Circle collisions allow sliding around trunks and rocks.
    for (const obstacle of this.world.obstacles) {
      const x = this.position.x - obstacle.x, z = this.position.z - obstacle.z;
      const radius = obstacle.radius + 0.62;
      const length = Math.hypot(x, z);
      if (length < radius) {
        this.position.x = obstacle.x + (length > 0.0001 ? x / length : 1) * radius;
        this.position.z = obstacle.z + (length > 0.0001 ? z / length : 0) * radius;
      }
    }
    const radius = Math.hypot(this.position.x, this.position.z);
    if (radius > WORLD_RADIUS - 0.7) this.position.multiplyScalar((WORLD_RADIUS - 0.7) / radius);
    this.distance += this.position.distanceTo(this.previousPosition);
    if (this.velocity.lengthSq() > 0.05) {
      const target = Math.atan2(this.velocity.x, this.velocity.y);
      const delta = Math.atan2(Math.sin(target - this.facing), Math.cos(target - this.facing));
      this.facing += delta * (1 - Math.exp(-16 * dt));
    }
    this.trails.forEach((trail) => {
      trail.remaining = Math.max(0, trail.remaining - dt);
      trail.mesh.visible = trail.remaining > 0;
      if (trail.mesh.visible) {
        (trail.mesh.material as THREE.MeshBasicMaterial).opacity = trail.remaining * 1.7;
        trail.mesh.scale.setScalar(1.3 - trail.remaining);
      }
    });
    const shots = this.combat.shotsFired, hits = this.combat.hits, collected = this.combat.collected, hp = this.combat.hp;
    this.dashAttack.active = dashing;
    this.dashAttack.fromX = this.previousPosition.x; this.dashAttack.fromZ = this.previousPosition.z;
    this.dashAttack.dx = this.dashDirection.x; this.dashAttack.dz = this.dashDirection.y;
    this.combat.update(dt, this.position, this.dashAttack);
    if (this.combat.shotsFired > shots) this.audio.play('cast');
    if (this.combat.hits > hits) this.audio.play('hit');
    if (this.combat.collected > collected) this.audio.play('collect');
    if (this.combat.hp < hp) this.audio.play('hurt');
    if (this.combat.hp === 0) this.endRun();
    else if (this.combat.progression.awaitingChoice) this.openUpgrade();
  }

  private openUpgrade() {
    this.mode = 'upgrading';
    this.input.setEnabled(false);
    this.velocity.set(0, 0);
    this.dashRemaining = 0;
    this.previousPosition.copy(this.position);
    this.monster.root.position.copy(this.position);
    this.accumulator = 0;
    this.sleep();
    (document.getElementById('hud') as HTMLElement).inert = true;
    document.getElementById('upgrade-screen')!.hidden = false;
    this.renderChoices();
  }

  private renderChoices() {
    clearTimeout(this.choiceTimer);
    this.cardDown = this.armedCard = null;
    const version = ++this.offerVersion;
    renderUpgradeCards(this.combat.progression, version);
    document.getElementById('upgrade-panel')!.focus({ preventScroll: true });
    // This UI-only delay blocks a tap already in progress or a rapid double tap
    // from consuming a new offer. Combat clocks stay completely stopped.
    this.choiceTimer = window.setTimeout(() => {
      if (this.mode !== 'upgrading' || version !== this.offerVersion || this.disposed) return;
      document.querySelectorAll<HTMLButtonElement>('.skill-card').forEach((card) => { card.disabled = false; });
    }, 180);
  }

  private chooseUpgrade(id: SkillId) {
    if (this.mode !== 'upgrading' || document.hidden || this.portrait || this.contextLost) return;
    if (!this.combat.chooseUpgrade(id)) return;
    this.updateHUD();
    if (this.combat.progression.awaitingChoice) {
      this.renderChoices();
    } else {
      this.hideUpgrade();
      this.mode = 'playing';
      this.input.setEnabled(true);
      (document.activeElement as HTMLElement | null)?.blur();
      this.wake();
      this.audio.play('level');
    }
  }

  private hideUpgrade() {
    clearTimeout(this.choiceTimer);
    this.offerVersion++;
    this.cardDown = this.armedCard = null;
    document.getElementById('upgrade-screen')!.hidden = true;
    document.getElementById('upgrade-cards')!.replaceChildren();
    document.getElementById('hud')!.inert = false;
  }

  private endRun() {
    this.hideUpgrade();
    this.mode = 'gameover';
    this.audio.setActive(false);
    this.input.setEnabled(false);
    this.velocity.set(0, 0);
    this.previousPosition.copy(this.position);
    this.accumulator = 0;
    this.monster.body.visible = true;
    document.getElementById('result-time')!.textContent = this.formatTime();
    document.getElementById('result-kills')!.textContent = String(this.combat.kills);
    document.getElementById('result-xp')!.textContent = String(this.combat.xp);
    document.getElementById('gameover-screen')!.hidden = false;
  }

  private formatTime() {
    return `${String(Math.floor(this.elapsed / 60)).padStart(2, '0')}:${String(Math.floor(this.elapsed % 60)).padStart(2, '0')}`;
  }

  private updateHUD() {
    const trialStatus = document.getElementById('trial-status')!;
    trialStatus.hidden = !this.combat.isTrial;
    document.getElementById('hud')!.classList.toggle('horn-trial', this.combat.isTrial);
    if (this.combat.isTrial) {
      document.getElementById('trial-title')!.textContent = this.combat.hornHits >= HORN.goal ? '试炼目标达成 · 继续练习' : '冲锋犄角 · 开局已装备';
      const progress = `冲锋命中 ${this.combat.hornHits}/${HORN.goal} · 打断 ${this.combat.interrupts}`;
      const counter = document.getElementById('trial-progress')!;
      if (counter.textContent !== progress) counter.textContent = progress;
    }
    const time = this.formatTime();
    if (this.timer.textContent !== time) this.timer.textContent = time;
    const ready = 1 - this.cooldown / DASH_COOLDOWN;
    this.dashButton.style.setProperty('--ready', `${ready * 100}%`);
    this.dashButton.classList.toggle('cooling', this.cooldown > 0);
    this.dashButton.setAttribute('aria-disabled', String(this.cooldown > 0));
    this.dashStatus.textContent = this.cooldown > 0 ? `${this.cooldown.toFixed(1)}s` : '就绪';
    this.welcome.classList.toggle('faded', this.elapsed > 5 || this.distance > 8);
    this.boundaryHint.hidden = Math.hypot(this.position.x, this.position.z) < WORLD_RADIUS - 1.2;
    const hp = this.combat.hp, maxHp = this.combat.maxHp;
    this.healthValue.textContent = `${hp} / ${maxHp}`;
    this.healthFill.style.width = `${hp / maxHp * 100}%`;
    this.healthBar.setAttribute('aria-valuemax', String(maxHp));
    this.healthBar.setAttribute('aria-valuenow', String(hp));
    this.healthBar.classList.toggle('low-health', hp / maxHp <= 0.3);
    this.killValue.textContent = String(this.combat.kills);
    this.xpValue.textContent = String(this.combat.xp);
    const progression = this.combat.progression, maxed = !Number.isFinite(progression.threshold);
    document.getElementById('level-value')!.textContent = `Lv. ${String(progression.level).padStart(2, '0')}${maxed ? ' MAX' : ''}`;
    document.getElementById('xp-progress')!.textContent = maxed ? 'MAX' : `${progression.experience} / ${progression.threshold}`;
    document.getElementById('xp-fill')!.style.width = `${maxed ? 100 : progression.experience / progression.threshold * 100}%`;
    const xpTrack = document.getElementById('xp-track')!;
    xpTrack.setAttribute('aria-valuemax', String(maxed ? 1 : progression.threshold));
    xpTrack.setAttribute('aria-valuenow', String(maxed ? 1 : progression.experience));
    this.damageOverlay.style.opacity = String(this.combat.hurtFlash / 0.25 * 0.7);
  }

  private placeCamera(snap = false, dt = STEP) {
    const player = this.monster.root.position;
    resize25DCamera(this.camera, window.innerWidth / Math.max(1, window.innerHeight), this.mode === 'menu');
    this.monster.updateView(window.innerHeight, this.camera.top - this.camera.bottom, this.mode === 'menu');
    if (this.mode === 'menu') {
      this.lookTarget.set(-3.2, 0.8, 0);
      this.monster.body.rotation.y = 0.55 + Math.sin(this.visualTime * 0.35) * 0.09;
    } else {
      this.lookTarget.set(player.x, 0.6, player.z);
      this.monster.body.rotation.y = this.facing;
    }
    if (snap) this.cameraAnchor.copy(this.lookTarget);
    else this.cameraAnchor.lerp(this.lookTarget, 1 - Math.exp(-7 * dt));
    this.cameraTarget.set(0, VIEW_25D.distance * Math.sin(VIEW_25D.pitch), VIEW_25D.distance * Math.cos(VIEW_25D.pitch)).add(this.cameraAnchor);
    this.camera.position.copy(this.cameraTarget);
    // Position and look point share one smoothed anchor, so pitch never changes.
    this.camera.lookAt(this.cameraAnchor);
  }

  private frame = (time: number) => {
    this.frameId = 0;
    if (this.disposed || document.hidden || this.portrait || this.contextLost || (this.mode !== 'menu' && this.mode !== 'playing')) return;
    const rawDt = this.lastTime ? (time - this.lastTime) / 1000 : 0;
    const dt = rawDt ? Math.min(rawDt, STEP * 5) : STEP;
    this.lastTime = time;
    if (this.quality.sample(rawDt)) this.applyGraphics();
    this.visualTime += dt;
    if (this.mode === 'playing') {
      this.accumulator += dt;
      while (this.mode === 'playing' && this.accumulator >= STEP) {
        this.accumulator -= STEP; this.step(STEP);
      }
    }
    const draw = !this.renderTime || time - this.renderTime >= 1000 / this.quality.targetFps - 1 || (this.mode !== 'playing' && this.mode !== 'menu');
    if (draw) {
      const renderDt = this.renderTime ? Math.min((time - this.renderTime) / 1000, STEP * 5) : dt;
      this.renderTime = time;
      if (this.mode !== 'menu') {
        this.monster.root.position.lerpVectors(this.previousPosition, this.position, this.accumulator / STEP);
        this.updateHUD();
        this.combatView.render(this.accumulator / STEP, this.visualTime, this.monster.root.position);
        this.monster.body.visible = true;
      }
    this.monster.animate(renderDt, Math.min(1, this.velocity.length() / 4.6), this.dashRemaining > 0, this.visualTime, THREE.MathUtils.lerp(this.previousJump, this.jumpHeight, this.accumulator / STEP), this.combat.hurtFlash / 0.25);
      this.placeCamera(false, renderDt);
      this.renderer.render(this.scene, this.camera);
    }
    if (this.mode === 'menu' || this.mode === 'playing') this.frameId = window.requestAnimationFrame(this.frame);
  };

  private wake() {
    if (this.frameId || this.disposed || document.hidden || this.portrait || this.contextLost || (this.mode !== 'menu' && this.mode !== 'playing')) return;
    this.lastTime = this.renderTime = 0;
    this.quality.resetSamples();
    this.audio.setActive(true);
    this.accumulator = 0;
    this.frameId = window.requestAnimationFrame(this.frame);
  }

  private sleep() {
    this.audio.setActive(false);
    this.quality.resetSamples();
    window.cancelAnimationFrame(this.frameId);
    this.frameId = 0;
    this.lastTime = 0;
    this.accumulator = 0;
  }

  private async toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      const toast = document.getElementById('toast')!;
      toast.textContent = '当前浏览器暂不支持全屏，可直接横屏游玩。';
      toast.hidden = false;
      clearTimeout(this.toastTimeout);
      this.toastTimeout = window.setTimeout(() => { toast.hidden = true; }, 3000);
    }
  }

  /** Read-only development diagnostics, omitted from production by main.ts. */
  inspect() {
    return {
      mode: this.mode,
      ruleset: this.runRuleset,
      position: { x: this.position.x, z: this.position.z },
      movement: { ...this.input.movement },
      elapsed: this.elapsed, cooldown: this.cooldown, distance: this.distance,
      jumpHeight: this.jumpHeight,
      graphics: { mode: this.quality.mode, scale: this.quality.scale, targetFps: this.quality.targetFps, pixelRatio: this.renderer.getPixelRatio(), particles: this.combatView.detail },
      audio: this.audio.inspect(),
      camera: { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z, type: this.camera.type, pitch: VIEW_25D.pitch * 180 / Math.PI, quaternion: this.camera.quaternion.toArray(), width: this.camera.right - this.camera.left, height: this.camera.top - this.camera.bottom },
      creature: this.monster.inspect(),
      portrait: this.portrait, rendering: !!this.frameId,
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
      combat: this.combat.inspect(),
    };
  }

  dispose() {
    this.disposed = true;
    this.sleep();
    clearTimeout(this.toastTimeout);
    clearTimeout(this.choiceTimer);
    this.events.abort();
    this.input.dispose();
    this.monster.dispose();
    this.audio.dispose();
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      const list = Array.isArray(object.material) ? object.material : [object.material];
      list.forEach((material) => {
        materials.add(material);
        Object.values(material).forEach((value) => { if (value instanceof THREE.Texture) textures.add(value); });
      });
      if (object instanceof THREE.InstancedMesh) object.dispose();
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    textures.forEach((texture) => texture.dispose());
    this.scene.clear();
    this.renderer.dispose();
  }
}

export function showError(message: string) {
  document.getElementById('error-screen')!.hidden = false;
  document.getElementById('error-message')!.textContent = message;
}
