param(
    [string]$Bucket = $env:FRONTEND_BUCKET
)

if ([string]::IsNullOrWhiteSpace($Bucket)) {
    $Bucket = "gs://biance-bucket/jingyang/"
}

if (-not ($Bucket.StartsWith("gs://"))) {
    Write-Error "Bucket 路径必须以 gs:// 开头：$Bucket"
    exit 1
}

npm install
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Error "Build failed"
    exit $LASTEXITCODE
}
if (-not (Test-Path -Path "dist")) {
    Write-Error "dist directory not found"
    exit 1
}

Write-Host "Syncing dist to $Bucket" -ForegroundColor Cyan
gsutil -m rsync -r dist $Bucket
