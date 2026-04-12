import net from 'node:net';

const allocatedPorts = new Set();

export async function allocatePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to allocate port')));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) { reject(error); return; }
        allocatedPorts.add(port);
        resolve(port);
      });
    });
  });
}

export function releasePort(port) {
  allocatedPorts.delete(port);
}

export function getPreviewUrl(port, route = '/') {
  return `http://127.0.0.1:${port}${route}`;
}
