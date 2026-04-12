import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import type { EditedTimeline } from '@/lib/types';
import { generateEDL } from '@/lib/export-edl';

export async function POST(request: NextRequest) {
  try {
    const { projectDir } = await request.json();
    let timeline: EditedTimeline;

    const editedPath = join(projectDir, 'edited-timeline.json');
    const fallbackPath = join(projectDir, 'audio', 'timeline.json');

    if (existsSync(editedPath)) {
      timeline = JSON.parse(readFileSync(editedPath, 'utf-8'));
    } else if (existsSync(fallbackPath)) {
      timeline = JSON.parse(readFileSync(fallbackPath, 'utf-8'));
    } else {
      return NextResponse.json(
        { error: 'No timeline found. Save an edited timeline or ensure audio/timeline.json exists.' },
        { status: 400 }
      );
    }

    const edl = generateEDL(timeline);
    const exportDir = join(projectDir, 'export');
    if (!existsSync(exportDir)) mkdirSync(exportDir, { recursive: true });
    const outputPath = join(exportDir, 'project.edl');
    writeFileSync(outputPath, edl);
    return NextResponse.json({ path: outputPath });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
