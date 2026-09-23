// bdg_inject.exe <pid> <dll>: loads <dll> into process <pid>. Exit code 0 when it is loaded.
#include <windows.h>

#include <cstdio>
#include <cstdlib>
#include <string>

int main(int argc, char** argv) {
    if (argc != 3) {
        std::fprintf(stderr, "usage: bdg_inject <pid> <dll>\n");
        return 2;
    }
    DWORD pid = static_cast<DWORD>(std::strtoul(argv[1], nullptr, 10));
    char  full[MAX_PATH]{};
    if (!GetFullPathNameA(argv[2], MAX_PATH, full, nullptr) || GetFileAttributesA(full) == INVALID_FILE_ATTRIBUTES) {
        std::fprintf(stderr, "no %s\n", argv[2]);
        return 2;
    }
    HANDLE process = OpenProcess(PROCESS_CREATE_THREAD | PROCESS_QUERY_INFORMATION | PROCESS_VM_OPERATION | PROCESS_VM_WRITE | PROCESS_VM_READ, FALSE, pid);
    if (!process) {
        std::fprintf(stderr, "OpenProcess(%lu) failed: %lu\n", pid, GetLastError());
        return 1;
    }
    std::size_t size   = std::strlen(full) + 1;
    LPVOID      remote = VirtualAllocEx(process, nullptr, size, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
    bool        loaded = false;
    if (remote && WriteProcessMemory(process, remote, full, size, nullptr)) {
        auto loadLibrary = reinterpret_cast<LPTHREAD_START_ROUTINE>(GetProcAddress(GetModuleHandleA("kernel32.dll"), "LoadLibraryA"));
        // the remote thread's exit code is the low half of the HMODULE: 0 when LoadLibrary failed
        for (int attempt = 0; attempt < 8 && !loaded; ++attempt) {
            HANDLE t = CreateRemoteThread(process, nullptr, 0, loadLibrary, remote, 0, nullptr);
            if (!t) {
                Sleep(250);
                continue;
            }
            WaitForSingleObject(t, 15000);
            DWORD code = 0;
            GetExitCodeThread(t, &code);
            CloseHandle(t);
            loaded = code != 0;
            if (!loaded) Sleep(250);
        }
    }
    if (remote) VirtualFreeEx(process, remote, 0, MEM_RELEASE);
    CloseHandle(process);
    if (!loaded) std::fprintf(stderr, "could not load %s into %lu\n", full, pid);
    return loaded ? 0 : 1;
}
