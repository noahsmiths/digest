import { httpRouter } from 'convex/server';
import { internal } from './_generated/api';
import { httpAction } from './_generated/server';

const http = httpRouter();
http.route({
  path: '/webhooks/agentmail', method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const body = await request.arrayBuffer();
    if (body.byteLength > 1_048_576) return new Response(null, { status: 413 });
    const result = await ctx.runAction(internal.digest.replyActions.receiveWebhook, {
      rawBody: new TextDecoder().decode(body),
      headers: Object.fromEntries(['svix-id', 'svix-timestamp', 'svix-signature'].map((name) => [name, request.headers.get(name) ?? ''])),
    });
    const status = { accepted: 204, 'invalid-signature': 401, 'invalid-payload': 400, unconfigured: 503 }[result];
    return new Response(null, { status });
  }),
});
export default http;
