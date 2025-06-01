
"use client";

import type { DrawingTool, Point, TextElementData, ImageActionData, DrawingAction, ShapeAction, FreehandAction, LineAction, TextAction, EraserAction, ImageDrawingAction } from '@/lib/types';
import React, { useEffect, useRef, useImperativeHandle, forwardRef, useCallback, useState } from 'react';


export interface CanvasRendererHandle {
  getCanvasElement: () => HTMLCanvasElement | null;
  downloadDrawing: (filename: string) => void; // This can remain as it operates on current visual state
  // History related methods (undo, redo, clear, add*) will be removed from here
  // as history is managed by the parent.
  // Methods for direct interaction might still be needed if parent needs to query.
  getTextElementById: (id: string) => Promise<TextElementData | null>; // Still useful for editing
  getTextElementIdAtPoint: (point: Point) => Promise<string | null>; // Still useful for selection
}

interface CanvasRendererProps {
  drawingHistory: DrawingAction[]; // Passed from parent
  historyIndex: number; // Passed from parent
  
  tool: DrawingTool;
  strokeColor: string;
  strokeWidth: number;
  fillColor: string;
  isFillEnabled: boolean;
  
  currentTextFormatting: Omit<TextElementData, 'id' | 'text' | 'x' | 'y' | 'measuredWidth' | 'measuredHeight'>; // For text previews or new text
  currentEditingTextId?: string | null; // ID of text element currently being edited/selected
  
  onCommitAction: (action: Omit<DrawingAction, 'id' | 'visible'>) => void; // Callback to parent to add action to history

  onTextSelect?: (id: string) => void; // Callback when a text element is selected on canvas
  onTextDragEnd?: (id: string, x: number, y: number, textElement: TextElementData | null) => void; // Callback when text dragging finishes
}


