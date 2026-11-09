import { isDigitalSilence, parseVolumeDetect, playbackArguments } from './meeting-audio.util';

describe('recording playback', () => {
  it('mixes microphone and participants on their shared timeline and keeps the longer channel', () => {
    const args = playbackArguments(
      ['mic.audio', 'system.audio'],
      [0, 1250],
      'playback.m4a',
    );
    const graph = args[args.indexOf('-filter_complex') + 1];
    expect(graph).toContain('[0:a]aresample=48000,adelay=0:all=1[a0]');
    expect(graph).toContain('[1:a]aresample=48000,adelay=1250:all=1[a1]');
    expect(graph).toContain('amix=inputs=2:duration=longest:normalize=0');
    expect(args).toContain('-vn');
  });
  it('keeps file paths as distinct arguments without interpreting shell text', () => {
    const args = playbackArguments(
      ['a path with spaces.audio', 'other.audio'],
      [0, 0],
      'out.m4a',
    );
    expect(args[args.indexOf('-i') + 1]).toBe('a path with spaces.audio');
  });
});

describe('volumedetect parsing (real ffmpeg 5.1 output)', () => {
  // Captured from ffmpeg 5.1.9 (Debian bookworm, as in production).
  const SILENT = [
    '[Parsed_volumedetect_0 @ 0x5a19799038c0] n_samples: 48000',
    '[Parsed_volumedetect_0 @ 0x5a19799038c0] mean_volume: -91.0 dB',
    '[Parsed_volumedetect_0 @ 0x5a19799038c0] max_volume: -91.0 dB',
  ].join('\n');

  it('reads mean and peak, and calls only digital silence silent', () => {
    const silent = parseVolumeDetect(SILENT);
    expect(silent).toEqual({ meanDb: -91, peakDb: -91 });
    expect(isDigitalSilence(silent)).toBe(true);
    const quiet = parseVolumeDetect('mean_volume: -55.3 dB\nmax_volume: -38.2 dB');
    expect(isDigitalSilence(quiet)).toBe(false);
    // The smallest nonzero signed 16-bit sample is still recorded audio.
    expect(isDigitalSilence({ meanDb: -91, peakDb: -90.3 })).toBe(false);
    expect(isDigitalSilence({ meanDb: -88, peakDb: -84.3 })).toBe(false);
    expect(parseVolumeDetect('mean_volume: -inf dB\nmax_volume: -inf dB')).toEqual({ meanDb: -Infinity, peakDb: -Infinity });
  });

  it('never calls an unmeasured recording silent', () => {
    expect(parseVolumeDetect('Invalid data found when processing input')).toBeNull();
    expect(isDigitalSilence(null)).toBe(false);
  });
});
