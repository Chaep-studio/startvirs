// @vitest-environment node
//
// fflate relies on `value instanceof Uint8Array` to tell files from nested
// directories. Under jsdom the global Uint8Array is a different realm than the
// one fflate captured, so zip/unzip silently misbehave. These tests therefore
// run in the node environment, and the DOM bits used by downloadSkillsAsZip are
// stubbed explicitly below.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import type { Skill } from '../types';
import { parseSkillsFromZip, downloadSkillsAsZip } from './importSkills';

function makeZip(files: Record<string, string>): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const [path, content] of Object.entries(files)) {
    entries[path] = strToU8(content);
  }
  return zipSync(entries);
}

describe('parseSkillsFromZip', () => {
  it('parses a SKILL.md with front matter', async () => {
    const zip = makeZip({
      'ppt/SKILL.md':
        '---\nname: PPT Generator\ncommand: /ppt\nicon: ph:slides\ncolor: "#123456"\ndescription: Makes slides\nparamsHint: "[topic]"\n---\nGenerate a deck about the topic.',
    });
    const skills = await parseSkillsFromZip(zip);
    expect(skills).toHaveLength(1);
    const s = skills[0];
    expect(s.name).toBe('PPT Generator');
    expect(s.command).toBe('/ppt');
    expect(s.icon).toBe('ph:slides');
    expect(s.color).toBe('#123456');
    expect(s.description).toBe('Makes slides');
    expect(s.paramsHint).toBe('[topic]');
    expect(s.systemPrompt).toContain('Generate a deck');
  });

  it('derives a command from the name when none is given', async () => {
    const zip = makeZip({
      'My Skill/SKILL.md': '---\nname: My Cool Skill\n---\nBody text',
    });
    const [s] = await parseSkillsFromZip(zip);
    expect(s.name).toBe('My Cool Skill');
    expect(s.command).toBe('/my-cool-skill');
    expect(s.icon).toBe('ph:lightning');
  });

  it('inlines references/*.md into the system prompt', async () => {
    const zip = makeZip({
      'skill/SKILL.md': '---\nname: WithRefs\n---\nMain instruction',
      'skill/references/guide.md': 'Reference guide content',
    });
    const [s] = await parseSkillsFromZip(zip);
    expect(s.systemPrompt).toContain('Main instruction');
    expect(s.systemPrompt).toContain('Reference guide content');
    expect(s.systemPrompt).toContain('guide.md');
    expect(s.files).toHaveProperty('references/guide.md');
  });

  it('falls back to _meta.json for the name when SKILL.md has no front matter', async () => {
    const zip = makeZip({
      'pack/SKILL.md': 'Just body, no front matter',
      'pack/_meta.json': JSON.stringify({ name: 'Meta Name', description: 'from meta' }),
    });
    const [s] = await parseSkillsFromZip(zip);
    expect(s.name).toBe('Meta Name');
    expect(s.description).toBe('from meta');
  });

  it('reads display_name from an agents yaml when no other name exists', async () => {
    const zip = makeZip({
      'pack/SKILL.md': 'body only',
      'pack/agents/openai.yaml': 'display_name: "Yaml Agent"\nshort_description: A yaml agent',
    });
    const [s] = await parseSkillsFromZip(zip);
    expect(s.name).toBe('Yaml Agent');
    expect(s.description).toBe('A yaml agent');
  });

  it('treats a top-level .md file as a skill when there is no SKILL.md', async () => {
    const zip = makeZip({ 'notes.md': 'free form skill body' });
    const skills = await parseSkillsFromZip(zip);
    expect(skills).toHaveLength(1);
    expect(skills[0].systemPrompt).toContain('free form skill body');
  });

  it('ignores __MACOSX and dotfiles', async () => {
    const zip = makeZip({
      '__MACOSX/foo': 'junk',
      '.DS_Store': 'junk',
      'real/SKILL.md': '---\nname: Real\n---\nbody',
    });
    const skills = await parseSkillsFromZip(zip);
    expect(skills.map((s) => s.name)).toEqual(['Real']);
  });

  it('throws when no valid skill files are present', async () => {
    const zip = makeZip({ 'data.txt': 'nothing useful' });
    await expect(parseSkillsFromZip(zip)).rejects.toThrow();
  });
});

describe('downloadSkillsAsZip round-trip', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('produces a zip that parseSkillsFromZip can read back', async () => {
    let captured: Uint8Array | null = null;

    // Capture the bytes handed to Blob (node 22 has a global Blob).
    const RealBlob = globalThis.Blob;
    vi.stubGlobal(
      'Blob',
      class extends RealBlob {
        constructor(parts: BlobPart[], opts?: BlobPropertyBag) {
          super(parts, opts);
          captured = parts[0] as Uint8Array;
        }
      }
    );

    const createObjectURL = vi.fn(() => 'blob:fake');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });

    const click = vi.fn();
    vi.stubGlobal('document', {
      createElement: () => ({ href: '', download: '', click }),
    });

    const skill: Skill = {
      id: 'x',
      name: 'RoundTrip',
      icon: 'ph:star',
      color: '#abcdef',
      description: 'desc',
      command: '/round',
      paramsHint: '[in]',
      systemPrompt: 'the system prompt',
      promptTemplate: '{{input}}',
      files: { 'assets/a.txt': 'hello asset' },
    };

    await downloadSkillsAsZip([skill]);

    expect(click).toHaveBeenCalled();
    expect(createObjectURL).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalled();
    expect(captured).not.toBeNull();

    const reparsed = await parseSkillsFromZip(captured!);
    expect(reparsed[0].name).toBe('RoundTrip');
    expect(reparsed[0].command).toBe('/round');
    expect(reparsed[0].systemPrompt).toContain('the system prompt');
    expect(reparsed[0].files).toHaveProperty('assets/a.txt', 'hello asset');
  });
});
