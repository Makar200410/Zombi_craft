// Recorded audio used on top of the procedural engine (sfx.js). Files live in public/audio and are loaded lazily;
// until a file is ready (or if it fails) the procedural version of the sound plays instead.
// Licences and authors: see CREDITS.md (also shown in the game's «Об игре» screen).

/** Sound name → recorded variants (one is picked at random each time). */
const R = (base, ids) => ids.map(i => base + i);
export const SAMPLES = {
  // world
  step_grass: ['default_grass_footstep.1', 'default_grass_footstep.2', 'default_grass_footstep.3'],
  step_stone: ['default_hard_footstep.1', 'default_hard_footstep.2', 'default_hard_footstep.3'],
  step_wood: ['default_wood_footstep.1', 'default_wood_footstep.2'],
  dig_dirt: ['default_dig_crumbly'],
  dig_stone: ['default_dig_cracky.1', 'default_dig_cracky.2', 'default_dig_cracky.3'],
  dig_wood: ['default_dig_choppy.1', 'default_dig_choppy.2', 'default_dig_choppy.3'],
  pick_hit: ['default_dig_cracky.1', 'default_dig_cracky.2', 'default_dig_cracky.3'],
  break_block: ['default_dug_node.1', 'default_dug_node.2'],
  place_block: ['default_place_node.1', 'default_place_node.2', 'default_place_node.3'],
  chop: R('lumber_', [1, 2, 3, 4, 5]),
  hammer: R('construct_', [1, 2, 3, 4, 5]),
  harvest: R('harvest_', [1, 2, 3, 4]),
  splash: R('splash_', [1, 2, 3]),
  // combat
  swing: R('swing_', [1, 2, 3, 4, 5, 6]),
  hit_zombie: R('flesh_imp_', [10, 11, 12]),
  hit_flesh: R('flesh_stab_', [1, 2, 3]),
  bow_shoot: R('bow_', [1, 2, 3, 4]),
  arrow_hit: R('arrow_hit_', [1, 2, 3, 4]),
  crossbow_shoot: ['crossbow'],
  musket_shot: R('musket_', [1, 2, 3]),
  blunderbuss_shot: R('blunderbuss_', [1, 2]),
  rifle_shot: ['rifle'],
  mg_shot: ['mg'],
  cannon_shot: ['cannon'],
  rocket_launch: ['rocket'],
  laser_shot: ['laser_1', 'laser_2'],
  explosion: ['tnt_explode', 'explode_debris'],
  // magic
  fireball_cast: ['whoosh_fire'],
  fire_impact: R('sizzle_', [11, 12, 13]),
  frost_cast: ['whoosh_frost'],
  frost_impact: R('glass_', [1, 2, 3]),
  lightning: ['thunder_1', 'thunder_2'],
  heal: ['heal'],
  meteor_fall: ['meteor'],
  // creatures
  zombie_groan: R('zgroan_', [1, 2, 3, 4, 5, 6]),
  zombie_hurt: R('zhurt_', [10, 11, 12]),
  zombie_die: R('zdie_', [20, 21, 22, 23]),
  zombie_spit: R('spit_', [1, 2, 3]),
  villager_hurt: [...R('vhurt_m_', [30, 31, 32]), ...R('vhurt_f_', [1, 2, 3])],
  player_hurt: ['player_damage'],
  death: ['player_death'],
  // interface & events
  ui_click: ['click'],
  ui_open: ['paper'],
  ui_close: ['paper'],
  coins: ['coins'],
  research_done: ['research_done'],
  build_complete: ['build_complete'],
  level_up: ['level_up'],
  wave_horn: ['wave_horn'],
  wave_cleared: ['wave_cleared'],
  rain_loop: ['rain_loop'],
};
/** Relative volume of each recorded sound so they sit well together (files are loudness-normalised). */
export const SAMPLE_GAIN = {
  step_grass: 0.55, step_stone: 0.5, step_wood: 0.55, dig_dirt: 0.7, dig_stone: 0.75, dig_wood: 0.8, chop: 0.75, pick_hit: 0.7,
  break_block: 0.8, place_block: 0.8, hammer: 0.6, harvest: 0.6, splash: 0.7,
  swing: 0.55, hit_zombie: 0.7, hit_flesh: 0.7, bow_shoot: 0.8, arrow_hit: 0.6, crossbow_shoot: 0.75, musket_shot: 0.8, blunderbuss_shot: 0.85,
  rifle_shot: 0.7, mg_shot: 0.45, cannon_shot: 0.9, rocket_launch: 0.8, laser_shot: 0.55, explosion: 1,
  fireball_cast: 0.7, fire_impact: 0.6, frost_cast: 0.6, frost_impact: 0.55, lightning: 0.75, heal: 0.6, meteor_fall: 0.9,
  zombie_groan: 0.75, zombie_hurt: 0.6, zombie_die: 0.8, zombie_spit: 0.6, villager_hurt: 0.55, player_hurt: 0.9, death: 0.9,
  ui_click: 0.5, ui_open: 0.45, ui_close: 0.4, coins: 0.7, research_done: 0.75, build_complete: 0.7, level_up: 0.8, wave_horn: 0.9, wave_cleared: 0.85,
};
/** New sound names without a procedural version fall back to a similar synthesized one while loading. */
export const SOUND_ALIAS = { rifle_shot: 'musket_shot', mg_shot: 'musket_shot', cannon_shot: 'blunderbuss_shot', rocket_launch: 'explosion', laser_shot: 'lightning' };
export const SFX_DIR = 'audio/sfx/';

