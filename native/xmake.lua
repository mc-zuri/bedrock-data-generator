add_rules("mode.release", "mode.debug")
set_defaultmode("release")
set_languages("c++20")
-- the game appends to std::vectors this code allocates: both must use the shared CRT heap
set_runtimes("MD")
add_requires("minhook")

-- what every binary shares: the bindings (an object library, so the static step registrations are linked) and the pattern scanner
target("bdg_bindings")
    set_kind("object")
    add_files("core/*.cpp", "memory/*.cpp", "bindings/*.cpp")
    add_includedirs(".", {public = true})
    add_cxflags("/EHsc", "/utf-8", "/W4", "/permissive-")
    add_defines("NOMINMAX", "WIN32_LEAN_AND_MEAN", "_CRT_SECURE_NO_WARNINGS", {public = true})

-- injected into bedrock_server.exe
target("bdg_agent")
    set_kind("shared")
    add_deps("bdg_bindings")
    add_packages("minhook")
    add_files("game/*.cpp", "export/*.cpp", "agent/*.cpp")
    -- SEH-guarded foreign calls sit next to C++ objects
    set_exceptions("none")
    add_cxflags("/EHa", "/utf-8", "/W4", "/permissive-")

target("bdg_inject")
    set_kind("binary")
    add_files("inject/*.cpp")
    add_cxflags("/EHsc", "/utf-8", "/W4", "/permissive-")
    add_defines("NOMINMAX", "WIN32_LEAN_AND_MEAN", "_CRT_SECURE_NO_WARNINGS")

target("bdg_check")
    set_kind("binary")
    add_deps("bdg_bindings")
    add_files("check/*.cpp")
    add_cxflags("/EHsc", "/utf-8", "/W4", "/permissive-")
