import { CaptureCollection } from './capture-collection';
import { CaptureSpawns } from './capture-spawns';
import { CaptureHUD } from './capture-hud';
import { PrisonView } from './prison-view';
import { EnemyCapture } from './enemy-capture';
import { StarSealCaptureSystem, type StarSealSession } from './visuals/star-seal-capture';
import { EnemyTestMode } from './enemy-test-mode';
import { ItemTestMode, ITEM_TEST_ALTAR, ITEM_TEST_OPTIONS, isItemTestSkill, itemTestRank, type ItemTestSkill } from './item-test-mode';
import { newFeatureTest, prepareNewFeatureTest, addFeatureTestWeapon, type NewFeatureTestId } from './new-feature-test';
import { EndlessExploration, EXPLORATION_RULES, type ExplorationKind } from './endless-exploration';
import { ExplorationView } from './exploration-view';
import { AltarGuide } from './altar-guide';
import { WorldEventGuide } from './world-event-guide';
import { preloadEligibleUpgradeImages,inspectUpgradeImages } from './upgrade-art';
import { WeaponExchangeDialog } from './weapon-exchange-dialog';
import type { BaseAttackId } from './fusion';
import { endlessShopPrice } from './balance';
import { ENDLESS_REGIONS, isEndlessRegion } from './endless-regions';
import { migrateRegionObjects, type RegionMigrationReport } from './region-migration';
import { ItemTestAltarView } from './item-test-altar-view';
import { AltarTrial } from './altar-trial';
import { EndlessAltarEvent } from './endless-altar';
import { DeathTransition } from './death-transition';
import { AltarCharacterLayer } from './altar-character-layer';
import { TreasureDialog } from './treasure-dialog';
import {type WeaponPairId} from './weapon-pair-fusion';
import {renderWeaponPairPicker} from './ui';
import { renderRegionChoice } from './ui';
import * as THREE from 'three';
import { Input } from './input';
import { Monster } from './monster';
import { createWorld, type World } from './world';
import { ARENA_HALF_EXTENT, clampToRectangularBoundary, PLAYER_COLLISION_RADIUS } from './arena-boundary';
import { Combat, ENEMY_TYPES } from './combat';
import { CombatView } from './combat-view';
import { renderUpgradeCards, renderBuildSummary, renderRunShop, renderRunResult, renderResultOutcome, renderEncounterStatus, renderEndlessBestMenu, renderEndlessBestResult } from './ui';
import type { SkillId } from './progression';
import { ENDLESS_FLAG_WARNING_SECONDS, RunFlow } from './run-flow';
import { recordEndlessRun } from './endless-record';
import { preloadShopArt } from './shop-art';
import { AdaptiveQuality, loadPreferences, savePreferences, normalizeGameSpeed, type QualityMode } from './quality';
import { GameAudio } from './audio';
import { resize25DCamera, screenToGround, VIEW_25D } from './camera-25d';
import { HORN, type DashStep, type Ruleset } from './trial';
import { Challenge, CHALLENGE, CHALLENGE_WAVES } from './challenge';
import { PartySystem, CREATURES, type SpeciesId } from './party';
import { PIXEL_CREATURE_ASSETS } from './pixel-sprite';
import { PartyView } from './party-view';

type Mode = 'region-choice' | 'exchanging' | 'dying' | 'menu' | 'playing' | 'paused' | 'gameover' | 'upgrading' | 'settings' | 'shop' | 'prison';
const STEP = 1 / 60;
const DASH_COOLDOWN = 3;

export class Game {
  private preferences = loadPreferences();
  private quality = new AdaptiveQuality(this.preferences.quality);
  private audio = new GameAudio(this.preferences.music, this.preferences.sound);
  private settingsReturnMode: 'menu' | 'playing' | 'paused' = 'menu';
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
  private startupStartedAt = 0;
  private startupFallback = false;
  private worldEntered = false;
  private artWarmEpoch=0;
  private preloadBuildArt(){
    const epoch=++this.artWarmEpoch;
    this.combatView.preloadBuildAssets();
    void preloadEligibleUpgradeImages(this.combat.progression,()=>!this.disposed&&epoch===this.artWarmEpoch&&this.mode==='playing');
  }
  private selectedSpecies: SpeciesId = 'yanrong';
  private prototypeVariant: 'sample' | 'fusion' | 'legacy-party' | 'infinite' | 'enemy-test' | 'capture-test' | 'item-test' = 'sample';
  private world: World;
  private combat: Combat;
  private combatView: CombatView;
  private input: Input;
  private mode: Mode = 'menu';
  private deathTransition=new DeathTransition();
  private altarCharacterLayer=new AltarCharacterLayer();
  private runRuleset: Ruleset = 'classic';
  private challenge?: Challenge;
  private run?: RunFlow;
  private enemyTest?: EnemyTestMode;
  private itemTest?: ItemTestMode;
  private featureTestId?: NewFeatureTestId;
  private exploration = new EndlessExploration();
  private explorationView = new ExplorationView();
  private explorationClearing = false;
  private exchangeDialog?: WeaponExchangeDialog;
  private exchangeReturn?: 'playing' | 'shop';
  private featureExchangeUsed = false;
  private fixedRegionSeed = true;
  private randomRegionSeed = '';
  private regionPractice = false;
  private regionMigrationPending = false;
  private regionMigration?: RegionMigrationReport;
  private itemTestAltar?:ItemTestAltarView;
  private altarTrial?:AltarTrial;
  private endlessAltar=new EndlessAltarEvent();
  private altarGuide=new AltarGuide();
  private chestGuide=new WorldEventGuide({title:'封印宝箱',nearText:'靠近开启',theme:'chest-guide'});
  private altarReturn?:{x:number;z:number};
  private ensureAltar(){
    if(!this.itemTestAltar){this.itemTestAltar=new ItemTestAltarView();this.scene.add(this.itemTestAltar.group);}
    if(!this.altarTrial){this.altarTrial=new AltarTrial(()=>this.beginAltarTrial(),()=>this.audio.play('level'));this.scene.add(this.altarTrial.group);}
  }
  private syncEndlessAltar(){
    if(!this.run?.endless||this.altarTrial?.active||!this.world.infiniteActive)return;
    if(this.run.phase==='fighting'&&this.combat.progression.awaitingChoice)return;
    const change=this.endlessAltar.update(this.run,this.position,this.combat.enemies,this.cameraFootprint());
    if(change==='remove'){
      this.itemTestAltar?.setEnabled(false);this.altarTrial?.reset();this.world.setEventClearing?.(null);
    }else if(change==='spawn'){
      this.ensureAltar();this.altarTrial!.reset();Object.assign(this.altarTrial!.origin,this.endlessAltar.position);
      if(!this.altarTrial!.offer(this.combat)){this.endlessAltar.consume();return;}
      const {x,z}=this.endlessAltar.position;
      this.world.setEventClearing?.({x,z:z+1,radius:7});
      this.itemTestAltar!.setPosition(x,z);this.itemTestAltar!.setEnabled(true);
    }
  }
  private beginAltarTrial(){
    const endless=!!this.run?.endless&&this.endlessAltar.present&&this.run.phase==='fighting'&&this.run.remaining>0;
    if(this.mode!=='playing'||(!this.itemTest&&!endless)||!this.altarTrial||this.altarTrial.active||this.capture?.pending||this.combat.progression.awaitingChoice)return;
    if(this.treasureDialog.sync())return;
    const from={x:this.position.x,z:this.position.z};
    if(this.altarTrial.start(this.combat,this.position,this.cameraFootprint(),endless)){
      this.altarGuide.hide();
      this.itemTestAltar?.fadeOut();
      this.altarReturn=endless?from:undefined;this.combatView.group.visible=!endless;
      this.previousPosition.copy(this.position);this.velocity.set(0,0);this.dashRemaining=0;this.input.reset();this.placeCamera(true);
      this.altarTrial.fitViewport(this.cameraFootprint());
    }
  }
  private finishEndlessAltar(){
    this.endlessAltar.consume();this.itemTestAltar?.setEnabled(false);this.world.setEventClearing?.(null);
    if(this.altarReturn){
      this.position.x=this.altarReturn.x;this.position.z=this.altarReturn.z;this.altarReturn=undefined;
      // Restoring scenery may put a trunk on the old platform; resolve it before combat resumes.
      for(let pass=0;pass<4;pass++)for(const o of this.world.obstacles){
        const dx=this.position.x-o.x,dz=this.position.z-o.z,d=Math.hypot(dx,dz),r=o.radius+PLAYER_COLLISION_RADIUS+.05;
        if(d<r){this.position.x=o.x+(d>.001?dx/d:1)*r;this.position.z=o.z+(d>.001?dz/d:0)*r;}
      }
      this.previousPosition.copy(this.position);this.monster.root.position.copy(this.position);this.party.syncLeader(this.position,this.facing);
    }
    this.velocity.set(0,0);this.input.reset();this.combatView.group.visible=true;
    if(this.combat.hp>0)this.combat.invulnerability=Math.max(this.combat.invulnerability,1.1);
    this.placeCamera(true);
  }
  private itemTestSkill:ItemTestSkill='screen-barrage';
  private itemTestLevel=1;
  private capture?: EnemyCapture;
  private captureVfx?: StarSealCaptureSystem;
  private captureSession?: StarSealSession;
  private captureAnchor = new THREE.Object3D();
  private captureHUD?: CaptureHUD;
  private collection=new CaptureCollection((()=>{try{return window.localStorage;}catch{return undefined;}})());
  private captureSpawns=new CaptureSpawns((()=>{try{return window.localStorage;}catch{return undefined;}})());
  private prison?: PrisonView;
  private captureReceipt='';
  private captureSerial=0;
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

