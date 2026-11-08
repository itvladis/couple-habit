import { Ctx, type Deps } from './context';
import { ChecksService } from './services/checks';
import { FeedService } from './services/feed';
import { HabitsService } from './services/habits';
import { JobsService } from './services/jobs';
import { SocialService } from './services/social';
import { UsersService } from './services/users';
import { ViewsService } from './services/views';

export function createApp(deps: Deps) {
  const ctx = new Ctx(deps);
  const habits = new HabitsService(ctx);
  return {
    users: new UsersService(ctx),
    habits,
    checks: new ChecksService(ctx),
    social: new SocialService(ctx, habits),
    views: new ViewsService(ctx),
    feed: new FeedService(ctx),
    jobs: new JobsService(ctx),
  };
}

export type App = ReturnType<typeof createApp>;
