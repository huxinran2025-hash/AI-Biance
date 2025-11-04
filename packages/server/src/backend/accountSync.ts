// AccountSyncService - 账户同步服务，支持启动时对账和运行中同步
import { 
    ReconcileResult, 
    AccountSyncEvent, 
    BalanceInfo, 
    PositionInfo,
    ExternalTradeInfo 
} from '../types';
import { auditService } from './audit';
import { eventBus } from './tick/EventBus';

export class AccountSyncService {
    private intervalId: number | null = null;
    private readonly POLL_INTERVAL_MS = 10 * 1000; // 10秒轮询一次（对齐中频Tick）
    private lastReconcileTs = 0;
    private isReconciling = false;
    private restClient: any = null; // BinanceRestClient instance
    private lastBalance: number = 0; // 用于检测余额变化
    
    // Mock 数据 - 模拟真实账户状态
    // 注意：不再存储equityUsd，只存储素材（cash, positions等）
    private mockAccountState = {
        cashUsd: 10000, // 可用现金
        balances: [
            { asset: 'USDT', free: 10000, locked: 0 },
            { asset: 'BTC', free: 0.1, locked: 0 },
            { asset: 'ETH', free: 2.5, locked: 0 }
        ] as BalanceInfo[],
        positions: [
            {
                symbol: 'BTCUSDT',
                side: 'LONG' as const,
                entryPrice: 60000,
                size: 0.05,
                leverage: 5,
                notionalUsd: 3000,
                unrealizedPnl: 150
            }
        ] as PositionInfo[],
        externalTrades: [] as ExternalTradeInfo[]
    };

    constructor() {
        auditService.logInfo('AccountSyncService initialized');
    }

    /**
     * 设置Binance REST客户端（由backend/api.ts在bootstrap后调用）
     */
    public setRestClient(client: any): void {
        this.restClient = client;
        auditService.logInfo('[AccountSync] Binance REST client configured');
    }

    /**
     * 检查是否可以使用真实API
     */
    private canUseRealAPI(): boolean {
        return this.restClient !== null && 
               (process.env.BINANCE_API_KEY || process.env.BINANCE_SECRET_ENDPOINT);
    }

    public start(): void {
        // 注意：现在由Tick调度器统一管理，这里不再启动自己的定时器
        // 但如果需要独立运行（测试等），可以保留这个功能
        if (this.intervalId) return;
        
        auditService.logInfo('[AccountSync] Starting polling (standalone mode)...');
        this.intervalId = window.setInterval(() => this.pollAccountChanges(), this.POLL_INTERVAL_MS);
        
        // 立即执行一次对账
        this.reconcileOnce();
    }

    /**
     * 启动但不创建定时器（由Tick调度器管理）
     */
    public startWithoutInterval(): void {
        auditService.logInfo('[AccountSync] Started (managed by TickScheduler)');
        // 立即执行一次对账
        this.reconcileOnce();
    }

