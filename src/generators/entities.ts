import nbt from "prismarine-nbt";
import { strip } from "../utils.ts";
import { Generator } from "./generator.ts";

function titleCase(str: string): string {
  return str
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

// available_entity_identifiers.json is the canonical per-version source of bedrock entity id + numeric
// runtime id (rid -> internalId). It has no hitbox dims or java mapping, so the table below is
// maintained by hand: bedrock hitbox dims (length/offset are bedrock-only), java-name remaps where the
// bedrock id differs from the minecraft-data java name, and full dims for bedrock-only entities. At
// runtime a direct java match by bedrock id is preferred; height/width fall back to the java entity
// when not given here. build() throws if height/width can be resolved from neither source.
type EntityExtra = { java?: string; height?: number; width?: number; length?: number; offset?: number };
const ENTITY_REGISTRY: Record<string, EntityExtra> = {
  agent: { height: 0, width: 0 },
  area_effect_cloud: { height: 0.5, width: 1 },
  armor_stand: { height: 1.975, width: 0.5 },
  arrow: { height: 0.25, width: 0.25 },
  axolotl: { height: 0.42, width: 0.7, length: 0.7, offset: 0 },
  balloon: { height: 0, width: 0 },
  bat: { height: 0.9, width: 0.5 },
  bee: { height: 0.6, width: 0.6 },
  blaze: { height: 1.8, width: 0.6 },
  boat: { height: 0.6, width: 1.6, length: 1.6, offset: 0.35 },
  breeze_wind_charge_projectile: { java: "breeze_wind_charge" },
  cat: { height: 0.35, width: 0.3 },
  cave_spider: { height: 0.5, width: 0.7 },
  chalkboard: { height: 0, width: 0 },
  chest_boat: { height: 0.455, width: 1.4 },
  chest_minecart: { height: 0.7, width: 0.98, length: 0.98, offset: 0.35 },
  chicken: { height: 0.7, width: 0.4 },
  cod: { height: 0.25, width: 0.5 },
  command_block_minecart: { height: 0.7, width: 0.98, length: 0.98, offset: 0.35 },
  copper_golem: { height: 0.98, width: 0.6 },
  cow: { height: 1.4, width: 0.9 },
  creeper: { height: 1.7, width: 0.6, length: 0.6, offset: 1.62 },
  dolphin: { height: 0.6, width: 0.9 },
  donkey: { height: 1.6, width: 1.3965 },
  dragon_fireball: { height: 1 },
  drowned: { height: 1.95, width: 0.6 },
  egg: { height: 0.25, width: 0.25, length: 0.25, offset: 0 },
  elder_guardian: { height: 1.9975 },
  elder_guardian_ghost: { height: 0, width: 0 },
  ender_crystal: { java: "end_crystal", height: 2, width: 2, length: 2, offset: 0 },
  ender_dragon: { height: 0, width: 0 },
  ender_pearl: { height: 0.25, width: 0.25, length: 0.25, offset: 0 },
  enderman: { height: 2.9, width: 0.6 },
  endermite: { height: 0.3, width: 0.4 },
  evocation_fang: { java: "evoker_fangs", height: 0.8, width: 0.5, length: 0.5, offset: 0 },
  evocation_illager: { java: "evoker", height: 1.95, width: 0.6, length: 0.6, offset: 0 },
  eye_of_ender_signal: { java: "eye_of_ender", height: 0.25, width: 0.25, length: 0, offset: 0 },
  falling_block: { height: 0.98, width: 0.98 },
  fireball: { height: 1 },
  fireworks_rocket: { java: "firework_rocket", height: 0.25, width: 0.25, length: 0.25, offset: 0 },
  fishing_hook: { java: "fishing_bobber", height: 0, width: 0, length: 0, offset: 0 },
  fox: { height: 0.5, width: 1.25 },
  ghast: { height: 4 },
  glow_item_frame: { height: 0, width: 0 },
  glow_squid: { height: 0.8, width: 0.8, length: 0.8, offset: 0 },
  goat: { height: 1.3, width: 0.9, length: 0.9, offset: 0 },
  guardian: { height: 0.85 },
  hoglin: { height: 1.4, width: 1.3965, length: 1.3965, offset: 0 },
  hopper_minecart: { height: 0.7, width: 0.98, length: 0.98, offset: 0.35 },
  horse: { height: 1.6, width: 1.3965 },
  husk: { height: 1.8, width: 0.6, length: 0.6, offset: 1.62 },
  ice_bomb: { height: 0, width: 0 },
  iron_golem: { height: 2.7, width: 1.4 },
  item: { height: 0.25, width: 0.25, length: 0.25, offset: 0.125 },
  item_frame: { height: 0, width: 0 },
  leash_knot: { height: 0.5, width: 0.375 },
  lightning_bolt: { height: 0 },
  lingering_potion: { height: 0.25, width: 0.25 },
  llama: { height: 1.87, width: 0.9 },
  llama_spit: { height: 0.25 },
  magma_cube: { height: 0.51 },
  marker: { height: 0, width: 0, length: 0, offset: 0 },
  minecart: { height: 0.7, width: 0.98, length: 0.98, offset: 0.35 },
  mooshroom: { height: 1.4, width: 0.9 },
  moving_block: { height: 0, width: 0 },
  mule: { height: 1.6, width: 1.3965 },
  npc: { height: 1.8, width: 0.6, length: 0.6, offset: 1.62 },
  ocelot: { height: 0.35, width: 0.3 },
  painting: { height: 0 },
  panda: { height: 1.25, width: 1.125, length: 1.825 },
  parrot: { height: 0.9, width: 0.5 },
  phantom: { height: 0.5, width: 0.9, length: 0.9, offset: 0.6 },
  pig: { height: 0.9 },
  piglin: { height: 1.95, width: 0.6, length: 0.6, offset: 0 },
  piglin_brute: { height: 1.95, width: 0.6, length: 0.6, offset: 0 },
  pillager: { height: 1.8, width: 0.6, length: 0.6, offset: 1.62 },
  player: { height: 1.8, width: 0.6, length: 0.6, offset: 1.62 },
  polar_bear: { height: 1.4, width: 1.3 },
  pufferfish: { height: 0.7, width: 0.7 },
  rabbit: { height: 0.5, width: 0.4 },
  ravager: { height: 1.9, width: 1.2 },
  salmon: { height: 0.5, width: 0.7 },
  sheep: { height: 1.3, width: 0.9 },
  shulker: { height: 1, width: 1 },
  shulker_bullet: { height: 0.3125 },
  silverfish: { height: 0.3, width: 0.4 },
  skeleton: { height: 1.8, width: 0.6, length: 0.6, offset: 1.62 },
  skeleton_horse: { height: 1.6, width: 1.3965 },
  slime: { height: 0.51 },
  small_fireball: { height: 0.3125 },
  snow_golem: { height: 1.9, width: 0.7 },
  snowball: { height: 0.25 },
  spider: { height: 0.9, width: 1.4, length: 1.4, offset: 1 },
  splash_potion: { height: 0.25, width: 0.25, length: 0.25, offset: 0 },
  squid: { height: 0.8 },
  stray: { height: 1.8, width: 0.6, length: 0.6, offset: 1.62 },
  strider: { height: 1.7, width: 0.9, length: 0, offset: 0 },
  sulfur_cube: { height: 0.49, width: 0.49 },
  thrown_trident: { java: "trident", height: 0, width: 0, length: 0, offset: 0 },
  tnt: { height: 0.98, width: 0.98, length: 0.98, offset: 0 },
  tnt_minecart: { height: 0.7, width: 0.98, length: 0.98, offset: 0.35 },
  tripod_camera: { height: 0, width: 0 },
  tropicalfish: { java: "tropical_fish", height: 0.6, width: 0.6, length: 0, offset: 0 },
  turtle: { height: 0.4, width: 1.2 },
  vex: { height: 0.8, width: 0.4 },
  villager_v2: { java: "villager", height: 1.8, width: 0.6, length: 0.6, offset: 1.62 },
  vindicator: { height: 1.8, width: 0.6, length: 0.6, offset: 1.62 },
  wandering_trader: { height: 1.8, width: 0.6, length: 0.6, offset: 1.62 },
  wind_charge_projectile: { java: "wind_charge" },
  witch: { height: 1.8, width: 0.6, length: 0.6, offset: 1.62 },
  wither: { height: 3.5, width: 0.9 },
  wither_skeleton: { height: 2.4, width: 0.7 },
  wither_skull: { height: 0.3125 },
  wither_skull_dangerous: { height: 0, width: 0 },
  wolf: { height: 0.85, width: 0.6 },
  xp_bottle: { java: "experience_bottle", height: 0.25, width: 0.25, length: 0, offset: 0 },
  xp_orb: { java: "experience_orb", height: 0, width: 0, length: 0, offset: 0 },
  zoglin: { height: 1.4, width: 1.3965, length: 1.3965, offset: 0 },
  zombie: { height: 1.8, width: 0.6, length: 0.6, offset: 1.62 },
  zombie_horse: { height: 1.6, width: 1.3965 },
  zombie_pigman: { java: "zombified_piglin", height: 1.95, width: 0.6, length: 0.6, offset: 1.62 },
  zombie_villager_v2: { java: "zombie_villager", height: 1.8, width: 0.6, length: 0.6, offset: 1.62 },
};

export class EntitiesGenerator extends Generator {
  protected readonly label = "entities.json";

  protected async generate() {
    const version = this.bedrockVersion;
    const idlist: any[] = nbt.simplify(this.readJson(this.bedrockData("available_entity_identifiers.json")).nbt).idlist;
    const javaEntities: any[] = this.readJson(this.javaResource(this.javaVersion, "entities"));
    const javaMap: Record<string, any> = {};
    for (const e of javaEntities) javaMap[e.name] = e;

    const mobs: Record<string, any> = {};
    const minecraft_data_mobs: any[] = [];
    let ix = 0;
    for (const ent of idlist) {
      const name = strip(ent.id);
      const reg = ENTITY_REGISTRY[name];
      // prefer a direct java match by bedrock id, else the curated remap
      const javaName = javaMap[name] ? name : (reg?.java ?? name);
      const java = javaMap[javaName];

      // bedrock (registry) dims win; java fills the gaps
      const height = reg?.height ?? java?.height;
      const width = reg?.width ?? java?.width;
      if (height == null || width == null) {
        throw Error(`entities: missing height/width for ${ent.id} (bedrock ${version}); add it to ENTITY_REGISTRY`);
      }

      const obj: Record<string, any> = {
        ...java,
        id: ix++,
        internalId: ent.rid,
        name,
        displayName: java?.displayName ?? titleCase(name.replace(/_/g, " ")),
        height,
        width,
        length: reg?.length,
        offset: reg?.offset,
        type: java?.type ?? "",
        category: java?.category,
      };
      mobs[name] = obj;

      minecraft_data_mobs.push({
        id: obj.id,
        internalId: obj.internalId,
        name: obj.name,
        displayName: obj.displayName,
        height: obj.height,
        width: obj.width,
        length: obj.length,
        offset: obj.offset,
        type: obj.type,
        category: obj.category,
      });
    }

    this.writeJson(this.outputFile("entities.json"), mobs);
    this.writeJson(this.mcDataFile("entities.json"), minecraft_data_mobs);
  }
}
