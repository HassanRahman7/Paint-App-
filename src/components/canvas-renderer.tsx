
"use client";

import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef, useCallback } from 'react';

export type DrawingTool = 'freehand' | 'line' | 'rectangle' | 'circle' | 'triangle' | 'text' | 'eraser' | 'image';

interface Point {
  x: number;
  y: number;
}

export interface TextElementData {
  id: string;
  text: string;
  x: number; y: number;
  fontFamily: string;
  fontSize: number;
  textColor: string;
  textAlign: 'left' | 'center' | 'right';
  isBold: boolean;
  isItalic: boolean;
  isUnderline: boolean;
  measuredWidth: number;
  measuredHeight: number;
}

export interface ImageActionData {
  id: string;
  src: string; // Data URL
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ShapeAction {
  type: Exclude<DrawingTool, 'text' | 'eraser' | 'image'>;
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
    id: string;
    data: TextElementData;
}

interface EraserAction {
    type: 'eraser';
    size: number;
    points: Point[];
}

interface ImageDrawingAction {
  type: 'image';
  id: string;
  data: ImageActionData;
}

type DrawingAction = ShapeAction | TextAction | EraserAction | ImageDrawingAction;


export interface CanvasRendererHandle {
  clearCanvas: () => void;
  downloadDrawing: (filename: string) => void;
  undo: () => void;
  redo: () => void;
  getCanvasElement: () => HTMLCanvasElement | null;
  addTextElement: (data: TextElementData) => void;
  updateTextElement: (id: string, newData: TextElementData) => void;
  getTextElementIdAtPoint: (point: Point) => Promise<string | null>;
  getTextElementById: (id: string) => Promise<TextElementData | null>;
  addImageElement: (data: ImageActionData) => void;
}

interface CanvasRendererProps {
  tool: DrawingTool;
  strokeColor: string;
  strokeWidth: number;
  fillColor: string;
  isFillEnabled: boolean;
  currentEditingTextId?: string | null;
  onTextDragEnd?: (id: string, x: number, y: number, textElement: TextElementData | null) => void;
  onTextSelect?: (id: string) => void;
  // previewImage prop removed as HTML overlay handles preview
}


const CanvasRenderer = forwardRef<CanvasRendererHandle, CanvasRendererProps>(
  ({ tool, strokeColor, strokeWidth, fillColor, isFillEnabled, currentEditingTextId, onTextDragEnd, onTextSelect }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const contextRef = useRef<CanvasRenderingContext2D | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const [isDrawing, setIsDrawing] = useState(false);
    const [startPoint, setStartPoint] = useState<Point | null>(null);
    const currentPathRef = useRef<Point[]>([]); // Use ref for currentPath to avoid stale closures in event handlers
    
    const [drawingHistory, setDrawingHistory] = useState<DrawingAction[]>([]);
    const [historyIndex, setHistoryIndex] = useState<number>(-1);
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

      if ('clientX' in event && 'clientY' in event) { // MouseEvent or React.MouseEvent
        clientX = event.clientX; clientY = event.clientY;
      } else if ('touches' in event && event.touches && event.touches.length > 0) { // TouchEvent (touchstart, touchmove)
        clientX = event.touches[0].clientX; clientY = event.touches[0].clientY;
      } else if ('changedTouches' in event && event.changedTouches && event.changedTouches.length > 0) { // TouchEvent (touchend)
        clientX = event.changedTouches[0].clientX; clientY = event.changedTouches[0].clientY;
      } else { return null; }
      
      if (clientX === undefined || clientY === undefined) return null;
      // Return logical coordinates (CSS pixels relative to canvas)
      return { x: clientX - rect.left, y: clientY - rect.top };
    }, []);

