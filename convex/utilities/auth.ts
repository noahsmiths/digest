import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";

export async function getIdentityOrThrow(ctx: ActionCtx | MutationCtx | QueryCtx) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
        throw new Error("Unauthenticated");
    }

    return identity;
}