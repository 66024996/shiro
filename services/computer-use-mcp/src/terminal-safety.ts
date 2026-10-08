import type {
  TerminalAccessLevel,
  TerminalDecision,
  TerminalRiskSummary,
  TerminalRiskTier,
} from './types'

import { resolveConfiguredOpenableApp } from './app-aliases'

/**
 * Shiro terminal pipeline:
 *
 *   command -> tokenizer/parser -> risk classification -> decision -> audit log
 *
 *   SAFE / READ_ONLY -> execute        UNKNOWN / DANGEROUS -> confirm
 *   FORBIDDEN        -> block
 *
 * This is a conservative guard, not a sandbox. Safety rests on ALLOWLISTING, not on
 * spotting bad words: a command only runs without confirmation if its parsed shape
 * positively matches a known read-only command. Anything the parser cannot fully
 * explain (chaining, redirection, expansion, escapes, script blocks, unicode quote
 * tricks, ...) can never be SAFE/READ_ONLY. Deny-patterns exist to turn the worst
 * cases into a hard block and to give clearer reasons, not as the primary defense.
 */

export type { TerminalAccessLevel, TerminalDecision, TerminalRiskSummary, TerminalRiskTier }

export type SyntaxFlag
  = | 'chain' // ; & && ||
    | 'newline'
    | 'redirect' // > >> <
    | 'expansion' // $var ${} %VAR%
    | 'escape' // ` or ^
    | 'scriptblock' // { }
    | 'subexpression' // ( )
    | 'type-literal' // [ ]
    | 'splat' // @{ } @var
    | 'unbalanced-quote'
    | 'unicode-trick' // smart quotes / invisible chars that shells treat specially
    | 'control-char'
    | 'too-long'

export interface ParsedSegment {
  /** Deobfuscated tokens (quotes and escapes removed). tokens[0] is the command. */
  tokens: string[]
  /** How this segment is joined to the previous one. */
  joinedBy: 'start' | 'pipe' | 'chain'
}

export interface ParsedCommand {
  raw: string
  segments: ParsedSegment[]
  flags: Set<SyntaxFlag>
}

const MAX_COMMAND_LENGTH = 4_000
// Characters PowerShell/cmd treat as quotes or whitespace but ASCII-only parsers miss.
const UNICODE_TRICK_RE = /[\u0085\u00A0\u2018-\u201F\u2028\u2029\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/

const CONTROL_CHAR_RE = /[\u0000-\u0008\v\f\u000E-\u001F]/

/**
 * Quote-aware tokenizer for PowerShell / cmd / POSIX-ish command lines.
 * Never executes or expands anything; only records what it sees.
 */
export function parseCommandLine(input: string): ParsedCommand {
  const flags = new Set<SyntaxFlag>()
  const segments: ParsedSegment[] = []

  if (input.length > MAX_COMMAND_LENGTH)
    flags.add('too-long')
  if (UNICODE_TRICK_RE.test(input))
    flags.add('unicode-trick')
  if (CONTROL_CHAR_RE.test(input))
    flags.add('control-char')

  let tokens: string[] = []
  let joinedBy: ParsedSegment['joinedBy'] = 'start'
  let current = ''
  let hasToken = false
  let quote: '"' | '\'' | null = null

  const endToken = () => {
    if (hasToken)
      tokens.push(current)
    current = ''
    hasToken = false
  }
  const endSegment = (next: ParsedSegment['joinedBy']) => {
    endToken()
    if (tokens.length > 0)
      segments.push({ tokens, joinedBy })
    tokens = []
    joinedBy = next
  }

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!
    const next = input[i + 1]

    if (quote === '\'') {
      if (ch === '\'') {
        if (next === '\'') {
          current += '\''
          i++
        }
        else {
          quote = null
        }
      }
      else {
        current += ch
      }
      continue
    }

    if (quote === '"') {
      if (ch === '"') {
        if (next === '"') {
          current += '"'
          i++
        }
        else {
          quote = null
        }
      }
      else if (ch === '`') {
        flags.add('escape')
        if (next !== undefined) {
          current += next
          i++
        }
      }
      else {
        if (ch === '$')
          flags.add('expansion')
        if (ch === '%' && /^%[^%\s]+%/.test(input.slice(i)))
          flags.add('expansion')
        current += ch
      }
      continue
    }

    switch (ch) {
      case ' ':
      case '\t':
        endToken()
        break
      case '\n':
      case '\r':
        flags.add('newline')
        flags.add('chain')
        endSegment('chain')
        break
      case '\'':
      case '"':
        quote = ch
        hasToken = true
        break
      case '|':
        if (next === '|') {
          i++
          flags.add('chain')
          endSegment('chain')
        }
        else {
          endSegment('pipe')
        }
        break
      case '&':
        if (next === '&')
          i++
        flags.add('chain')
        endSegment('chain')
        break
      case ';':
        flags.add('chain')
        endSegment('chain')
        break
      case '>':
      case '<':
        flags.add('redirect')
        if (next === '>' || next === '&')
          i++
        endToken()
        break
      case '`':
      case '^':
        flags.add('escape')
        if (next !== undefined) {
          current += next
          hasToken = true
          i++
        }
        break
      case '$':
        flags.add('expansion')
        current += ch
        hasToken = true
        break
      case '%':
        if (/^%[^%\s]+%/.test(input.slice(i)))
          flags.add('expansion')
        current += ch
        hasToken = true
        break
      case '{':
      case '}':
        flags.add('scriptblock')
        current += ch
        hasToken = true
        break
      case '(':
      case ')':
        flags.add('subexpression')
        current += ch
        hasToken = true
        break
      case '[':
      case ']':
        flags.add('type-literal')
        current += ch
        hasToken = true
        break
      case '@':
        if (!hasToken && current === '')
          flags.add('splat')
        current += ch
        hasToken = true
        break
      default:
        current += ch
        hasToken = true
    }
  }

  if (quote !== null)
    flags.add('unbalanced-quote')
  endSegment('start')

  return { raw: input, segments, flags }
}

