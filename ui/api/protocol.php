<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');

$agentsRoot = realpath(__DIR__ . '/../../.agents');
if ($agentsRoot === false || !is_dir($agentsRoot)) {
    http_response_code(500);
    echo json_encode(['error' => 'Diretório .agents não encontrado.'], JSON_UNESCAPED_UNICODE);
    exit;
}

function readText(string $path): string
{
    return is_file($path) ? (string) file_get_contents($path) : '';
}

function relativeTime(int $timestamp): string
{
    $seconds = max(0, time() - $timestamp);
    if ($seconds < 60) return 'agora';
    if ($seconds < 3600) return 'há ' . floor($seconds / 60) . ' min';
    if ($seconds < 86400) return 'há ' . floor($seconds / 3600) . ' h';
    return 'há ' . floor($seconds / 86400) . ' dias';
}

function markdownField(string $content, string $field): string
{
    $pattern = '/^\*\*' . preg_quote($field, '/') . ':\*\*\s*(.+)$/mi';
    return preg_match($pattern, $content, $match) ? trim($match[1]) : 'Não informado';
}

function cleanAgent(string $signature): string
{
    $signature = trim($signature, "[] \t\n\r\0\x0B");
    return trim(explode('/', $signature)[0]);
}

function protocolPath(string $root, string $path): string
{
    return $root . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $path);
}

$required = [
    'CORE_RULES.md', 'PROJECT_RULES.md', 'PROTOCOL_RULES.md', 'AGENTS_MAP.md',
    'sessions/active_sessions.md', 'decisions.jsonl', 'schemas/handoff.schema.json',
    'schemas/decisions.entry.schema.json',
];

$files = [];
foreach ($required as $relative) {
    $path = protocolPath($agentsRoot, $relative);
    $exists = is_file($path);
    $files[] = [
        'path' => '.agents/' . $relative,
        'exists' => $exists,
        'status' => $exists ? 'OK' : 'Ausente',
        'updated' => $exists ? relativeTime((int) filemtime($path)) : '—',
    ];
}

$decisions = [];
$decisionsPath = $agentsRoot . DIRECTORY_SEPARATOR . 'decisions.jsonl';
foreach (preg_split('/\R/', readText($decisionsPath)) ?: [] as $line) {
    $line = trim($line, "\xEF\xBB\xBF \t\n\r\0\x0B");
    if ($line === '') continue;
    $entry = json_decode($line, true);
    if (!is_array($entry)) continue;
    $date = isset($entry['timestamp']) ? strtotime((string) $entry['timestamp']) : false;
    $decisions[] = [
        'timestamp' => $entry['timestamp'] ?? '',
        'time' => $date ? date('H:i', $date) : '—',
        'id' => $date ? 'DEC-' . date('Ymd-His', $date) : 'DEC-' . count($decisions),
        'decision' => $entry['decision'] ?? 'Decisão sem descrição',
        'rationale' => $entry['rationale'] ?? '',
        'agent' => cleanAgent((string) ($entry['agent'] ?? 'unknown')),
        'files' => $entry['files_affected'] ?? [],
        'status' => $entry['status'] ?? 'unknown',
    ];
}
usort($decisions, fn(array $a, array $b): int => strcmp($b['timestamp'], $a['timestamp']));

$handoffs = [];
$localRoot = $agentsRoot . DIRECTORY_SEPARATOR . 'local';
$iterator = is_dir($localRoot)
    ? new RecursiveIteratorIterator(new RecursiveDirectoryIterator($localRoot, FilesystemIterator::SKIP_DOTS))
    : new EmptyIterator();
