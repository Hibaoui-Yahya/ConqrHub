import { playbackArguments } from './meeting-audio.util';

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
