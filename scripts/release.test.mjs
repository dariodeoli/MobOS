import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runRelease, REQUIRED_CHECKS, nextVersion, normalizeCommandOutput } from './release.mjs'

const SHA = 'c'.repeat(40)
function fixture() {
  const state = {
    branch: 'main',
    status: '',
    head: SHA,
    origin: SHA,
    live: SHA,
    sends: 0,
    writes: [],
    commands: [],
    rules: [],
  }
  state.files = Object.fromEntries(
    [
      'version.json',
      'package.json',
      'backend/package.json',
      'package-lock.json',
      'backend/package-lock.json',
    ].map(file => [
      file,
      JSON.stringify({
        version: '1.0.225',
        ...(file.includes('lock') ? { packages: { '': { version: '1.0.225' } } } : {}),
      }),
    ]),
  )
  state.files['docs/NOVEDADES.md'] = '## v1.0.225 — 2026-10-12\n'
  state.files['backend/.next/BUILD_ID'] = 'build-225\n'
  state.files['dist/mobos-release-build.json'] = JSON.stringify({
    format: 1,
    sha: SHA,
    version: '1.0.225',
    buildId: 'build-225',
    frontend: 'fe-hash',
    backend: 'be-hash',
  })
  state.protection = {
    required_status_checks: {
      strict: true,
      checks: REQUIRED_CHECKS.map(context => ({ context, app_id: 15368 })),
    },
  }
  state.checks = REQUIRED_CHECKS.map((name, i) => ({
    id: i + 1,
    name,
    app: { id: 15368 },
    head_sha: SHA,
    status: 'completed',
    conclusion: 'success',
  }))
  state.workflows = [
    {
      id: 1,
      head_sha: SHA,
      head_branch: 'main',
      event: 'push',
      path: '.github/workflows/ci.yml',
      status: 'completed',
      conclusion: 'success',
    },
  ]
  state.options = {
    env: {
      MOBOS_INTEGRATOR: '1',
      MOBOS_DEPLOY_WEBHOOK: 'https://hub.owncoding.dev/api/v1/deploy?uuid=test-resource',
      MOBOS_DEPLOY_TOKEN: 'fixture-only',
    },
    read: file => {
      assert.ok(file in state.files, `Missing fixture ${file}`)
      return state.files[file]
    },
    write: (file, content) => {
      state.writes.push(file)
      state.files[file] = content
    },
    treeHash: directory => (directory === 'dist' ? 'fe-hash' : 'be-hash'),
    command: (bin, args) => {
      state.commands.push([bin, ...args])
      if (bin === 'git') {
        if (args[0] === 'branch') return state.branch
        if (args[0] === 'status') return state.status
        if (args[0] === 'config') return 'git@github.com:dariodeoli/MobOS.git'
        if (args[0] === 'rev-parse') return args[1] === 'HEAD' ? state.head : state.origin
        if (args[0] === 'add') return ''
        throw new Error('Unexpected git mutation')
      }
      if (bin === 'npm') return ''
      if (bin === 'gh') {
        const endpoint = args.at(-1)
        if (endpoint.endsWith('/protection')) return JSON.stringify([state.protection])
        if (endpoint.endsWith('/rules/branches/main')) return JSON.stringify([state.rules])
        if (endpoint.includes('/check-runs?')) return JSON.stringify([{ check_runs: state.checks }])
        if (endpoint.includes('/actions/runs?'))
          return JSON.stringify([{ workflow_runs: state.workflows }])
        if (endpoint.endsWith('/branches/main'))
          return JSON.stringify([{ commit: { sha: state.live } }])
      }
      throw new Error('Unexpected external command')
    },
    request: async () => {
      state.sends++
      return { ok: true }
    },
  }
  return state
}
const publish = s => runRelease(['--publish', '--deploy', '--deploy-current'], s.options)
const blocked = async s => {
  await assert.rejects(async () => publish(s))
  assert.equal(s.sends, 0)
  assert.deepEqual(s.writes, [])
  assert.ok(!s.commands.some(c => ['push', 'commit', 'add'].includes(c[1])))
}

