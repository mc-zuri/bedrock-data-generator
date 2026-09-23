#pragma once

#include <cstdint>
#include <string>

namespace bdg::exporter {

struct Result {
    bool        ok = false;
    int         states = 0;
    std::string message;  // "ok <n> states" or why it failed
};

// Writes <out>/block_palette.nbt and <out>/block-state-shapes.nbt from the live registry.
// `level` is the resolved Level, `region` the overworld BlockSource the shape getters read.
Result exportBlocks(std::uintptr_t level, std::uintptr_t region, std::string const& out);

}
