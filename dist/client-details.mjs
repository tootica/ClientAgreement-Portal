export function normalizeEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim();
  if (email.length > 254 || /[\s\r\n]/.test(email)) return null;
  const parts = email.split('@');
  if (parts.length !== 2) return null;
  const [local, domain] = parts;
  if (!local || local.length > 64 || local.startsWith('.') || local.endsWith('.') || local.includes('..') || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)) return null;
  if (!domain.includes('.') || domain.split('.').some(label => !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label))) return null;
  return local + '@' + domain.toLowerCase();
}

export function validateClientDetails(input) {
  const errors = {};
  const value = {};
  const labels = {clinicName:'Clinic name',contactName:'Contact name',addressLine1:'Billing address',addressLine2:'Address line 2',city:'City',state:'State'};
  for (const [field, label] of Object.entries(labels)) {
    const text = typeof input?.[field] === 'string' ? input[field].trim() : '';
    const max = field.startsWith('address') ? 160 : field === 'city' || field === 'state' ? 80 : 120;
    if ((!text && field !== 'addressLine2') || text.length > max || /[\u0000-\u001f\u007f]/.test(text)) errors[field] = `${label} is required and must be no longer than ${max} characters.`;
    value[field] = text;
  }
  value.email = normalizeEmail(input?.email) || '';
  if (!value.email) errors.email = 'Enter a valid email address for your invoice.';
  const phone = typeof input?.phone === 'string' ? input.phone.trim() : '';
  value.phone = /^\d{10}$/.test(phone) ? '+91' + phone : phone;
  if (!/^\+91\d{10}$/.test(value.phone)) errors.phone = 'Enter a 10-digit phone number.';
  value.postalCode = typeof input?.postalCode === 'string' ? input.postalCode.trim() : '';
  if (!/^[1-9]\d{5}$/.test(value.postalCode)) errors.postalCode = 'Enter a valid 6-digit PIN code.';
  value.gstin = typeof input?.gstin === 'string' ? input.gstin.trim().toUpperCase() : '';
  if (value.gstin && !/^[A-Z0-9]{15}$/.test(value.gstin)) errors.gstin = 'Enter a 15-character GSTIN, or leave it blank.';
  value.country = 'India';
  if (input?.country && input.country !== 'India') errors.country = 'This registration form currently supports Indian billing addresses.';
  return {value, errors, valid:Object.keys(errors).length === 0};
}

export function clientDetailsLines(details) {
  return [details.clinicName, details.contactName, details.email, details.phone,
    [details.addressLine1,details.addressLine2].filter(Boolean).join(', '),
    `${details.city}, ${details.state} ${details.postalCode}`, details.country,
    ...(details.gstin ? ['GSTIN: ' + details.gstin] : [])];
}
