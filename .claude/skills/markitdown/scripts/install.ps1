$ErrorActionPreference = 'Stop'

$skill = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$source = Join-Path $skill '.upstream'
$venv = Join-Path $skill '.venv'

if (-not (Test-Path -LiteralPath (Join-Path $source 'packages/markitdown/pyproject.toml'))) {
    if (Test-Path -LiteralPath $source) {
        throw "Thu muc $source da ton tai nhung khong phai repo MarkItDown hop le."
    }
    gh repo clone microsoft/markitdown $source -- --depth 1
    if ($LASTEXITCODE -ne 0) { throw 'Khong clone duoc microsoft/markitdown.' }
}

if (-not (Test-Path -LiteralPath (Join-Path $venv 'Scripts/python.exe'))) {
    python -m venv $venv
    if ($LASTEXITCODE -ne 0) { throw 'Khong tao duoc moi truong Python.' }
}

$python = Join-Path $venv 'Scripts/python.exe'
$package = Join-Path $source 'packages/markitdown'
& $python -m pip install -e "${package}[all]"
if ($LASTEXITCODE -ne 0) { throw 'Khong cai dat duoc MarkItDown.' }

& $python -m markitdown --version
if ($LASTEXITCODE -ne 0) { throw 'MarkItDown chua chay duoc.' }
