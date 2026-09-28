// Recorded audio used on top of the procedural engine (sfx.js). Files live in public/audio and are loaded lazily;
// until a file is ready (or if it fails) the procedural version of the sound plays instead.
// Licences and authors: see CREDITS.md (also shown in the game's «Об игре» screen).

/** Sound name → recorded variants (one is picked at random each time). */
export const SAMPLES = {
  step_grass: ['default_grass_footstep.1', 'default_grass_footstep.2', 'default_grass_footstep.3'],
  step_stone: ['default_hard_footstep.1', 'default_hard_footstep.2', 'default_hard_footstep.3'],
  step_wood: ['default_wood_footstep.1', 'default_wood_footstep.2'],
  dig_dirt: ['default_dig_crumbly'],
  dig_stone: ['default_dig_cracky.1', 'default_dig_cracky.2', 'default_dig_cracky.3'],
  dig_wood: ['default_dig_choppy.1', 'default_dig_choppy.2', 'default_dig_choppy.3'],
  chop: ['default_dig_choppy.1', 'default_dig_choppy.2', 'default_dig_choppy.3'],
  pick_hit: ['default_dig_cracky.1', 'default_dig_cracky.2', 'default_dig_cracky.3'],
  break_block: ['default_dug_node.1', 'default_dug_node.2'],
  place_block: ['default_place_node.1', 'default_place_node.2', 'default_place_node.3'],
  hammer: ['default_place_node_hard.1', 'default_place_node_hard.2', 'default_dug_metal.1', 'default_dug_metal.2'],
  explosion: ['tnt_explode'],
  player_hurt: ['player_damage'],
  fire_impact: ['fire_fire.1'],
};
/** Relative volume of each recorded sound so they sit well next to the synthesized ones. */
export const SAMPLE_GAIN = { step_grass: 0.55, step_stone: 0.5, step_wood: 0.55, dig_dirt: 0.7, dig_stone: 0.75, dig_wood: 0.8, chop: 0.8, pick_hit: 0.7, break_block: 0.8, place_block: 0.8, hammer: 0.7, explosion: 1, player_hurt: 0.9, fire_impact: 0.6 };
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
  'Остальные звуки синтезируются самой игрой.',
];
