// Own WKWebView frames only; no desktop capture, microphone, or extra permission.
#import <WebKit/WebKit.h>
#import <AppKit/AppKit.h>
#include <stdlib.h>
void pulse_demo_snapshot(void *view, const char *destination) {
    if (!getenv("PULSE_OFFLINE_TEST") || !getenv("PULSE_RENDER_PROBE") || !getenv("PULSE_DEMO_FRAMES")) return;
    static BOOL busy = NO;
    if (busy || !view || !destination) return;
    busy = YES;
    WKWebView *webview = (__bridge WKWebView *)view;
    NSString *path = [NSString stringWithUTF8String:destination];
    WKSnapshotConfiguration *configuration = [WKSnapshotConfiguration new];
    configuration.snapshotWidth = @(webview.bounds.size.width * 2);
    [webview takeSnapshotWithConfiguration:configuration completionHandler:^(NSImage *image, NSError *error) {
        if (image && !error) {
            NSBitmapImageRep *bitmap = [NSBitmapImageRep imageRepWithData:image.TIFFRepresentation];
            NSData *png = [bitmap representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
            [png writeToFile:path atomically:YES];
        }
        busy = NO;
    }];
}
