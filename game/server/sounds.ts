// Sound library paths (checked with `yarn sounds --check`) and small helpers.
export const SFX = {
  cast: "Melee & Combat/Combat & Hunting Hits/Fishing Pole 1",
  plop: "Animals/Farm Animals/Fish/SFX_FishSplashWater02",
  bite: "Animals/Farm Animals/Fish/SFX_FishSplashWater01",
  jump: "Assorted Game SFX/Medieval Sounds/Water_Splash_v1/SFX_WaterSplashv1wav",
  reel: "Melee & Combat/Combat & Hunting Hits/Fishing Pole 3",
  catch: "Assorted Game SFX/Mixed Game Sound Effects/PUZZLES/PUZZLE_Success_Brass_Fanfare_Bright_Wet_stereo",
  rare: "Items, Coins & Rewards/Universal Game Sounds - Epic Arsenal/Positive Victory/Bling/Game Achievement Bling 1",
  legend: "Items, Coins & Rewards/Loot & Rewards/FindEpicItem01/SFX_FindEpicItemOpenChestv1",
  coins: "Items, Coins & Rewards/Coins & Collectables/Coins (1)",
  levelUp: "Items, Coins & Rewards/Loot & Rewards/LevelUp01/SFX_LevelUpv1",
  click: "Assorted Game SFX/Mixed Game Sound Effects/USER_INTERFACES/Clicks_Taps/UI_Click_Distinct_mono",
  pop: "Assorted Game SFX/Assorted Game Hits/Animation Plant Pop Up",
  gift: "Items, Coins & Rewards/Hybrid Game/Synthesized/Equipment/Rotating Echo Unlock Chest 1",
  sparkle: "Magic & Spells/Lighthearted Mini Magic/SpecialFX/SpecialFX_SparkleDigital_01",
  error: "UI & Interface/Error Buzzes & Clicks/Buzz Error (11)",
  escape: "Assorted Game SFX/Mixed Game Sound Effects/ELEMENTS/Water/Splashes/SPLASH_Designed_Quick_02_mono",
  cheer: "Sports, Cards & Casual/Ball Sports/Crowd/SFX_CrowdCheersv1",
  win: "Music/Fantasy & Adventure Game Music/Short Cues/Winning/Fanfare Win",
  quest: "Items, Coins & Rewards/Universal Game Sounds - Epic Arsenal/Positive Victory/Bling/Game Achievement Bling 3",
}

export const MUSIC = {
  day: "Music/Acoustic, Funky & Summer Music/Acoustic Vol. 2/Peaceful Valley/Peaceful Valley",
  night: "Music/EDM, Meditation & Shooter Music/Meditation/Calm/Calm",
  tourney: "Music/RPG, Retro & Sci-Fi Music/Retro Music Bundle/16-Bit Nostalgic Towns/LOOP_Village Festival",
}

export function playFor(userId: string, path: string, volume = 80): void {
  try {
    api.sound.playForPlayer(userId, path, volume)
  } catch {
    /* over the per-tick sound budget: skip this one */
  }
}

export function playAt(path: string, x: number, y: number, z: number, volume = 80, radius = 30): void {
  try {
    api.sound.playAt(path, x, y, z, volume, radius)
  } catch {
    /* over budget */
  }
}
