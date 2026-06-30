export interface versionData {
  mcDataVersion: string;

  serverVersion: string;
  // Java minecraft-data version the generators pair this Bedrock version with. Blocks come from the
  // mappings-generator pin and items from the (separately pinned) mappings repo, so they can target
  // different java versions — javaItemsVersion overrides
  // javaVersion for items when they diverge.

  javaVersion: string;
  javaItemsVersion?: string;
  // Geyser source pins for downloadExternalData (fetchMappings). `mappings` = GeyserMC/mappings
  // commit (items.json + v1 blocks/collision). `mg` = GeyserMC/mappings-generator commit
  // (generator_blocks.json -> v2 + collisions.nbt); "" means pre-mappings-generator era (v1 only).
  // Both omitted = no Geyser pin for this version (skipped by the mapping download).
  mg?: string;
  mappings?: string;
}

export const versions: versionData[] = [
  { mcDataVersion: "1.16.201", serverVersion: "1.16.201.02", javaVersion: "1.16.2", mg: "", mappings: "0d988785917d5567622399ac9eb8da2df3f6b693" },
  { mcDataVersion: "1.16.210", serverVersion: "1.16.210.05", javaVersion: "1.16.2", mg: "", mappings: "2ce794e21a0212865059e7551db893c28843620a" },
  { mcDataVersion: "1.16.220", serverVersion: "1.16.220.02", javaVersion: "1.16.2", mg: "", mappings: "c5925b01cf8e7d8b284cf359e927145b9b4694aa" },
  { mcDataVersion: "1.17.0", serverVersion: "1.17.0.03", javaVersion: "1.17", mg: "", mappings: "c921aa9b12c2a1a471ef5f00aa040924426641dc" },
  { mcDataVersion: "1.17.10", serverVersion: "1.17.10.04", javaVersion: "1.17", mg: "", mappings: "20a37f136808f794bf9873c216f34b3978851d4a" },
  { mcDataVersion: "1.17.30", serverVersion: "1.17.30.04", javaVersion: "1.17", mg: "", mappings: "20a37f136808f794bf9873c216f34b3978851d4a" },
  { mcDataVersion: "1.17.40", serverVersion: "1.17.40.06", javaVersion: "1.17", mg: "", mappings: "20a37f136808f794bf9873c216f34b3978851d4a" },
  { mcDataVersion: "1.18.0", serverVersion: "1.18.0.02", javaVersion: "1.18", mg: "", mappings: "f73b45844f1185c3898db3052ce4ea0d18246168" },
  { mcDataVersion: "1.18.11", serverVersion: "1.18.11.01", javaVersion: "1.18", mg: "", mappings: "f73b45844f1185c3898db3052ce4ea0d18246168" },
  { mcDataVersion: "1.18.30", serverVersion: "1.18.30.04", javaVersion: "1.18", mg: "", mappings: "f73b45844f1185c3898db3052ce4ea0d18246168" },
  { mcDataVersion: "1.19.1", serverVersion: "1.19.1.01", javaVersion: "1.19", mg: "", mappings: "919908f4825e9fa1bb7b5a2f5e09218f0a3f72f3" },
  { mcDataVersion: "1.19.10", serverVersion: "1.19.10.03", javaVersion: "1.19", mg: "", mappings: "0127891232742209b8470298dfd997249c506320" },
  { mcDataVersion: "1.19.20", serverVersion: "1.19.20.02", javaVersion: "1.19.2", mg: "", mappings: "10baa9a45de074afa643e8477bd5a4e72ecfa563" },
  { mcDataVersion: "1.19.21", serverVersion: "1.19.21.01", javaVersion: "1.19.2", mg: "", mappings: "10baa9a45de074afa643e8477bd5a4e72ecfa563" },
  { mcDataVersion: "1.19.30", serverVersion: "1.19.30.04", javaVersion: "1.19.2", mg: "", mappings: "10baa9a45de074afa643e8477bd5a4e72ecfa563" },
  { mcDataVersion: "1.19.40", serverVersion: "1.19.40.02", javaVersion: "1.19.2", mg: "", mappings: "9687a4a001e93477803457cdd57313294febd183" },
  { mcDataVersion: "1.19.50", serverVersion: "1.19.50.02", javaVersion: "1.19.3", mg: "", mappings: "677c5b0872d2f0c99ad834c0ca49a0ae3b45fde3" },
  { mcDataVersion: "1.19.60", serverVersion: "1.19.60.04", javaVersion: "1.19.3", mg: "", mappings: "677c5b0872d2f0c99ad834c0ca49a0ae3b45fde3" },
  { mcDataVersion: "1.19.62", serverVersion: "1.19.62.01", javaVersion: "1.19.3", mg: "", mappings: "677c5b0872d2f0c99ad834c0ca49a0ae3b45fde3" },
  { mcDataVersion: "1.19.63", serverVersion: "1.19.63.01", javaVersion: "1.19.3", mg: "", mappings: "677c5b0872d2f0c99ad834c0ca49a0ae3b45fde3" },
  { mcDataVersion: "1.19.70", serverVersion: "1.19.70.02", javaVersion: "1.19.4", mg: "", mappings: "989e9b20da76a36f113d4642d7bd016284fd5d67" },
  { mcDataVersion: "1.19.80", serverVersion: "1.19.80.02", javaVersion: "1.19.4", javaItemsVersion: "1.20", mg: "", mappings: "a941165a4bad75cd120ed3bde71fd1e357f431e7" },
  { mcDataVersion: "1.20.0", serverVersion: "1.20.0.01", javaVersion: "1.20", mg: "", mappings: "31ce17e12e991bd841270b99f461641093f42564" },
  { mcDataVersion: "1.20.10", serverVersion: "1.20.11.01", javaVersion: "1.20", mg: "", mappings: "bff5fad3284864fdfad4e7f66aea45cdb20cf401" },
  { mcDataVersion: "1.20.15", serverVersion: "1.20.15.01", javaVersion: "1.20", mg: "", mappings: "bff5fad3284864fdfad4e7f66aea45cdb20cf401" },
  { mcDataVersion: "1.20.30", serverVersion: "1.20.30.02", javaVersion: "1.20", mg: "", mappings: "168d74ab72fdd8d14259795c4fe752781f980b26" },
  { mcDataVersion: "1.20.40", serverVersion: "1.20.40.01", javaVersion: "1.20", mg: "", mappings: "168d74ab72fdd8d14259795c4fe752781f980b26" },
  { mcDataVersion: "1.20.50", serverVersion: "1.20.50.03", javaVersion: "1.20.3", mg: "", mappings: "ad4b7952e997aaff144e2ce80e9552c8db93b8f1" },
  { mcDataVersion: "1.20.61", serverVersion: "1.20.61.01", javaVersion: "1.20.4", mg: "", mappings: "ad4b7952e997aaff144e2ce80e9552c8db93b8f1" },
  { mcDataVersion: "1.20.71", serverVersion: "1.20.71.01", javaVersion: "1.20.4", mg: "", mappings: "08abfc1f386debeba993faf67c7554e78052107e" },
  { mcDataVersion: "1.20.80", serverVersion: "1.20.80.05", javaVersion: "1.20.5", javaItemsVersion: "1.20.4", mg: "", mappings: "b96a44f452f61b2e0a008b168cbb737ac0865b10" },
  { mcDataVersion: "1.21.0", serverVersion: "1.21.0.03", javaVersion: "1.21.1", javaItemsVersion: "1.20.5", mg: "ac733644c4b04f154580f567990ee3d33ff4114b", mappings: "ec45f59c8590945c9226921ef7e339f510983dc1" },
  { mcDataVersion: "1.21.2", serverVersion: "1.21.2.02", javaVersion: "1.21.1", javaItemsVersion: "1.20.5", mg: "ac733644c4b04f154580f567990ee3d33ff4114b", mappings: "ec45f59c8590945c9226921ef7e339f510983dc1" },
  { mcDataVersion: "1.21.20", serverVersion: "1.21.20.03", javaVersion: "1.21.1", mg: "8e2bffbd8229976ff568356c8bfb1d377f49c822", mappings: "698fd2b108a9e53f1e47b8cfdc122651b70d6059" },
  { mcDataVersion: "1.21.30", serverVersion: "1.21.30.03", javaVersion: "1.21.1", mg: "e9195865a37bbc10f889affd3d9b4f3bafd71f59", mappings: "3e85fcc87d7cfa4162cd8823192fcee0830be049" },
  { mcDataVersion: "1.21.42", serverVersion: "1.21.42.01", javaVersion: "1.21.3", javaItemsVersion: "1.21.1", mg: "e9195865a37bbc10f889affd3d9b4f3bafd71f59", mappings: "3e85fcc87d7cfa4162cd8823192fcee0830be049" },
  { mcDataVersion: "1.21.50", serverVersion: "1.21.50.07", javaVersion: "1.21.4", mg: "4e23cb0c99321249c2e7bf096a390b96ad584048", mappings: "452312f88317cce019b8f336f485ffa7b2c19557" },
  { mcDataVersion: "1.21.60", serverVersion: "1.21.60.10", javaVersion: "1.21.4", mg: "7fd607409cb07840506740a829801a42fc95fa52", mappings: "d083ef370da547469196de9873e12edd83fc65ef" },
  { mcDataVersion: "1.21.70", serverVersion: "1.21.70.04", javaVersion: "1.21.5", mg: "470a03eb0c80205bb64dd1133134a7c9e44b2a74", mappings: "3fcfc7bab4345b6807d7507a02e52ed4e2da8b31" },
  { mcDataVersion: "1.21.80", serverVersion: "1.21.80.3", javaVersion: "1.21.5", mg: "470a03eb0c80205bb64dd1133134a7c9e44b2a74", mappings: "3fcfc7bab4345b6807d7507a02e52ed4e2da8b31" },
  { mcDataVersion: "1.21.90", serverVersion: "1.21.90.3", javaVersion: "1.21.6", mg: "cc8e74175afe955cdc43573f3137cd62bc3eb725", mappings: "5e56bcb154dfcded2ed6d6030f36680bc0894464" },
  { mcDataVersion: "1.21.93", serverVersion: "1.21.93.1", javaVersion: "1.21.6", mg: "cc8e74175afe955cdc43573f3137cd62bc3eb725", mappings: "5e56bcb154dfcded2ed6d6030f36680bc0894464" },
  { mcDataVersion: "1.21.100", serverVersion: "1.21.100.6", javaVersion: "1.21.6", javaItemsVersion: "1.21.8", mg: "e20158d5c529741462999c4e6edb647d7a9fd85e", mappings: "01a320f40a2392130554bbc2ac6cd41a1e08d390" },
  { mcDataVersion: "1.21.111", serverVersion: "1.21.111.1", javaVersion: "1.21.6", javaItemsVersion: "1.21.8", mg: "b44e0a76a5b6ae82e66a8198bc35bf20c6a99865", mappings: "40fa908cd129385a7c4342af730e479cdbd98048" },
  { mcDataVersion: "1.21.120", serverVersion: "1.21.120.4", javaVersion: "1.21.9", mg: "8fa605819baddf4299e87070cc73acf72b8c1316", mappings: "ae31e2284a89d4ae25edd8cc583ff44ddfe9670c" },
  { mcDataVersion: "1.21.124", serverVersion: "1.21.124.2", javaVersion: "1.21.9", mg: "8fa605819baddf4299e87070cc73acf72b8c1316", mappings: "ae31e2284a89d4ae25edd8cc583ff44ddfe9670c" },
  { mcDataVersion: "1.21.130", serverVersion: "1.21.130.3", javaVersion: "1.21.11", javaItemsVersion: "1.21.9", mg: "e9570889beec2b1010f1cac7601535fe5c041c8f", mappings: "ae31e2284a89d4ae25edd8cc583ff44ddfe9670c" },
  { mcDataVersion: "1.26.0", serverVersion: "1.26.0.2", javaVersion: "1.26.1", javaItemsVersion: "1.21.11", mg: "2c0d798ce8f5a6f435e115911dca85067c529ba8", mappings: "f06bcf04be1b18536189aebfca2bd90673b83ad4" },
  { mcDataVersion: "1.26.10", serverVersion: "1.26.11.1", javaVersion: "1.26.1", javaItemsVersion: "1.21.11", mg: "2c0d798ce8f5a6f435e115911dca85067c529ba8", mappings: "f06bcf04be1b18536189aebfca2bd90673b83ad4" },
  { mcDataVersion: "1.26.20", serverVersion: "1.26.20.5", javaVersion: "1.26.1", javaItemsVersion: "1.26.1", mg: "3742321731d8deaf00e7782b4ce417d0a4c6e486", mappings: "021e45045e00bb65d73477c01052276caf9bf92a" },
  { mcDataVersion: "1.26.30", serverVersion: "1.26.30.5", javaVersion: "1.26.2", mg: "94c21e0ca59a13ab184b2bf7f01e1a216c344216", mappings: "0841080639a3ca3154e77dc2ad4f10474f9dc9bb" },
];