    const drawTextElement = (ctx: CanvasRenderingContext2D, data: TextElementData, isSelected?: boolean) => {
        ctx.font = `${data.isBold ? 'bold ' : ''}${data.isItalic ? 'italic ' : ''}${data.fontSize}px ${data.fontFamily}`;
        ctx.fillStyle = data.textColor;
        ctx.textAlign = data.textAlign;
        
        let textX = data.x;
        // For textAlign center/right, the x in TextElementData is the reference point.
        // No adjustment needed here as ctx.textAlign handles it.
        
        ctx.fillText(data.text, textX, data.y);

        if (data.isUnderline) {
            const metrics = ctx.measureText(data.text);
            let underlineStartX = data.x;
            if (data.textAlign === 'left') underlineStartX = data.x;
            else if (data.textAlign === 'center') underlineStartX = data.x - metrics.width / 2;
            else underlineStartX = data.x - metrics.width;
            
            const baselineOffset = data.fontSize * 0.1; // Approximation for baseline
            ctx.fillRect(underlineStartX, data.y + baselineOffset + 2, metrics.width, Math.max(1, data.fontSize / 15));
        }
        
        if (isSelected) {
            ctx.strokeStyle = 'rgba(0, 123, 255, 0.7)';
            ctx.lineWidth = 1;
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
    
    const drawShapeAction = (ctx: CanvasRenderingContext2D, action: ShapeAction) => {
      ctx.strokeStyle = action.strokeColor;
      ctx.lineWidth = action.strokeWidth;
      ctx.fillStyle = action.fillColor || '#000000';
      ctx.globalCompositeOperation = 'source-over'; // Default drawing mode

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

    const redrawCanvas = useCallback(() => {
      const ctx = contextRef.current;
      const canvas = canvasRef.current;
      if (!ctx || !canvas) return;
      
      // Clear canvas based on logical dimensions
      ctx.clearRect(0, 0, canvas.width / (window.devicePixelRatio || 1), canvas.height / (window.devicePixelRatio || 1));

      const latestTextElements = new Map<string, TextElementData>();
      const imagesToProcessInThisRedraw: Array<{action: ImageDrawingAction, attemptLoad: boolean}> = [];

      for (let i = 0; i <= historyIndex; i++) {
        const action = drawingHistory[i];
        ctx.globalCompositeOperation = 'source-over'; // Reset for each action

        if (action.type === 'text') {
            // Update measuredWidth/Height for all text elements before drawing pass
            ctx.font = `${action.data.isBold ? 'bold ' : ''}${action.data.isItalic ? 'italic ' : ''}${action.data.fontSize}px ${action.data.fontFamily}`;
            const metrics = ctx.measureText(action.data.text);
            // Actual height is complex; fontSize is a common approximation for bounding box.
            const updatedData = { ...action.data, measuredWidth: metrics.width, measuredHeight: action.data.fontSize };
            latestTextElements.set(action.id, updatedData);
        } else if (action.type === 'eraser') {
            const { points, size } = action;
            // No need for globalCompositeOperation = 'destination-out' if clearRect is used correctly
            for (const point of points) {
                ctx.clearRect(point.x - size / 2, point.y - size / 2, size, size);
            }
        } else if (action.type === 'image') {
            imagesToProcessInThisRedraw.push({action: action, attemptLoad: true});
        }
         else { // Shape actions
            drawShapeAction(ctx, action as ShapeAction);
        }
      }
      
      // Draw all text elements (latest versions)
      latestTextElements.forEach((textData, id) => {
          if (draggingTextId === id && currentDragPosition) { // If being dragged, draw at drag position
              drawTextElement(ctx, { ...textData, x: currentDragPosition.x, y: currentDragPosition.y }, currentEditingTextId === id);
          } else {
              drawTextElement(ctx, textData, currentEditingTextId === id);
          }
      });

      // Draw all image elements
      imagesToProcessInThisRedraw.forEach(({action, attemptLoad}) => {
          let img = imageElementsCache.current.get(action.data.src);
          if (img && img.complete && img.naturalWidth > 0) {
              ctx.drawImage(img, action.data.x, action.data.y, action.data.width, action.data.height);
          } else if (attemptLoad && (!img || (!img.complete && !img.dataset.loading))) {
              // Image not cached or not loaded, start loading
              const newImg = new Image();
              newImg.dataset.loading = 'true'; // Mark as loading
              imageElementsCache.current.set(action.data.src, newImg);
              newImg.src = action.data.src;
              newImg.onload = () => {
                  delete newImg.dataset.loading; // Unmark
                  requestAnimationFrame(redrawCanvas); // Redraw once loaded
              };
              newImg.onerror = () => {
                  console.error("Error loading image for drawing:", action.data.src);
                  imageElementsCache.current.delete(action.data.src); // Remove from cache on error
                  delete newImg.dataset.loading;
              };
          }
          // If img exists but is not complete, onload will handle redraw
      });

      // Eraser Preview Cursor (if tool is eraser and not currently drawing)
      if (tool === 'eraser' && !isDrawing && isMouseOnCanvas && mouseCanvasPosition && ctx) {
          ctx.save();
          ctx.globalCompositeOperation = 'source-over'; // Ensure preview is drawn on top
          ctx.strokeStyle = 'rgba(100, 100, 100, 0.7)';
          ctx.lineWidth = 1; // Logical pixels for preview border
          const previewSize = strokeWidth; // strokeWidth is logical size for eraser
          ctx.strokeRect(mouseCanvasPosition.x - previewSize / 2, mouseCanvasPosition.y - previewSize / 2, previewSize, previewSize);
          ctx.restore();
      }
      // Removed props.previewImage logic, handled by HTML overlay now

    }, [drawingHistory, historyIndex, currentEditingTextId, draggingTextId, currentDragPosition, tool, isDrawing, isMouseOnCanvas, mouseCanvasPosition, strokeWidth]);


    const initializeCanvas = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas || !containerRef.current) return;
      const context = canvas.getContext('2d', { willReadFrequently: true }); // willReadFrequently for getImageData
      if (!context) return;

      const dpr = window.devicePixelRatio || 1;
      // Use container's clientWidth/Height for logical dimensions
      const rect = containerRef.current.getBoundingClientRect(); 
      
      // Set canvas physical size (scaled by DPR)
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      
      // Set canvas CSS size (logical dimensions)
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      // Scale the context for all drawing operations
      context.scale(dpr, dpr);
      
      // Set default drawing styles (these are in logical units after scale)
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.textBaseline = 'alphabetic'; // Consistent baseline for text measurement
      contextRef.current = context;
      redrawCanvas();
    }, [redrawCanvas]);

