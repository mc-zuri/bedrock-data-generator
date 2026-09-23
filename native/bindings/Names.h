#pragma once
// Every key bindings/Steps.cpp may set. Consumers use these, never raw strings.

namespace bdg::bindings::names {

// ---- functions (patterns) ----------------------------------------------------------------------
// Hooked: the export runs on the server's own tick, with the game quiescent.
inline constexpr char LevelTick[] = "Level::tick";
// Overworld lookup. getDimension is also how a Level is recognised by its vtable; either creator is
// preferred over it so the overworld is created rather than waited for.
inline constexpr char LevelGetDimension[]         = "Level::getDimension";
inline constexpr char LevelCreateDimension[]      = "Level::createDimension";       // DimensionByPointer era
inline constexpr char LevelGetOrCreateDimension[] = "Level::getOrCreateDimension";  // DimensionByWeakRef era
// data: the static std::map<HashedString, BlockType owner> of every block type (up to 1.21.93)
inline constexpr char BlockLookupMap[] = "BlockTypeRegistry::mBlockLookupMap";

// ---- vtable slots ------------------------------------------------------------------------------
inline constexpr char LevelGetDimensionSlot[]       = "Level::getDimension (slot)";
inline constexpr char LevelGetBlockTypeRegistry[]   = "ILevel::getBlockTypeRegistry";
inline constexpr char DimensionGetBlockSource[]     = "Dimension::getBlockSourceFromMainChunkSource";
inline constexpr char BlockAddCollisionShapes[]     = "BlockLegacy::addCollisionShapes";
inline constexpr char ItemGetMaxDamage[]            = "Item::getMaxDamage";      // int () const
inline constexpr char ItemGetMaxStackSize[]         = "Item::getMaxStackSize";   // uint8 (ItemDescriptor const&) const
inline constexpr char BlockGetVisualShape[]         = "BlockLegacy::getVisualShape";
inline constexpr char BlockGetUIShape[]             = "BlockLegacy::getUIShape";

// ---- member offsets ----------------------------------------------------------------------------
inline constexpr char BlockNetworkId[]         = "Block::mNetworkId";
inline constexpr char BlockSerializationId[]   = "Block::mSerializationId";  // the state's CompoundTag
inline constexpr char BlockTypePermutations[]  = "BlockLegacy::mBlockPermutations";  // std::vector<Block*> begin; end is +8
inline constexpr char BlockTypeDefaultState[]  = "BlockLegacy::mDefaultState";       // Block*, right after mBlockPermutations
inline constexpr char BlockTypeTags[]          = "BlockLegacy::mTags";               // std::vector<HashedString> begin; end is +8
// in BITS from the BlockType: the bool bitfield mRequiresCorrectToolForDrops (known from 1.26.30; unset before)
inline constexpr char BlockTypeRequiresCorrectTool[] = "BlockLegacy::mRequiresCorrectToolForDrops (bit)";
// A state's scalars: on the Block from 1.19 (float destroy speed and explosion resistance, byte light
// dampening and emission); before, on the BlockLegacy, where the explosion resistance is stored times 5
// (and until 1.20.10 it is only there). Where a BlockType key is set it wins over the Block one.
inline constexpr char BlockDestroySpeed[]            = "Block::mDestroySpeed";
inline constexpr char BlockExplosionResistance[]     = "Block::mExplosionResistance";
inline constexpr char BlockLightDampening[]          = "Block::mLightBlock";
inline constexpr char BlockLightEmission[]           = "Block::mLightEmission";
inline constexpr char BlockTypeDestroySpeed[]        = "BlockLegacy::mDestroySpeed";
inline constexpr char BlockTypeExplosionResistance[] = "BlockLegacy::mExplosionResistance (x5)";
inline constexpr char BlockTypeLightDampening[]      = "BlockLegacy::mLightBlock";
inline constexpr char BlockTypeLightEmission[]       = "BlockLegacy::mLightEmission";
// std::string, the translation stem ("tile.stone"; the language file has it + ".name" for most blocks)
inline constexpr char BlockTypeDescriptionId[]       = "BlockLegacy::mDescriptionId";
inline constexpr char LevelBlockTypeRegistry[] = "Level::mBlockTypeRegistry";
// where the Dimension keeps the BlockSource the shape getters read, on builds without the getter slot
// (Dimension::getBlockSourceFromMainChunkSource / Dimension::init in the PDB)
inline constexpr char DimensionBlockSource[] = "Dimension::mBlockSource";

// ---- variants ----------------------------------------------------------------------------------
inline constexpr char AabbLayout[] = "AABB layout";
enum AabbLayoutValue { Aabb24 = 0, Aabb28WithValid = 1 };  // the AABB carries `bool mValid` before 1.17.30

inline constexpr char VisualShapeKind[] = "getVisualShape kind";
enum VisualShapeKindValue { VisualShapeBlockBuffer = 0, VisualShapeBlockBufferBool = 1 };  // trailing bool before 1.20.10

inline constexpr char DimensionKind[] = "Level dimension getters";
enum DimensionKindValue { DimensionByPointer = 0, DimensionByWeakRef = 1 };  // WeakRef<Dimension> by value from 1.19.50

inline constexpr char RegistryGetterKind[] = "getBlockTypeRegistry kind";
enum RegistryGetterKindValue { RegistryBySret = 0, RegistryInRax = 1 };  // clang-built servers (1.26.20+) return it in rax

inline constexpr char BlockMapKey[] = "block type map key";
enum BlockMapKeyValue { MapKeyString = 0, MapKeyHashedString = 1 };  // bare-name std::string keys (value @0x40) before 1.18.30

inline constexpr char NetworkIdKind[] = "Block::mNetworkId kind";
enum NetworkIdKindValue { NetworkIdIsRuntimeId = 0, NetworkIdIsHash = 1 };  // exported as blockStateHash only once it is a hash

}