  private treasureDialog: TreasureDialog;

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
    this.treasureDialog = new TreasureDialog(this.combat,this.audio,()=>this.mode==='playing'&&!this.portrait&&!this.contextLost);
    this.combatView = new CombatView(this.combat);
    this.combatView.preloadStartup();
    this.scene.add(this.combatView.group);
    this.scene.add(this.explorationView.group);
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
      const steps = [1, 2];
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
    click('open-prison', () => this.openPrison());
    click('start-capture-test', () => this.start('classic', true, true, 'capture-test'));
    click('start-enemy-test', () => this.start('classic', true, true, 'enemy-test'));
    click('open-new-feature-test', () => this.openNewFeatureTestPicker());
    click('close-new-feature-test', () => this.closeNewFeatureTestPicker());
    document.getElementById('new-feature-test-picker')!.addEventListener('click', event => {
      const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-feature-test]') : null;
      const scenario = newFeatureTest(button?.dataset.featureTest ?? '');
      if (this.mode === 'menu' && scenario) this.start('classic', true, true, 'infinite', scenario.id);
    }, options);
    document.getElementById('new-feature-test-picker')!.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('#new-feature-test-picker button'));
      if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons[buttons.length - 1]!.focus(); }
      else if (!event.shiftKey && document.activeElement === buttons[buttons.length - 1]) { event.preventDefault(); buttons[0].focus(); }
    }, options);
    click('feature-test-add-weapon', () => {
      if (!this.featureTestId || this.mode !== 'playing' || this.sceneLoading || this.altarTrial?.active || this.treasureDialog.sync()) return;
      if (addFeatureTestWeapon(this.combat)) this.audio.play('level');
      this.updateHUD();
    });
    click('feature-test-restart', () => { if (this.featureTestId && this.mode === 'playing') this.start(); });
    click('feature-test-switch', () => {
      if (!this.featureTestId || this.mode !== 'playing') return;
      this.showMenu(); this.openNewFeatureTestPicker();
    });
    click('exploration-interact', () => this.tryExploration());
    click('exploration-abandon', () => { if (this.mode === 'playing') { this.exploration.abandon(); this.syncExplorationView(); this.updateHUD(); } });
    click('shop-exchange', () => this.openWeaponExchange('shop'));
    click('shop-feature-switch', () => { if (this.featureTestId && this.mode === 'shop') { this.showMenu(); this.openNewFeatureTestPicker(); } });
    click('shop-feature-restart', () => { if (this.featureTestId && this.mode === 'shop') this.start(); });
    click('feature-test-exchange', () => this.openWeaponExchange('preview'));
    click('feature-test-event-finish', () => {
      if (this.featureTestId !== 'event-lifecycle' || this.mode !== 'playing' || this.exploration.event?.state !== 'active') return;
      this.exploration.event.elapsed = EXPLORATION_RULES.duration;
    });
    click('feature-test-event-boundary', () => {
      if (this.featureTestId !== 'event-lifecycle' || this.mode !== 'playing' || !this.run || this.combat.progression.awaitingChoice || this.treasureDialog.active) return;
      this.run.waveElapsed = this.run.definition.seconds;
    });
    click('feature-test-region-seed',()=>{
      if(this.mode!=='playing'||!this.featureTestId?.startsWith('region-')||this.treasureDialog.active)return;
      this.fixedRegionSeed=!this.fixedRegionSeed;
      if(!this.fixedRegionSeed)this.randomRegionSeed=crypto.randomUUID();
      this.start();
    });
    click('feature-test-region-combat',()=>{
      if(this.mode!=='playing'||!this.featureTestId?.startsWith('region-')||this.featureTestId==='region-choice')return;
      const region=this.run?.region??'meadow';
      const next:NewFeatureTestId=this.regionPractice?`region-${region}-combat`:`region-${region}`;
      this.start('classic',true,false,'infinite',next);
    });
    click('feature-test-region-chest',()=>{
      if(this.mode!=='playing'||!this.featureTestId?.startsWith('region-')||this.featureTestId==='region-choice'
        ||this.regionPractice||!this.run||this.sceneLoading||this.combat.progression.awaitingChoice||this.treasureDialog.active)return;
      if(this.exploration.offer('sealed-chest',this.run,{x:this.position.x+3.5,z:this.position.z})){
        this.syncExplorationView();this.updateHUD();
      }
    });
    click('region-choice-menu',()=>this.showMenu());
    click('region-choice-restart',()=>{if(this.featureTestId&&this.mode==='region-choice')this.start();});
    click('region-choice-tests',()=>{if(this.featureTestId&&this.mode==='region-choice'){this.showMenu();this.openNewFeatureTestPicker();}});
    document.getElementById('region-choice-options')!.addEventListener('click',event=>{
      const button=event.target instanceof Element?event.target.closest<HTMLButtonElement>('[data-region]'):null;
      if(this.mode!=='region-choice'||!button||document.hidden||this.portrait||this.contextLost)return;
      this.chooseNextRegion(button.dataset.region!,button.dataset.regionToken!);
    },options);
    document.getElementById('region-choice-screen')!.addEventListener('keydown',event=>{
      event.stopPropagation();
      if(event.key==='Escape'){event.preventDefault();document.getElementById('region-choice-menu')!.focus();return;}
      if(event.key!=='Tab')return;
      const buttons=Array.from(document.querySelectorAll<HTMLButtonElement>('#region-choice-screen button:not([hidden])'));
      if(event.shiftKey&&document.activeElement===buttons[0]){event.preventDefault();buttons[buttons.length-1]?.focus();}
      else if(!event.shiftKey&&document.activeElement===buttons[buttons.length-1]){event.preventDefault();buttons[0]?.focus();}
    },options);
    click('open-item-test',()=>this.openItemTestPicker());
    click('close-item-test',()=>this.closeItemTestPicker());
    click('start-item-test',()=>{
      if(this.mode!=='menu'||this.portrait||this.contextLost)return;
      this.start('classic',true,false,'item-test');
    });
    click('switch-item-test',()=>{
      if(this.mode!=='playing'||!this.itemTest)return;
      this.showMenu();this.openItemTestPicker();
    });
    document.getElementById('item-test-picker')!.addEventListener('click',event=>{
      const button=event.target instanceof Element?event.target.closest<HTMLButtonElement>('[data-test-skill]'):null;
      if(this.mode!=='menu'||!button||!isItemTestSkill(button.dataset.testSkill??''))return;
      this.itemTestSkill=button.dataset.testSkill as ItemTestSkill;this.syncItemTestSelection();
    },options);
    for(const id of ['item-test-level','item-test-live-level'])document.getElementById(id)!.addEventListener('change',()=>{
      this.itemTestLevel=itemTestRank(Number((document.getElementById(id) as HTMLSelectElement).value));
      this.syncItemTestSelection();
      if(id==='item-test-live-level'&&this.mode==='playing'&&this.itemTest)this.start('classic',true,false,'item-test');
    },options);
    document.getElementById('item-test-picker')!.addEventListener('keydown',event=>{
      if(event.key!=='Tab')return;
      const controls=Array.from(document.querySelectorAll<HTMLElement>('#item-test-picker button,#item-test-picker select'));
      if(event.shiftKey&&document.activeElement===controls[0]){event.preventDefault();controls[controls.length-1]!.focus();}
      else if(!event.shiftKey&&document.activeElement===controls[controls.length-1]){event.preventDefault();controls[0].focus();}
    },options);
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
    click('gameover-endless', () => this.continueEndless());
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
    window.addEventListener('focus', () => { if (this.mode === 'shop'||this.mode==='upgrading'||this.mode==='dying') this.wake(); if(this.mode==='prison')this.audio.setActive(true); }, options);
    window.addEventListener('blur', () => { if (this.mode === 'shop'||this.mode==='dying') this.sleep(); this.audio.setActive(false); this.cardDown = this.armedCard = null; this.pause('窗口失去焦点，游戏已暂停。'); }, options);
    window.addEventListener('pagehide', () => { this.pause('游戏已暂停，准备好后继续。'); this.sleep(); }, options);
    window.addEventListener('pageshow', () => this.wake(), options);
    window.addEventListener('keydown', (event) => {
      if(this.mode==='prison')return;
      if (event.code === 'KeyE') {
        const target = event.target as HTMLElement | null;
        if (event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || target?.closest('input,textarea,select,[contenteditable]')) return;
        if (this.mode === 'playing' && this.tryExploration()) { event.preventDefault(); return; }
        if(this.mode==='playing'&&(this.itemTest||(this.endlessAltar.present&&this.altarTrial?.canActivate(this.position)))){event.preventDefault();this.beginAltarTrial();return;}
        if (this.mode === 'playing' && this.capture) { event.preventDefault(); this.tryCapture(); }
        return;
      }
      if (event.code !== 'Escape') return;
      if (!document.getElementById('new-feature-test-picker')!.hidden) { this.closeNewFeatureTestPicker(); return; }
      if(!document.getElementById('item-test-picker')!.hidden){this.closeItemTestPicker();return;}
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
    if (this.mode !== 'menu' && this.mode !== 'paused' && this.mode !== 'playing') return;
    this.syncSettings();
    this.settingsReturnMode = this.mode;
    this.pause('冒险已暂停，准备好后继续出发。');
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
    this.mode = this.settingsReturnMode === 'menu' ? 'menu' : 'paused';
    if (this.mode === 'paused') {
      document.getElementById('pause-screen')!.hidden = false;
      if (this.settingsReturnMode === 'playing') this.resume();
    } else this.wake();
  }

  private closeCreaturePicker() {
    document.getElementById('creature-picker')!.hidden = true;
    document.getElementById('menu')!.inert = false;
    document.getElementById('choose-creature')!.focus();
  }
  private syncItemTestSelection(){
    for(const button of document.querySelectorAll<HTMLButtonElement>('[data-test-skill]'))button.setAttribute('aria-pressed',String(button.dataset.testSkill===this.itemTestSkill));
    for(const id of ['item-test-level','item-test-live-level'])(document.getElementById(id) as HTMLSelectElement).value=String(this.itemTestLevel);
  }
  private openItemTestPicker(){
    if(this.mode!=='menu')return;
    this.syncItemTestSelection();document.getElementById('menu')!.inert=true;
    document.getElementById('item-test-picker')!.hidden=false;
    document.querySelector<HTMLButtonElement>(`[data-test-skill="${this.itemTestSkill}"]`)!.focus();
  }
  private closeItemTestPicker(){
    document.getElementById('item-test-picker')!.hidden=true;document.getElementById('menu')!.inert=false;
    document.getElementById('open-item-test')!.focus();
  }

  private syncCreatureSelection() {
    const definition = CREATURES[this.selectedSpecies];
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-creature]')) button.setAttribute('aria-pressed', String(button.dataset.creature === this.selectedSpecies));
    document.querySelector('.menu-description')!.textContent = `${definition.name}出战 · 自动攻击，升级强化。`;
    document.getElementById('start-selected-creature')!.firstChild!.textContent = `${definition.name} · 闯关挑战 `;
    document.getElementById('choose-creature')!.setAttribute('aria-label', `选择出战幻兽，当前${definition.name}`);
    this.partyView.preloadLeader(this.selectedSpecies, new URLSearchParams(window.location.search).get('creatureAnimation') !== 'static');
    this.preparePortrait(this.selectedSpecies);
  }

  private preparePortrait(species: SpeciesId) {
    const portrait = document.getElementById('creature-portrait') as HTMLImageElement;
    portrait.hidden = false;
    portrait.loading = 'eager';
    portrait.fetchPriority = 'high';
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
  }

  private get startupWaiting() {
    const portrait = document.getElementById('creature-portrait') as HTMLImageElement;
    const portraitSettled = portrait.dataset.species === this.party.leader.species
      && (portrait.complete && portrait.naturalWidth > 0 || portrait.dataset.loadState === 'failed');
    return [!this.partyView.startupSettled ? '幻兽外观' : '', ...this.combatView.startupWaiting,
      !portraitSettled ? '角色头像' : ''].filter(Boolean);
  }

  private get sceneLoading() {
    // Collision/map readiness must never be bypassed by an art timeout.
    if (this.world.loading) return true;
    if (!this.startupPending) return false;
    if (this.startupWaiting.length) {
      if (performance.now() - this.startupStartedAt < 15000) return true;
      // Existing views already have primitive/static fallbacks for missing art.
      // Keep requests alive so completed art can replace those fallbacks later.
      this.startupFallback = true;
    }
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
    const waiting = this.world.loading ? ['场景地图'] : this.startupWaiting;
    overlay.querySelector('span')!.textContent = waiting.length
      ? `正在加载${waiting.join('、')}…` : '准备完成后自动继续';
  }

  private openPrison() {
    if(this.mode!=='menu')return;
    this.sleep();this.mode='prison';this.input.setEnabled(false);
    document.getElementById('menu')!.inert=true;
    this.prison ??= new PrisonView(this.collection,()=>this.audio.play('collect'),()=>{
      this.prison?.close();this.collection.flush();this.captureSpawns.flush();this.mode='menu';
      document.getElementById('menu')!.inert=false;this.wake();document.getElementById('open-prison')?.focus();
    });
    this.audio.setActive(true);this.audio.unlock();this.prison.open();
  }

  private tryCapture() {
    if (this.mode !== 'playing' || this.altarTrial?.active || !this.capture?.attempt(this.combat,this.position)) return;
    const p = this.capture.pending!;
    this.input.setEnabled(false);this.velocity.set(0,0);
    this.previousPosition.copy(this.position);this.previousJump=this.jumpHeight;
    this.monster.root.position.copy(this.position);this.partyView.stopAnimation();
    this.accumulator=0;
    this.captureAnchor.position.set(p.enemy.x,.05,p.enemy.z);
    this.captureSession = this.captureVfx!.start({target:this.captureAnchor,scale:Math.max(.6,this.combat.enemyRadius(p.enemy))});
    this.audio.play('capture-start');
  }

  private openRegionChoice() {
    if(!this.run||this.run.phase!=='region-choice'||this.treasureDialog.active)return;
    this.mode='region-choice';this.input.setEnabled(false);this.input.reset();this.velocity.set(0,0);this.dashRemaining=0;
    this.previousPosition.copy(this.position);this.accumulator=0;this.audio.setActive(false);this.sleep();
    document.getElementById('hud')!.inert=true;
    document.getElementById('new-feature-test-controls')!.hidden=true;
    document.getElementById('exploration-controls')!.hidden=true;
    document.getElementById('world-loading')!.hidden=true;
    renderRegionChoice(this.run,!!this.featureTestId);
    document.getElementById('region-choice-screen')!.hidden=false;
    document.querySelector<HTMLButtonElement>('#region-choice-options button')!.focus();
  }

  private chooseNextRegion(id:string,token:string) {
    if(!this.run?.chooseRegion(id,token,this.combat))return;
    this.exploration.reset();this.explorationView.sync();this.explorationClearing=false;
    this.endlessAltar.reset();this.altarTrial?.reset();this.itemTestAltar?.setEnabled(false);this.world.setEventClearing?.(null);
    this.world.update(this.position.x,this.position.z,this.cameraFootprint());
    this.world.setRegion?.(this.run.region);
    this.world.update(this.position.x,this.position.z,this.cameraFootprint());
    this.regionMigrationPending=true;
    this.mode='playing';this.accumulator=0;this.intermissionHudSecond=-1;
    document.getElementById('region-choice-screen')!.hidden=true;
    document.getElementById('hud')!.inert=false;
    this.input.setEnabled(false);this.audio.setWave(this.run.waveInCycle);
    this.showSceneLoading();this.updateHUD();this.wake();
  }

  private finishRegionMigration() {
    this.regionMigration=migrateRegionObjects(this.combat,this.position,this.world.obstacles);
    this.regionMigrationPending=false;
    this.previousPosition.copy(this.position);this.monster.root.position.copy(this.position);
    this.party.syncLeader(this.position,this.facing);this.velocity.set(0,0);this.input.reset();this.placeCamera(true);
    this.world.update(this.position.x,this.position.z,this.cameraFootprint());
    this.combat.refreshWorld(this.position.x,this.position.z,this.world.revision);
    this.updateHUD();
    if(this.regionMigration.unresolved)this.pause('新地区仍有落脚重叠，已暂停；可重开或返回菜单。');
  }

  private openNewFeatureTestPicker() {
    if (this.mode !== 'menu') return;
    document.getElementById('menu')!.inert = true;
    document.getElementById('new-feature-test-picker')!.hidden = false;
    document.getElementById('close-new-feature-test')!.focus();
  }

  private syncExplorationView() {
    this.explorationView.sync(this.exploration.event);
    const clearing = this.exploration.present;
    if (clearing !== this.explorationClearing) {
      this.explorationClearing = clearing;
      const e = this.exploration.event;
      if (!this.endlessAltar.present && !this.altarTrial?.active) this.world.setEventClearing?.(clearing && e ? {x:e.x,z:e.z,radius:2.5} : null);
    }
  }

  private tryExploration() {
    if (this.mode !== 'playing' || !this.run?.endless || this.sceneLoading || this.altarTrial?.active
      || this.capture?.pending || this.combat.progression.awaitingChoice || this.treasureDialog.active
      || this.run.phase !== 'fighting' || this.run.remaining <= 0 || this.exploration.event?.wave !== this.run.wave
      || !this.exploration.nearby(this.position) || this.exploration.event?.state !== 'available') return false;
    if (this.exploration.event.kind === 'lost-workshop') this.openWeaponExchange('workshop');
    else this.exploration.start(this.position);
    this.updateHUD(); return true;
  }

  private openWeaponExchange(source: 'shop' | 'workshop' | 'preview') {
    const run = this.run;
    if (!run?.endless || this.combat.hp <= 0 || this.combat.progression.awaitingChoice || this.capture?.pending
      || this.altarTrial?.active || this.treasureDialog.active || this.portrait || this.contextLost) return;
    if (source === 'shop' ? !this.canShop() || !run.shop?.canExchange
      : this.mode !== 'playing' || this.sceneLoading || run.phase !== 'fighting') return;
    if (source === 'preview' && (!this.featureTestId?.startsWith('weapon-exchange') || this.featureExchangeUsed)) return;
    if (source === 'workshop' && (this.exploration.event?.kind !== 'lost-workshop' || this.exploration.event.wave !== run.wave
      || run.remaining <= 0 || !this.exploration.start(this.position))) return;
    const price = source === 'shop' ? run.shop!.exchangePrice : source === 'preview' ? endlessShopPrice(25,run.cycleIndex) : 0;
    const shopToken = run.shop?.token;
    this.exchangeReturn = source === 'shop' ? 'shop' : 'playing';
    this.mode = 'exchanging'; this.input.setEnabled(false); this.input.reset(); this.velocity.set(0,0); this.dashRemaining=0;
    this.previousPosition.copy(this.position); this.accumulator=0; this.audio.setActive(false); this.sleep();
    document.getElementById('hud')!.inert=true;
    document.getElementById('new-feature-test-controls')!.hidden=true;
    document.getElementById('exploration-controls')!.hidden=true;
    document.getElementById('shop-screen')!.inert=true;
    this.exchangeDialog ??= new WeaponExchangeDialog(()=>this.closeWeaponExchange());
    this.exchangeDialog.show(this.combat,price,run.coins,(from:BaseAttackId,to:BaseAttackId)=>{
      if(this.mode!=='exchanging'||this.run!==run||this.combat.hp<=0)return false;
      if(source==='shop'){
        const balance=run.shop?.exchange(from,to,shopToken!,run.coins);
        if(balance===undefined)return false;
        run.coins=balance;
      }else{
        if(source==='workshop'&&(this.exploration.event?.state!=='active'||!this.exploration.nearby(this.position)))return false;
        if(source==='preview'&&this.featureExchangeUsed)return false;
        if(run.coins<price||!this.combat.exchangeWeapon(from,to))return false;
        run.coins-=price;
        if(source==='workshop')this.exploration.completeWorkshop();
        else this.featureExchangeUsed=true;
      }
      this.closeWeaponExchange(true);this.audio.play('level');return true;
    });
  }

  private closeWeaponExchange(committed=false) {
    if (!this.exchangeReturn) return;
    const mode=this.exchangeReturn;this.exchangeReturn=undefined;this.exchangeDialog?.hide();
    if(!committed)this.exploration.cancelWorkshop();
    this.mode=mode;this.accumulator=0;this.input.reset();
    document.getElementById('shop-screen')!.inert=false;
    document.getElementById('hud')!.inert=mode==='shop';
    this.syncExplorationView();this.updateHUD();
    if(mode==='shop'&&this.run){renderRunShop(this.run,this.combat);document.getElementById(committed?'shop-next':'shop-exchange')!.focus();}
    else {this.input.setEnabled(!document.hidden&&!this.portrait&&!this.sceneLoading);document.getElementById('pause')!.focus();}
    this.audio.setActive(!document.hidden);this.wake();
    if(mode==='playing'&&(document.hidden||this.portrait||this.contextLost))this.pause('游戏已暂停，准备好后继续。');
  }

  private closeNewFeatureTestPicker() {
    document.getElementById('new-feature-test-picker')!.hidden = true;
    document.getElementById('menu')!.inert = false;
    document.getElementById('open-new-feature-test')!.focus();
  }

  private start(ruleset: Ruleset = this.runRuleset, partyPrototype = this.partyPrototype, newMap = false, variant = this.prototypeVariant, featureTestId: NewFeatureTestId | undefined = this.featureTestId) {
    if (this.portrait || this.contextLost) return;
    this.capture?.cancel();
    this.runRuleset = ruleset;
    this.exchangeDialog?.hide();this.exchangeReturn=undefined;this.featureExchangeUsed=false;
    this.exploration.reset();this.explorationView.sync();this.explorationClearing=false;
    document.getElementById('exploration-controls')!.hidden=true;
    document.getElementById('shop-screen')!.inert=false;
    this.partyPrototype = partyPrototype;
    this.startupPending = partyPrototype;
    this.startupStartedAt = performance.now();
    this.startupFallback = false;
    this.worldEntered = false;
    this.artWarmEpoch++;
    this.prototypeVariant = partyPrototype ? variant : 'sample';
    this.featureTestId = partyPrototype && variant === 'infinite' ? featureTestId : undefined;
    this.regionPractice=!!this.featureTestId?.startsWith('region-')&&this.featureTestId!=='region-choice'&&!this.featureTestId.endsWith('-combat');
    this.regionMigrationPending=false;this.regionMigration=undefined;
    document.getElementById('region-choice-screen')!.hidden=true;
    this.applyGraphics();
    // Infinite world and Endless survival are paired here; the formal fusion challenge remains finite.
    this.altarCharacterLayer.reset();this.deathTransition.reset();
    this.combat.fusionEnabled = partyPrototype && (variant === 'fusion' || variant === 'infinite' || variant === 'enemy-test' || variant === 'capture-test' || variant === 'item-test');
    this.combatView.setFusion(this.combat.fusionEnabled, this.selectedSpecies !== 'yanrong');
    const endless = partyPrototype && variant === 'infinite';
    this.world.setSample(!endless && partyPrototype && new URLSearchParams(window.location.search).get('world') !== 'legacy', newMap);
    this.world.setInfinite(endless, newMap);
    const requestedRegion=document.querySelector<HTMLSelectElement>('#endless-start-region')?.value
      ??new URLSearchParams(window.location.search).get('region')??'';
    const testRegion=this.featureTestId?.replace(/^region-/,'').replace(/-combat$/,'')??'';
    const initialRegion=this.featureTestId?(isEndlessRegion(testRegion)?testRegion:'meadow')
      :endless&&isEndlessRegion(requestedRegion)?requestedRegion:'meadow';
    if(this.featureTestId?.startsWith('region-')&&!this.fixedRegionSeed&&!this.randomRegionSeed)this.randomRegionSeed=crypto.randomUUID();
    const regionSeed=this.featureTestId?.startsWith('region-')?(this.fixedRegionSeed?'region-showcase-v1':this.randomRegionSeed):undefined;
    if(endless)this.world.setRegion?.(initialRegion,regionSeed);
    this.combat.infiniteWorld = endless;
    this.combat.useNavigation = partyPrototype && (this.world.sampleActive || endless);
    this.combat.party = partyPrototype ? this.party : undefined;
    const species: SpeciesId = this.combat.fusionEnabled ? this.selectedSpecies : 'yanrong';
    document.getElementById('creature-picker')!.hidden = true;
    document.getElementById('item-test-picker')!.hidden = true;
    document.getElementById('new-feature-test-picker')!.hidden = true;
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
    this.treasureDialog.reset();
    this.combat.reset(ruleset);
    this.combatView.preloadBuildAssets();
    this.world.update(0, 0);
    this.combat.refreshWorld(0, 0, this.world.revision);
    this.enemyTest = partyPrototype && (variant === 'enemy-test' || variant === 'capture-test') ? new EnemyTestMode(variant === 'capture-test') : undefined;
    this.altarTrial?.reset();this.endlessAltar.reset();this.altarReturn=undefined;this.world.setEventClearing?.(null);
    this.itemTest=partyPrototype&&variant==='item-test'?new ItemTestMode(this.itemTestSkill,this.itemTestLevel):undefined;
    if(this.itemTest){this.ensureAltar();Object.assign(this.altarTrial!.origin,ITEM_TEST_ALTAR);this.itemTestAltar!.setPosition(ITEM_TEST_ALTAR.x,ITEM_TEST_ALTAR.z);}
    this.itemTestAltar?.setEnabled(!!this.itemTest,this.itemTestSkill);
    this.captureVfx?.clear(); this.captureSession = undefined;
    this.captureReceipt=crypto.randomUUID();this.captureSerial=0;
    const captureEnabled=!this.featureTestId && partyPrototype && (variant==='fusion'||variant==='infinite'||variant==='capture-test');
    this.combat.captureEnabled=captureEnabled;
    this.combat.captureSpawnRoll=kind=>this.captureSpawns.roll(kind);
    this.capture = captureEnabled ? new EnemyCapture(Math.random,kind=>{
      this.collection.add(kind,`${this.captureReceipt}:${++this.captureSerial}`);
      if(!this.collection.saved && this.capture)this.capture.message+=' · 存档失败，请勿关闭页面';
      this.captureHUD?.showSuccess(kind,this.collection.saved);
    }) : undefined;
    if (!this.captureVfx && this.capture) {
      this.captureVfx = new StarSealCaptureSystem(this.scene, 1);
      this.scene.add(this.captureAnchor);
    }
    this.captureHUD ??= new CaptureHUD(()=>this.tryCapture(),()=>{
      if(this.mode==='playing')this.capture?.submit();
    });
    this.captureHUD.clearNotice();
    this.captureHUD.root.hidden=!this.capture;
    this.run = this.combat.usesRunBuild && !this.enemyTest && !this.itemTest ? new RunFlow(Math.random, endless ? 'endless' : 'campaign') : undefined;
    if(this.run)this.run.region=initialRegion;
    this.itemTest?.prepare(this.combat);
    if(this.itemTest){
      this.position.set(ITEM_TEST_ALTAR.x,0,ITEM_TEST_ALTAR.z+7);
      this.previousPosition.copy(this.position);this.monster.root.position.copy(this.position);
    }
    if (this.enemyTest) this.combat.encounters.beginWave(1);
    if (this.run && new URLSearchParams(window.location.search).get('meleeDev') === 'flame-sweep') this.combat.grantUpgrade('flame-sweep-weapon');
    this.combat.automaticSpawning = !this.run && !this.enemyTest && !this.itemTest;
    if (this.featureTestId && this.run) prepareNewFeatureTest(this.featureTestId, this.combat, this.run, this.position);
    else this.run?.prepare(this.combat,this.position);
    if (this.featureTestId && this.run) {
      const id=this.featureTestId;
      const eventKind: ExplorationKind | undefined = id==='lost-workshop' ? 'lost-workshop'
        : id==='sealed-chest'||id==='sealed-chest-low-health'||id==='event-lifecycle' ? 'sealed-chest' : undefined;
      if(eventKind){this.exploration.offer(eventKind,this.run,{x:this.position.x+3.5,z:this.position.z});this.syncExplorationView();}
      if(id==='shop-exchange'){
        this.run.phase='intermission';this.run.intermissionRemaining=.01;
        this.run.updateRest(.01,this.combat);
      }
    }
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
    this.welcome.hidden=!!this.itemTest;
    this.welcome.querySelector('h2')!.textContent = this.enemyTest ? (this.capture ? '捕捉测试 · 单只沙甲团兽' : '敌人测试 · 循环出场') : endless ? '无尽挑战，向远方出发。' : this.combat.fusionEnabled && species !== 'yanrong' ? `${CREATURES[species].name}，准备出发。` : this.combat.fusionEnabled ? '一簇火花，生长成烈焰。' : partyPrototype ? '草场已就绪，出发吧。' : this.challenge ? '三波迎战，冲出一条路。' : this.combat.isTrial ? '犄角已就绪，冲出一条路。' : '小小魔法，准备就绪。';
    this.welcome.querySelector('p')!.textContent = endless ? '六波循环生存 · 第五波旗帜大波与商店 · 第六波 Boss 循环' : this.combat.fusionEnabled && species !== 'yanrong' ? `${CREATURES[species].name}出战 · 摇杆移动 · 自动攻击 · 升级三选一` : this.combat.fusionEnabled ? '六波自动战斗 · 升级形成融合 · 前四波连续迎战，第五波后才可购物' : partyPrototype && variant === 'legacy-party' ? '三兽兼容模式 · 主控移动，伙伴跟随并自动攻击' : partyPrototype ? '摇杆操控焰绒 · 自动攻击 · 沿泥路绕过林地与水岸' : this.challenge ? '击败三波即可通关 · 冲锋命中 6 次、打断 2 次各加一星' : this.combat.isTrial ? '冲刺命中可击退和打断 · 留意黄色扑击预警线' : '移动躲避敌人，焰绒会自动施法 · 靠近拾取经验';
    if(this.itemTest){
      this.welcome.querySelector('h2')!.textContent=`道具测试 · ${ITEM_TEST_OPTIONS.find(o=>o.id===this.itemTest!.skill)!.title}`;
      this.welcome.querySelector('p')!.textContent='仅释放所选弹幕 · 靶怪无伤害并自动补充 · 可在下方切换等级';
    }
    this.syncItemTestSelection();
    this.accumulator = 0;
    this.placeCamera(true);
    this.world.update(this.position.x, this.position.z, this.cameraFootprint());
    this.updateHUD();
    this.wake();
    if(this.featureTestId==='shop-exchange')this.syncRunPhase();
  }

  private pause(reason: string) {
    this.altarGuide.hide();
    this.chestGuide.hide();
    if (this.mode !== 'playing') return;
    this.mode = 'paused';this.altarTrial?.suspend();
    document.getElementById('item-test-controls')!.hidden=true;
    document.getElementById('new-feature-test-controls')!.hidden=true;
    document.getElementById('exploration-controls')!.hidden=true;
    this.treasureDialog.suspend();
    // Loading no longer advances while paused; never let its higher overlay hide Resume.
    document.getElementById('world-loading')!.hidden = true;
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
    document.getElementById('item-test-controls')!.hidden=!this.itemTest||!!this.altarTrial?.active;
    const loading = this.sceneLoading;
    this.input.setEnabled(!loading && !this.capture?.pending);
    if (loading) this.showSceneLoading();
    this.audio.setActive(!loading);
    document.getElementById('pause-screen')!.hidden = true;
    (document.activeElement as HTMLElement | null)?.blur();
    this.wake();
  }

  private showMenu() {
    this.fixedRegionSeed=true;this.randomRegionSeed='';this.regionPractice=false;this.regionMigrationPending=false;this.regionMigration=undefined;
    document.getElementById('region-choice-screen')!.hidden=true;
    this.exchangeDialog?.hide();this.exchangeReturn=undefined;
    this.exploration.reset();this.explorationView.sync();this.explorationClearing=false;
    document.getElementById('exploration-controls')!.hidden=true;
    document.getElementById('shop-screen')!.inert=false;
    this.featureTestId = undefined;
    document.getElementById('new-feature-test-picker')!.hidden = true;
    document.getElementById('new-feature-test-controls')!.hidden = true;
    document.getElementById('menu')!.inert = false;
    this.altarCharacterLayer.reset();this.deathTransition.reset();
    this.collection.flush();this.captureSpawns.flush();
    this.startupPending = false;
    this.startupStartedAt = 0; this.startupFallback = false;
    this.worldEntered = false;
    document.getElementById('world-loading')!.hidden = true;
    this.combat.runBuild.clearPairFusions();
    this.audio.setWave();
    this.capture?.cancel(); this.captureVfx?.clear(); this.captureSession = undefined; this.capture = undefined; if (this.captureHUD) this.captureHUD.root.hidden = true;
    this.run = undefined; this.enemyTest = undefined; this.itemTest=undefined; this.combat.automaticSpawning = true; this.combat.captureEnabled = false;
    this.itemTestAltar?.setEnabled(false);this.altarTrial?.reset();this.endlessAltar.reset();this.altarReturn=undefined;this.world.setEventClearing?.(null);
    document.getElementById('item-test-controls')!.hidden=true;
    document.getElementById('item-test-picker')!.hidden=true;
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

  /** Capture uses its own clock while the battle simulation is frozen. */
  private stepCapture(dt:number) {
    if (this.capture) {
      const p=this.capture.pending;
      if(p)this.captureAnchor.position.set(p.enemy.x,.05,p.enemy.z);
      this.capture.step(dt);
      if(p && this.capture.pending && p.success!==null && !p.announced) {
        p.announced=true;this.audio.play(p.success?'capture-success':'capture-failure');
        if(p.success)this.captureSession?.succeed();else if(!p.retrying)this.captureSession?.fail();
      }
      if(p && !this.capture.pending && p.resultTime<.7)this.captureSession?.cancel();
      this.captureVfx?.update(dt);
    }
  }

  private step(dt: number) {
    if (this.mode !== 'playing' || this.sceneLoading) return;
    this.captureHUD?.step(dt);
    this.altarTrial?.stepNotice(dt);
    if(this.itemTest||this.endlessAltar.present)this.itemTestAltar?.step(dt);
    if(this.capture?.pending){
      this.stepCapture(dt);
      if(!this.capture.pending)this.input.setEnabled(true);
      return;
    }
    if (!this.altarTrial?.active&&this.treasureDialog.sync()) return;
    if(this.run&&!this.altarTrial?.active&&!this.combat.progression.awaitingChoice){
      this.exploration.step(dt,this.run,this.combat,this.position,this.world.obstacles,!this.featureTestId,this.cameraFootprint());
      this.syncExplorationView();
      if(this.treasureDialog.sync())return;
    }
    if(!this.altarTrial?.active)this.syncEndlessAltar();
    if (this.run?.phase === 'intermission') {
      this.run.updateRest(dt, this.combat);
      this.syncRunPhase();
      return;
    }
    this.combat.useNavigation = this.partyPrototype && (this.world.sampleActive || this.combat.infiniteWorld);
    if (!this.altarTrial?.active&&this.combat.progression.awaitingChoice && !this.combat.encounters.dying) { this.openUpgrade(); return; }
    if (!this.altarTrial?.active&&this.run && this.run.remaining <= 1e-8) { this.run.resolveBoundary(this.combat); if (this.syncRunPhase()) return; }
    if(!this.altarTrial?.active)this.run?.prepare(this.combat,this.position);
    this.enemyTest?.step(dt,this.combat,this.position);
    if(this.altarTrial?.active)this.altarTrial.fitViewport(this.cameraFootprint());
    if(!this.altarTrial?.active)this.itemTest?.beforeStep(dt,this.combat,this.position);
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
    if (this.input.consumeDash() && !this.altarTrial?.active && (!this.partyPrototype || this.combat.usesRunBuild) && this.cooldown === 0) {
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
    for (const obstacle of this.altarTrial?.active?[]:this.world.obstacles) {
      const x = this.position.x - obstacle.x, z = this.position.z - obstacle.z;
      const radius = obstacle.radius + PLAYER_COLLISION_RADIUS;
      const length = Math.hypot(x, z);
      if (length < radius) {
        this.position.x = obstacle.x + (length > 0.0001 ? x / length : 1) * radius;
        this.position.z = obstacle.z + (length > 0.0001 ? z / length : 0) * radius;
      }
    }
    if (!this.combat.infiniteWorld) clampToRectangularBoundary(this.position, ARENA_HALF_EXTENT, PLAYER_COLLISION_RADIUS);
    if(this.itemTest||this.endlessAltar.present)this.altarTrial?.resolveEntrance(this.position,this.previousPosition);
    if(this.altarTrial?.active)this.altarTrial.clamp(this.position);
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
    const altarWasActive=!!this.altarTrial?.active;
    if(altarWasActive)this.altarTrial!.step(dt,this.combat,this.position,this.previousPosition);
    else this.combat.update(dt, this.position, this.dashAttack);
    if(this.itemTest&&this.altarTrial?.completed){
      this.itemTestAltar?.setEnabled(false);this.itemTest.altarPresent=false;
    }
    if(altarWasActive&&this.run?.endless&&this.altarTrial?.completed)this.finishEndlessAltar();
    this.itemTest?.afterStep(this.combat);
    if(!altarWasActive)this.stepCapture(dt);
    if (!altarWasActive&&this.combat.hp > 0 && this.treasureDialog.sync()) { this.input.reset(); this.input.setEnabled(false); this.accumulator = 0; return; }
    if (this.partyPrototype && this.combat.hp > 0) this.partyView.stepAnimation(dt, (this.position.x - this.previousPosition.x) / dt, (this.position.z - this.previousPosition.z) / dt);
    if(!altarWasActive)this.audio.playSkills(this.combat.soundEvents);
    this.audio.playHarvest(this.combat.kills - kills);
    if (this.combat.hits > hits) this.audio.play('hit');
    if (this.combat.shotsFired > shots) this.audio.play('cast');
    if (this.combat.collected > collected) this.audio.play('collect');
    if (this.combat.hp < hp) this.audio.play('hurt');
    if (this.combat.hp === 0) this.endRun();
    else {
      if (this.run&&!altarWasActive&&!this.regionPractice) {
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
    if (this.run.phase === 'region-choice') { this.openRegionChoice(); return true; }
    if (this.run.phase === 'won' || this.run.phase === 'lost') { this.endRun(this.run.phase === 'won' ? 'victory' : 'defeat'); return true; }
    if (this.run.phase === 'intermission') {
      // Stay on the battlefield for a real visual rest: no combat/AI advances.
      if (this.intermissionHudSecond < 0) {
        if (this.run.shop) preloadShopArt(this.run.shop, this.combat);
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
      document.getElementById('world-loading')!.hidden=true;
      this.mode = 'shop'; this.input.setEnabled(false); this.velocity.set(0, 0);
      this.previousPosition.copy(this.position); this.partyView.stopAnimation(); this.sleep();
      this.combatView.clear(); this.renderer.render(this.scene, this.camera);
      document.getElementById('hud')!.inert = true;
      document.getElementById('shop-screen')!.hidden = false;
      const growth = this.run.lastWaveGrowth;
      document.getElementById('shop-message')!.textContent = `本波奖励 +${this.run.definition.reward} 金币${growth.sporeBonus ? ` · 爆孢连锁 +${growth.sporeBonus} 金币` : ''}${this.run.shop?.treasureRefreshes ? (this.run.endless ? ' · 携宝兽奖励免费刷新' : ' · 前五波携宝兽奖励免费刷新') : ''}`;
      renderRunShop(this.run, this.combat); this.updateHUD();
      document.getElementById('shop-next')!.focus({ preventScroll: true }); this.wake(); return true;
    }
    if (!this.altarTrial?.active&&this.combat.progression.awaitingChoice && !this.combat.encounters.dying) { this.openUpgrade(); return true; }
    return false;
  }

  private openUpgrade() {
    this.altarGuide.hide();
    this.chestGuide.hide();
    this.mode = 'upgrading';
    this.input.setEnabled(false);
    this.velocity.set(0, 0);
    this.dashRemaining = 0;
    this.previousPosition.copy(this.position);
    this.monster.root.position.copy(this.position);
    this.accumulator = 0;
    this.sleep(true);
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
    this.combatView.preloadSkillAssets(this.combat.progression.offers);
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
      this.preloadBuildArt();
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

  private continueEndless() {
    if (this.mode !== 'gameover' || this.outcome !== 'victory' || this.portrait || this.contextLost
      || !this.run?.canContinueEndless || this.combat.hp <= 0) return;
    if (!this.run.continueEndless(this.combat, { x: 0, z: 0 })) return;
    this.prototypeVariant = 'infinite';
    this.combat.infiniteWorld = true;
    this.combat.useNavigation = true;
    this.world.setInfinite(true);
    this.world.setRegion?.(this.run.region);
    this.position.set(0, 0, 0);
    this.previousPosition.copy(this.position);
    this.velocity.set(0, 0);
    this.jumpHeight = this.previousJump = this.jumpVelocity = this.dashRemaining = 0;
    this.worldEntered = false;
    this.world.update(0, 0, this.cameraFootprint());
    this.combat.refreshWorld(0, 0, this.world.revision);
    this.party.syncLeader(this.position, this.facing);
    this.monster.root.position.copy(this.position);
    this.treasureDialog.reset();
    this.combatView.clear();
    this.intermissionHudSecond = -1;
    this.accumulator = 0;
    this.outcome = null;
    this.mode = 'playing';
    document.getElementById('gameover-screen')!.hidden = true;
    document.getElementById('endless-continue-prompt')!.hidden = true;
    document.getElementById('hud')!.hidden = false;
    document.getElementById('hud')!.inert = false;
    (document.activeElement as HTMLElement | null)?.blur();
    const loading = this.sceneLoading;
    this.input.setEnabled(!loading && !this.capture?.pending);
    this.audio.setWave(this.run.waveInCycle);
    this.audio.setActive(!loading); this.audio.unlock();
    if (loading) this.showSceneLoading(); else document.getElementById('world-loading')!.hidden = true;
    this.welcome.classList.remove('faded');
    this.welcome.querySelector('h2')!.textContent = '无尽挑战 · 第 7 波';
    this.welcome.querySelector('p')!.textContent = '构筑已继承 · 更丰富的怪潮即将来袭';
    this.placeCamera(true);
    this.updateHUD();
    this.wake();
  }

  private endRun(outcome: 'victory' | 'defeat' = 'defeat') {
    if(this.mode==='gameover'||this.mode==='dying')return;
    document.getElementById('region-choice-screen')!.hidden=true;
    if(this.exploration.present&&this.exploration.event)this.exploration.event.state=this.combat.hp<=0?'failed':'expired';
    this.explorationView.sync();document.getElementById('exploration-controls')!.hidden=true;
    this.altarCharacterLayer.reset();
    const endlessResult = this.run?.endless && !this.featureTestId ? {
      wave: this.run.wave,
      cycle: this.run.cycle,
      bossesDefeated: this.run.bossesDefeated,
      survivalSeconds: this.run.totalElapsed,
    } : undefined;
    const endlessRecordUpdate = endlessResult ? recordEndlessRun(endlessResult) : undefined;
    this.capture?.cancel();this.captureVfx?.clear();if(this.captureHUD)this.captureHUD.root.hidden=true;
    this.run?.finish(this.combat, outcome === 'victory');
    document.getElementById('shop-screen')!.hidden = true;
    this.combat.clearTransientEffects(!!this.run?.canContinueEndless);
    this.combatView.clear();
    this.partyView.stopAnimation();
    this.hideUpgrade();
    const died=outcome==='defeat'&&this.combat.hp<=0;
    this.mode = died?'dying':'gameover';this.altarTrial?.suspend();
    document.getElementById('new-feature-test-controls')!.hidden = true;
    this.endlessAltar.consume();this.itemTestAltar?.setEnabled(false);this.world.setEventClearing?.(null);
    this.outcome = outcome;
    if(outcome==='defeat'&&this.combat.hp<=0)this.audio.playDeath();
    else this.audio.setActive(false);
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
    document.getElementById('endless-continue-prompt')!.hidden = !won || !this.run?.canContinueEndless;
    renderResultOutcome(won);
    document.getElementById('result-heading')!.textContent = this.run
      ? this.run.endless ? '无尽生存，挑战结束' : won ? '六波挑战，通关！' : '冒险暂时结束。'
      : won ? '三波挑战，通关！' : '小火焰，休息一下。';
    document.getElementById('result-eyebrow')!.textContent = this.run?.endless ? '生存结算' : won ? '挑战完成' : '本局结束';
    document.getElementById('result-message')!.textContent = won ? '三波挑战完成，再次出发。' : '生命耗尽，本次冒险结束。';
    if (this.run) document.getElementById('result-message')!.textContent = this.run.endless
      ? `生命耗尽，止步第 ${this.run.wave} 波。击败 ${this.run.bossesDefeated} 个 Boss。`
      : won ? '荆冠兽王已击败！构筑经受住了六波考验。'
      : this.run.failure === 'boss-timeout' ? '未能在 90 秒内击败荆冠兽王。调整构筑，再来挑战。'
      : `生命耗尽，止步第 ${this.run.wave} 波。换一种构筑再出发。`;
    if (this.featureTestId) document.getElementById('result-message')!.textContent = '新功能测试结束 · 本次未计入无尽纪录，可再次挑战重置预设。';
    renderRunResult(this.run, this.combat);
    const captured=document.getElementById('result-captures')!;
    captured.hidden=!this.capture;
    captured.textContent=this.capture ? `本局捕获：${Object.entries(this.capture.caught).map(([kind,count])=>`${ENEMY_TYPES[kind as keyof typeof ENEMY_TYPES].name} ×${count}`).join('、')||'暂无'} · ${this.collection.saved?'已永久保存，可在囚坊安排劳作':'存档失败，记录暂存内存'}` : '';
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
    const result=document.getElementById('gameover-screen')!;
    result.classList.toggle('from-death',died);result.hidden=died;
    if(died){
      document.getElementById('hud')!.hidden=true;document.getElementById('item-test-controls')!.hidden=true;
      document.getElementById('area-combo')!.hidden=true;this.damageOverlay.style.opacity='0';
      this.monster.root.position.copy(this.position);
      if(this.partyPrototype)this.partyView.render(1,this.visualTime,.8,0);
      this.deathTransition.begin(this.partyPrototype&&this.partyView.deathBody?this.partyView.deathBody:this.monster.body,
        this.partyPrototype&&this.partyView.deathBody?this.partyView.deathDecorations:[this.monster.root]);
    }
  }

  private formatTime() {
    const seconds = this.regionPractice ? this.elapsed : this.run?.totalElapsed ?? this.elapsed;
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  }


  private updateHUD() {
    const combo = document.getElementById('area-combo')!;
    const feedback = this.combat.areaFeedback;
    combo.hidden = this.mode !== 'playing' || feedback.kills < 8 || this.combat.elapsed - feedback.time > 1.35;
    if (!combo.hidden) combo.textContent = `${feedback.kills} 连斩！`;
    renderEncounterStatus(this.combat,this.run);
    const wave = document.getElementById('run-wave')!, gold = document.getElementById('run-gold')!;
    const regionStatus=document.getElementById('region-status')!;
    regionStatus.hidden=!this.run?.endless;
    if(this.run?.endless)regionStatus.textContent=`${ENDLESS_REGIONS[this.run.region].title}${this.world.inspect().status==='fallback'?' · 备用地图':''}`;
    wave.hidden = !this.run && !this.enemyTest && !this.itemTest;
    document.getElementById('item-test-controls')!.hidden=!this.itemTest||this.mode!=='playing'||!!this.altarTrial?.active;
    if(this.itemTest)wave.textContent=`测试 · ${ITEM_TEST_OPTIONS.find(o=>o.id===this.itemTest!.skill)!.title}`;
    gold.hidden = true; // Only wave and elapsed time occupy the top center.
    const coins = this.run?.coins ?? this.combat.goldEarned;
    document.getElementById('hud-coins')!.textContent = Math.max(0, coins).toLocaleString('en-US');
    if (this.enemyTest) wave.textContent = this.capture ? '捕捉测试 · 单只沙甲团兽' : '敌人测试';
    if (this.run) { wave.textContent = this.run.waveLabel; gold.textContent = `金币 ${this.run.coins}`; }
    const featureControls = document.getElementById('new-feature-test-controls')!;
    featureControls.hidden = !this.featureTestId || this.mode !== 'playing' || this.sceneLoading || !!this.altarTrial?.active;
    if (this.featureTestId && this.run) {
      wave.textContent = `新功能测试 · ${this.run.waveLabel}`;
      const build = this.combat.runBuild;
      const pending = this.combat.progression.awaitingChoice;
      const state=this.exploration.event?.state;
      const stateCopy={available:'等待开启',active:'进行中',completed:'已完成',abandoned:'已放弃',expired:'跨波过期',failed:'失败'};
      document.getElementById('new-feature-test-status')!.textContent = state ? `事件：${stateCopy[state]} · 武器 ${build.attacks.length}/${build.weaponLimit}` : `武器 ${build.attacks.length}/${build.weaponLimit} · 暂停查看构筑`;
      const add=document.getElementById('feature-test-add-weapon') as HTMLButtonElement;
      add.hidden=!this.featureTestId.startsWith('weapon-slots');add.disabled=pending||build.attacks.length>=build.weaponLimit;
      const exchange=document.getElementById('feature-test-exchange') as HTMLButtonElement;
      exchange.hidden=!this.featureTestId.startsWith('weapon-exchange');exchange.disabled=pending||this.featureExchangeUsed;
      const finish=document.getElementById('feature-test-event-finish') as HTMLButtonElement;
      finish.hidden=this.featureTestId!=='event-lifecycle';finish.disabled=pending||state!=='active';
      document.getElementById('feature-test-event-boundary')!.hidden=this.featureTestId!=='event-lifecycle';
      const regionPreview=this.featureTestId.startsWith('region-');
      document.getElementById('feature-test-region-seed')!.hidden=!regionPreview;
      document.getElementById('feature-test-region-seed')!.textContent=this.fixedRegionSeed?'切换随机地形':'切换固定地形';
      const combatButton=document.getElementById('feature-test-region-combat')!;
      combatButton.hidden=!regionPreview||this.featureTestId==='region-choice';
      combatButton.textContent=this.regionPractice?'开始实战':'自由观察';
      const chestButton=document.getElementById('feature-test-region-chest') as HTMLButtonElement;
      chestButton.hidden=!regionPreview||this.regionPractice||this.featureTestId==='region-choice';
      chestButton.disabled=pending||!this.exploration.canOffer(this.run);
      if(regionPreview)document.getElementById('new-feature-test-status')!.textContent=`${ENDLESS_REGIONS[this.run.region].title} · ${this.featureTestId==='region-choice'?'选路预设':this.regionPractice?'自由观察':'实战'} · ${this.fixedRegionSeed?'固定地形':'随机地形'}`;
    }
    document.getElementById('shop-feature-switch')!.hidden=!this.featureTestId;
    document.getElementById('shop-feature-restart')!.hidden=!this.featureTestId;
    const event=this.exploration.event;
    const explorationControls=document.getElementById('exploration-controls')!;
    explorationControls.hidden=!this.exploration.present||this.mode!=='playing'||this.sceneLoading||!!this.altarTrial?.active
      ||!!this.capture?.pending||this.combat.progression.awaitingChoice||this.treasureDialog.active
      ||this.run?.phase!=='fighting'||event?.wave!==this.run?.wave
      ||event?.state==='available'&&!this.exploration.nearby(this.position);
    if(event&&this.exploration.present){
      const opening=event.kind==='sealed-chest'&&event.state==='active';
      explorationControls.classList.toggle('is-countdown',opening);
      document.getElementById('exploration-name')!.hidden=true;
      document.getElementById('exploration-detail')!.hidden=!opening;
      document.getElementById('exploration-abandon')!.hidden=true;
      document.getElementById('exploration-detail')!.textContent=opening
        ? `打开宝箱仅剩 ${Math.max(0,Math.ceil(EXPLORATION_RULES.duration-event.elapsed))} 秒`:'';
      const nearEdge=opening&&Math.hypot(this.position.x-event.x,this.position.z-event.z)>=EXPLORATION_RULES.leaveRadius-1.5;
      explorationControls.classList.toggle('is-near-boundary',nearEdge);
      const rule=document.getElementById('exploration-rule')!;rule.hidden=!opening;
      rule.textContent=nearEdge?'即将出圈！请回到宝箱附近':'请留在蓝色圈内，出圈将中断开启';
      const interact=document.getElementById('exploration-interact') as HTMLButtonElement;
      interact.hidden=event.state==='active';interact.disabled=!this.exploration.nearby(this.position);
      interact.textContent=event.kind==='sealed-chest'?'按E 开启':'按E 使用工坊';
    }
    renderBuildSummary(this.combat.usesRunBuild ? this.combat.runBuild : undefined, this.combat.fusions, this.combat.resonances);
    this.preparePortrait(this.party.leader.species);
    const map = this.world.inspect();
    const replay = document.getElementById('map-replay') as HTMLAnchorElement;
    replay.hidden = !this.partyPrototype || !map.seed;
    const replayKey=`${map.seed}:${map.region??''}`;
    if (map.seed && replay.dataset.mapKey !== replayKey) {
      const url = new URL(window.location.href);
      url.searchParams.delete('world'); url.searchParams.set('seed', map.seed);
      if(map.region)url.searchParams.set('region',map.region);else url.searchParams.delete('region');
      replay.href = url.href; replay.textContent = '复现地图 · 种子 ' + map.seed;
      replay.dataset.seed = map.seed;
      replay.dataset.mapKey = replayKey;
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
    const dashForbidden=!!this.altarTrial?.active;
    this.dashButton.classList.toggle('cooling', this.cooldown > 0||dashForbidden);
    this.dashButton.setAttribute('aria-disabled', String(this.cooldown > 0||dashForbidden));
    this.dashStatus.textContent = dashForbidden?'禁止冲刺':this.cooldown > 0 ? `${this.cooldown.toFixed(1)} 秒` : '就绪';
    const flagWarning = !!this.run?.endless && this.run.phase === 'fighting'
      && this.run.waveInCycle === 4 && this.run.remaining > 0
      && this.run.remaining <= ENDLESS_FLAG_WARNING_SECONDS;
    this.welcome.classList.toggle('flag-wave-warning', flagWarning);
    if (flagWarning && this.run) {
      const warningTitle = '警报！旗帜大波即将来袭';
      const warningDetail =
        `剩余 ${Math.ceil(this.run.remaining)} 秒 · 第 ${this.run.wave + 1} 波 · 怪潮即将压境，保持移动！`;
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
          ? `${Math.ceil(this.run.intermissionRemaining)} 秒后进入第 ${this.run.wave + 1} 波 · Boss 奖励已结算`
          : `${Math.ceil(this.run.intermissionRemaining)} 秒后进入第 ${this.run.wave + 1} 波 · 已回收经验`;
      this.welcome.classList.remove('faded');
    } else if (this.run && this.run.waveElapsed < 3 && this.run.wave > 1) {
      const event = this.run.isBossWave ? (this.run.endless ? '阶段 Boss' : '最终决战') : this.run.isFlagWave ? '旗帜大波' : '怪潮来袭';
      this.welcome.querySelector('h2')!.textContent = `${this.run.waveLabel} · ${event}`;
      this.welcome.querySelector('p')!.textContent = this.run.isBossWave
        ? (this.run.endless ? `${this.combat.encounters.bossName}登场 · 超时后进入狂暴，击败后继续生存` : '荆冠兽王登场 · 留意攻击预警')
        : this.run.isFlagWave ? `${this.run.approachLabel} · 混合怪潮即将压境，留意攻击预警`
        : this.run.waveInCycle === 1 && this.run.modifierLabel ? `特殊规则：${this.run.modifierLabel}。 ${this.run.modifierDescription}`
        : this.run.endless ? `${this.run.approachLabel} · 保持移动，寻找撤离路线` : '开始新一波战斗';
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
    if(this.altarTrial?.active)this.lookTarget.set(this.altarTrial.origin.x,.6,this.altarTrial.origin.z);
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
    const chest=this.exploration.event;
    this.chestGuide.render(this.mode==='playing'&&chest?.kind==='sealed-chest'&&chest.state==='available'
      &&chest.wave===this.run?.wave&&this.run.phase==='fighting'&&!this.sceneLoading&&!this.exploration.nearby(this.position)
      &&!this.altarTrial?.active&&!this.capture?.pending&&!this.combat.progression.awaitingChoice&&!this.treasureDialog.active,
      chest??this.position,this.position,this.camera);
    this.altarGuide.render(this.mode==='playing'&&this.endlessAltar.present&&!this.altarTrial?.active
      &&!this.sceneLoading&&!this.capture?.pending&&!this.combat.progression.awaitingChoice&&!this.treasureDialog.active,
      this.endlessAltar.position,this.position,this.camera);
    if (this.disposed || document.hidden || this.portrait || this.contextLost || (this.mode !== 'menu' && this.mode !== 'playing' && this.mode !== 'shop' && this.mode !== 'dying')) return;
    const rawDt = this.lastTime ? (time - this.lastTime) / 1000 : 0;
    const dt = rawDt ? Math.min(rawDt, STEP * 5) : STEP;
    this.lastTime = time;
    if(this.mode==='dying'){
      const done=this.deathTransition.step(dt);this.renderer.render(this.scene,this.camera);
      if(done){this.deathTransition.hide();this.mode='gameover';document.getElementById('gameover-screen')!.hidden=false;document.getElementById('restart')!.focus({preventScroll:true});}
      else this.frameId=requestAnimationFrame(this.frame);
      return;
    }
    if (this.mode === 'playing' && this.sceneLoading) {
      this.showSceneLoading();
      this.input.setEnabled(false);
      this.audio.setActive(false);
      this.accumulator = 0;
      this.frameId = window.requestAnimationFrame(this.frame);
      return;
    }
    if(this.mode==='playing'&&this.regionMigrationPending){
      this.finishRegionMigration();
      if(this.mode!=='playing')return;
      if(this.sceneLoading){this.showSceneLoading();this.frameId=requestAnimationFrame(this.frame);return;}
    }
    const enteringWorld = this.mode === 'playing' && !document.getElementById('world-loading')!.hidden;
    if (enteringWorld) {
      if(!this.worldEntered)this.preloadBuildArt();
      this.input.setEnabled(true);
      this.audio.setActive(true);
      this.renderTime = 0;
    }
    if (this.mode === 'playing' && !this.capture?.pending && this.treasureDialog.sync()) {
      this.accumulator = 0; this.input.setEnabled(false);
      if(this.treasureDialog.presentingDeath){
        this.treasureDialog.advanceDeath(dt);
        this.combatView.render(1,this.visualTime,this.monster.root.position);
        this.renderer.render(this.scene,this.camera);
      }
      this.frameId = requestAnimationFrame(this.frame); return;
    }
    if (this.mode === 'playing') this.input.setEnabled(!this.capture?.pending);
    if (this.mode === 'shop') { this.run?.updateRest(dt); this.frameId = window.requestAnimationFrame(this.frame); return; }
    if (this.quality.sample(rawDt)) this.applyGraphics();
    const capturePaused=!!this.capture?.pending;
    const speed = this.mode === 'playing' && !capturePaused ? this.preferences.gameSpeed : 1;
    if(!capturePaused)this.visualTime += dt * speed;
    if (this.mode === 'playing') {
      // Retain 1/60-second collision/AI steps at every speed. A delayed frame
      // stays bounded at 5 * 10 ticks; render cadence and audio use real time.
      this.accumulator += dt * speed;
      while (this.mode === 'playing' && this.accumulator >= STEP) {
        this.accumulator -= STEP; this.step(STEP);
      }
    }
    if(this.deathTransition.active){this.frameId=requestAnimationFrame(this.frame);return;}
    const draw = !this.renderTime || time - this.renderTime >= 1000 / this.quality.targetFps - 1 || (this.mode !== 'playing' && this.mode !== 'menu');
    if (draw) this.world.update(this.position.x, this.position.z, this.cameraFootprint());
    // A move or collision correction can request a new streaming neighborhood.
    // Keep the last complete frame on screen until its scenery/collisions are ready.
    if (this.mode === 'playing' && this.sceneLoading) {
      this.showSceneLoading();
      this.input.setEnabled(false); this.audio.setActive(false); this.accumulator = 0;
      this.frameId = window.requestAnimationFrame(this.frame); return;
    }
    const captureActive=!!this.capture?.pending;
    const alpha=captureActive ? 1 : this.accumulator / STEP;
    if (draw) {
      const renderDt = this.renderTime ? Math.min((time - this.renderTime) / 1000, STEP * 5) : dt;
      this.renderTime = time;
      if (this.mode !== 'menu') {
        this.monster.root.position.lerpVectors(this.previousPosition, this.position, alpha);
        if (this.run?.phase !== 'intermission') {
          this.updateHUD();
          if(!this.altarTrial?.active)this.combatView.render(alpha, this.visualTime, this.monster.root.position);
        }
        if (this.partyPrototype) this.partyView.render(alpha, this.visualTime, this.combat.hurtFlash / 0.25, this.itemTest&&!this.altarTrial?.active?0:this.combat.invulnerability);
        this.monster.body.visible = true;
      }
    this.captureHUD?.render(this.capture,this.combat,this.position,this.camera,this.mode==='playing'&&!this.altarTrial?.active);
    if(!captureActive)this.monster.animate(renderDt * speed, Math.min(1, this.velocity.length() / 4.6), this.dashRemaining > 0, this.visualTime, THREE.MathUtils.lerp(this.previousJump, this.jumpHeight, this.accumulator / STEP), this.combat.hurtFlash / 0.25);
      this.placeCamera(false, captureActive ? 0 : renderDt * speed);
      this.monster.root.visible = this.mode !== 'menu' && (!this.partyPrototype || !this.partyView.hasPixelLeader);
      this.altarTrial?.render((!!this.itemTest||this.endlessAltar.present||!!this.altarTrial?.hasNotice)&&this.mode==='playing',this.combat,this.position,alpha,this.camera.quaternion,this.quality.particles);
      if((this.itemTest||this.endlessAltar.present)&&this.altarTrial)this.itemTestAltar?.setColor(this.altarTrial.color);
      const onAltar=this.mode==='playing'&&!!this.itemTestAltar?.group.visible&&!!this.altarTrial?.isOnAltar(this.position);
      this.altarCharacterLayer.apply(onAltar?(this.partyPrototype&&this.partyView.leaderBody?this.partyView.leaderBody:this.monster.body):undefined);
      this.renderer.render(this.scene, this.camera);
      if (this.mode === 'playing') this.worldEntered = true;
      if (enteringWorld) document.getElementById('world-loading')!.hidden = true;
    }
    if (this.mode === 'menu' || this.mode === 'playing') this.frameId = window.requestAnimationFrame(this.frame);
  };

  private wake() {
    if(this.mode==='dying'&&!document.hasFocus())return;
    if(this.mode==='upgrading'){
      // Choices freeze rendering/simulation, while the existing music loop keeps its playhead.
      if(!this.disposed)this.audio.setActive(!document.hidden&&!this.portrait&&!this.contextLost&&document.hasFocus());
      return;
    }
    if (this.frameId || this.disposed || document.hidden || this.portrait || this.contextLost || (this.mode !== 'menu' && this.mode !== 'playing' && this.mode !== 'shop' && this.mode !== 'dying')) return;
    this.lastTime = this.renderTime = 0;
    this.quality.resetSamples();
    if(this.mode!=='dying')this.audio.setActive(true);
    this.accumulator = 0;
    this.frameId = window.requestAnimationFrame(this.frame);
  }

  private sleep(keepAudio=false) {
    if(!keepAudio)this.audio.setActive(false);
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
      assetLoading:{cards:inspectUpgradeImages()},
      mode: this.mode,
      loading: {map:this.world.loading,startupPending:this.startupPending,fallback:this.startupFallback,
        waiting:this.startupPending ? this.startupWaiting : []},
      ruleset: this.runRuleset,
      outcome: this.outcome,
      partyPrototype: this.partyPrototype,
      prototypeVariant: this.prototypeVariant,
      featureTest: this.featureTestId ?? null,
      exploration: this.exploration.event ? {...this.exploration.event} : null,
      regionTransition:{pending:this.regionMigrationPending,migration:this.regionMigration??null,practice:this.regionPractice},
      itemTest:this.itemTest?{skill:this.itemTest.skill,rank:this.itemTest.rank}:null,
      endlessAltar:this.run?.endless?{present:this.endlessAltar.present,active:!!this.altarTrial?.active,position:{...this.endlessAltar.position}}:null,
      capture:this.capture?{unlimitedSeals:true,caught:this.capture.caught,pending:this.capture.pending?{id:this.capture.pending.id,time:this.capture.pending.time,grade:this.capture.pending.grade,retriesLeft:this.capture.pending.retriesLeft,retrying:this.capture.pending.retrying,success:this.capture.pending.success}:null}:null,
      captureSpawns:this.captureSpawns.inspect(),
      collection:this.collection.data.counts,prison:this.prison?.inspect(),
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
    this.explorationView.dispose();
    this.exchangeDialog?.dispose();
    this.altarCharacterLayer.reset();this.deathTransition.dispose();
    this.treasureDialog.dispose();
    this.disposed = true;
    this.sleep();
    clearTimeout(this.toastTimeout);
    clearTimeout(this.choiceTimer);
    this.events.abort();
    this.input.dispose();
    this.monster.dispose();
    this.partyView.dispose();
    this.capture?.cancel();this.captureVfx?.dispose(); this.captureHUD?.dispose();this.prison?.dispose();this.collection.flush();this.captureSpawns.flush(); this.captureAnchor.removeFromParent();
    this.combatView.dispose();this.itemTestAltar?.dispose();this.altarTrial?.dispose();this.altarGuide.dispose();this.chestGuide.dispose();
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
