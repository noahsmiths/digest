import { v } from 'convex/values';
import { internal } from './_generated/api';
import { internalMutation, mutation, query } from './_generated/server';
import { getIdentityOrThrow } from './utilities/auth';

const DEFAULT_DELIVERY_TIME = '08:00';
const DEFAULT_TIME_ZONE = 'UTC';
const MAX_DUE_PREFERENCES = 100;

const preferencesValidator = v.object({
  automaticDigestEnabled: v.boolean(),
  deliveryTime: v.string(),
  timeZone: v.string(),
});

function parseDeliveryTime(deliveryTime: string) {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(deliveryTime)) {
    throw new Error('INVALID_DELIVERY_TIME');
  }
  const [hour, minute] = deliveryTime.split(':').map(Number);
  return { hour, minute };
}

function localDateParts(timestamp: number, timeZone: string) {
  const values = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(timestamp);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(values.find((part) => part.type === type)?.value);
  return { year: value('year'), month: value('month'), day: value('day'), hour: value('hour'), minute: value('minute') };
}

function zonedTimeToUtc(
  date: { year: number; month: number; day: number },
  time: { hour: number; minute: number },
  timeZone: string,
) {
  const assumedUtc = Date.UTC(date.year, date.month - 1, date.day, time.hour, time.minute);
  const observed = localDateParts(assumedUtc, timeZone);
  const offset = Date.UTC(observed.year, observed.month - 1, observed.day, observed.hour, observed.minute) - assumedUtc;
  return assumedUtc - offset;
}

function nextDeliveryAt(deliveryTime: string, timeZone: string, now = Date.now()) {
  const time = parseDeliveryTime(deliveryTime);
  const localDate = localDateParts(now, timeZone);
  let next = zonedTimeToUtc(localDate, time, timeZone);
  if (next <= now) {
    const tomorrow = new Date(Date.UTC(localDate.year, localDate.month - 1, localDate.day + 1));
    next = zonedTimeToUtc(
      { year: tomorrow.getUTCFullYear(), month: tomorrow.getUTCMonth() + 1, day: tomorrow.getUTCDate() },
      time,
      timeZone,
    );
  }
  return next;
}

export const get = query({
  args: {},
  returns: preferencesValidator,
  handler: async (ctx) => {
    const identity = await getIdentityOrThrow(ctx);
    const userId = ctx.db.normalizeId('users', identity.subject);
    if (userId === null) throw new Error('USER_NOT_FOUND');
    const preferences = await ctx.db
      .query('userPreferences')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .first();
    return preferences === null
      ? { automaticDigestEnabled: true, deliveryTime: DEFAULT_DELIVERY_TIME, timeZone: DEFAULT_TIME_ZONE }
      : {
          automaticDigestEnabled: preferences.automaticDigestEnabled,
          deliveryTime: preferences.deliveryTime,
          timeZone: preferences.timeZone,
        };
  },
});

export const ensure = mutation({
  args: { timeZone: v.string() },
  returns: preferencesValidator,
  handler: async (ctx, { timeZone }) => {
    const identity = await getIdentityOrThrow(ctx);
    const userId = ctx.db.normalizeId('users', identity.subject);
    if (userId === null) throw new Error('USER_NOT_FOUND');
    const existing = await ctx.db
      .query('userPreferences')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .first();
    if (existing !== null) {
      if (existing.userTokenIdentifier === undefined) {
        const next = nextDeliveryAt(existing.deliveryTime, timeZone);
        await ctx.db.patch('userPreferences', existing._id, {
          userTokenIdentifier: identity.tokenIdentifier,
          timeZone,
          nextDeliveryAt: next,
        });
        return {
          automaticDigestEnabled: existing.automaticDigestEnabled,
          deliveryTime: existing.deliveryTime,
          timeZone,
        };
      }
      return {
        automaticDigestEnabled: existing.automaticDigestEnabled,
        deliveryTime: existing.deliveryTime,
        timeZone: existing.timeZone,
      };
    }
    const next = nextDeliveryAt(DEFAULT_DELIVERY_TIME, timeZone);
    await ctx.db.insert('userPreferences', {
      userId,
      userTokenIdentifier: identity.tokenIdentifier,
      automaticDigestEnabled: true,
      deliveryTime: DEFAULT_DELIVERY_TIME,
      timeZone,
      nextDeliveryAt: next,
    });
    return { automaticDigestEnabled: true, deliveryTime: DEFAULT_DELIVERY_TIME, timeZone };
  },
});

export const update = mutation({
  args: preferencesValidator,
  returns: v.null(),
  handler: async (ctx, { automaticDigestEnabled, deliveryTime, timeZone }) => {
    const identity = await getIdentityOrThrow(ctx);
    const userId = ctx.db.normalizeId('users', identity.subject);
    if (userId === null) throw new Error('USER_NOT_FOUND');
    const next = nextDeliveryAt(deliveryTime, timeZone);
    const existing = await ctx.db
      .query('userPreferences')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .first();
    const value = {
      userId,
      userTokenIdentifier: identity.tokenIdentifier,
      automaticDigestEnabled,
      deliveryTime,
      timeZone,
      nextDeliveryAt: next,
    };
    if (existing === null) {
      await ctx.db.insert('userPreferences', value);
    } else {
      await ctx.db.replace('userPreferences', existing._id, value);
    }
    return null;
  },
});

export const startDueDigests = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const duePreferences = await ctx.db
      .query('userPreferences')
      .withIndex('by_automaticDigestEnabled_and_nextDeliveryAt', (q) =>
        q.eq('automaticDigestEnabled', true).lte('nextDeliveryAt', now),
      )
      .take(MAX_DUE_PREFERENCES);
    for (const preferences of duePreferences) {
      if (preferences.userTokenIdentifier !== undefined) {
        try {
          await ctx.runMutation(internal.digests.startForUser, {
            userTokenIdentifier: preferences.userTokenIdentifier,
            userId: preferences.userId,
          });
        } catch (error) {
          console.error('[preferences] scheduled digest did not start', {
            userTokenIdentifier: preferences.userTokenIdentifier,
            error,
          });
        }
      }
      await ctx.db.patch('userPreferences', preferences._id, {
        nextDeliveryAt: nextDeliveryAt(preferences.deliveryTime, preferences.timeZone, now),
      });
    }
    return null;
  },
});
