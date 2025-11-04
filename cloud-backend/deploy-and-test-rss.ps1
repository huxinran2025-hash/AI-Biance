#!/usr/bin/env pwsh

# RSS系统部署和测试脚本
# 使用 Artifact Registry 完成部署和验证

param(
    [string]$ProjectId = "biance-476510",
    [string]$Region = "asia-east1",
    [string]$ServiceName = "biance-backend",
    [string]$ServiceUrl = "https://biance-backend-495185885743.asia-east1.run.app"
)

Write-Host "🚀 RSS系统部署和测试脚本" -ForegroundColor Green
Write-Host "项目: $ProjectId" -ForegroundColor Cyan
Write-Host "区域: $Region" -ForegroundColor Cyan
Write-Host "服务: $ServiceName" -ForegroundColor Cyan
Write-Host ""

# 设置错误处理
$ErrorActionPreference = "Stop"

# 1. 构建和部署
Write-Host "📦 步骤1: 构建和部署到Artifact Registry..." -ForegroundColor Yellow
try {
    $buildOutput = gcloud builds submit --config cloud-backend\cloudbuild-simple.yaml --project $ProjectId 2>&1
    Write-Host $buildOutput
    
    if ($LASTEXITCODE -ne 0) {
        throw "构建失败"
    }
    Write-Host "✅ 构建和部署成功" -ForegroundColor Green
} catch {
    Write-Host "❌ 构建失败: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "⏳ 等待服务就绪..." -ForegroundColor Yellow
Start-Sleep -Seconds 30

# 2. 验证服务健康状态
Write-Host ""
Write-Host "🔍 步骤2: 验证服务健康状态..." -ForegroundColor Yellow
try {
    $healthResponse = Invoke-RestMethod -Uri "$ServiceUrl/health" -Method GET -TimeoutSec 30
    if ($healthResponse.ok) {
        Write-Host "✅ 服务健康检查通过" -ForegroundColor Green
        Write-Host "   版本: $($healthResponse.version)" -ForegroundColor Cyan
    } else {
        throw "健康检查返回false"
    }
} catch {
    Write-Host "⚠️  健康检查失败: $_" -ForegroundColor Yellow
    Write-Host "   服务可能还在启动中，继续测试..." -ForegroundColor Yellow
}

# 3. 测试RSS源配置端点
Write-Host ""
Write-Host "🔍 步骤3: 测试RSS源配置..." -ForegroundColor Yellow
try {
    $sourcesResponse = Invoke-RestMethod -Uri "$ServiceUrl/api/rss/sources" -Method GET -TimeoutSec 30
    if ($sourcesResponse.ok) {
        Write-Host "✅ RSS源配置端点正常" -ForegroundColor Green
        Write-Host "   总源数: $($sourcesResponse.sources.Count)" -ForegroundColor Cyan
        $criticalCount = ($sourcesResponse.sources | Where-Object { $_.critical -eq $true }).Count
        Write-Host "   关键源: $criticalCount" -ForegroundColor Cyan
    } else {
        throw "RSS源配置端点返回false"
    }
} catch {
    Write-Host "❌ RSS源配置测试失败: $_" -ForegroundColor Red
}

# 4. 测试新的RSS事件端点
Write-Host ""
Write-Host "🔍 步骤4: 测试RSS事件端点..." -ForegroundColor Yellow
try {
    $eventsResponse = Invoke-RestMethod -Uri "$ServiceUrl/api/rss/events?since=0&limit=5" -Method GET -TimeoutSec 30
    if ($eventsResponse.ok) {
        Write-Host "✅ RSS事件端点正常" -ForegroundColor Green
        Write-Host "   事件数: $($eventsResponse.articles.Count)" -ForegroundColor Cyan
        Write-Host "   缓存时间戳: $($eventsResponse.cacheTimestamp)" -ForegroundColor Cyan
        
        if ($eventsResponse.articles.Count -gt 0) {
            Write-Host ""
            Write-Host "   最新事件示例:" -ForegroundColor Cyan
            $eventsResponse.articles[0..2] | ForEach-Object {
                Write-Host "   - [$($_.severity)] $($_.topic): $($_.title)" -ForegroundColor White
            }
        }
    } else {
        throw "RSS事件端点返回false"
    }
} catch {
    Write-Host "❌ RSS事件端点测试失败: $_" -ForegroundColor Red
    Write-Host "   这可能是新功能，需要等待部署完成" -ForegroundColor Yellow
}

# 5. 测试单个RSS源
Write-Host ""
Write-Host "🔍 步骤5: 测试单个RSS源..." -ForegroundColor Yellow
try {
    $testSource = "bitcoin-magazine"
    $sourceResponse = Invoke-RestMethod -Uri "$ServiceUrl/api/test/rss-source?source=$testSource" -Method GET -TimeoutSec 30
    if ($sourceResponse.ok) {
        Write-Host "✅ 单个RSS源测试通过 ($testSource)" -ForegroundColor Green
        Write-Host "   文章数: $($sourceResponse.results.articleCount)" -ForegroundColor Cyan
    } else {
        throw "单个RSS源测试返回false"
    }
} catch {
    Write-Host "⚠️  单个RSS源测试失败: $_" -ForegroundColor Yellow
}

# 6. 获取服务信息
Write-Host ""
Write-Host "📊 步骤6: 获取服务信息..." -ForegroundColor Yellow
try {
    $serviceInfo = gcloud run services describe $ServiceName --region=$Region --format=json --project=$ProjectId | ConvertFrom-Json
    Write-Host "✅ 服务信息获取成功" -ForegroundColor Green
    Write-Host "   URL: $($serviceInfo.status.url)" -ForegroundColor Cyan
    Write-Host "   最新版本: $($serviceInfo.status.latestReadyRevisionName)" -ForegroundColor Cyan
    Write-Host "   状态: $($serviceInfo.status.conditions[0].status)" -ForegroundColor Cyan
} catch {
    Write-Host "⚠️  获取服务信息失败: $_" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "🎉 部署和测试完成！" -ForegroundColor Green
Write-Host ""
Write-Host "📋 可用端点:" -ForegroundColor Yellow
Write-Host "   健康检查: $ServiceUrl/health" -ForegroundColor White
Write-Host "   RSS源配置: $ServiceUrl/api/rss/sources" -ForegroundColor White
Write-Host "   RSS事件: $ServiceUrl/api/rss/events?since=0&limit=10" -ForegroundColor White
Write-Host "   测试单个源: $ServiceUrl/api/test/rss-source?source=bitcoin-magazine" -ForegroundColor White

