
"use client";

import type { LegacyRef } from 'react';
import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef, useCallback } from 'react';

interface CanvasRendererProps {
  brushColor: string;
  brushSize: number;
}

export interface CanvasRendererHandle {
  clearCanvas: () => void;
  downloadDrawing: (filename: string) => void;
}

const CanvasRenderer = forwardRef<CanvasRendererHandle, CanvasRendererProps>(
  ({ brushColor, brushSize }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const contextRef = useRef<CanvasRenderingContext2D | null>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const lastPositionRef = useRef<{ x: number; y: number } | null>(null);
    const containerRef = useRef<HTMLDivElement>(null); // Ref for the direct parent div

    const initializeCanvas = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas || !containerRef.current) return;

      const context = canvas.getContext('2d');
      if (!context) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = containerRef.current.getBoundingClientRect();

      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      context.scale(dpr, dpr);
      context.lineCap = 'round';
      context.lineJoin = 'round';
      // Set initial brush properties after context is (re)created
      context.strokeStyle = brushColor;
      context.lineWidth = brushSize;
      contextRef.current = context;
    }, [brushColor, brushSize]); // Add brushColor and brushSize dependencies
    
    useEffect(() => {
      initializeCanvas(); // Initial setup

      const canvasElement = containerRef.current; // Observe the parent div
      if (!canvasElement) return;

      const resizeObserver = new ResizeObserver(() => {
        // Preserve drawing would require more complex logic (e.g., redrawing from stored paths or offscreen canvas)
        // For now, resize clears the canvas as new width/height are set.
        initializeCanvas(); 
      });
      resizeObserver.observe(canvasElement);

      return () => {
        resizeObserver.unobserve(canvasElement);
      };
    }, [initializeCanvas]);

    useEffect(() => {
      if (contextRef.current) {
        contextRef.current.strokeStyle = brushColor;
        contextRef.current.lineWidth = brushSize;
      }
    }, [brushColor, brushSize]);

    const getCoordinates = (event: MouseEvent | TouchEvent): { x: number; y: number } | null => {
      if (!canvasRef.current) return null;
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();

      let clientX, clientY;
      if (event instanceof MouseEvent) {
        clientX = event.clientX;
        clientY = event.clientY;
      } else if (event.touches && event.touches.length > 0) {
        clientX = event.touches[0].clientX;
        clientY = event.touches[0].clientY;
      } else if (event instanceof TouchEvent && event.changedTouches && event.changedTouches.length > 0) {
        // Handle touchend/touchcancel if needed, though stopDrawing doesn't use coords
        clientX = event.changedTouches[0].clientX;
        clientY = event.changedTouches[0].clientY;
      }
      else {
        return null;
      }
      return {
        x: clientX - rect.left,
        y: clientY - rect.top,
      };
    };

    const startDrawing = useCallback((event: MouseEvent | TouchEvent) => {
      const coords = getCoordinates(event);
      if (!coords || !contextRef.current) return;
      
      setIsDrawing(true);
      contextRef.current.beginPath();
      contextRef.current.moveTo(coords.x, coords.y);
      lastPositionRef.current = coords;
      if (event instanceof TouchEvent) event.preventDefault();
    }, []);

    const draw = useCallback((event: MouseEvent | TouchEvent) => {
      if (!isDrawing || !contextRef.current) return;
      const coords = getCoordinates(event);
      if (!coords) return;

      if (lastPositionRef.current) {
         contextRef.current.lineTo(coords.x, coords.y);
         contextRef.current.stroke();
      }
      lastPositionRef.current = coords;
      if (event instanceof TouchEvent) event.preventDefault();
    }, [isDrawing]);

    const stopDrawing = useCallback(() => {
      if (!contextRef.current || !isDrawing) return; // Only stop if currently drawing
      contextRef.current.closePath();
      setIsDrawing(false);
      lastPositionRef.current = null;
    }, [isDrawing]);

    useImperativeHandle(ref, () => ({
      clearCanvas: () => {
        if (contextRef.current && canvasRef.current) {
          const canvas = canvasRef.current;
          const dpr = window.devicePixelRatio || 1;
          contextRef.current.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
        }
      },
      downloadDrawing: (filename: string) => {
        if (canvasRef.current) {
          const dataURL = canvasRef.current.toDataURL('image/png');
          const link = document.createElement('a');
          link.href = dataURL;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      },
    }));

    return (
      <div ref={containerRef} className="w-full h-full touch-none">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing as unknown as React.MouseEventHandler<HTMLCanvasElement>}
          onMouseMove={draw as unknown as React.MouseEventHandler<HTMLCanvasElement>}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing} // Stop drawing if mouse leaves canvas
          onTouchStart={startDrawing as unknown as React.TouchEventHandler<HTMLCanvasElement>}
          onTouchMove={draw as unknown as React.TouchEventHandler<HTMLCanvasElement>}
  	      onTouchEnd={stopDrawing}
          className="w-full h-full cursor-crosshair"
          data-ai-hint="drawing abstract"
        />
      </div>
    );
  }
);

CanvasRenderer.displayName = 'CanvasRenderer';
export default CanvasRenderer;