test('successful current SHA sends once without bump, write, build, commit or push', async () => {
  const s = fixture()
  const result = await publish(s)
  assert.equal(s.sends, 1)
  assert.equal(result.sha, SHA)
  assert.equal(result.version, '1.0.225')
  assert.deepEqual(s.writes, [])
  assert.ok(s.commands.every(c => c[0] === 'gh' || c[0] === 'git'))
  assert.ok(!s.commands.some(c => ['push', 'commit', 'add'].includes(c[1])))
})
for (const [name, change] of [
  [
    'non-main branch',
    s => {
      s.branch = 'codex/release'
    },
  ],
  [
    'dirty tracked file',
    s => {
      s.status = ' M package.json'
    },
  ],
  [
    'untracked file',
    s => {
      s.status = '?? unexpected.txt'
    },
  ],
  [
    'cached origin mismatch',
    s => {
      s.origin = 'a'.repeat(40)
    },
  ],
  [
    'live main mismatch',
    s => {
      s.live = 'a'.repeat(40)
    },
  ],
  [
    'version mismatch',
    s => {
      s.files['backend/package.json'] = '{"version":"1.0.224"}'
    },
  ],
  [
    'root lock version mismatch',
    s => {
      s.files['package-lock.json'] = '{"version":"1.0.225","packages":{"":{"version":"1.0.224"}}}'
    },
  ],
  [
    'release notes missing',
    s => {
      s.files['docs/NOVEDADES.md'] = 'old notes'
    },
  ],
  [
    'build provenance wrong SHA',
    s => {
      const m = JSON.parse(s.files['dist/mobos-release-build.json'])
      m.sha = 'a'.repeat(40)
      s.files['dist/mobos-release-build.json'] = JSON.stringify(m)
    },
  ],
  [
    'build provenance wrong version',
    s => {
      const m = JSON.parse(s.files['dist/mobos-release-build.json'])
      m.version = '1.0.224'
      s.files['dist/mobos-release-build.json'] = JSON.stringify(m)
    },
  ],
  [
    'BUILD_ID changed',
    s => {
      s.files['backend/.next/BUILD_ID'] = 'changed'
    },
  ],
  [
    'artifact hash changed',
    s => {
      s.options.treeHash = () => 'changed'
    },
  ],
  [
    'missing build metadata',
    s => {
      delete s.files['dist/mobos-release-build.json']
    },
  ],
  [
    'required context absent',
    s => {
      s.checks.pop()
    },
  ],
  [
    'required context failed',
    s => {
      s.checks[0].conclusion = 'failure'
    },
  ],
  [
    'required context skipped',
    s => {
      s.checks[0].conclusion = 'skipped'
    },
  ],
  [
    'required context pending',
    s => {
      s.checks[0].status = 'in_progress'
    },
  ],
  [
    'required context wrong app',
    s => {
      s.checks[0].app.id = 42
    },
  ],
  [
    'required context wrong SHA',
    s => {
      s.checks[0].head_sha = 'a'.repeat(40)
    },
  ],
  [
    'newer rerun pending despite old success',
    s => {
      s.checks.push({ ...s.checks[0], id: 100, status: 'queued', conclusion: null })
    },
  ],
  [
    'ambiguous latest check identity',
    s => {
      s.checks.push({ ...s.checks[0] })
    },
  ],
  [
    'main CI pending',
    s => {
      s.workflows[0].status = 'in_progress'
    },
  ],
  [
    'main CI absent',
    s => {
      s.workflows = []
    },
  ],
  [
    'main CI failed',
    s => {
      s.workflows[0].conclusion = 'failure'
    },
  ],
  [
    'protection absent',
    s => {
      s.protection = null
    },
  ],
  [
    'strict disabled',
    s => {
      s.protection.required_status_checks.strict = false
    },
  ],
  [
    'required policy changed',
    s => {
      s.protection.required_status_checks.checks.push({ context: 'new', app_id: 15368 })
    },
  ],
  [
    'additional branch rule',
    s => {
      s.rules = [{ type: 'required_status_checks' }]
    },
  ],
  [
    'integrator role absent',
    s => {
      s.options.env.MOBOS_INTEGRATOR = ''
    },
  ],
  [
    'credentials unavailable',
    s => {
      s.options.env = { MOBOS_INTEGRATOR: '1' }
    },
  ],
  [
    'invalid webhook host',
    s => {
      s.options.env.MOBOS_DEPLOY_WEBHOOK = 'https://example.invalid/api/v1/deploy?uuid=test'
    },
  ],
  [
    'GitHub command unavailable',
    s => {
      const command = s.options.command
      s.options.command = (bin, args) => {
        if (bin === 'gh') throw new Error('offline')
        return command(bin, args)
      }
    },
  ],
  [
    'malformed check evidence',
    s => {
      s.checks = null
    },
  ],
])
  test(`${name}: no send and no source mutation`, async () => {
    const s = fixture()
    change(s)
    await blocked(s)
  })

