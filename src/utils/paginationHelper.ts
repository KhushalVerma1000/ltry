interface PaginationParams {
    page?: number | string;
    limit?: number | string;
}

interface PaginationResult {
    skip: number;
    take: number;
    page: number;
    limit: number;
}

interface PaginatedResponse<T> {
    data: T[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
    };
}

/**
 * Calculate pagination parameters (skip, take) from page and limit
 * Default: page=1, limit=10
 * @param page - Page number (1-indexed)
 * @param limit - Number of items per page
 * @returns Object with skip, take, page, and limit values
 */
function getPaginationParams(params: PaginationParams): PaginationResult {
    let page = parseInt(String(params.page || 1), 10);
    let limit = parseInt(String(params.limit || 10), 10);

    // Ensure valid values
    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 10;
    if (limit > 100) limit = 100; // Max limit to prevent abuse

    const skip = (page - 1) * limit;

    return {
        skip,
        take: limit,
        page,
        limit,
    };
}

/**
 * Format paginated query response with metadata
 * @param data - Array of results
 * @param total - Total count of items in database
 * @param page - Current page number
 * @param limit - Items per page
 * @returns Formatted paginated response
 */
function formatPaginatedResponse<T>(
    data: T[],
    total: number,
    page: number,
    limit: number
): PaginatedResponse<T> {
    const totalPages = Math.ceil(total / limit);

    return {
        data,
        pagination: {
            page,
            limit,
            total,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1,
        },
    };
}

/**
 * All-in-one pagination helper for Prisma queries
 * Usage:
 * const paginationHelper = createPaginationHelper(req.query.page, req.query.limit);
 * const [items, total] = await Promise.all([
 *   prisma.model.findMany({
 *     skip: paginationHelper.skip,
 *     take: paginationHelper.take,
 *   }),
 *   prisma.model.count(),
 * ]);
 * return res.json(paginationHelper.format(items, total));
 */
function createPaginationHelper(page?: number | string, limit?: number | string) {
    const params = getPaginationParams({ page, limit });

    return {
        ...params,
        format: <T,>(data: T[], total: number) =>
            formatPaginatedResponse(data, total, params.page, params.limit),
    };
}

export {
    getPaginationParams,
    formatPaginatedResponse,
    createPaginationHelper,
    type PaginationParams,
    type PaginationResult,
    type PaginatedResponse,
};
