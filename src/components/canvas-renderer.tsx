
"use client";

import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef, useCallback } from 'react';

export type DrawingTool = 'freehand' | 'line' | 'rectangle' | 'circle' | 'triangle';

interface CanvasRendererProps {
  tool: DrawingTool;
  strokeColor: string;
  strokeWidth: number;
  fillColor: string;
  isFillEnabled: boolean;
}

interface Point {
  x: number;
  y: number;
}

interface DrawingAction {
  type: DrawingTool;
  strokeColor: string;
  strokeWidth: number;
  points?: Point[]; // For freehand
  startPoint?: Point; // For shapes
  endPoint?: Point; // For shapes
  fillColor?: string; // For shapes
  isFilled?: boolean; // For shapes
}

export interface CanvasRendererHandle {
  clearCanvas: () => void;
  downloadDrawing: (filename: string) => void;
  undo: () => void;
  redo: () => void;
}

const CanvasRenderer = forwardRef<CanvasRendererHandle, CanvasRendererProps>(
  ({ tool, strokeColor, strokeWidth, fillColor, isFillEnabled }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const contextRef = useRef<CanvasRenderingContext2D | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const [isDrawing, setIsDrawing] = useState(false);
    const [startPoint, setStartPoint] = useState<Point | null>(null);
    const [currentPath, setCurrentPath] = useState<Point[]>([]); // For freehand tool
    
    const [drawingHistory, setDrawingHistory] = useState<DrawingAction[]>([]);
    const [historyIndex, setHistoryIndex] = useState<number>(-1);
    const [canvasSnapshotForPreview, setCanvasSnapshotForPreview] = useState<ImageData | null>(null);


    const getCoordinates = useCallback((event: MouseEvent | TouchEvent): Point | null => {
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
      return { x: clientX - rect.left, y: clientY - rect.top };
    }, []);

    const redrawCanvas = useCallback(() => {
      if (!contextRef.current || !canvasRef.current) return;
      const ctx = contextRef.current;
      const canvas = canvasRef.current;
      const dpr = window.devicePixelRatio || 1;
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

      for (let i = 0; i <= historyIndex; i++) {
        const action = drawingHistory[i];
        drawAction(ctx, action);
      }
    }, [drawingHistory, historyIndex]);
    
    const drawAction = (ctx: CanvasRenderingContext2D, action: DrawingAction) => {
      ctx.strokeStyle = action.strokeColor;
      ctx.lineWidth = action.strokeWidth;
      ctx.fillStyle = action.fillColor || '#000000';

      switch (action.type) {
        case 'freehand':
          if (action.points && action.points.length > 1) {
            ctx.beginPath();
            ctx.moveTo(action.points[0].x, action.points[0].y);
            for (let j = 1; j < action.points.length; j++) {
              ctx.lineTo(action.points[j].x, action.points[j].y);
            }
            ctx.stroke();
          }
          break;
        case 'line':
          if (action.startPoint && action.endPoint) {
            ctx.beginPath();
            ctx.moveTo(action.startPoint.x, action.startPoint.y);
            ctx.lineTo(action.endPoint.x, action.endPoint.y);
            ctx.stroke();
          }
          break;
        case 'rectangle':
          if (action.startPoint && action.endPoint) {
            const rectX = Math.min(action.startPoint.x, action.endPoint.x);
            const rectY = Math.min(action.startPoint.y, action.endPoint.y);
            const rectWidth = Math.abs(action.startPoint.x - action.endPoint.x);
            const rectHeight = Math.abs(action.startPoint.y - action.endPoint.y);
            ctx.beginPath();
            ctx.rect(rectX, rectY, rectWidth, rectHeight);
            if (action.isFilled) ctx.fill();
            ctx.stroke();
          }
          break;
        case 'circle':
          if (action.startPoint && action.endPoint) {
            const radius = Math.sqrt(
              Math.pow(action.endPoint.x - action.startPoint.x, 2) +
              Math.pow(action.endPoint.y - action.startPoint.y, 2)
            );
            ctx.beginPath();
            ctx.arc(action.startPoint.x, action.startPoint.y, radius, 0, 2 * Math.PI);
            if (action.isFilled) ctx.fill();
            ctx.stroke();
          }
          break;
        case 'triangle':
           if (action.startPoint && action.endPoint) {
            ctx.beginPath();
            ctx.moveTo(action.startPoint.x, action.startPoint.y); // Apex
            ctx.lineTo(action.endPoint.x, action.endPoint.y); // Bottom-right
            ctx.lineTo(action.startPoint.x - (action.endPoint.x - action.startPoint.x), action.endPoint.y); // Bottom-left
            ctx.closePath();
            if (action.isFilled) ctx.fill();
            ctx.stroke();
          }
          break;
      }
    };

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
      contextRef.current = context;
      redrawCanvas(); // Redraw history on resize
    }, [redrawCanvas]);

    useEffect(() => {
      initializeCanvas();
      const resizeTargetElement = containerRef.current;
      if (!resizeTargetElement) return;
      const resizeObserver = new ResizeObserver(initializeCanvas);
      resizeObserver.observe(resizeTargetElement);
      return () => resizeObserver.unobserve(resizeTargetElement);
    }, [initializeCanvas]);

    const startDrawingInternal = useCallback((event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      if (event.nativeEvent instanceof TouchEvent) event.preventDefault();
      const nativeEvent = event.nativeEvent;
      const coords = getCoordinates(nativeEvent);
      if (!coords || !contextRef.current) return;

      setIsDrawing(true);
      setStartPoint(coords);
      
      if (tool === 'freehand') {
        setCurrentPath([coords]);
      } else {
        // Snapshot for shape previews
        const dpr = window.devicePixelRatio || 1;
        setCanvasSnapshotForPreview(
          contextRef.current.getImageData(0, 0, contextRef.current.canvas.width / dpr, contextRef.current.canvas.height / dpr)
        );
      }
    }, [getCoordinates, tool]);

    const drawInternal = useCallback((event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      if (!isDrawing || !contextRef.current || !startPoint) return;
      if (event.nativeEvent instanceof TouchEvent) event.preventDefault();
      
      const nativeEvent = event.nativeEvent;
      const currentCoords = getCoordinates(nativeEvent);
      if (!currentCoords) return;

      const ctx = contextRef.current;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth;
      ctx.fillStyle = fillColor;
      
      if (tool === 'freehand') {
        setCurrentPath(prevPath => [...prevPath, currentCoords]);
        ctx.beginPath();
        ctx.moveTo(currentPath[currentPath.length-1].x, currentPath[currentPath.length-1].y);
        ctx.lineTo(currentCoords.x, currentCoords.y);
        ctx.stroke();
      } else {
        // Draw preview for shapes
        if (canvasSnapshotForPreview) {
          ctx.putImageData(canvasSnapshotForPreview, 0, 0);
        } else {
           // Fallback: redraw history if snapshot is missing (should not happen in normal flow)
           redrawCanvas();
        }
        
        const tempAction: DrawingAction = {
            type: tool,
            strokeColor,
            strokeWidth,
            fillColor,
            isFilled: isFillEnabled,
            startPoint: startPoint,
            endPoint: currentCoords
        };
        drawAction(ctx, tempAction);
      }
    }, [isDrawing, startPoint, getCoordinates, tool, strokeColor, strokeWidth, fillColor, isFillEnabled, currentPath, canvasSnapshotForPreview, redrawCanvas]);

    const stopDrawingInternal = useCallback(() => {
      if (!isDrawing || !contextRef.current || !startPoint) return;
      
      const currentCoords = currentPath.length > 0 ? currentPath[currentPath.length-1] : startPoint; // For shapes, endPoint will be the last mouse position.
      
      let newAction: DrawingAction | null = null;
      if (tool === 'freehand') {
        if (currentPath.length > 1) {
          newAction = { type: 'freehand', points: [...currentPath], strokeColor, strokeWidth };
        }
      } else if (currentCoords) { // Ensure currentCoords exists for shapes
         newAction = {
          type: tool,
          startPoint: startPoint,
          endPoint: currentCoords, // This needs to be the actual mouse up coordinate
          strokeColor,
          strokeWidth,
          fillColor: tool !== 'line' ? fillColor : undefined,
          isFilled: tool !== 'line' ? isFillEnabled : undefined,
        };
      }

      if (newAction) {
        const newHistory = drawingHistory.slice(0, historyIndex + 1);
        setDrawingHistory([...newHistory, newAction]);
        setHistoryIndex(newHistory.length);
      }
      
      setIsDrawing(false);
      setStartPoint(null);
      setCurrentPath([]);
      setCanvasSnapshotForPreview(null);
      // Redraw to commit the final action and clear previews
      // Wait for state updates to propagate before redrawing
      requestAnimationFrame(() => {
        if (newAction) redrawCanvas(); // Redraw only if an action was added
      });

    }, [isDrawing, startPoint, tool, currentPath, strokeColor, strokeWidth, fillColor, isFillEnabled, drawingHistory, historyIndex, redrawCanvas]);
    
    // Adjust stopDrawingInternal to get final mouse/touch up coordinates
    const handleMouseUpTouchEnd = useCallback((event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        if (!isDrawing || !contextRef.current || !startPoint) {
            if(isDrawing) setIsDrawing(false); // Ensure drawing state is reset
            return;
        }

        const nativeEvent = event.nativeEvent;
        const finalCoords = getCoordinates(nativeEvent); // Get final coordinates on mouseup/touchend

        let newAction: DrawingAction | null = null;
        if (tool === 'freehand') {
            if (currentPath.length > 0) { // currentPath includes startPoint
                 newAction = { type: 'freehand', points: [...currentPath, ...(finalCoords && currentPath[currentPath.length-1].x !== finalCoords.x && currentPath[currentPath.length-1].y !== finalCoords.y ? [finalCoords] : [])], strokeColor, strokeWidth };
            }
        } else if (finalCoords) {
            newAction = {
                type: tool,
                startPoint: startPoint,
                endPoint: finalCoords,
                strokeColor,
                strokeWidth,
                fillColor: (tool !== 'line' && tool !== 'freehand') ? fillColor : undefined,
                isFilled: (tool !== 'line' && tool !== 'freehand') ? isFillEnabled : undefined,
            };
        } else if (currentPath.length > 0 && tool !== 'freehand') { // Fallback if finalCoords is null (e.g. mouseleave then mouseup outside)
             newAction = {
                type: tool,
                startPoint: startPoint,
                endPoint: currentPath[currentPath.length -1] || startPoint, // Use last drawn point or startPoint
                strokeColor,
                strokeWidth,
                fillColor: (tool !== 'line' && tool !== 'freehand') ? fillColor : undefined,
                isFilled: (tool !== 'line' && tool !== 'freehand') ? isFillEnabled : undefined,
            };
        }


        if (newAction) {
            const newHistory = drawingHistory.slice(0, historyIndex + 1);
            setDrawingHistory([...newHistory, newAction]);
            setHistoryIndex(newHistory.length); // This will be newHistory.length (index of the new item)
        }
        
        setIsDrawing(false);
        setStartPoint(null);
        setCurrentPath([]);
        setCanvasSnapshotForPreview(null);
        
        requestAnimationFrame(() => {
            if (newAction) redrawCanvas();
        });

    }, [isDrawing, startPoint, tool, currentPath, strokeColor, strokeWidth, fillColor, isFillEnabled, drawingHistory, historyIndex, redrawCanvas, getCoordinates]);


    useImperativeHandle(ref, () => ({
      clearCanvas: () => {
        if (contextRef.current && canvasRef.current) {
          const canvas = canvasRef.current;
          const dpr = window.devicePixelRatio || 1;
          contextRef.current.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
          setDrawingHistory([]);
          setHistoryIndex(-1);
        }
      },
      downloadDrawing: (filename: string) => {
        if (canvasRef.current) {
          // Temporarily set background to white for download if needed
          const ctx = contextRef.current;
          const canvas = canvasRef.current;
          if (ctx) {
            const dpr = window.devicePixelRatio || 1;
            // Create a temporary canvas for download
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = canvas.width;
            tempCanvas.height = canvas.height;
            const tempCtx = tempCanvas.getContext('2d');
            if (tempCtx) {
                // Fill background
                tempCtx.fillStyle = '#FFFFFF'; // White background
                tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
                // Scale and draw current canvas content
                tempCtx.drawImage(canvas, 0, 0);

                const dataURL = tempCanvas.toDataURL('image/png');
                const link = document.createElement('a');
                link.href = dataURL;
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
          }
        }
      },
      undo: () => {
        if (historyIndex >= 0) {
          setHistoryIndex(prevIndex => prevIndex - 1);
          requestAnimationFrame(redrawCanvas);
        }
      },
      redo: () => {
        if (historyIndex < drawingHistory.length - 1) {
          setHistoryIndex(prevIndex => prevIndex + 1);
          requestAnimationFrame(redrawCanvas);
        }
      },
    }));

    return (
      <div ref={containerRef} className="w-full h-full touch-none">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawingInternal}
          onMouseMove={drawInternal}
          onMouseUp={handleMouseUpTouchEnd}
          onMouseLeave={isDrawing ? handleMouseUpTouchEnd : undefined} // Finalize shape if mouse leaves while drawing
          onTouchStart={startDrawingInternal}
          onTouchMove={drawInternal}
  	      onTouchEnd={handleMouseUpTouchEnd}
          className="w-full h-full cursor-crosshair"
          data-ai-hint="drawing abstract"
        />
      </div>
    );
  }
);

CanvasRenderer.displayName = 'CanvasRenderer';
export default CanvasRenderer;

    