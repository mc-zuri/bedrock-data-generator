#pragma once

#include <compare>
#include <cstdio>
#include <string>
#include <string_view>

namespace bdg {

// Missing parts are 0, so "1.21.0" sorts before every 1.21.0.x build.
struct Version {
    int major = 0, minor = 0, patch = 0, revision = 0;

    static Version parse(std::string_view text) {
        Version     v;
        std::string s(text);
        std::sscanf(s.c_str(), "%d.%d.%d.%d", &v.major, &v.minor, &v.patch, &v.revision);
        return v;
    }

    [[nodiscard]] std::string str() const {
        return std::to_string(major) + "." + std::to_string(minor) + "." + std::to_string(patch) + (revision ? "." + std::to_string(revision) : "");
    }

    // same major.minor.patch: every revision (hotfix build) of one release
    [[nodiscard]] bool sameRelease(Version const& o) const { return major == o.major && minor == o.minor && patch == o.patch; }

    auto operator<=>(Version const&) const = default;
};

}
