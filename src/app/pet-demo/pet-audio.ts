export type PetSoundCue =
  | 'tap'
  | 'pet'
  | 'feed'
  | 'play'
  | 'sleep'
  | 'wake'
  | 'gameStart'
  | 'starCatch'
  | 'jump'
  | 'obstaclePass'
  | 'success'
  | 'crash';

export type PetBgmTrack = 'star-cat' | 'cloud-rabbit' | 'forest-fox' | 'ocean-dragon' | 'star-chase' | 'obstacle-hop' | 'cloud-hop';

let audioContext: AudioContext | null = null;
let bgmTimer: number | null = null;
let bgmTrack: PetBgmTrack | null = null;
let bgmStep = 0;
let bgmNextTime = 0;

const BGM_TRACKS: Record<PetBgmTrack, { bpm: number; notes: number[]; wave: OscillatorType; volume: number }> = {
  'star-cat': { bpm: 82, notes: [659, 784, 988, 784, 587, 698, 880, 698], wave: 'sine', volume: .018 },
  'cloud-rabbit': { bpm: 112, notes: [523, 659, 784, 659, 587, 698, 880, 698], wave: 'triangle', volume: .016 },
  'forest-fox': { bpm: 96, notes: [392, 494, 587, 494, 440, 523, 659, 523], wave: 'triangle', volume: .018 },
  'ocean-dragon': { bpm: 76, notes: [440, 523, 659, 523, 392, 494, 587, 494], wave: 'sine', volume: .02 },
  'star-chase': { bpm: 128, notes: [659, 784, 988, 1175, 988, 784, 880, 1047], wave: 'triangle', volume: .016 },
  'obstacle-hop': { bpm: 118, notes: [392, 523, 659, 523, 440, 587, 784, 587], wave: 'square', volume: .012 },
  'cloud-hop': { bpm: 104, notes: [523, 659, 784, 659, 587, 698, 880, 698], wave: 'sine', volume: .016 },
};

const getAudioContext = () => {
  if (typeof window === 'undefined') return null;
  const AudioContextConstructor = window.AudioContext
    || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) return null;
  if (!audioContext) audioContext = new AudioContextConstructor();
  if (audioContext.state === 'suspended') void audioContext.resume();
  return audioContext;
};

const playTone = (
  context: AudioContext,
  frequency: number,
  start: number,
  duration: number,
  volume: number,
  type: OscillatorType = 'sine',
) => {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
};

export const playPetSound = (cue: PetSoundCue) => {
  const context = getAudioContext();
  if (!context) return;

  const start = context.currentTime + 0.01;
  switch (cue) {
    case 'tap':
      playTone(context, 520, start, .07, .025, 'triangle');
      break;
    case 'pet':
      playTone(context, 440, start, .12, .035);
      playTone(context, 660, start + .09, .16, .03);
      break;
    case 'feed':
      playTone(context, 330, start, .11, .035, 'triangle');
      playTone(context, 494, start + .1, .14, .03, 'triangle');
      playTone(context, 659, start + .21, .18, .025, 'triangle');
      break;
    case 'play':
      playTone(context, 392, start, .09, .035, 'square');
      playTone(context, 587, start + .08, .11, .03, 'square');
      playTone(context, 784, start + .17, .16, .025, 'square');
      break;
    case 'sleep':
      playTone(context, 392, start, .26, .025);
      playTone(context, 294, start + .2, .34, .02);
      break;
    case 'wake':
      playTone(context, 294, start, .16, .025);
      playTone(context, 440, start + .12, .16, .03);
      playTone(context, 587, start + .24, .22, .026);
      break;
    case 'gameStart':
      playTone(context, 392, start, .09, .03, 'triangle');
      playTone(context, 523, start + .08, .09, .03, 'triangle');
      playTone(context, 659, start + .16, .16, .028, 'triangle');
      break;
    case 'starCatch':
      playTone(context, 880, start, .1, .028, 'sine');
      playTone(context, 1175, start + .07, .13, .024, 'sine');
      break;
    case 'jump':
      playTone(context, 250, start, .12, .025, 'sawtooth');
      playTone(context, 520, start + .08, .14, .025, 'triangle');
      break;
    case 'obstaclePass':
      playTone(context, 740, start, .08, .024, 'triangle');
      break;
    case 'success':
      playTone(context, 523, start, .11, .03, 'triangle');
      playTone(context, 659, start + .1, .11, .03, 'triangle');
      playTone(context, 784, start + .2, .22, .028, 'triangle');
      break;
    case 'crash':
      playTone(context, 180, start, .18, .04, 'sawtooth');
      playTone(context, 110, start + .12, .25, .03, 'sawtooth');
      break;
  }
};

export const stopPetBgm = () => {
  if (bgmTimer !== null && typeof window !== 'undefined') window.clearInterval(bgmTimer);
  bgmTimer = null;
  bgmTrack = null;
  bgmStep = 0;
  bgmNextTime = 0;
};

export const startPetBgm = (track: PetBgmTrack) => {
  const context = getAudioContext();
  if (!context) return;
  if (bgmTrack === track && bgmTimer !== null) return;

  stopPetBgm();
  bgmTrack = track;
  bgmStep = 0;
  bgmNextTime = context.currentTime + .04;

  const schedule = () => {
    const profile = BGM_TRACKS[track];
    if (bgmNextTime < context.currentTime - 1) bgmNextTime = context.currentTime + .04;
    while (bgmNextTime < context.currentTime + .18) {
      const frequency = profile.notes[bgmStep % profile.notes.length] ?? profile.notes[0];
      playTone(context, frequency, bgmNextTime, .24, profile.volume, profile.wave);
      if (bgmStep % 4 === 0) playTone(context, frequency / 2, bgmNextTime, .34, profile.volume * .34, 'sine');
      bgmStep += 1;
      bgmNextTime += 60 / profile.bpm / 2;
    }
  };

  schedule();
  bgmTimer = window.setInterval(schedule, 100);
};
