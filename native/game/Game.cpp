#include "game/Game.h"

#include "bindings/Bindings.h"
#include "bindings/Names.h"
#include "core/Log.h"
#include "memory/Mem.h"

#include <windows.h>

#include <format>

namespace bdg::game {

namespace n = bindings::names;
using memory::inImage;
using memory::readPtr;
using memory::virtualAt;

namespace {

bindings::Registry const& r() { return bindings::current(); }

// ---- Level -----------------------------------------------------------------------------------

// A Level's vtable is in the image. When getDimension is bound, the vtable must also hold it at its slot.
bool looksLikeLevel(std::uintptr_t obj) {
    if (obj <= 0x10000) return false;
    std::uintptr_t vt = readPtr(obj);
    if (!inImage(vt)) return false;
    std::uintptr_t want = r().address(n::LevelGetDimension);
    int            slot = r().slot(n::LevelGetDimensionSlot);
    return want && slot >= 0 ? readPtr(vt, slot * 8) == want : true;
}

// ---- Dimension -> BlockSource -------------------------------------------------------------------

std::uintptr_t validDimension(std::uintptr_t dim) { return dim > 0x10000 && !inImage(dim) && inImage(readPtr(dim)) ? dim : 0; }

// A real BlockSource: a heap object other than the Dimension and Level, whose vtable is in the image,
// differs from theirs (the Dimension holds a back-pointer to its Level), and is densely populated.
// A BlockSource keeps references to its Level and Dimension among its first members (mLevel, mChunkSource,
// mDimension); an object that only has a vtable (a brightness ramp, a weather) does not.
bool looksLikeBlockSource(std::uintptr_t bs, std::uintptr_t dim, std::uintptr_t level) {
    if (bs <= 0x10000 || inImage(bs) || bs == dim || bs == level) return false;
    if (!inImage(readPtr(bs))) return false;
    bool hasDim = false, hasLevel = !level;
    for (std::int64_t off = 8; off < 0x80; off += 8) {
        std::uintptr_t v = readPtr(bs, off);
        hasDim |= v == dim;
        hasLevel |= v == level;
    }
    return hasDim && hasLevel;
}

std::uintptr_t callNoArgs(std::uintptr_t fn, std::uintptr_t self) {
    std::uintptr_t out = 0;
    __try {
        out = reinterpret_cast<std::uintptr_t(__fastcall*)(std::uintptr_t)>(fn)(self);
    } __except (EXCEPTION_EXECUTE_HANDLER) {
        out = 0;
    }
    return out;
}

std::uintptr_t blockSourceOf(std::uintptr_t dim, std::uintptr_t level) {
    if (std::uintptr_t fn = virtualAt(dim, r().slot(n::DimensionGetBlockSource))) {
        std::uintptr_t bs = callNoArgs(fn, dim);
        if (looksLikeBlockSource(bs, dim, level)) {
            for (std::int64_t off = 0; off <= 0x200; off += 8)
                if (readPtr(dim, off) == bs) log::info("overworld BlockSource from the getter slot: Dimension+0x{:X}", off);
            return bs;
        }
    }
    // then a bound member offset (builds where the scan below finds a lookalike first)
    if (std::int64_t off = r().offset(n::DimensionBlockSource); off >= 0) {
        std::uintptr_t bs = readPtr(dim, off);
        if (looksLikeBlockSource(bs, dim, level)) {
            log::info("overworld BlockSource at Dimension::mBlockSource (+0x{:X})", off);
            return bs;
        }
        log::info("Dimension::mBlockSource (+0x{:X}) is not a BlockSource: vtable rva 0x{:X}", off, bs > 0x10000 ? readPtr(bs) - reinterpret_cast<std::uintptr_t>(GetModuleHandleW(nullptr)) : 0);
    }
    // then the first BlockSource-like member
    for (std::int64_t off = 0x80; off <= 0x200; off += 8) {
        std::uintptr_t bs = readPtr(dim, off);
        if (looksLikeBlockSource(bs, dim, level)) {
            log::info("overworld BlockSource at Dimension+0x{:X}: vtable rva 0x{:X}", off, readPtr(bs) - reinterpret_cast<std::uintptr_t>(GetModuleHandleW(nullptr)));
            return bs;
        }
    }
    return 0;
}

// DimensionByPointer: Dimension* f(Level*, DimensionType) in rax.
// DimensionByWeakRef: WeakRef<Dimension> f(Level*, DimensionType) by value: rcx=this, rdx=&ret, r8=dim;
// the weak_ptr's first qword is the Dimension*.
std::uintptr_t callDimensionGetter(std::uintptr_t fn, std::uintptr_t level, int dimId) {
    if (!fn) return 0;
    std::uintptr_t dim = 0;
    __try {
        if (r().variant(n::DimensionKind) == n::DimensionByWeakRef) {
            std::uintptr_t ref[2] = {0, 0};
            reinterpret_cast<void*(__fastcall*)(std::uintptr_t, std::uintptr_t*, int)>(fn)(level, ref, dimId);
            dim = ref[0];
        } else {
            dim = reinterpret_cast<std::uintptr_t(__fastcall*)(std::uintptr_t, int)>(fn)(level, dimId);
        }
    } __except (EXCEPTION_EXECUTE_HANDLER) {
        dim = 0;
    }
    return validDimension(dim);
}

// ---- block type map ------------------------------------------------------------------------------
// MSVC std::map node: _Left @0, _Parent @8, _Right @0x10, key @0x20, then the mapped value: @0x50 after a
// HashedString key (48 bytes), @0x40 after the std::string key of older builds. Clang-built servers use
// MSVC's STL too.
constexpr std::int64_t NodeLeft = 0x0, NodeParent = 0x8, NodeRight = 0x10, NodeKey = 0x20;

bool hashedKeys() { return r().variant(n::BlockMapKey, n::MapKeyHashedString) == n::MapKeyHashedString; }

bool mapReady(std::uintptr_t map) {
    if (map < 0x10000) return false;
    std::uintptr_t head = readPtr(map);
    if (!head) return false;
    std::uintptr_t root = readPtr(head, NodeParent);
    std::uint64_t  size = readPtr(map, 8);
    return root && root != head && size > 400 && size < 3000;
}

// Stronger than mapReady: the map really holds block types (air, and mostly "minecraft:" names).
bool isBlockMap(std::uintptr_t map) {
    if (!mapReady(map)) return false;
    bool air   = false;
    int  total = 0, vanilla = 0;
    forEachBlockType(map, [&](std::string const& name, std::uintptr_t) {
        ++total;
        if (name == "minecraft:air") air = true;
        if (name.rfind("minecraft:", 0) == 0) ++vanilla;
    });
    return air && total > 400 && vanilla * 5 >= total * 4;
}

std::uintptr_t mapViaMember(std::uintptr_t level) {
    std::int64_t off = r().offset(n::LevelBlockTypeRegistry);
    if (off < 0) return 0;
    std::uintptr_t p = readPtr(level, off);
    if (p < 0x10000) return 0;
    // the member is the registry itself or a NonOwnerPtr control block pointing at it; the map is at +0
    for (std::uintptr_t reg : {p, readPtr(p)})
        if (isBlockMap(reg)) return reg;
    return 0;
}

// Level::getBlockTypeRegistry returns a 24-byte NotNullNonOwnerPtr<BlockTypeRegistry>. MSVC servers
// return it through a hidden buffer (rcx=this, rdx=&ret), registry at [2]; clang-built servers return
// the pointer in rax. The wrong convention corrupts the stack past SEH, so it is a binding, not a probe.
std::uintptr_t mapViaGetter(std::uintptr_t level) {
    std::uintptr_t fn = virtualAt(level, r().slot(n::LevelGetBlockTypeRegistry));
    if (!fn) return 0;
    alignas(16) std::uintptr_t out[4] = {0, 0, 0, 0};
    __try {
        if (r().variant(n::RegistryGetterKind) == n::RegistryInRax) {
            out[2] = reinterpret_cast<std::uintptr_t(__fastcall*)(std::uintptr_t)>(fn)(level);
        } else {
            reinterpret_cast<void*(__fastcall*)(std::uintptr_t, std::uintptr_t*)>(fn)(level, out);
        }
    } __except (EXCEPTION_EXECUTE_HANDLER) {
        return 0;
    }
    for (std::uintptr_t reg : {out[2], out[0], out[1], out[3]})
        if (reg >= 0x10000 && isBlockMap(reg)) return reg;
    return 0;
}

// why a candidate map was rejected, for the log
void describeMap(char const* route, std::uintptr_t map) {
    std::uintptr_t head = readPtr(map);
    std::uintptr_t root = readPtr(head, NodeParent);
    log::info("{}: map 0x{:X} rejected: head 0x{:X} root 0x{:X} size {}", route, map, head, root, readPtr(map, 8));
    if (!root || root == head) return;
    std::uintptr_t node = root;
    for (int i = 0; i < 3 && node && node != head; ++i, node = readPtr(node, NodeLeft)) {
        std::string raw;
        for (int b = 0; b < 0x60; b += 8) raw += std::format("{:016X} ", readPtr(node, 0x20 + b));
        log::info("  node 0x{:X}: +0x20.. {} | string '{}' | hashed '{}'", node, raw, memory::readString(node + NodeKey), memory::readHashedString(node + NodeKey));
    }
}

std::uintptr_t mapViaStatic() {
    std::uintptr_t map = r().address(n::BlockLookupMap);
    if (!map) return 0;
    if (isBlockMap(map)) return map;
    describeMap("static map", map);
    return 0;
}

}

std::uintptr_t resolveLevel(std::uintptr_t self) {
    if (looksLikeLevel(self)) return self;
    if (r().has(n::LevelGetDimension)) {
        for (std::int64_t off = 0; off <= 0x80; off += 8) {
            std::uintptr_t cand = readPtr(self, off);
            if (cand > 0x10000 && !inImage(cand) && looksLikeLevel(cand)) return cand;
        }
    }
    // The bound getDimension slot is the ILevel subobject's; a more-derived vtable at +0 may hold it
    // elsewhere. Any in-image vtable is accepted here: the dimension -> BlockSource chain validates later.
    return inImage(readPtr(self)) ? self : 0;
}

std::uintptr_t overworldBlockSource(std::uintptr_t level) {
    if (level < 0x10000) return 0;
    std::uintptr_t first = 0;
    auto           take  = [&](std::uintptr_t dim) -> std::uintptr_t {
        if (!dim) return 0;
        if (std::uintptr_t bs = blockSourceOf(dim, level)) return bs;
        if (!first) first = dim;
        return 0;
    };
    // the creators first, so the overworld is created rather than waited for
    bool const  weakRef = r().variant(n::DimensionKind) == n::DimensionByWeakRef;
    char const* keys[]  = {weakRef ? n::LevelGetOrCreateDimension : n::LevelCreateDimension, n::LevelGetDimension};
    for (char const* key : keys)
        if (std::uintptr_t bs = take(callDimensionGetter(r().address(key), level, 0))) return bs;
    // then the vtable around the bound getDimension slot, in the extractor's order (mc/Level.cpp): the slot
    // before it first, which on every build with a PDB is the creator (createDimension, getOrCreateDimension
    // from 1.19.50), so the overworld is created if it does not exist yet
    int gd = r().slot(n::LevelGetDimensionSlot);
    if (gd < 1) return 0;
    for (int s : {gd - 1, gd, gd - 2, gd + 1, gd - 3, gd + 2, gd + 3, gd - 4}) {
        if (s < 1) continue;
        if (std::uintptr_t bs = take(callDimensionGetter(virtualAt(level, s), level, 0))) {
            log::info("overworld Dimension from Level vtable slot {}", s);
            return bs;
        }
    }
    return 0;
}

std::uintptr_t blockTypeMap(std::uintptr_t level) {
    if (level >= 0x10000) {
        if (std::uintptr_t m = mapViaMember(level)) return m;
        if (std::uintptr_t m = mapViaGetter(level)) return m;
    }
    return mapViaStatic();
}

int forEachBlockType(std::uintptr_t map, std::function<void(std::string const&, std::uintptr_t)> const& visit) {
    std::uintptr_t head = readPtr(map);
    std::uintptr_t node = readPtr(head, NodeParent);
    if (!node || node == head) return 0;
    std::uintptr_t stack[256];
    int            sp = 0, visited = 0;
    // a broken tree must not hang the tick thread
    for (int guard = 0; guard < 100000; ++guard) {
        while (node && node != head && sp < 256) {
            stack[sp++] = node;
            node        = readPtr(node, NodeLeft);
        }
        if (sp == 0) break;
        node             = stack[--sp];
        bool const  hashed = hashedKeys();
        std::string name   = hashed ? memory::readHashedString(node + NodeKey) : memory::readString(node + NodeKey);
        // the std::string-keyed map of older builds holds bare names ("gravel")
        if (!name.empty() && name.find(':') == std::string::npos) name = "minecraft:" + name;
        // The mapped value is usually an owner whose first qword is the heap BlockType; 1.26.50 stores the
        // BlockType* itself, whose first qword is then its vtable, in the image.
        std::uintptr_t owner = readPtr(node, hashed ? 0x50 : 0x40);
        std::uintptr_t bt    = owner ? readPtr(owner) : 0;
        if (bt && inImage(bt)) bt = owner;
        if (bt && !name.empty()) {
            visit(name, bt);
            ++visited;
        }
        node = readPtr(node, NodeRight);
    }
    return visited;
}

std::vector<std::uintptr_t> permutations(std::uintptr_t blockType) {
    std::vector<std::uintptr_t> out;
    std::int64_t                off = r().offset(n::BlockTypePermutations);
    if (off < 0) return out;
    std::uintptr_t begin = readPtr(blockType, off), end = readPtr(blockType, off + 8);
    if (!begin || end <= begin || (end - begin) / 8 > 65536) return out;
    for (std::uintptr_t at = begin; at < end; at += 8)
        if (std::uintptr_t blk = readPtr(at)) out.push_back(blk);
    return out;
}

}
