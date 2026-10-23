import {type WeaponPairId} from './weapon-pair-fusion';
import {renderWeaponPairPicker} from './ui';
import * as THREE from 'three';
import { Input } from './input';
import { Monster } from './monster';
import { createWorld, type World } from './world';
import { ARENA_HALF_EXTENT, clampToRectangularBoundary, PLAYER_COLLISION_RADIUS } from './arena-boundary';
import { Combat } from './combat';
import { CombatView } from './combat-view';
import { renderUpgradeCards, setFusionIcons, renderBuildSummary, renderRunShop, renderRunResult, renderResultOutcome, renderWeaponCooldowns, renderHudWeaponIcons, renderEncounterStatus, renderEndlessBestMenu, renderEndlessBestResult } from './ui';
import { elementalClip, type ElementalFusionId } from './fusion-pixels';
import type { SkillId } from './progression';
import { ENDLESS_FLAG_WARNING_SECONDS, RunFlow } from './run-flow';
import { recordEndlessRun } from './endless-record';
import { ATTACKS } from './run-build';
import { AdaptiveQuality, loadPreferences, savePreferences, normalizeGameSpeed, type QualityMode } from './quality';
import { GameAudio } from './audio';
import { resize25DCamera, screenToGround, VIEW_25D } from './camera-25d';
import { HORN, type DashStep, type Ruleset } from './trial';
import { Challenge, CHALLENGE, CHALLENGE_WAVES } from './challenge';
import { PartySystem, CREATURES, type SpeciesId } from './party';
import { PIXEL_CREATURE_ASSETS } from './pixel-sprite';
import { PartyView } from './party-view';

