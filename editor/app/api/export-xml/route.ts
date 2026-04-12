import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import type { EditedTimeline, PipelineTimeline, VideoClipEdit, VOClipEdit } from '@/lib/types';
import { generateFCP7XML } from '@/lib/export-fcp7xml';
import { loadProject } from '@/lib/load-project';

/**
 * Synthesize an EditedTimeline from the pipeline's audio/timeline.json
 * when edited-timeline.json doesn't exist yet.
 */
function synthesizeTimeline(projectDir: string): EditedTimeline {
  const project = loadProject(projectDir);

  let offset = 0;
  const videoClips: VideoClipEdit[] = project.videoFiles.map((vf) => {
    const clip: VideoClipEdit = {
      clip: vf.clipNum,
      file: `clips/${vf.name}`,
      sourceDuration: vf.duration,
      trimStart: 0,
      trimEnd: vf.duration,
      timelineOffset: offset,
      transitionOut: null,
    };
    offset += vf.duration;
    return clip;
  });

  const voClips: VOClipEdit[] = project.audioFiles.map((af) => {
    const timelineClip = project.timeline.clips.find(c => c.clip === af.clipNum);
    const timelineOffset = timelineClip?.audio_start ?? 0;
    return {
      clip: af.clipNum,
      file: `audio/${af.name}`,
      sourceDuration: af.duration,
      trimStart: 0,
      trimEnd: af.duration,
      timelineOffset,
    };
  });

  const totalDuration = Math.max(
    offset,
    ...voClips.map(v => v.timelineOffset + v.trimEnd - v.trimStart),
  );

  return {
    sourceTimeline: 'audio/timeline.json',
    sourceMetadata: 'metadata.json',
    projectDir,
    framerate: 30,
    tracks: { video: videoClips, voiceover: voClips },
    totalDuration,
  };
}

export async function POST(request: NextRequest) {
  try {
    const { projectDir } = await request.json();
    const editedPath = join(projectDir, 'edited-timeline.json');
    const pipelinePath = join(projectDir, 'audio', 'timeline.json');

    let timeline: EditedTimeline;
    if (existsSync(editedPath)) {
      timeline = JSON.parse(readFileSync(editedPath, 'utf-8'));
    } else if (existsSync(pipelinePath)) {
      timeline = synthesizeTimeline(projectDir);
    } else {
      return NextResponse.json(
        { error: 'No timeline found. Neither edited-timeline.json nor audio/timeline.json exist.' },
        { status: 400 }
      );
    }
    const xml = generateFCP7XML(timeline);
    const exportDir = join(projectDir, 'export');
    if (!existsSync(exportDir)) mkdirSync(exportDir, { recursive: true });
    const outputPath = join(exportDir, 'project.xml');
    writeFileSync(outputPath, xml);
    return NextResponse.json({ path: outputPath });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
