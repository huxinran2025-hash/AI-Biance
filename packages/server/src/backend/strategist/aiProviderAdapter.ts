import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { auditService } from "../audit";

export interface AIClients {
    google: GoogleGenAI | null;
    openai: OpenAI | null;
    deepseek: OpenAI | null;
}

export interface GenerateContentParams {
    model: string;
    contents: Array<{ role: string; parts: Array<{ text: string }> }>;
    config: {
        temperature?: number;
        topP?: number;
        responseMimeType?: string;
        responseSchema?: any;
        systemInstruction?: {
            role: string;
            parts: Array<{ text: string }>;
        };
    };
    clients: AIClients;
}

/**
 * 统一的 AI 内容生成接口
 * 根据模型名称自动选择正确的 AI 客户端并调用对应的 API
 */
export async function generateContentUnified(params: GenerateContentParams): Promise<{ text?: string }> {
    const { model, contents, config, clients } = params;
    
    // 判断使用哪个服务商
    if (model.startsWith('gemini-')) {
        // 使用 Google Gemini
        if (!clients.google) {
            throw new Error('Google Gemini client is not initialized');
        }
        
        try {
            const response = await clients.google.models.generateContent({
                model,
                contents,
                config: {
                    temperature: config.temperature,
                    topP: config.topP,
                    responseMimeType: config.responseMimeType,
                    responseSchema: config.responseSchema,
                    systemInstruction: config.systemInstruction,
                },
            });
            
            return { text: response.text };
        } catch (error) {
            auditService.logWarn(`[AIAdapter] Gemini API call failed for model ${model}`, {
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    } else if (model === 'deepseek-reasoner' || model.startsWith('deepseek-')) {
        // 使用 DeepSeek (OpenAI 兼容模式)
        if (!clients.deepseek) {
            throw new Error('DeepSeek client is not initialized');
        }
        
        try {
            // 转换格式：将 Gemini 格式转换为 OpenAI 格式
            const messages = contents.map(content => {
                // 合并所有 parts 的文本
                const text = content.parts.map(part => part.text).join('\n');
                return {
                    role: content.role === 'user' ? 'user' : content.role === 'system' ? 'system' : 'assistant',
                    content: text,
                };
            });
            
            // 添加系统提示词（如果有）
            if (config.systemInstruction) {
                const systemText = config.systemInstruction.parts.map(part => part.text).join('\n');
                // 如果要求 JSON 格式，在系统提示词中添加 JSON 格式要求
                const jsonInstruction = config.responseMimeType === 'application/json' && config.responseSchema
                    ? '\n\n重要：你必须以纯 JSON 格式返回结果，不要包含任何解释性文本。'
                    : '';
                messages.unshift({
                    role: 'system',
                    content: systemText + jsonInstruction,
                });
            } else if (config.responseMimeType === 'application/json' && config.responseSchema) {
                // 如果没有系统提示词但要求 JSON，添加 JSON 格式指令
                messages.unshift({
                    role: 'system',
                    content: '重要：你必须以纯 JSON 格式返回结果，不要包含任何解释性文本。',
                });
            }
            
            const response = await clients.deepseek.chat.completions.create({
                model: model === 'deepseek-reasoner' ? 'deepseek-reasoner' : model,
                messages: messages as any,
                temperature: config.temperature,
                top_p: config.topP,
                response_format: config.responseMimeType === 'application/json' && config.responseSchema
                    ? { type: 'json_object' }
                    : undefined,
                max_tokens: 4096,
            });
            
            const text = response.choices[0]?.message?.content;
            if (!text) {
                throw new Error('DeepSeek API returned empty response');
            }
            
            return { text };
        } catch (error) {
            auditService.logWarn(`[AIAdapter] DeepSeek API call failed for model ${model}`, {
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    } else if (model === 'gpt-5' || model.startsWith('gpt-')) {
        // 使用 OpenAI (GPT)
        if (!clients.openai) {
            throw new Error('OpenAI client is not initialized');
        }
        
        try {
            // 转换格式：将 Gemini 格式转换为 OpenAI 格式
            const messages = contents.map(content => {
                // 合并所有 parts 的文本
                const text = content.parts.map(part => part.text).join('\n');
                return {
                    role: content.role === 'user' ? 'user' : content.role === 'system' ? 'system' : 'assistant',
                    content: text,
                };
            });
            
            // 添加系统提示词（如果有）
            if (config.systemInstruction) {
                const systemText = config.systemInstruction.parts.map(part => part.text).join('\n');
                // 如果要求 JSON 格式，在系统提示词中添加 JSON 格式要求
                const jsonInstruction = config.responseMimeType === 'application/json' && config.responseSchema
                    ? '\n\n重要：你必须以纯 JSON 格式返回结果，不要包含任何解释性文本。'
                    : '';
                messages.unshift({
                    role: 'system',
                    content: systemText + jsonInstruction,
                });
            } else if (config.responseMimeType === 'application/json' && config.responseSchema) {
                // 如果没有系统提示词但要求 JSON，添加 JSON 格式指令
                messages.unshift({
                    role: 'system',
                    content: '重要：你必须以纯 JSON 格式返回结果，不要包含任何解释性文本。',
                });
            }
            
            // 处理模型名称：gpt-5 可能需要映射到实际可用的模型
            const actualModel = model === 'gpt-5' ? 'gpt-4-turbo-preview' : model;
            
            const response = await clients.openai.chat.completions.create({
                model: actualModel,
                messages: messages as any,
                temperature: config.temperature,
                top_p: config.topP,
                response_format: config.responseMimeType === 'application/json' && config.responseSchema
                    ? { type: 'json_object' }
                    : undefined,
                max_tokens: 4096,
            });
            
            const text = response.choices[0]?.message?.content;
            if (!text) {
                throw new Error('OpenAI API returned empty response');
            }
            
            return { text };
        } catch (error) {
            auditService.logWarn(`[AIAdapter] OpenAI API call failed for model ${model}`, {
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    } else {
        throw new Error(`Unsupported model: ${model}`);
    }
}
