#!/usr/bin/env node

/**
 * BIANCE 后端部署完整性验收测试脚本
 * 按照验收清单 v2.0 逐项验证系统功能
 */

import https from 'https';
import http from 'http';

// 配置
const CONFIG = {
  baseUrl: process.env.BACKEND_URL || 'https://biance-backend-*.asia-east1.run.app',
  timeout: 30000,
  retries: 3
};

// 测试结果
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

// 工具函数
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https://');
    const client = isHttps ? https : http;
    
    const req = client.request(url, {
      timeout: CONFIG.timeout,
      ...options
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({ status: res.statusCode, data: jsonData, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data: data, headers: res.headers });
        }
      });
    });
    
    req.on('error', reject);
    req.on('timeout', () => reject(new Error('Request timeout')));
    
    if (options.body) {
      req.write(options.body);
    }
    
    req.end();
  });
}

// 测试函数
async function runTest(name, testFn) {
  console.log(`\n🧪 测试: ${name}`);
  try {
    await testFn();
    console.log(`✅ 通过: ${name}`);
    results.passed++;
    results.tests.push({ name, status: 'PASSED' });
  } catch (error) {
    console.log(`❌ 失败: ${name} - ${error.message}`);
    results.failed++;
    results.tests.push({ name, status: 'FAILED', error: error.message });
  }
}

// 1. Cloud Run 服务健康检查
async function testCloudRunHealth() {
  const response = await makeRequest(`${CONFIG.baseUrl}/health`);
  
  if (response.status !== 200) {
    throw new Error(`Health check returned ${response.status}`);
  }
  
  if (!response.data.ok) {
    throw new Error('Health check returned ok: false');
  }
  
  if (!response.data.version) {
    throw new Error('Missing version in health response');
  }
  
  if (!response.data.boot_ts) {
    throw new Error('Missing boot_ts in health response');
  }
  
  console.log(`   版本: ${response.data.version}`);
  console.log(`   启动时间: ${new Date(response.data.boot_ts).toISOString()}`);
}

// 2. Secret Manager 测试
async function testSecretManager() {
  // 测试不回显模式（安全）- 应该返回masked值
  const response = await makeRequest(`${CONFIG.baseUrl}/api/test/secrets?echo=false`);
  
  if (response.status !== 200) {
    throw new Error(`Secrets test returned ${response.status}`);
  }
  
  if (!response.data.ok) {
    throw new Error('Secrets test returned ok: false');
  }
  
  const secrets = response.data.secrets;
  const requiredSecrets = ['DEEPSEEK_API_KEY', 'GEMINI_API_KEY', 'GPT_API_KEY', 'RSS_PROXY_URL'];
  
  // 在echo=false模式下，应该返回masked值
  for (const secret of requiredSecrets) {
    if (!secrets[secret]) {
      throw new Error(`Secret ${secret} missing`);
    }
    // 检查是否为masked值（这是正确的安全行为）
    if (secrets[secret] !== '***masked***') {
      // 如果有实际值，说明echo=true，这也是可以的
      if (secrets[secret].length < 10) {
        throw new Error(`Secret ${secret} appears to be invalid`);
      }
    }
  }
  
  console.log(`   已加载 ${Object.keys(secrets).length} 个密钥`);
}

// 3. 依赖检查
async function testDependencies() {
  const response = await makeRequest(`${CONFIG.baseUrl}/readyz`);
  
  if (response.status !== 200) {
    throw new Error(`Dependencies check returned ${response.status}`);
  }
  
  if (!response.data.ok) {
    throw new Error('Dependencies check returned ok: false');
  }
  
  const checks = response.data.checks;
  const requiredChecks = ['secrets', 'firestore', 'bigquery', 'rss_proxy'];
  
  for (const check of requiredChecks) {
    if (!checks[check]) {
      throw new Error(`Dependency check failed: ${check}`);
    }
  }
  
  console.log(`   所有依赖检查通过: ${Object.keys(checks).join(', ')}`);
}

