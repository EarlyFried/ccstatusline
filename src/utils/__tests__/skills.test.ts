import * as fs from 'fs';
import { createRequire } from 'node:module';
import * as os from 'os';
import * as path from 'path';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import {
    getSkillsFilePath,
    getSkillsMetrics
} from '../skills';

// Real ESM module namespaces are frozen, so vi.spyOn can't redefine
// os.homedir directly. Re-exporting a shallow copy gives vi.spyOn a
// plain, writable object to patch while keeping the real implementations.
// The default export is included because some widgets default-import os,
// and Vite's interop needs it on the mock even when this file doesn't.
vi.mock('os', () => {
    const copy = { ...(createRequire(import.meta.url)('os') as typeof os) };
    return { __esModule: true, default: copy, ...copy };
});

let testHomeDir = '';

function writeSkillsLog(sessionId: string, lines: string[]): void {
    const skillsPath = getSkillsFilePath(sessionId);
    fs.mkdirSync(path.dirname(skillsPath), { recursive: true });
    fs.writeFileSync(skillsPath, lines.join('\n'), 'utf-8');
}

describe('skills metrics', () => {
    beforeEach(() => {
        testHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-home-'));
        vi.spyOn(os, 'homedir').mockReturnValue(testHomeDir);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        if (testHomeDir) {
            fs.rmSync(testHomeDir, { recursive: true, force: true });
        }
    });

    it('uses ~/.cache/ccstatusline/skills path for skill logs', () => {
        expect(getSkillsFilePath('session-1')).toBe(
            path.join(testHomeDir, '.cache', 'ccstatusline', 'skills', 'skills-session-1.jsonl')
        );
    });

    it('returns total, unique (most-recent-first), and last skill from a valid log', () => {
        writeSkillsLog('session-1', [
            JSON.stringify({ skill: 'commit', session_id: 'session-1' }),
            JSON.stringify({ skill: 'review-pr', session_id: 'session-1' }),
            JSON.stringify({ skill: 'lint', session_id: 'session-1' }),
            JSON.stringify({ skill: 'commit', session_id: 'session-1' })
        ]);

        expect(getSkillsMetrics('session-1')).toEqual({
            totalInvocations: 4,
            uniqueSkills: ['commit', 'lint', 'review-pr'],
            lastSkill: 'commit'
        });
    });
});
