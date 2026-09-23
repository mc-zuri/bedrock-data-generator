#pragma once

#include <format>
#include <string>

namespace bdg::log {

void open(std::string const& path);
void line(std::string const& text);

template <class... Args>
void info(std::format_string<Args...> fmt, Args&&... args) {
    line(std::format(fmt, std::forward<Args>(args)...));
}

}
