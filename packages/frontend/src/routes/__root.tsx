import { createRootRouteWithContext } from '@tanstack/react-router';
import AppLayout from '../components/AppLayout';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { RouterProviderContext } from '../main';
import { Outlet } from '@tanstack/react-router';

export const Route = createRootRouteWithContext<RouterProviderContext>()({
  component: () => (
    <ErrorBoundary>
      <AppLayout>
        <Outlet />
      </AppLayout>
    </ErrorBoundary>
  ),
});
