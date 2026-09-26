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
    height: 2.6, width: 1.5, radius: 0.55, aggro: 12, knock: 11, eye: 0xff1a08, groanPitch: 0.62, loot: 0.9,
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
};

export const ZOMBIE_TYPE_IDS = Object.keys(ZOMBIE_TYPES);
