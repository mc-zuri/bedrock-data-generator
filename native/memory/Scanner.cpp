#include "memory/Scanner.h"

#include <windows.h>

#include <cstring>

namespace bdg::memory {

Module const& Module::game() {
    static Module const m = [] {
        Module out;
        auto   base = reinterpret_cast<std::uintptr_t>(GetModuleHandleW(nullptr));
        auto   dos  = reinterpret_cast<IMAGE_DOS_HEADER const*>(base);
        auto   nt   = reinterpret_cast<IMAGE_NT_HEADERS64 const*>(base + dos->e_lfanew);
        auto   sect = IMAGE_FIRST_SECTION(nt);
        for (unsigned i = 0; i < nt->FileHeader.NumberOfSections; ++i, ++sect) {
            if (std::memcmp(sect->Name, ".text", 5) == 0) {
                out.textRva   = sect->VirtualAddress;
                out.textBegin = base + sect->VirtualAddress;
                out.textEnd   = out.textBegin + sect->Misc.VirtualSize;
            }
        }
        return out;
    }();
    return m;
}

std::optional<Pattern> Pattern::parse(std::string_view text) {
    Pattern     p;
    std::size_t i = 0;
    while (i < text.size()) {
        if (text[i] == ' ') {
            ++i;
            continue;
        }
        if (text[i] == '?') {
            p.mBytes.push_back(0);
            p.mWild.push_back(true);
            while (i < text.size() && text[i] == '?') ++i;
            continue;
        }
        if (i + 1 >= text.size()) return std::nullopt;
        auto hex = [](char c) -> int {
            if (c >= '0' && c <= '9') return c - '0';
            if (c >= 'a' && c <= 'f') return c - 'a' + 10;
            if (c >= 'A' && c <= 'F') return c - 'A' + 10;
            return -1;
        };
        int hi = hex(text[i]), lo = hex(text[i + 1]);
        if (hi < 0 || lo < 0) return std::nullopt;
        p.mBytes.push_back(static_cast<std::uint8_t>(hi << 4 | lo));
        p.mWild.push_back(false);
        i += 2;
    }
    if (p.mBytes.empty() || p.mWild.front()) return std::nullopt;
    return p;
}

std::vector<std::uintptr_t> Pattern::find(std::uintptr_t begin, std::uintptr_t end, std::size_t limit) const {
    std::vector<std::uintptr_t> out;
    auto const*                 data = reinterpret_cast<std::uint8_t const*>(begin);
    std::size_t const           n = end - begin, m = mBytes.size();
    if (m == 0 || n < m) return out;
    std::uint8_t const first = mBytes[0];
    for (std::size_t i = 0; i + m <= n; ++i) {
        auto const* hit = static_cast<std::uint8_t const*>(std::memchr(data + i, first, n - m - i + 1));
        if (!hit) break;
        i             = static_cast<std::size_t>(hit - data);
        std::size_t k = 1;
        while (k < m && (mWild[k] || data[i + k] == mBytes[k])) ++k;
        if (k == m) {
            out.push_back(begin + i);
            if (out.size() >= limit) break;
        }
    }
    return out;
}

}
