// Read-only environment probe. No mouse injection, hooks or settings changes.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <shellscalingapi.h>
#include <cstdio>
static unsigned monitor_count = 0;
static BOOL CALLBACK monitor(HMONITOR display, HDC, LPRECT rect, LPARAM) {
    UINT x = 0, y = 0;
    HRESULT hr = GetDpiForMonitor(display, MDT_EFFECTIVE_DPI, &x, &y);
    std::printf("%s{\"index\":%u,\"x\":%ld,\"y\":%ld,\"width\":%ld,\"height\":%ld,\"dpi\":%u,\"scale\":%.2f,\"dpiQueryOK\":%s}",
        monitor_count ? "," : "", monitor_count, rect->left, rect->top,
        rect->right-rect->left, rect->bottom-rect->top, x, x/96.0, SUCCEEDED(hr)?"true":"false");
    ++monitor_count;
    return TRUE;
}
int main() {
    // Changes awareness of this diagnostic process only.
    SetProcessDpiAwareness(PROCESS_PER_MONITOR_DPI_AWARE);
    std::printf("{\"monitors\":[");
    EnumDisplayMonitors(nullptr, nullptr, monitor, 0);
    const bool swapped = GetSystemMetrics(SM_SWAPBUTTON) != 0;
    std::printf("],\"primaryMapping\":\"%s\",\"primaryCurrentlyHeld\":%s}\n",
        swapped ? "physical-right" : "physical-left",
        GetAsyncKeyState(swapped ? VK_RBUTTON : VK_LBUTTON) < 0 ? "true" : "false");
}
