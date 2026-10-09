export function buildMgbaAvEvidence({ durationSeconds, audio, video, visualFrames }) {
  const audible = Boolean(audio && audio.channels > 0 && audio.sampleRate > 0 && audio.maxVolumeDb > -60);
  const visuallyMeaningful = Boolean(
    video && video.width >= 240 && video.height >= 160 && visualFrames.length >= 2
    && visualFrames.every((frame) => frame.percentBlack < 90)
  );
  if (!(durationSeconds >= 5) || !audible || !visuallyMeaningful) {
    throw new Error(`A gravacao mGBA nao comprova audio e video: ${JSON.stringify({ durationSeconds, audio, video, visualFrames })}`);
  }
  return {
    ok: true,
    audible,
    visuallyMeaningful,
    durationSeconds,
    audio,
    video,
    visualFrames,
    checked: ["desktop-mgba-rom-boot", "desktop-mgba-visual-frames", "desktop-mgba-non-silent-audio"]
  };
}