test('ignored artifacts are allowed; status explicitly checks all nonignored untracked files', async () => {
  const s = fixture()
  await publish(s)
  assert.ok(s.commands.some(c => c.join(' ') === 'git status --porcelain --untracked-files=all'))
  assert.equal(s.sends, 1)
})
test('identity moving during credential validation blocks the send', async () => {
  const s = fixture()
  const read = s.options.read
  let identityReads = 0
  s.options.read = file => {
    if (file === 'version.json' && ++identityReads === 2) s.files[file] = '{"version":"1.0.226"}'
    return read(file)
  }
  await blocked(s)
})
test('webhook rejection does not retry', async () => {
  const s = fixture()
  s.options.request = async () => {
    s.sends++
    return { ok: false, status: 429 }
  }
  await assert.rejects(async () => publish(s))
  assert.equal(s.sends, 1)
  assert.deepEqual(s.writes, [])
})
test('unknown webhook outcome does not retry', async () => {
  const s = fixture()
  s.options.request = async () => {
    s.sends++
    throw new Error('synthetic transport error')
  }
  await assert.rejects(async () => publish(s))
  assert.equal(s.sends, 1)
  assert.deepEqual(s.writes, [])
})
test('prepare-version stages exact version files and notes on branch, never commits or pushes', () => {
  const s = fixture()
  s.branch = 'codex/release'
  s.status = ' M docs/NOVEDADES.md'
  s.files['docs/NOVEDADES.md'] = '## v1.0.226 — 2026-10-12\n'
  const result = runRelease(['--prepare-version'], s.options)
  assert.equal(result.version, '1.0.226')
  assert.equal(s.writes.length, 5)
  assert.deepEqual(s.commands.at(-1), [
    'git',
    'add',
    'version.json',
    'package.json',
    'backend/package.json',
    'package-lock.json',
    'backend/package-lock.json',
    'docs/NOVEDADES.md',
  ])
  assert.ok(
    !s.commands.some(
      c => ['gh', 'security', 'npm'].includes(c[0]) || ['commit', 'push'].includes(c[1]),
    ),
  )
  assert.equal(s.sends, 0)
})
test('prepare-version refuses main before writing', () => {
  const s = fixture()
  assert.throws(() => runRelease(['--prepare-version'], s.options))
  assert.deepEqual(s.writes, [])
})
test('prepare-version refuses unrelated untracked files', () => {
  const s = fixture()
  s.branch = 'codex/release'
  s.status = '?? unrelated.txt'
  assert.throws(() => runRelease(['--prepare-version'], s.options))
  assert.deepEqual(s.writes, [])
})
test('prepare-version refuses missing next notes before writing', () => {
  const s = fixture()
  s.branch = 'codex/release'
  assert.throws(() => runRelease(['--prepare-version'], s.options))
  assert.deepEqual(s.writes, [])
})
test('legacy local prepare still bumps and builds without publish/config lookup', () => {
  const s = fixture()
  const result = runRelease([], s.options)
  assert.equal(result.version, '1.0.226')
  assert.equal(s.writes.length, 5)
  assert.deepEqual(s.commands, [
    ['npm', 'run', 'build'],
    ['npm', '--prefix', 'backend', 'run', 'build'],
  ])
  assert.equal(s.sends, 0)
})
test('build-current stamps identity and artifact hashes only after successful builds', () => {
  const s = fixture()
  const result = runRelease(['--build-current'], s.options)
  assert.equal(result.sha, SHA)
  assert.deepEqual(s.writes, ['dist/mobos-release-build.json'])
  assert.equal(s.sends, 0)
  assert.equal(JSON.parse(s.files['dist/mobos-release-build.json']).buildId, 'build-225')
})
test('failed build does not stamp successful provenance', () => {
  const s = fixture()
  const command = s.options.command
  s.options.command = (bin, args) => {
    if (bin === 'npm') throw new Error('synthetic capacity failure')
    return command(bin, args)
  }
  assert.throws(() => runRelease(['--build-current'], s.options))
  assert.deepEqual(s.writes, [])
  assert.equal(s.sends, 0)
})
for (const args of [
  ['--publish', '--deploy'],
  ['--deploy-current'],
  ['--publish', '--deploy', '--deploy-current', '--prepare-version'],
  ['--wat'],
]) {
  test(`invalid/legacy options ${args.join(' ')} fail closed`, async () => {
    const s = fixture()
    await assert.rejects(async () => runRelease(args, s.options))
    assert.equal(s.sends, 0)
    assert.deepEqual(s.writes, [])
  })
}
test('version helper increments one patch', () => {
  assert.equal(nextVersion('1.0.224'), '1.0.225')
  assert.throws(() => nextVersion('invalid'))
})

