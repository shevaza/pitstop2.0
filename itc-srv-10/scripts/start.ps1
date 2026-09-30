$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
& node --env-file=.env src/server.mjs
exit $LASTEXITCODE
