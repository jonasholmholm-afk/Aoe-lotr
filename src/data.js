// =====================================================================
//  Game data: factions, units, buildings, technologies, ages, resources
// =====================================================================

export const RES = ['food', 'wood', 'gold', 'stone'];
export const START_RES = { food: 200, wood: 200, gold: 100, stone: 0 };
export const POP_MAX = 110;
export const CARRY = 10;
export const GATHER_RATE = { berry: 0.52, carcass: 0.7, farm: 0.5, tree: 0.62, gold: 0.56, stone: 0.5 };
export const BUILD_RATE = 1;           // progress-seconds per villager per second

export const AGES = [
  { id: 1, cost: {}, time: 0, req: 0 },
  { id: 2, cost: { food: 400 }, time: 55, req: 2 },             // needs 2 age-1 buildings (not house/farm/tc)
  { id: 3, cost: { food: 700, gold: 200 }, time: 80, req: 2 },  // needs 2 age-2 buildings
];

// -------------------------------------------------------------------
//  Unit definitions
//  cls: villager | infantry | archer | cavalry | cavalry_archer | siege | hero | scout | animal
// -------------------------------------------------------------------
const U = {};
function unit(id, def) { def.id = id; def.bonus = def.bonus || {}; def.cost = def.cost || {}; def.pop = def.pop ?? 1; def.armor = def.armor ?? 0; def.parmor = def.parmor ?? 0; def.range = def.range ?? 0; def.rof = def.rof ?? 1.8; def.los = def.los ?? 5; def.regen = def.regen || 0; def.radius = def.radius ?? 0.28; U[id] = def; return def; }

// ---------------- WOOD ELVES ----------------
unit('glade_dweller', { name: { da: 'Lysningsvogter', en: 'Glade Dweller' }, faction: 'elves', cls: 'villager', hp: 25, atk: 3, speed: 1.0, los: 4.5, cost: { food: 50 }, time: 20, rof: 1.6,
  sprite: { kind: 'humanoid', skin: '#f2dcc4', hair: '#e6c784', tunic: '#6d9b4b', pants: '#3f5a2e', helmet: 'none', weapon: 'tool', shield: null, cloak: null, build: 'slim' } });
unit('glade_scout', { name: { da: 'Hjortespejder', en: 'Glade Scout' }, faction: 'elves', cls: 'scout', hp: 48, atk: 3, armor: 0, parmor: 1, speed: 1.75, los: 8, cost: { food: 80 }, time: 22, rof: 1.8, radius: 0.34,
  sprite: { kind: 'mounted', mount: 'stag', skin: '#f2dcc4', hair: '#e6c784', tunic: '#4f7f3e', pants: '#2e3f23', helmet: 'none', weapon: 'spear', shield: null, cloak: '#2f5d3a' } });
unit('eternal_guard', { name: { da: 'Evighedsvagt', en: 'Eternal Guard' }, faction: 'elves', cls: 'infantry', hp: 55, atk: 6, armor: 1, parmor: 1, speed: 0.95, los: 5, rof: 1.9, cost: { food: 50, wood: 25 }, time: 18, bonus: { cavalry: 8, cavalry_archer: 6, scout: 6 }, upgradesTo: 'wildwood_guard',
  sprite: { kind: 'humanoid', skin: '#f2dcc4', hair: '#e6c784', tunic: '#2f5d3a', pants: '#2e3f23', armorColor: '#b9c7c9', helmet: 'leaf', weapon: 'spear', shield: '#2f5d3a', cloak: null, build: 'slim' } });
unit('wildwood_guard', { name: { da: 'Vildskovsvagt', en: 'Wildwood Guard' }, faction: 'elves', cls: 'infantry', hp: 72, atk: 8, armor: 2, parmor: 2, speed: 0.95, los: 5, rof: 1.9, cost: { food: 50, wood: 25 }, time: 18, bonus: { cavalry: 10, cavalry_archer: 8, scout: 8 }, elite: true,
  sprite: { kind: 'humanoid', skin: '#f2dcc4', hair: '#e6c784', tunic: '#1f4a2c', pants: '#2e3f23', armorColor: '#d8c583', helmet: 'leaf', weapon: 'spear', shield: '#c9a74a', cloak: '#1f4a2c', build: 'slim' } });
