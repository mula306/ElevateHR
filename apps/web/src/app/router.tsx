/* eslint-disable react-refresh/only-export-components */
import { Suspense, lazy, type ReactNode } from 'react';
import { Navigate, createBrowserRouter, useLocation } from 'react-router-dom';
import { useAppSession } from '@/shared/auth/AppSessionProvider';
import { isFeatureEnabled } from '@/shared/features/feature-registry';
import {
  canAccessRoute,
  featureRoutes,
  getDefaultRoute,
  getNavigationItem,
} from '@/shared/navigation/navigation';

const DashboardLayout = lazy(async () => {
  const module = await import('@/layouts/dashboard-layout/DashboardLayout');
  return { default: module.DashboardLayout };
});

const DashboardPage = lazy(async () => {
  const module = await import('@/pages/dashboard/DashboardPage');
  return { default: module.DashboardPage };
});

const InboxPage = lazy(async () => {
  const module = await import('@/pages/inbox/InboxPage');
  return { default: module.InboxPage };
});

const EmployeesPage = lazy(async () => {
  const module = await import('@/pages/employees/EmployeesPage');
  return { default: module.EmployeesPage };
});

const OrganizationPage = lazy(async () => {
  const module = await import('@/pages/organization/OrganizationPage');
  return { default: module.OrganizationPage };
});

const TimeOffPage = lazy(async () => {
  const module = await import('@/pages/time-off/TimeOffPage');
  return { default: module.TimeOffPage };
});

const TimeAttendancePage = lazy(async () => {
  const module = await import('@/pages/time-attendance/TimeAttendancePage');
  return { default: module.TimeAttendancePage };
});

const MyPerformancePage = lazy(async () => {
  const module = await import('@/pages/my-performance/MyPerformancePage');
  return { default: module.MyPerformancePage };
});

const MyProfilePage = lazy(async () => {
  const module = await import('@/pages/my-profile/MyProfilePage');
  return { default: module.MyProfilePage };
});

const MyLearningPage = lazy(async () => {
  const module = await import('@/pages/my-learning/MyLearningPage');
  return { default: module.MyLearningPage };
});

const PerformancePage = lazy(async () => {
  const module = await import('@/pages/performance/PerformancePage');
  return { default: module.PerformancePage };
});

const LearningPage = lazy(async () => {
  const module = await import('@/pages/learning/LearningPage');
  return { default: module.LearningPage };
});

const RecruitmentPage = lazy(async () => {
  const module = await import('@/pages/recruitment/RecruitmentPage');
  return { default: module.RecruitmentPage };
});

const WorkforceTimePage = lazy(async () => {
  const module = await import('@/pages/workforce-time/WorkforceTimePage');
  return { default: module.WorkforceTimePage };
});

const ReportsPage = lazy(async () => {
  const module = await import('@/pages/reports/ReportsPage');
  return { default: module.ReportsPage };
});

const SettingsPage = lazy(async () => {
  const module = await import('@/pages/settings/SettingsPage');
  return { default: module.SettingsPage };
});

const FeatureUnavailablePage = lazy(async () => {
  const module = await import('@/pages/feature-unavailable/FeatureUnavailablePage');
  return { default: module.FeatureUnavailablePage };
});

const FeaturePlaceholderPage = lazy(async () => {
  const module = await import('@/pages/feature-placeholder/FeaturePlaceholderPage');
  return { default: module.FeaturePlaceholderPage };
});

function withRouteFallback(element: ReactNode) {
  return (
    <Suspense fallback={<div className="card">Loading workspace...</div>}>
      {element}
    </Suspense>
  );
}

function RoleRedirect() {
  const { session, loading } = useAppSession();

  if (loading) {
    return <div className="card">Loading workspace...</div>;
  }

  return <Navigate to={getDefaultRoute(session?.access)} replace />;
}

