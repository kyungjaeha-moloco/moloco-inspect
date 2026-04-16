import { ReactFlowProvider } from '@xyflow/react';
import { CanvasView } from './canvas/CanvasView';
import './App.css';

export default function App() {
  return (
    <ReactFlowProvider>
      <CanvasView />
    </ReactFlowProvider>
  );
}