// 4. RSS 功能测试
async function testRSSFunctionality() {
  const response = await makeRequest(`${CONFIG.baseUrl}/api/test/simple-rss`);
  
  if (response.status !== 200) {
    throw new Error(`RSS test returned ${response.status}`);
  }
  
  if (!response.data.ok) {
    throw new Error('RSS test returned ok: false');
  }
  
  if (response.data.xmlLength < 100) {
    throw new Error('RSS XML too short, possible fetch failure');
  }
  
  console.log(`   RSS 抓取成功: ${response.data.titleCount} 个标题`);
}

// 5. RSS 到 AI 全链路测试
async function testRSSToAI() {
  const response = await makeRequest(`${CONFIG.baseUrl}/api/test/rss-to-ai`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  
  if (response.status !== 200) {
    throw new Error(`RSS-to-AI test returned ${response.status}`);
  }
  
  if (!response.data.ok) {
    throw new Error('RSS-to-AI test returned ok: false');
  }
  
  const steps = response.data.steps;
  if (!steps.rss_fetch.success || !steps.ai_analysis.success || !steps.bigquery_logging.success) {
    throw new Error('RSS-to-AI flow steps failed');
  }
  
  console.log(`   全链路测试通过: ${response.data.data.summary.totalArticles} 篇文章处理`);
}

// 6. AI Trading Council 测试
async function testAICouncil() {
  const response = await makeRequest(`${CONFIG.baseUrl}/api/test/ai-council`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ testData: 'performance_test' })
  });
  
  if (response.status !== 200) {
    throw new Error(`AI Council test returned ${response.status}`);
  }
  
  if (!response.data.ok) {
    throw new Error('AI Council test returned ok: false');
  }
  
  const council = response.data.aiCouncil;
  if (council.modelsSuccessful < 2) {
    throw new Error(`Only ${council.modelsSuccessful}/${council.modelsTested} AI models successful`);
  }
  
  console.log(`   AI Council: ${council.modelsSuccessful}/${council.modelsTested} 模型成功`);
}

// 7. 监控指标测试
async function testMetrics() {
  const response = await makeRequest(`${CONFIG.baseUrl}/metrics`);
  
  if (response.status !== 200) {
    throw new Error(`Metrics endpoint returned ${response.status}`);
  }
  
  if (!response.data.includes('system_mode')) {
    throw new Error('Metrics missing system_mode');
  }
  
  if (!response.data.includes('auto_brake_triggered')) {
    throw new Error('Metrics missing auto_brake_triggered');
  }
  
  console.log(`   监控指标端点正常`);
}

// 8. 会话管理测试
async function testSessionManagement() {
  // 创建会话
  const createResponse = await makeRequest(`${CONFIG.baseUrl}/api/session/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      config: {
        capitalUsageLimitPct: 30,
        maxLeverage: 3,
        riskTolerance: 'MEDIUM'
      }
    })
  });
  
  if (createResponse.status !== 200) {
    throw new Error(`Session creation returned ${createResponse.status}`);
  }
  
  const sessionId = createResponse.data.sessionId;
  console.log(`   会话创建成功: ${sessionId}`);
  
  // 获取会话状态
  const stateResponse = await makeRequest(`${CONFIG.baseUrl}/api/session/${sessionId}/state`);
  
  if (stateResponse.status !== 200) {
    throw new Error(`Session state returned ${stateResponse.status}`);
  }
  
  if (!stateResponse.data.config || !stateResponse.data.runtimeState || !stateResponse.data.safetyState) {
    throw new Error('Session state missing required data');
  }
  
  console.log(`   会话状态获取成功`);
  
  // 测试暂停/恢复
  const haltResponse = await makeRequest(`${CONFIG.baseUrl}/api/session/${sessionId}/halt`, {
    method: 'POST'
  });
  
  if (haltResponse.status !== 200) {
    throw new Error(`Session halt returned ${haltResponse.status}`);
  }
  
  const resumeResponse = await makeRequest(`${CONFIG.baseUrl}/api/session/${sessionId}/resume`, {
    method: 'POST'
  });
  
  if (resumeResponse.status !== 200) {
    throw new Error(`Session resume returned ${resumeResponse.status}`);
  }
  
  console.log(`   会话暂停/恢复功能正常`);
}

// 9. 模拟交易所事件测试
async function testExchangeEventSimulation() {
  const response = await makeRequest(`${CONFIG.baseUrl}/api/sim/exchange_event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: 'binance',
      status: 'withdrawal_suspended'
    })
  });
  
  if (response.status !== 200) {
    throw new Error(`Exchange event simulation returned ${response.status}`);
  }
  
  if (!response.data.ok) {
    throw new Error('Exchange event simulation returned ok: false');
  }
  
  console.log(`   交易所事件模拟成功`);
}

