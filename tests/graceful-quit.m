// Test helper: request normal AppKit termination of the exact spawned fixture.
#import <AppKit/AppKit.h>
#include <stdlib.h>
#include <unistd.h>
int main(int argc,const char **argv) { @autoreleasepool {
    if (argc!=2) return 2;
    pid_t pid=(pid_t)strtol(argv[1],NULL,10);
    if (pid<=1 || pid==getpid()) return 2;
    NSRunningApplication *app=[NSRunningApplication runningApplicationWithProcessIdentifier:pid];
    return app && [app terminate] ? 0 : 1;
}}
