import React, { useEffect, useMemo, useState } from 'react';
import { useGlobalStore } from '../../state/useGlobalStore';

const STORAGE_KEY = 'biance_risk_ticker_dedup';
const WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_QUEUE = 200;

type QueueItem = { key: string; uid: string; ts: number };

const readStoredQueue = (): QueueItem[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.queue)) return [];
    return parsed.queue.filter((item: any) => item && typeof item.key === 'string' && typeof item.uid === 'string' && typeof item.ts === 'number');
  } catch (error) {
    console.warn('[RiskTicker] Failed to read session storage state', error);
    return [];
  }
};

const writeStoredQueue = (queue: QueueItem[]) => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ queue }));
  } catch (error) {
    console.warn('[RiskTicker] Failed to persist session storage state', error);
  }
};

const resolveKey = (article: any): string => {
  const rawKey =
    article?.dedupKey ??
    article?.idHash ??
    article?.link ??
    article?.title ??
    `${article?.feedId || 'feed'}-${article?.publishedAt ?? ''}`;
  return String(rawKey).toLowerCase();
};

const resolveUid = (article: any): string => {
  const fallback = `${resolveKey(article)}-${article?.publishedAt ?? ''}`;
  return String(article?.idHash ?? article?.link ?? article?.title ?? fallback);
};

const dedupeArticles = (articles: any[], storedQueue: QueueItem[], now: number) => {
  const cutoff = now - WINDOW_MS;
  const prunedQueue = storedQueue.filter((item) => item.ts > cutoff);
  const counts: Record<string, number> = {};
  const seenUid = new Set<string>();

  prunedQueue.forEach((item) => {
    counts[item.key] = (counts[item.key] ?? 0) + 1;
    seenUid.add(item.uid);
  });

  const nextQueue = [...prunedQueue];
  const kept: any[] = [];

  articles.forEach((article) => {
    const key = resolveKey(article);
    if (!key) return;
    const uid = resolveUid(article);
    const alreadyRecorded = seenUid.has(uid);
    const currentCount = counts[key] ?? 0;

    if (currentCount >= 2 && !alreadyRecorded) {
      return;
    }

    kept.push(article);

    if (!alreadyRecorded) {
      nextQueue.push({ key, uid, ts: article.publishedAt ?? now });
      seenUid.add(uid);
      counts[key] = currentCount + 1;

      while (nextQueue.length > MAX_QUEUE) {
        const removed = nextQueue.shift();
        if (!removed) break;
        seenUid.delete(removed.uid);
        const prev = counts[removed.key] ?? 0;
        if (prev <= 1) {
          delete counts[removed.key];
        } else {
          counts[removed.key] = prev - 1;
        }
      }
    }
  });

  return { items: kept, queue: nextQueue };
};

interface RiskTickerBarProps {
  speed?: number; // px/s，默认3600（原1200的3倍）
}

// 翻译关键词字典
const TRANSLATION_MAP: Record<string, string> = {
  'WARN': '警告',
  'INFO': '信息',
  'ERROR': '错误',
  'ATTRIBUTION': '归因',
  'Attribution logged for': '归因记录：',
  'Outcome: approved': '结果：通过',
  'Outcome: rejected': '结果：拒绝',
  'Strategist': '策略师',
  'LLM decision failed': 'LLM决策失败',
  'using fallback': '使用回退',
  'Self review recorded for': '自我审查记录：',
  'return': '收益率',
};

// 翻译函数：仅替换固定关键词
const translateText = (text: string): string => {
  let result = text;
  Object.entries(TRANSLATION_MAP).forEach(([en, zh]) => {
    result = result.replace(new RegExp(en, 'gi'), zh);
  });
  return result;
};

