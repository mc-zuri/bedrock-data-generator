#include "export/Nbt.h"

#include "memory/Mem.h"

#include <windows.h>

#include <cstdio>

namespace bdg::nbt {

using memory::inImage;
using memory::read;
using memory::readPtr;

namespace {

// ---- the game's own CompoundTag::write --------------------------------------------------------
// A stand-in IDataOutput whose vtable forwards each write into our buffer, handed to the live
// Tag::write(IDataOutput&) virtual (Tag vtable slot 2).
struct DataOutput {
    void**         vtable;
    Buffer*        out;
    static void*   table[10];
    static bool    ready;

    explicit DataOutput(Buffer* b) : out(b) {
        if (!ready) {
            table[0] = reinterpret_cast<void*>(&dtor);
            table[1] = reinterpret_cast<void*>(&writeString);    // writeString(string_view)
            table[2] = reinterpret_cast<void*>(&writeString);    // writeLongString(string_view)
            table[3] = reinterpret_cast<void*>(&writeFloat);
            table[4] = reinterpret_cast<void*>(&writeDouble);
            table[5] = reinterpret_cast<void*>(&writeByte);
            table[6] = reinterpret_cast<void*>(&writeShort);
            table[7] = reinterpret_cast<void*>(&writeInt);
            table[8] = reinterpret_cast<void*>(&writeLong);
            table[9] = reinterpret_cast<void*>(&writeBytes);
            ready    = true;
        }
        vtable = table;
    }
    static void __fastcall dtor(DataOutput*) {}
    static void __fastcall writeString(DataOutput* self, void const* view) {  // string_view by hidden pointer
        char const* d = *static_cast<char const* const*>(view);
        std::size_t n = *(static_cast<std::size_t const*>(view) + 1);
        if (d && n > 0 && n < 65536) self->out->str({d, n});
        else self->out->i16(0);
    }
    static void __fastcall writeFloat(DataOutput* self, float v) { self->out->f32(v); }
    static void __fastcall writeDouble(DataOutput* self, double v) { self->out->f64(v); }
    static void __fastcall writeByte(DataOutput* self, std::uint8_t v) { self->out->u8(v); }
    static void __fastcall writeShort(DataOutput* self, std::int16_t v) { self->out->i16(v); }
    static void __fastcall writeInt(DataOutput* self, std::int32_t v) { self->out->i32(v); }
    static void __fastcall writeLong(DataOutput* self, std::int64_t v) { self->out->i64(v); }
    static void __fastcall writeBytes(DataOutput* self, void const* d, std::uint64_t n) {
        if (d && n > 0 && n < 0x1000000) self->out->raw(d, n);
    }
};
void* DataOutput::table[10] = {};
bool  DataOutput::ready     = false;

bool callWrite(std::uintptr_t fn, std::uintptr_t compound, DataOutput* out) {
    __try {
        reinterpret_cast<void(__fastcall*)(std::uintptr_t, DataOutput*)>(fn)(compound, out);
        return true;
    } __except (EXCEPTION_EXECUTE_HANDLER) {
        return false;
    }
}

// ---- devirtualised CompoundTag: walk its std::map<std::string, CompoundTagVariant> -------------
// node: _Left @0, _Parent @8, _Right @0x10, _Isnil @0x19, key @0x20, value @0x40
// value (a std::variant): payload @+0 (or @+8 behind a Tag vtable on 1.21.45+), index (= tag type) @+40
constexpr std::int64_t Left = 0, Parent = 8, Right = 0x10, IsNil = 0x19, Key = 0x20, Value = 0x40;

void walk(std::uintptr_t node, std::uintptr_t head, Buffer& out, int depth) {
    if (!node || node == head || depth > 12 || read<std::uint8_t>(node, IsNil)) return;
    walk(readPtr(node, Left), head, out, depth);
    std::string key = memory::readString(node + Key);
    int         t   = read<std::uint8_t>(node, Value + 40);
    // only the types block states use; an unknown one would corrupt the stream
    bool handled = t == Byte || t == Short || t == Int || t == Long || t == Float || t == Double || t == String || t == Compound;
    if (!key.empty() && handled) {
        std::uintptr_t val = node + Value;
        std::uintptr_t v   = inImage(readPtr(val)) ? val + 8 : val;
        out.header(static_cast<Tag>(t), key);
        switch (t) {
        case Byte: out.u8(read<std::uint8_t>(v)); break;
        case Short: out.i16(read<std::int16_t>(v)); break;
        case Int: out.i32(read<std::int32_t>(v)); break;
        case Long: out.i64(read<std::int64_t>(v)); break;
        case Float: out.f32(read<float>(v)); break;
        case Double: out.f64(read<double>(v)); break;
        case String: out.str(memory::readString(v)); break;
        case Compound: {
            std::uintptr_t h    = readPtr(v);
            std::uint64_t  size = readPtr(v, 8);
            if (h > 0x10000 && size > 0 && size <= 100) walk(readPtr(h, Parent), h, out, depth + 1);
            out.u8(End);
            break;
        }
        }
    }
    walk(readPtr(node, Right), head, out, depth);
}

void list6(Buffer& b, shapes::AABB const& a) {
    b.u8(Float);
    b.i32(6);
    for (float f : {a.minX, a.minY, a.minZ, a.maxX, a.maxY, a.maxZ}) b.f32(f);
}

}

void serializeCompound(std::uintptr_t compound, Buffer& out) {
    std::uintptr_t first = readPtr(compound);
    if (inImage(first)) {
        // a Tag with its vtable: let the game write it
        std::uintptr_t fn = readPtr(first, 2 * 8);
        DataOutput     o(&out);
        if (fn < 0x10000 || !callWrite(fn, compound, &o)) out.u8(End);
        return;
    }
    std::uint64_t size = readPtr(compound, 8);
    if (first > 0x10000 && size >= 1 && size <= 64) walk(readPtr(first, Parent), first, out, 0);
    out.u8(End);
}

std::vector<std::uint8_t> shapesFile(std::vector<ShapeRow> const& rows) {
    Buffer b(true);
    b.header(Compound, "");
    b.header(List, "shapes");
    b.u8(Compound);
    b.i32(static_cast<std::int32_t>(rows.size()));
    for (auto const& row : rows) {
        if (row.hash) {
            b.header(Long, "blockStateHash");
            b.i64(static_cast<std::int64_t>(*row.hash));
        }
        b.header(Int, "blockStateId");
        b.i32(static_cast<std::int32_t>(row.id));
        b.header(List, "collisionShape");
        b.u8(List);  // element type is list even when empty, as prismarine-nbt writes it
        b.i32(static_cast<std::int32_t>(row.collision.size()));
        for (auto const& box : row.collision) list6(b, box);
        b.header(List, "uiShape");
        list6(b, row.ui);
        b.header(List, "visualShape");
        list6(b, row.visual);
        b.u8(End);
    }
    b.u8(End);
    return std::move(b.data);
}

std::vector<std::uint8_t> paletteFile(std::vector<std::uintptr_t> const& blocks, std::int64_t serializationIdOffset) {
    Buffer b(false);
    b.header(Compound, "");
    b.header(List, "blocks");
    b.u8(Compound);
    b.i32(static_cast<std::int32_t>(blocks.size()));
    for (std::uintptr_t blk : blocks) serializeCompound(blk + serializationIdOffset, b);
    b.u8(End);
    return std::move(b.data);
}

bool writeFile(std::string const& path, std::vector<std::uint8_t> const& bytes) {
    std::string tmp = path + ".tmp";
    FILE*       f   = nullptr;
    if (fopen_s(&f, tmp.c_str(), "wb") != 0 || !f) return false;
    bool ok = std::fwrite(bytes.data(), 1, bytes.size(), f) == bytes.size();
    ok      = std::fclose(f) == 0 && ok;
    return ok && MoveFileExA(tmp.c_str(), path.c_str(), MOVEFILE_REPLACE_EXISTING);
}

}
