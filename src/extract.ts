import { type GeneratorContext } from "./generators/generator.ts";
import { BlockMapGenerator } from "./generators/blockMap.ts";
import { BlocksGenerator } from "./generators/blocks.ts";
import { CollisionGenerator } from "./generators/collision.ts";
import { ItemMapGenerator } from "./generators/itemMap.ts";
import { ItemsGenerator } from "./generators/items.ts";
import { BiomeMapGenerator } from "./generators/biomeMap.ts";
import { BiomesGenerator } from "./generators/biomes.ts";
import { EntitiesGenerator } from "./generators/entities.ts";
import { RecipesGenerator } from "./generators/recipe.ts";
import { LanguageGenerator } from "./generators/language.ts";
import { AttributesGenerator } from "./generators/attributes.ts";
import { SteveGenerator } from "./generators/steve.ts";

export async function extract(bedrockVersion: string, javaVersion: string, javaItemsVersion: string = javaVersion) {
  const ctx: GeneratorContext = { bedrockVersion, javaVersion, javaItemsVersion };
  const generators = [
    new BlockMapGenerator(ctx),
    new BlocksGenerator(ctx),
    new CollisionGenerator(ctx),
    new ItemMapGenerator(ctx),
    new ItemsGenerator(ctx),
    new BiomeMapGenerator(ctx),
    new BiomesGenerator(ctx),
    new EntitiesGenerator(ctx),
    new RecipesGenerator(ctx),
    new LanguageGenerator(ctx),
    new AttributesGenerator(ctx),
    new SteveGenerator(ctx),
  ];
  try {
    for (const g of generators) await g.run();
  } catch (e) {
    console.log(e);
  }
}
