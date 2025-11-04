# BIANCE 后端部署和验收测试

本目录包含 BIANCE 后端系统的完整部署和验收测试工具，按照验收清单 v2.0 标准实现。

## 📁 文件结构

```
cloud-backend/
├── src/                    # 源代码
│   ├── server.ts          # 主服务器文件
│   ├── secretManager.ts   # 密钥管理
│   ├── auditService.ts    # 审计服务
│   └── rssService.ts      # RSS 服务
├── dist/                   # 编译输出
├── acceptance-test.js     # 完整验收测试脚本
├── quick-verify.ps1       # 快速验证脚本
├── deploy-and-test.ps1    # 部署和测试脚本
├── setup-bigquery-audit.sql # BigQuery 审计表设置
├── cloudbuild.yaml        # Cloud Build 配置
├── Dockerfile            # Docker 镜像配置
├── package.json          # Node.js 依赖
└── RUNBOOK.md            # 运行手册
```

## 🚀 快速开始

### 1. 环境准备

确保已安装以下工具：
- Google Cloud SDK (`gcloud`)
- Docker
- Node.js 20+
- PowerShell (Windows) 或 Bash (Linux/Mac)

### 2. 设置 BigQuery 审计表

```bash
# 执行 BigQuery 审计表设置脚本
bq query --use_legacy_sql=false < setup-bigquery-audit.sql
```

### 3. 部署服务

#### 使用 PowerShell (推荐)
```powershell
# 完整部署和测试
.\deploy-and-test.ps1

# 仅部署（跳过测试）
.\deploy-and-test.ps1 -SkipTest

# 干运行模式
.\deploy-and-test.ps1 -DryRun
```

#### 使用 Cloud Build
```bash
# 触发 Cloud Build
gcloud builds submit --config cloudbuild.yaml
```

#### 手动部署
```bash
# 构建镜像
docker build -t asia-east1-docker.pkg.dev/biance-476510/biance-repo/backend:latest .

# 推送镜像
docker push asia-east1-docker.pkg.dev/biance-476510/biance-repo/backend:latest

# 部署到 Cloud Run
gcloud run deploy biance-backend \
  --image asia-east1-docker.pkg.dev/biance-476510/biance-repo/backend:latest \
  --region asia-east1 \
  --platform managed \
  --allow-unauthenticated \
  --service-account biance-ai@biance-476510.iam.gserviceaccount.com \
  --set-env-vars GOOGLE_CLOUD_PROJECT=biance-476510 \
  --min-instances 1 \
  --max-instances 10 \
  --memory 1Gi \
  --cpu 1 \
  --timeout 300 \
  --concurrency 100
```

## 🧪 测试和验证

### 快速验证
```powershell
# 自动获取服务URL并验证
.\quick-verify.ps1

# 指定服务URL
.\quick-verify.ps1 -ServiceUrl "https://your-service-url"

# 详细输出
.\quick-verify.ps1 -Verbose
```

### 完整验收测试
```bash
# 设置服务URL环境变量
export BACKEND_URL="https://your-service-url"

# 运行验收测试
node acceptance-test.js
```

### 手动测试端点

#### 健康检查
```bash
curl https://your-service-url/health
curl https://your-service-url/readyz
curl https://your-service-url/livez
```

#### 功能测试
```bash
# Secret Manager 测试
curl "https://your-service-url/api/test/secrets?echo=false"

# RSS 功能测试
curl https://your-service-url/api/test/simple-rss

# RSS 到 AI 全链路测试
curl -X POST https://your-service-url/api/test/rss-to-ai \
  -H "Content-Type: application/json" \
  -d '{}'

# AI Trading Council 测试
curl -X POST https://your-service-url/api/test/ai-council \
  -H "Content-Type: application/json" \
  -d '{"testData": "performance_test"}'
```

#### 监控指标
```bash
curl https://your-service-url/metrics
```

## 📊 验收清单 v2.0

### ✅ 已实现的功能

