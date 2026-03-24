const { z } = require('zod');

const book = z.object({
  userId: z.string().uuid(),
  bookerName: z.string().min(1).max(200),
  bookerEmail: z.string().email(),
  bookerCompany: z.string().max(200).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  timezone: z.string().max(50).optional(),
  notes: z.string().max(2000).optional(),
  meetingType: z.string().max(50).optional(),
});

const updateAppointment = z.object({
  status: z.enum(['confirmed', 'cancelled', 'completed', 'no_show']).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  notes: z.string().max(2000).optional(),
});

const availabilityRule = z.object({
  rules: z.array(z.object({
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
    isActive: z.boolean(),
  })),
});

module.exports = { book, updateAppointment, availabilityRule };