unit('wardancer', { name: { da: 'Krigsdanser', en: 'Wardancer' }, faction: 'elves', cls: 'infantry', hp: 52, atk: 9, armor: 0, parmor: 0, speed: 1.25, los: 5, rof: 1.45, cost: { food: 60, gold: 35 }, time: 20, bonus: { infantry: 3, siege: 6 },
  sprite: { kind: 'humanoid', skin: '#f2dcc4', hair: '#c94a3a', tunic: '#8e2b4a', pants: '#2b2b2b', helmet: 'none', weapon: 'twin', shield: null, cloak: null, build: 'slim', tattoo: '#3f6fb3' } });
unit('glade_guard', { name: { da: 'Lysningsskytte', en: 'Glade Guard' }, faction: 'elves', cls: 'archer', hp: 35, atk: 5, armor: 0, parmor: 0, range: 5, speed: 1.0, los: 7, rof: 2.0, cost: { wood: 30, gold: 45 }, time: 20, bonus: { infantry: 1, siege: -2 }, upgradesTo: 'waywatcher',
  sprite: { kind: 'humanoid', skin: '#f2dcc4', hair: '#e6c784', tunic: '#5a8a3e', pants: '#3a4a2a', helmet: 'hood', weapon: 'bow', shield: null, cloak: '#3e6b35', build: 'slim' } });
unit('waywatcher', { name: { da: 'Stivogter', en: 'Waywatcher' }, faction: 'elves', cls: 'archer', hp: 45, atk: 7, armor: 0, parmor: 1, range: 6, speed: 1.05, los: 8, rof: 2.0, cost: { wood: 30, gold: 45 }, time: 20, bonus: { infantry: 2, siege: -2 }, elite: true,
  sprite: { kind: 'humanoid', skin: '#f2dcc4', hair: '#e6c784', tunic: '#4a6a3a', pants: '#2b3a24', helmet: 'hood', weapon: 'bow', shield: null, cloak: '#2a4a2c', build: 'slim', cloakGold: true } });
unit('wild_rider', { name: { da: 'Vildrytter', en: 'Wild Rider' }, faction: 'elves', cls: 'cavalry', hp: 95, atk: 10, armor: 1, parmor: 1, speed: 1.5, los: 6, rof: 1.8, cost: { food: 80, gold: 65 }, time: 26, bonus: { archer: 4, cavalry_archer: 4, villager: 2 }, radius: 0.36,
  sprite: { kind: 'mounted', mount: 'stag', skin: '#f2dcc4', hair: '#e6c784', tunic: '#2f5d3a', pants: '#2e3f23', armorColor: '#b9c7c9', helmet: 'antler', weapon: 'spear', shield: '#2f5d3a', cloak: '#6d9b4b' } });
unit('glade_rider', { name: { da: 'Lysningsrytter', en: 'Glade Rider' }, faction: 'elves', cls: 'cavalry_archer', hp: 58, atk: 6, armor: 0, parmor: 1, range: 4, speed: 1.5, los: 7, rof: 2.0, cost: { wood: 50, gold: 70 }, time: 26, bonus: { infantry: 1 }, radius: 0.36,
  sprite: { kind: 'mounted', mount: 'horse', skin: '#f2dcc4', hair: '#e6c784', tunic: '#5a8a3e', pants: '#3a4a2a', helmet: 'hood', weapon: 'bow', shield: null, cloak: '#3e6b35' } });
unit('treekin', { name: { da: 'Trævæsen', en: 'Tree-kin' }, faction: 'elves', cls: 'siege', hp: 290, atk: 32, armor: 3, parmor: 6, speed: 0.62, los: 5, rof: 2.6, cost: { wood: 180, gold: 100 }, time: 40, pop: 2, bonus: { building: 45, cavalry: 6 }, radius: 0.48,
  sprite: { kind: 'giant', giant: 'treekin' } });
