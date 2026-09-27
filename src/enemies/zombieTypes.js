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
};

export const ZOMBIE_TYPE_IDS = Object.keys(ZOMBIE_TYPES);
