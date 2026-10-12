#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, readdirSync, lstatSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const REQUIRED_CHECKS = [
  'Frontend (lint + build)',
  'Backend (typecheck + build)',
  'Integration (backend harness, isolated Postgres)',
  'E2E (Playwright + self-hosted backend/Postgres)',
]
const REPO = 'dariodeoli/MobOS'
const FILES = [
  'version.json',
  'package.json',
  'backend/package.json',
  'package-lock.json',
  'backend/package-lock.json',
]
const METADATA = 'dist/mobos-release-build.json'
const fail = message => {
  const error = new Error(message)
  error.safeReleaseError = true
  throw error
}
const requireGate = (condition, message) => {
  if (!condition) fail(message)
}

export function normalizeCommandOutput(bin, tokens, output) {
  // Git porcelain starts with two significant status columns.
  return bin === 'git' && tokens[0] === 'status' ? output.trimEnd() : output.trim()
}

export function nextVersion(current) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(current)
  requireGate(match, 'Invalid release version.')
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`
}

export function validateChecks(protection, runs, workflowRuns, sha) {
  const required = protection?.required_status_checks
  requireGate(
    required?.strict === true && Array.isArray(required.checks),
    'Required check policy unavailable.',
  )
  requireGate(
    required.checks.length === REQUIRED_CHECKS.length &&
      REQUIRED_CHECKS.every(
        name =>
          required.checks.filter(check => check.context === name && check.app_id === 15368)
            .length === 1,
      ),
    'Required GitHub Actions check policy changed.',
  )
  requireGate(Array.isArray(runs) && Array.isArray(workflowRuns), 'Check evidence unavailable.')
  const workflows = workflowRuns
    .filter(
      run =>
        run.head_sha === sha &&
        run.head_branch === 'main' &&
        run.event === 'push' &&
        run.path === '.github/workflows/ci.yml',
    )
    .sort((a, b) => b.id - a.id)
  requireGate(
    workflows.length > 0 &&
      workflows[0].status === 'completed' &&
      workflows[0].conclusion === 'success',
    'Current main CI must finish successfully.',
  )
  requireGate(
    workflows.every(run => Number.isSafeInteger(run.id) && run.id > 0) &&
      new Set(workflows.map(run => run.id)).size === workflows.length,
    'Ambiguous workflow identity.',
  )
  for (const name of REQUIRED_CHECKS) {
    const matches = runs
      .filter(run => run.name === name && run.app?.id === 15368 && run.head_sha === sha)
      .sort((a, b) => b.id - a.id)
    requireGate(
      matches.length > 0 &&
        matches[0].status === 'completed' &&
        matches[0].conclusion === 'success',
      'A required check is missing, pending or unsuccessful.',
    )
    requireGate(
      matches.every(run => Number.isSafeInteger(run.id) && run.id > 0) &&
        new Set(matches.map(run => run.id)).size === matches.length,
      'Ambiguous check identity.',
    )
  }
}

export function runRelease(args, options = {}) {
  const root = options.root || process.cwd()
  const env = options.env || process.env
  const read = options.read || (file => readFileSync(resolve(root, file), 'utf8'))
  const write = options.write || ((file, value) => writeFileSync(resolve(root, file), value))
  const command =
    options.command ||
    ((bin, tokens) => {
      try {
        const output = execFileSync(bin, tokens, {
          cwd: root,
          encoding: 'utf8',
          timeout: 180000,
          maxBuffer: 16 * 1024 * 1024,
          stdio: ['ignore', 'pipe', 'pipe'],
        })
        return normalizeCommandOutput(bin, tokens, output)
      } catch {
        fail('Release command failed; inspect privately. No deployment retry was attempted.')
      }
    })
  const request = options.request || globalThis.fetch
  const treeHash =
    options.treeHash ||
    (directory => {
      const hash = createHash('sha256')
      const visit = relative => {
        for (const name of readdirSync(resolve(root, relative)).sort()) {
          const file = join(relative, name)
          if (file === METADATA || file === 'backend/.next/cache') continue
          const stat = lstatSync(resolve(root, file))
          requireGate(!stat.isSymbolicLink(), 'Build artifacts must be physical files.')
          if (stat.isDirectory()) visit(file)
          else {
            requireGate(stat.isFile(), 'Unexpected build artifact.')
            hash.update(file + '\0')
            hash.update(readFileSync(resolve(root, file)))
            hash.update('\0')
          }
        }
      }
      visit(directory)
      return hash.digest('hex')
    })
  const json = file => JSON.parse(read(file))
  const save = (file, value) => write(file, `${JSON.stringify(value, null, 2)}\n`)
  const git = (...tokens) => command('git', tokens)
  const api = endpoint => {
    try {
      return JSON.parse(command('gh', ['api', '--paginate', '--slurp', endpoint]))
    } catch {
      fail('GitHub release evidence unavailable.')
    }
  }
  const one = endpoint => {
    const pages = api(endpoint)
    requireGate(Array.isArray(pages) && pages.length === 1, 'Ambiguous GitHub response.')
    return pages[0]
  }
  const config = () => {
    const keychain = service => {
      if (process.platform !== 'darwin' || !env.USER) return ''
      try {
        return command('security', ['find-generic-password', '-a', env.USER, '-s', service, '-w'])
      } catch {
        return ''
      }
    }
    const webhook = env.MOBOS_DEPLOY_WEBHOOK?.trim() || keychain('mobos-release-deploy-webhook')
    const token = env.MOBOS_DEPLOY_TOKEN?.trim() || keychain('mobos-release-deploy-token')
    requireGate(webhook && token, 'Private deployment configuration unavailable.')
    let url
    try {
      url = new URL(webhook)
    } catch {
      fail('Invalid deployment configuration.')
    }
    requireGate(
      url.protocol === 'https:' &&
        url.hostname === 'hub.owncoding.dev' &&
        url.pathname === '/api/v1/deploy' &&
        url.searchParams.get('uuid') &&
        !url.username &&
        !url.password,
      'Invalid deployment endpoint.',
    )
    return { webhook: url.toString(), token }
  }
  const identity = () => {
    requireGate(git('branch', '--show-current') === 'main', 'Publishing requires main.')
    requireGate(
      git('status', '--porcelain', '--untracked-files=all') === '',
      'Publishing requires a clean tracked/untracked tree.',
    )
    const sha = git('rev-parse', 'HEAD')
    requireGate(
      /^[a-f0-9]{40}$/.test(sha) && git('rev-parse', 'origin/main') === sha,
      'Local main/origin mismatch.',
    )
    requireGate(
      ['git@github.com:dariodeoli/MobOS.git', 'https://github.com/dariodeoli/MobOS.git'].includes(
        git('config', '--get', 'remote.origin.url'),
      ),
      'Unexpected origin repository.',
    )
    requireGate(one(`repos/${REPO}/branches/main`).commit?.sha === sha, 'Live main SHA mismatch.')
    const version = json('version.json').version
    nextVersion(version)
    for (const file of FILES.slice(1)) {
      const value = json(file)
      requireGate(
        value.version === version && (!value.packages || value.packages['']?.version === version),
        'Release version metadata mismatch.',
      )
    }
    requireGate(
      read('docs/NOVEDADES.md').includes(`## v${version} — `),
      'Release notes missing for current version.',
    )
    return { sha, version }
  }
  const buildProof = state => {
    const metadata = json(METADATA)
    requireGate(
      metadata.sha === state.sha && metadata.version === state.version && metadata.format === 1,
      'Build provenance does not match release identity.',
    )
    requireGate(
      read('backend/.next/BUILD_ID').trim() === metadata.buildId && metadata.buildId,
      'Backend BUILD_ID mismatch.',
    )
    requireGate(
      treeHash('dist') === metadata.frontend && treeHash('backend/.next') === metadata.backend,
      'Build artifacts changed after verification.',
    )
  }
  const gates = () => {
    const state = identity()
    buildProof(state)
    const protection = one(`repos/${REPO}/branches/main/protection`)
    const rules = one(`repos/${REPO}/rules/branches/main`)
    requireGate(
      Array.isArray(rules) && rules.length === 0,
      'Additional branch rules require review.',
    )
    const checks = api(`repos/${REPO}/commits/${state.sha}/check-runs?per_page=100`)
    const workflows = api(
      `repos/${REPO}/actions/runs?head_sha=${state.sha}&branch=main&event=push&per_page=100`,
    )
    requireGate(
      checks.every(page => Array.isArray(page.check_runs)) &&
        workflows.every(page => Array.isArray(page.workflow_runs)),
      'Malformed check evidence.',
    )
    validateChecks(
      protection,
      checks.flatMap(page => page.check_runs),
      workflows.flatMap(page => page.workflow_runs),
      state.sha,
    )
    return state
  }
  const publish = args.includes('--publish')
  requireGate(
    args.every(arg =>
      [
        '--publish',
        '--deploy',
        '--deploy-current',
        '--prepare-version',
        '--build-current',
        '--check-deploy-config',
      ].includes(arg),
    ) && new Set(args).size === args.length,
    'Unknown or repeated release option.',
  )
  if (args.includes('--check-deploy-config')) {
    requireGate(
      args.length === 1,
      'Configuration check cannot be combined with release operations.',
    )
    config()
    return { mode: 'config' }
  }
  if (publish) {
    requireGate(
      args.length === 3 && args.includes('--deploy') && args.includes('--deploy-current'),
      'Publish requires --publish --deploy --deploy-current; legacy unchecked publication is disabled.',
    )
    requireGate(env.MOBOS_INTEGRATOR === '1', 'Publishing requires the integrator role.')
    const state = gates()
    const deployment = config()
    // Recheck identity after obtaining private configuration, immediately before the single send.
    requireGate(
      JSON.stringify(identity()) === JSON.stringify(state),
      'Release identity changed during validation.',
    )
    return Promise.resolve().then(async () => {
      let response
      try {
        response = await request(deployment.webhook, {
          method: 'POST',
          headers: { Authorization: `Bearer ${deployment.token}` },
          signal: AbortSignal.timeout(30000),
        })
      } catch {
        fail('Deployment outcome unknown; inspect manually. No automatic retry.')
      }
      requireGate(response.ok, 'Deployment request failed; inspect manually. No automatic retry.')
      return { mode: 'publish-current', ...state }
    })
  }
  if (args.includes('--build-current')) {
    requireGate(args.length === 1, 'Build-current cannot be combined with other modes.')
    const state = identity()
    command('npm', ['run', 'build'])
    command('npm', ['--prefix', 'backend', 'run', 'build'])
    requireGate(
      JSON.stringify(identity()) === JSON.stringify(state),
      'Source changed during build.',
    )
    const buildId = read('backend/.next/BUILD_ID').trim()
    requireGate(buildId, 'Backend build did not create BUILD_ID.')
    save(METADATA, {
      format: 1,
      ...state,
      buildId,
      frontend: treeHash('dist'),
      backend: treeHash('backend/.next'),
    })
    return { mode: 'build-current', ...state }
  }
  requireGate(
    args.length === 0 || (args.length === 1 && args[0] === '--prepare-version'),
    'Invalid release mode.',
  )
  const prepared = args.includes('--prepare-version')
  if (prepared) {
    requireGate(
      git('branch', '--show-current') !== 'main' && git('branch', '--show-current') !== '',
      'Prepare-version requires a named non-main branch.',
    )
    const status = git('status', '--porcelain', '--untracked-files=all')
    requireGate(
      status
        .split('\n')
        .filter(Boolean)
        .every(line => line.slice(3) === 'docs/NOVEDADES.md'),
      'Prepare-version only permits pending release notes.',
    )
  }
  const version = nextVersion(json('version.json').version)
  if (prepared)
    requireGate(
      read('docs/NOVEDADES.md').includes(`## v${version} — `),
      'Add release notes for the next version first.',
    )
  for (const file of FILES) {
    const value = json(file)
    value.version = version
    if (value.packages?.['']) value.packages[''].version = version
    save(file, value)
  }
  if (prepared) git('add', ...FILES, 'docs/NOVEDADES.md')
  else {
    command('npm', ['run', 'build'])
    command('npm', ['--prefix', 'backend', 'run', 'build'])
  }
  return { mode: prepared ? 'prepare-version' : 'prepare-local', version }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const result = await runRelease(process.argv.slice(2))
    console.log(
      `Release operation complete: ${result.mode}${result.version ? ` v${result.version}` : ''}.`,
    )
  } catch (error) {
    // Only explicitly safe, fixed gate messages are printable. Never print child output.
    console.error(
      error.safeReleaseError
        ? error.message
        : 'Release operation blocked. Inspect privately; do not retry blindly.',
    )
    process.exitCode = 1
  }
}
