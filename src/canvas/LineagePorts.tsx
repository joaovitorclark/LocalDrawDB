import { Handle } from 'reactflow';
import { LINEAGE_PORTS } from './lineageHandles';

/** Pontos de conexão nas 4 bordas do cartão compacto (estilo draw.io). */
export function LineagePorts() {
  return (
    <>
      {LINEAGE_PORTS.flatMap((port) => [
        <Handle
          key={`${port.id}-s`}
          type="source"
          position={port.position}
          id={`${port.id}-s`}
          style={port.style}
          className="lineage-port-handle nodrag nopan"
          isConnectable
        />,
        <Handle
          key={`${port.id}-t`}
          type="target"
          position={port.position}
          id={`${port.id}-t`}
          style={port.style}
          className="lineage-port-handle nodrag nopan"
          isConnectable
        />,
      ])}
    </>
  );
}
