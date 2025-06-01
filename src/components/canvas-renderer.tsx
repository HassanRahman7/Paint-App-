
"use client";

import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef, useCallback } from 'react';

export type DrawingTool = 'freehand' | 'line' | 'rectangle' | 'circle' | 'triangle' | 'text';

interface Point {
  x: number;
  y: number;
}

export interface TextElementData {
  id: string;
  text: string;
  x: number; y: number; // Anchor point (top-left for 'left' align, top-center for 'center', etc.)
  fontFamily: string;
  fontSize: number;
  textColor: string;
  textAlign: 'left' | 'center' | 'right';
  isBold: boolean;
  isItalic: boolean;
  isUnderline: boolean;
  measuredWidth: number; // Calculated width
  measuredHeight: number; // Calculated height (based on fontSize)
}


interface ShapeAction {
  type: Exclude<DrawingTool, 'text'>;
  strokeColor: string;
  strokeWidth: number;
  points?: Point[]; 
  startPoint?: Point; 
  endPoint?: Point; 
  fillColor?: string; 
  isFilled?: boolean; 
}

interface TextAction {
    type: 'text';
    id: string; // Unique ID for the text element this action pertains to
    data: TextElementData; // The full state of the text element for this action
    // isDeleted?: boolean; // Could be used for soft deletes if needed
}

type DrawingAction = ShapeAction | TextAction;


export interface CanvasRendererHandle {
  clearCanvas: () => void;
  downloadDrawing: (filename: string) => void;
  undo: () => void;
  redo: () => void;
  getCanvasElement: () => HTMLCanvasElement | null;
  // Text specific methods
  addTextElement: (data: TextElementData) => void;
  updateTextElement: (id: string, newData: TextElementData) => void;
  getTextElementIdAtPoint: (point: Point) => Promise<string | null>;
  getTextElementById: (id: string) => Promise<TextElementData | null>;
}

interface CanvasRendererProps {
  tool: DrawingTool;
  strokeColor: string;
  strokeWidth: number;
  fillColor: string;
  isFillEnabled: boolean;
  currentEditingTextId?: string | null; // To highlight selected text
  onTextDragEnd?: (id: string, x: number, y: number, textElement: TextElementData | null) => void;
  onTextSelect?: (id: string) => void; // For page.tsx to know a text item was selected
}