// ---------------------------------------------------------------------------
// Tiers
// ---------------------------------------------------------------------------

const TIER_RANK: Record<TerminalRiskTier, number> = { safe: 0, read_only: 1, unknown: 2, dangerous: 3, forbidden: 4 }
const LEVEL_RANK: Record<TerminalAccessLevel, number> = { observe: 0, assist: 1, execute: 2 }

export function terminalLevelRank(level: TerminalAccessLevel) {
  return LEVEL_RANK[level]
}

interface SegmentVerdict {
  tier: TerminalRiskTier
  level: TerminalAccessLevel
  reasons: string[]
  categories: string[]
}

function verdict(tier: TerminalRiskTier, level: TerminalAccessLevel, reason: string, category: string): SegmentVerdict {
  return { tier, level, reasons: [reason], categories: [category] }
}

// ---------------------------------------------------------------------------
// Read-only allowlist
// ---------------------------------------------------------------------------

interface ReadOnlyRule {
  tier: 'safe' | 'read_only'
  /** Return an error string if the arguments are not acceptable. */
  checkArgs?: (args: string[]) => string | undefined
}

const REMOTE_PARAMS = new Set(['-computername', '-cimsession', '-credential', '-session', '-asjob'])

function denyRemote(args: string[]) {
  const hit = args.find(arg => REMOTE_PARAMS.has(arg.toLowerCase().split(':')[0]!))
  return hit ? `remote/credential parameter ${hit} is not allowed` : undefined
}

const noArgs = (args: string[]) => args.length === 0 ? undefined : 'does not accept arguments in read-only mode'

