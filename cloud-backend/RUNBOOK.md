# BIANCE 后端运行手册

## 概述
本手册提供 BIANCE 后端系统的运维指南，包括常见故障处理、监控告警、变更管理等内容。

## 系统架构

### 核心组件
- **Cloud Run**: 后端服务运行环境
- **Secret Manager**: 密钥管理
- **Firestore**: 会话状态存储
- **BigQuery**: 审计日志存储
- **RSS Service**: 新闻源抓取
- **AI Trading Council**: 三模型决策系统

### 服务端点
- `/health` - 基础健康检查
- `/readyz` - 依赖服务检查
- `/livez` - 进程健康检查
- `/metrics` - 监控指标
- `/api/test/*` - 功能测试端点

## 监控和告警

### 关键指标
1. **系统模式** (`system_mode`)
   - NORMAL: 正常运行
   - EMERGENCY_LANDING: 紧急着陆
   - COOL_DOWN_CAPITAL_STRESS: 资金压力冷却
   - COOL_DOWN_EXTERNAL_UNSAFE: 外部风险冷却

2. **自动刹车** (`auto_brake_triggered`)
   - 0: 未触发
   - 1: 已触发

3. **风控拒绝率** (`risk_reject_ratio`)
   - 目标值: < 20%
   - 告警阈值: > 30%

4. **订单确认延迟** (`order_ack_latency_p95`)
   - 目标值: < 500ms
   - 告警阈值: > 1000ms

### 告警规则
1. **模式切换告警**
   - 触发条件: 系统模式非 NORMAL
   - 告警级别: CRITICAL
   - 响应时间: 立即

2. **今日亏损告警**
   - 触发条件: 今日亏损 > 4%
   - 告警级别: HIGH
   - 响应时间: 5分钟内

3. **回撤告警**
   - 触发条件: 最大回撤 > 12%
   - 告警级别: HIGH
   - 响应时间: 5分钟内

4. **外部源不可用告警**
   - 触发条件: RSS 源不可用 > 5分钟
   - 告警级别: MEDIUM
   - 响应时间: 10分钟内

## 常见故障处理

### 1. Cloud Run 服务异常

#### 症状
- 健康检查失败
- 服务响应超时
- 内存/CPU 使用率过高

#### 诊断步骤
```bash
# 检查服务状态
gcloud run services describe biance-backend --region=asia-east1

# 查看日志
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=biance-backend" --limit=100

# 检查修订版本
gcloud run revisions list --service=biance-backend --region=asia-east1
```

#### 修复方案
1. **冷启动慢**
   - 增加最小实例数: `--min-instances=2`
   - 优化启动时间

2. **内存不足**
   - 增加内存限制: `--memory=2Gi`
   - 检查内存泄漏

3. **CPU 使用率高**
   - 增加 CPU 限制: `--cpu=2`
   - 优化算法效率

### 2. Secret Manager 权限问题

#### 症状
- 密钥加载失败
- 403 权限错误

#### 诊断步骤
```bash
# 检查服务账号权限
gcloud projects get-iam-policy biance-476510 --flatten="bindings[].members" --format="table(bindings.role)" --filter="bindings.members:biance-ai@biance-476510.iam.gserviceaccount.com"

# 检查密钥状态
gcloud secrets versions list DEEPSEEK_API_KEY
```

#### 修复方案
```bash
# 添加 Secret Manager 访问权限
gcloud secrets add-iam-policy-binding DEEPSEEK_API_KEY \
    --member="serviceAccount:biance-ai@biance-476510.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
```

### 3. Firestore 连接问题

#### 症状
- Firestore 操作失败
- 权限错误

#### 诊断步骤
```bash
# 检查 Firestore 权限
gcloud projects get-iam-policy biance-476510 --flatten="bindings[].members" --format="table(bindings.role)" --filter="bindings.members:biance-ai@biance-476510.iam.gserviceaccount.com"

# 测试 Firestore 连接
gcloud firestore databases list
```

#### 修复方案
```bash
# 添加 Firestore 权限
gcloud projects add-iam-policy-binding biance-476510 \
    --member="serviceAccount:biance-ai@biance-476510.iam.gserviceaccount.com" \
    --role="roles/datastore.user"
```

### 4. BigQuery 写入失败

#### 症状
- 审计日志写入失败
- 表不存在错误