function AccessControlledRoute({
  route,
  element,
}: {
  route: string;
  element: ReactNode;
}) {
  const { session, loading } = useAppSession();
  const location = useLocation();

  if (loading) {
    return <div className="card">Loading workspace...</div>;
  }

  const navigationItem = getNavigationItem(route);

  if (navigationItem?.featureKey && !isFeatureEnabled(session?.features, navigationItem.featureKey)) {
    return (
      <FeatureUnavailablePage
        title={navigationItem.label}
        description="This feature is currently turned off by your administrator. The route remains blocked until it is enabled again."
      />
    );
  }

  if (!canAccessRoute(session?.access, route)) {
    const fallbackRoute = getDefaultRoute(session?.access);

    if (location.pathname === fallbackRoute) {
      return <Navigate to="/inbox" replace />;
    }

    return <Navigate to={fallbackRoute} replace />;
  }

  return <>{element}</>;
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: withRouteFallback(<DashboardLayout />),
    children: [
      {
        index: true,
        element: withRouteFallback(
          <AccessControlledRoute route="/" element={<DashboardPage />} />,
        ),
      },
      {
        path: 'inbox',
        element: withRouteFallback(
          <AccessControlledRoute route="/inbox" element={<InboxPage />} />,
        ),
      },
      {
        path: 'employees',
        element: withRouteFallback(
          <AccessControlledRoute route="/employees" element={<EmployeesPage />} />,
        ),
      },
      {
        path: 'organization',
        element: withRouteFallback(
          <AccessControlledRoute route="/organization" element={<OrganizationPage />} />,
        ),
      },
      {
        path: 'time-off',
        element: withRouteFallback(
          <AccessControlledRoute route="/time-off" element={<TimeOffPage />} />,
        ),
      },
      {
        path: 'time-attendance',
        element: withRouteFallback(
          <AccessControlledRoute route="/time-attendance" element={<TimeAttendancePage />} />,
        ),
      },
      {
        path: 'my-performance',
        element: withRouteFallback(
          <AccessControlledRoute route="/my-performance" element={<MyPerformancePage />} />,
        ),
      },
      {
        path: 'my-profile',
        element: withRouteFallback(
          <AccessControlledRoute route="/my-profile" element={<MyProfilePage />} />,
        ),
      },
      {
        path: 'my-learning',
        element: withRouteFallback(
          <AccessControlledRoute route="/my-learning" element={<MyLearningPage />} />,
        ),
      },
      {
        path: 'performance',
        element: withRouteFallback(
          <AccessControlledRoute route="/performance" element={<PerformancePage />} />,
        ),
      },
      {
        path: 'learning',
        element: withRouteFallback(
          <AccessControlledRoute route="/learning" element={<LearningPage />} />,
        ),
      },
      {
        path: 'recruitment',
        element: withRouteFallback(
          <AccessControlledRoute route="/recruitment" element={<RecruitmentPage />} />,
        ),
      },
      {
        path: 'workforce-time',
        element: withRouteFallback(
          <AccessControlledRoute route="/workforce-time" element={<WorkforceTimePage />} />,
        ),
      },
      {
        path: 'calendar',
        element: <Navigate to="/time-attendance?tab=leave" replace />,
      },
      {
        path: 'reports',
        element: withRouteFallback(
          <AccessControlledRoute route="/reports" element={<ReportsPage />} />,
        ),
      },
      {
        path: 'settings/*',
        element: withRouteFallback(
          <AccessControlledRoute route="/settings" element={<SettingsPage />} />,
        ),
      },
      ...featureRoutes
        .filter((route) => !['/inbox', '/employees', '/organization', '/time-off', '/time-attendance', '/my-profile', '/my-performance', '/my-learning', '/performance', '/learning', '/recruitment', '/workforce-time', '/reports', '/settings'].includes(route.to))
        .map((route) => ({
          path: route.to.slice(1),
          element: withRouteFallback(
            <AccessControlledRoute
              route={route.to}
              element={(
                <FeaturePlaceholderPage
                  title={route.label}
                  summary={route.summary}
                  description={route.description}
                  capabilities={route.capabilities}
                />
              )}
            />,
          ),
        })),
      {
        path: '*',
        element: <RoleRedirect />,
      },
    ],
  },
]);