const READ_ONLY_RULES: Record<string, ReadOnlyRule> = {
  'get-date': { tier: 'safe', checkArgs: denyRemote },
  'get-location': { tier: 'safe' },
  'pwd': { tier: 'safe' },
  'hostname': { tier: 'safe', checkArgs: noArgs },
  'whoami': { tier: 'safe' },

  'get-process': { tier: 'read_only', checkArgs: denyRemote },
  'get-ciminstance': { tier: 'read_only', checkArgs: denyRemote },
  'get-computerinfo': { tier: 'read_only', checkArgs: denyRemote },
  'get-volume': { tier: 'read_only', checkArgs: denyRemote },
  'get-service': { tier: 'read_only', checkArgs: denyRemote },
  'get-psdrive': { tier: 'read_only', checkArgs: denyRemote },
  'get-netadapter': { tier: 'read_only', checkArgs: denyRemote },
  'get-netipaddress': { tier: 'read_only', checkArgs: denyRemote },
  'get-nettcpconnection': { tier: 'read_only', checkArgs: denyRemote },
  'get-timezone': { tier: 'read_only', checkArgs: denyRemote },
  'get-counter': { tier: 'read_only', checkArgs: denyRemote },

  'ipconfig': {
    tier: 'read_only',
    checkArgs: args => args.every(a => a.toLowerCase() === '/all') ? undefined : 'only plain `ipconfig` or `ipconfig /all` is read-only',
  },
  'tasklist': {
    tier: 'read_only',
    checkArgs: args => args.some(a => ['/s', '/u', '/p'].includes(a.toLowerCase())) ? 'remote tasklist is not allowed' : undefined,
  },
  'systeminfo': {
    tier: 'read_only',
    checkArgs: args => args.some(a => ['/s', '/u', '/p'].includes(a.toLowerCase())) ? 'remote systeminfo is not allowed' : undefined,
  },
  'nvidia-smi': {
    tier: 'read_only',
    checkArgs: args => args.every(a => /^(?:-l|-q|--query-gpu=[\w.,]+|--query-compute-apps=[\w.,]+|--format=[\w,]+|--id=\d+|-i|\d+)$/i.test(a))
      ? undefined
      : 'only query flags are read-only for nvidia-smi',
  },
}

const READ_ONLY_ALIASES: Record<string, string> = {
  gps: 'get-process',
  ps: 'get-process',
  gsv: 'get-service',
  gl: 'get-location',
  gcim: 'get-ciminstance',
}

/** Pipeline stages that only reshape the output of the previous command. */
const PIPELINE_FILTERS = new Set([
  'select-object',
  'select',
  'where-object',
  'where',
  'sort-object',
  'sort',
  'measure-object',
  'measure',
  'format-table',
  'ft',
  'format-list',
  'fl',
  'convertto-json',
  'out-string',
])

// ---------------------------------------------------------------------------
// Dangerous (needs confirmation) rules
// ---------------------------------------------------------------------------

interface DangerRule {
  category: string
  reason: string
  /** Thai wording Shiro uses when asking for confirmation. */
  th: string
}

const DANGER = {
  delete: { category: 'delete', reason: 'deletes files', th: 'คำสั่งนี้จะลบไฟล์จริงนะคะ' },
  move: { category: 'move', reason: 'moves or renames files', th: 'คำสั่งนี้จะย้ายหรือเปลี่ยนชื่อไฟล์นะคะ' },
  write: { category: 'write', reason: 'writes or changes files', th: 'คำสั่งนี้จะเขียนหรือแก้ไขไฟล์นะคะ' },
  power: { category: 'power', reason: 'shuts down, restarts or logs off the machine', th: 'คำสั่งนี้จะปิดหรือรีสตาร์ตเครื่องนะคะ' },
  process: { category: 'process', reason: 'stops processes or services', th: 'คำสั่งนี้จะปิดโปรแกรมหรือบริการที่กำลังทำงานอยู่นะคะ' },
  install: { category: 'install', reason: 'installs, updates or removes software', th: 'คำสั่งนี้จะติดตั้งหรือถอนโปรแกรมนะคะ' },
  git: { category: 'git', reason: 'changes git history or working tree', th: 'คำสั่งนี้จะเปลี่ยนประวัติหรือไฟล์ในโปรเจกต์ (git) นะคะ' },
  docker: { category: 'docker', reason: 'removes or stops Docker resources', th: 'คำสั่งนี้จะลบหรือหยุด container ของ Docker นะคะ' },
  network: { category: 'network', reason: 'sends or downloads data over the network', th: 'คำสั่งนี้จะส่งหรือดาวน์โหลดข้อมูลผ่านอินเทอร์เน็ตนะคะ' },
  config: { category: 'config', reason: 'changes system or user configuration', th: 'คำสั่งนี้จะเปลี่ยนการตั้งค่าระบบนะคะ' },
  elevation: { category: 'elevation', reason: 'requests administrator rights', th: 'คำสั่งนี้ขอสิทธิ์ผู้ดูแลระบบนะคะ' },
} satisfies Record<string, DangerRule>