    public stop(): void {
        if (this.intervalId) {
            auditService.logInfo('Stopping AccountSyncService...');
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    public async reconcileOnce(): Promise<ReconcileResult> {
        if (this.isReconciling) {
            auditService.logWarn('Reconciliation already in progress, skipping...');
            return this.getCurrentState();
        }

        this.isReconciling = true;
        const now = Date.now();
        
        try {
            auditService.logInfo('Starting account reconciliation...');
            
            // Phase A: Mock 实现
            // Phase B: 这里会调用真实的币安 API
            const result = await this.fetchAccountDataFromExchange();
            
            this.lastReconcileTs = now;
            
            // 触发对账完成事件
            const event: AccountSyncEvent = {
                ts: now,
                type: 'ACCOUNT_RECONCILED',
                details: {
                    equityUsd: result.cashUsd + result.positionsUnrealizedUsd, // 仅用于日志显示
                    positionCount: result.positions.length,
                    balanceCount: result.balances.length
                }
            };
            
            this.emitAccountEvent(event);
            auditService.logInfo(`Account reconciliation completed. Cash: $${result.cashUsd}, Unrealized: $${result.positionsUnrealizedUsd}, Positions: ${result.positions.length}`);
            
            // 保存快照供detectAccountChanges使用
            this.lastAccountSnapshot = result;
            
            return result;
            
        } catch (error) {
            auditService.logError(`Account reconciliation failed: ${error}`);
            throw error;
        } finally {
            this.isReconciling = false;
        }
    }

    private async pollAccountChanges(): Promise<void> {
        try {
            // Phase A: Mock 实现 - 模拟账户变化
            // Phase B: 这里会调用币安 API 检查余额和持仓变化
            
            const changes = await this.detectAccountChanges();
            
            if (changes.balanceChanged) {
                const event: AccountSyncEvent = {
                    ts: Date.now(),
                    type: 'BALANCE_CHANGED',
                    details: {
                        equityUsd: this.mockAccountState.cashUsd, // 临时值，仅用于事件
                        changeReason: 'external_transfer'
                    }
                };
                this.emitAccountEvent(event);
            }
            
            if (changes.positionChanged) {
                const event: AccountSyncEvent = {
                    ts: Date.now(),
                    type: 'POSITION_CHANGED',
                    details: {
                        equityUsd: this.mockAccountState.cashUsd, // 临时值，仅用于事件
                        changeReason: 'external_trade'
                    }
                };
                this.emitAccountEvent(event);
            }
            
        } catch (error) {
            auditService.logError(`Account polling failed: ${error}`);
        }
    }

    private async fetchAccountDataFromExchange(): Promise<ReconcileResult> {
        // Phase B: 优先使用真实币安 API
        if (this.canUseRealAPI()) {
            try {
                const result = await this.fetchFromBinanceAPI();
                auditService.logInfo('[AccountSync] Successfully fetched from Binance API', {
                    cashUsd: result.cashUsd,
                    balanceCount: result.balances.length
                });
                return result;
            } catch (error) {
                auditService.logWarn('[AccountSync] Failed to fetch from Binance API, falling back to Mock', {
                    error: error instanceof Error ? error.message : String(error)
                });
                // 继续执行Phase A Mock逻辑作为fallback
            }
        }
        
        // Phase A: Mock 实现（fallback，仅在API不可用时使用）
        // 模拟外部交易
        if (Math.random() < 0.1) { // 10% 概率有外部交易
            this.simulateExternalTrade();
        }
        
        // 聚合持仓数据
        const positionsUnrealizedUsd = this.mockAccountState.positions.reduce(
            (sum, pos) => sum + (pos.unrealizedPnl || 0), 0
        );
        const positionsNotionalUsd = this.mockAccountState.positions.reduce(
            (sum, pos) => sum + Math.abs(pos.notionalUsd || 0), 0
        );
        
        return {
            cashUsd: this.mockAccountState.cashUsd,
            positionsUnrealizedUsd,
            positionsNotionalUsd,
            maintenanceMarginUsd: positionsNotionalUsd * 0.05, // 估算5%维持保证金
            balances: [...this.mockAccountState.balances],
            positions: [...this.mockAccountState.positions],
            externalTrades: [...this.mockAccountState.externalTrades]
        };
    }

    /**
     * Phase B: 从币安API获取账户数据
     */
    private async fetchFromBinanceAPI(): Promise<ReconcileResult> {
        if (!this.restClient) {
            throw new Error('REST client not initialized');
        }

        // 获取账户信息（现货账户）
        const accountResponse = await this.restClient.getSigned('/api/v3/account');
        const accountData = accountResponse.data;

        // 解析余额
        const balances: BalanceInfo[] = (accountData.balances || []).map((bal: any) => ({
            asset: bal.asset,
            free: parseFloat(bal.free) || 0,
            locked: parseFloat(bal.locked) || 0,
        }));

        // 获取USDT余额作为现金
        const usdtBalance = balances.find(b => b.asset === 'USDT');
        const cashUsd = usdtBalance ? usdtBalance.free : 0;

        // 获取持仓（如果是合约账户，使用 /fapi/v2/positionRisk）
        // 这里先实现现货账户，合约账户需要额外的API调用
        let positions: PositionInfo[] = [];
        
        // 尝试获取合约持仓（如果支持）
        try {
            const positionResponse = await this.restClient.getSigned('/fapi/v2/positionRisk');
            if (positionResponse.data && Array.isArray(positionResponse.data)) {
                positions = positionResponse.data
                    .filter((pos: any) => parseFloat(pos.positionAmt || '0') !== 0)
                    .map((pos: any) => {
                        const positionAmt = parseFloat(pos.positionAmt || '0');
                        const entryPrice = parseFloat(pos.entryPrice || '0');
                        const markPrice = parseFloat(pos.markPrice || '0');
                        const leverage = parseFloat(pos.leverage || '1');
                        const size = Math.abs(positionAmt);
                        const side = positionAmt > 0 ? 'LONG' : 'SHORT';
                        const notionalUsd = size * markPrice;
                        const unrealizedPnl = (markPrice - entryPrice) * positionAmt;

                        return {
                            symbol: pos.symbol,
                            side: side as 'LONG' | 'SHORT',
                            entryPrice,
                            size,
                            leverage,
                            notionalUsd,
                            unrealizedPnl,
                        } as PositionInfo;
                    });
            }
        } catch (error) {
            // 如果合约API不可用，忽略（可能是现货账户）
            auditService.logInfo('[AccountSync] Futures positions API not available, using spot balances only');
        }

        // 计算持仓相关数据
        const positionsUnrealizedUsd = positions.reduce((sum, pos) => sum + (pos.unrealizedPnl || 0), 0);
        const positionsNotionalUsd = positions.reduce((sum, pos) => sum + Math.abs(pos.notionalUsd || 0), 0);

        auditService.logInfo('[AccountSync] Fetched account data from Binance API', {
            cashUsd,
            positionCount: positions.length,
            balanceCount: balances.length,
        });

        // 检查余额变化并触发事件
        this.checkBalanceChangeAndEmit(cashUsd);

        return {
            cashUsd,
            positionsUnrealizedUsd,
            positionsNotionalUsd,
            maintenanceMarginUsd: positionsNotionalUsd * 0.05, // 估算5%维持保证金
            balances,
            positions,
            externalTrades: [], // 外部交易需要从订单历史推断，这里先留空
        };
    }

    /**
     * 检查余额变化并触发事件
     */
    private checkBalanceChangeAndEmit(currentBalance: number): void {
        if (this.lastBalance > 0) {
            const changePct = Math.abs((currentBalance - this.lastBalance) / this.lastBalance);
            
            // 如果变化超过0.1%，触发事件
            if (changePct >= 0.001) {
                auditService.logInfo('[AccountSync] Balance change detected', {
                    prev: this.lastBalance,
                    current: currentBalance,
                    changePct: (changePct * 100).toFixed(2) + '%'
                });
                
                // 触发余额变化事件
                eventBus.emit('balance_change', {
                    prevBalance: this.lastBalance,
                    currentBalance: currentBalance,
                    changePct: changePct,
                });
            }
        }
        
        this.lastBalance = currentBalance;
    }

    private lastAccountSnapshot: ReconcileResult | null = null;

    private async detectAccountChanges(): Promise<{
        balanceChanged: boolean;
        positionChanged: boolean;
    }> {
        // Phase B: 比较当前状态与上次状态
        if (this.canUseRealAPI() && this.lastAccountSnapshot) {
            try {
                const current = await this.fetchFromBinanceAPI();
                
                // 比较余额变化
                const balanceChanged = JSON.stringify(current.balances) !== JSON.stringify(this.lastAccountSnapshot.balances);
                
                // 比较持仓变化
                const positionChanged = JSON.stringify(current.positions) !== JSON.stringify(this.lastAccountSnapshot.positions);
                
                this.lastAccountSnapshot = current;
                
                return { balanceChanged, positionChanged };
            } catch (error) {
                auditService.logWarn('[AccountSync] Failed to detect changes, using fallback', {
                    error: String(error)
                });
            }
        }
        
        // Phase A: Mock 实现（fallback）
        const random = Math.random();
        return {
            balanceChanged: random < 0.05, // 5% 概率余额变化
            positionChanged: random < 0.03  // 3% 概率持仓变化
        };
    }

    private simulateExternalTrade(): void {
        // 模拟用户手动开仓
        const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
        const symbol = symbols[Math.floor(Math.random() * symbols.length)];
        const side = Math.random() > 0.5 ? 'LONG' : 'SHORT';
        const size = Math.random() * 0.1;
        const entryPrice = symbol === 'BTCUSDT' ? 60000 : (symbol === 'ETHUSDT' ? 3000 : 100);
        
        const newPosition: PositionInfo = {
            symbol,
            side: side as 'LONG' | 'SHORT',
            entryPrice,
            size,
            leverage: 3,
            notionalUsd: size * entryPrice,
            unrealizedPnl: (Math.random() - 0.5) * 200
        };
        
        this.mockAccountState.positions.push(newPosition);
        
        const externalTrade: ExternalTradeInfo = {
            ts: Date.now(),
            symbol,
            side: side as 'LONG' | 'SHORT',
            size,
            entryPrice,
            notionalUsd: newPosition.notionalUsd,
            source: 'external_manual'
        };
        
        this.mockAccountState.externalTrades.push(externalTrade);
        
        auditService.logInfo(`Simulated external trade: ${side} ${symbol} ${size} @ ${entryPrice}`);
    }

    private emitAccountEvent(event: AccountSyncEvent): void {
        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
            window.dispatchEvent(new CustomEvent('accountSyncEvent', {
                detail: event
            }));
        }
    }

    public getCurrentState(): ReconcileResult {
        // 聚合持仓数据
        const positionsUnrealizedUsd = this.mockAccountState.positions.reduce(
            (sum, pos) => sum + (pos.unrealizedPnl || 0), 0
        );
        const positionsNotionalUsd = this.mockAccountState.positions.reduce(
            (sum, pos) => sum + Math.abs(pos.notionalUsd || 0), 0
        );
        
        return {
            cashUsd: this.mockAccountState.cashUsd,
            positionsUnrealizedUsd,
            positionsNotionalUsd,
            maintenanceMarginUsd: positionsNotionalUsd * 0.05, // 估算5%维持保证金
            balances: [...this.mockAccountState.balances],
            positions: [...this.mockAccountState.positions],
            externalTrades: [...this.mockAccountState.externalTrades]
        };
    }

    public getLastReconcileTs(): number {
        return this.lastReconcileTs;
    }

}

export const accountSync = new AccountSyncService();

