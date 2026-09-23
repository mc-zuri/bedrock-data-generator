// What changed in each server build, oldest first: see Bindings.h. Generated once from the extractor's
// configs by tools/migrate/make_steps.py, maintained by hand since. A new build needs a step only for
// what moved; `pnpm check <version>` shows what still resolves on its exe.
#include "bindings/Bindings.h"
#include "bindings/Names.h"

namespace n = bdg::bindings::names;

BDG_BINDINGS("1.16.201.02") {
    r.offset(n::BlockTypeDescriptionId, 8);
    r.variant(n::BlockMapKey, n::MapKeyString);
    r.variant(n::NetworkIdKind, n::NetworkIdIsRuntimeId);
    r.variant(n::RegistryGetterKind, n::RegistryBySret);
    r.variant(n::DimensionKind, n::DimensionByPointer);
    r.variant(n::VisualShapeKind, n::VisualShapeBlockBufferBool);
    r.variant(n::AabbLayout, n::Aabb28WithValid);
    r.offset(n::BlockNetworkId, 48);
    r.offset(n::BlockSerializationId, 32);
    r.offset(n::BlockTypePermutations, 672);
    r.offset(n::BlockTypeDefaultState, 696);
    r.offset(n::BlockTypeTags, 456);
    r.slot(n::LevelGetDimensionSlot, 5);
    r.slot(n::BlockAddCollisionShapes, 11);
    r.slot(n::BlockGetVisualShape, 124);
    r.slot(n::BlockGetUIShape, 125);
    r.function(n::LevelTick, "48 8B C4 55 41 54 41 55 41 56 41 57 48 8D A8 08 FE FF FF 48 81 EC D0 02 00 00 48 C7 45 90 FE FF FF FF");
    r.function(n::LevelGetDimension, "4C 8B 89 50 08 00 00 4C 8B 81 38 08 00 00");
    r.function(n::LevelCreateDimension, "48 8B C4 89 50 10 56 57 41 56 48 81 EC");
    r.data(n::BlockLookupMap, "4C 8B 35 ? ? ? ? 49 8B EE 49 8B FE", 3);
    r.offset(n::DimensionBlockSource, 0x58);  // Dimension::init / getBlockSourceFromMainChunkSource in the PDB
    r.offset(n::BlockTypeDestroySpeed, 300);
    r.offset(n::BlockTypeExplosionResistance, 304);
    r.offset(n::BlockTypeLightDampening, 289);
    r.offset(n::BlockTypeLightEmission, 290);
    r.slot(n::ItemGetMaxDamage, 39);
    r.slot(n::ItemGetMaxStackSize, 92);
}

BDG_BINDINGS("1.16.210.05") {
    r.slot(n::LevelGetDimensionSlot, 6);
    r.slot(n::BlockGetVisualShape, 129);
    r.slot(n::BlockGetUIShape, 130);
    r.function(n::LevelTick, "48 89 5C 24 ? 48 89 74 24 ? 48 89 7C 24 ? 55 41 54 41 55 41 56 41 57 48 8D AC 24 ? ? ? ? 48 81 EC ? ? ? ? 48 8B 05 ? ? ? ? 48 33 C4 48 89 85 ? ? ? ? 4C 8B E1 48 89 8D");
    r.function(n::LevelGetDimension, "4C 8B 81 ? ? ? ? 4C 8B 89");
    r.function(n::LevelCreateDimension, "48 89 5C 24 ? 48 89 6C 24 ? 89 54 24");
    r.data(n::BlockLookupMap, "48 8D 0D ? ? ? ? E8 ? ? ? ? 48 8B 08 F0 FF 43 08 48 8B 79 40 48 8B 45 C7", 3);
    r.offset(n::DimensionBlockSource, 0x60);
}

BDG_BINDINGS("1.16.220.02") {
    r.slot(n::BlockGetVisualShape, 132);
    r.slot(n::BlockGetUIShape, 133);
    r.slot(n::ItemGetMaxStackSize, 91);
}