const DANGEROUS_COMMANDS: Record<string, DangerRule> = {}
function registerDanger(rule: DangerRule, names: string[]) {
  for (const name of names)
    DANGEROUS_COMMANDS[name] = rule
}

registerDanger(DANGER.delete, ['remove-item', 'ri', 'rm', 'del', 'erase', 'rd', 'rmdir', 'remove-itemproperty', 'clear-recyclebin', 'clear-content'])
registerDanger(DANGER.move, ['move-item', 'mi', 'mv', 'move', 'rename-item', 'rni', 'ren', 'rename'])
registerDanger(DANGER.write, ['set-content', 'add-content', 'ac', 'out-file', 'new-item', 'ni', 'copy-item', 'cp', 'copy', 'xcopy', 'robocopy', 'set-itemproperty', 'new-itemproperty', 'set-acl', 'icacls', 'takeown', 'attrib', 'mkdir', 'md', 'touch', 'tee-object', 'export-csv'])
registerDanger(DANGER.power, ['restart-computer', 'stop-computer', 'shutdown', 'logoff', 'poweroff', 'reboot', 'halt'])
registerDanger(DANGER.process, ['stop-process', 'spps', 'kill', 'taskkill', 'pkill', 'killall', 'stop-service', 'restart-service', 'set-service', 'start-service', 'sc', 'sc.exe'])
registerDanger(DANGER.config, ['reg', 'setx', 'netsh', 'schtasks', 'net', 'set-date', 'set-timezone', 'set-netipaddress', 'new-netfirewallrule', 'enable-netfirewallrule', 'disable-netfirewallrule', 'set-variable', 'set-alias'])
registerDanger(DANGER.network, ['invoke-webrequest', 'iwr', 'invoke-restmethod', 'irm', 'curl', 'wget', 'scp', 'ssh', 'sftp', 'ftp', 'send-mailmessage', 'invoke-command', 'enter-pssession', 'new-pssession'])
registerDanger(DANGER.install, ['winget', 'choco', 'scoop', 'msiexec', 'install-module', 'install-package', 'uninstall-package', 'apt', 'apt-get', 'brew', 'dpkg', 'yum', 'dnf'])
registerDanger(DANGER.elevation, ['runas', 'sudo'])

const PACKAGE_MANAGER_MUTATIONS: Record<string, Set<string>> = {
  npm: new Set(['install', 'i', 'add', 'ci', 'uninstall', 'remove', 'rm', 'un', 'update', 'up', 'upgrade', 'link', 'publish', 'unpublish', 'exec', 'x', 'run', 'start', 'test', 'init', 'create']),
  pnpm: new Set(['install', 'i', 'add', 'uninstall', 'remove', 'rm', 'update', 'up', 'upgrade', 'link', 'publish', 'exec', 'dlx', 'run', 'start', 'test', 'create']),
  yarn: new Set(['install', 'add', 'remove', 'upgrade', 'link', 'publish', 'run', 'dlx', 'create']),
  bun: new Set(['install', 'i', 'add', 'remove', 'rm', 'update', 'link', 'publish', 'run', 'x', 'create']),
  npx: new Set(['*']),
  pip: new Set(['install', 'uninstall', 'download']),
  pip3: new Set(['install', 'uninstall', 'download']),
  pipx: new Set(['install', 'uninstall', 'run', 'upgrade']),
  uv: new Set(['add', 'remove', 'pip', 'run', 'sync', 'tool']),
  cargo: new Set(['install', 'uninstall', 'add', 'remove', 'publish', 'run', 'build']),
  go: new Set(['install', 'get', 'run', 'build']),
  dotnet: new Set(['add', 'remove', 'tool', 'run', 'publish', 'new']),
  gem: new Set(['install', 'uninstall']),
}

const GIT_MUTATIONS = new Set(['reset', 'clean', 'push', 'rebase', 'restore', 'checkout', 'switch', 'merge', 'cherry-pick', 'revert', 'commit', 'stash', 'pull', 'fetch', 'clone', 'rm', 'mv', 'apply', 'am', 'tag', 'branch', 'gc', 'filter-branch', 'config', 'submodule', 'worktree'])
const GIT_READ_ONLY = new Set(['status', 'log', 'diff', 'show', 'remote', 'rev-parse', 'ls-files', 'describe', 'blame'])