// 10. 模拟账户变更测试
async function testAccountChangeSimulation() {
  const response = await makeRequest(`${CONFIG.baseUrl}/api/sim/account`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      equityDelta: -5000
    })
  });
  
  if (response.status !== 200) {
    throw new Error(`Account change simulation returned ${response.status}`);
  }
  
  if (!response.data.ok) {
    throw new Error('Account change simulation returned ok: false');
  }
  
  console.log(`   账户变更模拟成功`);
}

// 11. 资金上限调整测试
async function testCapitalLimitAdjustment() {
  // 先创建会话并获取sessionId
  const createResponse = await makeRequest(`${CONFIG.baseUrl}/api/session/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      config: { capitalUsageLimitPct: 30 }
    })
  });
  
  if (!createResponse.data.ok || !createResponse.data.sessionId) {
    throw new Error('Failed to create session for capital limit test');
  }
  
  const sessionId = createResponse.data.sessionId;
  
  // 调整资金上限
  const response = await makeRequest(`${CONFIG.baseUrl}/api/session/${sessionId}/capital_limit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      capitalUsageLimitPct: 50
    })
  });
  
  if (response.status !== 200) {
    throw new Error(`Capital limit adjustment returned ${response.status}`);
  }
  
  if (!response.data.ok) {
    throw new Error('Capital limit adjustment returned ok: false');
  }
  
  console.log(`   资金上限调整成功`);
}

// 主测试函数
async function runAllTests() {
  console.log('🚀 开始 BIANCE 后端部署完整性验收测试');
  console.log(`📡 目标服务: ${CONFIG.baseUrl}`);
  console.log(`⏱️  超时设置: ${CONFIG.timeout}ms`);
  
  // 运行所有测试
  await runTest('1. Cloud Run 服务健康检查', testCloudRunHealth);
  await runTest('2. Secret Manager 配置验证', testSecretManager);
  await runTest('3. 依赖服务连通性检查', testDependencies);
  await runTest('4. RSS 功能基础测试', testRSSFunctionality);
  await runTest('5. RSS 到 AI 全链路测试', testRSSToAI);
  await runTest('6. AI Trading Council 测试', testAICouncil);
  await runTest('7. 监控指标端点测试', testMetrics);
  await runTest('8. 会话管理功能测试', testSessionManagement);
  await runTest('9. 交易所事件模拟测试', testExchangeEventSimulation);
  await runTest('10. 账户变更模拟测试', testAccountChangeSimulation);
  await runTest('11. 资金上限调整测试', testCapitalLimitAdjustment);
  
  // 输出结果
  console.log('\n📊 测试结果汇总:');
  console.log(`✅ 通过: ${results.passed}`);
  console.log(`❌ 失败: ${results.failed}`);
  console.log(`📈 成功率: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`);
  
  if (results.failed > 0) {
    console.log('\n❌ 失败的测试:');
    results.tests.filter(t => t.status === 'FAILED').forEach(test => {
      console.log(`   - ${test.name}: ${test.error}`);
    });
  }
  
  // 判断是否通过验收
  const successRate = results.passed / (results.passed + results.failed);
  if (successRate >= 0.9) {
    console.log('\n🎉 验收测试通过！系统达到生产标准。');
    process.exit(0);
  } else {
    console.log('\n⚠️  验收测试未通过，需要修复问题后再试。');
    process.exit(1);
  }
}

// 错误处理
process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的 Promise 拒绝:', reason);
  process.exit(1);
});

// 运行测试
runAllTests().catch(error => {
  console.error('测试运行失败:', error);
  process.exit(1);
});
