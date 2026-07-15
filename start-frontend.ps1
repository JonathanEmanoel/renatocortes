$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontend = Join-Path $root "frontend"
$log = Join-Path $frontend "server.log"

Set-Location $frontend

"[$(Get-Date -Format o)] Starting Renato Cortes frontend on http://localhost:3000" | Out-File -FilePath $log -Encoding utf8

& node ".\node_modules\next\dist\bin\next" dev --hostname 0.0.0.0 --port 3000 *>> $log
