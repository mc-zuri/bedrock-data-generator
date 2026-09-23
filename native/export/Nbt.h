#pragma once

#include "export/Shapes.h"

#include <cstdint>
#include <cstring>
#include <optional>
#include <string>
#include <vector>

namespace bdg::nbt {

enum Tag : std::uint8_t { End = 0, Byte = 1, Short = 2, Int = 3, Long = 4, Float = 5, Double = 6, String = 8, List = 9, Compound = 10 };

// Growable NBT byte buffer in either byte order (Java/palette: big; Bedrock/shapes: little).
struct Buffer {
    explicit Buffer(bool littleEndian) : little(littleEndian) {}

    bool                      little;
    std::vector<std::uint8_t> data;

    void u8(std::uint8_t v) { data.push_back(v); }
    void raw(void const* p, std::size_t n) {
        auto const* b = static_cast<std::uint8_t const*>(p);
        data.insert(data.end(), b, b + n);
    }
    void ordered(std::uint64_t v, int bytes) {
        for (int i = 0; i < bytes; ++i) data.push_back(static_cast<std::uint8_t>(v >> (8 * (little ? i : bytes - 1 - i))));
    }
    void i16(std::int16_t v) { ordered(static_cast<std::uint16_t>(v), 2); }
    void i32(std::int32_t v) { ordered(static_cast<std::uint32_t>(v), 4); }
    void i64(std::int64_t v) { ordered(static_cast<std::uint64_t>(v), 8); }
    void f32(float v) {
        std::uint32_t b;
        std::memcpy(&b, &v, 4);
        ordered(b, 4);
    }
    void f64(double v) {
        std::uint64_t b;
        std::memcpy(&b, &v, 8);
        ordered(b, 8);
    }
    void str(std::string_view s) {
        i16(static_cast<std::int16_t>(s.size()));
        raw(s.data(), s.size());
    }
    void header(Tag t, std::string_view name) {
        u8(t);
        str(name);
    }
};

// Serialises the live CompoundTag at `compound` as a compound body (entries + End) into a big-endian buffer.
void serializeCompound(std::uintptr_t compound, Buffer& out);

struct ShapeRow {
    std::optional<std::uint32_t> hash;  // blockStateHash, once network ids are hashes
    std::uint32_t                id;    // blockStateId: the registry walk index
    std::vector<shapes::AABB>    collision;
    shapes::AABB                 ui, visual;
};

// block-state-shapes.nbt: little-endian { shapes: [{ blockStateHash?: long, blockStateId: int,
// collisionShape: [[6 floats]], uiShape: [6 floats], visualShape: [6 floats] }] }
std::vector<std::uint8_t> shapesFile(std::vector<ShapeRow> const& rows);

// block_palette.nbt: big-endian { blocks: [<each state's CompoundTag>] }
std::vector<std::uint8_t> paletteFile(std::vector<std::uintptr_t> const& blocks, std::int64_t serializationIdOffset);

bool writeFile(std::string const& path, std::vector<std::uint8_t> const& bytes);

}
