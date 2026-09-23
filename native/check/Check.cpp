// bdg_check <bedrock_server.exe> <build>         resolve every binding for <build> against the exe on disk
// bdg_check <bedrock_server.exe> --find <pattern> [rel32At]   where one pattern matches (up to 10 hits)
// Prints "name<TAB>value" lines; exit code 1 when a binding does not resolve. No server is started.
#include <windows.h>

#include "bindings/Bindings.h"
#include "memory/Scanner.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <string>
#include <vector>

namespace {

struct Image {
    std::vector<char>    bytes;
    bdg::memory::Module  text;
};

// .text from the file: sections are laid out by PointerToRawData / SizeOfRawData on disk
bool load(char const* path, Image& img) {
    std::ifstream f(path, std::ios::binary);
    if (!f) return false;
    img.bytes.assign(std::istreambuf_iterator<char>(f), {});
    if (img.bytes.size() < 0x400) return false;
    auto const* dos = reinterpret_cast<IMAGE_DOS_HEADER const*>(img.bytes.data());
    if (dos->e_magic != IMAGE_DOS_SIGNATURE) return false;
    auto const* nt   = reinterpret_cast<IMAGE_NT_HEADERS64 const*>(img.bytes.data() + dos->e_lfanew);
    auto const* sect = IMAGE_FIRST_SECTION(nt);
    for (unsigned i = 0; i < nt->FileHeader.NumberOfSections; ++i, ++sect) {
        if (std::memcmp(sect->Name, ".text", 5) != 0) continue;
        DWORD size = sect->SizeOfRawData < sect->Misc.VirtualSize ? sect->SizeOfRawData : sect->Misc.VirtualSize;
        if (sect->PointerToRawData + static_cast<std::size_t>(size) > img.bytes.size()) return false;
        img.text.textBegin = reinterpret_cast<std::uintptr_t>(img.bytes.data()) + sect->PointerToRawData;
        img.text.textEnd   = img.text.textBegin + size;
        img.text.textRva   = sect->VirtualAddress;
        return true;
    }
    return false;
}

}

int main(int argc, char** argv) {
    if (argc < 3) {
        std::fprintf(stderr, "usage: bdg_check <bedrock_server.exe> <build>\n       bdg_check <bedrock_server.exe> --find <pattern> [rel32At]\n");
        return 2;
    }
    Image img;
    if (!load(argv[1], img)) {
        std::fprintf(stderr, "cannot read .text of %s\n", argv[1]);
        return 2;
    }
    if (std::strcmp(argv[2], "--find") == 0 && argc >= 4) {
        auto pattern = bdg::memory::Pattern::parse(argv[3]);
        if (!pattern) {
            std::fprintf(stderr, "bad pattern\n");
            return 2;
        }
        int  rel32At = argc >= 5 ? std::atoi(argv[4]) : -1;
        auto hits    = pattern->find(img.text.textBegin, img.text.textEnd, 10);
        for (auto at : hits) {
            std::uint32_t rva = img.text.rva(at);
            if (rel32At >= 0) {
                std::int32_t disp;
                std::memcpy(&disp, reinterpret_cast<void const*>(at + rel32At), 4);
                rva = static_cast<std::uint32_t>(static_cast<std::int64_t>(rva) + rel32At + 4 + disp);
            }
            std::printf("0x%X\n", rva);
        }
        std::printf("%zu match(es)\n", hits.size());
        return hits.size() == 1 ? 0 : 1;
    }
    auto& r      = bdg::bindings::load(bdg::Version::parse(argv[2]));
    auto  failed = r.resolve(img.text);
    for (auto const& [name, value] : r.describe()) std::printf("%s\t%s\n", name.c_str(), value.c_str());
    for (auto const& f : failed) std::printf("FAILED\t%s\n", f.c_str());
    return failed.empty() ? 0 : 1;
}
