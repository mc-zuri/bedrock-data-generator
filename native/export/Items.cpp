#include "export/Items.h"

#include "bindings/Bindings.h"
#include "bindings/Names.h"
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

// The item registry, found and read by content, not by per-build offsets: no binding says where it is
// or how an Item is laid out on every build, but every build has the same few items whose values are
// certain (a diamond sword stacks to 1 and lasts 1561 uses), and those fix where the fields are.
//
// 1. The vector of Items (each entry an Item*, or a SharedPtr counter whose first word is one) whose
//    entries carry a "minecraft:*" name at one offset, among them minecraft:diamond_sword and
//    minecraft:stone: the ItemRegistry's mItemRegistry. Looked for in the server image's writable data
//    (older builds keep it in a static), else in a bounded breadth-first walk over the objects the Level
//    and the image's data point to (newer ones keep it on the heap); the longest such vector wins.
// 2. The byte that is 64 for stone, 1 for a diamond sword and 16 for an egg, an ender pearl and a
//    snowball is Item::mMaxStackSize; the short that is 1561 for a diamond sword, 384 for a bow, 432
//    for elytra and 0 for stone is Item::mMaxDamage; the string that reads "item.diamond_sword" for the
//    diamond sword is Item::mDescriptionId. Each must be the only offset that fits, or the export fails.
// 3. Some items answer otherwise than their fields (a fishing rod's durability, a bucket's stack size are
//    overrides): the max damage is Item::getMaxDamage() and the stack size Item::getMaxStackSize(an empty
//    descriptor), at the build's vtable slots, once they give the known items' values. Without a stack
//    size slot (some builds), the field, a filled bucket stacking to 1 and an empty one to 16
//    (BucketItem::getMaxStackSize, the one override).

