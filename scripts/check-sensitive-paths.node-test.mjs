import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, test } from 'node:test';

import { classifySensitivePath } from './check-sensitive-paths.mjs';

const guardPath = fileURLToPath(new URL('./check-sensitive-paths.mjs', import.meta.url));
const testRepositories = [];

afterEach(() => {
  for (const repository of testRepositories.splice(0)) {
    rmSync(repository, { recursive: true, force: true });
  }
});

function createRepository() {
  const repository = mkdtempSync(join(tmpdir(), 'mage2-sensitive-paths-'));
  testRepositories.push(repository);
  execFileSync('git', ['init', '--quiet'], { cwd: repository, windowsHide: true });
  execFileSync('git', ['config', 'core.autocrlf', 'false'], {
    cwd: repository,
    windowsHide: true,
  });
  return repository;
}

function writeFixture(repository, relativePath) {
  const fixturePath = join(repository, ...relativePath.split('/'));
  mkdirSync(dirname(fixturePath), { recursive: true });
  writeFileSync(fixturePath, 'synthetic fixture\n', 'utf8');
}

function stage(repository, paths, force = false) {
  const args = ['add'];
  if (force) {
    args.push('--force');
  }
  args.push('--', ...paths);
  execFileSync('git', args, { cwd: repository, windowsHide: true });
}

function runGuard(repository) {
  return spawnSync(process.execPath, [guardPath], {
    cwd: repository,
    encoding: 'utf8',
    windowsHide: true,
  });
}

test('classifies denied path families without reading file contents', () => {
  assert.deepEqual(
    classifySensitivePath('.codex-test-profile/Default/Preferences'),
    ['browser-profile', 'browser-database'],
  );
  assert.deepEqual(
    classifySensitivePath('tmp/pdfs/synthetic.pdf'),
    ['temporary-content'],
  );
  assert.deepEqual(
    classifySensitivePath('automation/chrome-user-data/Profile 2/History-wal'),
    ['browser-profile', 'browser-database'],
  );
  assert.deepEqual(classifySensitivePath('src/history.ts'), []);
  assert.deepEqual(classifySensitivePath('docs/temporary-notes.md'), []);
});

test('passes a clean Git index and ignores untracked local scratch data', () => {
  const repository = createRepository();
  writeFixture(repository, 'src/app.mjs');
  writeFixture(repository, 'tmp/pdfs/untracked.pdf');
  stage(repository, ['src/app.mjs']);

  const result = runGuard(repository);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /guard passed/i);
});

test('fails for staged temp and browser data without printing matched paths', () => {
  const repository = createRepository();
  const profileFixture = '.codex-test-profile/Default/Login Data';
  const documentFixture = 'tmp/pdfs/synthetic.pdf';
  writeFixture(repository, profileFixture);
  writeFixture(repository, documentFixture);
  stage(repository, [profileFixture, documentFixture], true);

  const result = runGuard(repository);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 1);
  assert.match(output, /temporary workspace content: 1/i);
  assert.match(output, /browser profile data: 1/i);
  assert.match(output, /browser database or profile metadata: 1/i);
  assert.doesNotMatch(output, /synthetic\.pdf/i);
  assert.doesNotMatch(output, /login data/i);
  assert.doesNotMatch(output, /\.codex-test-profile/i);
  assert.doesNotMatch(output, /tmp[\\/]pdfs/i);
});

test('fails closed with generic output when no Git index is available', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mage2-sensitive-paths-no-git-'));
  testRepositories.push(directory);

  const result = runGuard(directory);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 2);
  assert.match(output, /could not inspect the Git index/i);
  assert.doesNotMatch(output, new RegExp(directory.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
});