BDG_BINDINGS("1.17.0.03") {
    r.offset(n::BlockNetworkId, 120);
    r.offset(n::BlockSerializationId, 104);
    r.offset(n::BlockTypePermutations, 680);
    r.offset(n::BlockTypeDefaultState, 704);
    r.offset(n::BlockTypeTags, 464);
    r.slot(n::ItemGetMaxStackSize, 92);
}

BDG_BINDINGS("1.17.10.04") {
    r.slot(n::BlockGetVisualShape, 133);
    r.slot(n::BlockGetUIShape, 134);
    r.slot(n::ItemGetMaxDamage, 40);
    r.slot(n::ItemGetMaxStackSize, 93);
}

BDG_BINDINGS("1.17.30.04") {
    r.variant(n::AabbLayout, n::Aabb24);  // AABB lost its trailing bool mValid
    r.offset(n::BlockTypePermutations, 672);
    r.offset(n::BlockTypeDefaultState, 696);
    r.slot(n::BlockGetVisualShape, 134);
    r.slot(n::BlockGetUIShape, 135);
    r.function(n::LevelTick, "48 89 5C 24 ? 48 89 74 24 ? 55 57 41 54 41 56 41 57 48 8D AC 24 ? ? ? ? 48 81 EC ? ? ? ? 48 8B 05 ? ? ? ? 48 33 C4 48 89 85 ? ? ? ? 48 8B F9");
    r.slot(n::ItemGetMaxStackSize, 94);
}

BDG_BINDINGS("1.17.40.06") {
    r.function(n::LevelGetDimension, "4C 8B 81 ? ? ? ? 4C 8B 89 ? ? ? ? 48 63 C2");
    r.function(n::LevelCreateDimension, "48 89 5C 24 18 48 89 6C 24 20 89 54 24 10 56 57 41 54");
}

BDG_BINDINGS("1.18.0.02") {
    r.slot(n::BlockGetVisualShape, 135);
    r.slot(n::BlockGetUIShape, 136);
    r.function(n::LevelTick, "48 89 5C 24 ? 48 89 74 24 ? 55 57 41 54 41 56 41 57 48 8D AC 24 ? ? ? ? 48 81 EC ? ? ? ? 48 8B 05 ? ? ? ? 48 33 C4 48 89 85 ? ? ? ? 48 8B F1");
    r.slot(n::ItemGetMaxDamage, 41);
    r.slot(n::ItemGetMaxStackSize, 95);
}

BDG_BINDINGS("1.18.11.01") {
    r.slot(n::LevelGetDimensionSlot, 5);
    r.slot(n::BlockGetVisualShape, 140);
    r.slot(n::BlockGetUIShape, 141);
    r.data(n::BlockLookupMap, "48 8D 0D ? ? ? ? E8 ? ? ? ? 48 8B 08 F0 FF 43 08", 3);
    r.slot(n::ItemGetMaxDamage, 43);
    r.slot(n::ItemGetMaxStackSize, 97);
}

BDG_BINDINGS("1.18.30.04") {
    r.variant(n::BlockMapKey, n::MapKeyHashedString);  // the block type map is keyed by HashedString
    r.offset(n::BlockNetworkId, 128);
    r.offset(n::BlockSerializationId, 112);
    r.slot(n::BlockGetVisualShape, 144);
    r.slot(n::BlockGetUIShape, 145);
    r.function(n::LevelTick, "48 89 5C 24 10 48 89 74 24 18 48 89 7C 24 20 55 41 54 41 55 41 56 41 57 48 8D AC 24 00 FE FF FF");
    r.data(n::BlockLookupMap, "48 8B 35 ? ? ? ? 48 8B 7E 08 48 89 7C 24 40", 3);
    r.offset(n::DimensionBlockSource, 0xD0);
    r.slot(n::ItemGetMaxStackSize, 96);
}