for (const [name, mutate] of [
  [
    'missing check ID',
    s => {
      delete s.checks[0].id
    },
  ],
  [
    'missing workflow ID',
    s => {
      delete s.workflows[0].id
    },
  ],
  [
    'duplicate workflow identity',
    s => {
      s.workflows.push({ ...s.workflows[0] })
    },
  ],
])
  test(`${name} fails closed`, async () => {
    const s = fixture()
    mutate(s)
    await blocked(s)
  })

test('paginated check and workflow evidence includes later pages', async () => {
  const s = fixture()
  const command = s.options.command
  s.options.command = (bin, args) => {
    if (bin === 'gh' && args.at(-1).includes('/check-runs?'))
      return JSON.stringify([
        { check_runs: s.checks.slice(0, 2) },
        { check_runs: s.checks.slice(2) },
      ])
    if (bin === 'gh' && args.at(-1).includes('/actions/runs?'))
      return JSON.stringify([{ workflow_runs: [] }, { workflow_runs: s.workflows }])
    return command(bin, args)
  }
  await publish(s)
  assert.equal(s.sends, 1)
})

function disposableGitFixture() {
  const root = mkdtempSync(join(tmpdir(), 'mobos-release-porcelain-'))
  const env = {
    PATH: process.env.PATH,
    HOME: root,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_TERMINAL_PROMPT: '0',
  }
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: root,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  git('-c', 'init.templateDir=', 'init', '-b', 'codex/release')
  const f = fixture()
  for (const file of [
    'version.json',
    'package.json',
    'backend/package.json',
    'package-lock.json',
    'backend/package-lock.json',
    'docs/NOVEDADES.md',
  ]) {
    mkdirSync(join(root, file, '..'), { recursive: true })
    writeFileSync(join(root, file), f.files[file])
  }
  git('add', '.')
  git(
    '-c',
    'user.name=Release Fixture',
    '-c',
    'user.email=release-fixture@example.invalid',
    'commit',
    '-m',
    'test: establish disposable fixture',
  )
  return {
    root,
    env,
    git,
    script: fileURLToPath(new URL('./release.mjs', import.meta.url)),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  }
}
for (const mixed of [false, true])
  test(`real CLI prepare accepts ${mixed ? 'mixed staged/unstaged' : 'ordinary unstaged'} notes`, () => {
    const f = disposableGitFixture()
    try {
      writeFileSync(join(f.root, 'docs/NOVEDADES.md'), '## v1.0.226 — 2026-10-12\n')
      if (mixed) {
        f.git('add', 'docs/NOVEDADES.md')
        writeFileSync(
          join(f.root, 'docs/NOVEDADES.md'),
          '## v1.0.226 — 2026-10-12\n- Reviewed update.\n',
        )
      }
      const before = f.git('status', '--porcelain', '--untracked-files=all')
      assert.ok(before.startsWith(mixed ? 'MM docs/NOVEDADES.md' : ' M docs/NOVEDADES.md'))
      const head = f.git('rev-parse', 'HEAD')
      const result = spawnSync(process.execPath, [f.script, '--prepare-version'], {
        cwd: f.root,
        env: f.env,
        encoding: 'utf8',
      })
      assert.equal(result.status, 0, result.stderr)
      assert.equal(
        JSON.parse(readFileSync(join(f.root, 'version.json'), 'utf8')).version,
        '1.0.226',
      )
      assert.equal(f.git('rev-parse', 'HEAD'), head, 'No fixture release commit was created')
      assert.equal(f.git('diff', '--name-only'), '', 'All intended changes were staged')
      assert.deepEqual(
        f.git('diff', '--cached', '--name-only').trim().split('\n').sort(),
        [
          'backend/package-lock.json',
          'backend/package.json',
          'docs/NOVEDADES.md',
          'package-lock.json',
          'package.json',
          'version.json',
        ].sort(),
      )
    } finally {
      f.cleanup()
    }
  })
