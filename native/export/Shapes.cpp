#include "export/Shapes.h"

#include "bindings/Bindings.h"
#include "bindings/Names.h"
#include "memory/Mem.h"

#include <windows.h>

#include <algorithm>
#include <cmath>

namespace bdg::shapes {

namespace n = bindings::names;

namespace {

struct BlockPos {
    int x = 0, y = 0, z = 0;
};

// The pre-1.19 AABB is `Vec3 min, max; bool mValid` (28 bytes): the game fills a vector of those.
struct AABB28 {
    float         c[6];
    std::uint32_t valid;
};

// Single-AABB getters write the whole AABB into the buffer: oversized, so a 28-byte one cannot overrun it.
struct Scratch {
    float         c[6];
    std::uint32_t pad[2];
};

// getVisualShape / getUIShape: AABB const& (this = BlockLegacy, Block const&, AABB& buffer [, bool])
using ShapeFn     = AABB const*(__fastcall*)(void const*, void const*, Scratch*);
using ShapeBoolFn = AABB const*(__fastcall*)(void const*, void const*, Scratch*, bool);
// addCollisionShapes / addAABBs: (this, Block const&, IConstBlockSource const&, BlockPos const&,
//   AABB const* intersectTestBox, std::vector<AABB>& out, optional_ref<GetCollisionShapeInterface const>)
using CollideFn = bool(__fastcall*)(void const*, void const*, void const*, void const*, void const*, void*, void const*);

// ---- one persistent worker thread, a deadline per call ------------------------------------------
HANDLE           gRequest = nullptr, gDone = nullptr, gThread = nullptr;
void (*volatile gJob)(void*) = nullptr;
void* volatile gArg          = nullptr;
constexpr int    MaxSlot     = 512;
int              gTimeouts[MaxSlot]{};
bool             gDead[MaxSlot]{};

DWORD WINAPI worker(LPVOID) {
    for (;;) {
        WaitForSingleObject(gRequest, INFINITE);
        auto job = gJob;
        if (!job) return 0;
        __try {
            job(gArg);
        } __except (EXCEPTION_EXECUTE_HANDLER) {
        }
        SetEvent(gDone);
    }
}

// false when the call hung, or its slot was disabled. A fault inside the job is the job's to report.
bool run(void (*job)(void*), void* arg, DWORD ms, int slot) {
    if (slot < 0 || slot >= MaxSlot || gDead[slot]) return false;
    if (!gThread) {
        gRequest = CreateEventW(nullptr, FALSE, FALSE, nullptr);
        gDone    = CreateEventW(nullptr, FALSE, FALSE, nullptr);
        gThread  = CreateThread(nullptr, 0, worker, nullptr, 0, nullptr);
        if (!gThread) return false;
    }
    gJob = job;
    gArg = arg;
    SetEvent(gRequest);
    if (WaitForSingleObject(gDone, ms) == WAIT_OBJECT_0) {
        gTimeouts[slot] = 0;
        return true;
    }
    // hung: abandon that worker (and its events) for good; the next call starts a fresh one
    CloseHandle(gThread);
    gThread = gRequest = gDone = nullptr;
    if (++gTimeouts[slot] >= 3) gDead[slot] = true;
    return false;
}

struct Call {
    std::uintptr_t fn, bt, blk, region;
    bool           flag;
    BlockPos       pos{};
    bool           ok = false;
    AABB           box{};
    int            count = 0;
    AABB           boxes[64]{};
};

void shapeJob(void* p) {
    auto*   c = static_cast<Call*>(p);
    Scratch s{};
    AABB const* r = c->flag ? reinterpret_cast<ShapeBoolFn>(c->fn)(reinterpret_cast<void*>(c->bt), reinterpret_cast<void*>(c->blk), &s, false)
                            : reinterpret_cast<ShapeFn>(c->fn)(reinterpret_cast<void*>(c->bt), reinterpret_cast<void*>(c->blk), &s);
    c->box = reinterpret_cast<std::uintptr_t>(r) > 0x10000 ? *r : AABB{s.c[0], s.c[1], s.c[2], s.c[3], s.c[4], s.c[5]};
    c->ok  = true;
}

template <class Box>
int copyOut(std::vector<Box> const& v, AABB* out) {
    int n = static_cast<int>(v.size() > 64 ? 64 : v.size());
    for (int i = 0; i < n; ++i) {
        float const* f = reinterpret_cast<float const*>(&v[i]);
        out[i]         = {f[0], f[1], f[2], f[3], f[4], f[5]};
    }
    return n;
}

// The game appends to our std::vector, so this DLL shares the game's CRT heap (/MD).
void collideJob(void* p) {
    auto*    c = static_cast<Call*>(p);
    BlockPos pos = c->pos;
    auto     fn  = reinterpret_cast<CollideFn>(c->fn);
    auto     bt = reinterpret_cast<void*>(c->bt), blk = reinterpret_cast<void*>(c->blk), region = reinterpret_cast<void*>(c->region);
    if (c->flag) {
        std::vector<AABB28> v;
        fn(bt, blk, region, &pos, nullptr, &v, nullptr);
        c->count = copyOut(v, c->boxes);
    } else {
        std::vector<AABB> v;
        fn(bt, blk, region, &pos, nullptr, &v, nullptr);
        c->count = copyOut(v, c->boxes);
    }
    c->ok = true;
}

std::optional<AABB> single(std::uintptr_t bt, std::uintptr_t blk, char const* slotName, bool withBool) {
    int            slot = bindings::current().slot(slotName);
    std::uintptr_t fn   = memory::virtualAt(bt, slot);
    if (!fn) return std::nullopt;
    Call c{fn, bt, blk, 0, withBool};
    if (!run(shapeJob, &c, 2000, slot) || !c.ok) return std::nullopt;
    return c.box;
}

// -1 when the call is unavailable, faulted or hung
int boxes(std::uintptr_t bt, std::uintptr_t blk, std::uintptr_t region, char const* slotName, std::vector<AABB>& out, BlockPos pos = {}) {
    int            slot = bindings::current().slot(slotName);
    std::uintptr_t fn   = memory::virtualAt(bt, slot);
    if (!fn || !region) return -1;
    Call c{fn, bt, blk, region, bindings::current().variant(n::AabbLayout) == n::Aabb28WithValid, pos};
    if (!run(collideJob, &c, 3000, slot) || !c.ok) return -1;
    out.assign(c.boxes, c.boxes + c.count);
    return c.count;
}

}

// What the game collides with: BlockSource::fetchCollisionShapes calls addCollisionShapes for every block
// an entity overlaps and keeps the boxes that intersect it. The boxes come back in world coordinates, so
// the call is made at the origin, where they are the block's own exact floats, and once more one chunk away.
// A box that stays at the same world place wherever the block is does not belong to the block: it sits at
// the world origin and collides with nothing near the block. The game makes such boxes when a
// getCollisionShape override answers false before 1.18.11 (addCollisionShapes then pushes its unit-cube
// default: buttons, fire, scaffolding, thin snow), or returns a box it never offsets by the position
// (pressure plates before 1.19.50, the end portal frame's eye).
std::optional<std::vector<AABB>> collision(std::uintptr_t bt, std::uintptr_t blk, std::uintptr_t region) {
    constexpr int     Away = 16;
    std::vector<AABB> here, away;
    if (boxes(bt, blk, region, n::BlockAddCollisionShapes, here) < 0 ||
        boxes(bt, blk, region, n::BlockAddCollisionShapes, away, {0, 0, Away}) < 0)
        return std::nullopt;
    auto same = [](AABB const& a, AABB const& b, float dz) {
        return a.minX == b.minX && a.minY == b.minY && a.maxX == b.maxX && a.maxY == b.maxY &&
               std::abs(a.minZ + dz - b.minZ) < 1e-4f && std::abs(a.maxZ + dz - b.maxZ) < 1e-4f;
    };
    std::vector<AABB> out;
    for (AABB const& b : here) {
        bool const stays = std::any_of(away.begin(), away.end(), [&](AABB const& a) { return same(b, a, 0); });
        bool const moves = std::any_of(away.begin(), away.end(), [&](AABB const& a) { return same(b, a, Away); });
        if (!stays || moves) out.push_back(b);
    }
    return out;
}

std::optional<AABB> visual(std::uintptr_t bt, std::uintptr_t blk) {
    return single(bt, blk, n::BlockGetVisualShape, bindings::current().variant(n::VisualShapeKind) == n::VisualShapeBlockBufferBool);
}

std::optional<AABB> ui(std::uintptr_t bt, std::uintptr_t blk) { return single(bt, blk, n::BlockGetUIShape, false); }

}
