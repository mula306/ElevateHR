/* eslint-disable react-refresh/only-export-components */
import { Suspense, lazy, type ReactNode } from 'react';
import { Navigate, createBrowserRouter } from 'react-router-dom';
import { featureRoutes } from '@/shared/navigation/navigation';

const DashboardLayout = lazy(async () => {
  const module = await import('@/layouts/dashboard-layout/DashboardLayout');
  return { default: module.DashboardLayout };
});

const DashboardPage = lazy(async () => {
  const module = await import('@/pages/dashboard/DashboardPage');
  return { default: module.DashboardPage };
});

const EmployeesPage = lazy(async () => {
  const module = await import('@/pages/employees/EmployeesPage');
  return { default: module.EmployeesPage };
});

const OrganizationPage = lazy(async () => {
  const module = await import('@/pages/organization/OrganizationPage');
  return { default: module.OrganizationPage };
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

export const router = createBrowserRouter([
  {
    path: '/',
    element: withRouteFallback(<DashboardLayout />),
    children: [
      {
        index: true,
        element: withRouteFallback(<DashboardPage />),
      },
      {
        path: 'employees',
        element: withRouteFallback(<EmployeesPage />),
      },
      {
        path: 'organization',
        element: withRouteFallback(<OrganizationPage />),
      },
      ...featureRoutes.filter((route) => route.to !== '/employees' && route.to !== '/organization').map((route) => ({
        path: route.to.slice(1),
        element: withRouteFallback(
          <FeaturePlaceholderPage
            title={route.label}
            summary={route.summary}
            description={route.description}
            capabilities={route.capabilities}
          />,
        ),
      })),
      {
        path: '*',
        element: <Navigate to="/" replace />,
      },
    ],
  },
]);