#### 诊断步骤
```bash
# 检查 BigQuery 权限
gcloud projects get-iam-policy biance-476510 --flatten="bindings[].members" --format="table(bindings.role)" --filter="bindings.members:biance-ai@biance-476510.iam.gserviceaccount.com"

# 检查审计表
bq ls biance-476510:audit
```

#### 修复方案
```bash
# 添加 BigQuery 权限
gcloud projects add-iam-policy-binding biance-476510 \
    --member="serviceAccount:biance-ai@biance-476510.iam.gserviceaccount.com" \
    --role="roles/bigquery.dataEditor"

gcloud projects add-iam-policy-binding biance-476510 \
    --member="serviceAccount:biance-ai@biance-476510.iam.gserviceaccount.com" \
    --role="roles/bigquery.jobUser"
```

### 5. RSS 抓取失败

#### 症状
- RSS 源无法访问
- CORS 错误

#### 诊断步骤
```bash
# 测试 RSS 端点
curl -sS "https://biance-backend-*.asia-east1.run.app/api/test/simple-rss"

# 检查 CORS 代理
curl -sS "https://api.allorigins.win/raw?url=https://example.com"
```

#### 修复方案
1. **更新 CORS 代理**
   - 在 Secret Manager 中更新 `RSS_PROXY_URL`
   - 使用备用代理服务

2. **添加重试机制**
   - 指数退避重试
   - 熔断器模式

### 6. AI 模型调用失败

#### 症状
- AI 模型超时
- API 密钥无效

#### 诊断步骤
```bash
# 测试 AI Council
curl -X POST "https://biance-backend-*.asia-east1.run.app/api/test/ai-council" \
  -H "Content-Type: application/json" \
  -d '{"testData": "performance_test"}'
```

#### 修复方案
1. **更新 API 密钥**
   - 在 Secret Manager 中更新密钥
   - 验证密钥有效性

2. **优化超时设置**
   - 增加超时时间
   - 实现降级策略

## 变更管理

### 部署前检查清单
- [ ] 代码审查完成
- [ ] 单元测试通过
- [ ] 集成测试通过
- [ ] 安全扫描通过
- [ ] 性能测试通过
- [ ] 回滚方案准备

### 部署流程
1. **构建镜像**
   ```bash
   docker build -t asia-east1-docker.pkg.dev/biance-476510/biance-repo/backend:latest .
   ```

2. **推送镜像**
   ```bash
   docker push asia-east1-docker.pkg.dev/biance-476510/biance-repo/backend:latest
   ```

3. **部署服务**
   ```bash
   gcloud run deploy biance-backend \
     --image asia-east1-docker.pkg.dev/biance-476510/biance-repo/backend:latest \
     --region asia-east1 \
     --platform managed
   ```

4. **验证部署**
   ```bash
   # 运行验收测试
   node acceptance-test.js
   ```

### 回滚流程
1. **获取上一版本**
   ```bash
   gcloud run revisions list --service=biance-backend --region=asia-east1
   ```

2. **回滚到上一版本**
   ```bash
   gcloud run services update-traffic biance-backend \
     --to-revisions=REVISION_NAME=100 \
     --region=asia-east1
   ```

## 成本控制

### 资源使用监控
1. **Cloud Run**
   - 实例数量
   - 请求数量
   - 内存/CPU 使用

2. **BigQuery**
   - 查询次数
   - 数据扫描量
   - 存储使用量

3. **Secret Manager**
   - API 调用次数
   - 密钥访问频率

### 成本优化建议
1. **BigQuery 优化**
   - 使用分区表
   - 设置数据保留期
   - 优化查询语句

2. **Cloud Run 优化**
   - 调整最小实例数
   - 优化内存配置
   - 使用预热请求

## 安全最佳实践

### 密钥管理
- 定期轮换 API 密钥
- 使用最小权限原则
- 监控密钥访问日志

### 网络安全
- 启用 HTTPS
- 配置 CORS 白名单
- 实施速率限制

### 数据保护
- 加密敏感数据
- 定期备份
- 访问日志审计

## 联系信息

### 紧急联系
- 技术负责人: [联系方式]
- 运维团队: [联系方式]
- 安全团队: [联系方式]

### 文档更新
- 最后更新: 2024-01-XX
- 版本: 1.0.0
- 维护者: BIANCE 团队