unit('glade_lord', { name: { da: 'Lysningsfyrste', en: 'Glade Lord' }, faction: 'elves', cls: 'hero', hp: 330, atk: 22, armor: 3, parmor: 3, range: 6, speed: 1.3, los: 9, rof: 1.5, cost: { food: 300, gold: 300 }, time: 45, pop: 3, bonus: { infantry: 4, siege: 6 }, regen: 1, unique: true, radius: 0.4,
  sprite: { kind: 'mounted', mount: 'greatstag', skin: '#f2dcc4', hair: '#f0e0a8', tunic: '#1f4a2c', pants: '#1f4a2c', armorColor: '#e0c66e', helmet: 'antler', weapon: 'bow', shield: null, cloak: '#c9a74a', hero: true } });

// ---------------- ORCS ----------------
unit('grot', { name: { da: 'Grot', en: 'Grot' }, faction: 'orcs', cls: 'villager', hp: 25, atk: 3, speed: 1.0, los: 4.5, cost: { food: 50 }, time: 20, rof: 1.6,
  sprite: { kind: 'humanoid', skin: '#7aa33f', hair: null, tunic: '#5a4330', pants: '#3a2c20', helmet: 'none', weapon: 'tool', shield: null, cloak: null, build: 'grot' } });
unit('warg_scout', { name: { da: 'Vargspejder', en: 'Warg Scout' }, faction: 'orcs', cls: 'scout', hp: 52, atk: 4, armor: 0, parmor: 1, speed: 1.75, los: 7, cost: { food: 80 }, time: 22, rof: 1.8, radius: 0.34,
  sprite: { kind: 'mounted', mount: 'warg', skin: '#7aa33f', tunic: '#3a2a1e', pants: '#2a1e14', helmet: 'none', weapon: 'spear', shield: null, cloak: null, build: 'bulky' } });
unit('orc_boy', { name: { da: 'Orkknægt', en: 'Orc Boy' }, faction: 'orcs', cls: 'infantry', hp: 65, atk: 7, armor: 1, parmor: 0, speed: 0.9, los: 5, rof: 2.0, cost: { food: 60, wood: 20 }, time: 18, bonus: { villager: 2 }, upgradesTo: 'big_un',
  sprite: { kind: 'humanoid', skin: '#6f9a3a', tunic: '#3a2a1e', pants: '#2a1e14', armorColor: '#4a3a2a', helmet: 'spiked', weapon: 'cleaver', shield: '#4a2b1b', cloak: null, build: 'bulky' } });
unit('big_un', { name: { da: 'Stor\'un', en: 'Big \'Un' }, faction: 'orcs', cls: 'infantry', hp: 88, atk: 9, armor: 2, parmor: 1, speed: 0.9, los: 5, rof: 2.0, cost: { food: 60, wood: 20 }, time: 18, bonus: { villager: 2 }, elite: true,
  sprite: { kind: 'humanoid', skin: '#5f8a30', tunic: '#2a1e14', pants: '#2a1e14', armorColor: '#6a6a70', helmet: 'spiked', weapon: 'cleaver', shield: '#5a1f1f', cloak: null, build: 'bulky', scale: 1.08 } });
unit('black_orc', { name: { da: 'Sort Ork', en: 'Black Orc' }, faction: 'orcs', cls: 'infantry', hp: 110, atk: 12, armor: 3, parmor: 2, speed: 0.8, los: 5, rof: 2.1, cost: { food: 75, gold: 55 }, time: 24, bonus: { cavalry: 4, infantry: 2 },
  sprite: { kind: 'humanoid', skin: '#3f5a26', tunic: '#1e1e22', pants: '#1a1a1e', armorColor: '#2a2a30', helmet: 'horned', weapon: 'axe', shield: null, cloak: null, build: 'bulky', scale: 1.14 } });
