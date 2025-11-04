#!/usr/bin/env pwsh

# BIANCE 后端部署和验收测试脚本
# 按照验收清单 v2.0 执行完整部署和测试流程

param(
    [string]$ProjectId = "biance-476510",
    [string]$Region = "asia-east1",
    [string]$ServiceName = "biance-backend",
    [string]$ImageTag = "latest",
    [switch]$SkipBuild = $false,
    [switch]$SkipDeploy = $false,
    [switch]$SkipTest = $false,
    [switch]$DryRun = $false
)

Write-Host "🚀 BIANCE 后端部署和验收测试脚本" -ForegroundColor Green
Write-Host "项目: $ProjectId" -ForegroundColor Cyan
Write-Host "区域: $Region" -ForegroundColor Cyan
Write-Host "服务: $ServiceName" -ForegroundColor Cyan

# 设置错误处理
$ErrorActionPreference = "Stop"

# 检查必要工具
function Test-RequiredTools {
    Write-Host "`n🔍 检查必要工具..." -ForegroundColor Yellow
    
    $tools = @("gcloud", "docker", "node", "npm")
    foreach ($tool in $tools) {
        try {
            $version = & $tool --version 2>$null
            Write-Host "✅ $tool 已安装" -ForegroundColor Green
        }
        catch {
            Write-Host "❌ $tool 未安装或不在 PATH 中" -ForegroundColor Red
            exit 1
        }
    }
}

# 构建 Docker 镜像
function Build-DockerImage {
    if ($SkipBuild) {
        Write-Host "`n⏭️  跳过构建步骤" -ForegroundColor Yellow
        return
    }
    
    Write-Host "`n🔨 构建 Docker 镜像..." -ForegroundColor Yellow
    
    $imageName = "$Region-docker.pkg.dev/$ProjectId/biance-repo/backend"
    $imageTag = if ($ImageTag -eq "latest") { "latest" } else { $ImageTag }
    
    Write-Host "镜像名称: $imageName:$imageTag" -ForegroundColor Cyan
    
    # 构建镜像
    docker build -t "$imageName:$imageTag" .
    if ($LASTEXITCODE -ne 0) {
        throw "Docker 构建失败"
    }
    
    Write-Host "✅ Docker 镜像构建成功" -ForegroundColor Green
}

# 部署到 Cloud Run
function Deploy-ToCloudRun {
    if ($SkipDeploy) {
        Write-Host "`n⏭️  跳过部署步骤" -ForegroundColor Yellow
        return
    }
    
    Write-Host "`n🚀 部署到 Cloud Run..." -ForegroundColor Yellow
    
    $imageName = "$Region-docker.pkg.dev/$ProjectId/biance-repo/backend:$ImageTag"
    
    $deployArgs = @(
        "run", "deploy", $ServiceName,
        "--image", $imageName,
        "--region", $Region,
        "--platform", "managed",
        "--allow-unauthenticated",
        "--service-account", "biance-ai@$ProjectId.iam.gserviceaccount.com",
        "--set-env-vars", "GOOGLE_CLOUD_PROJECT=$ProjectId",
        "--min-instances", "1",
        "--max-instances", "10",
        "--memory", "1Gi",
        "--cpu", "1",
        "--timeout", "300",
        "--concurrency", "100"
    )
    
    if ($DryRun) {
        Write-Host "🔍 干运行模式 - 部署命令:" -ForegroundColor Yellow
        Write-Host "gcloud $($deployArgs -join ' ')" -ForegroundColor Cyan
        return
    }
    
    # 执行部署
    & gcloud $deployArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Cloud Run 部署失败"
    }
    
    Write-Host "✅ Cloud Run 部署成功" -ForegroundColor Green
    
    # 获取服务 URL
    $serviceUrl = & gcloud run services describe $ServiceName --region=$Region --format="value(status.url)"
    Write-Host "服务 URL: $serviceUrl" -ForegroundColor Cyan
    
    return $serviceUrl
}

# 验证 Secret Manager
function Test-SecretManager {
    Write-Host "`n🔐 验证 Secret Manager..." -ForegroundColor Yellow
    
    $secrets = @("DEEPSEEK_API_KEY", "GEMINI_API_KEY", "GPT_API_KEY", "RSS_PROXY_URL")
    
    foreach ($secret in $secrets) {
        try {
            $versions = & gcloud secrets versions list $secret --format="value(state)" 2>$null
            if ($versions -contains "ENABLED") {
                Write-Host "✅ $secret 已启用" -ForegroundColor Green
            } else {
                Write-Host "❌ $secret 未启用或不存在" -ForegroundColor Red
                return $false
            }
        }
        catch {
            Write-Host "❌ $secret 检查失败: $_" -ForegroundColor Red
            return $false
        }
    }
    
    return $true
}

