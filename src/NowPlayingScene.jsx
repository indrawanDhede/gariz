import { useEffect, useRef } from "react";
import * as THREE from "three";

function NowPlayingScene({ isPlaying, currentTime }) {
  const mountRef = useRef(null);
  const isPlayingRef = useRef(isPlaying);
  const currentTimeRef = useRef(currentTime);
  const sceneRef = useRef({
    orb: null,
    halo: null,
    particles: null,
    renderer: null,
    frameId: null,
    resizeObserver: null,
  });

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return undefined;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0, 4.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0x7cf7c2, 0.7);
    scene.add(ambient);

    const keyLight = new THREE.PointLight(0x1ed760, 2.1, 25, 2);
    keyLight.position.set(2.4, 2.8, 3.6);
    scene.add(keyLight);

    const fillLight = new THREE.PointLight(0x14532d, 1.1, 30, 2);
    fillLight.position.set(-2.6, -2.1, 2.4);
    scene.add(fillLight);

    const orbGeometry = new THREE.IcosahedronGeometry(1, 4);
    const orbMaterial = new THREE.MeshStandardMaterial({
      color: 0x1ed760,
      emissive: 0x0f3f2f,
      emissiveIntensity: 0.9,
      roughness: 0.26,
      metalness: 0.2,
      transparent: true,
      opacity: 0.94,
    });
    const orb = new THREE.Mesh(orbGeometry, orbMaterial);
    scene.add(orb);

    const haloGeometry = new THREE.TorusGeometry(1.45, 0.06, 18, 120);
    const haloMaterial = new THREE.MeshBasicMaterial({
      color: 0x7cf7c2,
      transparent: true,
      opacity: 0.42,
    });
    const halo = new THREE.Mesh(haloGeometry, haloMaterial);
    halo.rotation.x = Math.PI / 2.6;
    scene.add(halo);

    const particleCount = 180;
    const particleGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i += 1) {
      const radius = 1.7 + Math.random() * 0.8;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi);
    }

    particleGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3),
    );

    const particlesMaterial = new THREE.PointsMaterial({
      color: 0x8bffcc,
      size: 0.03,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    });
    const particles = new THREE.Points(particleGeometry, particlesMaterial);
    scene.add(particles);

    const updateSize = () => {
      const width = mount.clientWidth || 1;
      const height = mount.clientHeight || 1;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    updateSize();
    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(mount);

    sceneRef.current = {
      orb,
      halo,
      particles,
      renderer,
      frameId: null,
      resizeObserver,
    };

    let startedAt = performance.now();

    const animate = (now) => {
      const elapsed = (now - startedAt) / 1000;
      const playBoost = isPlayingRef.current ? 1 : 0;
      const beat = Math.sin((currentTimeRef.current + elapsed) * 6.2);
      const pulse = 1 + playBoost * (0.06 + Math.max(0, beat) * 0.12);

      orb.rotation.x += 0.003 + playBoost * 0.011;
      orb.rotation.y += 0.004 + playBoost * 0.016;
      orb.scale.setScalar(pulse);
      orb.material.emissiveIntensity = 0.72 + playBoost * 0.42;

      halo.rotation.z += 0.005 + playBoost * 0.014;
      halo.rotation.y += 0.0015 + playBoost * 0.005;
      halo.scale.setScalar(0.96 + playBoost * 0.12 + Math.max(0, beat) * 0.08);
      halo.material.opacity = 0.28 + playBoost * 0.24;

      particles.rotation.y += 0.001 + playBoost * 0.006;
      particles.rotation.x += 0.0006 + playBoost * 0.003;
      particles.material.opacity = 0.48 + playBoost * 0.34;
      particles.scale.setScalar(0.96 + playBoost * 0.1);

      renderer.render(scene, camera);
      sceneRef.current.frameId = requestAnimationFrame(animate);
    };

    sceneRef.current.frameId = requestAnimationFrame(animate);

    return () => {
      if (sceneRef.current.frameId) {
        cancelAnimationFrame(sceneRef.current.frameId);
      }

      if (sceneRef.current.resizeObserver) {
        sceneRef.current.resizeObserver.disconnect();
      }

      particleGeometry.dispose();
      particlesMaterial.dispose();
      haloGeometry.dispose();
      haloMaterial.dispose();
      orbGeometry.dispose();
      orbMaterial.dispose();
      renderer.dispose();

      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div className="now-playing-scene" ref={mountRef} aria-hidden="true" />
  );
}

export default NowPlayingScene;
