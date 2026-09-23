#include "core/Log.h"

#include <cstdio>
#include <mutex>

namespace bdg::log {

namespace {
std::mutex  gLock;
std::string gPath;
}

void open(std::string const& path) {
    std::lock_guard lock(gLock);
    gPath = path;
}

// open-append-close per line: the server may be killed at any moment, and nothing may be lost
void line(std::string const& text) {
    std::lock_guard lock(gLock);
    if (gPath.empty()) return;
    FILE* f = nullptr;
    if (fopen_s(&f, gPath.c_str(), "a") != 0 || !f) return;
    std::fputs(text.c_str(), f);
    std::fputc('\n', f);
    std::fclose(f);
}

}
