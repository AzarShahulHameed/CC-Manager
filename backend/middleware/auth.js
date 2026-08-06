const jwt = require('jsonwebtoken');

// server.js validates JWT_SECRET exists on boot (config/env.js) — by the time
// this module is required, it's guaranteed to be set.
const JWT_SECRET = process.env.JWT_SECRET;

// Verifies the bearer token and attaches { id, username, role, office_id } to req.user
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) return res.status(401).json({ error: 'Missing auth token' });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Restricts a route to specific roles, e.g. requireRole('admin')
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

// Resolves which office_id a request is scoped to.
// Admins (office_id null in token) may pass ?office_id= to view a specific office,
// or omit it to view all. Non-admins are always locked to their own office,
// regardless of what they pass in the query string.
function resolveOfficeScope(req, res, next) {
  const isAdmin = req.user.role === 'admin' && req.user.office_id === null;
  if (isAdmin) {
    req.officeScope = req.query.office_id ? parseInt(req.query.office_id) : null; // null = all offices
  } else {
    req.officeScope = req.user.office_id;
  }
  next();
}

module.exports = { requireAuth, requireRole, resolveOfficeScope, JWT_SECRET };
