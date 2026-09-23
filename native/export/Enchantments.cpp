#include "export/Enchantments.h"

#include "core/Log.h"
#include "export/Nbt.h"
#include "memory/Mem.h"

#include <windows.h>

#include <format>
#include <optional>
#include <vector>

// The enchantments, found and read by content: Enchant::mEnchants is a static std::vector<unique_ptr<Enchant>>
// in the image's data, entry i the Enchant of type i (a byte at +8). The one whose entries name protection
// (0), sharpness (9), efficiency (15) and unbreaking (17) at one HashedString offset (mStringId) is it.
// Each Enchant: +12 frequency (its weight), +16 tradeable, +20 / +24 primary / secondary slot bits, +28
// compatibility group; virtuals getMinCost(level) 2, getMaxCost(level) 3, getMinLevel 4, getMaxLevel 5. These
// are checked on protection (max level 4, min costs 1 12 23 34, max costs 21 32 43 54, frequency 30) and
// sharpness (max level 5), or the export fails. mDescription is the string that reads
// "enchantment.protect.all" for protection.

namespace bdg::exporter {

namespace {

constexpr std::int64_t TypeAt = 8, FrequencyAt = 12, TradeableAt = 16, PrimaryAt = 20, SecondaryAt = 24, CompatibilityAt = 28;
constexpr int          MinCostSlot = 2, MaxCostSlot = 3, MinLevelSlot = 4, MaxLevelSlot = 5;

int call0(std::uintptr_t fn, std::uintptr_t self) {
    __try {
        return reinterpret_cast<int(__fastcall*)(std::uintptr_t)>(fn)(self);
    } __except (EXCEPTION_EXECUTE_HANDLER) {
        return -0x7fffffff;
    }
}

int call1(std::uintptr_t fn, std::uintptr_t self, int arg) {
    __try {
        return reinterpret_cast<int(__fastcall*)(std::uintptr_t, int)>(fn)(self, arg);
    } __except (EXCEPTION_EXECUTE_HANDLER) {
        return -0x7fffffff;
    }
}

struct Found {
    std::uintptr_t begin = 0;
    std::size_t    count = 0;
    std::int64_t   nameAt = -1;
    std::uintptr_t at(std::size_t i) const { return memory::readPtr(begin, i * 8); }
};

std::optional<Found> vectorAt(std::uintptr_t at) {
    std::uintptr_t const b = memory::readPtr(at), e = memory::readPtr(at, 8);
    if (b < 0x10000 || e <= b || (e - b) % 8 || (e - b) / 8 < 20 || (e - b) / 8 > 100) return std::nullopt;
    Found f{b, (e - b) / 8};
    for (std::size_t i = 0; i < 18; ++i)
        if (!memory::inImage(memory::readPtr(f.at(i)))) return std::nullopt;
    for (std::int64_t off = 16; off <= 0x100; off += 8)
        if (memory::readHashedString(f.at(0) + off) == "protection" && memory::readHashedString(f.at(9) + off) == "sharpness" &&
            memory::readHashedString(f.at(15) + off) == "efficiency" && memory::readHashedString(f.at(17) + off) == "unbreaking") {
            f.nameAt = off;
            return f;
        }
    return std::nullopt;
}

std::optional<Found> findEnchants() {
    auto const  base = memory::imageBase();
    auto const* dos  = reinterpret_cast<IMAGE_DOS_HEADER const*>(base);
    auto const* nt   = reinterpret_cast<IMAGE_NT_HEADERS const*>(base + dos->e_lfanew);
    auto const* sec  = IMAGE_FIRST_SECTION(nt);
    for (unsigned i = 0; i < nt->FileHeader.NumberOfSections; ++i, ++sec) {
        if (!(sec->Characteristics & IMAGE_SCN_MEM_WRITE) || (sec->Characteristics & IMAGE_SCN_MEM_EXECUTE)) continue;
        for (std::uintptr_t at = base + sec->VirtualAddress, end = at + sec->Misc.VirtualSize; at + 16 <= end; at += 8)
            if (auto f = vectorAt(at)) return f;
    }
    return std::nullopt;
}

}

Result exportEnchantments(std::string const& out) {
    Result result;
    auto   found = findEnchants();
    if (!found) {
        result.message = "no Enchant::mEnchants found";
        return result;
    }
    auto minCost  = [](std::uintptr_t e, int level) { return call1(memory::virtualAt(e, MinCostSlot), e, level); };
    auto maxCost  = [](std::uintptr_t e, int level) { return call1(memory::virtualAt(e, MaxCostSlot), e, level); };
    auto minLevel = [](std::uintptr_t e) { return call0(memory::virtualAt(e, MinLevelSlot), e); };
    auto maxLevel = [](std::uintptr_t e) { return call0(memory::virtualAt(e, MaxLevelSlot), e); };
    std::uintptr_t const protection = found->at(0), sharpness = found->at(9);
    if (maxLevel(protection) != 4 || maxLevel(sharpness) != 5 || minLevel(protection) != 1 || minCost(protection, 1) != 1 || minCost(protection, 4) != 34 ||
        maxCost(protection, 1) != 21 || maxCost(protection, 4) != 54 || memory::read<std::int32_t>(protection, FrequencyAt) != 30) {
        result.message = "the Enchant layout does not give protection's known values";
        return result;
    }
    std::int64_t descriptionAt = -1;
    for (std::int64_t off = 16; off <= 0x100 && descriptionAt < 0; off += 8)
        if (memory::readString(protection + off) == "enchantment.protect.all") descriptionAt = off;

    std::string json = "[";
    for (std::size_t i = 0; i < found->count; ++i) {
        std::uintptr_t e = found->at(i);
        if (memory::read<std::uint8_t>(e, TypeAt) != i) {
            result.message = std::format("enchant {} has type {}", i, memory::read<std::uint8_t>(e, TypeAt));
            return result;
        }
        int const   lo = minLevel(e), hi = maxLevel(e);
        std::string mins, maxs;
        // costs from level 1 to the max level, and at least 2 levels: a cost is a line in the level
        for (int level = 1; level <= std::max(hi, 2); ++level) {
            mins += std::format("{}{}", level > 1 ? ", " : "", minCost(e, level));
            maxs += std::format("{}{}", level > 1 ? ", " : "", maxCost(e, level));
        }
        json += std::format(
            "{}\n  {{\n    \"id\": {},\n    \"name\": \"{}\",\n    \"descriptionId\": \"{}\",\n    \"frequency\": {},\n    \"tradeable\": {},\n"
            "    \"primarySlots\": {},\n    \"secondarySlots\": {},\n    \"compatibility\": {},\n    \"minLevel\": {},\n    \"maxLevel\": {},\n"
            "    \"minCost\": [{}],\n    \"maxCost\": [{}]\n  }}",
            i ? "," : "", i, memory::readHashedString(e + found->nameAt), descriptionAt < 0 ? std::string() : memory::readString(e + descriptionAt),
            memory::read<std::int32_t>(e, FrequencyAt), memory::read<std::uint8_t>(e, TradeableAt) ? "true" : "false",
            memory::read<std::uint32_t>(e, PrimaryAt), memory::read<std::uint32_t>(e, SecondaryAt), memory::read<std::int32_t>(e, CompatibilityAt), lo, hi, mins,
            maxs);
    }
    json += "\n]\n";
    if (!nbt::writeFile(out + "\\enchantments.json", std::vector<std::uint8_t>(json.begin(), json.end()))) {
        result.message = "could not write enchantments.json";
        return result;
    }
    log::info("enchantments: {} (vector at 0x{:X}), name at +{}, description at +{}", found->count, found->begin, found->nameAt, descriptionAt);
    result.ok      = true;
    result.message = std::format("{} enchantments", found->count);
    return result;
}

}
