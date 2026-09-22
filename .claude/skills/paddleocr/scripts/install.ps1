$ErrorActionPreference = 'Stop'

$skill = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$source = Join-Path $skill '.upstream'
$bootstrap = Join-Path $skill '.bootstrap'
$pythonStore = Join-Path $skill '.python'
$venv = Join-Path $skill '.venv'
$tag = 'v3.7.0'
$commit = 'b03f46425e8ff4442b268ce449e3eef758146cd4'

if (-not (Test-Path -LiteralPath (Join-Path $source 'paddleocr/__init__.py'))) {
    if (Test-Path -LiteralPath $source) {
        throw "Thu muc $source da ton tai nhung khong phai repo PaddleOCR hop le."
    }
    gh repo clone PaddlePaddle/PaddleOCR $source -- --depth 1 --branch $tag
    if ($LASTEXITCODE -ne 0) { throw 'Khong clone duoc PaddlePaddle/PaddleOCR.' }
}

$head = (& git -C $source rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $head -ne $commit) {
    throw "Repo PaddleOCR tai $source khong o dung tag $tag ($commit)."
}

if (-not (Test-Path -LiteralPath (Join-Path $bootstrap 'Scripts/python.exe'))) {
    python -m venv $bootstrap
    if ($LASTEXITCODE -ne 0) { throw 'Khong tao duoc moi truong bootstrap Python.' }
}

$bootstrapPython = Join-Path $bootstrap 'Scripts/python.exe'
& $bootstrapPython -m pip install 'uv==0.12.17'
if ($LASTEXITCODE -ne 0) { throw 'Khong cai dat duoc uv.' }

$uv = Join-Path $bootstrap 'Scripts/uv.exe'
$env:UV_PYTHON_INSTALL_DIR = $pythonStore
& $uv python install 3.13.15
if ($LASTEXITCODE -ne 0) { throw 'Khong cai dat duoc Python 3.13.15.' }

if (-not (Test-Path -LiteralPath (Join-Path $venv 'Scripts/python.exe'))) {
    & $uv venv --python 3.13.15 --python-preference only-managed $venv
    if ($LASTEXITCODE -ne 0) { throw 'Khong tao duoc moi truong PaddleOCR.' }
}

$python = Join-Path $venv 'Scripts/python.exe'
& $uv pip install --python $python 'paddlepaddle==3.3.1'
if ($LASTEXITCODE -ne 0) { throw 'Khong cai dat duoc PaddlePaddle CPU.' }

& $uv pip install --python $python -e "${source}[doc-parser]"
if ($LASTEXITCODE -ne 0) { throw 'Khong cai dat duoc PaddleOCR doc-parser.' }

& $python -c 'import paddle, paddleocr; from paddleocr import PPStructureV3; print(paddle.__version__, paddle.device.get_device(), paddleocr.__version__, PPStructureV3.__name__)'
if ($LASTEXITCODE -ne 0) { throw 'PaddleOCR chua khoi tao duoc.' }
