// Injected into a running bedrock_server.exe (after "Server started") by bdg_inject.exe.
// Env, set by `pnpm blocks` on the server process:
//   BDG_VERSION  the exact server build (e.g. 1.21.42.1): selects the bindings steps
//   BDG_OUT      directory for block_palette.nbt, block-state-shapes.nbt, block_types.json, item_types.json,
//                item_aliases.json, effects.json, enchantments.json, biome_ids.json, agent.log and result.txt
// result.txt is written last, once: "ok <n> states, <m> items" or "FAILED: <why>". The server is left running;
// the caller terminates it.
#include <windows.h>

#include <MinHook.h>

#include "bindings/Bindings.h"
#include "bindings/Names.h"
#include "core/Log.h"
#include "export/Biomes.h"
#include "export/Blocks.h"
#include "export/Effects.h"
#include "export/Enchantments.h"
#include "export/Items.h"
#include "game/Game.h"
#include "memory/Scanner.h"

#include <atomic>
#include <cstdio>
#include <cstdlib>
#include <string>

namespace {

namespace n = bdg::bindings::names;

std::string       gOut;
std::atomic<bool> gDone{false};
using TickFn = void(__fastcall*)(void*);
TickFn gTick = nullptr;

std::string env(char const* name) {
    char const* v = std::getenv(name);
    return v ? v : "";
}

void finish(std::string const& result) {
    if (gDone.exchange(true)) return;
    bdg::log::info("result: {}", result);
    std::string path = gOut + "\\result.txt", tmp = path + ".tmp";
    FILE*       f    = nullptr;
    if (fopen_s(&f, tmp.c_str(), "wb") == 0 && f) {
        std::fputs(result.c_str(), f);
        std::fclose(f);
        MoveFileExA(tmp.c_str(), path.c_str(), MOVEFILE_REPLACE_EXISTING);
    }
}

// ---- one attempt, on the tick, with the tick thread waiting for it ----------------------------------
// The export reads the world through the overworld BlockSource, so the game must not tick meanwhile:
// the hooked tick blocks until the attempt returns (or abandons it at the deadline).
enum class Attempt { NotYet, Done };

struct Job {
    std::uintptr_t self;
    Attempt        outcome = Attempt::NotYet;
};

Attempt attempt(std::uintptr_t self) {
    std::uintptr_t level = bdg::game::resolveLevel(self);
    if (!level) return Attempt::NotYet;
    std::uintptr_t region = bdg::game::overworldBlockSource(level);
    if (!region) return Attempt::NotYet;
    bdg::log::info("level 0x{:X}, overworld BlockSource 0x{:X}", level, region);
    auto result = bdg::exporter::exportBlocks(level, region, gOut);
    if (result.ok) {
        auto items = bdg::exporter::exportItems(level, gOut);
        if (!items.ok) result = {false, 0, "items: " + items.message};
        else result.message += ", " + items.message;
    }
    if (result.ok) {
        auto effects = bdg::exporter::exportEffects(gOut);
        if (!effects.ok) result = {false, 0, "effects: " + effects.message};
        else result.message += ", " + effects.message;
    }
    if (result.ok) {
        auto enchantments = bdg::exporter::exportEnchantments(gOut);
        if (!enchantments.ok) result = {false, 0, "enchantments: " + enchantments.message};
        else result.message += ", " + enchantments.message;
    }
    // the biome ids are a check (mcdata's come from PyMCTranslate): a build whose registry is not found by
    // content (1.19.80 - 1.21.50 keep it where the search does not reach) has none
    if (result.ok) {
        auto biomes = bdg::exporter::exportBiomes(level, gOut);
        result.message += ", " + (biomes.ok ? biomes.message : "no biome ids (" + biomes.message + ")");
    }
    finish(result.ok ? result.message : "FAILED: " + result.message);
    return Attempt::Done;
}

void faulted() { finish("FAILED: the export faulted"); }

// no C++ objects in a function with __try
DWORD WINAPI jobThread(LPVOID p) {
    auto* job = static_cast<Job*>(p);
    __try {
        job->outcome = attempt(job->self);
    } __except (EXCEPTION_EXECUTE_HANDLER) {
        faulted();
        job->outcome = Attempt::Done;
    }
    return 0;
}

constexpr int   TryEveryTicks = 10;   // ~0.5 s at 20 tps
constexpr int   MaxAttempts   = 60;   // ~30 s of ticks before giving up on finding the overworld
constexpr DWORD DeadlineMs    = 180000;

void __fastcall hookedTick(void* self) {
    gTick(self);
    if (gDone.load()) return;
    static int ticks = 0, attempts = 0;
    if (ticks++ % TryEveryTicks) return;
    if (++attempts > MaxAttempts) {
        finish("FAILED: no Level with an overworld BlockSource on the tick");
        return;
    }
    auto*  job = new Job{reinterpret_cast<std::uintptr_t>(self)};
    HANDLE t   = CreateThread(nullptr, 0, jobThread, job, 0, nullptr);
    if (!t) {
        delete job;
        finish("FAILED: CreateThread");
        return;
    }
    DWORD w = WaitForSingleObject(t, DeadlineMs);
    CloseHandle(t);
    if (w != WAIT_OBJECT_0) {
        finish("FAILED: the export did not finish in time");  // the thread is abandoned, not freed
        return;
    }
    delete job;
}

DWORD WINAPI worker(LPVOID) {
    gOut                = env("BDG_OUT");
    std::string version = env("BDG_VERSION");
    if (gOut.empty() || version.empty()) return 1;
    bdg::log::open(gOut + "\\agent.log");
    bdg::log::info("bdg agent: {}", version);

    auto& r = bdg::bindings::load(bdg::Version::parse(version));
    // before hooking: the hook rewrites the very bytes the Level::tick pattern matches
    auto failed = r.resolve(bdg::memory::Module::game());
    for (auto const& [name, value] : r.describe()) bdg::log::info("  {} = {}", name, value);
    if (!failed.empty()) {
        std::string list;
        for (auto const& f : failed) list += (list.empty() ? "" : ", ") + f;
        finish("FAILED: unresolved bindings: " + list);
        return 1;
    }
    std::uintptr_t tick = r.address(n::LevelTick);
    if (!tick) {
        finish("FAILED: no Level::tick binding");
        return 1;
    }
    if (MH_Initialize() != MH_OK || MH_CreateHook(reinterpret_cast<LPVOID>(tick), reinterpret_cast<LPVOID>(&hookedTick), reinterpret_cast<LPVOID*>(&gTick)) != MH_OK ||
        MH_EnableHook(reinterpret_cast<LPVOID>(tick)) != MH_OK) {
        finish("FAILED: could not hook Level::tick");
        return 1;
    }
    bdg::log::info("hooked Level::tick at 0x{:X}", r.rvaOf(n::LevelTick));
    return 0;
}

}

BOOL APIENTRY DllMain(HMODULE module, DWORD reason, LPVOID) {
    if (reason == DLL_PROCESS_ATTACH) {
        DisableThreadLibraryCalls(module);
        if (HANDLE t = CreateThread(nullptr, 0, worker, nullptr, 0, nullptr)) CloseHandle(t);
    }
    return TRUE;
}
