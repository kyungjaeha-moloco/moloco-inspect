import { useEffect } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { CanvasView } from './canvas/CanvasView';
import { useCanvasStore } from './store/canvas-store';
import { sampleNodes, sampleEdges, sampleComponents } from './sample-data';
import './App.css';

function CanvasApp() {
  const setNodes = useCanvasStore((s) => s.setNodes);
  const setEdges = useCanvasStore((s) => s.setEdges);
  const setComponents = useCanvasStore((s) => s.setComponents);

  useEffect(() => {
    setNodes(sampleNodes);
    setEdges(sampleEdges);
    setComponents(sampleComponents);
  }, [setNodes, setEdges, setComponents]);

  return <CanvasView />;
}

export default function App() {
  return (
    <ReactFlowProvider>
      <CanvasApp />
    </ReactFlowProvider>
  );
}
