const { z } = require('zod');

const KNOWN_NODE_TYPES = [
  'webhook-trigger', 'schedule-trigger', 'ai-classifier', 'ai-generator',
  'condition', 'notify', 'database', 'loop', 'delay', 'action',
  'http-request', 'transform', 'email', 'slack',
];

const nodeSchema = z.object({
  id: z.number().int().positive(),
  type: z.string().min(1).max(50),
  label: z.string().min(1).max(200).optional(),
  desc: z.string().max(500).optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
  config: z.record(z.any()).optional(),
}).passthrough();

const connectionSchema = z.object({
  from: z.number().int(),
  to: z.number().int(),
}).passthrough();

const definitionSchema = z.object({
  nodes: z.array(nodeSchema).max(100).optional(),
  connections: z.array(connectionSchema).max(200).optional(),
}).optional().refine((def) => {
  if (!def || !def.nodes || !def.connections) return true;
  const nodeIds = new Set(def.nodes.map(n => n.id));
  // Verify all connection references point to existing nodes
  for (const conn of def.connections) {
    if (!nodeIds.has(conn.from) || !nodeIds.has(conn.to)) return false;
  }
  return true;
}, { message: 'Connections reference non-existent node IDs' });

const create = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  triggerType: z.enum(['webhook', 'schedule', 'event', 'manual']),
  triggerConfig: z.record(z.any()).optional(),
  definition: definitionSchema,
  cronExpression: z.string().max(100).optional(),
});

const update = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  status: z.enum(['active', 'paused', 'error', 'draft']).optional(),
  triggerType: z.enum(['webhook', 'schedule', 'event', 'manual']).optional(),
  triggerConfig: z.record(z.any()).optional(),
  definition: definitionSchema,
  cronExpression: z.string().max(100).optional().nullable(),
});

module.exports = { create, update };