    useEffect(() => {
      initializeCanvas();
      const resizeTarget = containerRef.current; // Observe the container
      if (!resizeTarget) return;
      const obs = new ResizeObserver(initializeCanvas);
      obs.observe(resizeTarget);
      return () => obs.unobserve(resizeTarget);
    }, [initializeCanvas]);

    // Effect for eraser preview updates when mouse moves
    useEffect(() => {
        if (tool === 'eraser' && !isDrawing) { // Only redraw for preview if eraser is active and not drawing
            requestAnimationFrame(redrawCanvas);
        }
    }, [mouseCanvasPosition, isMouseOnCanvas, tool, isDrawing, redrawCanvas]);

    const getTextElementAtPointInternal = useCallback((point: Point): TextElementData | null => {
        // This needs to check against the latest state of text elements
        const ctx = contextRef.current;
        if (!ctx) return null;

        // Build a map of the latest state of each text element
        const latestTextElements = new Map<string, TextElementData>();
        for (let i = 0; i <= historyIndex; i++) { // Iterate up to current history index
            const action = drawingHistory[i];
            if (action.type === 'text') {
                // Always update with the latest data for this ID
                ctx.font = `${action.data.isBold ? 'bold ' : ''}${action.data.isItalic ? 'italic ' : ''}${action.data.fontSize}px ${action.data.fontFamily}`;
                const metrics = ctx.measureText(action.data.text);
                latestTextElements.set(action.id, { ...action.data, measuredWidth: metrics.width, measuredHeight: action.data.fontSize });
            }
        }
        
        // Iterate in reverse draw order (topmost first)
        for (const textData of Array.from(latestTextElements.values()).reverse()) {
            let x1 = textData.x;
            // Adjust hit box based on text alignment
            if (textData.textAlign === 'left') x1 = textData.x;
            else if (textData.textAlign === 'center') x1 = textData.x - textData.measuredWidth / 2;
            else x1 = textData.x - textData.measuredWidth; // 'right'
            
            const y1 = textData.y - textData.measuredHeight; // Text is drawn with y as baseline
            const x2 = x1 + textData.measuredWidth;
            const y2 = textData.y; // Hitbox extends up to the baseline

            if (point.x >= x1 && point.x <= x2 && point.y >= y1 && point.y <= y2) {
                return textData;
            }
        }
        return null;
    }, [drawingHistory, historyIndex]);