unit('arrer_boy', { name: { da: 'Pileknægt', en: 'Arrer Boy' }, faction: 'orcs', cls: 'archer', hp: 40, atk: 4, armor: 0, parmor: 0, range: 4, speed: 0.95, los: 6, rof: 2.0, cost: { wood: 30, gold: 40 }, time: 19, bonus: { infantry: 1, siege: -2 }, upgradesTo: 'savage_arrer',
  sprite: { kind: 'humanoid', skin: '#7aa33f', tunic: '#4a3a2a', pants: '#2a1e14', helmet: 'cap', weapon: 'bow', shield: null, cloak: null, build: 'bulky' } });
unit('savage_arrer', { name: { da: 'Vild Pileknægt', en: 'Savage Arrer' }, faction: 'orcs', cls: 'archer', hp: 50, atk: 6, armor: 0, parmor: 1, range: 5, speed: 0.95, los: 7, rof: 2.0, cost: { wood: 30, gold: 40 }, time: 19, bonus: { infantry: 2, siege: -2 }, elite: true,
  sprite: { kind: 'humanoid', skin: '#7aa33f', tunic: '#5a1f1f', pants: '#2a1e14', helmet: 'cap', weapon: 'bow', shield: null, cloak: null, build: 'bulky', tattoo: '#b9452c' } });
unit('boar_boy', { name: { da: 'Vildsvinerytter', en: 'Boar Boy' }, faction: 'orcs', cls: 'cavalry', hp: 115, atk: 10, armor: 1, parmor: 1, speed: 1.35, los: 6, rof: 1.9, cost: { food: 80, gold: 60 }, time: 27, bonus: { archer: 5, cavalry_archer: 4, villager: 2 }, radius: 0.36,
  sprite: { kind: 'mounted', mount: 'boar', skin: '#6f9a3a', tunic: '#3a2a1e', pants: '#2a1e14', armorColor: '#4a3a2a', helmet: 'spiked', weapon: 'spear', shield: '#4a2b1b', cloak: null, build: 'bulky' } });
unit('warg_rider', { name: { da: 'Vargrytter', en: 'Warg Rider' }, faction: 'orcs', cls: 'cavalry', hp: 72, atk: 9, armor: 0, parmor: 1, speed: 1.65, los: 7, rof: 1.6, cost: { food: 70, gold: 45 }, time: 22, bonus: { villager: 5, archer: 3 }, radius: 0.36,
  sprite: { kind: 'mounted', mount: 'warg', skin: '#6f9a3a', tunic: '#2a1e14', pants: '#2a1e14', helmet: 'cap', weapon: 'cleaver', shield: null, cloak: null, build: 'bulky' } });
unit('troll', { name: { da: 'Trold', en: 'Troll' }, faction: 'orcs', cls: 'siege', hp: 330, atk: 36, armor: 2, parmor: 4, speed: 0.7, los: 5, rof: 2.8, cost: { food: 170, gold: 130 }, time: 42, pop: 2, bonus: { building: 45, cavalry: 6 }, regen: 1.2, radius: 0.48,
  sprite: { kind: 'giant', giant: 'troll' } });
unit('warboss', { name: { da: 'Krigsboss', en: 'Warboss' }, faction: 'orcs', cls: 'hero', hp: 400, atk: 26, armor: 4, parmor: 3, speed: 1.1, los: 7, rof: 1.8, cost: { food: 300, gold: 300 }, time: 45, pop: 3, bonus: { infantry: 6, building: 12 }, regen: 1, unique: true, radius: 0.42,
  sprite: { kind: 'humanoid', skin: '#3f5a26', tunic: '#1e1e22', pants: '#1a1a1e', armorColor: '#8a2a1f', helmet: 'horned', weapon: 'axe', shield: '#1e1e22', cloak: '#5a1f1f', build: 'bulky', scale: 1.42, hero: true } });

