/**
 * Component: Cron Utilities Tests
 * Documentation: documentation/backend/services/scheduler.md
 */

import { describe, expect, it } from 'vitest';
import { cronToHuman, isValidCron, customScheduleToCron, cronToCustomSchedule } from '@/lib/utils/cron';

describe('cron utilities', () => {
  it('converts known presets to human text', () => {
    expect(cronToHuman('*/15 * * * *')).toBe('Every 15 minutes');
    expect(cronToHuman('0 */6 * * *')).toBe('Every 6 hours');
    expect(cronToHuman('0 * * * *')).toBe('Every hour');
  });

  it('converts daily schedule to human text', () => {
    expect(cronToHuman('30 14 * * *')).toBe('Daily at 2:30 PM');
    expect(cronToHuman('*/1 * * * *')).toBe('Every 1 minute');
  });

  it('converts weekly and monthly schedules to human text', () => {
    expect(cronToHuman('15 9 * * 1')).toBe('Weekly on Monday at 9:15 AM');
    expect(cronToHuman('0 0 15 * *')).toBe('Monthly on day 15 at 12:00 AM');
  });

  it('returns raw cron for invalid expressions', () => {
    expect(cronToHuman('bad cron')).toBe('bad cron');
  });

  it('validates cron expressions', () => {
    expect(isValidCron('*/5 * * * *')).toBe(true);
    expect(isValidCron('invalid')).toBe(false);
    expect(isValidCron('0 0 0 * *')).toBe(false);
    expect(isValidCron('0 0 1-5 * *')).toBe(true);
    expect(isValidCron('0 0 1,15 * *')).toBe(true);
    expect(isValidCron('*/0 * * * *')).toBe(false);
  });

  it('converts custom schedules to cron', () => {
    expect(customScheduleToCron({ type: 'minutes', interval: 10 })).toBe('*/10 * * * *');
    expect(customScheduleToCron({ type: 'hours', interval: 24 })).toBe('0 0 * * *');
    expect(customScheduleToCron({ type: 'daily', time: { hour: 9, minute: 15 } })).toBe('15 9 * * *');
    expect(customScheduleToCron({ type: 'weekly', time: { hour: 6, minute: 30 }, dayOfWeek: 2 })).toBe('30 6 * * 2');
    expect(customScheduleToCron({ type: 'monthly', time: { hour: 5, minute: 0 }, dayOfMonth: 10 })).toBe('0 5 10 * *');
    expect(customScheduleToCron({ type: 'custom', customCron: '5 4 * * *' })).toBe('5 4 * * *');
  });

  it('parses cron into custom schedules', () => {
    expect(cronToCustomSchedule('*/15 * * * *')).toEqual({ type: 'minutes', interval: 15 });
    expect(cronToCustomSchedule('0 */3 * * *')).toEqual({ type: 'hours', interval: 3 });
    expect(cronToCustomSchedule('0 7 * * *')).toEqual({ type: 'daily', time: { hour: 7, minute: 0 } });
    expect(cronToCustomSchedule('0 6 * * 2')).toEqual({
      type: 'weekly',
      time: { hour: 6, minute: 0 },
      dayOfWeek: 2,
    });
    expect(cronToCustomSchedule('0 2 12 * *')).toEqual({
      type: 'monthly',
      time: { hour: 2, minute: 0 },
      dayOfMonth: 12,
    });
    expect(cronToCustomSchedule('bad')).toEqual({ type: 'custom', customCron: 'bad' });
  });
});


