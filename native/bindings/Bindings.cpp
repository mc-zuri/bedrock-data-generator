#include "bindings/Bindings.h"

#include <windows.h>

#include <algorithm>
#include <cstring>
#include <format>

namespace bdg::bindings {

namespace {

std::vector<Step>& steps() {
    static std::vector<Step> s;
    return s;
}

Registry& registry() {
    static Registry r;
    return r;
}

}

void Registry::function(std::string_view name, std::string_view pattern, int rel32At) {
    mFunctions.insert_or_assign(std::string(name), Function{std::string(pattern), rel32At, 0, {}, currentStep, 0});
}

void Registry::rva(std::string_view name, std::uint32_t value) {
    mFunctions.insert_or_assign(std::string(name), Function{{}, -1, value, currentStepVersion, currentStep, 0});
}

void Registry::drop(std::string_view name) {
    if (auto it = mFunctions.find(name); it != mFunctions.end()) mFunctions.erase(it);
    if (auto it = mSlots.find(name); it != mSlots.end()) mSlots.erase(it);
    if (auto it = mOffsets.find(name); it != mOffsets.end()) mOffsets.erase(it);
    if (auto it = mVariants.find(name); it != mVariants.end()) mVariants.erase(it);
}

void Registry::slot(std::string_view name, int index) { mSlots.insert_or_assign(std::string(name), index); }

void Registry::offset(std::string_view name, std::int64_t value) { mOffsets.insert_or_assign(std::string(name), value); }

void Registry::variant(std::string_view name, int value) { mVariants.insert_or_assign(std::string(name), value); }

std::vector<std::string> Registry::resolve(memory::Module const& module) {
    std::vector<std::string> failed;
    for (auto& [name, fn] : mFunctions) {
        fn.resolved = 0;
        if (fn.pattern.empty()) {
            if (running.sameRelease(fn.pinnedTo)) fn.resolved = fn.pinned;
            else failed.push_back(std::format("{} (rva pinned to {} by step {})", name, fn.pinnedTo.str(), fn.step));
            continue;
        }
        auto pattern = memory::Pattern::parse(fn.pattern);
        if (!pattern || (fn.rel32At >= 0 && static_cast<std::size_t>(fn.rel32At) + 4 > pattern->size())) {
            failed.push_back(name + " (bad pattern)");
            continue;
        }
        auto hits = pattern->find(module.textBegin, module.textEnd, 2);
        if (hits.size() != 1) {
            failed.push_back(std::format("{} ({} matches, step {})", name, hits.size(), fn.step));
            continue;
        }
        std::uintptr_t at = hits[0];
        if (fn.rel32At < 0) {
            fn.resolved = module.rva(at);
        } else {
            std::int32_t disp = 0;
            std::memcpy(&disp, reinterpret_cast<void const*>(at + fn.rel32At), 4);
            fn.resolved = static_cast<std::uint32_t>(static_cast<std::int64_t>(module.rva(at)) + fn.rel32At + 4 + disp);
        }
    }
    return failed;
}

bool Registry::has(std::string_view name) const { return rvaOf(name) != 0; }

std::uint32_t Registry::rvaOf(std::string_view name) const {
    auto it = mFunctions.find(name);
    return it == mFunctions.end() ? 0 : it->second.resolved;
}

std::uintptr_t Registry::address(std::string_view name) const {
    std::uint32_t rva = rvaOf(name);
    return rva ? reinterpret_cast<std::uintptr_t>(GetModuleHandleW(nullptr)) + rva : 0;
}

int Registry::slot(std::string_view name) const {
    auto it = mSlots.find(name);
    return it == mSlots.end() ? -1 : it->second;
}

std::int64_t Registry::offset(std::string_view name, std::int64_t fallback) const {
    auto it = mOffsets.find(name);
    return it == mOffsets.end() ? fallback : it->second;
}

int Registry::variant(std::string_view name, int fallback) const {
    auto it = mVariants.find(name);
    return it == mVariants.end() ? fallback : it->second;
}

std::map<std::string, std::string> Registry::describe() const {
    std::map<std::string, std::string> out;
    for (auto const& [name, fn] : mFunctions)
        out[name] = fn.resolved ? std::format("0x{:X} (step {})", fn.resolved, fn.step) : std::format("unresolved (step {})", fn.step);
    for (auto const& [name, v] : mSlots) out[name] = std::format("slot {}", v);
    for (auto const& [name, v] : mOffsets) out[name] = std::format("0x{:X}", v);
    for (auto const& [name, v] : mVariants) out[name] = std::format("variant {}", v);
    return out;
}

int addStep(char const* since, StepFn fn) {
    steps().push_back({Version::parse(since), since, fn});
    return 0;
}

Registry& load(Version running) {
    auto ordered = steps();
    std::ranges::stable_sort(ordered, {}, &Step::since);
    Registry& r = registry();
    r.running   = running;
    for (auto const& step : ordered) {
        if (step.since > running) break;
        r.currentStep        = step.name;
        r.currentStepVersion = step.since;
        step.apply(r);
    }
    r.currentStep.clear();
    return r;
}

Registry& current() { return registry(); }

}
