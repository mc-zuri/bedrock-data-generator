#pragma once

#include "export/Blocks.h"

#include <string>

namespace bdg::exporter {

// Writes <out>/effects.json: every mob effect by id, its description id, resource name (where the build has
// one) and whether it is harmful. Found by content (see Effects.cpp).
Result exportEffects(std::string const& out);

}
