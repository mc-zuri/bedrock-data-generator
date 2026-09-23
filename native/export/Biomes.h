#pragma once

#include "export/Blocks.h"

#include <cstdint>
#include <string>

namespace bdg::exporter {

// Writes <out>/biome_ids.json: every registered biome's numeric id, by name. Found by content (see Biomes.cpp).
Result exportBiomes(std::uintptr_t level, std::string const& out);

}
