import React, { forwardRef, useRef, useMemo, useLayoutEffect, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Color, Mesh, ShaderMaterial, IUniform } from 'three';

const hexToNormalizedRGB = (hex: string): [number, number, number] => {
  const cleaned = hex.replace('#', '');
  return [
    parseInt(cleaned.slice(0, 2), 16) / 255,
    parseInt(cleaned.slice(2, 4), 16) / 255,
    parseInt(cleaned.slice(4, 6), 16) / 255,
  ];
};

const vertexShader = `
varying vec2 vUv;
varying vec3 vPosition;

void main() {
  vPosition = position;
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
varying vec2 vUv;
varying vec3 vPosition;

uniform float uTime;
uniform vec3  uColor;
uniform float uSpeed;
uniform float uScale;
uniform float uRotation;
uniform float uNoiseIntensity;

const float e = 2.71828182845904523536;

float noise(vec2 texCoord) {
  float G = e;
  vec2  r = (G * sin(G * texCoord));
  return fract(r.x * r.y * (1.0 + texCoord.x));
}

vec2 rotateUvs(vec2 uv, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  mat2  rot = mat2(c, -s, s, c);
  return rot * uv;
}

void main() {
  float rnd        = noise(gl_FragCoord.xy);
  vec2  uv         = rotateUvs(vUv * uScale, uRotation);
  vec2  tex        = uv * uScale;
  float tOffset    = uSpeed * uTime;

  tex.y += 0.03 * sin(8.0 * tex.x - tOffset);

  float pattern = 0.6 +
                  0.4 * sin(5.0 * (tex.x + tex.y +
                                   cos(3.0 * tex.x + 5.0 * tex.y) +
                                   0.02 * tOffset) +
                            sin(20.0 * (tex.x + tex.y - 0.1 * tOffset)));

  vec4 col = vec4(uColor, 1.0) * vec4(pattern) - rnd / 15.0 * uNoiseIntensity;
  col.a = 1.0;
  gl_FragColor = col;
}
`;

interface SilkUniforms {
  [uniform: string]: IUniform;
  uSpeed: { value: number };
  uScale: { value: number };
  uNoiseIntensity: { value: number };
  uColor: { value: Color };
  uRotation: { value: number };
  uTime: { value: number };
}

interface SilkPlaneProps {
  uniforms: SilkUniforms;
}

const SilkPlane = forwardRef<Mesh, SilkPlaneProps>(function SilkPlane({ uniforms }, ref) {
  const { viewport } = useThree();
  const invalidate = useThree((s) => s.invalidate);
  const mountedRef = useRef(true);
  const frameTimer = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (ref && 'current' in ref && ref.current) {
      ref.current.scale.set(viewport.width, viewport.height, 1);
    }
  }, [ref, viewport]);

  useEffect(() => {
    mountedRef.current = true;
    // Guarantee one static frame paints even when the loop never auto-runs
    // (prefers-reduced-motion or tab hidden at mount).
    invalidate();
    return () => {
      mountedRef.current = false;
      if (frameTimer.current !== null) {
        clearTimeout(frameTimer.current);
        frameTimer.current = null;
      }
    };
  }, [invalidate]);

  useFrame((state, delta) => {
    // PERF-09: never schedule another frame while the tab is hidden — the
    // demand loop halts and the GPU idles until visibilitychange kicks it.
    if (typeof document !== 'undefined' && document.hidden) return;
    if (ref && 'current' in ref && ref.current) {
      const material = ref.current.material as ShaderMaterial;
      if (material && material.uniforms && material.uniforms.uTime) {
        // Clamp delta so a backgrounded tab doesn't cause a time jump on return.
        material.uniforms.uTime.value += 0.1 * Math.min(delta, 0.1);
      }
    }
    // Self-perpetuating demand loop capped at ~30fps instead of 60-120fps.
    if (frameTimer.current !== null) clearTimeout(frameTimer.current);
    frameTimer.current = window.setTimeout(() => {
      frameTimer.current = null;
      if (mountedRef.current && (typeof document === 'undefined' || !document.hidden)) {
        state.invalidate();
      }
    }, 1000 / 30);
  });

  return (
    <mesh ref={ref}>
      <planeGeometry args={[1, 1, 1, 1]} />
      <shaderMaterial uniforms={uniforms} vertexShader={vertexShader} fragmentShader={fragmentShader} />
    </mesh>
  );
});
SilkPlane.displayName = 'SilkPlane';

export interface SilkProps {
  speed?: number;
  scale?: number;
  color?: string;
  noiseIntensity?: number;
  rotation?: number;
  className?: string;
  style?: React.CSSProperties;
}

class SilkErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {}

  render() {
    if (this.state.hasError) {
      return <div className="w-full h-full bg-gradient-to-b from-secondary/15 via-background/40 to-background/80" />;
    }
    return this.props.children;
  }
}

export const Silk: React.FC<SilkProps> = ({
  speed = 5,
  scale = 1,
  color = '#2d3748',
  noiseIntensity = 1.5,
  rotation = 0,
  className,
  style,
}) => {
  const meshRef = useRef<Mesh>(null);
  const invalidateRef = useRef<(() => void) | null>(null);
  // PERF-09: static single frame for reduced-motion users (no render loop).
  const reduceMotion = useMemo(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );
  const [tabVisible, setTabVisible] = useState(
    () => typeof document === 'undefined' || !document.hidden,
  );

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVisibility = () => {
      const visible = !document.hidden;
      setTabVisible(visible);
      // Restart the halted demand loop when returning to the tab.
      if (visible) invalidateRef.current?.();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const uniforms = useMemo<SilkUniforms>(
    () => ({
      uSpeed: { value: speed },
      uScale: { value: scale },
      uNoiseIntensity: { value: noiseIntensity },
      uColor: { value: new Color(...hexToNormalizedRGB(color)) },
      uRotation: { value: rotation },
      uTime: { value: 0 },
    }),
    [],
  );

  useEffect(() => {
    uniforms.uSpeed.value = speed;
    uniforms.uScale.value = scale;
    uniforms.uNoiseIntensity.value = noiseIntensity;
    uniforms.uColor.value.setRGB(...hexToNormalizedRGB(color));
    uniforms.uRotation.value = rotation;
  }, [speed, scale, noiseIntensity, color, rotation, uniforms]);

  return (
    <SilkErrorBoundary>
      <div className={className} style={{ width: '100%', height: '100%', ...style }}>
        <Canvas
          dpr={[1, 1.5]}
          // PERF-09: on-demand rendering driven by SilkPlane's throttled
          // invalidate loop (~30fps, paused when hidden) instead of an
          // unthrottled 60-120fps always-on loop.
          frameloop={tabVisible && !reduceMotion ? 'demand' : 'never'}
          gl={{
            alpha: true,
            antialias: false,
            powerPreference: 'low-power',
          }}
          onCreated={({ gl, invalidate }) => {
            invalidateRef.current = invalidate;
            gl.domElement.addEventListener(
              'webglcontextlost',
              (event) => {
                event.preventDefault();
              },
              false,
            );
          }}
        >
          <SilkPlane ref={meshRef} uniforms={uniforms} />
        </Canvas>
      </div>
    </SilkErrorBoundary>
  );
};

export default Silk;