// ---------------- ANIMALS (neutral) ----------------
unit('deer', { name: { da: 'Hjort', en: 'Deer' }, faction: null, cls: 'animal', hp: 8, atk: 0, speed: 1.6, los: 4, food: 140, flee: true, radius: 0.3, sprite: { kind: 'beast', beast: 'deer' } });
unit('boar', { name: { da: 'Vildsvin', en: 'Wild Boar' }, faction: null, cls: 'animal', hp: 80, atk: 7, speed: 1.2, los: 4, rof: 1.5, food: 340, aggressive: true, radius: 0.34, sprite: { kind: 'beast', beast: 'boar' } });
unit('spider', { name: { da: 'Kæmpespinder', en: 'Giant Spider' }, faction: null, cls: 'animal', hp: 70, atk: 9, armor: 1, parmor: 0, speed: 1.3, los: 5, rof: 1.6, food: 0, hostile: true, radius: 0.38, sprite: { kind: 'beast', beast: 'spider' } });

export const UNITS = U;

// -------------------------------------------------------------------
//  Building roles (shared stats) and faction skins
// -------------------------------------------------------------------
export const BUILDING_ROLES = {
  tc:      { size: 4, hp: 2400, cost: { wood: 275, stone: 100 }, time: 120, age: 3, pop: 5, dropoff: ['food', 'wood', 'gold', 'stone'], atk: 5, range: 6, rof: 2.0, armor: 3, parmor: 5, los: 8, trains: ['villager'], ageUp: true },
  house:   { size: 2, hp: 550, cost: { wood: 30 }, time: 25, age: 1, pop: 5, armor: 0, parmor: 5, los: 3 },
  lumber:  { size: 2, hp: 600, cost: { wood: 100 }, time: 30, age: 1, dropoff: ['wood'], armor: 0, parmor: 5, los: 4 },
  mine:    { size: 2, hp: 600, cost: { wood: 100 }, time: 30, age: 1, dropoff: ['gold', 'stone'], armor: 0, parmor: 5, los: 4 },
  mill:    { size: 2, hp: 600, cost: { wood: 100 }, time: 30, age: 1, dropoff: ['food'], armor: 0, parmor: 5, los: 4 },
  farm:    { size: 3, hp: 480, cost: { wood: 60 }, time: 15, age: 1, farm: 250, armor: 0, parmor: 0, los: 2, walkable: true },
  barracks:{ size: 3, hp: 1200, cost: { wood: 175 }, time: 40, age: 1, armor: 0, parmor: 6, los: 5 },
  range:   { size: 3, hp: 1000, cost: { wood: 175 }, time: 40, age: 2, armor: 0, parmor: 6, los: 5 },
  stable:  { size: 3, hp: 1000, cost: { wood: 175 }, time: 40, age: 2, armor: 0, parmor: 6, los: 5 },
  smith:   { size: 3, hp: 1000, cost: { wood: 150 }, time: 40, age: 2, armor: 0, parmor: 6, los: 5 },
  tower:   { size: 1, hp: 720, cost: { wood: 50, stone: 100 }, time: 50, age: 2, atk: 6, range: 7, rof: 2.0, armor: 1, parmor: 7, los: 9 },
  siege:   { size: 3, hp: 1300, cost: { wood: 200, stone: 50 }, time: 50, age: 3, armor: 0, parmor: 6, los: 5 },
  shrine:  { size: 3, hp: 1600, cost: { wood: 250, gold: 150 }, time: 60, age: 3, armor: 1, parmor: 7, los: 6 },
};

