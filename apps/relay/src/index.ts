import { relay, type RelayEnv } from './relay';

export default {
  fetch: (request: Request, env: RelayEnv) => relay(request, env),
};