const DOCKER_MUTATIONS = new Set(['rm', 'rmi', 'kill', 'stop', 'restart', 'pause', 'unpause', 'prune', 'down', 'run', 'exec', 'build', 'push', 'pull', 'create', 'start', 'cp', 'commit', 'load', 'import', 'tag', 'login', 'logout', 'update', 'rename'])
const DOCKER_COMPOSE_MUTATIONS = new Set(['down', 'rm', 'kill', 'stop', 'up', 'start', 'restart', 'run', 'exec', 'build', 'pull', 'push', 'create'])

function firstNonFlag(args: string[], skip = 0): string | undefined {
  return args.filter(a => !a.startsWith('-')).at(skip)?.toLowerCase()
}

// ---------------------------------------------------------------------------
// Forbidden (hard block) rules
// ---------------------------------------------------------------------------

/** Commands that start another interpreter: their payload cannot be analysed here. */
const NESTED_INTERPRETERS = new Set(['powershell', 'pwsh', 'cmd', 'wscript', 'cscript', 'mshta', 'rundll32', 'regsvr32', 'wsl', 'bash', 'sh', 'zsh', 'fish', 'python', 'python3', 'node', 'perl', 'ruby', 'php', 'invoke-expression', 'iex', 'invoke-item', 'ii', 'start-job', 'start-threadjob', 'register-scheduledtask'])

