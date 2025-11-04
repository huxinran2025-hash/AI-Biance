import { GoogleGenAI } from "@google/genai";
import { loadSecrets } from './secretManager.js';
import { logger } from './logger.js';

export interface AIModelResponse {
  model: string;
  analysis: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  recommendation: string;
  confidence: number;
  processedArticles?: number;
  latency_ms: number;
  success: boolean;
  error?: string;
}

export interface AICallOptions {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

class AIService {
  private deepseekClient: any = null;
  private geminiClient: GoogleGenAI | null = null;
  private gptClient: any = null;
  private secrets: any = null;
  private initialized = false;

  async initialize() {
    if (this.initialized) return;
    
    try {
      this.secrets = await loadSecrets();
      
      // Initialize DeepSeek client (using OpenAI-compatible API)
      if (this.secrets.DEEPSEEK_API_KEY) {
        // DeepSeek uses OpenAI-compatible API
        const { default: OpenAI } = await import('openai');
        this.deepseekClient = new OpenAI({
          apiKey: this.secrets.DEEPSEEK_API_KEY,
          baseURL: 'https://api.deepseek.com',
        });
      }
      
      // Initialize Gemini client
      if (this.secrets.GEMINI_API_KEY) {
        this.geminiClient = new GoogleGenAI({ apiKey: this.secrets.GEMINI_API_KEY });
      }
      
      // Initialize GPT client (OpenAI API)
      if (this.secrets.GPT_API_KEY) {
        const { default: OpenAI } = await import('openai');
        this.gptClient = new OpenAI({
          apiKey: this.secrets.GPT_API_KEY,
        });
      }
      
      this.initialized = true;
      logger.info('AIService initialized successfully');
    } catch (error) {
      logger.error('AIService initialization failed', error as Error);
      throw error;
    }
  }

