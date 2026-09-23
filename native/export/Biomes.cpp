#include "export/Biomes.h"

#include "core/Log.h"
#include "export/Nbt.h"
#include "memory/Mem.h"

#include <windows.h>

#include <algorithm>
#include <format>
#include <map>
#include <optional>
#include <queue>
#include <string_view>
#include <unordered_set>
#include <vector>

// The biomes and their numeric ids, found and read by content. The biome registry keeps its Biomes either in
// a std::vector of pointers (or of owning pointers; older builds by id, with empty slots), each Biome naming
// itself in a std::string (or a HashedString), or in a map from name to Biome (the std::list of an
// unordered_map: nodes { next, prev, name, ..., Biome* }). The container is the one whose names include
// plains, ocean, desert, forest and river, found among the image's data and the objects the Level (then the
// image's data) points to, breadth first. The id is the one offset (a u16 or an i32) of the Biome at which the
// ids the game has always had hold (ocean 0, plains 1, desert 2, extreme_hills 3, forest 4, ... mesa 37,
// flower_forest 132, ice_plains_spikes 140).

namespace bdg::exporter {

namespace {

constexpr std::string_view Known[] = {"plains", "ocean", "desert", "forest", "river"};

std::string bare(std::string s) { return s.starts_with("minecraft:") ? s.substr(10) : s; }

bool biomeName(std::string const& s) {
    std::string b = bare(s);
    return b.size() >= 3 && b.size() <= 48 && std::all_of(b.begin(), b.end(), [](char c) { return (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_'; });
}

std::vector<std::pair<std::string, std::uintptr_t>> named(std::vector<std::uintptr_t> const& objs, std::int64_t off) {
    std::vector<std::pair<std::string, std::uintptr_t>> out;
    for (std::uintptr_t o : objs) {
        std::string s = memory::readString(o + off);
        if (biomeName(s)) out.emplace_back(bare(s), o);
    }
    return out;
}

// the biomes of a list of objects: the name offset at which all five known names are there, and each named one
std::optional<std::pair<std::int64_t, std::map<std::string, std::uintptr_t>>> biomesOf(std::vector<std::uintptr_t> const& objs) {
    if (objs.size() < 20 || objs.size() > 1000) return std::nullopt;
    for (std::int64_t off = 8; off <= 0x800; off += 8) {
        auto list = named(objs, off);
        if (list.size() * 10 < objs.size() * 8) continue;
        std::map<std::string, std::uintptr_t> byName(list.begin(), list.end());
        if (std::all_of(std::begin(Known), std::end(Known), [&](std::string_view k) { return byName.contains(std::string(k)); })) return std::pair{off, byName};
    }
    return std::nullopt;
}

bool isObject(std::uintptr_t p) { return p >= 0x10000 && !(p & 7) && memory::inImage(memory::readPtr(p)); }

// a vector of Biome pointers (or owning pointers: 8 bytes each, or 16 for shared_ptr) at `at`
std::vector<std::uintptr_t> vectorObjects(std::uintptr_t at, std::uintptr_t stride) {
    std::uintptr_t const b = memory::readPtr(at), e = memory::readPtr(at, 8);
    if (b < 0x10000 || e <= b || (e - b) % stride || (e - b) / stride < 20 || (e - b) / stride > 1000) return {};
    // older builds index the vector by id, with empty slots
    std::vector<std::uintptr_t> out;
    for (std::uintptr_t p = b; p < e; p += stride) {
        std::uintptr_t o = memory::readPtr(p);
        if (!o) continue;
        if (!isObject(o)) o = memory::readPtr(o);
        if (!isObject(o)) return {};
        out.push_back(o);
    }
    return out;
}

std::vector<std::pair<std::uintptr_t, std::uintptr_t>> dataSections() {
    std::vector<std::pair<std::uintptr_t, std::uintptr_t>> out;
    auto const  base = memory::imageBase();
    auto const* dos  = reinterpret_cast<IMAGE_DOS_HEADER const*>(base);
    auto const* nt   = reinterpret_cast<IMAGE_NT_HEADERS const*>(base + dos->e_lfanew);
    auto const* sec  = IMAGE_FIRST_SECTION(nt);
    for (unsigned i = 0; i < nt->FileHeader.NumberOfSections; ++i, ++sec)
        if ((sec->Characteristics & IMAGE_SCN_MEM_WRITE) && !(sec->Characteristics & IMAGE_SCN_MEM_EXECUTE))
            out.emplace_back(base + sec->VirtualAddress, base + sec->VirtualAddress + sec->Misc.VirtualSize);
    return out;
}

// a list node holding a biome name at `keyAt`: the whole list's names and the Biome each points to
std::optional<std::pair<std::int64_t, std::map<std::string, std::uintptr_t>>> listAt(std::uintptr_t node, std::int64_t keyAt) {
    std::map<std::string, std::uintptr_t> byName;
    std::uintptr_t const start = node;
    for (int n = 0; n < 2000; ++n) {
        std::string key = memory::readString(node + keyAt);
        if (biomeName(key)) {
            // the value: the first pointer after the key to an object with a vtable
            for (std::int64_t off = keyAt + 32; off <= keyAt + 96; off += 8)
                if (std::uintptr_t v = memory::readPtr(node, off); isObject(v)) {
                    byName.emplace(bare(key), v);
                    break;
                }
        }
        node = memory::readPtr(node);
        if (node < 0x10000 || node == start) break;
    }
    if (byName.size() < 20 || !std::all_of(std::begin(Known), std::end(Known), [&](std::string_view k) { return byName.contains(std::string(k)); })) return std::nullopt;
    return std::pair{std::int64_t{-1}, byName};
}

std::optional<std::pair<std::int64_t, std::map<std::string, std::uintptr_t>>> findBiomes(std::uintptr_t level) {
    auto tryAt = [](std::uintptr_t at) {
        auto f = biomesOf(vectorObjects(at, 8));
        if (!f) f = biomesOf(vectorObjects(at, 16));
        // a map's list node: its name (a std::string, or a HashedString's) near the start
        for (std::int64_t keyAt = 16; !f && keyAt <= 32; keyAt += 8)
            if (memory::readString(at + keyAt) == "plains" || memory::readString(at + keyAt) == "minecraft:plains") f = listAt(at, keyAt);
        return f;
    };
    for (auto [from, to] : dataSections())
        for (std::uintptr_t at = from; at + 16 <= to; at += 8)
            if (auto f = tryAt(at)) return f;
    std::unordered_set<std::uintptr_t> seen{level};
    std::queue<std::uintptr_t>         queue;
    auto enqueue = [&](std::uintptr_t child) {
        std::uint8_t probe;
        if (child >= 0x10000 && !(child & 7) && !memory::inImage(child) && seen.size() < 400000 && seen.insert(child).second &&
            memory::safeRead(reinterpret_cast<void const*>(child), &probe, 1))
            queue.push(child);
    };
    queue.push(level);
    for (auto [from, to] : dataSections())
        for (std::uintptr_t at = from; at + 8 <= to; at += 8) enqueue(memory::readPtr(at));
    for (int visited = 0; !queue.empty() && visited < 200000; ++visited) {
        std::uintptr_t obj = queue.front();
        queue.pop();
        for (std::int64_t off = 0; off <= 0x400; off += 8) {
            if (auto f = tryAt(obj + off)) return f;
            enqueue(memory::readPtr(obj, off));
        }
    }
    return std::nullopt;
}

}

Result exportBiomes(std::uintptr_t level, std::string const& out) {
    Result result;
    auto   found = findBiomes(level);
    if (!found) {
        result.message = "no biome registry found";
        return result;
    }
    auto const& [nameAt, byName] = *found;
    // the ids Bedrock has given these biomes since they came (a biome a build lacks is not asked for; the
    // first seven every build has)
    std::pair<char const*, int> const ids[] = {{"ocean", 0}, {"plains", 1}, {"desert", 2}, {"forest", 4}, {"river", 7}, {"hell", 8}, {"the_end", 9},
        {"extreme_hills", 3}, {"taiga", 5}, {"swampland", 6}, {"legacy_frozen_ocean", 10}, {"frozen_ocean", 46}, {"frozen_river", 11}, {"ice_plains", 12}, {"mushroom_island", 14},
        {"beach", 16}, {"jungle", 21}, {"birch_forest", 27}, {"roofed_forest", 29}, {"mega_taiga", 32}, {"savanna", 35}, {"mesa", 37},
        // and two of the mutated ones, from 128: an index of the registry fits the low ids too
        {"flower_forest", 132}, {"ice_plains_spikes", 140}};
    auto fits = [&](auto read) {
        return std::all_of(std::begin(ids), std::end(ids), [&](auto const& id) {
            auto it = byName.find(id.first);
            return it == byName.end() ? id.second > 9 : read(it->second) == id.second;
        });
    };
    std::vector<std::pair<std::int64_t, int>> offsets;  // offset, width
    for (std::int64_t off = 8; off <= 0x800; off += 2) {
        if (off >= nameAt && off < nameAt + 32) continue;
        if (fits([&](std::uintptr_t b) { return static_cast<int>(memory::read<std::uint16_t>(b, off)); })) offsets.emplace_back(off, 2);
        if (off % 4 == 0 && fits([&](std::uintptr_t b) { return memory::read<std::int32_t>(b, off); })) offsets.emplace_back(off, 4);
    }
    // a u16 at the start of an i32 that fits is the same field
    std::erase_if(offsets, [&](auto const& o) { return o.second == 2 && std::find(offsets.begin(), offsets.end(), std::pair{o.first, 4}) != offsets.end(); });
    auto idAtOffset = [&](std::uintptr_t b, std::pair<std::int64_t, int> o) {
        return o.second == 2 ? static_cast<int>(memory::read<std::uint16_t>(b, o.first)) : memory::read<std::int32_t>(b, o.first);
    };
    // the id kept twice (older builds): the same for every biome, so one field for this
    if (offsets.size() > 1 && std::all_of(offsets.begin() + 1, offsets.end(), [&](auto const& o) {
            return std::all_of(byName.begin(), byName.end(), [&](auto const& nb) { return idAtOffset(nb.second, o) == idAtOffset(nb.second, offsets[0]); });
        }))
        offsets.resize(1);
    if (offsets.size() != 1) {
        result.message = std::format("{} offsets fit a biome id", offsets.size());
        return result;
    }
    auto [idAt, width] = offsets[0];
    // every id small and once: a read of a Biome in the middle of a change gives neither
    std::unordered_set<int> seenIds;
    for (auto const& [name, b] : byName) {
        int id = width == 2 ? memory::read<std::uint16_t>(b, idAt) : memory::read<std::int32_t>(b, idAt);
        if (id < 0 || id > 1023 || !seenIds.insert(id).second) {
            result.message = std::format("biome {} reads id {}", name, id);
            return result;
        }
    }
    std::string json = "{";
    bool        first = true;
    for (auto const& [name, b] : byName) {
        int id = width == 2 ? memory::read<std::uint16_t>(b, idAt) : memory::read<std::int32_t>(b, idAt);
        json += std::format("{}\n  \"{}\": {}", first ? "" : ",", name, id);
        first = false;
    }
    json += "\n}\n";
    if (!nbt::writeFile(out + "\\biome_ids.json", std::vector<std::uint8_t>(json.begin(), json.end()))) {
        result.message = "could not write biome_ids.json";
        return result;
    }
    log::info("biomes: {}, name at +{}, id at +{} ({} bytes)", byName.size(), nameAt, idAt, width);
    result.ok      = true;
    result.message = std::format("{} biomes", byName.size());
    return result;
}

}
