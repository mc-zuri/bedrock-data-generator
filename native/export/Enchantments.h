#pragma once

#include "export/Blocks.h"

#include <string>

namespace bdg::exporter {

// Writes <out>/enchantments.json: every enchantment by type (its id), its string id, description id,
// frequency, tradeable flag, slot bits, compatibility group, level range and costs. Found by content (see
// Enchantments.cpp).
Result exportEnchantments(std::string const& out);

}
