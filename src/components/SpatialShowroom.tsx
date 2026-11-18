import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import * as xb from 'xrblocks';
import { RotateCw, Box, Sparkles, Maximize2, Eye } from 'lucide-react';
import type { Product, SpatialModelType } from '../types';
import { formatInr } from '../lib/api';

interface SpatialShowroomProps {
  products: Product[];
  initialProduct?: Product | null;
  onSelectProduct: (product: Product) => void;
  onAddToCart: (product: Product) => void;
}

function buildProductMeshGroup(
  type: SpatialModelType,
  accentHex: string
): THREE.Group {
  const group = new THREE.Group();
  const primaryMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(accentHex || '#1e293b'),
    roughness: 0.28,
    metalness: 0.55,
    clearcoat: 0.6,
  });
  const brushedMetal = new THREE.MeshStandardMaterial({
    color: 0xdbe2ea,
    roughness: 0.22,
    metalness: 0.88,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.45,
    metalness: 0.2,
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x1d4ed8,
    roughness: 0.08,
    metalness: 0.1,
    transmission: 0.35,
    clearcoat: 1.0,
  });

  if (type === 'headphones') {
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(0.45, 0.045, 20, 64, Math.PI * 1.12),
      darkMat
    );
    band.rotation.z = -Math.PI * 0.06;
    band.position.y = 0.22;
    group.add(band);

    [-0.44, 0.44].forEach((x) => {
      const yoke = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.025, 0.28, 16),
        brushedMetal
      );
      yoke.position.set(x, 0.08, 0);
      group.add(yoke);

      const cup = new THREE.Mesh(
        new THREE.CylinderGeometry(0.19, 0.19, 0.1, 32),
        primaryMat
      );
      cup.rotation.z = Math.PI / 2;
      cup.position.set(x > 0 ? x - 0.03 : x + 0.03, -0.08, 0);
      group.add(cup);

      const cushion = new THREE.Mesh(
        new THREE.TorusGeometry(0.145, 0.045, 16, 32),
        darkMat
      );
      cushion.rotation.y = Math.PI / 2;
      cushion.position.set(x > 0 ? x - 0.09 : x + 0.09, -0.08, 0);
      group.add(cushion);
    });
  } else if (type === 'smartwatch') {
    const strap = new THREE.Mesh(
      new THREE.TorusGeometry(0.32, 0.06, 16, 48),
      darkMat
    );
    strap.scale.set(0.75, 1.15, 0.55);
    group.add(strap);

    const chassis = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.42, 0.09),
      brushedMetal
    );
    chassis.position.set(0, 0.06, 0.2);
    group.add(chassis);

    const screen = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.36, 0.02),
      glassMat
    );
    screen.position.set(0, 0.06, 0.25);
    group.add(screen);

    const crown = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.06, 16),
      primaryMat
    );
    crown.rotation.z = Math.PI / 2;
    crown.position.set(0.2, 0.1, 0.2);
    group.add(crown);
  } else if (type === 'laptop') {
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(0.92, 0.03, 0.64),
      brushedMetal
    );
    base.position.set(0, -0.22, 0.08);
    group.add(base);

    const keyboard = new THREE.Mesh(
      new THREE.BoxGeometry(0.76, 0.01, 0.32),
      darkMat
    );
    keyboard.position.set(0, -0.2, 0.02);
    group.add(keyboard);

    const lidPivot = new THREE.Group();
    lidPivot.position.set(0, -0.2, -0.23);
    lidPivot.rotation.x = -0.35;
    const lid = new THREE.Mesh(
      new THREE.BoxGeometry(0.92, 0.62, 0.02),
      brushedMetal
    );
    lid.position.set(0, 0.31, 0);
    lidPivot.add(lid);

    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(0.86, 0.54, 0.01),
      glassMat
    );
    panel.position.set(0, 0.31, 0.015);
    lidPivot.add(panel);
    group.add(lidPivot);
  } else if (type === 'chair') {
    const baseStar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.36, 0.42, 0.04, 5),
      darkMat
    );
    baseStar.position.y = -0.52;
    group.add(baseStar);

    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.05, 0.36, 16),
      brushedMetal
    );
    stem.position.y = -0.34;
    group.add(stem);

    const seat = new THREE.Mesh(
      new THREE.BoxGeometry(0.56, 0.07, 0.52),
      primaryMat
    );
    seat.position.y = -0.14;
    group.add(seat);

    const back = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.68, 0.05),
      primaryMat
    );
    back.position.set(0, 0.24, -0.24);
    back.rotation.x = -0.08;
    group.add(back);
  } else if (type === 'espresso') {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.68, 0.56),
      brushedMetal
    );
    body.position.y = 0.02;
    group.add(body);

    const sideAccent = new THREE.Mesh(
      new THREE.BoxGeometry(0.64, 0.58, 0.44),
      primaryMat
    );
    sideAccent.position.set(0, 0.04, -0.06);
    group.add(sideAccent);

    const groupHead = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 0.14, 24),
      brushedMetal
    );
    groupHead.position.set(0, 0.08, 0.32);
    group.add(groupHead);

    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.28, 12),
      darkMat
    );
    handle.rotation.x = Math.PI / 2;
    handle.position.set(0, -0.02, 0.44);
    group.add(handle);
  } else if (type === 'sneakers') {
    const sole = new THREE.Mesh(
      new THREE.BoxGeometry(0.86, 0.14, 0.34),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 })
    );
    sole.position.set(0, -0.18, 0);
    group.add(sole);

    const upper = new THREE.Mesh(
      new THREE.BoxGeometry(0.76, 0.24, 0.3),
      primaryMat
    );
    upper.position.set(-0.02, -0.01, 0);
    group.add(upper);

    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.15, 0.18, 20),
      glassMat
    );
    collar.position.set(-0.22, 0.14, 0);
    group.add(collar);
  } else {
    // Camera
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.68, 0.42, 0.24),
      darkMat
    );
    group.add(body);

    const grip = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.4, 0.3),
      primaryMat
    );
    grip.position.set(0.28, 0, 0.05);
    group.add(grip);

    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.17, 0.32, 32),
      darkMat
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(-0.06, -0.02, 0.24);
    group.add(barrel);

    const glass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.13, 0.03, 32),
      glassMat
    );
    glass.rotation.x = Math.PI / 2;
    glass.position.set(-0.06, -0.02, 0.4);
    group.add(glass);
  }

  return group;
}

