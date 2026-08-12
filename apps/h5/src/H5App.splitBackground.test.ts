import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(path.resolve('apps/h5/src/H5App.tsx'), 'utf8');
const toggleBody = source.match(/const toggleSplitBackground = async \(\) => \{([\s\S]*?)\n  \};\n\n  const updateSplitBackgroundSensitivity/)?.[1] ?? '';
const sensitivityBody = source.match(/const updateSplitBackgroundSensitivity = \(value: number\) => \{([\s\S]*?)\n  \};\n\n  const handleReferenceUpload/)?.[1] ?? '';

describe('H5App split background toggling', () => {
  it('keeps the current split geometry and crop coordinate system while toggling background removal', () => {
    expect(toggleBody).not.toContain('applyDefaultSplitGeometry');
    expect(toggleBody).not.toContain('scaleCropBoundsToGrid');
    expect(toggleBody).toContain('crop: current.crop');
  });

  it('invalidates background work when navigation leaves the split flow', () => {
    expect(source).toContain('const splitScreenRef = useRef<AppScreen>(screen);');
    expect(source).toContain("if (!['split', 'split-crop', 'split-preview'].includes(screen))");
    expect(source).toContain('if (!isCurrentSplitBackgroundJob(jobId, uploadedSplitImage, toggleScreen)) return;');
    expect(toggleBody).toContain("if (isCurrentSplitBackgroundJob(jobId, uploadedSplitImage, toggleScreen)) {");
  });

  it('does not run a queued sensitivity frame after leaving split preview', () => {
    expect(sensitivityBody).toContain("const sensitivityScreen = splitScreenRef.current;");
    expect(sensitivityBody).toContain("if (sensitivityScreen !== 'split-preview') return;");
    expect(sensitivityBody).toContain("if (splitScreenRef.current !== sensitivityScreen) return;");
    expect(sensitivityBody).toContain('if (!isCurrentSplitBackgroundJob(jobId, sourceImage, sensitivityScreen)) return;');
    expect(sensitivityBody).toContain('if (!current || !current.backgroundRemoved || !isCurrentSplitBackgroundJob(jobId, sourceImage, sensitivityScreen)) return current;');
  });
});
