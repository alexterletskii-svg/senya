'use strict';

const { spawn } = require('node:child_process');

const PS_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type @"
using System.Runtime.InteropServices;
public class SenyaQ { [DllImport("shell32.dll")] public static extern int SHQueryUserNotificationState(out int s); }
"@
function Test-Mic {
  $base = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone'
  foreach ($root in @($base, "$base\\NonPackaged")) {
    if (-not (Test-Path $root)) { continue }
    foreach ($k in Get-ChildItem $root) {
      $v = Get-ItemProperty $k.PSPath
      if ($v.LastUsedTimeStart -gt 0 -and $v.LastUsedTimeStop -eq 0) { return $true }
    }
  }
  return $false
}
while ($true) {
  $s = 0
  [void][SenyaQ]::SHQueryUserNotificationState([ref]$s)
  $m = 0; if (Test-Mic) { $m = 1 }
  [Console]::Out.WriteLine("quns=$s mic=$m")
  [Console]::Out.Flush()
  Start-Sleep -Seconds 5
}
`;

function parseLine(line) {
  const m = /^quns=(\d+)\s+mic=([01])\s*$/.exec(String(line).trim());
  if (!m) return null;
  return { quns: Number(m[1]), mic: m[2] === '1' };
}

function decide({ quns, mic }) {
  if (quns === 4) return { dnd: true, hide: true, reason: 'presentation' };
  if (quns === 2 || quns === 3 || quns === 7) return { dnd: true, hide: true, reason: 'fullscreen' };
  if (mic) return { dnd: true, hide: false, reason: 'call' };
  return { dnd: false, hide: false, reason: '' };
}

function startFocusGuard(onChange, { platform = process.platform, spawnFn = spawn } = {}) {
  if (platform !== 'win32') return () => {};
  let last = '';
  let buf = '';
  let child;
  try {
    const encoded = Buffer.from(PS_SCRIPT, 'utf16le').toString('base64');
    child = spawnFn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return () => {};
  }
  child.on('error', () => {});
  child.stdout.on('data', (chunk) => {
    buf += chunk.toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const parsed = parseLine(buf.slice(0, i));
      buf = buf.slice(i + 1);
      if (!parsed) continue;
      const d = decide(parsed);
      const key = `${d.dnd}|${d.hide}|${d.reason}`;
      if (key !== last) {
        last = key;
        onChange(d);
      }
    }
  });
  return () => {
    try { child.kill(); } catch {  }
  };
}

module.exports = { startFocusGuard, parseLine, decide, PS_SCRIPT };
