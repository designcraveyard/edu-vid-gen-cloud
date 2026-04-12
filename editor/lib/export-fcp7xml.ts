import { create } from 'xmlbuilder2';
import type { EditedTimeline, VideoClipEdit, VOClipEdit } from '@/lib/types';
import { resolve } from 'path';
import { existsSync } from 'fs';
import { execFileSync } from 'child_process';

function probeAudioDuration(filePath: string): number {
  try {
    const out = execFileSync('ffprobe', [
      '-v', 'quiet',
      '-show_entries', 'format=duration',
      '-of', 'csv=p=0',
      filePath,
    ], { encoding: 'utf-8' });
    return parseFloat(out.trim()) || 0;
  } catch {
    return 0;
  }
}

export function generateFCP7XML(timeline: EditedTimeline): string {
  const fps = timeline.framerate;

  /** Convert seconds to frame count (integer) */
  function toFrames(seconds: number): number {
    return Math.round(seconds * fps);
  }

  /** Absolute file:// URL for a relative path inside projectDir */
  function fileUrl(relativePath: string): string {
    const abs = resolve(timeline.projectDir, relativePath);
    return 'file://' + abs;
  }

  const root = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('xmeml', { version: '5' })
      .ele('sequence')
        .ele('name').txt('Edited Timeline').up()
        .ele('duration').txt(String(toFrames(timeline.totalDuration))).up()
        .ele('rate')
          .ele('timebase').txt(String(fps)).up()
          .ele('ntsc').txt('FALSE').up()
        .up()
        .ele('media');

  // ── VIDEO TRACK ────────────────────────────────────────────────────────────
  const videoTrack = root
    .ele('video')
      .ele('format')
        .ele('samplecharacteristics')
          .ele('width').txt('1920').up()
          .ele('height').txt('1080').up()
          .ele('pixelaspectratio').txt('square').up()
          .ele('rate')
            .ele('timebase').txt(String(fps)).up()
            .ele('ntsc').txt('FALSE').up()
          .up()
        .up()
      .up()
      .ele('track');

  for (let i = 0; i < timeline.tracks.video.length; i++) {
    const clip: VideoClipEdit = timeline.tracks.video[i];
    const clipDuration = clip.trimEnd - clip.trimStart;
    const seqStart = toFrames(clip.timelineOffset);
    const seqEnd = toFrames(clip.timelineOffset + clipDuration);
    const srcIn = toFrames(clip.trimStart);
    const srcOut = toFrames(clip.trimEnd);

    // Add transition BEFORE this clip (overlapping with previous)
    const prev = i > 0 ? timeline.tracks.video[i - 1] : null;
    if (prev && prev.transitionOut) {
      const trans = prev.transitionOut;
      const transDurFrames = toFrames(trans.duration);
      const transStart = toFrames(prev.timelineOffset + (prev.trimEnd - prev.trimStart) - trans.duration);
      const transEnd = transStart + transDurFrames;

      const transItem = videoTrack.ele('transitionitem');
      transItem.ele('rate')
        .ele('timebase').txt(String(fps)).up()
        .ele('ntsc').txt('FALSE').up()
      .up();
      transItem.ele('start').txt(String(transStart)).up();
      transItem.ele('end').txt(String(transEnd)).up();
      transItem.ele('alignment').txt('center').up();
      transItem.com(`Original transition type: ${trans.type}`);
      const effect = transItem.ele('effect');
      effect.ele('name').txt('Cross Dissolve').up();
      effect.ele('effectid').txt('CrossDissolve').up();
      effect.ele('effectcategory').txt('Dissolve').up();
      effect.ele('effecttype').txt('transition').up();
      effect.ele('mediatype').txt('video').up();
    }

    const clipItem = videoTrack.ele('clipitem', { id: `video-clip-${clip.clip}` });
    const clipFileName = clip.file.split('/').pop() ?? `clip-${String(clip.clip).padStart(2, '0')}.mp4`;
    clipItem.ele('name').txt(clipFileName).up();
    clipItem.ele('enabled').txt('TRUE').up();
    clipItem.ele('duration').txt(String(toFrames(clip.sourceDuration))).up();
    clipItem.ele('rate')
      .ele('timebase').txt(String(fps)).up()
      .ele('ntsc').txt('FALSE').up()
    .up();
    clipItem.ele('start').txt(String(seqStart)).up();
    clipItem.ele('end').txt(String(seqEnd)).up();
    clipItem.ele('in').txt(String(srcIn)).up();
    clipItem.ele('out').txt(String(srcOut)).up();

    const fileEl = clipItem.ele('file', { id: `file-video-${clip.clip}` });
    fileEl.ele('name').txt(clipFileName).up();
    fileEl.ele('pathurl').txt(fileUrl(clip.file)).up();
    fileEl.ele('duration').txt(String(toFrames(clip.sourceDuration))).up();
    fileEl.ele('rate')
      .ele('timebase').txt(String(fps)).up()
      .ele('ntsc').txt('FALSE').up()
    .up();
    fileEl.ele('media')
      .ele('video').up()
      .ele('audio').up()
    .up();
  }

  // ── AUDIO TRACK (VO) ───────────────────────────────────────────────────────
  const audioTrack = root
    .ele('audio')
      .ele('format')
        .ele('samplecharacteristics')
          .ele('samplerate').txt('48000').up()
          .ele('depth').txt('16').up()
        .up()
      .up()
      .ele('track');

  for (const vo of timeline.tracks.voiceover) {
    const clipDuration = vo.trimEnd - vo.trimStart;
    const seqStart = toFrames(vo.timelineOffset);
    const seqEnd = toFrames(vo.timelineOffset + clipDuration);

    // Check if an individual slice file exists for this clip (supports part-prefixed names)
    const nn = String(vo.clip).padStart(2, '0');
    const voSrcName = vo.file.split('/').pop() ?? '';
    const partMatch = voSrcName.match(/^(?:vo|slice)-(p\d+)-/);
    const partPrefix = partMatch ? partMatch[1] + '-' : '';
    let sliceName = `slice-${partPrefix}${nn}.mp3`;
    let slicePath = resolve(timeline.projectDir, 'audio', sliceName);
    let useSlice = existsSync(slicePath);
    // Fallback: try without prefix
    if (!useSlice && partPrefix) {
      sliceName = `slice-${nn}.mp3`;
      slicePath = resolve(timeline.projectDir, 'audio', sliceName);
      useSlice = existsSync(slicePath);
    }

    let voFileName: string;
    let voFileRef: string;
    let srcIn: number;
    let srcOut: number;
    let fileDuration: number;

    if (useSlice) {
      // Use the individual slice file — full file, no in/out trimming
      const sliceDur = probeAudioDuration(slicePath);
      voFileName = sliceName;
      voFileRef = `audio/${sliceName}`;
      srcIn = 0;
      srcOut = toFrames(sliceDur);
      fileDuration = sliceDur;
    } else {
      // Fallback: use the original file reference with in/out points
      voFileName = vo.file.split('/').pop() ?? `vo-${String(vo.clip).padStart(2, '0')}.mp3`;
      voFileRef = vo.file;
      srcIn = toFrames(vo.trimStart);
      srcOut = toFrames(vo.trimEnd);
      fileDuration = vo.sourceDuration;
    }

    const clipItem = audioTrack.ele('clipitem', { id: `audio-clip-${vo.clip}` });
    clipItem.ele('name').txt(voFileName).up();
    clipItem.ele('enabled').txt('TRUE').up();
    clipItem.ele('duration').txt(String(toFrames(fileDuration))).up();
    clipItem.ele('rate')
      .ele('timebase').txt(String(fps)).up()
      .ele('ntsc').txt('FALSE').up()
    .up();
    clipItem.ele('start').txt(String(seqStart)).up();
    clipItem.ele('end').txt(String(seqEnd)).up();
    clipItem.ele('in').txt(String(srcIn)).up();
    clipItem.ele('out').txt(String(srcOut)).up();

    const fileEl = clipItem.ele('file', { id: `file-audio-${vo.clip}` });
    fileEl.ele('name').txt(voFileName).up();
    fileEl.ele('pathurl').txt(fileUrl(voFileRef)).up();
    fileEl.ele('duration').txt(String(toFrames(fileDuration))).up();
    fileEl.ele('rate')
      .ele('timebase').txt(String(fps)).up()
      .ele('ntsc').txt('FALSE').up()
    .up();
    fileEl.ele('media').ele('audio').up().up();

    clipItem.ele('sourcetrack')
      .ele('mediatype').txt('audio').up()
      .ele('trackindex').txt('1').up()
    .up();
  }

  return root.end({ prettyPrint: true });
}
