import type { Infer } from 'convex/values';
import { serviceValidator } from '../schema';

export type Service = Infer<typeof serviceValidator>;

const serviceLoginURLs: Record<Service, string> = {
  instagram: 'https://www.instagram.com/accounts/login/',
  x: 'https://x.com/i/flow/login',
  linkedin: 'https://www.linkedin.com/login',
};

const serviceLogoutURLs: Record<Service, string> = {
  instagram: 'https://www.instagram.com/accounts/logout/',
  x: 'https://x.com/logout',
  linkedin: 'https://www.linkedin.com/m/logout/',
};

export function serviceToLoginURL(service: Service) {
  return serviceLoginURLs[service];
}

export function serviceToLogoutURL(service: Service) {
  return serviceLogoutURLs[service];
}
