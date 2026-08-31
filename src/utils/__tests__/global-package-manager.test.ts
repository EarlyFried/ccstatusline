import * as childProcess from 'child_process';
import * as fs from 'fs';
import { createRequire } from 'node:module';
import {
    afterEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import {
    inspectActiveGlobalCommand,
    inspectGlobalPackageInstallations,
    runGlobalPackageUninstall
} from '../global-package-manager';

// Real ESM module namespaces are frozen, so vi.spyOn can't redefine
// childProcess.execFileSync directly. Re-exporting a shallow copy gives
// vi.spyOn a plain, writable object to patch while keeping the real
// implementations. child_process specifically deadlocks under real Vitest
// when the copy is made synchronously via createRequire (a hoisting/init-
// order quirk unique to this module), so prefer the async vi.importActual
// where it exists and fall back to createRequire under bun:test's vi shim,
// which lacks it.
vi.mock('child_process', async () => {
    if (typeof vi.importActual === 'function')
        return { ...(await vi.importActual<typeof childProcess>('child_process')) };
    return { ...(createRequire(import.meta.url)('child_process') as typeof childProcess) };
});

// Same frozen-namespace issue as child_process above. This copy must stay
// async too: mixing a sync createRequire-based factory with the async one
// above breaks Vitest's mock initialization order for the sync one.
vi.mock('fs', async () => {
    if (typeof vi.importActual === 'function')
        return { ...(await vi.importActual<typeof fs>('fs')) };
    return { ...(createRequire(import.meta.url)('fs') as typeof fs) };
});

function mockExecFileSync(responses: Record<string, string>) {
    return vi.spyOn(childProcess, 'execFileSync').mockImplementation((command, args) => {
        const key = `${command} ${(args as string[]).join(' ')}`;
        const response = responses[key];

        if (response === undefined) {
            throw new Error(`Unexpected command: ${key}`);
        }

        return response;
    });
}

describe('global package manager inspection', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('detects npm installs through WSL path variants', () => {
        mockExecFileSync({
            'which -a ccstatusline': '',
            'npm prefix -g': 'C:\\Users\\Alice\\AppData\\Roaming\\npm\n'
        });
        vi.spyOn(fs, 'existsSync').mockImplementation(filePath => (
            filePath === '/mnt/c/Users/Alice/AppData/Roaming/npm/ccstatusline'
        ));

        const installations = inspectGlobalPackageInstallations({
            commandAvailability: {
                npm: true,
                bun: false
            },
            platform: 'linux'
        });

        expect(installations).toEqual([
            {
                packageManager: 'npm',
                available: true,
                installed: true,
                binDir: 'C:\\Users\\Alice\\AppData\\Roaming\\npm'
            },
            {
                packageManager: 'bun',
                available: false,
                installed: false,
                binDir: null
            }
        ]);
    });

    it('identifies the active package manager and version from the first PATH match', () => {
        mockExecFileSync({
            'which -a ccstatusline': '/Users/alice/.bun/bin/ccstatusline\n/Users/alice/.nvm/versions/node/v24.9.0/bin/ccstatusline\n',
            'npm prefix -g': '/Users/alice/.nvm/versions/node/v24.9.0\n',
            'bun pm bin -g': '/Users/alice/.bun/bin\n'
        });
        vi.spyOn(fs, 'existsSync').mockImplementation(filePath => (
            filePath === '/Users/alice/.bun/install/global/node_modules/ccstatusline/package.json'
        ));
        vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
            if (filePath === '/Users/alice/.bun/install/global/node_modules/ccstatusline/package.json') {
                return '{"version":"2.2.13"}';
            }

            throw new Error(`Unexpected read: ${String(filePath)}`);
        });

        const activeCommand = inspectActiveGlobalCommand({
            commandAvailability: {
                npm: true,
                bun: true
            },
            platform: 'darwin'
        });

        expect(activeCommand).toEqual({
            packageManager: 'bun',
            resolvedPath: '/Users/alice/.bun/bin/ccstatusline',
            resolvedPaths: [
                '/Users/alice/.bun/bin/ccstatusline',
                '/Users/alice/.nvm/versions/node/v24.9.0/bin/ccstatusline'
            ],
            binDir: '/Users/alice/.bun/bin',
            version: '2.2.13',
            warning: '⚠ Multiple ccstatusline binaries are on PATH. Claude Code will run the first match: /Users/alice/.bun/bin/ccstatusline.\nOther matches: /Users/alice/.nvm/versions/node/v24.9.0/bin/ccstatusline'
        });
    });

    it('ignores transient bunx status line shims when identifying the active global command', () => {
        mockExecFileSync({
            'which -a ccstatusline': '/var/folders/demo/T/bunx-501-ccstatusline@latest/node_modules/.bin/ccstatusline\n/Users/alice/.bun/bin/ccstatusline\n',
            'npm prefix -g': '/Users/alice/.nvm/versions/node/v24.9.0\n',
            'bun pm bin -g': '/Users/alice/.bun/bin\n'
        });
        vi.spyOn(fs, 'existsSync').mockImplementation(filePath => (
            filePath === '/Users/alice/.bun/install/global/node_modules/ccstatusline/package.json'
        ));
        vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
            if (filePath === '/Users/alice/.bun/install/global/node_modules/ccstatusline/package.json') {
                return '{"version":"2.2.14"}';
            }

            throw new Error(`Unexpected read: ${String(filePath)}`);
        });

        const activeCommand = inspectActiveGlobalCommand({
            commandAvailability: {
                npm: true,
                bun: true
            },
            platform: 'darwin'
        });

        expect(activeCommand).toEqual({
            packageManager: 'bun',
            resolvedPath: '/Users/alice/.bun/bin/ccstatusline',
            resolvedPaths: ['/Users/alice/.bun/bin/ccstatusline'],
            binDir: '/Users/alice/.bun/bin',
            version: '2.2.14',
            warning: null
        });
    });

    it('uses npm.cmd for Windows npm version lookup', () => {
        const execFileSyncSpy = mockExecFileSync({
            'where ccstatusline': 'C:\\Users\\Alice\\AppData\\Roaming\\npm\\ccstatusline.cmd\r\n',
            'npm.cmd prefix -g': 'C:\\Users\\Alice\\AppData\\Roaming\\npm\r\n',
            'npm.cmd root -g': 'C:\\Users\\Alice\\AppData\\Roaming\\npm\\node_modules\r\n'
        });
        vi.spyOn(fs, 'existsSync').mockImplementation(filePath => (
            filePath === 'C:\\Users\\Alice\\AppData\\Roaming\\npm\\node_modules\\ccstatusline\\package.json'
        ));
        vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
            if (filePath === 'C:\\Users\\Alice\\AppData\\Roaming\\npm\\node_modules\\ccstatusline\\package.json') {
                return '{"version":"2.2.13"}';
            }

            throw new Error(`Unexpected read: ${String(filePath)}`);
        });

        const activeCommand = inspectActiveGlobalCommand({
            commandAvailability: {
                npm: true,
                bun: false
            },
            platform: 'win32'
        });

        expect(activeCommand).toEqual({
            packageManager: 'npm',
            resolvedPath: 'C:\\Users\\Alice\\AppData\\Roaming\\npm\\ccstatusline.cmd',
            resolvedPaths: ['C:\\Users\\Alice\\AppData\\Roaming\\npm\\ccstatusline.cmd'],
            binDir: 'C:\\Users\\Alice\\AppData\\Roaming\\npm',
            version: '2.2.13',
            warning: null
        });
        expect(execFileSyncSpy).toHaveBeenCalledWith(
            'npm.cmd',
            ['root', '-g'],
            expect.objectContaining({ shell: true })
        );
    });

    it('uses npm.cmd for Windows npm uninstalls', async () => {
        const execFileSpy = vi.spyOn(childProcess, 'execFile').mockImplementation(((...args: unknown[]) => {
            const callback = args[3] as (error: Error | null) => void;
            callback(null);
            return {};
        }) as typeof childProcess.execFile);

        await runGlobalPackageUninstall('npm', { platform: 'win32' });

        expect(execFileSpy.mock.calls[0]?.[0]).toBe('npm.cmd');
        expect(execFileSpy.mock.calls[0]?.[1]).toEqual(['uninstall', '-g', 'ccstatusline']);
        expect(execFileSpy.mock.calls[0]?.[2]).toEqual(expect.objectContaining({ shell: true }));
    });
});