type Mode = 'menu' | 'playing' | 'paused' | 'gameover' | 'upgrading' | 'settings' | 'shop';
const STEP = 1 / 60;
const DASH_COOLDOWN = 3;

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
  // Match the production pixel-art presentation by default. Alternate 3D visuals remain opt-in.
  private monster = new Monster(new URLSearchParams(window.location.search).get('character') === '3d' ? 'procedural' : new URLSearchParams(window.location.search).get('character') === 'gltf' ? 'gltf' : 'sprite');
  private party = new PartySystem();
  private pixelPartyEnabled = new URLSearchParams(window.location.search).get('partyVisual') !== 'legacy';
  private partyView = new PartyView(this.party, this.pixelPartyEnabled);
  private partyPrototype = false;
  private startupPending = false;
  private worldEntered = false;
  private selectedSpecies: SpeciesId = 'yanrong';
  private prototypeVariant: 'sample' | 'fusion' | 'legacy-party' | 'infinite' = 'sample';
  private world: World;
  private combat: Combat;
  private combatView: CombatView;
  private input: Input;
  private mode: Mode = 'menu';
  private runRuleset: Ruleset = 'classic';
  private challenge?: Challenge;
  private run?: RunFlow;
  private outcome: 'victory' | 'defeat' | null = null;
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
  private intermissionHudSecond = -1;
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
    this.world = createWorld(texture => {
      if (!this.contextLost && !this.disposed) this.renderer.initTexture(texture);
    });
    this.scene.add(this.world.group, this.monster.root, this.partyView.group);
    this.monster.root.visible = false;
    this.combat = new Combat(this.world.obstacles, ARENA_HALF_EXTENT);
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
    const dev = new URLSearchParams(window.location.search).get('fusionDev');
    this.selectedSpecies = dev === 'paopaoyuan' ? 'bubblesalamander' : dev === 'yacishou' ? 'sproutspike' : 'yanrong';
    this.syncCreatureSelection();
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
    click('game-speed', () => {
      if (this.mode !== 'playing') return;
      const steps = [1, 2, 3, 5, 10];
      this.preferences.gameSpeed = steps.find(speed => speed > this.preferences.gameSpeed) ?? 1;
      this.saveSettings();
      document.getElementById('game-speed')!.blur();
    });
    document.getElementById('game-speed-setting')!.addEventListener('change', () => {
      this.preferences.gameSpeed = normalizeGameSpeed(Number((document.getElementById('game-speed-setting') as HTMLSelectElement).value));
      this.saveSettings();
    }, options);
    document.getElementById('quality')!.addEventListener('change', () => {
      this.preferences.quality = (document.getElementById('quality') as HTMLSelectElement).value as QualityMode;
      this.quality.setMode(this.preferences.quality); this.applyGraphics(); this.saveSettings();
    }, options);
    for (const id of ['music-toggle', 'sound-toggle']) document.getElementById(id)!.addEventListener('change', () => {
      this.preferences.music = (document.getElementById('music-toggle') as HTMLInputElement).checked;
      this.preferences.sound = (document.getElementById('sound-toggle') as HTMLInputElement).checked;
      this.audio.configure(this.preferences.music, this.preferences.sound); this.saveSettings();
    }, options);
    click('start-infinite', () => this.start('classic', true, true, 'infinite'));
    click('start-fusion', () => this.start('classic', true, true, 'fusion'));
    click('choose-creature', () => {
      document.getElementById('menu')!.inert = true;
      for (const image of document.querySelectorAll<HTMLImageElement>('[data-creature-src]')) if (!image.src) image.src = image.dataset.creatureSrc!;
      document.getElementById('creature-picker')!.hidden = false;
      document.querySelector<HTMLButtonElement>(`[data-creature="${this.selectedSpecies}"]`)!.focus();
    });
    click('close-creature-picker', () => this.closeCreaturePicker());
    click('start-selected-creature', () => this.start('classic', true, true, 'fusion'));
    document.getElementById('creature-picker')!.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.stopPropagation(); this.closeCreaturePicker(); }
    }, options);
    for (const species of ['yanrong', 'bubblesalamander', 'sproutspike'] as const) {
      document.querySelector<HTMLButtonElement>(`[data-creature="${species}"]`)!.addEventListener('click', () => { this.selectedSpecies = species; this.syncCreatureSelection(); }, options);
    }
    const closeLegacy = () => {
      document.getElementById('legacy-picker')!.hidden = true;
      document.getElementById('menu')!.inert = false;
      document.getElementById('open-legacy')!.focus();
    };
    click('open-legacy', () => {
      document.getElementById('menu')!.inert = true;
      document.getElementById('legacy-picker')!.hidden = false;
      document.getElementById('start')!.focus();
    });
    click('close-legacy', closeLegacy);
    document.getElementById('legacy-picker')!.addEventListener('keydown', event => {
      if(event.key==='Tab'){
        const buttons=Array.from(document.querySelectorAll<HTMLButtonElement>('#legacy-picker button'));
        if(event.shiftKey&&document.activeElement===buttons[0]){event.preventDefault();buttons[buttons.length-1]!.focus();}
        else if(!event.shiftKey&&document.activeElement===buttons[buttons.length-1]){event.preventDefault();buttons[0].focus();}
      }
    }, options);
    for(const id of ['start','start-trial','start-challenge'])click(id,closeLegacy);
    click('start', () => this.start('classic', false));
    click('start-trial', () => this.start('horn-trial', false));
    click('start-challenge', () => this.start('horn-challenge', false));
    click('weapon-pair-cancel',()=>{
      document.getElementById('upgrade-panel')!.classList.remove('choosing-pair');
      document.getElementById('weapon-pair-picker')!.hidden=true;
      document.getElementById('upgrade-cards')!.hidden=false;
      document.querySelector<HTMLButtonElement>('[data-skill="weapon-pair-fusion"]')?.focus();
    });
    document.getElementById('weapon-pair-options')!.addEventListener('click',event=>{
      const button=event.target instanceof Element?event.target.closest<HTMLButtonElement>('[data-pair]'):null;
      if(this.mode!=='upgrading'||!button||document.hidden||!this.combat.confirmWeaponPair(button.dataset.pair as WeaponPairId))return;
      this.finishUpgradeChoice();
    },options);
    click('pause', () => this.pause('草原会在这里等你。'));
    click('resume', () => this.resume());
    click('back-menu', () => this.showMenu());
    click('restart', () => this.start());
    click('gameover-restart', () => this.start());
    click('gameover-menu', () => this.showMenu());
    click('upgrade-menu', () => this.showMenu());
    click('shop-menu', () => this.showMenu());
    document.getElementById('shop-items')!.addEventListener('click', event => {
      const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-buy]') : null;
      if (this.mode !== 'shop' || !button || button.disabled || !this.canShop()) return;
      const bought = this.run?.buy(Number(button.dataset.buy), button.dataset.shopToken!);
      document.getElementById('shop-message')!.textContent = bought ? '已购买' : '商品已变化或金币不足';
      if (this.run) renderRunShop(this.run, this.combat);
      this.updateHUD();
    }, options);
    click('shop-refresh', () => {
      if (!this.canShop() || !this.run) return;
      const token = document.getElementById('shop-refresh')!.dataset.shopToken!;
      const free = this.run.shop?.treasureRefreshes ? true : false;
      const refreshed = this.run.refresh(token);
      document.getElementById('shop-message')!.textContent = refreshed ? free ? '携宝兽奖励：免费刷新成功。' : '商品已刷新。' : '暂时无法刷新。';
      renderRunShop(this.run, this.combat); this.updateHUD();
    });
    click('shop-next', () => {
      if (!this.canShop() || !this.run?.nextWave(document.getElementById('shop-next')!.dataset.shopToken!, this.combat)) return;
      document.getElementById('shop-screen')!.hidden = true;
      document.getElementById('hud')!.inert = false;
      this.mode = 'playing'; this.input.setEnabled(true);
      this.audio.setActive(true); this.audio.unlock(); this.updateHUD(); this.wake();
    });
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
    window.addEventListener('focus', () => { if (this.mode === 'shop') this.wake(); }, options);
    window.addEventListener('blur', () => { if (this.mode === 'shop') this.sleep(); this.audio.setActive(false); this.cardDown = this.armedCard = null; this.pause('窗口失去焦点，游戏已暂停。'); }, options);
    window.addEventListener('pagehide', () => { this.pause('游戏已暂停，准备好后继续。'); this.sleep(); }, options);
    window.addEventListener('pageshow', () => this.wake(), options);
    window.addEventListener('keydown', (event) => {
      if (event.code !== 'Escape') return;
      if(!document.getElementById('weapon-pair-picker')!.hidden){document.getElementById('weapon-pair-cancel')!.click();return;}
      if (!document.getElementById('legacy-picker')!.hidden) { closeLegacy(); return; }
      // Touch WebKit need not focus a tapped button; Escape can target body.
      if (!document.getElementById('creature-picker')!.hidden) { this.closeCreaturePicker(); return; }
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
    const speed = this.preferences.gameSpeed;
    (document.getElementById('game-speed-setting') as HTMLSelectElement).value = String(speed);
    const speedButton = document.getElementById('game-speed')!;
    speedButton.textContent = `${speed}×`;
    speedButton.setAttribute('aria-label', `游戏速度：${speed}倍，点击切换`);
    speedButton.classList.toggle('accelerated', speed > 1);
    (document.getElementById('quality') as HTMLSelectElement).value = this.preferences.quality;
    (document.getElementById('music-toggle') as HTMLInputElement).checked = this.preferences.music;
    (document.getElementById('sound-toggle') as HTMLInputElement).checked = this.preferences.sound;
    document.getElementById('audio-status')!.textContent = this.audio.inspect().supported && this.audio.inspect().state !== 'unavailable' ? '点击开始冒险后启用声音' : '当前浏览器未提供音频，仍可正常游戏';
    document.getElementById('quality-description')!.textContent = this.preferences.quality === 'battery'
      ? '降低清晰度与装饰数量，以 30 帧为目标。' : this.preferences.quality === 'high'
      ? '更清晰的画面，以 60 帧为目标；负载较高时仍会降低像素比。' : '根据运行负载调整清晰度，必要时转为 30 帧目标。';
    if (this.partyPrototype && this.prototypeVariant === 'infinite') {
      document.getElementById('quality-description')!.textContent =
        '无尽挑战保持屏幕原生分辨率和清晰像素边缘；画质选项仅调整粒子数量与目标帧率。';
    }
  }

  private saveSettings() { savePreferences(this.preferences); this.syncSettings(); }

  private applyGraphics() {
    const hdPixelWorld = this.partyPrototype && this.prototypeVariant === 'infinite';
    this.renderer.setPixelRatio(hdPixelWorld ? window.devicePixelRatio || 1 :
      this.quality.pixelRatio(window.devicePixelRatio, window.innerWidth, window.innerHeight));
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

  private closeCreaturePicker() {
    document.getElementById('creature-picker')!.hidden = true;
    document.getElementById('menu')!.inert = false;
    document.getElementById('choose-creature')!.focus();
  }

  private syncCreatureSelection() {
    const definition = CREATURES[this.selectedSpecies];
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-creature]')) button.setAttribute('aria-pressed', String(button.dataset.creature === this.selectedSpecies));
    document.querySelector('.menu-description')!.textContent = `${definition.name}出战 · 自动攻击，升级强化。`;
    document.getElementById('start-selected-creature')!.firstChild!.textContent = `${definition.name} · 闯关挑战 `;
    document.getElementById('choose-creature')!.setAttribute('aria-label', `选择出战幻兽，当前${definition.name}`);
  }

  private get sceneLoading() {
    if (this.world.loading) return true;
    if (!this.startupPending) return false;
    const portrait = document.getElementById('creature-portrait') as HTMLImageElement;
    const portraitSettled = portrait.dataset.species === this.party.leader.species
      && (portrait.complete && portrait.naturalWidth > 0 || portrait.dataset.loadState === 'failed');
    if (!this.partyView.startupSettled || !this.combatView.startupSettled || !portraitSettled) return true;
    this.startupPending = false;
    return false;
  }

  private showSceneLoading() {
    const overlay = document.getElementById('world-loading')!;
    if (overlay.hidden || overlay.classList.contains('streaming') !== this.worldEntered) {
      overlay.classList.toggle('streaming', this.worldEntered);
      overlay.querySelector('strong')!.textContent = this.worldEntered ? '正在准备前方地图…' : '正在准备战斗画面…';
    }
    overlay.hidden = false;
  }

  private start(ruleset: Ruleset = this.runRuleset, partyPrototype = this.partyPrototype, newMap = false, variant = this.prototypeVariant) {
    if (this.portrait || this.contextLost) return;
    this.runRuleset = ruleset;
    this.partyPrototype = partyPrototype;
    this.startupPending = partyPrototype;
    this.worldEntered = false;
    this.prototypeVariant = partyPrototype ? variant : 'sample';
    this.applyGraphics();
    // Infinite world and Endless survival are paired here; the formal fusion challenge remains finite.
    this.combat.fusionEnabled = partyPrototype && (variant === 'fusion' || variant === 'infinite');
    this.combatView.setFusion(this.combat.fusionEnabled, this.selectedSpecies !== 'yanrong');
    const endless = partyPrototype && variant === 'infinite';
    this.world.setSample(!endless && partyPrototype && new URLSearchParams(window.location.search).get('world') !== 'legacy', newMap);
    this.world.setInfinite(endless, newMap);
    this.combat.infiniteWorld = endless;
    this.combat.useNavigation = partyPrototype && (this.world.sampleActive || endless);
    this.combat.party = partyPrototype ? this.party : undefined;
    const species: SpeciesId = this.combat.fusionEnabled ? this.selectedSpecies : 'yanrong';
    document.getElementById('creature-picker')!.hidden = true;
    document.getElementById('menu')!.inert = false;
    this.party.reset(partyPrototype && variant === 'legacy-party' ? ['yanrong', 'bubblesalamander', 'sproutspike'] : [species]);
    this.input.setMovementOnly(partyPrototype && !this.combat.fusionEnabled);
    document.getElementById('hud')!.classList.toggle('party-prototype', partyPrototype);
    document.getElementById('hud')!.classList.toggle('fusion-prototype', this.combat.fusionEnabled);
    document.getElementById('game-canvas')!.classList.toggle('pixel-party', partyPrototype && this.pixelPartyEnabled);
    this.partyView.group.visible = partyPrototype;
    this.combatView.setPixelEnemies(new URLSearchParams(window.location.search).get('enemyVisual') !== 'legacy');
    this.challenge = ruleset === 'horn-challenge' ? new Challenge() : undefined;
    this.outcome = null;
    this.audio.setWave();
    this.audio.setActive(true); this.audio.unlock();
    this.position.set(0, 0, 0);
    this.previousPosition.copy(this.position);
    this.monster.root.position.copy(this.position);
    this.velocity.set(0, 0);
    this.facing = 0;
    this.jumpHeight = this.previousJump = this.jumpVelocity = 0;
    this.elapsed = this.cooldown = this.dashRemaining = this.distance = 0;
    this.intermissionHudSecond = -1;
    this.combat.reset(ruleset);
    this.world.update(0, 0);
    this.combat.refreshWorld(0, 0, this.world.revision);
    this.run = this.combat.usesRunBuild ? new RunFlow(Math.random, endless ? 'endless' : 'campaign') : undefined;
    if (this.run && new URLSearchParams(window.location.search).get('meleeDev') === 'flame-sweep') this.combat.grantUpgrade('flame-sweep-weapon');
    this.combat.automaticSpawning = !this.run;
    this.run?.prepare(this.combat,this.position);
    document.getElementById('shop-screen')!.hidden = true;
    this.party.syncLeader(this.position, this.facing);
    this.party.placeCompanions(this.world.obstacles, ARENA_HALF_EXTENT);
    this.partyView.setAnimatedLeader((this.combat.fusionEnabled || this.prototypeVariant === 'legacy-party') && new URLSearchParams(window.location.search).get('creatureAnimation') !== 'static');
    if (partyPrototype) this.partyView.render(1, 0);
    this.monster.root.visible = !partyPrototype || !this.partyView.hasPixelLeader;
    if (this.trialHornMounted) this.monster.unequipOrgan('head');
    this.trialHornMounted = this.combat.isTrial;
    if (this.trialHornMounted) this.monster.equipOrgan('charge-horns');
    for (const trail of this.trails) (trail.mesh.material as THREE.MeshBasicMaterial).color.set(this.combat.isTrial ? '#ffd58a' : '#e5f2b2');
    this.monster.resetVisual();
    this.hideUpgrade();
    this.combatView.clear();
    this.combatView.group.visible = true;
    this.monster.body.visible = true;
    this.trails.forEach((trail) => { trail.remaining = 0; trail.mesh.visible = false; });
    this.mode = 'playing';
    this.input.setEnabled(!this.sceneLoading);
    if (this.sceneLoading) this.showSceneLoading(); else document.getElementById('world-loading')!.hidden = true;
    this.audio.setActive(!this.sceneLoading);
    document.getElementById('menu')!.hidden = true;
    document.getElementById('hud')!.hidden = false;
    document.getElementById('pause-screen')!.hidden = true;
    document.getElementById('help-screen')!.hidden = true;
    document.getElementById('gameover-screen')!.hidden = true;
    (document.activeElement as HTMLElement | null)?.blur();
    this.welcome.classList.remove('faded');
    this.welcome.querySelector('h2')!.textContent = endless ? '无尽挑战，向远方出发。' : this.combat.fusionEnabled && species !== 'yanrong' ? `${CREATURES[species].name}，准备出发。` : this.combat.fusionEnabled ? '一簇火花，生长成烈焰。' : partyPrototype ? '草场已就绪，出发吧。' : this.challenge ? '三波迎战，冲出一条路。' : this.combat.isTrial ? '犄角已就绪，冲出一条路。' : '小小魔法，准备就绪。';
    this.welcome.querySelector('p')!.textContent = endless ? '六波循环生存 · 第五波旗帜大波与商店 · 第六波 Boss 循环' : this.combat.fusionEnabled && species !== 'yanrong' ? `${CREATURES[species].name}出战 · 摇杆移动 · 自动攻击 · 升级三选一` : this.combat.fusionEnabled ? '六波自动战斗 · 升级形成融合 · 前四波连续迎战，第五波后才可购物' : partyPrototype && variant === 'legacy-party' ? '三兽兼容模式 · 主控移动，伙伴跟随并自动攻击' : partyPrototype ? '摇杆操控焰绒 · 自动攻击 · 沿泥路绕过林地与水岸' : this.challenge ? '击败三波即可通关 · 冲锋命中 6 次、打断 2 次各加一星' : this.combat.isTrial ? '冲刺命中可击退和打断 · 留意黄色扑击预警线' : '移动躲避敌人，焰绒会自动施法 · 靠近拾取经验';
    this.accumulator = 0;
    this.placeCamera(true);
    this.world.update(this.position.x, this.position.z, this.cameraFootprint());
    this.updateHUD();
    this.wake();
  }

  private pause(reason: string) {
    if (this.mode !== 'playing') return;
    this.mode = 'paused';
    document.getElementById('area-combo')!.hidden = true;
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
    this.startupPending = false;
    this.worldEntered = false;
    document.getElementById('world-loading')!.hidden = true;
    this.combat.runBuild.clearPairFusions();
    this.audio.setWave();
    this.run = undefined; this.combat.automaticSpawning = true;
    document.getElementById('shop-screen')!.hidden = true;
    this.world.setSample(new URLSearchParams(window.location.search).get('world') !== 'legacy');
    this.combat.infiniteWorld = false;
    this.combat.useNavigation = false;
    this.monster.root.visible = false;
    document.getElementById('game-canvas')!.classList.remove('pixel-party');
    this.partyPrototype = false;
    this.prototypeVariant = 'sample';
    this.combat.fusionEnabled = false;
    this.combatView.setFusion(false);
    this.combat.party = undefined;
    this.party.reset();
    this.partyView.group.visible = false;
    this.combatView.setPixelEnemies(false);
    this.input.setMovementOnly(false);
    this.runRuleset = 'classic';
    this.challenge = undefined; this.outcome = null;
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
    if (this.mode !== 'playing' || this.sceneLoading) return;
    if (this.run?.phase === 'intermission') {
      this.run.updateRest(dt, this.combat);
      this.syncRunPhase();
      return;
    }
    this.combat.useNavigation = this.partyPrototype && (this.world.sampleActive || this.combat.infiniteWorld);
    if (this.combat.progression.awaitingChoice && !this.combat.encounters.dying) { this.openUpgrade(); return; }
    if (this.run && this.run.remaining <= 1e-8) { this.run.resolveBoundary(this.combat); if (this.syncRunPhase()) return; }
    this.run?.prepare(this.combat,this.position);
    this.previousPosition.copy(this.position);
    this.previousJump = this.jumpHeight;
    if (this.input.consumeJump() && !this.partyPrototype && this.jumpHeight === 0) { this.jumpVelocity = 6; this.audio.play('jump'); }
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
    if (this.input.consumeDash() && (!this.partyPrototype || this.combat.usesRunBuild) && this.cooldown === 0) {
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
    // Refresh streamed chunks before resolving collisions or enemy navigation.
    this.world.update(this.position.x, this.position.z, this.cameraFootprint());
    if (this.sceneLoading) { this.accumulator = 0; return; }
    this.combat.refreshWorld(this.position.x, this.position.z, this.world.revision);
    // Circle collisions allow sliding around trunks and rocks.
    for (const obstacle of this.world.obstacles) {
      const x = this.position.x - obstacle.x, z = this.position.z - obstacle.z;
      const radius = obstacle.radius + PLAYER_COLLISION_RADIUS;
      const length = Math.hypot(x, z);
      if (length < radius) {
        this.position.x = obstacle.x + (length > 0.0001 ? x / length : 1) * radius;
        this.position.z = obstacle.z + (length > 0.0001 ? z / length : 0) * radius;
      }
    }
    if (!this.combat.infiniteWorld) clampToRectangularBoundary(this.position, ARENA_HALF_EXTENT, PLAYER_COLLISION_RADIUS);
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
    const shots = this.combat.shotsFired, hits = this.combat.hits, collected = this.combat.collected, hp = this.combat.hp, kills = this.combat.kills;
    this.dashAttack.active = dashing;
    this.dashAttack.fromX = this.previousPosition.x; this.dashAttack.fromZ = this.previousPosition.z;
    this.dashAttack.dx = this.dashDirection.x; this.dashAttack.dz = this.dashDirection.y;
    if (this.partyPrototype) {
      // The original Player movement is now the controlled creature adapter.
      this.party.syncLeader(this.position, this.facing);
      if (this.prototypeVariant === 'legacy-party') this.party.follow(dt, this.world.obstacles, ARENA_HALF_EXTENT);
    }
    this.combat.attackViewport = this.cameraFootprint();
    this.combat.update(dt, this.position, this.dashAttack);
    if (this.partyPrototype && this.combat.hp > 0) this.partyView.stepAnimation(dt, (this.position.x - this.previousPosition.x) / dt, (this.position.z - this.previousPosition.z) / dt);
    this.audio.playSkills(this.combat.soundEvents);
    this.audio.playHarvest(this.combat.kills - kills);
    if (this.combat.hits > hits) this.audio.play('hit');
    if (this.combat.shotsFired > shots) this.audio.play('cast');
    if (this.combat.collected > collected) this.audio.play('collect');
    if (this.combat.hp < hp) this.audio.play('hurt');
    if (this.combat.hp === 0) this.endRun();
    else {
      if (this.run) {
        this.run.update(dt, this.combat, this.position);
        if (this.syncRunPhase()) return;
      }
      if (this.challenge) {
        const wave = this.challenge.wave, phase = this.challenge.phase;
        this.challenge.update(dt, this.combat, this.position);
        if (this.challenge.wave !== wave || this.challenge.phase !== phase) this.audio.play('level');
        if (this.challenge.phase === 'won') this.endRun('victory');
      }
      const endlessBossChoice = !!this.run?.endless && this.run.isBossWave && this.combat.encounters.defeated;
      if (this.mode === 'playing' && this.combat.progression.awaitingChoice && (!this.combat.encounters.dying || endlessBossChoice)) this.openUpgrade();
    }
  }

  private canShop() { return this.mode === 'shop' && !document.hidden && !this.portrait && !this.contextLost; }

  private syncRunPhase() {
    this.audio.setWave(this.run?.waveInCycle);
    if (!this.run) return false;
    if (this.run.phase === 'won' || this.run.phase === 'lost') { this.endRun(this.run.phase === 'won' ? 'victory' : 'defeat'); return true; }
    if (this.run.phase === 'intermission') {
      // Stay on the battlefield for a real visual rest: no combat/AI advances.
      if (this.intermissionHudSecond < 0) {
        this.input.setEnabled(false); this.velocity.set(0, 0);
        this.previousPosition.copy(this.position);
        this.party.syncLeader(this.position, this.facing);
        this.partyView.stopAnimation();
        this.combatView.clear();
        document.getElementById('hud')!.inert = false;
      }
      // Fixed-step catch-up must not rebuild the same DOM repeatedly. Combat is
      // settled; only the displayed countdown changes during this phase.
      const second = Math.ceil(this.run.intermissionRemaining);
      if (second !== this.intermissionHudSecond) {
        this.intermissionHudSecond = second;
        this.updateHUD();
      }
      return true;
    }
    if (this.intermissionHudSecond >= 0) {
      this.intermissionHudSecond = -1;
      if (this.run.phase === 'fighting') this.input.setEnabled(true);
      this.updateHUD();
    } else if (this.run.phase === 'fighting' && this.run.waveElapsed === 0) this.updateHUD();
    if (this.run.phase === 'shop') {
      this.mode = 'shop'; this.input.setEnabled(false); this.velocity.set(0, 0);
      this.previousPosition.copy(this.position); this.partyView.stopAnimation(); this.sleep();
      this.combatView.clear(); this.renderer.render(this.scene, this.camera);
      document.getElementById('hud')!.inert = true;
      document.getElementById('shop-screen')!.hidden = false;
      const growth = this.run.lastWaveGrowth;
      document.getElementById('shop-message')!.textContent = `本波奖励 +${this.run.definition.reward} 金币${growth.sporeBonus ? ` · 爆孢连锁 +${growth.sporeBonus} 金币` : ''}${this.run.shop?.treasureRefreshes ? (this.run.endless ? ' · 本轮携宝兽奖励免费刷新' : ' · 前五波携宝兽奖励免费刷新') : ''}`;
      renderRunShop(this.run, this.combat); this.updateHUD();
      document.getElementById('shop-next')!.focus({ preventScroll: true }); this.wake(); return true;
    }
    if (this.combat.progression.awaitingChoice && !this.combat.encounters.dying) { this.openUpgrade(); return true; }
    return false;
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
    document.getElementById('upgrade-panel')!.classList.remove('choosing-pair');
      document.getElementById('weapon-pair-picker')!.hidden=true;document.getElementById('upgrade-cards')!.hidden=false;
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
    if(id==='weapon-pair-fusion'){renderWeaponPairPicker(this.combat.runBuild);return;}
    if (!this.combat.chooseUpgrade(id)) return;
    this.finishUpgradeChoice();
  }

  private finishUpgradeChoice(){
    document.getElementById('upgrade-panel')!.classList.remove('choosing-pair');
      document.getElementById('weapon-pair-picker')!.hidden=true;
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
    document.getElementById('upgrade-panel')!.classList.remove('choosing-pair');
      document.getElementById('weapon-pair-picker')!.hidden=true;
    this.offerVersion++;
    this.cardDown = this.armedCard = null;
    document.getElementById('upgrade-screen')!.hidden = true;
    document.getElementById('upgrade-cards')!.replaceChildren();
    document.getElementById('hud')!.inert = false;
  }

  private endRun(outcome: 'victory' | 'defeat' = 'defeat') {
    const endlessResult = this.run?.endless ? {
      wave: this.run.wave,
      cycle: this.run.cycle,
      bossesDefeated: this.run.bossesDefeated,
      survivalSeconds: this.run.totalElapsed,
    } : undefined;
    const endlessRecordUpdate = endlessResult ? recordEndlessRun(endlessResult) : undefined;
    this.run?.finish(this.combat, outcome === 'victory');
    document.getElementById('shop-screen')!.hidden = true;
    this.combat.clearTransientEffects();
    this.combatView.clear();
    this.partyView.stopAnimation();
    this.hideUpgrade();
    this.mode = 'gameover';
    this.outcome = outcome;
    this.audio.setActive(false);
    this.input.setEnabled(false);
    this.velocity.set(0, 0);
    this.dashRemaining = 0;
    this.previousPosition.copy(this.position);
    this.accumulator = 0;
    this.monster.body.visible = true;
    document.getElementById('result-time')!.textContent = this.formatTime();
    document.getElementById('result-time')!.nextElementSibling!.textContent = this.run ? '总用时' : '生存时间';
    document.getElementById('result-kills')!.textContent = String(this.combat.kills);
    document.getElementById('result-xp')!.textContent = String(this.combat.xp);
    const won = outcome === 'victory';
    renderResultOutcome(won);
    document.getElementById('result-heading')!.textContent = this.run
      ? this.run.endless ? '无尽生存，挑战结束' : won ? '六波挑战，通关！' : '冒险暂时结束。'
      : won ? '三波挑战，通关！' : '小火焰，休息一下。';
    document.getElementById('result-eyebrow')!.textContent = this.run?.endless ? '生存结算' : won ? '挑战完成' : '本局结束';
    document.getElementById('result-message')!.textContent = won ? '三波挑战完成，再次出发。' : '生命耗尽，本次冒险结束。';
    if (this.run) document.getElementById('result-message')!.textContent = this.run.endless
      ? `生命耗尽，止步第 ${this.run.wave} 波（第 ${this.run.cycle} 轮）。击败 ${this.run.bossesDefeated} 个 Boss。`
      : won ? '荆冠兽王已击败！构筑经受住了六波考验。'
      : this.run.failure === 'boss-timeout' ? '未能在 90 秒内击败荆冠兽王。调整构筑，再来挑战。'
      : `生命耗尽，止步第 ${this.run.wave} 波。换一种构筑再出发。`;
    renderRunResult(this.run, this.combat);
    const recordPanel = document.getElementById('endless-record-result')!;
    if (endlessResult && endlessRecordUpdate) {
      renderEndlessBestResult(endlessResult, endlessRecordUpdate.record, endlessRecordUpdate.newRecords);
    } else {
      recordPanel.hidden = true;
      recordPanel.classList.remove('new-record');
      renderEndlessBestMenu();
    }
    const summary = document.getElementById('result-challenge')!;
    summary.hidden = !this.challenge;
    if (this.challenge) {
      const stars = this.challenge.stars(this.combat);
      summary.textContent = won ? `${'★'.repeat(stars)}${'☆'.repeat(3 - stars)} · 冲锋 ${Math.min(this.combat.hornHits,HORN.goal)}/${HORN.goal} · 打断 ${Math.min(this.combat.interrupts,CHALLENGE.interruptGoal)}/${CHALLENGE.interruptGoal}` : `到达第 ${this.challenge.wave + 1} / ${CHALLENGE_WAVES.length} 波 · 冲锋 ${this.combat.hornHits} · 打断 ${this.combat.interrupts}`;
    }
    document.getElementById('gameover-screen')!.setAttribute('aria-label', won ? '挑战胜利' : '本局结束');
    document.querySelector('.result-card')!.classList.toggle('victorious', won);
    document.getElementById('gameover-screen')!.hidden = false;
  }

  private formatTime() {
    const seconds = this.run?.totalElapsed ?? this.elapsed;
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  }


  private updateHUD() {
    const combo = document.getElementById('area-combo')!;
    const feedback = this.combat.areaFeedback;
    combo.hidden = this.mode !== 'playing' || feedback.kills < 8 || this.combat.elapsed - feedback.time > 1.35;
    if (!combo.hidden) combo.textContent = `${feedback.kills} 连斩！`;
    renderEncounterStatus(this.combat,this.run);
    renderWeaponCooldowns(this.combat);
    renderHudWeaponIcons(this.combat);
    const wave = document.getElementById('run-wave')!, gold = document.getElementById('run-gold')!;
    wave.hidden = !this.run;
    gold.hidden = true; // Only wave and elapsed time occupy the top center.
    const coins = this.run?.coins ?? this.combat.goldEarned;
    document.getElementById('hud-coins')!.textContent = Math.max(0, coins).toLocaleString('en-US');
    if (this.run) { wave.textContent = this.run.waveLabel; gold.textContent = `金币 ${this.run.coins}`; }
    renderBuildSummary(this.combat.usesRunBuild ? this.combat.runBuild : undefined, this.combat.fusions, this.combat.resonances);
    const fusionStatus = document.getElementById('fusion-status')!;
    fusionStatus.hidden = !this.combat.fusionEnabled;
    const fused = !!this.combat.fusion;
    fusionStatus.classList.toggle('activated', fused);
    const title = document.getElementById('fusion-title')!, hint = document.getElementById('fusion-hint')!;
    const base = this.combat.baseAttack;
    const titleText = this.combat.usesRunBuild && (this.combat.runBuild.attacks.length > 1 || this.combat.runBuild.attacks[0].level > 1) ? this.combat.runBuild.attacks.map(a => this.combat.runBuild.title(a) + (a.level > 1 ? ` ${a.level}级` : '')).join(' + ') + (fused ? ` · ${this.combat.fusions.length} 融合` : '') : fused ? this.combat.fusions.map(f => f.title).join(' / ')  : base === 'bubble' ? '水泡弹' : base === 'leaf' ? '飞叶弹' : '火花弹';
    const hintText = [...this.combat.resonances,...this.combat.runBuild.attacks.filter(a=>a.pairId).map(a=>'来源：'+a.sources!.map(id=>ATTACKS[id].title).join('+'))].join(' · ');
    hint.hidden = !hintText;
    fusionStatus.title = this.combat.fusions.map(f => f.title).join(' / ');
    const species = this.party.leader.species;
    const portrait = document.getElementById('creature-portrait') as HTMLImageElement;
    portrait.hidden = false;
    const fallbackPortrait = document.querySelector('.health-panel svg.portrait') as SVGElement;
    fallbackPortrait.style.display = species === 'yanrong' ? '' : 'none';
    if (portrait.dataset.species !== species) {
      portrait.classList.remove('art-loaded');
      portrait.dataset.loadState = 'pending';
      portrait.onload = () => { portrait.dataset.loadState = 'ready'; portrait.classList.add('art-loaded'); fallbackPortrait.style.display = 'none'; };
      portrait.onerror = () => { portrait.dataset.loadState = 'failed'; portrait.classList.remove('art-loaded'); portrait.hidden = true; fallbackPortrait.style.display = species === 'yanrong' ? '' : 'none'; };
      portrait.src = `${import.meta.env.BASE_URL}assets/pixel/${PIXEL_CREATURE_ASSETS[species]}`;
      portrait.dataset.species = species;
    }
    if (portrait.complete && portrait.naturalWidth > 0) { portrait.classList.add('art-loaded'); fallbackPortrait.style.display = 'none'; }
    if (title.textContent !== titleText) title.textContent = titleText;
    if (hint.textContent !== hintText) hint.textContent = hintText;
    const hasSpark = this.combat.usesRunBuild ? this.combat.runBuild.has('spark')&&!this.combat.runBuild.consumed('spark') : base === 'spark';
    const hasBurst = this.combat.fusions.some(f => f.id === 'burst-seed');
    document.getElementById('fusion-spark-icon')!.hidden = !hasSpark || hasBurst;
    document.getElementById('fusion-burst-icon')!.hidden = !hasBurst;
    fusionStatus.setAttribute('aria-label', `${titleText}。${fusionStatus.title || hintText}`);
    let elementalIcons = document.getElementById('fusion-elemental-icons');
    if (!elementalIcons) { elementalIcons = document.createElement('span'); elementalIcons.id = 'fusion-elemental-icons'; fusionStatus.prepend(elementalIcons); }
    setFusionIcons(elementalIcons, this.combat.fusions.filter(f => elementalClip(f.id)).map(f => f.id as ElementalFusionId));
    const map = this.world.inspect();
    const replay = document.getElementById('map-replay') as HTMLAnchorElement;
    replay.hidden = !this.partyPrototype || !map.seed;
    if (map.seed && replay.dataset.seed !== map.seed) {
      const url = new URL(window.location.href);
      url.searchParams.delete('world'); url.searchParams.set('seed', map.seed);
      replay.href = url.href; replay.textContent = '复现地图 · 种子 ' + map.seed;
      replay.dataset.seed = map.seed;
    }
    const seedCharacters = Array.from(map.seed ?? '');
    document.getElementById('map-seed')!.textContent = map.seed ? (this.combat.infiniteWorld ? '无限种子 ' : '种子 ') + (seedCharacters.length > 18 ? seedCharacters.slice(0, 18).join('') + '…' : map.seed) : '中央草场';
    document.getElementById('party-status')!.hidden = !this.partyPrototype || this.party.members.length < 2;
    const trialStatus = document.getElementById('trial-status')!;
    trialStatus.hidden = !this.combat.isTrial;
    document.getElementById('hud')!.classList.toggle('horn-trial', this.combat.isTrial);
    if (this.combat.isTrial) {
      const challenge = this.challenge;
      const title = challenge ? `第 ${challenge.wave + 1}/${CHALLENGE_WAVES.length} 波 · ${challenge.phase === 'rest' ? '本波完成' : challenge.definition.title}` : this.combat.hornHits >= HORN.goal ? '试炼目标达成 · 继续练习' : '冲锋犄角 · 开局已装备';
      const titleElement = document.getElementById('trial-title')!;
      if (titleElement.textContent !== title) titleElement.textContent = title;
      const progress = challenge ? `击败 ${challenge.defeated}/${challenge.definition.enemies.length} · 冲锋 ${Math.min(this.combat.hornHits,HORN.goal)}/${HORN.goal}` : `冲锋命中 ${this.combat.hornHits}/${HORN.goal} · 打断 ${this.combat.interrupts}`;
      const counter = document.getElementById('trial-progress')!;
      if (counter.textContent !== progress) counter.textContent = progress;
      const hint = challenge ? `打断 ${this.combat.interrupts}/${CHALLENGE.interruptGoal} 可加星 · ${challenge.definition.hint}` : '黄线蓄力时侧移躲开；冲刺命中可打断，青环期间可反击';
      const hintElement = document.getElementById('trial-hint')!;
      if (hintElement.textContent !== hint) hintElement.textContent = hint;
    }
    const time = this.formatTime();
    if (this.timer.textContent !== time) this.timer.textContent = time;
    const ready = 1 - this.cooldown / DASH_COOLDOWN;
    this.dashButton.style.setProperty('--ready', `${ready * 100}%`);
    this.dashButton.classList.toggle('cooling', this.cooldown > 0);
    this.dashButton.setAttribute('aria-disabled', String(this.cooldown > 0));
    this.dashStatus.textContent = this.cooldown > 0 ? `${this.cooldown.toFixed(1)} 秒` : '就绪';
    const flagWarning = !!this.run?.endless && this.run.phase === 'fighting'
      && this.run.waveInCycle === 4 && this.run.remaining > 0
      && this.run.remaining <= ENDLESS_FLAG_WARNING_SECONDS;
    this.welcome.classList.toggle('flag-wave-warning', flagWarning);
    if (flagWarning && this.run) {
      const warningTitle = '警报！旗帜大波即将来袭';
      const warningDetail =
        `剩余 ${Math.ceil(this.run.remaining)} 秒 · 第 ${this.run.wave + 1} 波（第 ${this.run.cycle} 轮）· 快速怪、重甲、爆孢与晶屑混编，保持移动！`;
      const titleNode = this.welcome.querySelector('h2')!;
      const detailNode = this.welcome.querySelector('p')!;
      if (titleNode.textContent !== warningTitle) titleNode.textContent = warningTitle;
      if (detailNode.textContent !== warningDetail) detailNode.textContent = warningDetail;
      this.welcome.classList.remove('faded');
    } else if (this.challenge) {
      const resting = this.challenge.phase === 'rest';
      if (resting) {
        this.welcome.querySelector('h2')!.textContent = `第 ${this.challenge.wave + 1} 波完成！`;
        this.welcome.querySelector('p')!.textContent = `${Math.ceil(this.challenge.restTime)} 秒后迎战下一波 · 靠近拾取经验`;
      } else if (this.challenge.wave > 0) {
        this.welcome.querySelector('h2')!.textContent = `第 ${this.challenge.wave + 1} 波 · ${this.challenge.definition.title}`;
        this.welcome.querySelector('p')!.textContent = this.challenge.definition.hint;
      }
      this.welcome.classList.toggle('faded', !resting && this.challenge.waveTime > (this.challenge.wave === 0 ? 5 : 2));
    } else if (this.run?.phase === 'intermission') {
      const shopping = this.run.isShopWave;
      this.welcome.querySelector('h2')!.textContent = shopping
        ? `${this.run.waveLabel}完成 · 魔法商店即将开放`
        : `${this.run.waveLabel}完成！`;
      this.welcome.querySelector('p')!.textContent = shopping
        ? `${Math.ceil(this.run.intermissionRemaining)} 秒后进入商店 · 为阶段 Boss 做准备`
        : this.run.isBossWave
          ? `${Math.ceil(this.run.intermissionRemaining)} 秒后进入下一轮 · Boss 奖励已结算`
          : `${Math.ceil(this.run.intermissionRemaining)} 秒后进入第 ${this.run.wave + 1} 波 · 已回收经验`;
      this.welcome.classList.remove('faded');
    } else if (this.run && this.run.waveElapsed < 3 && this.run.wave > 1) {
      const event = this.run.isBossWave ? (this.run.endless ? '阶段 Boss' : '最终决战') : this.run.isFlagWave ? '旗帜大波' : '怪潮来袭';
      this.welcome.querySelector('h2')!.textContent = `${this.run.waveLabel} · ${event}`;
      this.welcome.querySelector('p')!.textContent = this.run.isBossWave
        ? (this.run.endless ? '荆冠兽王登场 · 超时后进入狂暴，击败后继续生存' : '荆冠兽王登场 · 留意攻击预警')
        : this.run.isFlagWave ? '混合怪潮即将压境 · 留意走位与爆孢预警'
        : this.run.waveInCycle === 1 && this.run.modifierLabel ? `本轮特殊规则：${this.run.modifierLabel}。 ${this.run.modifierDescription}`
        : '开始新一波战斗';
      this.welcome.classList.remove('faded');
    } else this.welcome.classList.toggle('faded', this.elapsed > 5 || this.distance > 8);
    this.boundaryHint.hidden = this.combat.infiniteWorld || Math.max(Math.abs(this.position.x), Math.abs(this.position.z)) < ARENA_HALF_EXTENT - PLAYER_COLLISION_RADIUS - 0.5;
    const hp = this.combat.hp, maxHp = this.combat.maxHp;
    const displayHp = Math.floor(hp), displayMaxHp = Math.floor(maxHp);
    this.healthValue.textContent = `${displayHp} / ${displayMaxHp}`;
    this.healthFill.style.width = `${hp / maxHp * 100}%`;
    this.healthBar.setAttribute('aria-valuemax', String(displayMaxHp));
    this.healthBar.setAttribute('aria-valuenow', String(displayHp));
    // A persistent, non-verbal danger cue complements (and never replaces) hit flashes.
    const critical = maxHp > 0 && hp > 0 && hp / maxHp < 0.5;
    this.healthBar.classList.toggle('low-health', critical);
    document.getElementById('hud')!.classList.toggle('critical-health', critical);
    this.healthBar.setAttribute('aria-valuetext', `${displayHp} / ${displayMaxHp}${critical ? '，生命值不足一半' : ''}`);
    this.killValue.textContent = String(this.combat.kills);
    this.xpValue.textContent = String(this.combat.xp);
    const progression = this.combat.progression, maxed = !Number.isFinite(progression.threshold);
    document.getElementById('level-value')!.textContent = `Lv.${progression.level}${maxed ? ' MAX' : ''}`;
    document.getElementById('xp-fill')!.style.width = `${maxed ? 100 : progression.experience / progression.threshold * 100}%`;
    const xpTrack = document.getElementById('xp-track')!;
    xpTrack.setAttribute('aria-valuemax', String(maxed ? 1 : progression.threshold));
    xpTrack.setAttribute('aria-valuenow', String(maxed ? 1 : progression.experience));
    xpTrack.setAttribute('aria-valuetext', maxed ? '经验已满级' : `升级经验 ${progression.experience} / ${progression.threshold}`);
    this.damageOverlay.style.opacity = String(this.combat.hurtFlash / 0.25 * 0.7);
  }

  private placeCamera(snap = false, dt = STEP) {
    const player = this.monster.root.position;
    resize25DCamera(this.camera, window.innerWidth / Math.max(1, window.innerHeight), this.mode === 'menu');
    this.monster.updateView(window.innerHeight, this.camera.top - this.camera.bottom, this.mode === 'menu');
    this.partyView.resize(window.innerHeight, this.camera.top - this.camera.bottom);
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
    // Shake only the rendered camera. Target selection uses the stable anchor footprint below.
    const impactAge = this.combat.elapsed - this.combat.areaFeedback.time;
    if (this.mode === 'playing' && this.combat.areaFeedback.kills >= 8 && impactAge >= 0 && impactAge < .24) {
      const strength = .07 * (1 - impactAge / .24);
      this.camera.position.x += Math.sin(impactAge * 157) * strength;
      this.camera.position.y += Math.cos(impactAge * 119) * strength * .5;
    }
    this.combat.spawnViewport = this.cameraFootprint();
    this.combatView.updateView(this.camera, window.innerHeight, this.camera.top - this.camera.bottom);
    this.partyView.setCamera(this.camera);
  }

  private cameraFootprint() {
    return { x: this.cameraAnchor.x, z: this.cameraAnchor.z - this.cameraAnchor.y / Math.tan(VIEW_25D.pitch),
      halfWidth: (this.camera.right - this.camera.left) / 2, halfDepth: (this.camera.top - this.camera.bottom) / (2 * Math.sin(VIEW_25D.pitch)) };
  }

  private frame = (time: number) => {
    this.frameId = 0;
    if (this.disposed || document.hidden || this.portrait || this.contextLost || (this.mode !== 'menu' && this.mode !== 'playing' && this.mode !== 'shop')) return;
    const rawDt = this.lastTime ? (time - this.lastTime) / 1000 : 0;
    const dt = rawDt ? Math.min(rawDt, STEP * 5) : STEP;
    this.lastTime = time;
    if (this.mode === 'playing' && this.sceneLoading) {
      this.showSceneLoading();
      this.input.setEnabled(false);
      this.audio.setActive(false);
      this.accumulator = 0;
      this.frameId = window.requestAnimationFrame(this.frame);
      return;
    }
    const enteringWorld = this.mode === 'playing' && !document.getElementById('world-loading')!.hidden;
    if (enteringWorld) {
      this.input.setEnabled(true);
      this.audio.setActive(true);
      this.renderTime = 0;
    }
    if (this.mode === 'shop') { this.run?.updateRest(dt); this.frameId = window.requestAnimationFrame(this.frame); return; }
    if (this.quality.sample(rawDt)) this.applyGraphics();
    const speed = this.mode === 'playing' ? this.preferences.gameSpeed : 1;
    this.visualTime += dt * speed;
    if (this.mode === 'playing') {
      // Retain 1/60-second collision/AI steps at every speed. A delayed frame
      // stays bounded at 5 * 10 ticks; render cadence and audio use real time.
      this.accumulator += dt * speed;
      while (this.mode === 'playing' && this.accumulator >= STEP) {
        this.accumulator -= STEP; this.step(STEP);
      }
    }
    const draw = !this.renderTime || time - this.renderTime >= 1000 / this.quality.targetFps - 1 || (this.mode !== 'playing' && this.mode !== 'menu');
    if (draw) this.world.update(this.position.x, this.position.z, this.cameraFootprint());
    // A move or collision correction can request a new streaming neighborhood.
    // Keep the last complete frame on screen until its scenery/collisions are ready.
    if (this.mode === 'playing' && this.sceneLoading) {
      this.showSceneLoading();
      this.input.setEnabled(false); this.audio.setActive(false); this.accumulator = 0;
      this.frameId = window.requestAnimationFrame(this.frame); return;
    }
    if (draw) {
      const renderDt = this.renderTime ? Math.min((time - this.renderTime) / 1000, STEP * 5) : dt;
      this.renderTime = time;
      if (this.mode !== 'menu') {
        this.monster.root.position.lerpVectors(this.previousPosition, this.position, this.accumulator / STEP);
        if (this.run?.phase !== 'intermission') {
          this.updateHUD();
          this.combatView.render(this.accumulator / STEP, this.visualTime, this.monster.root.position);
        }
        if (this.partyPrototype) this.partyView.render(this.accumulator / STEP, this.visualTime, this.combat.hurtFlash / 0.25, this.combat.invulnerability);
        this.monster.body.visible = true;
      }
    this.monster.animate(renderDt * speed, Math.min(1, this.velocity.length() / 4.6), this.dashRemaining > 0, this.visualTime, THREE.MathUtils.lerp(this.previousJump, this.jumpHeight, this.accumulator / STEP), this.combat.hurtFlash / 0.25);
      this.placeCamera(false, renderDt * speed);
      this.monster.root.visible = this.mode !== 'menu' && (!this.partyPrototype || !this.partyView.hasPixelLeader);
      this.renderer.render(this.scene, this.camera);
      if (this.mode === 'playing') this.worldEntered = true;
      if (enteringWorld) document.getElementById('world-loading')!.hidden = true;
    }
    if (this.mode === 'menu' || this.mode === 'playing') this.frameId = window.requestAnimationFrame(this.frame);
  };

  private wake() {
    if (this.frameId || this.disposed || document.hidden || this.portrait || this.contextLost || (this.mode !== 'menu' && this.mode !== 'playing' && this.mode !== 'shop')) return;
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
      outcome: this.outcome,
      partyPrototype: this.partyPrototype,
      prototypeVariant: this.prototypeVariant,
      fusionVisual: this.combatView.inspectFusion(),
      world: this.world.inspect(),
      party: this.party.inspect(),
      partyVisual: this.partyView.inspect(),
      enemyVisual: this.combatView.inspect(),
      challenge: this.challenge?.inspect(this.combat),
      run: this.run?.inspect(),
      position: { x: this.position.x, z: this.position.z },
      movement: { ...this.input.movement },
      elapsed: this.elapsed, cooldown: this.cooldown, distance: this.distance,
      gameSpeed: this.preferences.gameSpeed,
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
    this.partyView.dispose();
    this.combatView.dispose();
    this.audio.dispose();
    this.world.dispose();
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
