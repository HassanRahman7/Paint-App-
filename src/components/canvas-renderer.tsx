
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
    const containerRef = useRef<HTMLDivElement>(null);

    const getCoordinates = useCallback((event: MouseEvent | TouchEvent): { x: number; y: number } | null => {
      if (!canvasRef.current) return null;
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();

      let clientX, clientY;
      if (event instanceof MouseEvent) {
        clientX = event.clientX;
        clientY = event.clientY;
      } else if (event instanceof TouchEvent) {
        if (event.touches && event.touches.length > 0) {
          clientX = event.touches[0].clientX;
          clientY = event.touches[0].clientY;
        } else if (event.changedTouches && event.changedTouches.length > 0) {
          // Used for touchend/touchcancel if coords were needed there
          clientX = event.changedTouches[0].clientX;
          clientY = event.changedTouches[0].clientY;
        } else {
          return null;
        }
      } else {
        return null;
      }
      
      if (clientX === undefined || clientY === undefined) {
        return null;
      }

      return {
        x: clientX - rect.left,
        y: clientY - rect.top,
      };
    }, []); // canvasRef is stable, so empty dependency array is fine.

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
      context.strokeStyle = brushColor;
      context.lineWidth = brushSize;
      contextRef.current = context;
    }, [brushColor, brushSize]); // Keep brushColor, brushSize for initial setup and if they cause re-init

    useEffect(() => {
      initializeCanvas();

      const resizeTargetElement = containerRef.current;
      if (!resizeTargetElement) return;

      const resizeObserver = new ResizeObserver(() => {
        initializeCanvas();
      });
      resizeObserver.observe(resizeTargetElement);

      return () => {
        resizeObserver.unobserve(resizeTargetElement);
      };
    }, [initializeCanvas]);

    useEffect(() => {
      if (contextRef.current) {
        contextRef.current.strokeStyle = brushColor;
        contextRef.current.lineWidth = brushSize;
      }
    }, [brushColor, brushSize]);

    const startDrawing = useCallback((event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      if (event.nativeEvent instanceof TouchEvent) {
        event.preventDefault();
      }
      const nativeEvent = event.nativeEvent;
      const coords = getCoordinates(nativeEvent);
      if (!coords || !contextRef.current) return;
      
      setIsDrawing(true);
      contextRef.current.beginPath();
      contextRef.current.moveTo(coords.x, coords.y);
      lastPositionRef.current = coords;
    }, [getCoordinates]);

    const draw = useCallback((event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      if (!isDrawing || !contextRef.current) return;
      
      if (event.nativeEvent instanceof TouchEvent) {
        event.preventDefault();
      }
      const nativeEvent = event.nativeEvent;
      const coords = getCoordinates(nativeEvent);
      if (!coords) return;

      if (lastPositionRef.current) {
         contextRef.current.lineTo(coords.x, coords.y);
         contextRef.current.stroke();
      }
      lastPositionRef.current = coords;
    }, [isDrawing, getCoordinates]);

    const stopDrawing = useCallback(() => {
      if (!contextRef.current || !isDrawing) return;
      // contextRef.current.closePath(); // Removed for typical freehand drawing
      setIsDrawing(false);
      lastPositionRef.current = null;
    }, [isDrawing]);

    useImperativeHandle(ref, () => ({
      clearCanvas: () => {
        if (contextRef.current && canvasRef.current) {
          const canvas = canvasRef.current;
          const dpr = window.devicePixelRatio || 1; // Use DPR for clearing
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
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
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

