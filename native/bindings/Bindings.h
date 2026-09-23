#pragma once
// Everything this agent needs to know about one server build: where its functions are, which vtable
// slots and member offsets it uses, and which calling-convention variants apply.
//
// bindings/Steps.cpp lists steps. Each step states only what changed since the previous one; load()
// applies them oldest-first up to the running build, so anything a step does not mention carries over.
// A new server build therefore needs a step only for what moved, and `bdg_check <exe> <version>`
// shows whether the inherited patterns still resolve on it without starting the server.

#include "core/Version.h"
#include "memory/Scanner.h"

#include <cstdint>
#include <map>
#include <string>
#include <string_view>
#include <vector>

namespace bdg::bindings {

class Registry {
public:
    // A function (or, with data(), a global) found by a byte pattern that must match exactly once in .text.
    // rel32At < 0: the match is the address itself. rel32At = n: bytes n..n+3 of the match hold a rel32 /
    // disp32 relative to the end of those 4 bytes (e.g. 1 for `E8 call`, 3 for `48 8D 0D lea`), and the
    // target is the address.
    void function(std::string_view name, std::string_view pattern, int rel32At = -1);
    void data(std::string_view name, std::string_view pattern, int rel32At) { function(name, pattern, rel32At); }
    // Last resort for a build no pattern covers: a fixed RVA. It binds only on builds of the same
    // major.minor.patch as the step that set it; on any later release it reports as unresolved.
    void rva(std::string_view name, std::uint32_t rva);
    void slot(std::string_view name, int index);
    void offset(std::string_view name, std::int64_t value);
    void variant(std::string_view name, int value);
    void drop(std::string_view name);

    // Resolves every function against `module`; returns the names that did not resolve to exactly one address.
    std::vector<std::string> resolve(memory::Module const& module);

    [[nodiscard]] bool          has(std::string_view name) const;           // a resolved function
    [[nodiscard]] std::uint32_t rvaOf(std::string_view name) const;          // 0 when unknown
    [[nodiscard]] std::uintptr_t address(std::string_view name) const;       // in the running server; 0 when unknown
    [[nodiscard]] int            slot(std::string_view name) const;          // -1 when unknown
    [[nodiscard]] std::int64_t   offset(std::string_view name, std::int64_t fallback = -1) const;
    [[nodiscard]] int            variant(std::string_view name, int fallback = 0) const;

    // name -> "0x1234 (step 1.21.50)", "slot 7", ... for logs and bdg_check
    [[nodiscard]] std::map<std::string, std::string> describe() const;

    Version running;
    Version currentStepVersion;
    std::string currentStep;

private:
    struct Function {
        std::string   pattern;          // empty for rva()
        int           rel32At = -1;
        std::uint32_t pinned  = 0;      // rva()
        Version       pinnedTo;
        std::string   step;
        std::uint32_t resolved = 0;
    };
    std::map<std::string, Function, std::less<>>     mFunctions;
    std::map<std::string, int, std::less<>>          mSlots;
    std::map<std::string, std::int64_t, std::less<>> mOffsets;
    std::map<std::string, int, std::less<>>          mVariants;
};

using StepFn = void (*)(Registry&);

struct Step {
    Version     since;
    char const* name;
    StepFn      apply;
};

int addStep(char const* since, StepFn fn);

// Applies every step up to `running`. Call once; the registry is read-only afterwards.
Registry& load(Version running);

Registry& current();

}

#define BDG_BINDINGS_CAT2(a, b) a##b
#define BDG_BINDINGS_CAT(a, b)  BDG_BINDINGS_CAT2(a, b)
#define BDG_BINDINGS(since)                                                                              \
    static void BDG_BINDINGS_CAT(bdgStep_, __LINE__)(::bdg::bindings::Registry & r);                    \
    [[maybe_unused]] static int const BDG_BINDINGS_CAT(bdgStepReg_, __LINE__) =                          \
        ::bdg::bindings::addStep(since, &BDG_BINDINGS_CAT(bdgStep_, __LINE__));                          \
    static void BDG_BINDINGS_CAT(bdgStep_, __LINE__)([[maybe_unused]] ::bdg::bindings::Registry & r)
