const h = require('./helpers');
const service = require('../src/services/appointment.service');

afterAll(h.close);

// Wednesday 2026-11-18, 13:10 Central (19:10 UTC). Hours are 09:00-17:00 on weekdays.
const NOW = new Date('2026-11-18T19:10:00Z');

async function owner() {
  const user = await h.createUser();
  for (const day of [1, 2, 3, 4, 5]) {
    await h.db.query(
      `INSERT INTO availability_rules (user_id, day_of_week, start_time, end_time, is_active) VALUES ($1, $2, '09:00', '17:00', true)`,
      [user.id, day]
    );
  }
  return user;
}

test('the window is three working days and starts two hours from now', async () => {
  const user = await owner();
  const days = await service.getWindowSlots(user.id, NOW);
  expect(days.map((d) => d.date)).toEqual(['2026-11-18', '2026-11-19', '2026-11-20']);
  // 13:10 + 2 hours = 15:10, so 15:30 is the first slot left today.
  expect(days[0].slots[0]).toEqual({ startTime: '15:30', endTime: '16:00', startsAt: '2026-11-18T21:30:00.000Z' });
  expect(await service.isBookable(user.id, '2026-11-18', '09:00', '09:30', NOW)).toBe(false); // already past
  expect(await service.isBookable(user.id, '2026-11-18', '15:00', '15:30', NOW)).toBe(false); // inside the notice
  expect(await service.isBookable(user.id, '2026-11-23', '10:00', '10:30', NOW)).toBe(false); // fourth day
  expect(await service.isBookable(user.id, '2026-11-20', '10:00', '10:30', NOW)).toBe(true);
});

test('a weekend is skipped, not counted', async () => {
  const user = await owner();
  const friday = new Date('2026-11-20T19:10:00Z');
  const days = await service.getWindowSlots(user.id, friday);
  expect(days.map((d) => d.date)).toEqual(['2026-11-20', '2026-11-23', '2026-11-24']);
});

test('booking needs company and notes, refuses a past time, and saves the company', async () => {
  const user = await owner();
  const day = (await service.getWindowSlots(user.id))[0];
  const slot = day.slots[0];
  const body = {
    userId: user.id, date: day.date, startTime: slot.startTime, endTime: slot.endTime,
    bookerName: 'Pat Example', bookerEmail: 'pat@example.com', bookerCompany: 'Example Co',
    notes: 'Rent roll entry', timezone: 'America/New_York',
  };
  const post = (b) => h.api().post('/api/v1/appointments/book').send(b);

  expect((await post({ ...body, bookerCompany: ' ' })).status).toBe(400);
  expect((await post({ ...body, notes: undefined })).status).toBe(400);
  expect((await post({ ...body, date: '2020-01-06', startTime: '10:00', endTime: '10:30' })).status).toBe(400);

  const ok = await post(body);
  expect(ok.status).toBe(201);
  expect(ok.body.data.booker_company).toBe('Example Co');
  // The slot is gone from the window, and a second booking of it is refused.
  expect(await service.isBookable(user.id, day.date, slot.startTime, slot.endTime)).toBe(false);
  expect((await post(body)).status).toBe(400);
});

test('times that clash with the owner\'s Google Calendar are not offered', async () => {
  const user = await owner();
  const calendar = require('../src/services/google-calendar.service');
  // Busy 10:00-11:00 Central on Thursday the 19th (16:00-17:00 UTC).
  const spy = jest.spyOn(calendar, 'getBusy').mockResolvedValue([
    { start: Date.parse('2026-11-19T16:00:00Z'), end: Date.parse('2026-11-19T17:00:00Z') },
  ]);
  try {
    expect(await service.isBookable(user.id, '2026-11-19', '09:30', '10:00', NOW)).toBe(true);
    expect(await service.isBookable(user.id, '2026-11-19', '10:00', '10:30', NOW)).toBe(false);
    expect(await service.isBookable(user.id, '2026-11-19', '10:30', '11:00', NOW)).toBe(false);
    expect(await service.isBookable(user.id, '2026-11-19', '11:00', '11:30', NOW)).toBe(true);
  } finally { spy.mockRestore(); }
});