export const SpatialShowroom: React.FC<SpatialShowroomProps> = ({
  products,
  initialProduct,
  onSelectProduct,
  onAddToCart,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [activeProduct, setActiveProduct] = useState<Product>(
    initialProduct || products[0]
  );
  const [selectedColor, setSelectedColor] = useState<string>(
    (initialProduct || products[0])?.variants[0]?.colorHex || '#1D4ED8'
  );
  const [autoRotate, setAutoRotate] = useState(true);
  const [wireframe, setWireframe] = useState(false);
  const [xrLaunched, setXrLaunched] = useState(false);
  const [contextLost, setContextLost] = useState(false);

  const autoRotateRef = useRef(autoRotate);
  autoRotateRef.current = autoRotate;

  useEffect(() => {
    if (initialProduct) {
      setActiveProduct(initialProduct);
      setSelectedColor(initialProduct.variants[0]?.colorHex || '#1D4ED8');
    }
  }, [initialProduct]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container || !activeProduct) return;

    const width = container.clientWidth || 720;
    const height = container.clientHeight || 480;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#f8fafc');
    scene.fog = new THREE.FogExp2(0xf8fafc, 0.08);

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 50);
    camera.position.set(0.35, 0.42, 2.05);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const onContextRestored = () => setContextLost(false);
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    // Three-point studio lighting
    const hemi = new THREE.HemisphereLight(0xffffff, 0xcbd5e1, 1.3);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfffbeb, 2.1);
    keyLight.position.set(2.8, 4, 3);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xdbeafe, 1.1);
    fillLight.position.set(-3, 1.5, 2);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0x2563eb, 1.2);
    rimLight.position.set(0, 2.5, -3);
    scene.add(rimLight);

    // Architectural studio pedestal
    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.72, 0.78, 0.08, 64),
      new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        roughness: 0.65,
        metalness: 0.1,
      })
    );
    pedestal.position.y = -0.58;
    scene.add(pedestal);

    const grid = new THREE.GridHelper(6, 24, 0xcbd5e1, 0xe2e8f0);
    grid.position.y = -0.62;
    scene.add(grid);

    const modelGroup = buildProductMeshGroup(
      activeProduct.spatialModel,
      selectedColor
    );
    if (wireframe) {
      modelGroup.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = (obj as THREE.Mesh).material as THREE.MeshStandardMaterial;
          m.wireframe = true;
        }
      });
    }
    scene.add(modelGroup);

    // Pointer orbit interaction
    let isDragging = false;
    let prevX = 0;
    let prevY = 0;
    let zoom = 2.05;

    const onPointerDown = (e: PointerEvent) => {
      isDragging = true;
      prevX = e.clientX;
      prevY = e.clientY;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - prevX;
      const dy = e.clientY - prevY;
      modelGroup.rotation.y += dx * 0.01;
      modelGroup.rotation.x = Math.max(
        -0.6,
        Math.min(0.6, modelGroup.rotation.x + dy * 0.008)
      );
      prevX = e.clientX;
      prevY = e.clientY;
    };
    const onPointerUp = () => {
      isDragging = false;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoom = Math.max(1.25, Math.min(3.5, zoom + e.deltaY * 0.0015));
      camera.position.z = zoom;
    };

    const domEl = renderer.domElement;
    domEl.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    domEl.addEventListener('wheel', onWheel, { passive: false });

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || 720;
      const h = container.clientHeight || 480;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    let rafId = 0;
    const animate = () => {
      rafId = requestAnimationFrame(animate);
      if (autoRotateRef.current && !isDragging) {
        modelGroup.rotation.y += 0.006;
      }
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      domEl.removeEventListener('pointerdown', onPointerDown);
      domEl.removeEventListener('wheel', onWheel);
      domEl.removeEventListener('webglcontextlost', onContextLost);
      domEl.removeEventListener('webglcontextrestored', onContextRestored);
      renderer.dispose();
    };
  }, [activeProduct, selectedColor, wireframe]);

  const handleLaunchXrBlocks = async () => {
    try {
      setXrLaunched(true);
      const card = new xb.UICard({
        size: { width: 0.65, height: 'auto' },
        manipulation: true,
        edge: true,
        style: {
          flexDirection: 'column',
          gap: 12,
          padding: 20,
          backgroundColor: '#0f172a',
          borderRadius: 18,
        },
      });
      card.position.set(0, 1.45, -1.1);
      card.add(
        new xb.UIText({
          text: activeProduct.name,
          style: { fontSize: 28, color: '#ffffff' },
        }),
        new xb.UIText({
          text: `${formatInr(activeProduct.discountedPrice)} · ${activeProduct.stock} in stock`,
          style: { fontSize: 20, color: '#60a5fa' },
        }),
        new xb.UIButton({
          label: 'Add to Cart',
          onClick: () => onAddToCart(activeProduct),
        })
      );
      xb.add(card);
      await xb.init(new xb.Options());
    } catch {
      // Fallback gracefully on browsers without active XR session hardware
    }
  };

  if (!activeProduct) return null;

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <p className="text-xs font-medium text-blue-700 tracking-wide">
            Interactive 3D &amp; XR Blocks Product Studio
          </p>
          <h1 className="font-display text-3xl font-bold text-slate-900 mt-1">
            Inspect Hardware in 360° Space
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Drag to orbit, scroll to zoom, switch surface finishes, or launch spatial XR cards.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRotate((v) => !v)}
            className={`px-3.5 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
              autoRotate
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            <RotateCw className="w-3.5 h-3.5 inline mr-1.5" />
            {autoRotate ? 'Auto-Rotate On' : 'Auto-Rotate Off'}
          </button>
          <button
            onClick={() => setWireframe((v) => !v)}
            className={`px-3.5 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
              wireframe
                ? 'bg-blue-700 text-white border-blue-700'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            <Box className="w-3.5 h-3.5 inline mr-1.5" />
            Mesh View
          </button>
          <button
            onClick={handleLaunchXrBlocks}
            className="px-3.5 py-2 text-xs font-medium rounded-lg bg-blue-700 text-white hover:bg-blue-800 transition-colors whitespace-nowrap"
          >
            <Maximize2 className="w-3.5 h-3.5 inline mr-1.5" />
            {xrLaunched ? 'XR Scene Mounted' : 'Launch XR Card'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6 items-stretch">
        {/* 3D Viewport */}
        <div className="lg:col-span-8 relative rounded-xl border border-slate-200 bg-slate-50 overflow-hidden min-h-[440px]">
          {contextLost ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
              <img
                src={activeProduct.images[0]}
                alt={activeProduct.name}
                className="w-64 h-48 object-cover rounded-lg mb-4"
              />
              <p className="text-sm text-slate-600">
                WebGL context paused. Showing studio product frame.
              </p>
            </div>
          ) : (
            <div ref={mountRef} className="w-full h-[460px] xr-canvas-host cursor-grab active:cursor-grabbing" />
          )}

          <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-center justify-between gap-3 bg-white/90 backdrop-blur-sm border border-slate-200 rounded-lg px-4 py-2.5">
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <Sparkles className="w-3.5 h-3.5 text-blue-700" />
              <span>Drag to rotate · Scroll to zoom · {activeProduct.sku}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Finish:</span>
              {activeProduct.variants.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setSelectedColor(v.colorHex || '#1D4ED8')}
                  title={v.label}
                  className={`w-6 h-6 rounded-full border-2 transition-transform ${
                    selectedColor === (v.colorHex || '#1D4ED8')
                      ? 'border-blue-700 scale-110'
                      : 'border-slate-300'
                  }`}
                  style={{ backgroundColor: v.colorHex || '#1E293B' }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Product Selector & Quick Purchase */}
        <div className="lg:col-span-4 flex flex-col justify-between border border-slate-200 rounded-xl p-5 bg-white">
          <div>
            <p className="text-xs text-slate-500">
              {activeProduct.brand} · {activeProduct.categoryName}
            </p>
            <h2 className="font-display text-xl font-bold text-slate-900 mt-1">
              {activeProduct.name}
            </h2>
            <div className="flex items-baseline gap-2.5 mt-3 tabular-nums">
              <span className="text-2xl font-bold text-slate-900">
                {formatInr(activeProduct.discountedPrice)}
              </span>
              <span className="text-sm text-slate-400 line-through">
                {formatInr(activeProduct.originalPrice)}
              </span>
              <span className="text-xs font-semibold text-blue-700">
                {activeProduct.discountPercent}% off
              </span>
            </div>
            <p className="text-sm text-slate-600 mt-3 leading-relaxed">
              {activeProduct.description}
            </p>

            <div className="mt-5 pt-4 border-t border-slate-200">
              <p className="text-xs font-semibold text-slate-700 mb-2.5">
                Switch 3D Product Model
              </p>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {products.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setActiveProduct(p);
                      setSelectedColor(p.variants[0]?.colorHex || '#1D4ED8');
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between transition-colors ${
                      activeProduct.id === p.id
                        ? 'bg-blue-50 text-blue-800 border border-blue-200'
                        : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-transparent'
                    }`}
                  >
                    <span className="truncate pr-2">{p.name}</span>
                    <span className="tabular-nums shrink-0 font-semibold">
                      {formatInr(p.discountedPrice)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 mt-5 pt-4 border-t border-slate-200">
            <button
              onClick={() => onAddToCart(activeProduct)}
              className="flex-1 px-4 py-2.5 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 transition-colors"
            >
              Add to Cart
            </button>
            <button
              onClick={() => onSelectProduct(activeProduct)}
              className="px-4 py-2.5 border border-slate-300 text-slate-800 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              <Eye className="w-4 h-4 inline mr-1.5" />
              Specs
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
