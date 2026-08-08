"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

function createBackLabel() {
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 620;
  const context = canvas.getContext("2d");

  if (!context) return null;

  context.fillStyle = "#fffdf7";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "#141414";
  context.lineWidth = 10;
  context.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);
  context.fillStyle = "#141414";
  context.textAlign = "center";
  context.font = "800 54px Arial";
  context.fillText("M'ma Organic Farm", 360, 102);
  context.font = "700 34px Arial";
  context.fillText("FRESH FROM FARM", 360, 178);
  context.font = "500 30px Arial";
  context.fillText("Glass bottle", 360, 274);
  context.fillText("1 litre", 360, 332);
  context.fillText("₹62", 360, 390);
  context.font = "700 26px Arial";
  context.fillText("JAMSHEDPUR", 360, 506);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function BottleScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<HTMLAnchorElement>(null);
  const interactingRef = useRef(false);
  const hoveredRef = useRef(false);
  const draggedRef = useRef(false);
  const previousXRef = useRef(0);
  const dragVelocityRef = useRef(0);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = sceneRef.current;
    if (!canvas || !container) return;
    container.dataset.sceneStatus = "initializing";

    let frame = 0;
    let renderer: THREE.WebGLRenderer | undefined;
    const disposables: Array<{ dispose: () => void }> = [];

    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: "high-performance",
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setClearColor(0x000000, 0);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
      camera.position.set(0, 0.1, 8.6);

      const bottle = new THREE.Group();
      bottle.rotation.x = -0.035;
      scene.add(bottle);

      const milkProfile = [
        new THREE.Vector2(0.72, -2.43),
        new THREE.Vector2(0.86, -2.35),
        new THREE.Vector2(0.9, -1.9),
        new THREE.Vector2(0.88, 0.75),
        new THREE.Vector2(0.78, 1.28),
        new THREE.Vector2(0.62, 1.5),
        new THREE.Vector2(0.42, 1.62),
      ];
      const milkGeometry = new THREE.LatheGeometry(milkProfile, 72);
      const milkMaterial = new THREE.MeshStandardMaterial({
        color: 0xfff8df,
        roughness: 0.34,
        metalness: 0,
      });
      const milk = new THREE.Mesh(milkGeometry, milkMaterial);
      bottle.add(milk);
      disposables.push(milkGeometry, milkMaterial);

      const glassProfile = [
        new THREE.Vector2(0.74, -2.52),
        new THREE.Vector2(0.92, -2.45),
        new THREE.Vector2(0.98, -2.24),
        new THREE.Vector2(0.96, -0.3),
        new THREE.Vector2(0.9, 1.28),
        new THREE.Vector2(0.78, 1.62),
        new THREE.Vector2(0.56, 1.9),
        new THREE.Vector2(0.43, 2.04),
        new THREE.Vector2(0.42, 2.56),
        new THREE.Vector2(0.5, 2.64),
      ];
      const glassGeometry = new THREE.LatheGeometry(glassProfile, 96);
      const glassMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xdff5ff,
        transparent: true,
        opacity: 0.36,
        roughness: 0.08,
        metalness: 0,
        transmission: 0.5,
        thickness: 0.24,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const glass = new THREE.Mesh(glassGeometry, glassMaterial);
      glass.renderOrder = 2;
      bottle.add(glass);
      disposables.push(glassGeometry, glassMaterial);

      const capGeometry = new THREE.CylinderGeometry(0.53, 0.5, 0.28, 64);
      const capMaterial = new THREE.MeshStandardMaterial({
        color: 0xf5f4ef,
        roughness: 0.23,
        metalness: 0.55,
      });
      const cap = new THREE.Mesh(capGeometry, capMaterial);
      cap.position.y = 2.72;
      bottle.add(cap);
      disposables.push(capGeometry, capMaterial);

      const rimGeometry = new THREE.TorusGeometry(0.47, 0.035, 16, 64);
      const rimMaterial = new THREE.MeshStandardMaterial({
        color: 0xc7d4d9,
        roughness: 0.2,
        metalness: 0.7,
      });
      const rim = new THREE.Mesh(rimGeometry, rimMaterial);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 2.59;
      bottle.add(rim);
      disposables.push(rimGeometry, rimMaterial);

      const frontTexture = new THREE.TextureLoader().load("/mma-logo.png");
      frontTexture.colorSpace = THREE.SRGBColorSpace;
      frontTexture.anisotropy = 4;
      const frontGeometry = new THREE.PlaneGeometry(1.55, 1.3);
      const frontMaterial = new THREE.MeshBasicMaterial({
        map: frontTexture,
        transparent: true,
        alphaTest: 0.03,
        side: THREE.FrontSide,
      });
      const frontLabel = new THREE.Mesh(frontGeometry, frontMaterial);
      frontLabel.position.set(0, -0.18, 0.955);
      frontLabel.renderOrder = 4;
      bottle.add(frontLabel);
      disposables.push(frontTexture, frontGeometry, frontMaterial);

      const backTexture = createBackLabel();
      if (backTexture) {
        const backGeometry = new THREE.PlaneGeometry(1.5, 1.3);
        const backMaterial = new THREE.MeshBasicMaterial({ map: backTexture });
        const backLabel = new THREE.Mesh(backGeometry, backMaterial);
        backLabel.position.set(0, -0.18, -0.955);
        backLabel.rotation.y = Math.PI;
        backLabel.renderOrder = 4;
        bottle.add(backLabel);
        disposables.push(backTexture, backGeometry, backMaterial);
      }

      const highlightGeometry = new THREE.CapsuleGeometry(0.035, 2.8, 8, 16);
      const highlightMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.46,
      });
      const highlight = new THREE.Mesh(highlightGeometry, highlightMaterial);
      highlight.position.set(-0.66, 0.15, 0.68);
      highlight.rotation.z = -0.06;
      bottle.add(highlight);
      disposables.push(highlightGeometry, highlightMaterial);

      const shadowGeometry = new THREE.CircleGeometry(1.15, 64);
      const shadowMaterial = new THREE.MeshBasicMaterial({
        color: 0x174c78,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      });
      const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
      shadow.scale.set(1.2, 0.3, 1);
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.set(0, -2.58, 0);
      scene.add(shadow);
      disposables.push(shadowGeometry, shadowMaterial);

      scene.add(new THREE.HemisphereLight(0xffffff, 0x8ecbed, 2.2));
      const keyLight = new THREE.DirectionalLight(0xffffff, 4.5);
      keyLight.position.set(-3, 4, 5);
      scene.add(keyLight);
      const edgeLight = new THREE.DirectionalLight(0x58b9ef, 3.2);
      edgeLight.position.set(4, 1, -3);
      scene.add(edgeLight);

      const resize = () => {
        const { width, height } = container.getBoundingClientRect();
        renderer?.setSize(width, height, false);
        camera.aspect = width / Math.max(height, 1);
        camera.updateProjectionMatrix();
        bottle.scale.setScalar(width < 520 ? 0.92 : 1.08);
      };

      const resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(container);
      resize();

      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
      const clock = new THREE.Clock();
      const render = () => {
        const elapsed = clock.getElapsedTime();
        const motionPaused = hoveredRef.current || interactingRef.current;
        if (!reduceMotion.matches && !motionPaused) {
          bottle.rotation.y += 0.004;
        }
        if (Math.abs(dragVelocityRef.current) > 0.0001) {
          bottle.rotation.y += dragVelocityRef.current;
          dragVelocityRef.current *= 0.88;
        }
        bottle.position.y = reduceMotion.matches || motionPaused ? 0 : Math.sin(elapsed * 1.35) * 0.06;
        renderer?.render(scene, camera);
        container.dataset.sceneStatus = "ready";
        frame = requestAnimationFrame(render);
      };
      render();

      return () => {
        cancelAnimationFrame(frame);
        resizeObserver.disconnect();
        disposables.forEach((item) => item.dispose());
        renderer?.dispose();
      };
    } catch (error) {
      container.dataset.sceneStatus = "fallback";
      container.dataset.sceneError = error instanceof Error ? error.message : "WebGL unavailable";
      setFallback(true);
    }
  }, []);

  return (
    <a
      ref={sceneRef}
      className="bottle-scene-link"
      href="#milk"
      aria-label="Explore M'ma farm fresh milk"
      onClick={(event) => {
        if (draggedRef.current) event.preventDefault();
        draggedRef.current = false;
      }}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") hoveredRef.current = true;
      }}
      onPointerLeave={() => {
        hoveredRef.current = false;
        interactingRef.current = false;
      }}
      onPointerDown={(event) => {
        interactingRef.current = true;
        draggedRef.current = false;
        previousXRef.current = event.clientX;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!interactingRef.current) return;
        const movement = event.clientX - previousXRef.current;
        if (Math.abs(movement) > 2) draggedRef.current = true;
        previousXRef.current = event.clientX;
        dragVelocityRef.current = movement * 0.012;
      }}
      onPointerUp={(event) => {
        interactingRef.current = false;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
    >
      {fallback ? (
        <img className="bottle-fallback" src="/hero-milk.png" alt="M'ma Farms fresh milk bottle" />
      ) : (
        <canvas ref={canvasRef} className="bottle-canvas" aria-hidden="true" />
      )}
    </a>
  );
}