/** Orchestral soundtrack by Omri Lahav & Wildfire Games (0 A.D.), per mood. */
export const MUSIC_DIR = 'audio/music/';
// Ancient ages (stone → gunpowder) and the later ages (industrial → singularity) have their own playlists.
export const PLAYLISTS = {
  menu: ['cradle_of_civilization'],
  day: ['forging_a_city_state', 'highland_mist', 'harvest_festival', 'sunrise'],
  night: ['calm_before_the_storm', 'hill_of_sorrows'],
  wave: ['red_dawn', 'honor_bound', 'tale_of_warriors', 'taiko_2'],
  day2: ['the_road_ahead', 'mountain_idyll', 'forging_a_city_state'],
  night2: ['epitaph', 'calm_before_the_storm'],
  wave2: ['point_of_no_return', 'taiko_1', 'taiko_2', 'red_dawn'],
};

export const CREDITS = [
  'Музыка: Omri Lahav и другие композиторы Wildfire Games — саундтрек игры 0 A.D. (play0ad.com), CC BY-SA 3.0, wildfiregames.com, creativecommons.org/licenses/by-sa/3.0/. Треки перекодированы в Opus.',
  'Звуки блоков и шагов: Minetest Game — Mito551 (CC BY-SA 3.0); Erdie, Benboncan, sonictechtonic, Dynamicell (CC BY 3.0); Sheyvan, Iwan Gabovitch (qubodup), TumeniNodes / steveygos93 (CC0). github.com/minetest/minetest_game',
  'Оружие, магия, голоса, стройка, сигналы и дождь: 0 A.D. — © Wildfire Games, CC BY-SA 3.0 (звуки зомби сделаны из человеческих криков: понижен тон, добавлено эхо).',
  'Выстрелы, пулемёт, пушка, ракета, арбалет, монеты, щелчки: Unciv (github.com/yairm210/Unciv) — Deganoth, DylanSmithSound, EvanBoyerman (CC BY 4.0/3.0); pgi, BaDoink, GameWithBepis, TheDJoe93, EathanMarkson, stijn, Breviceps, dave.des, Marregheriti (CC0).',
  'Лазер: Kenney (kenney.nl), CC0 / MIT.',
  'Некоторые короткие звуки синтезируются самой игрой.',
];