const CanvasRenderer = forwardRef<CanvasRendererHandle, CanvasRendererProps>(
  ({ tool, strokeColor, strokeWidth, fillColor, isFillEnabled, currentEditingTextId, onTextDragEnd, onTextSelect }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const contextRef = useRef<CanvasRenderingContext2D | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const [isDrawing, setIsDrawing] = useState(false); // For shapes
    const [startPoint, setStartPoint] = useState<Point | null>(null); // For shapes
    const [currentPath, setCurrentPath] = useState<Point[]>([]); // For freehand
    
    const [drawingHistory, setDrawingHistory] = useState<DrawingAction[]>([]);
    const [historyIndex, setHistoryIndex] = useState<number>(-1);
    const [canvasSnapshotForPreview, setCanvasSnapshotForPreview] = useState<ImageData | null>(null);

    // Text dragging state
    const [draggingTextId, setDraggingTextId] = useState<string | null>(null);
    const [dragStartOffset, setDragStartOffset] = useState<Point | null>(null); // Offset from text origin to mouse down
    const [currentDragPosition, setCurrentDragPosition] = useState<Point | null>(null);


    const getCoordinates = useCallback((event: MouseEvent | TouchEvent): Point | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      let clientX, clientY;

      if (event instanceof MouseEvent) {
        clientX = event.clientX; clientY = event.clientY;
      } else if (event.touches && event.touches.length > 0) {
        clientX = event.touches[0].clientX; clientY = event.touches[0].clientY;
      } else if (event.changedTouches && event.changedTouches.length > 0) {
        clientX = event.changedTouches[0].clientX; clientY = event.changedTouches[0].clientY;
      } else { return null; }
      
      if (clientX === undefined || clientY === undefined) return null;
      const dpr = window.devicePixelRatio || 1;
      return { x: (clientX - rect.left) * dpr, y: (clientY - rect.top) * dpr };
    }, []);

    const drawTextElement = (ctx: CanvasRenderingContext2D, data: TextElementData, isSelected?: boolean) => {
        ctx.font = `${data.isBold ? 'bold ' : ''}${data.isItalic ? 'italic ' : ''}${data.fontSize}px ${data.fontFamily}`;
        ctx.fillStyle = data.textColor;
        ctx.textAlign = data.textAlign;
        
        let textX = data.x;
        // Adjust for textAlign. fillText x coord is the anchor point.
        if (data.textAlign === 'center') {
            textX = data.x; // Anchor is center
        } else if (data.textAlign === 'right') {
            textX = data.x; // Anchor is right
        }
        // For 'left', data.x is already the left starting point.

        ctx.fillText(data.text, textX, data.y);

        if (data.isUnderline) {
            const metrics = ctx.measureText(data.text);
            let underlineStartX = data.x;
            if (data.textAlign === 'left') {
                underlineStartX = data.x;
            } else if (data.textAlign === 'center') {
                underlineStartX = data.x - metrics.width / 2;
            } else if (data.textAlign === 'right') {
                underlineStartX = data.x - metrics.width;
            }
            // Approximate baseline offset, can be improved
            const baselineOffset = data.fontSize * 0.1; 
            ctx.fillRect(underlineStartX, data.y + baselineOffset + 2, metrics.width, Math.max(1, data.fontSize / 15));
        }
        
        if (isSelected) {
            ctx.strokeStyle = 'rgba(0, 123, 255, 0.7)';
            ctx.lineWidth = 1 * (window.devicePixelRatio || 1);
            ctx.setLineDash([4, 2]);
            const padding = 5 * (window.devicePixelRatio || 1);
            let boxX = data.x;
            if (data.textAlign === 'left') boxX = data.x - padding;
            else if (data.textAlign === 'center') boxX = data.x - data.measuredWidth / 2 - padding;
            else boxX = data.x - data.measuredWidth - padding;

            ctx.strokeRect(
                boxX, 
                data.y - data.measuredHeight - padding, // y is baseline, so go up by height
                data.measuredWidth + padding * 2, 
                data.measuredHeight + padding * 2
            );
            ctx.setLineDash([]);
        }
    };

    const redrawCanvas = useCallback(() => {
      const ctx = contextRef.current;
      const canvas = canvasRef.current;
      if (!ctx || !canvas) return;
      const dpr = window.devicePixelRatio || 1;
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr); // Use scaled width/height

      const activeShapes: ShapeAction[] = [];
      const latestTextElements = new Map<string, TextElementData>();

      for (let i = 0; i <= historyIndex; i++) {
        const action = drawingHistory[i];
        if (action.type === 'text') {
            // Recalculate measuredWidth/Height here before storing
            // This ensures it's always up-to-date with current font settings in the action's data
            ctx.font = `${action.data.isBold ? 'bold ' : ''}${action.data.isItalic ? 'italic ' : ''}${action.data.fontSize}px ${action.data.fontFamily}`;
            const metrics = ctx.measureText(action.data.text);
            const updatedData = {
                ...action.data,
                measuredWidth: metrics.width,
                measuredHeight: action.data.fontSize, // Approximation
            };
            latestTextElements.set(action.id, updatedData);
        } else {
            // For shapes, we just draw them sequentially.
            // This part might need adjustment if shapes could be "updated" or "deleted"
            // similar to text, but current logic redraws all shapes up to historyIndex.
             drawAction(ctx, action); // Draw shape directly
        }
      }
      
      // Draw all text elements from their latest states
      latestTextElements.forEach((textData, id) => {
          if (draggingTextId === id && currentDragPosition) {
              // Draw preview of text being dragged
              drawTextElement(ctx, { ...textData, x: currentDragPosition.x, y: currentDragPosition.y }, currentEditingTextId === id);
          } else {
              drawTextElement(ctx, textData, currentEditingTextId === id);
          }
      });

    }, [drawingHistory, historyIndex, currentEditingTextId, draggingTextId, currentDragPosition]);
    
    const drawAction = (ctx: CanvasRenderingContext2D, action: ShapeAction) => { // Only for shapes now
      ctx.strokeStyle = action.strokeColor;
      ctx.lineWidth = action.strokeWidth;
      ctx.fillStyle = action.fillColor || '#000000';

      switch (action.type) {
        case 'freehand':
          if (action.points && action.points.length > 1) {
            ctx.beginPath(); ctx.moveTo(action.points[0].x, action.points[0].y);
            for (let j = 1; j < action.points.length; j++) ctx.lineTo(action.points[j].x, action.points[j].y);
            ctx.stroke();
          }
          break;
        case 'line':
          if (action.startPoint && action.endPoint) {
            ctx.beginPath(); ctx.moveTo(action.startPoint.x, action.startPoint.y);
            ctx.lineTo(action.endPoint.x, action.endPoint.y); ctx.stroke();
          }
          break;
        case 'rectangle':
          if (action.startPoint && action.endPoint) {
            const rectX = Math.min(action.startPoint.x, action.endPoint.x);
            const rectY = Math.min(action.startPoint.y, action.endPoint.y);
            const rectWidth = Math.abs(action.startPoint.x - action.endPoint.x);
            const rectHeight = Math.abs(action.startPoint.y - action.endPoint.y);
            ctx.beginPath(); ctx.rect(rectX, rectY, rectWidth, rectHeight);
            if (action.isFilled) ctx.fill();
            ctx.stroke();
          }
          break;
        case 'circle':
          if (action.startPoint && action.endPoint) {
            const radius = Math.sqrt(Math.pow(action.endPoint.x - action.startPoint.x, 2) + Math.pow(action.endPoint.y - action.startPoint.y, 2));
            ctx.beginPath(); ctx.arc(action.startPoint.x, action.startPoint.y, radius, 0, 2 * Math.PI);
            if (action.isFilled) ctx.fill();
            ctx.stroke();
          }
          break;
        case 'triangle':
           if (action.startPoint && action.endPoint) {
            ctx.beginPath(); ctx.moveTo(action.startPoint.x, action.startPoint.y); 
            ctx.lineTo(action.endPoint.x, action.endPoint.y); 
            ctx.lineTo(action.startPoint.x - (action.endPoint.x - action.startPoint.x), action.endPoint.y); 
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

      context.scale(dpr, dpr); // Scale once
      context.lineCap = 'round';
      context.lineJoin = 'round';
      // Set base text properties, though they will be overridden per element
      context.textBaseline = 'alphabetic'; // Or 'top' if x,y is top-left. For fillText, y is baseline.
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

    const getTextElementAtPointInternal = useCallback((point: Point): TextElementData | null => {
        const ctx = contextRef.current;
        if (!ctx) return null;

        // Iterate history backwards to find the latest state of text elements
        const latestTextElements = new Map<string, TextElementData>();
        for (let i = historyIndex; i >= 0; i--) {
            const action = drawingHistory[i];
            if (action.type === 'text' && !latestTextElements.has(action.id)) {
                 // Recalculate width/height for hit testing, similar to redrawCanvas
                ctx.font = `${action.data.isBold ? 'bold ' : ''}${action.data.isItalic ? 'italic ' : ''}${action.data.fontSize}px ${action.data.fontFamily}`;
                const metrics = ctx.measureText(action.data.text);
                latestTextElements.set(action.id, {
                    ...action.data,
                    measuredWidth: metrics.width,
                    measuredHeight: action.data.fontSize, // Approximation
                });
            }
        }
        
        for (const textData of Array.from(latestTextElements.values()).reverse()) { // Check topmost first
            let x1 = textData.x;
            if (textData.textAlign === 'left') x1 = textData.x;
            else if (textData.textAlign === 'center') x1 = textData.x - textData.measuredWidth / 2;
            else x1 = textData.x - textData.measuredWidth;
            
            const y1 = textData.y - textData.measuredHeight; // y is baseline, so box starts above
            const x2 = x1 + textData.measuredWidth;
            const y2 = textData.y; // Baseline

            if (point.x >= x1 && point.x <= x2 && point.y >= y1 && point.y <= y2) {
                return textData;
            }
        }
        return null;
    }, [drawingHistory, historyIndex]);


    const startDrawingInternal = useCallback((event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
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
            setCurrentDragPosition({x: clickedText.x, y: clickedText.y}); // Initialize currentDragPosition
             if(onTextSelect) onTextSelect(clickedText.id);
        } else {
            // Click on empty canvas in text mode - page.tsx handles this via its own click handler
             setDraggingTextId(null); // Ensure no drag starts
        }
        return; // Text tool interaction handled differently
      }

      // Shape drawing logic
      setIsDrawing(true);
      setStartPoint(coords);
      if (tool === 'freehand') {
        setCurrentPath([coords]);
      } else {
        const dpr = window.devicePixelRatio || 1;
        setCanvasSnapshotForPreview(contextRef.current.getImageData(0, 0, contextRef.current.canvas.width / dpr, contextRef.current.canvas.height / dpr));
      }
    }, [getCoordinates, tool, getTextElementAtPointInternal, onTextSelect]);

    const drawInternal = useCallback((event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      const ctx = contextRef.current;
      if (!ctx || !startPoint && !draggingTextId) return;
      if (event.nativeEvent instanceof TouchEvent) event.preventDefault();
      const currentCoords = getCoordinates(event.nativeEvent);
      if (!currentCoords) return;

      if (draggingTextId && dragStartOffset) {
        const newX = currentCoords.x - dragStartOffset.x;
        const newY = currentCoords.y - dragStartOffset.y;
        setCurrentDragPosition({x: newX, y: newY});
        requestAnimationFrame(redrawCanvas); // Redraw for live drag preview
        return;
      }
      
      if (!isDrawing || tool === 'text' || !startPoint) return; // Only for shapes now

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth;
      ctx.fillStyle = fillColor;
      
      if (tool === 'freehand') {
        setCurrentPath(prevPath => [...prevPath, currentCoords]);
        ctx.beginPath();
        ctx.moveTo(currentPath[currentPath.length-1].x, currentPath[currentPath.length-1].y);
        ctx.lineTo(currentCoords.x, currentCoords.y);
        ctx.stroke();
      } else { // Shape preview
        if (canvasSnapshotForPreview) ctx.putImageData(canvasSnapshotForPreview, 0, 0);
        else redrawCanvas(); // Fallback
        
        const tempAction: ShapeAction = { type: tool as Exclude<DrawingTool, 'text'>, strokeColor, strokeWidth, fillColor, isFilled: isFillEnabled, startPoint, endPoint: currentCoords };
        drawAction(ctx, tempAction);
      }
    }, [isDrawing, startPoint, getCoordinates, tool, strokeColor, strokeWidth, fillColor, isFillEnabled, currentPath, canvasSnapshotForPreview, redrawCanvas, draggingTextId, dragStartOffset]);

    const handleMouseUpTouchEnd = useCallback((event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        if (draggingTextId && currentDragPosition && onTextDragEnd) {
            const textElement = drawingHistory.slice(0, historyIndex + 1).reverse()
                .find(act => act.type === 'text' && act.id === draggingTextId) as TextAction | undefined;
            
            if (textElement) {
                 onTextDragEnd(draggingTextId, currentDragPosition.x, currentDragPosition.y, textElement.data);
            }
            setDraggingTextId(null);
            setDragStartOffset(null);
            setCurrentDragPosition(null);
            requestAnimationFrame(redrawCanvas); // Final redraw after drag
            return;
        }

        if (!isDrawing || !contextRef.current || !startPoint || tool === 'text') {
            if(isDrawing) setIsDrawing(false);
            return;
        }

        const nativeEvent = event.nativeEvent;
        const finalCoords = getCoordinates(nativeEvent);

        let newAction: ShapeAction | null = null;
        const currentTool = tool as Exclude<DrawingTool, 'text'>;

        if (tool === 'freehand') {
            if (currentPath.length > 0) {
                 newAction = { type: currentTool, points: [...currentPath, ...(finalCoords && currentPath[currentPath.length-1].x !== finalCoords.x && currentPath[currentPath.length-1].y !== finalCoords.y ? [finalCoords] : [])], strokeColor, strokeWidth };
            }
        } else if (finalCoords) {
            newAction = { type: currentTool, startPoint, endPoint: finalCoords, strokeColor, strokeWidth, fillColor: (tool !== 'line') ? fillColor : undefined, isFilled: (tool !== 'line') ? isFillEnabled : undefined };
        } else if (currentPath.length > 0 && tool !== 'freehand') { // Fallback
             newAction = { type: currentTool, startPoint, endPoint: currentPath[currentPath.length -1] || startPoint, strokeColor, strokeWidth, fillColor: (tool !== 'line') ? fillColor : undefined, isFilled: (tool !== 'line') ? isFillEnabled : undefined};
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
        if (newAction) requestAnimationFrame(redrawCanvas);
    }, [isDrawing, startPoint, tool, currentPath, strokeColor, strokeWidth, fillColor, isFillEnabled, drawingHistory, historyIndex, redrawCanvas, getCoordinates, draggingTextId, currentDragPosition, onTextDragEnd]);

    useImperativeHandle(ref, () => ({
      clearCanvas: () => {
        if (contextRef.current && canvasRef.current) {
          const dpr = window.devicePixelRatio || 1;
          contextRef.current.clearRect(0, 0, canvasRef.current.width / dpr, canvasRef.current.height / dpr);
          setDrawingHistory([]);
          setHistoryIndex(-1);
        }
      },
      downloadDrawing: (filename: string) => {
        if (canvasRef.current && contextRef.current) {
            const canvas = canvasRef.current;
            const tempCanvas = document.createElement('canvas');
            const dpr = window.devicePixelRatio || 1;
            // Use original scaled dimensions for tempCanvas
            tempCanvas.width = canvas.width; 
            tempCanvas.height = canvas.height;
            const tempCtx = tempCanvas.getContext('2d');
            if (tempCtx) {
                tempCtx.fillStyle = '#FFFFFF';
                tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
                // Draw the current canvas content onto the temp canvas
                // No need to scale again as canvas already contains scaled drawing
                tempCtx.drawImage(canvas, 0, 0);

                const dataURL = tempCanvas.toDataURL('image/png');
                const link = document.createElement('a');
                link.href = dataURL; link.download = filename;
                document.body.appendChild(link); link.click(); document.body.removeChild(link);
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
      getCanvasElement: () => canvasRef.current,
      addTextElement: (data: TextElementData) => {
        const newHistory = drawingHistory.slice(0, historyIndex + 1);
        // Recalculate width/height with current context before adding to history
        const ctx = contextRef.current;
        let finalData = data;
        if(ctx){
            ctx.font = `${data.isBold ? 'bold ' : ''}${data.isItalic ? 'italic ' : ''}${data.fontSize}px ${data.fontFamily}`;
            const metrics = ctx.measureText(data.text);
            finalData = {
                ...data,
                measuredWidth: metrics.width,
                measuredHeight: data.fontSize, // Approximation
            };
        }
        setDrawingHistory([...newHistory, { type: 'text', id: finalData.id, data: finalData }]);
        setHistoryIndex(newHistory.length);
        requestAnimationFrame(redrawCanvas);
      },
      updateTextElement: (id: string, newData: TextElementData) => {
        const newHistory = drawingHistory.slice(0, historyIndex + 1);
         const ctx = contextRef.current;
        let finalData = newData;
        if(ctx){
            ctx.font = `${newData.isBold ? 'bold ' : ''}${newData.isItalic ? 'italic ' : ''}${newData.fontSize}px ${newData.fontFamily}`;
            const metrics = ctx.measureText(newData.text);
            finalData = {
                ...newData,
                measuredWidth: metrics.width,
                measuredHeight: newData.fontSize, // Approximation
            };
        }
        setDrawingHistory([...newHistory, { type: 'text', id: id, data: finalData }]);
        setHistoryIndex(newHistory.length);
        requestAnimationFrame(redrawCanvas);
      },
      getTextElementIdAtPoint: async (point: Point): Promise<string | null> => {
        return getTextElementAtPointInternal(point)?.id || null;
      },
      getTextElementById: async (id: string): Promise<TextElementData | null> => {
        // Find the latest state of the text element with this ID from history
        for (let i = historyIndex; i >= 0; i--) {
            const action = drawingHistory[i];
            if (action.type === 'text' && action.id === id) {
                // Ensure measuredWidth/Height are up-to-date if returning
                const ctx = contextRef.current;
                if(ctx) {
                    ctx.font = `${action.data.isBold ? 'bold ' : ''}${action.data.isItalic ? 'italic ' : ''}${action.data.fontSize}px ${action.data.fontFamily}`;
                    const metrics = ctx.measureText(action.data.text);
                    return {
                        ...action.data,
                        measuredWidth: metrics.width,
                        measuredHeight: action.data.fontSize,
                    };
                }
                return action.data;
            }
        }
        return null;
      },
    }));

    return (
      <div ref={containerRef} className="w-full h-full touch-none">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawingInternal}
          onMouseMove={drawInternal}
          onMouseUp={handleMouseUpTouchEnd}
          onMouseLeave={isDrawing || draggingTextId ? handleMouseUpTouchEnd : undefined}
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
