import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const CATEGORY_ORDER = [
  'temporary-content',
  'browser-profile',
  'browser-database',
];

const CATEGORY_LABELS = Object.freeze({
  'temporary-content': 'temporary workspace content',
  'browser-profile': 'browser profile data',
  'browser-database': 'browser database or profile metadata',
});

const TEMP_DIRECTORY_NAMES = new Set(['tmp', '.tmp', 'temp', '.temp']);

const BROWSER_DATABASE_NAMES = new Set([
  'affiliation database',
  'browsingtopicsitedata',
  'browsingtopicstate',
  'cookies',
  'dips',
  'extension cookies',
  'favicons',
  'heavyadinterventionoptout',
  'history',
  'history provider cache',
  'interestgroups',
  'local state',
  'login data',
  'login data for account',
  'media history',
  'network action predictor',
  'network persistent state',
  'origintrials',
  'preferences',
  'reporting and nel',
  'secure preferences',
  'sharedstorage',
  'shortcuts',
  'top sites',
  'transportsecurity',
  'trust tokens',
  'visited links',
  'web data',
]);

const BROWSER_PROFILE_SEGMENT_PATTERNS = [
  /^\.codex-.+-profile$/,
  /^\.?(?:browser|brave|chrome|chromium|edge|opera|playwright|puppeteer|vivaldi)[._ -]*(?:profile|profiles|user[._ -]*data)(?:[._ -].*)?$/,
  /^(?:profile|profiles)[._ -]*(?:browser|brave|chrome|chromium|edge|opera|playwright|puppeteer|vivaldi)(?:[._ -].*)?$/,
  /^user[._ -]*data[._ -]*(?:dir|directory)(?:[._ -].*)?$/,
  /^puppeteer_dev_chrome_profile-.+$/,
];

function normalizeGitPath(path) {
  return path
    .normalize('NFKC')
    .replaceAll('\\', '/')
    .replace(/^\.\//, '')
    .replace(/\/{2,}/g, '/')
    .toLowerCase();
}

function isBrowserProfilePath(segments) {
  if (segments.some((segment) =>
    BROWSER_PROFILE_SEGMENT_PATTERNS.some((pattern) => pattern.test(segment)))) {
    return true;
  }

  return segments.some((segment, index) =>
    segment === '.auth'
    && index > 0
    && /^(?:\.playwright|playwright|puppeteer)$/.test(segments[index - 1]));
}

function isBrowserDatabasePath(segments) {
  const leaf = segments.at(-1)?.replace(/-(?:journal|shm|wal)$/i, '') ?? '';
  return BROWSER_DATABASE_NAMES.has(leaf);
}

export function classifySensitivePath(path) {
  const normalized = normalizeGitPath(path);
  const segments = normalized.split('/').filter(Boolean);
  const categories = [];

  if (segments.some((segment) => TEMP_DIRECTORY_NAMES.has(segment))) {
    categories.push('temporary-content');
  }

  if (isBrowserProfilePath(segments)) {
    categories.push('browser-profile');
  }

  if (isBrowserDatabasePath(segments)) {
    categories.push('browser-database');
  }

  return categories;
}

export function scanPaths(paths) {
  const categoryCounts = new Map(CATEGORY_ORDER.map((category) => [category, 0]));
  const uniquePaths = new Set(paths);

  for (const path of uniquePaths) {
    for (const category of classifySensitivePath(path)) {
      categoryCounts.set(category, categoryCounts.get(category) + 1);
    }
  }

  return categoryCounts;
}

export function readGitIndexPaths(cwd = process.cwd()) {
  const result = spawnSync('git', ['ls-files', '--cached', '-z'], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });

  if (result.error || result.status !== 0) {
    throw new Error('repository index inspection failed');
  }

  return result.stdout.split('\0').filter(Boolean);
}

export function runSensitivePathCheck(cwd = process.cwd(), output = console) {
  let indexedPaths;

  try {
    indexedPaths = readGitIndexPaths(cwd);
  } catch {
    output.error('Sensitive-path guard could not inspect the Git index.');
    return 2;
  }

  const categoryCounts = scanPaths(indexedPaths);
  const violations = CATEGORY_ORDER.filter((category) => categoryCounts.get(category) > 0);

  if (violations.length === 0) {
    output.log('Sensitive-path guard passed.');
    return 0;
  }

  output.error('Sensitive-path guard failed: the Git index contains denied content.');
  for (const category of violations) {
    output.error(`- ${CATEGORY_LABELS[category]}: ${categoryCounts.get(category)}`);
  }
  output.error('Remove denied content from the Git index and keep it outside the repository.');
  return 1;
}

const isDirectExecution = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  process.exitCode = runSensitivePathCheck();
}