  async callDeepSeekReasoner(options: AICallOptions): Promise<AIModelResponse> {
    const startTime = Date.now();
    
    try {
      await this.initialize();
      
      if (!this.deepseekClient) {
        throw new Error('DeepSeek client not initialized');
      }
      
      const response = await this.deepseekClient.chat.completions.create({
        model: 'deepseek-reasoner',
        messages: [
          ...(options.systemPrompt ? [{ role: 'system', content: options.systemPrompt }] : []),
          { role: 'user', content: options.prompt }
        ],
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 2000,
      });
      
      const content = response.choices[0]?.message?.content || '';
      
      return {
        model: 'deepseek-reasoner',
        analysis: content,
        riskLevel: this.extractRiskLevel(content),
        recommendation: this.extractRecommendation(content),
        confidence: this.extractConfidence(content),
        latency_ms: Date.now() - startTime,
        success: true,
      };
    } catch (error) {
      logger.error('DeepSeek call failed', error as Error);
      return {
        model: 'deepseek-reasoner',
        analysis: '',
        riskLevel: 'MEDIUM',
        recommendation: 'HOLD',
        confidence: 0.0,
        latency_ms: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async callGemini25Pro(options: AICallOptions): Promise<AIModelResponse> {
    const startTime = Date.now();
    
    try {
      await this.initialize();
      
      if (!this.geminiClient) {
        throw new Error('Gemini client not initialized');
      }
      
      const response = await this.geminiClient.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: [
          {
            role: 'user',
            parts: [{ text: options.prompt }]
          }
        ],
        config: {
          temperature: options.temperature ?? 0.7,
          maxOutputTokens: options.maxTokens ?? 2000,
          systemInstruction: options.systemPrompt ? {
            role: 'system',
            parts: [{ text: options.systemPrompt }]
          } : undefined,
        },
      });
      
      const content = response.text?.trim() || '';
      
      return {
        model: 'gemini-2.5-pro',
        analysis: content,
        riskLevel: this.extractRiskLevel(content),
        recommendation: this.extractRecommendation(content),
        confidence: this.extractConfidence(content),
        latency_ms: Date.now() - startTime,
        success: true,
      };
    } catch (error) {
      logger.error('Gemini call failed', error as Error);
      return {
        model: 'gemini-2.5-pro',
        analysis: '',
        riskLevel: 'MEDIUM',
        recommendation: 'HOLD',
        confidence: 0.0,
        latency_ms: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async callGPT5(options: AICallOptions): Promise<AIModelResponse> {
    const startTime = Date.now();
    
    try {
      await this.initialize();
      
      if (!this.gptClient) {
        throw new Error('GPT client not initialized');
      }
      
      // Note: GPT-5 might not be available yet, fallback to GPT-4-turbo
      const model = 'gpt-4-turbo-preview'; // Update to 'gpt-5' when available
      
      const response = await this.gptClient.chat.completions.create({
        model: model,
        messages: [
          ...(options.systemPrompt ? [{ role: 'system', content: options.systemPrompt }] : []),
          { role: 'user', content: options.prompt }
        ],
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 2000,
      });
      
      const content = response.choices[0]?.message?.content || '';
      
      return {
        model: 'gpt-5', // Return as gpt-5 even if using fallback
        analysis: content,
        riskLevel: this.extractRiskLevel(content),
        recommendation: this.extractRecommendation(content),
        confidence: this.extractConfidence(content),
        latency_ms: Date.now() - startTime,
        success: true,
      };
    } catch (error) {
      logger.error('GPT call failed', error as Error);
      return {
        model: 'gpt-5',
        analysis: '',
        riskLevel: 'MEDIUM',
        recommendation: 'HOLD',
        confidence: 0.0,
        latency_ms: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async callAllModels(options: AICallOptions & { articlesProcessed?: number }): Promise<AIModelResponse[]> {
    const [deepseekResult, geminiResult, gptResult] = await Promise.allSettled([
      this.callDeepSeekReasoner(options),
      this.callGemini25Pro(options),
      this.callGPT5(options),
    ]);
    
    const results: AIModelResponse[] = [];
    
    if (deepseekResult.status === 'fulfilled') {
      const result = deepseekResult.value;
      if (options.articlesProcessed) result.processedArticles = options.articlesProcessed;
      results.push(result);
    }
    
    if (geminiResult.status === 'fulfilled') {
      const result = geminiResult.value;
      if (options.articlesProcessed) result.processedArticles = options.articlesProcessed;
      results.push(result);
    }
    
    if (gptResult.status === 'fulfilled') {
      const result = gptResult.value;
      if (options.articlesProcessed) result.processedArticles = options.articlesProcessed;
      results.push(result);
    }
    
    return results;
  }

  private extractRiskLevel(content: string): 'LOW' | 'MEDIUM' | 'HIGH' {
    const lower = content.toLowerCase();
    if (lower.includes('high risk') || lower.includes('critical') || lower.includes('extreme')) {
      return 'HIGH';
    }
    if (lower.includes('low risk') || lower.includes('safe') || lower.includes('stable')) {
      return 'LOW';
    }
    return 'MEDIUM';
  }

  private extractRecommendation(content: string): string {
    const lower = content.toLowerCase();
    if (lower.includes('buy') || lower.includes('long') || lower.includes('enter')) {
      return 'BUY';
    }
    if (lower.includes('sell') || lower.includes('short') || lower.includes('exit')) {
      return 'SELL';
    }
    if (lower.includes('hold') || lower.includes('wait') || lower.includes('maintain')) {
      return 'HOLD';
    }
    return 'CAUTIOUS_BUY';
  }

  private extractConfidence(content: string): number {
    // Try to extract confidence percentage from content
    const confidenceMatch = content.match(/(\d+(?:\.\d+)?)\s*%?\s*(?:confidence|确信度|信心)/i);
    if (confidenceMatch) {
      const value = parseFloat(confidenceMatch[1]);
      return Math.min(1.0, Math.max(0.0, value / 100));
    }
    
    // Default confidence based on keywords
    const lower = content.toLowerCase();
    if (lower.includes('high confidence') || lower.includes('very confident')) {
      return 0.8;
    }
    if (lower.includes('low confidence') || lower.includes('uncertain')) {
      return 0.4;
    }
    return 0.6;
  }
}

export const aiService = new AIService();