    const startDrawingInternal = useCallback((event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      if (tool === 'image') return; // Image placement is handled by parent click on "Place Image" button
      if (event.nativeEvent instanceof TouchEvent) event.preventDefault(); // Prevent scrolling on touch
      
      const nativeEvent = event.nativeEvent; // Get the native browser event
      const coords = getCoordinates(nativeEvent); // Use the native event
      if (!coords || !contextRef.current) return;

      if (tool === 'text') {
        const clickedText = getTextElementAtPointInternal(coords);
        if (clickedText) {
            setDraggingTextId(clickedText.id);
            // Calculate offset from text element's logical origin (data.x, data.y)
            const offsetX = coords.x - clickedText.x;
            const offsetY = coords.y - clickedText.y;
            setDragStartOffset({ x: offsetX, y: offsetY });
            setCurrentDragPosition({x: clickedText.x, y: clickedText.y}); // Initialize drag position
             if(onTextSelect) onTextSelect(clickedText.id); // Notify parent
        } else {
             setDraggingTextId(null); // Clicked on empty space
        }
        return; // Text tool handles its own interaction logic (dragging or placing new text via parent)
      }

      setIsDrawing(true);
      setStartPoint(coords);
      currentPathRef.current = [coords]; // Initialize path for freehand/eraser

      if (tool === 'eraser') {
          const eraserSize = strokeWidth; // strokeWidth is used for eraser size (logical units)
          contextRef.current.clearRect(coords.x - eraserSize / 2, coords.y - eraserSize / 2, eraserSize, eraserSize);
      } else if (tool !== 'freehand') { // For shapes (line, rectangle, circle, triangle)
        const dpr = window.devicePixelRatio || 1;
        // Snapshot the canvas using logical dimensions for getImageData
        setCanvasSnapshotForPreview(contextRef.current.getImageData(0, 0, contextRef.current.canvas.width / dpr, contextRef.current.canvas.height / dpr));
      }
    }, [getCoordinates, tool, getTextElementAtPointInternal, onTextSelect, strokeWidth]);

    const drawInternal = useCallback((event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      if (tool === 'image') return; // No drawing interaction for image tool on canvas directly
      
      const ctx = contextRef.current;
      if (!ctx || (!startPoint && !draggingTextId)) return; // No start point and not dragging text
      if (event.nativeEvent instanceof TouchEvent) event.preventDefault();
      
      const currentCoords = getCoordinates(event.nativeEvent); // Use native event
      if (!currentCoords) return;

      if (draggingTextId && dragStartOffset) { // Dragging an existing text element
        const newX = currentCoords.x - dragStartOffset.x;
        const newY = currentCoords.y - dragStartOffset.y;
        setCurrentDragPosition({x: newX, y: newY});
        requestAnimationFrame(redrawCanvas); // Redraw to show text moving
        return;
      }
      
      if (!isDrawing || tool === 'text' || !startPoint) return; // Not drawing, or text tool (handled by drag), or no startPoint

      if (tool === 'eraser') {
          currentPathRef.current.push(currentCoords);
          const eraserSize = strokeWidth; // strokeWidth is logical size
          ctx.clearRect(currentCoords.x - eraserSize / 2, currentCoords.y - eraserSize / 2, eraserSize, eraserSize);
          return; // Eraser draws directly, no preview needed from snapshot
      }
      
      // For freehand and shape previews
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth; // Logical units
      ctx.fillStyle = fillColor;
      ctx.globalCompositeOperation = 'source-over'; // Ensure drawing on top

      if (tool === 'freehand') {
        currentPathRef.current.push(currentCoords);
        ctx.beginPath();
        // Move to the previous point in the current path
        if (currentPathRef.current.length > 1) {
             ctx.moveTo(currentPathRef.current[currentPathRef.current.length-2].x, currentPathRef.current[currentPathRef.current.length-2].y);
        } else { // Or to the start point if it's the first segment
            ctx.moveTo(startPoint.x, startPoint.y);
        }
        ctx.lineTo(currentCoords.x, currentCoords.y);
        ctx.stroke();
      } else { // Shape previews (line, rectangle, circle, triangle)
        if (canvasSnapshotForPreview) ctx.putImageData(canvasSnapshotForPreview, 0, 0); // Restore snapshot
        else redrawCanvas(); // Fallback if snapshot is missing (should not happen often)
        
        // Draw the current shape preview
        const tempAction: ShapeAction = { type: tool as Exclude<DrawingTool, 'text' | 'eraser' | 'image' | 'freehand'>, strokeColor, strokeWidth, fillColor, isFilled: isFillEnabled, startPoint, endPoint: currentCoords };
        drawShapeAction(ctx, tempAction);
      }
    }, [isDrawing, startPoint, getCoordinates, tool, strokeColor, strokeWidth, fillColor, isFillEnabled, canvasSnapshotForPreview, redrawCanvas, draggingTextId, dragStartOffset]);
    

