// Lightweight validation helper — returns { ok, errors }
export function validate(body, rules) {
  const errors = [];
  for (const [field, checks] of Object.entries(rules)) {
    const val = body[field];
    if (checks.required && (val === undefined || val === null || val === '')) {
      errors.push(`${field} is required`);
      continue;
    }
    if (val === undefined || val === null || val === '') continue;
    if (checks.type === 'number' && isNaN(Number(val))) {
      errors.push(`${field} must be a number`);
    }
    if (checks.type === 'string' && typeof val !== 'string') {
      errors.push(`${field} must be a string`);
    }
    if (checks.maxLength && String(val).length > checks.maxLength) {
      errors.push(`${field} must be at most ${checks.maxLength} characters`);
    }
    if (checks.oneOf && !checks.oneOf.includes(val)) {
      errors.push(`${field} must be one of: ${checks.oneOf.join(', ')}`);
    }
    if (checks.match && !checks.match.test(String(val))) {
      errors.push(`${field} has an invalid format`);
    }
  }
  return { ok: errors.length === 0, errors };
}