BDG_BINDINGS("1.19.1.01") {
    r.function(n::LevelTick, "48 89 5C 24 10 48 89 74 24 18 48 89 7C 24 20 55 41 54 41 55 41 56 41 57 48 8D AC 24 E0 FD FF FF 48 81 EC 20 03 00 00 48 8B 05 ? ? ? ? 48 33 C4 48 89 85 10 02 00 00 48 8B F9");
    r.data(n::BlockLookupMap, "48 8B 35 ? ? ? ? 48 8B 7E 08 48 89 7C 24 28", 3);
    r.offset(n::DimensionBlockSource, 0xD8);
    r.offset(n::BlockDestroySpeed, 28);
    r.offset(n::BlockLightDampening, 40);
    r.offset(n::BlockLightEmission, 41);
    r.drop(n::BlockTypeDestroySpeed);
    r.drop(n::BlockTypeLightDampening);
    r.drop(n::BlockTypeLightEmission);
    r.slot(n::ItemGetMaxDamage, 47);
    r.slot(n::ItemGetMaxStackSize, 100);
}

BDG_BINDINGS("1.19.10.03") {
    r.offset(n::BlockNetworkId, 136);
    r.offset(n::DimensionBlockSource, 0xC0);
}

BDG_BINDINGS("1.19.20.02") {
    r.offset(n::BlockNetworkId, 152);
    r.offset(n::BlockSerializationId, 128);
    r.function(n::LevelTick, "48 89 5C 24 ? 48 89 74 24 ? 48 89 7C 24 ? 55 41 54 41 55 41 56 41 57 48 8D AC 24 ? ? ? ? 48 81 EC ? ? ? ? 48 8B 05 ? ? ? ? 48 33 C4 48 89 85 ? ? ? ? 4C 8B F1 45 33 ED 8B 81");
    r.offset(n::BlockDestroySpeed, 40);
    r.offset(n::BlockLightDampening, 52);
    r.offset(n::BlockLightEmission, 61);
    r.slot(n::ItemGetMaxDamage, 48);
    r.slot(n::ItemGetMaxStackSize, 101);
}

BDG_BINDINGS("1.19.30.04") {
    r.offset(n::BlockTypePermutations, 680);
    r.offset(n::BlockTypeDefaultState, 704);
    r.offset(n::BlockTypeTags, 472);
    r.offset(n::BlockTypeExplosionResistance, 308);
}

BDG_BINDINGS("1.19.40.02") {
    r.offset(n::BlockNetworkId, 160);
    r.offset(n::BlockSerializationId, 136);
    r.slot(n::BlockGetVisualShape, 143);
    r.slot(n::BlockGetUIShape, 144);
    r.function(n::LevelTick, "48 89 5C 24 ? 48 89 74 24 ? 48 89 7C 24 ? 55 41 54 41 55 41 56 41 57 48 8D AC 24 ? ? ? ? 48 81 EC ? ? ? ? 48 8B 05 ? ? ? ? 48 33 C4 48 89 85 ? ? ? ? 4C 8B F1 8B 81");
    r.offset(n::BlockTypeExplosionResistance, 312);
    r.slot(n::ItemGetMaxDamage, 47);
    r.slot(n::ItemGetMaxStackSize, 100);
}

BDG_BINDINGS("1.19.50.02") {
    r.variant(n::DimensionKind, n::DimensionByWeakRef);  // dimension getters return WeakRef<Dimension> by value
    r.offset(n::BlockNetworkId, 184);
    r.offset(n::BlockSerializationId, 160);
    r.function(n::LevelGetDimension, "48 83 EC ? 4C 8B 91 ? ? ? ? 4C 8B CA");
    r.drop(n::LevelCreateDimension);
    r.function(n::LevelGetOrCreateDimension, "48 89 5C 24 20 44 89 44 24 18 55 56 57 41 54 41 55 41 56 41 57 48 8D 6C 24 D9 48 81 EC B0 00 00 00");
    r.data(n::BlockLookupMap, "48 8B 35 ? ? ? ? 48 8B 7E 08 48 89 7C 24 50", 3);
    r.offset(n::DimensionBlockSource, 0xD0);
}

