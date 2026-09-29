param(
    [string]$Python = 'D:\self\self_code_softwafe\python3.11_compiler_64bit\python311.exe',
    [switch]$SkipInstall,
    [switch]$Unpacked,
    [switch]$VerifyDesktop
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
function Invoke-Checked {
    param([string]$Command, [string[]]$Arguments)
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Command failed with exit code $LASTEXITCODE" }
}
Push-Location $PSScriptRoot
try {
    if (!(Test-Path -LiteralPath $Python)) { throw "Python 3.11 not found: $Python. Use -Python to select it." }
    $npm = (Get-Command npm.cmd -ErrorAction Stop).Source
    # Avoid embedded quotes in native arguments: Windows PowerShell 5.1 strips them.
    Invoke-Checked 'node' @('-e', 'const [major, minor] = process.versions.node.split(String.fromCharCode(46)).map(Number); process.exit(major > 22 || (major === 22 && minor >= 12) ? 0 : 1)')
    Invoke-Checked $Python @('-c', 'import sys; sys.exit(0 if sys.version_info[:2] == (3, 11) and sys.maxsize > 2**32 else 1)')
    $venv = Join-Path $PSScriptRoot '.venv-desktop'
    if (!(Test-Path "$venv/pyvenv.cfg")) { Invoke-Checked $Python @('-m', 'venv', $venv) }
    $buildPython = Join-Path $venv ('Scripts/' + [IO.Path]::GetFileName($Python))
    if (!(Test-Path $buildPython)) { $buildPython = Join-Path $venv 'Scripts/python.exe' }
    if (!$SkipInstall) {
        Invoke-Checked $buildPython @('-m', 'pip', 'install', '-r', 'coworker/requirements.txt', '-r', 'packaging/requirements-build.txt')
        Invoke-Checked $npm @('--prefix', 'surfaces_vue', 'ci', '--no-audit', '--no-fund', '--cache', (Join-Path $env:TEMP 'openworker-npm-cache'))
    }
    Invoke-Checked $buildPython @('packaging/make_icon.py')
    Invoke-Checked $buildPython @('-m', 'PyInstaller', '--noconfirm', '--clean', '--distpath', 'dist', '--workpath', 'build/pyinstaller', 'packaging/coworker.spec')
    Invoke-Checked $npm @('--prefix', 'surfaces_vue', 'run', 'build')
    Invoke-Checked $buildPython @('packaging/smoke_backend.py', 'dist/coworker-server/coworker-server.exe')
    $target = if ($Unpacked) { 'desktop:pack' } else { 'desktop:dist' }
    Invoke-Checked $npm @('--prefix', 'surfaces_vue', 'run', $target)
    if ($VerifyDesktop) {
        Invoke-Checked $buildPython @('packaging/smoke_desktop.py', 'dist/desktop/win-unpacked/AIWorker.exe')
    }
    Write-Host "Build complete: $PSScriptRoot\dist\desktop" -ForegroundColor Green
} finally { Pop-Location }