const RiskTickerBar: React.FC<RiskTickerBarProps> = ({ speed = 3600 }) => {
  const { state, actions } = useGlobalStore();
  const { dashboard, language } = state;
  const { setRightTab } = actions;

  // 检查是否正在加载 RSS 数据
  // 如果 dashboard 不存在，或者 riskNews 字段不存在/未定义，说明正在加载
  const isLoadingRss = !dashboard || !('riskNews' in dashboard) || dashboard.riskNews === undefined || dashboard.riskNews === null;
  
  const rawArticles = dashboard?.riskNews || [];
  const now = Date.now();

  const deduped = useMemo(() => {
    const sorted = [...rawArticles]
      .filter((article) => !article.publishedAt || now - article.publishedAt <= WINDOW_MS)
      .sort((a, b) => {
        if (a.critical !== b.critical) {
          return a.critical ? -1 : 1;
        }
        return (b.publishedAt ?? 0) - (a.publishedAt ?? 0);
      });

    const storedQueue = readStoredQueue();
    return dedupeArticles(sorted, storedQueue, now);
  }, [rawArticles, now]);

  useEffect(() => {
    writeStoredQueue(deduped.queue);
  }, [deduped.queue]);

  const articles = deduped.items;
  const hasArticles = articles.length > 0;

  // 即使没有数据，也保持跑马灯容器结构可见
  const displayArticles = hasArticles
    ? articles
    : [
        {
          idHash: 'placeholder',
          feedId: 'system',
          feedLabel: '风险情报',
          title: '暂无关键预警。保持关注主交易所与政策动态。',
          publishedAt: Date.now(),
          link: '',
          snippet: '',
          critical: false,
          category: 'exchange' as const,
        },
      ];

  const badgeStyle = (critical: boolean, category?: string) => {
    if (critical) return { background: 'var(--danger-soft)', color: 'var(--danger)' };
    switch (category) {
      case 'exchange':
        return { background: 'var(--brand-soft)', color: 'var(--brand-ink)' };
      case 'regulation':
        return { background: 'var(--warning-soft)', color: 'var(--warning)' };
      case 'macro':
        return { background: 'var(--ink-soft)', color: 'var(--ink-muted)' };
      default:
        return { background: 'var(--success-soft)', color: 'var(--success)' };
    }
  };

  const renderTickerItems = (ariaHidden = false) =>
    displayArticles.map((article, index) => {
    const style = badgeStyle(article.critical, article.category);
      const key = article.idHash || article.link || article.title || `item-${index}`;
      const translatedTitle = translateText(article.title);
    return (
      <span
          key={`${key}-${ariaHidden ? 'dup' : 'base'}`}
          aria-hidden={ariaHidden}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 8, margin: '0 24px' }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '4px 10px',
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 600,
            background: style.background,
            color: style.color,
          }}
        >
          {article.feedLabel || article.feedId}
        </span>
        <span style={{ fontSize: 14, color: 'var(--ink)' }}>{translatedTitle}</span>
      </span>
    );
  });

  const [paused, setPaused] = useState(false);
  const [animationDuration, setAnimationDuration] = useState(20);

  // 根据内容宽度和速度计算动画时长
  useEffect(() => {
    if (displayArticles.length === 0) {
      setAnimationDuration(20);
      return;
    }

    // 估算每个item的宽度（需要实际测量DOM）
    const avgItemWidth = 500; // 估算值：标签+标题约500px
    const totalWidth = displayArticles.length * avgItemWidth * 2; // 两份重复内容
    const duration = totalWidth / speed;
    setAnimationDuration(Math.max(duration, 10)); // 最少10秒
  }, [displayArticles.length, speed]);

  const regionLabel = '新闻播报';

  return (
    <div
      style={{
        position: 'relative',
        flexShrink: 0,
        borderTop: '1px solid var(--border)',
        background: 'var(--card)',
        padding: '10px 0',
        cursor: 'pointer',
      }}
      role="region"
      aria-label={regionLabel}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onClick={() => setRightTab('logs')}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(242,235,255,0.7) 50%, rgba(255,255,255,0) 100%)',
          pointerEvents: 'none',
        }}
      />
      <div style={{ position: 'relative', overflow: 'hidden' }}>
        {isLoadingRss ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              width: '100%',
              fontSize: 14,
              color: 'var(--ink-muted)',
              padding: '0 16px',
            }}
          >
            正在加载中…
          </div>
        ) : (
        <div
          style={{
            display: 'flex',
            whiteSpace: 'nowrap',
            fontSize: 13,
            color: 'var(--ink)',
            animation: `risk-marquee ${animationDuration}s linear infinite`,
            animationPlayState: paused ? 'paused' : 'running',
          }}
          aria-live="polite"
        >
          {renderTickerItems(false)}
          {renderTickerItems(true)}
        </div>
        )}
      </div>
      <style>{`
        @keyframes risk-marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
};

export default RiskTickerBar;
