"use client";
import { useEffect, useRef } from "react";

interface AuroraProps {
  colorStops?: string[];
  blend?: number;
  speed?: number;
}

export function Aurora({
  colorStops = ["#185FA5", "#534AB7", "#0a0a0a"],
  blend = 0.4,
  speed = 0.3,
}: AuroraProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const blobs = colorStops.slice(0, -1).map((color, i) => ({
      color: color.slice(0, 7), // берём только первые 7 символов (#RRGGBB)
      x: (i + 1) / colorStops.length,
      y: 0.3 + i * 0.2,
      r: 0.4 + i * 0.1,
      vx: (Math.random() - 0.5) * 0.002,
      vy: (Math.random() - 0.5) * 0.001,
    }));

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      blobs.forEach((blob) => {
        blob.x += blob.vx;
        blob.y += blob.vy;
        if (blob.x < 0 || blob.x > 1) blob.vx *= -1;
        if (blob.y < 0 || blob.y > 1) blob.vy *= -1;

        const alpha = Math.round(blend * 255).toString(16).padStart(2, "0");
        const colorWithAlpha = blob.color + alpha;

        const gradient = ctx.createRadialGradient(
          blob.x * canvas.width,
          blob.y * canvas.height,
          0,
          blob.x * canvas.width,
          blob.y * canvas.height,
          blob.r * canvas.width
        );
        gradient.addColorStop(0, colorWithAlpha);
        gradient.addColorStop(1, "transparent");

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      });

      frameRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [colorStops, blend, speed]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ willChange: "transform" }}
    />
  );
}