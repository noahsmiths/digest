export const services = [
  { id: 'instagram', name: 'Instagram', detail: 'Posts from the people you follow' },
  { id: 'x', name: 'X', detail: 'Updates from your following feed' },
  { id: 'linkedin', name: 'LinkedIn', detail: 'Recent posts from your network' },
] as const;

export const categories = [
  { id: 'social', name: 'Social', description: 'People and conversations' },
  { id: 'event', name: 'Upcoming events', description: 'Dates worth knowing' },
] as const;

export type Service = (typeof services)[number]['id'];
export type Category = (typeof categories)[number]['id'];
export type Page = 'digest' | 'settings';

export function serviceName(service: Service) {
  return services.find(({ id }) => id === service)?.name ?? service;
}

export function formatDate(timestamp: number, style: 'short' | 'long' = 'short') {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: style === 'long' ? 'long' : 'medium',
    ...(style === 'short' ? { timeStyle: 'short' as const } : {}),
  }).format(timestamp);
}

export function statusLabel(status: 'running' | 'completed' | 'partial' | 'failed') {
  if (status === 'running') return 'In progress';
  if (status === 'completed') return 'Ready to read';
  if (status === 'partial') return 'Ready with gaps';
  return 'Could not finish';
}