BDG_BINDINGS("1.19.60.04") {
    r.offset(n::BlockNetworkId, 192);
    r.offset(n::BlockSerializationId, 168);
    r.function(n::LevelGetOrCreateDimension, "48 89 5C 24 20 44 89 44 24 18 55 56 57 41 54 41 55 41 56 41 57 48 8D 6C 24 D9 48 81 EC D0 00 00 00");
}

BDG_BINDINGS("1.19.70.02") {
    r.function(n::LevelTick, "48 89 5C 24 10 48 89 74 24 18 57 48 83 EC 40 48 8B 05 ? ? ? ? 48 33 C4 48 89 44 24 30 48 8B D9 48 8B 01");
    r.drop(n::LevelGetDimension);  // no unique pattern from here on: the agent probes the Level vtable
    r.drop(n::LevelGetOrCreateDimension);  // no unique pattern from here on: the agent probes the Level vtable
}

BDG_BINDINGS("1.19.80.02") {
    r.variant(n::NetworkIdKind, n::NetworkIdIsHash);  // block network ids became hashes
    r.offset(n::BlockNetworkId, 200);
    r.offset(n::BlockSerializationId, 176);
    r.offset(n::BlockTypePermutations, 728);
    r.offset(n::BlockTypeDefaultState, 752);
    r.offset(n::BlockTypeTags, 520);
    r.slot(n::BlockGetVisualShape, 144);
    r.slot(n::BlockGetUIShape, 145);
    r.offset(n::BlockTypeExplosionResistance, 360);
}

BDG_BINDINGS("1.20.0.01") {
    r.offset(n::BlockNetworkId, 244);
    r.offset(n::BlockSerializationId, 216);
    r.slot(n::BlockGetVisualShape, 142);
    r.slot(n::BlockGetUIShape, 143);
}

BDG_BINDINGS("1.20.11.01") {
    r.offset(n::BlockTypeDescriptionId, 40);
    r.variant(n::VisualShapeKind, n::VisualShapeBlockBuffer);  // getVisualShape lost its trailing bool
    r.offset(n::BlockNetworkId, 228);
    r.offset(n::BlockSerializationId, 200);
    r.offset(n::BlockTypePermutations, 760);
    r.offset(n::BlockTypeDefaultState, 784);
    r.offset(n::BlockTypeTags, 552);
    r.slot(n::BlockAddCollisionShapes, 7);
    r.slot(n::BlockGetVisualShape, 12);
    r.slot(n::BlockGetUIShape, 13);
    r.offset(n::BlockDestroySpeed, 60);
    r.offset(n::BlockExplosionResistance, 120);
    r.offset(n::BlockLightDampening, 137);
    r.offset(n::BlockLightEmission, 136);
    r.drop(n::BlockTypeExplosionResistance);
}

BDG_BINDINGS("1.20.30.02") {
    r.offset(n::BlockNetworkId, 244);
    r.offset(n::BlockSerializationId, 216);
    r.slot(n::BlockAddCollisionShapes, 8);
    r.offset(n::BlockLightDampening, 153);
    r.offset(n::BlockLightEmission, 152);
}

BDG_BINDINGS("1.20.40.01") {
    r.offset(n::BlockNetworkId, 220);
    r.offset(n::BlockSerializationId, 192);
    r.offset(n::BlockDestroySpeed, 128);
    r.offset(n::BlockExplosionResistance, 112);
    r.offset(n::BlockLightDampening, 108);
    r.offset(n::BlockLightEmission, 107);
}

