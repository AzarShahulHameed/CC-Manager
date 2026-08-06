/**
 * Records who did what, when. Never throws — a logging failure should
 * never break the actual operation it's logging.
 */
async function logAudit(pool, { userId, actorName, action, entityType, entityId, details, officeId }) {
  try {
    await pool.query(
      `INSERT INTO audit_log (user_id, actor_name, action, entity_type, entity_id, details, office_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId || null, actorName || null, action, entityType || null, entityId ? String(entityId) : null,
       details ? JSON.stringify(details) : null, officeId || null]
    );
  } catch (err) {
    console.error('[AUDIT] Failed to log:', action, err.message);
  }
}

module.exports = { logAudit };