foreach ($iterator as $fileInfo) {
    if (!$fileInfo->isFile() || $fileInfo->getFilename() !== 'handoff.md') continue;
    $path = $fileInfo->getPathname();
    $relative = str_replace('\\', '/', substr($path, strlen($agentsRoot) + 1));
    $parts = explode('/', $relative);
    $content = readText($path);
    $handoffs[] = [
        'actor' => $parts[1] ?? 'unknown',
        'agent' => $parts[2] ?? cleanAgent(markdownField($content, 'Last Agent')),
        'path' => '.agents/' . $relative,
        'timestamp' => markdownField($content, 'Timestamp'),
        'status' => markdownField($content, 'Status'),
        'lastAction' => markdownField($content, 'Last Action'),
        'pendingStep' => markdownField($content, 'Pending Step'),
        'blockers' => markdownField($content, 'Blockers/Context'),
        'openThreads' => markdownField($content, 'Open Threads'),
        'updated' => relativeTime($fileInfo->getMTime()),
        'raw' => $content,
        '_mtime' => $fileInfo->getMTime(),
    ];
}
usort($handoffs, fn(array $a, array $b): int => $b['_mtime'] <=> $a['_mtime']);
foreach ($handoffs as &$handoff) unset($handoff['_mtime']);
unset($handoff);

$sessions = [];
$sessionsText = readText($agentsRoot . DIRECTORY_SEPARATOR . 'sessions' . DIRECTORY_SEPARATOR . 'active_sessions.md');
foreach (preg_split('/\R/', $sessionsText) ?: [] as $line) {
    if (!preg_match('/^\|(.+)\|$/', trim($line), $match)) continue;
    $columns = array_map('trim', explode('|', trim($match[1])));
    if (count($columns) !== 5 || $columns[0] === 'Session ID' || str_starts_with($columns[0], '---')) continue;
    $sessions[] = [
        'id' => $columns[0], 'agent' => cleanAgent($columns[1]), 'started' => $columns[2],
        'topic' => $columns[3], 'checkpoint' => $columns[4], 'status' => 'Ativo',
    ];
}

$topicOwners = [];
foreach ($sessions as $session) $topicOwners[$session['topic']][] = $session['agent'];
$conflicts = [];
foreach ($topicOwners as $topic => $owners) {
    if (count($owners) > 1) $conflicts[] = ['topic' => $topic, 'agents' => array_values(array_unique($owners))];
}

$projectRules = readText($agentsRoot . DIRECTORY_SEPARATOR . 'PROJECT_RULES.md');
$activeModules = [];
if (preg_match('/^- \*\*Active modules:\*\*\s*(.+)$/mi', $projectRules, $match)) {
    $declared = trim($match[1]);
    if ($declared !== '' && strtolower($declared) !== 'none' && !str_starts_with($declared, '[')) {
        $activeModules = array_values(array_filter(array_map('trim', explode(',', $declared))));
    }
}

$today = date('Y-m-d');
$todayDecisions = count(array_filter($decisions, fn(array $d): bool => str_starts_with($d['timestamp'], $today)));
$validCount = count(array_filter($files, fn(array $f): bool => $f['exists']));
$validPercent = count($files) ? (int) round(($validCount / count($files)) * 100) : 0;

echo json_encode([
    'generatedAt' => date(DATE_ATOM),
    'root' => '.agents',
    'metrics' => [
        'activeSessions' => count($sessions), 'todayDecisions' => $todayDecisions,
        'protocolPercent' => $validPercent, 'alerts' => count($conflicts),
    ],
    'protocolValid' => $validPercent === 100,
    'sessions' => $sessions,
    'agents' => array_map(fn(array $h): array => [
        'agent' => $h['agent'], 'actor' => $h['actor'], 'activity' => $h['updated'],
        'status' => $h['status'], 'scope' => $h['pendingStep'],
    ], $handoffs),
    'handoff' => $handoffs[0] ?? null,
    'handoffs' => $handoffs,
    'decisions' => $decisions,
    'files' => $files,
    'conflicts' => $conflicts,
    'rules' => [
        ['name' => 'PROTOCOL_RULES.md', 'precedence' => 1, 'exists' => is_file($agentsRoot . '/PROTOCOL_RULES.md')],
        ['name' => 'Active modules', 'precedence' => 2, 'exists' => true, 'modules' => $activeModules],
        ['name' => 'PROJECT_RULES.md', 'precedence' => 4, 'exists' => is_file($agentsRoot . '/PROJECT_RULES.md')],
    ],
    'validator' => [
        'passed' => $validCount, 'errors' => count($files) - $validCount,
        'checks' => $files,
    ],
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
