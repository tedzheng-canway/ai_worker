export function providerDefaults(provider) {
  return Object.fromEntries((provider.fields || []).map(f => [f.key, provider.values?.[f.key] ?? f.default ?? '']));
}
export function visibleProviderFields(provider, fields) {
  return (provider.fields || []).filter(f => !f.show_when || Object.entries(f.show_when).every(([key, value]) => fields[key] === value));
}
export function providerPayload(provider, fields) {
  return Object.fromEntries(visibleProviderFields(provider, fields).map(f => [f.key, fields[f.key] ?? '']));
}
