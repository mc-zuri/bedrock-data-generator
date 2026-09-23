#include "export/Blocks.h"

#include "bindings/Bindings.h"
#include "bindings/Names.h"
#include "core/Log.h"
#include "export/Nbt.h"
#include "export/Shapes.h"
#include "game/Game.h"
#include "memory/Mem.h"

#include <algorithm>
#include <functional>
#include <map>
#include <format>
#include <optional>
#include <string>
#include <vector>

namespace bdg::exporter {

namespace n = bindings::names;

namespace {

struct Scalars {
    float        hardness = 0, resistance = 0;
    std::uint8_t lightDampening = 0, lightEmission = 0;
};

// A state's destroy speed (hardness), explosion resistance and light, from the Block or, where the build
// keeps them there, its BlockLegacy; nullopt when the build has no offset for one of them.
std::optional<Scalars> scalars(std::uintptr_t bt, std::uintptr_t blk) {
    auto const& r = bindings::current();
    auto        from = [&](char const* typeKey, char const* blockKey) -> std::pair<std::uintptr_t, std::int64_t> {
        if (std::int64_t o = r.offset(typeKey); o >= 0) return {bt, o};
        return {blk, r.offset(blockKey)};
    };
    auto [hBase, hOff] = from(n::BlockTypeDestroySpeed, n::BlockDestroySpeed);
    auto [dBase, dOff] = from(n::BlockTypeLightDampening, n::BlockLightDampening);
    auto [eBase, eOff] = from(n::BlockTypeLightEmission, n::BlockLightEmission);
    std::int64_t const typeResistance = r.offset(n::BlockTypeExplosionResistance), resistance = r.offset(n::BlockExplosionResistance);
    if (hOff < 0 || dOff < 0 || eOff < 0 || (typeResistance < 0 && resistance < 0)) return std::nullopt;
    Scalars s;
    s.hardness       = memory::read<float>(hBase, hOff);
    s.lightDampening = memory::read<std::uint8_t>(dBase, dOff);
    s.lightEmission  = memory::read<std::uint8_t>(eBase, eOff);
    s.resistance     = typeResistance >= 0 ? memory::read<float>(bt, typeResistance) / 5 : memory::read<float>(blk, resistance);
    return s;
}

// Where the build has no binding for mRequiresCorrectToolForDrops, the one bit of the BlockLegacy (in its
// first 0x400 bytes) that is set for a dozen blocks that need a pickaxe to drop (stone, ores, obsidian,
// furnace, ...) and clear for a dozen that do not (air, dirt, sand, logs, planks, glass, torch, ...): -1 when
// no bit or several fit (older builds keep the requirement elsewhere, in their materials).
std::int64_t requiresCorrectToolBit(std::function<std::uintptr_t(char const*)> const& type) {
    char const* const needs[]   = {"minecraft:stone",     "minecraft:cobblestone", "minecraft:obsidian", "minecraft:iron_ore",   "minecraft:coal_ore",
                                   "minecraft:gold_ore",  "minecraft:diamond_ore", "minecraft:lapis_ore", "minecraft:iron_block", "minecraft:furnace",
                                   "minecraft:netherrack", "minecraft:sandstone"};
    char const* const needsNo[] = {"minecraft:dirt", "minecraft:sand",    "minecraft:gravel",         "minecraft:glass",   "minecraft:air",
                                   "minecraft:tnt",  "minecraft:torch",   "minecraft:crafting_table", "minecraft:pumpkin", "minecraft:bookshelf",
                                   "minecraft:ice",  "minecraft:cactus",  "minecraft:reeds",          "minecraft:sponge"};
    std::vector<std::uintptr_t> yes, no;
    for (auto n : needs) if (std::uintptr_t t = type(n)) yes.push_back(t); else return -1;
    for (auto n : needsNo) if (std::uintptr_t t = type(n)) no.push_back(t); else return -1;
    // a log and planks: named per wood on newer builds
    for (auto n : {"minecraft:oak_log", "minecraft:log"}) if (std::uintptr_t t = type(n)) { no.push_back(t); break; }
    for (auto n : {"minecraft:oak_planks", "minecraft:planks"}) if (std::uintptr_t t = type(n)) { no.push_back(t); break; }
    std::vector<std::int64_t> found;
    for (std::int64_t byte = 8; byte < 0x400; ++byte)
        for (int bit = 0; bit < 8; ++bit) {
            auto set = [&](std::uintptr_t t) { return (memory::read<std::uint8_t>(t, byte) >> bit) & 1; };
            if (std::all_of(yes.begin(), yes.end(), set) && std::none_of(no.begin(), no.end(), set)) found.push_back(byte * 8 + bit);
        }
    return found.size() == 1 ? found[0] : -1;
}

// BlockLegacy::mTags: a std::vector<HashedString> (0x30 each). Sorted, unique, with the minecraft: namespace
// the tag files use; nullopt when the vector does not look like one (a wrong offset).
std::optional<std::vector<std::string>> blockTags(std::uintptr_t bt, std::int64_t offset) {
    constexpr std::uintptr_t stride = 0x30;
    std::uintptr_t const     begin = memory::readPtr(bt, offset), end = memory::readPtr(bt, offset + 8);
    std::vector<std::string> tags;
    if (!begin && !end) return tags;
    if (begin < 0x10000 || end < begin || (end - begin) % stride || (end - begin) / stride > 200) return std::nullopt;
    for (std::uintptr_t at = begin; at < end; at += stride) {
        std::string tag = memory::readHashedString(at);
        if (tag.empty() || !std::all_of(tag.begin(), tag.end(), [](char c) { return c > 0x20 && c < 0x7f && c != '"' && c != '\\'; }))
            return std::nullopt;
        tags.push_back(tag.find(':') == std::string::npos ? "minecraft:" + tag : tag);
    }
    std::sort(tags.begin(), tags.end());
    tags.erase(std::unique(tags.begin(), tags.end()), tags.end());
    return tags;
}

}

Result exportBlocks(std::uintptr_t level, std::uintptr_t region, std::string const& out) {
    auto const& r = bindings::current();
    Result      result;

    std::int64_t const networkId = r.offset(n::BlockNetworkId);
    std::int64_t const serialization = r.offset(n::BlockSerializationId);
    bool const         hashes = r.variant(n::NetworkIdKind) == n::NetworkIdIsHash;
    std::int64_t const defaultState = r.offset(n::BlockTypeDefaultState);
    std::int64_t const tagsOffset = r.offset(n::BlockTypeTags);
    std::int64_t requiresBit = r.offset(n::BlockTypeRequiresCorrectTool);  // -1: not known for this build
    std::int64_t const descriptionOffset = r.offset(n::BlockTypeDescriptionId);
    if (serialization < 0 || networkId < 0 || defaultState < 0 || tagsOffset < 0 || r.offset(n::BlockTypePermutations) < 0) {
        result.message = "bindings lack a Block/BlockLegacy offset";
        return result;
    }

    std::uintptr_t map = game::blockTypeMap(level);
    if (!map) {
        result.message = "no route to the block type registry validated";
        return result;
    }
    // the requires-correct-tool bit: the build's binding where it has one (checked against the bit the blocks
    // themselves give), else that bit
    {
        std::map<std::string, std::uintptr_t> byName;
        game::forEachBlockType(map, [&](std::string const& name, std::uintptr_t bt) { byName.emplace(name, bt); });
        std::int64_t const found = requiresCorrectToolBit([&](char const* name) {
            auto it = byName.find(name);
            return it == byName.end() ? std::uintptr_t{0} : it->second;
        });
        log::info("requires-correct-tool bit: binding {}, by the blocks {}", requiresBit, found);
        if (requiresBit >= 0 && found >= 0 && found != requiresBit) {
            result.message = std::format("the requires-correct-tool bit is {} by the binding, {} by the blocks", requiresBit, found);
            return result;
        }
        if (requiresBit < 0) requiresBit = found;
    }

    std::vector<nbt::ShapeRow>  rows;
    std::vector<std::uintptr_t> blocks;
    int                         failedShapes = 0;
    std::string                 firstFailure;
    // block_types.json: each type's default state (BlockLegacy::mDefaultState), which must be one of its own,
    // and its tags (which tools dig it, which tier it takes)
    struct TypeRow {
        std::string              name;
        std::uint32_t            defaultId = 0, defaultNetworkId = 0;
        std::vector<std::string> tags;
        int                      requiresCorrectTool = -1;
        std::optional<Scalars>   scalars;
        std::string              descriptionId;
    };
    std::vector<TypeRow> typeRows;
    std::string          badDefault, badTags;
    std::size_t          tagged = 0;
    int types = game::forEachBlockType(map, [&](std::string const& name, std::uintptr_t bt) {
        std::uintptr_t const def   = memory::read<std::uintptr_t>(bt, defaultState);
        bool                 found = false;
        auto                 tags  = blockTags(bt, tagsOffset);
        if (!tags && badTags.empty()) badTags = name;
        if (tags && !tags->empty()) ++tagged;
        for (std::uintptr_t blk : game::permutations(bt)) {
            if (blk == def) {
                int const needsTool = requiresBit < 0 ? -1 : (memory::read<std::uint8_t>(bt, requiresBit / 8) >> (requiresBit % 8)) & 1;
                typeRows.push_back({name, static_cast<std::uint32_t>(rows.size()), memory::read<std::uint32_t>(blk, networkId), tags.value_or(std::vector<std::string>{}), needsTool, scalars(bt, blk), descriptionOffset < 0 ? std::string() : memory::readString(bt + descriptionOffset)});
                found = true;
            }
            nbt::ShapeRow row;
            row.id = static_cast<std::uint32_t>(rows.size());
            if (hashes) row.hash = memory::read<std::uint32_t>(blk, networkId);
            auto coll = shapes::collision(bt, blk, region);
            auto ui   = shapes::ui(bt, blk);
            auto vis  = shapes::visual(bt, blk);
            if (!coll || !ui || !vis) {
                if (!failedShapes++) firstFailure = std::format("{} #{}: {}{}{}", name, row.id, coll ? "" : "collision ", ui ? "" : "ui ", vis ? "" : "visual");
            } else {
                row.collision = std::move(*coll);
                row.ui        = *ui;
                row.visual    = *vis;
            }
            rows.push_back(std::move(row));
            blocks.push_back(blk);
        }
        if (!found && badDefault.empty()) badDefault = name;
    });
    log::info("walked {} block types, {} states", types, rows.size());
    if (rows.size() < 400) {
        result.message = std::format("only {} block states", rows.size());
        return result;
    }
    // every state has every shape, or the file is not written: a missing one would be a wrong answer
    if (failedShapes) {
        result.message = std::format("{} states without a shape, first {}", failedShapes, firstFailure);
        return result;
    }

    if (!badDefault.empty()) {
        result.message = std::format("the default state of {} is none of its states", badDefault);
        return result;
    }
    // stone takes a pickaxe, dirt does not: anything else means a wrong bit
    if (requiresBit >= 0) {
        auto needsTool = [&](char const* name) {
            auto it = std::find_if(typeRows.begin(), typeRows.end(), [&](TypeRow const& t) { return t.name == name; });
            return it == typeRows.end() ? -1 : it->requiresCorrectTool;
        };
        if (needsTool("minecraft:stone") != 1 || needsTool("minecraft:obsidian") != 1 || needsTool("minecraft:dirt") != 0 || needsTool("minecraft:oak_log") != 0) {
            result.message = "BlockLegacy::mRequiresCorrectToolForDrops does not read stone and obsidian as needing a tool, dirt and logs as not";
            return result;
        }
    }
    // stone is 1.5 / 6, bedrock unbreakable, glowstone lights 15, glass lets light through: anything else
    // means a wrong offset
    {
        auto at = [&](char const* name) -> std::optional<Scalars> {
            auto it = std::find_if(typeRows.begin(), typeRows.end(), [&](TypeRow const& t) { return t.name == name; });
            return it == typeRows.end() ? std::nullopt : it->scalars;
        };
        auto stone = at("minecraft:stone"), bedrock = at("minecraft:bedrock"), glowstone = at("minecraft:glowstone"), glass = at("minecraft:glass");
        if (!stone || !bedrock || !glowstone || !glass || stone->hardness != 1.5f || stone->resistance != 6.0f || stone->lightDampening != 15 ||
            bedrock->hardness != -1.0f || glowstone->lightEmission != 15 || glass->lightDampening != 0) {
            result.message = std::format("the block scalars read wrong: stone {}/{}/{}", stone ? stone->hardness : 0.f, stone ? stone->resistance : 0.f,
                                         stone ? stone->lightDampening : 0);
            return result;
        }
    }
    // nearly every block's description id is "tile.<...>": fewer means a wrong offset
    if (descriptionOffset >= 0) {
        auto tiles = std::count_if(typeRows.begin(), typeRows.end(), [](TypeRow const& t) { return t.descriptionId.starts_with("tile."); });
        if (tiles * 10 < static_cast<std::ptrdiff_t>(typeRows.size()) * 9) {
            result.message = std::format("only {} of {} description ids read as tile.*", tiles, typeRows.size());
            return result;
        }
    }
    // every build tags some blocks (the *_pick_diggable ones at least): none means a wrong offset
    if (!badTags.empty() || tagged < 10) {
        result.message = badTags.empty() ? std::format("only {} block types have tags", tagged) : std::format("the tags of {} are not a tag vector", badTags);
        return result;
    }
    // like bedrock-data-extractor's block_types.json: by name, the default state's network id (a hash from
    // 1.19.80, the runtime id before), its runtime id (its index in block_palette.nbt), the default state's
    // hardness, explosion resistance and light, whether it drops only with the right tool (where the build's
    // bit is known), and its tags if any
    std::sort(typeRows.begin(), typeRows.end(), [](TypeRow const& a, TypeRow const& b) { return a.name < b.name; });
    std::string typesJson = "{";
    for (std::size_t i = 0; i < typeRows.size(); ++i) {
        typesJson += std::format("{}\n  \"{}\": {{\n    \"defaultBlockStateHash\": {},\n    \"defaultBlockStateId\": {}", i ? "," : "",
                                 typeRows[i].name, typeRows[i].defaultNetworkId, typeRows[i].defaultId);
        if (auto const& s = typeRows[i].scalars)
            typesJson += std::format(",\n    \"hardness\": {},\n    \"explosionResistance\": {},\n    \"lightEmission\": {},\n    \"lightDampening\": {}",
                                     s->hardness, s->resistance, s->lightEmission, s->lightDampening);
        if (!typeRows[i].descriptionId.empty() && std::all_of(typeRows[i].descriptionId.begin(), typeRows[i].descriptionId.end(), [](char c) { return c >= 0x20 && c < 0x7f && c != '"' && c != '\\'; }))
            typesJson += std::format(",\n    \"descriptionId\": \"{}\"", typeRows[i].descriptionId);
        if (typeRows[i].requiresCorrectTool >= 0)
            typesJson += std::format(",\n    \"requiresCorrectToolForDrops\": {}", typeRows[i].requiresCorrectTool ? "true" : "false");
        if (!typeRows[i].tags.empty()) {
            typesJson += ",\n    \"tags\": [";
            for (std::size_t t = 0; t < typeRows[i].tags.size(); ++t) typesJson += std::format("{}\"{}\"", t ? ", " : "", typeRows[i].tags[t]);
            typesJson += "]";
        }
        typesJson += "\n  }";
    }
    typesJson += "\n}\n";

    if (!nbt::writeFile(out + "\\block_types.json", std::vector<std::uint8_t>(typesJson.begin(), typesJson.end())) ||
        !nbt::writeFile(out + "\\block_palette.nbt", nbt::paletteFile(blocks, serialization)) ||
        !nbt::writeFile(out + "\\block-state-shapes.nbt", nbt::shapesFile(rows))) {
        result.message = "could not write the output files";
        return result;
    }
    result.ok      = true;
    result.states  = static_cast<int>(rows.size());
    result.message = std::format("ok {} states", rows.size());
    return result;
}

}
