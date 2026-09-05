'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

const MODEL_URL = '/models/bahrain-international-circuit-sakhir-bahrain-ogsc.stl';

export function BahrainModelViewer() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [source, setSource] = useState<'atlas' | 'sketchfab'>('atlas');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    if (source !== 'atlas') return;
    const host = hostRef.current;
    if (!host) return;
    setStatus('loading');

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#02070d');
    scene.fog = new THREE.Fog('#02070d', 800, 2200);

    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 10000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.45;
    controls.maxPolarAngle = Math.PI * 0.48;

    scene.add(new THREE.HemisphereLight('#d9efff', '#111419', 2.6));
    const keyLight = new THREE.DirectionalLight('#ffffff', 3.4);
    keyLight.position.set(4, 7, 5);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight('#ff3048', 2.2);
    rimLight.position.set(-5, 3, -4);
    scene.add(rimLight);

    let model: THREE.Mesh | undefined;
    let grid: THREE.GridHelper | undefined;
    const loader = new STLLoader();
    loader.load(
      MODEL_URL,
      (geometry) => {
        geometry.center();
        geometry.rotateX(-Math.PI / 2);
        geometry.computeVertexNormals();
        geometry.computeBoundingBox();
        const bounds = geometry.boundingBox;
        if (!bounds) return;

        const size = new THREE.Vector3();
        bounds.getSize(size);
        const span = Math.max(size.x, size.y, size.z);
        const material = new THREE.MeshStandardMaterial({
          color: '#aebbc1',
          metalness: 0.08,
          roughness: 0.7,
        });
        model = new THREE.Mesh(geometry, material);
        model.position.y = -bounds.min.y;
        scene.add(model);

        grid = new THREE.GridHelper(span * 1.55, 28, '#25343d', '#132029');
        grid.position.y = -0.6;
        scene.add(grid);

        camera.near = Math.max(span / 1000, 0.1);
        camera.far = span * 12;
        camera.position.set(span * 0.78, span * 0.64, span * 0.92);
        controls.target.set(0, size.y * 0.16, 0);
        controls.minDistance = span * 0.45;
        controls.maxDistance = span * 3.1;
        camera.updateProjectionMatrix();
        controls.update();
        setStatus('ready');
      },
      undefined,
      () => setStatus('error'),
    );

    const resize = () => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    let animationFrame = 0;
    const render = () => {
      controls.update();
      renderer.render(scene, camera);
      animationFrame = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      controls.dispose();
      model?.geometry.dispose();
      if (model && Array.isArray(model.material)) model.material.forEach((material) => material.dispose());
      else if (model) model.material.dispose();
      grid?.geometry.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [source]);

  return (
    <div className="circuit-model-view" aria-label="Интерактивная 3D-модель Bahrain International Circuit">
      <div className="model-source-switch" role="group" aria-label="Источник 3D-модели">
        <button type="button" className={source === 'atlas' ? 'is-active' : ''} onClick={() => setSource('atlas')}>Схема рельефа</button>
        <button type="button" className={source === 'sketchfab' ? 'is-active' : ''} onClick={() => setSource('sketchfab')}>Sketchfab</button>
      </div>
      {source === 'atlas' ? (
        <>
          <div ref={hostRef} className="circuit-model-canvas" />
          {status === 'loading' && <div className="model-status">Загрузка 3D-модели…</div>}
          {status === 'error' && <div className="model-status is-error">Не удалось загрузить модель</div>}
          <div className="model-help">Перетащите — вращение · Колесо — масштаб</div>
          <a className="model-credit" href="https://www.thingiverse.com/thing:229471" target="_blank" rel="noreferrer">
            3D-модель: Edigorin · CC BY-NC 4.0
          </a>
        </>
      ) : (
        <div className="sketchfab-model">
          <iframe
            title="Bahrain International Circuit — Sketchfab"
            src="https://sketchfab.com/models/e93b0a1892c44efebbe0a92bf1ff479d/embed?ui_theme=dark&dnt=1&autostart=0"
            allow="autoplay; fullscreen; xr-spatial-tracking"
            allowFullScreen
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
          />
          <a
            className="model-credit"
            href="https://sketchfab.com/3d-models/bahrain-international-circuit-e93b0a1892c44efebbe0a92bf1ff479d"
            target="_blank"
            rel="nofollow noreferrer"
          >
            Bahrain International Circuit · Dave Love SketchFab
          </a>
        </div>
      )}
    </div>
  );
}
