#pragma once
// SEH-guarded reads for walking live game objects by offset. Nothing here throws or faults:
// a bad address yields 0 / an empty string.

#include <windows.h>

#include <cstdint>
#include <cstring>
#include <string>

namespace bdg::memory {

inline bool safeRead(void const* addr, void* out, std::size_t len) {
    __try {
        std::memcpy(out, addr, len);
        return true;
    } __except (EXCEPTION_EXECUTE_HANDLER) {
        return false;
    }
}

template <class T>
T read(std::uintptr_t base, std::int64_t off = 0) {
    T v{};
    if (base && off >= 0) safeRead(reinterpret_cast<void const*>(base + off), &v, sizeof(T));
    return v;
}

inline std::uintptr_t readPtr(std::uintptr_t base, std::int64_t off = 0) { return read<std::uintptr_t>(base, off); }

inline std::uintptr_t imageBase() {
    static std::uintptr_t const base = reinterpret_cast<std::uintptr_t>(GetModuleHandleW(nullptr));
    return base;
}

// inside the loaded server image: a vtable or code pointer, as opposed to heap data
inline bool inImage(std::uintptr_t p) { return p >= imageBase() && p < imageBase() + 0x10000000; }

// the function at `obj`'s vtable slot, 0 when anything along the way looks wrong
inline std::uintptr_t virtualAt(std::uintptr_t obj, std::int64_t slot) {
    if (obj < 0x10000 || slot < 0) return 0;
    std::uintptr_t vt = readPtr(obj);
    if (vt < 0x10000) return 0;
    std::uintptr_t fn = readPtr(vt, slot * 8);
    return fn < 0x10000 ? 0 : fn;
}

// MSVC std::string: { union { char buf[16]; char* ptr; }; size_t size; size_t capacity; }
inline std::string readString(std::uintptr_t at) {
    std::uint8_t raw[32]{};
    if (!safeRead(reinterpret_cast<void const*>(at), raw, sizeof raw)) return {};
    std::size_t size = 0, cap = 0;
    std::memcpy(&size, raw + 16, 8);
    std::memcpy(&cap, raw + 24, 8);
    if (size == 0 || size > 4096) return {};
    std::string    out(size, '\0');
    std::uintptr_t data = cap >= 16 ? readPtr(at) : at;
    if (data < 0x10000 || !safeRead(reinterpret_cast<void const*>(data), out.data(), size)) return {};
    return out;
}

// HashedString: { uint64 hash; std::string str; ... }
inline std::string readHashedString(std::uintptr_t at) { return readString(at + 8); }

}
