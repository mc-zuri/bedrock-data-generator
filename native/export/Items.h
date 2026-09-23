#pragma once

#include "export/Blocks.h"

#include <cstdint>
#include <string>

namespace bdg::exporter {

// Writes <out>/item_types.json: every registered item's max stack size, max damage and description id,
// by name. `level` is the resolved Level; the registry is found from it by content (see Items.cpp).
Result exportItems(std::uintptr_t level, std::string const& out);

}