const CanvasRenderer = forwardRef<CanvasRendererHandle, CanvasRendererProps>(
  ({ 
    drawingHistory, historyIndex, // Direct props for drawing state
    tool, strokeColor, strokeWidth, fillColor, isFillEnabled,
    currentTextFormatting, currentEditingTextId,
    onCommitAction, onTextSelect, onTextDragEnd
  }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const contextRef = useRef<CanvasRenderingContext2D | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const [isDrawing, setIsDrawing] = useState(false);
    const [startPoint, setStartPoint] = useState<Point | null>(null);
    const currentPathRef = useRef<Point[]>([]); 
    const [canvasSnapshotForPreview, setCanvasSnapshotForPreview] = useState<ImageData | null>(null);

    const [draggingTextId, setDraggingTextId] = useState<string | null>(null);
    const [dragStartOffset, setDragStartOffset] = useState<Point | null>(null);
    const [currentDragPosition, setCurrentDragPosition] = useState<Point | null>(null);

    const [mouseCanvasPosition, setMouseCanvasPosition] = useState<Point | null>(null);
    const [isMouseOnCanvas, setIsMouseOnCanvas] = useState<boolean>(false);
    
    const imageElementsCache = useRef<Map<string, HTMLImageElement>>(new Map());

    const getCoordinates = useCallback((event: MouseEvent | TouchEvent | React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>): Point | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      let clientX, clientY;

      if ('clientX' in event && 'clientY' in event) { 
        clientX = event.clientX; clientY = event.clientY;
      } else if ('touches' in event && event.touches && event.touches.length > 0) { 
        clientX = event.touches[0].clientX; clientY = event.touches[0].clientY;
      } else if ('changedTouches' in event && event.changedTouches && event.changedTouches.length > 0) { 
        clientX = event.changedTouches[0].clientX; clientY = event.changedTouches[0].clientY;
      } else { return null; }
      
      if (clientX === undefined || clientY === undefined) return null;
      return { x: clientX - rect.left, y: clientY - rect.top };
    }, []);

    const drawTextElement = (ctx: CanvasRenderingContext2D, data: TextElementData, isSelected?: boolean) => {
        ctx.font = `${data.isBold ? 'bold ' : ''}${data.isItalic ? 'italic ' : ''}${data.fontSize}px ${data.fontFamily}`;
        ctx.fillStyle = data.textColor;
        ctx.textAlign = data.textAlign;
        ctx.fillText(data.text, data.x, data.y);

        if (data.isUnderline) {
            const metrics = ctx.measureText(data.text);
            let underlineStartX = data.x;
            if (data.textAlign === 'left') underlineStartX = data.x;
            else if (data.textAlign === 'center') underlineStartX = data.x - metrics.width / 2;
            else underlineStartX = data.x - metrics.width;
            
            const baselineOffset = data.fontSize * 0.1; 
            ctx.fillRect(underlineStartX, data.y + baselineOffset + 2, metrics.width, Math.max(1, data.fontSize / 15));
        }
        
        if (isSelected) {
            ctx.strokeStyle = 'rgba(0, 123, 255, 0.7)';
            ctx.lineWidth = 1 / (window.devicePixelRatio || 1) ; // Ensure logical pixel width for selection
            ctx.setLineDash([4 / (window.devicePixelRatio || 1), 2 / (window.devicePixelRatio || 1)]);
            const padding = 5;
            let boxX = data.x;
            if (data.textAlign === 'left') boxX = data.x - padding;
            else if (data.textAlign === 'center') boxX = data.x - data.measuredWidth / 2 - padding;
            else boxX = data.x - data.measuredWidth - padding;

            ctx.strokeRect(boxX, data.y - data.measuredHeight - padding, data.measuredWidth + padding * 2, data.measuredHeight + padding * 2 );
            ctx.setLineDash([]);
        }
    };
    
    const drawSpecificShapeAction = (ctx: CanvasRenderingContext2D, action: ShapeAction | LineAction | FreehandAction) => {
      ctx.strokeStyle = action.strokeColor;
      ctx.lineWidth = action.strokeWidth;
      ctx.globalCompositeOperation = 'source-over';

      if (action.type === 'freehand') {
          if (action.points && action.points.length > 1) {
            ctx.beginPath(); ctx.moveTo(action.points[0].x, action.points[0].y);
            for (let j = 1; j < action.points.length; j++) ctx.lineTo(action.points[j].x, action.points[j].y);
            ctx.stroke();
          }
      } else if (action.type === 'line') {
           if (action.startPoint && action.endPoint) {
            ctx.beginPath(); ctx.moveTo(action.startPoint.x, action.startPoint.y);
            ctx.lineTo(action.endPoint.x, action.endPoint.y); ctx.stroke();
          }
      } else if (action.type === 'rectangle' || action.type === 'circle' || action.type === 'triangle') {
          // Common for shapes that can be filled
          ctx.fillStyle = action.fillColor || '#000000';
          if (action.type === 'rectangle') {
              if (action.startPoint && action.endPoint) {
                  const rectX = Math.min(action.startPoint.x, action.endPoint.x);
                  const rectY = Math.min(action.startPoint.y, action.endPoint.y);
                  const rectWidth = Math.abs(action.startPoint.x - action.endPoint.x);
                  const rectHeight = Math.abs(action.startPoint.y - action.endPoint.y);
                  ctx.beginPath(); ctx.rect(rectX, rectY, rectWidth, rectHeight);
                  if (action.isFilled) ctx.fill();
                  ctx.stroke();
              }
          } else if (action.type === 'circle') {
              if (action.startPoint && action.endPoint) {
                  const radius = Math.sqrt(Math.pow(action.endPoint.x - action.startPoint.x, 2) + Math.pow(action.endPoint.y - action.startPoint.y, 2));
                  ctx.beginPath(); ctx.arc(action.startPoint.x, action.startPoint.y, radius, 0, 2 * Math.PI);
                  if (action.isFilled) ctx.fill();
                  ctx.stroke();
              }
          } else if (action.type === 'triangle') {
              if (action.startPoint && action.endPoint) {
                  ctx.beginPath(); ctx.moveTo(action.startPoint.x, action.startPoint.y);
                  ctx.lineTo(action.endPoint.x, action.endPoint.y);
                  ctx.lineTo(action.startPoint.x - (action.endPoint.x - action.startPoint.x), action.endPoint.y);
                  ctx.closePath();
                  if (action.isFilled) ctx.fill();
                  ctx.stroke();
              }
          }
      }
    };

    const redrawCanvas = useCallback(() => {
      const ctx = contextRef.current;
      const canvas = canvasRef.current;
      if (!ctx || !canvas) return;
      
      ctx.clearRect(0, 0, canvas.width / (window.devicePixelRatio || 1), canvas.height / (window.devicePixelRatio || 1));

      const latestTextElements = new Map<string, TextElementData>();
      const imagesToProcessInThisRedraw: Array<{action: ImageDrawingAction, attemptLoad: boolean}> = [];

      // Iterate through the history provided by parent
      for (let i = 0; i <= historyIndex; i++) {
        const action = drawingHistory[i];
        if (action.visible === false) continue; // Skip hidden actions

        ctx.globalCompositeOperation = 'source-over'; 

        if (action.type === 'text') {
            ctx.font = `${action.data.isBold ? 'bold ' : ''}${action.data.isItalic ? 'italic ' : ''}${action.data.fontSize}px ${action.data.fontFamily}`;
            const metrics = ctx.measureText(action.data.text);
            const updatedData = { ...action.data, measuredWidth: metrics.width, measuredHeight: action.data.fontSize };
            latestTextElements.set(action.id, updatedData); // Use action.id for text elements
        } else if (action.type === 'eraser') {
            const { points, size } = action;
            for (const point of points) {
                ctx.clearRect(point.x - size / 2, point.y - size / 2, size, size);
            }
        } else if (action.type === 'image') {
            imagesToProcessInThisRedraw.push({action: action, attemptLoad: true});
        }
         else { 
            drawSpecificShapeAction(ctx, action as ShapeAction | LineAction | FreehandAction);
        }
      }
      
      latestTextElements.forEach((textData, id) => {
          if (draggingTextId === id && currentDragPosition) { 
              drawTextElement(ctx, { ...textData, x: currentDragPosition.x, y: currentDragPosition.y }, currentEditingTextId === id);
          } else {
              drawTextElement(ctx, textData, currentEditingTextId === id);
          }
      });

      imagesToProcessInThisRedraw.forEach(({action, attemptLoad}) => {
          let img = imageElementsCache.current.get(action.data.src);
          if (img && img.complete && img.naturalWidth > 0) {
              ctx.drawImage(img, action.data.x, action.data.y, action.data.width, action.data.height);
          } else if (attemptLoad && (!img || (!img.complete && !img.dataset.loading))) {
              const newImg = new Image();
              newImg.dataset.loading = 'true'; 
              imageElementsCache.current.set(action.data.src, newImg);
              newImg.src = action.data.src;
              newImg.onload = () => {
                  delete newImg.dataset.loading; 
                  requestAnimationFrame(redrawCanvas); 
              };
              newImg.onerror = () => {
                  console.error("Error loading image for drawing:", action.data.src);
                  imageElementsCache.current.delete(action.data.src); 
                  delete newImg.dataset.loading;
              };
          }
      });

      if (tool === 'eraser' && !isDrawing && isMouseOnCanvas && mouseCanvasPosition && ctx) {
          ctx.save();
          ctx.globalCompositeOperation = 'source-over'; 
          ctx.strokeStyle = 'rgba(100, 100, 100, 0.7)';
          ctx.lineWidth = 1 / (window.devicePixelRatio || 1); // Logical pixel width for preview border
          const previewSize = strokeWidth; 
          ctx.strokeRect(mouseCanvasPosition.x - previewSize / 2, mouseCanvasPosition.y - previewSize / 2, previewSize, previewSize);
          ctx.restore();
      }
    }, [drawingHistory, historyIndex, currentEditingTextId, draggingTextId, currentDragPosition, tool, isDrawing, isMouseOnCanvas, mouseCanvasPosition, strokeWidth]);


    const initializeCanvas = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas || !containerRef.current) return;
      const context = canvas.getContext('2d', { willReadFrequently: true }); 
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
      context.textBaseline = 'alphabetic'; 
      contextRef.current = context;
      redrawCanvas();
    }, [redrawCanvas]);

    useEffect(() => {
      initializeCanvas();
      const resizeTarget = containerRef.current; 
      if (!resizeTarget) return;
      const obs = new ResizeObserver(initializeCanvas);
      obs.observe(resizeTarget);
      return () => obs.unobserve(resizeTarget);
    }, [initializeCanvas]);

    // Redraw whenever drawingHistory or historyIndex changes from parent
    useEffect(() => {
        requestAnimationFrame(redrawCanvas);
    }, [drawingHistory, historyIndex, redrawCanvas]);


    useEffect(() => {
        if (tool === 'eraser' && !isDrawing) { 
            requestAnimationFrame(redrawCanvas);
        }
    }, [mouseCanvasPosition, isMouseOnCanvas, tool, isDrawing, redrawCanvas]);

    const getTextElementAtPointInternal = useCallback((point: Point): TextElementData | null => {
        const ctx = contextRef.current;
        if (!ctx) return null;

        const latestTextElements = new Map<string, TextElementData>();
        for (let i = 0; i <= historyIndex; i++) { 
            const action = drawingHistory[i];
            if (action.type === 'text' && (action.visible !== false)) {
                ctx.font = `${action.data.isBold ? 'bold ' : ''}${action.data.isItalic ? 'italic ' : ''}${action.data.fontSize}px ${action.data.fontFamily}`;
                const metrics = ctx.measureText(action.data.text);
                latestTextElements.set(action.id, { ...action.data, measuredWidth: metrics.width, measuredHeight: action.data.fontSize });
            }
        }
        
        for (const textData of Array.from(latestTextElements.values()).reverse()) {
            let x1 = textData.x;
            if (textData.textAlign === 'left') x1 = textData.x;
            else if (textData.textAlign === 'center') x1 = textData.x - textData.measuredWidth / 2;
            else x1 = textData.x - textData.measuredWidth; 
            
            const y1 = textData.y - textData.measuredHeight; 
            const x2 = x1 + textData.measuredWidth;
            const y2 = textData.y; 

            if (point.x >= x1 && point.x <= x2 && point.y >= y1 && point.y <= y2) {
                return textData;
            }
        }
        return null;
    }, [drawingHistory, historyIndex]);


    const startDrawingInternal = useCallback((event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      if (tool === 'image') return; 
      if (event.nativeEvent instanceof TouchEvent) event.preventDefault(); 
      
      const nativeEvent = event.nativeEvent; 
      const coords = getCoordinates(nativeEvent); 
      if (!coords || !contextRef.current) return;

      if (tool === 'text') {
        const clickedText = getTextElementAtPointInternal(coords);
        if (clickedText) {
            setDraggingTextId(clickedText.id);
            const offsetX = coords.x - clickedText.x;
            const offsetY = coords.y - clickedText.y;
            setDragStartOffset({ x: offsetX, y: offsetY });
            setCurrentDragPosition({x: clickedText.x, y: clickedText.y}); 
             if(onTextSelect) onTextSelect(clickedText.id); 
        } else {
             setDraggingTextId(null); 
        }
        return; 
      }

      setIsDrawing(true);
      setStartPoint(coords);
      currentPathRef.current = [coords]; 

      if (tool === 'eraser') {
          const eraserSize = strokeWidth; 
          contextRef.current.clearRect(coords.x - eraserSize / 2, coords.y - eraserSize / 2, eraserSize, eraserSize);
      } else if (tool !== 'freehand') { 
        const dpr = window.devicePixelRatio || 1;
        setCanvasSnapshotForPreview(contextRef.current.getImageData(0, 0, contextRef.current.canvas.width / dpr, contextRef.current.canvas.height / dpr));
      }
    }, [getCoordinates, tool, getTextElementAtPointInternal, onTextSelect, strokeWidth]);

    const drawInternal = useCallback((event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      if (tool === 'image') return; 
      
      const ctx = contextRef.current;
      if (!ctx || (!startPoint && !draggingTextId)) return; 
      if (event.nativeEvent instanceof TouchEvent) event.preventDefault();
      
      const currentCoords = getCoordinates(event.nativeEvent); 
      if (!currentCoords) return;

      if (draggingTextId && dragStartOffset) { 
        const newX = currentCoords.x - dragStartOffset.x;
        const newY = currentCoords.y - dragStartOffset.y;
        setCurrentDragPosition({x: newX, y: newY});
        requestAnimationFrame(redrawCanvas); 
        return;
      }
      
      if (!isDrawing || tool === 'text' || !startPoint) return; 

      if (tool === 'eraser') {
          currentPathRef.current.push(currentCoords);
          const eraserSize = strokeWidth; 
          ctx.clearRect(currentCoords.x - eraserSize / 2, currentCoords.y - eraserSize / 2, eraserSize, eraserSize);
          return; 
      }
      
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth; 
      ctx.fillStyle = fillColor;
      ctx.globalCompositeOperation = 'source-over'; 

      if (tool === 'freehand') {
        currentPathRef.current.push(currentCoords);
        ctx.beginPath();
        if (currentPathRef.current.length > 1) {
             ctx.moveTo(currentPathRef.current[currentPathRef.current.length-2].x, currentPathRef.current[currentPathRef.current.length-2].y);
        } else { 
            ctx.moveTo(startPoint.x, startPoint.y);
        }
        ctx.lineTo(currentCoords.x, currentCoords.y);
        ctx.stroke();
      } else { 
        if (canvasSnapshotForPreview) ctx.putImageData(canvasSnapshotForPreview, 0, 0); 
        else redrawCanvas(); 
        
        const tempActionBase = { id: '', type: tool as Exclude<DrawingTool, 'text' | 'eraser' | 'freehand' | 'image'>, strokeColor, strokeWidth };
        let tempAction: ShapeAction | LineAction;
        if (tool === 'line') {
            tempAction = { ...tempActionBase, type: 'line', startPoint, endPoint: currentCoords } as LineAction;
        } else { // rectangle, circle, triangle
            tempAction = { ...tempActionBase, type: tool as 'rectangle' | 'circle' | 'triangle', fillColor, isFilled: isFillEnabled, startPoint, endPoint: currentCoords } as ShapeAction;
        }
        drawSpecificShapeAction(ctx, tempAction);
      }
    }, [isDrawing, startPoint, getCoordinates, tool, strokeColor, strokeWidth, fillColor, isFillEnabled, canvasSnapshotForPreview, redrawCanvas, draggingTextId, dragStartOffset]);
    

    const handleMouseUpTouchEnd = useCallback((event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        if (tool === 'image') return; 

        if (draggingTextId && currentDragPosition && onTextDragEnd) {
            let originalTextElement: TextElementData | null = null;
            // Find from parent's history
            for (let i = historyIndex; i >= 0; i--) {
                const action = drawingHistory[i];
                if (action.type === 'text' && action.id === draggingTextId) {
                    originalTextElement = action.data;
                    break;
                }
            }
            if (originalTextElement) {
                 onTextDragEnd(draggingTextId, currentDragPosition.x, currentDragPosition.y, originalTextElement);
            }
            setDraggingTextId(null); setDragStartOffset(null); setCurrentDragPosition(null);
            requestAnimationFrame(redrawCanvas); 
            return;
        }

        if (!isDrawing || !contextRef.current || !startPoint || tool === 'text') {
            if(isDrawing) setIsDrawing(false); 
            return;
        }

        const nativeEvent = event.nativeEvent; 
        const finalCoords = getCoordinates(nativeEvent); 
        let newActionData: Omit<DrawingAction, 'id' | 'visible'> | null = null;
        
        const pathForAction = [...currentPathRef.current]; 
        const effectiveEndPoint = finalCoords || (pathForAction.length > 0 ? pathForAction[pathForAction.length -1] : startPoint);

        if (tool === 'freehand') {
            if (pathForAction.length > 0) { 
                 newActionData = { type: 'freehand', points: pathForAction, strokeColor, strokeWidth };
            }
        } else if (tool === 'eraser') {
            if (pathForAction.length > 0) { 
                newActionData = { type: 'eraser', points: pathForAction, size: strokeWidth };
            }
        } else if (tool === 'line') {
             newActionData = { type: 'line', startPoint, endPoint: effectiveEndPoint, strokeColor, strokeWidth };
        } else if (tool === 'rectangle' || tool === 'circle' || tool === 'triangle') { 
             newActionData = { type: tool as 'rectangle' | 'circle' | 'triangle', startPoint, endPoint: effectiveEndPoint, strokeColor, strokeWidth, fillColor, isFilled: isFillEnabled };
        }

        if (newActionData) {
           onCommitAction(newActionData); // Send to parent
        }
        
        setIsDrawing(false); setStartPoint(null); currentPathRef.current = []; setCanvasSnapshotForPreview(null);
        // Parent will update props which will trigger redrawCanvas effect
    }, [isDrawing, startPoint, tool, strokeColor, strokeWidth, fillColor, isFillEnabled, redrawCanvas, getCoordinates, draggingTextId, currentDragPosition, onTextDragEnd, onCommitAction, drawingHistory, historyIndex]);

    useImperativeHandle(ref, () => ({
      getCanvasElement: () => canvasRef.current,
      downloadDrawing: (filename: string) => {
        if (canvasRef.current && contextRef.current) {
            const canvas = canvasRef.current;
            const tempCanvas = document.createElement('canvas');
            // Use physical dimensions for temp canvas
            const dpr = window.devicePixelRatio || 1;
            tempCanvas.width = canvas.width; // Already DPR scaled
            tempCanvas.height = canvas.height; // Already DPR scaled

            const tempCtx = tempCanvas.getContext('2d');
            if (tempCtx) {
                tempCtx.fillStyle = '#FFFFFF'; 
                tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
                // No need to scale tempCtx, drawImage from scaled canvas to scaled canvas
                tempCtx.drawImage(canvas, 0, 0);
                
                const dataURL = tempCanvas.toDataURL('image/png');
                const link = document.createElement('a');
                link.href = dataURL; link.download = filename;
                document.body.appendChild(link); link.click(); document.body.removeChild(link);
            }
        }
      },
      getTextElementIdAtPoint: async (point: Point): Promise<string | null> => getTextElementAtPointInternal(point)?.id || null,
      getTextElementById: async (id: string): Promise<TextElementData | null> => {
        const ctx = contextRef.current;
        if (!ctx) return null; // Or some default if context not ready
        for (let i = historyIndex; i >= 0; i--) {
            const action = drawingHistory[i];
            if (action.type === 'text' && action.id === id && (action.visible !== false)) {
                ctx.font = `${action.data.isBold ? 'bold ' : ''}${action.data.isItalic ? 'italic ' : ''}${action.data.fontSize}px ${action.data.fontFamily}`;
                const metrics = ctx.measureText(action.data.text);
                return { ...action.data, measuredWidth: metrics.width, measuredHeight: action.data.fontSize };
            }
        }
        return null;
      },
    }));

    const handleContainerMouseMove = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) { setMouseCanvasPosition(null); return; }
        const rect = canvas.getBoundingClientRect();
        const clientX = event.clientX;
        const clientY = event.clientY;

        if (clientX >= rect.left && clientX <= rect.right &&
            clientY >= rect.top && clientY <= rect.bottom) {
            setMouseCanvasPosition({ x: clientX - rect.left, y: clientY - rect.top });
        } else {
            setMouseCanvasPosition(null); 
        }
    }, []);

    const handleContainerMouseEnter = useCallback(() => {
        setIsMouseOnCanvas(true); 
    }, []);
    
    const handleContainerMouseLeave = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
        setIsMouseOnCanvas(false);
        setMouseCanvasPosition(null); 
        
        if (isDrawing && startPoint && tool !== 'text' && tool !== 'eraser' && tool !== 'freehand' && tool !== 'image') {
             if (canvasRef.current && event.target === canvasRef.current) { 
                 handleMouseUpTouchEnd(event as unknown as React.MouseEvent<HTMLCanvasElement>);
             }
        }
    }, [isDrawing, startPoint, tool, handleMouseUpTouchEnd]);


    return (
      <div
        ref={containerRef}
        className="w-full h-full touch-none" 
        onMouseMove={handleContainerMouseMove} 
        onMouseEnter={handleContainerMouseEnter} 
        onMouseLeave={handleContainerMouseLeave} 
      >
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawingInternal}
          onMouseMove={drawInternal}
  	      onMouseUp={handleMouseUpTouchEnd}
          onTouchStart={startDrawingInternal}
          onTouchMove={drawInternal}
  	      onTouchEnd={handleMouseUpTouchEnd}
          className="w-full h-full cursor-crosshair"
          data-ai-hint="drawing abstract background"
        />
      </div>
    );
  }
);

CanvasRenderer.displayName = 'CanvasRenderer';
export default CanvasRenderer;