BDG_BINDINGS("1.20.50.03") {
    r.offset(n::BlockNetworkId, 192);
    r.offset(n::BlockSerializationId, 168);
    r.offset(n::BlockTypePermutations, 768);
    r.offset(n::BlockTypeDefaultState, 792);
    r.slot(n::BlockAddCollisionShapes, 7);
    r.slot(n::BlockGetVisualShape, 11);
    r.slot(n::BlockGetUIShape, 12);
    r.slot(n::ItemGetMaxDamage, 33);
    r.slot(n::ItemGetMaxStackSize, 85);
}

BDG_BINDINGS("1.20.61.01") {
    // (bedrock-data-extractor's 1.20.50 config has these already, one byte off: stone read as lighting 15)
    r.offset(n::BlockLightDampening, 109);
    r.offset(n::BlockLightEmission, 108);
    r.slot(n::ItemGetMaxDamage, 34);
    r.slot(n::ItemGetMaxStackSize, 86);
}

BDG_BINDINGS("1.20.71.01") {
    r.slot(n::ItemGetMaxStackSize, 85);
}

BDG_BINDINGS("1.20.80.05") {
    r.slot(n::ItemGetMaxStackSize, 86);
    r.data(n::BlockLookupMap, "48 8B 35 ? ? ? ? 48 8B 5E 08 48 89 5C 24 50", 3);
}

BDG_BINDINGS("1.21.0.03") {
    r.slot(n::ItemGetMaxStackSize, 87);
}

BDG_BINDINGS("1.21.20.03") {
    r.offset(n::BlockNetworkId, 204);
    r.offset(n::BlockTypePermutations, 776);
    r.offset(n::BlockTypeDefaultState, 800);
    r.offset(n::BlockTypeTags, 560);
    r.slot(n::LevelGetDimensionSlot, 4);
    r.drop(n::DimensionBlockSource);  // no PDB from here: the first BlockSource of the Dimension, then its getter
    r.offset(n::BlockDestroySpeed, 136);
    r.offset(n::BlockExplosionResistance, 120);
    r.offset(n::BlockLightDampening, 117);
    r.offset(n::BlockLightEmission, 116);
    r.drop(n::ItemGetMaxStackSize);
}

BDG_BINDINGS("1.21.30.03") {
    // n::BlockLookupMap: 0x36F5A48, read by BlockTypeRegistry::forEachBlock (not in this build's config)
    r.offset(n::BlockNetworkId, 220);
    r.offset(n::BlockSerializationId, 184);
    r.slot(n::LevelGetDimensionSlot, 5);
    r.data(n::BlockLookupMap, "48 8B 35 ? ? ? ? 48 8B 7E 08 48 89 7C 24 30", 3);
    r.slot(n::ItemGetMaxStackSize, 89);
}

BDG_BINDINGS("1.21.42.01") {
    r.offset(n::BlockTypePermutations, 768);
    r.offset(n::BlockTypeDefaultState, 792);
    r.offset(n::BlockTypeTags, 552);
    r.slot(n::LevelGetDimensionSlot, 4);
    r.function(n::LevelTick, "48 89 5C 24 10 48 89 6C 24 18 56 57 41 56 48 83 EC 60 48 8B 05 ? ? ? ? 48 33 C4 48 89 44 24 50 48 8B D9");
    r.data(n::BlockLookupMap, "48 8B 35 ? ? ? ? 48 8B 7E 08 48 89 7C 24 50", 3);
    r.slot(n::ItemGetMaxDamage, 35);
    r.slot(n::ItemGetMaxStackSize, 90);
}

BDG_BINDINGS("1.21.50.07") {
    r.offset(n::BlockTypeDescriptionId, 8);
    r.offset(n::BlockNetworkId, 296);
    r.offset(n::BlockSerializationId, 264);
    r.offset(n::BlockTypePermutations, 832);
    r.offset(n::BlockTypeDefaultState, 856);
    r.offset(n::BlockTypeTags, 616);
    r.data(n::BlockLookupMap, "48 8B 35 ? ? ? ? 48 8B 7E 08 48 89 7C 24 50 44 89 74 24 58", 3);
    r.offset(n::BlockDestroySpeed, 216);
    r.offset(n::BlockExplosionResistance, 200);
    r.offset(n::BlockLightDampening, 197);
    r.offset(n::BlockLightEmission, 196);
    r.slot(n::ItemGetMaxStackSize, 91);
}