export const FACTIONS = {
  elves: {
    id: 'elves', name: { da: 'Wood Elves', en: 'Wood Elves' }, color: '#46c25a', colorDark: '#1d6a2e', minimap: '#5ee36f',
    villager: 'glade_dweller', scout: 'glade_scout', hero: 'glade_lord',
    bonuses: { gather: { tree: 1.10 }, archerRange: 1 },
    buildings: {
      tc:      { name: { da: 'Ældgammelt Flet', en: 'Eldertree Hall' } },
      house:   { name: { da: 'Flet', en: 'Flet' } },
      lumber:  { name: { da: 'Dryadehule', en: 'Dryad Hollow' } },
      mine:    { name: { da: 'Juvelgrotte', en: 'Gem Hollow' } },
      mill:    { name: { da: 'Høstflet', en: 'Harvest Flet' } },
      farm:    { name: { da: 'Lysningshave', en: 'Glade Garden' } },
      barracks:{ name: { da: 'Lysningshal', en: 'Glade Hall' }, trains: ['eternal_guard', 'wardancer'], techs: ['elf_elite_inf'] },
      range:   { name: { da: 'Stivogterhytte', en: 'Waystalker Lodge' }, trains: ['glade_guard'], techs: ['elf_elite_arch'] },
      stable:  { name: { da: 'Vildrytterlund', en: 'Wild Rider Grove' }, trains: ['glade_scout', 'wild_rider', 'glade_rider'] },
      smith:   { name: { da: 'Stjernelyssmedje', en: 'Starlight Forge' }, techs: ['forging', 'iron_casting', 'fletching', 'bodkin', 'scale_mail', 'chain_mail', 'barding', 'archer_armor'] },
      tower:   { name: { da: 'Trætopsvagt', en: 'Treetop Watch' } },
      siege:   { name: { da: 'Trævæsenslund', en: 'Tree-kin Grove' }, trains: ['treekin'] },
      shrine:  { name: { da: 'Egens Helligdom', en: 'Oak of Ages Shrine' }, trains: ['glade_lord'], techs: ['starlight_arrows'] },
    },
    tcTechs: ['loom', 'wheelbarrow'], lumberTechs: ['double_axe'], millTechs: ['orchard'], mineTechs: ['gold_mining', 'stone_mining'],
  },
  orcs: {
    id: 'orcs', name: { da: 'Orcs', en: 'Orcs' }, color: '#d8402c', colorDark: '#6a1a12', minimap: '#ff5a44',
    villager: 'grot', scout: 'warg_scout', hero: 'warboss',
    bonuses: { infantryCost: 0.8, housePop: 10, houseCost: 40 },
    buildings: {
      tc:      { name: { da: 'Krigsbossens Fæstning', en: 'Warboss Stronghold' } },
      house:   { name: { da: 'Orkhytte', en: 'Orc Hut' } },
      lumber:  { name: { da: 'Hakkelejr', en: 'Choppa Camp' } },
      mine:    { name: { da: 'Grotmine', en: 'Grot Mine' } },
      mill:    { name: { da: 'Byttebunke', en: 'Loot Pile' } },
      farm:    { name: { da: 'Squig-fold', en: 'Squig Pen' } },
      barracks:{ name: { da: 'Kamphullet', en: 'Fightin\' Pit' }, trains: ['orc_boy', 'black_orc'], techs: ['orc_elite_inf'] },
      range:   { name: { da: 'Pileskuret', en: 'Arrer Shack' }, trains: ['arrer_boy'], techs: ['orc_elite_arch'] },
      stable:  { name: { da: 'Vildsvinefold', en: 'Boar Pen' }, trains: ['warg_scout', 'boar_boy', 'warg_rider'] },
      smith:   { name: { da: 'Da Smedje', en: 'Da Forge' }, techs: ['forging', 'iron_casting', 'fletching', 'bodkin', 'scale_mail', 'chain_mail', 'barding', 'archer_armor'] },
      tower:   { name: { da: 'Kranietårn', en: 'Skull Tower' } },
      siege:   { name: { da: 'Troldehule', en: 'Troll Cave' }, trains: ['troll'] },
      shrine:  { name: { da: 'Gorks Afgud', en: 'Gork\'s Idol' }, trains: ['warboss'], techs: ['waaagh'] },
    },
    tcTechs: ['loom', 'wheelbarrow'], lumberTechs: ['double_axe'], millTechs: ['orchard'], mineTechs: ['gold_mining', 'stone_mining'],
  },
};

