export function isAdminAuthorized(request: Request) {
  const token = process.env.ADMIN_TASK_TOKEN;
  if (!token) {
    throw new Error('ADMIN_TASK_TOKEN is not configured');
  }

  const authorization = request.headers.get('authorization') ?? '';
  const bearer = authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : '';
  const headerToken = request.headers.get('x-admin-task-token') ?? '';

  return bearer === token || headerToken === token;
}

export function requireAdmin(request: Request) {
  if (!isAdminAuthorized(request)) {
    return { authorized: false as const, response: Response.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  return { authorized: true as const };
}
