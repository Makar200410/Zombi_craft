// Zombie archetypes. Stats are base values (hp is scaled per wave by the WaveDirector).
//   speed: blocks/s ; dmg: melee damage ; cd: melee/block swing cooldown (s) ; blockDps: block hardness removed per second
//   bldDmg: damage to a building per swing ; aggro: range (blocks) to notice villagers / the player
export const ZOMBIE_TYPES = {
  walker: {
    name: 'Ходячий мертвец', hp: 30, speed: 1.55, dmg: 6, cd: 1.0, reach: 0.9, blockDps: 1.1, bldDmg: 2,
    height: 1.85, width: 1, radius: 0.3, aggro: 14, knock: 3, eye: 0xff2a10, groanPitch: 1, loot: 0.45,
  },
  runner: {
    name: 'Бегун', hp: 18, speed: 3.7, dmg: 4, cd: 0.6, reach: 0.9, blockDps: 0.6, bldDmg: 1.2,
    height: 1.72, width: 0.9, radius: 0.28, aggro: 22, knock: 2, eye: 0xff9a18, groanPitch: 1.35, loot: 0.4,
  },
  brute: {
    name: 'Громила', hp: 150, speed: 1.2, dmg: 18, cd: 1.5, reach: 1.3, blockDps: 5.5, bldDmg: 16,
    height: 2.6, width: 1.5, radius: 0.44, aggro: 12, knock: 11, eye: 0xff1a08, groanPitch: 0.62, loot: 0.9,
  },
  spitter: {
    name: 'Плевун', hp: 26, speed: 1.9, dmg: 4, cd: 1.0, reach: 0.9, blockDps: 0.7, bldDmg: 2,
    height: 1.8, width: 1, radius: 0.3, aggro: 20, knock: 2, eye: 0x7aff30, groanPitch: 1.15, loot: 0.55,
    hat: 'hood', hatColor: 0x3d5a24, keep: [6.5, 12.5], spitCd: 2.8, spitDmg: 9,
  },
  exploder: {
    name: 'Взрывун', hp: 22, speed: 2.9, dmg: 0, cd: 1.0, reach: 0.9, blockDps: 0, bldDmg: 0,
    height: 1.7, width: 1.3, radius: 0.34, aggro: 18, knock: 0, eye: 0xffe23a, groanPitch: 1.5, loot: 0.5,
    fuse: 1.1, blastR: 3.3, blastDmg: 36,
  },
  necromancer: {
    name: 'Некромант', hp: 420, speed: 1.35, dmg: 10, cd: 1.2, reach: 1.0, blockDps: 2, bldDmg: 7,
    height: 2.3, width: 1, radius: 0.35, aggro: 24, knock: 6, eye: 0xc050ff, groanPitch: 0.5, loot: 1,
    hat: 'hood', hatColor: 0x241036, boss: true, hover: 0.35, boltCd: 2.3, boltDmg: 12, raiseCd: 12,
  },
  // ---- extended bestiary. `base` = which archetype's behaviour it uses; extra flags:
  //   armor (0..1 physical damage reduction; magic pierces), immune ('fire'|'frost'), hitSlow / hitBurn (on melee hit),
  //   aura (buffs nearby undead), leap (jumps over walls / pounces), proj (ranged projectile type), hunch (crouched pose),
  //   deathFire (fire burst on death), tint/skinBase (skin recolour), minWave (first wave it appears in)
  crawler: {
    base: 'runner', name: 'Ползун', hp: 16, speed: 2.6, dmg: 4, cd: 0.7, reach: 0.8, blockDps: 0.4, bldDmg: 1,
    height: 1.25, width: 0.9, radius: 0.28, aggro: 16, knock: 1, eye: 0xff5020, groanPitch: 1.6, loot: 0.35,
    hunch: 0.75, skinBase: 'walker', tint: [0x6a8a50, 0.25], minWave: 3,
  },
  armored: {
    base: 'walker', name: 'Латник', hp: 55, speed: 1.3, dmg: 9, cd: 1.1, reach: 0.95, blockDps: 1.3, bldDmg: 3,
    height: 1.9, width: 1.1, radius: 0.32, aggro: 14, knock: 4, eye: 0xff3a10, groanPitch: 0.85, loot: 0.7,
    armor: 0.55, hat: 'helmet', hatColor: 0x7a7e86, skinBase: 'walker', tint: [0x8a9098, 0.45], plate: true, minWave: 4,
  },
  frost: {
    base: 'walker', name: 'Ледяной мертвец', hp: 38, speed: 1.5, dmg: 7, cd: 1.0, reach: 0.9, blockDps: 1.1, bldDmg: 2,
    height: 1.9, width: 1, radius: 0.3, aggro: 15, knock: 2, eye: 0x60e0ff, groanPitch: 0.9, loot: 0.6,
    immune: 'frost', hitSlow: 2.5, skinBase: 'walker', tint: [0x8ad0ff, 0.5], trail: [0xd8f4ff, 0x9ad8ff], minWave: 6,
  },
  burning: {
    base: 'walker', name: 'Горящий мертвец', hp: 30, speed: 2.4, dmg: 6, cd: 0.9, reach: 0.9, blockDps: 1, bldDmg: 4,
    height: 1.85, width: 1, radius: 0.3, aggro: 16, knock: 2, eye: 0xffd040, groanPitch: 1.2, loot: 0.6,
    immune: 'fire', hitBurn: 3, deathFire: 2.8, skinBase: 'runner', tint: [0xff6a20, 0.45], glow: 0xff7a20, trail: [0xffa030, 0xff5020, 0xffe070], minWave: 7,
  },
  screamer: {
    base: 'spitter', proj: null, name: 'Крикун', hp: 34, speed: 1.7, dmg: 4, cd: 1.0, reach: 0.9, blockDps: 0.6, bldDmg: 1,
    height: 1.95, width: 0.95, radius: 0.3, aggro: 18, knock: 1, eye: 0xff40c0, groanPitch: 1.9, loot: 0.7,
    aura: 9, keep: [5, 9], hat: 'bandana', hatColor: 0x6a1a3a, skinBase: 'spitter', tint: [0xc060a0, 0.3], minWave: 8,
  },
  giant: {
    base: 'brute', name: 'Великан', hp: 520, speed: 1.0, dmg: 30, cd: 1.8, reach: 1.7, blockDps: 9, bldDmg: 32,
    height: 3.8, width: 2.1, radius: 0.6, aggro: 12, knock: 15, eye: 0xff2000, groanPitch: 0.4, loot: 1,
    skinBase: 'brute', tint: [0x4a6a3a, 0.2], minWave: 9,
  },
  digger: {
    base: 'walker', name: 'Землекоп', hp: 40, speed: 1.6, dmg: 6, cd: 0.8, reach: 0.9, blockDps: 4.2, bldDmg: 7,
    height: 1.8, width: 1, radius: 0.3, aggro: 12, knock: 2, eye: 0xffa020, groanPitch: 1.0, loot: 0.65,
    hat: 'cap', hatColor: 0xb89020, skinBase: 'walker', tint: [0x7a6040, 0.3], minWave: 8,
  },
  skeleton: {
    base: 'spitter', name: 'Скелет-лучник', hp: 24, speed: 1.8, dmg: 4, cd: 1.0, reach: 0.9, blockDps: 0.5, bldDmg: 1,
    height: 1.85, width: 0.85, radius: 0.28, aggro: 22, knock: 2, eye: 0x60a0ff, groanPitch: 1.4, loot: 0.6,
    keep: [8, 15], spitCd: 2.1, spitDmg: 8, proj: 'arrow', skinBase: 'walker', tint: [0xe8e2cc, 0.8], bones: true, minWave: 6,
  },
  leaper: {
    base: 'runner', name: 'Прыгун', hp: 24, speed: 3.1, dmg: 6, cd: 0.7, reach: 0.9, blockDps: 0.5, bldDmg: 1.5,
    height: 1.8, width: 0.9, radius: 0.28, aggro: 20, knock: 3, eye: 0x9aff20, groanPitch: 1.3, loot: 0.55,
    leap: 11, skinBase: 'runner', tint: [0x6ab040, 0.3], minWave: 7,
  },
  // ---- flyers (base 'flyer'): fly over walls at `fly.cruise` blocks above the ground, swoop down on the living,
  //      strike and climb away again; `fly.wing` = wingspan of one wing (blocks)
  bat: {
    base: 'flyer', name: 'Упырь-нетопырь', hp: 14, speed: 4.6, dmg: 4, cd: 0.7, reach: 1.0, blockDps: 0, bldDmg: 0.6,
    height: 1.05, width: 0.75, radius: 0.26, aggro: 26, knock: 1, eye: 0xff3050, groanPitch: 2.0, loot: 0.25,
    hunch: 0.45, fly: { cruise: 6, wing: 1.1 }, skinBase: 'runner', tint: [0x4a2a40, 0.55],
  },
  harpy: {
    base: 'flyer', name: 'Крылатый мертвец', hp: 48, speed: 3.3, dmg: 9, cd: 1.0, reach: 1.1, blockDps: 0, bldDmg: 4,
    height: 1.9, width: 1, radius: 0.32, aggro: 24, knock: 3, eye: 0xffa030, groanPitch: 1.05, loot: 0.75,
    fly: { cruise: 8, wing: 1.9 }, skinBase: 'walker', tint: [0x5a4a6a, 0.4],
  },
  // ---- underground (never in the night waves: they live in caves and dungeons; `cave` marks them, `model` picks
  //      a non-human body, `split` spawns smaller ones on death)
  cave_spider: {
    base: 'runner', name: 'Пещерный паук', hp: 22, speed: 3.6, dmg: 5, cd: 0.6, reach: 1.0, blockDps: 0.3, bldDmg: 1,
    height: 0.85, width: 1.4, radius: 0.45, aggro: 18, knock: 1, eye: 0xff2020, groanPitch: 1.8, loot: 0.35,
    leap: 8, hitSlow: 1.5, cave: true, model: { kind: 'spider', size: 0.85, tint: 0x3a3036 },
  },
  slime: {
    base: 'walker', name: 'Слизень', hp: 34, speed: 1.9, dmg: 5, cd: 0.9, reach: 1.0, blockDps: 0, bldDmg: 1,
    height: 1.1, width: 1.1, radius: 0.5, aggro: 14, knock: 3, eye: 0x203010, groanPitch: 1.6, loot: 0.4,
    leap: 7, split: 'slime_small', cave: true, model: { kind: 'slime', size: 1.1, tint: 0x5ad040 },
  },
  slime_small: {
    base: 'walker', name: 'Слизнёныш', hp: 10, speed: 2.4, dmg: 2, cd: 0.8, reach: 0.9, blockDps: 0, bldDmg: 0.5,
    height: 0.55, width: 0.55, radius: 0.26, aggro: 14, knock: 1, eye: 0x203010, groanPitch: 2.2, loot: 0.1,
    leap: 6, cave: true, model: { kind: 'slime', size: 0.55, tint: 0x6ae050 },
  },
  cave_dweller: {
    base: 'walker', name: 'Пещерный упырь', hp: 40, speed: 2.2, dmg: 8, cd: 0.9, reach: 1.0, blockDps: 1, bldDmg: 2,
    height: 1.75, width: 0.95, radius: 0.3, aggro: 20, knock: 3, eye: 0x80ffff, groanPitch: 0.9, loot: 0.5,
    hunch: 0.35, cave: true, skinBase: 'walker', tint: [0xc8d0d8, 0.55],
  },
  imp: {
    base: 'flyer', name: 'Бес преисподней', hp: 26, speed: 4.0, dmg: 6, cd: 0.8, reach: 1.0, blockDps: 0, bldDmg: 1,
    height: 1.2, width: 0.8, radius: 0.28, aggro: 24, knock: 2, eye: 0xffe040, groanPitch: 1.7, loot: 0.6,
    hunch: 0.3, immune: 'fire', hitBurn: 2.5, glow: 0xff4010, cave: true, fly: { cruise: 4, wing: 1.2 },
    skinBase: 'runner', tint: [0xc03018, 0.55], trail: [0xffa030, 0xff5020],
  },
  magma_golem: {
    base: 'brute', name: 'Магмовый голем', hp: 170, speed: 1.3, dmg: 20, cd: 1.5, reach: 1.3, blockDps: 4, bldDmg: 14,
    height: 2.5, width: 1.5, radius: 0.44, aggro: 16, knock: 10, eye: 0xffc020, groanPitch: 0.55, loot: 1,
    immune: 'fire', hitBurn: 3, deathFire: 3, glow: 0xff5010, cave: true, skinBase: 'brute', tint: [0x3a1a10, 0.6], trail: [0xffa030, 0xff4010],
  },
  lich: {
    base: 'necromancer', name: 'Лич подземелья', hp: 950, speed: 1.4, dmg: 14, cd: 1.1, reach: 1.1, blockDps: 2, bldDmg: 8,
    height: 2.4, width: 1, radius: 0.36, aggro: 26, knock: 7, eye: 0x60e0ff, groanPitch: 0.45, loot: 1,
    hat: 'crown', hatColor: 0xe8c040, boss: true, hover: 0.4, boltCd: 1.8, boltDmg: 16, raiseCd: 9, armor: 0.25, cave: true,
    skinBase: 'necromancer', tint: [0x8ab0d0, 0.45], glow: 0x2040a0,
  },
  // ---- people of the rival villages (src/systems/rivals.js). `human`: a villager skin, a weapon in hand, no
  //      undead eyes or groans; `job` picks the outfit. Folk are peaceful until their village is at war.
  folk: {
    base: 'walker', name: 'Житель', hp: 30, speed: 1.6, dmg: 4, cd: 1.0, reach: 0.9, blockDps: 0, bldDmg: 0,
    height: 1.8, width: 1, radius: 0.3, aggro: 16, knock: 2, eye: 0x202020, groanPitch: 1, loot: 0.3,
    human: true, job: 'idle',
  },
  merchant: {
    base: 'walker', name: 'Торговец', hp: 45, speed: 1.9, dmg: 3, cd: 1.0, reach: 0.9, blockDps: 0, bldDmg: 0,
    height: 1.8, width: 1, radius: 0.3, aggro: 12, knock: 2, eye: 0x202020, groanPitch: 1, loot: 0.5,
    human: true, job: 'merchant', hat: 'cap', hatColor: 0x7a3a8a,
  },
  militia: {
    base: 'walker', name: 'Ополченец', hp: 38, speed: 2.1, dmg: 7, cd: 0.95, reach: 0.95, blockDps: 1.2, bldDmg: 3,
    height: 1.8, width: 1, radius: 0.3, aggro: 22, knock: 3, eye: 0x202020, groanPitch: 1, loot: 0.6,
    human: true, job: 'woodcutter', weapon: 'axe_stone',
  },
  rival_guard: {
    base: 'walker', name: 'Стражник', hp: 60, speed: 2.0, dmg: 9, cd: 1.0, reach: 1.0, blockDps: 1.5, bldDmg: 4,
    height: 1.85, width: 1, radius: 0.3, aggro: 22, knock: 4, eye: 0x202020, groanPitch: 1, loot: 0.7,
    human: true, job: 'guard', weapon: 'sword_iron', armor: 0.3, hat: 'helmet', hatColor: 0x8a8e96,
  },
  rival_archer: {
    base: 'spitter', proj: 'arrow', name: 'Лучник', hp: 34, speed: 2.0, dmg: 5, cd: 1.0, reach: 0.9, blockDps: 0.6, bldDmg: 2,
    height: 1.8, width: 1, radius: 0.3, aggro: 26, knock: 2, eye: 0x202020, groanPitch: 1, loot: 0.7,
    keep: [7, 15], spitCd: 2.0, spitDmg: 9, human: true, job: 'guard', weapon: 'bow',
  },
  rival_knight: {
    base: 'walker', name: 'Рыцарь', hp: 120, speed: 1.75, dmg: 15, cd: 1.1, reach: 1.1, blockDps: 2.5, bldDmg: 8,
    height: 1.9, width: 1.05, radius: 0.32, aggro: 22, knock: 6, eye: 0x202020, groanPitch: 1, loot: 0.9,
    human: true, job: 'guard', weapon: 'battle_axe', armor: 0.5, hat: 'helmet', hatColor: 0xb0b4bc,
  },
  rival_musketeer: {
    base: 'spitter', proj: 'bullet', name: 'Мушкетёр', hp: 50, speed: 1.9, dmg: 6, cd: 1.0, reach: 0.9, blockDps: 1, bldDmg: 3,
    height: 1.8, width: 1, radius: 0.3, aggro: 28, knock: 2, eye: 0x202020, groanPitch: 1, loot: 0.8,
    keep: [10, 18], spitCd: 3.2, spitDmg: 18, human: true, job: 'guard', weapon: 'musket', hat: 'cap', hatColor: 0x2a3a6a,
  },
  rival_rifleman: {
    base: 'spitter', proj: 'bullet', name: 'Стрелок', hp: 80, speed: 2.1, dmg: 8, cd: 1.0, reach: 0.9, blockDps: 1.5, bldDmg: 5,
    height: 1.8, width: 1, radius: 0.3, aggro: 30, knock: 2, eye: 0x202020, groanPitch: 1, loot: 0.9,
    keep: [12, 22], spitCd: 1.6, spitDmg: 16, armor: 0.3, human: true, job: 'guard', weapon: 'rifle', hat: 'helmet', hatColor: 0x4a5a3a,
  },
  rival_trooper: {
    base: 'spitter', proj: 'laser', name: 'Штурмовик', hp: 130, speed: 2.3, dmg: 10, cd: 1.0, reach: 0.9, blockDps: 2, bldDmg: 8,
    height: 1.85, width: 1, radius: 0.3, aggro: 32, knock: 2, eye: 0x202020, groanPitch: 1, loot: 1,
    keep: [12, 24], spitCd: 1.2, spitDmg: 20, armor: 0.4, human: true, job: 'guard', weapon: 'laser_rifle', hat: 'helmet', hatColor: 0xd0d4e0,
  },
  // ---- industrial & electric ages (appear by the village's age, not by wave number)
  mutant: {
    base: 'walker', name: 'Мутант', hp: 95, speed: 2.1, dmg: 13, cd: 0.9, reach: 1.1, blockDps: 3, bldDmg: 8,
    height: 2.2, width: 1.3, radius: 0.38, aggro: 16, knock: 6, eye: 0x9aff20, groanPitch: 0.7, loot: 0.8,
    regen: 0.025, skinBase: 'brute', tint: [0x7aa030, 0.35], trail: [0x9aff40, 0x5a9a20],
  },
  conductor: {
    base: 'runner', name: 'Проводник', hp: 40, speed: 3.2, dmg: 7, cd: 0.7, reach: 0.9, blockDps: 1, bldDmg: 6,
    height: 1.85, width: 1, radius: 0.3, aggro: 20, knock: 2, eye: 0x60ffff, groanPitch: 1.3, loot: 0.7,
    immune: 'storm', noSlow: true, skinBase: 'runner', tint: [0x40d0ff, 0.4], trail: [0x9af0ff, 0xffffff],
  },
  // ---- atomic & information ages
  irradiated: {
    base: 'walker', name: 'Облучённый', hp: 80, speed: 1.8, dmg: 10, cd: 1.0, reach: 1.0, blockDps: 2, bldDmg: 6,
    height: 2.0, width: 1.1, radius: 0.34, aggro: 16, knock: 4, eye: 0xc0ff40, groanPitch: 0.8, loot: 0.9,
    rad: 3.5, radDps: 5, deathFire: 3, skinBase: 'walker', tint: [0x9aff40, 0.5], glow: 0x9aff40, trail: [0xc0ff60, 0x70c020],
  },
  swarm: {
    base: 'runner', name: 'Рой', hp: 10, speed: 4.1, dmg: 3, cd: 0.5, reach: 0.7, blockDps: 0.4, bldDmg: 1,
    height: 1.0, width: 0.7, radius: 0.24, aggro: 24, knock: 1, eye: 0xff3030, groanPitch: 2.1, loot: 0.15,
    hunch: 0.8, skinBase: 'runner', tint: [0x3a3a44, 0.45],
  },
  hacker: {
    base: 'spitter', proj: null, name: 'Хакер', hp: 50, speed: 2.0, dmg: 5, cd: 1.0, reach: 0.9, blockDps: 0.8, bldDmg: 2,
    height: 1.85, width: 1, radius: 0.3, aggro: 20, knock: 2, eye: 0x40a0ff, groanPitch: 1.6, loot: 0.9,
    keep: [9, 14], jam: true, hat: 'hood', hatColor: 0x1a2a3a, skinBase: 'spitter', tint: [0x3060c0, 0.4], trail: [0x60c0ff, 0x2060ff],
  },
  // ---- singularity
  nanite: {
    base: 'runner', name: 'Наноплесень', hp: 22, speed: 3.6, dmg: 5, cd: 0.6, reach: 0.8, blockDps: 1.2, bldDmg: 3,
    height: 1.2, width: 0.8, radius: 0.26, aggro: 24, knock: 1, eye: 0xc0c0ff, groanPitch: 2.2, loot: 0.3,
    regen: 0.06, hunch: 0.8, skinBase: 'runner', tint: [0xb0b8d0, 0.6], trail: [0xd0d8ff, 0x8090c0],
  },
  nano_titan: {
    base: 'brute', name: 'Нано-титан', hp: 2600, speed: 1.15, dmg: 45, cd: 1.6, reach: 2.0, blockDps: 12, bldDmg: 60,
    height: 4.6, width: 2.4, radius: 0.7, aggro: 16, knock: 18, eye: 0x80a0ff, groanPitch: 0.3, loot: 1,
    boss: true, armor: 0.35, regen: 0.006, immune: 'storm', skinBase: 'brute', tint: [0xa0a8c0, 0.7], glow: 0x80a0ff, trail: [0xc0d0ff, 0x6070ff],
  },
};

export const ZOMBIE_TYPE_IDS = Object.keys(ZOMBIE_TYPES);