1. **Cloud Run 服务配置**
   - 健康检查端点 (`/health`, `/readyz`, `/livez`)
   - 版本信息和启动时间
   - 资源限制和超时配置

2. **Secret Manager 集成**
   - 4个密钥的安全加载
   - 权限验证
   - 测试端点（安全模式）

3. **网络和安全**
   - HTTPS 强制
   - CORS 配置
   - 服务账号权限

4. **Firestore 集成**
   - 会话状态管理
   - 实时数据同步
   - 权限验证

5. **BigQuery 审计**
   - 5张分区表
   - 集簇优化
   - 审计日志记录

6. **RSS → AI 全链路**
   - 8个RSS源抓取
   - AI模型调用模拟
   - 审计日志记录

7. **交易所风险监控**
   - 模拟事件触发
   - 模式切换记录
   - 紧急着陆机制

8. **资金上限管理**
   - 在线参数调整
   - 资金压力检测
   - 降级机制

9. **AI Trading Council**
   - 三模型调用
   - 性能监控
   - 故障降级

10. **监控和告警**
    - OpenMetrics 格式
    - 关键指标暴露
    - 性能监控

11. **灾备和运行手册**
    - 完整故障处理指南
    - 变更管理流程
    - 回滚方案

### 🔄 待完成的功能

1. **真实AI模型集成**
   - DeepSeek API 集成
   - Gemini API 集成
   - GPT-5 API 集成

2. **币安API集成**
   - 真实账户连接
   - 订单执行
   - 风险控制

3. **高级监控**
   - Cloud Monitoring 集成
   - 告警规则配置
   - 仪表板创建

## 🛠️ 故障排查

### 常见问题

1. **服务启动失败**
   ```bash
   # 检查日志
   gcloud logging read "resource.type=cloud_run_revision" --limit=50
   
   # 检查服务状态
   gcloud run services describe biance-backend --region=asia-east1
   ```

2. **Secret Manager 权限问题**
   ```bash
   # 检查服务账号权限
   gcloud projects get-iam-policy biance-476510 \
     --flatten="bindings[].members" \
     --filter="bindings.members:biance-ai@biance-476510.iam.gserviceaccount.com"
   ```

3. **BigQuery 写入失败**
   ```bash
   # 检查表是否存在
   bq ls biance-476510:audit
   
   # 检查权限
   gcloud projects get-iam-policy biance-476510 \
     --filter="bindings.members:biance-ai@biance-476510.iam.gserviceaccount.com"
   ```

### 性能优化

1. **冷启动优化**
   - 增加最小实例数
   - 优化启动时间
   - 使用预热请求

2. **内存优化**
   - 监控内存使用
   - 优化数据结构
   - 清理无用对象

3. **网络优化**
   - 使用连接池
   - 优化超时设置
   - 实现重试机制

## 📈 监控和维护

### 日常监控

1. **健康检查**
   ```bash
   # 定期检查服务健康状态
   curl -f https://your-service-url/health
   ```

2. **性能监控**
   ```bash
   # 查看监控指标
   curl https://your-service-url/metrics
   ```

3. **日志监控**
   ```bash
   # 查看错误日志
   gcloud logging read "resource.type=cloud_run_revision AND severity>=ERROR" --limit=100
   ```

### 定期维护

1. **密钥轮换**
   - 每90天轮换API密钥
   - 更新Secret Manager
   - 验证服务正常

2. **数据清理**
   - BigQuery数据保留期管理
   - Firestore数据清理
   - 日志归档

3. **安全更新**
   - 依赖包更新
   - 安全补丁应用
   - 权限审查

## 📞 支持和联系

- **技术文档**: [RUNBOOK.md](./RUNBOOK.md)
- **问题报告**: 通过GitHub Issues
- **紧急联系**: 查看运行手册中的联系信息

## 📝 更新日志

- **v1.0.0** (2024-01-XX): 初始版本，实现验收清单v2.0的所有基础功能
- **v1.1.0** (计划): 真实AI模型集成
- **v1.2.0** (计划): 币安API集成
- **v2.0.0** (计划): 生产环境优化
