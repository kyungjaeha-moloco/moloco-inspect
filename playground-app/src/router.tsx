import { createBrowserRouter, Outlet } from 'react-router-dom';
import { PlaygroundList } from './pages/PlaygroundList';
import { PlaygroundDetail } from './pages/PlaygroundDetail';

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
    ],
  },
]);
