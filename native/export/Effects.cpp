#include "export/Effects.h"

#include "core/Log.h"
#include "export/Nbt.h"
#include "memory/Mem.h"

#include <windows.h>

#include <format>
#include <optional>
#include <vector>

// The mob effects, found and read by content: MobEffect::mMobEffects is a static array in the image's data,
// indexed by effect id, each a MobEffect whose mId (a u32 at +8) is its index. The longest such run (from
// id 1) is it. Speed (1) is good, slowness (2) and poison (19) are harmful, regeneration (10) is not: the one
// byte that says so is mIsHarmful. mDescriptionId is the string that reads "potion.moveSpeed" for speed; the
// resource name (from 1.16.100-ish builds on) the one that reads "speed".

namespace bdg::exporter {

namespace {

bool isEffect(std::uintptr_t e, std::uint32_t id) {
    return e >= 0x10000 && memory::inImage(memory::readPtr(e)) && memory::read<std::uint32_t>(e, 8) == id;
}

std::size_t run(std::uintptr_t array) {
    std::size_t n = 0;
    while (n < 120 && isEffect(memory::readPtr(array, (n + 1) * 8), static_cast<std::uint32_t>(n + 1))) ++n;
    return n;
}

std::optional<std::pair<std::uintptr_t, std::size_t>> findEffects() {
    auto const  base = memory::imageBase();
    auto const* dos  = reinterpret_cast<IMAGE_DOS_HEADER const*>(base);
    auto const* nt   = reinterpret_cast<IMAGE_NT_HEADERS const*>(base + dos->e_lfanew);
    auto const* sec  = IMAGE_FIRST_SECTION(nt);
    std::uintptr_t best = 0;
    std::size_t    bestRun = 0;
    for (unsigned i = 0; i < nt->FileHeader.NumberOfSections; ++i, ++sec) {
        if (!(sec->Characteristics & IMAGE_SCN_MEM_WRITE) || (sec->Characteristics & IMAGE_SCN_MEM_EXECUTE)) continue;
        for (std::uintptr_t at = base + sec->VirtualAddress, end = at + sec->Misc.VirtualSize; at + 16 <= end; at += 8)
            if (isEffect(memory::readPtr(at, 8), 1))
                if (std::size_t n = run(at); n > bestRun) { bestRun = n; best = at; }
    }
    if (bestRun < 20) return std::nullopt;
    return std::pair{best, bestRun};
}

}

Result exportEffects(std::string const& out) {
    Result result;
    auto   found = findEffects();
    if (!found) {
        result.message = "no MobEffect array found";
        return result;
    }
    auto [array, count] = *found;
    auto effect = [&](std::size_t id) { return memory::readPtr(array, id * 8); };

    std::vector<std::int64_t> harmful, description, resource;
    for (std::int64_t off = 9; off < 0x100; ++off)
        if (memory::read<std::uint8_t>(effect(1), off) == 0 && memory::read<std::uint8_t>(effect(2), off) == 1 &&
            memory::read<std::uint8_t>(effect(19), off) == 1 && memory::read<std::uint8_t>(effect(10), off) == 0 &&
            memory::read<std::uint8_t>(effect(7), off) == 1 && memory::read<std::uint8_t>(effect(5), off) == 0)
            harmful.push_back(off);
    for (std::int64_t off = 16; off < 0x200; off += 8) {
        if (memory::readString(effect(1) + off) == "potion.moveSpeed" && memory::readString(effect(2) + off) == "potion.moveSlowdown") description.push_back(off);
        if (memory::readString(effect(1) + off) == "speed" && memory::readString(effect(2) + off) == "slowness") resource.push_back(off);
    }
    if (harmful.size() != 1 || description.size() != 1 || resource.size() > 1) {
        result.message = std::format("{} harmful, {} description id, {} resource name offsets fit", harmful.size(), description.size(), resource.size());
        return result;
    }
    log::info("effects: {} at +0x{:X} (image), harmful at +{}, description id at +{}, resource name at {}", count, array - memory::imageBase(), harmful[0],
              description[0], resource.empty() ? std::string("none") : std::format("+{}", resource[0]));

    std::string json = "[";
    for (std::size_t id = 1; id <= count; ++id) {
        std::uintptr_t e = effect(id);
        json += std::format("{}\n  {{\n    \"id\": {},\n    \"descriptionId\": \"{}\",", id > 1 ? "," : "", id, memory::readString(e + description[0]));
        if (!resource.empty()) json += std::format("\n    \"name\": \"{}\",", memory::readString(e + resource[0]));
        json += std::format("\n    \"harmful\": {}\n  }}", memory::read<std::uint8_t>(e, harmful[0]) ? "true" : "false");
    }
    json += "\n]\n";
    if (!nbt::writeFile(out + "\\effects.json", std::vector<std::uint8_t>(json.begin(), json.end()))) {
        result.message = "could not write effects.json";
        return result;
    }
    result.ok      = true;
    result.message = std::format("{} effects", count);
    return result;
}

}