test('real CLI prepare still rejects unrelated nonignored file before version writes', () => {
  const f = disposableGitFixture()
  try {
    writeFileSync(join(f.root, 'docs/NOVEDADES.md'), '## v1.0.226 — 2026-10-12\n')
    writeFileSync(join(f.root, 'unexpected.txt'), 'synthetic unrelated fixture')
    const result = spawnSync(process.execPath, [f.script, '--prepare-version'], {
      cwd: f.root,
      env: f.env,
      encoding: 'utf8',
    })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /only permits pending release notes/)
    assert.equal(JSON.parse(readFileSync(join(f.root, 'version.json'), 'utf8')).version, '1.0.225')
    assert.equal(f.git('diff', '--cached', '--name-only'), '')
  } finally {
    f.cleanup()
  }
})

test('production output normalization preserves porcelain columns and trims scalar output', () => {
  assert.equal(
    normalizeCommandOutput('git', ['status', '--porcelain'], ' M docs/NOVEDADES.md\n'),
    ' M docs/NOVEDADES.md',
  )
  assert.equal(
    normalizeCommandOutput('git', ['status', '--porcelain'], 'MM docs/NOVEDADES.md\n'),
    'MM docs/NOVEDADES.md',
  )
  assert.equal(normalizeCommandOutput('git', ['status', '--porcelain'], ''), '')
  assert.equal(
    normalizeCommandOutput('git', ['branch', '--show-current'], 'codex/release\n'),
    'codex/release',
  )
  assert.equal(normalizeCommandOutput('git', ['rev-parse', 'HEAD'], ` ${SHA}\n`), SHA)
})
test('injected command with production normalization accepts ordinary unstaged notes', () => {
  const s = fixture()
  const command = s.options.command
  s.branch = 'codex/release'
  s.status = ' M docs/NOVEDADES.md\n'
  s.files['docs/NOVEDADES.md'] = '## v1.0.226 — 2026-10-12\n'
  s.options.command = (bin, args) => normalizeCommandOutput(bin, args, command(bin, args))
  assert.equal(runRelease(['--prepare-version'], s.options).version, '1.0.226')
  assert.equal(s.sends, 0)
})
