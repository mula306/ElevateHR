import { RouterProvider } from 'react-router-dom';
import { AppSessionProvider } from '@/shared/auth/AppSessionProvider';
import { router } from './router';

function App() {
  return (
    <AppSessionProvider>
      <RouterProvider router={router} />
    </AppSessionProvider>
  );
}

export default App;