    const handleMouseUpTouchEnd = useCallback((event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        if (tool === 'image') return; // No direct canvas interaction for image tool finalization

        if (draggingTextId && currentDragPosition && onTextDragEnd) {
            // Find the original text element to pass its full data, then update x,y
            let originalTextElement: TextElementData | null = null;
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
            requestAnimationFrame(redrawCanvas); // Redraw to finalize text position
            return;
        }

        if (!isDrawing || !contextRef.current || !startPoint || tool === 'text') {
            if(isDrawing) setIsDrawing(false); // Reset isDrawing if it was true for some reason
            return;
        }

        const nativeEvent = event.nativeEvent; // Get native event for coordinates
        const finalCoords = getCoordinates(nativeEvent); // Use native event
        let newAction: DrawingAction | null = null;
        
        // Use currentPathRef.current which has been updated during drawInternal
        const pathForAction = [...currentPathRef.current]; 
        // For shapes, ensure endPoint is finalCoords or last point in path if finalCoords is null (e.g. touch end off canvas)
        const effectiveEndPoint = finalCoords || (pathForAction.length > 0 ? pathForAction[pathForAction.length -1] : startPoint);


        if (tool === 'freehand') {
            if (pathForAction.length > 0) { // Path includes startPoint
                 newAction = { type: 'freehand', points: pathForAction, strokeColor, strokeWidth };
            }
        } else if (tool === 'eraser') {
            if (pathForAction.length > 0) { // Path includes startPoint
                newAction = { type: 'eraser', points: pathForAction, size: strokeWidth };
            }
        } else if (tool !== 'image') { // Shape tools
            newAction = { type: tool as Exclude<DrawingTool, 'text' | 'eraser' | 'freehand' | 'image'>, startPoint, endPoint: effectiveEndPoint, strokeColor, strokeWidth, fillColor: (tool !== 'line') ? fillColor : undefined, isFilled: (tool !== 'line') ? isFillEnabled : undefined };
        }


        if (newAction) {
            const newHistory = drawingHistory.slice(0, historyIndex + 1);
            setDrawingHistory([...newHistory, newAction]);
            setHistoryIndex(newHistory.length);
        }
        
        setIsDrawing(false); setStartPoint(null); currentPathRef.current = []; setCanvasSnapshotForPreview(null);
        if (newAction) requestAnimationFrame(redrawCanvas); // Redraw to commit the final action
    }, [isDrawing, startPoint, tool, strokeColor, strokeWidth, fillColor, isFillEnabled, drawingHistory, historyIndex, redrawCanvas, getCoordinates, draggingTextId, currentDragPosition, onTextDragEnd]);

