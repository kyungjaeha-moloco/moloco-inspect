import { createBrowserRouter, Outlet } from 'react-router-dom';
import { PlaygroundList } from './pages/PlaygroundList';
import { PlaygroundDetail } from './pages/PlaygroundDetail';
import JobDetail from './pages/JobDetail';

function RootLayout() {
  return <Outlet />;
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <PlaygroundList /> },
      { path: 'p/:id', element: <PlaygroundDetail /> },
      { path: 'j/:jobId', element: <JobDetail /> },
    ],
  },
]);
