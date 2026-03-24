const { z } = require('zod');

const create = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  icon: z.string().max(10).optional(),
  agentType: z.enum(['text_generation', 'classification', 'analysis', 'custom']),
  model: z.string().max(50).optional(),
  systemPrompt: z.string().max(10000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(100000).optional(),
});

const update = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  icon: z.string().max(10).optional(),
  agentType: z.enum(['text_generation', 'classification', 'analysis', 'custom']).optional(),
  model: z.string().max(50).optional(),
  systemPrompt: z.string().max(10000).optional().nullable(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(100000).optional(),
  status: z.enum(['active', 'paused', 'error']).optional(),
});

const execute = z.object({
  input: z.union([z.string(), z.record(z.any())]),
});

module.exports = { create, update, execute };
