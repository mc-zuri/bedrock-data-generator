#pragma once
// The few live game objects the block export walks, reached only through bindings (no scanning
// beyond small fixed windows, every candidate validated before use). All functions are SEH-safe:
// a wrong offset or slot yields 0, never a crash.

#include <cstdint>
#include <functional>
#include <string>
#include <vector>

namespace bdg::game {

// The real Level behind a Level::tick `this`. On some builds `this` is a holder object with the Level
// among its first members; this finds it structurally, without calling anything. 0 when none fits.
std::uintptr_t resolveLevel(std::uintptr_t tickSelf);

// Level -> overworld Dimension -> its main BlockSource: the region the shape getters read.
// Only a route whose whole chain validates is accepted. 0 on failure.
std::uintptr_t overworldBlockSource(std::uintptr_t level);

// The populated std::map<HashedString, BlockType owner> of every block type, by the first route this
// build's bindings support: Level member, Level getter, then the static map. 0 on failure.
std::uintptr_t blockTypeMap(std::uintptr_t level);

// In-order walk of that map (the order runtime block ids are assigned in). Returns the types visited.
int forEachBlockType(std::uintptr_t map, std::function<void(std::string const& name, std::uintptr_t blockType)> const& visit);

// A block type's states (Block*), in permutation order.
std::vector<std::uintptr_t> permutations(std::uintptr_t blockType);

}