namespace bdg::exporter {

namespace {

bool isObject(std::uintptr_t p) { return p >= 0x10000 && !(p & 7) && memory::inImage(memory::readPtr(p)); }

// a vector entry: an Item* or a SharedPtr counter pointing at one
std::uintptr_t entryItem(std::uintptr_t entry) {
    if (isObject(entry)) return entry;
    std::uintptr_t inner = memory::readPtr(entry);
    return isObject(inner) ? inner : 0;
}

struct ItemVector {
    std::uintptr_t holder = 0;  // where its begin / end pointers are (the ItemRegistry, or a static)
    std::uintptr_t begin = 0;
    std::size_t    count = 0, stride = 8;
    std::int64_t   nameOffset = -1;
    std::uintptr_t at(std::size_t i) const { return entryItem(memory::readPtr(begin + i * stride)); }
};

bool isGameName(std::string const& s) { return s.size() > 10 && s.starts_with("minecraft:"); }

// the offset at which (nearly) every sampled item has a "minecraft:*" name, -1 when none
std::int64_t nameOffset(ItemVector const& v) {
    std::size_t const sample = std::min<std::size_t>(v.count, 64);
    for (std::int64_t off = 8; off <= 0x200; off += 8) {
        std::size_t named = 0;
        for (std::size_t i = 0; i < sample; ++i)
            if (std::uintptr_t it = v.at(i); it && isGameName(memory::readString(it + off))) ++named;
        if (named * 10 >= sample * 9) return off;
    }
    return -1;
}

bool hasItem(ItemVector const& v, std::string_view name) {
    for (std::size_t i = 0; i < v.count; ++i)
        if (std::uintptr_t it = v.at(i); it && memory::readString(it + v.nameOffset) == name) return true;
    return false;
}

std::optional<ItemVector> vectorAt(std::uintptr_t obj, std::int64_t off) {
    std::uintptr_t const b = memory::readPtr(obj, off), e = memory::readPtr(obj, off + 8);
    if (b < 0x10000 || e <= b) return std::nullopt;
    for (std::size_t stride : {8u, 16u}) {
        if ((e - b) % stride) continue;
        ItemVector v{static_cast<std::uintptr_t>(obj + off), b, (e - b) / stride, stride};
        if (v.count < 400 || v.count > 20000) continue;
        bool items = true;
        for (std::size_t i = 0; i < 8 && items; ++i) items = v.at(i) != 0;
        if (!items) continue;
        v.nameOffset = nameOffset(v);
        if (v.nameOffset >= 0 && hasItem(v, "minecraft:diamond_sword") && hasItem(v, "minecraft:stone")) return v;
    }
    return std::nullopt;
}

// the image's writable, initialized or not, data sections
std::vector<std::pair<std::uintptr_t, std::uintptr_t>> dataSections() {
    std::vector<std::pair<std::uintptr_t, std::uintptr_t>> out;
    auto const base = memory::imageBase();
    auto const* dos = reinterpret_cast<IMAGE_DOS_HEADER const*>(base);
    auto const* nt  = reinterpret_cast<IMAGE_NT_HEADERS const*>(base + dos->e_lfanew);
    auto const* sec = IMAGE_FIRST_SECTION(nt);
    for (unsigned i = 0; i < nt->FileHeader.NumberOfSections; ++i, ++sec)
        if ((sec->Characteristics & IMAGE_SCN_MEM_WRITE) && !(sec->Characteristics & IMAGE_SCN_MEM_EXECUTE))
            out.emplace_back(base + sec->VirtualAddress, base + sec->VirtualAddress + sec->Misc.VirtualSize);
    return out;
}

// forward: used below
std::optional<ItemVector> findItems(std::uintptr_t level) {
    std::optional<ItemVector>     best;
    for (auto [from, to] : dataSections())
        for (std::uintptr_t at = from; at + 16 <= to; at += 8)
            if (auto v = vectorAt(at, 0); v && (!best || v->count > best->count)) best = v;
    if (best) return best;
    // breadth first from the Level, then from every heap object the image's data points to; the first
    // ring that holds the registry is enough, but every object in it is looked at (the longest wins)
    std::unordered_set<std::uintptr_t> seen{level};
    std::queue<std::uintptr_t>         queue;
    queue.push(level);
    auto enqueue = [&](std::uintptr_t child) {
        std::uint8_t probe;
        if (child >= 0x10000 && !(child & 7) && !memory::inImage(child) && seen.size() < 400000 && seen.insert(child).second &&
            memory::safeRead(reinterpret_cast<void const*>(child), &probe, 1))
            queue.push(child);
    };
    for (auto [from, to] : dataSections())
        for (std::uintptr_t at = from; at + 8 <= to; at += 8) enqueue(memory::readPtr(at));
    for (int visited = 0; !queue.empty() && visited < 200000; ++visited) {
        std::uintptr_t obj = queue.front();
        queue.pop();
        for (std::int64_t off = 0; off <= 0x400; off += 8) {
            if (auto v = vectorAt(obj, off); v && (!best || v->count > best->count)) best = v;
            enqueue(memory::readPtr(obj, off));
        }
        if (best && best->count >= 900) break;
    }
    return best;
}

// calls through the vtable, SEH-guarded (no C++ objects here); -1 when the call faults
int callInt(std::uintptr_t fn, std::uintptr_t self) {
    __try {
        return reinterpret_cast<int(__fastcall*)(std::uintptr_t)>(fn)(self);
    } __except (EXCEPTION_EXECUTE_HANDLER) {
        return -1;
    }
}

int callStack(std::uintptr_t fn, std::uintptr_t self) {
    alignas(16) std::uint8_t descriptor[128] = {};
    __try {
        return reinterpret_cast<std::uint8_t(__fastcall*)(std::uintptr_t, void const*)>(fn)(self, descriptor);
    } __except (EXCEPTION_EXECUTE_HANDLER) {
        return -1;
    }
}

// ItemRegistry::mItemAliasLookupMap, an std::unordered_map<HashedString, ItemAlias>: its std::list of nodes
// { next, prev, HashedString key (+16), ItemAlias { HashedString name } (+64) } holds the old names the game
// still reads (loot tables name "minecraft:fish" for cod). It is the list whose keys are minecraft:* names,
// among them minecraft:clownfish, and whose values are names (without their namespace), looked for among the
// words between `from` and `to`.
std::vector<std::pair<std::string, std::string>> aliasesNear(std::uintptr_t from, std::uintptr_t to) {
    for (std::uintptr_t at = from; at + 8 <= to; at += 8) {
        std::uintptr_t const head = memory::readPtr(at);
        if (head < 0x10000 || (head & 7)) continue;
        std::uintptr_t node = memory::readPtr(head);
        if (node < 0x10000 || node == head || !memory::readString(node + 24).starts_with("minecraft:")) continue;
        std::vector<std::pair<std::string, std::string>> pairs;
        bool clownfish = false, ok = true;
        for (int n = 0; node != head && n < 20000; ++n, node = memory::readPtr(node)) {
            std::string key = memory::readString(node + 24), value = memory::readString(node + 72);
            if (!key.starts_with("minecraft:") || value.empty() || !std::all_of(value.begin(), value.end(), [](char c) { return (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_' || c == ':' || c == '.'; })) {
                ok = false;
                break;
            }
            // the name an alias stands for is kept without its namespace
            if (value.find(':') == std::string::npos) value = "minecraft:" + value;
            clownfish |= key == "minecraft:clownfish";
            pairs.emplace_back(std::move(key), std::move(value));
        }
        if (ok && clownfish && node == head) return pairs;
    }
    return {};
}

// the one offset (step `step`) at which `fits` holds, -1 when none or several
template <class Fits>
std::int64_t onlyOffset(std::int64_t step, Fits fits, std::string& why, char const* what) {
    std::vector<std::int64_t> found;
    for (std::int64_t off = 8; off <= 0x400; off += step)
        if (fits(off)) found.push_back(off);
    if (found.size() == 1) return found[0];
    why = std::format("{} offsets fit {}", found.size(), what);
    return -1;
}

}

Result exportItems(std::uintptr_t level, std::string const& out) {
    Result result;
    auto   items = findItems(level);
    if (!items) {
        result.message = "no item registry vector found from the Level";
        return result;
    }
    std::map<std::string, std::uintptr_t> byName;
    for (std::size_t i = 0; i < items->count; ++i)
        if (std::uintptr_t it = items->at(i)) {
            std::string name = memory::readString(it + items->nameOffset);
            if (isGameName(name)) byName.emplace(name, it);
        }
    log::info("item registry: {} entries (stride {}), {} named, name at +{}", items->count, items->stride, byName.size(), items->nameOffset);

    auto item = [&](char const* name) -> std::uintptr_t {
        auto it = byName.find(name);
        return it == byName.end() ? 0 : it->second;
    };
    std::uintptr_t const stone = item("minecraft:stone"), sword = item("minecraft:diamond_sword"), egg = item("minecraft:egg"),
                         pearl = item("minecraft:ender_pearl"), snowball = item("minecraft:snowball"), bow = item("minecraft:bow"),
                         elytra = item("minecraft:elytra");
    if (!stone || !sword || !egg || !pearl || !snowball || !bow || !elytra) {
        result.message = "the item registry lacks one of stone, diamond_sword, egg, ender_pearl, snowball, bow, elytra";
        return result;
    }
    auto u8  = [](std::uintptr_t it, std::int64_t off) { return memory::read<std::uint8_t>(it, off); };
    auto i16 = [](std::uintptr_t it, std::int64_t off) { return memory::read<std::int16_t>(it, off); };
    std::int64_t const stackOff = onlyOffset(1, [&](std::int64_t o) {
        return u8(stone, o) == 64 && u8(sword, o) == 1 && u8(egg, o) == 16 && u8(pearl, o) == 16 && u8(snowball, o) == 16;
    }, result.message, "a max stack size");
    if (stackOff < 0) return result;
    std::int64_t const damageOff = onlyOffset(2, [&](std::int64_t o) {
        return i16(sword, o) == 1561 && i16(bow, o) == 384 && i16(elytra, o) == 432 && i16(stone, o) == 0 && i16(egg, o) == 0;
    }, result.message, "a max damage");
    if (damageOff < 0) return result;
    std::int64_t const descriptionOff = onlyOffset(8, [&](std::int64_t o) {
        return memory::readString(sword + o) == "item.diamond_sword" && memory::readString(bow + o) == "item.bow";
    }, result.message, "a description id");
    if (descriptionOff < 0) return result;
    log::info("items: max stack size at +{}, max damage at +{}, description id at +{}", stackOff, damageOff, descriptionOff);

    auto const& r          = bindings::current();
    int const   damageSlot = r.slot(bindings::names::ItemGetMaxDamage), stackSlot = r.slot(bindings::names::ItemGetMaxStackSize);
    auto        damageOf   = [&](std::uintptr_t it) { return callInt(memory::virtualAt(it, damageSlot), it); };
    auto        stackOf    = [&](std::uintptr_t it) { return callStack(memory::virtualAt(it, stackSlot), it); };
    std::uintptr_t const rod = item("minecraft:fishing_rod"), bucket = item("minecraft:bucket"), waterBucket = item("minecraft:water_bucket");
    if (damageSlot < 0 || !rod || damageOf(sword) != 1561 || damageOf(bow) != 384 || damageOf(rod) != 384 || damageOf(stone) != 0) {
        result.message = std::format("Item::getMaxDamage (slot {}) does not give the known items' durability", damageSlot);
        return result;
    }
    bool const stackCalls = stackSlot >= 0 && bucket && waterBucket && stackOf(stone) == 64 && stackOf(sword) == 1 && stackOf(egg) == 16 &&
                            stackOf(bucket) == 16 && stackOf(waterBucket) == 1;
    // the field, but a filled bucket stacks to 1, an empty one to 16
    auto byField = [&](std::string const& name, std::uintptr_t it) -> int {
        if (name == "minecraft:bucket") return 16;
        if (name.ends_with("_bucket")) return 1;
        return u8(it, stackOff);
    };
    int overridden = 0;
    std::string firstOverride;
    if (stackCalls)
        for (auto const& [name, it] : byName)
            if (int v = stackOf(it); v != byField(name, it) && !overridden++) firstOverride = std::format("{} {} (field {})", name, v, byField(name, it));
    log::info("items: stack size by {} (slot {}), {} items differ from the field rule{}{}", stackCalls ? "Item::getMaxStackSize" : "the field", stackSlot,
              overridden, overridden ? ", first " : "", firstOverride);

    std::string json = "{";
    bool        first = true;
    for (auto const& [name, it] : byName) {
        std::string desc = memory::readString(it + descriptionOff);
        if (!std::all_of(desc.begin(), desc.end(), [](char c) { return c >= 0x20 && c < 0x7f && c != '"' && c != '\\'; })) desc.clear();
        int const stackSize = stackCalls ? stackOf(it) : byField(name, it), damage = damageOf(it);
        if (stackSize < 1 || stackSize > 64 || damage < 0) {
            result.message = std::format("{}: stack size {}, max damage {}", name, stackSize, damage);
            return result;
        }
        json += std::format("{}\n  \"{}\": {{\n    \"maxStackSize\": {},\n    \"maxDamage\": {}", first ? "" : ",", name, stackSize, damage);
        if (!desc.empty()) json += std::format(",\n    \"descriptionId\": \"{}\"", desc);
        json += "\n  }";
        first = false;
    }
    json += "\n}\n";

    // the aliases: in the ItemRegistry beside the vector, or, where the vector is a static, in the statics
    // around it
    auto aliases = aliasesNear(items->holder - 0x400, items->holder + 0x400);
    if (aliases.empty())
        for (auto [from, to] : dataSections())
            if (items->holder >= from && items->holder < to && (aliases = aliasesNear(from, to)).size()) break;
    if (aliases.empty()) {
        result.message = "no item alias map (with minecraft:clownfish) found near the item registry";
        return result;
    }
    std::sort(aliases.begin(), aliases.end());
    std::string aliasJson = "{";
    for (std::size_t i = 0; i < aliases.size(); ++i) aliasJson += std::format("{}\n  \"{}\": \"{}\"", i ? "," : "", aliases[i].first, aliases[i].second);
    aliasJson += "\n}\n";
    log::info("items: {} aliases", aliases.size());
    if (!nbt::writeFile(out + "\\item_aliases.json", std::vector<std::uint8_t>(aliasJson.begin(), aliasJson.end()))) {
        result.message = "could not write item_aliases.json";
        return result;
    }
    if (!nbt::writeFile(out + "\\item_types.json", std::vector<std::uint8_t>(json.begin(), json.end()))) {
        result.message = "could not write item_types.json";
        return result;
    }
    result.ok      = true;
    result.message = std::format("{} items", byName.size());
    return result;
}

}
