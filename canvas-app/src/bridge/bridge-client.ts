import { useCanvasStore } from '../store/canvas-store';

let ws: WebSocket | null = null;

export function initBridgeClient() {
  const wsUrl = `ws://${window.location.hostname}:4181`;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('[bridge] Connected to canvas API');
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleCommand(msg);
    } catch (e) {
      console.error('[bridge] Bad message:', e);
    }
  };

  ws.onclose = () => {
    console.log('[bridge] Disconnected, reconnecting in 2s...');
    setTimeout(initBridgeClient, 2000);
  };
}

function handleCommand(msg: { id: string; type: string; payload?: any }) {
  const { id, type, payload } = msg;
  const store = useCanvasStore.getState();

  try {
    let result: any;

    switch (type) {
      case 'getState': {
        result = {
          nodes: store.nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: n.data })),
          edges: store.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, data: e.data })),
          componentCount: Object.keys(store.components).length,
        };
        break;
      }

      case 'getScreens': {
        result = store.nodes
          .filter((n) => n.type === 'screen' || n.type === 'screenshot' || n.type === 'iframe')
          .map((n) => ({
            id: n.id,
            type: n.type,
            name: (n.data as any).name,
            position: n.position,
            width: (n as any).width,
            height: (n as any).height,
            parentId: n.parentId,
            data: n.data,
          }));
        break;
      }

      case 'getScreen': {
        const node = store.nodes.find((n) => n.id === payload.id);
        if (!node) throw new Error(`Screen ${payload.id} not found`);
        const components = Object.values(store.components)
          .filter((c) => c.screenId === payload.id)
          .sort((a, b) => a.order - b.order);
        result = {
          id: node.id,
          type: node.type,
          data: node.data,
          position: node.position,
          components,
        };
        break;
      }

      case 'createScreen': {
        const { name, customHtml, width = 1100, height = 700, nextTo, parentId } = payload;

        // Calculate position
        let position = payload.position || { x: 100, y: 100 };
        let resolvedParentId = parentId;

        if (nextTo) {
          const sourceNode = store.nodes.find((n) => n.id === nextTo);
          if (sourceNode) {
            const sourceWidth = (sourceNode as any).width || (sourceNode.data as any)?.width || 800;
            position = {
              x: (sourceNode.position?.x || 0) + sourceWidth + 100,
              y: sourceNode.position?.y || 0,
            };
            resolvedParentId = resolvedParentId || sourceNode.parentId;
          }
        }

        const newId = `screen-ai-${Date.now()}`;
        const newNode: any = {
          id: newId,
          type: 'screen',
          position,
          width,
          height,
          data: {
            name: name || 'AI Generated',
            width,
            height,
            zIndex: 1,
            locked: false,
            customHtml: customHtml || undefined,
          },
        };

        if (resolvedParentId) {
          newNode.parentId = resolvedParentId;
          newNode.expandParent = true;
        }

        useCanvasStore.setState({
          nodes: [...store.nodes, newNode],
          isDirty: true,
        });

        // Auto-create edge from source if nextTo
        if (nextTo) {
          const edgeId = `edge-ai-${Date.now()}`;
          useCanvasStore.setState({
            edges: [...useCanvasStore.getState().edges, {
              id: edgeId,
              source: nextTo,
              target: newId,
              type: 'flow',
              data: { label: 'AI Modified' },
            }],
          });
        }

        result = { id: newId, position };
        break;
      }

      case 'updateScreen': {
        const { id: screenId, customHtml: newHtml, name: newName } = payload;
        const nodes = store.nodes.map((n) => {
          if (n.id !== screenId) return n;
          const data = { ...n.data } as any;
          if (newHtml !== undefined) data.customHtml = newHtml;
          if (newName !== undefined) data.name = newName;
          return { ...n, data };
        });
        useCanvasStore.setState({ nodes: nodes as any, isDirty: true });
        result = { id: screenId, updated: true };
        break;
      }

      case 'createEdge': {
        const { source, target, label = '' } = payload;
        const edgeId = `edge-ai-${Date.now()}`;
        useCanvasStore.setState({
          edges: [...store.edges, {
            id: edgeId,
            source,
            target,
            type: 'flow',
            data: { label },
          }],
          isDirty: true,
        });
        result = { id: edgeId };
        break;
      }

      default:
        throw new Error(`Unknown command: ${type}`);
    }

    ws?.send(JSON.stringify({ id, result }));
  } catch (err: any) {
    ws?.send(JSON.stringify({ id, error: err.message }));
  }
}