const FORBIDDEN_PATTERNS: Array<[RegExp, string]> = [
  [/(?<![\w-])(?:format-volume|clear-disk|remove-partition|initialize-disk|diskpart|mkfs(?:\.\w+)?|fdisk|parted)(?![\w-])/, 'disk formatting or partition destruction'],
  [/(?<![\w-])format\s+[a-z]:/, 'disk formatting'],
  [/(?<![\w-])dd\s+(?:\S.*)?of=\/dev\//, 'raw disk write'],
  [/(?<![\w-])(?:bcdedit|bootrec)(?![\w-])|(?<![\w-])(?:vssadmin|wbadmin)\s+delete|(?<![\w-])wevtutil\s+cl\b|(?<![\w-])clear-eventlog(?![\w-])|(?<![\w-])cipher\s+\/w/, 'boot, backup or log destruction'],
  [/(?<![\w-])reg(?:\.exe)?\s+(?:delete|import|load|restore)\s+["']?hk(?:lm|ey_local_machine|cr|ey_classes_root)/, 'system registry modification'],
  [/hklm:|hkcr:|hkey_local_machine/, 'system registry hive access'],
  [/(?<![\w-])(?:set-mppreference|add-mppreference|disable-windowsoptionalfeature|uninstall-windowsfeature|set-executionpolicy|disable-computerrestore|disable-netadapter)(?![\w-])/, 'changing security configuration'],
  [/(?<![\w-])netsh\s+advfirewall.+\b(?:off|disable)\b|(?<![\w-])set-netfirewallprofile\b.+\bfalse\b/, 'disabling the firewall'],
  [/(?:windefend|mpssvc|wscsvc|eventlog|sense|wdnissvc|securityhealthservice)/, 'touching security services'],
  [/enablelua|disableantispyware|disablerealtimemonitoring|amsiutils|amsiinitfailed/, 'weakening Windows security'],
  [/-enc(?:odedcommand)?(?![\w-])|frombase64string|downloadstring|downloadfile|downloaddata|invoke-expression|(?<![\w-])iex(?![\w-])|\[scriptblock\]|add-type\s+-typedefinition/, 'obfuscated or remote code execution'],
  [/(?<![\w-])(?:certutil\s+(?:\S.*)?-(?:urlcache|decode)|bitsadmin\s+\/transfer|mshta|regsvr32)(?![\w-])/, 'living-off-the-land download/execute'],
  [/(?:curl|wget|invoke-webrequest|iwr|invoke-restmethod|irm)\b[^|]*\|\s*(?:sh|bash|zsh|powershell|pwsh|iex|cmd)\b/, 'piping a download into a shell'],
  [/:\(\)\s*\{\s*:\|:&\s*\};:/, 'fork bomb'],
  [/(?<![\w-])net\s+(?:user|localgroup)\b.*(?:\/add\b|\badministrators\b)/, 'creating users or elevating privileges'],
]

const DELETE_COMMANDS = new Set(['remove-item', 'ri', 'rm', 'del', 'erase', 'rd', 'rmdir', 'remove-itemproperty'])

/** Targets that must never be deleted/moved even with confirmation. */
const PROTECTED_PATH_RES: RegExp[] = [
  /^[a-z]:[\\/]?\*?$/i, // drive root
  /^[a-z]:[\\/](?:windows|program files(?: \(x86\))?|programdata|users|system volume information|recovery|boot)(?:[\\/]\*?)?$/i,
  /[\\/]windows[\\/]system32(?:[\\/]|$)/i,
  /^[a-z]:[\\/]users[\\/][^\\/]+[\\/]?\*?$/i, // a whole user profile
  /^\/\*?$/, // POSIX root
  /^\/(?:etc|usr|bin|sbin|lib|boot|var|sys|proc|dev|home)(?:\/\*?)?$/,
  /^~[\\/]?\*?$/,
  /^\$home[\\/]?\*?$/i,
  /^%(?:userprofile|systemroot|windir|programfiles)%[\\/]?\*?$/i,
]

function targetsProtectedPath(tokens: string[]): boolean {
  return tokens.slice(1).some((token) => {
    if (token.startsWith('-') || /^\/[a-z]$/i.test(token))
      return false
    const cleaned = token.replace(/^-(?:path|literalpath)[:=]?/i, '')
    return PROTECTED_PATH_RES.some(re => re.test(cleaned))
  })
}

/** Removes quotes/escapes/`+` so `'Rem'+'ove-Item'`-style obfuscation is seen as plain text. */
export function deobfuscate(text: string): string {
  return text.toLowerCase().replace(/[`'"^+]/g, '')
}

// ---------------------------------------------------------------------------
// Segment classification
// ---------------------------------------------------------------------------

export interface ClassifyOptions {
  /** Apps (from config) that `Start-Process <app>` may open at the assist level. */
  openableApps?: string[]
}

function commandName(raw: string): string {
  // Only bare names qualify for allowlists: a path could point at a planted binary.
  const lower = raw.toLowerCase()
  const withoutExe = lower.replace(/\.(?:exe|cmd|bat|com)$/, '')
  return READ_ONLY_ALIASES[withoutExe] ?? withoutExe
}

function isBareName(raw: string) {
  return !/[\\/]/.test(raw)
}

function classifySegment(segment: ParsedSegment, options: ClassifyOptions): SegmentVerdict {
  const [rawName, ...args] = segment.tokens
  if (!rawName)
    return verdict('unknown', 'execute', 'empty command segment', 'unknown')

  const name = commandName(rawName)
  const bare = isBareName(rawName)

  if (NESTED_INTERPRETERS.has(name))
    return verdict('forbidden', 'execute', `nested interpreter "${name}" can hide an unreviewable payload`, 'nested-interpreter')

  if (DELETE_COMMANDS.has(name) && targetsProtectedPath(segment.tokens))
    return verdict('forbidden', 'execute', 'targets a protected system path', 'protected-path')

  // Start-Process <openable app>: assist level, no confirmation.
  if (bare && ['start-process', 'start', 'saps'].includes(name)) {
    const target = args[0]
    if (args.length === 1 && target && !target.startsWith('-') && isBareName(target) && options.openableApps
      && resolveConfiguredOpenableApp(target, options.openableApps)) {
      return verdict('safe', 'assist', `opens configured app "${target}"`, 'open-app')
    }
    if (args.some(a => /^-verb$/i.test(a)) && args.some(a => /^runas$/i.test(a)))
      return verdict('dangerous', 'execute', DANGER.elevation.reason, DANGER.elevation.category)
    return verdict('unknown', 'execute', 'Start-Process target is not a configured openable app', 'unknown')
  }

  // Package managers / git / docker are checked by sub-command, not just by name.
  if (bare && name in PACKAGE_MANAGER_MUTATIONS) {
    const mutations = PACKAGE_MANAGER_MUTATIONS[name]!
    const sub = firstNonFlag(args)
    if (mutations.has('*') || (sub && mutations.has(sub)))
      return verdict('dangerous', 'execute', `${name} ${sub ?? ''} ${DANGER.install.reason}`.replace(/\s+/g, ' '), DANGER.install.category)
    return verdict('unknown', 'execute', `${name} sub-command is not on the read-only allowlist`, 'unknown')
  }

  if (bare && name === 'git') {
    const sub = firstNonFlag(args)
    if (sub && GIT_MUTATIONS.has(sub))
      return verdict('dangerous', 'execute', `git ${sub}: ${DANGER.git.reason}`, DANGER.git.category)
    if (sub && GIT_READ_ONLY.has(sub) && !args.some(a => /^--(?:output|exec-path|upload-pack|receive-pack)/.test(a)))
      return verdict('read_only', 'observe', `git ${sub} is read-only`, 'git-read')
    return verdict('unknown', 'execute', 'git sub-command is not on the read-only allowlist', 'unknown')
  }

  if (bare && (name === 'docker' || name === 'docker-compose' || name === 'podman')) {
    const compose = name === 'docker-compose' || firstNonFlag(args) === 'compose'
    const sub = compose && name !== 'docker-compose' ? firstNonFlag(args, 1) : firstNonFlag(args)
    const mutations = compose ? DOCKER_COMPOSE_MUTATIONS : DOCKER_MUTATIONS
    const second = firstNonFlag(args, 1)
    if ((sub && mutations.has(sub)) || (sub && ['container', 'image', 'volume', 'network', 'system'].includes(sub) && second && DOCKER_MUTATIONS.has(second)))
      return verdict('dangerous', 'execute', `docker ${sub}: ${DANGER.docker.reason}`, DANGER.docker.category)
    if (sub && ['ps', 'images', 'info', 'version', 'stats', 'logs', 'inspect'].includes(sub))
      return verdict('read_only', 'observe', `docker ${sub} is read-only`, 'docker-read')
    return verdict('unknown', 'execute', 'docker sub-command is not on the read-only allowlist', 'unknown')
  }

  const danger = DANGEROUS_COMMANDS[name]
  if (danger && bare)
    return verdict('dangerous', 'execute', `${name}: ${danger.reason}`, danger.category)

  // Positive read-only allowlist (pipeline position matters).
  if (segment.joinedBy === 'pipe') {
    if (bare && PIPELINE_FILTERS.has(name))
      return verdict('read_only', 'observe', `pipeline filter ${name}`, 'filter')
    return verdict('unknown', 'execute', `pipeline stage "${name}" is not a known output filter`, 'unknown')
  }

  const rule = bare ? READ_ONLY_RULES[name] : undefined
  if (rule) {
    const problem = rule.checkArgs?.(args)
    if (problem)
      return verdict('unknown', 'execute', `${name}: ${problem}`, 'unknown')
    return verdict(rule.tier, 'observe', `${name} is a read-only query`, 'read-only')
  }

  return verdict('unknown', 'execute', `"${rawName}" is not on the allowlist`, 'unknown')
}

const FLAG_REASONS: Record<SyntaxFlag, [TerminalRiskTier, string]> = {
  'chain': ['unknown', 'command chaining (; & && ||) is not analysed as one safe command'],
  'newline': ['unknown', 'multi-line command'],
  'redirect': ['dangerous', 'output/input redirection can write files'],
  'expansion': ['unknown', 'variable or environment expansion ($ %VAR%) hides the final command'],
  'escape': ['unknown', 'escape characters (` ^) can obfuscate command names'],
  'scriptblock': ['unknown', 'script blocks { } can run arbitrary code'],
  'subexpression': ['unknown', 'sub-expressions ( ) can run nested commands'],
  'type-literal': ['unknown', '.NET type literals [ ] can call arbitrary APIs'],
  'splat': ['unknown', 'splatting / hashtable arguments are not analysed'],
  'unbalanced-quote': ['unknown', 'unbalanced quotes'],
  'unicode-trick': ['unknown', 'unicode quotes or invisible characters that shells interpret differently'],
  'control-char': ['unknown', 'control characters'],
  'too-long': ['unknown', 'command is unusually long'],
}

const FLAG_CATEGORY: Partial<Record<SyntaxFlag, string>> = { redirect: 'write' }

const MESSAGE_TH = {
  confirmSuffix: ' ต้องการให้ชิโระทำต่อไหมคะ?',
  unknown: 'ชิโระไม่แน่ใจว่าคำสั่งนี้ทำอะไรบ้างนะคะ ขอถามก่อน ให้ชิโระทำต่อไหมคะ?',
  forbidden: 'คำสั่งนี้อันตรายเกินไป ชิโระไม่ทำให้ค่ะ',
  execute: 'ได้ค่ะ',
} as const

const DANGER_BY_CATEGORY = new Map<string, DangerRule>(Object.values(DANGER).map(rule => [rule.category, rule]))

function userMessageFor(tier: TerminalRiskTier, categories: string[]): string {
  if (tier === 'forbidden')
    return MESSAGE_TH.forbidden
  if (tier === 'dangerous') {
    for (const category of categories) {
      const rule = DANGER_BY_CATEGORY.get(category)
      if (rule)
        return `${rule.th}${MESSAGE_TH.confirmSuffix}`
    }
    return `คำสั่งนี้เปลี่ยนแปลงระบบนะคะ${MESSAGE_TH.confirmSuffix}`
  }
  if (tier === 'unknown')
    return MESSAGE_TH.unknown
  return MESSAGE_TH.execute
}

function decisionFor(tier: TerminalRiskTier): TerminalDecision {
  if (tier === 'forbidden')
    return 'block'
  if (tier === 'unknown' || tier === 'dangerous')
    return 'confirm'
  return 'execute'
}

/**
 * Parse + classify a terminal command. The returned object is what gets attached
 * to the policy decision and written to the audit log.
 */
export function classifyTerminalCommand(command: string, options: ClassifyOptions = {}): TerminalRiskSummary {
  const text = command.trim()
  if (!text) {
    return { tier: 'forbidden', decision: 'block', level: 'execute', reasons: ['empty command'], categories: ['empty'], flags: [], userMessageTh: MESSAGE_TH.forbidden }
  }

  const parsed = parseCommandLine(text)
  const reasons: string[] = []
  const categories = new Set<string>()
  // NOTICE: kept in an object so TypeScript does not narrow `tier` across the closure.
  const acc = { tier: 'safe' as TerminalRiskTier, level: 'observe' as TerminalAccessLevel }

  const raise = (nextTier: TerminalRiskTier, nextLevel: TerminalAccessLevel, newReasons: string[], newCategories: string[]) => {
    if (TIER_RANK[nextTier] > TIER_RANK[acc.tier])
      acc.tier = nextTier
    if (LEVEL_RANK[nextLevel] > LEVEL_RANK[acc.level])
      acc.level = nextLevel
    reasons.push(...newReasons)
    newCategories.forEach(c => categories.add(c))
  }

  // 1. Hard-block patterns on the deobfuscated text (defense in depth).
  const normalized = deobfuscate(text)
  for (const [re, why] of FORBIDDEN_PATTERNS) {
    if (re.test(normalized))
      raise('forbidden', 'execute', [why], ['forbidden'])
  }

  // 2. Syntax red flags: anything the parser cannot fully explain is never SAFE.
  for (const flag of parsed.flags) {
    const [flagTier, why] = FLAG_REASONS[flag]
    raise(flagTier, 'execute', [why], [FLAG_CATEGORY[flag] ?? 'unknown'])
  }

  // 3. Every segment (pipeline stage / chained command) is classified on its own.
  if (parsed.segments.length === 0)
    raise('unknown', 'execute', ['no parsable command'], ['unknown'])
  for (const segment of parsed.segments) {
    const v = classifySegment(segment, options)
    raise(v.tier, v.level, v.reasons, v.categories)
  }

  // 4. Dangerous command names hidden inside script blocks / sub-expressions / strings
  //    still escalate the message, e.g. `... | ForEach-Object { Remove-Item x }`.
  if (acc.tier !== 'forbidden') {
    for (const [name, rule] of Object.entries(DANGEROUS_COMMANDS)) {
      if (name.length < 4)
        continue // short aliases (rm, ri, mv, ...) are only trusted in command position
      if (new RegExp(`(?<![\\w-])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`).test(normalized))
        raise('dangerous', 'execute', [`mentions ${name}: ${rule.reason}`], [rule.category])
    }
  }

  const flags = [...parsed.flags]
  return {
    tier: acc.tier,
    decision: decisionFor(acc.tier),
    level: acc.level,
    reasons: [...new Set(reasons)],
    categories: [...categories],
    flags,
    userMessageTh: userMessageFor(acc.tier, [...categories]),
  }
}