BDG_BINDINGS("1.21.60.10") {
    r.offset(n::BlockTypePermutations, 728);
    r.offset(n::BlockTypeDefaultState, 752);
    r.offset(n::BlockTypeTags, 512);
    r.function(n::LevelTick, "48 89 5C 24 10 48 89 74 24 18 48 89 7C 24 20 55 41 54 41 55 41 56 41 57 48 8D AC 24 D0 FE FF FF 48 81 EC 30 02 00 00 48 8B 05 ? ? ? ? 48 33 C4 48 89 85 20 01 00 00 4C 8B F1");
    r.data(n::BlockLookupMap, "4C 8B 2D ? ? ? ? 49 8B 5D 08 48 89 5C 24 40", 3);
    r.drop(n::ItemGetMaxStackSize);
}

BDG_BINDINGS("1.21.70.04") {
    r.slot(n::LevelGetDimensionSlot, 5);
}

BDG_BINDINGS("1.21.80.3") {
    r.slot(n::LevelGetDimensionSlot, 4);
}

BDG_BINDINGS("1.21.100.6") {
    r.offset(n::BlockTypePermutations, 720);
    r.offset(n::BlockTypeDefaultState, 744);
    r.offset(n::BlockTypeTags, 504);
    r.slot(n::LevelGetBlockTypeRegistry, 380);
    r.drop(n::BlockLookupMap);
}

BDG_BINDINGS("1.21.111.1") {
    r.offset(n::BlockNetworkId, 288);
    r.offset(n::BlockTypePermutations, 712);
    r.offset(n::BlockTypeDefaultState, 736);
    r.offset(n::BlockTypeTags, 496);
    r.slot(n::LevelGetBlockTypeRegistry, 381);
    r.function(n::LevelTick, "48 89 5C 24 10 48 89 74 24 18 48 89 7C 24 20 55 41 54 41 55 41 56 41 57 48 8D 6C 24 C9 48 81 EC 90 00 00 00 48 8B 05 ? ? ? ? 48 33 C4 48 89 45 2F 4C 8B F9 45 33 F6");
    r.offset(n::BlockDestroySpeed, 212);
    r.offset(n::BlockExplosionResistance, 204);
}

BDG_BINDINGS("1.21.120.4") {
    r.offset(n::BlockNetworkId, 300);
    r.offset(n::BlockSerializationId, 272);
    r.slot(n::LevelGetBlockTypeRegistry, 380);
}

BDG_BINDINGS("1.21.124.2") {
    r.offset(n::BlockNetworkId, 308);
    r.slot(n::LevelGetDimensionSlot, 5);
    r.slot(n::ItemGetMaxStackSize, 94);
}

BDG_BINDINGS("1.21.130.3") {
    r.offset(n::BlockNetworkId, 288);
    r.offset(n::BlockSerializationId, 264);
    r.slot(n::LevelGetDimensionSlot, 4);
    r.slot(n::LevelGetBlockTypeRegistry, 382);
    r.function(n::LevelTick, "48 89 5C 24 10 48 89 74 24 18 48 89 7C 24 20 55 41 54 41 55 41 56 41 57 48 8D 6C 24 C9 48 81 EC 90 00 00 00 48 8B 05 ? ? ? ? 48 33 C4 48 89 45 2F 4C 8B F1");
    r.offset(n::BlockDestroySpeed, 196);
    r.offset(n::BlockExplosionResistance, 188);
    r.offset(n::BlockLightDampening, 181);
    r.offset(n::BlockLightEmission, 180);
    r.slot(n::ItemGetMaxDamage, 36);
    r.drop(n::ItemGetMaxStackSize);
}

