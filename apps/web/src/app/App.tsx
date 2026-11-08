import { parseDeepLink } from '@habit/core/deep-links';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { ErrorState, Loading } from '../components/States';
import { TabBar, type Tab } from '../components/TabBar';
import { setUnauthorizedHandler, type DeepLink, type Session } from '../lib/api';
import { DICTS, I18nProvider, type Lang } from '../lib/i18n';
import { useRequests, useSession } from '../lib/queries';
import { closeApp, closeTopOverlay, launchTarget, useOverlayCount, useTelegramBackButton } from '../lib/telegram';
import { ArchiveScreen } from '../screens/ArchiveScreen';
import { FeedScreen } from '../screens/FeedScreen';
import { HabitScreen } from '../screens/HabitScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { InviteScreen } from '../screens/InviteScreen';
import { JoinScreen } from '../screens/JoinScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { RequestsScreen } from '../screens/RequestsScreen';
import { NavigationProvider, useNavigation, type Route } from './navigation';
import { useTheme } from './theme';

/** Where to land on launch: the server's parsed start_param, or the bot's `open` button. */
export function initialNavigation(session: Pick<Session, 'deepLink'>, fallback: string | null): { tab: Tab; stack: Route[] } {
  const link: DeepLink | null = session.deepLink ?? (fallback ? parseDeepLink(fallback) : null);
  switch (link?.screen) {
    case 'invite':
      return { tab: 'home', stack: [{ name: 'join', token: link.token }] };
    case 'habit':
      return { tab: 'home', stack: [{ name: 'habit', id: link.habitId }] };
    case 'requests':
      return { tab: 'profile', stack: [{ name: 'requests' }] };
    case 'feed':
      return { tab: 'feed', stack: [] };
    default:
      return { tab: 'home', stack: [] };
  }
}

export function App() {
  const session = useSession();
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    setUnauthorizedHandler(() => setExpired(true));
    return () => setUnauthorizedHandler(null);
  }, []);
  if (expired) return <Expired lang={session.data?.user.language ?? 'ru'} />;
  if (session.isPending) return <Loading />;
  if (session.isError) return <ErrorState onRetry={() => session.refetch()} />;
  return <Ready session={session.data} />;
}

/** Telegram init data lives 24 h; after that only reopening the Mini App gets a fresh one. */
function Expired({ lang }: { lang: Lang }) {
  const t = DICTS[lang];
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-8 text-center">
      <h1 className="text-[22px] font-bold">{t.expired.title}</h1>
      <p className="max-w-[300px] text-[15px] text-ink-2">{t.expired.text}</p>
      <button type="button" onClick={closeApp} className="press mt-2 rounded-2xl bg-ink px-5 py-3 text-[16px] font-semibold text-base">
        {t.expired.reopen}
      </button>
    </main>
  );
}

function Ready({ session }: { session: Session }) {
  useTheme(session.user.theme);
  const initial = useMemo(() => initialNavigation(session, launchTarget()), [session]);
  return (
    <I18nProvider lang={session.user.language}>
      <NavigationProvider initial={initial}>
        <Shell />
      </NavigationProvider>
    </I18nProvider>
  );
}

function routeKey(route: Route): string {
  switch (route.name) {
    case 'habit':
      return `habit:${route.id}`;
    case 'invite':
      return `invite:${route.habitId ?? 'friend'}`;
    case 'join':
      return `join:${route.token}`;
    default:
      return route.name;
  }
}

function RouteView({ route }: { route: Route }) {
  switch (route.name) {
    case 'home':
      return <HomeScreen />;
    case 'feed':
      return <FeedScreen />;
    case 'profile':
      return <ProfileScreen />;
    case 'habit':
      return <HabitScreen id={route.id} />;
    case 'invite':
      return <InviteScreen habitId={route.habitId} />;
    case 'join':
      return <JoinScreen token={route.token} />;
    case 'requests':
      return <RequestsScreen />;
    case 'archive':
      return <ArchiveScreen />;
  }
}

function Shell() {
  const nav = useNavigation();
  const reduce = useReducedMotion();
  const requests = useRequests();
  const overlays = useOverlayCount();
  const isTabRoot = !nav.canGoBack;

  // One owner for Back: the topmost sheet first, then the screen stack.
  const { back } = nav;
  const onBack = useCallback(() => {
    if (!closeTopOverlay()) back();
  }, [back]);
  useTelegramBackButton(nav.canGoBack || overlays > 0, onBack);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeTopOverlay();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // The tab root stays mounted under pushed screens; its scroll position comes back with it.
  const { rootScroll } = nav;
  useLayoutEffect(() => {
    window.scrollTo(0, isTabRoot ? rootScroll : 0);
  }, [isTabRoot, nav.route, rootScroll]);

  return (
    <>
      {/* Spec: tab content switches instantly; the home screen has no entrance animation. */}
      <div hidden={!isTabRoot}>
        <RouteView key={nav.tab} route={{ name: nav.tab }} />
      </div>
      {isTabRoot && <TabBar active={nav.tab} onChange={nav.switchTab} badge={{ profile: (requests.data?.length ?? 0) > 0 }} />}
      <AnimatePresence mode="popLayout" initial={false}>
        {!isTabRoot && (
          <motion.div
            key={routeKey(nav.route)}
            initial={reduce ? { opacity: 0 } : { opacity: 0, transform: 'translateX(24px)' }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, transform: 'translateX(0px)' }}
            // The leaving screen must not take taps meant for the one replacing it.
            exit={{ opacity: 0, pointerEvents: 'none', transition: { duration: 0.12 } }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
          >
            <RouteView route={nav.route} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
