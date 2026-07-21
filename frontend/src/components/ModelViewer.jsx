import { useMemo, useRef, useState, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, Center, ContactShadows } from "@react-three/drei";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { RotateCcw, Box, Grid3x3 } from "lucide-react";

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function StlMesh({ stlBase64, wireframe }) {
  const geometry = useMemo(() => {
    const loader = new STLLoader();
    const geo = loader.parse(base64ToArrayBuffer(stlBase64));
    geo.computeVertexNormals();
    geo.center();
    return geo;
  }, [stlBase64]);

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial
        color={wireframe ? "#4a7fa8" : "#ff6a2b"}
        wireframe={wireframe}
        metalness={0.15}
        roughness={0.45}
      />
    </mesh>
  );
}

export default function ModelViewer({ stlBase64, isLoading }) {
  const controlsRef = useRef();
  const [wireframe, setWireframe] = useState(false);
  const [showGrid, setShowGrid] = useState(true);

  const resetView = () => controlsRef.current?.reset();

  return (
    <div className="bracket-frame relative w-full h-full min-h-[420px] bg-[var(--graphite-900)] rounded-sm overflow-hidden border border-[var(--graphite-700)]">
      <span className="bracket-tl" /><span className="bracket-tr" />
      <span className="bracket-bl" /><span className="bracket-br" />

      {/* Viewport toolbar, mimics a CAD software's viewport gizmo controls */}
      <div className="absolute top-3 right-3 z-10 flex gap-1.5">
        <button
          onClick={() => setWireframe((w) => !w)}
          title="Toggle wireframe"
          className={`p-1.5 rounded-sm border transition-colors ${
            wireframe
              ? "bg-[var(--blueprint-dim)] border-[var(--blueprint-glow)] text-[var(--paper)]"
              : "bg-[var(--graphite-800)] border-[var(--graphite-600)] text-[var(--paper-dim)] hover:text-[var(--paper)]"
          }`}
        >
          <Box size={14} />
        </button>
        <button
          onClick={() => setShowGrid((g) => !g)}
          title="Toggle grid"
          className={`p-1.5 rounded-sm border transition-colors ${
            showGrid
              ? "bg-[var(--blueprint-dim)] border-[var(--blueprint-glow)] text-[var(--paper)]"
              : "bg-[var(--graphite-800)] border-[var(--graphite-600)] text-[var(--paper-dim)] hover:text-[var(--paper)]"
          }`}
        >
          <Grid3x3 size={14} />
        </button>
        <button
          onClick={resetView}
          title="Reset view"
          className="p-1.5 rounded-sm border bg-[var(--graphite-800)] border-[var(--graphite-600)] text-[var(--paper-dim)] hover:text-[var(--paper)] transition-colors"
        >
          <RotateCcw size={14} />
        </button>
      </div>

      {/* Coordinate readout, mimics a CAD viewport corner HUD */}
      <div className="absolute bottom-3 left-3 z-10 font-mono text-[10px] tracking-wide text-[var(--paper-faint)] uppercase">
        {stlBase64 ? "drag to orbit · scroll to zoom" : "no model loaded"}
      </div>

      {!stlBase64 && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="font-mono text-xs text-[var(--paper-faint)] text-center px-8">
            generate a model to see the 3D preview here
          </p>
        </div>
      )}

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--graphite-900)]/70 backdrop-blur-[1px] z-20">
          <p className="font-mono text-xs text-[var(--blueprint-glow)] animate-pulse">rendering…</p>
        </div>
      )}

      {stlBase64 && (
        <Canvas shadows camera={{ position: [80, 80, 80], fov: 40 }}>
          <color attach="background" args={["#191d24"]} />

          <ambientLight intensity={0.55} />
          <directionalLight
            position={[60, 90, 40]}
            intensity={1.4}
            castShadow
            shadow-mapSize={[1024, 1024]}
          />
          <directionalLight position={[-50, 30, -60]} intensity={0.4} color="#7fb3d9" />
          <pointLight position={[0, 40, 0]} intensity={0.3} />

          <Suspense fallback={null}>
            <Center>
              <StlMesh stlBase64={stlBase64} wireframe={wireframe} />
            </Center>
          </Suspense>

          <ContactShadows position={[0, -0.02, 0]} opacity={0.45} scale={200} blur={2} far={40} />

          {showGrid && (
            <Grid
              position={[0, -0.01, 0]}
              args={[200, 200]}
              cellSize={5}
              cellThickness={0.5}
              cellColor="#3a4149"
              sectionSize={25}
              sectionThickness={1}
              sectionColor="#4a7fa8"
              fadeDistance={250}
              fadeStrength={1}
              infiniteGrid
            />
          )}
          <OrbitControls
            ref={controlsRef}
            makeDefault
            enableDamping
            dampingFactor={0.08}
            minDistance={20}
            maxDistance={600}
          />
        </Canvas>
      )}
    </div>
  );
}