    useImperativeHandle(ref, () => ({
      clearCanvas: () => {
        if (contextRef.current && canvasRef.current) {
          const dpr = window.devicePixelRatio || 1;
          contextRef.current.clearRect(0, 0, canvasRef.current.width / dpr, canvasRef.current.height / dpr);
          setDrawingHistory([]);
          setHistoryIndex(-1);
          imageElementsCache.current.clear();
        }
      },
      downloadDrawing: (filename: string) => {
        if (canvasRef.current && contextRef.current) {
            const canvas = canvasRef.current;
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = canvas.width; // Use physical dimensions for temp canvas
            tempCanvas.height = canvas.height;
            const tempCtx = tempCanvas.getContext('2d');
            if (tempCtx) {
                // Fill with white background before drawing the actual content
                tempCtx.fillStyle = '#FFFFFF'; // White background
                tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
                // Draw the current canvas content on top of the white background
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
        const ctx = contextRef.current; let finalData = data;
        if(ctx){ // Calculate measuredWidth/Height before adding to history
            ctx.font = `${data.isBold ? 'bold ' : ''}${data.isItalic ? 'italic ' : ''}${data.fontSize}px ${data.fontFamily}`;
            const metrics = ctx.measureText(data.text);
            finalData = { ...data, measuredWidth: metrics.width, measuredHeight: data.fontSize };
        }
        setDrawingHistory([...newHistory, { type: 'text', id: finalData.id, data: finalData }]);
        setHistoryIndex(newHistory.length);
        requestAnimationFrame(redrawCanvas);
      },
      updateTextElement: (id: string, newData: TextElementData) => {
        const newHistory = drawingHistory.slice(0, historyIndex + 1);
         const ctx = contextRef.current; let finalData = newData;
        if(ctx){ // Recalculate measuredWidth/Height
            ctx.font = `${newData.isBold ? 'bold ' : ''}${newData.isItalic ? 'italic ' : ''}${newData.fontSize}px ${newData.fontFamily}`;
            const metrics = ctx.measureText(newData.text);
            finalData = { ...newData, measuredWidth: metrics.width, measuredHeight: newData.fontSize };
        }
        // This effectively creates a new state for the text element in history
        setDrawingHistory([...newHistory, { type: 'text', id: id, data: finalData }]);
        setHistoryIndex(newHistory.length);
        requestAnimationFrame(redrawCanvas);
      },
      getTextElementIdAtPoint: async (point: Point): Promise<string | null> => getTextElementAtPointInternal(point)?.id || null,
      getTextElementById: async (id: string): Promise<TextElementData | null> => {
        // Find the latest action for this text ID in history
        for (let i = historyIndex; i >= 0; i--) {
            const action = drawingHistory[i];
            if (action.type === 'text' && action.id === id) {
                const ctx = contextRef.current;
                if(ctx) { // Ensure measuredWidth/Height are up-to-date
                    ctx.font = `${action.data.isBold ? 'bold ' : ''}${action.data.isItalic ? 'italic ' : ''}${action.data.fontSize}px ${action.data.fontFamily}`;
                    const metrics = ctx.measureText(action.data.text);
                    return { ...action.data, measuredWidth: metrics.width, measuredHeight: action.data.fontSize };
                }
                return action.data; // Fallback if context not ready
            }
        }
        return null;
      },
      addImageElement: (data: ImageActionData) => {
        const newHistory = drawingHistory.slice(0, historyIndex + 1);
        const newAction: ImageDrawingAction = { type: 'image', id: data.id, data };
        setDrawingHistory([...newHistory, newAction]);
        setHistoryIndex(newHistory.length);
        
        // Preload image into cache if not already there, then redraw
        if (!imageElementsCache.current.has(data.src)) {
            const img = new Image();
            img.dataset.loading = 'true';
            imageElementsCache.current.set(data.src, img);
            img.src = data.src;
            img.onload = () => {
                delete img.dataset.loading;
                requestAnimationFrame(redrawCanvas); // Image loaded, trigger redraw
            };
            img.onerror = () => {
                console.error("Error preloading image:", data.src);
                imageElementsCache.current.delete(data.src);
                delete img.dataset.loading;
            };
        } else {
             requestAnimationFrame(redrawCanvas); // Already cached or loading, just redraw
        }
      },
    }));

    // Event handlers for container div (for mouse enter/leave for eraser preview)
    const handleContainerMouseMove = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
        // We need coordinates relative to the canvas, not the container, for eraser preview
        const canvas = canvasRef.current;
        if (!canvas) { setMouseCanvasPosition(null); return; }
        const rect = canvas.getBoundingClientRect();
        const clientX = event.clientX;
        const clientY = event.clientY;

        // Check if mouse is within the canvas bounds for preview
        if (clientX >= rect.left && clientX <= rect.right &&
            clientY >= rect.top && clientY <= rect.bottom) {
            setMouseCanvasPosition({ x: clientX - rect.left, y: clientY - rect.top });
        } else {
            setMouseCanvasPosition(null); // Mouse is outside canvas
        }
    }, []);

    const handleContainerMouseEnter = useCallback(() => {
        setIsMouseOnCanvas(true); // Mouse is over the container (which wraps canvas)
    }, []);
    
    const handleContainerMouseLeave = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
        setIsMouseOnCanvas(false);
        setMouseCanvasPosition(null); // Clear position when mouse leaves container
        // No redraw needed here for eraser preview, redrawCanvas handles it based on isMouseOnCanvas
        
        // If drawing a shape and mouse leaves canvas, finalize the shape
        if (isDrawing && startPoint && tool !== 'text' && tool !== 'eraser' && tool !== 'freehand' && tool !== 'image') {
             if (canvasRef.current && event.target === canvasRef.current) { // Ensure event is from canvas itself
                 // This cast is okay because handleMouseUpTouchEnd expects this event type
                 handleMouseUpTouchEnd(event as unknown as React.MouseEvent<HTMLCanvasElement>);
             }
        }
    }, [isDrawing, startPoint, tool, handleMouseUpTouchEnd]);


    return (
      <div
        ref={containerRef}
        className="w-full h-full touch-none" // touch-none for better touch drawing experience
        onMouseMove={handleContainerMouseMove} // For eraser preview tracking
        onMouseEnter={handleContainerMouseEnter} // For eraser preview tracking
        onMouseLeave={handleContainerMouseLeave} // For eraser preview tracking & finalizing shapes
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

