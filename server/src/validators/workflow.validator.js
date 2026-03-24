const { z } = require('zod');

const create = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  triggerType: z.enum(['webhook', 'schedule', 'event', 'manual']),
  triggerConfig: z.record(z.any()).optional(),
  definition: z.object({
    nodes: z.array(z.any()).optional(),
    connections: z.array(z.any()).optional(),
  }).optional(),
  cronExpression: z.string().max(100).optional(),
});

const update = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  status: z.enum(['active', 'paused', 'error', 'draft']).optional(),
  triggerType: z.enum(['webhook', 'schedule', 'event', 'manual']).optional(),
  triggerConfig: z.record(z.any()).optional(),
  definition: z.object({
    nodes: z.array(z.any()).optional(),
    connections: z.array(z.any()).optional(),
  }).optional(),
  cronExpression: z.string().max(100).optional().nullable(),
});

module.exports = { create, update };
