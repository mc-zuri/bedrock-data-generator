#pragma once

#include <cstdint>
#include <optional>
#include <string_view>
#include <vector>

namespace bdg::memory {

// Where the code is: the live server image (the agent), or a server exe read from disk (bdg_check).
// Pattern::find returns addresses in [textBegin, textEnd); rva() maps them back to image offsets.
// x64 code addresses its data and callees rip-relative, so .text is the same bytes on disk and in
// memory apart from 64-bit absolute immediates, which patterns wildcard.
struct Module {
    std::uintptr_t textBegin = 0, textEnd = 0;
    std::uint32_t  textRva = 0;

    static Module const& game();

    [[nodiscard]] std::uint32_t rva(std::uintptr_t address) const { return textRva + static_cast<std::uint32_t>(address - textBegin); }
};

// IDA syntax: "48 8B 05 ? ? ? ? 48 33 C4"
class Pattern {
public:
    static std::optional<Pattern> parse(std::string_view text);

    [[nodiscard]] std::vector<std::uintptr_t> find(std::uintptr_t begin, std::uintptr_t end, std::size_t limit = 2) const;

    [[nodiscard]] std::size_t size() const { return mBytes.size(); }

private:
    std::vector<std::uint8_t> mBytes;
    std::vector<bool>         mWild;
};

}