BDG_BINDINGS("1.26.0.2") {
    r.offset(n::BlockNetworkId, 268);
    r.offset(n::BlockSerializationId, 232);
    r.offset(n::BlockTypePermutations, 624);
    r.offset(n::BlockTypeDefaultState, 648);
    r.offset(n::BlockTypeTags, 472);
    r.slot(n::LevelGetDimensionSlot, 5);
    r.slot(n::LevelGetBlockTypeRegistry, 386);
    r.slot(n::DimensionGetBlockSource, 12);
    r.offset(n::BlockDestroySpeed, 172);
    r.offset(n::BlockExplosionResistance, 164);
    r.offset(n::BlockLightDampening, 157);
    r.offset(n::BlockLightEmission, 156);
    r.slot(n::ItemGetMaxStackSize, 100);
}

BDG_BINDINGS("1.26.10.4") {
    r.offset(n::BlockNetworkId, 260);
    r.slot(n::LevelGetDimensionSlot, 4);
    r.slot(n::LevelGetBlockTypeRegistry, 388);
    r.offset(n::BlockDestroySpeed, 164);
    r.offset(n::BlockExplosionResistance, 156);
    r.offset(n::BlockLightDampening, 149);
    r.offset(n::BlockLightEmission, 148);
    r.drop(n::ItemGetMaxStackSize);
}

BDG_BINDINGS("1.26.20.5") {
    r.variant(n::RegistryGetterKind, n::RegistryInRax);  // clang-built server: getBlockTypeRegistry returns in rax
    r.offset(n::BlockNetworkId, 276);
    r.offset(n::BlockSerializationId, 240);
    r.offset(n::BlockTypePermutations, 640);
    r.offset(n::BlockTypeDefaultState, 664);
    r.offset(n::BlockTypeTags, 488);
    r.offset(n::LevelBlockTypeRegistry, 440);
    r.slot(n::LevelGetDimensionSlot, 6);
    r.slot(n::LevelGetBlockTypeRegistry, 389);
    r.function(n::LevelTick, "55 56 57 48 83 EC ? 48 8D 6C 24 ? 48 C7 45 ? FE FF FF FF 48 89 CE 48 8B 01 48 8B 80 38 06 00 00");
    r.offset(n::BlockDestroySpeed, 180);
    r.offset(n::BlockExplosionResistance, 172);
    r.offset(n::BlockLightDampening, 165);
    r.offset(n::BlockLightEmission, 164);
    r.slot(n::ItemGetMaxStackSize, 100);
}

BDG_BINDINGS("1.26.30.5") {
    r.offset(n::BlockTypePermutations, 552);
    r.offset(n::BlockTypeDefaultState, 576);
    r.offset(n::BlockTypeTags, 416);
    r.offset(n::BlockTypeRequiresCorrectTool, 357 * 8 + 5);
    r.slot(n::LevelGetBlockTypeRegistry, 390);
    r.slot(n::BlockAddCollisionShapes, 6);
    r.slot(n::BlockGetVisualShape, 10);
    r.slot(n::BlockGetUIShape, 11);
}

BDG_BINDINGS("1.26.40.8") {
    r.offset(n::BlockTypeRequiresCorrectTool, 357 * 8 + 2);
    r.function(n::LevelTick, "55 56 57 48 83 EC 70 48 8D 6C 24 70 48 C7 45 F8 FE FF FF FF 48 89 CE 48 8B 01 48 8B 80 48 06 00 00");
}

BDG_BINDINGS("1.26.51.1") {
    r.slot(n::LevelGetBlockTypeRegistry, 391);
    r.function(n::LevelTick, "55 56 57 53 48 81 EC B8 00 00 00 48 8D AC 24 80 00 00 00 48 C7 45 30 FE FF FF FF 48 89 CF");
}
