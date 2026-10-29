//! Bounded, local signal analysis. No classification, recording, or history.
pub const BARS: usize = 24;
const N: usize = 2048;
#[derive(Clone, Debug, serde::Serialize)]
pub struct Features {
    pub rms: f32,
    pub low: f32,
    pub mid: f32,
    pub high: f32,
    pub bars: [f32; BARS],
    pub active: bool,
    pub stable_seconds: f32,
    pub beat: u64,
    pub beat_strength: f32,
}
impl Default for Features {
    fn default() -> Self { Self { rms: 0., low: 0., mid: 0., high: 0., bars: [0.; BARS], active: false, stable_seconds: 0., beat: 0, beat_strength: 0. } }
}
pub struct Analyzer {
    pcm: [f32; N], cursor: usize, filled: usize,
    real: [f32; N], imag: [f32; N], window: [f32; N],
    pub frame: Features, baseline: f32, last_low: f32,
    elapsed: f32, last_beat: f32, activity: f32, silence: f32,
}
impl Default for Analyzer {
    fn default() -> Self {
        Self { pcm: [0.;N], cursor: 0, filled: 0, real: [0.;N], imag: [0.;N],
            window: std::array::from_fn(|i| 0.5 - 0.5 * (std::f32::consts::TAU * i as f32 / (N-1) as f32).cos()),
            frame: Features::default(), baseline: 0., last_low: 0., elapsed: 0., last_beat: -1., activity: 0., silence: 0. }
    }
}
impl Analyzer {
    pub fn push(&mut self, samples: &[f32]) {
        for &value in samples {
            self.pcm[self.cursor] = if value.is_finite() { value.clamp(-1., 1.) } else { 0. };
            self.cursor = (self.cursor + 1) % N;
            self.filled = (self.filled + 1).min(N);
        }
    }
    pub fn analyze(&mut self, sample_rate: f32, dt: f32, received: bool) -> Features {
        let dt = if dt.is_finite() { dt.clamp(0.001, 0.2) } else { 0.04 };
        self.elapsed += dt;
        let valid = received && self.filled == N && sample_rate.is_finite() && (8000. ..=384000.).contains(&sample_rate);
        let mut energy = 0.;
        for i in 0..N {
            let value = if valid { self.pcm[(self.cursor + i) % N] } else { 0. };
            energy += value * value;
            self.real[i] = value * self.window[i]; self.imag[i] = 0.;
        }
        let rms = (energy/N as f32).sqrt();
        // In-place radix-2 FFT: fixed arrays and no third-party DSP runtime.
        let mut j = 0;
        for i in 1..N {
            let mut bit = N >> 1;
            while j & bit != 0 { j ^= bit; bit >>= 1; }
            j ^= bit;
            if i < j { self.real.swap(i,j); self.imag.swap(i,j); }
        }
        let mut length = 2;
        while length <= N {
            let angle = -std::f32::consts::TAU / length as f32;
            let (wi,wr) = angle.sin_cos();
            for start in (0..N).step_by(length) {
                let (mut r,mut im) = (1.,0.);
                for k in 0..length/2 {
                    let a=start+k; let b=a+length/2;
                    let tr=r*self.real[b]-im*self.imag[b]; let ti=r*self.imag[b]+im*self.real[b];
                    self.real[b]=self.real[a]-tr; self.imag[b]=self.imag[a]-ti;
                    self.real[a]+=tr; self.imag[a]+=ti;
                    let next=r*wr-im*wi; im=r*wi+im*wr; r=next;
                }
            }
            length *= 2;
        }
        let mut band_power = [0f32; BARS]; let mut ranges = [0f32;3];
        let upper = (sample_rate/2.).min(16000.).max(100.);
        for k in 1..N/2 {
            let hz=k as f32*sample_rate/N as f32;
            let power=(self.real[k].powi(2)+self.imag[k].powi(2))*(4./N as f32).powi(2);
            ranges[if hz<250. {0} else if hz<4000. {1} else {2}]+=power;
            if hz>=60. && hz<=upper {
                let index=(((hz/60.).ln()/(upper/60.).ln())*BARS as f32).floor() as usize;
                band_power[index.min(BARS-1)]+=power;
            }
        }
        let level=|v:f32| if v>1e-10 { ((20.*v.sqrt().log10()+70.)/65.).clamp(0.,1.) } else {0.};
        let smooth=|old:f32,target:f32| { let tau=if target>old {0.055} else {0.25}; old+(target-old)*(1.-(-dt/tau).exp()) };
        for (i,power) in band_power.iter().enumerate() { self.frame.bars[i]=smooth(self.frame.bars[i],level(*power)); }
        self.frame.rms=smooth(self.frame.rms,rms);
        self.frame.low=smooth(self.frame.low,level(ranges[0]));
        self.frame.mid=smooth(self.frame.mid,level(ranges[1]));
        self.frame.high=smooth(self.frame.high,level(ranges[2]));
        let sounding=valid && rms>0.0005;
        if sounding { self.silence=0.; self.activity+=dt; }
        else { self.silence+=dt; if self.silence>0.65 { self.activity=0.; } }
        self.frame.active=self.activity>0.12 && self.silence<0.65;
        self.frame.stable_seconds=self.activity;
        let low=ranges[0].sqrt();
        let onset=(low-self.last_low).max(0.);
        let threshold=(self.baseline*0.32).max(0.012);
        self.frame.beat_strength *= (-dt/0.24).exp();
        if sounding && onset>threshold && low>self.baseline*1.18 && self.elapsed-self.last_beat>0.28 {
            self.frame.beat=self.frame.beat.saturating_add(1);
            self.frame.beat_strength=(onset/(threshold*4.)).clamp(0.15,1.);
            self.last_beat=self.elapsed;
        }
        self.baseline+=(low-self.baseline)*(1.-(-dt/0.8).exp()); self.last_low=low;
        self.frame.clone()
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn tone(a:&mut Analyzer,hz:f32,amplitude:f32,offset:usize) {
        let pcm:Vec<f32>=(0..2048).map(|i|(std::f32::consts::TAU*hz*(i+offset) as f32/48000.).sin()*amplitude).collect(); a.push(&pcm);
    }
    #[test] fn silence_has_no_fake_bars_or_beats() {
        let mut a=Analyzer::default(); a.push(&[0.;N]);
        for _ in 0..100 { let f=a.analyze(48000.,0.04,true); assert!(!f.active); assert_eq!(f.beat,0); assert_eq!(f.bars,[0.;BARS]); }
    }
    #[test] fn real_frequency_energy_is_separated_and_not_all_full() {
        for (hz,range) in [(100.,0),(1000.,1),(9000.,2)] {
            let mut a=Analyzer::default();
            for i in 0..80 { tone(&mut a,hz,0.5,i*N); a.analyze(48000.,0.04,true); }
            let f=&a.frame; assert!(f.active && f.stable_seconds>2.); assert!(f.rms>0.3);
            let energy=[f.low,f.mid,f.high]; assert!(energy[range]>0.8);
            assert!(f.bars.iter().filter(|v|**v>0.9).count()<BARS/2);
        }
    }
    #[test] fn missing_buffers_decay_and_clear_activity() {
        let mut a=Analyzer::default();for i in 0..80 {tone(&mut a,100.,0.5,i*N);a.analyze(48000.,0.04,true);}
        for _ in 0..80 {a.analyze(48000.,0.04,false);}
        assert!(!a.frame.active); assert_eq!(a.frame.stable_seconds,0.); assert!(a.frame.bars.iter().all(|v|*v<0.001));
    }
    #[test] fn constant_tone_does_not_create_continuous_beats() {
        let mut a=Analyzer::default();for i in 0..200 {tone(&mut a,93.75,0.4,i*N);a.analyze(48000.,0.04,true);}
        assert!(a.frame.beat<=2);
        let old=a.frame.beat;
        for i in 0..60 { tone(&mut a,93.75,if i%15<3 {0.8}else{0.005},i*N);a.analyze(48000.,0.04,true); }
        assert!(a.frame.beat>=old+3);
    }
    #[test] fn invalid_samples_and_sample_rates_are_bounded() {
        let mut a=Analyzer::default();a.push(&[f32::NAN;N]);let f=a.analyze(f32::NAN, f32::NAN,true);
        assert_eq!(f.rms,0.);assert!(f.bars.iter().all(|v|v.is_finite()&&(0. ..=1.).contains(v)));
    }
}