# 验证 BigQuery 审计表
function Test-BigQueryAudit {
    Write-Host "`n📊 验证 BigQuery 审计表..." -ForegroundColor Yellow
    
    $tables = @("mode_transitions", "risk_decisions", "trades", "shadow_ledger", "evidence_bundles")
    
    foreach ($table in $tables) {
        try {
            $query = "SELECT COUNT(*) as count FROM `$ProjectId.audit.$table` WHERE DATE(TIMESTAMP_MILLIS(ts_utc_ms)) >= DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY)"
            $result = & gcloud bq query --use_legacy_sql=false --format=json $query 2>$null
            
            if ($LASTEXITCODE -eq 0) {
                Write-Host "✅ $table 表存在且可查询" -ForegroundColor Green
            } else {
                Write-Host "❌ $table 表检查失败" -ForegroundColor Red
                return $false
            }
        }
        catch {
            Write-Host "❌ $table 表检查异常: $_" -ForegroundColor Red
            return $false
        }
    }
    
    return $true
}

# 运行验收测试
function Run-AcceptanceTests {
    if ($SkipTest) {
        Write-Host "`n⏭️  跳过测试步骤" -ForegroundColor Yellow
        return
    }
    
    Write-Host "`n🧪 运行验收测试..." -ForegroundColor Yellow
    
    # 获取服务 URL
    $serviceUrl = & gcloud run services describe $ServiceName --region=$Region --format="value(status.url)"
    
    if (-not $serviceUrl) {
        throw "无法获取服务 URL"
    }
    
    Write-Host "测试目标: $serviceUrl" -ForegroundColor Cyan
    
    # 设置环境变量并运行测试
    $env:BACKEND_URL = $serviceUrl
    
    # 运行 Node.js 验收测试
    node acceptance-test.js
    
    if ($LASTEXITCODE -ne 0) {
        throw "验收测试失败"
    }
    
    Write-Host "✅ 验收测试通过" -ForegroundColor Green
}

# 生成部署报告
function Generate-DeploymentReport {
    Write-Host "`n📋 生成部署报告..." -ForegroundColor Yellow
    
    $serviceUrl = & gcloud run services describe $ServiceName --region=$Region --format="value(status.url)"
    $serviceInfo = & gcloud run services describe $ServiceName --region=$Region --format=json | ConvertFrom-Json
    
    $report = @{
        timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        project = $ProjectId
        region = $Region
        service = $ServiceName
        url = $serviceUrl
        image = $serviceInfo.spec.template.spec.containers[0].image
        minInstances = $serviceInfo.spec.template.metadata.annotations.'run.googleapis.com/min-instances'
        maxInstances = $serviceInfo.spec.template.spec.containerConcurrency
        memory = $serviceInfo.spec.template.spec.containers[0].resources.limits.memory
        cpu = $serviceInfo.spec.template.spec.containers[0].resources.limits.cpu
        timeout = $serviceInfo.spec.template.spec.timeoutSeconds
    }
    
    Write-Host "`n📊 部署报告:" -ForegroundColor Green
    Write-Host "时间: $($report.timestamp)" -ForegroundColor White
    Write-Host "项目: $($report.project)" -ForegroundColor White
    Write-Host "区域: $($report.region)" -ForegroundColor White
    Write-Host "服务: $($report.service)" -ForegroundColor White
    Write-Host "URL: $($report.url)" -ForegroundColor White
    Write-Host "镜像: $($report.image)" -ForegroundColor White
    Write-Host "最小实例: $($report.minInstances)" -ForegroundColor White
    Write-Host "最大实例: $($report.maxInstances)" -ForegroundColor White
    Write-Host "内存: $($report.memory)" -ForegroundColor White
    Write-Host "CPU: $($report.cpu)" -ForegroundColor White
    Write-Host "超时: $($report.timeout)s" -ForegroundColor White
}

# 主执行流程
try {
    # 1. 检查工具
    Test-RequiredTools
    
    # 2. 验证 Secret Manager
    if (-not (Test-SecretManager)) {
        throw "Secret Manager 验证失败"
    }
    
    # 3. 验证 BigQuery
    if (-not (Test-BigQueryAudit)) {
        throw "BigQuery 审计表验证失败"
    }
    
    # 4. 构建镜像
    Build-DockerImage
    
    # 5. 部署到 Cloud Run
    $serviceUrl = Deploy-ToCloudRun
    
    # 6. 等待服务就绪
    if (-not $DryRun -and $serviceUrl) {
        Write-Host "`n⏳ 等待服务就绪..." -ForegroundColor Yellow
        Start-Sleep -Seconds 30
        
        # 检查健康状态
        try {
            $healthResponse = Invoke-RestMethod -Uri "$serviceUrl/health" -TimeoutSec 30
            if ($healthResponse.ok) {
                Write-Host "✅ 服务健康检查通过" -ForegroundColor Green
            } else {
                throw "服务健康检查失败"
            }
        }
        catch {
            Write-Host "⚠️  服务可能还在启动中，继续执行测试..." -ForegroundColor Yellow
        }
    }
    
    # 7. 运行验收测试
    Run-AcceptanceTests
    
    # 8. 生成报告
    Generate-DeploymentReport
    
    Write-Host "`n🎉 部署和验收测试完成！" -ForegroundColor Green
    Write-Host "系统已达到生产标准，可以投入使用。" -ForegroundColor Green
    
}
catch {
    Write-Host "`n❌ 部署失败: $_" -ForegroundColor Red
    Write-Host "请检查错误信息并重试。" -ForegroundColor Red
    exit 1
}
