#!/usr/bin/env pwsh

# BIANCE 后端快速验证脚本
# 用于快速检查系统关键功能是否正常

param(
    [string]$ServiceUrl = "",
    [switch]$Verbose = $false
)

Write-Host "🔍 BIANCE 后端快速验证脚本" -ForegroundColor Green

# 如果没有提供服务URL，尝试获取
if (-not $ServiceUrl) {
    try {
        $ServiceUrl = & gcloud run services describe biance-backend --region=asia-east1 --format="value(status.url)" 2>$null
        if (-not $ServiceUrl) {
            Write-Host "❌ 无法获取服务URL，请手动指定" -ForegroundColor Red
            exit 1
        }
    }
    catch {
        Write-Host "❌ 请先设置服务URL参数" -ForegroundColor Red
        Write-Host "用法: .\quick-verify.ps1 -ServiceUrl 'https://your-service-url'" -ForegroundColor Yellow
        exit 1
    }
}

Write-Host "📡 目标服务: $ServiceUrl" -ForegroundColor Cyan

# 验证计数器
$passed = 0
$failed = 0

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Path,
        [string]$Method = "GET",
        [hashtable]$Body = $null,
        [string]$ExpectedField = "ok"
    )
    
    try {
        $url = "$ServiceUrl$Path"
        Write-Host "🧪 测试: $Name" -ForegroundColor Yellow
        
        if ($Verbose) {
            Write-Host "   URL: $url" -ForegroundColor Gray
        }
        
        $params = @{
            Uri = $url
            Method = $Method
            TimeoutSec = 30
        }
        
        if ($Body) {
            $params.Body = ($Body | ConvertTo-Json)
            $params.ContentType = "application/json"
        }
        
        $response = Invoke-RestMethod @params
        
        if ($response.$ExpectedField -eq $true -or $response.$ExpectedField -eq "true") {
            Write-Host "✅ $Name 通过" -ForegroundColor Green
            $script:passed++
            return $true
        } else {
            Write-Host "❌ $Name 失败: $($response | ConvertTo-Json)" -ForegroundColor Red
            $script:failed++
            return $false
        }
    }
    catch {
        Write-Host "❌ $Name 异常: $($_.Exception.Message)" -ForegroundColor Red
        $script:failed++
        return $false
    }
}

# 1. 基础健康检查
Test-Endpoint -Name "基础健康检查" -Path "/health"

# 2. 依赖服务检查
Test-Endpoint -Name "依赖服务检查" -Path "/readyz"

# 3. 进程健康检查
Test-Endpoint -Name "进程健康检查" -Path "/livez"

# 4. Secret Manager 测试（安全模式）
Test-Endpoint -Name "Secret Manager 测试" -Path "/api/test/secrets?echo=false"

# 5. RSS 功能测试
Test-Endpoint -Name "RSS 功能测试" -Path "/api/test/simple-rss"

# 6. RSS 源配置
Test-Endpoint -Name "RSS 源配置" -Path "/api/rss/sources"

# 7. 监控指标
try {
    $metricsResponse = Invoke-WebRequest -Uri "$ServiceUrl/metrics" -TimeoutSec 30
    if ($metricsResponse.StatusCode -eq 200 -and $metricsResponse.Content -like "*system_mode*") {
        Write-Host "✅ 监控指标 通过" -ForegroundColor Green
        $passed++
    } else {
        Write-Host "❌ 监控指标 失败" -ForegroundColor Red
        $failed++
    }
}
catch {
    Write-Host "❌ 监控指标 异常: $($_.Exception.Message)" -ForegroundColor Red
    $failed++
}

# 8. 会话管理测试
$sessionCreated = Test-Endpoint -Name "会话创建" -Path "/api/session/start" -Method "POST" -Body @{
    config = @{
        capitalUsageLimitPct = 30
        maxLeverage = 3
        riskTolerance = "MEDIUM"
    }
}

if ($sessionCreated -and $sessionCreated.sessionId) {
    $sessionId = $sessionCreated.sessionId
    Write-Host "📝 会话ID: $sessionId" -ForegroundColor Cyan
    
    # 获取会话状态
    Test-Endpoint -Name "会话状态获取" -Path "/api/session/$sessionId/state"
    
    # 测试暂停功能
    Test-Endpoint -Name "会话暂停" -Path "/api/session/$sessionId/halt" -Method "POST"
    
    # 测试恢复功能
    Test-Endpoint -Name "会话恢复" -Path "/api/session/$sessionId/resume" -Method "POST"
}

# 9. RSS 到 AI 全链路测试
Test-Endpoint -Name "RSS 到 AI 全链路" -Path "/api/test/rss-to-ai" -Method "POST" -Body @{}

# 10. AI Trading Council 测试
Test-Endpoint -Name "AI Trading Council" -Path "/api/test/ai-council" -Method "POST" -Body @{
    testData = "quick_verify"
}

# 11. 模拟交易所事件
Test-Endpoint -Name "交易所事件模拟" -Path "/api/sim/exchange_event" -Method "POST" -Body @{
    source = "binance"
    status = "withdrawal_suspended"
}

# 12. 模拟账户变更
Test-Endpoint -Name "账户变更模拟" -Path "/api/sim/account" -Method "POST" -Body @{
    equityDelta = -1000
}

# 输出结果
Write-Host "`n📊 验证结果汇总:" -ForegroundColor Green
Write-Host "✅ 通过: $passed" -ForegroundColor Green
Write-Host "❌ 失败: $failed" -ForegroundColor Red

$total = $passed + $failed
if ($total -gt 0) {
    $successRate = [math]::Round(($passed / $total) * 100, 1)
    Write-Host "📈 成功率: $successRate%" -ForegroundColor Cyan
    
    if ($successRate -ge 90) {
        Write-Host "`n🎉 系统状态良好！" -ForegroundColor Green
        Write-Host "所有关键功能正常运行，可以投入使用。" -ForegroundColor Green
    } elseif ($successRate -ge 70) {
        Write-Host "`n⚠️  系统基本正常，但存在一些问题。" -ForegroundColor Yellow
        Write-Host "建议检查失败的测试项。" -ForegroundColor Yellow
    } else {
        Write-Host "`n❌ 系统存在问题，需要立即检查。" -ForegroundColor Red
        Write-Host "请查看失败的测试项并采取相应措施。" -ForegroundColor Red
    }
} else {
    Write-Host "`n❌ 无法执行任何测试" -ForegroundColor Red
}

# 提供建议
if ($failed -gt 0) {
    Write-Host "`n💡 故障排查建议:" -ForegroundColor Yellow
    Write-Host "1. 检查 Cloud Run 服务状态" -ForegroundColor White
    Write-Host "2. 验证 Secret Manager 权限" -ForegroundColor White
    Write-Host "3. 检查 Firestore 和 BigQuery 连接" -ForegroundColor White
    Write-Host "4. 查看服务日志: gcloud logging read 'resource.type=cloud_run_revision'" -ForegroundColor White
    Write-Host "5. 运行完整验收测试: node acceptance-test.js" -ForegroundColor White
}

Write-Host "`n🔗 相关链接:" -ForegroundColor Cyan
Write-Host "服务URL: $ServiceUrl" -ForegroundColor White
Write-Host "健康检查: $ServiceUrl/health" -ForegroundColor White
Write-Host "依赖检查: $ServiceUrl/readyz" -ForegroundColor White
Write-Host "监控指标: $ServiceUrl/metrics" -ForegroundColor White
