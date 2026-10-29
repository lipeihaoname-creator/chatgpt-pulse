// Core Audio process tap. No microphone, files, networking, or audio debug logs.
// Only the worker calls lifecycle methods. The realtime IOProc only copies PCM
// into a bounded SPSC ring; it never allocates, locks, calls IPC, or runs an FFT.
#import <Foundation/Foundation.h>
#import <CoreAudio/CoreAudio.h>
#import <CoreAudio/AudioHardwareTapping.h>
#import <CoreAudio/CATapDescription.h>
#include <stdatomic.h>
#include <math.h>
#include <stdlib.h>

#define PULSE_CAPACITY 32768u
typedef struct {
    AudioObjectID tap, device, output;
    AudioDeviceIOProcID proc;
    AudioStreamBasicDescription format;
    _Atomic uint32_t read, write, callbacks;
    _Atomic bool closing;
    float pcm[PULSE_CAPACITY];
} PulseAudio;

static AudioObjectPropertyAddress address(AudioObjectPropertySelector selector) {
    return (AudioObjectPropertyAddress){selector, kAudioObjectPropertyScopeGlobal, kAudioObjectPropertyElementMain};
}
static AudioObjectID default_output(void) {
    AudioObjectID value = 0; UInt32 size = sizeof(value);
    AudioObjectPropertyAddress property = address(kAudioHardwarePropertyDefaultOutputDevice);
    return AudioObjectGetPropertyData(kAudioObjectSystemObject, &property, 0, NULL, &size, &value) == noErr ? value : 0;
}
static bool supported_format(AudioStreamBasicDescription format) {
    return format.mFormatID == kAudioFormatLinearPCM && (format.mFormatFlags & kAudioFormatFlagIsFloat) &&
        !(format.mFormatFlags & kAudioFormatFlagIsBigEndian) && format.mBitsPerChannel == 32 &&
        format.mFramesPerPacket == 1 && format.mChannelsPerFrame >= 1 && format.mChannelsPerFrame <= 8 &&
        format.mBytesPerFrame == sizeof(float) * ((format.mFormatFlags & kAudioFormatFlagIsNonInterleaved) ? 1 : format.mChannelsPerFrame) &&
        isfinite(format.mSampleRate) && format.mSampleRate >= 8000 && format.mSampleRate <= 384000;
}
static bool same_format(AudioStreamBasicDescription a, AudioStreamBasicDescription b) {
    return a.mSampleRate == b.mSampleRate && a.mFormatID == b.mFormatID && a.mFormatFlags == b.mFormatFlags &&
        a.mBytesPerPacket == b.mBytesPerPacket && a.mFramesPerPacket == b.mFramesPerPacket &&
        a.mBytesPerFrame == b.mBytesPerFrame && a.mChannelsPerFrame == b.mChannelsPerFrame && a.mBitsPerChannel == b.mBitsPerChannel;
}
static OSStatus consume(AudioObjectID device, const AudioTimeStamp *now,
    const AudioBufferList *input, const AudioTimeStamp *inputTime,
    AudioBufferList *output, const AudioTimeStamp *outputTime, void *context) {
    PulseAudio *s = context;
    (void)device; (void)now; (void)inputTime; (void)output; (void)outputTime;
    if (atomic_load_explicit(&s->closing, memory_order_relaxed) || !input || !input->mNumberBuffers) return noErr;
    atomic_fetch_add_explicit(&s->callbacks, 1, memory_order_relaxed);
    uint32_t write = atomic_load_explicit(&s->write, memory_order_relaxed);
    uint32_t read = atomic_load_explicit(&s->read, memory_order_acquire);
    uint32_t frames = UINT32_MAX;
    for (UInt32 b = 0; b < input->mNumberBuffers; b++) {
        const AudioBuffer *buffer = &input->mBuffers[b];
        if (!buffer->mData || !buffer->mNumberChannels) continue;
        uint32_t count = buffer->mDataByteSize / (sizeof(float) * buffer->mNumberChannels);
        if (count < frames) frames = count;
    }
    if (frames == UINT32_MAX) return noErr;
    // A malicious/broken driver cannot grow memory or keep this callback busy.
    frames = MIN(frames, 8192u);
    frames = MIN(frames, PULSE_CAPACITY - (write - read));
    for (uint32_t i = 0; i < frames; i++) {
        float strongest = 0;
        for (UInt32 b = 0; b < input->mNumberBuffers; b++) {
            const AudioBuffer *buffer = &input->mBuffers[b];
            if (!buffer->mData) continue;
            const float *data = buffer->mData;
            for (UInt32 channel = 0; channel < buffer->mNumberChannels; channel++) {
                float value = data[i * buffer->mNumberChannels + channel];
                if (isfinite(value) && fabsf(value) > fabsf(strongest)) strongest = value;
            }
        }
        // Dominant-channel mono avoids phase-inverted stereo cancelling out.
        s->pcm[write++ % PULSE_CAPACITY] = fmaxf(-1, fminf(1, strongest));
    }
    atomic_store_explicit(&s->write, write, memory_order_release);
    return noErr;
}
int32_t pulse_audio_supported(void) {
    if (@available(macOS 14.2, *)) return 1;
    return 0;
}
void pulse_audio_close(void *pointer) {
    if (!pointer) return;
    PulseAudio *s = pointer;
    atomic_store_explicit(&s->closing, true, memory_order_release);
    if (s->proc) {
        AudioDeviceStop(s->device, s->proc);
        // Destroy unregisters the IOProc before its context is freed.
        AudioDeviceDestroyIOProcID(s->device, s->proc);
    }
    if (s->device) AudioHardwareDestroyAggregateDevice(s->device);
    if (@available(macOS 14.2, *)) { if (s->tap) AudioHardwareDestroyProcessTap(s->tap); }
    memset(s->pcm, 0, sizeof(s->pcm)); free(s);
}
void *pulse_audio_open(int32_t *error) {
    *error = -1;
    if (@available(macOS 14.2, *)) { @autoreleasepool {
        // A bare developer executable must not silently request its parent's
        // capture permission. Native tests must use a properly bundled app.
        if (![[NSBundle mainBundle] objectForInfoDictionaryKey:@"NSAudioCaptureUsageDescription"]) { *error = -2; return NULL; }
        PulseAudio *s = calloc(1, sizeof(PulseAudio));
        if (!s) { *error = -4; return NULL; }
        CATapDescription *description = [[CATapDescription alloc] initStereoGlobalTapButExcludeProcesses:@[]];
        description.name = @"Pulse local spectrum";
        description.privateTap = YES;
        description.muteBehavior = CATapUnmuted;
        OSStatus result = AudioHardwareCreateProcessTap(description, &s->tap);
        if (result != noErr) goto failed;
        AudioObjectPropertyAddress property = address(kAudioTapPropertyFormat);
        UInt32 size = sizeof(s->format);
        result = AudioObjectGetPropertyData(s->tap, &property, 0, NULL, &size, &s->format);
        if (result != noErr) goto failed;
        if (!supported_format(s->format)) { result = -5; goto failed; }
        {
            NSDictionary *composition = @{
                @kAudioAggregateDeviceNameKey: @"Pulse private audio analysis",
                @kAudioAggregateDeviceUIDKey: NSUUID.UUID.UUIDString,
                @kAudioAggregateDeviceIsPrivateKey: @YES,
                @kAudioAggregateDeviceTapAutoStartKey: @NO,
                @kAudioAggregateDeviceTapListKey: @[@{@kAudioSubTapUIDKey: description.UUID.UUIDString,
                                                       @kAudioSubTapDriftCompensationKey: @YES}]
            };
            result = AudioHardwareCreateAggregateDevice((__bridge CFDictionaryRef)composition, &s->device);
        }
        if (result != noErr) goto failed;
        result = AudioDeviceCreateIOProcID(s->device, consume, s, &s->proc);
        if (result != noErr) goto failed;
        s->output = default_output();
        result = AudioDeviceStart(s->device, s->proc);
        if (result != noErr) goto failed;
        *error = 0; return s;
    failed:
        *error = result; pulse_audio_close(s); return NULL;
    }}
    return NULL;
}
uint32_t pulse_audio_read(void *pointer, float *output, uint32_t capacity, double *rate, uint32_t *callbacks) {
    PulseAudio *s = pointer;
    uint32_t read = atomic_load_explicit(&s->read, memory_order_relaxed);
    uint32_t write = atomic_load_explicit(&s->write, memory_order_acquire);
    uint32_t count = MIN(capacity, write - read);
    for (uint32_t i = 0; i < count; i++) { output[i] = s->pcm[(read + i) % PULSE_CAPACITY]; s->pcm[(read + i) % PULSE_CAPACITY] = 0; }
    atomic_store_explicit(&s->read, read + count, memory_order_release);
    *rate = s->format.mSampleRate; *callbacks = atomic_load_explicit(&s->callbacks, memory_order_relaxed);
    return count;
}
int32_t pulse_audio_healthy(void *pointer) {
    PulseAudio *s = pointer;
    if (default_output() != s->output) return 0;
    UInt32 alive = 0, size = sizeof(alive);
    AudioObjectPropertyAddress property = address(kAudioDevicePropertyDeviceIsAlive);
    if (AudioObjectGetPropertyData(s->device, &property, 0, NULL, &size, &alive) != noErr || !alive) return 0;
    if (@available(macOS 14.2, *)) {
        AudioStreamBasicDescription format; size = sizeof(format); property = address(kAudioTapPropertyFormat);
        if (AudioObjectGetPropertyData(s->tap, &property, 0, NULL, &size, &format) != noErr ||
            !same_format(format, s->format)) return 0;
    }
    return 1;
}
