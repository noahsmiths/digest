import type { Infer } from 'convex/values';
import { serviceValidator } from '../schema';

export type Service = Infer<typeof serviceValidator>;

const serviceLoginURLs: Record<Service, string> = {
  instagram: 'https://www.instagram.com/accounts/login/',
  x: 'https://x.com/i/flow/login',
  facebook: 'https://www.facebook.com/login/',
  linkedin: 'https://www.linkedin.com/login',
};

export function serviceToLoginURL(service: Service) {
  return serviceLoginURLs[service];
}
