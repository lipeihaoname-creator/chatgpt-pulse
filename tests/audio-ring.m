// Isolated realtime-buffer test. Never creates a tap or requests permission.
#include "../src-tauri/native/system_audio.m"
#include <assert.h>
int main(void) {
    AudioStreamBasicDescription format={.mSampleRate=48000,.mFormatID=kAudioFormatLinearPCM,.mFormatFlags=kAudioFormatFlagIsFloat,.mBytesPerFrame=8,.mBytesPerPacket=8,.mFramesPerPacket=1,.mChannelsPerFrame=2,.mBitsPerChannel=32};
    assert(supported_format(format) && same_format(format,format));
    AudioStreamBasicDescription changed=format;changed.mChannelsPerFrame=1;changed.mBytesPerFrame=4;changed.mBytesPerPacket=4;
    assert(supported_format(changed) && !same_format(format,changed));
    changed=format;changed.mSampleRate=NAN;assert(!supported_format(changed));
    changed=format;changed.mBitsPerChannel=16;assert(!supported_format(changed)&&!same_format(format,changed));
    PulseAudio *s=calloc(1,sizeof(PulseAudio));
    float input[]={.2f,-.8f,NAN,.3f,INFINITY,-.4f};
    AudioBufferList list={.mNumberBuffers=1,.mBuffers={{.mNumberChannels=2,.mDataByteSize=sizeof(input),.mData=input}}};
    consume(0,NULL,&list,NULL,NULL,NULL,s);
    float output[8]={0};double rate;uint32_t callbacks;
    assert(pulse_audio_read(s,output,8,&rate,&callbacks)==3);
    assert(output[0]==-.8f&&output[1]==.3f&&output[2]==-.4f);
    assert(callbacks==1&&pulse_audio_read(s,output,8,&rate,&callbacks)==0);
    for(int i=0;i<12000;i++)consume(0,NULL,&list,NULL,NULL,NULL,s);
    assert(atomic_load(&s->write)-atomic_load(&s->read)==PULSE_CAPACITY);
    atomic_store(&s->closing,true);uint32_t before=atomic_load(&s->write);
    consume(0,NULL,&list,NULL,NULL,NULL,s);assert(atomic_load(&s->write)==before);
    pulse_audio_close(s);
    puts("PASS: format validation, layout change detection, finite PCM, channel phase, bounded overflow, clear read, stop guard");
}