// Build-menu order for villagers
export const BUILD_MENU = ['house', 'farm', 'lumber', 'mill', 'mine', 'barracks', 'range', 'stable', 'smith', 'tower', 'siege', 'shrine', 'tc'];

// -------------------------------------------------------------------
//  Technologies.  effect(player) mutates player.mods
// -------------------------------------------------------------------
export const TECHS = {
  loom:         { name: { da: 'Elverlin / Grot-skind', en: 'Loom' }, desc: { da: 'Arbejdere +15 liv, +1/+1 rustning', en: 'Workers +15 HP, +1/+1 armor' }, cost: { gold: 50 }, time: 25, age: 1, apply: m => { m.villagerHp += 15; m.villagerArmor += 1; } },
  wheelbarrow:  { name: { da: 'Trillebør', en: 'Wheelbarrow' }, desc: { da: 'Arbejdere +10% fart, +3 bæreevne', en: 'Workers +10% speed, +3 carry' }, cost: { food: 175, wood: 50 }, time: 45, age: 2, apply: m => { m.villagerSpeed *= 1.1; m.carry += 3; } },
  double_axe:   { name: { da: 'Dobbeltøkse', en: 'Double Axe' }, desc: { da: '+20% træhugst', en: '+20% wood gathering' }, cost: { food: 100, wood: 50 }, time: 35, age: 2, apply: m => { m.gather.tree *= 1.2; } },
  orchard:      { name: { da: 'Frugthave', en: 'Orchard' }, desc: { da: '+20% madsamling', en: '+20% food gathering' }, cost: { food: 75, wood: 75 }, time: 35, age: 2, apply: m => { m.gather.berry *= 1.2; m.gather.farm *= 1.2; m.gather.carcass *= 1.2; } },
  gold_mining:  { name: { da: 'Guldudvinding', en: 'Gold Mining' }, desc: { da: '+20% guld', en: '+20% gold mining' }, cost: { food: 100, wood: 75 }, time: 35, age: 2, apply: m => { m.gather.gold *= 1.2; } },
  stone_mining: { name: { da: 'Stenbrud', en: 'Stone Mining' }, desc: { da: '+20% sten', en: '+20% stone mining' }, cost: { food: 100, wood: 75 }, time: 35, age: 2, apply: m => { m.gather.stone *= 1.2; } },
  forging:      { name: { da: 'Smedning', en: 'Forging' }, desc: { da: 'Infanteri & kavaleri +1 angreb', en: 'Infantry & cavalry +1 attack' }, cost: { food: 150 }, time: 35, age: 2, apply: m => { m.meleeAtk += 1; } },
  iron_casting: { name: { da: 'Jernstøbning', en: 'Iron Casting' }, desc: { da: 'Infanteri & kavaleri +1 angreb', en: 'Infantry & cavalry +1 attack' }, cost: { food: 220, gold: 120 }, time: 50, age: 3, req: 'forging', apply: m => { m.meleeAtk += 1; } },
  fletching:    { name: { da: 'Pilemageri', en: 'Fletching' }, desc: { da: 'Skytter +1 angreb, +1 rækkevidde', en: 'Archers +1 attack, +1 range' }, cost: { food: 100, gold: 50 }, time: 35, age: 2, apply: m => { m.rangedAtk += 1; m.range += 1; } },
  bodkin:       { name: { da: 'Bodkinpile', en: 'Bodkin Arrow' }, desc: { da: 'Skytter +1 angreb, +1 rækkevidde', en: 'Archers +1 attack, +1 range' }, cost: { wood: 200, gold: 200 }, time: 50, age: 3, req: 'fletching', apply: m => { m.rangedAtk += 1; m.range += 1; } },
  scale_mail:   { name: { da: 'Skælbrynje', en: 'Scale Mail' }, desc: { da: 'Infanteri +1/+1 rustning', en: 'Infantry +1/+1 armor' }, cost: { food: 100 }, time: 35, age: 2, apply: m => { m.infArmor += 1; } },
  chain_mail:   { name: { da: 'Ringbrynje', en: 'Chain Mail' }, desc: { da: 'Infanteri +1/+1 rustning', en: 'Infantry +1/+1 armor' }, cost: { food: 200, gold: 100 }, time: 50, age: 3, req: 'scale_mail', apply: m => { m.infArmor += 1; } },
  barding:      { name: { da: 'Dyrepanser', en: 'Barding' }, desc: { da: 'Kavaleri +1/+1 rustning', en: 'Cavalry +1/+1 armor' }, cost: { food: 150 }, time: 35, age: 2, apply: m => { m.cavArmor += 1; } },
  archer_armor: { name: { da: 'Polstret Skyttedragt', en: 'Padded Archer Armor' }, desc: { da: 'Skytter +1/+1 rustning', en: 'Archers +1/+1 armor' }, cost: { food: 100 }, time: 35, age: 2, apply: m => { m.archArmor += 1; } },
  elf_elite_inf: { name: { da: 'Vildskovsvagt', en: 'Wildwood Guard' }, desc: { da: 'Opgraderer Evighedsvagt', en: 'Upgrades Eternal Guard' }, cost: { food: 200, gold: 100 }, time: 45, age: 3, upgrade: ['eternal_guard', 'wildwood_guard'] },
  elf_elite_arch:{ name: { da: 'Stivogter', en: 'Waywatcher' }, desc: { da: 'Opgraderer Lysningsskytte', en: 'Upgrades Glade Guard' }, cost: { food: 250, gold: 150 }, time: 45, age: 3, upgrade: ['glade_guard', 'waywatcher'] },
  orc_elite_inf: { name: { da: 'Stor\'uns', en: 'Big \'Uns' }, desc: { da: 'Opgraderer Orkknægte', en: 'Upgrades Orc Boys' }, cost: { food: 200, gold: 100 }, time: 45, age: 3, upgrade: ['orc_boy', 'big_un'] },
  orc_elite_arch:{ name: { da: 'Vilde Pileknægte', en: 'Savage Arrers' }, desc: { da: 'Opgraderer Pileknægte', en: 'Upgrades Arrer Boys' }, cost: { food: 250, gold: 150 }, time: 45, age: 3, upgrade: ['arrer_boy', 'savage_arrer'] },
  starlight_arrows: { name: { da: 'Stjernelyspile', en: 'Starlight Arrows' }, desc: { da: 'Skytter +2 angreb (unik)', en: 'Archers +2 attack (unique)' }, cost: { food: 300, gold: 200 }, time: 60, age: 3, apply: m => { m.rangedAtk += 2; } },
  waaagh:       { name: { da: 'WAAAGH!', en: 'WAAAGH!' }, desc: { da: 'Infanteri +15% fart, +1 angreb (unik)', en: 'Infantry +15% speed, +1 attack (unique)' }, cost: { food: 250, gold: 150 }, time: 60, age: 3, apply: m => { m.infSpeed *= 1.15; m.meleeAtk += 1; } },
};

export function defaultMods() {
  return { villagerHp: 0, villagerArmor: 0, villagerSpeed: 1, carry: CARRY, gather: { ...GATHER_RATE }, meleeAtk: 0, rangedAtk: 0, range: 0, infArmor: 0, cavArmor: 0, archArmor: 0, infSpeed: 1 };
}

// -------------------------------------------------------------------
//  Resource nodes
// -------------------------------------------------------------------
export const NODES = {
  tree:  { res: 'wood', amount: 100, name: { da: 'Skov', en: 'Forest' } },
  berry: { res: 'food', amount: 175, name: { da: 'Bærbuske', en: 'Berry Bushes' } },
  gold:  { res: 'gold', amount: 800, name: { da: 'Guldåre', en: 'Gold Vein' } },
  stone: { res: 'stone', amount: 400, name: { da: 'Stenbrud', en: 'Stone Outcrop' } },
  carcass:{ res: 'food', amount: 0, name: { da: 'Bytte', en: 'Carcass' } },
};

export const AGE_NAMES = ['', 'age1', 'age2', 'age3'];
