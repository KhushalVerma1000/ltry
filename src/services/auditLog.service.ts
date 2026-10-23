/**
 * Append-only trail of sensitive admin actions. Call with a Prisma transaction
 * client so the log row commits (or rolls back) together with the action it
 * describes.
 */
export const recordAdminAudit = async (
    tx: any,
    params: {
        adminId: string;
        action: string;
        targetType: string;
        targetId: string;
        details?: Record<string, unknown> | null;
    }
) => {
    return tx.adminAuditLog.create({
        data: {
            adminId: params.adminId,
            action: params.action,
            targetType: params.targetType,
            targetId: params.targetId,
            details: params.details ?? undefined
        }
    });
};
