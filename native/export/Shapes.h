#pragma once
// Block shapes, by calling the live BlockLegacy virtuals (they are computed, not fields). Every call
// runs on a worker thread with a deadline: a slot that hangs three times is disabled for the rest of
// the export instead of wedging it.

#include <cstdint>
#include <optional>
#include <vector>

namespace bdg::shapes {

struct AABB {
    float minX, minY, minZ, maxX, maxY, maxZ;
};

// The boxes the game collides with (addCollisionShapes), without the ones it leaves at the world origin
// whatever the block's position (Shapes.cpp). nullopt when the call faults or hangs.
std::optional<std::vector<AABB>> collision(std::uintptr_t blockType, std::uintptr_t block, std::uintptr_t region);
std::optional<AABB>              visual(std::uintptr_t blockType, std::uintptr_t block);
std::optional<AABB>              ui(std::uintptr_t blockType, std::uintptr_t block);

}
