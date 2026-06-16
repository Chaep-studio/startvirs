# 推送到 startvirs 仓库的 trae/solo-agent-vdfB3j 分支
# 直接运行：powershell -ExecutionPolicy Bypass -File push-to-github.ps1

$ErrorActionPreference = 'Stop'
Set-Location "c:\Users\Administrator\Downloads\startvirs-trae-solo-agent-vdfB3j (2)\startup-agent"

Write-Host ""
Write-Host "=== Current dir ===" -ForegroundColor Cyan
Get-Location
Write-Host ""

Write-Host "=== 1. git user config ===" -ForegroundColor Cyan
git config user.name "chaep" 2>&1 | Out-Null
git config user.email "chaep@users.noreply.github.com" 2>&1 | Out-Null
Write-Host "user.name  = $(git config user.name)"
Write-Host "user.email = $(git config user.email)"
Write-Host ""

Write-Host "=== 2. .env safety check ===" -ForegroundColor Cyan
git check-ignore .env 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0)
{
    Write-Host "PASS: .env is gitignored" -ForegroundColor Green
}
else
{
    Write-Host "FAIL: .env is NOT ignored, abort" -ForegroundColor Red
    exit 1
}
Write-Host ""

Write-Host "=== 3. git add . ===" -ForegroundColor Cyan
git add . 2>&1 | Out-Null
$staged = (git diff --cached --name-only 2>&1 | Measure-Object).Count
Write-Host "Staged $staged entries"
Write-Host ""

Write-Host "=== 4. Preview (first 30 entries) ===" -ForegroundColor Cyan
git diff --cached --name-only 2>&1 | Select-Object -First 30
Write-Host "..."
Write-Host ""

# 检查 .env 是否真的没在暂存里
$envInIndex = git diff --cached --name-only 2>&1 | Select-String -Pattern '^\.env$' -SimpleMatch
if ($envInIndex)
{
    Write-Host "FATAL: .env is staged for commit. Aborting." -ForegroundColor Red
    git reset 2>&1 | Out-Null
    exit 1
}
Write-Host "Verified: .env NOT in staging area" -ForegroundColor Green
Write-Host ""

Write-Host "=== 5. commit ===" -ForegroundColor Cyan
git commit -m "Initial commit: startup-agent with memory/diff/compaction/multi-agent"
if ($LASTEXITCODE -ne 0)
{
    Write-Host "Commit failed (maybe nothing to commit)" -ForegroundColor Yellow
}
else
{
    Write-Host "OK"
}
Write-Host ""

Write-Host "=== 6. branch rename to trae/solo-agent-vdfB3j ===" -ForegroundColor Cyan
$current = git branch --show-current
if ($current -ne "trae/solo-agent-vdfB3j")
{
    git branch -m trae/solo-agent-vdfB3j
    Write-Host "OK"
}
else
{
    Write-Host "Already named"
}
Write-Host ""

Write-Host "=== 7. add remote ===" -ForegroundColor Cyan
$existingRemote = git remote get-url origin 2>$null
if (-not $existingRemote)
{
    git remote add origin https://github.com/Chaep-studio/startvirs.git
    Write-Host "OK: added"
}
else
{
    Write-Host "Already: $existingRemote"
}
Write-Host ""

Write-Host "=== 8. push to remote ===" -ForegroundColor Cyan
Write-Host "Will prompt GitHub login (need write on Chaep-studio)" -ForegroundColor Yellow
Write-Host ""
git push -u origin trae/solo-agent-vdfB3j
Write-Host ""

if ($LASTEXITCODE -eq 0)
{
    Write-Host ""
    Write-Host "=== DONE ===" -ForegroundColor Green
    Write-Host "View: https://github.com/Chaep-studio/startvirs/tree/trae/solo-agent-vdfB3j"
}
else
{
    Write-Host ""
    Write-Host "=== PUSH FAILED ===" -ForegroundColor Red
    Write-Host "Common causes:"
    Write-Host "  1. No write access to Chaep-studio/startvirs"
    Write-Host "  2. Need Personal Access Token (password auth removed)"
    Write-Host "  3. Non-fast-forward (run: git push -u origin trae/solo-agent-vdfB3j --force)"
}
